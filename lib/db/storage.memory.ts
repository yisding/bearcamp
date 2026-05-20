// In-memory StorageAdapter — WS-0.5 (impl agent fills this in).
// This is a TDD red stub: tests import it and fail because methods throw.

import type { StorageAdapter } from './storage'

function notImpl(method: string): never {
  throw new Error(
    `storage.memory: ${method} not implemented (WS-0.5 — impl phase)`,
  )
}

// Factory so tests can spin up fresh state per test (storageContract pattern).
export function createMemoryStorage(): StorageAdapter {
  return {
    campsites: {
      upsertMany: () => notImpl('campsites.upsertMany'),
      search: () => notImpl('campsites.search'),
      getById: () => notImpl('campsites.getById'),
    },
    trips: {
      create: () => notImpl('trips.create'),
      getById: () => notImpl('trips.getById'),
      rename: () => notImpl('trips.rename'),
      updateSettings: () => notImpl('trips.updateSettings'),
      delete: () => notImpl('trips.delete'),
      byOwnerToken: () => notImpl('trips.byOwnerToken'),
    },
    items: {
      listByTrip: () => notImpl('items.listByTrip'),
      add: () => notImpl('items.add'),
      update: () => notImpl('items.update'),
      softRemove: () => notImpl('items.softRemove'),
      restore: () => notImpl('items.restore'),
      reorder: () => notImpl('items.reorder'),
    },
    participants: {
      listByTrip: () => notImpl('participants.listByTrip'),
      add: () => notImpl('participants.add'),
      byToken: () => notImpl('participants.byToken'),
      count: () => notImpl('participants.count'),
    },
    claims: {
      listByTrip: () => notImpl('claims.listByTrip'),
      upsert: () => notImpl('claims.upsert'),
      remove: () => notImpl('claims.remove'),
    },
    view: {
      buildTripView: () => notImpl('view.buildTripView'),
    },
  }
}

// Convenience default singleton (impl agent may keep or replace).
export const memoryStorage = createMemoryStorage()
