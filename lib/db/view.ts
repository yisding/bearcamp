// Trip view builder — WS-2.9.
//
// `buildTripView(tripId)` fetches the trip + participants + items + claims
// in ONE nested Prisma read (a single Neon round-trip — G-roundtrip), then
// computes `needed` / `claimed` / `shortfall` per item using the same
// `requiredQty` math as the in-memory fake. Returns `null` for unknown
// `tripId` so the trip page can `notFound()` (G8).
//
// Render contract (DR-19 / G-soft):
//   - `items` = visible (removed=false) items with claim math.
//   - `removedItemsWithClaims` = soft-removed items that still have at
//     least one claim, so participants see why a claim disappeared.
// Header amenities are always read from `campsiteSnapshot` — never the
// live Campsite row (DR-33 / T2.14).

import type { PrismaClient } from '@prisma/client'
import type { ViewRepo } from './storage'
import type {
  Campsite,
  Participant,
  RemovedItemWithClaims,
  Trip,
  TripItem,
  TripView,
  TripViewItem,
} from './types'
import { requiredQty } from '../packing/quantities'
import { fromDbCategory, type DbItemCategory } from './enums'

type CampsiteSnapshot = Pick<Campsite, 'name' | 'amenities' | 'state' | 'agency'>

type ParticipantNested = {
  id: string
  tripId: string
  name: string
  isOwner: boolean
  joinedAt: Date
}

type ClaimNested = {
  itemId: string
  participantId: string
  qty: number
}

type ItemNested = {
  id: string
  tripId: string
  category: DbItemCategory
  name: string
  scope: 'per_person' | 'shared' | 'per_tent'
  baseQty: number
  unit: string | null
  note: string | null
  source: 'template' | 'amenity' | 'custom'
  sortOrder: number
  removed: boolean
  claims: ClaimNested[]
}

type TripNested = {
  id: string
  name: string
  campsiteId: string
  campsiteSnapshot: unknown
  style: 'car' | 'backpacking'
  tentCapacity: number
  createdAt: Date
  items: ItemNested[]
  participants: ParticipantNested[]
}

function tripFromRow(row: TripNested): Trip {
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

function itemFromRow(row: ItemNested): TripItem {
  const out: TripItem = {
    id: row.id,
    tripId: row.tripId,
    category: fromDbCategory(row.category),
    name: row.name,
    scope: row.scope,
    baseQty: row.baseQty,
    source: row.source,
    sortOrder: row.sortOrder,
    removed: row.removed,
  }
  if (row.unit !== null) out.unit = row.unit
  if (row.note !== null) out.note = row.note
  return out
}

function participantFromRow(row: ParticipantNested): Participant {
  return {
    id: row.id,
    tripId: row.tripId,
    name: row.name,
    isOwner: row.isOwner,
    joinedAt: row.joinedAt.getTime(),
  }
}

export function createViewRepo(prisma: PrismaClient): ViewRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prisma as any

  return {
    buildTripView: async (tripId: string): Promise<TripView | null> => {
      // Single Prisma nested read — one Neon round-trip (review-2 G-roundtrip).
      const row: TripNested | null = await p.trip.findUnique({
        where: { id: tripId },
        include: {
          participants: { orderBy: { joinedAt: 'asc' } },
          items: {
            orderBy: { sortOrder: 'asc' },
            include: { claims: true },
          },
        },
      })
      if (!row) return null

      const trip = tripFromRow(row)
      const participants = row.participants.map(participantFromRow)
      const pById = new Map(participants.map((p) => [p.id, p] as const))

      const visibleItems: TripViewItem[] = []
      const removedItemsWithClaims: RemovedItemWithClaims[] = []
      const n = participants.length

      for (const it of row.items) {
        const item = itemFromRow(it)
        const claims = it.claims
          .map((c) => {
            const participant = pById.get(c.participantId)
            if (!participant) return null
            return { participant, qty: c.qty }
          })
          .filter((x): x is { participant: Participant; qty: number } => x !== null)

        if (item.removed) {
          if (claims.length > 0) {
            removedItemsWithClaims.push({ ...item, claims })
          }
          continue
        }

        const needed = requiredQty(item, n, trip.tentCapacity)
        const claimed = claims.reduce((sum, c) => sum + c.qty, 0)
        const shortfall = Math.max(0, needed - claimed)
        visibleItems.push({ ...item, needed, claimed, shortfall, claims })
      }

      return {
        trip,
        participants,
        items: visibleItems,
        removedItemsWithClaims,
      }
    },
  }
}

