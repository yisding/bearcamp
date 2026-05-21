// Claims repository — WS-2.8.
//
// Surface: listByTrip, upsert(itemId, participantId, qty), remove.
//
// Composite primary key is `@@id([itemId, participantId])`, so `upsert`
// collapses duplicate claims from the same participant on the same item
// into a single row with the latest `qty` (T2.6). `listByTrip` walks the
// (tripId-indexed) Claim table. `tripId` on the row is denormalised so the
// list query stays single-table (DR-23 efficiency).

import type { PrismaClient } from '@prisma/client'
import type { ClaimsRepo } from './storage'
import type { Claim } from './types'

type ClaimRow = {
  tripId: string
  itemId: string
  participantId: string
  qty: number
  updatedAt: Date
}

function fromRow(row: ClaimRow): Claim {
  return {
    itemId: row.itemId,
    participantId: row.participantId,
    qty: row.qty,
  }
}

export function createClaimsRepo(prisma: PrismaClient): ClaimsRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prisma as any

  return {
    listByTrip: async (tripId: string): Promise<Claim[]> => {
      const rows = await p.claim.findMany({ where: { tripId } })
      return (rows as ClaimRow[]).map(fromRow)
    },

    upsert: async (
      itemId: string,
      participantId: string,
      qty: number,
    ): Promise<Claim> => {
      // We need the tripId for the Claim row; resolve it via the parent
      // TripItem. (Composite PK is [itemId, participantId]; tripId is just
      // a denormalised FK for fast tripId-scoped lookups.)
      const item = await p.tripItem.findUnique({
        where: { id: itemId },
        select: { tripId: true },
      })
      if (!item) throw new Error(`item not found: ${itemId}`)
      const row = await p.claim.upsert({
        where: {
          itemId_participantId: { itemId, participantId },
        },
        create: {
          tripId: (item as { tripId: string }).tripId,
          itemId,
          participantId,
          qty,
        },
        update: { qty },
      })
      return fromRow(row as ClaimRow)
    },

    remove: async (itemId: string, participantId: string): Promise<void> => {
      await p.claim
        .delete({
          where: {
            itemId_participantId: { itemId, participantId },
          },
        })
        .catch((err: unknown) => {
          // Idempotent: removing a missing claim is a no-op.
          const code = (err as { code?: string }).code
          if (code === 'P2025') return
          throw err
        })
    },
  }
}
