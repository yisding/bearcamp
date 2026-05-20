// T0.3 — buildTripView math.
// Solo owner n=1 → per_person needed=1 (review B6).
// tentCapacity=6, n=6 → per_tent needed=1 (DR-21).
// Removed items excluded from main list; claims on removed items surface in
// `removedItemsWithClaims` (G-soft / DR-19).
// Claims grouped by participant.
// Unknown tripId → null (G8).

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

const seedTok = (p: string) => p + 'x'.repeat(28)

describe('T0.3 buildTripView math', () => {
  let s: StorageAdapter
  beforeEach(() => {
    s = createMemoryStorage()
  })

  it('solo owner (n=1) → per_person needed = 1, not 0', async () => {
    const { trip } = await s.trips.create({
      name: 'Solo',
      campsiteId: 'fixture:solo',
      campsite: { name: 'Solo', amenities: basicAmenities() },
      style: 'car',
      ownerName: 'Solo',
      ownerToken: seedTok('o'),
      ownerParticipantToken: seedTok('p'),
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
    const view = await s.view.buildTripView(trip.id)
    expect(view).not.toBeNull()
    const bag = view!.items.find((i) => i.name === 'Sleeping bag')!
    expect(bag.needed).toBe(1)
  })

  it('tentCapacity=6, n=6 → per_tent needed = 1, shortfall = 1', async () => {
    const { trip, owner } = await s.trips.create({
      name: 'Six',
      campsiteId: 'fixture:six',
      campsite: { name: 'Six', amenities: basicAmenities() },
      style: 'car',
      tentCapacity: 6,
      ownerName: 'O',
      ownerToken: seedTok('o'),
      ownerParticipantToken: seedTok('p'),
      items: [
        {
          category: 'Shelter',
          name: 'Tent',
          scope: 'per_tent',
          baseQty: 1,
          source: 'template',
        },
      ],
    })
    // Add 5 more participants → 6 total
    for (let i = 0; i < 5; i++) {
      await s.participants.add(trip.id, `J${i}`, false, seedTok(`j${i}`))
    }
    const view = await s.view.buildTripView(trip.id)
    const tent = view!.items.find((i) => i.name === 'Tent')!
    expect(tent.needed).toBe(1)
    expect(tent.shortfall).toBe(1)
    expect(view!.participants).toHaveLength(6)
    // Cover the owner reference so it's not unused
    expect(owner.isOwner).toBe(true)
  })

  it('removed items excluded from main list; claims surface under removedItemsWithClaims', async () => {
    const { trip, owner } = await s.trips.create({
      name: 'T',
      campsiteId: 'fixture:t',
      campsite: { name: 'T', amenities: basicAmenities() },
      style: 'car',
      ownerName: 'O',
      ownerToken: seedTok('o'),
      ownerParticipantToken: seedTok('p'),
      items: [
        {
          category: 'Sleep',
          name: 'Pillow',
          scope: 'per_person',
          baseQty: 1,
          source: 'template',
        },
      ],
    })
    const [item] = await s.items.listByTrip(trip.id)
    await s.claims.upsert(item.id, owner.id, 1)
    await s.items.softRemove(item.id)
    const view = await s.view.buildTripView(trip.id)
    expect(view!.items.find((i) => i.name === 'Pillow')).toBeUndefined()
    expect(view!.removedItemsWithClaims).toHaveLength(1)
    expect(view!.removedItemsWithClaims[0].name).toBe('Pillow')
    expect(view!.removedItemsWithClaims[0].claims[0].qty).toBe(1)
  })

  it('claims grouped by participant on each visible item', async () => {
    const { trip, owner } = await s.trips.create({
      name: 'T',
      campsiteId: 'fixture:t',
      campsite: { name: 'T', amenities: basicAmenities() },
      style: 'car',
      ownerName: 'O',
      ownerToken: seedTok('o'),
      ownerParticipantToken: seedTok('p'),
      items: [
        {
          category: 'Kitchen',
          name: 'Stove',
          scope: 'shared',
          baseQty: 1,
          source: 'template',
        },
      ],
    })
    const j = await s.participants.add(trip.id, 'Joiner', false, seedTok('j'))
    const [item] = await s.items.listByTrip(trip.id)
    await s.claims.upsert(item.id, owner.id, 1)
    await s.claims.upsert(item.id, j.id, 1)
    const view = await s.view.buildTripView(trip.id)
    const stove = view!.items.find((i) => i.name === 'Stove')!
    expect(stove.claims.map((c) => c.participant.name).sort()).toEqual([
      'Joiner',
      'O',
    ])
  })

  it('unknown tripId → null (G8)', async () => {
    const view = await s.view.buildTripView('does-not-exist')
    expect(view).toBeNull()
  })
})
