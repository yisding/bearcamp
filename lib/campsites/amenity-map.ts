// WS-3.0 — RIDB attribute → Amenities field mapping table + bearRegions.
//
// Pure mapping; unit-tested. Source adapters (`ridb.ts`, OSM, etc.) lookup
// attributes through `mapRidbAttributesToAmenities` so every field has a
// single conservative default. Unknown attribute names are ignored; unknown
// values resolve to the conservative branch (toilets:'none', cellService:
// 'none', accessLevel:'drive-in', booleans:false). `bearCountry` defaults
// `true` iff `state ∈ bearRegions`, else `false` (DR-7).

import type { Amenities } from '../db/types'

// US state postal codes where black/grizzly bear country is a sensible
// default (the wild west + Alaska + the bear-belt). Intentionally broader
// than CA/WY/MT/AK alone — fixtures + RIDB rows in these states should
// generate bear-aware packing lists by default. FL is NOT here (DR-7 / G5).
export const bearRegions: ReadonlyArray<string> = [
  'AK',
  'CA',
  'CO',
  'ID',
  'MT',
  'OR',
  'WA',
  'WY',
] as const

// Lookups for amenity enum values. Lowercase keys (after .toLowerCase()).
const TOILET_LOOKUP: Record<string, Amenities['toilets']> = {
  flush: 'flush',
  flushing: 'flush',
  'flush toilets': 'flush',
  vault: 'vault',
  'vault toilet': 'vault',
  'vault toilets': 'vault',
  pit: 'vault',
  'pit toilet': 'vault',
  none: 'none',
  no: 'none',
  '': 'none',
}

const CELL_LOOKUP: Record<string, Amenities['cellService']> = {
  good: 'good',
  yes: 'good',
  weak: 'weak',
  spotty: 'weak',
  limited: 'weak',
  none: 'none',
  no: 'none',
  '': 'none',
}

const ACCESS_LOOKUP: Record<string, Amenities['accessLevel']> = {
  'drive-in': 'drive-in',
  drive: 'drive-in',
  'drive in': 'drive-in',
  rv: 'drive-in',
  'walk-in': 'walk-in',
  walk: 'walk-in',
  'walk in': 'walk-in',
  hike: 'walk-in',
  'hike-in': 'walk-in',
  backcountry: 'backcountry',
  wilderness: 'backcountry',
  'back country': 'backcountry',
}

function yesNo(value: string | undefined): boolean {
  if (!value) return false
  const v = value.trim().toLowerCase()
  return v === 'yes' || v === 'y' || v === 'true' || v === 'available'
}

// One row per supported RIDB attribute name (case-insensitive). `target`
// names the `Amenities` field; `parse` produces the value from the raw
// AttributeValue string. Defaults are resolved by callers, not here.
export interface AmenityMapRow {
  // Lowercased attribute name(s) that signal this Amenities field.
  attributeNames: ReadonlyArray<string>
  target: keyof Amenities
  parse: (value: string) => unknown
}

export const amenityFieldMap: ReadonlyArray<AmenityMapRow> = [
  {
    attributeNames: ['potable water', 'drinking water', 'water'],
    target: 'potableWater',
    parse: yesNo,
  },
  {
    attributeNames: ['toilets', 'toilet', 'restrooms'],
    target: 'toilets',
    parse: (v) => TOILET_LOOKUP[v.trim().toLowerCase()] ?? 'none',
  },
  {
    attributeNames: ['showers', 'shower'],
    target: 'showers',
    parse: yesNo,
  },
  {
    attributeNames: [
      'electricity hookup',
      'electricity',
      'electric hookup',
      'power',
    ],
    target: 'electricity',
    parse: yesNo,
  },
  {
    attributeNames: ['fire ring', 'fire pit', 'campfire'],
    target: 'fireRings',
    parse: yesNo,
  },
  {
    attributeNames: ['firewood', 'firewood available'],
    target: 'firewoodAvailable',
    parse: yesNo,
  },
  {
    attributeNames: ['picnic table', 'picnic tables'],
    target: 'picnicTables',
    parse: yesNo,
  },
  {
    attributeNames: ['bear locker', 'bear box', 'food storage'],
    target: 'bearLockers',
    parse: yesNo,
  },
  {
    // Most RIDB rows don't directly carry bear-country; derived from state ∈
    // bearRegions in the caller. This row exists so the mapping table
    // formally covers the key.
    attributeNames: ['bear country'],
    target: 'bearCountry',
    parse: yesNo,
  },
  {
    attributeNames: ['trash', 'trash collection', 'garbage'],
    target: 'trashService',
    parse: yesNo,
  },
  {
    attributeNames: ['dump station', 'rv dump'],
    target: 'dumpStation',
    parse: yesNo,
  },
  {
    attributeNames: ['cell reception', 'cell service', 'cellular'],
    target: 'cellService',
    parse: (v) => CELL_LOOKUP[v.trim().toLowerCase()] ?? 'none',
  },
  {
    attributeNames: ['site access', 'access type', 'access'],
    target: 'accessLevel',
    parse: (v) => ACCESS_LOOKUP[v.trim().toLowerCase()] ?? 'drive-in',
  },
]

// Conservative defaults (review G5): assume nothing is provided, no service,
// drive-in is the safer baseline (over-prep is benign; under-prep harms).
function conservativeDefaults(state?: string): Amenities {
  return {
    potableWater: false,
    toilets: 'none',
    showers: false,
    electricity: false,
    fireRings: false,
    firewoodAvailable: false,
    picnicTables: false,
    bearLockers: false,
    bearCountry: state ? bearRegions.includes(state) : false,
    trashService: false,
    dumpStation: false,
    cellService: 'none',
    accessLevel: 'drive-in',
  }
}

export interface RawRidbAttribute {
  AttributeName: string
  AttributeValue: string
}

// The single entry point adapters call. Walks the attribute list once,
// dispatching each known attribute through the mapping table.
export function mapRidbAttributesToAmenities(
  attributes: ReadonlyArray<RawRidbAttribute> | undefined | null,
  context: { state?: string },
): Amenities {
  const result = conservativeDefaults(context.state)
  if (!attributes || attributes.length === 0) return result

  // Build a name→row index once per call (small N — fine inline).
  const index = new Map<string, AmenityMapRow>()
  for (const row of amenityFieldMap) {
    for (const name of row.attributeNames) {
      index.set(name, row)
    }
  }

  for (const attr of attributes) {
    if (!attr?.AttributeName) continue
    const key = attr.AttributeName.trim().toLowerCase()
    const row = index.get(key)
    if (!row) continue
    const value = row.parse(attr.AttributeValue ?? '')
    // The mapping table is well-typed enough that we can assign through a
    // narrow cast — the `parse` shape per row is enforced by the lookups.
    ;(result as Record<keyof Amenities, unknown>)[row.target] = value
  }

  // bearCountry: if the source explicitly set it, honor it; otherwise the
  // conservative-defaults branch already populated from state ∈ bearRegions.
  return result
}
