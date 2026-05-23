// T1.7 — determinism (WS-1.4).
//
// Identical inputs → deep-equal outputs. The engine must not consult Date,
// Math.random, process.env, or any I/O. We invoke `generate` repeatedly
// across the same inputs (and across several mutation-attempted clones of
// the input) and assert strict deep-equality on every output.

import { describe, it, expect } from 'vitest'
import { generate } from '../index'
import { baseAmenities } from './_helpers'
import type { Amenities, TripStyle } from '../../db/types'

const PROFILES: { label: string; style: TripStyle; a: Amenities }[] = [
  { label: 'car / baseline', style: 'car', a: baseAmenities() },
  {
    label: 'backpacking / baseline',
    style: 'backpacking',
    a: baseAmenities(),
  },
  {
    label: 'car / no fires + no water',
    style: 'car',
    a: baseAmenities({ fireRings: false, potableWater: false }),
  },
  {
    label: 'backpacking / bear country + no toilets',
    style: 'backpacking',
    a: baseAmenities({
      bearLockers: false,
      bearCountry: true,
      toilets: 'none',
    }),
  },
  {
    label: 'car / all amenities removed',
    style: 'car',
    a: baseAmenities({
      potableWater: false,
      toilets: 'none',
      showers: false,
      electricity: false,
      fireRings: false,
      firewoodAvailable: false,
      picnicTables: false,
      bearLockers: false,
      bearCountry: true,
      trashService: false,
      dumpStation: false,
      cellService: 'none',
      accessLevel: 'walk-in',
    }),
  },
]

describe('T1.7 determinism', () => {
  describe.each(PROFILES)('$label', ({ style, a }) => {
    it('two back-to-back calls are deep-equal', () => {
      const a1 = generate(style, a)
      const a2 = generate(style, a)
      expect(a2).toEqual(a1)
    })

    it('ten calls produce ten deep-equal outputs', () => {
      const ref = generate(style, a)
      for (let i = 0; i < 10; i++) {
        expect(generate(style, a)).toEqual(ref)
      }
    })

    it('does not mutate the input amenities object', () => {
      const snapshot = structuredClone(a)
      generate(style, a)
      expect(a).toEqual(snapshot)
    })

    it('calls with deep-cloned amenities produce deep-equal outputs', () => {
      const ref = generate(style, a)
      const cloned = generate(style, structuredClone(a))
      expect(cloned).toEqual(ref)
    })
  })

  it('different inputs CAN produce different outputs (sanity)', () => {
    const car = generate('car', baseAmenities())
    const bp = generate('backpacking', baseAmenities())
    // Templates differ by style → not deep-equal.
    expect(bp).not.toEqual(car)
  })

  it('no item field looks like a timestamp (sortOrder is a small int)', () => {
    const list = generate('car', baseAmenities())
    for (const it of list) {
      expect(Number.isInteger(it.sortOrder)).toBe(true)
      // sortOrder must not look like Date.now() (>= 1e12).
      expect(Math.abs(it.sortOrder)).toBeLessThan(1e6)
    }
  })
})
