// T2.2 — campsites repo: upsertMany, search filters (q/state/agency/amenities),
//   getById, pageSize capped server-side at 50 (DR-23).
// T2.2b — trigram index hit: EXPLAIN on a `contains` query shows the GIN
//   index, not Seq Scan (DR-11).
//
// WS-2 owns `lib/db/campsites.ts` (the repo) and `lib/db/storage.prisma.ts`
// (the adapter wiring). Both files are missing at the time these tests are
// authored — the import will fail with a module-not-found error, which is
// the expected red state.

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { skipUnlessDocker } from './_helpers/docker'
import {
  getPostgres,
  makePrismaStorage,
  truncateAll,
  withPgClient,
} from './_helpers/postgres'
import { sampleCampsites, amenities } from './_helpers/fixtures'
import type { StorageAdapter } from '../storage'
import type { Campsite } from '../types'

describe.skipIf(skipUnlessDocker())('T2.2 campsites repo (real Postgres)', () => {
  let s: StorageAdapter

  beforeAll(async () => {
    await getPostgres()
  }, 120_000)

  beforeEach(async () => {
    await truncateAll()
    s = await makePrismaStorage()
    await s.campsites.upsertMany(sampleCampsites)
  })

  afterEach(async () => {
    await truncateAll()
  })

  it('upsertMany inserts both campsites; getById round-trips', async () => {
    const a = await s.campsites.getById('fixture:emerald-lake')
    const b = await s.campsites.getById('fixture:cinder-cone')
    expect(a?.name).toBe('Emerald Lake Campground')
    expect(b?.name).toBe('Cinder Cone Volcano Site')
    expect(a?.amenities.bearCountry).toBe(true)
  })

  it('upsertMany re-running with changed name updates the row (no duplicate)', async () => {
    const mutated: Campsite[] = [
      { ...sampleCampsites[0], name: 'Emerald Lake CG (updated)' },
    ]
    await s.campsites.upsertMany(mutated)
    const a = await s.campsites.getById('fixture:emerald-lake')
    expect(a?.name).toBe('Emerald Lake CG (updated)')
    const all = await s.campsites.search({ pageSize: 50 })
    expect(all.total).toBe(2)
  })

  it('getById returns null for unknown id', async () => {
    expect(await s.campsites.getById('does-not-exist')).toBeNull()
  })

  it('search by q matches name (case-insensitive)', async () => {
    const r = await s.campsites.search({ q: 'emerald' })
    expect(r.campsites.some((c) => c.name === 'Emerald Lake Campground')).toBe(true)
    expect(r.campsites.some((c) => c.name === 'Cinder Cone Volcano Site')).toBe(false)
  })

  it('search by q matches description (case-insensitive)', async () => {
    const r = await s.campsites.search({ q: 'PAINTED DUNES' })
    expect(r.campsites.some((c) => c.name === 'Cinder Cone Volcano Site')).toBe(true)
  })

  it('search by state filters', async () => {
    const r = await s.campsites.search({ state: 'CA' })
    expect(r.total).toBe(2)
    const r2 = await s.campsites.search({ state: 'OR' })
    expect(r2.total).toBe(0)
  })

  it('search by agency filters', async () => {
    const r = await s.campsites.search({ agency: 'NPS' })
    expect(r.campsites.map((c) => c.id)).toEqual(['fixture:emerald-lake'])
    const r2 = await s.campsites.search({ agency: 'USFS' })
    expect(r2.campsites.map((c) => c.id)).toEqual(['fixture:cinder-cone'])
  })

  it('search by amenities (bearLockers) filters', async () => {
    const r = await s.campsites.search({ amenities: ['bearLockers'] })
    expect(r.campsites.map((c) => c.id)).toEqual(['fixture:emerald-lake'])
  })

  it('search by amenities AND (potableWater + showers)', async () => {
    const r = await s.campsites.search({
      amenities: ['potableWater', 'showers'],
    })
    // Only emerald-lake has both.
    expect(r.campsites.map((c) => c.id)).toEqual(['fixture:emerald-lake'])
  })

  it('pageSize defaults to 20 when not provided', async () => {
    const r = await s.campsites.search({})
    expect(r.pageSize).toBe(20)
  })

  it('pageSize is server-side capped at 50 even if caller asks for 500 (DR-23)', async () => {
    // Seed a few more to make the cap observable.
    const extras: Campsite[] = []
    for (let i = 0; i < 5; i++) {
      extras.push({
        id: `fixture:extra-${i}`,
        name: `Extra ${i}`,
        state: 'CA',
        amenities: amenities(),
        activities: [],
        source: 'fixture',
      })
    }
    await s.campsites.upsertMany(extras)
    const r = await s.campsites.search({ pageSize: 500 })
    expect(r.pageSize).toBeLessThanOrEqual(50)
    expect(r.campsites.length).toBeLessThanOrEqual(50)
  })

  it('pagination: page=2 returns a different slice', async () => {
    const extras: Campsite[] = []
    for (let i = 0; i < 25; i++) {
      extras.push({
        id: `fixture:pg-${i.toString().padStart(2, '0')}`,
        name: `Pageable ${i}`,
        state: 'CA',
        amenities: amenities(),
        activities: [],
        source: 'fixture',
      })
    }
    await s.campsites.upsertMany(extras)
    const p1 = await s.campsites.search({ pageSize: 10, page: 1 })
    const p2 = await s.campsites.search({ pageSize: 10, page: 2 })
    expect(p1.campsites).toHaveLength(10)
    expect(p2.campsites).toHaveLength(10)
    const ids1 = new Set(p1.campsites.map((c) => c.id))
    for (const c of p2.campsites) {
      expect(ids1.has(c.id)).toBe(false)
    }
    expect(p1.total).toBeGreaterThanOrEqual(27)
  })
})

describe.skipIf(skipUnlessDocker())(
  'T2.2b campsites trigram index hit (EXPLAIN)',
  () => {
    beforeAll(async () => {
      await getPostgres()
    }, 120_000)

    beforeEach(async () => {
      await truncateAll()
      // Insert enough rows to make the planner *prefer* the GIN index over a
      // seq scan. Trigger ANALYZE so stats are up to date.
      const rows: Campsite[] = []
      for (let i = 0; i < 200; i++) {
        rows.push({
          id: `fixture:bulk-${i}`,
          name: `Camp ${i} pinecrest meadow ridge`,
          state: 'CA',
          description: `Description for site ${i} with searchable token alpha-${i}`,
          amenities: amenities(),
          activities: [],
          source: 'fixture',
        })
      }
      const s = await makePrismaStorage()
      await s.campsites.upsertMany(rows)
      await withPgClient(async (client) => {
        await client.query('ANALYZE "Campsite"')
      })
    })

    afterEach(async () => {
      await truncateAll()
    })

    it('EXPLAIN of an ILIKE %q% query uses the GIN index, not Seq Scan', async () => {
      await withPgClient(async (client) => {
        // At 200 rows the planner still picks Seq Scan because the table is
        // tiny and the estimated cost is lower. The load-bearing assertion
        // is that the GIN index *can* serve the ILIKE — disable seqscan so
        // the planner is forced to consider the index path. If the index is
        // missing or wrong opclass, the EXPLAIN will fall back to Seq Scan
        // anyway (or fail), which is what we're guarding against (DR-11).
        await client.query('SET enable_seqscan = off')
        const r = await client.query<{ 'QUERY PLAN': string }>(
          `EXPLAIN SELECT "id" FROM "Campsite"
            WHERE "name" ILIKE '%pinecrest%'`,
        )
        await client.query('RESET enable_seqscan')
        const plan = r.rows.map((row) => row['QUERY PLAN']).join('\n')
        // The combination of pg_trgm + gin_trgm_ops yields a Bitmap Index Scan
        // on the GIN index. The negative assertion is the load-bearing one:
        // a Seq Scan here means the migration is missing gin_trgm_ops.
        expect(plan).not.toMatch(/Seq Scan/)
        expect(plan).toMatch(/campsite_name_trgm_idx|Bitmap Index Scan/i)
      })
    })
  },
)
