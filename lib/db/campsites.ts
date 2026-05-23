// Campsites repository — WS-2.4.
//
// Repo surface: upsertMany, getById, search(args). Maps Prisma rows to the
// `Campsite` DTO so @prisma/client never leaks past lib/db/*.
//
// Search: name/description filtered via `Prisma.contains` + `mode:'insensitive'`
// (ILIKE %q% → hits the pg_trgm GIN index, T2.2b). State and agency are
// equality filters. Amenities filters are JSON-path predicates on the
// `amenities` JSON column (each requested key must equal `true`).
//
// IMPORTANT: only the *boolean* amenity keys are filterable. `SearchArgs`
// types `amenities` as `(keyof Amenities)[]`, but `Amenities` also has
// non-boolean keys (`toilets`, `cellService`, `accessLevel`,
// `potableWaterNote`). A `{ equals: true }` predicate on those would never
// match, so non-boolean keys are filtered out below rather than silently
// matching nothing. See `BOOLEAN_AMENITY_KEYS`.
//
// pageSize is server-side capped at `SEARCH_PAGE_SIZE_MAX` (lib/limits.ts)
// regardless of caller input — DR-23 / T2.2.

import type { PrismaClient } from '@prisma/client'
import type {
  CampsitesRepo,
  SearchArgs,
  SearchResult,
} from './storage'
import type { Amenities, Campsite } from './types'
import {
  SEARCH_PAGE_SIZE_DEFAULT,
  SEARCH_PAGE_SIZE_MAX,
} from '../limits'

// Narrow row shape from Prisma — keeps the rest of this file from
// importing Prisma-generated types directly.
type CampsiteRow = {
  id: string
  name: string
  agency: string | null
  state: string | null
  lat: number | null
  lng: number | null
  description: string | null
  amenities: unknown
  activities: string[]
  source: string
  updatedAt: Date
}

function fromRow(row: CampsiteRow): Campsite {
  // amenities is a Prisma JsonValue; the DTO expects `Amenities`. We trust
  // the writer to have validated it — see lib/validation/domain.ts (WS-0).
  const out: Campsite = {
    id: row.id,
    name: row.name,
    amenities: row.amenities as Amenities,
    activities: row.activities,
    source: row.source,
  }
  if (row.agency !== null) out.agency = row.agency
  if (row.state !== null) out.state = row.state
  if (row.lat !== null) out.lat = row.lat
  if (row.lng !== null) out.lng = row.lng
  if (row.description !== null) out.description = row.description
  return out
}

function toRow(c: Campsite): {
  id: string
  name: string
  agency: string | null
  state: string | null
  lat: number | null
  lng: number | null
  description: string | null
  amenities: unknown
  activities: string[]
  source: string
} {
  return {
    id: c.id,
    name: c.name,
    agency: c.agency ?? null,
    state: c.state ?? null,
    lat: c.lat ?? null,
    lng: c.lng ?? null,
    description: c.description ?? null,
    // Prisma accepts `unknown` for JSON fields.
    amenities: c.amenities,
    activities: c.activities,
    source: c.source,
  }
}

// The subset of `Amenities` keys whose values are `boolean`. The amenities
// search filter applies `{ equals: true }`, which is only meaningful for
// these — non-boolean keys (`toilets`, `cellService`, `accessLevel`,
// `potableWaterNote`) are not supported as filters and are ignored.
const BOOLEAN_AMENITY_KEYS: ReadonlySet<keyof Amenities> = new Set([
  'potableWater',
  'showers',
  'electricity',
  'fireRings',
  'firewoodAvailable',
  'picnicTables',
  'bearLockers',
  'bearCountry',
  'trashService',
  'dumpStation',
])

function clampPageSize(pageSize: number | undefined): number {
  const requested = pageSize ?? SEARCH_PAGE_SIZE_DEFAULT
  return Math.max(1, Math.min(requested, SEARCH_PAGE_SIZE_MAX))
}

export function createCampsitesRepo(prisma: PrismaClient): CampsitesRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = prisma as any
  return {
    upsertMany: async (rows: Campsite[]): Promise<void> => {
      // Prisma's HTTP driver supports array-form $transaction([...]) only
      // (DR-10). Batch the upserts so the call is atomic per request.
      const ops = rows.map((c) => {
        const data = toRow(c)
        return p.campsite.upsert({
          where: { id: c.id },
          create: data,
          update: data,
        })
      })
      if (ops.length === 0) return
      await p.$transaction(ops)
    },

    getById: async (id: string): Promise<Campsite | null> => {
      const row = await p.campsite.findUnique({ where: { id } })
      return row ? fromRow(row as CampsiteRow) : null
    },

    search: async (args: SearchArgs): Promise<SearchResult> => {
      const page = Math.max(1, args.page ?? 1)
      const pageSize = clampPageSize(args.pageSize)

      // Build the WHERE clause. AND across all filters; q matches name OR
      // description (both `contains` + insensitive — GIN trigram).
      const where: Record<string, unknown> = {}
      if (args.q) {
        where.OR = [
          { name: { contains: args.q, mode: 'insensitive' } },
          { description: { contains: args.q, mode: 'insensitive' } },
        ]
      }
      if (args.state) where.state = args.state
      if (args.agency) where.agency = args.agency
      if (args.amenities && args.amenities.length > 0) {
        // AND across requested amenity keys; each key must equal `true` on
        // the `amenities` JSON column. Only boolean keys are filterable —
        // see BOOLEAN_AMENITY_KEYS — so non-boolean keys are dropped here
        // instead of producing a predicate that never matches.
        const booleanKeys = args.amenities.filter((k) =>
          BOOLEAN_AMENITY_KEYS.has(k),
        )
        if (booleanKeys.length > 0) {
          where.AND = booleanKeys.map((k) => ({
            amenities: { path: [k as string], equals: true },
          }))
        }
      }

      const [total, rows] = await p.$transaction([
        p.campsite.count({ where }),
        p.campsite.findMany({
          where,
          orderBy: { name: 'asc' },
          take: pageSize,
          skip: (page - 1) * pageSize,
        }),
      ])

      return {
        campsites: (rows as CampsiteRow[]).map(fromRow),
        total: total as number,
        page,
        pageSize,
      }
    },
  }
}
