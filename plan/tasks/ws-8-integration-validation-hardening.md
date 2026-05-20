# WS-8 — Integration, Validation & Hardening

**Wave:** 3 · **Critical path:** yes · **Depends on:** WS-1, WS-2, WS-3, WS-7
complete; WS-5, WS-6 functional · **Start when:** Wave 2 converged

**Owned paths:** `lib/services.ts` (final repoint), `e2e/*`, root `README.md`,
`Dockerfile`, CI config (incl. Postgres service + `prisma migrate deploy`).

> Resolves every cross-stream seam (I-1…I-6) and proves the whole app on the
> real DB + seed. No other stream touches these integration points.

## Tasks

- [ ] **WS-8.1** Flip the seam — `lib/services.ts`: default
  `BEARCAMP_BACKEND=prisma` → WS-2 Prisma/Neon storage; `getCampsiteSource()`
  → WS-3 seed (**I-4, I-5**); `prisma migrate deploy` + `prisma db seed`
  (WS-2.11) provision the DB; keep memory+fixtures for tests. **DoD:** app
  runs on Neon (or local Docker Postgres) + seed; tests still use fakes.
- [ ] **WS-8.2** Wire real logic — point WS-7 actions at real WS-1 `generate`
  + WS-2 Prisma repos (**I-3, I-4**); resolve WS-5's `StylePicker`
  placeholder to the real WS-6 component (**I-1**); wire WS-6 identity to
  real WS-7 (**I-2**). **DoD:** all unit/integration suites green end-to-end
  on ephemeral Postgres.
- [ ] **WS-8.3** Cache Components audit — (a) ensure every uncached/runtime
  read (DB, `cookies()`, `searchParams`, `params`) is under `<Suspense>` or
  `'use cache'`; campsite reads tagged + the `revalidate-campsites` route
  verified; trip pages uncached; (b) **non-deterministic-op audit (review
  B5):** assert `lib/ids.ts`, `crypto.randomUUID`, `Date.now`,
  `Math.random` are **not reachable from any `'use cache'`/prerendered
  scope** (only Server Actions) — e.g. a static import-graph check + grep
  guard test. Fix all "uncached data outside `<Suspense>`" build errors.
  **DoD:** `next build` has zero blocking-route errors; the non-determinism
  guard test is green.
- [ ] **WS-8.4** Instant validation — add the `unstable_instant` **route
  exports** (not a config key — review I-B) on `/`, `/campsites`,
  `/campsites/[id]`; fix violations; confirm `app/trips/layout.tsx`
  `unstable_instant = false`; verify in Instant Navs DevTools (page load
  **and** sibling client nav). **DoD:** validation green.
- [ ] **WS-8.5** E2E — `@next/playwright`: `instant()` assertions for
  landing→campsites and campsites→detail; full trip flow (create, copy link,
  second user joins with a fresh cookie jar, claims, still-needed +
  per-person scaling). **DoD:** e2e green in CI.
- [ ] **WS-8.6** Accessibility — keyboard nav, labels, focus, contrast, tap
  targets across all pages (use the chrome-devtools a11y skill). **DoD:** no
  critical a11y findings.
- [ ] **WS-8.7** Build & cleanup — `next build` green; RSC/bundle sanity;
  remove stub/fixture code from the prod path (keep for tests). **DoD:**
  production build clean.
- [ ] **WS-8.8** Docs — root `README.md`: local setup (`docker compose up`,
  `pnpm i`, `pnpm prisma migrate dev`, `pnpm prisma db seed`, `pnpm dev` —
  mirrors `../local-dev.md`), env vars (`DATABASE_URL`, `DIRECT_URL`,
  `BEARCAMP_BACKEND`, `RIDB_API_KEY`), D1–D6 caveats incl. **Neon + Prisma**,
  best-effort seed accuracy, catalog-revalidation limitation; tick
  `../milestones.md` boxes; serve optional `app/api/health/route.ts`.
  **DoD:** a fresh clone runs from the README.
- [ ] **WS-8.9** Deploy path — `Dockerfile` (`next start`); document Vercel
  (Neon branch per preview) and the Cloudflare/OpenNext caveat; CI runs
  `prisma migrate deploy` against `DIRECT_URL` as a release step (never at
  request time). **DoD:** `Dockerfile` builds & boots against a Neon URL;
  deploy doc matches `../local-dev.md` matrix.
- [ ] **WS-8.10** CI *(optional)* — typecheck + test (Postgres service via
  Testcontainers) + build (+ e2e) on PR. **DoD:** pipeline green on a
  sample PR.

## Acceptance criteria — write these tests first (red → green)

These gate integration; most reuse Wave-2 suites unchanged.

- [ ] **T8.1** services flip — `BEARCAMP_BACKEND=prisma`: `getStorage`=
  Prisma/Neon, `getCampsiteSource`=seed; `prisma migrate deploy` +
  `db seed` provision a fresh DB (count>0). _(WS-8.1)_
- [ ] **T8.2** contracts on real impls — `storageContract(prisma)` &
  `actionsContract(real generate + Prisma)` green **unchanged** vs the fake
  run. _(WS-8.2)_
- [ ] **T8.3** real generate — createTrip output matches WS-1 snapshots (not
  the stub). _(WS-8.2)_
- [ ] **T8.4** cache audit — `next build` exits 0 with zero "uncached data
  outside `<Suspense>`" / blocking-route errors; **non-determinism guard:
  `lib/ids`/`crypto.randomUUID`/`Date.now`/`Math.random` unreachable from
  any `'use cache'` scope** (review B5). _(WS-8.3)_
- [ ] **T8.5** instant validation — build-time `unstable_instant` validation
  green for `/`, `/campsites`, `/campsites/[id]`; trips opted out;
  `instant()` e2e green. _(WS-8.4/8.5)_
- [ ] **T8.6** multi-user e2e on Postgres + seed — full share/join/claim flow
  + per-person scaling green. _(WS-8.5)_
- [ ] **T8.7** a11y — automated axe scan on key pages: no critical
  violations. _(WS-8.6)_
- [ ] **T8.8** fresh-clone — CI `pnpm i && pnpm build` (+ `pnpm test`)
  green. _(WS-8.7/8.8)_

## Seams you resolve

All of them: **I-1** (WS-8.2), **I-2** (WS-8.2), **I-3** (WS-8.2),
**I-4** (WS-8.1), **I-5** (WS-8.1), **I-6** (verify WS-4 barrel consumed
correctly). See `README.md` in this folder for the seam table.
