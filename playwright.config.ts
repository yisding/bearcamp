import { defineConfig, devices } from '@playwright/test'

// Playwright config (merged from WS-5 and WS-6).
//
// Drives `pnpm build && pnpm start` because both `unstable_instant`
// validation and the trip-flow tests need the production build
// (static shell + real Server Actions). Local runs need this config;
// CI activates the same.
//
// Note: this repo's in-memory storage is process-local
// (lib/db/storage.memory.ts uses a module-singleton). To keep state
// consistent across tests within a run, do NOT enable `fullyParallel`
// while the in-memory backend is in use. WS-8.1 flips to Prisma/Neon,
// after which `fullyParallel` becomes safe.

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000)
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
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
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
