// Zod schemas for Amenities + Campsite — WS-0.11.
// Source of truth for Campsite/Amenities runtime validation (used by
// fixtures, WS-3 import, and tests).

import { z } from 'zod'

export const AmenitiesSchema = z.object({
  potableWater: z.boolean(),
  toilets: z.enum(['none', 'vault', 'flush']),
  showers: z.boolean(),
  electricity: z.boolean(),
  fireRings: z.boolean(),
  firewoodAvailable: z.boolean(),
  picnicTables: z.boolean(),
  bearLockers: z.boolean(),
  bearCountry: z.boolean(),
  trashService: z.boolean(),
  dumpStation: z.boolean(),
  cellService: z.enum(['none', 'weak', 'good']),
  potableWaterNote: z.string().optional(),
  accessLevel: z.enum(['drive-in', 'walk-in', 'backcountry']),
})

// 2-char uppercase US-state code (DR-31). Trailing whitespace rejected.
const StateCode = z.string().regex(/^[A-Z]{2}$/, 'state must be 2-char uppercase')

// Source-prefixed id (DR-30). The closed prefix set lives in lib/ids.ts.
const CampsiteIdRe = /^(seed|fixture|ridb|osm):.+/
const CampsiteIdSchema = z
  .string()
  .regex(CampsiteIdRe, 'id must be source-prefixed: seed|fixture|ridb|osm')

export const CampsiteSchema = z.object({
  id: CampsiteIdSchema,
  name: z.string().min(1),
  agency: z.string().optional(),
  state: StateCode.optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  description: z.string().optional(),
  amenities: AmenitiesSchema,
  activities: z.array(z.string()),
  source: z.string(),
})
