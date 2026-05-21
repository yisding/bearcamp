// WS-8 T8.7 — accessibility (axe) scan on key pages (red).
//
// Spec (plan/tasks/ws-8-integration-validation-hardening.md, T8.7):
//   Automated axe scan on key pages: no critical violations.
//
// Implementation: `@axe-core/playwright` is NOT installed at the time
// this red phase is authored. The impl agent (WS-8) should:
//   1. `pnpm add -D @axe-core/playwright`
//   2. Replace the dynamic import / try-block below with a static
//      `import AxeBuilder from '@axe-core/playwright'`.
//   3. Wire the trip-flow into the scan (needs Postgres + seed).
//
// The current spec runs in two modes:
//   - If `@axe-core/playwright` resolves at runtime → scan executes and
//     fails on any *critical* violation.
//   - Otherwise → the test fails with a clear message naming the dep to
//     add. This keeps T8.7 visibly red until the impl wires the package.

import { test, expect, type Page } from '@playwright/test'

async function tryAxe(page: Page) {
  // Dynamic import so this file compiles whether or not the package is
  // installed. We obscure the specifier from the TS module resolver via
  // a string variable so `tsc --noEmit` doesn't fail when the dep is
  // absent. At runtime, Node resolves the specifier normally.
  try {
    const specifier = '@axe-core/playwright'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import(/* @vite-ignore */ specifier)
    const AxeBuilder = mod.default ?? mod.AxeBuilder
    if (!AxeBuilder) throw new Error('AxeBuilder not exported')
    const builder = new AxeBuilder({ page })
    const results = await builder
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    return { results, available: true as const }
  } catch (err) {
    return {
      results: null,
      available: false as const,
      err: (err as Error).message,
    }
  }
}

const PAGES = [
  { name: 'landing /', path: '/' },
  { name: 'browse /campsites', path: '/campsites' },
] as const

for (const p of PAGES) {
  test(`T8.7 axe — ${p.name} has no critical violations`, async ({ page }) => {
    await page.goto(p.path)
    const axe = await tryAxe(page)
    if (!axe.available) {
      throw new Error(
        `[T8.7] @axe-core/playwright is not installed. ` +
          `Add it with \`pnpm add -D @axe-core/playwright\` and re-run. ` +
          `Inner error: ${axe.err ?? '<none>'}`,
      )
    }
    const critical = axe.results!.violations.filter(
      (v: { impact?: string; id?: string; help?: string }) =>
        v.impact === 'critical',
    )
    expect(
      critical,
      `critical a11y violations on ${p.path}: ` +
        JSON.stringify(
          critical.map((v: { id?: string; help?: string }) => ({
            id: v.id,
            help: v.help,
          })),
          null,
          2,
        ),
    ).toEqual([])
  })
}

test('T8.7 axe — campsite detail page has no critical violations', async ({
  page,
}) => {
  // Use the first card on /campsites to navigate.
  await page.goto('/campsites')
  const firstCard = page
    .locator('[data-slot="campsite-card"], article')
    .first()
  await firstCard.getByRole('link').first().click()
  await page.waitForURL(/\/campsites\/[^/]+$/)
  const axe = await tryAxe(page)
  if (!axe.available) {
    throw new Error(
      `[T8.7] @axe-core/playwright is not installed. ` +
        `Add it with \`pnpm add -D @axe-core/playwright\` and re-run.`,
    )
  }
  const critical = axe.results!.violations.filter(
    (v: { impact?: string }) => v.impact === 'critical',
  )
  expect(critical).toEqual([])
})

// Trip page a11y — gated on Prisma being wired (so a trip can exist).
test.describe('T8.7 axe — trip page', () => {
  test.skip(
    process.env.BEARCAMP_BACKEND !== 'prisma',
    'trip flow requires Postgres-backed services',
  )
  test('after creating a trip, the trip page has no critical violations', async ({
    browser,
  }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto('/campsites')
    await page
      .locator('[data-slot="campsite-card"], article')
      .first()
      .getByRole('link')
      .first()
      .click()
    const car =
      (await page.getByRole('radio', { name: /car/i }).first().elementHandle()) ??
      (await page.getByLabel(/car/i).first().elementHandle())
    await car!.click()
    await page
      .getByRole('button', { name: /create|start|go|plan/i })
      .first()
      .click()
    await page.waitForURL(/\/trips\/[^/]+$/)

    const axe = await tryAxe(page)
    if (!axe.available) {
      throw new Error(
        `[T8.7] @axe-core/playwright is not installed. ` +
          `Add it with \`pnpm add -D @axe-core/playwright\` and re-run.`,
      )
    }
    const critical = axe.results!.violations.filter(
      (v: { impact?: string; id?: string; help?: string }) =>
        v.impact === 'critical',
    )
    expect(critical).toEqual([])
    await ctx.close()
  })
})
