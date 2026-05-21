// T4.5 — Playwright e2e stub for the "static shell intact" check.
//
// STATUS: Playwright is NOT installed in this repo at the time WS-4's red
// phase was authored. The implementer turning this green is expected to:
//   1. `pnpm add -D @playwright/test`
//   2. add a `e2e` test script (e.g. `playwright test -c playwright.config.ts`)
//   3. create a minimal `playwright.config.ts` pointing at `pnpm dev` /
//      `pnpm build && pnpm start` (the latter is the right target for an
//      `unstable_instant` static-shell check — it has to be the production
//      build to validate the static shell).
//
// Until then, this file is intentionally NOT picked up by vitest
// (`vitest.config.ts` includes only `__tests__/**` and `*.test.ts(x)`; this
// is `e2e/static-shell.spec.ts` — different glob).
//
// The acceptance criterion is:
//   - GET `/` returns HTML that contains visible landing-page content BEFORE
//     hydration markers (no app-wide empty <Suspense> above <body>).
//   - The page header brand "Bearcamp" appears in the initial HTML.
//   - There is no `data-suspense-fallback` placeholder at the document root.
//
// Recommended Playwright skeleton (uncomment + install to activate):
/*
import { test, expect } from '@playwright/test'

test.describe('T4.5 static shell on /', () => {
  test('non-empty static HTML before hydration', async ({ page }) => {
    const res = await page.goto('/', { waitUntil: 'commit' })
    expect(res).not.toBeNull()
    const html = await res!.text()
    expect(html.length).toBeGreaterThan(500)
    expect(html).toContain('Bearcamp')
    // No app-wide empty Suspense placeholder at the document root.
    // React inserts <template id="..."> + <!--$?--> markers for streaming
    // boundaries; the *root* should not contain only these before any UI.
    expect(html).not.toMatch(/<body[^>]*>\s*<!--\$\?-->/)
  })

  test('Header is visible without JS', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false })
    const page = await ctx.newPage()
    await page.goto('/')
    await expect(page.getByRole('banner')).toBeVisible()
    await ctx.close()
  })
})
*/

// Sentinel export so this file is valid TypeScript even when Playwright
// isn't installed — keeps `tsc --noEmit` green pre-implementation.
export const PLAYWRIGHT_REQUIRED = true
