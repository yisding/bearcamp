// @vitest-environment jsdom
// T6.12 — NoLongerNeeded (WS-6.8b).
//
// Acceptance:
//   - Lists removed items that still have live claims; participants see why
//     a claim they made disappeared.
//   - Owner sees a "Restore" button per row (calls `restoreItem`).
//   - Non-owner sees the row read-only.
//   - When the list is empty, the component renders nothing at all (so the
//     section doesn't appear as a noisy header on healthy trips).

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

import { ok } from '@/lib/trips/result'
import type { RestoreItemResult } from '@/lib/trips/action-types'
import type {
  RemovedItemWithClaims,
  Participant,
} from '@/lib/db/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/trips/trip_x',
}))

async function loadNLN() {
  const mod = await import('@/components/trips/NoLongerNeeded')
  return mod.NoLongerNeeded ?? mod.default
}

const alice: Participant = {
  id: 'p_alice',
  tripId: 'trip_x',
  name: 'Alice',
  isOwner: true,
  joinedAt: 1,
}

function r(name: string, claims = [{ participant: alice, qty: 1 }]):
  RemovedItemWithClaims {
  return {
    id: `i_${name.toLowerCase()}`,
    tripId: 'trip_x',
    category: 'Kitchen',
    name,
    scope: 'shared',
    baseQty: 1,
    source: 'template',
    sortOrder: 0,
    removed: true,
    claims,
  }
}

describe('T6.12 NoLongerNeeded', () => {
  it('lists removed items with claims', async () => {
    const NoLongerNeeded = await loadNLN()
    const restoreItem = vi.fn(
      async (): Promise<RestoreItemResult> =>
        ok({
          id: 'i_cooler',
          tripId: 'trip_x',
          category: 'Kitchen',
          name: 'Cooler',
          scope: 'shared',
          baseQty: 1,
          source: 'template',
          sortOrder: 0,
          removed: false,
        }),
    )
    render(
      <NoLongerNeeded
        items={[r('Cooler')]}
        isOwner={false}
        restoreItemAction={restoreItem}
      />,
    )
    expect(screen.getByText(/cooler/i)).toBeInTheDocument()
    // Indicate the section to participants (DR-19 / G-soft).
    expect(screen.getByText(/no\s+longer\s+needed/i)).toBeInTheDocument()
  })

  it('renders nothing when the list is empty', async () => {
    const NoLongerNeeded = await loadNLN()
    const { container } = render(
      <NoLongerNeeded
        items={[]}
        isOwner={true}
        restoreItemAction={vi.fn()}
      />,
    )
    // The component should bail out entirely — no heading, no slot.
    expect(container.textContent ?? '').toBe('')
  })

  it('shows a Restore button to owners and calls restoreItem on click', async () => {
    const NoLongerNeeded = await loadNLN()
    const restoreItem = vi.fn(
      async (input: { tripId: string; itemId: string }): Promise<RestoreItemResult> =>
        ok({
          id: input.itemId,
          tripId: input.tripId,
          category: 'Kitchen',
          name: 'Cooler',
          scope: 'shared',
          baseQty: 1,
          source: 'template',
          sortOrder: 0,
          removed: false,
        }),
    )
    const user = userEvent.setup()
    render(
      <NoLongerNeeded
        items={[r('Cooler')]}
        isOwner={true}
        restoreItemAction={restoreItem}
      />,
    )
    const restoreBtn = screen.getByRole('button', { name: /restore/i })
    await user.click(restoreBtn)
    expect(restoreItem).toHaveBeenCalledWith({
      tripId: 'trip_x',
      itemId: 'i_cooler',
    })
  })

  it('does NOT show a Restore button to non-owners', async () => {
    const NoLongerNeeded = await loadNLN()
    render(
      <NoLongerNeeded
        items={[r('Cooler')]}
        isOwner={false}
        restoreItemAction={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /restore/i })).toBeNull()
  })
})
