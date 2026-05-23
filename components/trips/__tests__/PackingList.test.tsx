// @vitest-environment jsdom
// T6.2 — PackingList (WS-6.4).
//
// Acceptance:
//   - Items render grouped in the fixed category order from
//     plan/packing-engine.md:
//       Shelter → Sleep → Kitchen → Water → Food → Clothing → Navigation →
//       Health & Safety → Hygiene → Tools & Repair → Personal & Misc
//   - Owner-only affordances (add custom item / rename trip-level button /
//     bulk actions) are gated by `isOwner`. Non-owners see read-only.
//
// PackingList is a server component at `components/trips/PackingList.tsx`.
// It receives the TripView (already shape-built by buildTripView) plus
// the resolved `isOwner` flag. The component composes ItemRow per item.

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

import type {
  Participant,
  Trip,
  TripView,
  TripViewItem,
  ItemCategory,
  ItemScope,
} from '@/lib/db/types'

// Stub ItemRow so this test focuses on grouping/ordering, not row internals.
// The implementation may render real ItemRow children — that's fine, the
// `data-testid` we assert below is the heading per category, not the row.
vi.mock('@/components/trips/ItemRow', () => ({
  ItemRow: ({ item }: { item: TripViewItem }) =>
    React.createElement(
      'li',
      { 'data-testid': 'item-row', 'data-category': item.category },
      item.name,
    ),
}))

// Mock next/navigation in case the (server) component imports anything
// that touches it via shared deps. Harmless if unused.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/trips/trip_x',
}))

async function loadPackingList() {
  const mod = await import('@/components/trips/PackingList')
  return mod.PackingList ?? mod.default
}

const CATEGORY_ORDER: ItemCategory[] = [
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
]

function mkItem(
  partial: Partial<TripViewItem> & { category: ItemCategory; name: string },
): TripViewItem {
  return {
    id: partial.id ?? `i_${partial.name}`,
    tripId: 'trip_x',
    category: partial.category,
    name: partial.name,
    scope: (partial.scope ?? 'shared') as ItemScope,
    baseQty: partial.baseQty ?? 1,
    unit: partial.unit,
    note: partial.note,
    source: partial.source ?? 'template',
    sortOrder: partial.sortOrder ?? 0,
    removed: false,
    needed: partial.needed ?? 1,
    claimed: partial.claimed ?? 0,
    shortfall: partial.shortfall ?? 1,
    claims: partial.claims ?? [],
  }
}

function mkView(items: TripViewItem[], participants: Participant[] = []): TripView {
  const trip: Trip = {
    id: 'trip_x',
    name: 'Trip X',
    campsiteId: 'fixture:big-sur-state',
    campsite: { name: 'Big Sur', amenities: {} as never },
    style: 'car',
    tentCapacity: 2,
    createdAt: Date.now(),
  }
  return {
    trip,
    participants,
    items,
    removedItemsWithClaims: [],
  }
}

describe('T6.2 PackingList', () => {
  it('groups items by category in the fixed order', async () => {
    const PackingList = await loadPackingList()
    // Provide one item in each category, on purpose out of order, to verify
    // the component re-orders them.
    const shuffled: ItemCategory[] = [
      'Personal & Misc',
      'Health & Safety',
      'Shelter',
      'Kitchen',
      'Sleep',
      'Hygiene',
      'Water',
      'Tools & Repair',
      'Food',
      'Clothing',
      'Navigation',
    ]
    const items = shuffled.map((cat) =>
      mkItem({ category: cat, name: `Item-${cat}` }),
    )
    render(<PackingList view={mkView(items)} isOwner={true} />)

    // For each category we expect a region (Section) labelled with the
    // category name. Order is verified by the position of the headings in
    // the document.
    const headings = screen.getAllByRole('heading', {
      level: 2,
      name: new RegExp(
        CATEGORY_ORDER.map((c) =>
          c.replace(/[&]/g, '&').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        ).join('|'),
        'i',
      ),
    })
    const headingTexts = headings.map((h) => h.textContent ?? '')
    // Filter to the category names we expect — implementations may add
    // other h2's (e.g. "Still needed") in the same parent, but we render
    // PackingList directly so that should not appear.
    const seen = headingTexts.filter((t) =>
      CATEGORY_ORDER.some((c) => t.includes(c)),
    )
    const indexes = CATEGORY_ORDER.map((c) =>
      seen.findIndex((t) => t.includes(c)),
    )
    // Every category present in `items` must appear in `seen`.
    expect(indexes.every((i) => i !== -1)).toBe(true)
    // And the order must be strictly ascending.
    const presentOrder = indexes.filter((i) => i !== -1)
    expect(presentOrder).toEqual([...presentOrder].sort((a, b) => a - b))
  })

  it('omits categories with no visible items', async () => {
    const PackingList = await loadPackingList()
    // Only Shelter + Kitchen.
    const items = [
      mkItem({ category: 'Shelter', name: 'Tent' }),
      mkItem({ category: 'Kitchen', name: 'Stove' }),
    ]
    render(<PackingList view={mkView(items)} isOwner={false} />)
    // Shelter and Kitchen appear; Clothing/Food/Hygiene etc do not.
    expect(
      screen.getByRole('heading', { level: 2, name: /shelter/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: /kitchen/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { level: 2, name: /^clothing$/i }),
    ).toBeNull()
    expect(
      screen.queryByRole('heading', { level: 2, name: /^food$/i }),
    ).toBeNull()
  })

  it('renders one row per item under its category', async () => {
    const PackingList = await loadPackingList()
    const items = [
      mkItem({ category: 'Shelter', name: 'Tent' }),
      mkItem({ category: 'Shelter', name: 'Footprint' }),
      mkItem({ category: 'Sleep', name: 'Sleeping bag' }),
    ]
    render(<PackingList view={mkView(items)} isOwner={false} />)
    const rows = screen.getAllByTestId('item-row')
    expect(rows).toHaveLength(3)
    const shelterRows = rows.filter(
      (r) => r.getAttribute('data-category') === 'Shelter',
    )
    expect(shelterRows).toHaveLength(2)
  })

  it('shows owner-only "Add item" affordance when isOwner=true', async () => {
    const PackingList = await loadPackingList()
    const items = [mkItem({ category: 'Shelter', name: 'Tent' })]
    render(<PackingList view={mkView(items)} isOwner={true} />)
    // Accept either a button "Add item" / "Add custom item" or a button
    // with an accessible name matching /add/i inside the packing list region.
    const add = screen.queryByRole('button', { name: /add\s+(custom\s+)?item/i })
    expect(add).not.toBeNull()
  })

  it('hides owner-only affordances when isOwner=false', async () => {
    const PackingList = await loadPackingList()
    const items = [mkItem({ category: 'Shelter', name: 'Tent' })]
    render(<PackingList view={mkView(items)} isOwner={false} />)
    expect(
      screen.queryByRole('button', { name: /add\s+(custom\s+)?item/i }),
    ).toBeNull()
  })
})
