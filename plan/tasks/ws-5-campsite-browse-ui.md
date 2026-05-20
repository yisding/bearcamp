# WS-5 — Campsite Browse UI

**Wave:** 2 (parallel) · **Critical path:** no · **Depends on:** WS-0 fakes;
WS-4 primitives (soft — can stub) · **Start when:** WS-0 merged

**Owned paths:** `app/page.tsx`, `app/campsites/**`,
`components/campsites/*`.

> Builds against the WS-0 fixture `CampsiteSource` and WS-4 barrel. The
> campsite detail page renders WS-6's `StylePicker` via a placeholder
> (**I-1**) until integration.

## Tasks

- [ ] **WS-5.1** Landing — `app/page.tsx`: pitch + prominent search entry →
  `/campsites`; `export const unstable_instant = { prefetch: 'static' }`.
  **DoD:** static shell; instant nav validated.
- [ ] **WS-5.2** Search shell — `app/campsites/layout.tsx`: persistent search
  region across child nav. **DoD:** layout preserved on sibling nav.
- [ ] **WS-5.3** Browse page — `app/campsites/page.tsx`: `await
  searchParams`; call cached `search()` (WS-3 surface, fixture-backed
  for now); render results in `<Suspense fallback={<ListSkeleton/>}>`;
  pagination uses the server-clamped `pageSize` (≤50, default 20 —
  review-2 DR-23); `export const unstable_instant = { prefetch:
  'static' }`. **DoD:** static parts in shell, results stream; no
  "uncached data outside `<Suspense>`"; manipulating
  `?pageSize=500` does not return more than 50 rows.
- [ ] **WS-5.4** Search bar — `components/campsites/SearchBar.tsx`
  (`'use client'`): debounced; writes `?q=&state=&agency=&amenities[]`;
  reads current params; uses `URLSearchParams` in the handler to avoid
  re-render thrash. **DoD:** typing updates URL & results; back/forward works.
- [ ] **WS-5.5** Campsite card — `components/campsites/CampsiteCard.tsx`
  (server): name, agency, state, top amenity chips; links via
  `routes.campsite`. **DoD:** keyboard-focusable; renders from fixture.
- [ ] **WS-5.6** Detail page — `app/campsites/[id]/page.tsx`: `await params`;
  cached detail (`'use cache'` + `cacheTag('campsites')` + **`cacheLife
  ('days')`** — pinned, review I-A); `AmenityGrid`; render `StylePicker`
  placeholder (**I-1**). Resolve `params` inline (`params.then(...)`) into
  the cached child so it gets a plain id. **DoD:** detail renders;
  `notFound()` on bad id.
- [ ] **WS-5.7** Not found — `app/campsites/[id]/not-found.tsx`. **DoD:**
  friendly 404 for unknown campsite.
- [ ] **WS-5.8** Amenity grid — `components/campsites/AmenityGrid.tsx`
  (server): icon + human label per `Amenities` field (lucide). **DoD:**
  covers all amenity fields incl. enum values.
- [ ] **WS-5.9** Instant audit — verify in Instant Navs DevTools: page load
  **and** sibling client nav both produce a correct static shell; fix
  Suspense placement. **DoD:** no instant-validation errors on `/`,
  `/campsites`, `/campsites/[id]`.

## Acceptance criteria — write these tests first (red → green)

RTL + @next/playwright (fixtures backend). Author first.

- [ ] **T5.1** SearchBar — typing debounced-writes
  `?q/state/agency/amenities`; mounts prefilled from current params.
  _(WS-5.4)_
- [ ] **T5.2** CampsiteCard — renders name/agency/state; links
  `routes.campsite(id)`; focusable. _(WS-5.5)_
- [ ] **T5.3** AmenityGrid — one labeled entry per `Amenities` field incl.
  enum values. _(WS-5.8)_
- [ ] **T5.4** browse e2e — `/campsites` lists fixtures; `?q=` filters;
  pagination; skeleton → results; **zero-results query shows `EmptyState`,
  not a crash** (review G8). _(WS-5.3)_
- [ ] **T5.5** detail e2e — `/campsites/[id]` shows amenities + StylePicker
  placeholder; bad id → 404 not-found. _(WS-5.6/5.7)_
- [ ] **T5.6** `instant()` — landing→`/campsites` and `/campsites`→detail:
  cached/static content in the instant shell; results stream after.
  _(WS-5.1/5.3/5.9)_
- [ ] **T5.7** build gate — `next build` reports no blocking-route /
  "uncached outside `<Suspense>`" error for these routes. _(WS-5.3/5.9)_

## Seams you participate in

- **I-1** (consumer): `StylePicker` placeholder; WS-8.2 swaps in the real
  WS-6 component.
- **I-5** (consumer): fixture source → seed; flips via `services.ts` (WS-8.1).
- **I-6** (consumer): import UI only from the WS-4 `components/app` barrel.
