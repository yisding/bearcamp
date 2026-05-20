# WS-8 — Integration, Validation & Hardening

**Wave:** 3 · **Critical path:** yes · **Depends on:** WS-1, WS-2, WS-3, WS-7
complete; WS-5, WS-6 functional · **Start when:** Wave 2 converged

**Owned paths:** `lib/services.ts` *(Wave-1→Wave-3 temporal handoff from
WS-0 — WS-0 wrote the default memory+fixtures version, WS-8 re-points to
prisma+seed; review-2 DR-12)*, `next.config.ts` *(Wave-1→Wave-3 temporal
handoff from WS-0 — WS-0 set `cacheComponents` + dev toggles, WS-8 adds
`experimental.serverActions.allowedOrigins`)*, `e2e/*`, root `README.md`,
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
- [ ] **WS-8.3** Cache Components audit — (a) ensure every
  uncached/runtime read (DB, `cookies()`, `searchParams`, `params`) is
  under `<Suspense>` or `'use cache'`; campsite reads tagged + the
  `revalidate-campsites` route verified to call `revalidateTag(...,
  'max')` (review-2 DR-8); trip pages uncached; (b)
  **non-deterministic-op audit (review B5):** assert `lib/ids.ts`,
  `crypto.randomUUID`, `Date.now`, `Math.random` are **not reachable
  from any `'use cache'`/prerendered scope** (only Server Actions) —
  e.g. a static import-graph check + grep guard test. (c) **Refresh-API
  audit (review-2 DR-9):** grep that `refresh` imported from
  `next/cache` is **only** used inside Server Actions (we currently use
  it never); `useRouter().refresh()` from `next/navigation` is **only**
  used in Client Components; the two are never confused. (d) **Static-
  shell privacy:** no route with `unstable_instant = { prefetch:
  'static' }` reads `cookies()` in a cached scope — assert via the same
  import-graph check. Fix all "uncached data outside `<Suspense>`"
  build errors. **DoD:** `next build` has zero blocking-route errors;
  every guard test is green.

- [ ] **WS-8.3c** CSRF origin pin — in production `next.config.ts`, set
  `experimental.serverActions.allowedOrigins` to the deployment host(s)
  list (review-2 DR-18). A test snapshots the prod config + asserts the
  list is non-empty when `NODE_ENV==='production'`. **DoD:** prod build
  emits the option; dev unaffected.

- [ ] **WS-8.3d** X-Robots-Tag header on trip routes — in
  `next.config.ts` add `async headers()` returning a rule for
  `/trips/:tripId*` setting `X-Robots-Tag: noindex, nofollow`
  (review-3 DR-51 — belt-and-braces beyond the `<meta>` tag, survives
  CDN configs that strip head metas). **DoD:** an HTTP GET against
  `/trips/<any>` returns `X-Robots-Tag: noindex, nofollow` (T8.6
  extended).

- [ ] **WS-8.3e** No-magic-numbers grep guard — assert the literals
  `50`, `12`, and `20` (as a participant cap / tent max / page-size
  cap) appear only in `lib/limits.ts` (review-3 DR-43). Catches
  accidental re-introduction during polish passes. **DoD:** grep test
  green on the integrated tree.

- [ ] **WS-8.3f** Static-metadata audit — assert
  `app/trips/[tripId]/page.tsx`'s `generateMetadata` does **not** call
  `cookies()`, `headers()`, or any DB function — static metadata only,
  per `generate-metadata.md` Cache-Components guidance (review-3
  DR-52). If we later need dynamic metadata, the DynamicMarker pattern
  from the installed doc applies. **DoD:** an import-graph test
  asserts `generateMetadata` is reachable only from static helpers.
- [ ] **WS-8.4** Instant validation — add the `unstable_instant` **route
  exports** (not a config key — review I-B) on `/`, `/campsites`,
  `/campsites/[id]`; fix violations; confirm `app/trips/layout.tsx`
  `unstable_instant = false`; verify in Instant Navs DevTools (page load
  **and** sibling client nav). **DoD:** validation green.
- [ ] **WS-8.5** E2E — `@next/playwright`: `instant()` assertions for
  landing→campsites and campsites→detail; full trip flow (create, copy
  link, second user joins with a fresh cookie jar, claims, still-needed
  + per-person scaling); **trip page response carries `<meta
  name="robots" content="noindex,nofollow">`** (review-2 DR-17); **a
  third browser context whose cookie jar already has a
  `bc_participant` cookie for *another* trip still sees the Join dialog
  on this trip** (DR-35); **`deleteTrip` from the owner removes the
  trip and redirects to `/`** (DR-20). **DoD:** e2e green in CI.
- [ ] **WS-8.6** Accessibility — keyboard nav, labels, focus, contrast, tap
  targets across all pages (use the chrome-devtools a11y skill). **DoD:** no
  critical a11y findings.
- [ ] **WS-8.7** Build & cleanup — `next build` green; RSC/bundle sanity;
  remove stub/fixture code from the prod path (keep for tests). **DoD:**
  production build clean.
- [ ] **WS-8.8** Docs — root `README.md`: local setup (`docker compose
  up`, `pnpm i`, `pnpm prisma migrate dev`, `pnpm prisma db seed`,
  `pnpm dev` — mirrors `../local-dev.md`), env vars (`DATABASE_URL`,
  `DIRECT_URL`, `BEARCAMP_BACKEND`, `RIDB_API_KEY`), **D1–D9** caveats
  incl. **Neon + Prisma**, best-effort seed accuracy, catalog-
  revalidation limitation, **last-write-wins concurrency (D8),
  owner-recovery non-recoverable (D8), participant cap (D7), retention
  (D7), trip URLs non-indexable (D7)**; tick `../milestones.md` boxes;
  serve optional `app/api/health/route.ts`. **DoD:** a fresh clone
  runs from the README.
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
- [ ] **T8.4** cache audit — `next build` exits 0 with zero "uncached
  data outside `<Suspense>`" / blocking-route errors; **non-determinism
  guard: `lib/ids`/`crypto.randomUUID`/`Date.now`/`Math.random`
  unreachable from any `'use cache'` scope** (review B5); **refresh-API
  guard: `import { refresh } from 'next/cache'` confined to Server
  Actions; `useRouter().refresh()` confined to Client Components**
  (review-2 DR-9); **CSRF guard: `experimental.serverActions.allowed
  Origins` is set when `NODE_ENV==='production'`** (DR-18);
  **X-Robots-Tag header rule present for `/trips/:tripId*`** (review-3
  DR-51); **no-magic-numbers grep green** (DR-43);
  **`cookies().delete()` is not used anywhere — only `cookies().set('',
  { maxAge: 0 })`** (DR-40); **`generateMetadata` for `/trips/[tripId]`
  contains no cookies/DB reads** (DR-52). _(WS-8.3/8.3c/8.3d/8.3e/8.3f)_
- [ ] **T8.5** instant validation — build-time `unstable_instant` validation
  green for `/`, `/campsites`, `/campsites/[id]`; trips opted out;
  `instant()` e2e green. _(WS-8.4/8.5)_
- [ ] **T8.6** multi-user e2e on Postgres + seed — full
  share/join/claim flow + per-person scaling green; **trip page emits
  both `<meta name="robots" content="noindex, nofollow">` AND the
  `X-Robots-Tag: noindex, nofollow` response header** (review-2 DR-17;
  review-3 DR-51); **51st joiner gets the cap toast with the canonical
  `"This trip is full (50 people)."` message** (DR-24; review-3 DR-46);
  **owner deletes trip → redirect to `/`, both Set-Cookie headers carry
  `Max-Age=0` and the matching path** (DR-20; review-3 DR-40); **a
  second browser context on the deleted trip hits the unified
  not-found page on next refresh** (review-3 DR-47). _(WS-8.5)_
- [ ] **T8.7** a11y — automated axe scan on key pages: no critical
  violations. _(WS-8.6)_
- [ ] **T8.8** fresh-clone — CI `pnpm i && pnpm build` (+ `pnpm test`)
  green. _(WS-8.7/8.8)_

## Seams you resolve

All of them: **I-1** (WS-8.2), **I-2** (WS-8.2), **I-3** (WS-8.2),
**I-4** (WS-8.1), **I-5** (WS-8.1), **I-6** (verify WS-4 barrel consumed
correctly). See `README.md` in this folder for the seam table.
