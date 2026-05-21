// T3.6 — `scripts/import-ridb.ts` dry-run + idempotency.
//
// Red phase: `scripts/import-ridb.ts` does not yet exist; import fails.
//
// Covers acceptance criterion T3.6:
//   - dry-run maps a sample → `upsertMany` called with N normalized rows
//   - idempotent (calling twice → upsertMany re-called with the same row
//     set; rows are stable & deduplicated by id)
//   - no real RIDB network calls — `fetchRidb` is stubbed at the module
//     level via `vi.mock`.
//
// Spec also says "no-key path exits gracefully": when `RIDB_API_KEY` is
// unset the importer logs a clear skip and does NOT call `upsertMany`.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Campsite } from '../../db/types'
import {
  ridbYosemite,
  ridbUtah,
  ridbUnknownWyoming,
} from './_helpers/ridb-sample'

// Mock the RIDB module the script imports from, so we never call out.
// The implementer's `scripts/import-ridb.ts` MUST import from
// `lib/campsites/ridb` (the contract); otherwise this mock won't bind and
// the test still fails — which is the intended forcing function.
vi.mock('@/lib/campsites/ridb', async () => {
  const sample = await import('./_helpers/ridb-sample')
  return {
    fetchRidb: vi.fn(async (): Promise<Campsite[]> => {
      // Map the helper samples via the real mapper (which the implementer
      // ships) — but since the real module is mocked here, we re-export a
      // minimal mapper inline that mirrors the contract.
      const { ridbYosemite, ridbUtah, ridbUnknownWyoming } = sample
      const minimalMap = (r: typeof ridbYosemite): Campsite => ({
        id: `ridb:${r.RecAreaID}`,
        name: r.RecAreaName ?? 'Unknown',
        agency: r.ParentOrganization,
        state: r.AddressStateCode,
        lat: r.RecAreaLatitude,
        lng: r.RecAreaLongitude,
        description: r.RecAreaDescription,
        amenities: {
          potableWater: false,
          toilets: 'none',
          showers: false,
          electricity: false,
          fireRings: false,
          firewoodAvailable: false,
          picnicTables: false,
          bearLockers: false,
          bearCountry: false,
          trashService: false,
          dumpStation: false,
          cellService: 'none',
          accessLevel: 'drive-in',
        },
        activities: (r.ACTIVITY ?? []).map((a) => a.ActivityName),
        source: 'ridb',
      })
      return [
        minimalMap(ridbYosemite),
        minimalMap(ridbUtah),
        minimalMap(ridbUnknownWyoming),
      ]
    }),
    mapRidbToCampsite: vi.fn(),
    createRidbSource: vi.fn(),
  }
})

// Also mock services.ts so the importer talks to a controllable fake
// storage. The script contract per WS-3.6: `storage.campsites.upsertMany`.
const upsertManySpy = vi.fn(async (_rows: Campsite[]) => {})
vi.mock('@/lib/services', async () => {
  return {
    getStorage: () => ({
      campsites: {
        upsertMany: upsertManySpy,
        search: vi.fn(),
        getById: vi.fn(),
      },
    }),
    getCampsiteSource: vi.fn(),
    getBackend: () => 'memory',
  }
})

// Avoid the importer's revalidate-ping hitting a real URL. The spec says
// the script "pings the dev `revalidate-campsites` Route Handler … guarded
// by `BC_DEV_URL` env" (review-3 DR-57). With BC_DEV_URL unset, no fetch.
const fetchSpy = vi.spyOn(globalThis, 'fetch')

describe('T3.6 import-ridb script — happy path', () => {
  const originalKey = process.env.RIDB_API_KEY
  const originalDevUrl = process.env.BC_DEV_URL

  beforeEach(() => {
    upsertManySpy.mockClear()
    fetchSpy.mockClear()
    process.env.RIDB_API_KEY = 'test-key'
    delete process.env.BC_DEV_URL
  })

  afterEach(() => {
    if (originalKey === undefined) delete process.env.RIDB_API_KEY
    else process.env.RIDB_API_KEY = originalKey
    if (originalDevUrl === undefined) delete process.env.BC_DEV_URL
    else process.env.BC_DEV_URL = originalDevUrl
    vi.resetModules()
  })

  it('runs importRidb() → upsertMany called with N normalized rows', async () => {
    // The script must export a programmable entry point (not just run on
    // import) so tests can drive it without a process exit.
    const mod = await import('../../../scripts/import-ridb')
    const fn = (mod.importRidb ?? mod.default) as
      | (() => Promise<{ inserted: number }>)
      | undefined
    expect(fn).toBeTypeOf('function')
    const result = await fn!()
    expect(upsertManySpy).toHaveBeenCalledTimes(1)
    const [rows] = upsertManySpy.mock.calls[0]
    expect(rows.length).toBeGreaterThan(0)
    // Every row must be schema-shaped (id prefix + source).
    for (const r of rows) {
      expect(r.id.startsWith('ridb:')).toBe(true)
      expect(r.source).toBe('ridb')
    }
    expect(result?.inserted).toBe(rows.length)
  })

  it('is idempotent — running twice produces the same row id set', async () => {
    const mod = await import('../../../scripts/import-ridb')
    const fn = (mod.importRidb ?? mod.default) as () => Promise<unknown>
    await fn!()
    await fn!()
    expect(upsertManySpy).toHaveBeenCalledTimes(2)
    const idsA = (upsertManySpy.mock.calls[0][0] as Campsite[])
      .map((r) => r.id)
      .sort()
    const idsB = (upsertManySpy.mock.calls[1][0] as Campsite[])
      .map((r) => r.id)
      .sort()
    expect(idsA).toEqual(idsB)
    // Each call's row set must be internally deduplicated.
    expect(new Set(idsA).size).toBe(idsA.length)
  })
})

describe('T3.6 import-ridb script — no-key graceful skip', () => {
  const originalKey = process.env.RIDB_API_KEY

  beforeEach(() => {
    upsertManySpy.mockClear()
    delete process.env.RIDB_API_KEY
  })

  afterEach(() => {
    if (originalKey === undefined) delete process.env.RIDB_API_KEY
    else process.env.RIDB_API_KEY = originalKey
    vi.resetModules()
  })

  it('without RIDB_API_KEY: exits gracefully, no upsertMany call', async () => {
    // Re-stub fetchRidb to return [] (the production behavior when key is
    // missing, exercised by T3.5).
    vi.doMock('@/lib/campsites/ridb', () => ({
      fetchRidb: vi.fn(async () => [] as Campsite[]),
      mapRidbToCampsite: vi.fn(),
      createRidbSource: vi.fn(),
    }))
    const mod = await import('../../../scripts/import-ridb')
    const fn = (mod.importRidb ?? mod.default) as () => Promise<unknown>
    await fn!()
    expect(upsertManySpy).not.toHaveBeenCalled()
    vi.doUnmock('@/lib/campsites/ridb')
  })
})
