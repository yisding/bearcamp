// WS-7 T7.2 — Action input validation (red phase).
//
// Targets `lib/validation/actions.ts` (does not exist yet — expected red).
// Each Server Action gets a zod schema exposed by name; the suite asserts:
//   - bad input rejected (missing fields, wrong enums, empties, negatives).
//   - `UpdateItemSchema` rejects `id` / `source` / `removed` / `tripId` edits
//     and accepts ONLY the 6 editable fields (review G1).
//   - `UpdateTripSettingsSchema` accepts `tentCapacity` ∈ [1, 12]; rejects
//     0, 13, '' (DR-21).
//   - `RestoreItemSchema` and `DeleteTripSchema` reject extra fields
//     (DR-19/DR-20).
//   - `JoinTripSchema` / `ClaimItemSchema` / `UnclaimItemSchema` reject any
//     `participantId` / token field (review I-C).

import { describe, it, expect } from 'vitest'

// Real validation module — does not exist yet (red).
import {
  CreateTripSchema,
  RenameTripSchema,
  UpdateTripSettingsSchema,
  DeleteTripSchema,
  AddItemSchema,
  UpdateItemSchema,
  RemoveItemSchema,
  RestoreItemSchema,
  ReorderItemSchema,
  JoinTripSchema,
  ClaimItemSchema,
  UnclaimItemSchema,
} from '../../validation/actions'

// ---------- createTrip ----------

describe('T7.2 CreateTripSchema', () => {
  it('rejects missing campsiteId', () => {
    const r = CreateTripSchema.safeParse({ style: 'car' })
    expect(r.success).toBe(false)
  })

  it('rejects unknown style', () => {
    const r = CreateTripSchema.safeParse({ campsiteId: 'fixture:x', style: 'rocket' })
    expect(r.success).toBe(false)
  })

  it('accepts valid input', () => {
    const r = CreateTripSchema.safeParse({ campsiteId: 'fixture:x', style: 'car' })
    expect(r.success).toBe(true)
  })

  it('accepts both styles', () => {
    expect(
      CreateTripSchema.safeParse({ campsiteId: 'fixture:x', style: 'car' }).success,
    ).toBe(true)
    expect(
      CreateTripSchema.safeParse({ campsiteId: 'fixture:x', style: 'backpacking' }).success,
    ).toBe(true)
  })
})

// ---------- renameTrip ----------

describe('T7.2 RenameTripSchema', () => {
  it('rejects empty name', () => {
    expect(
      RenameTripSchema.safeParse({ tripId: 'trip_1', name: '' }).success,
    ).toBe(false)
  })

  it('rejects missing tripId', () => {
    expect(RenameTripSchema.safeParse({ name: 'Nice' }).success).toBe(false)
  })

  it('accepts valid name', () => {
    expect(
      RenameTripSchema.safeParse({ tripId: 'trip_1', name: 'My Weekend' }).success,
    ).toBe(true)
  })
})

// ---------- updateTripSettings ----------

describe('T7.2 UpdateTripSettingsSchema (DR-21)', () => {
  it('accepts tentCapacity in [1, 12]', () => {
    for (const cap of [1, 2, 6, 12]) {
      const r = UpdateTripSettingsSchema.safeParse({
        tripId: 'trip_1',
        patch: { tentCapacity: cap },
      })
      expect(r.success).toBe(true)
    }
  })

  it('rejects tentCapacity = 0', () => {
    expect(
      UpdateTripSettingsSchema.safeParse({
        tripId: 'trip_1',
        patch: { tentCapacity: 0 },
      }).success,
    ).toBe(false)
  })

  it('rejects tentCapacity = 13', () => {
    expect(
      UpdateTripSettingsSchema.safeParse({
        tripId: 'trip_1',
        patch: { tentCapacity: 13 },
      }).success,
    ).toBe(false)
  })

  it('rejects tentCapacity = "" (string)', () => {
    expect(
      UpdateTripSettingsSchema.safeParse({
        tripId: 'trip_1',
        patch: { tentCapacity: '' as unknown as number },
      }).success,
    ).toBe(false)
  })

  it('rejects negative tentCapacity', () => {
    expect(
      UpdateTripSettingsSchema.safeParse({
        tripId: 'trip_1',
        patch: { tentCapacity: -1 },
      }).success,
    ).toBe(false)
  })
})

// ---------- deleteTrip ----------

describe('T7.2 DeleteTripSchema (DR-20)', () => {
  it('accepts { tripId }', () => {
    expect(DeleteTripSchema.safeParse({ tripId: 'trip_1' }).success).toBe(true)
  })

  it('rejects extra fields (strict)', () => {
    const r = DeleteTripSchema.safeParse({
      tripId: 'trip_1',
      // attempted overreach
      participantId: 'p_1',
    } as unknown as { tripId: string })
    expect(r.success).toBe(false)
  })

  it('rejects missing tripId', () => {
    expect(DeleteTripSchema.safeParse({}).success).toBe(false)
  })
})

// ---------- addItem ----------

describe('T7.2 AddItemSchema', () => {
  it('rejects empty name', () => {
    expect(
      AddItemSchema.safeParse({
        tripId: 'trip_1',
        category: 'Food',
        name: '',
        scope: 'per_person',
        baseQty: 1,
      }).success,
    ).toBe(false)
  })

  it('rejects negative baseQty', () => {
    expect(
      AddItemSchema.safeParse({
        tripId: 'trip_1',
        category: 'Food',
        name: 'Snacks',
        scope: 'per_person',
        baseQty: -1,
      }).success,
    ).toBe(false)
  })

  it('rejects unknown scope', () => {
    expect(
      AddItemSchema.safeParse({
        tripId: 'trip_1',
        category: 'Food',
        name: 'Snacks',
        scope: 'per-tent', // wrong format
        baseQty: 1,
      }).success,
    ).toBe(false)
  })

  it('accepts valid input', () => {
    expect(
      AddItemSchema.safeParse({
        tripId: 'trip_1',
        category: 'Food',
        name: 'Snacks',
        scope: 'per_person',
        baseQty: 2,
      }).success,
    ).toBe(true)
  })
})

// ---------- updateItem (G1) ----------

describe('T7.2 UpdateItemSchema — restricted to 6 editable fields (G1)', () => {
  const valid = { tripId: 'trip_1', itemId: 'i_1' }

  it('accepts patch with only name', () => {
    const r = UpdateItemSchema.safeParse({
      ...valid,
      patch: { name: 'Renamed' },
    })
    expect(r.success).toBe(true)
  })

  it('accepts each of the 6 editable fields individually', () => {
    const fields: Array<Record<string, unknown>> = [
      { name: 'Renamed' },
      { category: 'Food' },
      { scope: 'per_person' },
      { baseQty: 3 },
      { unit: 'L' },
      { note: 'remember this' },
    ]
    for (const patch of fields) {
      const r = UpdateItemSchema.safeParse({ ...valid, patch })
      expect(r.success).toBe(true)
    }
  })

  for (const forbidden of ['id', 'source', 'removed', 'tripId'] as const) {
    it(`rejects edits to forbidden field "${forbidden}"`, () => {
      const patch: Record<string, unknown> = {
        id: 'i_other',
        source: 'template',
        removed: true,
        tripId: 'trip_other',
      }
      // Single-field patch with the forbidden key.
      const r = UpdateItemSchema.safeParse({
        ...valid,
        patch: { [forbidden]: patch[forbidden] },
      })
      expect(r.success).toBe(false)
    })
  }

  it('rejects unknown patch fields (sortOrder)', () => {
    const r = UpdateItemSchema.safeParse({
      ...valid,
      patch: { sortOrder: 99 } as unknown as { name?: string },
    })
    expect(r.success).toBe(false)
  })

  it('rejects negative baseQty', () => {
    const r = UpdateItemSchema.safeParse({
      ...valid,
      patch: { baseQty: -2 },
    })
    expect(r.success).toBe(false)
  })

  it('rejects empty name in patch', () => {
    const r = UpdateItemSchema.safeParse({
      ...valid,
      patch: { name: '' },
    })
    expect(r.success).toBe(false)
  })
})

// ---------- removeItem ----------

describe('T7.2 RemoveItemSchema', () => {
  it('accepts { tripId, itemId }', () => {
    expect(
      RemoveItemSchema.safeParse({ tripId: 'trip_1', itemId: 'i_1' }).success,
    ).toBe(true)
  })
  it('rejects missing itemId', () => {
    expect(RemoveItemSchema.safeParse({ tripId: 'trip_1' }).success).toBe(false)
  })
})

// ---------- restoreItem (DR-19) ----------

describe('T7.2 RestoreItemSchema (DR-19)', () => {
  it('accepts { tripId, itemId }', () => {
    expect(
      RestoreItemSchema.safeParse({ tripId: 'trip_1', itemId: 'i_1' }).success,
    ).toBe(true)
  })

  it('rejects missing itemId', () => {
    expect(RestoreItemSchema.safeParse({ tripId: 'trip_1' }).success).toBe(false)
  })

  it('rejects extra fields (strict)', () => {
    const r = RestoreItemSchema.safeParse({
      tripId: 'trip_1',
      itemId: 'i_1',
      removed: false,
    } as unknown as { tripId: string; itemId: string })
    expect(r.success).toBe(false)
  })
})

// ---------- reorderItem ----------

describe('T7.2 ReorderItemSchema', () => {
  it('accepts { tripId, itemId, newIndex }', () => {
    expect(
      ReorderItemSchema.safeParse({
        tripId: 'trip_1',
        itemId: 'i_1',
        newIndex: 0,
      }).success,
    ).toBe(true)
  })

  it('accepts { tripId, itemId, beforeItemId }', () => {
    expect(
      ReorderItemSchema.safeParse({
        tripId: 'trip_1',
        itemId: 'i_1',
        beforeItemId: 'i_2',
      }).success,
    ).toBe(true)
  })

  it('rejects negative newIndex', () => {
    expect(
      ReorderItemSchema.safeParse({
        tripId: 'trip_1',
        itemId: 'i_1',
        newIndex: -1,
      }).success,
    ).toBe(false)
  })
})

// ---------- joinTrip / claim / unclaim — I-C: no participantId/token ----------

describe('T7.2 JoinTripSchema — never accepts participantId/token (I-C)', () => {
  it('accepts { tripId, name }', () => {
    expect(
      JoinTripSchema.safeParse({ tripId: 'trip_1', name: 'Joiner' }).success,
    ).toBe(true)
  })

  it('rejects empty name', () => {
    expect(
      JoinTripSchema.safeParse({ tripId: 'trip_1', name: '' }).success,
    ).toBe(false)
  })

  it('rejects participantId field (I-C)', () => {
    const r = JoinTripSchema.safeParse({
      tripId: 'trip_1',
      name: 'Joiner',
      participantId: 'p_evil',
    } as unknown as { tripId: string; name: string })
    expect(r.success).toBe(false)
  })

  it('rejects token field (I-C)', () => {
    const r = JoinTripSchema.safeParse({
      tripId: 'trip_1',
      name: 'Joiner',
      token: 'evil-token',
    } as unknown as { tripId: string; name: string })
    expect(r.success).toBe(false)
  })
})

describe('T7.2 ClaimItemSchema — never accepts participantId/token (I-C)', () => {
  it('accepts { tripId, itemId, qty }', () => {
    expect(
      ClaimItemSchema.safeParse({
        tripId: 'trip_1',
        itemId: 'i_1',
        qty: 1,
      }).success,
    ).toBe(true)
  })

  it('rejects negative qty', () => {
    expect(
      ClaimItemSchema.safeParse({
        tripId: 'trip_1',
        itemId: 'i_1',
        qty: -1,
      }).success,
    ).toBe(false)
  })

  it('rejects participantId field (I-C)', () => {
    const r = ClaimItemSchema.safeParse({
      tripId: 'trip_1',
      itemId: 'i_1',
      qty: 1,
      participantId: 'p_evil',
    } as unknown as { tripId: string; itemId: string; qty: number })
    expect(r.success).toBe(false)
  })

  it('rejects token field (I-C)', () => {
    const r = ClaimItemSchema.safeParse({
      tripId: 'trip_1',
      itemId: 'i_1',
      qty: 1,
      token: 'evil-token',
    } as unknown as { tripId: string; itemId: string; qty: number })
    expect(r.success).toBe(false)
  })
})

describe('T7.2 UnclaimItemSchema — never accepts participantId/token (I-C)', () => {
  it('accepts { tripId, itemId }', () => {
    expect(
      UnclaimItemSchema.safeParse({ tripId: 'trip_1', itemId: 'i_1' }).success,
    ).toBe(true)
  })

  it('rejects participantId field (I-C)', () => {
    const r = UnclaimItemSchema.safeParse({
      tripId: 'trip_1',
      itemId: 'i_1',
      participantId: 'p_evil',
    } as unknown as { tripId: string; itemId: string })
    expect(r.success).toBe(false)
  })

  it('rejects token field (I-C)', () => {
    const r = UnclaimItemSchema.safeParse({
      tripId: 'trip_1',
      itemId: 'i_1',
      token: 'evil-token',
    } as unknown as { tripId: string; itemId: string })
    expect(r.success).toBe(false)
  })
})
