// Shared storage contract suite — WS-0.15.
// Implementation-agnostic. Consumers:
//   - lib/db/__tests__/storage.contract.test.ts (this file invoked against memory)
//   - WS-2's Prisma impl test will invoke this against Prisma/Neon
//   - WS-8 will rerun both at integration
// Adding cases here must keep all callers green.

import { describe, it, expect } from 'vitest'
import type { StorageAdapter } from '../storage'
import type { Amenities } from '../types'

function ams(): Amenities {
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

const tok = (p: string) => p + 'x'.repeat(28)

export function storageContract(
  label: string,
  makeAdapter: () => StorageAdapter | Promise<StorageAdapter>,
) {
  describe(`storageContract (${label})`, () => {
    it('createTrip → trip + owner participant exist', async () => {
      const s = await makeAdapter()
      const { trip, owner } = await s.trips.create({
        name: 'C',
        campsiteId: 'fixture:c',
        campsite: { name: 'C', amenities: ams() },
        style: 'car',
        ownerName: 'O',
        ownerToken: tok('o'),
        ownerParticipantToken: tok('p'),
        items: [],
      })
      expect(trip.id).toBeTruthy()
      expect(owner.isOwner).toBe(true)
      expect(await s.participants.count(trip.id)).toBe(1)
    })

    it('items.add and items.listByTrip round-trip', async () => {
      const s = await makeAdapter()
      const { trip } = await s.trips.create({
        name: 'C',
        campsiteId: 'fixture:c',
        campsite: { name: 'C', amenities: ams() },
        style: 'car',
        ownerName: 'O',
        ownerToken: tok('o'),
        ownerParticipantToken: tok('p'),
        items: [],
      })
      await s.items.add({
        tripId: trip.id,
        category: 'Food',
        name: 'X',
        scope: 'shared',
        source: 'custom',
      })
      const items = await s.items.listByTrip(trip.id)
      expect(items.some((i) => i.name === 'X')).toBe(true)
    })

    it('claims upsert collapses concurrent rows by composite key', async () => {
      const s = await makeAdapter()
      const { trip, owner } = await s.trips.create({
        name: 'C',
        campsiteId: 'fixture:c',
        campsite: { name: 'C', amenities: ams() },
        style: 'car',
        ownerName: 'O',
        ownerToken: tok('o'),
        ownerParticipantToken: tok('p'),
        items: [
          {
            category: 'Sleep',
            name: 'Bag',
            scope: 'per_person',
            baseQty: 1,
            source: 'template',
          },
        ],
      })
      const [item] = await s.items.listByTrip(trip.id)
      await s.claims.upsert(item.id, owner.id, 1)
      await s.claims.upsert(item.id, owner.id, 4)
      const rows = (await s.claims.listByTrip(trip.id)).filter(
        (c) => c.itemId === item.id,
      )
      expect(rows).toHaveLength(1)
      expect(rows[0].qty).toBe(4)
    })

    it('buildTripView returns null for unknown id', async () => {
      const s = await makeAdapter()
      expect(await s.view.buildTripView('nope')).toBeNull()
    })

    it('buildTripView returns correct shape for known trip', async () => {
      const s = await makeAdapter()
      const { trip } = await s.trips.create({
        name: 'C',
        campsiteId: 'fixture:c',
        campsite: { name: 'C', amenities: ams() },
        style: 'car',
        ownerName: 'O',
        ownerToken: tok('o'),
        ownerParticipantToken: tok('p'),
        items: [],
      })
      const v = await s.view.buildTripView(trip.id)
      expect(v).not.toBeNull()
      expect(v!.trip.id).toBe(trip.id)
      expect(Array.isArray(v!.participants)).toBe(true)
      expect(Array.isArray(v!.items)).toBe(true)
      expect(Array.isArray(v!.removedItemsWithClaims)).toBe(true)
    })

    it('items.softRemove → restore round-trip', async () => {
      const s = await makeAdapter()
      const { trip } = await s.trips.create({
        name: 'C',
        campsiteId: 'fixture:c',
        campsite: { name: 'C', amenities: ams() },
        style: 'car',
        ownerName: 'O',
        ownerToken: tok('o'),
        ownerParticipantToken: tok('p'),
        items: [
          {
            category: 'Sleep',
            name: 'Bag',
            scope: 'per_person',
            baseQty: 1,
            source: 'template',
          },
        ],
      })
      const [it] = await s.items.listByTrip(trip.id)
      expect((await s.items.softRemove(it.id)).removed).toBe(true)
      expect((await s.items.restore(it.id)).removed).toBe(false)
    })

    it('trips.delete cascades', async () => {
      const s = await makeAdapter()
      const { trip } = await s.trips.create({
        name: 'C',
        campsiteId: 'fixture:c',
        campsite: { name: 'C', amenities: ams() },
        style: 'car',
        ownerName: 'O',
        ownerToken: tok('o'),
        ownerParticipantToken: tok('p'),
        items: [],
      })
      await s.trips.delete(trip.id)
      expect(await s.trips.getById(trip.id)).toBeNull()
    })
  })
}
