import { defineConfig, devices } from '@playwright/test'

// Playwright config (merged from WS-5 and WS-6).
//
// Drives `pnpm build && pnpm start` because both `unstable_instant`
// validation and the trip-flow tests need the production build
// (static shell + real Server Actions). Local runs need this config;
// CI activates the same.
//
// Note: this repo's in-memory storage is process-local
// (lib/db/storage.memory.ts uses a module-singleton). Local memory runs
// stay on one worker. CI runs the Prisma backend, so files can run on two
// workers without splitting process-local state.

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000)
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`
const IS_CI = !!process.env.CI
const USE_PRISMA = process.env.BEARCAMP_BACKEND === 'prisma'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: IS_CI && USE_PRISMA ? 2 : 1,
  forbidOnly: IS_CI,
  retries: 0,
  reporter: IS_CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !IS_CI,
    timeout: 180_000,
  },
})
