# Workstreams

How the plan splits into streams that can be built **in parallel** with
minimal blocking and near-zero merge conflicts.

## Strategy: contract-first + mocks + one integration seam

Parallelism comes from three rules:

1. **Freeze contracts before building.** One small foundation stream (WS-0)
   lands all shared TypeScript types and interface signatures
   (`StorageAdapter`, `CampsiteSource`, packing function signatures, Server
   Action signatures, route helpers). After it merges, no other stream needs
   to wait on another's *implementation* — only on these stable *types*.
2. **Ship fakes with the contracts.** WS-0 also ships an in-memory
   `StorageAdapter`, a small fixture campsite set, and stub `generate()` /
   `requiredQty()`. UI and action streams develop and run end-to-end against
   these fakes immediately, without the real DB, seed data, or engine.
3. **One swap point.** `lib/services.ts` is the single composition root that
   returns the configured `StorageAdapter` + `CampsiteSource`. Integration
   (WS-8) flips fakes → real impls there. No stream edits another's files.

**Disjoint file ownership (within a wave):** every Wave-2 stream owns a
non-overlapping set of paths (table below), so the seven parallel streams
never collide. The two **seam files** — `lib/services.ts` and
`next.config.ts` — plus the **write-once packing barrel** `lib/packing/index.ts`
and **WS-0-owned** `lib/packing/quantities.ts` are authored by **WS-0 in
Wave 1** and only re-pointed by **WS-8 in Wave 3**; because WS-0 and WS-8
never run concurrently, this is a temporal handoff, not concurrent shared
ownership. No Wave-2 stream edits a seam file. (This wording resolves review
B1/B3: WS-1 owns only `templates.ts`/`rules.ts`/`generate.ts`/tests — *not*
`quantities.ts` or `index.ts`.)

## Dependency graph

```
                        ┌─────────────────────────┐
                        │ WS-0 Contracts & Scaffold│  (Wave 1, solo, small)
                        └────────────┬─────────────┘
                                     │ types + interfaces + fakes + services.ts
   ┌──────────────┬──────────────┬───┴───────┬──────────────┬──────────────┐
   ▼              ▼              ▼            ▼              ▼              ▼
┌────────┐   ┌─────────┐   ┌──────────┐  ┌────────┐    ┌─────────┐    ┌─────────┐
│WS-1    │   │WS-2     │   │WS-3      │  │WS-4    │    │WS-5     │    │WS-6     │
│Packing │   │Persist  │   │Campsite  │  │Design  │    │Campsite │    │Trip     │
│Engine  │   │Layer    │   │Data+Srch │  │Sys+Shell│   │Browse UI│    │Exp. UI  │
└───┬────┘   └────┬────┘   └────┬─────┘  └───┬────┘    └────┬────┘    └────┬────┘
    │             │             │            │ (soft dep)──▶│◀────────────┘
    │             │             │                                  ▲
    │             │             │            ┌─────────┐           │
    │             │             └───────────▶│WS-7     │───────────┘
    └─────────────┴────────────────────────▶ │Trip     │ (consumes 1+2 at integ.)
                                              │Actions  │
                                              └────┬────┘
                                                   ▼
                                     ┌──────────────────────────┐
                                     │ WS-8 Integration/Harden   │ (Wave 3)
                                     └──────────────────────────┘
```

All of WS-1..WS-7 start together in **Wave 2** (they only need WS-0's
contracts + fakes). WS-8 is **Wave 3**, after the logic streams (1, 2, 3, 7)
and feature UIs (5, 6) are functionally complete.

## The streams

| ID | Stream | Scope | Owns (disjoint paths) | Hard deps | Can start when | Done when |
|----|--------|-------|-----------------------|-----------|----------------|-----------|
| **WS-0** | Contracts & Scaffolding | Deps install; `next.config.ts` (`cacheComponents`); `.gitignore`; all domain types; interface signatures; in-memory storage fake + fixtures; stub engine; route helpers; `services.ts` seam; test runner config | `package.json`, `next.config.ts`, `.gitignore`, `lib/db/types.ts`, `lib/db/storage.ts`, `lib/db/storage.memory.ts`, `lib/campsites/source.ts`, `lib/campsites/fixtures.ts`, **`lib/packing/index.ts` (write-once barrel) + `lib/packing/quantities.ts` (real, WS-0-owned permanently) + stub `lib/packing/generate.ts`**, `lib/trips/action-types.ts`, `lib/ids.ts`, `lib/routes.ts`, `lib/services.ts`, `lib/validation/domain.ts`, **`prisma/schema.prisma`** (schema contract), test config | — | now | Types compile; fakes usable; `prisma validate` passes; `pnpm test`/`build` green on a smoke test |
| **WS-1** | Packing Engine | Base templates, amenity rules, `generate()`; **tests** for `generate`/`requiredQty` (does **not** own/edit `quantities.ts` or `index.ts`) | `lib/packing/templates.ts`, `lib/packing/rules.ts`, `lib/packing/generate.ts`, `lib/packing/__tests__/*` | WS-0 types | WS-0 merged | `generate(style,amenities)` matches `packing-engine.md`; frozen export surface unchanged; tests pass |
| **WS-2** | Persistence Layer (Prisma + Neon) | Prisma client (Neon adapter), migrations, seed, Docker Postgres, repositories (Prisma→DTO), `buildTripView`, real `StorageAdapter` impl | `prisma/migrations/*`, `prisma/seed.ts`, `docker-compose.yml`, `.env.example`, `lib/db/prisma.ts`, `lib/db/{trips,participants,items,claims,campsites}.ts`, `lib/db/storage.prisma.ts`, `lib/db/view.ts`, `lib/db/__tests__/*` | WS-0 types + `schema.prisma` + interface | WS-0 merged | repos + `buildTripView` (incl. `null`) pass on ephemeral Postgres; `storageContract` green |
| **WS-3** | Campsite Data & Search | Seed dataset authoring, `CampsiteSource` impls (seed/RIDB/OSM), search helper, importer script | `data/campsites.seed.json`, `lib/campsites/{seed,ridb,osm,search}.ts`, `scripts/import-ridb.ts` | WS-0 `Amenities`/`CampsiteSource` | WS-0 merged | ≥150 normalized seed entries; `search()` filters by q/state/agency/amenities; importer documented |
| **WS-4** | Design System & App Shell | shadcn primitives, root layout + metadata, header/nav, Toaster, skeleton/empty/error primitives, theme | `app/layout.tsx`, `app/globals.css`, `components/ui/*`, `components/app/*`, `lib/utils.ts` (pre-exists; WS-4 owns regen) | WS-0 (routes) | WS-0 merged | Shell renders; primitives exported; dark/olive theme intact |
| **WS-5** | Campsite Browse UI | Landing, search/browse, campsite detail, search bar/cards/amenity grid | `app/page.tsx`, `app/campsites/**`, `components/campsites/*` | WS-0 fakes; WS-4 (soft — can stub primitives) | WS-0 merged | Browse/search/detail work against fixture source; `unstable_instant` set |
| **WS-6** | Trip Experience UI | Trip page, packing list editor, claim rows, join dialog, share link, still-needed, refresh poller, style picker | `app/trips/**`, `components/trips/*` | WS-0 fakes; WS-4 (soft); WS-7 action sigs | WS-0 merged | Full trip flow works against in-memory storage + action stubs |
| **WS-7** | Trip Actions & Identity | All Server Actions, `bc_owner`/`bc_participant` cookie identity + guards, action input validation | `lib/trips/actions.ts`, `lib/trips/identity.ts`, `lib/validation/actions.ts` | WS-0 types; WS-1 `generate`, WS-2 repos (via fakes until integ.) | WS-0 merged | Actions typed + guarded; run against in-memory storage; swap to real repos at integration |
| **WS-8** | Integration, Validation & Hardening | Flip `services.ts` fakes→real, e2e `instant()` tests, `unstable_instant`/Cache-Components build validation incl. non-deterministic-op audit, a11y, docs/README | `lib/services.ts` (final, Wave-1→3 handoff from WS-0), `next.config.ts` (handoff, instant only), `e2e/*`, `app/api/health/route.ts`, `README.md`, CI config | WS-1, WS-2, WS-3, WS-7 complete; WS-5, WS-6 functional | Wave 2 converged | `next build` green; instant validation passes; flows work on real DB + seed; a11y checked |

## Shared contracts WS-0 must freeze (the interface surface)

Everything below is **types/signatures only** — implementations live in their
owning streams. Locking these is what unblocks parallel work.

- **Domain types** (`lib/db/types.ts`): `Amenities`, `Campsite`, `Trip`,
  `TripItem`, `Participant`, `Claim`, `TripView`, `TripStyle`, `ItemScope`,
  `ItemCategory` — exactly as in `data-model.md`.
- **`prisma/schema.prisma`** (WS-0): models/enums = the DB contract +
  source of truth for migrations. WS-2 runs `prisma migrate`/`generate`
  against it but **does not edit it**.
- **`StorageAdapter`** (`lib/db/storage.ts`): the repository surface from
  `data-model.md` as one **fully async** interface (every method returns a
  `Promise`). WS-2 implements it with **Prisma on Neon**
  (`storage.prisma.ts`); WS-0 ships the in-memory `storage.memory.ts`. DTOs
  in `lib/db/types.ts` are Prisma-free; only `lib/db/*` imports
  `@prisma/client`.
- **`CampsiteSource`** (`lib/campsites/source.ts`): `search(args)`,
  `getById(id)`, `all()`. WS-3 implements seed/RIDB; WS-0 ships fixtures.
- **Packing signatures + frozen export surface** (`lib/packing/index.ts`):
  the module exports **exactly** `generate(style: TripStyle, a: Amenities):
  TripItem[]`, `requiredQty(item: TripItem, participantCount: number):
  number`, and `TENT_CAPACITY: number` — this symbol set is frozen in
  WS-0.14. WS-0 owns `index.ts` (write-once barrel) **and** `quantities.ts`
  (real); WS-0 ships a stub `generate.ts` that WS-1 later replaces *behind
  the unchanged barrel*. A test asserts the export set is unchanged after
  WS-1 (resolves review B1/B2).
- **Action signatures** (`lib/trips/action-types.ts`): typed input/return
  for `createTrip`, `renameTrip`, `addItem`, `updateItem`, `removeItem`,
  `reorderItem`, `joinTrip`, `claimItem`, `unclaimItem`. **Frozen rule
  (review I-C):** `joinTrip`/`claimItem`/`unclaimItem` inputs **never**
  include `participantId` or any token — the server resolves the participant
  from the `bc_participant` cookie. `updateItem`'s patch is limited to
  `name|category|scope|baseQty|unit|note`; `reorderItem` takes
  `{ tripId, itemId, beforeItemId? | newIndex? }`. WS-6 builds UI against
  these; WS-7 implements.
- **Routes** (`lib/routes.ts`): `campsite(id)`, `campsites(query)`,
  `trip(id)` URL builders. Consumed read-only everywhere.
- **Services seam** (`lib/services.ts`): exports `getStorage()` /
  `getCampsiteSource()`. Default → memory + fixtures. WS-8 flips to
  Prisma/Neon + seed via `BEARCAMP_BACKEND` (env-flagged, ~2 lines).

## Integration sequence (Wave 3, WS-8)

1. Land WS-2 (Prisma/Neon) and WS-3 (seed) → point `services.ts` at them via
   `BEARCAMP_BACKEND=prisma`; run WS-2/WS-3 suites green on ephemeral Postgres.
2. Land WS-1 (engine) → WS-7 swaps stub `generate` import for the real one;
   re-run action tests.
3. WS-7 actions now call real WS-2 repos; verify WS-6 trip flows against real
   storage; verify WS-5 against real seed search.
4. Add `unstable_instant` validation pass + `@next/playwright` `instant()`
   tests for the key navigations; fix any "uncached data outside `<Suspense>`"
   errors surfaced by Cache Components.
5. a11y pass, `next build`, README run instructions + D1–D4 caveats.

## Execution waves & resourcing

- **Wave 1 — WS-0 only.** Small but on the critical path; do it fast and
  merge before fanning out. Strongest engineer.
- **Wave 2 — WS-1..WS-7 in parallel (up to 7 tracks).**
  - Critical path inside Wave 2: **WS-2 (backbone)** and **WS-7 (glue)** —
    staff these first/heaviest.
  - WS-1 and WS-3 are independent and pure → ideal for separate owners/agents.
  - WS-4 should merge early-ish since WS-5/WS-6 polish depends on its
    primitives (they can scaffold with placeholders meanwhile).
- **Wave 3 — WS-8.** Integration + hardening; needs 1/2/3/7 done and 5/6
  functional.

Minimum viable parallelism: 3 tracks (logic: WS-1+WS-2+WS-7, data: WS-3,
UI: WS-4+WS-5+WS-6). Maximum: ~7 concurrent tracks in Wave 2.

## Mapping to `milestones.md` phases

| Phase | Streams |
|---|---|
| 0 Foundations | WS-0 (+ WS-2 db setup, WS-4 shell) |
| 1 Catalog & search | WS-3, WS-5 |
| 2 List generation | WS-1, WS-7 (createTrip) |
| 3 Trip page & editing | WS-2 (`buildTripView`), WS-6, WS-7 |
| 4 Sharing/joining/claiming | WS-6, WS-7 |
| 5 Polish & hardening | WS-8, WS-4 (polish) |
