// WS-3.3 / WS-3.3b — cached search helpers + normalize/whitelist for a
// stable cache key.
//
// The production `cachedSearch` / `cachedGetById` use Next 16 Cache
// Components (`'use cache'` + `cacheTag('campsites')` + `cacheLife(...)`).
// `__cachedSearchForTest` / `__cachedGetByIdForTest` are dependency-injected
// twins used by unit tests — same normalize pipeline, same in-memory
// memoization keyed on the stringified normalized args. This keeps the
// cache contract testable without simulating the Next runtime.

import { cacheTag, cacheLife } from 'next/cache'
import type { CampsiteSource } from './source'
import type { SearchArgs, SearchResult } from '../db/storage'
import type { Amenities, Campsite } from '../db/types'
import {
  SEARCH_PAGE_SIZE_DEFAULT,
  SEARCH_PAGE_SIZE_MAX,
} from '../limits'
import { getCampsiteSource } from '../services'

const CAMPSITES_CACHE_TAG = 'campsites'

// The canonical key whitelist. Anything not in here is dropped during
// normalization so unrelated UI props can't poison the cache key.
const KNOWN_KEYS = ['q', 'state', 'agency', 'amenities', 'page', 'pageSize'] as const
type KnownKey = (typeof KNOWN_KEYS)[number]

export interface NormalizedSearchArgs {
  q?: string
  state?: string
  agency?: string
  amenities?: (keyof Amenities)[]
  page: number
  pageSize: number
}

// Stable key derivation: lowercase/trim q, sort amenities, clamp pageSize,
// floor page≥1, drop empty strings, drop unknown keys, emit in stable order.
export function normalizeSearchArgs(args: SearchArgs): NormalizedSearchArgs {
  const out: NormalizedSearchArgs = {
    page: 1,
    pageSize: SEARCH_PAGE_SIZE_DEFAULT,
  }

  // Whitelist
  const safe = {} as Record<KnownKey, unknown>
  for (const k of KNOWN_KEYS) {
    if (k in args) safe[k] = (args as Record<string, unknown>)[k]
  }

  if (typeof safe.q === 'string') {
    const trimmed = safe.q.trim().toLowerCase()
    if (trimmed.length > 0) out.q = trimmed
  }
  if (typeof safe.state === 'string' && safe.state.trim().length > 0) {
    out.state = safe.state.trim()
  }
  if (typeof safe.agency === 'string' && safe.agency.trim().length > 0) {
    out.agency = safe.agency.trim()
  }
  if (Array.isArray(safe.amenities) && safe.amenities.length > 0) {
    // Sort + dedupe for an order-independent cache key.
    const sorted = Array.from(new Set(safe.amenities as string[])).sort()
    out.amenities = sorted as (keyof Amenities)[]
  }
  if (typeof safe.page === 'number' && Number.isFinite(safe.page)) {
    out.page = Math.max(1, Math.floor(safe.page))
  }
  if (typeof safe.pageSize === 'number' && Number.isFinite(safe.pageSize)) {
    const ps = Math.max(1, Math.floor(safe.pageSize))
    out.pageSize = Math.min(ps, SEARCH_PAGE_SIZE_MAX)
  }

  return out
}

// ---- Test-only memoizing twins -----------------------------------------
//
// These mirror the production helpers (same normalize pipeline, same
// underlying call shape) but use an injected source + a JS Map keyed on the
// stringified normalized args. The vitest suite spies on the injected
// source's `.search` / `.getById` to assert single-call memoization. The
// caches are module-scoped, weak-keyed by source object identity so spy
// sources from different tests don't share entries.

const searchTestCache = new WeakMap<CampsiteSource, Map<string, SearchResult>>()
const getByIdTestCache = new WeakMap<
  CampsiteSource,
  Map<string, Campsite | null>
>()

function searchKey(args: NormalizedSearchArgs): string {
  // Stable JSON shape — keys emitted in fixed order.
  return JSON.stringify({
    q: args.q ?? null,
    state: args.state ?? null,
    agency: args.agency ?? null,
    amenities: args.amenities ?? null,
    page: args.page,
    pageSize: args.pageSize,
  })
}

// Internal memoizing twin — mirrors production `cachedSearchNormalized`:
// its parameter is the ALREADY-NORMALIZED args, and the memo key derives
// from that normalized object. This is the test analogue of the `'use
// cache'` boundary, so memoization genuinely keys on the normalized value.
async function searchNormalizedForTest(
  source: CampsiteSource,
  normalized: NormalizedSearchArgs,
): Promise<SearchResult> {
  const key = searchKey(normalized)
  let bucket = searchTestCache.get(source)
  if (!bucket) {
    bucket = new Map()
    searchTestCache.set(source, bucket)
  }
  const cached = bucket.get(key)
  if (cached !== undefined) return cached
  const result = await source.search(normalized)
  bucket.set(key, result)
  return result
}

// Public twin — mirrors production `cachedSearch`: normalize FIRST (outside
// the memo boundary), then delegate to the memoizing helper.
export async function __cachedSearchForTest(
  source: CampsiteSource,
  args: SearchArgs,
): Promise<SearchResult> {
  const normalized = normalizeSearchArgs(args)
  return searchNormalizedForTest(source, normalized)
}

export async function __cachedGetByIdForTest(
  source: CampsiteSource,
  id: string,
): Promise<Campsite | null> {
  let bucket = getByIdTestCache.get(source)
  if (!bucket) {
    bucket = new Map()
    getByIdTestCache.set(source, bucket)
  }
  if (bucket.has(id)) return bucket.get(id) ?? null
  const result = await source.getById(id)
  bucket.set(id, result)
  return result
}

// ---- Production helpers (Cache Components) -----------------------------
//
// `'use cache'` is a Next 16 directive that marks the function output as
// cacheable. Per the use-cache.md "Cache keys" rule, the cache key is the
// SERIALIZED ARGUMENTS of the cached function — so normalization MUST run
// OUTSIDE the cache boundary, otherwise `{q:'Pine',state:'CA'}` and
// `{state:'CA',q:'pine'}` would key distinct entries despite normalizing
// identically (WS-3.3: "normalize/whitelist SearchArgs for a stable cache
// key"). The public `cachedSearch` therefore normalizes first, then
// delegates to the internal `'use cache'` helper whose single argument is
// the already-normalized object — the normalized value is what becomes the
// key. We tag every call with 'campsites' so the dev
// /api/revalidate-campsites Route Handler can purge with
// `revalidateTag('campsites', { expire: 0 })` (DR-50). List uses
// `cacheLife('hours')`; the detail page shares the tag but lives longer
// (`cacheLife('days')`) so individual detail pages stay snappy.

// Internal cached helper — its single parameter is the ALREADY-NORMALIZED
// args object, so the stable normalized value (not the raw caller input)
// becomes the cache key.
async function cachedSearchNormalized(
  normalized: NormalizedSearchArgs,
): Promise<SearchResult> {
  'use cache'
  cacheTag(CAMPSITES_CACHE_TAG)
  cacheLife('hours')
  const source = getCampsiteSource()
  return source.search(normalized)
}

export async function cachedSearch(args: SearchArgs): Promise<SearchResult> {
  // Normalize OUTSIDE the cache boundary so the cache key is the stable
  // normalized object, not the raw caller input.
  const normalized = normalizeSearchArgs(args)
  return cachedSearchNormalized(normalized)
}

export async function cachedGetById(id: string): Promise<Campsite | null> {
  // `id` is a primitive, already a stable cache key — no normalization needed.
  'use cache'
  cacheTag(CAMPSITES_CACHE_TAG)
  cacheLife('days')
  const source = getCampsiteSource()
  return source.getById(id)
}
