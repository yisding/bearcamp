// T1.4 — base snapshots (WS-1.4).
//
// generate('car', ∅) and generate('backpacking', ∅) match committed
// snapshots. "∅" means amenities that activate no rule branches — we pick
// the baseline (all amenities present / true) so rules with !X conditions
// don't fire. This pins the *template* slice the engine emits.
//
// Snapshots will be regenerated when the implementer lands generate.ts +
// templates.ts. First red-phase run will fail with the WS-0 stub's output.
//
// We strip the four caller-assigned fields (id, tripId, sortOrder, removed)
// from the snapshot so the *content* — not row identity — is what's pinned.
// `sortOrder` is asserted separately via category ordering in T1.5.

import { describe, it, expect } from 'vitest'
import { generate } from '../index'
import { baseAmenities } from './_helpers'
import type { TripItem } from '../../db/types'

type Snapshottable = Omit<TripItem, 'id' | 'tripId'>

function snapshottable(items: TripItem[]): Snapshottable[] {
  return items.map((it) => ({
    category: it.category,
    name: it.name,
    scope: it.scope,
    baseQty: it.baseQty,
    unit: it.unit,
    note: it.note,
    source: it.source,
    sortOrder: it.sortOrder,
    removed: it.removed,
  }))
}

describe('T1.4 base snapshots', () => {
  // "Empty amenities" in spec = a neutral profile that does NOT trigger any
  // rule branch. baseAmenities() has every flag true / present.
  const neutral = baseAmenities()

  it('generate("car", neutral) matches committed snapshot', () => {
    const result = snapshottable(generate('car', neutral))
    expect(result).toMatchSnapshot()
  })

  it('generate("backpacking", neutral) matches committed snapshot', () => {
    const result = snapshottable(generate('backpacking', neutral))
    expect(result).toMatchSnapshot()
  })
})
