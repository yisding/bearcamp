// T3.3 — `lib/campsites/seed.ts` CampsiteSource impl + `loadSeed()`
// helper (I-7).
//
// Red phase: `lib/campsites/seed.ts` does not yet exist; import resolves to
// module-not-found.
//
// Covers acceptance criterion T3.3:
//   - `createSeedSource()` returns a `CampsiteSource` whose `all`,
//     `getById`, and `search` work against the validated seed JSON.
//   - `loadSeed()` (the WS-2 consumer) returns typed, schema-valid rows.
//   - DB-seed idempotency is tested separately in WS-2.11/T2 (`prisma db
//     seed`) — not here.

import { describe, it, expect, beforeAll } from 'vitest'
import { CampsiteSchema } from '../../validation/domain'
import type { Campsite } from '../../db/types'
import type { CampsiteSource } from '../source'
// Implementer hasn't shipped these yet — module-not-found is the red state.
import { createSeedSource, loadSeed } from '../seed'

describe('T3.3 loadSeed() helper (WS-2 seed integration consumer)', () => {
  let rows: Campsite[]
  beforeAll(() => {
    rows = loadSeed()
  })

  it('returns an array of typed Campsite rows', () => {
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.length).toBeGreaterThanOrEqual(150)
  })

  it('every returned row parses CampsiteSchema', () => {
    for (const c of rows) {
      const result = CampsiteSchema.safeParse(c)
      expect(result.success).toBe(true)
    }
  })

  it('is deterministic — same input order across calls', () => {
    const a: Campsite[] = loadSeed()
    const b: Campsite[] = loadSeed()
    expect(a.map((c: Campsite) => c.id)).toEqual(b.map((c: Campsite) => c.id))
  })
})

describe('T3.3 createSeedSource() — CampsiteSource impl', () => {
  let source: CampsiteSource

  beforeAll(() => {
    source = createSeedSource()
  })

  it('all() returns every seed entry', async () => {
    const all = await source.all()
    expect(all.length).toBeGreaterThanOrEqual(150)
  })

  it('getById returns the matching entry', async () => {
    const all = await source.all()
    const sample = all[0]
    const found = await source.getById(sample.id)
    expect(found?.id).toBe(sample.id)
    expect(found?.name).toBe(sample.name)
  })

  it('getById returns null for unknown id', async () => {
    const found = await source.getById('seed:does-not-exist-xyz')
    expect(found).toBeNull()
  })

  describe('search()', () => {
    it('full-text q filters by name (case-insensitive)', async () => {
      const all = await source.all()
      const sample = all[0]
      // pick a substring from the name guaranteed to match
      const needle = sample.name.split(/\s+/)[0]
      const res = await source.search({ q: needle.toLowerCase() })
      expect(res.campsites.some((c) => c.id === sample.id)).toBe(true)
    })

    it('state filter only returns matching state', async () => {
      const all = await source.all()
      // Find a state that exists in the seed.
      const sampleState = all.find((c) => c.state)?.state
      expect(sampleState).toBeDefined()
      const res = await source.search({ state: sampleState, pageSize: 50 })
      expect(res.campsites.length).toBeGreaterThan(0)
      for (const c of res.campsites) expect(c.state).toBe(sampleState)
    })

    it('agency filter narrows results', async () => {
      const res = await source.search({ agency: 'NPS', pageSize: 50 })
      expect(res.campsites.length).toBeGreaterThan(0)
      for (const c of res.campsites) expect(c.agency).toBe('NPS')
    })

    it('amenities filter requires ALL listed amenities truthy', async () => {
      const res = await source.search({
        amenities: ['potableWater', 'showers'],
        pageSize: 50,
      })
      for (const c of res.campsites) {
        expect(c.amenities.potableWater).toBe(true)
        expect(c.amenities.showers).toBe(true)
      }
    })

    it('combines q + state + agency + amenities', async () => {
      const res = await source.search({
        q: 'camp',
        state: 'CA',
        agency: 'NPS',
        amenities: ['bearLockers'],
        pageSize: 50,
      })
      for (const c of res.campsites) {
        expect(c.state).toBe('CA')
        expect(c.agency).toBe('NPS')
        expect(c.amenities.bearLockers).toBe(true)
      }
    })

    it('paginates: pageSize bounds the slice; total reflects full match', async () => {
      const full = await source.search({ pageSize: 50, page: 1 })
      expect(full.campsites.length).toBeLessThanOrEqual(50)
      expect(full.total).toBeGreaterThanOrEqual(full.campsites.length)

      const next = await source.search({ pageSize: 50, page: 2 })
      // page 2 contains different ids than page 1 (unless dataset < 50)
      const overlap = new Set(full.campsites.map((c) => c.id))
      const noOverlap = next.campsites.every((c) => !overlap.has(c.id))
      expect(noOverlap).toBe(true)
    })

    it('clamps pageSize > SEARCH_PAGE_SIZE_MAX to 50 (DR-23)', async () => {
      const res = await source.search({ pageSize: 500, page: 1 })
      expect(res.pageSize).toBe(50)
      expect(res.campsites.length).toBeLessThanOrEqual(50)
    })

    it('defaults pageSize to 20 when omitted (DR-23)', async () => {
      const res = await source.search({})
      expect(res.pageSize).toBe(20)
    })
  })
})
