// T0.11 — frozen packing barrel export surface.
// lib/packing exports EXACTLY { generate, requiredQty, TENT_CAPACITY }
// (review B2). Adding or renaming an export here is a contract bump — WS-1
// must not change the barrel; this test fails if it does.

import { describe, it, expect } from 'vitest'
import * as packing from '../index'

describe('T0.11 frozen packing exports', () => {
  it('exports exactly { generate, requiredQty, TENT_CAPACITY }', () => {
    const actual = Object.keys(packing).sort()
    const expected = ['TENT_CAPACITY', 'generate', 'requiredQty'].sort()
    expect(actual).toEqual(expected)
  })

  it('generate is a function', () => {
    expect(typeof packing.generate).toBe('function')
  })

  it('requiredQty is a function', () => {
    expect(typeof packing.requiredQty).toBe('function')
  })

  it('TENT_CAPACITY is a number with the documented default of 2', () => {
    expect(typeof packing.TENT_CAPACITY).toBe('number')
    expect(packing.TENT_CAPACITY).toBe(2)
  })
})
