// T3.5 (part 1) — `lib/campsites/amenity-map.ts` field map + bearRegions
//
// Red phase: `lib/campsites/amenity-map.ts` does not yet exist; imports fail.
//
// Covers acceptance criterion T3.5 (mapping portion):
//   - the mapping table covers every `Amenities` field
//   - unknowns resolve to the conservative branch
//     (toilets:'none', bearCountry:true iff in bearRegions, else false,
//      cellService:'none', accessLevel:'drive-in')
//   - `bearRegions` drives `bearCountry`

import { describe, it, expect } from 'vitest'
import type { Amenities } from '../../db/types'
import { AmenitiesSchema } from '../../validation/domain'
// Implementer hasn't shipped these yet — module-not-found is the red state.
import {
  amenityFieldMap,
  bearRegions,
  mapRidbAttributesToAmenities,
} from '../amenity-map'

const ALL_AMENITY_KEYS: Array<keyof Amenities> = [
  'potableWater',
  'toilets',
  'showers',
  'electricity',
  'fireRings',
  'firewoodAvailable',
  'picnicTables',
  'bearLockers',
  'bearCountry',
  'trashService',
  'dumpStation',
  'cellService',
  'accessLevel',
  // potableWaterNote is optional / annotation, may or may not be in the
  // table — not asserted as a required mapping target.
]

describe('T3.5 amenityFieldMap — covers every Amenities field', () => {
  it('table includes an entry targeting every (non-optional) Amenities key', () => {
    expect(Array.isArray(amenityFieldMap)).toBe(true)
    expect(amenityFieldMap.length).toBeGreaterThan(0)
    const targets = new Set(
      amenityFieldMap.map((row: { target: keyof Amenities }) => row.target),
    )
    for (const k of ALL_AMENITY_KEYS) {
      expect(targets.has(k), `missing mapping for ${k}`).toBe(true)
    }
  })
})

describe('T3.5 bearRegions list', () => {
  it('is a non-empty array of 2-char uppercase state codes', () => {
    expect(Array.isArray(bearRegions)).toBe(true)
    expect(bearRegions.length).toBeGreaterThan(0)
    for (const s of bearRegions) {
      expect(s).toMatch(/^[A-Z]{2}$/)
    }
  })

  it('includes obvious bear-country states (CA, WY, MT, AK)', () => {
    // Pin a handful that should clearly be in the list (Yosemite,
    // Yellowstone, Glacier, Alaska). The actual list may be larger.
    expect(bearRegions).toContain('CA')
    expect(bearRegions).toContain('WY')
    expect(bearRegions).toContain('MT')
    expect(bearRegions).toContain('AK')
  })

  it('does NOT include Florida (sanity / DR-7)', () => {
    expect(bearRegions).not.toContain('FL')
  })
})

describe('T3.5 mapRidbAttributesToAmenities — unknown-defaults', () => {
  it('with no attributes + non-bear state → conservative defaults', () => {
    const a = mapRidbAttributesToAmenities([], { state: 'FL' })
    // every required field present + schema-valid
    const parsed = AmenitiesSchema.safeParse(a)
    expect(parsed.success).toBe(true)
    expect(a.toilets).toBe('none')
    expect(a.bearCountry).toBe(false)
    expect(a.cellService).toBe('none')
    // Conservative: everything-off defaults
    expect(a.potableWater).toBe(false)
    expect(a.showers).toBe(false)
    expect(a.electricity).toBe(false)
    expect(a.fireRings).toBe(false)
    expect(a.firewoodAvailable).toBe(false)
    expect(a.picnicTables).toBe(false)
    expect(a.bearLockers).toBe(false)
    expect(a.trashService).toBe(false)
    expect(a.dumpStation).toBe(false)
  })

  it('with no attributes + bear-region state → bearCountry:true', () => {
    const a = mapRidbAttributesToAmenities([], { state: 'WY' })
    expect(a.bearCountry).toBe(true)
  })

  it('schema-validates regardless of input shape', () => {
    const a = mapRidbAttributesToAmenities(
      [
        { AttributeName: 'Potable Water', AttributeValue: 'Yes' },
        { AttributeName: 'Toilets', AttributeValue: 'Flush' },
      ],
      { state: 'CA' },
    )
    expect(AmenitiesSchema.safeParse(a).success).toBe(true)
  })

  it('maps "Yes" / "No" attribute values to booleans', () => {
    const a = mapRidbAttributesToAmenities(
      [
        { AttributeName: 'Potable Water', AttributeValue: 'Yes' },
        { AttributeName: 'Showers', AttributeValue: 'No' },
      ],
      { state: 'CA' },
    )
    expect(a.potableWater).toBe(true)
    expect(a.showers).toBe(false)
  })

  it('maps toilet AttributeValue to enum (vault / flush / none)', () => {
    const vault = mapRidbAttributesToAmenities(
      [{ AttributeName: 'Toilets', AttributeValue: 'Vault' }],
      { state: 'NV' },
    )
    expect(vault.toilets).toBe('vault')

    const flush = mapRidbAttributesToAmenities(
      [{ AttributeName: 'Toilets', AttributeValue: 'Flush' }],
      { state: 'CA' },
    )
    expect(flush.toilets).toBe('flush')
  })
})
