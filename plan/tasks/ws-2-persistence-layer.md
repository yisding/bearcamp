# WS-2 — Persistence Layer (Prisma + Neon)

**Wave:** 2 (parallel) · **Critical path:** yes (data backbone — staff heavy)
**Depends on:** WS-0 types + `prisma/schema.prisma` + `StorageAdapter`
interface; **WS-3's `loadSeed()` + `data/campsites.seed.json` for the full
`prisma db seed` integration** (review-2 DR-16). WS-2's own DB tests use a
small WS-2-owned fixture so they don't block on WS-3.
**Start when:** WS-0 merged (full seed integration waits on WS-3)

**Owned paths:** `prisma/migrations/*`, `prisma/seed.ts`,
`docker-compose.yml`, `.env.example`, `lib/db/prisma.ts`,
`lib/db/{trips,participants,items,claims,campsites}.ts`,
`lib/db/storage.prisma.ts`, `lib/db/view.ts`, `lib/db/__tests__/*`.
**Do NOT edit:** `prisma/schema.prisma`, `lib/db/types.ts`,
`lib/db/storage.ts` (the interface), `lib/db/storage.memory.ts` — all
WS-0-owned contracts.

> Implements the WS-0 async `StorageAdapter` with **Prisma on Neon
> Postgres**. Repositories map Prisma rows → domain DTOs so `@prisma/client`
> never leaks past `lib/db/*`. Other streams use the WS-0 in-memory fake
> until WS-8 flips the seam. See `../local-dev.md`.

## Tasks

- [ ] **WS-2.1** Local DB + env — `docker-compose.yml` (`postgres:16`, named
  volume, `bearcamp/bearcamp`), `.env.example` (`DATABASE_URL`,
  `DIRECT_URL`). **DoD:** `docker compose up -d` gives a reachable Postgres;
  `.env` gitignored, example committed.
- [ ] **WS-2.2** Prisma client — `lib/db/prisma.ts`: `PrismaClient` with
  `@prisma/adapter-neon` (`@neondatabase/serverless`); **global singleton**
  guarded for Next dev hot-reload; pooled URL for queries, `DIRECT_URL` for
  migrations. **DoD:** one client per process; no connection-pool
  exhaustion in dev.
- [ ] **WS-2.3** Migrations — generate the initial Prisma migration from
  the WS-0 `schema.prisma`; a follow-up migration runs:
  ```sql
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS campsite_name_trgm_idx
    ON "Campsite" USING GIN ("name" gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS campsite_description_trgm_idx
    ON "Campsite" USING GIN ("description" gin_trgm_ops);
  ALTER TABLE "Trip"
    ADD CONSTRAINT trip_tent_capacity_check
    CHECK ("tentCapacity" BETWEEN 1 AND 12);
  ```
  The `gin_trgm_ops` operator class is **required** for `Prisma.contains`
  (`ILIKE %q%`) to actually hit the index — without it the planner falls
  back to a sequential scan (review-2 DR-11). The `CHECK` constraint
  enforces `tentCapacity` bounds at the DB layer so direct repo writes
  cannot bypass `lib/validation/actions.ts` (review-3 DR-54). **DoD:**
  `prisma migrate deploy` builds the full schema on an empty DB
  including the extension + indexes + check; `prisma migrate dev` works
  locally; `EXPLAIN` on a `contains` query shows index usage (T2.2b);
  inserting `tentCapacity=13` is rejected by Postgres (T2.3b).
- [ ] **WS-2.4** Campsites repo — `campsites.ts`: `upsertMany`, `getById`,
  `search(args)` — `contains` + `mode:'insensitive'` over name/description,
  equality on `state`/`agency`, amenities-JSON filters, pagination
  (`pageSize` default 20, **max-capped at 50 server-side regardless of
  input** — review-2 DR-23); similarity ranking via `$queryRaw` when
  needed. **DoD:** filter & paginate correct on a seeded DB; a `pageSize:
  500` request returns ≤50 rows.
- [ ] **WS-2.5** Trips repo — `trips.ts`: `create(input)` (stores
  `campsiteSnapshot` JSON, sets `tentCapacity` from input or default 2),
  `getById`, `rename`, **`updateSettings(id, { tentCapacity? })`**
  (review-2 DR-21), **`delete(id)`** (hard-delete; cascade via Prisma
  relations — DR-20). **DoD:** round-trips; snapshot frozen at creation;
  `delete` removes items/participants/claims atomically.
- [ ] **WS-2.6** Items repo — `items.ts`: `listByTrip` (returns visible
  items only by default; pass `{ includeRemoved: true }` for the "no
  longer needed" section — review-2 DR-19), `add`, `update(id, patch)`
  (patch restricted to `name|category|scope|baseQty|unit|note` — review
  G1), `softRemove` (`removed=true`), **`restore(id)`**
  (`removed=false` — DR-19), `reorder(tripId, itemId, { beforeItemId?,
  newIndex? })`. **DoD:** soft-remove hides item but preserves its
  claims; restore re-shows it with claims intact; `update` rejects
  non-editable fields.
- [ ] **WS-2.7** Participants repo — `participants.ts`: `listByTrip`,
  `add(tripId,name,isOwner)` — **rejects with a typed
  `participant_cap_reached` error when `count(tripId) ≥ 50`** (review-2
  DR-24); `byToken(tripId,token)` (uses the `[tripId, token]` index — DR-22);
  `count(tripId)`. **DoD:** creator row has `isOwner=true`; the 51st add
  throws.
- [ ] **WS-2.8** Claims repo — `claims.ts`: `listByTrip`,
  `upsert(itemId,participantId,qty)` (composite id `@@id([itemId,
  participantId])`), `remove(itemId,participantId)`. **DoD:** re-claim
  updates qty (no dup row); remove deletes it.
- [ ] **WS-2.9** Trip view — `view.ts`: `buildTripView(tripId)` joins
  trip+items+participants+claims in **one Prisma nested read** (single
  Neon round-trip, not N queries — review-2 G-roundtrip); computes
  `needed` (`requiredQty(item, participantCount, trip.tentCapacity)`),
  `claimed` (Σ), `shortfall`; groups claims by participant. Splits items
  into `visibleItems` (`removed=false`) and `removedItemsWithClaims`
  (`removed=true AND claims.length > 0`) — review-2 DR-19. Returns the
  trip's frozen `campsiteSnapshot` for the header, **not the live
  Campsite row** (DR-33). **Returns `null` for an unknown `tripId`**
  (review G8). **DoD:** matches `TripView` + `../packing-engine.md`;
  solo creator → `participantCount===1`, per_person needed = 1 (review
  B6); `tentCapacity=6` collapses per_tent shortfall.
- [ ] **WS-2.10** Storage adapter — `storage.prisma.ts`: implement the
  WS-0 async `StorageAdapter` over the repos; atomic multi-writes
  (`createTrip` = trip + items + owner participant) via **array-form**
  `prisma.$transaction([...])` only — the Neon **HTTP** driver does not
  support interactive callback transactions (review-2 DR-10); map Prisma
  enums ↔ DTO `ItemCategory` display values. **DoD:** satisfies the
  interface; swappable with the in-memory fake; no `$transaction(async
  (tx) => …)` calls anywhere.
- [ ] **WS-2.11** Seed — `prisma/seed.ts` (wired as `prisma db seed`):
  consumes WS-3's `loadSeed()` (which reads + validates
  `data/campsites.seed.json`) and upserts when `Campsite` is empty;
  idempotent. WS-3 is a hard dep for the *full* integration; WS-2's own
  unit tests use a `prisma/seed.test-fixture.ts` mini-fixture so they
  don't block on WS-3 (review-2 DR-16). **After write, optionally pings
  the dev `revalidate-campsites` Route Handler only if `BC_DEV_URL` env
  is set** (i.e. the dev server is running); else logs a one-line hint
  *"dev server not running; restart to refresh catalog"* (review-3
  DR-57 — `prisma db seed` is a CLI script and the Next runtime may not
  be listening). The handler itself calls `revalidateTag('campsites',
  { expire: 0 })` for immediate refresh (review-3 DR-50). **DoD:**
  `pnpm prisma db seed` populates; reseed = same count; with
  `BC_DEV_URL` unset, the script succeeds without trying to ping.
- [ ] **WS-2.12** DB tests — `__tests__/`: **ephemeral Postgres**
  (Testcontainers `postgres:16`, `prisma migrate deploy` per run); cover
  every repo; `buildTripView` multiplier scaling as participants are
  added (sleeping bag/pad grow, stove/filter constant); concurrent claim
  upsert; cascade delete; soft-remove + claims integrity; item edit
  recompute; **restore** brings item back with claims intact (DR-19);
  **`participants.add` rejects the 51st add** (DR-24);
  **`updateSettings({ tentCapacity: 6 })` changes per_tent shortfall**
  (DR-21); **`delete(tripId)` removes all descendants** (DR-20).
  **DoD:** suite green against real Postgres.

- [ ] **WS-2.13** Register backend — export a `prisma` factory consumable
  by `services.ts` under `BEARCAMP_BACKEND=prisma`; document the line
  WS-8 enables. **DoD:** WS-8 enables the real DB by env flag only.
- [ ] **WS-2.14** Snapshot test — assert `campsiteSnapshot` is the
  render source: create a trip, mutate the live `Campsite` row's
  amenities, rebuild the view → header amenities reflect the snapshot,
  not the mutation (review-2 DR-33). **DoD:** test green.

## Acceptance criteria — write these tests first (red → green)

vitest; ephemeral Postgres per run (Testcontainers); `lib/db/__tests__/`.
Author first.

- [ ] **T2.1** migrate — `prisma migrate deploy` builds the full schema +
  `pg_trgm` extension + GIN trigram indexes with `gin_trgm_ops` + the
  `trip_tent_capacity_check` constraint on an empty DB; reapply is a
  no-op (review-2 DR-11; review-3 DR-54). _(WS-2.3)_
- [ ] **T2.2** campsites repo — `upsertMany` then `search` filters by
  q/state/agency/amenities + pagination (incl. `pageSize` clamped to 50 —
  DR-23); `getById`. _(WS-2.4)_
- [ ] **T2.2b** trigram index hit — `EXPLAIN` (raw SQL) on a `contains`
  query shows the GIN index in use, not a `Seq Scan` (review-2 DR-11).
  _(WS-2.3/2.4)_
- [ ] **T2.3** trips — `create` freezes `campsiteSnapshot`; `getById`;
  `rename`; `updateSettings({ tentCapacity: 6 })` persists (DR-21);
  `delete(id)` cascades items/participants/claims (DR-20). _(WS-2.5)_
- [ ] **T2.4** items — add/list/update; `softRemove` hides but row +
  claims preserved; **`restore(id)` flips `removed=false`, claims still
  resolve** (DR-19); reorder; non-editable fields rejected. _(WS-2.6)_
- [ ] **T2.5** participants — creator `isOwner=true`; `byToken`; `count`;
  **`add` throws `participant_cap_reached` at the 51st** (review-2
  DR-24). _(WS-2.7)_
- [ ] **T2.6** claims — `upsert` composite-id dedupe (qty updated, no dup
  row); `remove`. _(WS-2.8)_
- [ ] **T2.7** `buildTripView` — needed/claimed/shortfall per scope;
  removed excluded from main list but surface under
  `removedItemsWithClaims` when claims exist (DR-19); grouped by
  participant; unknown `tripId` → `null` (G8); solo creator →
  `participantCount===1`, per_person needed = 1 (B6); **`tentCapacity=6,
  n=6` → per_tent needed = 1** (DR-21); **header amenities come from
  `campsiteSnapshot`, not the live row** (DR-33). _(WS-2.9/2.14)_
- [ ] **T2.8** scaling (headline) — adding participants grows `per_person`
  needed (sleeping bag/pad); `shared` constant. _(WS-2.9)_
- [ ] **T2.9** cascade — deleting a `Trip` removes its
  items/participants/claims (Prisma `onDelete: Cascade`). _(schema)_
- [ ] **T2.10** atomic createTrip — trip + items + owner participant
  commit in one **array-form** `$transaction([...])`; failure rolls back
  all; **no interactive `$transaction(async (tx)=>...)` calls in the
  codebase** (grep-guard, review-2 DR-10). _(WS-2.10)_
- [ ] **T2.11** item edit — changing `baseQty`/`scope` recomputes
  `requiredQty` in the next `buildTripView`; rename persists (review G1).
  _(WS-2.6/2.9)_
- [ ] **T2.12** contract — `storageContract(prismaFactory)` (WS-0.15)
  green with **zero** suite edits (same suite the in-memory fake passes).
  _(WS-2.10)_
- [ ] **T2.13** ownerToken unique — inserting a `Trip` with a duplicate
  `ownerToken` raises a unique-violation error (review-2 DR-22).
  _(schema)_
- [ ] **T2.14** campsiteSnapshot is render-source — create a trip,
  mutate the live `Campsite` row's amenities, rebuild the view;
  header amenities reflect the snapshot, not the mutation (review-2
  DR-33). _(WS-2.14)_
- [ ] **T2.15** tentCapacity DB bound — direct Prisma insert with
  `tentCapacity: 0` or `tentCapacity: 13` is rejected by Postgres with
  a CHECK-constraint violation (review-3 DR-54). _(WS-2.3)_
- [ ] **T2.16** last-write-wins — two sequential `items.update(id,
  patch)` calls converge: the second `name` value persists, neither
  errors, no `version` column exists (review-3 DR-58 closes the
  documented-but-untested D8 concurrency policy). _(WS-2.6)_

## Seams you participate in

- **I-4** (producer): in-memory fake → Prisma/Neon. WS-8.1 flips
  `services.ts` via `BEARCAMP_BACKEND`; you only provide the factory. No
  other stream edits your files; `schema.prisma` is WS-0's.
