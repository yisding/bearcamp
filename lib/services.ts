// Composition root / swap seam — WS-0.12.
// Defaults to memory + fixtures; WS-8 flips defaults via BEARCAMP_BACKEND.

import type { StorageAdapter } from './db/storage'
import type { CampsiteSource } from './campsites/source'
import { memoryStorage } from './db/storage.memory'
import { createFixtureSource } from './campsites/fixtures'

export type Backend = 'memory' | 'prisma'

export function getBackend(): Backend {
  const b = process.env.BEARCAMP_BACKEND
  return b === 'prisma' ? 'prisma' : 'memory'
}

let prismaStorageSingleton: StorageAdapter | null = null

// Prisma factory is intentionally a not-configured throw at WS-0 — WS-2
// wires the real implementation. Returns a distinct object identity from
// the memory singleton so the services seam test (T0.8) sees a different
// factory selection rather than silently falling through to memory.
function makePrismaStorage(): StorageAdapter {
  const notWired = (method: string) => () => {
    throw new Error(
      `prisma storage backend not configured in WS-0 (WS-2 wires this); called ${method}`,
    )
  }
  return {
    campsites: {
      upsertMany: notWired('campsites.upsertMany'),
      search: notWired('campsites.search'),
      getById: notWired('campsites.getById'),
    },
    trips: {
      create: notWired('trips.create'),
      getById: notWired('trips.getById'),
      rename: notWired('trips.rename'),
      updateSettings: notWired('trips.updateSettings'),
      delete: notWired('trips.delete'),
      byOwnerToken: notWired('trips.byOwnerToken'),
    },
    items: {
      listByTrip: notWired('items.listByTrip'),
      add: notWired('items.add'),
      update: notWired('items.update'),
      softRemove: notWired('items.softRemove'),
      restore: notWired('items.restore'),
      reorder: notWired('items.reorder'),
    },
    participants: {
      listByTrip: notWired('participants.listByTrip'),
      add: notWired('participants.add'),
      byToken: notWired('participants.byToken'),
      count: notWired('participants.count'),
    },
    claims: {
      listByTrip: notWired('claims.listByTrip'),
      upsert: notWired('claims.upsert'),
      remove: notWired('claims.remove'),
    },
    view: {
      buildTripView: notWired('view.buildTripView'),
    },
  }
}

export function getStorage(): StorageAdapter {
  if (getBackend() === 'prisma') {
    if (!prismaStorageSingleton) {
      prismaStorageSingleton = makePrismaStorage()
    }
    return prismaStorageSingleton
  }
  return memoryStorage
}

let fixtureSourceSingleton: CampsiteSource | null = null

export function getCampsiteSource(): CampsiteSource {
  if (!fixtureSourceSingleton) {
    fixtureSourceSingleton = createFixtureSource()
  }
  return fixtureSourceSingleton
}
