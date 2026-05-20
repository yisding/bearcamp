# WS-6 — Trip Experience UI

**Wave:** 2 (parallel) · **Critical path:** no · **Depends on:** WS-0 fakes +
action types; WS-4 primitives (soft) · **Start when:** WS-0 merged

**Owned paths:** `app/trips/**`, `components/trips/*`.

> Builds against in-memory storage, WS-0 action signatures, and mocked WS-7
> identity helpers (**I-2**). Full flow must work before WS-7/WS-2 land.

## Tasks

- [ ] **WS-6.1** Trips layout — `app/trips/layout.tsx`:
  `export const unstable_instant = false` (per-user/dynamic). **DoD:** opts
  trip routes out of instant validation without affecting the rest.
- [ ] **WS-6.2** Trip page — `app/trips/[tripId]/page.tsx`: `await params`;
  load `TripView` via `services` storage; **if `buildTripView` returns
  `null`, call `notFound()`** (review G8); render inside `<Suspense>`
  (uncached); resolve identity via WS-7 helpers (mock until WS-7 — **I-2**).
  Sections: header (name/campsite/style/share), Join banner, `PackingList`,
  `StillNeeded`, `WhoIsBringing`. **DoD:** full page renders from in-memory
  storage; unknown id → not-found.
- [ ] **WS-6.3** Style picker — `components/trips/StylePicker.tsx`: form →
  `createTrip` action (WS-0 signature); car|backpacking;
  `useActionState` pending. **DoD:** submitting creates a trip (stub action)
  and redirects.
- [ ] **WS-6.4** Packing list — `components/trips/PackingList.tsx` (server):
  group items by fixed category order; render `ItemRow`; owner-only
  add/rename/remove gated by `isOwner`. **DoD:** grouping + ordering match
  `../packing-engine.md`.
- [ ] **WS-6.5** Item row — `components/trips/ItemRow.tsx` (`'use client'`):
  show `claimed/needed` + shortfall; claim/unclaim with qty (default =
  shortfall); **owner inline-edit of `name`/`category`/`scope`/`baseQty`/
  `unit`/`note`** (review G1) + remove; calls `claimItem`/`unclaimItem`/
  `updateItem`/`removeItem`; optimistic + pending. **DoD:** claim changes
  reflected after action resolves; editing `scope`/`baseQty` visibly
  recomputes `needed` after refresh.
- [ ] **WS-6.6** Join dialog — `components/trips/JoinTripDialog.tsx`
  (`'use client'`): shown when no participant cookie; name → `joinTrip`.
  **DoD:** joining adds participant and dismisses.
- [ ] **WS-6.7** Share link — `components/trips/ShareLink.tsx`
  (`'use client'`): copy `location.href` via `navigator.clipboard`; toast;
  copy noting the link grants access. **DoD:** copies URL; accessible button.
- [ ] **WS-6.8** Still needed — `components/trips/StillNeeded.tsx` (server):
  items with `shortfall>0`, shown as `claimed/needed`. **DoD:** matches view
  math.
- [ ] **WS-6.9** Who's bringing — `components/trips/WhoIsBringing.tsx`
  (server): claims grouped by participant with item + qty. **DoD:** reflects
  all claims.
- [ ] **WS-6.10** Refresh poller — `components/trips/RefreshPoller.tsx`
  (`'use client'`): `router.refresh()` every ~5–10 s + manual button; pause
  when `document.hidden`. Read `node_modules/next/dist/docs/01-app/02-guides/
  preserving-ui-state.md` — with Cache Components, client state is preserved
  across refresh; the poll **must not clobber an in-progress claim-qty input
  or the Join dialog** (review G3). **DoD:** others' changes appear without
  manual reload **and** a focused/edited input survives a background refresh.
- [ ] **WS-6.11** Not found — `app/trips/[tripId]/not-found.tsx`. **DoD:**
  friendly 404 for bad/unknown trip.
- [ ] **WS-6.12** Add custom item — owner form (category select, name, scope,
  qty, unit, note) → `addItem`. **DoD:** custom item appears with
  `source:'custom'`.
- [ ] **WS-6.13** Flow check — against in-memory storage + stub actions:
  create → edit → share → join (second cookie jar) → claim → still-needed
  updates → per-person scaling visible. **DoD:** end-to-end works pre-WS-7/2.

## Acceptance criteria — write these tests first (red → green)

RTL + @next/playwright (in-memory backend, stub actions). Author first.

- [ ] **T6.1** StylePicker — renders car|backpacking; submit invokes
  `createTrip` with style; pending shown. _(WS-6.3)_
- [ ] **T6.2** PackingList — items grouped in fixed category order;
  owner-only affordances gated by `isOwner`. _(WS-6.4)_
- [ ] **T6.3** ItemRow — shows claimed/needed/shortfall; claim defaults
  qty=shortfall and calls `claimItem`; unclaim calls `unclaimItem`;
  pending/optimistic. _(WS-6.5)_
- [ ] **T6.4** JoinTripDialog — shown without participant cookie; submit →
  `joinTrip`; hidden when participant present. _(WS-6.6)_
- [ ] **T6.5** ShareLink — click copies `location.href` (mock clipboard) +
  toast. _(WS-6.7)_
- [ ] **T6.6** StillNeeded / WhoIsBringing — only `shortfall>0` listed;
  claims grouped per participant. _(WS-6.8/6.9)_
- [ ] **T6.7** RefreshPoller — `router.refresh()` on interval (fake timers);
  paused when `document.hidden`; **a background refresh does not clobber an
  open/edited claim-qty input or the Join dialog** (review G3). _(WS-6.10)_
- [ ] **T6.8** full flow e2e — create from fixture → **owner pre-selects
  (claims) items before sharing** → add custom item → copy link → 2nd
  context joins → joiner sees owner's claims under "who's bringing what"
  (review G2) → joiner claims → shortfall drops on refresh → add 3rd
  participant → sleeping-bag needed grows, stove constant. _(WS-6.13)_
- [ ] **T6.9** item editing — owner renames an item (persists), changes
  `baseQty` and `scope` → `needed` recomputes on next render; non-owner
  cannot edit (review G1, req 3). _(WS-6.5)_
- [ ] **T6.10** trip not-found — visiting an unknown `/trips/<id>` renders
  the not-found page, not a crash (review G8). _(WS-6.2/6.11)_

## Seams you participate in

- **I-1** (producer): expose `StylePicker` for WS-5's detail page; WS-8.2
  wires it in.
- **I-2** (consumer): mock `assertOwner/Participant`; WS-8.2 wires real WS-7.
- **I-4** (consumer): in-memory fake → Prisma/Neon via `services.ts` (WS-8.1).
- **I-6** (consumer): import UI only from the WS-4 `components/app` barrel.
