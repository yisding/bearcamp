# WS-3 — Campsite Data & Search

**Wave:** 2 (parallel) · **Critical path:** no (independent; seed authoring is
pure content) · **Depends on:** WS-0 `Amenities`/`CampsiteSource`
**Start when:** WS-0 merged

**Owned paths:** `data/campsites.seed.json`,
`lib/campsites/{seed,ridb,osm,search}.ts`, `lib/campsites/amenity-map.ts`
(RIDB→`Amenities` table + `bearRegions`), `scripts/import-ridb.ts`,
`app/api/revalidate-campsites/route.ts` (dev-only).

> Implements the WS-0 `CampsiteSource`. The cached `search.ts` uses Cache
> Components (`'use cache'`); the repo-level FTS/LIKE lives in WS-2.

## Tasks

- [ ] **WS-3.0** Amenity mapping — `lib/campsites/amenity-map.ts`: an
  **explicit RIDB-attribute → `Amenities`-field table** and a `bearRegions`
  list (states/regions where `bearCountry` defaults true). Unknowns →
  conservative option (`toilets:'none'`, `bearCountry:true` iff in
  `bearRegions`, else `false`). **DoD:** table covers every `Amenities`
  field; pure + unit-tested (review G5).
- [ ] **WS-3.1** Seed dataset — `data/campsites.seed.json`: ≥150
  **best-effort curated** US public campgrounds across
  NPS/USFS/BLM/USACE/state, each with normalized `Amenities`, `state`
  (2-char regex), `agency`, `lat/lng`, `description`, `activities`. Every
  `id` is `seed:<slug>` per the source-prefix scheme (review-2 DR-30).
  Deliberately spread amenity combos so generated lists differ visibly.
  Not authoritative — accuracy caveat documented in README D1 (review
  G5 → DR-7). **DoD:** all entries pass `validation/domain.ts`.
- [ ] **WS-3.2** Seed source — `lib/campsites/seed.ts`: `CampsiteSource` impl
  loading+validating the JSON, plus a `loadSeed(): Campsite[]` export that
  WS-2's `prisma/seed.ts` consumes (DB seeding itself is **WS-2.11** via
  `prisma db seed`, not WS-3). **DoD:** `search/getById/all` work off the
  validated seed; `loadSeed` returns typed, schema-valid rows.
- [ ] **WS-3.3** Cached search — `lib/campsites/search.ts`: `'use cache'`
  wrapper over `storage.search`; `cacheTag('campsites')`,
  `cacheLife('hours')`; normalize/whitelist `SearchArgs` for a stable
  cache key; **clamp `pageSize` to ≤50, default 20** (review-2 DR-23).
  Also export the helper the campsite **detail** page uses
  (`cacheTag('campsites')` + `cacheLife('days')`) so both share the tag.
  **DoD:** identical args hit cache; tag invalidation works; `pageSize`
  >50 is clamped. **Notes:** `'use cache'` cannot wrap a Route Handler
  body — keep it in this helper.
- [ ] **WS-3.3b** Catalog revalidation route — `app/api/revalidate-campsites/
  route.ts` (dev-only, guarded by env): a Route Handler that calls
  **`revalidateTag('campsites', { expire: 0 })`** — the **`{ expire: 0 }`
  options form**, not the `'max'` profile (review-3 DR-50). `'max'` is
  *mark-stale, 30-day revalidate* per `cacheLife.md` — it would leave
  existing tabs showing stale data after a reseed; `{ expire: 0 }`
  forces immediate refresh on the next read, which is what the dev
  importer wants. The two-arg form is still required (single-arg is
  deprecated in Next 16; review-2 DR-8). Route Handlers may call it;
  scripts cannot (review I-A). `prisma db seed` / `import-ridb` ping it
  after writing (guarded by `BC_DEV_URL` env per WS-2.11 / review-3
  DR-57). **DoD:** hitting it refetches catalog immediately; documented
  v1 limitation that otherwise a restart refreshes the catalog.
- [ ] **WS-3.4** RIDB adapter — `lib/campsites/ridb.ts`: client + mapper
  raw RIDB → `Campsite`/`Amenities` **using `amenity-map.ts`** (WS-3.0)
  for all field mapping/defaults; emits ids as `ridb:<RecAreaID>` via
  `campsiteId('ridb', recId)` (review-2 DR-30); pagination + rate
  limiting; reads `RIDB_API_KEY`. **DoD:** mapper unit-tested with sample
  payloads against the mapping table; no key → clear skip.
- [ ] **WS-3.5** OSM adapter *(optional)* — `lib/campsites/osm.ts`: Overpass
  `tourism=camp_site` → `Campsite`; behind a flag. **DoD:** parses a sample
  Overpass response; off by default.
- [ ] **WS-3.6** Import script — `scripts/import-ridb.ts` + `pnpm` script:
  backfill DB via `ridb.ts` → `storage.campsites.upsertMany`; idempotent;
  progress logging; documented opt-in. **DoD:** dry-run works on a sample;
  no-key path exits gracefully.
- [ ] **WS-3.7** Tests — seed validates; `search` filters (q/state/agency/
  amenities) + pagination; RIDB mapper fixtures; cache-key stability.
  **DoD:** suite green.

## Acceptance criteria — write these tests first (red → green)

vitest; tests in owned paths. Author first.

- [ ] **T3.1** seed valid — every `campsites.seed.json` entry parses
  `validation/domain.ts`; count ≥150. _(WS-3.1)_
- [ ] **T3.2** seed coverage — the set covers each amenity branch (assert a
  coverage map vs `../packing-engine.md`). _(WS-3.1)_
- [ ] **T3.3** seed source — `search/getById/all` correct; `loadSeed()`
  returns schema-valid rows (DB-seed idempotency is tested in WS-2.11/T2
  via `prisma db seed`). _(WS-3.2)_
- [ ] **T3.4** cached search — repeated identical normalized args call
  underlying storage once (spy); differing args bypass; **`pageSize:
  500` is clamped to `SEARCH_PAGE_SIZE_MAX` (=50)** via `lib/limits.ts`
  (review-2 DR-23; review-3 DR-43); hitting `revalidate-campsites`
  (which calls `revalidateTag('campsites', { expire: 0 })` — review-3
  DR-50) then re-querying refetches immediately. _(WS-3.3/3.3b)_
- [ ] **T3.5** amenity mapping + RIDB — `amenity-map.ts` table maps every
  field; unknowns → conservative defaults; `bearRegions` drives
  `bearCountry`; sample RIDB payload → expected `Campsite`/`Amenities`;
  missing `RIDB_API_KEY` → graceful skip. _(WS-3.0/3.4)_
- [ ] **T3.6** import script — dry-run maps a sample → `upsertMany` called
  with N normalized rows; idempotent. _(WS-3.6)_

## Seams you participate in

- **I-5** (producer): fixtures → seed dataset. WS-8.1 points
  `getCampsiteSource()` at `seed.ts`. No other stream edits your files.
