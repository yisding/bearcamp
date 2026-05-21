// WS-8 T8.6 — multi-user e2e on Postgres + seed (red).
//
// Spec (plan/tasks/ws-8-integration-validation-hardening.md, T8.6):
//   - Full share/join/claim flow + per-person scaling on real Postgres + seed.
//   - Trip page emits BOTH:
//       * `<meta name="robots" content="noindex, nofollow">` (DR-17)
//       * `X-Robots-Tag: noindex, nofollow` response header (DR-51)
//   - 51st joiner gets the cap toast with the canonical
//       `"This trip is full (50 people)."` message (DR-24 / DR-46).
//   - Owner deletes trip → redirect `/`, BOTH Set-Cookie headers carry
//       `Max-Age=0` and matching path (DR-20 / DR-40).
//   - A second browser context on the deleted trip hits the unified
//       not-found page on next refresh (DR-47).
//
// These tests assume `BEARCAMP_BACKEND=prisma` is set when the Playwright
// `webServer` boots (CI sets this; locally, a fresh `docker compose up`
// against `pnpm dev` works too). The e2e suite is skipped if the dev
// server can't reach Postgres — Playwright bails out cleanly.
//
// WS-6's `trips.spec.ts` already covers a flow end-to-end against the
// in-memory fake. This file adds the production-only assertions
// (X-Robots-Tag header, 51st-joiner cap, Set-Cookie attributes on
// delete) that were impossible to assert pre-WS-8.

import { test, expect, request as pwRequest } from '@playwright/test'
import { campsite as campsiteRoute, trip as tripRoute } from '../lib/routes'

const PRISMA_ENABLED = process.env.BEARCAMP_BACKEND === 'prisma'

// We *do not* skip these by default — the spec says CI runs them. If the
// impl team chooses to keep local runs on the memory backend, they can
// gate via `test.skip(!PRISMA_ENABLED, ...)` block-by-block. For now we
// only skip the "real DB" specific ones if Prisma isn't wired.

test.describe('T8.6 — full integration flow (Postgres + seed)', () => {
  test.skip(
    !PRISMA_ENABLED,
    'requires BEARCAMP_BACKEND=prisma + reachable Postgres (CI runs this)',
  )

  test('owner creates a trip on a seed campsite; second user joins + claims; per-person scaling', async ({
    browser,
    baseURL,
  }) => {
    // Pick a seed campsite — at WS-8 the browse page is backed by the real
    // seed (>=150 entries). We navigate to /campsites, grab the first
    // result, and click through.
    const ownerCtx = await browser.newContext()
    const owner = await ownerCtx.newPage()
    await owner.goto('/campsites')
    const firstCard = owner.locator('[data-slot="campsite-card"], article').first()
    await expect(firstCard).toBeVisible()
    const firstLink = firstCard.getByRole('link').first()
    const href = await firstLink.getAttribute('href')
    expect(href, 'first campsite card must link to detail').toBeTruthy()
    await firstLink.click()

    // Pick style + create.
    const car =
      (await owner.getByRole('radio', { name: /car/i }).first().elementHandle()) ??
      (await owner.getByLabel(/car/i).first().elementHandle())
    await car!.click()
    await owner
      .getByRole('button', { name: /create|start|go|plan/i })
      .first()
      .click()
    await owner.waitForURL(/\/trips\/[^/]+$/)
    const tripUrl = owner.url()

    // Joiner.
    const joinerCtx = await browser.newContext()
    const joiner = await joinerCtx.newPage()
    await joiner.goto(tripUrl)
    await joiner.getByRole('dialog').getByLabel(/name/i).fill('Bea')
    await joiner
      .getByRole('dialog')
      .getByRole('button', { name: /join|i['’]m\s+in|continue/i })
      .click()
    await expect(joiner.getByRole('dialog')).toBeHidden()

    // Joiner claims something. Pick the first row.
    const firstRow = joiner.locator('[data-slot="item-row"], li').first()
    await firstRow
      .getByRole('button', { name: /claim|i['’]ll\s+bring|bring/i })
      .first()
      .click()
    const confirm = firstRow.getByRole('button', { name: /confirm|save/i })
    if (await confirm.count()) await confirm.first().click()

    // Per-person scaling: with 2 participants, a per-person item's "needed"
    // count is >=2. We assert ANY item row contains the pattern.
    await owner.reload()
    const anyRow = owner.locator('[data-slot="item-row"], li')
    const text = (await anyRow.allInnerTexts()).join('\n')
    expect(text).toMatch(/\b\d+\s*(?:of|\/)\s*[2-9]\b/)

    await ownerCtx.close()
    await joinerCtx.close()

    void baseURL
  })
})

test.describe('T8.6 — privacy headers on /trips/[tripId] (DR-17 + DR-51)', () => {
  test.skip(
    !PRISMA_ENABLED,
    'requires BEARCAMP_BACKEND=prisma + reachable Postgres',
  )

  test('response emits BOTH meta robots AND X-Robots-Tag', async ({ browser, baseURL }) => {
    // Create a trip to get a valid id.
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto('/campsites')
    const firstCard = page.locator('[data-slot="campsite-card"], article').first()
    const link = firstCard.getByRole('link').first()
    const href = await link.getAttribute('href')
    expect(href).toBeTruthy()
    await link.click()
    const car =
      (await page.getByRole('radio', { name: /car/i }).first().elementHandle()) ??
      (await page.getByLabel(/car/i).first().elementHandle())
    await car!.click()
    await page
      .getByRole('button', { name: /create|start|go|plan/i })
      .first()
      .click()
    await page.waitForURL(/\/trips\/[^/]+$/)
    const url = page.url()

    // Fetch the raw response so we can see headers.
    const res = await page.goto(url, { waitUntil: 'commit' })
    expect(res).not.toBeNull()
    // Header: X-Robots-Tag.
    const headers = res!.headers()
    const xrt = headers['x-robots-tag']
    expect(xrt, 'X-Robots-Tag response header must be set on /trips/[id]').toBeTruthy()
    expect(xrt.toLowerCase()).toMatch(/noindex/)
    expect(xrt.toLowerCase()).toMatch(/nofollow/)
    // Meta tag in HTML.
    const html = await res!.text()
    expect(html).toMatch(
      /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex[^"']*["']/i,
    )
    expect(html).toMatch(
      /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*nofollow[^"']*["']/i,
    )

    await ctx.close()
    void baseURL
  })
})

test.describe('T8.6 — 51st joiner hits participant cap (DR-24 / DR-46)', () => {
  test.skip(
    !PRISMA_ENABLED,
    'requires Postgres + 50 prior participants; expensive — run in CI',
  )

  test('the 51st join attempt surfaces the canonical "This trip is full (50 people)." message', async ({
    browser,
  }) => {
    // Owner creates a trip.
    const ownerCtx = await browser.newContext()
    const owner = await ownerCtx.newPage()
    await owner.goto('/campsites')
    const firstCard = owner.locator('[data-slot="campsite-card"], article').first()
    await firstCard.getByRole('link').first().click()
    const car =
      (await owner.getByRole('radio', { name: /car/i }).first().elementHandle()) ??
      (await owner.getByLabel(/car/i).first().elementHandle())
    await car!.click()
    await owner.getByRole('button', { name: /create|start|go|plan/i }).first().click()
    await owner.waitForURL(/\/trips\/[^/]+$/)
    const tripUrl = owner.url()

    // Owner = #1. Join 49 more via the public action to fill the cap.
    // We exercise the action through fresh browser contexts so each gets a
    // distinct bc_participant cookie. 49 contexts is heavy but bounded.
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = []
    for (let i = 2; i <= 50; i++) {
      const c = await browser.newContext()
      contexts.push(c)
      const p = await c.newPage()
      await p.goto(tripUrl)
      await p.getByRole('dialog').getByLabel(/name/i).fill(`P${i}`)
      await p.getByRole('dialog').getByRole('button', { name: /join|continue/i }).click()
      await expect(p.getByRole('dialog')).toBeHidden({ timeout: 15_000 })
      await p.close()
    }

    // The 51st context attempts to join. Must see the canonical message.
    const fullCtx = await browser.newContext()
    contexts.push(fullCtx)
    const fullPage = await fullCtx.newPage()
    await fullPage.goto(tripUrl)
    await fullPage.getByRole('dialog').getByLabel(/name/i).fill('Overflow')
    await fullPage
      .getByRole('dialog')
      .getByRole('button', { name: /join|continue/i })
      .click()
    // Canonical UI copy — must match verbatim (DR-46).
    await expect(
      fullPage.getByText('This trip is full (50 people).'),
    ).toBeVisible({ timeout: 10_000 })

    for (const c of contexts) await c.close()
    await ownerCtx.close()
  })
})

test.describe('T8.6 — deleteTrip clears cookies + parallel context hits not-found', () => {
  test.skip(
    !PRISMA_ENABLED,
    'requires BEARCAMP_BACKEND=prisma + reachable Postgres',
  )

  test('owner delete → redirect /; Set-Cookie Max-Age=0 + path matches; second context hits not-found on refresh', async ({
    browser,
  }) => {
    // Owner creates a trip.
    const ownerCtx = await browser.newContext()
    const owner = await ownerCtx.newPage()
    await owner.goto('/campsites')
    await owner.locator('[data-slot="campsite-card"], article').first()
      .getByRole('link').first().click()
    const car =
      (await owner.getByRole('radio', { name: /car/i }).first().elementHandle()) ??
      (await owner.getByLabel(/car/i).first().elementHandle())
    await car!.click()
    await owner.getByRole('button', { name: /create|start|go|plan/i }).first().click()
    await owner.waitForURL(/\/trips\/[^/]+$/)
    const tripUrl = owner.url()
    const tripPath = new URL(tripUrl).pathname

    // Second context joins.
    const partCtx = await browser.newContext()
    const part = await partCtx.newPage()
    await part.goto(tripUrl)
    await part.getByRole('dialog').getByLabel(/name/i).fill('Sam')
    await part.getByRole('dialog').getByRole('button', { name: /join|continue/i }).click()
    await expect(part.getByRole('dialog')).toBeHidden()

    // Listen for Set-Cookie headers on the owner's response stream.
    const setCookies: string[] = []
    owner.on('response', (resp) => {
      const sc = resp.headers()['set-cookie']
      if (sc) setCookies.push(sc)
    })

    // Owner triggers delete.
    const settingsBtn = owner.getByRole('button', { name: /settings|manage|trip\s+settings/i })
    if (await settingsBtn.count()) await settingsBtn.first().click()
    await owner.getByRole('button', { name: /delete\s+trip/i }).first().click()
    const typeToConfirm = owner.getByRole('textbox', { name: /type|confirm/i })
    if (await typeToConfirm.count()) {
      const nameH1 = await owner.getByRole('heading', { level: 1 }).first().innerText()
      await typeToConfirm.first().fill(nameH1.trim())
    }
    await owner
      .getByRole('button', { name: /confirm\s+delete|yes,?\s+delete|delete\s+forever|i\s+understand/i })
      .first()
      .click()
    await owner.waitForURL(/\/$/, { timeout: 15_000 })

    // Assertions on Set-Cookie:
    //   Both bc_owner and bc_participant must be cleared with Max-Age=0
    //   AND the matching trip path. We concatenate the captured headers
    //   and look for the patterns.
    const joined = setCookies.join('\n')
    expect(joined).toMatch(/bc_owner=[^;]*;[^,]*\bMax-Age=0\b/i)
    expect(joined).toMatch(new RegExp(`bc_owner=[^;]*;[^,]*\\bPath=${tripPath}\\b`, 'i'))
    expect(joined).toMatch(/bc_participant=[^;]*;[^,]*\bMax-Age=0\b/i)
    expect(joined).toMatch(
      new RegExp(`bc_participant=[^;]*;[^,]*\\bPath=${tripPath}\\b`, 'i'),
    )

    // Parallel participant context refreshes — must render the unified
    // not-found page (DR-47).
    const res = await part.reload()
    expect(res?.status()).toBe(404)
    await expect(part.getByText(/doesn[’']?t\s+exist|deleted/i).first()).toBeVisible()

    await ownerCtx.close()
    await partCtx.close()
  })
})

// HEAD request lane — fast smoke test that confirms the headers rule even
// without going through the full create flow. Hits an arbitrary `/trips/...`
// id (will 404, but the rule must still apply because Next applies
// headers() before route matching).
test.describe('T8.6 — X-Robots-Tag rule on any /trips/* response', () => {
  test('HEAD /trips/anything responds with X-Robots-Tag: noindex, nofollow', async ({ baseURL }) => {
    if (!baseURL) test.skip(true, 'no baseURL')
    const ctx = await pwRequest.newContext({ baseURL })
    const res = await ctx.get(tripRoute('not_a_real_trip'))
    const xrt = res.headers()['x-robots-tag']
    expect(xrt, 'X-Robots-Tag header must be set for /trips/*').toBeTruthy()
    expect(xrt.toLowerCase()).toMatch(/noindex/)
    expect(xrt.toLowerCase()).toMatch(/nofollow/)
    await ctx.dispose()
  })

  // Sanity: campsite routes should NOT carry the noindex header — the
  // rule must be confined to /trips/*.
  test('non-trip routes are NOT noindexed by the headers rule', async ({ baseURL }) => {
    if (!baseURL) test.skip(true, 'no baseURL')
    const ctx = await pwRequest.newContext({ baseURL })
    const res = await ctx.get('/')
    const xrt = res.headers()['x-robots-tag']
    // OK if the header is absent OR if it doesn't contain noindex.
    if (xrt) {
      expect(xrt.toLowerCase()).not.toMatch(/noindex/)
    }
    await ctx.dispose()
  })
})

void campsiteRoute // silence unused-import lint when the spec compiles without referencing every helper
