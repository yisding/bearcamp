// T1.1 — `requiredQty` coverage (verify-only; WS-0 owns the implementation
// per DR-1/B1). If a defect is found here, route it back to WS-0 — do NOT
// patch quantities.ts from WS-1. This file just confirms behaviour matches
// plan/packing-engine.md and review-2 DR-21.
//
// Covers, per acceptance bullet T1.1:
//   - per_person × n
//   - per_tent = ceil(n / tentCapacity), tentCapacity ∈ {2 (default), 6 (family tent)}
//   - shared = baseQty
//   - n ≤ 0 floors to 1
//   - tentCapacity ≤ 0 floors to 1

import { describe, it, expect } from 'vitest'
import { requiredQty, TENT_CAPACITY } from '../index'
import { asTripItem } from './_helpers'

describe('T1.1 requiredQty', () => {
  describe('per_person scope multiplies linearly with n', () => {
    const bag = asTripItem({
      category: 'Sleep',
      name: 'Sleeping bag',
      scope: 'per_person',
      baseQty: 1,
    })

    it.each([
      [1, 1],
      [2, 2],
      [4, 4],
      [7, 7],
    ])('n=%i → %i', (n, expected) => {
      expect(requiredQty(bag, n)).toBe(expected)
    })

    it('respects baseQty > 1', () => {
      const item = asTripItem({
        category: 'Water',
        name: 'Water bottle',
        scope: 'per_person',
        baseQty: 2,
      })
      expect(requiredQty(item, 3)).toBe(6)
    })
  })

  describe('per_tent scope uses ceil(n / tentCapacity)', () => {
    const tent = asTripItem({
      category: 'Shelter',
      name: 'Tent',
      scope: 'per_tent',
      baseQty: 1,
    })

    it('defaults tentCapacity to the WS-0 TENT_CAPACITY constant (2)', () => {
      expect(TENT_CAPACITY).toBe(2)
      // n=1..2 → 1 tent; n=3..4 → 2 tents; n=5..6 → 3 tents
      expect(requiredQty(tent, 1)).toBe(1)
      expect(requiredQty(tent, 2)).toBe(1)
      expect(requiredQty(tent, 3)).toBe(2)
      expect(requiredQty(tent, 4)).toBe(2)
      expect(requiredQty(tent, 5)).toBe(3)
      expect(requiredQty(tent, 6)).toBe(3)
    })

    it('honors tentCapacity=2 explicitly (matches default)', () => {
      expect(requiredQty(tent, 3, 2)).toBe(2)
      expect(requiredQty(tent, 6, 2)).toBe(3)
    })

    it('honors tentCapacity=6 (family tent — review-2 DR-21 G-tent)', () => {
      // One six-person tent for the whole group → 1 tent.
      expect(requiredQty(tent, 1, 6)).toBe(1)
      expect(requiredQty(tent, 4, 6)).toBe(1)
      expect(requiredQty(tent, 6, 6)).toBe(1)
      // Spill into a second tent.
      expect(requiredQty(tent, 7, 6)).toBe(2)
      expect(requiredQty(tent, 12, 6)).toBe(2)
      expect(requiredQty(tent, 13, 6)).toBe(3)
    })

    it('respects baseQty (e.g. baseQty=2 stakes set per tent)', () => {
      const stakes = asTripItem({
        category: 'Shelter',
        name: 'Tent stakes set',
        scope: 'per_tent',
        baseQty: 2,
      })
      // 4 people, cap 2 → 2 tents → 2 * 2 = 4 sets
      expect(requiredQty(stakes, 4, 2)).toBe(4)
    })
  })

  describe('shared scope is constant — equal to baseQty', () => {
    it('baseQty=1 → 1 regardless of n', () => {
      const stove = asTripItem({
        category: 'Kitchen',
        name: 'Stove',
        scope: 'shared',
        baseQty: 1,
      })
      for (const n of [1, 2, 4, 8, 50]) {
        expect(requiredQty(stove, n)).toBe(1)
      }
    })

    it('baseQty=3 → 3 regardless of n / tentCapacity', () => {
      const trash = asTripItem({
        category: 'Hygiene',
        name: 'Trash bags',
        scope: 'shared',
        baseQty: 3,
      })
      expect(requiredQty(trash, 1)).toBe(3)
      expect(requiredQty(trash, 10)).toBe(3)
      expect(requiredQty(trash, 10, 6)).toBe(3)
    })
  })

  describe('floors (DR-21 input hygiene)', () => {
    const bag = asTripItem({
      category: 'Sleep',
      name: 'Sleeping bag',
      scope: 'per_person',
      baseQty: 1,
    })
    const tent = asTripItem({
      category: 'Shelter',
      name: 'Tent',
      scope: 'per_tent',
      baseQty: 1,
    })

    it('participantCount ≤ 0 is treated as 1 (solo list stays sensible)', () => {
      expect(requiredQty(bag, 0)).toBe(1)
      expect(requiredQty(bag, -3)).toBe(1)
      expect(requiredQty(tent, 0)).toBe(1)
      expect(requiredQty(tent, -10)).toBe(1)
    })

    it('tentCapacity ≤ 0 is treated as 1 (per-tent never divides by zero)', () => {
      // cap clamps to 1 → 1 tent per person.
      expect(requiredQty(tent, 4, 0)).toBe(4)
      expect(requiredQty(tent, 3, -5)).toBe(3)
    })

    it('both n and cap clamped together stay sensible', () => {
      expect(requiredQty(tent, 0, 0)).toBe(1)
      expect(requiredQty(bag, -1, -1)).toBe(1)
    })
  })
})
