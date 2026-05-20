# WS-0 — Contracts & Scaffolding

**Wave:** 1 (solo, first — blocks all of Wave 2) · **Critical path:** yes
**Depends on:** — · **Start when:** now

**Owned paths:** `package.json`, `next.config.ts`, `.gitignore`,
`lib/db/types.ts`, `lib/db/storage.ts`, `lib/db/storage.memory.ts`,
`lib/campsites/source.ts`, `lib/campsites/fixtures.ts`,
`lib/packing/index.ts` (write-once barrel, **permanent**),
`lib/packing/quantities.ts` (**real, WS-0-owned permanently — WS-1 never
edits it**), stub `lib/packing/generate.ts` (WS-1 replaces *behind* the
barrel), `lib/trips/action-types.ts`, `lib/ids.ts`, `lib/routes.ts`,
`lib/services.ts`, `lib/validation/domain.ts`,
**`prisma/schema.prisma`** (schema/enum contract — WS-2 migrates from it but
never edits it), test config.

> Goal: freeze every shared type/interface and ship working fakes so all
> seven Wave-2 streams can build end-to-end without waiting on each other.

## Tasks

- [ ] **WS-0.1** Install deps — add `prisma`, `@prisma/client`,
  `@prisma/adapter-neon`, `@neondatabase/serverless`, `zod`, and the test
  stack (`vitest`, `@vitejs/plugin-react`, `@testing-library/react`,
  `@testing-library/jest-dom`, `@testing-library/user-event`,
  `@testcontainers/postgresql`; `@next/playwright` for later) via `pnpm`.
  No `nanoid` (Prisma `cuid()` covers short ids); no native deps (D2/DR-6).
  Add `test`, `typecheck`, `prisma generate` (postinstall) scripts to the
  (currently bare) `package.json`. **DoD:** `pnpm i` clean; lockfile
  committed; `pnpm test` runs an empty suite.
- [ ] **WS-0.2** Config & ignore — `next.config.ts`: `cacheComponents: true`,
  `experimental.instantNavigationDevToolsToggle: true`. `.gitignore`: add
  `.env`; commit `.env.example`. **DoD:** `next build` of the bare app still
  succeeds.
- [ ] **WS-0.2b** Prisma schema — author `prisma/schema.prisma` exactly per
  `../data-model.md` (models, enums, Neon `datasource` with `directUrl`,
  `driverAdapters` preview). Run `prisma validate`/`prisma format`. This is
  the schema **contract**; WS-2 migrates from it and must not edit it.
  **DoD:** `prisma validate` passes; `prisma generate` produces a client.
- [ ] **WS-0.3** Domain types — `lib/db/types.ts` with `Amenities`,
  `Campsite`, `Trip`, `TripItem`, `Participant`, `Claim`, `TripView`,
  `TripStyle`, `ItemScope`, `ItemCategory`, exactly per `../data-model.md`.
  **DoD:** compiles, exported, no `any`. **Notes:** most-depended file —
  changes after freeze ripple to every stream.
- [ ] **WS-0.4** Storage interface — `lib/db/storage.ts` `StorageAdapter`
  covering the full "Repository surface" in `../data-model.md`
  (campsites/trips/items/participants/claims + `buildTripView`). **Fully
  async** — every method returns a `Promise` (so the Prisma/Neon impl is a
  drop-in; the fake wraps in `Promise.resolve`). **DoD:** interface only;
  WS-2 (Prisma) can implement, the fake can satisfy it.
- [ ] **WS-0.5** In-memory storage — `lib/db/storage.memory.ts` implementing
  `StorageAdapter` with `Map`s, seeded from fixtures, incl. a working
  `buildTripView` (uses `requiredQty`). **DoD:** create trip → add items →
  join → claim → `buildTripView` returns correct needed/claimed/shortfall.
- [ ] **WS-0.6** Campsite source + fixtures — `lib/campsites/source.ts`
  (`CampsiteSource`: `search(args)`, `getById(id)`, `all()`);
  `lib/campsites/fixtures.ts` with 12–15 campsites spanning amenity combos
  (water/none, vault/flush/none toilets, bear lockers vs bear country,
  electricity, fire rings, cell none/good, drive-in/walk-in/backcountry).
  **DoD:** fixtures pass `validation/domain.ts`; cover every rule branch in
  `../packing-engine.md`.
- [ ] **WS-0.7** Packing module shape + stub — `lib/packing/index.ts` =
  `export * from './generate'; export * from './quantities'` (write-once);
  ship a **real** `quantities.ts` (`requiredQty`, `TENT_CAPACITY`) and a
  **stub** `generate.ts` (small realistic categorized `TripItem[]` with
  correct `scope`). **DoD:** `generate` returns ≥1 item/category for both
  styles; `requiredQty` matches `../packing-engine.md`. **Notes (review
  B1/B2):** WS-0 owns `index.ts` **and** `quantities.ts` *permanently*; WS-1
  replaces only `generate.ts` behind the unchanged barrel. The barrel's
  export set is enumerated and frozen in WS-0.14.
- [ ] **WS-0.8** Action signatures — `lib/trips/action-types.ts`: input +
  return types for `createTrip`, `renameTrip`, `addItem`, `updateItem`,
  `removeItem`, `reorderItem`, `joinTrip`, `claimItem`, `unclaimItem`.
  **Frozen rules (review I-C/G1):** `joinTrip`/`claimItem`/`unclaimItem`
  inputs **must not** include `participantId` or any token (server resolves
  the participant from the `bc_participant` cookie); `updateItem` patch is
  `Partial<Pick<TripItem,'name'|'category'|'scope'|'baseQty'|'unit'|'note'>>`;
  `reorderItem` input is `{ tripId, itemId, beforeItemId? , newIndex? }`.
  **DoD:** WS-6 types UI against these; WS-7 implements without shape drift.
- [ ] **WS-0.9** Id helpers — `lib/ids.ts`: `tripSlug()` =
  `crypto.randomUUID()` (122-bit), `token()` = url-safe random **≥128-bit**
  (review G7). Item/participant ids come from Prisma `@default(cuid())` —
  **not** `lib/ids.ts` (no `nanoid`). **Notes:** these are
  non-deterministic and may be called **only from Server Actions**, never a
  `'use cache'`/prerendered scope (Cache Components; review B5 — WS-8.3
  audits this). **DoD:** unit-tested for uniqueness/shape/entropy.
- [ ] **WS-0.10** Route helpers — `lib/routes.ts`: `home()`,
  `campsites(query?)`, `campsite(id)`, `trip(id)`. **DoD:** pure builders;
  consumed read-only everywhere.
- [ ] **WS-0.11** Domain validation — `lib/validation/domain.ts`: zod schemas
  for `Amenities` and `Campsite` (used by WS-3 import + fixtures). **DoD:**
  `parse` rejects malformed campsite/amenities.
- [ ] **WS-0.12** Services seam — `lib/services.ts`: `getStorage()` /
  `getCampsiteSource()`, env-flagged (`BEARCAMP_BACKEND=memory|prisma`,
  default `memory`), returning memory + fixtures. **DoD:** single module all
  consumers import; WS-8 flips defaults in ~2 lines.
- [ ] **WS-0.13** Test config + smoke — `vitest.config.ts`, test scripts; one
  smoke test exercising memory storage + stub generate end-to-end. **DoD:**
  `pnpm test` green; `pnpm typecheck`/`next build` green.
- [ ] **WS-0.14** Freeze & announce — add a "Frozen Contracts" note to
  `../workstreams.md` listing the **exact exported symbols**, including the
  packing barrel's frozen set `{ generate, requiredQty, TENT_CAPACITY }`
  (review B2), the `StorageAdapter`/`CampsiteSource`/action-type members,
  and the I-C input rule. Tag the commit. **DoD:** Wave-2 owners have a
  stable documented surface; a test (T0.11) asserts the packing export set.

- [ ] **WS-0.15** Shared contract suites — author reusable,
  implementation-agnostic suites: `storageContract(makeAdapter)` (exercises
  every `StorageAdapter` method + `buildTripView` math/scaling) and
  `actionsContract(makeDeps)` (exercises every Server Action's
  behavior/guards). Ship them **green** against memory + stub `generate`.
  **DoD:** WS-2 runs `storageContract` against Prisma/Neon (ephemeral
  Postgres) and WS-7 runs `actionsContract` against fakes with **zero suite
  changes**; WS-8 reruns both against real impls. **Notes:** this is what lets persistence and
  actions be TDD'd in parallel and re-proven at integration without
  rewriting tests.

## Acceptance criteria — write these tests first (red → green)

Write these before the tasks above; they fail (red) until the mapped task
lands. vitest; tests in owned `lib/**/__tests__`.

- [ ] **T0.1** typecheck gate — `pnpm typecheck` green; `storage.memory.ts`
  structurally satisfies `StorageAdapter`. _(WS-0.3/0.4/0.5)_
- [ ] **T0.2** memory round-trip — create trip → `getById`;
  `items.add`→`listByTrip`; `participants.add(owner)` has `isOwner`;
  `claims.upsert` twice = one row, qty updated. _(WS-0.5)_
- [ ] **T0.3** `buildTripView` math — stub `generate` + real `requiredQty`:
  needed/claimed/shortfall correct; **solo creator (n=1) → per_person
  needed = 1, not 0** (review B6); removed excluded; claims grouped by
  participant; unknown `tripId` → `null` (review G8). _(WS-0.5/0.7)_
- [ ] **T0.4** ids — `tripSlug()` 1000× unique & UUID-shaped; `token()`
  decodes to **≥16 bytes (≥128-bit)** (review G7). _(WS-0.9)_
- [ ] **T0.12** `prisma validate` passes and `prisma generate` succeeds from
  the WS-0 `schema.prisma`; generated enum names map to DTO `ItemCategory`
  display values. _(WS-0.2b)_
- [ ] **T0.5** routes — builders emit exact paths incl. encoded query.
  _(WS-0.10)_
- [ ] **T0.6** domain validation — valid `Amenities`/`Campsite` parse;
  missing field & bad enum reject. _(WS-0.11)_
- [ ] **T0.7** fixtures coverage — every fixture parses the domain schema;
  the set hits every amenity branch in `../packing-engine.md` (assert a
  coverage map). _(WS-0.6)_
- [ ] **T0.8** services seam — default `getStorage()`/`getCampsiteSource()`
  = memory/fixtures; `BEARCAMP_BACKEND` switch selects the registered
  factory. _(WS-0.12)_
- [ ] **T0.9** smoke — create a trip from a fixture campsite via memory +
  stub `generate` → view renders ≥1 item per category. _(WS-0.13)_
- [ ] **T0.10** shared contract suites — `storageContract` &
  `actionsContract` green against memory/stub deps. _(WS-0.15)_
- [ ] **T0.11** frozen packing export surface — `lib/packing` exports
  **exactly** `{ generate, requiredQty, TENT_CAPACITY }`; the test fails if
  WS-1 adds/renames/removes an export behind the barrel (review B2).
  _(WS-0.7/0.14)_

## Seams you produce (consumed by others)

- Every contract in WS-0.3–0.12 — the foundation for all Wave-2 streams.
- `services.ts` (I-4/I-5 swap point), the packing barrel `index.ts` + the
  permanently WS-0-owned `quantities.ts` (I-3), and `next.config.ts` are
  written here and only re-pointed by WS-8 — **never** edited by any Wave-2
  stream (review B1/B3). WS-1 replaces only the stub `generate.ts`.
