// T2.4 — items repo: add/list/update; softRemove hides but preserves row +
//   claims; restore works; reorder; non-editable fields rejected
//   (`update` patch restricted to name|category|scope|baseQty|unit|note,
//   review G1).
// T2.16 — last-write-wins on item edits, no `version` column (DR-58).

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { skipUnlessDocker } from './_helpers/docker'
import {
  getPostgres,
  makePrismaStorage,
  truncateAll,
  withPgClient,
} from './_helpers/postgres'
import { makeTripInput, sampleCampsites } from './_helpers/fixtures'
import type { StorageAdapter } from '../storage'

describe.skipIf(skipUnlessDocker())('T2.4 items repo (real Postgres)', () => {
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

  it('add → listByTrip returns the new item', async () => {
    const { trip } = await s.trips.create(makeTripInput({ items: [] }))
    await s.items.add({
      tripId: trip.id,
      category: 'Food',
      name: 'Snacks',
      scope: 'per_person',
      baseQty: 2,
      source: 'custom',
    })
    const items = await s.items.listByTrip(trip.id)
    expect(items.some((i) => i.name === 'Snacks' && i.baseQty === 2)).toBe(true)
  })

  it('update with allowed fields persists', async () => {
    const { trip } = await s.trips.create(makeTripInput())
    const [first] = await s.items.listByTrip(trip.id)
    const updated = await s.items.update(first.id, {
      name: 'Renamed',
      baseQty: 5,
      scope: 'shared',
    })
    expect(updated.name).toBe('Renamed')
    expect(updated.baseQty).toBe(5)
    expect(updated.scope).toBe('shared')
  })

  it('update rejects non-editable fields (id/tripId/source/removed/sortOrder)', async () => {
    const { trip } = await s.trips.create(makeTripInput())
    const [first] = await s.items.listByTrip(trip.id)
    // The patch is typed in lib/db/storage.ts as TripItemPatch (only
    // name|category|scope|baseQty|unit|note). At runtime, passing a
    // non-editable field MUST be a no-op or throw — the repo MUST NOT
    // forward unknown columns to the DB. (review G1 / DR-3.)
    const result = await s.items.update(first.id, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ removed: true, source: 'amenity', tripId: 'hacked' } as any),
      name: 'KeepThis',
    })
    expect(result.removed).toBe(false)
    expect(result.source).toBe(first.source)
    expect(result.tripId).toBe(trip.id)
    expect(result.name).toBe('KeepThis')
  })

  it('softRemove hides item from default list but row + claims persist', async () => {
    const { trip, owner } = await s.trips.create(makeTripInput())
    const [first] = await s.items.listByTrip(trip.id)
    await s.claims.upsert(first.id, owner.id, 1)
    await s.items.softRemove(first.id)

    // Default list excludes removed=true.
    const visible = await s.items.listByTrip(trip.id)
    expect(visible.some((i) => i.id === first.id)).toBe(false)

    // Claim row preserved at the DB level (T2.4 / DR-19).
    const claims = await s.claims.listByTrip(trip.id)
    expect(claims.some((c) => c.itemId === first.id)).toBe(true)
  })

  it('restore flips removed=false; claims still resolve', async () => {
    const { trip, owner } = await s.trips.create(makeTripInput())
    const [first] = await s.items.listByTrip(trip.id)
    await s.claims.upsert(first.id, owner.id, 2)
    await s.items.softRemove(first.id)
    const restored = await s.items.restore(first.id)
    expect(restored.removed).toBe(false)

    const visible = await s.items.listByTrip(trip.id)
    expect(visible.some((i) => i.id === first.id)).toBe(true)
    const claims = await s.claims.listByTrip(trip.id)
    const mine = claims.find((c) => c.itemId === first.id && c.participantId === owner.id)
    expect(mine?.qty).toBe(2)
  })

  it('reorder by beforeItemId places the target before the reference', async () => {
    const { trip } = await s.trips.create(makeTripInput())
    const items = await s.items.listByTrip(trip.id)
    expect(items.length).toBeGreaterThanOrEqual(3)
    const [a, b, c] = items
    // Move c before a.
    await s.items.reorder(trip.id, c.id, { beforeItemId: a.id })
    const reordered = await s.items.listByTrip(trip.id)
    expect(reordered[0].id).toBe(c.id)
    expect(reordered.map((i) => i.id)).toContain(a.id)
    expect(reordered.map((i) => i.id)).toContain(b.id)
  })

  it('reorder by newIndex moves the target to the given slot', async () => {
    const { trip } = await s.trips.create(makeTripInput())
    const items = await s.items.listByTrip(trip.id)
    const target = items[items.length - 1]
    await s.items.reorder(trip.id, target.id, { newIndex: 0 })
    const reordered = await s.items.listByTrip(trip.id)
    expect(reordered[0].id).toBe(target.id)
  })
})

describe.skipIf(skipUnlessDocker())(
  'T2.16 last-write-wins on item edits, no version column (real Postgres)',
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

    it('two sequential updates converge; the second name persists', async () => {
      const { trip } = await s.trips.create(makeTripInput())
      const [first] = await s.items.listByTrip(trip.id)

      // Two devices edit the same item — neither errors.
      const r1 = s.items.update(first.id, { name: 'Device A' })
      const r2 = s.items.update(first.id, { name: 'Device B' })
      const [a, b] = await Promise.all([r1, r2])
      expect(a.name).toBeTypeOf('string')
      expect(b.name).toBeTypeOf('string')

      // Now do a deterministic sequential update so the assertion isn't
      // racy: second write wins.
      await s.items.update(first.id, { name: 'First' })
      await s.items.update(first.id, { name: 'Second' })
      const list = await s.items.listByTrip(trip.id)
      const it = list.find((i) => i.id === first.id)!
      expect(it.name).toBe('Second')
    })

    it('TripItem table has no "version" column (last-write-wins, DR-58)', async () => {
      await withPgClient(async (client) => {
        const r = await client.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'TripItem'`,
        )
        const cols = r.rows.map((row) => row.column_name)
        expect(cols).not.toContain('version')
      })
    })
  },
)
