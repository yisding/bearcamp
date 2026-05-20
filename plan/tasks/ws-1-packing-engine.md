# WS-1 — Packing Engine

**Wave:** 2 (parallel) · **Critical path:** no (pure, independent)
**Depends on:** WS-0 types · **Start when:** WS-0 merged

**Owned paths:** `lib/packing/templates.ts`, `lib/packing/rules.ts`,
`lib/packing/generate.ts`, `lib/packing/__tests__/*`.
**Do NOT own/edit:** `lib/packing/index.ts` and `lib/packing/quantities.ts`
are **WS-0-owned, permanently** (review B1/B2).

> Pure, deterministic, no I/O. Replaces **only** the WS-0 stub `generate.ts`
> behind the unchanged `index.ts` barrel. Treat `quantities.ts`
> (`requiredQty`, `TENT_CAPACITY`) and `index.ts` as read-only WS-0 contract.

## Tasks

- [ ] **WS-1.1** Base templates — `templates.ts`: `TemplateItem[]` encoding
  the **revised** car + backpacking tables in `../packing-engine.md`
  (post-edit: no canopy/cot/clothing/GPS/whistle; with fire starter,
  firewood, roasting forks, entertainment; chairs+lantern `per_person`,
  CC-only fire items). **DoD:** every row present with correct
  `category/scope/styles/baseQty`.
- [ ] **WS-1.2** Quantity math — **verify only, do NOT edit**
  `quantities.ts` (WS-0-owned). Confirm `requiredQty(item, n)`: `per_person`
  ×n; `per_tent` ×`ceil(n/TENT_CAPACITY)` (`TENT_CAPACITY=2`); `shared`
  constant; `n` floors at 1 — matches `../packing-engine.md`. If wrong, file
  it back to WS-0 (do not patch it here). Add coverage in your `__tests__/`.
  **DoD:** behavior confirmed; if a defect is found it is fixed in WS-0, not
  WS-1 (review B1).
- [ ] **WS-1.3** Amenity rules — `rules.ts`: ordered
  `(items, amenities) => items` transforms for every row in the "Amenity
  rules" table. Each **idempotent** (lookup by `name` before add), mutates in
  place for "adjust", tags added/removed items `source:'amenity'` with a
  human "why" note. **DoD:** all branches; running rules twice == once.
- [ ] **WS-1.4** Generate pipeline — `generate.ts`: filter base template by
  `style` → apply rules in defined order → assign `sortOrder` (category order
  then template order) → return `TripItem[]` (no `tripId`/`id`; caller
  assigns). **DoD:** same inputs → identical output; replaces WS-0 stub.
- [ ] **WS-1.5** Tests — `__tests__/`: snapshot both base lists; generate
  across ≥6 amenity combos (bear lockers vs bear country; water vs none;
  flush vs none toilets; fires on/off; cell none; electricity on/off);
  assert sleeping bag & pad scale per-person while stove/filter stay
  constant; rule idempotency; category ordering. **DoD:** suite green; every
  rule branch covered.
- [ ] **WS-1.6** Contract handoff — confirm `lib/packing/index.ts` (WS-0)
  re-exports cleanly and the **frozen export set
  `{ generate, requiredQty, TENT_CAPACITY }` is unchanged** (WS-0's T0.11
  must still pass after your `generate.ts` lands); notify WS-7 the real
  `generate` is live. **DoD:** T0.11 green; WS-7 action tests pass against
  the real engine with no signature change (review B2).

## Acceptance criteria — write these tests first (red → green)

vitest; `lib/packing/__tests__/`. Author first; they fail until the mapped
task lands.

- [ ] **T1.1** `requiredQty` coverage — `per_person`×n; `per_tent`=
  `ceil(n/2)`; `shared`=baseQty; n≤0 floors to 1. (Behavior is WS-0-owned;
  this is WS-1's confirming coverage — defects route back to WS-0.)
  _(WS-1.2 verify-only)_
- [ ] **T1.2** templates content — car & backpacking lists include the
  revised rows and **exclude** canopy/cot/all-clothing/GPS/whistle; chairs &
  lantern `per_person`; fire starter/firewood/roasting forks present and
  CC-only. _(WS-1.1)_
- [ ] **T1.3** rules idempotent — running the rule pipeline twice
  deep-equals once. _(WS-1.3)_
- [ ] **T1.4** base snapshots — `generate('car',∅)` /
  `generate('backpacking',∅)` match committed snapshots. _(WS-1.4)_
- [ ] **T1.5** amenity branches (table-driven, ≥6) — bearLockers→no canister
  (+note); !bearLockers&bearCountry→canister; !potableWater→extra water
  storage; toilets flush→no trowel/wag bag; toilets none→trowel(BP)/portable
  toilet(CC); !fireRings→fire items removed (+note); electricity(CC)→
  cords/strip; cell none→paper map promoted. _(WS-1.3)_
- [ ] **T1.6** multiplier integration — `generate`+`requiredQty`: sleeping
  bag & pad scale with n; stove & filter constant. _(WS-1.2/1.4)_
- [ ] **T1.7** determinism — identical inputs → deep-equal outputs (no
  Date/random). _(WS-1.4)_

## Seams you participate in

- **I-3** (producer): stub `generate()` → real engine. Same `index.ts`
  signature; WS-8.2 verifies via tests. No other stream edits your files.
