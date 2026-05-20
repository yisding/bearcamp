# WS-7 — Trip Actions & Identity

**Wave:** 2 (parallel) · **Critical path:** yes (glue — staff early)
**Depends on:** WS-0 types; WS-1 `generate`, WS-2 repos (via WS-0 fakes until
integration) · **Start when:** WS-0 merged

**Owned paths:** `lib/trips/actions.ts`, `lib/trips/identity.ts`,
`lib/validation/actions.ts`. *(`lib/trips/result.ts` was moved to WS-0
owned-paths — review-3 DR-39 — every action consumer in WS-6 needs the
`Result<T>` + `ErrorCode` shape pre-WS-7.)*

> Server Actions for every mutation. Develop against in-memory storage + stub
> `generate`; WS-8 swaps in real WS-2/WS-1 with no signature change.

## Tasks

- [ ] **WS-7.1** Identity — `lib/trips/identity.ts`: cookie helpers using
  the **distinct cookie names `bc_owner` and `bc_participant`** (review
  B6), both `httpOnly`, `sameSite=lax`, `path=/trips/<id>`, value =
  ≥128-bit `token()`. **`cookies()` is async in Next 16** — every
  helper begins with `const jar = await cookies()` then `jar.get/.set/
  .delete` (review-3 DR-42).
  - `setOwnerToken(tripId, token)` / `setParticipantToken(tripId, token)`
    → `jar.set(name, token, { httpOnly, sameSite:'lax', path:'/trips/
    '+tripId })`.
  - `clearOwnerToken(tripId)` / `clearParticipantToken(tripId)` →
    `jar.set(name, '', { httpOnly, sameSite:'lax', path:'/trips/
    '+tripId, maxAge: 0 })`. **Do NOT use `jar.delete(name)`** — per
    `cookies.md` it ignores the `path` attribute and would leave the
    path-scoped cookie alive (review-3 DR-40 fixes the
    `deleteTrip`-clears-cookies bug).
  - `assertOwner(tripId)` / `assertParticipant(tripId)` read the cookies
    via the async API and match tokens via storage; **cross-trip
    rejection:** the participant/owner row matched by the token must have
    `tripId === <arg>`, else throw `unauthorized` (review-2 DR-34).
  - `currentParticipant(tripId)` resolves the participant id from
    `bc_participant` (the only source — never an action arg, review
    I-C).
  **DoD:** wrong/missing token → typed `unauthorized` rejection; owner &
  participant cookies coexist; `clearOwnerToken` actually clears the
  cookie (a follow-up `assertOwner` throws).
- [ ] **WS-7.2** Action validation — `lib/validation/actions.ts`: zod
  schemas per action input (FormData/JSON) with friendly errors.
  **`updateItem` schema = `Partial<Pick<TripItem,'name'|'category'|
  'scope'|'baseQty'|'unit'|'note'>>`** (rejects id/source/removed/tripId
  edits — review G1); **`updateTripSettings` schema =
  `Partial<Pick<Trip,'tentCapacity'>>` with `tentCapacity` ∈ [1, 12]**
  (review-2 DR-21); **`restoreItem` = `{ tripId, itemId }`** (DR-19);
  **`deleteTrip` = `{ tripId }`** (DR-20); join/claim/unclaim schemas
  **must not** accept `participantId`/tokens (review I-C). **DoD:**
  invalid/over-reaching input rejected before any mutation.
- [ ] **WS-7.3** `createTrip` — `'use server'`; validate
  `{campsiteId,style}`; load campsite via `CampsiteSource`;
  `generate(style, amenities)` (stub → real at **I-3**);
  `storage.trips.create` + `items.add` (ids via `lib/ids`); **auto-join
  the creator as participant #1 (`isOwner=true`)** — review-2 DR-13 fixes
  the `is_owner=1` relic; set **both** `bc_owner` and `bc_participant`
  cookies; `redirect(routes.trip(id))`. **DoD:** new trip + items + a
  participant row that is the owner; both cookies set; redirect.
  (Creator's pre-share "selections" are this participant's claims —
  review G2/DR-4.)
- [ ] **WS-7.4** `renameTrip` — `assertOwner`; `storage.trips.rename`;
  `updateTag('trip:'+id)`. **DoD:** owner-only; name updates immediately.

- [ ] **WS-7.4b** `updateTripSettings` — `assertOwner`; validate
  `{ tentCapacity }`; `storage.trips.updateSettings`;
  `updateTag('trip:'+id)` (review-2 DR-21). **DoD:** owner-only;
  per_tent shortfall recomputes on next render.

- [ ] **WS-7.4c** `deleteTrip` — `assertOwner`; `storage.trips.delete`
  (cascade); **clears `bc_owner` and `bc_participant` cookies via
  `clearOwnerToken(tripId)` / `clearParticipantToken(tripId)`** (i.e.
  `jar.set(name, '', { path, maxAge: 0 })` — NOT `jar.delete`, see
  WS-7.1 / review-3 DR-40); `redirect('/')` (review-2 DR-20).
  **`redirect()` is called *outside* the try/catch envelope** (see
  WS-7.8 / review-3 DR-45) so its framework error isn't swallowed.
  **DoD:** owner-only; trip and all descendants gone; both Set-Cookie
  headers emitted with `Path=/trips/<id>; Max-Age=0`; redirect fires.
- [ ] **WS-7.5** Item mutations —
  `addItem`/`updateItem`/`removeItem`/`reorderItem`: `assertOwner`;
  validate (WS-7.2 — `updateItem` only the 6 editable fields); repo
  write; `updateTag('trip:'+id)`. Editing `scope`/`baseQty` recomputes
  `requiredQty` on next render (no stored qty). **DoD:** owner-only;
  soft-remove keeps claims; rename & re-quantity & scope change persist
  (review G1, req 3).

- [ ] **WS-7.5b** `restoreItem` — `assertOwner`; validate `{ tripId,
  itemId }`; `storage.items.restore`; `updateTag('trip:'+id)` (review-2
  DR-19). **DoD:** owner-only; item rejoins visible list with claims
  intact.
- [ ] **WS-7.6** `joinTrip` — validate name;
  `storage.participants.add(tripId, name, isOwner=false)` — which throws
  `participant_cap_reached` once the trip has ≥
  `PARTICIPANT_CAP_PER_TRIP` participants (`lib/limits.ts`; review-2
  DR-24; review-3 DR-43); on success set `bc_participant` cookie;
  `updateTag('trip:'+id)`. The Result envelope surfaces the cap error
  to the UI as `{ ok: false, error: { code: 'participant_cap_reached',
  message: 'This trip is full (50 people).' } }`. **This exact message
  string is the canonical UI copy — referenced verbatim by WS-6 (T6.4
  asserts it) — single source of truth lives here** (review-3 DR-46).
  **DoD:** joiner can then claim; 51st join returns the cap error with
  the canonical message.
- [ ] **WS-7.7** `claimItem`/`unclaimItem` — `assertParticipant`; **resolve
  `participantId` from `bc_participant` cookie only** (never from input —
  review I-C); `claims.upsert`/`remove`; `updateTag('trip:'+id)`. **DoD:**
  actor sees own change immediately (read-your-own-writes).
- [ ] **WS-7.8** Hardening — re-check auth **inside every action**
  (direct POST safe per Next mutation guidance); return typed results
  matching `action-types` via the `Result<T>` envelope from
  `lib/trips/result.ts` (WS-0.8b). **Action template (review-3 DR-45):**
  per `redirect.md` and `unstable_rethrow.md`, `redirect()` throws a
  framework error that must not be swallowed. Two acceptable forms:

  ```ts
  // Form A (preferred for create/delete actions that always redirect)
  export async function createTrip(input: CreateTripInput) {
    const result = await doWork(input)           // try/catch INSIDE
    if (!result.ok) return result                // typed Result<T> error
    redirect(routes.trip(result.data.id))        // OUTSIDE try/catch
  }
  async function doWork(input): Promise<Result<{id: string}>> {
    try { /* validate, write */ return ok({ id }) }
    catch (e) {
      console.error('[bc.action]', { action:'createTrip', err: e })
      return err('internal', 'Could not create trip.')
    }
  }

  // Form B (mutations that don't redirect, e.g. claimItem)
  export async function claimItem(input): Promise<Result<void>> {
    try { /* ... */ return ok(undefined) }
    catch (e) {
      // unstable_rethrow re-throws framework errors (redirect/notFound)
      // even if we accidentally catch them
      const { unstable_rethrow } = await import('next/navigation')
      unstable_rethrow(e)
      console.error('[bc.action]', { action:'claimItem', err: e })
      return err('internal', 'Could not claim.')
    }
  }
  ```

  Every action emits one structured `console.error('[bc.action]', {
  action, tripId, participantId?, code, err })` line on failure (DR-28).
  Never catches `redirect()` or `notFound()` control-flow.
  **Cross-trip cookie check:** even if the browser refuses to send a
  path-scoped cookie cross-trip, `assertOwner(tripId)` /
  `assertParticipant(tripId)` reject a token whose row belongs to a
  different trip (review-2 DR-34). **DoD:** unauthorized direct calls
  rejected; cross-trip token attempts rejected;
  `createTrip`/`deleteTrip` redirects actually fire (a test asserts the
  redirect response is emitted, not a `{ok:false}` envelope —
  review-3 DR-45).
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
  campsiteId, bad style, empty name, negative qty); **`updateItem`
  rejects edits to `id`/`source`/`removed`/`tripId`** and accepts only
  the 6 editable fields (review G1); **`updateTripSettings` accepts
  `tentCapacity` ∈ [1,12], rejects 0/13/"" (review-2 DR-21);
  `restoreItem` / `deleteTrip` schemas reject extra fields** (DR-19/20);
  **claim/join schemas reject any `participantId`/token field** (review
  I-C). _(WS-7.2)_
- [ ] **T7.3** createTrip — creates trip + items + a participant row
  that is `isOwner=true` (review-2 DR-13); sets **both** cookies;
  redirects `routes.trip(id)`; list from `generate(style,amenities)`;
  **solo creator → `participantCount===1`, per_person needed = 1**
  (review B6). _(WS-7.3)_
- [ ] **T7.4** renameTrip — non-owner throws; owner persists;
  `updateTag('trip:'+id)` called. _(WS-7.4)_
- [ ] **T7.4b** updateTripSettings — owner-only; `tentCapacity` persists;
  the next `buildTripView` returns per_tent shortfall recomputed
  (review-2 DR-21). _(WS-7.4b)_
- [ ] **T7.4c** deleteTrip — owner-only; cascade removes
  items/participants/claims; cookies cleared; result envelope
  `{ ok: true }` (review-2 DR-20). _(WS-7.4c)_
- [ ] **T7.5** item mutations — owner-only; softRemove keeps claims;
  `updateTag` called; **rename persists; changing `baseQty`/`scope`
  recomputes `requiredQty` in the resulting view** (review G1, req 3);
  **`restoreItem` flips `removed=false` and `updateTag`s; non-owner
  rejected** (review-2 DR-19). _(WS-7.5/7.5b)_
- [ ] **T7.6** joinTrip — adds participant; sets cookie; `updateTag`;
  **51st join returns `{ ok: false, error.code: 'participant_cap_reached'
  }` envelope** without mutating state (review-2 DR-24). _(WS-7.6)_
- [ ] **T7.7** claim/unclaim — participant-only; upsert/remove; `updateTag`
  (read-your-own-writes); view shortfall recomputed. _(WS-7.7)_
- [ ] **T7.8** security — a direct call without a valid cookie is
  rejected; **a `bc_owner` cookie issued for trip A is rejected when
  invoking a mutation on trip B (server-side cross-trip check, belt-
  and-braces — review-2 DR-34)**; **action error envelope is returned
  on auth failure, with one structured `console.error` line** (DR-28).
  _(WS-7.8)_
- [ ] **T7.9** contract — `actionsContract(deps)` (WS-0.15) green on fakes;
  re-run unchanged at WS-8 on real impls. _(WS-7.9/7.10)_

## Seams you participate in

- **I-2** (producer): identity helpers consumed by WS-6's trip page.
- **I-3** (consumer): stub `generate` → real WS-1 engine.
- **I-4** (consumer): in-memory fake → Prisma/Neon via `services.ts` (WS-8.1).
