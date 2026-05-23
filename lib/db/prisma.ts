// Prisma client + driver adapter — WS-2.2.
//
// Global singleton guarded for Next dev hot-reload, so HMR does not leak
// connection pools across reloads.
//
// Driver adapter selection (Prisma 7 requires an adapter):
//   - `@prisma/adapter-neon` (HTTP) when DATABASE_URL points at Neon
//     (host contains `.neon.tech`). Required for serverless deploys and
//     compatible with array-form `$transaction([...])` only (DR-10) —
//     the HTTP driver does not support interactive callback transactions.
//   - `@prisma/adapter-pg` otherwise. Used for local Docker Postgres and
//     Testcontainers (which expose plain TCP, not a Neon WebSocket proxy).
//
// Both adapters expose the same PrismaClient surface, so the rest of
// `lib/db/*` is agnostic to the deployment target. We never use
// interactive transaction-callback form anywhere — grep-guarded by
// T2.10 (transaction.test.ts).
//
// The same client is reused for repository queries; migrations run via the
// `prisma` CLI and use `DIRECT_URL` (unpooled) — see prisma.config.ts.

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaNeonHttp } from '@prisma/adapter-neon'

declare global {
  // eslint-disable-next-line no-var
  var __bearcampPrisma: PrismaClient | undefined
}

/**
 * Heuristic: any URL whose host ends in `.neon.tech` is a Neon connection
 * and should go through the HTTP driver. Plain Postgres URLs (Docker,
 * Testcontainers, etc.) fall through to `@prisma/adapter-pg`.
 */
export function isNeonUrl(connectionString: string): boolean {
  try {
    const u = new URL(connectionString)
    return u.hostname.endsWith('.neon.tech')
  } catch {
    return false
  }
}

function buildAdapter(connectionString: string) {
  if (isNeonUrl(connectionString)) {
    // HTTP driver — array-form $transaction([...]) only.
    return new PrismaNeonHttp(connectionString, {})
  }
  return new PrismaPg({ connectionString })
}

/**
 * Build a `PrismaClient` against the given URL. Tests use this directly so
 * each Testcontainers run gets a fresh client wired to the container's URL.
 */
export function createPrismaClient(connectionString?: string): PrismaClient {
  const url = connectionString ?? process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'createPrismaClient(): DATABASE_URL is not set (see .env.example).',
    )
  }
  return new PrismaClient({ adapter: buildAdapter(url) })
}

/**
 * Process-wide PrismaClient singleton. Uses `globalThis` to survive Next
 * dev hot-reload (the lib module would otherwise be re-evaluated on every
 * file change, leaking pooled connections).
 *
 * Lazily initialised so the module loads even when DATABASE_URL is unset
 * (e.g. CI lint/typecheck without DB env, or vitest paths that don't
 * touch persistence at all). The Proxy defers PrismaClient construction
 * until the first property is read.
 */
export const prisma: PrismaClient =
  globalThis.__bearcampPrisma ??
  (globalThis.__bearcampPrisma = lazyClient())

function lazyClient(): PrismaClient {
  if (process.env.DATABASE_URL) {
    return createPrismaClient()
  }
  let real: PrismaClient | null = null
  return new Proxy({} as PrismaClient, {
    get(_target, prop) {
      if (!real) real = createPrismaClient()
      const v = (real as unknown as Record<string | symbol, unknown>)[prop]
      return typeof v === 'function'
        ? (v as (...args: unknown[]) => unknown).bind(real)
        : v
    },
  })
}
