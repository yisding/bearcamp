# Bearcamp

Plan a camping trip, generate a packing list tailored to the campsite and
trip style, share the link, claim items so no one shows up with two stoves.

Built on Next.js 16.2.6 (Cache Components + Instant Navigations + Server
Actions), React 19, Prisma 7 on Neon-compatible Postgres, Tailwind v4, and
shadcn/Radix primitives.

## Quick start

```bash
# 1. Local Postgres
docker compose up -d

# 2. Env (copy and edit if you want)
cp .env.example .env

# 3. Install
pnpm i

# 4. Migrate + seed
pnpm prisma migrate dev
pnpm prisma db seed

# 5. Dev server
pnpm dev
```

Open <http://localhost:3000>. The dev server is on port 3000.

The default backend is `prisma` (real Prisma/Neon Postgres + the seed
catalog), so running the app locally requires the Postgres setup above —
`docker compose up -d`, `pnpm prisma migrate dev`, `pnpm prisma db seed`.
For a quick DB-free run set `BEARCAMP_BACKEND=memory` in your `.env`
(in-memory fake repos + fixture campsites). `pnpm test` always runs on the
`memory` backend regardless of `.env`.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Next dev server (hot reload, Cache Components dev mode). |
| `pnpm build` | Production build (`next build`). |
| `pnpm start` | Production server (`next start`); assumes a prior `pnpm build`. |
| `pnpm test` | Vitest unit + integration suites (no DB needed by default). |
| `pnpm test:watch` | Vitest in watch mode. |
| `pnpm typecheck` | `tsc --noEmit`. |
| `pnpm lint` | ESLint over the workspace. |
| `pnpm prisma migrate dev` | Create + apply a new migration locally. |
| `pnpm prisma migrate deploy` | Apply pending migrations (CI / production release step). |
| `pnpm prisma db seed` | Load `data/campsites.seed.json` into the DB. |

## Environment variables

`.env.example` is the canonical reference. The variables the app reads:

| Var | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | when `BEARCAMP_BACKEND=prisma` | Pooled URL used by the app at runtime. Neon HTTP driver is auto-selected when the host ends with `.neon.tech`; otherwise `@prisma/adapter-pg` is used. |
| `DIRECT_URL` | for migrations | Unpooled URL used by `prisma migrate` only. |
| `BEARCAMP_BACKEND` | optional | `prisma` (default — real DB + seed dataset) or `memory` (in-process fake repos + fixture campsites, no DB needed). The vitest suite is always pinned to `memory` (`vitest.config.ts`). |
| `BEARCAMP_ALLOWED_ORIGINS` | production | Comma-separated list of CSRF-allowed origins for Server Actions in `NODE_ENV=production`. Defaults to a placeholder; override in your deploy env. |
| `RIDB_API_KEY` | optional | Used by the WS-3 importer script to refresh the seed file from RIDB; not consumed at runtime. |
| `BC_DEV_URL` | optional | If set, `prisma db seed` pings `${BC_DEV_URL}/api/revalidate-campsites` to refresh the cached catalog (DR-50 / DR-57). Leave unset for CLI / CI seed runs. |

## Local development

The default path is Docker Postgres + Prisma. The same `DATABASE_URL` contract
drives local, test, preview, and production — only the URL changes
(`plan/local-dev.md`):

| Env | DB | URL |
| --- | --- | --- |
| Local | Docker Postgres (or Neon dev branch) | `DATABASE_URL` direct. |
| CI tests | Testcontainers Postgres (`postgres:16`) | ephemeral `DATABASE_URL`. |
| Preview (per PR) | Neon branch (auto-created) | pooled `DATABASE_URL` + `DIRECT_URL`. |
| Production | Neon primary | pooled `DATABASE_URL` + `DIRECT_URL`. |

App queries use the pooled URL via `@prisma/adapter-neon` (HTTP). HTTP only
supports the array-form `$transaction([...])` — no interactive callback
transactions (review-2 DR-10). Migrations use the unpooled `DIRECT_URL`; the
first migration runs `CREATE EXTENSION IF NOT EXISTS pg_trgm;` and creates
GIN trigram indexes with `gin_trgm_ops`.

### Without Docker

Use a personal Neon branch:

```bash
neonctl branches create
# then point DATABASE_URL + DIRECT_URL at it in .env
pnpm prisma migrate dev
pnpm prisma db seed
pnpm dev
```

## Deployment

Because Neon is network Postgres reachable over HTTP/WebSocket, the earlier
SQLite single-node constraint is gone:

| Target | Works? | Notes |
| --- | --- | --- |
| Node container / VPS / Fly | yes | `next start`; `DATABASE_URL` → Neon. |
| Vercel | yes | Neon branch per preview deploy. |
| Cloudflare Workers (OpenNext) | yes (driver-compatible) | Neon serverless driver runs on workerd; the Next-on-CF adapter still must pass the compat suite (verify per release). |

`prisma migrate deploy` runs as a release step (CI), never at request time.

### Vercel + Neon checklist (preview + production)

To make Vercel deploys reliable, configure **both** runtime and migration
URLs in Vercel project env vars:

1. In Vercel Project → **Settings → Environment Variables**, add:
   - `DATABASE_URL` = Neon **pooled** connection string
   - `DIRECT_URL` = Neon **direct/unpooled** connection string
   - `BEARCAMP_BACKEND=prisma`
   - `BEARCAMP_ALLOWED_ORIGINS=https://<your-production-domain>`
2. Set each variable for **Preview** and **Production** environments.
3. If your Neon project requires channel binding, include
   `channel_binding=require` in both Neon URLs.
4. Run `prisma migrate deploy` as a CI/release step before (or as part of)
   production rollout; do **not** run migrations in request handlers.
5. Seed only when needed (`pnpm prisma db seed`) and target the same DB branch
   your deploy reads from.

Example:

```bash
DATABASE_URL='postgresql://USER:PASSWORD@<pooled-host>.neon.tech/DB?sslmode=require&channel_binding=require'
DIRECT_URL='postgresql://USER:PASSWORD@<direct-host>.neon.tech/DB?sslmode=require&channel_binding=require'
```

### Docker

The repo ships a multi-stage `Dockerfile` that runs `next build` and then
serves the regular build output with plain `next start` on port 3000. The
config does not set `output: 'standalone'`, so the image carries the full
`.next` output and `node_modules` (one moving part fewer, slightly larger
image):

```bash
docker build -t bearcamp .
docker run --rm -it -p 3000:3000 \
  -e DATABASE_URL='postgresql://USER:PASS@HOST/DB?sslmode=require' \
  -e DIRECT_URL='postgresql://USER:PASS@HOST/DB?sslmode=require' \
  -e BEARCAMP_BACKEND=prisma \
  -e BEARCAMP_ALLOWED_ORIGINS='https://your-host.example.com' \
  bearcamp
```

Run `prisma migrate deploy && prisma db seed` against the same connection
before pointing traffic at the container.

## Tests

- **Unit / parallel-dev:** WS-0 in-memory repository fake (no DB) — fast.
  Used by every Wave-2 stream and by `storageContract` / `actionsContract`.
- **Integration (WS-2, WS-8):** ephemeral Postgres via Testcontainers
  (`postgres:16`). A fresh schema is applied per run via
  `prisma migrate deploy`; `storageContract` runs against this real DB
  unchanged from the fake run. These tests skip locally when Docker isn't
  available.
- **Build-gated tests:** the cache-audit + instant-validation suites have
  optional `next build` assertions gated behind `BEARCAMP_RUN_BUILD_TESTS=1`.
  CI sets this; local devs don't pay the 30–60s build cost on every save.
- **End-to-end (Playwright):** `e2e/*.spec.ts` — instant-navigation
  assertions, trip flow, a11y. The Prisma-only specs in
  `e2e/integration-flow.spec.ts` skip unless `BEARCAMP_BACKEND=prisma` is
  set when the dev server boots.

## Known limitations (D1–D9 from the plan)

These are intentional v1 constraints. They're called out here so a fresh
clone has the full picture without re-reading the plan.

- **D1 — single backend per process.** Switching `BEARCAMP_BACKEND` requires
  a restart; there is no runtime backend swap.
- **D2 — no offline mode.** The app is a thin browser client over the
  Postgres-backed Server Actions. Without network the trip page degrades to
  a stale view (last cached `TripView`) and writes fail with the standard
  `Result<T>` error envelope.
- **D3 — best-effort seed accuracy.** `data/campsites.seed.json` is a
  curated, normalized snapshot — not a live mirror of RIDB / OSM. Refresh
  via `pnpm tsx scripts/import-ridb.ts` and commit the new file.
- **D4 — catalog revalidation is approximate.** `revalidateTag('campsites',
  'max')` (review-2 DR-8) clears the catalog cache across the running
  Next.js instances behind the configured `cacheHandlers`, but multi-region
  deploys may see a brief stale read.
- **D5 — no auth.** Identity is two scoped cookies (`bc_owner`,
  `bc_participant`); there are no user accounts, sessions, or password
  recovery.
- **D6 — single-region writes.** Writes go to the Neon primary. Read traffic
  may benefit from regional pooled connections (DATABASE_URL),
  cross-region writes incur a round-trip penalty.
- **D7 — participant cap + retention.** Each trip caps at
  `PARTICIPANT_CAP_PER_TRIP = 50` (DR-24). Trip URLs are non-indexable
  (DR-17 + DR-51 — `<meta name="robots">` AND `X-Robots-Tag` response
  header). There is no auto-expiry; `deleteTrip` is the only retention
  story (DR-20).
- **D8 — last-write-wins concurrency.** Item-level edits don't use
  optimistic-concurrency tokens; two simultaneous edits resolve as
  last-write-wins. Owner-recovery is **not recoverable** — losing the
  `bc_owner` cookie means losing edit access (DR-20).
- **D9 — Cache Components multi-instance consistency.** Cache Components
  multi-instance consistency benefits from a shared `cacheHandlers` backend
  per the Next.js deploying guide; the default in-memory cache handler is
  fine for single-instance deploys.
- **Instant-navigation `samples` on dynamic routes.** `pnpm build` is fully
  green today; this entry documents a constraint future contributors must
  keep satisfying. A route opted into `unstable_instant = { prefetch:
  'static' }` has its `params` / `searchParams` wrapped in an exhaustive
  proxy during build-time validation: accessing any key not declared in
  `unstable_instant.samples` throws `INSTANT_VALIDATION_ERROR` and fails
  `next build`. Dynamic routes and routes that read search params must
  therefore declare a representative `samples` entry enumerating every key
  they touch. `/campsites/[id]` already pins a fixed seed campsite id
  (`seed:upper-pines-campground-ca`) and the layout-level `SearchBar` keys;
  `/campsites` enumerates its full `searchParams` set — so the build passes. The favicon ships via the static `metadata.icons`
  field (`public/favicon.ico`) instead of the `app/favicon.ico` file
  convention — Next 16's file-based icon metadata is validated as a dynamic
  metadata route and otherwise fails instant validation on the static `/`
  route.

## Architecture

- `app/` — App Router routes. Pages export `unstable_instant = { prefetch:
  'static' }` for cached shells (landing, browse, campsite detail);
  `app/trips/layout.tsx` exports `unstable_instant = false` so trip pages
  are uncached.
- `components/` — `components/ui/*` (shadcn primitives), `components/app/*`
  (PageHeader / Section / skeletons), `components/campsites/*` (browse +
  detail UIs), `components/trips/*` (trip experience).
- `lib/` —
  - `lib/services.ts` — composition root for storage + campsite source
    (the WS-8.1 backend flip lives here).
  - `lib/db/*` — Prisma schema, repositories, the in-memory fake, and
    `view.ts` (TripView builder).
  - `lib/campsites/*` — fixture + seed sources, search helpers.
  - `lib/packing/*` — base templates, amenity rules, generator, scaling.
  - `lib/trips/*` — Server Actions, identity helpers, action schemas, the
    `Result<T>` envelope.
- `prisma/` — schema, migrations, seed script.

## Health check

`GET /api/health` returns `{ ok: true, backend: 'memory' | 'prisma' }` for
liveness probes. The endpoint is intentionally unauthenticated.

## License

Private — internal project.
