// T2.9 — deleting a Trip removes its items/participants/claims via
//   Prisma `onDelete: Cascade` (schema-level). This complements
//   trips.repo.test.ts T2.3 by verifying the cascade works even when
//   invoked through the lower-level Prisma client, not just the repo.

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { skipUnlessDocker } from './_helpers/docker'
import {
  getPostgres,
  getPrismaClient,
  makePrismaStorage,
  truncateAll,
  withPgClient,
} from './_helpers/postgres'
import { makeTripInput, sampleCampsites } from './_helpers/fixtures'
import type { StorageAdapter } from '../storage'

describe.skipIf(skipUnlessDocker())(
  'T2.9 cascade delete (real Postgres)',
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

    it('Prisma-level Trip.delete cascades to items + participants + claims', async () => {
      const { trip, owner } = await s.trips.create(makeTripInput())
      const items = await s.items.listByTrip(trip.id)
      await s.claims.upsert(items[0].id, owner.id, 1)

      const { prisma } = await getPrismaClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = prisma as any
      await p.trip.delete({ where: { id: trip.id } })

      await withPgClient(async (client) => {
        const r1 = await client.query(`SELECT 1 FROM "TripItem" WHERE "tripId" = $1`, [trip.id])
        const r2 = await client.query(`SELECT 1 FROM "Participant" WHERE "tripId" = $1`, [trip.id])
        const r3 = await client.query(`SELECT 1 FROM "Claim" WHERE "tripId" = $1`, [trip.id])
        expect(r1.rowCount).toBe(0)
        expect(r2.rowCount).toBe(0)
        expect(r3.rowCount).toBe(0)
      })
    })
  },
)
