// Shared helpers for WS-1 packing-engine acceptance tests.
// Pure factories — keep deterministic. No randomness, no clocks.

import type { Amenities, ItemScope, TripItem } from '../../db/types'

/**
 * A neutral, fully-supplied Amenities object. Every flag is true / present so
 * tests can isolate one branch at a time via small overrides.
 */
export function baseAmenities(overrides: Partial<Amenities> = {}): Amenities {
  return {
    potableWater: true,
    toilets: 'flush',
    showers: true,
    electricity: true,
    fireRings: true,
    firewoodAvailable: true,
    picnicTables: true,
    bearLockers: false,
    bearCountry: false,
    trashService: true,
    dumpStation: true,
    cellService: 'good',
    accessLevel: 'drive-in',
    ...overrides,
  }
}

/**
 * Promote a plain template-shaped item to a fully-typed `TripItem`. The id /
 * tripId / sortOrder / removed are placeholders — `requiredQty` only reads
 * `scope` and `baseQty`.
 */
export function asTripItem(partial: {
  category: TripItem['category']
  name: string
  scope: ItemScope
  baseQty: number
  source?: TripItem['source']
}): TripItem {
  return {
    id: '',
    tripId: '',
    category: partial.category,
    name: partial.name,
    scope: partial.scope,
    baseQty: partial.baseQty,
    source: partial.source ?? 'template',
    sortOrder: 0,
    removed: false,
  }
}

/** Case-insensitive substring match for item.name lookups in assertions. */
export function findByName(
  items: TripItem[],
  needle: string | RegExp,
): TripItem | undefined {
  if (needle instanceof RegExp) return items.find((i) => needle.test(i.name))
  const n = needle.toLowerCase()
  return items.find((i) => i.name.toLowerCase().includes(n))
}

/** All items whose name matches the predicate. */
export function allByName(
  items: TripItem[],
  needle: string | RegExp,
): TripItem[] {
  if (needle instanceof RegExp) return items.filter((i) => needle.test(i.name))
  const n = needle.toLowerCase()
  return items.filter((i) => i.name.toLowerCase().includes(n))
}
