// T3.5 (part 2) — `lib/campsites/ridb.ts` mapper + client.
//
// Red phase: `lib/campsites/ridb.ts` does not yet exist; imports fail.
//
// Covers acceptance criterion T3.5 (RIDB portion):
//   - sample RIDB payload → expected `Campsite` (id prefixed `ridb:` via
//     campsiteId('ridb', ...); amenities via amenity-map; activities
//     normalized; lat/lng pulled from RecArea[Lat|Lng])
//   - missing `RIDB_API_KEY` → graceful skip (`fetchRidb` resolves to []
//     and logs a clear skip message; never throws)
//   - network is fully mocked — NO real HTTP calls.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CampsiteSchema } from '../../validation/domain'
import {
  ridbYosemite,
  ridbUtah,
  ridbUnknownWyoming,
  ridbUnknownFlorida,
  allSamples,
} from './_helpers/ridb-sample'
// Implementer hasn't shipped these yet — module-not-found is the red state.
import {
  mapRidbToCampsite,
  fetchRidb,
  createRidbSource,
} from '../ridb'

describe('T3.5 mapRidbToCampsite — pure mapper', () => {
  it('maps a fully-populated RIDB record to a valid Campsite', () => {
    const c = mapRidbToCampsite(ridbYosemite)
    const parsed = CampsiteSchema.safeParse(c)
    expect(parsed.success).toBe(true)
    expect(c.id).toBe('ridb:232447')
    expect(c.source).toBe('ridb')
    expect(c.state).toBe('CA')
    expect(c.agency).toBe('NPS')
    expect(c.lat).toBeCloseTo(37.8651)
    expect(c.lng).toBeCloseTo(-119.5383)
    expect(c.amenities.potableWater).toBe(true)
    expect(c.amenities.toilets).toBe('flush')
    expect(c.amenities.bearLockers).toBe(true)
    expect(c.amenities.bearCountry).toBe(true) // CA ∈ bearRegions
    expect(c.activities).toContain('Hiking')
    expect(c.activities).toContain('Climbing')
  })

  it('maps a sparser RIDB record (no water / vault toilets) correctly', () => {
    const c = mapRidbToCampsite(ridbUtah)
    expect(CampsiteSchema.safeParse(c).success).toBe(true)
    expect(c.id).toBe('ridb:998001')
    expect(c.amenities.potableWater).toBe(false)
    expect(c.amenities.toilets).toBe('vault')
    expect(c.amenities.electricity).toBe(false)
    expect(c.amenities.cellService).toBe('none')
    // UT is generally not classified as a bear-country default state.
    expect(c.amenities.bearCountry).toBe(false)
  })

  it('unknown-attributes payload in bear region → bearCountry:true', () => {
    const c = mapRidbToCampsite(ridbUnknownWyoming)
    expect(CampsiteSchema.safeParse(c).success).toBe(true)
    expect(c.id).toBe('ridb:777')
    expect(c.amenities.bearCountry).toBe(true) // WY ∈ bearRegions
    // Conservative defaults
    expect(c.amenities.toilets).toBe('none')
    expect(c.amenities.potableWater).toBe(false)
  })

  it('unknown-attributes payload in non-bear region → bearCountry:false', () => {
    const c = mapRidbToCampsite(ridbUnknownFlorida)
    expect(CampsiteSchema.safeParse(c).success).toBe(true)
    expect(c.id).toBe('ridb:888')
    expect(c.amenities.bearCountry).toBe(false) // FL ∉ bearRegions
    expect(c.amenities.toilets).toBe('none')
  })

  it('numeric RecAreaID is stringified into the prefix', () => {
    const c = mapRidbToCampsite(ridbUtah)
    expect(c.id).toBe('ridb:998001')
  })

  it('every sample parses CampsiteSchema after mapping', () => {
    for (const sample of allSamples) {
      const c = mapRidbToCampsite(sample)
      expect(CampsiteSchema.safeParse(c).success).toBe(true)
    }
  })
})

describe('T3.5 fetchRidb — network-mocked client', () => {
  const originalKey = process.env.RIDB_API_KEY

  beforeEach(() => {
    vi.restoreAllMocks()
    delete process.env.RIDB_API_KEY
  })

  afterEach(() => {
    if (originalKey === undefined) delete process.env.RIDB_API_KEY
    else process.env.RIDB_API_KEY = originalKey
  })

  it('missing RIDB_API_KEY → resolves to [] without throwing (graceful skip)', async () => {
    delete process.env.RIDB_API_KEY
    const rows = await fetchRidb()
    expect(rows).toEqual([])
  })

  it('with key set: calls fetch and maps every returned record', async () => {
    process.env.RIDB_API_KEY = 'test-key'
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ RECDATA: [ridbYosemite, ridbUtah], METADATA: {} }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      // Subsequent page → empty, terminates pagination.
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ RECDATA: [], METADATA: {} }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    const rows = await fetchRidb()
    expect(fetchSpy).toHaveBeenCalled()
    expect(rows.length).toBe(2)
    for (const r of rows) {
      expect(CampsiteSchema.safeParse(r).success).toBe(true)
      expect(r.id.startsWith('ridb:')).toBe(true)
    }
  })

  it('sends the API key (RIDB header `apikey`)', async () => {
    process.env.RIDB_API_KEY = 'secret-key'
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ RECDATA: [], METADATA: {} }), {
        status: 200,
      }),
    )
    await fetchRidb()
    expect(fetchSpy).toHaveBeenCalled()
    const init = fetchSpy.mock.calls[0][1] as RequestInit | undefined
    const headers = new Headers(init?.headers)
    // RIDB expects `apikey` header (per ridb.recreation.gov docs).
    expect(headers.get('apikey')).toBe('secret-key')
  })

  it('never makes a real HTTP call when key is unset', async () => {
    delete process.env.RIDB_API_KEY
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const rows = await fetchRidb()
    expect(rows).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('T3.5 createRidbSource — CampsiteSource impl', () => {
  it('returns an object satisfying CampsiteSource (search/getById/all)', () => {
    const src = createRidbSource()
    expect(typeof src.search).toBe('function')
    expect(typeof src.getById).toBe('function')
    expect(typeof src.all).toBe('function')
  })
})
