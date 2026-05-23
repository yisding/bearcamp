// `prisma db seed` entrypoint — WS-2.11.
//
// Idempotent: only writes when the Campsite table is empty. Re-running this
// against an already-seeded DB is a no-op (same row count, no duplicates).
//
// **WS-3 dependency note:** the real seed dataset (≥150 entries) lives in
// `data/campsites.seed.json` and is loaded by WS-3's `loadSeed()` helper.
// That stream is not yet on this branch, so we consume a temporary local
// fixture (`prisma/seed.fixture.ts`) instead. WS-8's integration step
// swaps the import to `loadSeed()` from WS-3 — one line, no other change.
//
// After write, if the dev server is running (`BC_DEV_URL` is set), we POST
// the dev-only `/api/revalidate-campsites` Route Handler so the catalog
// cache refreshes immediately (review-3 DR-50 / DR-57). Without
// `BC_DEV_URL` we print a one-line hint and exit clean — `prisma db seed`
// runs from the CLI where the Next runtime is typically not listening.

import { createPrismaClient } from '../lib/db/prisma'
import { createCampsitesRepo } from '../lib/db/campsites'
import { loadSeed } from './seed.fixture'

// Exported so tests can drive the seed entrypoint without a process exit
// (mirrors `scripts/import-ridb.ts` exporting `importRidb`). The CLI
// invocation at the bottom of the file runs `main()` directly.
export async function main(): Promise<void> {
  const prisma = createPrismaClient()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = prisma as any
    const existing = (await p.campsite.count()) as number
    if (existing > 0) {
      console.log(
        `[bc.seed] Campsite already populated (${existing} rows) — skipping.`,
      )
    } else {
      const rows = await loadSeed()
      const repo = createCampsitesRepo(prisma)
      await repo.upsertMany(rows)
      console.log(`[bc.seed] Seeded ${rows.length} campsites.`)
    }

    // Optional dev-server ping (review-3 DR-50 / DR-57).
    const devUrl = process.env.BC_DEV_URL
    if (devUrl) {
      try {
        const target = new URL('/api/revalidate-campsites', devUrl)
        const res = await fetch(target, { method: 'POST' })
        console.log(
          `[bc.seed] Pinged ${target.toString()} → ${res.status}`,
        )
      } catch (err) {
        console.warn(
          '[bc.seed] Failed to ping revalidate-campsites; dev server may not be running.',
          err,
        )
      }
    } else {
      console.log(
        '[bc.seed] dev server not running; restart to refresh catalog.',
      )
    }
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).$disconnect?.()
  }
}

// CLI wrapper — `prisma db seed` invokes this file directly. Guarded so
// importing the module for tests (mirroring `scripts/import-ridb.ts`)
// doesn't trigger a real seed run / `process.exit`.
const isDirectInvocation =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('seed.ts')

if (isDirectInvocation) {
  main().catch((err) => {
    console.error('[bc.seed] Failed:', err)
    process.exit(1)
  })
}

export default main
