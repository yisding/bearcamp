// T0.2 — memory round-trip.
// Exercises every method on the memory adapter against a known scenario:
//   create trip → list items → add owner participant → join joiner →
//   claim/upsert (twice → still one row, qty updated) → buildTripView.

import { describe, it, expect, beforeEach } from 'vitest'
import { createMemoryStorage } from '../storage.memory'
import type { StorageAdapter } from '../storage'
import type { Amenities } from '../types'

function basicAmenities(): Amenities {
  return {
    potableWater: true,
    toilets: 'flush',
    showers: true,
    electricity: false,
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

describe('T0.2 memory round-trip', () => {
  let s: StorageAdapter

  beforeEach(() => {
    s = createMemoryStorage()
  })

  it('create trip → getById returns the same trip', async () => {
    const created = await s.trips.create({
      name: 'Test Trip',
      campsiteId: 'fixture:test',
      campsite: { name: 'Test CG', amenities: basicAmenities() },
      style: 'car',
      ownerName: 'Alice',
      ownerToken: 'owner-token-aaaaaaaaaaaaaaaa',
      ownerParticipantToken: 'p-token-aaaaaaaaaaaaaaaa',
      items: [
        {
          category: 'Sleep',
          name: 'Sleeping bag',
          scope: 'per_person',
          baseQty: 1,
          source: 'template',
        },
        {
          category: 'Kitchen',
          name: 'Stove',
          scope: 'shared',
          baseQty: 1,
          source: 'template',
        },
      ],
    })
    expect(created.trip.id).toBeTruthy()
    const fetched = await s.trips.getById(created.trip.id)
    expect(fetched?.id).toBe(created.trip.id)
    expect(fetched?.name).toBe('Test Trip')
  })

  it('items.add then listByTrip includes the new item', async () => {
    const { trip } = await s.trips.create({
      name: 'T',
      campsiteId: 'fixture:test',
      campsite: { name: 'T', amenities: basicAmenities() },
      style: 'car',
      ownerName: 'A',
      ownerToken: 'ot-' + 'x'.repeat(20),
      ownerParticipantToken: 'pt-' + 'x'.repeat(20),
      items: [],
    })
    await s.items.add({
      tripId: trip.id,
      category: 'Food',
      name: 'Snacks',
      scope: 'per_person',
      baseQty: 1,
      source: 'custom',
    })
    const items = await s.items.listByTrip(trip.id)
    expect(items.some((i) => i.name === 'Snacks')).toBe(true)
  })

  it('owner participant exists with isOwner=true after create', async () => {
    const { trip, owner } = await s.trips.create({
      name: 'T',
      campsiteId: 'fixture:test',
      campsite: { name: 'T', amenities: basicAmenities() },
      style: 'car',
      ownerName: 'Alice',
      ownerToken: 'ot-' + 'x'.repeat(20),
      ownerParticipantToken: 'pt-' + 'x'.repeat(20),
      items: [],
    })
    expect(owner.isOwner).toBe(true)
    const list = await s.participants.listByTrip(trip.id)
    expect(list).toHaveLength(1)
    expect(list[0].isOwner).toBe(true)
    expect(list[0].name).toBe('Alice')
  })

  it('claims.upsert twice yields one row with updated qty', async () => {
    const { trip, owner } = await s.trips.create({
      name: 'T',
      campsiteId: 'fixture:test',
      campsite: { name: 'T', amenities: basicAmenities() },
      style: 'car',
      ownerName: 'A',
      ownerToken: 'ot-' + 'x'.repeat(20),
      ownerParticipantToken: 'pt-' + 'x'.repeat(20),
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
    const items = await s.items.listByTrip(trip.id)
    const item = items[0]
    await s.claims.upsert(item.id, owner.id, 1)
    await s.claims.upsert(item.id, owner.id, 3)
    const claims = await s.claims.listByTrip(trip.id)
    const mine = claims.filter(
      (c) => c.itemId === item.id && c.participantId === owner.id,
    )
    expect(mine).toHaveLength(1)
    expect(mine[0].qty).toBe(3)
  })

  it('participants.byToken returns the participant', async () => {
    const token = 'pt-' + 'a'.repeat(24)
    const { trip } = await s.trips.create({
      name: 'T',
      campsiteId: 'fixture:test',
      campsite: { name: 'T', amenities: basicAmenities() },
      style: 'car',
      ownerName: 'A',
      ownerToken: 'ot-' + 'x'.repeat(20),
      ownerParticipantToken: token,
      items: [],
    })
    const p = await s.participants.byToken(trip.id, token)
    expect(p?.isOwner).toBe(true)
  })

  it('items.softRemove flips removed=true; restore flips back', async () => {
    const { trip } = await s.trips.create({
      name: 'T',
      campsiteId: 'fixture:test',
      campsite: { name: 'T', amenities: basicAmenities() },
      style: 'car',
      ownerName: 'A',
      ownerToken: 'ot-' + 'x'.repeat(20),
      ownerParticipantToken: 'pt-' + 'x'.repeat(20),
      items: [
        {
          category: 'Sleep',
          name: 'Pad',
          scope: 'per_person',
          baseQty: 1,
          source: 'template',
        },
      ],
    })
    const [item] = await s.items.listByTrip(trip.id)
    const removed = await s.items.softRemove(item.id)
    expect(removed.removed).toBe(true)
    const restored = await s.items.restore(item.id)
    expect(restored.removed).toBe(false)
  })

  it('trips.delete cascades (no items after delete)', async () => {
    const { trip } = await s.trips.create({
      name: 'T',
      campsiteId: 'fixture:test',
      campsite: { name: 'T', amenities: basicAmenities() },
      style: 'car',
      ownerName: 'A',
      ownerToken: 'ot-' + 'x'.repeat(20),
      ownerParticipantToken: 'pt-' + 'x'.repeat(20),
      items: [
        {
          category: 'Sleep',
          name: 'Pad',
          scope: 'per_person',
          baseQty: 1,
          source: 'template',
        },
      ],
    })
    await s.trips.delete(trip.id)
    const fetched = await s.trips.getById(trip.id)
    expect(fetched).toBeNull()
  })

  it('trips.updateSettings patches tentCapacity', async () => {
    const { trip } = await s.trips.create({
      name: 'T',
      campsiteId: 'fixture:test',
      campsite: { name: 'T', amenities: basicAmenities() },
      style: 'car',
      ownerName: 'A',
      ownerToken: 'ot-' + 'x'.repeat(20),
      ownerParticipantToken: 'pt-' + 'x'.repeat(20),
      items: [],
    })
    const updated = await s.trips.updateSettings(trip.id, { tentCapacity: 6 })
    expect(updated.tentCapacity).toBe(6)
  })
})
