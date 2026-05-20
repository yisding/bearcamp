// Domain DTOs (Prisma-free) — WS-0.3.
// Exactly the contract from plan/data-model.md. Imported everywhere; no
// `@prisma/client` types should leak past lib/db/*.

export type TripStyle = 'car' | 'backpacking'

export type ItemScope = 'per_person' | 'shared' | 'per_tent'

// Display values — Prisma DB enum uses underscores (Health_Safety, etc.) and
// repositories map to/from these display strings. See plan/data-model.md
// "Enum mapping note".
export type ItemCategory =
  | 'Shelter'
  | 'Sleep'
  | 'Kitchen'
  | 'Water'
  | 'Food'
  | 'Clothing'
  | 'Navigation'
  | 'Health & Safety'
  | 'Hygiene'
  | 'Tools & Repair'
  | 'Personal & Misc'

export interface Amenities {
  potableWater: boolean
  toilets: 'none' | 'vault' | 'flush'
  showers: boolean
  electricity: boolean
  fireRings: boolean
  firewoodAvailable: boolean
  picnicTables: boolean
  bearLockers: boolean
  bearCountry: boolean
  trashService: boolean
  dumpStation: boolean
  cellService: 'none' | 'weak' | 'good'
  potableWaterNote?: string
  accessLevel: 'drive-in' | 'walk-in' | 'backcountry'
}

export interface Campsite {
  // Source-prefixed: 'seed:<slug>' | 'fixture:<slug>' | 'ridb:<id>' |
  // 'osm:<id>' — never bare. Enforced by zod schema in lib/validation/domain.ts.
  id: string
  name: string
  agency?: string
  // Validated 2-char US-state code (^[A-Z]{2}$) via zod. DR-31.
  state?: string
  lat?: number
  lng?: number
  description?: string
  amenities: Amenities
  activities: string[]
  source: string
}

export interface TripItem {
  id: string
  tripId: string
  category: ItemCategory
  name: string
  scope: ItemScope
  baseQty: number
  unit?: string
  note?: string
  source: 'template' | 'amenity' | 'custom'
  sortOrder: number
  // Soft-delete (DR-19). Items with removed=true are hidden from the main
  // list and "still needed"; claims on them surface under "no longer needed".
  removed: boolean
}

export interface Participant {
  id: string
  tripId: string
  name: string
  isOwner: boolean
  joinedAt: number
}

export interface Claim {
  itemId: string
  participantId: string
  qty: number
}

export interface Trip {
  id: string
  name: string
  campsiteId: string
  // Snapshot of the campsite at creation. Mutating Campsite later must NOT
  // affect existing trips (T2.14 — G-snap).
  campsite: Pick<Campsite, 'name' | 'amenities' | 'state' | 'agency'>
  style: TripStyle
  // Per-trip; bounds [TENT_CAPACITY_MIN, TENT_CAPACITY_MAX] from lib/limits.ts.
  // DR-21.
  tentCapacity: number
  createdAt: number
}

export interface TripViewItem extends TripItem {
  needed: number
  claimed: number
  shortfall: number
  claims: Array<{ participant: Participant; qty: number }>
}

export interface RemovedItemWithClaims extends TripItem {
  claims: Array<{ participant: Participant; qty: number }>
}

export interface TripView {
  trip: Trip
  participants: Participant[]
  // Visible (removed=false) items with shortfall/claim math computed.
  items: TripViewItem[]
  // Removed items that still have live claims, so participants see why a
  // claim they made disappeared. DR-19 / G-soft.
  removedItemsWithClaims: RemovedItemWithClaims[]
}
