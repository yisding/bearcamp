// T2.7 — buildTripView: needed/claimed/shortfall per scope; removed excluded
//   from main list; `removedItemsWithClaims` only includes removed items
//   that still have claims; unknown tripId → null; solo creator
//   participantCount===1; tentCapacity=6, n=6 → per_tent needed=1; **header
//   amenities come from campsiteSnapshot, not the live Campsite row**
//   (DR-33).
// T2.8 — scaling: per_person grows, shared constant.
// T2.11 — item edit recompute: changing baseQty/scope recomputes
//   requiredQty in the next buildTripView.
// T2.14 — snapshot is render-source: mutate the live Campsite row's
//   amenities after createTrip, view header still uses the snapshot.

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { skipUnlessDocker } from './_helpers/docker'
import {
  getPostgres,
  makePrismaStorage,
  truncateAll,
} from './_helpers/postgres'
import {
  amenities,
  makeTripInput,
  sampleCampsites,
  tok,
} from './_helpers/fixtures'
import type { StorageAdapter } from '../storage'

describe.skipIf(skipUnlessDocker())(
  'T2.7 / T2.8 buildTripView (real Postgres)',
  () => {
    let s: StorageAdapter

    beforeAll(async () => {
      await getPostgres()
    }, 120_000)

    beforeEach(async () => {
      await truncateAll()
      s = await makePrismaStorage()
      await s.campsites.upsertMany(sampleCampsites)
    })

    afterEach(async () => {
      await truncateAll()
    })

    it('unknown tripId returns null', async () => {
      expect(await s.view.buildTripView('does-not-exist')).toBeNull()
    })

    it('solo creator → participantCount === 1; per_person needed = 1', async () => {
      const { trip } = await s.trips.create(
        makeTripInput({
          items: [
            {
              category: 'Sleep',
              name: 'Sleeping bag',
              scope: 'per_person',
              baseQty: 1,
              source: 'template',
            },
          ],
        }),
      )
      const view = await s.view.buildTripView(trip.id)
      expect(view).not.toBeNull()
      expect(view!.participants).toHaveLength(1)
      const bag = view!.items.find((i) => i.name === 'Sleeping bag')!
      expect(bag.needed).toBe(1)
    })

    it('needed/claimed/shortfall computed for per_person scope', async () => {
      const { trip, owner } = await s.trips.create(
        makeTripInput({
          items: [
            {
              category: 'Sleep',
              name: 'Pad',
              scope: 'per_person',
              baseQty: 1,
              source: 'template',
            },
          ],
        }),
      )
      // Add 2 more participants → 3 total. per_person needed = 3.
      await s.participants.add(trip.id, 'J1', false, tok('j1-'))
      await s.participants.add(trip.id, 'J2', false, tok('j2-'))
      const [pad] = await s.items.listByTrip(trip.id)
      await s.claims.upsert(pad.id, owner.id, 1)
      const view = await s.view.buildTripView(trip.id)
      const padV = view!.items.find((i) => i.name === 'Pad')!
      expect(padV.needed).toBe(3)
      expect(padV.claimed).toBe(1)
      expect(padV.shortfall).toBe(2)
    })

    it('shared scope: needed stays baseQty regardless of participants (T2.8)', async () => {
      const { trip } = await s.trips.create(
        makeTripInput({
          items: [
            {
              category: 'Kitchen',
              name: 'Stove',
              scope: 'shared',
              baseQty: 1,
              source: 'template',
            },
          ],
        }),
      )
      for (let i = 0; i < 4; i++) {
        await s.participants.add(trip.id, `J${i}`, false, tok(`j${i}-`))
      }
      const view = await s.view.buildTripView(trip.id)
      const stove = view!.items.find((i) => i.name === 'Stove')!
      expect(stove.needed).toBe(1)
    })

    it('tentCapacity=6 with 6 participants → per_tent needed = 1 (DR-21)', async () => {
      const { trip } = await s.trips.create(
        makeTripInput({
          tentCapacity: 6,
          items: [
            {
              category: 'Shelter',
              name: 'Tent',
              scope: 'per_tent',
              baseQty: 1,
              source: 'template',
            },
          ],
        }),
      )
      for (let i = 0; i < 5; i++) {
        await s.participants.add(trip.id, `J${i}`, false, tok(`j${i}-`))
      }
      const view = await s.view.buildTripView(trip.id)
      expect(view!.participants).toHaveLength(6)
      const tent = view!.items.find((i) => i.name === 'Tent')!
      expect(tent.needed).toBe(1)
    })

    it('removed items excluded from main list; claims surface under removedItemsWithClaims', async () => {
      const { trip, owner } = await s.trips.create(makeTripInput())
      const [first] = await s.items.listByTrip(trip.id)
      await s.claims.upsert(first.id, owner.id, 1)
      await s.items.softRemove(first.id)
      const view = await s.view.buildTripView(trip.id)
      expect(view!.items.some((i) => i.id === first.id)).toBe(false)
      expect(view!.removedItemsWithClaims.some((i) => i.id === first.id)).toBe(true)
      const removed = view!.removedItemsWithClaims.find((i) => i.id === first.id)!
      expect(removed.claims).toHaveLength(1)
      expect(removed.claims[0].qty).toBe(1)
    })

    it('removed items WITHOUT claims do not appear in removedItemsWithClaims', async () => {
      const { trip } = await s.trips.create(makeTripInput())
      const [first] = await s.items.listByTrip(trip.id)
      await s.items.softRemove(first.id)
      const view = await s.view.buildTripView(trip.id)
      expect(view!.removedItemsWithClaims.some((i) => i.id === first.id)).toBe(false)
    })

    it('claims are grouped by participant on each visible item', async () => {
      const { trip, owner } = await s.trips.create(
        makeTripInput({
          items: [
            {
              category: 'Kitchen',
              name: 'Stove',
              scope: 'shared',
              baseQty: 1,
              source: 'template',
            },
          ],
        }),
      )
      const j = await s.participants.add(trip.id, 'Joiner', false, tok('j-'))
      const [stove] = await s.items.listByTrip(trip.id)
      await s.claims.upsert(stove.id, owner.id, 1)
      await s.claims.upsert(stove.id, j.id, 1)
      const view = await s.view.buildTripView(trip.id)
      const stoveV = view!.items.find((i) => i.name === 'Stove')!
      const names = stoveV.claims.map((c) => c.participant.name).sort()
      expect(names).toEqual(['Joiner', 'Owner'])
    })
  },
)

describe.skipIf(skipUnlessDocker())(
  'T2.8 scaling (real Postgres) — per_person grows, shared constant',
  () => {
    let s: StorageAdapter

    beforeAll(async () => {
      await getPostgres()
    }, 120_000)

    beforeEach(async () => {
      await truncateAll()
      s = await makePrismaStorage()
      await s.campsites.upsertMany(sampleCampsites)
    })

    afterEach(async () => {
      await truncateAll()
    })

    it('per_person needed scales with participants; shared and per_tent obey their own rules', async () => {
      const { trip } = await s.trips.create(
        makeTripInput({
          items: [
            {
              category: 'Sleep',
              name: 'Bag',
              scope: 'per_person',
              baseQty: 1,
              source: 'template',
            },
            {
              category: 'Sleep',
              name: 'Pad',
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
            {
              category: 'Water',
              name: 'Filter',
              scope: 'shared',
              baseQty: 1,
              source: 'template',
            },
          ],
        }),
      )
      // n=1
      let view = await s.view.buildTripView(trip.id)
      expect(view!.items.find((i) => i.name === 'Bag')!.needed).toBe(1)
      expect(view!.items.find((i) => i.name === 'Pad')!.needed).toBe(1)
      expect(view!.items.find((i) => i.name === 'Stove')!.needed).toBe(1)
      expect(view!.items.find((i) => i.name === 'Filter')!.needed).toBe(1)
      // n=3
      await s.participants.add(trip.id, 'J1', false, tok('j1-'))
      await s.participants.add(trip.id, 'J2', false, tok('j2-'))
      view = await s.view.buildTripView(trip.id)
      expect(view!.items.find((i) => i.name === 'Bag')!.needed).toBe(3)
      expect(view!.items.find((i) => i.name === 'Pad')!.needed).toBe(3)
      expect(view!.items.find((i) => i.name === 'Stove')!.needed).toBe(1)
      expect(view!.items.find((i) => i.name === 'Filter')!.needed).toBe(1)
    })
  },
)

describe.skipIf(skipUnlessDocker())(
  'T2.11 item edit recompute (real Postgres)',
  () => {
    let s: StorageAdapter

    beforeAll(async () => {
      await getPostgres()
    }, 120_000)

    beforeEach(async () => {
      await truncateAll()
      s = await makePrismaStorage()
      await s.campsites.upsertMany(sampleCampsites)
    })

    afterEach(async () => {
      await truncateAll()
    })

    it('changing baseQty recomputes needed in the next buildTripView', async () => {
      const { trip } = await s.trips.create(
        makeTripInput({
          items: [
            {
              category: 'Sleep',
              name: 'Bag',
              scope: 'per_person',
              baseQty: 1,
              source: 'template',
            },
          ],
        }),
      )
      await s.participants.add(trip.id, 'J1', false, tok('j1-'))
      await s.participants.add(trip.id, 'J2', false, tok('j2-'))
      let view = await s.view.buildTripView(trip.id)
      let bag = view!.items.find((i) => i.name === 'Bag')!
      expect(bag.needed).toBe(3)
      // baseQty: 1 → 2, n=3 → needed=6
      const [item] = await s.items.listByTrip(trip.id)
      await s.items.update(item.id, { baseQty: 2 })
      view = await s.view.buildTripView(trip.id)
      bag = view!.items.find((i) => i.name === 'Bag')!
      expect(bag.needed).toBe(6)
    })

    it('changing scope recomputes needed in the next buildTripView', async () => {
      const { trip } = await s.trips.create(
        makeTripInput({
          items: [
            {
              category: 'Kitchen',
              name: 'Pot',
              scope: 'shared',
              baseQty: 1,
              source: 'template',
            },
          ],
        }),
      )
      await s.participants.add(trip.id, 'J1', false, tok('j1-'))
      await s.participants.add(trip.id, 'J2', false, tok('j2-'))
      let view = await s.view.buildTripView(trip.id)
      expect(view!.items.find((i) => i.name === 'Pot')!.needed).toBe(1)
      const [pot] = await s.items.listByTrip(trip.id)
      await s.items.update(pot.id, { scope: 'per_person' })
      view = await s.view.buildTripView(trip.id)
      expect(view!.items.find((i) => i.name === 'Pot')!.needed).toBe(3)
    })

    it('rename persists across a buildTripView read (review G1)', async () => {
      const { trip } = await s.trips.create(makeTripInput())
      const [first] = await s.items.listByTrip(trip.id)
      await s.items.update(first.id, { name: 'Renamed Item' })
      const view = await s.view.buildTripView(trip.id)
      expect(view!.items.some((i) => i.name === 'Renamed Item')).toBe(true)
    })
  },
)

describe.skipIf(skipUnlessDocker())(
  'T2.14 campsiteSnapshot is render-source (real Postgres)',
  () => {
    let s: StorageAdapter

    beforeAll(async () => {
      await getPostgres()
    }, 120_000)

    beforeEach(async () => {
      await truncateAll()
      s = await makePrismaStorage()
      await s.campsites.upsertMany(sampleCampsites)
    })

    afterEach(async () => {
      await truncateAll()
    })

    it('mutating the live Campsite row after createTrip does NOT change the view header', async () => {
      // Use a campsite where bearLockers=true so we can flip it later.
      const input = makeTripInput()
      const { trip } = await s.trips.create(input)
      const snapshotAmenities = { ...input.campsite.amenities }

      // Mutate the live row to a different amenity profile.
      await s.campsites.upsertMany([
        {
          ...sampleCampsites[0],
          amenities: amenities({
            bearLockers: false,
            potableWater: false,
            showers: false,
            firewoodAvailable: false,
            picnicTables: false,
          }),
        },
      ])

      const view = await s.view.buildTripView(trip.id)
      expect(view!.trip.campsite.amenities.bearLockers).toBe(
        snapshotAmenities.bearLockers,
      )
      expect(view!.trip.campsite.amenities.potableWater).toBe(
        snapshotAmenities.potableWater,
      )
      expect(view!.trip.campsite.amenities.showers).toBe(snapshotAmenities.showers)
      // The live row reflects the mutation; the snapshot does not.
      const live = await s.campsites.getById(sampleCampsites[0].id)
      expect(live!.amenities.bearLockers).toBe(false)
    })
  },
)
