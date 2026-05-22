// WS-2.11 — `prisma/seed.ts` coverage.
//
// WS-2.11's DoD: "`pnpm prisma db seed` populates; reseed = same count;
// with `BC_DEV_URL` unset, the script succeeds without trying to ping."
// This file pins the two parts of that DoD that lacked a test:
//
//   1. Reseed idempotency — running the seed entrypoint twice against a
//      fresh ephemeral Postgres leaves `campsite.count()` unchanged (the
//      script only writes when the table is empty; the second run is a
//      no-op, no duplicate rows). Docker-gated via `skipUnlessDocker()`,
//      mirroring every other Testcontainers-backed suite — it skips here
//      when Docker is unavailable, which is acceptable.
//
//   2. `BC_DEV_URL`-unset no-ping path — with `BC_DEV_URL` unset the
//      script must NOT attempt a revalidation `fetch`. This mirrors how
//      `lib/campsites/__tests__/import-ridb.test.ts` covers the analogous
//      `BC_DEV_URL` branch for the importer: mock the DB layer, spy on
//      `globalThis.fetch`, run the exported entrypoint, assert no fetch.

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { skipUnlessDocker } from '../../lib/db/__tests__/_helpers/docker'
import { getPostgres } from '../../lib/db/__tests__/_helpers/postgres'

// --- Part 2: BC_DEV_URL-unset no-ping path (no Docker needed) ----------------
//
// The seed entrypoint constructs a Prisma client + campsites repo. We mock
// both so this unit test never touches a real database — it only exercises
// the `BC_DEV_URL` branch. The Campsite table is reported as already
// populated so the seed body short-circuits to the dev-ping decision.

const campsiteCount = vi.fn(async () => 3)
vi.mock('../../lib/db/prisma', () => ({
  createPrismaClient: () => ({
    campsite: { count: campsiteCount },
    $disconnect: vi.fn(async () => {}),
  }),
}))
vi.mock('../../lib/db/campsites', () => ({
  createCampsitesRepo: () => ({ upsertMany: vi.fn(async () => {}) }),
}))

describe('WS-2.11 seed — BC_DEV_URL-unset no-ping path', () => {
  const originalDevUrl = process.env.BC_DEV_URL
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    campsiteCount.mockClear()
    delete process.env.BC_DEV_URL
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
    if (originalDevUrl === undefined) delete process.env.BC_DEV_URL
    else process.env.BC_DEV_URL = originalDevUrl
  })

  it('with BC_DEV_URL unset, main() does not attempt a revalidate fetch', async () => {
    const seed = await import('../seed')
    const main = (seed.default ?? seed.main) as () => Promise<void>
    expect(main).toBeTypeOf('function')
    await main()
    // Spec (review-3 DR-57): no dev server → no ping.
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// --- Part 1: reseed idempotency on a real ephemeral Postgres -----------------

describe.skipIf(skipUnlessDocker())(
  'WS-2.11 seed — reseed idempotency (real Postgres)',
  () => {
    beforeAll(async () => {
      // Starts `postgres:16`, runs `prisma migrate deploy`, and pins
      // `process.env.DATABASE_URL` to the ephemeral URL — which the seed's
      // `createPrismaClient()` reads.
      await getPostgres()
    }, 120_000)

    afterAll(async () => {
      // Container is shared across the run; teardown is handled by the
      // last Testcontainers suite. `stop()` is idempotent.
    })

    it('running the seed entrypoint twice yields the same campsite.count()', async () => {
      // Import the seed module with the DB layer UN-mocked so it runs
      // against the real Testcontainers Postgres.
      vi.doUnmock('../../lib/db/prisma')
      vi.doUnmock('../../lib/db/campsites')
      vi.resetModules()
      delete process.env.BC_DEV_URL

      const { createPrismaClient } = await import('../../lib/db/prisma')
      const seed = await import('../seed')
      const main = (seed.default ?? seed.main) as () => Promise<void>

      // First seed run — populates the empty Campsite table.
      await main()
      // Second seed run — must be a no-op (table non-empty → skip).
      await main()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prisma = createPrismaClient() as any
      try {
        const countAfterFirst = (await prisma.campsite.count()) as number
        expect(countAfterFirst).toBeGreaterThan(0)
        // Re-run once more and confirm the count is stable (no duplicates).
        await main()
        const countAfterThird = (await prisma.campsite.count()) as number
        expect(countAfterThird).toBe(countAfterFirst)
      } finally {
        await prisma.$disconnect()
      }
    }, 120_000)
  },
)
