// T2.6 — claims repo: upsert composite-id dedupe; remove.

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

describe.skipIf(skipUnlessDocker())('T2.6 claims repo (real Postgres)', () => {
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

  it('upsert twice on the same (itemId, participantId) yields one row with the later qty', async () => {
    const { trip, owner } = await s.trips.create(makeTripInput())
    const [item] = await s.items.listByTrip(trip.id)
    await s.claims.upsert(item.id, owner.id, 1)
    await s.claims.upsert(item.id, owner.id, 7)
    const claims = await s.claims.listByTrip(trip.id)
    const mine = claims.filter(
      (c) => c.itemId === item.id && c.participantId === owner.id,
    )
    expect(mine).toHaveLength(1)
    expect(mine[0].qty).toBe(7)

    // Belt-and-braces: only one row at the DB level too — composite PK.
    await withPgClient(async (client) => {
      const r = await client.query(
        `SELECT 1 FROM "Claim" WHERE "itemId" = $1 AND "participantId" = $2`,
        [item.id, owner.id],
      )
      expect(r.rowCount).toBe(1)
    })
  })

  it('remove deletes the claim row', async () => {
    const { trip, owner } = await s.trips.create(makeTripInput())
    const [item] = await s.items.listByTrip(trip.id)
    await s.claims.upsert(item.id, owner.id, 1)
    await s.claims.remove(item.id, owner.id)
    const claims = await s.claims.listByTrip(trip.id)
    expect(claims.some((c) => c.itemId === item.id && c.participantId === owner.id)).toBe(false)
  })
})
