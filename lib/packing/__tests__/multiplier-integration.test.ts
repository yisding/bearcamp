// T1.6 — generate + requiredQty integration (WS-1.2 / WS-1.4).
//
// Sleeping bag and sleeping pad scale linearly with participant count;
// stove and water filter stay constant. This pins both:
//   - the engine emits the right scopes for these items, and
//   - requiredQty multiplies them per plan/packing-engine.md.

import { describe, it, expect } from 'vitest'
import { generate, requiredQty } from '../index'
import { baseAmenities, findByName } from './_helpers'

describe('T1.6 multiplier integration', () => {
  // Backpacking exercises both per_person sleeping gear AND a shared water
  // filter (which is BP-only per the template).
  const a = baseAmenities()
  const bp = generate('backpacking', a)
  const cc = generate('car', a)

  it('Sleeping bag scales 1→1, 2→2, 4→4, 8→8 (per_person)', () => {
    const bag = findByName(bp, /sleeping bag/i)
    expect(bag, 'Sleeping bag missing from BP list').toBeDefined()
    expect(bag!.scope).toBe('per_person')
    for (const n of [1, 2, 4, 8]) {
      expect(requiredQty(bag!, n)).toBe(n * bag!.baseQty)
    }
  })

  it('Sleeping pad scales linearly (per_person)', () => {
    const pad = findByName(bp, /sleeping pad/i)
    expect(pad, 'Sleeping pad missing from BP list').toBeDefined()
    expect(pad!.scope).toBe('per_person')
    expect(requiredQty(pad!, 1)).toBe(1 * pad!.baseQty)
    expect(requiredQty(pad!, 6)).toBe(6 * pad!.baseQty)
  })

  it('Stove is constant regardless of n (shared)', () => {
    const stove = findByName(bp, /^stove$/i)
    expect(stove, 'Stove missing from BP list').toBeDefined()
    expect(stove!.scope).toBe('shared')
    const base = stove!.baseQty
    for (const n of [1, 2, 4, 8, 12]) {
      expect(requiredQty(stove!, n)).toBe(base)
    }
  })

  it('Water filter / purifier is constant on BP (shared)', () => {
    const filter = findByName(bp, /water filter|purifier/i)
    expect(filter, 'Water filter missing from BP list').toBeDefined()
    expect(filter!.scope).toBe('shared')
    const base = filter!.baseQty
    for (const n of [1, 2, 5, 10]) {
      expect(requiredQty(filter!, n)).toBe(base)
    }
  })

  it('CC list: sleeping bag scales, stove constant', () => {
    const bag = findByName(cc, /sleeping bag/i)
    const stove = findByName(cc, /^stove$/i)
    expect(bag).toBeDefined()
    expect(stove).toBeDefined()
    expect(bag!.scope).toBe('per_person')
    expect(stove!.scope).toBe('shared')

    const baseBag = bag!.baseQty
    const baseStove = stove!.baseQty
    for (const n of [1, 3, 5]) {
      expect(requiredQty(bag!, n)).toBe(baseBag * n)
      expect(requiredQty(stove!, n)).toBe(baseStove)
    }
  })

  it('tentCapacity per-trip override flows through generate → requiredQty', () => {
    const tent = findByName(cc, /^tent$/i)
    expect(tent, 'Tent missing from CC list').toBeDefined()
    expect(tent!.scope).toBe('per_tent')
    // Family tent: cap=6 → 1 tent for n≤6.
    expect(requiredQty(tent!, 6, 6)).toBe(tent!.baseQty * 1)
    // Two-person tent (default): cap=2 → 3 tents for n=6.
    expect(requiredQty(tent!, 6, 2)).toBe(tent!.baseQty * 3)
  })
})
