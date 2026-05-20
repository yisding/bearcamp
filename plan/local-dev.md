# Local Development & Deployment

Persistence is **Neon (serverless Postgres) + Prisma** (decision DR-6,
supersedes the SQLite choice). The same `DATABASE_URL` contract drives local,
test, preview, and production — only the URL changes.

## Local dev (default: Docker Postgres)

```bash
docker compose up -d            # local Postgres at localhost:5432
cp .env.example .env            # DATABASE_URL=postgresql://bearcamp:bearcamp@localhost:5432/bearcamp
pnpm install
pnpm prisma migrate dev         # apply migrations + generate @prisma/client
pnpm prisma db seed             # load data/campsites.seed.json
pnpm dev
```

`docker-compose.yml` (WS-2-owned) runs a single `postgres:16` with a named
volume. `.env` is gitignored; `.env.example` is committed. No native build,
no `.data/` directory.

**Alternative — Neon dev branch:** instead of Docker, point `DATABASE_URL`
at a personal Neon branch (`neonctl branches create`). Identical workflow
(`prisma migrate dev` / `db seed`). Useful when Docker isn't available.

## Tests

- **Unit / parallel-dev:** the WS-0 in-memory repository fake (no DB) — fast,
  used by every Wave-2 stream and by `storageContract`/`actionsContract`.
- **Integration (WS-2, WS-8):** an **ephemeral Postgres** — Testcontainers
  (`postgres:16`) in CI, or the Docker Compose instance locally. A fresh
  schema is applied per run via `prisma migrate deploy`; `storageContract`
  runs against this real DB **unchanged** from the fake run.

## Environments & connection strings

| Env | DB | URL |
|---|---|---|
| Local | Docker Postgres (or Neon dev branch) | `DATABASE_URL` (direct) |
| CI tests | Testcontainers Postgres | ephemeral `DATABASE_URL` |
| Preview (per PR) | **Neon branch** (auto-created) | pooled `DATABASE_URL` + `DIRECT_URL` |
| Production | Neon primary | pooled `DATABASE_URL` + `DIRECT_URL` |

- App queries use the **pooled** Neon URL via `@prisma/adapter-neon` —
  default is the **HTTP** driver (serverless-safe, no connection-pool
  exhaustion). HTTP supports array-form `$transaction([...])` only — no
  interactive callback transactions; our code does not need them
  (review-2 G-tx).
- Prisma **migrations** use `DIRECT_URL` (unpooled) — required by
  `prisma migrate`. The first migration runs
  `CREATE EXTENSION IF NOT EXISTS pg_trgm;` and creates GIN trigram
  indexes with `gin_trgm_ops` (WS-2.3, review-2 G-trgm).
- `prisma generate` runs in `postinstall` and in the build; `prisma migrate
  deploy` runs as a release step (CI), never at request time.

## Deployment — now works on every target

Because Neon is network Postgres reachable over HTTP/WebSocket, the earlier
SQLite single-node constraint is gone:

| Target | Works? | Notes |
|---|---|---|
| Node container / VPS / Fly | ✅ | `next start`; `DATABASE_URL` → Neon |
| **Vercel** | ✅ | the original blocker is resolved; Neon branch per preview deploy |
| Cloudflare Workers (OpenNext) | ✅ (driver-compatible) | Neon serverless driver runs on workerd; Next-on-CF adapter still must pass the compat suite (verify) |

No persistent volume, no single-replica constraint, no WAL/`busy_timeout`.
Multi-instance is fine (Postgres handles concurrency); Cache Components
multi-instance consistency still benefits from a shared `cacheHandlers`
backend per the Next.js deploying guide, unchanged by this decision.
