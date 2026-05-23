// Temporary seed fixture — WS-2.11.
//
// WS-3 owns `data/campsites.seed.json` + the real `loadSeed()` helper (≥150
// entries, validated against the WS-0 zod schema in
// `lib/validation/domain.ts`). That stream is not yet on the WS-2 branch,
// so this file ships a tiny inline fixture with the same return shape so
// `prisma db seed` works today.
//
// When WS-8 lands the WS-3 integration the swap in `prisma/seed.ts` is one
// line: replace `from './seed.fixture'` with `from
// '../lib/campsites/seed'`. The function signature
// (`(): Promise<Campsite[]>`) is identical.

import type { Campsite } from '../lib/db/types'

const baseAmenities = {
  potableWater: true,
  toilets: 'flush' as const,
  showers: true,
  electricity: false,
  fireRings: true,
  firewoodAvailable: true,
  picnicTables: true,
  bearLockers: false,
  bearCountry: false,
  trashService: true,
  dumpStation: false,
  cellService: 'good' as const,
  accessLevel: 'drive-in' as const,
}

export async function loadSeed(): Promise<Campsite[]> {
  return [
    {
      id: 'seed:emerald-lake',
      name: 'Emerald Lake Campground',
      agency: 'NPS',
      state: 'CA',
      lat: 39.0,
      lng: -120.0,
      description:
        'High alpine lake with bear country basin and granite slabs.',
      amenities: { ...baseAmenities, bearCountry: true, bearLockers: true },
      activities: ['fishing', 'hiking'],
      source: 'seed',
    },
    {
      id: 'seed:cinder-cone',
      name: 'Cinder Cone Volcano Site',
      agency: 'USFS',
      state: 'CA',
      lat: 40.0,
      lng: -121.0,
      description: 'Volcanic terrain near painted dunes; no potable water.',
      amenities: {
        ...baseAmenities,
        potableWater: false,
        showers: false,
        toilets: 'vault',
        accessLevel: 'walk-in',
      },
      activities: ['hiking'],
      source: 'seed',
    },
    {
      id: 'seed:big-meadow',
      name: 'Big Meadow Campground',
      agency: 'USFS',
      state: 'OR',
      lat: 44.0,
      lng: -122.0,
      description:
        'Forest service drive-in sites near a wildflower meadow and stream.',
      amenities: { ...baseAmenities, electricity: true, dumpStation: true },
      activities: ['fishing', 'hiking', 'biking'],
      source: 'seed',
    },
  ]
}
