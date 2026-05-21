// T4.3 — `components/app/index.ts` is the I-6 frozen barrel that WS-5/WS-6
// import. Every documented symbol must be exported by name. We do an
// "import each" test against `@/components/app` so adding/renaming an
// export forces the contract to be revisited.
//
// Set is intentionally narrower than the implementation modules (Header is
// included because the root layout in T4.4 expects it via the barrel and
// because WS-5/WS-6 should not deep-import).

import { describe, it, expect } from 'vitest'
import * as appBarrel from '@/components/app'

const REQUIRED_EXPORTS = [
  'Header',
  'PageHeader',
  'EmptyState',
  'ErrorState',
  'ListSkeleton',
  'Section',
] as const

describe('T4.3 components/app barrel (I-6 frozen surface)', () => {
  it.each(REQUIRED_EXPORTS)('exports %s', (name) => {
    expect(appBarrel).toHaveProperty(name)
    expect((appBarrel as Record<string, unknown>)[name]).toBeDefined()
  })

  it('every required export is a function or React component (callable)', () => {
    for (const name of REQUIRED_EXPORTS) {
      const v = (appBarrel as Record<string, unknown>)[name]
      expect(typeof v === 'function' || typeof v === 'object').toBe(true)
    }
  })
})
