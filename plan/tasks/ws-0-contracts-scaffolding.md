# WS-0 — Contracts & Scaffolding

**Wave:** 1 (solo, first — blocks all of Wave 2) · **Critical path:** yes
**Depends on:** — · **Start when:** now

**Owned paths:** `package.json`, `next.config.ts` *(temporal handoff to
WS-8 in Wave 3 — Wave-2 streams must not edit)*, `.gitignore`,
`lib/db/types.ts`, `lib/db/storage.ts`, `lib/db/storage.memory.ts`,
`lib/campsites/source.ts`, `lib/campsites/fixtures.ts`,
`lib/packing/index.ts` (write-once barrel, **permanent**),
`lib/packing/quantities.ts` (**real, WS-0-owned permanently — WS-1 never
edits it**), **stub** `lib/packing/generate.ts` *(temporal handoff to
WS-1 in Wave 2 — WS-1 replaces only this one file behind the unchanged
barrel)*, `lib/trips/action-types.ts`, `lib/trips/result.ts` (`Result<T>`
envelope + `ErrorCode` union — every action consumer (WS-6 UI) depends on
this shape pre-WS-7, so it lives in WS-0 — review-3 DR-39),
`lib/trips/identity.stub.ts` (test-mode identity helper for WS-6 pre-WS-7
— uses `vi.mock('next/headers')` to inject a fake cookie store; **not** a
runtime "stub" — `next/headers#cookies()` requires a Next request scope
that vitest doesn't provide, so the real-cookies promise in the earlier
patch was wrong — review-3 DR-41. WS-8.2 swaps imports to the real
`lib/trips/identity.ts`), `lib/ids.ts`, `lib/routes.ts`,
`lib/limits.ts` (single source of truth for `PARTICIPANT_CAP_PER_TRIP=50`,
`TENT_CAPACITY_MIN=1`, `TENT_CAPACITY_MAX=12`,
`SEARCH_PAGE_SIZE_DEFAULT=20`, `SEARCH_PAGE_SIZE_MAX=50` — review-3
DR-43),
`lib/services.ts` *(temporal handoff to WS-8 in Wave 3)*,
`lib/validation/domain.ts`,
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
  **Pin Prisma version explicitly** (≥6.x preferred, GA driver adapters;
  on 5.x the schema needs `previewFeatures = ["driverAdapters"]`, on 6.x
  it's a no-op — review-2 DR-32). No `nanoid` (Prisma `cuid()` covers
  short ids); no native deps (D2/DR-6). Add `test`, `typecheck`, `prisma
  generate` (postinstall) scripts to the (currently bare) `package.json`.
  **DoD:** `pnpm i` clean; lockfile committed; `pnpm test` runs an empty
  suite.
- [ ] **WS-0.2** Config & ignore — `next.config.ts`: `cacheComponents:
  true`, `experimental.instantNavigationDevToolsToggle: true`. *(WS-8.3c
  adds `experimental.serverActions.allowedOrigins` for prod — review-2
  DR-18.)* `.gitignore`: add `.env`; commit `.env.example`. **DoD:**
  `next build` of the bare app still succeeds.
- [ ] **WS-0.2b** Prisma schema — author `prisma/schema.prisma` exactly
  per `../data-model.md` (models incl. `Trip.tentCapacity` + unique
  `ownerToken` + Participant `[tripId, token]` index, enums, Neon
  `datasource` with `directUrl`). Include
  `previewFeatures = ["driverAdapters"]` **only** if the pinned Prisma
  version is 5.x (drop it on 6.x — review-2 DR-32). Run
  `prisma validate`/`prisma format`. This is the schema **contract**;
  WS-2 migrates from it (incl. the `CREATE EXTENSION pg_trgm` raw SQL +
  GIN trigram indexes with `gin_trgm_ops`) and must not edit it.
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
  return types for `createTrip`, `renameTrip`, **`updateTripSettings`**
  (review-2 DR-21), **`deleteTrip`** (DR-20), `addItem`, `updateItem`,
  `removeItem`, **`restoreItem`** (DR-19), `reorderItem`, `joinTrip`,
  `claimItem`, `unclaimItem`. All returns wrap the typed envelope from
  `lib/trips/result.ts` (WS-0.8b). **Frozen rules (review I-C/G1):**
  `joinTrip`/`claimItem`/`unclaimItem` inputs **must not** include
  `participantId` or any token (server resolves the participant from the
  `bc_participant` cookie); `updateItem` patch is
  `Partial<Pick<TripItem,'name'|'category'|'scope'|'baseQty'|'unit'|'note'>>`;
  `updateTripSettings` patch is `Partial<Pick<Trip,'tentCapacity'>>`;
  `restoreItem` input is `{ tripId, itemId }`; `deleteTrip` input is
  `{ tripId }`; `reorderItem` input is `{ tripId, itemId, beforeItemId?,
  newIndex? }`. **DoD:** WS-6 types UI against these; WS-7 implements
  without shape drift.

- [ ] **WS-0.8b** Result envelope + ErrorCode union — `lib/trips/result.ts`:
  ```ts
  export type ErrorCode =
    | 'unauthorized'        // owner/participant guard failed
    | 'not_found'           // trip/item missing
    | 'validation_failed'   // zod parse failed
    | 'participant_cap_reached'  // ≥ PARTICIPANT_CAP_PER_TRIP
    | 'internal'            // unexpected; logged
  export type Result<T> =
    | { ok: true; data: T }
    | { ok: false; error: { code: ErrorCode; message: string } }
  export const ok = <T>(data: T): Result<T> => ({ ok: true, data })
  export const err = (code: ErrorCode, message: string): Result<never> =>
    ({ ok: false, error: { code, message } })
  ```
  WS-6 imports `ErrorCode` to type its `switch` over error envelopes
  (e.g., the cap toast); WS-7 implements actions returning these
  helpers. **The vocabulary is closed: adding a new code is a contract
  bump** (review-3 DR-39/DR-44). **DoD:** all action types from WS-0.8
  resolve to `Promise<Result<...>>`; the union has exactly the 5 codes
  listed.

- [ ] **WS-0.8c** Limits — `lib/limits.ts`:
  ```ts
  export const PARTICIPANT_CAP_PER_TRIP = 50
  export const TENT_CAPACITY_MIN = 1
  export const TENT_CAPACITY_MAX = 12
  export const SEARCH_PAGE_SIZE_DEFAULT = 20
  export const SEARCH_PAGE_SIZE_MAX = 50
  ```
  Every doc that previously hard-coded these numbers now cites the
  constant name (review-3 DR-43). The Prisma schema `@default(2)` on
  `Trip.tentCapacity` mirrors the packing module's `TENT_CAPACITY`
  default (Prisma can't import TS) — `data-model.md` documents the
  two-place rule. **DoD:** literal `50`/`12`/`20`/`50` appears only in
  `lib/limits.ts` and the schema's `@default(2)` (which is a different
  value); a grep test asserts this in WS-8.3.
- [ ] **WS-0.9** Id helpers — `lib/ids.ts`: `tripSlug()` =
  `crypto.randomUUID()` (122-bit, kept full-length per review-2 DR-27),
  `token()` = url-safe random **≥128-bit** (review G7). `campsiteId(prefix:
  'seed'|'fixture'|'ridb'|'osm', raw: string)` returns `${prefix}:${raw}`
  — the only sanctioned way to construct a `Campsite.id` (review-2 DR-30).
  Item/participant ids come from Prisma `@default(cuid())` — **not**
  `lib/ids.ts` (no `nanoid`). **Notes:** these are non-deterministic and
  may be called **only from Server Actions**, never a `'use
  cache'`/prerendered scope (Cache Components; review B5 — WS-8.3 audits
  this). **DoD:** unit-tested for uniqueness/shape/entropy.
- [ ] **WS-0.10** Route helpers — `lib/routes.ts`: `home()`,
  `campsites(query?)`, `campsite(id)`, `trip(id)`. **DoD:** pure builders;
  consumed read-only everywhere.
- [ ] **WS-0.11** Domain validation — `lib/validation/domain.ts`: zod
  schemas for `Amenities` and `Campsite` (used by WS-3 import + fixtures).
  `Campsite.state` validates to a 2-char uppercase US-state regex
  (`^[A-Z]{2}$`); `Campsite.id` validates the prefix scheme via the same
  list `WS-0.9` uses (review-2 DR-30/DR-31). **DoD:** `parse` rejects
  malformed campsite/amenities, including missing prefix and bad state.
- [ ] **WS-0.12** Services seam — `lib/services.ts`: `getStorage()` /
  `getCampsiteSource()`, env-flagged (`BEARCAMP_BACKEND=memory|prisma`,
  default `memory`), returning memory + fixtures. **DoD:** single module all
  consumers import; WS-8 flips defaults in ~2 lines.

- [ ] **WS-0.12b** Test-mode identity helper — `lib/trips/identity.stub.ts`
  exposing the same surface WS-7 will publish (`assertOwner(tripId)`,
  `assertParticipant(tripId)`, `currentParticipant(tripId)`,
  `setOwnerToken`, `setParticipantToken`) but resolving tokens against
  **in-memory storage**. **Test usage:** in vitest unit tests, callers
  `vi.mock('next/headers', () => ({ cookies: () => mockJar }))` so the
  helper sees the injected cookie store (review-3 DR-41 — `next/headers`
  requires a Next request scope that vitest does **not** provide; the
  earlier "real `cookies()`" promise was wrong). **End-to-end usage:** in
  `@next/playwright` flows (WS-6.13), the helper uses the real
  `await cookies()` (which works inside a Next request scope), set
  via `playwrightCtx.addCookies(...)`. WS-8.2 rewrites callers' imports
  from `identity.stub` → `identity` (WS-7's). Review-2 DR-15. **DoD:**
  WS-6's trip page renders against this stub + memory storage in both
  vitest (mocked `next/headers`) and Playwright (real cookie jar).
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
  needed = 1, not 0** (review B6); removed excluded from the main list
  but **claims on removed items surface under a separate "no longer
  needed" bucket** in the view shape (review-2 DR-19); claims grouped by
  participant; `requiredQty` reads `Trip.tentCapacity` (per_tent shortfall
  with `tentCapacity=6, n=6` → 1, not 3 — review-2 DR-21); unknown
  `tripId` → `null` (review G8). _(WS-0.5/0.7)_
- [ ] **T0.4** ids — `tripSlug()` 1000× unique & UUID-shaped **and matches
  the canonical `crypto.randomUUID()` regex (122 random bits — review-2
  G-slug confirmed)**; `token()` decodes to **≥16 bytes (≥128-bit)**
  (review G7); `campsiteId('seed','foo')` returns `'seed:foo'`;
  `campsiteId` rejects unknown prefix (review-2 DR-30). _(WS-0.9)_
- [ ] **T0.12** `prisma validate` passes and `prisma generate` succeeds from
  the WS-0 `schema.prisma`; generated enum names map to DTO `ItemCategory`
  display values. _(WS-0.2b)_
- [ ] **T0.5** routes — builders emit exact paths incl. encoded query.
  _(WS-0.10)_
- [ ] **T0.6** domain validation — valid `Amenities`/`Campsite` parse;
  missing field & bad enum reject; `Campsite.state` regex rejects `"CA "`
  / `"california"` and accepts `"CA"`; `Campsite.id` rejects bare strings
  / unknown prefix (review-2 DR-30/DR-31). _(WS-0.11)_
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
- [ ] **T0.13** identity stub — vitest test with
  `vi.mock('next/headers', ...)` injecting a fake cookie store:
  `identity.stub.assertParticipant(tripId)` resolves a participant from
  in-memory storage when the mocked jar holds the right token; throws
  on missing/wrong cookie; `bc_owner` and `bc_participant` coexist
  (review-2 DR-15; review-3 DR-41 fixes the "real cookies in vitest"
  promise). _(WS-0.12b)_
- [ ] **T0.14** Result envelope + ErrorCode — `lib/trips/result.ts`
  exports exactly `{ ok, err, Result, ErrorCode }`; the union has
  exactly the 5 documented codes; adding/removing a code fails a
  symbol-set assertion test (review-3 DR-39/DR-44). _(WS-0.8b)_
- [ ] **T0.15** Limits — `lib/limits.ts` exports the 5 numeric constants
  with the documented values; a grep test in the repo's `__tests__`
  asserts no other file contains the literal `50`/`12`/`20` as a
  participant cap / tent max / page-size cap (review-3 DR-43).
  _(WS-0.8c)_
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
