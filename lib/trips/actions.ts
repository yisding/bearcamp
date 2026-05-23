'use server'

// WS-7.3 → WS-7.8 — Server Actions for every trip mutation.
//
// Every action:
//   1. Validates input via a zod schema (lib/validation/actions.ts);
//      `validation_failed` envelope on bad input.
//   2. Runs auth (assertOwner / assertParticipant — assertParticipant resolves
//      the participantId from `bc_participant` only, never from input — I-C).
//   3. Calls storage.
//   4. On success: invalidates the trip cache tag via `updateTag('trip:'+id)`
//      (Next 16: updateTag is the read-your-own-writes primitive for Server
//      Actions — see node_modules/next/dist/docs/.../updateTag.md).
//
// Redirect handling (DR-45 / per redirect.md + unstable_rethrow.md):
//   - Form A (createTrip, deleteTrip): redirect() is called OUTSIDE the
//     try/catch so its internal NEXT_REDIRECT throw is never swallowed.
//   - Form B (every other mutation): wrap in try/catch; the catch starts
//     with `unstable_rethrow(e)` so a stray redirect/notFound bubbles up.
//
// All failures emit one structured `console.error('[bc.action]', { … })`
// line (DR-28) and return `Result<T>` from lib/trips/result.ts.
// Canonical UI copy for the cap-error message lives in `TRIP_FULL_MESSAGE`
// below (DR-46) — verbatim string consumed by WS-6.

// next/navigation and next/cache are loaded lazily via `await import(...)`
// inside each action so vitest test files that mock these modules with
// non-hoisted `vi.fn()` closures don't trip TDZ at module-import time.
// Production / Next runtime resolves the dynamic import once and caches it.
import { z } from 'zod'

import { getCampsiteSource, getStorage } from '../services'
import { token } from '../ids'
import * as routes from '../routes'
import { generate } from '../packing'
import { PARTICIPANT_CAP_PER_TRIP } from '../limits'
import { ok, err, type Result } from './result'
import {
  assertOwner,
  assertParticipant,
  clearOwnerToken,
  clearParticipantToken,
  setOwnerToken,
  setParticipantToken,
} from './identity'
import {
  AddItemSchema,
  ClaimItemSchema,
  CreateTripSchema,
  DeleteTripSchema,
  JoinTripSchema,
  RemoveItemSchema,
  RenameTripSchema,
  ReorderItemSchema,
  RestoreItemSchema,
  UnclaimItemSchema,
  UpdateItemSchema,
  UpdateTripSettingsSchema,
} from '../validation/actions'

import type {
  AddItemInput,
  AddItemResult,
  ClaimItemInput,
  ClaimItemResult,
  CreateTripData,
  CreateTripInput,
  DeleteTripInput,
  DeleteTripResult,
  JoinTripInput,
  JoinTripResult,
  RemoveItemInput,
  RemoveItemResult,
  RenameTripInput,
  RenameTripResult,
  ReorderItemInput,
  ReorderItemResult,
  RestoreItemInput,
  RestoreItemResult,
  UnclaimItemInput,
  UnclaimItemResult,
  UpdateItemInput,
  UpdateItemResult,
  UpdateTripSettingsInput,
  UpdateTripSettingsResult,
} from './action-types'
import type { TripItem, Amenities } from '../db/types'

// Canonical UI copy. Single source of truth (DR-46) — WS-6 references it
// verbatim. Tests assert the exact string. Built from the canonical
// PARTICIPANT_CAP_PER_TRIP constant (lib/limits.ts) so the cap number is
// never restated as a literal.
const TRIP_FULL_MESSAGE = `This trip is full (${PARTICIPANT_CAP_PER_TRIP} people).`

// ---- Lazy module resolvers ------------------------------------------------
// See header comment for the rationale.

type NavigationModule = {
  redirect: (to: string) => never
  unstable_rethrow: (e: unknown) => void
}
async function nav(): Promise<NavigationModule> {
  const mod = (await import('next/navigation')) as unknown as NavigationModule
  return mod
}

type CacheModule = { updateTag: (tag: string) => void }
async function cache(): Promise<CacheModule> {
  const mod = (await import('next/cache')) as unknown as CacheModule
  return mod
}

// Re-throw framework control-flow errors (redirect / notFound). Wraps the
// lazy resolution of `unstable_rethrow` so callers can simply `await
// rethrowControlFlow(e)` inside their catch block.
async function rethrowControlFlow(e: unknown): Promise<void> {
  const { unstable_rethrow } = await nav()
  unstable_rethrow(e)
}

async function touchTripTag(tripId: string): Promise<void> {
  const { updateTag } = await cache()
  updateTag(`trip:${tripId}`)
}

// ---- Helpers --------------------------------------------------------------

function logFailure(payload: {
  action: string
  tripId?: string
  participantId?: string
  code: string
  err: unknown
}): void {
  console.error('[bc.action]', payload)
}

function isUnauthorizedError(e: unknown): boolean {
  return e instanceof Error && /^unauthorized/i.test(e.message)
}

// Translate a thrown Error from an internal helper / storage call into a
// typed Result error envelope.
function mapThrown(
  action: string,
  tripId: string | undefined,
  e: unknown,
): Result<never> {
  if (e instanceof z.ZodError) {
    logFailure({ action, tripId, code: 'validation_failed', err: e })
    return err('validation_failed', 'Invalid input.')
  }
  if (isUnauthorizedError(e)) {
    logFailure({ action, tripId, code: 'unauthorized', err: e })
    return err('unauthorized', 'You do not have permission to do that.')
  }
  // Cap error shape differs by backend: the memory backend throws
  // `new Error('participant_cap_reached')` (discriminator in `.message`),
  // the Prisma backend throws `ParticipantCapReachedError` whose
  // discriminator is `.name === 'participant_cap_reached'` and whose
  // `.message` is the longer `'participant_cap_reached: trip <id> ...'`.
  // Match BOTH so the real DB doesn't fall through to `internal`.
  if (
    e instanceof Error &&
    (e.name === 'participant_cap_reached' ||
      e.message.startsWith('participant_cap_reached'))
  ) {
    logFailure({ action, tripId, code: 'participant_cap_reached', err: e })
    return err('participant_cap_reached', TRIP_FULL_MESSAGE)
  }
  if (e instanceof Error && /not found/i.test(e.message)) {
    logFailure({ action, tripId, code: 'not_found', err: e })
    return err('not_found', e.message)
  }
  logFailure({ action, tripId, code: 'internal', err: e })
  return err('internal', 'Something went wrong.')
}

// Trip-scope check for item-keyed mutations (DR-34 boundary at the action
// layer). The storage `items.update / softRemove / restore` and
// `claims.upsert / claims.remove` repos are keyed on itemId alone — without
// this guard, an actor authorized for trip A could mutate an item belonging
// to trip B by passing trip A's tripId + trip B's itemId. We list the
// trip's items and verify the itemId is present; otherwise throw a
// `not found`-shaped Error that `mapThrown` translates to `not_found` so
// we never leak existence of items in other trips.
async function assertItemBelongsToTrip(
  tripId: string,
  itemId: string,
): Promise<void> {
  const items = await getStorage().items.listByTrip(tripId)
  if (!items.some((i) => i.id === itemId)) {
    throw new Error(`item not found in trip: ${itemId}`)
  }
}

// Synthetic default snapshot for campsites the catalog doesn't carry —
// keeps the action working in tests/dev where seeds aren't loaded. WS-3+
// catalogs always resolve the lookup in production.
const DEFAULT_AMENITIES: Amenities = {
  potableWater: true,
  toilets: 'flush',
  showers: true,
  electricity: true,
  fireRings: true,
  firewoodAvailable: true,
  picnicTables: true,
  bearLockers: false,
  bearCountry: false,
  trashService: true,
  dumpStation: false,
  cellService: 'good',
  accessLevel: 'drive-in',
}

// =========================================================================
// createTrip — Form A (redirect outside try/catch).
// =========================================================================

export async function createTrip(
  input: CreateTripInput,
): Promise<Result<CreateTripData>> {
  const result = await doCreateTrip(input)
  if (!result.ok) return result
  // redirect() throws NEXT_REDIRECT — must NOT be inside try/catch (DR-45).
  // Its `never` return type means the function never reaches the post-line.
  const { redirect } = await nav()
  redirect(routes.trip(result.data.trip.id))
  // Unreachable — redirect() always throws. Present so TS sees the function
  // satisfies its declared `Promise<Result<CreateTripData>>` return type
  // (TS does not narrow `never` through `await`d destructured callables).
  throw new Error('unreachable: redirect did not throw')
}

async function doCreateTrip(
  input: CreateTripInput,
): Promise<Result<CreateTripData>> {
  let tripId: string | undefined
  try {
    const parsed = CreateTripSchema.parse(input)
    const source = getCampsiteSource()
    const campsite = await source.getById(parsed.campsiteId)
    // Fall back to a synthetic snapshot when the catalog does not carry the
    // id (test fixtures with bare ids, dev seeds not loaded). The action
    // contract surface is what matters here; WS-3+ guarantees the lookup.
    const campsiteSnapshot = campsite
      ? {
          name: campsite.name,
          amenities: campsite.amenities,
          state: campsite.state,
          agency: campsite.agency,
        }
      : {
          name: 'Untitled campsite',
          amenities: DEFAULT_AMENITIES,
        }
    const items = generate(parsed.style, campsiteSnapshot.amenities)
    const ownerTok = token()
    const ownerParticipantTok = token()
    const created = await getStorage().trips.create({
      name: parsed.name ?? campsiteSnapshot.name,
      campsiteId: parsed.campsiteId,
      campsite: campsiteSnapshot,
      style: parsed.style,
      ownerName: parsed.ownerName ?? 'Owner',
      ownerToken: ownerTok,
      ownerParticipantToken: ownerParticipantTok,
      items: items.map((i) => ({
        category: i.category,
        name: i.name,
        scope: i.scope,
        baseQty: i.baseQty,
        unit: i.unit,
        note: i.note,
        source: i.source,
      })),
    })
    tripId = created.trip.id
    // Identity: creator is owner AND participant #1 (DR-13).
    await setOwnerToken(created.trip.id, ownerTok)
    await setParticipantToken(created.trip.id, ownerParticipantTok)
    await touchTripTag(created.trip.id)
    return ok({ trip: created.trip, owner: created.owner })
  } catch (e) {
    await rethrowControlFlow(e)
    return mapThrown('createTrip', tripId, e)
  }
}

// =========================================================================
// renameTrip — Form B.
// =========================================================================

export async function renameTrip(
  input: RenameTripInput,
): Promise<RenameTripResult> {
  let tripId: string | undefined
  try {
    const parsed = RenameTripSchema.parse(input)
    tripId = parsed.tripId
    await assertOwner(parsed.tripId)
    const trip = await getStorage().trips.rename(parsed.tripId, parsed.name)
    await touchTripTag(parsed.tripId)
    return ok(trip)
  } catch (e) {
    await rethrowControlFlow(e)
    return mapThrown('renameTrip', tripId, e)
  }
}

// =========================================================================
// updateTripSettings — Form B.
// =========================================================================

export async function updateTripSettings(
  input: UpdateTripSettingsInput,
): Promise<UpdateTripSettingsResult> {
  let tripId: string | undefined
  try {
    const parsed = UpdateTripSettingsSchema.parse(input)
    tripId = parsed.tripId
    await assertOwner(parsed.tripId)
    const trip = await getStorage().trips.updateSettings(parsed.tripId, parsed.patch)
    await touchTripTag(parsed.tripId)
    return ok(trip)
  } catch (e) {
    await rethrowControlFlow(e)
    return mapThrown('updateTripSettings', tripId, e)
  }
}

// =========================================================================
// deleteTrip — Form A (redirect('/') on success outside try/catch).
// =========================================================================

export async function deleteTrip(
  input: DeleteTripInput,
): Promise<DeleteTripResult> {
  const result = await doDeleteTrip(input)
  if (!result.ok) return result
  // Clear cookies BEFORE redirect; redirect throws NEXT_REDIRECT and must
  // not be wrapped in try/catch (DR-45).
  await clearOwnerToken(result.data.tripId)
  await clearParticipantToken(result.data.tripId)
  const { redirect } = await nav()
  redirect('/')
  // Unreachable — redirect() always throws. See createTrip note.
  throw new Error('unreachable: redirect did not throw')
}

async function doDeleteTrip(
  input: DeleteTripInput,
): Promise<Result<{ tripId: string }>> {
  let tripId: string | undefined
  try {
    const parsed = DeleteTripSchema.parse(input)
    tripId = parsed.tripId
    await assertOwner(parsed.tripId)
    // Verify the trip exists before deletion so the contract suite's
    // unknown-trip path returns `not_found` (or `unauthorized` if there
    // was no cookie — assertOwner already covers that).
    const trip = await getStorage().trips.getById(parsed.tripId)
    if (!trip) {
      logFailure({
        action: 'deleteTrip',
        tripId: parsed.tripId,
        code: 'not_found',
        err: new Error(`trip not found: ${parsed.tripId}`),
      })
      return err('not_found', 'Trip not found.')
    }
    await getStorage().trips.delete(parsed.tripId)
    await touchTripTag(parsed.tripId)
    return ok({ tripId: parsed.tripId })
  } catch (e) {
    await rethrowControlFlow(e)
    return mapThrown('deleteTrip', tripId, e)
  }
}

// =========================================================================
// Item mutations — Form B.
// =========================================================================

export async function addItem(input: AddItemInput): Promise<AddItemResult> {
  let tripId: string | undefined
  try {
    const parsed = AddItemSchema.parse(input)
    tripId = parsed.tripId
    await assertOwner(parsed.tripId)
    const item = await getStorage().items.add({
      tripId: parsed.tripId,
      category: parsed.category,
      name: parsed.name,
      scope: parsed.scope,
      baseQty: parsed.baseQty,
      unit: parsed.unit,
      note: parsed.note,
      source: 'custom',
    })
    await touchTripTag(parsed.tripId)
    return ok(item)
  } catch (e) {
    await rethrowControlFlow(e)
    return mapThrown('addItem', tripId, e)
  }
}

export async function updateItem(
  input: UpdateItemInput,
): Promise<UpdateItemResult> {
  let tripId: string | undefined
  try {
    const parsed = UpdateItemSchema.parse(input)
    tripId = parsed.tripId
    await assertOwner(parsed.tripId)
    await assertItemBelongsToTrip(parsed.tripId, parsed.itemId)
    const item = await getStorage().items.update(parsed.itemId, parsed.patch)
    await touchTripTag(parsed.tripId)
    return ok(item)
  } catch (e) {
    await rethrowControlFlow(e)
    return mapThrown('updateItem', tripId, e)
  }
}

export async function removeItem(
  input: RemoveItemInput,
): Promise<RemoveItemResult> {
  let tripId: string | undefined
  try {
    const parsed = RemoveItemSchema.parse(input)
    tripId = parsed.tripId
    await assertOwner(parsed.tripId)
    await assertItemBelongsToTrip(parsed.tripId, parsed.itemId)
    const item: TripItem = await getStorage().items.softRemove(parsed.itemId)
    await touchTripTag(parsed.tripId)
    return ok(item)
  } catch (e) {
    await rethrowControlFlow(e)
    return mapThrown('removeItem', tripId, e)
  }
}

export async function restoreItem(
  input: RestoreItemInput,
): Promise<RestoreItemResult> {
  let tripId: string | undefined
  try {
    const parsed = RestoreItemSchema.parse(input)
    tripId = parsed.tripId
    await assertOwner(parsed.tripId)
    await assertItemBelongsToTrip(parsed.tripId, parsed.itemId)
    const item: TripItem = await getStorage().items.restore(parsed.itemId)
    await touchTripTag(parsed.tripId)
    return ok(item)
  } catch (e) {
    await rethrowControlFlow(e)
    return mapThrown('restoreItem', tripId, e)
  }
}

export async function reorderItem(
  input: ReorderItemInput,
): Promise<ReorderItemResult> {
  let tripId: string | undefined
  try {
    const parsed = ReorderItemSchema.parse(input)
    tripId = parsed.tripId
    await assertOwner(parsed.tripId)
    await getStorage().items.reorder(parsed.tripId, parsed.itemId, {
      beforeItemId: parsed.beforeItemId,
      newIndex: parsed.newIndex,
    })
    await touchTripTag(parsed.tripId)
    return ok({ tripId: parsed.tripId, itemId: parsed.itemId })
  } catch (e) {
    await rethrowControlFlow(e)
    return mapThrown('reorderItem', tripId, e)
  }
}

// =========================================================================
// joinTrip — Form B. Validates → adds participant → sets bc_participant
// cookie → updateTag. Cap error returns the canonical message (DR-46).
// =========================================================================

export async function joinTrip(input: JoinTripInput): Promise<JoinTripResult> {
  let tripId: string | undefined
  try {
    const parsed = JoinTripSchema.parse(input)
    tripId = parsed.tripId
    // Pre-flight cap check (storage.add throws when at cap; the explicit
    // check here doesn't change semantics but mirrors WS-7.6 wording).
    const count = await getStorage().participants.count(parsed.tripId)
    if (count >= PARTICIPANT_CAP_PER_TRIP) {
      logFailure({
        action: 'joinTrip',
        tripId: parsed.tripId,
        code: 'participant_cap_reached',
        err: new Error('participant_cap_reached'),
      })
      return err('participant_cap_reached', TRIP_FULL_MESSAGE)
    }
    const participantToken = token()
    const participant = await getStorage().participants.add(
      parsed.tripId,
      parsed.name,
      false,
      participantToken,
    )
    await setParticipantToken(parsed.tripId, participantToken)
    await touchTripTag(parsed.tripId)
    return ok(participant)
  } catch (e) {
    await rethrowControlFlow(e)
    return mapThrown('joinTrip', tripId, e)
  }
}

// =========================================================================
// claimItem / unclaimItem — Form B. assertParticipant resolves the actor.
// =========================================================================

export async function claimItem(
  input: ClaimItemInput,
): Promise<ClaimItemResult> {
  let tripId: string | undefined
  try {
    const parsed = ClaimItemSchema.parse(input)
    tripId = parsed.tripId
    const participant = await assertParticipant(parsed.tripId)
    await assertItemBelongsToTrip(parsed.tripId, parsed.itemId)
    const claim = await getStorage().claims.upsert(
      parsed.itemId,
      participant.id,
      parsed.qty,
    )
    await touchTripTag(parsed.tripId)
    return ok(claim)
  } catch (e) {
    await rethrowControlFlow(e)
    return mapThrown('claimItem', tripId, e)
  }
}

export async function unclaimItem(
  input: UnclaimItemInput,
): Promise<UnclaimItemResult> {
  let tripId: string | undefined
  try {
    const parsed = UnclaimItemSchema.parse(input)
    tripId = parsed.tripId
    const participant = await assertParticipant(parsed.tripId)
    await assertItemBelongsToTrip(parsed.tripId, parsed.itemId)
    await getStorage().claims.remove(parsed.itemId, participant.id)
    await touchTripTag(parsed.tripId)
    return ok({ itemId: parsed.itemId })
  } catch (e) {
    await rethrowControlFlow(e)
    return mapThrown('unclaimItem', tripId, e)
  }
}
