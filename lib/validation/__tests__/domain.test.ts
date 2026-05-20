// T0.6 — domain validation (Amenities + Campsite).
// Valid parse passes; bad state ('california' / 'CA '), bad id prefix, and
// missing fields reject (DR-30 / DR-31).

import { describe, it, expect } from 'vitest'
import { AmenitiesSchema, CampsiteSchema } from '../domain'
import type { Amenities, Campsite } from '../../db/types'

function goodAmenities(): Amenities {
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
    dumpStation: false,
    cellService: 'good',
    accessLevel: 'drive-in',
  }
}

function goodCampsite(): Campsite {
  return {
    id: 'seed:big-sur',
    name: 'Big Sur Campground',
    state: 'CA',
    amenities: goodAmenities(),
    activities: ['hiking'],
    source: 'seed',
  }
}

describe('T0.6 domain validation', () => {
  describe('Amenities', () => {
    it('valid Amenities parses', () => {
      expect(() => AmenitiesSchema.parse(goodAmenities())).not.toThrow()
    })

    it('rejects missing required field (toilets)', () => {
      const a = { ...goodAmenities() } as Partial<Amenities>
      delete a.toilets
      expect(() => AmenitiesSchema.parse(a)).toThrow()
    })

    it('rejects bad enum value on toilets', () => {
      const a = { ...goodAmenities(), toilets: 'sometimes' as unknown }
      expect(() => AmenitiesSchema.parse(a)).toThrow()
    })

    it('rejects non-boolean potableWater', () => {
      const a = { ...goodAmenities(), potableWater: 'yes' as unknown }
      expect(() => AmenitiesSchema.parse(a)).toThrow()
    })
  })

  describe('Campsite', () => {
    it('valid Campsite parses', () => {
      expect(() => CampsiteSchema.parse(goodCampsite())).not.toThrow()
    })

    it("rejects state 'california' (only 2-char codes allowed)", () => {
      const c = { ...goodCampsite(), state: 'california' }
      expect(() => CampsiteSchema.parse(c)).toThrow()
    })

    it("rejects state 'CA ' (trailing whitespace)", () => {
      const c = { ...goodCampsite(), state: 'CA ' }
      expect(() => CampsiteSchema.parse(c)).toThrow()
    })

    it("accepts state 'CA'", () => {
      const c = { ...goodCampsite(), state: 'CA' }
      expect(() => CampsiteSchema.parse(c)).not.toThrow()
    })

    it('rejects bare id (no prefix)', () => {
      const c = { ...goodCampsite(), id: 'big-sur' }
      expect(() => CampsiteSchema.parse(c)).toThrow()
    })

    it("rejects id with unknown prefix ('xyz:foo')", () => {
      const c = { ...goodCampsite(), id: 'xyz:foo' }
      expect(() => CampsiteSchema.parse(c)).toThrow()
    })

    it('rejects missing name', () => {
      const c = { ...goodCampsite() } as Partial<Campsite>
      delete c.name
      expect(() => CampsiteSchema.parse(c)).toThrow()
    })

    it('accepts each sanctioned prefix', () => {
      for (const prefix of ['seed', 'fixture', 'ridb', 'osm']) {
        const c = { ...goodCampsite(), id: `${prefix}:foo` }
        expect(() => CampsiteSchema.parse(c)).not.toThrow()
      }
    })
  })
})
