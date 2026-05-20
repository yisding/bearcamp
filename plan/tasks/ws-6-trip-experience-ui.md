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
  (uncached); resolve identity via WS-7 helpers (use WS-0's
  `identity.stub` until WS-7 — **I-2**, review-2 DR-15). Sections:
  header (name/campsite/style/tentCapacity/share), Join banner,
  `PackingList`, `StillNeeded`, `WhoIsBringing`, **`NoLongerNeeded`
  (removed items with live claims — review-2 DR-19)**, `TripSettings`
  (owner-only). **Export `generateMetadata` returning `{ robots: { index:
  false, follow: false } }`** so trip URLs aren't crawled (review-2
  DR-17). **DoD:** full page renders from in-memory storage; unknown id →
  not-found; HTML response contains `<meta name="robots"
  content="noindex,nofollow">`.
- [ ] **WS-6.3** Style picker — `components/trips/StylePicker.tsx`: form →
  `createTrip` action (WS-0 signature); car|backpacking;
  `useActionState` pending. **DoD:** submitting creates a trip (stub action)
  and redirects.
- [ ] **WS-6.4** Packing list — `components/trips/PackingList.tsx` (server):
  group items by fixed category order; render `ItemRow`; owner-only
  add/rename/remove gated by `isOwner`. **DoD:** grouping + ordering match
  `../packing-engine.md`.
- [ ] **WS-6.5** Item row — `components/trips/ItemRow.tsx` (`'use
  client'`): show `claimed/needed` + shortfall; **over-claim renders
  `"5 of 3 — covered (extra)"`** (review-2 G-overclaim); claim/unclaim
  with qty (default = shortfall, capped via input); **owner inline-edit
  of `name`/`category`/`scope`/`baseQty`/`unit`/`note`** (review G1) +
  remove + **restore (when `removed=true`, used by `NoLongerNeeded`
  section — review-2 DR-19)**; calls
  `claimItem`/`unclaimItem`/`updateItem`/`removeItem`/`restoreItem`;
  optimistic + pending; surfaces action error envelope via Toaster
  (review-2 DR-28). **DoD:** claim changes reflected after action
  resolves; editing `scope`/`baseQty` visibly recomputes `needed` after
  refresh; restore puts the item back with its prior claims.
- [ ] **WS-6.6** Join dialog — `components/trips/JoinTripDialog.tsx`
  (`'use client'`): shown when no participant cookie (also when the
  visitor's `bc_participant` cookie is from a different trip — cookie
  path scope means it isn't sent here, so server-side it appears as no
  cookie; review-2 DR-35); name → `joinTrip`; **on
  `error.code === 'participant_cap_reached'` shows the toast using
  `error.message` verbatim from the action envelope (canonical string
  lives in WS-7.6 — `"This trip is full (50 people)."`; review-3
  DR-46)** (review-2 DR-24). **DoD:** joining adds participant and
  dismisses; 51st join shows the cap toast with the canonical message.
- [ ] **WS-6.7** Share link — `components/trips/ShareLink.tsx`
  (`'use client'`): copy `location.href` via `navigator.clipboard`;
  toast; UI copy notes: (a) the link is the access key — treat as a
  secret, (b) the **owner** specifically should save it — clearing
  cookies means the trip is non-recoverable as owner in v1 (review-2
  DR-26). **DoD:** copies URL; accessible button.
- [ ] **WS-6.8** Still needed — `components/trips/StillNeeded.tsx`
  (server): visible items with `shortfall>0`, shown as `claimed/needed`.
  **DoD:** matches view math; **removed items with claims do NOT appear
  here** (they belong to `NoLongerNeeded` — review-2 DR-19).
- [ ] **WS-6.8b** No longer needed — `components/trips/NoLongerNeeded.tsx`
  (server): renders `TripView.removedItemsWithClaims` so participants see
  why a previous claim disappeared; owner gets a "Restore" button
  (`restoreItem`) per row (review-2 DR-19). **DoD:** only shows when
  list is non-empty; owner can restore; non-owner sees read-only.
- [ ] **WS-6.9** Who's bringing — `components/trips/WhoIsBringing.tsx`
  (server): claims grouped by participant with item + qty. **DoD:**
  reflects all claims (including those on removed items, with a "no
  longer needed" tag — review-2 DR-19).
- [ ] **WS-6.10** Refresh poller — `components/trips/RefreshPoller.tsx`
  (`'use client'`): **`useRouter().refresh()` from `next/navigation`**
  (not `refresh` from `next/cache`, which is Server-Actions only —
  review-2 DR-9) every **15 s** (DR-29) + manual button; pause when
  `document.hidden`. Read
  `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md` —
  with Cache Components, client state is preserved across refresh; the
  poll **must not clobber an in-progress claim-qty input or the Join
  dialog** (review G3). **DoD:** others' changes appear without manual
  reload **and** a focused/edited input survives a background refresh.
- [ ] **WS-6.11** Not found — `app/trips/[tripId]/not-found.tsx`.
  **Copy unifies the unknown-trip and deleted-trip cases:** *"This trip
  doesn't exist, or the owner deleted it."* v1 does not distinguish the
  two (no tombstone row); documented in README D7 as an accepted gap
  (review-3 DR-47). **DoD:** friendly 404 for bad/unknown/deleted trip;
  copy mentions both possibilities.
- [ ] **WS-6.12** Add custom item — owner form (category select, name,
  scope, qty, unit, note) → `addItem`. **DoD:** custom item appears with
  `source:'custom'`.
- [ ] **WS-6.12b** Trip settings — `components/trips/TripSettings.tsx`
  (`'use client'`, owner-only): edit trip name + **`tentCapacity`**
  (review-2 DR-21) via `renameTrip` / `updateTripSettings`. **Danger
  zone:** `deleteTrip` confirmation dialog → on success, redirects to `/`
  (review-2 DR-20). **DoD:** owner can change tent capacity (per_tent
  shortfall recomputes on refresh); owner can delete trip; non-owner
  doesn't see the component.
- [ ] **WS-6.13** Flow check — against in-memory storage + stub actions:
  create → edit → share → join (second cookie jar) → claim →
  still-needed updates → per-person scaling visible → owner sets
  `tentCapacity=6` → per_tent shortfall drops → owner removes an item
  with claims → "no longer needed" section shows the claim → owner
  restores → claim back in main list → owner deletes trip → redirects
  to `/`. **DoD:** end-to-end works pre-WS-7/2.

## Acceptance criteria — write these tests first (red → green)

RTL + @next/playwright (in-memory backend, stub actions). Author first.

- [ ] **T6.1** StylePicker — renders car|backpacking; submit invokes
  `createTrip` with style; pending shown. _(WS-6.3)_
- [ ] **T6.2** PackingList — items grouped in fixed category order;
  owner-only affordances gated by `isOwner`. _(WS-6.4)_
- [ ] **T6.3** ItemRow — shows claimed/needed/shortfall; claim defaults
  qty=shortfall and calls `claimItem`; unclaim calls `unclaimItem`;
  pending/optimistic. _(WS-6.5)_
- [ ] **T6.3b** Over-claim display — claimed=5, needed=3 renders
  `"5 of 3 — covered (extra)"`; shortfall stays at 0 (review-2
  G-overclaim). _(WS-6.5)_
- [ ] **T6.4** JoinTripDialog — shown without participant cookie; submit
  → `joinTrip`; hidden when participant present; **a visitor whose
  cookie jar carries a `bc_participant` cookie for a *different* trip
  still sees the dialog here (cookie path scope, server sees no
  cookie)** — review-2 DR-35. **51st joiner sees the
  `participant_cap_reached` cap toast** — DR-24. _(WS-6.6)_
- [ ] **T6.5** ShareLink — click copies `location.href` (mock clipboard)
  + toast; **the component's accessible help text contains the
  owner-recovery warning copy** (a phrase like *"Save this link — the
  owner can't recover the trip without it."*) — DOM-string assertion,
  review-3 DR-48 closes the polish-pass drift risk on DR-26.
  _(WS-6.7)_
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
- [ ] **T6.11** trip page is non-indexable — server-rendered HTML
  contains `<meta name="robots" content="noindex,nofollow">` (review-2
  DR-17). _(WS-6.2)_
- [ ] **T6.12** removed-with-claims rendering — when owner removes a
  claimed item, `NoLongerNeeded` shows the claim with a "no longer
  needed" tag; "Still needed" excludes it; owner can restore and the
  claim returns to the main list (review-2 DR-19). _(WS-6.5/6.8b)_
- [ ] **T6.13** trip settings — owner edits `tentCapacity`, refresh
  recomputes per_tent shortfall (review-2 DR-21); owner-only confirm
  flow `deleteTrip` redirects to `/` (DR-20); non-owner doesn't see the
  component. **Second-participant-after-delete:** a parallel browser
  context with a `bc_participant` cookie for the same trip, sitting on
  the trip page, hits its next `router.refresh()` and renders the
  not-found page (which uses the unified deleted/unknown copy from
  WS-6.11; review-3 DR-47). _(WS-6.12b)_
- [ ] **T6.14** restore recomputes — owner removes a `per_person` item
  with claims, two more participants join (so `needed` would grow from
  1 to 3 if the item were live), owner `restoreItem`s; `StillNeeded`
  shows the restored item with `claimed=1, needed=3, shortfall=2`
  (review-3 DR-49). _(WS-6.5/6.8b/6.12)_

## Seams you participate in

- **I-1** (producer): expose `StylePicker` for WS-5's detail page; WS-8.2
  wires it in.
- **I-2** (consumer): import identity helpers from WS-0's
  `lib/trips/identity.stub` (cookie-reading mock against in-memory
  storage — review-2 DR-15); WS-8.2 swaps imports to WS-7's real
  `lib/trips/identity`.
- **I-4** (consumer): in-memory fake → Prisma/Neon via `services.ts` (WS-8.1).
- **I-6** (consumer): import UI only from the WS-4 `components/app` barrel.
