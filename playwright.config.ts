// WS-6 — Playwright config (minimal).
//
// Drives `pnpm build && pnpm start` because the `unstable_instant` validation
// and the trip-flow tests need the production build (static shell + real
// Server Actions). Local runs need this config; CI activates the same.
//
// Note: this repo's in-memory storage is process-local (lib/db/storage.memory.ts
// uses a module-singleton). Running each test in fresh worker scope keeps
// state isolated; do NOT enable `fullyParallel`.

import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  // Single worker so the in-memory backend stays consistent within a test run.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
