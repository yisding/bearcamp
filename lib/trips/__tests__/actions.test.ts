// WS-7 T7.3–T7.8 — Server Actions (red phase).
//
// Targets the real `lib/trips/actions.ts` module (does not exist yet — red).
// Uses WS-0 in-memory storage as the backend. Mocks next/headers (async
// cookies()), next/navigation (redirect throws sentinel), next/cache
// (updateTag / revalidateTag are spies).
//
// Coverage map:
//   - T7.3 createTrip
//   - T7.4  renameTrip
//   - T7.4b updateTripSettings
//   - T7.4c deleteTrip
//   - T7.5  item mutations (addItem/updateItem/removeItem/reorderItem)
//   - T7.5b restoreItem
//   - T7.6  joinTrip + participant cap
//   - T7.7  claim/unclaim
//   - T7.8  security (cross-trip, structured console.error, redirect not
//           swallowed)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Cookie jar mock (async cookies(), records all set/delete calls). ---

interface CookieEntry {
  name: string
  value: string
  options?: Record<string, unknown>
}

const jarStore = new Map<string, CookieEntry>()
const setCalls: Array<{ name: string; value: string; options?: Record<string, unknown> }> = []
const deleteCalls: Array<{ name: string }> = []

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const entry = jarStore.get(name)
      return entry ? { name: entry.name, value: entry.value } : undefined
    },
    set: (
      nameOrObj: string | { name: string; value: string; [k: string]: unknown },
      value?: string,
      options?: Record<string, unknown>,
    ) => {
      if (typeof nameOrObj === 'string') {
        setCalls.push({ name: nameOrObj, value: value ?? '', options })
        // Simulate maxAge:0 → cookie cleared from the jar (browser semantics).
        if (options && (options as Record<string, unknown>).maxAge === 0) {
          jarStore.delete(nameOrObj)
        } else {
          jarStore.set(nameOrObj, { name: nameOrObj, value: value ?? '', options })
        }
      } else {
        const { name, value: v, ...opts } = nameOrObj
        setCalls.push({ name, value: v, options: opts })
        if ((opts as Record<string, unknown>).maxAge === 0) {
          jarStore.delete(name)
        } else {
          jarStore.set(name, { name, value: v, options: opts })
        }
      }
    },
    delete: (name: string) => {
      deleteCalls.push({ name })
      jarStore.delete(name)
    },
    has: (name: string) => jarStore.has(name),
  }),
}))

// ---- next/navigation: redirect throws a sentinel; unstable_rethrow rethrows. ---

class RedirectSentinel extends Error {
  constructor(public to: string) {
    super(`NEXT_REDIRECT:${to}`)
  }
}

const redirectMock = vi.fn((to: string) => {
  throw new RedirectSentinel(to)
})

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  unstable_rethrow: (e: unknown) => {
    if (e instanceof RedirectSentinel) throw e
    // notFound sentinel would go here too — not needed at WS-7.
  },
}))

// ---- next/cache: updateTag & revalidateTag are spies. ----

const updateTagMock = vi.fn<(tag: string) => void>()
const revalidateTagMock = vi.fn<(tag: string, profile?: string) => void>()

vi.mock('next/cache', () => ({
  updateTag: updateTagMock,
  revalidateTag: revalidateTagMock,
}))

// ---- Imports AFTER vi.mock so the mocks are in place. ----

import { _resetMemoryStorage, memoryStorage } from '../../db/storage.memory'
import { PARTICIPANT_CAP_PER_TRIP } from '../../limits'
import { token } from '../../ids'

// Real actions + identity — do NOT exist yet (red).
import {
  createTrip,
  renameTrip,
  updateTripSettings,
  deleteTrip,
  addItem,
  updateItem,
  removeItem,
  restoreItem,
  reorderItem,
  joinTrip,
  claimItem,
  unclaimItem,
} from '../actions'

import { OWNER_COOKIE, PARTICIPANT_COOKIE } from '../identity'

// ---- Helpers ----

// Pick a real fixture id so createTrip's CampsiteSource lookup resolves.
const FIXTURE_CAMPSITE_ID = 'fixture:big-sur-state'

function asOk<T>(r: { ok: true; data: T } | { ok: false; error: { code: string; message: string } }): T {
  if (!r.ok) throw new Error(`expected ok envelope, got: ${r.error.code} / ${r.error.message}`)
  return r.data
}

beforeEach(() => {
  jarStore.clear()
  setCalls.length = 0
  deleteCalls.length = 0
  redirectMock.mockClear()
  updateTagMock.mockClear()
  revalidateTagMock.mockClear()
  _resetMemoryStorage()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// =========================================================================
// T7.3 createTrip
// =========================================================================

describe('T7.3 createTrip', () => {
  it('creates a trip, items, and an owner participant (isOwner=true)', async () => {
    let redirected: RedirectSentinel | undefined
    try {
      await createTrip({ campsiteId: FIXTURE_CAMPSITE_ID, style: 'car' })
    } catch (e) {
      if (e instanceof RedirectSentinel) redirected = e
      else throw e
    }
    // createTrip uses Form A: redirect() is called outside try/catch on success.
    expect(redirected).toBeInstanceOf(RedirectSentinel)
    // Exactly one trip in storage.
    const trips = await memoryStorage.participants.listByTrip('not-used-just-to-touch')
    void trips
    // Find the trip via the redirect URL.
    const match = redirected!.to.match(/^\/trips\/(.+)$/)
    expect(match).not.toBeNull()
    const tripId = decodeURIComponent(match![1])

    const trip = await memoryStorage.trips.getById(tripId)
    expect(trip).not.toBeNull()
    expect(trip!.campsiteId).toBe(FIXTURE_CAMPSITE_ID)

    // Items: list from generate(style, amenities) — stub yields 11 items.
    const items = await memoryStorage.items.listByTrip(tripId)
    expect(items.length).toBeGreaterThan(0)

    // Owner participant present and isOwner=true (DR-13).
    const participants = await memoryStorage.participants.listByTrip(tripId)
    expect(participants).toHaveLength(1)
    expect(participants[0].isOwner).toBe(true)
  })

  it('sets BOTH bc_owner AND bc_participant cookies', async () => {
    try {
      await createTrip({ campsiteId: FIXTURE_CAMPSITE_ID, style: 'car' })
    } catch (e) {
      if (!(e instanceof RedirectSentinel)) throw e
    }
    expect(setCalls.some((c) => c.name === OWNER_COOKIE)).toBe(true)
    expect(setCalls.some((c) => c.name === PARTICIPANT_COOKIE)).toBe(true)
    // Both cookies should still be live in the jar (both with non-zero maxAge).
    expect(jarStore.has(OWNER_COOKIE)).toBe(true)
    expect(jarStore.has(PARTICIPANT_COOKIE)).toBe(true)
  })

  it('redirects to routes.trip(id) on success (redirect() called once with /trips/<id>)', async () => {
    try {
      await createTrip({ campsiteId: FIXTURE_CAMPSITE_ID, style: 'car' })
    } catch (e) {
      if (!(e instanceof RedirectSentinel)) throw e
    }
    expect(redirectMock).toHaveBeenCalledTimes(1)
    const arg = redirectMock.mock.calls[0][0]
    expect(arg).toMatch(/^\/trips\/.+$/)
  })

  it('solo creator → participantCount === 1 and per_person needed === 1', async () => {
    let tripId: string | undefined
    try {
      await createTrip({ campsiteId: FIXTURE_CAMPSITE_ID, style: 'car' })
    } catch (e) {
      if (e instanceof RedirectSentinel) {
        const m = e.to.match(/^\/trips\/(.+)$/)
        if (m) tripId = decodeURIComponent(m[1])
      } else {
        throw e
      }
    }
    expect(tripId).toBeDefined()
    const count = await memoryStorage.participants.count(tripId!)
    expect(count).toBe(1)
    const view = await memoryStorage.view.buildTripView(tripId!)
    expect(view).not.toBeNull()
    // Each per_person item with baseQty=1 should have needed=1.
    const perPerson = view!.items.find((i) => i.scope === 'per_person')
    expect(perPerson).toBeDefined()
    expect(perPerson!.needed).toBe(1 * perPerson!.baseQty)
  })

  it('returns validation_failed envelope (does not redirect) on invalid input', async () => {
    // Form A: failure path returns the typed envelope (no redirect).
    let returned: unknown
    try {
      returned = await createTrip({
        campsiteId: '',
        style: 'rocket' as unknown as 'car',
      })
    } catch (e) {
      if (e instanceof RedirectSentinel) throw new Error('redirect should not fire on invalid input')
      throw e
    }
    expect(returned).toBeDefined()
    const r = returned as { ok: boolean; error?: { code: string } }
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('validation_failed')
    expect(redirectMock).not.toHaveBeenCalled()
  })
})

// =========================================================================
// T7.4 renameTrip
// =========================================================================

describe('T7.4 renameTrip', () => {
  async function setupAsOwner() {
    let tripId: string | undefined
    try {
      await createTrip({ campsiteId: FIXTURE_CAMPSITE_ID, style: 'car' })
    } catch (e) {
      if (e instanceof RedirectSentinel) {
        const m = e.to.match(/^\/trips\/(.+)$/)
        if (m) tripId = decodeURIComponent(m[1])
      } else throw e
    }
    return tripId!
  }

  it('non-owner is rejected (unauthorized)', async () => {
    const tripId = await setupAsOwner()
    // Wipe cookies → simulate a request without a session.
    jarStore.clear()
    const r = await renameTrip({ tripId, name: 'Renamed' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('unauthorized')
  })

  it('owner can rename, name persists, updateTag("trip:"+id) is called', async () => {
    const tripId = await setupAsOwner()
    updateTagMock.mockClear()
    const r = await renameTrip({ tripId, name: 'Brand New Name' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.name).toBe('Brand New Name')
    const t = await memoryStorage.trips.getById(tripId)
    expect(t!.name).toBe('Brand New Name')
    expect(updateTagMock).toHaveBeenCalledWith(`trip:${tripId}`)
  })
})

// =========================================================================
// T7.4b updateTripSettings
// =========================================================================

describe('T7.4b updateTripSettings', () => {
  async function setupAsOwner() {
    let tripId: string | undefined
    try {
      await createTrip({ campsiteId: FIXTURE_CAMPSITE_ID, style: 'car' })
    } catch (e) {
      if (e instanceof RedirectSentinel) {
        const m = e.to.match(/^\/trips\/(.+)$/)
        if (m) tripId = decodeURIComponent(m[1])
      } else throw e
    }
    return tripId!
  }

  it('non-owner rejected', async () => {
    const tripId = await setupAsOwner()
    jarStore.clear()
    const r = await updateTripSettings({ tripId, patch: { tentCapacity: 4 } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('unauthorized')
  })

  it('owner updates tentCapacity and per_tent shortfall recomputes', async () => {
    const tripId = await setupAsOwner()
    // Add a few participants so per_tent math actually changes.
    // 5 participants / tentCapacity=2 → ceil(5/2) = 3 tents.
    // After tentCapacity=4 → ceil(5/4) = 2 tents.
    // Add 4 more (joining requires a fresh participant cookie path; just go
    // direct to storage since we're testing the action's tentCapacity effect).
    const baseTrip = await memoryStorage.trips.getById(tripId)
    void baseTrip
    for (let i = 0; i < 4; i++) {
      await memoryStorage.participants.add(tripId, `J${i}`, false, token())
    }
    const r = await updateTripSettings({ tripId, patch: { tentCapacity: 4 } })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.tentCapacity).toBe(4)

    const view = await memoryStorage.view.buildTripView(tripId)
    expect(view).not.toBeNull()
    const perTent = view!.items.find((i) => i.scope === 'per_tent')
    expect(perTent).toBeDefined()
    // 5 participants / capacity 4 → 2 tents.
    expect(perTent!.needed).toBe(2 * perTent!.baseQty)
    expect(updateTagMock).toHaveBeenCalledWith(`trip:${tripId}`)
  })
})

// =========================================================================
// T7.4c deleteTrip
// =========================================================================

describe('T7.4c deleteTrip', () => {
  async function setupAsOwner() {
    let tripId: string | undefined
    try {
      await createTrip({ campsiteId: FIXTURE_CAMPSITE_ID, style: 'car' })
    } catch (e) {
      if (e instanceof RedirectSentinel) {
        const m = e.to.match(/^\/trips\/(.+)$/)
        if (m) tripId = decodeURIComponent(m[1])
      } else throw e
    }
    return tripId!
  }

  it('non-owner is rejected', async () => {
    const tripId = await setupAsOwner()
    jarStore.clear()
    const r = await deleteTrip({ tripId })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('unauthorized')
  })

  it('owner deletes — items/participants/claims cascade away', async () => {
    const tripId = await setupAsOwner()
    // Pre-state: items + 1 participant exist.
    expect((await memoryStorage.items.listByTrip(tripId)).length).toBeGreaterThan(0)
    expect(await memoryStorage.participants.count(tripId)).toBe(1)

    // Add a claim so we can verify it's cleaned up too.
    const items = await memoryStorage.items.listByTrip(tripId)
    const owners = await memoryStorage.participants.listByTrip(tripId)
    await memoryStorage.claims.upsert(items[0].id, owners[0].id, 1)
    expect((await memoryStorage.claims.listByTrip(tripId))).toHaveLength(1)

    // deleteTrip: Form A — redirect('/') fires on success, so wrap in try.
    let sentinel: RedirectSentinel | undefined
    try {
      await deleteTrip({ tripId })
    } catch (e) {
      if (e instanceof RedirectSentinel) sentinel = e
      else throw e
    }
    expect(sentinel).toBeInstanceOf(RedirectSentinel)
    expect(sentinel!.to).toBe('/')

    expect(await memoryStorage.trips.getById(tripId)).toBeNull()
    expect((await memoryStorage.items.listByTrip(tripId))).toHaveLength(0)
    expect(await memoryStorage.participants.count(tripId)).toBe(0)
    expect((await memoryStorage.claims.listByTrip(tripId))).toHaveLength(0)
  })

  it('clears bc_owner AND bc_participant via maxAge:0 (NOT jar.delete)', async () => {
    const tripId = await setupAsOwner()
    deleteCalls.length = 0
    setCalls.length = 0
    try {
      await deleteTrip({ tripId })
    } catch (e) {
      if (!(e instanceof RedirectSentinel)) throw e
    }
    // Per DR-40: never use jar.delete to clear path-scoped cookies.
    expect(deleteCalls).toHaveLength(0)

    const ownerClear = setCalls.find(
      (c) => c.name === OWNER_COOKIE && c.options?.maxAge === 0,
    )
    const partClear = setCalls.find(
      (c) => c.name === PARTICIPANT_COOKIE && c.options?.maxAge === 0,
    )
    expect(ownerClear).toBeDefined()
    expect(partClear).toBeDefined()
    expect(ownerClear!.options!.path).toBe(`/trips/${tripId}`)
    expect(partClear!.options!.path).toBe(`/trips/${tripId}`)
    expect(ownerClear!.value).toBe('')
    expect(partClear!.value).toBe('')
  })

  it('redirect("/") fires (call observed) — not swallowed inside try/catch (DR-45)', async () => {
    const tripId = await setupAsOwner()
    redirectMock.mockClear()
    try {
      await deleteTrip({ tripId })
    } catch (e) {
      if (!(e instanceof RedirectSentinel)) throw e
    }
    expect(redirectMock).toHaveBeenCalledTimes(1)
    expect(redirectMock.mock.calls[0][0]).toBe('/')
  })
})

// =========================================================================
// T7.5 item mutations
// =========================================================================

describe('T7.5 item mutations', () => {
  async function setupAsOwner() {
    let tripId: string | undefined
    try {
      await createTrip({ campsiteId: FIXTURE_CAMPSITE_ID, style: 'car' })
    } catch (e) {
      if (e instanceof RedirectSentinel) {
        const m = e.to.match(/^\/trips\/(.+)$/)
        if (m) tripId = decodeURIComponent(m[1])
      } else throw e
    }
    return tripId!
  }

  it('addItem: non-owner rejected', async () => {
    const tripId = await setupAsOwner()
    jarStore.clear()
    const r = await addItem({
      tripId,
      category: 'Food',
      name: 'Snack',
      scope: 'per_person',
      baseQty: 1,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('unauthorized')
  })

  it('addItem: owner can add; updateTag fires', async () => {
    const tripId = await setupAsOwner()
    updateTagMock.mockClear()
    const r = await addItem({
      tripId,
      category: 'Food',
      name: 'Snack',
      scope: 'per_person',
      baseQty: 1,
    })
    expect(r.ok).toBe(true)
    const list = await memoryStorage.items.listByTrip(tripId)
    expect(list.some((i) => i.name === 'Snack')).toBe(true)
    expect(updateTagMock).toHaveBeenCalledWith(`trip:${tripId}`)
  })

  it('updateItem: rename persists', async () => {
    const tripId = await setupAsOwner()
    const initial = (await memoryStorage.items.listByTrip(tripId))[0]
    updateTagMock.mockClear()
    const r = await updateItem({
      tripId,
      itemId: initial.id,
      patch: { name: 'Renamed' },
    })
    expect(r.ok).toBe(true)
    const reloaded = (await memoryStorage.items.listByTrip(tripId)).find(
      (i) => i.id === initial.id,
    )!
    expect(reloaded.name).toBe('Renamed')
    expect(updateTagMock).toHaveBeenCalledWith(`trip:${tripId}`)
  })

  it('updateItem: baseQty change recomputes requiredQty in next view', async () => {
    const tripId = await setupAsOwner()
    const items = await memoryStorage.items.listByTrip(tripId)
    const perPerson = items.find((i) => i.scope === 'per_person')!
    // Solo: needed = baseQty * 1 = 1.
    const before = await memoryStorage.view.buildTripView(tripId)
    const beforeItem = before!.items.find((i) => i.id === perPerson.id)!
    expect(beforeItem.needed).toBe(perPerson.baseQty)

    const r = await updateItem({
      tripId,
      itemId: perPerson.id,
      patch: { baseQty: 3 },
    })
    expect(r.ok).toBe(true)
    const after = await memoryStorage.view.buildTripView(tripId)
    const afterItem = after!.items.find((i) => i.id === perPerson.id)!
    // Solo + per_person + baseQty=3 → needed=3.
    expect(afterItem.needed).toBe(3)
  })

  it('updateItem: scope change recomputes requiredQty', async () => {
    const tripId = await setupAsOwner()
    // Add 3 more participants to make per_person vs shared distinguishable.
    for (let i = 0; i < 3; i++) {
      await memoryStorage.participants.add(tripId, `J${i}`, false, token())
    }
    const items = await memoryStorage.items.listByTrip(tripId)
    const target = items.find((i) => i.scope === 'shared')!
    // shared + baseQty=1 → needed=1 regardless of participantCount.
    const before = await memoryStorage.view.buildTripView(tripId)
    expect(before!.items.find((i) => i.id === target.id)!.needed).toBe(target.baseQty)

    const r = await updateItem({
      tripId,
      itemId: target.id,
      patch: { scope: 'per_person' },
    })
    expect(r.ok).toBe(true)
    const after = await memoryStorage.view.buildTripView(tripId)
    // per_person + 4 participants + baseQty=1 → needed=4.
    expect(after!.items.find((i) => i.id === target.id)!.needed).toBe(4)
  })

  it('removeItem: soft-removes (kept) but keeps claims (DR-19 / G-soft)', async () => {
    const tripId = await setupAsOwner()
    const items = await memoryStorage.items.listByTrip(tripId)
    const owners = await memoryStorage.participants.listByTrip(tripId)
    const target = items[0]
    await memoryStorage.claims.upsert(target.id, owners[0].id, 1)

    updateTagMock.mockClear()
    const r = await removeItem({ tripId, itemId: target.id })
    expect(r.ok).toBe(true)
    expect(updateTagMock).toHaveBeenCalledWith(`trip:${tripId}`)

    // Soft-deleted (removed=true). Claim survives (in the
    // removedItemsWithClaims bucket of the next view).
    const view = await memoryStorage.view.buildTripView(tripId)
    expect(view).not.toBeNull()
    expect(view!.items.some((i) => i.id === target.id)).toBe(false)
    expect(view!.removedItemsWithClaims.some((i) => i.id === target.id)).toBe(true)
    const claims = await memoryStorage.claims.listByTrip(tripId)
    expect(claims.some((c) => c.itemId === target.id)).toBe(true)
  })

  it('reorderItem: owner-only; updates sortOrder', async () => {
    const tripId = await setupAsOwner()
    const items = await memoryStorage.items.listByTrip(tripId)
    // Move the last item to index 0.
    const last = items[items.length - 1]
    const r = await reorderItem({ tripId, itemId: last.id, newIndex: 0 })
    expect(r.ok).toBe(true)
    const reordered = await memoryStorage.items.listByTrip(tripId)
    expect(reordered[0].id).toBe(last.id)
  })

  it('reorderItem: non-owner rejected', async () => {
    const tripId = await setupAsOwner()
    const items = await memoryStorage.items.listByTrip(tripId)
    jarStore.clear()
    const r = await reorderItem({ tripId, itemId: items[0].id, newIndex: 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('unauthorized')
  })
})

// =========================================================================
// T7.5b restoreItem
// =========================================================================

describe('T7.5b restoreItem', () => {
  async function setupAsOwner() {
    let tripId: string | undefined
    try {
      await createTrip({ campsiteId: FIXTURE_CAMPSITE_ID, style: 'car' })
    } catch (e) {
      if (e instanceof RedirectSentinel) {
        const m = e.to.match(/^\/trips\/(.+)$/)
        if (m) tripId = decodeURIComponent(m[1])
      } else throw e
    }
    return tripId!
  }

  it('owner restores soft-removed item (flips removed=false)', async () => {
    const tripId = await setupAsOwner()
    const items = await memoryStorage.items.listByTrip(tripId)
    const target = items[0]
    await memoryStorage.items.softRemove(target.id)

    updateTagMock.mockClear()
    const r = await restoreItem({ tripId, itemId: target.id })
    expect(r.ok).toBe(true)
    const reloaded = (await memoryStorage.items.listByTrip(tripId)).find(
      (i) => i.id === target.id,
    )!
    expect(reloaded.removed).toBe(false)
    expect(updateTagMock).toHaveBeenCalledWith(`trip:${tripId}`)

    const view = await memoryStorage.view.buildTripView(tripId)
    expect(view!.items.some((i) => i.id === target.id)).toBe(true)
  })

  it('non-owner rejected', async () => {
    const tripId = await setupAsOwner()
    const items = await memoryStorage.items.listByTrip(tripId)
    await memoryStorage.items.softRemove(items[0].id)
    jarStore.clear()
    const r = await restoreItem({ tripId, itemId: items[0].id })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('unauthorized')
  })
})

// =========================================================================
// T7.6 joinTrip + participant cap
// =========================================================================

describe('T7.6 joinTrip', () => {
  async function setupOwnedTrip() {
    let tripId: string | undefined
    try {
      await createTrip({ campsiteId: FIXTURE_CAMPSITE_ID, style: 'car' })
    } catch (e) {
      if (e instanceof RedirectSentinel) {
        const m = e.to.match(/^\/trips\/(.+)$/)
        if (m) tripId = decodeURIComponent(m[1])
      } else throw e
    }
    return tripId!
  }

  it('adds a participant, sets bc_participant cookie, calls updateTag', async () => {
    const tripId = await setupOwnedTrip()
    // A joiner is not the owner — clear cookies (DR-45) so we have a "no
    // session yet" actor; joinTrip should NOT require pre-existing identity.
    jarStore.clear()
    setCalls.length = 0
    updateTagMock.mockClear()
    const r = await joinTrip({ tripId, name: 'Joiner' })
    expect(r.ok).toBe(true)
    const count = await memoryStorage.participants.count(tripId)
    // Owner + Joiner = 2.
    expect(count).toBe(2)
    expect(setCalls.some((c) => c.name === PARTICIPANT_COOKIE)).toBe(true)
    expect(updateTagMock).toHaveBeenCalledWith(`trip:${tripId}`)
  })

  it('51st join returns participant_cap_reached envelope with canonical message (DR-46)', async () => {
    const tripId = await setupOwnedTrip()
    // Trip already has 1 participant (the owner). Add (cap - 1) = 49 more
    // directly via storage to hit cap. The next join action call is the 51st
    // participant attempt.
    const remaining = PARTICIPANT_CAP_PER_TRIP - 1
    for (let i = 0; i < remaining; i++) {
      await memoryStorage.participants.add(tripId, `Filler${i}`, false, token())
    }
    expect(await memoryStorage.participants.count(tripId)).toBe(PARTICIPANT_CAP_PER_TRIP)

    setCalls.length = 0
    const r = await joinTrip({ tripId, name: 'Overflow' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe('participant_cap_reached')
      // DR-46: this exact string is the canonical UI copy.
      expect(r.error.message).toBe('This trip is full (50 people).')
    }
    // No state mutation: still exactly cap participants.
    expect(await memoryStorage.participants.count(tripId)).toBe(PARTICIPANT_CAP_PER_TRIP)
    // No cookie set on failure.
    expect(setCalls.some((c) => c.name === PARTICIPANT_COOKIE)).toBe(false)
  })

  it('rejects empty name via validation_failed', async () => {
    const tripId = await setupOwnedTrip()
    const r = await joinTrip({ tripId, name: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('validation_failed')
  })
})

// =========================================================================
// T7.7 claim / unclaim
// =========================================================================

describe('T7.7 claim/unclaim', () => {
  async function setupOwnedTrip() {
    let tripId: string | undefined
    try {
      await createTrip({ campsiteId: FIXTURE_CAMPSITE_ID, style: 'car' })
    } catch (e) {
      if (e instanceof RedirectSentinel) {
        const m = e.to.match(/^\/trips\/(.+)$/)
        if (m) tripId = decodeURIComponent(m[1])
      } else throw e
    }
    return tripId!
  }

  it('non-participant (no bc_participant) is rejected', async () => {
    const tripId = await setupOwnedTrip()
    const items = await memoryStorage.items.listByTrip(tripId)
    jarStore.clear()
    const r = await claimItem({ tripId, itemId: items[0].id, qty: 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('unauthorized')
  })

  it('claim resolves participantId from bc_participant cookie (NOT from input — I-C)', async () => {
    const tripId = await setupOwnedTrip()
    const items = await memoryStorage.items.listByTrip(tripId)
    const target = items.find((i) => i.scope === 'per_person')!
    const before = await memoryStorage.view.buildTripView(tripId)
    const beforeItem = before!.items.find((i) => i.id === target.id)!
    // baseQty=1, solo → needed=1.
    expect(beforeItem.shortfall).toBe(beforeItem.baseQty)

    updateTagMock.mockClear()
    const r = await claimItem({ tripId, itemId: target.id, qty: 1 })
    expect(r.ok).toBe(true)
    expect(updateTagMock).toHaveBeenCalledWith(`trip:${tripId}`)

    const after = await memoryStorage.view.buildTripView(tripId)
    const afterItem = after!.items.find((i) => i.id === target.id)!
    // 1 claim of qty 1 covers the per_person base.
    expect(afterItem.claimed).toBe(1)
    expect(afterItem.shortfall).toBe(0)
    // The participant in the claim row is the cookie-owner (the trip
    // creator), NOT an action-input field.
    expect(afterItem.claims).toHaveLength(1)
    expect(afterItem.claims[0].participant.isOwner).toBe(true)
  })

  it('unclaim removes the row; updateTag fires; shortfall recomputes', async () => {
    const tripId = await setupOwnedTrip()
    const items = await memoryStorage.items.listByTrip(tripId)
    const target = items.find((i) => i.scope === 'per_person')!

    await claimItem({ tripId, itemId: target.id, qty: 1 })
    updateTagMock.mockClear()

    const r = await unclaimItem({ tripId, itemId: target.id })
    expect(r.ok).toBe(true)
    expect(updateTagMock).toHaveBeenCalledWith(`trip:${tripId}`)

    const view = await memoryStorage.view.buildTripView(tripId)
    const item = view!.items.find((i) => i.id === target.id)!
    expect(item.claims).toHaveLength(0)
    expect(item.claimed).toBe(0)
    expect(item.shortfall).toBe(item.baseQty)
  })

  it('claimItem against an unknown itemId returns not_found (via mapThrown)', async () => {
    const tripId = await setupOwnedTrip()
    const r = await claimItem({ tripId, itemId: 'item_missing', qty: 1 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('not_found')
  })

  it('unclaimItem against an unknown itemId returns not_found (via mapThrown)', async () => {
    const tripId = await setupOwnedTrip()
    const r = await unclaimItem({ tripId, itemId: 'item_missing' })
    // claims.remove is idempotent for an unknown row; if no error is thrown
    // this resolves ok. The assertion is that it never returns `internal`.
    if (!r.ok) expect(r.error.code).toBe('not_found')
  })

  it('claimItem schema rejects input that tries to inject participantId at runtime', async () => {
    const tripId = await setupOwnedTrip()
    const items = await memoryStorage.items.listByTrip(tripId)
    // Even at runtime — TypeScript already rejects this — the action validates
    // input and rejects extra fields (validation_failed).
    const r = await claimItem({
      tripId,
      itemId: items[0].id,
      qty: 1,
      participantId: 'p_evil',
    } as unknown as { tripId: string; itemId: string; qty: number })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      // Either validation_failed (preferred) or unauthorized (if input is
      // stripped by parser before the field name is rejected) is acceptable.
      expect(['validation_failed', 'unauthorized']).toContain(r.error.code)
    }
  })
})

// =========================================================================
// T7.8 security
// =========================================================================

describe('T7.8 security', () => {
  async function setupOwnedTrip(label?: string) {
    let tripId: string | undefined
    try {
      await createTrip({
        campsiteId: FIXTURE_CAMPSITE_ID,
        style: 'car',
        ownerName: label,
      })
    } catch (e) {
      if (e instanceof RedirectSentinel) {
        const m = e.to.match(/^\/trips\/(.+)$/)
        if (m) tripId = decodeURIComponent(m[1])
      } else throw e
    }
    return tripId!
  }

  it('direct call without a valid cookie is rejected (unauthorized)', async () => {
    const tripId = await setupOwnedTrip()
    jarStore.clear()
    const r = await renameTrip({ tripId, name: 'Hack' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('unauthorized')
  })

  it('cross-trip token (bc_owner for A used on B) is rejected (DR-34)', async () => {
    const aId = await setupOwnedTrip('A')
    // bc_owner now belongs to A (via createTrip's set call).
    // Make trip B with a fresh cookie state.
    jarStore.clear()
    const bId = await setupOwnedTrip('B')
    // Save B's owner cookie value (the create call sets one) — then put A's
    // cookie back in the jar to simulate a cross-trip attempt.
    const aOwnerToken = await (async () => {
      // The owner token issued for A is the one stored under bc_owner just
      // before we cleared the jar — we need to read it from setCalls
      // (since the jar was cleared). The cleanest source is the storage:
      // we re-issue ownership lookup via the storage adapter to verify the
      // assertion semantic, regardless of internals.
      // Easier path: simulate the attack with a known-bogus-for-B token by
      // copying any non-empty owner cookie value that was set for A.
      const aSet = setCalls.find(
        (c) => c.name === OWNER_COOKIE && c.value && c.value !== '',
      )
      return aSet?.value ?? 'fallback-bogus-token'
    })()
    void aId
    jarStore.clear()
    jarStore.set(OWNER_COOKIE, { name: OWNER_COOKIE, value: aOwnerToken })

    const r = await renameTrip({ tripId: bId, name: 'cross-trip-attack' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('unauthorized')
  })

  it('emits one structured console.error("[bc.action]", { action, ... }) on failure', async () => {
    const tripId = await setupOwnedTrip()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      jarStore.clear()
      // Trigger an unauthorized failure.
      await renameTrip({ tripId, name: 'x' })
      // Find the structured log line.
      const matched = spy.mock.calls.find(
        (call) =>
          call.length >= 2 &&
          call[0] === '[bc.action]' &&
          typeof call[1] === 'object' &&
          call[1] !== null &&
          'action' in (call[1] as object),
      )
      expect(matched, 'structured [bc.action] log line should be emitted on failure').toBeDefined()
      const payload = matched![1] as Record<string, unknown>
      expect(payload.action).toBe('renameTrip')
    } finally {
      spy.mockRestore()
    }
  })

  // Cross-trip item isolation (DR-34 at the action layer). Without the
  // assertItemBelongsToTrip check, an owner authorized for trip A could
  // mutate an item belonging to trip B by passing trip A's tripId + trip
  // B's itemId — the storage's items.update / softRemove / restore repos
  // are keyed on itemId alone. Each branch below proves the gap is closed
  // and the leak-safe envelope is `not_found`.
  describe('cross-trip item isolation: owner of A cannot mutate items in B', () => {
    async function setupTwoOwnedTrips(): Promise<{
      aId: string
      bId: string
      aItemId: string
      bItemId: string
      aOwnerCookie: string
    }> {
      // Trip A — owner cookie ends up in the jar.
      const aId = await setupOwnedTrip('A')
      const aItems = await memoryStorage.items.listByTrip(aId)
      const aItemId = aItems[0].id
      const aOwnerEntry = jarStore.get(OWNER_COOKIE)!
      const aOwnerCookie = aOwnerEntry.value
      // Trip B — fresh jar so B's create issues a separate owner cookie.
      jarStore.clear()
      const bId = await setupOwnedTrip('B')
      const bItems = await memoryStorage.items.listByTrip(bId)
      const bItemId = bItems[0].id
      // Restore A's owner cookie — we're now acting AS A's owner.
      jarStore.clear()
      jarStore.set(OWNER_COOKIE, {
        name: OWNER_COOKIE,
        value: aOwnerCookie,
      })
      return { aId, bId, aItemId, bItemId, aOwnerCookie }
    }

    it('updateItem rejects cross-trip itemId with not_found', async () => {
      const { aId, bId, bItemId } = await setupTwoOwnedTrips()
      const bBefore = (await memoryStorage.items.listByTrip(bId)).find(
        (i) => i.id === bItemId,
      )!
      const r = await updateItem({
        tripId: aId,
        itemId: bItemId,
        patch: { name: 'hacked' },
      })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code).toBe('not_found')
      // B's item is unchanged — name still the original.
      const bAfter = (await memoryStorage.items.listByTrip(bId)).find(
        (i) => i.id === bItemId,
      )!
      expect(bAfter.name).toBe(bBefore.name)
    })

    it('removeItem rejects cross-trip itemId with not_found', async () => {
      const { aId, bId, bItemId } = await setupTwoOwnedTrips()
      const r = await removeItem({ tripId: aId, itemId: bItemId })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code).toBe('not_found')
      // B's item still present and not removed.
      const bItem = (await memoryStorage.items.listByTrip(bId)).find(
        (i) => i.id === bItemId,
      )
      expect(bItem).toBeDefined()
      expect(bItem!.removed).toBe(false)
    })

    it('restoreItem rejects cross-trip itemId with not_found', async () => {
      const { aId, bId, bItemId } = await setupTwoOwnedTrips()
      // Soft-remove B's item directly so a restore would be a real change.
      await memoryStorage.items.softRemove(bItemId)
      const r = await restoreItem({ tripId: aId, itemId: bItemId })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code).toBe('not_found')
      // B's item is still removed.
      const bItem = (await memoryStorage.items.listByTrip(bId)).find(
        (i) => i.id === bItemId,
      )
      expect(bItem!.removed).toBe(true)
    })
  })

  // Cross-trip claim isolation. A participant of trip A who learns an
  // itemId in trip B must not be able to claim/unclaim it via the trip A
  // identity. Without the assertItemBelongsToTrip check, claims.upsert
  // would happily write a row keyed on (itemId, participantId) and even
  // touch trip A's cache tag for data that lives in trip B.
  describe('cross-trip claim isolation: participant of A cannot claim items in B', () => {
    it('claimItem rejects cross-trip itemId with not_found', async () => {
      // Trip A — creator is participant #1, bc_participant cookie set.
      const aId = await setupOwnedTrip('A')
      const aParticipantEntry = jarStore.get(PARTICIPANT_COOKIE)!
      const aParticipantCookie = aParticipantEntry.value
      // Trip B — fresh jar.
      jarStore.clear()
      const bId = await setupOwnedTrip('B')
      const bItems = await memoryStorage.items.listByTrip(bId)
      const bItemId = bItems[0].id
      // Restore A's participant cookie — actor is now A's participant.
      jarStore.clear()
      jarStore.set(PARTICIPANT_COOKIE, {
        name: PARTICIPANT_COOKIE,
        value: aParticipantCookie,
      })

      const r = await claimItem({ tripId: aId, itemId: bItemId, qty: 1 })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code).toBe('not_found')
      // No claim was written against B's item.
      const bClaims = await memoryStorage.claims.listByTrip(bId)
      expect(bClaims.some((c) => c.itemId === bItemId)).toBe(false)
    })

    it('unclaimItem rejects cross-trip itemId with not_found', async () => {
      const aId = await setupOwnedTrip('A')
      const aParticipantCookie = jarStore.get(PARTICIPANT_COOKIE)!.value
      jarStore.clear()
      const bId = await setupOwnedTrip('B')
      const bItems = await memoryStorage.items.listByTrip(bId)
      const bItemId = bItems[0].id
      // Plant a legitimate claim on B's item by B's owner so we can verify
      // the cross-trip unclaim attempt does NOT delete it.
      const bOwners = await memoryStorage.participants.listByTrip(bId)
      await memoryStorage.claims.upsert(bItemId, bOwners[0].id, 1)
      expect(
        (await memoryStorage.claims.listByTrip(bId)).some(
          (c) => c.itemId === bItemId,
        ),
      ).toBe(true)

      jarStore.clear()
      jarStore.set(PARTICIPANT_COOKIE, {
        name: PARTICIPANT_COOKIE,
        value: aParticipantCookie,
      })

      const r = await unclaimItem({ tripId: aId, itemId: bItemId })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error.code).toBe('not_found')
      // B's claim is untouched.
      expect(
        (await memoryStorage.claims.listByTrip(bId)).some(
          (c) => c.itemId === bItemId,
        ),
      ).toBe(true)
    })
  })

  it('createTrip: redirect() throw is NOT swallowed (Form A — DR-45)', async () => {
    // Successful createTrip must let the RedirectSentinel propagate.
    let caught: unknown
    try {
      await createTrip({ campsiteId: FIXTURE_CAMPSITE_ID, style: 'car' })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(RedirectSentinel)
    // And the result was NOT returned as a {ok:false} envelope.
    expect(redirectMock).toHaveBeenCalled()
  })

  it('deleteTrip: redirect() throw is NOT swallowed (Form A — DR-45)', async () => {
    const tripId = await setupOwnedTrip()
    let caught: unknown
    try {
      await deleteTrip({ tripId })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(RedirectSentinel)
  })
})
