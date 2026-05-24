// T6.8 — Trip Experience UI end-to-end flow (WS-6).
//
// Covers the full user flow against the in-memory backend + stub actions:
//   create from fixture → owner pre-claims items before sharing →
//   add custom item → copy link → second context joins →
//   joiner sees owner's claims under "who's bringing what" (G2) →
//   joiner claims → shortfall drops → 3rd participant joins →
//   sleeping-bag `needed` grows, stove (shared) stays constant.
//
// Also covers:
//   T6.10 — visiting an unknown /trips/<id> renders the not-found page.
//   T6.11 — server-rendered HTML contains
//           <meta name="robots" content="noindex,nofollow">.
//   T6.13 (parallel context) — after the owner deletes the trip, a parallel
//           context with a `bc_participant` cookie sitting on the trip page
//           hits its next router.refresh() and renders the not-found page
//           (unified copy from T6.11; review-3 DR-47).
//
// NOTES:
//   - Two cookie-isolated contexts (owner + joiner) are necessary to drive
//     the bc_owner vs bc_participant cookies (DR-3).
//   - Selectors use roles + accessible names per Cache Components +
//     `getByRole`-visibility-aware guidance in
//     node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md.

import { test, expect } from '@playwright/test'
import { campsite as campsiteRoute, trip as tripRoute } from '../lib/routes'

// Pick a seed campsite by stable id (post-WS-8.1: prisma + seed is default).
const SEED_CAMPSITE_ID = 'seed:upper-pines-campground-ca'

test.describe('T6.8 — full trip flow', () => {
  test('create → pre-claim → add custom → share → join → claim → 3rd participant', async ({
    browser,
  }) => {
    // ---- Owner context ----------------------------------------------------
    const ownerCtx = await browser.newContext()
    const ownerPage = await ownerCtx.newPage()

    // 1) Owner lands on the campsite detail, picks a style, and creates trip.
    await ownerPage.goto(campsiteRoute(SEED_CAMPSITE_ID))
    // Pick style "car". StylePicker renders both options as
    // radios/buttons/labels — we accept any.
    const car =
      (await ownerPage.getByRole('radio', { name: /car/i }).first().elementHandle()) ??
      (await ownerPage.getByRole('button', { name: /car/i }).first().elementHandle()) ??
      (await ownerPage.getByLabel(/car/i).first().elementHandle())
    await car!.click()
    await ownerPage
      .getByRole('button', { name: /create|start|go|plan/i })
      .first()
      .click()

    // 2) Land on the trip page.
    await ownerPage.waitForURL(/\/trips\/[^/]+$/)
    const ownerTripUrl = ownerPage.url()

    // 3) Owner pre-claims a per_person item (Sleeping bag) before sharing.
    //    The PackingList renders ItemRows; the claim affordance must surface
    //    by accessible name on each row.
    const sleepingBagRow = ownerPage.getByRole('listitem', {
      name: /sleeping bag/i,
    })
    // Fallback: locate row by text containment.
    const sleepingBag = (await sleepingBagRow.count())
      ? sleepingBagRow
      : ownerPage
          .locator('[data-slot="item-row"], li')
          .filter({ hasText: /sleeping bag/i })
          .first()
    await sleepingBag
      .getByRole('button', { name: /claim|i['’]ll\s+bring|bring/i })
      .first()
      .click()
    // If a qty form appears, just confirm.
    const confirmIfPresent = sleepingBag.getByRole('button', {
      name: /confirm|save/i,
    })
    if (await confirmIfPresent.count()) await confirmIfPresent.first().click()

    // 4) Owner adds a custom item ("Marshmallows", Personal & Misc).
    await ownerPage
      .getByRole('button', { name: /add\s+(custom\s+)?item/i })
      .first()
      .click()
    await ownerPage.getByLabel(/name/i).first().fill('Marshmallows')
    // Category + scope controls may be select or radio — pick "Personal &
    // Misc" + "shared".
    const cat = ownerPage.getByLabel(/category/i)
    if (await cat.count()) {
      await cat
        .first()
        .selectOption({ label: /personal\s*&\s*misc/i.source })
        .catch(async () => {
          await cat.first().selectOption('Personal & Misc')
        })
    }
    await ownerPage
      .getByRole('button', { name: /save|add|create/i })
      .first()
      .click()
    await expect(
      ownerPage.locator('text=/marshmallows/i').first(),
    ).toBeVisible()

    // 5) Owner copies the share link.
    await ownerPage
      .getByRole('button', { name: /copy\s+link|share/i })
      .first()
      .click()
    // The clipboard is restricted in CI; we just ensure the toast surfaces.
    await expect(
      ownerPage.locator('text=/copied|link\s+copied/i').first(),
    ).toBeVisible()

    // ---- Joiner context ---------------------------------------------------
    const joinerCtx = await browser.newContext()
    const joinerPage = await joinerCtx.newPage()
    await joinerPage.goto(ownerTripUrl)

    // 6) Join dialog must be shown.
    const joinDialog = joinerPage.getByRole('dialog')
    await expect(joinDialog).toBeVisible()
    await joinDialog.getByLabel(/name/i).fill('Bob')
    await joinDialog
      .getByRole('button', { name: /join|i['’]m\s+in|continue/i })
      .click()
    await expect(joinDialog).toBeHidden()

    // 7) Joiner sees owner's claim under "Who's bringing what" (G2).
    const whoSection = joinerPage.getByRole('region', {
      name: /who['’]s\s+bringing|bringing/i,
    })
    await expect(whoSection).toBeVisible()
    await expect(whoSection.getByText(/sleeping bag/i)).toBeVisible()

    // 8) Joiner claims the Stove.
    const stoveRow = joinerPage
      .locator('[data-slot="item-row"], li')
      .filter({ hasText: /stove/i })
      .first()
    await stoveRow
      .getByRole('button', { name: /claim|i['’]ll\s+bring|bring/i })
      .first()
      .click()
    const stoveConfirm = stoveRow.getByRole('button', {
      name: /confirm|save/i,
    })
    if (await stoveConfirm.count()) await stoveConfirm.first().click()

    // 9) Shortfall drops — Stove disappears from "Still needed" or shows as
    //    covered. We assert that Stove is no longer under StillNeeded.
    const stillNeeded = joinerPage.getByRole('region', {
      name: /still\s+needed/i,
    })
    await expect(stillNeeded.getByText(/stove/i)).toHaveCount(0)

    // ---- Third participant ------------------------------------------------
    const thirdCtx = await browser.newContext()
    const thirdPage = await thirdCtx.newPage()
    await thirdPage.goto(ownerTripUrl)
    await thirdPage.getByRole('dialog').getByLabel(/name/i).fill('Carol')
    await thirdPage
      .getByRole('dialog')
      .getByRole('button', { name: /join|i['’]m\s+in|continue/i })
      .click()

    // 10) Sleeping bag (per_person) `needed` grows to 3; stove (shared)
    //     stays at 1. Joiner refreshes and the numbers update.
    await joinerPage.reload()
    const sleepingBagRow2 = joinerPage
      .locator('[data-slot="item-row"], li')
      .filter({ hasText: /sleeping bag/i })
      .first()
    // "1 of 3" or "1/3" — accept either.
    await expect(sleepingBagRow2).toContainText(/1\s*(of|\/)\s*3/i)

    // Stove (shared) — owner claim filled the only one. It should NOT show in
    // Still needed and its "needed" stays 1.
    const stoveCovered = joinerPage
      .locator('[data-slot="item-row"], li')
      .filter({ hasText: /stove/i })
      .first()
    await expect(stoveCovered).toContainText(/1\s*(of|\/)\s*1/i)

    await ownerCtx.close()
    await joinerCtx.close()
    await thirdCtx.close()
  })
})

test.describe('T6.10 — unknown trip renders not-found', () => {
  test('unknown id renders the not-found page (unified copy)', async ({
    page,
  }) => {
    const res = await page.goto(tripRoute('trip_no_such_id'))
    expect(res?.status()).toBe(404)
    // Unified deleted/unknown copy (DR-47): mentions both possibilities.
    await expect(
      page.locator('text=/doesn[’\']t\\s+exist|deleted/i').first(),
    ).toBeVisible()
  })
})

test.describe('T6.11 — trip page is non-indexable (DR-17)', () => {
  test('HTML contains <meta name="robots" content="noindex,nofollow">', async ({
    browser,
  }) => {
    // Build a trip first so we have a valid id.
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(campsiteRoute(SEED_CAMPSITE_ID))
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

    // Re-fetch the raw HTML to assert SSR'd <meta> tag.
    const res = await page.goto(url, { waitUntil: 'commit' })
    const html = (await res!.text()) ?? ''
    expect(html).toMatch(
      /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex[^"']*["']/i,
    )
    expect(html).toMatch(
      /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*nofollow[^"']*["']/i,
    )

    await ctx.close()
  })
})

test.describe('T6.13 — deleted trip → parallel context sees not-found on refresh (DR-47)', () => {
  test('participant cookie + deleted trip + refresh → not-found page', async ({
    browser,
  }) => {
    // Owner creates a trip.
    const ownerCtx = await browser.newContext()
    const ownerPage = await ownerCtx.newPage()
    await ownerPage.goto(campsiteRoute(SEED_CAMPSITE_ID))
    const car =
      (await ownerPage.getByRole('radio', { name: /car/i }).first().elementHandle()) ??
      (await ownerPage.getByLabel(/car/i).first().elementHandle())
    await car!.click()
    await ownerPage
      .getByRole('button', { name: /create|start|go|plan/i })
      .first()
      .click()
    await ownerPage.waitForURL(/\/trips\/[^/]+$/)
    const tripUrl = ownerPage.url()

    // Participant joins from a 2nd context (gets bc_participant cookie).
    const partCtx = await browser.newContext()
    const partPage = await partCtx.newPage()
    await partPage.goto(tripUrl)
    await partPage.getByRole('dialog').getByLabel(/name/i).fill('Sam')
    await partPage
      .getByRole('dialog')
      .getByRole('button', { name: /join|i['’]m\s+in|continue/i })
      .click()
    await expect(partPage.getByRole('dialog')).toBeHidden()

    // Owner deletes the trip via TripSettings (danger zone).
    const settingsBtn = ownerPage.getByRole('button', {
      name: /settings|manage|trip\s+settings/i,
    })
    if (await settingsBtn.count()) await settingsBtn.first().click()
    await ownerPage
      .getByRole('button', { name: /delete\s+trip/i })
      .first()
      .click()
    const typeToConfirm = ownerPage.getByRole('textbox', {
      name: /type|confirm/i,
    })
    if (await typeToConfirm.count()) {
      // Fill with the trip name shown in the page header.
      const nameH1 = await ownerPage
        .getByRole('heading', { level: 1 })
        .first()
        .innerText()
      await typeToConfirm.first().fill(nameH1.trim())
    }
    await ownerPage
      .getByRole('button', {
        name: /confirm\s+delete|yes,?\s+delete|delete\s+forever|i\s+understand/i,
      })
      .first()
      .click()
    await ownerPage.waitForURL(/\/$/, { timeout: 10_000 })

    // Participant refreshes — the page must render not-found, not crash.
    const res = await partPage.reload()
    expect(res?.status()).toBe(404)
    await expect(
      partPage.locator('text=/doesn[’\']t\\s+exist|deleted/i').first(),
    ).toBeVisible()

    await ownerCtx.close()
    await partCtx.close()
  })
})
