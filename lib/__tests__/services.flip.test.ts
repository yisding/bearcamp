// WS-8 T8.1 — services flip (red phase).
//
// Spec (plan/tasks/ws-8-integration-validation-hardening.md, T8.1):
//   When `BEARCAMP_BACKEND=prisma`:
//     - `getStorage()` returns the Prisma adapter (built via
//       `createPrismaStorage()` from `lib/db/storage.prisma`).
//     - `getCampsiteSource()` returns the seed source (built via
//       `createSeedSource()` from `lib/campsites/seed`).
//   Without the env var, defaults remain memory + fixtures.
//
// At WS-8 red:
//   - `getStorage()` still returns a not-wired stub (throws on call) — fine
//     for T0.8, but T8.1 demands the *real* Prisma factory.
//   - `getCampsiteSource()` returns the fixtures-backed source — even when
//     `BEARCAMP_BACKEND=prisma`. T8.1 demands the seed source under the flag.
//
// The implementation (WS-8.1) flips `services.ts` to import
// `createPrismaStorage` + `createSeedSource` lazily so dev/test environments
// without `DATABASE_URL` don't crash at import time.
//
// We assert *factory identity* (the call sequence selects the right module)
// — not adapter behaviour. The contract suites (T8.2/T8.3) prove behaviour.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const originalEnv = process.env.BEARCAMP_BACKEND

describe('T8.1 services flip — BEARCAMP_BACKEND=prisma selects real factories', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.BEARCAMP_BACKEND
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalEnv === undefined) delete process.env.BEARCAMP_BACKEND
    else process.env.BEARCAMP_BACKEND = originalEnv
  })

  it('without the env var, getStorage() returns the in-memory singleton', async () => {
    const services = await import('../services')
    const { memoryStorage } = await import('../db/storage.memory')
    expect(services.getStorage()).toBe(memoryStorage)
  })

  it('without the env var, getCampsiteSource() returns the fixtures source', async () => {
    // The fixtures source exposes `all`/`getById`/`search` — and crucially
    // is built from `createFixtureSource`, not `createSeedSource`. We can't
    // discriminate by identity alone (CampsiteSource is a plain object), so
    // we spy on the seed module's `createSeedSource` and assert it was NOT
    // called when the flag is absent.
    const seedSpy = vi.fn()
    vi.doMock('../campsites/seed', async () => {
      const actual: typeof import('../campsites/seed') = await vi.importActual('../campsites/seed')
      return {
        ...actual,
        createSeedSource: (...args: unknown[]) => {
          seedSpy(...args)
          return actual.createSeedSource()
        },
      }
    })
    const services = await import('../services')
    services.getCampsiteSource()
    expect(seedSpy).not.toHaveBeenCalled()
  })

  it('with BEARCAMP_BACKEND=prisma, getStorage() is built via createPrismaStorage()', async () => {
    process.env.BEARCAMP_BACKEND = 'prisma'

    // Spy on the Prisma storage factory. We do NOT want to actually connect
    // to a database in this unit test — we only want to prove the seam
    // CALLS the factory. Replace the factory with a fake that returns a
    // recognisable sentinel object; the adapter's structural shape is
    // covered by T8.2.
    const sentinel = {
      __sentinel: 'prisma-storage-sentinel',
      campsites: {}, trips: {}, items: {}, participants: {}, claims: {}, view: {},
    } as unknown
    const factorySpy = vi.fn(() => sentinel)
    vi.doMock('../db/storage.prisma', () => ({
      createPrismaStorage: factorySpy,
    }))

    const services = await import('../services')
    const got = services.getStorage()
    expect(factorySpy).toHaveBeenCalledTimes(1)
    expect(got).toBe(sentinel)
  })

  it('with BEARCAMP_BACKEND=prisma, getCampsiteSource() is built via createSeedSource()', async () => {
    process.env.BEARCAMP_BACKEND = 'prisma'

    const sentinel = {
      __sentinel: 'seed-source-sentinel',
      all: async () => [],
      getById: async () => null,
      search: async () => ({ campsites: [], total: 0, page: 1, pageSize: 20 }),
    }
    const factorySpy = vi.fn(() => sentinel)
    vi.doMock('../campsites/seed', () => ({
      createSeedSource: factorySpy,
      // loadSeed is consumed by `prisma db seed` only — not needed here.
    }))

    const services = await import('../services')
    const got = services.getCampsiteSource()
    expect(factorySpy).toHaveBeenCalledTimes(1)
    expect(got).toBe(sentinel)
  })

  it('with BEARCAMP_BACKEND=prisma, getStorage() singleton is stable across calls', async () => {
    process.env.BEARCAMP_BACKEND = 'prisma'

    const factorySpy = vi.fn(() => ({
      campsites: {}, trips: {}, items: {}, participants: {}, claims: {}, view: {},
    }))
    vi.doMock('../db/storage.prisma', () => ({
      createPrismaStorage: factorySpy,
    }))

    const services = await import('../services')
    const a = services.getStorage()
    const b = services.getStorage()
    expect(a).toBe(b)
    // Factory called exactly once — the seam memoises the adapter.
    expect(factorySpy).toHaveBeenCalledTimes(1)
  })

  it('with BEARCAMP_BACKEND=prisma, the memory storage is NOT used', async () => {
    process.env.BEARCAMP_BACKEND = 'prisma'
    vi.doMock('../db/storage.prisma', () => ({
      createPrismaStorage: () => ({
        __mark: 'prisma',
        campsites: {}, trips: {}, items: {}, participants: {}, claims: {}, view: {},
      }),
    }))
    const services = await import('../services')
    const { memoryStorage } = await import('../db/storage.memory')
    expect(services.getStorage()).not.toBe(memoryStorage)
  })
})
