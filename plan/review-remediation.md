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
- **DR-5 — Catalog cache invalidation (I-A).** Campsite detail pins
  `cacheLife('days')`; search uses `cacheLife('hours')`; both tagged
  `campsites`. A dev-only Route Handler `app/api/revalidate-campsites/route.ts`
  calls `revalidateTag('campsites')` (Route Handlers may call `revalidateTag`
  per installed docs); importer/reseed pings it. Documented limitation:
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
| **G5** seed realism hand-waved | DR-? accuracy caveat; RIDB→Amenities mapping table + `bearRegions` deliverables | `README.md`, `tasks/ws-3` |
| **G6** write contention | Moot under DR-6 — Postgres handles concurrency; atomic multi-writes via `prisma.$transaction` | `data-model.md`, `tasks/ws-2` |
| **DR-6** persistence pivot | Neon + Prisma; async `StorageAdapter`; local Docker dev; deployment resolved (Vercel/Cloudflare/Node) | all core docs + `local-dev.md` (new) |
| **G7** token entropy | `token()` ≥128-bit; T0.4 length assertion | `README.md`, `tasks/ws-0` |
| **G8** empty/not-found coverage | Zero-results test; trip `notFound()` in WS-6.2 | `tasks/ws-5`, `tasks/ws-6` |
| **M** `items.reorder` arg list unpinned | Pin signature in data model + WS-0.4/0.8 | `data-model.md`, `tasks/ws-0` |
| **M** `api/health` orphan | Reassigned to WS-8 (kept optional) | `architecture.md`, `tasks/ws-8` |

Items the review explicitly validated as **already correct** (no change):
`unstable_instant` static/`false` semantics, `updateTag` vs `revalidateTag`
placement, async `params`/`searchParams`, `'use cache'` not in Route Handler
bodies, shared contract suites (WS-0.15) wiring, consistent test frameworks.
