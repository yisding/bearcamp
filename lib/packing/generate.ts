// Stub generate() — WS-0.7 ships the stub; WS-1 replaces this file behind
// the unchanged barrel (B1/B2). Real templates + rules ship in WS-1.
//
// The stub returns one realistic item per ItemCategory so downstream
// consumers (WS-2/6/smoke) can render an end-to-end list without waiting on
// the real engine. Ids/tripId/sortOrder/removed are populated by the
// repository (see CreateTripInput.items in lib/db/storage.ts).

import type {
  Amenities,
  ItemCategory,
  ItemScope,
  TripItem,
  TripStyle,
} from '../db/types'

// Stub template — covers all 11 categories so generated.cats === categories.
// `unused` params kept so the WS-1 signature is identical.
interface StubItem {
  category: ItemCategory
  name: string
  scope: ItemScope
  baseQty: number
  source: TripItem['source']
  unit?: string
  note?: string
}

const STUB_ITEMS: StubItem[] = [
  { category: 'Shelter', name: 'Tent', scope: 'per_tent', baseQty: 1, source: 'template' },
  { category: 'Sleep', name: 'Sleeping bag', scope: 'per_person', baseQty: 1, source: 'template' },
  { category: 'Kitchen', name: 'Stove', scope: 'shared', baseQty: 1, source: 'template' },
  { category: 'Water', name: 'Water bottles', scope: 'per_person', baseQty: 1, source: 'template' },
  { category: 'Food', name: 'Meals & snacks', scope: 'per_person', baseQty: 1, source: 'template' },
  { category: 'Clothing', name: 'Layers', scope: 'per_person', baseQty: 1, source: 'template' },
  { category: 'Navigation', name: 'Headlamp', scope: 'per_person', baseQty: 1, source: 'template' },
  { category: 'Health & Safety', name: 'First-aid kit', scope: 'shared', baseQty: 1, source: 'template' },
  { category: 'Hygiene', name: 'Toiletries', scope: 'per_person', baseQty: 1, source: 'template' },
  { category: 'Tools & Repair', name: 'Multi-tool', scope: 'shared', baseQty: 1, source: 'template' },
  { category: 'Personal & Misc', name: 'ID / permits', scope: 'per_person', baseQty: 1, source: 'template' },
]

// Caller (storage adapter) assigns id/tripId/sortOrder/removed. Returning
// `TripItem` typed for consumer convenience but those four fields are
// placeholders.
export function generate(_style: TripStyle, _amenities: Amenities): TripItem[] {
  return STUB_ITEMS.map((it, idx) => ({
    id: '',
    tripId: '',
    category: it.category,
    name: it.name,
    scope: it.scope,
    baseQty: it.baseQty,
    unit: it.unit,
    note: it.note,
    source: it.source,
    sortOrder: idx,
    removed: false,
  }))
}
