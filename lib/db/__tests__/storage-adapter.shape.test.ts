// T0.1 — structural conformance.
// storage.memory.ts must export a value that satisfies the StorageAdapter
// interface (typecheck-level). At runtime, the stub methods throw, so a
// real call still fails — but the *shape* must be there.

import { describe, it, expect } from 'vitest'
import type { StorageAdapter } from '../storage'
import { createMemoryStorage, memoryStorage } from '../storage.memory'

describe('T0.1 storage-adapter shape', () => {
  it('memoryStorage satisfies StorageAdapter (structurally)', () => {
    // Type-level assertion. If memoryStorage's shape drifts from
    // StorageAdapter, this assignment fails to compile (pnpm typecheck).
    const _typed: StorageAdapter = memoryStorage
    expect(_typed).toBeDefined()
  })

  it('createMemoryStorage() returns the full repo surface', () => {
    const s: StorageAdapter = createMemoryStorage()
    // Every sub-repo present
    expect(s.campsites).toBeDefined()
    expect(s.trips).toBeDefined()
    expect(s.items).toBeDefined()
    expect(s.participants).toBeDefined()
    expect(s.claims).toBeDefined()
    expect(s.view).toBeDefined()
    // Every method present and callable shape
    const methods = [
      ['campsites', 'upsertMany'],
      ['campsites', 'search'],
      ['campsites', 'getById'],
      ['trips', 'create'],
      ['trips', 'getById'],
      ['trips', 'rename'],
      ['trips', 'updateSettings'],
      ['trips', 'delete'],
      ['trips', 'byOwnerToken'],
      ['items', 'listByTrip'],
      ['items', 'add'],
      ['items', 'update'],
      ['items', 'softRemove'],
      ['items', 'restore'],
      ['items', 'reorder'],
      ['participants', 'listByTrip'],
      ['participants', 'add'],
      ['participants', 'byToken'],
      ['participants', 'count'],
      ['claims', 'listByTrip'],
      ['claims', 'upsert'],
      ['claims', 'remove'],
      ['view', 'buildTripView'],
    ] as const
    for (const [repo, method] of methods) {
      const r = (s as unknown as Record<string, Record<string, unknown>>)[repo]
      expect(typeof r[method]).toBe('function')
    }
  })
})
