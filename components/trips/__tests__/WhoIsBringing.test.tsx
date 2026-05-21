// @vitest-environment jsdom
// T6.6 (b) — WhoIsBringing (WS-6.9).
//
// Acceptance:
//   - Renders claims grouped by participant, listing item name + qty per row.
//   - Reflects all claims, including those on removed items (with a
//     "no longer needed" tag — DR-19).

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

import type {
  TripView,
  TripViewItem,
  Trip,
  Participant,
  RemovedItemWithClaims,
  ItemCategory,
  ItemScope,
} from '@/lib/db/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/trips/trip_x',
}))

async function loadWhoIsBringing() {
  const mod = await import('@/components/trips/WhoIsBringing')
  return mod.WhoIsBringing ?? mod.default
}

const alice: Participant = {
  id: 'p_alice',
  tripId: 'trip_x',
  name: 'Alice',
  isOwner: true,
  joinedAt: 1,
}
const bob: Participant = {
  id: 'p_bob',
  tripId: 'trip_x',
  name: 'Bob',
  isOwner: false,
  joinedAt: 2,
}

function vi_item(
  partial: Partial<TripViewItem> & {
    id: string
    name: string
    claims: Array<{ participant: Participant; qty: number }>
  },
): TripViewItem {
  return {
    id: partial.id,
    tripId: 'trip_x',
    category: (partial.category ?? 'Shelter') as ItemCategory,
    name: partial.name,
    scope: (partial.scope ?? 'shared') as ItemScope,
    baseQty: partial.baseQty ?? 1,
    source: partial.source ?? 'template',
    sortOrder: partial.sortOrder ?? 0,
    removed: false,
    needed: partial.needed ?? 1,
    claimed: partial.claimed ?? 1,
    shortfall: partial.shortfall ?? 0,
    claims: partial.claims,
  }
}

function r_item(
  partial: Partial<RemovedItemWithClaims> & {
    id: string
    name: string
    claims: Array<{ participant: Participant; qty: number }>
  },
): RemovedItemWithClaims {
  return {
    id: partial.id,
    tripId: 'trip_x',
    category: (partial.category ?? 'Kitchen') as ItemCategory,
    name: partial.name,
    scope: (partial.scope ?? 'shared') as ItemScope,
    baseQty: partial.baseQty ?? 1,
    source: partial.source ?? 'template',
    sortOrder: partial.sortOrder ?? 0,
    removed: true,
    claims: partial.claims,
  }
}

function mkView(
  items: TripViewItem[],
  removedItemsWithClaims: RemovedItemWithClaims[] = [],
  participants: Participant[] = [alice, bob],
): TripView {
  const trip: Trip = {
    id: 'trip_x',
    name: 'Trip X',
    campsiteId: 'fixture:big-sur-state',
    campsite: { name: 'Big Sur', amenities: {} as never },
    style: 'car',
    tentCapacity: 2,
    createdAt: Date.now(),
  }
  return { trip, participants, items, removedItemsWithClaims }
}

describe('T6.6 WhoIsBringing', () => {
  it('groups claims by participant, listing item + qty', async () => {
    const WhoIsBringing = await loadWhoIsBringing()
    const items = [
      vi_item({
        id: 'a',
        name: 'Tent',
        claims: [{ participant: alice, qty: 1 }],
      }),
      vi_item({
        id: 'b',
        name: 'Stove',
        claims: [{ participant: alice, qty: 1 }],
      }),
      vi_item({
        id: 'c',
        name: 'Sleeping bag',
        claims: [{ participant: bob, qty: 2 }],
      }),
    ]
    render(<WhoIsBringing view={mkView(items)} />)

    // Alice's group has Tent + Stove.
    const aliceHeading = screen.getByRole('heading', { name: /alice/i })
    const aliceSection =
      aliceHeading.closest('section') ??
      aliceHeading.closest('[data-slot="participant-group"]') ??
      aliceHeading.parentElement!
    expect(within(aliceSection as HTMLElement).getByText(/tent/i)).toBeInTheDocument()
    expect(within(aliceSection as HTMLElement).getByText(/stove/i)).toBeInTheDocument()

    // Bob's group has Sleeping bag (qty 2 surfaced as text).
    const bobHeading = screen.getByRole('heading', { name: /bob/i })
    const bobSection =
      bobHeading.closest('section') ??
      bobHeading.closest('[data-slot="participant-group"]') ??
      bobHeading.parentElement!
    expect(
      within(bobSection as HTMLElement).getByText(/sleeping bag/i),
    ).toBeInTheDocument()
    expect(
      within(bobSection as HTMLElement).getByText(/\b2\b/),
    ).toBeInTheDocument()
  })

  it('shows claims on removed items with a "no longer needed" tag (DR-19)', async () => {
    const WhoIsBringing = await loadWhoIsBringing()
    const items: TripViewItem[] = []
    const removed = [
      r_item({
        id: 'r1',
        name: 'Cooler',
        claims: [{ participant: alice, qty: 1 }],
      }),
    ]
    render(<WhoIsBringing view={mkView(items, removed)} />)
    // Cooler is still listed under Alice, with the tag.
    expect(screen.getByText(/cooler/i)).toBeInTheDocument()
    expect(screen.getByText(/no\s+longer\s+needed/i)).toBeInTheDocument()
  })

  it('renders an EmptyState when no one has claimed anything', async () => {
    const WhoIsBringing = await loadWhoIsBringing()
    render(<WhoIsBringing view={mkView([])} />)
    const text = document.body.textContent ?? ''
    const hasSignal =
      /no\s+claims|nobody.*bring|nothing\s+yet/i.test(text) ||
      document.querySelector('[data-slot="empty-state"]') !== null
    expect(hasSignal).toBe(true)
  })
})
