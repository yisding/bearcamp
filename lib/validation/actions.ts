// WS-7.2 — Server Action input zod schemas (G1 / I-C / DR-19 / DR-20 / DR-21).
//
// Every Server Action validates its input through one of these schemas
// BEFORE any storage call. Schemas are `.strict()` so accidental/malicious
// extra keys (e.g. `participantId`, `token`, `removed`) are rejected.

import { z } from 'zod'
import { TENT_CAPACITY_MAX, TENT_CAPACITY_MIN } from '../limits'

// ---- Shared enums (single source of truth: lib/db/types.ts). ----

export const TripStyleSchema = z.enum(['car', 'backpacking'])

export const ItemScopeSchema = z.enum(['per_person', 'shared', 'per_tent'])

export const ItemCategorySchema = z.enum([
  'Shelter',
  'Sleep',
  'Kitchen',
  'Water',
  'Food',
  'Clothing',
  'Navigation',
  'Health & Safety',
  'Hygiene',
  'Tools & Repair',
  'Personal & Misc',
])

// ---- createTrip ----
// `name` / `ownerName` are optional UX nicety; the action picks sensible
// defaults when omitted.
export const CreateTripSchema = z
  .object({
    campsiteId: z.string().min(1, 'campsiteId is required'),
    style: TripStyleSchema,
    name: z.string().min(1).optional(),
    ownerName: z.string().min(1).optional(),
  })
  .strict()

// ---- renameTrip ----
export const RenameTripSchema = z
  .object({
    tripId: z.string().min(1),
    name: z.string().min(1, 'name is required'),
  })
  .strict()

// ---- updateTripSettings (DR-21) ----
// `tentCapacity` must be an integer ∈ [TENT_CAPACITY_MIN, TENT_CAPACITY_MAX].
// `patch` is `.strict()` so unrelated keys are rejected.
export const UpdateTripSettingsSchema = z
  .object({
    tripId: z.string().min(1),
    patch: z
      .object({
        tentCapacity: z
          .number()
          .int()
          .min(TENT_CAPACITY_MIN)
          .max(TENT_CAPACITY_MAX)
          .optional(),
      })
      .strict(),
  })
  .strict()

// ---- deleteTrip (DR-20) ----
export const DeleteTripSchema = z
  .object({
    tripId: z.string().min(1),
  })
  .strict()

// ---- addItem ----
export const AddItemSchema = z
  .object({
    tripId: z.string().min(1),
    category: ItemCategorySchema,
    name: z.string().min(1, 'name is required'),
    scope: ItemScopeSchema,
    baseQty: z.number().min(0).optional(),
    unit: z.string().optional(),
    note: z.string().optional(),
  })
  .strict()

// ---- updateItem (G1 — restricted to the 6 editable fields) ----
// Patch shape rejects edits to id / source / removed / tripId / sortOrder.
export const UpdateItemSchema = z
  .object({
    tripId: z.string().min(1),
    itemId: z.string().min(1),
    patch: z
      .object({
        name: z.string().min(1).optional(),
        category: ItemCategorySchema.optional(),
        scope: ItemScopeSchema.optional(),
        baseQty: z.number().min(0).optional(),
        unit: z.string().optional(),
        note: z.string().optional(),
      })
      .strict(),
  })
  .strict()

// ---- removeItem ----
export const RemoveItemSchema = z
  .object({
    tripId: z.string().min(1),
    itemId: z.string().min(1),
  })
  .strict()

// ---- restoreItem (DR-19) ----
export const RestoreItemSchema = z
  .object({
    tripId: z.string().min(1),
    itemId: z.string().min(1),
  })
  .strict()

// ---- reorderItem ----
export const ReorderItemSchema = z
  .object({
    tripId: z.string().min(1),
    itemId: z.string().min(1),
    beforeItemId: z.string().min(1).optional(),
    newIndex: z.number().int().min(0).optional(),
  })
  .strict()

// ---- joinTrip (I-C — no participantId/token in input) ----
export const JoinTripSchema = z
  .object({
    tripId: z.string().min(1),
    name: z.string().min(1, 'name is required'),
  })
  .strict()

// ---- claimItem (I-C) ----
export const ClaimItemSchema = z
  .object({
    tripId: z.string().min(1),
    itemId: z.string().min(1),
    qty: z.number().min(0),
  })
  .strict()

// ---- unclaimItem (I-C) ----
export const UnclaimItemSchema = z
  .object({
    tripId: z.string().min(1),
    itemId: z.string().min(1),
  })
  .strict()
