// WS-3.2 — seed source + WS-2 consumer (`loadSeed`).
//
//   loadSeed         : reads + validates data/campsites.seed.json → Campsite[]
//   createSeedSource : CampsiteSource (all/getById/search) over the seed
//
// `loadSeed` is the I-7 producer that WS-2's `prisma db seed` calls. It is
// idempotent and deterministic (same array order across calls). Any row
// that fails CampsiteSchema throws with a clear message — better to fail
// fast at startup than ship a bad dataset.

import type { Campsite } from '../db/types'
import type { CampsiteSource } from './source'
import type { SearchArgs, SearchResult } from '../db/storage'
import { CampsiteSchema } from '../validation/domain'
import {
  SEARCH_PAGE_SIZE_DEFAULT,
  SEARCH_PAGE_SIZE_MAX,
} from '../limits'
import rawSeed from '../../data/campsites.seed.json' with { type: 'json' }

// Cache the validated array — JSON.parse + zod over ~180 rows is fast, but
// memoizing avoids re-validation on every call.
let cached: Campsite[] | null = null

export function loadSeed(): Campsite[] {
  if (cached) return cached
  if (!Array.isArray(rawSeed)) {
    throw new Error('campsites.seed.json: top-level must be an array')
  }
  const validated: Campsite[] = []
  for (let i = 0; i < rawSeed.length; i++) {
    const parsed = CampsiteSchema.safeParse(rawSeed[i])
    if (!parsed.success) {
      const id =
        rawSeed[i] && typeof rawSeed[i] === 'object' && 'id' in rawSeed[i]
          ? String((rawSeed[i] as { id: unknown }).id)
          : `<row ${i}>`
      throw new Error(
        `campsites.seed.json: row ${id} failed validation: ${parsed.error.message}`,
      )
    }
    validated.push(parsed.data as Campsite)
  }
  cached = validated
  return cached
}

// In-memory search over the validated seed — same shape as fixtures.ts.
function seedSearch(rows: Campsite[], args: SearchArgs): SearchResult {
  const page = Math.max(1, args.page ?? 1)
  const pageSize = Math.min(
    Math.max(1, args.pageSize ?? SEARCH_PAGE_SIZE_DEFAULT),
    SEARCH_PAGE_SIZE_MAX,
  )
  const q = args.q?.trim().toLowerCase()
  let filtered = rows.slice()
  if (q) {
    filtered = filtered.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description?.toLowerCase().includes(q) ?? false),
    )
  }
  if (args.state) {
    filtered = filtered.filter((c) => c.state === args.state)
  }
  if (args.agency) {
    filtered = filtered.filter((c) => c.agency === args.agency)
  }
  if (args.amenities && args.amenities.length > 0) {
    filtered = filtered.filter((c) =>
      args.amenities!.every((k) => Boolean(c.amenities[k])),
    )
  }
  const total = filtered.length
  const start = (page - 1) * pageSize
  return {
    campsites: filtered.slice(start, start + pageSize),
    total,
    page,
    pageSize,
  }
}

export function createSeedSource(): CampsiteSource {
  const rows = loadSeed()
  return {
    all: async () => rows,
    getById: async (id: string) => rows.find((c) => c.id === id) ?? null,
    search: async (args: SearchArgs) => seedSearch(rows, args),
  }
}
