# WS-2 — Persistence Layer (Prisma + Neon)

**Wave:** 2 (parallel) · **Critical path:** yes (data backbone — staff heavy)
**Depends on:** WS-0 types + `prisma/schema.prisma` + `StorageAdapter`
interface · **Start when:** WS-0 merged

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
- [ ] **WS-2.3** Migrations — generate the initial Prisma migration from the
  WS-0 `schema.prisma`; a follow-up migration enables `pg_trgm` and adds GIN
  trigram indexes on `Campsite.name`/`description` (raw SQL in the
  migration). **DoD:** `prisma migrate deploy` builds the full schema on an
  empty DB; `prisma migrate dev` works locally.
- [ ] **WS-2.4** Campsites repo — `campsites.ts`: `upsertMany`, `getById`,
  `search(args)` — `contains` + `mode:'insensitive'` over name/description,
  equality on `state`/`agency`, amenities-JSON filters, pagination;
  similarity ranking via `$queryRaw` when needed. **DoD:** filter & paginate
  correct on a seeded DB.
- [ ] **WS-2.5** Trips repo — `trips.ts`: `create(input)` (stores
  `campsiteSnapshot` JSON), `getById`, `rename`. **DoD:** round-trips;
  snapshot frozen at creation.
- [ ] **WS-2.6** Items repo — `items.ts`: `listByTrip`, `add`,
  `update(id, patch)` (patch restricted to
  `name|category|scope|baseQty|unit|note` — review G1), `softRemove`
  (`removed=true`), `reorder(tripId, itemId, { beforeItemId?, newIndex? })`.
  **DoD:** soft-remove hides item but preserves its claims; `update` rejects
  non-editable fields.
- [ ] **WS-2.7** Participants repo — `participants.ts`: `listByTrip`,
  `add(tripId,name,isOwner)`, `byToken(tripId,token)`, `count(tripId)`.
  **DoD:** creator row has `isOwner=true`.
- [ ] **WS-2.8** Claims repo — `claims.ts`: `listByTrip`,
  `upsert(itemId,participantId,qty)` (composite id `@@id([itemId,
  participantId])`), `remove(itemId,participantId)`. **DoD:** re-claim
  updates qty (no dup row); remove deletes it.
- [ ] **WS-2.9** Trip view — `view.ts`: `buildTripView(tripId)` joins
  trip+items(not removed)+participants+claims (Prisma nested read or one
  `$transaction`); computes `needed` (`requiredQty(item, participantCount)`),
  `claimed` (Σ), `shortfall`; groups claims by participant. **Returns `null`
  for an unknown `tripId`** (review G8). **DoD:** matches `TripView` +
  `../packing-engine.md`; solo creator → `participantCount===1`,
  per_person needed = 1 (review B6).
- [ ] **WS-2.10** Storage adapter — `storage.prisma.ts`: implement the WS-0
  async `StorageAdapter` over the repos; atomic multi-writes
  (`createTrip` = trip + items + owner participant) via
  `prisma.$transaction([...])`; map Prisma enums ↔ DTO `ItemCategory`
  display values. **DoD:** satisfies the interface; swappable with the
  in-memory fake.
- [ ] **WS-2.11** Seed — `prisma/seed.ts` (wired as `prisma db seed`):
  validates + upserts `data/campsites.seed.json` (WS-3) when `Campsite` is
  empty; idempotent. **DoD:** `pnpm prisma db seed` populates; reseed = same
  count.
- [ ] **WS-2.12** DB tests — `__tests__/`: **ephemeral Postgres**
  (Testcontainers `postgres:16`, `prisma migrate deploy` per run); cover
  every repo; `buildTripView` multiplier scaling as participants are added
  (sleeping bag/pad grow, stove/filter constant); concurrent claim upsert;
  cascade delete; soft-remove + claims integrity; item edit recompute.
  **DoD:** suite green against real Postgres.
- [ ] **WS-2.13** Register backend — export a `prisma` factory consumable by
  `services.ts` under `BEARCAMP_BACKEND=prisma`; document the line WS-8
  enables. **DoD:** WS-8 enables the real DB by env flag only.

## Acceptance criteria — write these tests first (red → green)

vitest; ephemeral Postgres per run (Testcontainers); `lib/db/__tests__/`.
Author first.

- [ ] **T2.1** migrate — `prisma migrate deploy` builds the full schema +
  `pg_trgm` indexes on an empty DB; reapply is a no-op. _(WS-2.3)_
- [ ] **T2.2** campsites repo — `upsertMany` then `search` filters by
  q/state/agency/amenities + pagination; `getById`. _(WS-2.4)_
- [ ] **T2.3** trips — `create` freezes `campsiteSnapshot`; `getById`;
  `rename`. _(WS-2.5)_
- [ ] **T2.4** items — add/list/update; `softRemove` hides but row + claims
  preserved; reorder; non-editable fields rejected. _(WS-2.6)_
- [ ] **T2.5** participants — creator `isOwner=true`; `byToken`; `count`.
  _(WS-2.7)_
- [ ] **T2.6** claims — `upsert` composite-id dedupe (qty updated, no dup
  row); `remove`. _(WS-2.8)_
- [ ] **T2.7** `buildTripView` — needed/claimed/shortfall per scope; removed
  excluded; grouped by participant; unknown `tripId` → `null` (G8); solo
  creator → `participantCount===1`, per_person needed = 1 (B6). _(WS-2.9)_
- [ ] **T2.8** scaling (headline) — adding participants grows `per_person`
  needed (sleeping bag/pad); `shared` constant. _(WS-2.9)_
- [ ] **T2.9** cascade — deleting a `Trip` removes its
  items/participants/claims (Prisma `onDelete: Cascade`). _(schema)_
- [ ] **T2.10** atomic createTrip — trip + items + owner participant commit
  in one `$transaction`; failure rolls back all. _(WS-2.10)_
- [ ] **T2.11** item edit — changing `baseQty`/`scope` recomputes
  `requiredQty` in the next `buildTripView`; rename persists (review G1).
  _(WS-2.6/2.9)_
- [ ] **T2.12** contract — `storageContract(prismaFactory)` (WS-0.15) green
  with **zero** suite edits (same suite the in-memory fake passes).
  _(WS-2.10)_

## Seams you participate in

- **I-4** (producer): in-memory fake → Prisma/Neon. WS-8.1 flips
  `services.ts` via `BEARCAMP_BACKEND`; you only provide the factory. No
  other stream edits your files; `schema.prisma` is WS-0's.
