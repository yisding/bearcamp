# Milestones

Phased and checkable. Each phase is independently demoable. Read the relevant
`node_modules/next/dist/docs` guide before writing code (per `AGENTS.md`).

## Phase 0 — Foundations

- [ ] Add deps: `prisma`, `@prisma/client`, `@prisma/adapter-neon`,
      `@neondatabase/serverless`, `zod` + test stack (vitest,
      @testing-library/*, @next/playwright, Testcontainers). No `nanoid`
      (Prisma `cuid()`); no native deps.
- [ ] `next.config.ts`: set `cacheComponents: true` (+
      `experimental.instantNavigationDevToolsToggle: true` for dev).
- [ ] `.gitignore`: add `.env`; `.env.example` committed.
- [ ] `prisma/schema.prisma` (WS-0 contract) + `lib/db/types.ts` (Prisma-free
      DTOs) + async `StorageAdapter` interface + in-memory fake (WS-0).
      Prisma client/migrations/seed + `docker-compose.yml` are WS-2.
- [ ] `lib/ids.ts` (trip `crypto.randomUUID()` slug, `token()` ≥128-bit;
      item/participant ids = Prisma `cuid()`),
      `lib/validation/domain.ts` (WS-0) — action schemas live in
      `lib/validation/actions.ts` (WS-7).
- [ ] Root `layout.tsx`: app header/nav + toast Toaster; fix `metadata`
      (title/description → Bearcamp).

## Phase 1 — Campsite catalog & search

- [ ] `data/campsites.seed.json` — curated US public campgrounds with
      normalized `Amenities` (target ≥150 across NPS/USFS/BLM/USACE/state).
- [ ] `lib/campsites/source.ts` interface + `seed.ts` loader exposing
      `loadSeed()`. **DB seeding is `prisma db seed` (WS-2.11), not a
      startup hook** — review-2 G-stale.
- [ ] `lib/campsites/search.ts` — `'use cache'` + `cacheTag('campsites')` +
      `cacheLife('hours')`; Postgres `pg_trgm` (with `gin_trgm_ops` GIN
      index + `CREATE EXTENSION` in the migration) / `ILIKE` over
      name/description; filters: state, agency, amenities; `pageSize`
      default 20, max 50 (review-2 G-page).
- [ ] `/campsites` page + `SearchBar` (client, debounced → `?q=`) +
      `CampsiteCard`; results stream under `<Suspense>`;
      `unstable_instant = { prefetch: 'static' }`; verify in Instant Navs
      DevTools.
- [ ] `/campsites/[id]` cached detail + `AmenityGrid`; `not-found` for bad id.
- [ ] `/` landing: pitch + search entry → `/campsites`.

## Phase 2 — List generation & creation

- [ ] `lib/packing/templates.ts` (car + backpacking base lists).
- [ ] `lib/packing/rules.ts` (amenity transforms) + `generate.ts` (WS-1).
      `quantities.ts` + `index.ts` are **WS-0-owned** (write-once); WS-1
      only adds tests for `generate`/`requiredQty`, never edits them.
- [ ] `StylePicker` on campsite page → `createTrip` Server Action: validate,
      generate, insert trip + items, snapshot campsite, set owner cookie,
      `redirect('/trips/<id>')`.
- [ ] `app/trips/layout.tsx` with `unstable_instant = false`.

## Phase 3 — Trip page & list editing

- [ ] `lib/trips/identity.ts` — owner/participant token cookies;
      `assertOwner` / `assertParticipant` guards.
- [ ] `buildTripView(tripId)` join + quantity/shortfall computation.
- [ ] `/trips/[tripId]` page under `<Suspense>`: header (name, campsite,
      style), `PackingList` grouped by category, owner edit affordances.
- [ ] Server Actions: `renameTrip`, `updateTripSettings` (tentCapacity),
      `deleteTrip` (hard-delete + redirect), `addItem`, `updateItem`,
      `removeItem`, `restoreItem`, `reorderItem` — guarded, validated,
      `updateTag('trip:<id>')`. Editable item fields:
      name/category/scope/baseQty/unit/note; `scope`/`baseQty` edits
      recompute `requiredQty`. Show "why on list" for amenity items.
- [ ] Tests for editing: rename, re-quantity, scope change → `requiredQty`
      recomputes; restore puts an item back with its prior claims; trip
      `notFound()` on unknown id (review G1, G8; review-2 G-soft).
- [ ] Server Action error envelope: `{ ok, error }` typed return + UI
      Toaster surface (review-2 G-log); `useActionState` pending state.

## Phase 4 — Sharing, joining, claiming

- [ ] `ShareLink` (client) — copy `location.href`; UI copy noting the link is
      the access key.
- [ ] `JoinTripDialog` — name → `joinTrip` action; participant cookie;
      owner auto-added as participant at creation. **Visitor with a
      `bc_participant` cookie for a different trip is treated as new
      here** (cookie path scope; review-2 G-otherCookie). `joinTrip`
      rejects with a typed error when `participants.count(tripId) ≥ 50`
      (review-2 G-rate).
- [ ] `ItemRow` claim/unclaim with qty (default = shortfall); `claimItem` /
      `unclaimItem` actions guarded by `assertParticipant`.
- [ ] `StillNeeded` (shortfall list) + "Who's bringing what" (claims by
      participant).
- [ ] `RefreshPoller` + manual Refresh for near-real-time (D4).
- [ ] Verify per-person/per-tent quantities recompute as members join
      (sleeping bag/pad scale; stove/filter stay shared).

## Phase 5 — Polish & hardening

- [ ] Empty/loading/error states; `not-found` for trips; skeletons.
- [ ] a11y pass (keyboard, labels, contrast) — see chrome-devtools a11y skill.
- [ ] Optional `scripts/import-ridb.ts` (RIDB_API_KEY) backfilling the DB +
      `pnpm` script; documented, off by default.
- [ ] Build check: `next build` passes; `unstable_instant` validation green;
      no "uncached data outside Suspense" errors.
- [ ] Trip page `generateMetadata` returns `robots: { index:false,
      follow:false }` (review-2 G-robots).
- [ ] `next.config.ts` pins `experimental.serverActions.allowedOrigins` for
      production (review-2 G-csrf).
- [ ] README: run instructions, data-source/identity/liveness caveats
      (D1–D9).

## Definition of done (maps to the 6 requirements)

1. Search public campsites — Phase 1.
2. Pick style; amenity-aware list grouped by category — Phase 2.
3. Edit the list — Phase 3.
4. Select items, name trip, copy invite link — Phase 3 (name) + Phase 4.
5. Others open the link; see still-needed + who's bringing what — Phase 4.
6. Per-person items multiply with group size — Phase 2 (`scope`) verified
   Phase 4.

## Risks & mitigations

- **Persistence/deployment** → resolved by DR-6: Neon Postgres + Prisma
  works on Node/Vercel/Cloudflare; no single-node constraint; Prisma Migrate
  replaces ad-hoc DDL (closes the migration gap). Local = Docker Postgres
  (`local-dev.md`).
- **Cache Components Suspense errors** → keep all DB/cookie reads inside
  `<Suspense>` or `'use cache'`; lean on dev overlay + `unstable_instant`
  validation early, not at the end.
- **Non-deterministic ops in cached scope** → `crypto.randomUUID()`/token
  generation only in Server Actions; WS-8.3 audits `lib/ids.ts`/`randomUUID`
  are unreachable from any `'use cache'` scope (review B5).
- **Concurrent claims** → Postgres handles concurrency; atomic multi-writes
  via `prisma.$transaction([...])` (**array form only** — Neon HTTP driver
  does not support interactive callback transactions; review-2 G-tx);
  claim is a composite-id `upsert`; shortfall always recomputed, never
  stored (review G6 — no WAL/`busy_timeout` needed).
- **Concurrent owner edits (two devices)** → last-write-wins (D8); no
  version column in v1. Documented in UI copy.
- **Neon connection mgmt** → `PrismaClient` global singleton (dev
  hot-reload guard); pooled URL for queries, `DIRECT_URL` for migrations
  (serverless-safe via the Neon driver).
- **Catalog cache staleness** → importer/reseed (only when `BC_DEV_URL`
  is set — review-3 DR-57) pings dev-only `revalidate-campsites` Route
  Handler → `revalidateTag('campsites', { expire: 0 })` (immediate
  refresh, not the `'max'` stale-for-30-days profile — review-3 DR-50)
  otherwise restart refreshes catalog in v1 (review I-A).
- **Seed dataset realism** → explicit RIDB→`Amenities` mapping table +
  `bearRegions` list; best-effort accuracy stated in README; RIDB importer is
  the real-coverage path (review G5).
- **Trip link leakage** → unguessable ids + UI copy that the link grants
  access; acceptable for v1's no-account model (D3).
