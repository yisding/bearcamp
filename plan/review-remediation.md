# Review Remediation

Records the decisions and fixes applied after the plan review. Each row traces
to a review finding ID (B = blocking, I = inconsistency, G = gap, M = minor).

## Decisions taken (the "decide defaults" choices)

- **DR-1 — Packing module ownership (B1, B2).** `lib/packing/index.ts` **and**
  `lib/packing/quantities.ts` are **WS-0's, permanently**. WS-1 owns only
  `templates.ts`, `rules.ts`, `generate.ts`, and `lib/packing/__tests__/*`.
  WS-1.2 is demoted to *verify, do not edit* `quantities.ts`. WS-0.14 freezes
  the module's concrete export surface (`generate`, `requiredQty`,
  `TENT_CAPACITY`) and a test asserts the symbol set is unchanged after WS-1.
- **DR-2 — Storage engine (G4).** ~~Default engine is Node's built-in
  `node:sqlite`.~~ **Superseded by DR-6.**
- **DR-6 — Persistence pivot to Neon + Prisma (supersedes DR-2; folds G4,
  G6, deployment, the migration gap).** Persistence is **Neon serverless
  Postgres via Prisma** (`@prisma/client` + `@prisma/adapter-neon`).
  `prisma/schema.prisma` is the WS-0-owned schema contract; WS-2 owns
  migrations (`prisma migrate`), seed (`prisma db seed`), the Prisma client,
  and `docker-compose.yml`. The `StorageAdapter` interface becomes **fully
  async** (correct for Prisma and any network DB); `@prisma/client` is
  confined to `lib/db/*` via Prisma-free DTOs. **Local dev** = Docker
  Compose Postgres (or a Neon dev branch); **tests** = ephemeral Postgres
  (Testcontainers) with the unchanged `storageContract`. *Why:* Neon's
  HTTP/WebSocket driver runs on Node, **Vercel**, and Cloudflare — removing
  the single-node/serverless deployment blocker entirely — and Prisma
  Migrate replaces ad-hoc DDL (closes the migration gap). Concurrency is
  Postgres-native (no WAL/`busy_timeout`/retry needed — G6 moot). New doc
  `local-dev.md`. Ids: `nanoid` dropped (Prisma `cuid()` for item/
  participant ids); trip slug `crypto.randomUUID()`; tokens ≥128-bit.
- **DR-3 — List editing is real and tested (G1, req 3).** Owner-editable item
  fields: **`name`, `category`, `scope`, `baseQty`, `unit`, `note`**. Changing
  `scope`/`baseQty` recomputes `requiredQty`. Validated in
  `lib/validation/actions.ts`; covered by new acceptance tests in WS-6/WS-7.
- **DR-4 — "Select what I'll bring" == owner's claims (G2).** The creator is
  auto-joined as participant #1 at `createTrip`; pre-share selections are
  ordinary claims that persist into the shared trip. Distinct cookie names
  `bc_owner` / `bc_participant` so creator is owner *and* participant with no
  collision (B6).
- **DR-5 — Catalog cache invalidation (I-A; superseded by DR-8 for the
  arg form).** Campsite detail pins `cacheLife('days')`; search uses
  `cacheLife('hours')`; both tagged `campsites`. A dev-only Route
  Handler `app/api/revalidate-campsites/route.ts` calls
  **`revalidateTag('campsites', 'max')`** (DR-8 — the single-arg form is
  deprecated in Next 16). Route Handlers may call `revalidateTag` per
  installed docs; importer/reseed pings it. Documented limitation:
  outside that, catalog refresh needs a restart in v1.

## Fix traceability

| Review ID | Fix | Files touched |
|---|---|---|
| **B1** dual owner `quantities.ts` | DR-1: WS-0 sole owner; WS-1 owned-paths drop it; WS-1.2 → verify-only | `workstreams.md`, `tasks/ws-0`, `tasks/ws-1` |
| **B2** `index.ts` export surface unfrozen | WS-0.14 enumerates frozen exports; WS-1.6 asserts unchanged symbol set; new T0 export-surface test | `tasks/ws-0`, `tasks/ws-1` |
| **B3** disjointness overstated | Reword: disjoint *within a wave*; `services.ts`/`next.config.ts` are WS-0→WS-8 wave-handoff files | `workstreams.md`, `tasks/ws-8` |
| **B4** `lib/validation` layout contradiction | Standardize on `lib/validation/{domain,actions}.ts`; fix route map + milestones | `architecture.md`, `milestones.md` |
| **B5** non-deterministic IDs vs Cache Components | Note IDs run only in Server Actions; WS-8.3 sub-audit that ids/`randomUUID`/`Date.now`/`Math.random` are unreachable from any `'use cache'` scope | `README.md`, `architecture.md`, `tasks/ws-8` |
| **B6** owner/participant cookie collision; solo-creator math | Distinct `bc_owner`/`bc_participant`; acceptance test n=1 owner counted | `README.md`, `data-model.md`, `tasks/ws-2`, `tasks/ws-7` |
| **I-A** catalog cache stale | DR-5: pin detail `cacheLife('days')`; dev revalidate route; importer hook | `architecture.md`, `tasks/ws-3`, `tasks/ws-5` |
| **I-B** WS-8.4 config wording | Reword: `unstable_instant` is a route export, not config | `tasks/ws-8` |
| **I-C** claim action shape vs participantId | WS-0.8 freezes: join/claim/unclaim inputs exclude participantId/token (server resolves from cookie) | `architecture.md`, `tasks/ws-0` |
| **I-D** `lib/utils.ts` unowned | Assigned to WS-4 (pre-exists; WS-4 owns regen) | `workstreams.md`, `tasks/ws-4` |
| **G1** edit list under-spec/untested | DR-3: editable-field set + validation + recompute tests | `data-model.md`, `tasks/ws-6`, `tasks/ws-7` |
| **G2** "select to bring" undecided | DR-4 design note | `README.md`, `tasks/ws-7` |
| **G3** poller vs Activity state | WS-6.10 reads `preserving-ui-state` guide; test refresh doesn't clobber open input | `tasks/ws-6` |
| **G4** SQLite native-build risk | **DR-6** (supersedes DR-2): Neon + Prisma — no native dep, no single-node limit, works on Vercel/Cloudflare | `README.md`, `data-model.md`, `architecture.md`, `milestones.md`, `workstreams.md`, `local-dev.md`, `tasks/ws-0`, `tasks/ws-2`, `tasks/ws-3`, `tasks/ws-8`, `tasks/README` |
| **G5** seed realism hand-waved | DR-7 accuracy caveat (README D1 paragraph); RIDB→Amenities mapping table + `bearRegions` deliverables | `README.md`, `tasks/ws-3` |
| **G6** write contention | Moot under DR-6 — Postgres handles concurrency; atomic multi-writes via `prisma.$transaction` | `data-model.md`, `tasks/ws-2` |
| **DR-6** persistence pivot | Neon + Prisma; async `StorageAdapter`; local Docker dev; deployment resolved (Vercel/Cloudflare/Node) | all core docs + `local-dev.md` (new) |
| **G7** token entropy | `token()` ≥128-bit; T0.4 length assertion | `README.md`, `tasks/ws-0` |
| **G8** empty/not-found coverage | Zero-results test; trip `notFound()` in WS-6.2 | `tasks/ws-5`, `tasks/ws-6` |
| **M** `items.reorder` arg list unpinned | Pin signature in data model + WS-0.4/0.8 | `data-model.md`, `tasks/ws-0` |
| **M** `api/health` orphan | Reassigned to WS-8 (kept optional) | `architecture.md`, `tasks/ws-8` |

Items the review explicitly validated as **already correct** (no change):
`unstable_instant` static/`false` semantics, async `params`/`searchParams`,
`'use cache'` not in Route Handler bodies, shared contract suites (WS-0.15)
wiring, consistent test frameworks.

> ~~`updateTag` vs `revalidateTag` placement~~ — partially correct: the
> *callable-from* placement (Server-Actions-only vs Server-Actions +
> Route-Handlers) is right, but the single-arg `revalidateTag(tag)` form
> referenced throughout was deprecated in Next 16. Fixed in **DR-8**
> below; all sites switched to `revalidateTag(tag, 'max')`.

## Review-2 (post-pivot review) — additional decisions

A second review (`review-2`) ran against the post-DR-6 plan + the
installed Next.js 16.2.6 docs + a gap analysis. Findings landed as the
DRs below; the `G-*` slugs are used inline throughout the plan as
traceability anchors.

- **DR-7 — Seed accuracy caveat formalized (G5 finish).** Promotes the
  README D1 paragraph to an explicit decision: the seed dataset is
  best-effort, not authoritative; full coverage is the opt-in RIDB import
  path. No code change beyond keeping the wording in `README.md`.
- **DR-8 — `revalidateTag` two-arg form everywhere (G-revalidate).** Every
  callsite (`architecture.md` caching table, DR-5, WS-3.3b,
  `data-model.md` repository note) uses `revalidateTag(tag, 'max')`. The
  single-arg overload is deprecated.
- **DR-9 — Refresh API disambiguated (G-refresh).** `next/cache#refresh` is
  Server-Actions only and we don't use it. The `RefreshPoller` client
  component uses `useRouter().refresh()` from `next/navigation`. The
  conflated sentence in `architecture.md` is fixed.
- **DR-10 — Neon HTTP driver tx constraint (G-tx).** All
  `prisma.$transaction([...])` calls use the **array form** because the
  Neon HTTP driver doesn't support interactive callback transactions.
  Documented in `architecture.md`, `data-model.md`, `local-dev.md`,
  `milestones.md` risks, and WS-2.10.
- **DR-11 — `pg_trgm` extension + `gin_trgm_ops` (G-trgm).** The first
  Prisma migration runs `CREATE EXTENSION IF NOT EXISTS pg_trgm;` and
  creates GIN trigram indexes with `gin_trgm_ops` so `ILIKE`/`contains`
  can actually use them. Pinned in WS-2.3.
- **DR-12 — Seam files in WS-8's owned paths get a temporal-handoff
  qualifier (G-seam).** `next.config.ts` and `lib/services.ts` appear in
  both WS-0 and WS-8 owned-paths with explicit "Wave-1→Wave-3 handoff"
  language. WS-1→WS-0's stub `generate.ts` is also called out as a
  temporal handoff. `workstreams.md` now has a Temporal-handoff table.
- **DR-13 — `is_owner=1` / `removed=0` SQLite-era relics purged
  (G-relic).** Replaced with the Prisma boolean shape (`isOwner=true`,
  `removed=false`) in `architecture.md` and `packing-engine.md`.
- **DR-14 — Stale "seed-into-DB on startup" wording fixed (G-stale).**
  `milestones.md` Phase 1 now points to `prisma db seed` (WS-2.11). The
  startup mechanism never existed under DR-6.
- **DR-15 — Mock identity helper for WS-6 pre-WS-7 work (G-mockId).**
  WS-0 ships `lib/trips/identity.stub.ts` that uses the real Next
  `cookies()` API but resolves participants against in-memory storage.
  WS-6 can render the trip page (which calls `await cookies()`) without
  blocking on WS-7. WS-8.2 swaps imports to the real `identity.ts` at
  integration.
- **DR-16 — WS-2 depends on WS-3 for full seed integration (G-seedDep).**
  WS-2.11's `prisma db seed` consumes WS-3's `data/campsites.seed.json`
  and `loadSeed()`. WS-2's "Depends on" row mentions it; WS-2 ships a
  small WS-2-owned mini-fixture for its own DB tests so DB tests don't
  block on WS-3.
- **DR-17 — Trip URLs are non-indexable (G-robots).** `/trips/<id>`
  exports `generateMetadata` returning
  `{ robots: { index: false, follow: false } }`. Trip URLs are
  capability tokens — they must not appear in search engines.
- **DR-18 — Server Actions CSRF origin pin (G-csrf).** Production
  `next.config.ts` sets `experimental.serverActions.allowedOrigins` to
  the deployment host. WS-8.3c audits this.
- **DR-19 — Soft-delete on items has a real lifecycle (G-soft).**
  Schema's `removed Boolean` is a real soft-delete; `restoreItem`
  (owner-only) flips it back; "No longer needed (claimed)" section
  surfaces claims on removed items so participants aren't confused.
  Listed in README D9.
- **DR-20 — `deleteTrip` is a v1 action (G-delete).** Owner-only
  hard-delete, cascades via Prisma relations, `redirect('/')` on
  success. No auto-expiry; documented retention policy in README D7.
- **DR-21 — Per-trip `tentCapacity` (G-tent).** `Trip.tentCapacity Int
  @default(2)`; `requiredQty` reads from the trip, not a module
  constant. Owner edits via `updateTripSettings`. A 6-person tent
  group sets it to 6.
- **DR-22 — `ownerToken @unique` + `Participant` token index
  (G-index).** Belt-and-braces DB constraints around capability tokens.
- **DR-23 — `SearchArgs.pageSize` defaults 20, max 50 (G-page).**
  Prevents accidental "return everything" once RIDB import lands 100k
  rows.
- **DR-24 — Participant cap per trip = 50 (G-rate).** `joinTrip` returns
  a typed error once full; per-cookie token-bucket rate-limiting is v2.
- **DR-25 — Last-write-wins documented (G-concurrency).** No `version`
  column in v1; owner-double-edit races are last-write-wins; documented
  in UI copy + README D8.
- **DR-26 — Owner recovery is non-recoverable in v1 (G-owner).** Clear
  the `bc_owner` cookie → trip is lost from this browser. README D8 +
  warning UI copy at creation; v2 may add a "download owner token"
  affordance.
- **DR-27 — Trip slug stays 36-char UUID for v1 (G-slug).** Decision
  recorded; shortening to 22-char base64url is deferred (low value
  per ROI).
- **DR-28 — Action error envelope `Result<T>` + structured-log on
  failure (G-log).** Every Server Action returns
  `{ ok: true; data } | { ok: false; error }`; failure path emits one
  `console.error('[bc.action]', {…})` line; UI surfaces errors via
  Toaster. No external telemetry in v1.
- **DR-29 — Refresh poller cadence 15 s, paused when hidden
  (G-poller).** Conservative cadence to keep Neon load tiny; manual
  refresh affordance unchanged.
- **DR-30 — `Campsite.id` source-prefix scheme pinned (G-prefix).**
  `seed:` / `fixture:` / `ridb:` / `osm:` — never bare. Listed in
  `data-model.md` and README D6.
- **DR-31 — `Campsite.state` is a validated 2-char US code (G-state).**
  Zod adds a regex; DTO doc-comment notes it.
- **DR-32 — Prisma `driverAdapters` preview flag is version-dependent
  (G-prisma).** WS-0.1 pins the Prisma version; WS-0.2b drops the
  `previewFeatures = ["driverAdapters"]` line if Prisma 6.x is selected
  (GA in 6.x).
- **DR-33 — `campsiteSnapshot` test required (G-snap).** WS-2 adds
  T2.14: mutate the live `Campsite` row after `createTrip`, assert the
  trip view still shows snapshot amenities.
- **DR-34 — Cross-trip cookie mismatch is rejected (G-cross).**
  Belt-and-braces server-side check + T7.8 extended: a `bc_owner` cookie
  for trip A cannot mutate trip B even if the path scope is bypassed.
- **DR-35 — Visitor with `bc_participant` for a different trip
  (G-otherCookie).** Cookie path scoping makes this physically
  unreachable in the browser, but a test asserts the visitor sees the
  Join dialog on a new trip.
- **DR-36 — `app/api/*` ownership rule (G-api).** Per-file ownership
  declared in `workstreams.md`; future API routes get an owned-paths
  entry on the originating stream.
- **DR-37 — Over-claim display contract (G-overclaim).** Over-claim
  (`claimed > needed`) is allowed and renders
  `"claimed of needed — covered (extra)"`. `shortfall =
  max(0, needed − claimed)` so it never goes negative. T6.3b asserts
  the display string.
- **DR-38 — `buildTripView` is one Neon round-trip (G-roundtrip).**
  `buildTripView` uses one Prisma nested include, not N sequential
  queries. Documented in `tasks/ws-2-persistence-layer.md` WS-2.9.

## Review-3 (post-patch review) — fixes for bugs introduced by review-2 patches

A third review (`review-3`) ran against the patched plan and the
installed Next.js 16.2.6 docs. The patches that addressed review-2
introduced three real bugs (cookie API misuse, redirect-swallowed-by-
envelope, vitest-can't-call-`cookies()`) plus a batch of consistency
and coverage gaps. DR-39…DR-58 land those fixes.

- **DR-39 — `lib/trips/result.ts` moves to WS-0 (G-resultOwn).** Every
  WS-6 consumer needs `Result<T>` + `ErrorCode` pre-WS-7. Listed in
  WS-0.8b owned-paths + WS-7's owned-paths drops it. T0.14 freezes the
  symbol set.
- **DR-40 — Cookie clearing uses `set(name, '', { path, maxAge: 0 })`,
  NOT `delete(name)` (G-cookieDel).** Per `cookies.md`,
  `cookies().delete(name)` is single-arg and ignores the `path`
  attribute — it would leave path-scoped cookies alive. WS-7.1 +
  WS-7.4c + the architecture observability section pin the correct
  API; WS-8.3 T8.4 adds a grep guard that `cookies().delete()` is not
  used anywhere.
- **DR-41 — `identity.stub.ts` is a test-mode helper, not a runtime
  stub (G-stubMock).** `next/headers#cookies()` requires a Next request
  scope that vitest does not provide. WS-0.12b switches to a
  `vi.mock('next/headers')` pattern in vitest; Playwright tests use the
  real cookie jar via `playwrightCtx.addCookies(...)`. T0.13 rewritten.
- **DR-42 — `cookies()` is async — every call begins with `await`
  (G-asyncCookies).** Pinned in WS-7.1, architecture observability,
  WS-0.12b. `cookies.md` line 6.
- **DR-43 — `lib/limits.ts` is the single source of truth for magic
  numbers (G-limits).** `PARTICIPANT_CAP_PER_TRIP=50`,
  `TENT_CAPACITY_MIN=1`, `TENT_CAPACITY_MAX=12`,
  `SEARCH_PAGE_SIZE_DEFAULT=20`, `SEARCH_PAGE_SIZE_MAX=50`. WS-0.8c
  owns; T0.15 + WS-8.3e grep-guard assert no literal restatements.
- **DR-44 — `ErrorCode` is a closed 5-code union (G-errCode).**
  `'unauthorized' | 'not_found' | 'validation_failed' |
  'participant_cap_reached' | 'internal'`. Lives in
  `lib/trips/result.ts` (DR-39); T0.14 enforces the union.
- **DR-45 — `redirect()` / `notFound()` are framework errors and must
  not be caught by the action envelope (G-redirectThrow).** Per
  `redirect.md` and `unstable_rethrow.md`: either call them outside
  the try/catch (Form A) or call `unstable_rethrow(err)` first in the
  catch (Form B). WS-7.8 publishes both templates; WS-7.4c
  (`deleteTrip`) and WS-7.3 (`createTrip`) use Form A; mutation
  actions without redirect use Form B. T7.8 + T7.4c assert the
  redirect actually fires (response, not envelope).
- **DR-46 — Canonical cap-toast string lives in WS-7.6 (G-capStr).**
  `"This trip is full (50 people)."` — with period. WS-6/T6.4
  reference WS-7.6 verbatim; the UI uses `error.message` from the
  envelope, not a hardcoded string.
- **DR-47 — Unified not-found copy covers unknown + deleted
  (G-deletedUX).** `app/trips/[tripId]/not-found.tsx` reads *"This
  trip doesn't exist, or the owner deleted it."* — v1 does not
  distinguish (no tombstone). Documented in README D7 + WS-6.11.
- **DR-48 — ShareLink owner-recovery warning copy is tested
  (G-shareWarn).** T6.5 asserts the DOM contains the warning phrase;
  closes the polish-pass drift risk on DR-26.
- **DR-49 — `restoreItem` with-recomputed-shortfall test
  (G-restoreRecompute).** T6.14 covers: remove a `per_person` item
  with claims, more participants join, restore → shortfall reflects
  the new participant count.
- **DR-50 — Dev `revalidate-campsites` route uses
  `revalidateTag(tag, { expire: 0 })`, not `'max'` (G-revalExpire).**
  `'max'` is `stale 5min / revalidate 30 days` per `cacheLife.md` —
  wrong semantics for an immediate-refresh dev importer.
  `{ expire: 0 }` is the options form for "expire now."
- **DR-51 — `X-Robots-Tag: noindex, nofollow` header on `/trips/:tripId*`
  (G-robotsHdr).** Belt-and-braces beyond the `<meta>` tag — survives
  CDN configs that strip head metas. Configured in `next.config.ts`
  `headers()`; WS-8.3d owns; T8.6 asserts both meta and header.
- **DR-52 — `generateMetadata` for `/trips/[tripId]` stays static
  (G-metaStatic).** No `cookies()`, no DB reads — otherwise the
  DynamicMarker pattern from `generate-metadata.md` would apply.
  WS-8.3f static-import-graph audit.
- **DR-53 — `Trip.ownerToken @unique` is belt-and-braces, not a query
  index (G-ownerUnique).** Documented in `data-model.md`. Owner
  lookup is by `Trip.id` + cookie compare, which uses the primary
  key, not the unique constraint.
- **DR-54 — DB CHECK constraint enforces `tentCapacity ∈ [1, 12]`
  (G-tentDB).** Migration adds
  `trip_tent_capacity_check`; schema uses `@db.SmallInt`. T2.15
  asserts direct repo inserts of 0 or 13 fail at the DB layer.
- **DR-55 — Drop the redundant `@@index([tripId])` on Participant
  (G-dupIdx).** The composite `@@index([tripId, token])` already
  covers tripId-only filters via Postgres left-prefix matching.
- **DR-56 — Action name is `updateTripSettings`, not `updateTrip`
  (G-actionName).** Fixes a stale name in `data-model.md`.
- **DR-57 — `prisma db seed` only pings the dev revalidate route when
  `BC_DEV_URL` is set (G-seedPing).** Otherwise (the common case for
  CLI/CI runs) it logs a hint that a restart will refresh the
  catalog.
- **DR-58 — Last-write-wins concurrency test (G-lwwTest).** T2.16
  exercises two sequential `items.update` calls: the second persists,
  neither errors, no version column. Closes the documented-but-
  untested D8 policy.
