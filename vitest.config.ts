import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// WS-0 test config. Mostly node environment (pure logic, types, in-memory
// storage), but a couple of suites (identity stub w/ vi.mock('next/headers'))
// don't need jsdom either — node is fine for the whole suite at WS-0.
// WS-4/5/6 may want to layer a jsdom project later.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    // The Prisma schema test shells out to `pnpm exec prisma validate`,
    // which on a cold pnpm cache reliably takes 5–7 seconds. Other tests
    // remain fast — the higher timeout costs nothing on green runs.
    testTimeout: 20000,
    include: [
      '**/__tests__/**/*.test.ts',
      '**/__tests__/**/*.test.tsx',
      '**/*.test.ts',
      '**/*.test.tsx',
    ],
    exclude: [
      'node_modules/**',
      '.next/**',
      // shared contract suites are imported by sibling .test.ts files;
      // they themselves are not standalone tests.
      '**/__tests__/storage.contract.ts',
      '**/__tests__/actions.contract.ts',
    ],
  },
})
