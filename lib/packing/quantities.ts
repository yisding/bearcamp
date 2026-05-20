// Quantity math — WS-0-owned permanently (DR-1). Per plan/packing-engine.md.

import type { TripItem } from '../db/types'

// Default tents-per-group capacity. Per-trip override lives on Trip.tentCapacity
// (DR-21). Mirrored in prisma schema as @default(2); Prisma can't import TS so
// the literal `2` is duplicated, documented in plan/data-model.md.
export const TENT_CAPACITY = 2

export function requiredQty(
  item: TripItem,
  participantCount: number,
  tentCapacity: number = TENT_CAPACITY,
): number {
  const n = Math.max(1, participantCount)
  const cap = Math.max(1, tentCapacity)
  switch (item.scope) {
    case 'per_person':
      return item.baseQty * n
    case 'per_tent':
      return item.baseQty * Math.ceil(n / cap)
    case 'shared':
      return item.baseQty
    default: {
      // Exhaustiveness — if a new ItemScope is added without a case, this
      // line fails to compile.
      const _never: never = item.scope
      return _never
    }
  }
}
