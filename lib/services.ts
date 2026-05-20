// Composition root / swap seam — WS-0.12.
// Defaults to memory + fixtures; WS-8 flips defaults via BEARCAMP_BACKEND.
// Stub form for the red pass.

import type { StorageAdapter } from './db/storage'
import type { CampsiteSource } from './campsites/source'

export type Backend = 'memory' | 'prisma'

export function getBackend(): Backend {
  const b = process.env.BEARCAMP_BACKEND
  return b === 'prisma' ? 'prisma' : 'memory'
}

export function getStorage(): StorageAdapter {
  throw new Error('getStorage not implemented (WS-0.12 — impl phase)')
}

export function getCampsiteSource(): CampsiteSource {
  throw new Error('getCampsiteSource not implemented (WS-0.12 — impl phase)')
}
