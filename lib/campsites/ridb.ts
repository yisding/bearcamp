// WS-3.4 — RIDB (Recreation.gov) adapter.
//
//   mapRidbToCampsite : pure mapper (raw RIDB row → Campsite via amenity-map)
//   fetchRidb         : paginated client; skips gracefully with no key
//   createRidbSource  : CampsiteSource wrapper for parity (rarely used live)
//
// No real HTTP at test time — tests mock `globalThis.fetch`. With no
// `RIDB_API_KEY` env var, `fetchRidb` resolves to `[]` without calling
// `fetch` (graceful skip per spec).

import type { Campsite } from '../db/types'
import type { CampsiteSource } from './source'
import type { SearchArgs, SearchResult } from '../db/storage'
import { campsiteId } from '../ids'
import {
  SEARCH_PAGE_SIZE_DEFAULT,
  SEARCH_PAGE_SIZE_MAX,
} from '../limits'
import { mapRidbAttributesToAmenities } from './amenity-map'

// RIDB raw row shape. Only the fields we read are typed; the live API
// returns many more. RecAreaID is the stable identity per the importer's
// id-prefix scheme (`ridb:<RecAreaID>`).
export interface RidbRawRow {
  RecAreaID: string | number
  RecAreaName?: string
  FacilityName?: string
  RecAreaDescription?: string
  FacilityDescription?: string
  RecAreaLatitude?: number
  RecAreaLongitude?: number
  FacilityLatitude?: number
  FacilityLongitude?: number
  AddressStateCode?: string
  ParentOrganization?: string
  ATTRIBUTES?: Array<{ AttributeName: string; AttributeValue: string }>
  ACTIVITY?: Array<{ ActivityName: string }>
}

const RIDB_BASE_URL =
  process.env.RIDB_BASE_URL || 'https://ridb.recreation.gov/api/v1'

// Pure mapper. Schema-validated by the caller (CampsiteSchema).
export function mapRidbToCampsite(raw: RidbRawRow): Campsite {
  const recId = String(raw.RecAreaID)
  // RIDB data isn't guaranteed uppercase/trimmed — normalize so it satisfies
  // CampsiteSchema's `^[A-Z]{2}$` and matches the `bearRegions` lookup.
  const rawState = raw.AddressStateCode?.trim().toUpperCase()
  const state = rawState && rawState.length > 0 ? rawState : undefined
  const amenities = mapRidbAttributesToAmenities(raw.ATTRIBUTES, { state })
  const name = raw.RecAreaName ?? raw.FacilityName ?? `RIDB ${recId}`
  const description = raw.RecAreaDescription ?? raw.FacilityDescription
  const lat = raw.RecAreaLatitude ?? raw.FacilityLatitude
  const lng = raw.RecAreaLongitude ?? raw.FacilityLongitude
  const activities = (raw.ACTIVITY ?? []).map((a) => a.ActivityName)

  const campsite: Campsite = {
    id: campsiteId('ridb', recId),
    name,
    amenities,
    activities,
    source: 'ridb',
  }
  if (raw.ParentOrganization) campsite.agency = raw.ParentOrganization
  if (state) campsite.state = state
  if (typeof lat === 'number') campsite.lat = lat
  if (typeof lng === 'number') campsite.lng = lng
  if (description) campsite.description = description
  return campsite
}

// RIDB caps `limit` at SEARCH_PAGE_SIZE_MAX, and the importer walks up to
// `MAX_BATCHES` batches per run before stopping (bounded so tests + dev
// runs don't loop forever). The literal is a per-import bound only —
// unrelated to participant/tent/search bounds in lib/limits.ts.
const MAX_BATCHES = 20

interface FetchRidbOptions {
  maxPages?: number
  limit?: number
}

// Paginated client. Returns mapped Campsite[]; the importer is responsible
// for deduplication/upsertMany. No-key path returns [] without fetch().
export async function fetchRidb(
  options: FetchRidbOptions = {},
): Promise<Campsite[]> {
  const key = process.env.RIDB_API_KEY
  if (!key) {
    // Clear skip — the importer logs at a higher layer.
    return []
  }

  const maxBatches = options.maxPages ?? MAX_BATCHES
  const limit = options.limit ?? SEARCH_PAGE_SIZE_MAX
  const out: Campsite[] = []

  for (let page = 0; page < maxBatches; page++) {
    const url = new URL(`${RIDB_BASE_URL}/recareas`)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('offset', String(page * limit))

    const res = await fetch(url, {
      headers: {
        // RIDB documents the `apikey` header (recreation.gov docs).
        apikey: key,
        accept: 'application/json',
      },
    })
    if (!res.ok) {
      // Stop on error; surface zero-mapped-rows rather than throw mid-import.
      // The importer dedupes/upserts whatever we accumulated.
      break
    }
    let body: { RECDATA?: RidbRawRow[] }
    try {
      body = (await res.json()) as { RECDATA?: RidbRawRow[] }
    } catch {
      break
    }
    const recdata = body.RECDATA ?? []
    if (recdata.length === 0) break
    for (const row of recdata) {
      out.push(mapRidbToCampsite(row))
    }
    if (recdata.length < limit) break
  }

  return out
}

// CampsiteSource impl wrapping in-memory results from fetchRidb. Rarely used
// live (the importer normally writes through storage), but the parity helper
// matches `createSeedSource`/`createFixtureSource` so `services.ts` can swap.
export function createRidbSource(): CampsiteSource {
  let cache: Campsite[] | null = null
  async function load(): Promise<Campsite[]> {
    if (cache === null) cache = await fetchRidb()
    return cache
  }
  return {
    async all() {
      return load()
    },
    async getById(id: string) {
      const rows = await load()
      return rows.find((c) => c.id === id) ?? null
    },
    async search(args: SearchArgs): Promise<SearchResult> {
      const rows = await load()
      const page = Math.max(1, args.page ?? 1)
      const pageSize = Math.min(
        Math.max(1, args.pageSize ?? SEARCH_PAGE_SIZE_DEFAULT),
        SEARCH_PAGE_SIZE_MAX,
      )
      const q = args.q?.toLowerCase()
      let filtered = rows.slice()
      if (q) {
        filtered = filtered.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.description?.toLowerCase().includes(q) ?? false),
        )
      }
      if (args.state) filtered = filtered.filter((c) => c.state === args.state)
      if (args.agency)
        filtered = filtered.filter((c) => c.agency === args.agency)
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
    },
  }
}
