import { defineConfig, devices } from '@playwright/test'

// WS-5 e2e harness.
//
// The static-shell and instant() tests require a production build to
// validate Cache Components output. CI is expected to run
// `pnpm build && pnpm start` and then `pnpm exec playwright test`; the
// `webServer` block below does this automatically for local runs.
//
// Tests are kept tiny on purpose — Cache Components / unstable_instant
// validation runs at dev/build time and provides the structural
// guarantee. The e2e specs cover the user-visible behavior that depends
// on real navigation (the search-filter flow, 404 routing, and the
// `instant()` assertion that the prefetched shell is what we expect).

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000)
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // `next start` requires a prior `next build`; the CI lane does the
    // build separately and starts the server. For local convenience we
    // run them sequentially when invoked directly.
    command: 'pnpm build && pnpm start --port ' + PORT,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
