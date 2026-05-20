# WS-7 — Trip Actions & Identity

**Wave:** 2 (parallel) · **Critical path:** yes (glue — staff early)
**Depends on:** WS-0 types; WS-1 `generate`, WS-2 repos (via WS-0 fakes until
integration) · **Start when:** WS-0 merged

**Owned paths:** `lib/trips/actions.ts`, `lib/trips/identity.ts`,
`lib/validation/actions.ts`.

> Server Actions for every mutation. Develop against in-memory storage + stub
> `generate`; WS-8 swaps in real WS-2/WS-1 with no signature change.

## Tasks

- [ ] **WS-7.1** Identity — `lib/trips/identity.ts`: cookie helpers using
  the **distinct cookie names `bc_owner` and `bc_participant`** (review B6),
  both `httpOnly`, `sameSite=lax`, `path=/trips/<id>`, value = ≥128-bit
  `token()`: `setOwnerToken`, `setParticipantToken`, readers;
  `assertOwner(tripId)` / `assertParticipant(tripId)` reading `cookies()`
  and matching tokens via storage; `currentParticipant(tripId)` resolves the
  participant id from `bc_participant` (the only source — never an action
  arg, review I-C). **DoD:** wrong/missing token → typed rejection; owner &
  participant cookies coexist.
- [ ] **WS-7.2** Action validation — `lib/validation/actions.ts`: zod schemas
  per action input (FormData/JSON) with friendly errors. **`updateItem`
  schema = `Partial<Pick<TripItem,'name'|'category'|'scope'|'baseQty'|
  'unit'|'note'>>`** (rejects id/source/removed/tripId edits — review G1);
  join/claim/unclaim schemas **must not** accept `participantId`/tokens
  (review I-C). **DoD:** invalid/over-reaching input rejected before any
  mutation.
- [ ] **WS-7.3** `createTrip` — `'use server'`; validate `{campsiteId,style}`;
  load campsite via `CampsiteSource`; `generate(style, amenities)` (stub →
  real at **I-3**); `storage.trips.create` + `items.add` (ids via `lib/ids`);
  **auto-join the creator as participant #1 (`is_owner=1`)**; set **both**
  `bc_owner` and `bc_participant` cookies; `redirect(routes.trip(id))`.
  **DoD:** new trip + items + a participant row that is the owner; both
  cookies set; redirect. (Creator's pre-share "selections" are this
  participant's claims — review G2/DR-4.)
- [ ] **WS-7.4** `renameTrip` — `assertOwner`; `storage.rename`;
  `updateTag('trip:'+id)`. **DoD:** owner-only; name updates immediately.
- [ ] **WS-7.5** Item mutations — `addItem`/`updateItem`/`removeItem`/
  `reorderItem`: `assertOwner`; validate (WS-7.2 — `updateItem` only the 6
  editable fields); repo write; `updateTag('trip:'+id)`. Editing
  `scope`/`baseQty` recomputes `requiredQty` on next render (no stored qty).
  **DoD:** owner-only; soft-remove keeps claims; rename & re-quantity & scope
  change persist (review G1, req 3).
- [ ] **WS-7.6** `joinTrip` — validate name; `participants.add`; set
  `bc_participant` cookie; `updateTag('trip:'+id)`. **DoD:** joiner can then
  claim.
- [ ] **WS-7.7** `claimItem`/`unclaimItem` — `assertParticipant`; **resolve
  `participantId` from `bc_participant` cookie only** (never from input —
  review I-C); `claims.upsert`/`remove`; `updateTag('trip:'+id)`. **DoD:**
  actor sees own change immediately (read-your-own-writes).
- [ ] **WS-7.8** Hardening — re-check auth **inside every action** (direct
  POST safe per Next mutation guidance); return typed results matching
  `action-types`; never catch `redirect()` control-flow. **DoD:**
  unauthorized direct calls rejected.
- [ ] **WS-7.9** Tests — actions against in-memory storage: guard rejections
  (no/wrong token), `createTrip` wiring, claim → shortfall change, join →
  per-person needed grows. **DoD:** suite green on fakes.
- [ ] **WS-7.10** Integration hooks — document the two swap points (stub
  `generate` → WS-1 at **I-3**; in-memory storage → WS-2 at **I-4**); both
  flip via `services.ts`/import with no signature change. **DoD:** WS-8 can
  integrate without editing action logic.

## Acceptance criteria — write these tests first (red → green)

vitest against WS-0 fakes (re-run on Prisma/Postgres at WS-8 via the shared
`actionsContract`).
Author first.

- [ ] **T7.1** identity guards — `assertOwner`/`assertParticipant` pass with
  the correct token, throw on missing/wrong; `bc_owner` & `bc_participant`
  are distinct cookies that coexist (review B6); httpOnly + path
  `/trips/<id>`. _(WS-7.1)_
- [ ] **T7.2** validation — each schema rejects bad input (missing
  campsiteId, bad style, empty name, negative qty); **`updateItem` rejects
  edits to `id`/`source`/`removed`/`tripId`** and accepts only the 6
  editable fields (review G1); **claim/join schemas reject any
  `participantId`/token field** (review I-C). _(WS-7.2)_
- [ ] **T7.3** createTrip — creates trip + items + a participant row that is
  `is_owner=1`; sets **both** cookies; redirects `routes.trip(id)`; list
  from `generate(style,amenities)`; **solo creator → `participantCount===1`,
  per_person needed = 1** (review B6). _(WS-7.3)_
- [ ] **T7.4** renameTrip — non-owner throws; owner persists;
  `updateTag('trip:'+id)` called. _(WS-7.4)_
- [ ] **T7.5** item mutations — owner-only; softRemove keeps claims;
  `updateTag` called; **rename persists; changing `baseQty`/`scope`
  recomputes `requiredQty` in the resulting view** (review G1, req 3).
  _(WS-7.5)_
- [ ] **T7.6** joinTrip — adds participant; sets cookie; `updateTag`.
  _(WS-7.6)_
- [ ] **T7.7** claim/unclaim — participant-only; upsert/remove; `updateTag`
  (read-your-own-writes); view shortfall recomputed. _(WS-7.7)_
- [ ] **T7.8** security — a direct call without a valid cookie is rejected.
  _(WS-7.8)_
- [ ] **T7.9** contract — `actionsContract(deps)` (WS-0.15) green on fakes;
  re-run unchanged at WS-8 on real impls. _(WS-7.9/7.10)_

## Seams you participate in

- **I-2** (producer): identity helpers consumed by WS-6's trip page.
- **I-3** (consumer): stub `generate` → real WS-1 engine.
- **I-4** (consumer): in-memory fake → Prisma/Neon via `services.ts` (WS-8.1).
