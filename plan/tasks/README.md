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

These overrode earlier wording — see `../review-remediation.md` for the full
trace. They are binding for every stream:

- **Packing ownership:** WS-0 permanently owns `lib/packing/index.ts` **and**
  `lib/packing/quantities.ts`. WS-1 owns only `templates.ts`/`rules.ts`/
  `generate.ts`/tests and replaces *only* the stub `generate.ts`. The barrel
  export set `{ generate, requiredQty, TENT_CAPACITY }` is frozen (WS-0.14,
  test T0.11).
- **Persistence (DR-6):** **Neon serverless Postgres + Prisma**
  (`@prisma/adapter-neon`). `prisma/schema.prisma` is a **WS-0 contract**;
  WS-2 owns migrations/seed/Docker. The `StorageAdapter` interface is **fully
  async**; `@prisma/client` is confined to `lib/db/*` (DTOs are Prisma-free).
  Local dev = Docker Postgres; tests = ephemeral Postgres — see
  `../local-dev.md`. Works on Node/Vercel/Cloudflare (no single-node limit).
- **Identity:** distinct cookies **`bc_owner`** / **`bc_participant`**;
  creator is auto-joined as participant #1. `participantId` is **never** an
  action input — resolved server-side from `bc_participant` (frozen in
  WS-0.8).
- **Editing (req 3):** owner-editable item fields = `name`, `category`,
  `scope`, `baseQty`, `unit`, `note`; `scope`/`baseQty` recompute
  `requiredQty`. Tested in WS-2/WS-6/WS-7.
- **Disjoint ownership is *within a wave*:** `services.ts`, `next.config.ts`,
  the packing barrel, `quantities.ts`, and `prisma/schema.prisma` are
  WS-0-owned contracts (WS-2 migrates from `schema.prisma` but never edits
  it); seam files are WS-0→WS-8 temporal handoffs, not concurrent shared
  files. No Wave-2 stream edits them.

## Cross-stream integration points (the seams)

The only places streams touch — all resolved by **WS-8** at Wave 3, so
parallel work never blocks.

| ID | Seam | Producer → Consumer | Resolution |
|----|------|---------------------|------------|
| **I-1** | `StylePicker` placeholder on campsite detail | WS-6 → WS-5 | WS-8.2 swaps placeholder for the real component |
| **I-2** | Identity helpers on trip page | WS-7 → WS-6 | WS-6 mocks `assertOwner/Participant`; WS-8.2 wires real |
| **I-3** | stub `generate.ts` → real engine | WS-1 → WS-7 | WS-1 replaces only `generate.ts`; WS-0-owned barrel/`quantities.ts` unchanged; frozen export set asserted by T0.11; verified by WS-8.2 |
| **I-4** | In-memory fake → Prisma/Neon | WS-2 → WS-7/WS-5/WS-6 | `services.ts` `BEARCAMP_BACKEND`; WS-8.1 flips default |
| **I-5** | Fixtures → seed dataset | WS-3 → WS-5 | `services.ts` `getCampsiteSource()`; WS-8.1 flips |
| **I-6** | UI primitives surface | WS-4 → WS-5/WS-6 | `components/app/index.ts` barrel frozen in WS-4.5 |
