// WS-7 T7.9 — actionsContract suite against the REAL Server Actions.
//
// Re-runs WS-0's shared contract suite (lib/trips/__tests__/actions.contract.ts)
// with the deps wired to the real `lib/trips/actions.ts` module. WS-0 already
// publishes the suite; this test ensures the real impls satisfy the same
// shape that the fake deps satisfy in actions.contract.test.ts.
//
// Notes on identity wiring:
//   - createTrip / joinTrip set bc_owner / bc_participant via next/headers
//     (mocked below). Subsequent actions read those cookies through the same
//     mocked jar and pass owner/participant auth automatically.
//   - The suite calls deleteTrip on a non-existent tripId — the real action
//     should return either `not_found` or `unauthorized` per the contract
//     suite's accepted set.

import { afterEach, beforeEach, vi } from 'vitest'

// ---- next/headers mock (async cookies) — shared jar across one suite run. ----

interface CookieEntry { name: string; value: string }
const jarStore = new Map<string, CookieEntry>()

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const e = jarStore.get(name)
      return e ? { name: e.name, value: e.value } : undefined
    },
    set: (
      nameOrObj: string | { name: string; value: string; [k: string]: unknown },
      value?: string,
      options?: Record<string, unknown>,
    ) => {
      if (typeof nameOrObj === 'string') {
        if (options && (options as Record<string, unknown>).maxAge === 0) {
          jarStore.delete(nameOrObj)
        } else {
          jarStore.set(nameOrObj, { name: nameOrObj, value: value ?? '' })
        }
      } else {
        const { name, value: v, ...opts } = nameOrObj
        if ((opts as Record<string, unknown>).maxAge === 0) {
          jarStore.delete(name)
        } else {
          jarStore.set(name, { name, value: v })
        }
      }
    },
    delete: (name: string) => {
      jarStore.delete(name)
    },
    has: (name: string) => jarStore.has(name),
  }),
}))

// next/navigation redirect: throw a sentinel the suite ignores (deps catch).
class RedirectSentinel extends Error {
  constructor(public to: string) {
    super(`NEXT_REDIRECT:${to}`)
  }
}

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new RedirectSentinel(to)
  },
  unstable_rethrow: (e: unknown) => {
    if (e instanceof RedirectSentinel) throw e
  },
}))

vi.mock('next/cache', () => ({
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
}))

// Imports AFTER mocks.
import { actionsContract, type ActionDeps } from './actions.contract'
import { _resetMemoryStorage } from '../../db/storage.memory'

// Real actions module — does not exist yet (red).
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

import { ok, err } from '../result'

beforeEach(() => {
  jarStore.clear()
  _resetMemoryStorage()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Adapter: wraps real Server Actions in the ActionDeps shape the contract
// suite expects. createTrip in real actions redirects on success — the
// contract suite wants a Result envelope. We catch the RedirectSentinel and
// synthesize the envelope from the most-recently-created trip.
import { memoryStorage } from '../../db/storage.memory'

function makeRealDeps(): ActionDeps {
  return {
    createTrip: async (input) => {
      try {
        const r = await createTrip({
          campsiteId: input.campsiteId,
          style: input.style,
          ownerName: input.ownerName,
        })
        // If the impl returned an envelope on success (no redirect form),
        // hand it back. Otherwise we should not get here.
        if (r && typeof (r as { ok?: boolean }).ok === 'boolean') {
          return r as Awaited<ReturnType<ActionDeps['createTrip']>>
        }
        return err('internal', 'createTrip returned no result and did not redirect')
      } catch (e) {
        if (e instanceof RedirectSentinel) {
          // Resolve the created trip from the redirect URL.
          const m = e.to.match(/^\/trips\/(.+)$/)
          if (!m) return err('internal', `unexpected redirect: ${e.to}`)
          const tripId = decodeURIComponent(m[1])
          const trip = await memoryStorage.trips.getById(tripId)
          const participants = await memoryStorage.participants.listByTrip(tripId)
          const owner = participants.find((p) => p.isOwner)
          if (!trip || !owner) return err('internal', 'createTrip wired but state missing')
          return ok({ trip, owner })
        }
        return err('internal', (e as Error).message)
      }
    },
    renameTrip: (input) => renameTrip(input),
    updateTripSettings: (input) => updateTripSettings(input),
    deleteTrip: async (input) => {
      try {
        const r = await deleteTrip(input)
        if (r && typeof (r as { ok?: boolean }).ok === 'boolean') {
          return r as Awaited<ReturnType<ActionDeps['deleteTrip']>>
        }
        // Reached this point without a Result and without a redirect — odd
        // but treat as success.
        return ok({ tripId: input.tripId })
      } catch (e) {
        if (e instanceof RedirectSentinel) {
          return ok({ tripId: input.tripId })
        }
        return err('internal', (e as Error).message)
      }
    },
    addItem: (input) => addItem(input),
    updateItem: (input) => updateItem(input),
    removeItem: (input) => removeItem(input),
    restoreItem: (input) => restoreItem(input),
    reorderItem: (input) => reorderItem(input),
    joinTrip: (input) => joinTrip(input),
    claimItem: (input) => claimItem(input),
    unclaimItem: (input) => unclaimItem(input),
  }
}

actionsContract('real-actions', () => makeRealDeps())
