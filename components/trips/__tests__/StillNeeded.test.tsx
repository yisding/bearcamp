// @vitest-environment jsdom
// T6.6 (a) — StillNeeded (WS-6.8).
//
// Acceptance:
//   - Only renders visible (removed=false) items with shortfall > 0, formatted
//     as `claimed/needed` (e.g. "Sleeping bag — 2 of 4").
//   - Excludes items with shortfall === 0 (fully claimed / over-claimed).
//   - Excludes removed items (those belong to NoLongerNeeded).

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

import type {
  TripView,
  TripViewItem,
  Trip,
  Participant,
  ItemCategory,
  ItemScope,
} from '@/lib/db/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/trips/trip_x',
}))

async function loadStillNeeded() {
  const mod = await import('@/components/trips/StillNeeded')
  return mod.StillNeeded ?? mod.default
}

function mkItem(
  partial: Partial<TripViewItem> & {
    id: string
    name: string
    needed: number
    claimed: number
  },
): TripViewItem {
  return {
    id: partial.id,
    tripId: 'trip_x',
    category: (partial.category ?? 'Shelter') as ItemCategory,
    name: partial.name,
    scope: (partial.scope ?? 'shared') as ItemScope,
    baseQty: partial.baseQty ?? 1,
    unit: partial.unit,
    note: partial.note,
    source: partial.source ?? 'template',
    sortOrder: partial.sortOrder ?? 0,
    removed: false,
    needed: partial.needed,
    claimed: partial.claimed,
    shortfall: Math.max(0, partial.needed - partial.claimed),
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
  return { trip, participants, items, removedItemsWithClaims: [] }
}

describe('T6.6 StillNeeded', () => {
  it('lists only items with shortfall > 0 in claimed/needed format', async () => {
    const StillNeeded = await loadStillNeeded()
    const items = [
      mkItem({ id: 'a', name: 'Sleeping bag', needed: 4, claimed: 2 }),
      mkItem({ id: 'b', name: 'Stove', needed: 1, claimed: 1 }), // covered
      mkItem({ id: 'c', name: 'Filter', needed: 2, claimed: 0 }),
    ]
    render(<StillNeeded view={mkView(items)} />)

    // Sleeping bag — 2 of 4 visible.
    expect(screen.getByText(/sleeping bag/i)).toBeInTheDocument()
    // Accept either "2 of 4" or "2/4".
    const sleepingNumbers = screen.getAllByText(/\b2\s*(of|\/)\s*4\b/i)
    expect(sleepingNumbers.length).toBeGreaterThan(0)

    // Filter — 0 of 2 visible.
    expect(screen.getByText(/filter/i)).toBeInTheDocument()
    expect(screen.getByText(/\b0\s*(of|\/)\s*2\b/i)).toBeInTheDocument()

    // Stove should NOT appear (shortfall=0).
    expect(screen.queryByText(/stove/i)).toBeNull()
  })

  it('excludes over-claimed items (shortfall=0)', async () => {
    const StillNeeded = await loadStillNeeded()
    const items = [
      mkItem({ id: 'a', name: 'Cooler', needed: 3, claimed: 5 }),
    ]
    render(<StillNeeded view={mkView(items)} />)
    expect(screen.queryByText(/cooler/i)).toBeNull()
  })

  it('renders an EmptyState when nothing is still needed', async () => {
    const StillNeeded = await loadStillNeeded()
    const items = [
      mkItem({ id: 'a', name: 'Covered', needed: 1, claimed: 1 }),
    ]
    render(<StillNeeded view={mkView(items)} />)
    // Either an empty-state slot is rendered, or a message indicates "all
    // covered" / "nothing to bring".
    const text = document.body.textContent ?? ''
    const hasSignal =
      /nothing\s+still\s+needed|all\s+covered|all\s+set|nothing\s+to\s+bring/i.test(
        text,
      ) || document.querySelector('[data-slot="empty-state"]') !== null
    expect(hasSignal).toBe(true)
  })
})
