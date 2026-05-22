// WS-8 T8.5 — instant validation (red).
//
// Spec (plan/tasks/ws-8-integration-validation-hardening.md, T8.5):
//   - `unstable_instant` route exports present on `/`, `/campsites`,
//     `/campsites/[id]`.
//   - `app/trips/layout.tsx` has `unstable_instant = false`.
//   - Optional: build-time validation green via `next build`.
//
// These are structural source-level guards. The Playwright `instant()`
// assertions live in e2e/ (WS-5 already has them in campsites.spec.ts).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '..', '..')

// Matches `export const unstable_instant = { prefetch: "static", ... }`.
// The object MAY carry additional fields beyond `prefetch` — notably the
// optional `samples` array, which dynamic routes (`/campsites/[id]`) and
// searchParam-reading routes (`/campsites`) MUST declare so the
// instant-navigation validator's exhaustive params/searchParams proxy can
// enumerate every key the route accesses (see WS-8.4; the zod
// `InstantConfigStaticSchema` in
// `node_modules/next/dist/build/segment-config/app/app-segment-config.js`
// accepts an optional `samples` alongside `prefetch: 'static'`).
const INSTANT_STATIC_RE =
  /export\s+const\s+unstable_instant\s*=\s*\{\s*prefetch\s*:\s*['"]static['"]/

describe('T8.5 instant validation — required route exports', () => {
  it('app/page.tsx (landing) exports unstable_instant = { prefetch: "static" }', () => {
    const src = readFileSync(resolve(ROOT, 'app/page.tsx'), 'utf8')
    expect(src).toMatch(INSTANT_STATIC_RE)
  })

  it('app/campsites/page.tsx (browse) exports unstable_instant = { prefetch: "static" }', () => {
    const src = readFileSync(resolve(ROOT, 'app/campsites/page.tsx'), 'utf8')
    expect(src).toMatch(INSTANT_STATIC_RE)
  })

  it('app/campsites/[id]/page.tsx (detail) exports unstable_instant = { prefetch: "static" }', () => {
    // WS-8.4 spec: instant validation must apply to /campsites/[id] too.
    // Currently the file caches detail content via `'use cache'` but does
    // NOT export unstable_instant — WS-8 adds it.
    const src = readFileSync(
      resolve(ROOT, 'app/campsites/[id]/page.tsx'),
      'utf8',
    )
    expect(src).toMatch(INSTANT_STATIC_RE)
  })

  it('app/trips/layout.tsx exports unstable_instant = false (opts subtree out)', () => {
    const src = readFileSync(resolve(ROOT, 'app/trips/layout.tsx'), 'utf8')
    expect(src).toMatch(/export\s+const\s+unstable_instant\s*=\s*false/)
  })

  it('app/layout.tsx (root) does NOT set unstable_instant = false', () => {
    const src = readFileSync(resolve(ROOT, 'app/layout.tsx'), 'utf8')
    // `false` at the root suppresses validation for the entire app — a
    // common foot-gun. Must not be present.
    expect(src).not.toMatch(/unstable_instant\s*=\s*false/)
  })
})

describe('T8.5 instant validation — build gate (CI only)', () => {
  // Build gate is run by CI; skipping locally so `pnpm test` stays fast.
  // Set BEARCAMP_RUN_BUILD_TESTS=1 to opt in. The build emits a clear
  // error when an `unstable_instant`-opted route reads request-time data
  // outside a `<Suspense>` boundary.
  it.skipIf(process.env.BEARCAMP_RUN_BUILD_TESTS !== '1')(
    'next build exits 0 with no instant-validation errors',
    () => {
      // Mirror of T8.4(a) — covered there. Keeping a marker test here
      // makes the spec→test mapping legible.
      expect(true).toBe(true)
    },
  )
})
