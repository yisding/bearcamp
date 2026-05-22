// T0.8 — services seam (updated by WS-8.1).
// WS-8.1 flipped the default: when `BEARCAMP_BACKEND` is unset the backend
// is `prisma`. An explicit `BEARCAMP_BACKEND=memory` selects the in-memory
// fake + fixtures. The vitest run pins `memory` globally (vitest.config.ts
// `test.env`); these tests set `process.env.BEARCAMP_BACKEND` explicitly so
// they don't depend on that ambient default.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('T0.8 services seam', () => {
  const originalEnv = process.env.BEARCAMP_BACKEND
  beforeEach(() => {
    delete process.env.BEARCAMP_BACKEND
  })
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.BEARCAMP_BACKEND
    else process.env.BEARCAMP_BACKEND = originalEnv
  })

  it("default backend (BEARCAMP_BACKEND unset) is 'prisma'", async () => {
    const mod = await import('../services')
    expect(mod.getBackend()).toBe('prisma')
  })

  it("BEARCAMP_BACKEND=prisma (explicit) selects 'prisma'", async () => {
    process.env.BEARCAMP_BACKEND = 'prisma'
    const mod = await import('../services')
    expect(mod.getBackend()).toBe('prisma')
  })

  it("BEARCAMP_BACKEND=memory (explicit) selects 'memory'", async () => {
    process.env.BEARCAMP_BACKEND = 'memory'
    const mod = await import('../services')
    expect(mod.getBackend()).toBe('memory')
  })

  it('getStorage() with BEARCAMP_BACKEND=memory returns a StorageAdapter (memory)', async () => {
    process.env.BEARCAMP_BACKEND = 'memory'
    const { getStorage } = await import('../services')
    const s = getStorage()
    // Structural: must have all 6 sub-repos
    expect(s.campsites).toBeDefined()
    expect(s.trips).toBeDefined()
    expect(s.items).toBeDefined()
    expect(s.participants).toBeDefined()
    expect(s.claims).toBeDefined()
    expect(s.view).toBeDefined()
  })

  it('getCampsiteSource() with BEARCAMP_BACKEND=memory returns a CampsiteSource (fixtures)', async () => {
    process.env.BEARCAMP_BACKEND = 'memory'
    const { getCampsiteSource } = await import('../services')
    const src = getCampsiteSource()
    expect(typeof src.all).toBe('function')
    expect(typeof src.getById).toBe('function')
    expect(typeof src.search).toBe('function')
  })

  it('BEARCAMP_BACKEND=prisma returns a *different* storage factory (not memory)', async () => {
    process.env.BEARCAMP_BACKEND = 'prisma'
    const { getStorage } = await import('../services')
    // We accept any of: throws (impl not wired), or returns a different
    // object identity than the memory singleton. The goal of the seam is
    // that switching backends actually selects a different factory.
    let differs = false
    try {
      const prismaStorage = getStorage()
      const { memoryStorage } = await import('../db/storage.memory')
      differs = prismaStorage !== memoryStorage
    } catch {
      // Throwing is acceptable at this stage — the seam is exercised, and
      // it didn't silently fall through to memory.
      differs = true
    }
    expect(differs).toBe(true)
  })
})
