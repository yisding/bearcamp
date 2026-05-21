// Trips repository — WS-2.5.
//
// Surface: create, getById, rename, updateSettings, delete, byOwnerToken.
//
// `create` freezes a JSON `campsiteSnapshot` at trip-creation time so later
// catalog mutations do not change the trip header (T2.14 / DR-33). The
// multi-write (trip + items + owner participant) is committed atomically
// via **array-form** prisma.$transaction([...]) — the Neon HTTP driver
// does not support interactive callbacks (DR-10 / T2.10). On any failure,
// nothing is written.

import type { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import type {
  CreateTripInput,
  CreateTripResult,
  TripsRepo,
} from './storage'
import type {
  Campsite,
  ItemCategory,
  ItemScope,
  Participant,
  Trip,
  TripStyle,
} from './types'
import {
  TENT_CAPACITY_MAX,
  TENT_CAPACITY_MIN,
} from '../limits'
import { TENT_CAPACITY } from '../packing/quantities'
import { toDbCategory, fromDbCategory } from './enums'

type CampsiteSnapshot = Pick<Campsite, 'name' | 'amenities' | 'state' | 'agency'>

type TripRow = {
  id: string
  name: string
  campsiteId: string
  campsiteSnapshot: unknown
  style: TripStyle
  ownerToken: string
  tentCapacity: number
  createdAt: Date
}

function fromRow(row: TripRow): Trip {
  return {
    id: row.id,
    name: row.name,
    campsiteId: row.campsiteId,
    campsite: row.campsiteSnapshot as CampsiteSnapshot,
    style: row.style,
    tentCapacity: row.tentCapacity,
    createdAt: row.createdAt.getTime(),
  }
}

function clampTentCapacity(n: number | undefined): number {
  if (n === undefined) return TENT_CAPACITY
  if (!Number.isInteger(n)) {
    throw new Error(`tentCapacity must be an integer, got ${n}`)
  }
  if (n < TENT_CAPACITY_MIN || n > TENT_CAPACITY_MAX) {
    throw new Error(
      `tentCapacity out of bounds [${TENT_CAPACITY_MIN}, ${TENT_CAPACITY_MAX}]`,
    )
  }
  return n
}

export function createTripsRepo(prisma: PrismaClient): TripsRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prisma as any

  return {
    create: async (input: CreateTripInput): Promise<CreateTripResult> => {
      const tripId = randomUUID()
      const tentCapacity = clampTentCapacity(input.tentCapacity)

      const snapshot: CampsiteSnapshot = {
        name: input.campsite.name,
        amenities: input.campsite.amenities,
        ...(input.campsite.state !== undefined
          ? { state: input.campsite.state }
          : {}),
        ...(input.campsite.agency !== undefined
          ? { agency: input.campsite.agency }
          : {}),
      }

      const itemRows = input.items.map((seed, idx) => ({
        // Stable cuid (Prisma default(cuid)) — but we let the DB generate.
        tripId,
        category: toDbCategory(seed.category as ItemCategory),
        name: seed.name,
        scope: seed.scope as ItemScope,
        baseQty: seed.baseQty ?? 1,
        unit: seed.unit ?? null,
        note: seed.note ?? null,
        source: seed.source,
        sortOrder: seed.sortOrder ?? idx,
        removed: false,
      }))

      // ARRAY-FORM $transaction — DR-10 / T2.10. createTrip is one atomic
      // multi-write: trip, items, owner participant. A failure on any step
      // rolls all of them back.
      const ops = [
        p.trip.create({
          data: {
            id: tripId,
            name: input.name,
            campsiteId: input.campsiteId,
            campsiteSnapshot: snapshot as unknown as Record<string, unknown>,
            style: input.style,
            ownerToken: input.ownerToken,
            tentCapacity,
          },
        }),
        ...(itemRows.length > 0
          ? [p.tripItem.createMany({ data: itemRows })]
          : []),
        p.participant.create({
          data: {
            tripId,
            name: input.ownerName,
            token: input.ownerParticipantToken,
            isOwner: true,
          },
        }),
      ]
      const results = await p.$transaction(ops)
      const tripRowRaw = results[0] as TripRow
      const ownerRowRaw = results[results.length - 1] as {
        id: string
        tripId: string
        name: string
        isOwner: boolean
        joinedAt: Date
      }

      const trip = fromRow(tripRowRaw)
      const owner: Participant = {
        id: ownerRowRaw.id,
        tripId: ownerRowRaw.tripId,
        name: ownerRowRaw.name,
        isOwner: ownerRowRaw.isOwner,
        joinedAt: ownerRowRaw.joinedAt.getTime(),
      }
      return { trip, owner }
    },

    getById: async (id: string): Promise<Trip | null> => {
      const row = await p.trip.findUnique({ where: { id } })
      return row ? fromRow(row as TripRow) : null
    },

    rename: async (id: string, name: string): Promise<Trip> => {
      const row = await p.trip.update({ where: { id }, data: { name } })
      return fromRow(row as TripRow)
    },

    updateSettings: async (
      id: string,
      patch: { tentCapacity?: number },
    ): Promise<Trip> => {
      const data: { tentCapacity?: number } = {}
      if (patch.tentCapacity !== undefined) {
        data.tentCapacity = clampTentCapacity(patch.tentCapacity)
      }
      const row = await p.trip.update({ where: { id }, data })
      return fromRow(row as TripRow)
    },

    delete: async (id: string): Promise<void> => {
      // Cascade is handled by Prisma's onDelete: Cascade relations
      // (TripItem, Participant, Claim) — DR-20 / T2.9.
      await p.trip.delete({ where: { id } }).catch((err: unknown) => {
        // Idempotent: deleting an absent trip should be a no-op, matching the
        // in-memory fake's semantics.
        const code = (err as { code?: string }).code
        if (code === 'P2025') return
        throw err
      })
    },

    byOwnerToken: async (id: string, token: string): Promise<Trip | null> => {
      const row = await p.trip.findUnique({ where: { id } })
      if (!row) return null
      if ((row as TripRow).ownerToken !== token) return null
      return fromRow(row as TripRow)
    },
  }
}

// Re-export the enum mapper for internal use across repos.
export { toDbCategory, fromDbCategory }
