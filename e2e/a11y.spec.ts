// WS-8 T8.7 — accessibility (axe) scan on key pages.
//
// Spec (plan/tasks/ws-8-integration-validation-hardening.md, T8.7):
//   Automated axe scan on key pages: no critical violations.
//
// `@axe-core/playwright` is a dev dependency; it is imported statically
// below. Each scan fails on any *critical* violation.

import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function runAxe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  return results
}

const PAGES = [
  { name: 'landing /', path: '/' },
  { name: 'browse /campsites', path: '/campsites' },
] as const

for (const p of PAGES) {
  test(`T8.7 axe — ${p.name} has no critical violations`, async ({ page }) => {
    await page.goto(p.path)
    const results = await runAxe(page)
    const critical = results.violations.filter(
      (v) => v.impact === 'critical',
    )
    expect(
      critical,
      `critical a11y violations on ${p.path}: ` +
        JSON.stringify(
          critical.map((v) => ({ id: v.id, help: v.help })),
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
  const results = await runAxe(page)
  const critical = results.violations.filter(
    (v) => v.impact === 'critical',
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

    const results = await runAxe(page)
    const critical = results.violations.filter(
      (v) => v.impact === 'critical',
    )
    expect(critical).toEqual([])
    await ctx.close()
  })
})
