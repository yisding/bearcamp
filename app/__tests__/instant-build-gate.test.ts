// T5.7 — build gate (marker form).
//
// Spec contract:
//   `next build` reports no "uncached outside <Suspense>" error for
//   /, /campsites, /campsites/[id]. The route segments must export
//   `unstable_instant = { prefetch: 'static' }` so Cache Components
//   validation runs on these routes.
//
// Trade-off (documented per WS-5 task description):
//   The expensive form runs `next build` against a temporary config and
//   greps the output. That is correct but costly (~30-60s on a cold
//   build) and brittle in CI sandboxes that may lack write access to
//   `.next`. Cache Components validation also runs during `next dev`,
//   and the CI workflow runs `next build` explicitly — so the build
//   gate exists as a CI step (the workflow fails the PR if Cache
//   Components validation errors). To complement CI, we assert the two
//   structural invariants that the validator is checking for:
//     1. `app/page.tsx` and `app/campsites/page.tsx` export the literal
//        `unstable_instant = { prefetch: 'static' }` config (cf.
//        `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/instant.md`).
//     2. The browse and detail pages wrap their streamed content in a
//        `<Suspense>` boundary — i.e. the file source contains a
//        `<Suspense` tag.
//   These markers are necessary preconditions for the validator to pass;
//   a regression that removes either is caught locally before CI.

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

const ROOT = process.cwd()

async function readFileIfExists(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, 'utf8')
  } catch {
    return null
  }
}

// `unstable_instant` must be exported with `prefetch: 'static'`. Routes that
// read `params`/`searchParams` additionally carry a `samples` array (Next 16's
// instant validator wraps request data in an exhaustive proxy keyed by
// `samples[].params` / `.searchParams`), so the object is not always the bare
// `{ prefetch: 'static' }` literal. The marker we assert is the export plus
// `prefetch: 'static'`; the optional `samples` field is allowed after it.
const INSTANT_RE =
  /export\s+const\s+unstable_instant\s*=\s*\{\s*prefetch\s*:\s*['"]static['"]/

describe('T5.7 instant + Suspense markers (build-gate proxy)', () => {
  it('app/page.tsx exports `unstable_instant = { prefetch: "static" }`', async () => {
    const src = await readFileIfExists(path.join(ROOT, 'app/page.tsx'))
    expect(src, 'app/page.tsx must exist').not.toBeNull()
    expect(src!).toMatch(INSTANT_RE)
  })

  it('app/campsites/page.tsx exports `unstable_instant = { prefetch: "static" }`', async () => {
    const src = await readFileIfExists(path.join(ROOT, 'app/campsites/page.tsx'))
    expect(src, 'app/campsites/page.tsx must exist').not.toBeNull()
    expect(src!).toMatch(INSTANT_RE)
  })

  it('browse page wraps streamed results in a <Suspense> boundary', async () => {
    const src = await readFileIfExists(path.join(ROOT, 'app/campsites/page.tsx'))
    expect(src, 'app/campsites/page.tsx must exist').not.toBeNull()
    // Validator forbids "uncached data outside <Suspense>" — wrapping
    // the streamed list in a Suspense is the minimum precondition.
    expect(src!).toMatch(/<\s*Suspense\b/)
  })

  it('detail page either uses `use cache` or wraps streamed data in <Suspense>', async () => {
    const src = await readFileIfExists(
      path.join(ROOT, 'app/campsites/[id]/page.tsx'),
    )
    expect(src, 'app/campsites/[id]/page.tsx must exist').not.toBeNull()
    // The detail page caches with 'use cache' (DR — cacheLife('days')
    // pinned, review I-A). If a regression strips the cache directive,
    // a Suspense boundary is still required.
    const hasUseCache = /['"]use cache['"]/.test(src!)
    const hasSuspense = /<\s*Suspense\b/.test(src!)
    expect(hasUseCache || hasSuspense).toBe(true)
  })

  it('layout root does NOT silently disable instant validation', async () => {
    const src = await readFileIfExists(path.join(ROOT, 'app/layout.tsx'))
    expect(src, 'app/layout.tsx must exist').not.toBeNull()
    // `unstable_instant = false` on the root layout would suppress all
    // route validation. Reject that explicitly.
    expect(src!).not.toMatch(/unstable_instant\s*=\s*false/)
  })
})
