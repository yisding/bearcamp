// Items repository — WS-2.6.
//
// Surface: listByTrip, add, update(patch), softRemove, restore, reorder.
//
// - `listByTrip` excludes soft-removed items by default. `buildTripView`
//   surfaces removed items with live claims separately (DR-19 / G-soft).
// - `update`'s patch is restricted at runtime to
//   name|category|scope|baseQty|unit|note (review G1). Any other key on the
//   incoming object is silently dropped — the repo MUST NOT forward
//   unknown columns to the DB (T2.4).
// - `softRemove` / `restore` flip `removed`; claim rows are preserved at
//   the DB level (cascade is only on Trip → TripItem).

import type { PrismaClient } from '@prisma/client'
import type {
  AddItemInput,
  ItemsRepo,
  ReorderArgs,
  TripItemPatch,
} from './storage'
import type { ItemCategory, ItemScope, TripItem } from './types'
import { fromDbCategory, toDbCategory, type DbItemCategory } from './enums'

type ItemRow = {
  id: string
  tripId: string
  category: DbItemCategory
  name: string
  scope: ItemScope
  baseQty: number
  unit: string | null
  note: string | null
  source: 'template' | 'amenity' | 'custom'
  sortOrder: number
  removed: boolean
}

function fromRow(row: ItemRow): TripItem {
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

// Whitelist for runtime patch sanitization — DR-3 / T2.4.
const EDITABLE_KEYS = [
  'name',
  'category',
  'scope',
  'baseQty',
  'unit',
  'note',
] as const

function sanitizePatch(
  patch: TripItemPatch,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const p = patch as Record<string, unknown>
  for (const k of EDITABLE_KEYS) {
    if (p[k] !== undefined) {
      if (k === 'category') {
        out[k] = toDbCategory(p[k] as ItemCategory)
      } else {
        out[k] = p[k]
      }
    }
  }
  return out
}

export function createItemsRepo(prisma: PrismaClient): ItemsRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prisma as any

  return {
    listByTrip: async (tripId: string): Promise<TripItem[]> => {
      const rows = await p.tripItem.findMany({
        where: { tripId, removed: false },
        orderBy: { sortOrder: 'asc' },
      })
      return (rows as ItemRow[]).map(fromRow)
    },

    add: async (input: AddItemInput): Promise<TripItem> => {
      // sortOrder defaults to (current max + 1) for the trip when omitted.
      let sortOrder = input.sortOrder
      if (sortOrder === undefined) {
        const agg = await p.tripItem.aggregate({
          where: { tripId: input.tripId },
          _max: { sortOrder: true },
        })
        const max = (agg._max?.sortOrder as number | null) ?? -1
        sortOrder = max + 1
      }
      const row = await p.tripItem.create({
        data: {
          tripId: input.tripId,
          category: toDbCategory(input.category),
          name: input.name,
          scope: input.scope,
          baseQty: input.baseQty ?? 1,
          unit: input.unit ?? null,
          note: input.note ?? null,
          source: input.source,
          sortOrder,
          removed: false,
        },
      })
      return fromRow(row as ItemRow)
    },

    update: async (
      id: string,
      patch: TripItemPatch,
    ): Promise<TripItem> => {
      const data = sanitizePatch(patch)
      const row = await p.tripItem.update({ where: { id }, data })
      return fromRow(row as ItemRow)
    },

    softRemove: async (id: string): Promise<TripItem> => {
      const row = await p.tripItem.update({
        where: { id },
        data: { removed: true },
      })
      return fromRow(row as ItemRow)
    },

    restore: async (id: string): Promise<TripItem> => {
      const row = await p.tripItem.update({
        where: { id },
        data: { removed: false },
      })
      return fromRow(row as ItemRow)
    },

    reorder: async (
      tripId: string,
      itemId: string,
      args: ReorderArgs,
    ): Promise<void> => {
      // Load all siblings (including soft-removed for stability), compute
      // the new ordering, then write back any changed sortOrder values in
      // one array-form transaction (DR-10).
      const items = (await p.tripItem.findMany({
        where: { tripId },
        orderBy: { sortOrder: 'asc' },
      })) as ItemRow[]

      const target = items.find((i) => i.id === itemId)
      if (!target) {
        throw new Error(`item not found for reorder: ${itemId}`)
      }
      const siblings = items.filter((i) => i.id !== itemId)

      let insertAt: number
      if (args.beforeItemId !== undefined) {
        const idx = siblings.findIndex((s) => s.id === args.beforeItemId)
        insertAt = idx === -1 ? siblings.length : idx
      } else if (args.newIndex !== undefined) {
        insertAt = Math.max(0, Math.min(args.newIndex, siblings.length))
      } else {
        insertAt = siblings.length
      }

      const ordered = [
        ...siblings.slice(0, insertAt),
        target,
        ...siblings.slice(insertAt),
      ]

      const ops = ordered
        .map((it, idx) => ({ id: it.id, sortOrder: idx, oldOrder: it.sortOrder }))
        .filter((row) => row.sortOrder !== row.oldOrder)
        .map((row) =>
          p.tripItem.update({
            where: { id: row.id },
            data: { sortOrder: row.sortOrder },
          }),
        )

      if (ops.length > 0) await p.$transaction(ops)
    },
  }
}
