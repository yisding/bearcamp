// T3.1 + T3.2 — `data/campsites.seed.json` shape, validity, and
// amenity-branch coverage.
//
// Red phase: imports the seed JSON via `lib/campsites/seed.ts`'s exported
// `loadSeed()` helper (I-7 — what WS-2's `prisma db seed` consumes). Both
// the JSON file and `seed.ts` do not yet exist; tests fail with
// module-not-found until WS-3.1/3.2 ship.
//
// Covers acceptance criteria:
//   - **T3.1** every entry parses CampsiteSchema; count ≥ 150.
//     Ids are `seed:<slug>`.
//   - **T3.2** the set covers each amenity branch enumerated in
//     `plan/packing-engine.md` (asserted as a coverage map).

import { describe, it, expect } from 'vitest'
import { CampsiteSchema } from '../../validation/domain'
import type { Amenities, Campsite } from '../../db/types'
// Implementer hasn't shipped this yet — module-not-found is the red state.
import { loadSeed } from '../seed'

describe('T3.1 seed dataset — shape & validity', () => {
  const seed: Campsite[] = loadSeed()

  it('has ≥150 entries (curated best-effort dataset)', () => {
    expect(seed.length).toBeGreaterThanOrEqual(150)
  })

  it('every entry parses CampsiteSchema (zod)', () => {
    for (const c of seed) {
      const result = CampsiteSchema.safeParse(c)
      if (!result.success) {
        throw new Error(
          `seed entry ${c?.id ?? '<unknown>'} failed schema: ${result.error.message}`,
        )
      }
    }
  })

  it("every id is prefixed `seed:<slug>` (DR-30)", () => {
    for (const c of seed) {
      expect(c.id.startsWith('seed:')).toBe(true)
      // Slug must be non-empty and not contain whitespace.
      const slug = c.id.slice('seed:'.length)
      expect(slug.length).toBeGreaterThan(0)
      expect(/\s/.test(slug)).toBe(false)
    }
  })

  it('every entry sets `source: "seed"`', () => {
    for (const c of seed) {
      expect(c.source).toBe('seed')
    }
  })

  it('every state code is 2-char uppercase (DR-31)', () => {
    for (const c of seed) {
      // schema makes state optional but per spec the seed sets state on
      // every entry.
      expect(c.state).toBeDefined()
      expect(c.state).toMatch(/^[A-Z]{2}$/)
    }
  })

  it('every entry has at least one activity (curated requirement)', () => {
    for (const c of seed) {
      expect(Array.isArray(c.activities)).toBe(true)
      expect(c.activities.length).toBeGreaterThan(0)
    }
  })

  it('every entry has lat/lng (curated requirement)', () => {
    for (const c of seed) {
      expect(typeof c.lat).toBe('number')
      expect(typeof c.lng).toBe('number')
      expect(Number.isFinite(c.lat!)).toBe(true)
      expect(Number.isFinite(c.lng!)).toBe(true)
    }
  })

  it('every entry has an agency (NPS/USFS/BLM/USACE/state/private)', () => {
    for (const c of seed) {
      expect(typeof c.agency).toBe('string')
      expect(c.agency!.length).toBeGreaterThan(0)
    }
  })

  it('all ids are unique', () => {
    const ids = seed.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('spans NPS/USFS/BLM/USACE/state agencies (broad coverage)', () => {
    const agencies = new Set(seed.map((c) => c.agency))
    expect(agencies.has('NPS')).toBe(true)
    expect(agencies.has('USFS')).toBe(true)
    expect(agencies.has('BLM')).toBe(true)
    // USACE coverage is part of the curated requirement.
    expect(agencies.has('USACE')).toBe(true)
  })
})

describe('T3.2 seed dataset — amenity-branch coverage', () => {
  const seed: Campsite[] = loadSeed()

  // Mirror the amenity-branch enumeration from
  // `plan/packing-engine.md`. Every branch must be hit by ≥1 seed entry,
  // otherwise the generated lists won't visibly differ across the dataset.
  const branches: Record<string, (a: Amenities) => boolean> = {
    potableWater_yes: (a) => a.potableWater === true,
    potableWater_no: (a) => a.potableWater === false,
    toilets_none: (a) => a.toilets === 'none',
    toilets_vault: (a) => a.toilets === 'vault',
    toilets_flush: (a) => a.toilets === 'flush',
    showers_yes: (a) => a.showers === true,
    showers_no: (a) => a.showers === false,
    electricity_yes: (a) => a.electricity === true,
    electricity_no: (a) => a.electricity === false,
    fireRings_yes: (a) => a.fireRings === true,
    fireRings_no: (a) => a.fireRings === false,
    firewoodAvailable_yes: (a) => a.firewoodAvailable === true,
    firewoodAvailable_no: (a) => a.firewoodAvailable === false,
    picnicTables_yes: (a) => a.picnicTables === true,
    picnicTables_no: (a) => a.picnicTables === false,
    bearLockers_yes: (a) => a.bearLockers === true,
    bearLockers_no_bearCountry_yes: (a) =>
      a.bearLockers === false && a.bearCountry === true,
    bearCountry_no: (a) => a.bearCountry === false,
    trashService_yes: (a) => a.trashService === true,
    trashService_no: (a) => a.trashService === false,
    dumpStation_yes: (a) => a.dumpStation === true,
    dumpStation_no: (a) => a.dumpStation === false,
    cell_none: (a) => a.cellService === 'none',
    cell_weak: (a) => a.cellService === 'weak',
    cell_good: (a) => a.cellService === 'good',
    accessLevel_drive: (a) => a.accessLevel === 'drive-in',
    accessLevel_walk: (a) => a.accessLevel === 'walk-in',
    accessLevel_back: (a) => a.accessLevel === 'backcountry',
  }

  for (const [name, pred] of Object.entries(branches)) {
    it(`covers amenity branch: ${name}`, () => {
      const hit = seed.filter((c) => pred(c.amenities))
      expect(hit.length).toBeGreaterThan(0)
    })
  }
})
