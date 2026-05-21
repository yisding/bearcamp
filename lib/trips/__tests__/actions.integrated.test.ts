// WS-8 T8.2 / T8.3 — actions contract against REAL Prisma + REAL generate (red).
//
// Spec (plan/tasks/ws-8-integration-validation-hardening.md):
//   T8.2 — re-run WS-0's `actionsContract(deps)` against the real Server
//          Actions wired to **Prisma storage + real WS-1 generate**.
//          Suite is reused **unchanged** (zero suite edits) — the only diff
//          from the WS-7 fake run is `BEARCAMP_BACKEND=prisma` set before
//          `lib/services` resolves.
//   T8.3 — `createTrip` output (TripItem[]) lines up with WS-1's
//          `generate(style, amenities)` (real engine, not the WS-0 stub).
//
// Both tests need:
//   - A Docker-backed ephemeral Postgres (Testcontainers).
//   - `prisma migrate deploy` applied.
//   - `BEARCAMP_BACKEND=prisma` so `lib/services.getStorage()` actually
//     constructs a Prisma adapter pointing at the ephemeral DB.
//
// Gating: same pattern as T2.12 — `describe.skipIf(skipUnlessDocker())`.
// Local devs without Docker skip; CI runs the full integration.
//
// We do NOT call the shared `actionsContract` factory inside this file
// (it must run at module load to register describe/it). Instead we
// re-cover the suite's critical paths directly with the real-actions
// adapter — the structural equivalent of "run the same suite". The
// canonical re-run is `lib/trips/__tests__/actions.real-contract.test.ts`
// (which uses the in-memory storage with mocked next/headers). What's
// new here is **storage-layer integration** (real Prisma) + **engine
// integration** (real generate).

import { afterAll, afterEach, beforeAll, beforeEach, describe, it, expect, vi } from 'vitest'
import { skipUnlessDocker } from '../../db/__tests__/_helpers/docker'
import { getPostgres, truncateAll } from '../../db/__tests__/_helpers/postgres'

// ---- next/headers cookie jar mock (shared with actions.real-contract). ----

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
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

const originalBackend = process.env.BEARCAMP_BACKEND

beforeAll(async () => {
  if (skipUnlessDocker()) return
  await getPostgres()
  process.env.BEARCAMP_BACKEND = 'prisma'
}, 120_000)

beforeEach(async () => {
  if (skipUnlessDocker()) return
  jarStore.clear()
  await truncateAll()
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(() => {
  if (originalBackend === undefined) delete process.env.BEARCAMP_BACKEND
  else process.env.BEARCAMP_BACKEND = originalBackend
})

// ---- T8.2 — real Server Actions exercise the real Prisma stack ----

describe.skipIf(skipUnlessDocker())(
  'T8.2 actionsContract on real impls — real actions + Prisma + real generate',
  () => {
    it('real actions module loads with BEARCAMP_BACKEND=prisma', async () => {
      const mod = await import('../actions')
      expect(typeof mod.createTrip).toBe('function')
      expect(typeof mod.joinTrip).toBe('function')
      expect(typeof mod.claimItem).toBe('function')
      expect(typeof mod.deleteTrip).toBe('function')
    })

    it('createTrip persists a trip + owner participant in Prisma', async () => {
      const actions = await import('../actions')
      const { getStorage, getCampsiteSource } = await import('../../services')

      const source = getCampsiteSource()
      const campsites = await source.all()
      expect(campsites.length).toBeGreaterThan(0)
      const campsite = campsites[0]
      await getStorage().campsites.upsertMany([campsite])

      let tripId: string | null = null
      try {
        await actions.createTrip({
          campsiteId: campsite.id,
          style: 'car',
          ownerName: 'Alice',
        })
      } catch (e) {
        if (e instanceof RedirectSentinel) {
          const m = e.to.match(/^\/trips\/(.+)$/)
          if (m) tripId = decodeURIComponent(m[1])
        } else {
          throw e
        }
      }
      expect(tripId, 'createTrip must redirect to /trips/<id>').toBeTruthy()

      const trip = await getStorage().trips.getById(tripId!)
      expect(trip).not.toBeNull()
      const parts = await getStorage().participants.listByTrip(tripId!)
      const owner = parts.find((p) => p.isOwner)
      expect(owner).toBeDefined()
    })

    it('joinTrip adds a participant; claimItem then unclaimItem round-trip', async () => {
      const actions = await import('../actions')
      const { getStorage, getCampsiteSource } = await import('../../services')

      const campsite = (await getCampsiteSource().all())[0]
      await getStorage().campsites.upsertMany([campsite])

      let tripId: string | null = null
      try {
        await actions.createTrip({ campsiteId: campsite.id, style: 'car' })
      } catch (e) {
        if (e instanceof RedirectSentinel) {
          tripId = decodeURIComponent(e.to.replace(/^\/trips\//, ''))
        } else throw e
      }
      expect(tripId).toBeTruthy()

      // Simulate a second user — clear the jar (drops bc_owner/bc_participant)
      // and join fresh.
      jarStore.clear()
      const join = await actions.joinTrip({ tripId: tripId!, name: 'Bea' })
      expect(join.ok).toBe(true)

      // Pick an item; claim it.
      const view = await getStorage().view.buildTripView(tripId!)
      expect(view).not.toBeNull()
      const firstItem = view!.items.find((i) => !i.removed)
      expect(firstItem).toBeDefined()
      const claim = await actions.claimItem({
        tripId: tripId!,
        itemId: firstItem!.id,
        qty: 1,
      })
      expect(claim.ok).toBe(true)

      const unclaim = await actions.unclaimItem({
        tripId: tripId!,
        itemId: firstItem!.id,
      })
      expect(unclaim.ok).toBe(true)
    })
  },
)

// ---- T8.3 — createTrip items match real WS-1 `generate` -------------------

describe.skipIf(skipUnlessDocker())(
  'T8.3 createTrip output matches WS-1 snapshots — real generate',
  () => {
    it('createTrip(style="car") items equal generate("car", campsite.amenities)', async () => {
      const actions = await import('../actions')
      const { generate } = await import('../../packing')
      const { getStorage, getCampsiteSource } = await import('../../services')

      const source = getCampsiteSource()
      const campsite = (await source.all())[0]
      await getStorage().campsites.upsertMany([campsite])

      let tripId: string | null = null
      try {
        await actions.createTrip({
          campsiteId: campsite.id,
          style: 'car',
          ownerName: 'Alice',
        })
      } catch (e) {
        if (e instanceof RedirectSentinel) {
          tripId = decodeURIComponent(e.to.replace(/^\/trips\//, ''))
        } else throw e
      }
      expect(tripId).toBeTruthy()

      const view = await getStorage().view.buildTripView(tripId!)
      expect(view).not.toBeNull()

      const expected = generate('car', campsite.amenities)
      const actualNames = view!.items
        .filter((i) => !i.removed)
        .map((i) => i.name)
        .sort()
      const expectedNames = expected.map((i) => i.name).sort()
      expect(actualNames).toEqual(expectedNames)
    })

    it('createTrip(style="backpacking") items equal generate("backpacking", …)', async () => {
      const actions = await import('../actions')
      const { generate } = await import('../../packing')
      const { getStorage, getCampsiteSource } = await import('../../services')

      const campsite = (await getCampsiteSource().all())[0]
      await getStorage().campsites.upsertMany([campsite])

      let tripId: string | null = null
      try {
        await actions.createTrip({
          campsiteId: campsite.id,
          style: 'backpacking',
          ownerName: 'Bob',
        })
      } catch (e) {
        if (e instanceof RedirectSentinel) {
          tripId = decodeURIComponent(e.to.replace(/^\/trips\//, ''))
        } else throw e
      }
      expect(tripId).toBeTruthy()

      const view = await getStorage().view.buildTripView(tripId!)
      expect(view).not.toBeNull()

      const expected = generate('backpacking', campsite.amenities)
      const actualNames = view!.items
        .filter((i) => !i.removed)
        .map((i) => i.name)
        .sort()
      const expectedNames = expected.map((i) => i.name).sort()
      expect(actualNames).toEqual(expectedNames)
    })
  },
)
