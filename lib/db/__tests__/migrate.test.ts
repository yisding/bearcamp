// T2.1 — migrate.
// `prisma migrate deploy` builds the full schema + `pg_trgm` extension +
// GIN trigram indexes (gin_trgm_ops) + `trip_tent_capacity_check`
// constraint on an empty DB; reapply is a no-op (review-2 DR-11; review-3
// DR-54).
//
// WS-2 owns `prisma/migrations/*` — these tests fail until those migrations
// are written. We probe Postgres via raw `pg` queries because the assertions
// are about *DB-level* artefacts (extensions, indexes, CHECK constraints),
// not Prisma client behavior.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { skipUnlessDocker } from './_helpers/docker'
import {
  getPostgres,
  reapplyMigrations,
  withPgClient,
} from './_helpers/postgres'

describe.skipIf(skipUnlessDocker())('T2.1 migrate (real Postgres)', () => {
  let url: string

  beforeAll(async () => {
    const harness = await getPostgres()
    url = harness.url
  }, 120_000)

  afterAll(async () => {
    // Container shared across the suite — kept open; vitest run teardown
    // will stop it via afterAll in the last file. (Cheap: stop is idempotent.)
  })

  it('pg_trgm extension is installed', async () => {
    await withPgClient(async (client) => {
      const r = await client.query<{ extname: string }>(
        "SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'",
      )
      expect(r.rowCount).toBe(1)
    })
  })

  it('campsite_name_trgm_idx exists as a GIN index using gin_trgm_ops', async () => {
    await withPgClient(async (client) => {
      const r = await client.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
         WHERE schemaname = 'public'
           AND tablename = 'Campsite'
           AND indexname = 'campsite_name_trgm_idx'`,
      )
      expect(r.rowCount).toBe(1)
      const def = r.rows[0].indexdef
      expect(def).toMatch(/USING gin/i)
      expect(def).toMatch(/gin_trgm_ops/)
      // Postgres reports `pg_indexes.indexdef` with quotes stripped from
      // lowercase identifiers (`pg_get_indexdef`), so the migration's
      // `"name"` becomes `name` in the readback. Accept either.
      expect(def).toMatch(/(?:"name"|\bname\b)\s+gin_trgm_ops/)
    })
  })

  it('campsite_description_trgm_idx exists as a GIN index using gin_trgm_ops', async () => {
    await withPgClient(async (client) => {
      const r = await client.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
         WHERE schemaname = 'public'
           AND tablename = 'Campsite'
           AND indexname = 'campsite_description_trgm_idx'`,
      )
      expect(r.rowCount).toBe(1)
      const def = r.rows[0].indexdef
      expect(def).toMatch(/USING gin/i)
      expect(def).toMatch(/gin_trgm_ops/)
      // See above — lowercase identifiers come back unquoted from
      // `pg_get_indexdef`.
      expect(def).toMatch(/(?:"description"|\bdescription\b)\s+gin_trgm_ops/)
    })
  })

  it('trip_tent_capacity_check CHECK constraint exists', async () => {
    await withPgClient(async (client) => {
      const r = await client.query<{
        conname: string
        consrc: string | null
      }>(
        `SELECT conname,
                pg_get_constraintdef(c.oid) AS consrc
           FROM pg_constraint c
           JOIN pg_class t ON c.conrelid = t.oid
          WHERE t.relname = 'Trip'
            AND c.conname = 'trip_tent_capacity_check'`,
      )
      expect(r.rowCount).toBe(1)
      const def = r.rows[0].consrc ?? ''
      expect(def).toMatch(/CHECK/i)
      expect(def).toMatch(/tentCapacity/)
      // Bounds 1..12 from lib/limits.ts — DR-43/DR-54.
      expect(def).toMatch(/1/)
      expect(def).toMatch(/12/)
    })
  })

  it('reapplying `prisma migrate deploy` is a no-op (T2.1)', async () => {
    // First deploy ran in `getPostgres()`. Reapply must succeed without
    // creating new migrations or erroring on existing extension/indexes.
    expect(() => reapplyMigrations(url)).not.toThrow()
  })
})
