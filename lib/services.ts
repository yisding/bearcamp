// Composition root / swap seam — WS-0.12 (default) + WS-8.1 (flip).
//
// Defaults to memory + fixtures. When `BEARCAMP_BACKEND=prisma` is set,
// `getStorage()` returns a Prisma-backed adapter (built via
// `createPrismaStorage()` from `lib/db/storage.prisma`) and
// `getCampsiteSource()` returns the seed-backed source
// (`createSeedSource()` from `lib/campsites/seed`).
//
// The prisma + seed factory modules are imported statically — they're
// import-safe even without a live DB (the Prisma client is lazily
// instantiated via a Proxy, see `lib/db/prisma.ts`; the seed source
// only loads `data/campsites.seed.json` when its methods are called).
// Tests that don't want to hit Prisma / seed code can keep the default
// memory + fixtures by leaving `BEARCAMP_BACKEND` unset.
//
// Tests in `lib/__tests__/services.flip.test.ts` `vi.doMock(...)` the
// factory modules then `await import('../services')`, so the static
// imports below resolve to the mocks (Vitest hoists doMock + clears
// the module registry per `vi.resetModules()`).

import type { StorageAdapter } from './db/storage'
import type { CampsiteSource } from './campsites/source'
import { memoryStorage } from './db/storage.memory'
import { createFixtureSource } from './campsites/fixtures'
import { createPrismaStorage } from './db/storage.prisma'
import { createSeedSource } from './campsites/seed'

export type Backend = 'memory' | 'prisma'

export function getBackend(): Backend {
  const b = process.env.BEARCAMP_BACKEND
  return b === 'prisma' ? 'prisma' : 'memory'
}

let prismaStorageSingleton: StorageAdapter | null = null
let fixtureSourceSingleton: CampsiteSource | null = null
let seedSourceSingleton: CampsiteSource | null = null

export function getStorage(): StorageAdapter {
  if (getBackend() === 'prisma') {
    if (!prismaStorageSingleton) {
      prismaStorageSingleton = createPrismaStorage()
    }
    return prismaStorageSingleton
  }
  return memoryStorage
}

export function getCampsiteSource(): CampsiteSource {
  if (getBackend() === 'prisma') {
    if (!seedSourceSingleton) {
      seedSourceSingleton = createSeedSource()
    }
    return seedSourceSingleton
  }
  if (!fixtureSourceSingleton) {
    fixtureSourceSingleton = createFixtureSource()
  }
  return fixtureSourceSingleton
}
