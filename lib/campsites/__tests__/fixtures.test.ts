// T0.7 — fixtures coverage.
// Every fixture parses CampsiteSchema; the set covers every amenity rule
// branch in plan/packing-engine.md (assert a coverage map).

import { describe, it, expect } from 'vitest'
import { fixtures } from '../fixtures'
import { CampsiteSchema } from '../../validation/domain'

describe('T0.7 fixtures coverage', () => {
  it('has 12-15 fixtures', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(12)
    expect(fixtures.length).toBeLessThanOrEqual(15)
  })

  it('every fixture parses CampsiteSchema', () => {
    for (const f of fixtures) {
      expect(() => CampsiteSchema.parse(f)).not.toThrow()
    }
  })

  it("every fixture id has the 'fixture:' prefix", () => {
    for (const f of fixtures) {
      expect(f.id.startsWith('fixture:')).toBe(true)
    }
  })

  // Coverage map: each branch in plan/packing-engine.md must be hit by at
  // least one fixture. Heuristics on the Amenities shape.
  const branches: Record<string, (a: typeof fixtures[number]['amenities']) => boolean> = {
    potableWater_yes: (a) => a.potableWater === true,
    potableWater_no: (a) => a.potableWater === false,
    toilets_none: (a) => a.toilets === 'none',
    toilets_vault: (a) => a.toilets === 'vault',
    toilets_flush: (a) => a.toilets === 'flush',
    showers_no: (a) => a.showers === false,
    electricity_yes: (a) => a.electricity === true,
    electricity_no: (a) => a.electricity === false,
    fireRings_yes: (a) => a.fireRings === true,
    fireRings_no: (a) => a.fireRings === false,
    firewoodAvailable_yes: (a) => a.firewoodAvailable === true,
    firewoodAvailable_no: (a) => a.firewoodAvailable === false,
    picnicTables_no: (a) => a.picnicTables === false,
    bearLockers_yes: (a) => a.bearLockers === true,
    bearLockers_no_bearCountry_yes: (a) =>
      a.bearLockers === false && a.bearCountry === true,
    cell_none: (a) => a.cellService === 'none',
    trashService_no: (a) => a.trashService === false,
    accessLevel_drive: (a) => a.accessLevel === 'drive-in',
    accessLevel_walk: (a) => a.accessLevel === 'walk-in',
    accessLevel_back: (a) => a.accessLevel === 'backcountry',
  }

  for (const [name, pred] of Object.entries(branches)) {
    it(`fixtures cover branch: ${name}`, () => {
      const hit = fixtures.some((f) => pred(f.amenities))
      expect(hit).toBe(true)
    })
  }
})
