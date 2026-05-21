// T2.10 — atomic createTrip via array-form `$transaction([...])`; failure
//   rolls back; **no** interactive `$transaction(async ...)` form anywhere
//   in the codebase (review-2 DR-10).
//
// The Neon serverless HTTP driver does NOT support interactive callback
// transactions. We assert two things:
//   1. (runtime, real Postgres) createTrip is atomic — a failure inside
//      the multi-write rolls all of it back.
//   2. (static, no Docker required) no `.ts`/`.tsx` source file in the
//      tree calls `$transaction(async ...)`. This is a grep-guard that
//      runs even when Docker is not available.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
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

const REPO_ROOT = resolve(__dirname, '..', '..', '..')

/** Walk the repo source tree, returning all .ts/.tsx files outside excluded dirs. */
function listSourceFiles(): string[] {
  const out: string[] = []
  const skip = new Set([
    'node_modules',
    '.next',
    '.git',
    'plan',
    'public',
    '.vercel',
  ])
  function walk(dir: string): void {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (skip.has(name)) continue
      const full = join(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        walk(full)
      } else if (/\.(ts|tsx)$/.test(name)) {
        out.push(full)
      }
    }
  }
  walk(REPO_ROOT)
  return out
}

describe('T2.10 grep-guard: no interactive $transaction(async ...) anywhere', () => {
  it('no source file uses the interactive callback form of $transaction', () => {
    const offenders: string[] = []
    // Pattern matches `.$transaction(async` and `$transaction(async` (with
    // any whitespace) but NOT array-form `$transaction([...])`.
    const re = /\$transaction\s*\(\s*async\b/
    for (const file of listSourceFiles()) {
      // The grep-guard rule is "no interactive form in source". Skip THIS
      // test file because the regex/string would self-match.
      if (file.endsWith('transaction.test.ts')) continue
      const src = readFileSync(file, 'utf8')
      if (re.test(src)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})

describe.skipIf(skipUnlessDocker())(
  'T2.10 atomic createTrip via array-form $transaction (real Postgres)',
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

    it('createTrip commits trip + items + owner participant atomically', async () => {
      const { trip, owner } = await s.trips.create(makeTripInput())
      const items = await s.items.listByTrip(trip.id)
      expect(items.length).toBe(3)
      expect(owner.isOwner).toBe(true)
      expect(await s.participants.count(trip.id)).toBe(1)
    })

    it('createTrip with a duplicate ownerToken rolls back the trip + items + participant', async () => {
      // Seed an existing trip with a known ownerToken.
      const dupToken = tok('dup-')
      await s.trips.create(makeTripInput({ ownerToken: dupToken }))

      const beforeTrips = await countTable('Trip')
      const beforeItems = await countTable('TripItem')
      const beforeParts = await countTable('Participant')

      // Second create with the same ownerToken — must fail and roll back.
      await expect(
        s.trips.create(
          makeTripInput({
            ownerToken: dupToken,
            ownerParticipantToken: tok('p2-'),
            name: 'Dup',
          }),
        ),
      ).rejects.toThrow()

      const afterTrips = await countTable('Trip')
      const afterItems = await countTable('TripItem')
      const afterParts = await countTable('Participant')
      // Nothing from the failed transaction was committed.
      expect(afterTrips).toBe(beforeTrips)
      expect(afterItems).toBe(beforeItems)
      expect(afterParts).toBe(beforeParts)
    })

    it('PrismaClient is constructed with a driver adapter (Neon HTTP) — no interactive tx', async () => {
      // Best-effort sanity: the typed client exists and has $transaction.
      // The interactive form on Neon HTTP would throw at runtime; we don't
      // call it (grep-guard above enforces source absence).
      const { prisma } = await getPrismaClient()
      expect(typeof (prisma as unknown as { $transaction: unknown }).$transaction).toBe(
        'function',
      )
    })
  },
)

async function countTable(name: string): Promise<number> {
  return withPgClient(async (client) => {
    const r = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "${name}"`,
    )
    return Number(r.rows[0].count)
  })
}
