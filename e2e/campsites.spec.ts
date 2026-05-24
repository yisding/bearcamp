// WS-5 e2e — campsite browse, detail, and instant-navigation flows.
//
// Covers:
//   T5.4 browse e2e: /campsites lists seed entries; ?q= filters; pagination;
//        skeleton → results; zero-results query shows EmptyState, not a crash.
//   T5.5 detail e2e: /campsites/[id] shows amenities + StylePicker
//        placeholder; bad id → not-found page.
//   T5.6 instant() e2e: instant('/campsites') returns a valid instant shell
//        from /; instant('/campsites/[id]') returns one from /campsites.
//
// Runs against the WS-3 seed catalog (services.ts default is `prisma + seed`
// post-WS-8.1). The CI e2e job seeds the DB via `prisma db seed` before
// booting `next start`.

import { test, expect } from '@playwright/test'
import { instant } from '@next/playwright'
import { loadSeed } from '../lib/campsites/seed'
import { SEARCH_PAGE_SIZE_DEFAULT, SEARCH_PAGE_SIZE_MAX } from '../lib/limits'
import { campsite as campsiteRoute, campsites as campsitesRoute } from '../lib/routes'

// Helpers ----------------------------------------------------------------

// Sort by name to mirror the Prisma search ordering (`orderBy: { name: 'asc' }`
// in `lib/db/campsites.ts`). Anything we expect to be visible without paging
// must come from the first SEARCH_PAGE_SIZE_DEFAULT entries; otherwise the
// browse list shows page 1 and the assertion misses the row.
const seed = loadSeed()
const seedByName = [...seed].sort((a, b) => a.name.localeCompare(b.name))

function pickFirstPageSeedWithAgency() {
  const c = seedByName.slice(0, SEARCH_PAGE_SIZE_DEFAULT).find(
    (f) => f.agency && f.state,
  )
  if (!c) throw new Error('expected a page-1 seed entry with agency + state')
  return c
}

// "furnace" matches exactly one seed name ("Furnace Creek Campground") and
// excludes the otherwise-prominent Yosemite Valley entries — a clean
// positive/negative pair for the filter assertion.
const UNIQUE_QUERY = 'furnace'
const UNIQUE_QUERY_MATCH_RE = /furnace creek/i
const UNIQUE_QUERY_EXCLUDED_RE = /upper pines/i

const ZERO_RESULT_QUERY = '__no_such_campsite_anywhere_xyz'

// ------------------------------------------------------------------------

test.describe('T5.4 browse — /campsites', () => {
  test('lists seed campsites', async ({ page }) => {
    await page.goto('/campsites')
    // Page title / heading must be present (PageHeader).
    await expect(page.getByRole('heading', { name: /campsites?/i })).toBeVisible()
    // First alphabetical seed name must appear on page 1 (Prisma sorts by name).
    const sample = seedByName[0]
    await expect(page.getByRole('link', { name: new RegExp(sample.name, 'i') })).toBeVisible()
  })

  test('?q= filters the result list', async ({ page }) => {
    // `UNIQUE_QUERY` matches exactly one seed entry by name; the excluded
    // pattern names a well-known seed entry that is NOT a substring match
    // for the query (so the filter is observable in the rendered list).
    await page.goto(campsitesRoute({ q: UNIQUE_QUERY }))
    await expect(
      page.getByRole('link', { name: UNIQUE_QUERY_MATCH_RE }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: UNIQUE_QUERY_EXCLUDED_RE }),
    ).toHaveCount(0)
  })

  test('pagination — pageSize cap is enforced server-side (DR-23)', async ({ page }) => {
    // The server clamps pageSize to SEARCH_PAGE_SIZE_MAX. Even if a user
    // crafts ?pageSize=500, no more than SEARCH_PAGE_SIZE_MAX cards may
    // render. We import the cap from lib/limits to avoid restating it
    // here (DR-43 / T0.15 — the page-size literal lives in one place).
    await page.goto(`/campsites?pageSize=500`)
    // Loose upper bound: page renders at most SEARCH_PAGE_SIZE_MAX cards.
    // We assert with a generous count to avoid false positives from chrome
    // links — the assertion is about the *list* container.
    const cards = page.locator('[data-slot="campsite-card"]')
    const count = await cards.count()
    expect(count).toBeLessThanOrEqual(SEARCH_PAGE_SIZE_MAX)
  })

  test('skeleton renders before results stream in', async ({ page }) => {
    // The browse page must wrap the streamed list in Suspense with a
    // ListSkeleton fallback. On a cold cache the skeleton's role=status
    // marker should be findable at least briefly.
    const response = await page.goto('/campsites', { waitUntil: 'commit' })
    expect(response).not.toBeNull()
    // We can't reliably catch the fallback after streaming completes, but
    // the *static shell* (page-load entry) must include the role=status
    // marker — see instant.md "page-loads and client navs produce
    // different shells".
    await instant(page, async () => {
      await expect(page.getByRole('status')).toBeVisible()
    })
  })

  test('zero-results query shows EmptyState (not a crash)', async ({ page }) => {
    await page.goto(campsitesRoute({ q: ZERO_RESULT_QUERY }))
    // EmptyState renders a div with data-slot="empty-state"; the title
    // should mention "no campsites" / "no matches" / similar. We assert
    // both the slot marker and a human-readable signal.
    await expect(page.locator('[data-slot="empty-state"]')).toBeVisible()
    await expect(page.getByText(/no\s+(campsites?|matches?|results?)/i)).toBeVisible()
    // Hard regression guard: zero results MUST NOT render the Next.js
    // default 500 error page or notFound chrome.
    await expect(page.locator('text=/this page could not be found/i')).toHaveCount(0)
    await expect(page.locator('text=/internal server error/i')).toHaveCount(0)
  })
})

// ------------------------------------------------------------------------

test.describe('T5.5 detail — /campsites/[id]', () => {
  test('shows amenities and StylePicker placeholder for a valid id', async ({ page }) => {
    const c = pickFirstPageSeedWithAgency()
    await page.goto(campsiteRoute(c.id))

    // Heading is the campsite name (h1 via PageHeader).
    await expect(page.getByRole('heading', { name: c.name })).toBeVisible()

    // Agency + state surface somewhere on the detail page.
    await expect(page.getByText(new RegExp(c.agency!, 'i'))).toBeVisible()

    // Amenity grid is present — at least one labeled amenity from the
    // seed entry appears when the entry has potable water.
    if (c.amenities.potableWater) {
      await expect(page.getByText(/potable\s*water|drinking\s*water/i)).toBeVisible()
    }

    // StylePicker (seam I-1). WS-8.2 wired the real WS-6 component in;
    // it renders with the `[data-slot="style-picker"]` marker.
    await expect(
      page.locator('[data-slot="style-picker"]'),
    ).toBeVisible()
  })

  test('bad id renders the not-found page', async ({ page }) => {
    // app/campsites/[id]/not-found.tsx must surface a 404 message and the
    // response should be 404. The id passes the schema's source-prefix
    // regex (`seed|fixture|ridb|osm`) but does not exist in the catalog.
    const res = await page.goto('/campsites/seed:does-not-exist', {
      waitUntil: 'commit',
    })
    expect(res).not.toBeNull()
    expect(res!.status()).toBe(404)
    await expect(page.getByText(/not found|couldn['']t find/i)).toBeVisible()
  })
})

// ------------------------------------------------------------------------

test.describe('T5.6 instant() — prefetched static shells', () => {
  test('/ → /campsites — the static shell appears instantly on client nav', async ({ page }) => {
    await page.goto('/')

    await instant(page, async () => {
      // Click the prominent search-entry link on the landing page that
      // points at /campsites. The landing page's pitch + CTA is a
      // WS-5.1 contract.
      await page.click('a[href="/campsites"]')

      // Static parts of /campsites must be in the prefetched shell:
      //   - the PageHeader heading
      //   - the search bar (a Client Component, statically rendered)
      //   - the ListSkeleton fallback (role=status) while results stream
      await expect(page.getByRole('heading', { name: /campsites?/i })).toBeVisible()
      await expect(page.getByRole('searchbox')).toBeVisible()
      await expect(page.getByRole('status')).toBeVisible()
    })

    // After instant() resolves the dynamic content streams in. Pick the
    // first alphabetical entry so it is guaranteed on page 1 of the
    // name-sorted Prisma result.
    await expect(
      page.getByRole('link', { name: new RegExp(seedByName[0].name, 'i') }),
    ).toBeVisible()
  })

  test('/campsites → /campsites/[id] — detail shell appears instantly', async ({ page }) => {
    const c = pickFirstPageSeedWithAgency()
    await page.goto('/campsites')

    await instant(page, async () => {
      await page.click(`a[href="${campsiteRoute(c.id)}"]`)

      // Static (or cached via 'use cache' + cacheLife('days')) parts of
      // the detail page render in the instant shell:
      //   - the campsite name heading
      //   - the AmenityGrid section
      //   - the StylePicker
      await expect(page.getByRole('heading', { name: c.name })).toBeVisible()
      await expect(
        page.locator('[data-slot="amenity-grid"], [data-testid="amenity-grid"]'),
      ).toBeVisible()
      await expect(
        page.locator('[data-slot="style-picker"]'),
      ).toBeVisible()
    })
  })
})
