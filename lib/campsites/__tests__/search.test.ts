// T3.4 — `lib/campsites/search.ts` cached search helper.
//
// Red phase: `lib/campsites/search.ts` does not yet exist; the imports fail.
// (Cache Components / `'use cache'` is a Next runtime concern; this test
// suite verifies the cache contract by spying on the underlying source,
// and verifies the normalize/clamp/whitelist behavior that produces the
// stable cache key.)
//
// Covers acceptance criterion T3.4:
//   - identical normalized args call the underlying storage.search once
//     (memoization is observable via the spy on the source)
//   - differing args bypass the cache (spy called twice)
//   - `pageSize: 500` clamped to `SEARCH_PAGE_SIZE_MAX` (=50) via
//     `lib/limits.ts` (DR-23 / DR-43)
//   - `revalidate-campsites` Route Handler calls
//     `revalidateTag('campsites', { expire: 0 })` — the `{ expire: 0 }`
//     options form (DR-50), NOT the `'max'` profile.
//
// Note: this test uses dependency-injected variants
// (`__cachedSearchForTest` / `__cachedGetByIdForTest`) so the underlying
// `'use cache'` runtime semantics don't have to be simulated. The
// implementer exposes these to make the cache contract testable in
// isolation — they wrap the same `normalize+storage.search` pipeline as
// the production helpers but with an injectable source.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { CampsiteSource } from '../source'
import type { SearchArgs, SearchResult } from '../../db/storage'
import { SEARCH_PAGE_SIZE_MAX, SEARCH_PAGE_SIZE_DEFAULT } from '../../limits'
// Implementer hasn't shipped these yet — module-not-found is the red state.
import {
  cachedSearch,
  cachedGetById,
  normalizeSearchArgs,
  __cachedSearchForTest,
  __cachedGetByIdForTest,
} from '../search'

function makeSpySource(): {
  source: CampsiteSource
  searchSpy: ReturnType<typeof vi.fn>
  getByIdSpy: ReturnType<typeof vi.fn>
} {
  const searchSpy = vi.fn(
    async (args: SearchArgs): Promise<SearchResult> => ({
      campsites: [],
      total: 0,
      page: args.page ?? 1,
      pageSize: args.pageSize ?? SEARCH_PAGE_SIZE_DEFAULT,
    }),
  )
  const getByIdSpy = vi.fn(async (_id: string) => null)
  const source: CampsiteSource = {
    search: searchSpy as unknown as CampsiteSource['search'],
    getById: getByIdSpy as unknown as CampsiteSource['getById'],
    all: async () => [],
  }
  return { source, searchSpy, getByIdSpy }
}

describe('T3.4 normalizeSearchArgs — stable cache-key shape', () => {
  it('whitelists only known keys (drops anything else)', () => {
    // Cast through unknown — TS won't let us add unknown keys to SearchArgs,
    // and the cast preserves the intent: "the function must drop extras".
    const out = normalizeSearchArgs({
      q: 'pine',
      state: 'CA',
      agency: 'NPS',
      amenities: ['potableWater'],
      page: 1,
      pageSize: 20,
      somethingElse: 'nope',
    } as unknown as SearchArgs)
    expect(Object.keys(out).sort()).toEqual(
      ['agency', 'amenities', 'page', 'pageSize', 'q', 'state'].sort(),
    )
  })

  it('clamps pageSize > SEARCH_PAGE_SIZE_MAX to 50 (DR-23/DR-43)', () => {
    const out = normalizeSearchArgs({ pageSize: 500 })
    expect(out.pageSize).toBe(SEARCH_PAGE_SIZE_MAX)
  })

  it('defaults pageSize to SEARCH_PAGE_SIZE_DEFAULT (=20) when omitted', () => {
    const out = normalizeSearchArgs({})
    expect(out.pageSize).toBe(SEARCH_PAGE_SIZE_DEFAULT)
  })

  it('floors page at 1', () => {
    const out = normalizeSearchArgs({ page: 0 })
    expect(out.page).toBe(1)
  })

  it('sorts amenities for stability (order-independent cache key)', () => {
    const a = normalizeSearchArgs({
      amenities: ['showers', 'potableWater', 'bearLockers'],
    })
    const b = normalizeSearchArgs({
      amenities: ['bearLockers', 'showers', 'potableWater'],
    })
    expect(a.amenities).toEqual(b.amenities)
  })

  it('trims/lowercases q (case-insensitive cache key)', () => {
    const a = normalizeSearchArgs({ q: '  Pine ' })
    const b = normalizeSearchArgs({ q: 'pine' })
    expect(a.q).toBe(b.q)
  })

  it('drops empty optional values (so empty filter = no filter)', () => {
    const a = normalizeSearchArgs({ q: '   ', state: '', agency: '' })
    expect(a.q).toBeUndefined()
    expect(a.state).toBeUndefined()
    expect(a.agency).toBeUndefined()
  })
})

describe('T3.4 cachedSearch — memoization contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('identical normalized args → underlying source.search called once', async () => {
    const { source, searchSpy } = makeSpySource()
    const args: SearchArgs = { q: 'pine', state: 'CA' }
    await __cachedSearchForTest(source, args)
    await __cachedSearchForTest(source, args)
    expect(searchSpy).toHaveBeenCalledTimes(1)
  })

  it('args differing only in key order/casing/extras still memoize', async () => {
    const { source, searchSpy } = makeSpySource()
    await __cachedSearchForTest(source, {
      q: ' Pine ',
      state: 'CA',
      amenities: ['showers', 'potableWater'],
    })
    await __cachedSearchForTest(source, {
      state: 'CA',
      amenities: ['potableWater', 'showers'],
      q: 'pine',
    })
    expect(searchSpy).toHaveBeenCalledTimes(1)
  })

  it('differing args bypass the cache (called twice)', async () => {
    const { source, searchSpy } = makeSpySource()
    await __cachedSearchForTest(source, { q: 'pine' })
    await __cachedSearchForTest(source, { q: 'oak' })
    expect(searchSpy).toHaveBeenCalledTimes(2)
  })

  it('passes the clamped pageSize through to the storage layer', async () => {
    const { source, searchSpy } = makeSpySource()
    await __cachedSearchForTest(source, { pageSize: 500 })
    const [calledWith] = searchSpy.mock.calls[0]
    expect((calledWith as SearchArgs).pageSize).toBe(SEARCH_PAGE_SIZE_MAX)
  })
})

describe('T3.4 cachedGetById — detail-page memoization contract', () => {
  beforeEach(() => vi.clearAllMocks())

  it('repeated calls with the same id hit cache (source called once)', async () => {
    const { source, getByIdSpy } = makeSpySource()
    await __cachedGetByIdForTest(source, 'seed:foo')
    await __cachedGetByIdForTest(source, 'seed:foo')
    expect(getByIdSpy).toHaveBeenCalledTimes(1)
  })

  it('different ids bypass the cache', async () => {
    const { source, getByIdSpy } = makeSpySource()
    await __cachedGetByIdForTest(source, 'seed:a')
    await __cachedGetByIdForTest(source, 'seed:b')
    expect(getByIdSpy).toHaveBeenCalledTimes(2)
  })
})

describe('T3.4 production cachedSearch / cachedGetById exports exist', () => {
  // These are the helpers that the UI/Server Components actually import.
  // They wrap `'use cache'` + cacheTag('campsites') + cacheLife — the
  // contract here is just that they are callable functions with the
  // documented shape.
  it('cachedSearch is an async function', () => {
    expect(typeof cachedSearch).toBe('function')
  })
  it('cachedGetById is an async function', () => {
    expect(typeof cachedGetById).toBe('function')
  })
})

describe("T3.4 revalidate-campsites Route Handler (WS-3.3b)", () => {
  // The Route Handler must call `revalidateTag('campsites', { expire: 0 })`
  // (DR-50). We mock `next/cache` so the test never touches a real Next
  // runtime.
  const originalNodeEnv = process.env.NODE_ENV
  const originalSecret = process.env.BEARCAMP_REVALIDATE_SECRET

  afterEach(() => {
    const envMut = process.env as Record<string, string | undefined>
    if (originalNodeEnv === undefined) delete envMut.NODE_ENV
    else envMut.NODE_ENV = originalNodeEnv
    if (originalSecret === undefined) {
      delete process.env.BEARCAMP_REVALIDATE_SECRET
    } else {
      process.env.BEARCAMP_REVALIDATE_SECRET = originalSecret
    }
    vi.doUnmock('next/cache')
    vi.resetModules()
  })

  it("calls revalidateTag('campsites', { expire: 0 }) — the options form, not 'max'", async () => {
    const revalidateTag = vi.fn()
    vi.doMock('next/cache', () => ({ revalidateTag }))
    // Import after the mock is installed.
    const route = await import('../../../app/api/revalidate-campsites/route')
    // Route handlers in Next 16 export named verbs (GET/POST). We accept
    // either; the importer pings whichever the impl chose.
    const handler = (route.POST ?? route.GET) as
      | ((req: Request) => Promise<Response>)
      | undefined
    expect(handler).toBeTypeOf('function')
    const res = await handler!(
      new Request('http://localhost/api/revalidate-campsites', {
        method: 'POST',
      }),
    )
    expect(res.status).toBeGreaterThanOrEqual(200)
    expect(res.status).toBeLessThan(300)
    expect(revalidateTag).toHaveBeenCalledTimes(1)
    expect(revalidateTag).toHaveBeenCalledWith('campsites', { expire: 0 })
    // Explicit anti-assertion: must NOT use the 'max' profile (DR-50).
    expect(revalidateTag).not.toHaveBeenCalledWith('campsites', 'max')
  })

  // Spec WS-3.3b: "dev-only, guarded by env". Without a guard, a prod
  // deploy exposes a public endpoint that can be hit in a loop to force
  // cache misses on the campsites catalog (Codex review P1).
  it("rejects unauthenticated requests in production (NODE_ENV=production, no secret)", async () => {
    const revalidateTag = vi.fn()
    vi.doMock('next/cache', () => ({ revalidateTag }))
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    delete process.env.BEARCAMP_REVALIDATE_SECRET
    const route = await import('../../../app/api/revalidate-campsites/route')
    const handler = (route.POST ?? route.GET) as (req: Request) => Promise<Response>
    const res = await handler(
      new Request('http://localhost/api/revalidate-campsites', {
        method: 'POST',
      }),
    )
    // Must NOT trigger a cache purge for an unauthenticated prod caller.
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(res.status).toBe(404)
  })

  it("accepts production requests carrying the matching x-revalidate-secret header", async () => {
    const revalidateTag = vi.fn()
    vi.doMock('next/cache', () => ({ revalidateTag }))
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    process.env.BEARCAMP_REVALIDATE_SECRET = 'shh'
    const route = await import('../../../app/api/revalidate-campsites/route')
    const handler = (route.POST ?? route.GET) as (req: Request) => Promise<Response>
    const res = await handler(
      new Request('http://localhost/api/revalidate-campsites', {
        method: 'POST',
        headers: { 'x-revalidate-secret': 'shh' },
      }),
    )
    expect(res.status).toBeGreaterThanOrEqual(200)
    expect(res.status).toBeLessThan(300)
    expect(revalidateTag).toHaveBeenCalledWith('campsites', { expire: 0 })
  })

  it("rejects production requests with the wrong secret", async () => {
    const revalidateTag = vi.fn()
    vi.doMock('next/cache', () => ({ revalidateTag }))
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    process.env.BEARCAMP_REVALIDATE_SECRET = 'shh'
    const route = await import('../../../app/api/revalidate-campsites/route')
    const handler = (route.POST ?? route.GET) as (req: Request) => Promise<Response>
    const res = await handler(
      new Request('http://localhost/api/revalidate-campsites', {
        method: 'POST',
        headers: { 'x-revalidate-secret': 'wrong' },
      }),
    )
    expect(res.status).toBe(404)
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
