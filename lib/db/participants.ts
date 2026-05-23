// Participants repository — WS-2.7.
//
// Surface: listByTrip, add(tripId, name, isOwner, token), byToken,
//          count(tripId).
//
// `add` enforces the per-trip cap (`PARTICIPANT_CAP_PER_TRIP` in
// lib/limits.ts, DR-24) and throws a typed error containing
// `participant_cap_reached` so callers can
// match on it (T2.5 asserts `.toThrow(/participant_cap_reached/)`).
//
// `byToken` looks up by the composite index [tripId, token] (DR-22 /
// DR-55). The schema's `@@index([tripId, token])` covers both lookups
// (composite) and tripId-only filters (left-prefix), so no extra index.

import type { PrismaClient } from '@prisma/client'
import type { ParticipantsRepo } from './storage'
import type { Participant } from './types'
import { PARTICIPANT_CAP_PER_TRIP } from '../limits'

type ParticipantRow = {
  id: string
  tripId: string
  name: string
  token: string
  isOwner: boolean
  joinedAt: Date
}

function fromRow(row: ParticipantRow): Participant {
  return {
    id: row.id,
    tripId: row.tripId,
    name: row.name,
    isOwner: row.isOwner,
    joinedAt: row.joinedAt.getTime(),
  }
}

/** Typed error for the per-trip participant cap (DR-24, T2.5). */
export class ParticipantCapReachedError extends Error {
  // Discriminator carried in `.name` so callers can match without
  // importing this class — `err.name === 'participant_cap_reached'`.
  override readonly name = 'participant_cap_reached'
  constructor(tripId: string) {
    super(`participant_cap_reached: trip ${tripId} is at the cap of ${PARTICIPANT_CAP_PER_TRIP}`)
  }
}

export function createParticipantsRepo(
  prisma: PrismaClient,
): ParticipantsRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prisma as any

  return {
    listByTrip: async (tripId: string): Promise<Participant[]> => {
      const rows = await p.participant.findMany({
        where: { tripId },
        orderBy: { joinedAt: 'asc' },
      })
      return (rows as ParticipantRow[]).map(fromRow)
    },

    add: async (
      tripId: string,
      name: string,
      isOwner: boolean,
      token: string,
    ): Promise<Participant> => {
      // Cap check (DR-24): reject at/above the cap. We do this with a
      // count() first; for v1 last-write-wins is acceptable. Under the
      // PARTICIPANT_CAP_PER_TRIP ceiling the race window is benign.
      const count = await p.participant.count({ where: { tripId } })
      if (count >= PARTICIPANT_CAP_PER_TRIP) {
        throw new ParticipantCapReachedError(tripId)
      }
      const row = await p.participant.create({
        data: {
          tripId,
          name,
          token,
          isOwner,
        },
      })
      return fromRow(row as ParticipantRow)
    },

    byToken: async (
      tripId: string,
      token: string,
    ): Promise<Participant | null> => {
      const row = await p.participant.findFirst({
        where: { tripId, token },
      })
      return row ? fromRow(row as ParticipantRow) : null
    },

    count: async (tripId: string): Promise<number> => {
      const n = await p.participant.count({ where: { tripId } })
      return n as number
    },
  }
}
