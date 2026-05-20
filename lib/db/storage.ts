// StorageAdapter — fully-async repository surface (WS-0.4).
// Every method returns Promise<…> so the Prisma/Neon impl (WS-2) is a drop-in
// for the in-memory fake (WS-0.5). The fake wraps values in Promise.resolve.

import type {
  Amenities,
  Campsite,
  Claim,
  ItemCategory,
  ItemScope,
  Participant,
  Trip,
  TripItem,
  TripStyle,
  TripView,
} from './types'

// SearchArgs (data-model.md). Bounds come from lib/limits.ts —
// SEARCH_PAGE_SIZE_DEFAULT / SEARCH_PAGE_SIZE_MAX (G-page / DR-23).
export interface SearchArgs {
  q?: string
  state?: string
  agency?: string
  amenities?: (keyof Amenities)[]
  page?: number
  pageSize?: number
}

export interface SearchResult {
  campsites: Campsite[]
  total: number
  page: number
  pageSize: number
}

// ---- Sub-surfaces ----

export interface CampsitesRepo {
  upsertMany(rows: Campsite[]): Promise<void>
  search(args: SearchArgs): Promise<SearchResult>
  getById(id: string): Promise<Campsite | null>
}

export interface CreateTripInput {
  name: string
  campsiteId: string
  campsite: Pick<Campsite, 'name' | 'amenities' | 'state' | 'agency'>
  style: TripStyle
  // Optional — defaults to TENT_CAPACITY (lib/packing/quantities.ts) at the
  // adapter level if not provided.
  tentCapacity?: number
  // Owner participant created inline (auto-join, DR-4).
  ownerName: string
  ownerToken: string
  ownerParticipantToken: string
  // The generated items (from lib/packing/generate). The adapter persists
  // them with stable cuid ids and sortOrder.
  items: Array<
    Omit<TripItem, 'id' | 'tripId' | 'sortOrder' | 'removed'> & {
      sortOrder?: number
    }
  >
}

export interface CreateTripResult {
  trip: Trip
  owner: Participant
}

export interface TripsRepo {
  create(input: CreateTripInput): Promise<CreateTripResult>
  getById(id: string): Promise<Trip | null>
  rename(id: string, name: string): Promise<Trip>
  updateSettings(id: string, patch: { tentCapacity?: number }): Promise<Trip>
  delete(id: string): Promise<void>
  // Owner lookup by Trip.id + cookie token compare (data-model.md DR-53).
  byOwnerToken(id: string, token: string): Promise<Trip | null>
}

// Restricted patch (frozen rule, plan I-C / DR-3).
export type TripItemPatch = Partial<
  Pick<TripItem, 'name' | 'category' | 'scope' | 'baseQty' | 'unit' | 'note'>
>

export interface AddItemInput {
  tripId: string
  category: ItemCategory
  name: string
  scope: ItemScope
  baseQty?: number
  unit?: string
  note?: string
  source: 'template' | 'amenity' | 'custom'
  // Optional — repo computes from current max if omitted.
  sortOrder?: number
}

export interface ReorderArgs {
  beforeItemId?: string
  newIndex?: number
}

export interface ItemsRepo {
  listByTrip(tripId: string): Promise<TripItem[]>
  add(input: AddItemInput): Promise<TripItem>
  update(id: string, patch: TripItemPatch): Promise<TripItem>
  softRemove(id: string): Promise<TripItem>
  restore(id: string): Promise<TripItem>
  reorder(tripId: string, itemId: string, args: ReorderArgs): Promise<void>
}

export interface ParticipantsRepo {
  listByTrip(tripId: string): Promise<Participant[]>
  add(
    tripId: string,
    name: string,
    isOwner: boolean,
    token: string,
  ): Promise<Participant>
  byToken(tripId: string, token: string): Promise<Participant | null>
  count(tripId: string): Promise<number>
}

export interface ClaimsRepo {
  listByTrip(tripId: string): Promise<Claim[]>
  upsert(itemId: string, participantId: string, qty: number): Promise<Claim>
  remove(itemId: string, participantId: string): Promise<void>
}

export interface ViewRepo {
  // null for unknown tripId (G8 / DR — trip page → notFound()).
  buildTripView(tripId: string): Promise<TripView | null>
}

// ---- The composed adapter ----

export interface StorageAdapter {
  campsites: CampsitesRepo
  trips: TripsRepo
  items: ItemsRepo
  participants: ParticipantsRepo
  claims: ClaimsRepo
  view: ViewRepo
}
