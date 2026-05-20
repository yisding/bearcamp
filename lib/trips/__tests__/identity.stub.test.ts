// T0.13 — identity stub.
// Uses vi.mock('next/headers') to inject a fake cookie jar — vitest cannot
// call the real next/headers#cookies() because there is no Next request
// scope (DR-41). The stub resolves participants against in-memory storage.

import { describe, it, expect, beforeEach, vi } from 'vitest'

// In-memory cookie jar mock — replaces next/headers#cookies()
type CookieEntry = { name: string; value: string }
const jarStore = new Map<string, CookieEntry>()

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => jarStore.get(name),
    set: (name: string, value: string) => {
      jarStore.set(name, { name, value })
    },
    delete: (name: string) => {
      jarStore.delete(name)
    },
    has: (name: string) => jarStore.has(name),
  }),
}))

// Test imports after vi.mock so the mock is in place.
import { createMemoryStorage } from '../../db/storage.memory'
import {
  OWNER_COOKIE,
  PARTICIPANT_COOKIE,
  assertOwner,
  assertParticipant,
  currentParticipant,
} from '../identity.stub'

describe('T0.13 identity stub', () => {
  beforeEach(() => {
    jarStore.clear()
  })

  it('exports OWNER_COOKIE = "bc_owner" and PARTICIPANT_COOKIE = "bc_participant" (DR-3)', () => {
    expect(OWNER_COOKIE).toBe('bc_owner')
    expect(PARTICIPANT_COOKIE).toBe('bc_participant')
  })

  // The next two tests depend on the stub resolving against memory storage.
  // The impl agent wires `identity.stub` to read the configured storage
  // (via services.ts or a setter) — until then these are deliberately red.

  it('currentParticipant resolves a participant from memory when bc_participant cookie is set', async () => {
    const s = createMemoryStorage()
    const ownerTok = 'o-' + 'x'.repeat(28)
    const partTok = 'p-' + 'x'.repeat(28)
    const { trip } = await s.trips.create({
      name: 'T',
      campsiteId: 'fixture:t',
      campsite: {
        name: 'T',
        amenities: {
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
        },
      },
      style: 'car',
      ownerName: 'O',
      ownerToken: ownerTok,
      ownerParticipantToken: partTok,
      items: [],
    })
    // Wire the storage into the identity stub. The impl agent decides how
    // this happens — most likely a `services.ts` getStorage(). For the red
    // pass, we set both cookies and expect the resolution.
    jarStore.set(PARTICIPANT_COOKIE, {
      name: PARTICIPANT_COOKIE,
      value: partTok,
    })
    const p = await currentParticipant(trip.id)
    expect(p.isOwner).toBe(true)
    expect(p.name).toBe('O')
  })

  it('assertParticipant throws when bc_participant cookie is missing', async () => {
    await expect(assertParticipant('any-trip')).rejects.toThrow()
  })

  it('assertOwner throws when bc_owner cookie is missing', async () => {
    await expect(assertOwner('any-trip')).rejects.toThrow()
  })

  it('bc_owner and bc_participant coexist (distinct cookie names; B6/DR-3)', async () => {
    jarStore.set(OWNER_COOKIE, { name: OWNER_COOKIE, value: 'owner-val' })
    jarStore.set(PARTICIPANT_COOKIE, {
      name: PARTICIPANT_COOKIE,
      value: 'part-val',
    })
    expect(jarStore.has(OWNER_COOKIE)).toBe(true)
    expect(jarStore.has(PARTICIPANT_COOKIE)).toBe(true)
    // Different names → both present
    expect(jarStore.get(OWNER_COOKIE)?.value).toBe('owner-val')
    expect(jarStore.get(PARTICIPANT_COOKIE)?.value).toBe('part-val')
  })
})
