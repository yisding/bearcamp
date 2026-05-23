// Ephemeral Postgres harness — WS-2 acceptance tests.
//
// Spins up a `postgres:16` Testcontainer, runs `prisma migrate deploy` against
// it, returns the connection string plus utilities. One container per suite
// (`startPostgresOnce`) keeps the run cheap; each individual test wipes data
// via `truncateAll(client)` so we don't pay migrate-deploy per-test.
//
// Used by every T2.* file. Tests should call `getPostgres()` (lazy
// singleton) inside `beforeAll` and `truncateAll()` inside `beforeEach`.

import { execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { StorageAdapter } from '../../storage'

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..')
const SCHEMA_PATH = join(REPO_ROOT, 'prisma', 'schema.prisma')

export interface PostgresHarness {
  container: StartedPostgreSqlContainer
  url: string
  // Tear down — `globalSetup` would be the next step but per-suite afterAll
  // is enough here. Idempotent.
  stop: () => Promise<void>
}

let _harness: PostgresHarness | null = null

/** Lazy singleton — one container per `vitest run`. */
export async function getPostgres(): Promise<PostgresHarness> {
  if (_harness) return _harness
  const container = await new PostgreSqlContainer('postgres:16')
    .withDatabase('bearcamp_test')
    .withUsername('bearcamp')
    .withPassword('bearcamp')
    .start()
  const url = container.getConnectionUri()
  _harness = {
    container,
    url,
    stop: async () => {
      if (_harness) {
        await _harness.container.stop()
        _harness = null
      }
    },
  }
  // Apply the WS-0 schema + WS-2's migrations.
  applyMigrations(url)
  return _harness
}

/**
 * Runs `prisma migrate deploy` against the ephemeral DB. WS-2 owns
 * `prisma/migrations/*` — this helper just shells out. We also write a
 * `.env.test` placeholder so any tool that reads it picks up the URL.
 */
export function applyMigrations(databaseUrl: string): void {
  // Stash the URL in a temp env file (referenced by tests that want a path).
  const dir = mkdtempSync(join(tmpdir(), 'bearcamp-test-env-'))
  const envPath = join(dir, '.env.test')
  writeFileSync(
    envPath,
    [
      `DATABASE_URL=${databaseUrl}`,
      `DIRECT_URL=${databaseUrl}`,
      '',
    ].join('\n'),
    'utf8',
  )
  process.env.DATABASE_URL = databaseUrl
  process.env.DIRECT_URL = databaseUrl

  execSync(`pnpm exec prisma migrate deploy --schema ${SCHEMA_PATH}`, {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
    },
    stdio: 'pipe',
  })
}

/**
 * Reapply migrations on the same DB to assert a no-op (T2.1). Will throw
 * if migrate-deploy errors; vitest test catches that.
 */
export function reapplyMigrations(databaseUrl: string): void {
  execSync(`pnpm exec prisma migrate deploy --schema ${SCHEMA_PATH}`, {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DIRECT_URL: databaseUrl,
    },
    stdio: 'pipe',
  })
}

/**
 * Wipe all application tables — used between tests so the suite doesn't pay
 * migrate-deploy per test. `RESTART IDENTITY CASCADE` because of FK chains.
 *
 * Uses `pg` (transitive via @testcontainers/postgresql) directly to avoid
 * coupling to Prisma's not-yet-existing `lib/db/prisma.ts`.
 */
export async function truncateAll(): Promise<void> {
  // Lazy dynamic import keeps the helper importable even when `pg` lookup
  // fails for unrelated reasons.
  const { Client } = await import('pg')
  const harness = _harness
  if (!harness) throw new Error('truncateAll(): no harness — call getPostgres() first')
  const client = new Client({ connectionString: harness.url })
  await client.connect()
  try {
    await client.query(
      'TRUNCATE TABLE "Claim", "Participant", "TripItem", "Trip", "Campsite" RESTART IDENTITY CASCADE',
    )
  } finally {
    await client.end()
  }
}

/** Low-level pg client for raw queries (EXPLAIN, CHECK constraint probes). */
export async function withPgClient<T>(
  fn: (client: import('pg').Client) => Promise<T>,
): Promise<T> {
  const { Client } = await import('pg')
  const harness = _harness
  if (!harness) throw new Error('withPgClient(): no harness — call getPostgres() first')
  const client = new Client({ connectionString: harness.url })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/**
 * Construct a Prisma-backed StorageAdapter for the ephemeral DB. WS-2 owns
 * the factory; we import it dynamically so this helper file doesn't fail to
 * load merely because the impl doesn't exist yet. The dynamic import will
 * still throw at call time — which is the expected red state.
 */
export async function makePrismaStorage(): Promise<StorageAdapter> {
  const harness = await getPostgres()
  process.env.DATABASE_URL = harness.url
  process.env.DIRECT_URL = harness.url
  // Implementer owns this module — import path is stable per the workstream
  // owned-paths table. ESLint disabled: dynamic specifier is intentional.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import('../../storage.prisma')
  if (typeof mod.createPrismaStorage !== 'function') {
    throw new Error(
      'lib/db/storage.prisma must export `createPrismaStorage(): StorageAdapter`',
    )
  }
  return mod.createPrismaStorage() as StorageAdapter
}

/** For tests that need the raw Prisma client (e.g. T2.15 CHECK probe). */
export async function getPrismaClient(): Promise<{
  prisma: { $disconnect(): Promise<void> } & Record<string, unknown>
}> {
  const harness = await getPostgres()
  process.env.DATABASE_URL = harness.url
  process.env.DIRECT_URL = harness.url
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import('../../prisma')
  if (!mod.prisma) {
    throw new Error('lib/db/prisma must export `prisma` (PrismaClient instance)')
  }
  return { prisma: mod.prisma }
}
