// Prisma-backed StorageAdapter — WS-2.10.
//
// Composes the per-aggregate repositories (campsites / trips / items /
// participants / claims / view) over a single PrismaClient. Tests construct
// the adapter via `createPrismaStorage()` (no args) after pointing
// `process.env.DATABASE_URL` at the Testcontainers Postgres. The WS-8
// services seam flips between this and `storage.memory` via
// `BEARCAMP_BACKEND`.
//
// Atomic multi-writes (createTrip) use array-form `prisma.$transaction([...])`
// only — the Neon HTTP driver does not support interactive callback
// transactions (review-2 DR-10). T2.10's grep-guard fails the build if
// the interactive callback form appears anywhere in source.

import type { StorageAdapter } from './storage'
import { createPrismaClient, prisma as defaultPrisma } from './prisma'
import type { PrismaClient } from '@prisma/client'
import { createCampsitesRepo } from './campsites'
import { createTripsRepo } from './trips'
import { createItemsRepo } from './items'
import { createParticipantsRepo } from './participants'
import { createClaimsRepo } from './claims'
import { createViewRepo } from './view'

/**
 * Build a `StorageAdapter` backed by the given PrismaClient. Defaults to
 * the singleton (`lib/db/prisma.ts`) but tests pass a fresh client so they
 * can target the Testcontainers DB. WS-8's services seam consumes the
 * no-arg form for production wiring.
 */
export function createPrismaStorage(client?: PrismaClient): StorageAdapter {
  const prisma = client ?? defaultPrisma
  return {
    campsites: createCampsitesRepo(prisma),
    trips: createTripsRepo(prisma),
    items: createItemsRepo(prisma),
    participants: createParticipantsRepo(prisma),
    claims: createClaimsRepo(prisma),
    view: createViewRepo(prisma),
  }
}

/**
 * Convenience factory for callers (e.g. tests) that need an adapter wired
 * to a specific DATABASE_URL without leaking PrismaClient construction.
 */
export function createPrismaStorageForUrl(
  connectionString: string,
): StorageAdapter {
  return createPrismaStorage(createPrismaClient(connectionString))
}
