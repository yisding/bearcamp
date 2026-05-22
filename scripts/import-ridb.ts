// WS-3.6 — importer: backfill catalog via RIDB.
//
// Programmable entrypoint (`importRidb`) callable from tests + the CLI
// wrapper at the bottom. The script:
//   1) calls fetchRidb (no-op when RIDB_API_KEY unset)
//   2) deduplicates by id
//   3) calls storage.campsites.upsertMany once (skipped if no rows)
//   4) optionally pings the dev revalidate Route Handler (BC_DEV_URL set)
//
// Tests mock `@/lib/campsites/ridb` and `@/lib/services` (see
// `lib/campsites/__tests__/import-ridb.test.ts`). Network access is never
// required — the no-key path resolves to [] and exits gracefully.

import type { Campsite } from '@/lib/db/types'
import { fetchRidb } from '@/lib/campsites/ridb'
import { getStorage } from '@/lib/services'
import { CampsiteSchema } from '@/lib/validation/domain'

export interface ImportRidbOptions {
  // Override the storage adapter (tests inject via vi.mock; production
  // calls getStorage() by default).
  storage?: { campsites: { upsertMany(rows: Campsite[]): Promise<void> } }
}

export interface ImportRidbResult {
  inserted: number
  skipped: boolean
}

export async function importRidb(
  options: ImportRidbOptions = {},
): Promise<ImportRidbResult> {
  const rows = await fetchRidb()
  if (rows.length === 0) {
    // No key, or RIDB returned nothing — exit gracefully without writing.
    console.log(
      '[import-ridb] no rows to upsert (RIDB_API_KEY unset or empty response)',
    )
    return { inserted: 0, skipped: true }
  }

  // Validate fail-soft — RIDB data is untrusted upstream, so unlike the
  // curated seed (which fails fast in `loadSeed`) we drop + log invalid rows
  // rather than abort the whole import. Mirrors `loadSeed`'s CampsiteSchema
  // gate so only schema-valid rows reach `upsertMany`.
  const validated: Campsite[] = []
  for (const row of rows) {
    const parsed = CampsiteSchema.safeParse(row)
    if (!parsed.success) {
      const id =
        row && typeof row === 'object' && 'id' in row
          ? String((row as { id: unknown }).id)
          : '<unknown>'
      console.warn(
        `[import-ridb] dropping invalid row ${id}: ${parsed.error.message}`,
      )
      continue
    }
    validated.push(parsed.data as Campsite)
  }

  // Dedupe by id — RIDB occasionally returns duplicates across paginated
  // batches when a record straddles pages.
  const seen = new Set<string>()
  const deduped: Campsite[] = []
  for (const row of validated) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    deduped.push(row)
  }

  if (deduped.length === 0) {
    // Every fetched row failed validation — nothing safe to write.
    console.log('[import-ridb] no valid rows to upsert after validation')
    return { inserted: 0, skipped: true }
  }

  const storage = options.storage ?? getStorage()
  await storage.campsites.upsertMany(deduped)
  console.log(`[import-ridb] upserted ${deduped.length} rows`)

  // Optional revalidate ping — Route Handlers may call revalidateTag;
  // scripts cannot. BC_DEV_URL is unset in tests + prod.
  const devUrl = process.env.BC_DEV_URL
  if (devUrl) {
    try {
      await fetch(`${devUrl}/api/revalidate-campsites`, { method: 'POST' })
    } catch (err) {
      console.warn('[import-ridb] revalidate ping failed:', err)
    }
  }

  return { inserted: deduped.length, skipped: false }
}

// CLI wrapper — `pnpm tsx scripts/import-ridb.ts` (no-op if no RIDB_API_KEY).
const isDirectInvocation =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('import-ridb.ts')

if (isDirectInvocation) {
  importRidb().then(
    (res) => {
      console.log(`[import-ridb] done: ${JSON.stringify(res)}`)
    },
    (err) => {
      console.error('[import-ridb] failed:', err)
      process.exit(1)
    },
  )
}

export default importRidb
