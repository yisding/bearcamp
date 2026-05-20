// Quantity math — WS-0-owned permanently (DR-1). Stub form for the TDD red
// pass; impl agent fills in the body per plan/packing-engine.md.

import type { TripItem } from '../db/types'

// Default tents-per-group capacity. Per-trip override lives on Trip.tentCapacity
// (DR-21). Mirrored in prisma schema as @default(2); Prisma can't import TS so
// the literal `2` is duplicated, documented in plan/data-model.md.
export const TENT_CAPACITY = 2

export function requiredQty(
  _item: TripItem,
  _participantCount: number,
  _tentCapacity: number = TENT_CAPACITY,
): number {
  throw new Error('requiredQty not implemented (WS-0.7 — impl phase)')
}
