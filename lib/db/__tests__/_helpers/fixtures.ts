// Inline mini-fixture for WS-2 acceptance tests.
//
// Deliberately tiny (two campsites + one trip seed) and INDEPENDENT of
// `data/campsites.seed.json` — that file is WS-3-owned (per workstream spec,
// review-2 DR-16). WS-2 tests use this mini-fixture so they don't block on
// WS-3 landing.

import type { Amenities, Campsite } from '../../types'
import type { CreateTripInput } from '../../storage'

export function amenities(overrides: Partial<Amenities> = {}): Amenities {
  return {
    potableWater: true,
    toilets: 'flush',
    showers: true,
    electricity: false,
    fireRings: true,
    firewoodAvailable: true,
    picnicTables: true,
    bearLockers: false,
    bearCountry: false,
    trashService: true,
    dumpStation: false,
    cellService: 'good',
    accessLevel: 'drive-in',
    ...overrides,
  }
}

export const sampleCampsites: Campsite[] = [
  {
    id: 'fixture:emerald-lake',
    name: 'Emerald Lake Campground',
    agency: 'NPS',
    state: 'CA',
    lat: 39.0,
    lng: -120.0,
    description: 'High alpine lake with bear country basin and granite slabs.',
    amenities: amenities({ bearCountry: true, bearLockers: true }),
    activities: ['fishing', 'hiking'],
    source: 'fixture',
  },
  {
    id: 'fixture:cinder-cone',
    name: 'Cinder Cone Volcano Site',
    agency: 'USFS',
    state: 'CA',
    lat: 40.0,
    lng: -121.0,
    description: 'Volcanic terrain near painted dunes; no potable water.',
    amenities: amenities({
      potableWater: false,
      showers: false,
      toilets: 'vault',
      accessLevel: 'walk-in',
    }),
    activities: ['hiking'],
    source: 'fixture',
  },
]

const STABLE_TOK = (p: string) => p + 'x'.repeat(32 - p.length)

export function makeTripInput(
  overrides: Partial<CreateTripInput> = {},
): CreateTripInput {
  return {
    name: 'Test Trip',
    campsiteId: sampleCampsites[0].id,
    campsite: {
      name: sampleCampsites[0].name,
      amenities: sampleCampsites[0].amenities,
      state: sampleCampsites[0].state,
      agency: sampleCampsites[0].agency,
    },
    style: 'car',
    ownerName: 'Owner',
    ownerToken: STABLE_TOK('ot-'),
    ownerParticipantToken: STABLE_TOK('pt-'),
    items: [
      {
        category: 'Sleep',
        name: 'Sleeping bag',
        scope: 'per_person',
        baseQty: 1,
        source: 'template',
      },
      {
        category: 'Shelter',
        name: 'Tent',
        scope: 'per_tent',
        baseQty: 1,
        source: 'template',
      },
      {
        category: 'Kitchen',
        name: 'Stove',
        scope: 'shared',
        baseQty: 1,
        source: 'template',
      },
    ],
    ...overrides,
  }
}

// Helper to produce deterministic ≥32-char tokens per test.
export function tok(prefix: string): string {
  return STABLE_TOK(prefix)
}
