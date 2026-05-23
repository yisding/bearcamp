// T2.3 — trips repo: create freezes campsiteSnapshot; rename;
//   updateSettings({ tentCapacity: 6 }); delete(id) cascades.
// T2.13 — ownerToken unique violation.
// T2.15 — tentCapacity DB bound: insert tentCapacity=0 or 13 rejected by the
//   Postgres CHECK constraint (DR-54).

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { skipUnlessDocker } from './_helpers/docker'
import {
  getPostgres,
  getPrismaClient,
  makePrismaStorage,
  truncateAll,
  withPgClient,
} from './_helpers/postgres'
import { makeTripInput, sampleCampsites, tok } from './_helpers/fixtures'
import type { StorageAdapter } from '../storage'

describe.skipIf(skipUnlessDocker())('T2.3 trips repo (real Postgres)', () => {
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

  it('create freezes campsiteSnapshot from the supplied campsite payload', async () => {
    const input = makeTripInput()
    const { trip } = await s.trips.create(input)
    const fetched = await s.trips.getById(trip.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.campsite.name).toBe(input.campsite.name)
    expect(fetched!.campsite.amenities).toEqual(input.campsite.amenities)
    expect(fetched!.campsite.state).toBe(input.campsite.state)
    expect(fetched!.campsite.agency).toBe(input.campsite.agency)
  })

  it('rename persists the new name', async () => {
    const { trip } = await s.trips.create(makeTripInput())
    const renamed = await s.trips.rename(trip.id, 'New Name')
    expect(renamed.name).toBe('New Name')
    const fetched = await s.trips.getById(trip.id)
    expect(fetched!.name).toBe('New Name')
  })

  it('updateSettings({ tentCapacity: 6 }) persists', async () => {
    const { trip } = await s.trips.create(makeTripInput())
    const updated = await s.trips.updateSettings(trip.id, { tentCapacity: 6 })
    expect(updated.tentCapacity).toBe(6)
    const fetched = await s.trips.getById(trip.id)
    expect(fetched!.tentCapacity).toBe(6)
  })

  it('delete(id) cascades items, participants, and claims', async () => {
    const { trip, owner } = await s.trips.create(makeTripInput())
    const items = await s.items.listByTrip(trip.id)
    expect(items.length).toBeGreaterThan(0)
    await s.claims.upsert(items[0].id, owner.id, 1)

    await s.trips.delete(trip.id)

    expect(await s.trips.getById(trip.id)).toBeNull()
    expect(await s.items.listByTrip(trip.id)).toEqual([])
    expect(await s.participants.listByTrip(trip.id)).toEqual([])
    expect(await s.claims.listByTrip(trip.id)).toEqual([])

    // Sanity: cascade must work at the *DB* level too, not only via app
    // filters (T2.9). Check the underlying tables directly.
    await withPgClient(async (client) => {
      const r1 = await client.query(`SELECT 1 FROM "TripItem" WHERE "tripId" = $1`, [trip.id])
      const r2 = await client.query(
        `SELECT 1 FROM "Participant" WHERE "tripId" = $1`,
        [trip.id],
      )
      const r3 = await client.query(`SELECT 1 FROM "Claim" WHERE "tripId" = $1`, [trip.id])
      expect(r1.rowCount).toBe(0)
      expect(r2.rowCount).toBe(0)
      expect(r3.rowCount).toBe(0)
    })
  })
})

describe.skipIf(skipUnlessDocker())(
  'T2.13 ownerToken unique violation (real Postgres)',
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

    it('a second Trip with the same ownerToken is rejected by the @unique constraint', async () => {
      const dupToken = tok('dup-')
      await s.trips.create(makeTripInput({ ownerToken: dupToken, ownerParticipantToken: tok('pa-') }))
      await expect(
        s.trips.create(
          makeTripInput({
            ownerToken: dupToken,
            ownerParticipantToken: tok('pb-'),
            name: 'Second',
          }),
        ),
      ).rejects.toThrow()
    })
  },
)

describe.skipIf(skipUnlessDocker())(
  'T2.15 tentCapacity DB CHECK constraint (real Postgres)',
  () => {
    beforeAll(async () => {
      await getPostgres()
    }, 120_000)

    beforeEach(async () => {
      await truncateAll()
      const s = await makePrismaStorage()
      await s.campsites.upsertMany(sampleCampsites)
    })

    afterEach(async () => {
      await truncateAll()
    })

    // We probe via raw SQL because the repo layer also rejects out-of-range
    // values in app code (lib/validation/actions.ts), so we'd never reach
    // the DB. The point of T2.15 is to assert that a *direct* DB write is
    // rejected by Postgres — belt-and-braces (DR-54).
    it('direct INSERT with tentCapacity=0 is rejected by the CHECK constraint', async () => {
      await withPgClient(async (client) => {
        await expect(
          client.query(
            `INSERT INTO "Trip"
               ("id", "name", "campsiteId", "campsiteSnapshot", "style",
                "ownerToken", "tentCapacity")
             VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
            [
              't-zero',
              'Bad',
              'fixture:emerald-lake',
              JSON.stringify({}),
              'car',
              tok('z-'),
              0,
            ],
          ),
        ).rejects.toThrow(/check|constraint|tent_capacity/i)
      })
    })

    it('direct INSERT with tentCapacity=13 is rejected by the CHECK constraint', async () => {
      await withPgClient(async (client) => {
        await expect(
          client.query(
            `INSERT INTO "Trip"
               ("id", "name", "campsiteId", "campsiteSnapshot", "style",
                "ownerToken", "tentCapacity")
             VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
            [
              't-thirteen',
              'Bad13',
              'fixture:emerald-lake',
              JSON.stringify({}),
              'car',
              tok('th-'),
              13,
            ],
          ),
        ).rejects.toThrow(/check|constraint|tent_capacity/i)
      })
    })

    it('direct INSERT with tentCapacity=12 (boundary) is accepted', async () => {
      // Sanity: 12 is the upper bound and must succeed (DR-54).
      const { prisma } = await getPrismaClient()
      // Use prisma directly to write through the typed client.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = prisma as any
      const t = await p.trip.create({
        data: {
          id: 't-twelve',
          name: 'Twelve',
          campsiteId: 'fixture:emerald-lake',
          campsiteSnapshot: {},
          style: 'car',
          ownerToken: tok('tw-'),
          tentCapacity: 12,
        },
      })
      expect(t.tentCapacity).toBe(12)
    })
  },
)
