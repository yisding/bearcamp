// Frozen Server Action input/return types — WS-0.8.
// Every action returns Promise<Result<T>> from lib/trips/result.ts.
// Frozen rules (I-C / DR-3 / DR-21 / DR-19 / DR-20 / DR-56):
//   - join/claim/unclaim inputs MUST NOT include participantId or any token
//     (server resolves from bc_participant cookie).
//   - updateItem patch is restricted to name|category|scope|baseQty|unit|note.
//   - updateTripSettings patch is restricted to { tentCapacity? }.
//   - restoreItem input is { tripId, itemId }.
//   - deleteTrip input is { tripId }.
//   - reorderItem is { tripId, itemId, beforeItemId? | newIndex? }.

import type { Result } from './result'
import type {
  ItemCategory,
  ItemScope,
  Trip,
  TripItem,
  TripStyle,
  Participant,
  Claim,
} from '../db/types'

// ---- createTrip ----
export interface CreateTripInput {
  campsiteId: string
  style: TripStyle
  name?: string
  ownerName?: string
}
export interface CreateTripData {
  trip: Trip
  owner: Participant
}
export type CreateTripResult = Result<CreateTripData>

// ---- renameTrip ----
export interface RenameTripInput {
  tripId: string
  name: string
}
export type RenameTripResult = Result<Trip>

// ---- updateTripSettings ----
export interface UpdateTripSettingsInput {
  tripId: string
  patch: Partial<Pick<Trip, 'tentCapacity'>>
}
export type UpdateTripSettingsResult = Result<Trip>

// ---- deleteTrip ----
export interface DeleteTripInput {
  tripId: string
}
// Action redirects on success — but the envelope shape is still required
// for type-uniformity (failure path returns it; success-path redirect throws
// outside the try/catch per DR-45).
export type DeleteTripResult = Result<{ tripId: string }>

// ---- addItem ----
export interface AddItemInput {
  tripId: string
  category: ItemCategory
  name: string
  scope: ItemScope
  baseQty?: number
  unit?: string
  note?: string
}
export type AddItemResult = Result<TripItem>

// ---- updateItem ----
export type UpdateItemPatch = Partial<
  Pick<TripItem, 'name' | 'category' | 'scope' | 'baseQty' | 'unit' | 'note'>
>
export interface UpdateItemInput {
  tripId: string
  itemId: string
  patch: UpdateItemPatch
}
export type UpdateItemResult = Result<TripItem>

// ---- removeItem ----
export interface RemoveItemInput {
  tripId: string
  itemId: string
}
export type RemoveItemResult = Result<TripItem>

// ---- restoreItem ----
export interface RestoreItemInput {
  tripId: string
  itemId: string
}
export type RestoreItemResult = Result<TripItem>

// ---- reorderItem ----
export interface ReorderItemInput {
  tripId: string
  itemId: string
  beforeItemId?: string
  newIndex?: number
}
export type ReorderItemResult = Result<{ tripId: string; itemId: string }>

// ---- joinTrip ---- (I-C: no participantId/token in input)
export interface JoinTripInput {
  tripId: string
  name: string
}
export type JoinTripResult = Result<Participant>

// ---- claimItem ---- (I-C)
export interface ClaimItemInput {
  tripId: string
  itemId: string
  qty: number
}
export type ClaimItemResult = Result<Claim>

// ---- unclaimItem ---- (I-C)
export interface UnclaimItemInput {
  tripId: string
  itemId: string
}
export type UnclaimItemResult = Result<{ itemId: string }>
