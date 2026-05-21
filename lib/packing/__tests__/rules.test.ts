// T1.3 — rules idempotency (WS-1.3).
//
// Running the amenity-rule pipeline twice must deep-equal running it once.
// Each rule looks up by `name` before adding, and mutates in place for
// "adjust" operations. We import `generate` from the frozen barrel — running
// it twice means: pass its output back through the same pipeline by
// re-applying the rules to an already-rule-processed list.
//
// To exercise the pipeline directly (independent of `generate`'s template
// step), we also pull `applyRules` from the WS-1 rules module. That module
// won't exist in the red phase — expected import failure.

import { describe, it, expect } from 'vitest'
import { generate } from '../index'
// rules.ts (WS-1.3) exports `applyRules(items, amenities)`.
import { applyRules } from '../rules'
import { baseAmenities } from './_helpers'
import type { Amenities, TripItem } from '../../db/types'

// A representative slate of amenity profiles, each hitting a different branch.
// Idempotency must hold for ALL of them — running rules twice == once.
const AMENITY_PROFILES: { label: string; a: Amenities }[] = [
  { label: 'baseline (all true)', a: baseAmenities() },
  {
    label: 'no potable water',
    a: baseAmenities({ potableWater: false }),
  },
  {
    label: 'toilets none',
    a: baseAmenities({ toilets: 'none' }),
  },
  {
    label: 'toilets flush',
    a: baseAmenities({ toilets: 'flush' }),
  },
  {
    label: 'bear lockers',
    a: baseAmenities({ bearLockers: true, bearCountry: true }),
  },
  {
    label: 'bear country no lockers',
    a: baseAmenities({ bearLockers: false, bearCountry: true }),
  },
  {
    label: 'no fire rings',
    a: baseAmenities({ fireRings: false, firewoodAvailable: false }),
  },
  {
    label: 'no electricity',
    a: baseAmenities({ electricity: false }),
  },
  {
    label: 'cell none',
    a: baseAmenities({ cellService: 'none' }),
  },
  {
    label: 'no trash service',
    a: baseAmenities({ trashService: false }),
  },
]

describe('T1.3 rule idempotency', () => {
  describe.each(AMENITY_PROFILES)('profile: $label', ({ a }) => {
    it('generate(style, a) is stable when rules re-run (car)', () => {
      const once = generate('car', a)
      const twice = applyRules(structuredClone(once), a) as TripItem[]
      expect(twice).toEqual(once)
    })

    it('generate(style, a) is stable when rules re-run (backpacking)', () => {
      const once = generate('backpacking', a)
      const twice = applyRules(structuredClone(once), a) as TripItem[]
      expect(twice).toEqual(once)
    })

    it('applying rules N times still equals applying once (N=3, car)', () => {
      let items = generate('car', a)
      const ref = structuredClone(items)
      items = applyRules(items, a) as TripItem[]
      items = applyRules(items, a) as TripItem[]
      items = applyRules(items, a) as TripItem[]
      expect(items).toEqual(ref)
    })
  })

  it('no duplicate item names ever appear after one pass', () => {
    for (const { a } of AMENITY_PROFILES) {
      for (const style of ['car', 'backpacking'] as const) {
        const items = generate(style, a)
        const names = items.map((i) => i.name)
        const dupes = names.filter((n, i) => names.indexOf(n) !== i)
        expect(dupes, `${style}/${JSON.stringify(a)} dupes`).toEqual([])
      }
    }
  })
})
