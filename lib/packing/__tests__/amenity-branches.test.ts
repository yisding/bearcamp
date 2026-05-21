// T1.5 — amenity branches (table-driven, ≥6 — WS-1.3 + WS-1.4).
//
// Covers, per acceptance bullet T1.5:
//   1) bearLockers → no canister (+note)
//   2) !bearLockers && bearCountry → canister (BP)
//   3) !potableWater → extra water storage
//   4) toilets='flush' → no trowel / wag bag
//   5) toilets='none' → trowel (BP) / portable toilet (CC)
//   6) !fireRings → fire items removed (+note)
//   7) electricity true (CC) → cords / strip
//   8) cellService='none' → paper map promoted
//
// Also covers category ordering (Shelter → Sleep → Kitchen → Water → Food →
// Clothing → Navigation → Health & Safety → Hygiene → Tools & Repair →
// Personal & Misc) which T1.5 explicitly calls out as part of the snapshot
// suite — pinned here too for clarity.

import { describe, it, expect } from 'vitest'
import { generate } from '../index'
import { baseAmenities, findByName, allByName } from './_helpers'
import type { Amenities, ItemCategory, TripItem, TripStyle } from '../../db/types'

const CATEGORY_ORDER: ItemCategory[] = [
  'Shelter',
  'Sleep',
  'Kitchen',
  'Water',
  'Food',
  'Clothing',
  'Navigation',
  'Health & Safety',
  'Hygiene',
  'Tools & Repair',
  'Personal & Misc',
]

interface Branch {
  id: string
  style: TripStyle
  amenities: Amenities
  // Items that must be present after rules apply (case-insensitive substring).
  expectPresent?: (string | RegExp)[]
  // Items that must NOT be present after rules apply.
  expectAbsent?: (string | RegExp)[]
  // Optional: at least one rule-added/removed item must be tagged
  // source:'amenity' (the "why" note hook).
  expectAmenitySource?: boolean
}

const BRANCHES: Branch[] = [
  // 1) bearLockers=true → no canister. This is a pure-removal rule
  //    (packing-engine.md line 118): remove the canister, no surviving
  //    annotated item. So no `expectAmenitySource` here — the only
  //    requirement is that the canister is gone.
  {
    id: 'bearLockers → no canister',
    style: 'backpacking',
    amenities: baseAmenities({ bearLockers: true, bearCountry: true }),
    expectAbsent: [/bear canister/i],
  },
  // 2) !bearLockers && bearCountry → canister ensured (BP).
  {
    id: '!bearLockers && bearCountry → canister (BP)',
    style: 'backpacking',
    amenities: baseAmenities({ bearLockers: false, bearCountry: true }),
    expectPresent: [/bear canister/i],
    expectAmenitySource: true,
  },
  // 3) !potableWater → extra water storage.
  {
    id: '!potableWater → extra water storage (CC)',
    style: 'car',
    amenities: baseAmenities({ potableWater: false }),
    expectPresent: [/water storage|extra water|water jug|large jug/i],
    expectAmenitySource: true,
  },
  // 4) toilets=flush → no trowel / wag bag.
  {
    id: 'toilets=flush → no trowel, no wag bag (BP)',
    style: 'backpacking',
    amenities: baseAmenities({ toilets: 'flush' }),
    expectAbsent: [/trowel/i, /wag bag/i],
  },
  // 5a) toilets=none, BP → trowel kept/strengthened.
  {
    id: 'toilets=none → trowel (BP)',
    style: 'backpacking',
    amenities: baseAmenities({ toilets: 'none' }),
    expectPresent: [/trowel/i],
    expectAmenitySource: true,
  },
  // 5b) toilets=none, CC → portable toilet added.
  {
    id: 'toilets=none → portable toilet (CC)',
    style: 'car',
    amenities: baseAmenities({ toilets: 'none' }),
    expectPresent: [/portable toilet/i],
    expectAmenitySource: true,
  },
  // 6) !fireRings → fire items removed (CC).
  {
    id: '!fireRings → fire items removed (CC)',
    style: 'car',
    amenities: baseAmenities({ fireRings: false, firewoodAvailable: false }),
    expectAbsent: [/fire starter/i, /firewood/i, /roasting forks/i],
    expectAmenitySource: true,
  },
  // 7) electricity=true (CC) → extension cord + power strip.
  {
    id: 'electricity=true (CC) → cord + strip',
    style: 'car',
    amenities: baseAmenities({ electricity: true }),
    expectPresent: [/extension cord/i, /power strip/i],
    expectAmenitySource: true,
  },
  // 8) cellService='none' → paper map promoted (even CC).
  {
    id: 'cellService=none → paper map (CC)',
    style: 'car',
    amenities: baseAmenities({ cellService: 'none' }),
    expectPresent: [/paper map|map.*compass|map & compass/i],
    expectAmenitySource: true,
  },
]

describe('T1.5 amenity branches (table-driven, ≥6)', () => {
  it('table has at least 6 branches', () => {
    expect(BRANCHES.length).toBeGreaterThanOrEqual(6)
  })

  describe.each(BRANCHES)('$id', (branch) => {
    const items = (): TripItem[] => generate(branch.style, branch.amenities)

    it('expected items are present', () => {
      const list = items()
      for (const needle of branch.expectPresent ?? []) {
        expect(
          findByName(list, needle),
          `expected to find ${needle} after rules`,
        ).toBeDefined()
      }
    })

    it('expected items are absent', () => {
      const list = items()
      for (const needle of branch.expectAbsent ?? []) {
        expect(
          findByName(list, needle),
          `expected NOT to find ${needle} after rules`,
        ).toBeUndefined()
      }
    })

    if (branch.expectAmenitySource) {
      it('at least one rule-touched item is tagged source:"amenity"', () => {
        const list = items()
        const amenityItems = list.filter((i) => i.source === 'amenity')
        expect(amenityItems.length).toBeGreaterThan(0)
      })
    }
  })

  // ---- category ordering (T1.5 bullet) ----

  describe('category ordering', () => {
    function categoryIndex(c: ItemCategory): number {
      return CATEGORY_ORDER.indexOf(c)
    }

    it('CC list is sorted by category order then template order via sortOrder', () => {
      const list = generate('car', baseAmenities())
      // Items must be in non-decreasing category-index order when iterated by
      // sortOrder ascending.
      const bySort = [...list].sort((a, b) => a.sortOrder - b.sortOrder)
      let lastCat = -1
      for (const it of bySort) {
        const idx = categoryIndex(it.category)
        expect(idx).toBeGreaterThanOrEqual(lastCat)
        lastCat = idx
      }
      // sortOrder values are unique and strictly ascending after sort.
      const orders = bySort.map((i) => i.sortOrder)
      expect(new Set(orders).size).toBe(orders.length)
    })

    it('BP list is sorted by category order via sortOrder', () => {
      const list = generate('backpacking', baseAmenities())
      const bySort = [...list].sort((a, b) => a.sortOrder - b.sortOrder)
      let lastCat = -1
      for (const it of bySort) {
        const idx = categoryIndex(it.category)
        expect(idx).toBeGreaterThanOrEqual(lastCat)
        lastCat = idx
      }
    })
  })

  // Sanity: helper used elsewhere is exercised here too.
  it('allByName returns 0 fire items for a !fireRings CC trip', () => {
    const list = generate('car', baseAmenities({ fireRings: false }))
    expect(allByName(list, /fire starter|firewood|roasting forks/i)).toEqual(
      [],
    )
  })
})
