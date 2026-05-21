// @vitest-environment jsdom
// T6.14 — restore recomputes (DR-49).
//
// Acceptance:
//   - Owner removes a `per_person` item with one claim.
//   - Two more participants join (so `needed` would grow from 1 to 3 if the
//     item were live).
//   - Owner calls `restoreItem` on the item.
//   - StillNeeded then shows the restored item with claimed=1, needed=3,
//     shortfall=2.
//
// This is a contract-level test against the in-memory storage + the
// StillNeeded component. We bypass Server Actions and exercise the
// storage adapter directly, then render the resulting TripView through
// StillNeeded.

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

import {
  createMemoryStorage,
  _resetMemoryStorage,
} from '@/lib/db/storage.memory'
import { TENT_CAPACITY } from '@/lib/packing/quantities'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/trips/trip_x',
}))

async function loadStillNeeded() {
  const mod = await import('@/components/trips/StillNeeded')
  return mod.StillNeeded ?? mod.default
}

beforeEach(() => {
  _resetMemoryStorage()
})

describe('T6.14 restore recomputes', () => {
  it('restored per_person item shows claimed=1 needed=3 shortfall=2 after 2 more join (DR-49)', async () => {
    const store = createMemoryStorage()

    // Owner creates the trip with a single per_person item, then claims it.
    const { trip, owner } = await store.trips.create({
      name: 'Sierra',
      campsiteId: 'fixture:sierra-backcountry',
      campsite: {
        name: 'Sierra',
        amenities: {
          potableWater: false,
          toilets: 'none',
          showers: false,
          electricity: false,
          fireRings: false,
          firewoodAvailable: false,
          picnicTables: false,
          bearLockers: false,
          bearCountry: true,
          trashService: false,
          dumpStation: false,
          cellService: 'none',
          accessLevel: 'backcountry',
        },
      },
      style: 'backpacking',
      tentCapacity: TENT_CAPACITY,
      ownerName: 'Alice',
      ownerToken: 'owner_t',
      ownerParticipantToken: 'alice_pt',
      items: [
        {
          category: 'Sleep',
          name: 'Sleeping bag',
          scope: 'per_person',
          baseQty: 1,
          source: 'template',
        },
      ],
    })

    const items = await store.items.listByTrip(trip.id)
    const bag = items.find((i) => i.name === 'Sleeping bag')!
    // Owner claims it for themselves.
    await store.claims.upsert(bag.id, owner.id, 1)

    // Owner removes the item.
    await store.items.softRemove(bag.id)

    // Two more join (so participantCount = 3).
    await store.participants.add(trip.id, 'Bob', false, 'bob_pt')
    await store.participants.add(trip.id, 'Carol', false, 'carol_pt')

    // Owner restores the item.
    await store.items.restore(bag.id)

    const view = await store.view.buildTripView(trip.id)
    expect(view).not.toBeNull()
    const restored = view!.items.find((i) => i.id === bag.id)
    expect(restored).toBeDefined()
    expect(restored!.claimed).toBe(1)
    expect(restored!.needed).toBe(3)
    expect(restored!.shortfall).toBe(2)

    // And it shows up in StillNeeded (shortfall > 0).
    const StillNeeded = await loadStillNeeded()
    render(<StillNeeded view={view!} />)
    expect(screen.getByText(/sleeping bag/i)).toBeInTheDocument()
    expect(screen.getByText(/\b1\s*(of|\/)\s*3\b/i)).toBeInTheDocument()
  })
})
