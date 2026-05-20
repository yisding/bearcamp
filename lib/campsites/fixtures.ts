// Fixture campsite catalog — WS-0.6.
// 12-15 fixtures spanning every amenity rule branch in plan/packing-engine.md.
// Ids built via campsiteId('fixture', slug). Every fixture must parse
// CampsiteSchema (lib/validation/domain.ts).

import type { Amenities, Campsite } from '../db/types'
import type { CampsiteSource } from './source'
import { campsiteId } from '../ids'
import {
  SEARCH_PAGE_SIZE_DEFAULT,
  SEARCH_PAGE_SIZE_MAX,
} from '../limits'
import type { SearchArgs, SearchResult } from '../db/storage'

function ams(overrides: Partial<Amenities>): Amenities {
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

export const fixtures: Campsite[] = [
  {
    // Full-amenity drive-in — baseline.
    id: campsiteId('fixture', 'big-sur-state'),
    name: 'Big Sur State Park CG',
    agency: 'CA State Parks',
    state: 'CA',
    description: 'Coastal redwoods, full hookups, drive-in.',
    amenities: ams({}),
    activities: ['hiking', 'beach'],
    source: 'fixture',
  },
  {
    // No water + vault toilets — water/toilet branches.
    id: campsiteId('fixture', 'desert-vault'),
    name: 'Desert Vault CG',
    agency: 'BLM',
    state: 'NV',
    description: 'Dispersed desert sites; pack-in water.',
    amenities: ams({
      potableWater: false,
      potableWaterNote: 'No water on site',
      toilets: 'vault',
      showers: false,
      electricity: false,
      firewoodAvailable: false,
      trashService: false,
      cellService: 'weak',
    }),
    activities: ['stargazing'],
    source: 'fixture',
  },
  {
    // Backcountry, no toilets, no fires, bear country no lockers — BP-heavy.
    id: campsiteId('fixture', 'sierra-backcountry'),
    name: 'Sierra Backcountry Zone',
    agency: 'USFS',
    state: 'CA',
    description: 'Permit-only backcountry; bear country.',
    amenities: ams({
      potableWater: false,
      toilets: 'none',
      showers: false,
      electricity: false,
      fireRings: false,
      firewoodAvailable: false,
      picnicTables: false,
      bearLockers: false,
      bearCountry: true,
      trashService: false,
      dumpStation: false,
      cellService: 'none',
      accessLevel: 'backcountry',
    }),
    activities: ['backpacking'],
    source: 'fixture',
  },
  {
    // Walk-in, bear lockers provided.
    id: campsiteId('fixture', 'yosemite-walkin'),
    name: 'Yosemite Walk-in CG',
    agency: 'NPS',
    state: 'CA',
    description: 'Walk-in tent sites with bear lockers.',
    amenities: ams({
      toilets: 'flush',
      showers: false,
      electricity: false,
      bearLockers: true,
      bearCountry: true,
      cellService: 'none',
      accessLevel: 'walk-in',
    }),
    activities: ['hiking', 'climbing'],
    source: 'fixture',
  },
  {
    // No fire rings — fire branches.
    id: campsiteId('fixture', 'coastal-no-fires'),
    name: 'Coastal No-Fire CG',
    agency: 'CA State Parks',
    state: 'CA',
    description: 'Fire restrictions in effect; stove only.',
    amenities: ams({
      fireRings: false,
      firewoodAvailable: false,
      cellService: 'weak',
    }),
    activities: ['surfing'],
    source: 'fixture',
  },
  {
    // No picnic tables.
    id: campsiteId('fixture', 'primitive-tables'),
    name: 'Primitive Sites',
    agency: 'USFS',
    state: 'OR',
    description: 'Primitive: no tables, vault toilets.',
    amenities: ams({
      toilets: 'vault',
      showers: false,
      electricity: false,
      picnicTables: false,
      firewoodAvailable: false,
      cellService: 'weak',
    }),
    activities: ['fishing'],
    source: 'fixture',
  },
  {
    // No toilets at all (dispersed).
    id: campsiteId('fixture', 'dispersed-utah'),
    name: 'Dispersed Utah BLM',
    agency: 'BLM',
    state: 'UT',
    description: 'Dispersed; bring everything in/out.',
    amenities: ams({
      potableWater: false,
      toilets: 'none',
      showers: false,
      electricity: false,
      fireRings: false,
      firewoodAvailable: false,
      picnicTables: false,
      trashService: false,
      dumpStation: false,
      cellService: 'none',
      accessLevel: 'drive-in',
    }),
    activities: ['mountain biking'],
    source: 'fixture',
  },
  {
    // No electricity, has fire rings, firewood available.
    id: campsiteId('fixture', 'rustic-lake'),
    name: 'Rustic Lake CG',
    agency: 'USFS',
    state: 'WA',
    description: 'Lakeside with fire rings, no power.',
    amenities: ams({
      electricity: false,
      firewoodAvailable: true,
      cellService: 'none',
      showers: false,
    }),
    activities: ['kayaking', 'fishing'],
    source: 'fixture',
  },
  {
    // Bear country no lockers, fire rings yes.
    id: campsiteId('fixture', 'rockies-bear'),
    name: 'Rockies Bear Country',
    agency: 'USFS',
    state: 'CO',
    description: 'Black bear habitat; no provided lockers.',
    amenities: ams({
      bearCountry: true,
      bearLockers: false,
      cellService: 'weak',
    }),
    activities: ['hiking'],
    source: 'fixture',
  },
  {
    // No trash service.
    id: campsiteId('fixture', 'pack-out-mesa'),
    name: 'Pack-Out Mesa',
    agency: 'BLM',
    state: 'AZ',
    description: 'Pack out all trash; vault toilets.',
    amenities: ams({
      toilets: 'vault',
      showers: false,
      electricity: false,
      trashService: false,
      firewoodAvailable: false,
      cellService: 'weak',
    }),
    activities: ['hiking'],
    source: 'fixture',
  },
  {
    // Walk-in with bear lockers — different combo.
    id: campsiteId('fixture', 'olympic-walkin'),
    name: 'Olympic Walk-in',
    agency: 'NPS',
    state: 'WA',
    description: 'Walk-in coastal sites with bear boxes.',
    amenities: ams({
      toilets: 'vault',
      showers: false,
      electricity: false,
      bearLockers: true,
      bearCountry: true,
      firewoodAvailable: false,
      cellService: 'none',
      accessLevel: 'walk-in',
    }),
    activities: ['beachcombing'],
    source: 'fixture',
  },
  {
    // Backcountry no-bear (high alpine, no lockers needed).
    id: campsiteId('fixture', 'desert-backcountry'),
    name: 'Desert Backcountry Zone',
    agency: 'NPS',
    state: 'UT',
    description: 'Backcountry desert; no bears.',
    amenities: ams({
      potableWater: false,
      toilets: 'none',
      showers: false,
      electricity: false,
      fireRings: false,
      firewoodAvailable: false,
      picnicTables: false,
      bearCountry: false,
      trashService: false,
      dumpStation: false,
      cellService: 'none',
      accessLevel: 'backcountry',
    }),
    activities: ['canyoneering'],
    source: 'fixture',
  },
  {
    // Full hookups RV-ready.
    id: campsiteId('fixture', 'rv-friendly'),
    name: 'RV-Friendly Resort',
    agency: 'Private',
    state: 'FL',
    description: 'Full hookups, showers, dump station.',
    amenities: ams({}),
    activities: ['swimming'],
    source: 'fixture',
  },
]

// In-memory search over fixtures — used by the default CampsiteSource at
// WS-0 and by the storage adapter's seed path.
function fixtureSearch(args: SearchArgs): SearchResult {
  const page = Math.max(1, args.page ?? 1)
  const pageSize = Math.min(
    Math.max(1, args.pageSize ?? SEARCH_PAGE_SIZE_DEFAULT),
    SEARCH_PAGE_SIZE_MAX,
  )
  const q = args.q?.toLowerCase()
  let filtered = fixtures.slice()
  if (q) {
    filtered = filtered.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description?.toLowerCase().includes(q) ?? false),
    )
  }
  if (args.state) {
    filtered = filtered.filter((c) => c.state === args.state)
  }
  if (args.agency) {
    filtered = filtered.filter((c) => c.agency === args.agency)
  }
  if (args.amenities && args.amenities.length > 0) {
    filtered = filtered.filter((c) =>
      args.amenities!.every((k) => Boolean(c.amenities[k])),
    )
  }
  const total = filtered.length
  const start = (page - 1) * pageSize
  const slice = filtered.slice(start, start + pageSize)
  return { campsites: slice, total, page, pageSize }
}

export function createFixtureSource(): CampsiteSource {
  return {
    all: () => Promise.resolve(fixtures),
    getById: (id: string) =>
      Promise.resolve(fixtures.find((c) => c.id === id) ?? null),
    search: (args: SearchArgs) => Promise.resolve(fixtureSearch(args)),
  }
}
