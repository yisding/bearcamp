// T2.5 — participants repo: creator isOwner=true; byToken; count;
//   51st add throws `participant_cap_reached` (DR-24).

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { skipUnlessDocker } from './_helpers/docker'
import {
  getPostgres,
  makePrismaStorage,
  truncateAll,
} from './_helpers/postgres'
import { makeTripInput, sampleCampsites, tok } from './_helpers/fixtures'
import type { StorageAdapter } from '../storage'
import { PARTICIPANT_CAP_PER_TRIP } from '../../limits'

describe.skipIf(skipUnlessDocker())(
  'T2.5 participants repo (real Postgres)',
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

    it('creator participant has isOwner=true', async () => {
      const { trip, owner } = await s.trips.create(makeTripInput())
      expect(owner.isOwner).toBe(true)
      const list = await s.participants.listByTrip(trip.id)
      expect(list).toHaveLength(1)
      expect(list[0].isOwner).toBe(true)
      expect(list[0].name).toBe('Owner')
    })

    it('byToken returns the participant with the matching token+tripId', async () => {
      const ptok = tok('pt-')
      const { trip } = await s.trips.create(
        makeTripInput({ ownerParticipantToken: ptok }),
      )
      const found = await s.participants.byToken(trip.id, ptok)
      expect(found?.isOwner).toBe(true)
      expect(await s.participants.byToken(trip.id, 'wrong-token')).toBeNull()
    })

    it('count returns the live participant count', async () => {
      const { trip } = await s.trips.create(makeTripInput())
      expect(await s.participants.count(trip.id)).toBe(1)
      await s.participants.add(trip.id, 'Joiner', false, tok('j1-'))
      expect(await s.participants.count(trip.id)).toBe(2)
    })

    it(`add throws 'participant_cap_reached' on the 51st participant (cap=${PARTICIPANT_CAP_PER_TRIP})`, async () => {
      const { trip } = await s.trips.create(makeTripInput())
      // Creator is participant 1. Add 49 more → 50 total.
      for (let i = 0; i < PARTICIPANT_CAP_PER_TRIP - 1; i++) {
        await s.participants.add(trip.id, `J${i}`, false, tok(`j${i}-`))
      }
      expect(await s.participants.count(trip.id)).toBe(PARTICIPANT_CAP_PER_TRIP)
      await expect(
        s.participants.add(trip.id, 'Overflow', false, tok('over-')),
      ).rejects.toThrow(/participant_cap_reached/)
    }, 60_000)
  },
)
