// Composition root / swap seam — WS-0.12 (default) + WS-8.1 (flip).
//
// WS-8.1 flipped the seam: the default backend is now `prisma` (WS-2
// Prisma/Neon storage + WS-3 seed catalog). When `BEARCAMP_BACKEND` is
// unset, `getStorage()` returns a Prisma-backed adapter (built via
// `createPrismaStorage()` from `lib/db/storage.prisma`) and
// `getCampsiteSource()` returns the seed-backed source
// (`createSeedSource()` from `lib/campsites/seed`).
//
// An explicit `BEARCAMP_BACKEND=memory` still selects the in-memory fake
// + fixtures — the fallback for quick local runs and the test suite. The
// vitest run pins `BEARCAMP_BACKEND=memory` via `vitest.config.ts`
// (`test.env`) so tests never touch Prisma (WS-8.1 DoD: "tests still use
// fakes").
//
// The prisma + seed factory modules are imported statically — they're
// import-safe even without a live DB (the Prisma client is lazily
// instantiated via a Proxy, see `lib/db/prisma.ts`; the seed source
// only loads `data/campsites.seed.json` when its methods are called).
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
  // WS-8.1: prisma is the default. Only an explicit `memory` opts out
  // (the test suite + quick local in-process runs).
  const b = process.env.BEARCAMP_BACKEND
  return b === 'memory' ? 'memory' : 'prisma'
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
