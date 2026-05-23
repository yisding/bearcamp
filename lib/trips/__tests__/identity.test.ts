// WS-7 T7.1 — identity guards (red phase).
//
// Targets the real `lib/trips/identity.ts` (does not exist yet — this is the
// expected red state). Verifies:
//   - `assertOwner` / `assertParticipant` pass with the correct token, throw
//     `unauthorized` on missing/wrong token.
//   - `bc_owner` and `bc_participant` are distinct cookies and coexist
//     (DR-3 / B6).
//   - Cookies are httpOnly and path-scoped to `/trips/<id>` (DR-42).
//   - Cross-trip rejection: an owner/participant token issued for trip A is
//     rejected when used against trip B (DR-34).
//   - `clearOwnerToken` / `clearParticipantToken` clear via
//     `jar.set(name, '', { path, maxAge: 0 })` and NOT `jar.delete(name)`
//     (DR-40 — path-scoped cookies need set-empty to be cleared cross-path).
//   - A follow-up `assertOwner` after `clearOwnerToken` throws.
//   - `cookies()` is async in Next 16 (DR-42).

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---- In-memory cookie jar mock for next/headers#cookies (async). --------
// Mirrors the WS-0 identity.stub mock but records every set() / delete()
// call so we can assert clear semantics.

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
        jarStore.set(nameOrObj, { name: nameOrObj, value: value ?? '', options })
      } else {
        // Object form: cookieStore.set({ name, value, ...options })
        const { name, value: v, ...opts } = nameOrObj
        setCalls.push({ name, value: v, options: opts })
        jarStore.set(name, { name, value: v, options: opts })
      }
    },
    delete: (name: string) => {
      deleteCalls.push({ name })
      jarStore.delete(name)
    },
    has: (name: string) => jarStore.has(name),
  }),
}))

// Imports AFTER vi.mock so the mock is in place.
import { _resetMemoryStorage, memoryStorage } from '../../db/storage.memory'
import { token } from '../../ids'
import type { Amenities } from '../../db/types'

// Real identity module — does NOT exist yet. This import is what makes
// the suite red until WS-7 ships `lib/trips/identity.ts`.
import {
  OWNER_COOKIE,
  PARTICIPANT_COOKIE,
  setOwnerToken,
  setParticipantToken,
  clearOwnerToken,
  clearParticipantToken,
  assertOwner,
  assertParticipant,
  currentParticipant,
} from '../identity'

function basicAmenities(): Amenities {
  return {
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
}

async function makeTrip(opts: { ownerName?: string } = {}) {
  const ownerTok = token()
  const ownerPTok = token()
  const out = await memoryStorage.trips.create({
    name: 'Test Trip',
    campsiteId: 'fixture:test',
    campsite: { name: 'Test CG', amenities: basicAmenities() },
    style: 'car',
    ownerName: opts.ownerName ?? 'Owner',
    ownerToken: ownerTok,
    ownerParticipantToken: ownerPTok,
    items: [],
  })
  return { trip: out.trip, owner: out.owner, ownerTok, ownerPTok }
}

beforeEach(() => {
  jarStore.clear()
  setCalls.length = 0
  deleteCalls.length = 0
  _resetMemoryStorage()
})

describe('T7.1 identity helpers — cookie names and coexistence', () => {
  it('exports OWNER_COOKIE = "bc_owner" and PARTICIPANT_COOKIE = "bc_participant" (DR-3)', () => {
    expect(OWNER_COOKIE).toBe('bc_owner')
    expect(PARTICIPANT_COOKIE).toBe('bc_participant')
  })

  it('bc_owner and bc_participant are distinct and coexist on the jar (B6/DR-3)', async () => {
    const { trip, ownerTok, ownerPTok } = await makeTrip()
    await setOwnerToken(trip.id, ownerTok)
    await setParticipantToken(trip.id, ownerPTok)
    expect(jarStore.has(OWNER_COOKIE)).toBe(true)
    expect(jarStore.has(PARTICIPANT_COOKIE)).toBe(true)
    expect(jarStore.get(OWNER_COOKIE)!.value).toBe(ownerTok)
    expect(jarStore.get(PARTICIPANT_COOKIE)!.value).toBe(ownerPTok)
    expect(OWNER_COOKIE).not.toBe(PARTICIPANT_COOKIE)
  })
})

describe('T7.1 identity helpers — cookie options (httpOnly + path)', () => {
  it('setOwnerToken sets httpOnly + path=/trips/<id> (DR-42)', async () => {
    const { trip, ownerTok } = await makeTrip()
    await setOwnerToken(trip.id, ownerTok)
    const call = setCalls.find((c) => c.name === OWNER_COOKIE)
    expect(call).toBeDefined()
    expect(call!.options).toBeDefined()
    expect(call!.options!.httpOnly).toBe(true)
    expect(call!.options!.path).toBe(`/trips/${trip.id}`)
    // sameSite='lax' per spec.
    expect(call!.options!.sameSite).toBe('lax')
  })

  it('setParticipantToken sets httpOnly + path=/trips/<id>', async () => {
    const { trip, ownerPTok } = await makeTrip()
    await setParticipantToken(trip.id, ownerPTok)
    const call = setCalls.find((c) => c.name === PARTICIPANT_COOKIE)
    expect(call).toBeDefined()
    expect(call!.options!.httpOnly).toBe(true)
    expect(call!.options!.path).toBe(`/trips/${trip.id}`)
    expect(call!.options!.sameSite).toBe('lax')
  })
})

describe('T7.1 identity helpers — assertOwner', () => {
  it('passes when bc_owner cookie matches the trip owner token', async () => {
    const { trip, ownerTok } = await makeTrip()
    jarStore.set(OWNER_COOKIE, { name: OWNER_COOKIE, value: ownerTok })
    await expect(assertOwner(trip.id)).resolves.not.toThrow()
  })

  it('throws unauthorized when bc_owner cookie is missing', async () => {
    const { trip } = await makeTrip()
    await expect(assertOwner(trip.id)).rejects.toThrow(/unauthorized/i)
  })

  it('throws unauthorized when bc_owner value does not match any trip', async () => {
    const { trip } = await makeTrip()
    jarStore.set(OWNER_COOKIE, { name: OWNER_COOKIE, value: 'bogus-token' })
    await expect(assertOwner(trip.id)).rejects.toThrow(/unauthorized/i)
  })

  it('cross-trip rejection: a bc_owner token issued for trip A is rejected on trip B (DR-34)', async () => {
    const { trip: a, ownerTok: aTok } = await makeTrip({ ownerName: 'A' })
    const { trip: b } = await makeTrip({ ownerName: 'B' })
    // Cookie carries trip A's owner token but we invoke against trip B.
    jarStore.set(OWNER_COOKIE, { name: OWNER_COOKIE, value: aTok })
    await expect(assertOwner(b.id)).rejects.toThrow(/unauthorized/i)
    // Sanity: the same cookie does work for trip A.
    await expect(assertOwner(a.id)).resolves.not.toThrow()
  })
})

describe('T7.1 identity helpers — assertParticipant / currentParticipant', () => {
  it('currentParticipant resolves a participant from bc_participant', async () => {
    const { trip, ownerPTok } = await makeTrip({ ownerName: 'Owner1' })
    jarStore.set(PARTICIPANT_COOKIE, { name: PARTICIPANT_COOKIE, value: ownerPTok })
    const p = await currentParticipant(trip.id)
    expect(p.tripId).toBe(trip.id)
    expect(p.isOwner).toBe(true)
    expect(p.name).toBe('Owner1')
  })

  it('assertParticipant throws unauthorized when bc_participant cookie is missing', async () => {
    const { trip } = await makeTrip()
    await expect(assertParticipant(trip.id)).rejects.toThrow(/unauthorized/i)
  })

  it('assertParticipant throws unauthorized when bc_participant value is unknown', async () => {
    const { trip } = await makeTrip()
    jarStore.set(PARTICIPANT_COOKIE, { name: PARTICIPANT_COOKIE, value: 'bogus' })
    await expect(assertParticipant(trip.id)).rejects.toThrow(/unauthorized/i)
  })

  it('cross-trip rejection: a bc_participant token issued for trip A is rejected on trip B (DR-34)', async () => {
    const { trip: a, ownerPTok: aPTok } = await makeTrip({ ownerName: 'A-owner' })
    const { trip: b } = await makeTrip({ ownerName: 'B-owner' })
    jarStore.set(PARTICIPANT_COOKIE, { name: PARTICIPANT_COOKIE, value: aPTok })
    await expect(assertParticipant(b.id)).rejects.toThrow(/unauthorized/i)
    // Same cookie still works for trip A.
    await expect(assertParticipant(a.id)).resolves.toBeTruthy()
  })
})

describe('T7.1 identity helpers — clearOwnerToken / clearParticipantToken (DR-40)', () => {
  it('clearOwnerToken sets bc_owner with maxAge:0 (NOT jar.delete) and path=/trips/<id>', async () => {
    const { trip, ownerTok } = await makeTrip()
    await setOwnerToken(trip.id, ownerTok)
    setCalls.length = 0 // only care about the clear call below
    deleteCalls.length = 0

    await clearOwnerToken(trip.id)

    // DR-40: never use jar.delete.
    expect(deleteCalls).toHaveLength(0)
    // Last set call clears the cookie with maxAge:0 + path=/trips/<id>.
    const clearCall = setCalls.find((c) => c.name === OWNER_COOKIE)
    expect(clearCall).toBeDefined()
    expect(clearCall!.value).toBe('')
    expect(clearCall!.options).toBeDefined()
    expect(clearCall!.options!.maxAge).toBe(0)
    expect(clearCall!.options!.path).toBe(`/trips/${trip.id}`)
  })

  it('clearParticipantToken sets bc_participant with maxAge:0 (NOT jar.delete) and path=/trips/<id>', async () => {
    const { trip, ownerPTok } = await makeTrip()
    await setParticipantToken(trip.id, ownerPTok)
    setCalls.length = 0
    deleteCalls.length = 0

    await clearParticipantToken(trip.id)

    expect(deleteCalls).toHaveLength(0)
    const clearCall = setCalls.find((c) => c.name === PARTICIPANT_COOKIE)
    expect(clearCall).toBeDefined()
    expect(clearCall!.value).toBe('')
    expect(clearCall!.options!.maxAge).toBe(0)
    expect(clearCall!.options!.path).toBe(`/trips/${trip.id}`)
  })

  it('a follow-up assertOwner after clearOwnerToken throws unauthorized', async () => {
    const { trip, ownerTok } = await makeTrip()
    jarStore.set(OWNER_COOKIE, { name: OWNER_COOKIE, value: ownerTok })
    await expect(assertOwner(trip.id)).resolves.not.toThrow()
    await clearOwnerToken(trip.id)
    // The mock simulates the browser's view: a maxAge:0 set call removes
    // the cookie from the jar so subsequent reads return undefined.
    jarStore.delete(OWNER_COOKIE)
    await expect(assertOwner(trip.id)).rejects.toThrow(/unauthorized/i)
  })
})

describe('T7.1 identity helpers — cookies() is async (DR-42)', () => {
  it('each helper awaits cookies() — returns a Promise from the helper', async () => {
    const { trip, ownerTok } = await makeTrip()
    // Each helper returns a Promise — verify shape.
    expect(setOwnerToken(trip.id, ownerTok)).toBeInstanceOf(Promise)
    expect(clearOwnerToken(trip.id)).toBeInstanceOf(Promise)
    expect(setParticipantToken(trip.id, ownerTok)).toBeInstanceOf(Promise)
    expect(clearParticipantToken(trip.id)).toBeInstanceOf(Promise)
    expect(assertOwner(trip.id)).toBeInstanceOf(Promise)
    expect(assertParticipant(trip.id)).toBeInstanceOf(Promise)
    expect(currentParticipant(trip.id)).toBeInstanceOf(Promise)
  })
})
