# Task Lists — index

One file per workstream. Each is self-contained (scope, owned paths, deps,
wave, tasks, the seams it participates in) so it can be handed to a single
owner or agent.

| File | Stream | Wave | On critical path |
|---|---|---|---|
| `ws-0-contracts-scaffolding.md` | WS-0 Contracts & Scaffolding | 1 | ✅ blocks all |
| `ws-1-packing-engine.md` | WS-1 Packing Engine | 2 | — |
| `ws-2-persistence-layer.md` | WS-2 Persistence Layer | 2 | ✅ backbone |
| `ws-3-campsite-data-search.md` | WS-3 Campsite Data & Search | 2 | — |
| `ws-4-design-system-app-shell.md` | WS-4 Design System & App Shell | 2 | — (early) |
| `ws-5-campsite-browse-ui.md` | WS-5 Campsite Browse UI | 2 | — |
| `ws-6-trip-experience-ui.md` | WS-6 Trip Experience UI | 2 | — |
| `ws-7-trip-actions-identity.md` | WS-7 Trip Actions & Identity | 2 | ✅ glue |
| `ws-8-integration-validation-hardening.md` | WS-8 Integration & Hardening | 3 | ✅ |

See `../workstreams.md` for the dependency graph, ownership table, and waves.

## Conventions (apply to every workstream)

- Next.js **16.2.6**: App Router, Cache Components, async
  `params`/`searchParams`, Server Actions, `unstable_instant`. Read the
  relevant `node_modules/next/dist/docs` guide before coding (`AGENTS.md`).
- Stay inside your stream's **owned paths** (listed in each file).
- Code against the **WS-0 contracts** + WS-4 UI barrel + local mocks. Never
  import another stream's in-progress internals.
- Task format: `[ ] **ID** Title` — deliverable · **DoD:** acceptance ·
  **Notes:** contracts/gotchas.

## TDD workflow (applies to every workstream)

- **Acceptance criteria are tests, written first.** Every workstream file
  has an "Acceptance criteria — write these tests first (red → green)" list.
  Author those tests, watch them fail (**red**), implement the tasks to make
  them pass (**green**), then refactor. The per-task **DoD** lines are
  subsumed by these tests.
- A workstream is **done only when all its acceptance tests pass** and
  `pnpm test` is green.
- Frameworks: **vitest** (pure logic, repos, actions vs fakes),
  **@testing-library/react** + user-event (client components),
  **@next/playwright** (pages, flows, `instant()` shells). Build-time gates
  (`next build`, `unstable_instant` validation) are asserted in CI.
- Tests live in the stream's owned `__tests__`/`e2e` paths and run against
  **WS-0 fakes** until WS-8 integration.
- **Shared contract suites** (WS-0.15): `storageContract(factory)` and
  `actionsContract(deps)` are implementation-agnostic and reused unchanged —
  WS-2 runs the storage suite against Prisma/Postgres, WS-7 runs the actions suite
  against fakes, WS-8 reruns both against the real impls, with **zero suite
  edits**. This is what makes parallel TDD provable at integration.

## Decisions from the plan review (read first)

These overrode earlier wording — see `../review-remediation.md` for the
full trace (review-1 DR-1…DR-6; review-2 DR-7…DR-38; review-3
DR-39…DR-58). They are binding for every stream:

- **Packing ownership:** WS-0 permanently owns `lib/packing/index.ts` **and**
  `lib/packing/quantities.ts`. WS-1 owns only `templates.ts`/`rules.ts`/
  `generate.ts`/tests and replaces *only* the stub `generate.ts`. The barrel
  export set `{ generate, requiredQty, TENT_CAPACITY }` is frozen
  (WS-0.14, test T0.11). `requiredQty` takes an optional `tentCapacity`
  arg (per-trip, review-2 DR-21).
- **Persistence (DR-6 + DR-10/DR-11):** **Neon serverless Postgres + Prisma**
  (`@prisma/adapter-neon`). HTTP driver → **array-form `$transaction`
  only** (DR-10). First migration runs `CREATE EXTENSION pg_trgm` + GIN
  trigram indexes with `gin_trgm_ops` (DR-11). `prisma/schema.prisma` is
  a **WS-0 contract**; WS-2 owns migrations/seed/Docker. The
  `StorageAdapter` interface is **fully async**; `@prisma/client` is
  confined to `lib/db/*` (DTOs are Prisma-free). Local dev = Docker
  Postgres; tests = ephemeral Postgres — see `../local-dev.md`. Works on
  Node/Vercel/Cloudflare (no single-node limit).
- **Identity:** distinct cookies **`bc_owner`** / **`bc_participant`**;
  creator is auto-joined as participant #1 (`isOwner=true`, not `is_owner=1`
  — review-2 DR-13). `participantId` is **never** an action input — resolved
  server-side from `bc_participant` (frozen in WS-0.8). WS-6 uses WS-0's
  **`identity.stub` (cookie-reading mock)** until WS-7 (review-2 DR-15).
- **Editing (req 3):** owner-editable item fields = `name`, `category`,
  `scope`, `baseQty`, `unit`, `note`; `scope`/`baseQty` recompute
  `requiredQty`. **`restoreItem`** brings soft-removed items back (DR-19);
  **`updateTripSettings`** patches `{ tentCapacity }` (DR-21);
  **`deleteTrip`** hard-deletes (DR-20). Tested in WS-2/WS-6/WS-7.
- **Disjoint ownership is *within a wave*:** `services.ts`, `next.config.ts`,
  the packing barrel, `quantities.ts`, and `prisma/schema.prisma` are
  WS-0-owned contracts (WS-2 migrates from `schema.prisma` but never edits
  it). The stub `lib/packing/generate.ts` is a WS-0→WS-1 (intra-Wave-2)
  temporal handoff; `next.config.ts` and `lib/services.ts` are WS-0→WS-8
  (Wave-1→Wave-3) temporal handoffs — see the Temporal-handoff table in
  `../workstreams.md` (review-2 DR-12). No Wave-2 stream edits them.
- **`refresh()` discipline (review-2 DR-9):** `refresh` from `next/cache`
  is Server-Actions only (we don't use it). `useRouter().refresh()` from
  `next/navigation` is client-only and is what `RefreshPoller.tsx`
  calls — never conflate the two.
- **`revalidateTag(tag, 'max')` everywhere (review-2 DR-8).** The
  single-arg overload is deprecated.
- **Action error envelope (review-2 DR-28; review-3 DR-39):** every
  Server Action returns `Result<T>` from `lib/trips/result.ts`
  (**WS-0-owned** so WS-6 has the shape pre-WS-7). `ErrorCode` is a
  closed union of exactly 5 codes — adding one is a contract bump.
  `redirect()` and `notFound()` throw framework errors and are called
  **outside** the try/catch (Form A) or the catch calls
  `unstable_rethrow(err)` first (Form B) — review-3 DR-45 pins the
  template. One `console.error('[bc.action]', …)` per failure.
- **`cookies()` is async** (review-3 DR-42) — every action and
  identity helper does `const jar = await cookies()` first. To clear
  a path-scoped cookie use `jar.set(name, '', { path, maxAge: 0 })`,
  **not `jar.delete(name)`** (review-3 DR-40).
- **Abuse control + retention (review-2 DR-24/DR-20):** participant cap
  per trip = 50 (typed error); `deleteTrip` is the v1 retention story
  (no auto-expiry).
- **Privacy (review-2 DR-17/DR-18):** trip pages are noindex/nofollow;
  prod pins `experimental.serverActions.allowedOrigins`.

## Cross-stream integration points (the seams)

The only places streams touch — all resolved by **WS-8** at Wave 3, so
parallel work never blocks.

| ID | Seam | Producer → Consumer | Resolution |
|----|------|---------------------|------------|
| **I-1** | `StylePicker` placeholder on campsite detail | WS-6 → WS-5 | WS-8.2 swaps placeholder for the real component |
| **I-2** | Identity helpers on trip page | WS-7 → WS-6 | WS-6 imports from WS-0's `lib/trips/identity.stub` (cookie-reading mock against in-memory storage — review-2 DR-15); WS-8.2 rewrites imports to WS-7's real `lib/trips/identity` |
| **I-3** | stub `generate.ts` → real engine | WS-1 → WS-7 | WS-1 replaces only `generate.ts`; WS-0-owned barrel/`quantities.ts` unchanged; frozen export set asserted by T0.11; verified by WS-8.2 |
| **I-4** | In-memory fake → Prisma/Neon | WS-2 → WS-7/WS-5/WS-6 | `services.ts` `BEARCAMP_BACKEND`; WS-8.1 flips default |
| **I-5** | Fixtures → seed dataset | WS-3 → WS-5 | `services.ts` `getCampsiteSource()`; WS-8.1 flips |
| **I-6** | UI primitives surface | WS-4 → WS-5/WS-6 | `components/app/index.ts` barrel frozen in WS-4.5 |
| **I-7** | `prisma db seed` ← `loadSeed()` + `campsites.seed.json` | WS-3 → WS-2 | WS-2 unit-tests on a mini-fixture; WS-8.1 wires WS-3's `loadSeed()` for full integration (review-2 DR-16) |
