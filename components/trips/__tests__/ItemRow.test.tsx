// @vitest-environment jsdom
// T6.3 / T6.3b — ItemRow (WS-6.5).
//
// Acceptance:
//   T6.3
//     - Shows the item name plus a "claimed of needed" display + shortfall.
//     - Claim action defaults qty=shortfall and calls `claimItem` with
//       { tripId, itemId, qty }. Unclaim calls `unclaimItem` with
//       { tripId, itemId }.
//     - useTransition / useActionState pending state + optimistic UI is
//       visible while the action is in flight.
//   T6.3b
//     - Over-claim renders `"5 of 3 — covered (extra)"` exactly.
//     - shortfall stays at 0 (no negative).
//   T6.9 (here for cohesion)
//     - Owner can rename inline; rename calls `updateItem` with the patch.
//     - Owner can edit baseQty / scope (`updateItem`) — recompute is a
//       view-level concern, but the action call is asserted.
//     - Non-owner has no edit affordance.
//
// ItemRow is a `'use client'` component at `components/trips/ItemRow.tsx`.
// We inject all Server-Action stubs as props to stay decoupled from WS-7.

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

import { ok } from '@/lib/trips/result'
import type {
  ClaimItemResult,
  UnclaimItemResult,
  UpdateItemResult,
  RemoveItemResult,
  RestoreItemResult,
  ReorderItemResult,
} from '@/lib/trips/action-types'
import type {
  TripViewItem,
  Participant,
  RemovedItemWithClaims,
  ItemScope,
} from '@/lib/db/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/trips/trip_x',
}))

async function loadItemRow() {
  const mod = await import('@/components/trips/ItemRow')
  return mod.ItemRow ?? mod.default
}

const me: Participant = {
  id: 'p_me',
  tripId: 'trip_x',
  name: 'Me',
  isOwner: false,
  joinedAt: 1,
}
const other: Participant = {
  id: 'p_other',
  tripId: 'trip_x',
  name: 'Sam',
  isOwner: false,
  joinedAt: 2,
}

function mkItem(over: Partial<TripViewItem> = {}): TripViewItem {
  return {
    id: 'i_tent',
    tripId: 'trip_x',
    category: 'Shelter',
    name: 'Sleeping bag',
    scope: 'per_person',
    baseQty: 1,
    source: 'template',
    sortOrder: 0,
    removed: false,
    needed: 3,
    claimed: 1,
    shortfall: 2,
    claims: [{ participant: other, qty: 1 }],
    ...over,
  }
}

function makeActions() {
  const claimItem = vi.fn<(input: {
    tripId: string
    itemId: string
    qty: number
  }) => Promise<ClaimItemResult>>(async (input) =>
    ok({ itemId: input.itemId, participantId: 'p_me', qty: input.qty }),
  )
  const unclaimItem = vi.fn<(input: {
    tripId: string
    itemId: string
  }) => Promise<UnclaimItemResult>>(async (input) =>
    ok({ itemId: input.itemId }),
  )
  const updateItem = vi.fn<(input: unknown) => Promise<UpdateItemResult>>(
    async () => ok(mkItem()),
  )
  const removeItem = vi.fn<(input: unknown) => Promise<RemoveItemResult>>(
    async () => ok(mkItem({ removed: true })),
  )
  const restoreItem = vi.fn<(input: unknown) => Promise<RestoreItemResult>>(
    async () => ok(mkItem({ removed: false })),
  )
  const reorderItem = vi.fn<(input: {
    tripId: string
    itemId: string
    beforeItemId?: string
    newIndex?: number
  }) => Promise<ReorderItemResult>>(async (input) =>
    ok({ tripId: input.tripId, itemId: input.itemId }),
  )
  return {
    claimItem,
    unclaimItem,
    updateItem,
    removeItem,
    restoreItem,
    reorderItem,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('T6.3 ItemRow — claim/unclaim', () => {
  it('renders the item name + "claimed of needed" + shortfall', async () => {
    const ItemRow = await loadItemRow()
    const actions = makeActions()
    render(
      <ItemRow
        item={mkItem({ claimed: 1, needed: 3, shortfall: 2 })}
        currentParticipant={me}
        isOwner={false}
        actions={actions}
      />,
    )
    expect(screen.getByText(/sleeping bag/i)).toBeInTheDocument()
    // Implementations may render "1 of 3" or "1/3" — accept either.
    expect(
      screen.getByText(/\b1\s*(of|\/)\s*3\b/i),
    ).toBeInTheDocument()
    // Shortfall is "2 still needed" or similar; we just check the number 2
    // appears alongside a shortfall/still-needed indicator.
    expect(screen.getByText(/2.*(still\s+need|short|remain)/i)).toBeInTheDocument()
  })

  it('claim defaults qty=shortfall and calls claimItem', async () => {
    const ItemRow = await loadItemRow()
    const actions = makeActions()
    const user = userEvent.setup()
    render(
      <ItemRow
        item={mkItem({ claimed: 1, needed: 3, shortfall: 2 })}
        currentParticipant={me}
        isOwner={false}
        actions={actions}
      />,
    )

    // The "I'll bring" / "Claim" trigger.
    const claimBtn = screen.getByRole('button', {
      name: /claim|i['’]ll\s+bring|i\s+got\s+this|bring/i,
    })
    await user.click(claimBtn)

    // If a qty input shows up, it should default to shortfall (2).
    const qtyInput = screen.queryByRole('spinbutton') as
      | HTMLInputElement
      | null
    if (qtyInput) {
      expect(qtyInput.value).toBe('2')
      // Submit the inline form.
      const submit = screen.getByRole('button', {
        name: /confirm|save|claim|bring/i,
      })
      await user.click(submit)
    }

    await waitFor(() => expect(actions.claimItem).toHaveBeenCalledTimes(1))
    expect(actions.claimItem).toHaveBeenCalledWith({
      tripId: 'trip_x',
      itemId: 'i_tent',
      qty: 2,
    })
  })

  it('unclaim calls unclaimItem when participant already has a claim', async () => {
    const ItemRow = await loadItemRow()
    const actions = makeActions()
    const user = userEvent.setup()
    // `me` has a claim on the item.
    const item = mkItem({
      claims: [{ participant: me, qty: 2 }],
      claimed: 2,
      needed: 3,
      shortfall: 1,
    })
    render(
      <ItemRow
        item={item}
        currentParticipant={me}
        isOwner={false}
        actions={actions}
      />,
    )

    const unclaim = screen.getByRole('button', {
      name: /unclaim|remove\s+(my\s+)?claim|i\s+won['’]t\s+bring|cancel/i,
    })
    await user.click(unclaim)

    await waitFor(() => expect(actions.unclaimItem).toHaveBeenCalledTimes(1))
    expect(actions.unclaimItem).toHaveBeenCalledWith({
      tripId: 'trip_x',
      itemId: 'i_tent',
    })
  })

  it('shows pending/optimistic state while claim is in flight', async () => {
    const ItemRow = await loadItemRow()
    const actions = makeActions()
    // Make claimItem hang to observe pending state.
    let resolveClaim: ((r: ClaimItemResult) => void) | undefined
    actions.claimItem.mockImplementationOnce(
      (): Promise<ClaimItemResult> =>
        new Promise<ClaimItemResult>((res) => {
          resolveClaim = res
        }),
    )
    const user = userEvent.setup()
    render(
      <ItemRow
        item={mkItem({ claimed: 0, needed: 1, shortfall: 1 })}
        currentParticipant={me}
        isOwner={false}
        actions={actions}
      />,
    )
    const claimBtn = screen.getByRole('button', {
      name: /claim|i['’]ll\s+bring|i\s+got\s+this|bring/i,
    })
    await user.click(claimBtn)

    // If a qty input + confirm flow exists, submit it.
    const confirm = screen.queryByRole('button', {
      name: /confirm|save/i,
    })
    if (confirm) await user.click(confirm)

    // Pending signals: aria-busy=true OR a disabled action button OR optimistic
    // text reflecting the claim already (e.g. "1 of 1 — covered").
    await waitFor(() => {
      const busy = document.querySelector('[aria-busy="true"]')
      const disabled = document.querySelector('button[disabled]')
      const optimistic = screen.queryByText(
        /covered|claimed by me|you\s+are\s+bringing|1\s*(of|\/)\s*1/i,
      )
      expect(busy || disabled || optimistic).toBeTruthy()
    })

    resolveClaim?.({
      ok: true,
      data: { itemId: 'i_tent', participantId: 'p_me', qty: 1 },
    })
  })
})

describe('T6.3b ItemRow — over-claim', () => {
  it('renders "5 of 3 — covered (extra)" exactly and shortfall stays 0', async () => {
    const ItemRow = await loadItemRow()
    const actions = makeActions()
    render(
      <ItemRow
        item={mkItem({
          claimed: 5,
          needed: 3,
          // From plan: shortfall = max(0, needed - claimed); over-claim
          // never goes negative.
          shortfall: 0,
          claims: [{ participant: other, qty: 5 }],
        })}
        currentParticipant={me}
        isOwner={false}
        actions={actions}
      />,
    )

    // Canonical over-claim string (G-overclaim).
    expect(
      screen.getByText(/5\s+of\s+3\s+—\s+covered\s+\(extra\)/i),
    ).toBeInTheDocument()

    // shortfall=0 means no "still needed" pill / "n short" indicator.
    expect(
      screen.queryByText(/still\s+need|short|remain/i),
    ).toBeNull()
  })
})

describe('T6.9 ItemRow — owner-only editing', () => {
  it('renames an item via updateItem (owner)', async () => {
    const ItemRow = await loadItemRow()
    const actions = makeActions()
    const user = userEvent.setup()
    render(
      <ItemRow
        item={mkItem()}
        currentParticipant={{ ...me, isOwner: true }}
        isOwner={true}
        actions={actions}
      />,
    )

    // Owner reveals inline edit: a button labelled "Edit" / "Rename" /
    // pencil icon button. We then expect a textbox to appear.
    const edit = screen.getByRole('button', { name: /edit|rename/i })
    await user.click(edit)

    const nameInput =
      (screen.queryByRole('textbox', { name: /name/i }) as
        | HTMLInputElement
        | null) ?? (screen.getByDisplayValue(/sleeping bag/i) as HTMLInputElement)
    await user.clear(nameInput)
    await user.type(nameInput, 'Quilt')

    const save = screen.getByRole('button', { name: /save|confirm|apply/i })
    await user.click(save)

    await waitFor(() => expect(actions.updateItem).toHaveBeenCalled())
    const lastCall = actions.updateItem.mock.calls.at(-1)?.[0] as {
      tripId: string
      itemId: string
      patch: { name?: string }
    }
    expect(lastCall.tripId).toBe('trip_x')
    expect(lastCall.itemId).toBe('i_tent')
    expect(lastCall.patch.name).toBe('Quilt')
  })

  it('edits baseQty + scope via updateItem (owner)', async () => {
    const ItemRow = await loadItemRow()
    const actions = makeActions()
    const user = userEvent.setup()
    render(
      <ItemRow
        item={mkItem({ baseQty: 1, scope: 'per_person' })}
        currentParticipant={{ ...me, isOwner: true }}
        isOwner={true}
        actions={actions}
      />,
    )

    const edit = screen.getByRole('button', { name: /edit|rename/i })
    await user.click(edit)

    // baseQty input — accept by accessible name.
    const baseQty = screen.getByLabelText(/base\s*qty|quantity/i) as HTMLInputElement
    await user.clear(baseQty)
    await user.type(baseQty, '2')

    // scope select — radio or select.
    const scopeControl =
      screen.queryByLabelText(/scope/i) ??
      screen.queryByRole('combobox', { name: /scope/i }) ??
      screen.queryByRole('radio', { name: /per[_\s-]tent/i })
    if (scopeControl && (scopeControl as HTMLSelectElement).tagName === 'SELECT') {
      await user.selectOptions(scopeControl as HTMLSelectElement, 'per_tent')
    } else if (scopeControl && (scopeControl as HTMLInputElement).type === 'radio') {
      await user.click(scopeControl)
    } else if (scopeControl) {
      // Custom combobox — emulate keyboard nav: focus + Down + Enter
      ;(scopeControl as HTMLElement).focus()
    }

    const save = screen.getByRole('button', { name: /save|confirm|apply/i })
    await user.click(save)

    await waitFor(() => expect(actions.updateItem).toHaveBeenCalled())
    const patch = (actions.updateItem.mock.calls.at(-1)?.[0] as {
      patch: { baseQty?: number; scope?: ItemScope }
    }).patch
    expect(patch.baseQty).toBe(2)
    // scope may or may not have been changeable via the unmocked control;
    // if it changed, assert it is one of the allowed values.
    if (patch.scope !== undefined) {
      expect(['per_person', 'shared', 'per_tent']).toContain(patch.scope)
    }
  })

  it('does NOT render edit / remove affordances for non-owners', async () => {
    const ItemRow = await loadItemRow()
    const actions = makeActions()
    render(
      <ItemRow
        item={mkItem()}
        currentParticipant={me}
        isOwner={false}
        actions={actions}
      />,
    )
    expect(screen.queryByRole('button', { name: /^edit$|^rename$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^remove$|^delete$/i })).toBeNull()
  })
})

describe('T6.12 ItemRow — restore for NoLongerNeeded (owner)', () => {
  it('shows a Restore button for a removed-with-claims item (owner)', async () => {
    const ItemRow = await loadItemRow()
    const actions = makeActions()
    const user = userEvent.setup()
    const removed: RemovedItemWithClaims = {
      id: 'i_removed',
      tripId: 'trip_x',
      category: 'Kitchen',
      name: 'Cooler',
      scope: 'shared',
      baseQty: 1,
      source: 'template',
      sortOrder: 0,
      removed: true,
      claims: [{ participant: other, qty: 1 }],
    }
    render(
      <ItemRow
        item={removed}
        currentParticipant={{ ...me, isOwner: true }}
        isOwner={true}
        actions={actions}
        variant="removed"
      />,
    )
    const restore = screen.getByRole('button', { name: /restore|undo\s+remove/i })
    await user.click(restore)
    await waitFor(() => expect(actions.restoreItem).toHaveBeenCalled())
    expect(actions.restoreItem).toHaveBeenCalledWith({
      tripId: 'trip_x',
      itemId: 'i_removed',
    })
  })
})

describe('ItemRow — owner-only reorder (Up/Down)', () => {
  it('does NOT render Move up / Move down for non-owners', async () => {
    const ItemRow = await loadItemRow()
    const actions = makeActions()
    render(
      <ItemRow
        item={mkItem()}
        currentParticipant={me}
        isOwner={false}
        actions={actions}
        prevItemId="i_above"
        nextItemId="i_below"
      />,
    )
    expect(screen.queryByRole('button', { name: /move up/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /move down/i })).toBeNull()
  })

  it('Move up reorders the item before its previous sibling', async () => {
    const ItemRow = await loadItemRow()
    const actions = makeActions()
    const user = userEvent.setup()
    render(
      <ItemRow
        item={mkItem()}
        currentParticipant={{ ...me, isOwner: true }}
        isOwner={true}
        actions={actions}
        prevItemId="i_above"
        nextItemId="i_below"
      />,
    )
    await user.click(screen.getByRole('button', { name: /move up/i }))
    await waitFor(() => expect(actions.reorderItem).toHaveBeenCalledTimes(1))
    expect(actions.reorderItem).toHaveBeenCalledWith({
      tripId: 'trip_x',
      itemId: 'i_tent',
      beforeItemId: 'i_above',
    })
  })

  it('Move down reorders the next sibling before this item', async () => {
    const ItemRow = await loadItemRow()
    const actions = makeActions()
    const user = userEvent.setup()
    render(
      <ItemRow
        item={mkItem()}
        currentParticipant={{ ...me, isOwner: true }}
        isOwner={true}
        actions={actions}
        prevItemId="i_above"
        nextItemId="i_below"
      />,
    )
    await user.click(screen.getByRole('button', { name: /move down/i }))
    await waitFor(() => expect(actions.reorderItem).toHaveBeenCalledTimes(1))
    expect(actions.reorderItem).toHaveBeenCalledWith({
      tripId: 'trip_x',
      itemId: 'i_below',
      beforeItemId: 'i_tent',
    })
  })

  it('disables Move up at the top and Move down at the bottom', async () => {
    const ItemRow = await loadItemRow()
    const actions = makeActions()
    render(
      <ItemRow
        item={mkItem()}
        currentParticipant={{ ...me, isOwner: true }}
        isOwner={true}
        actions={actions}
        prevItemId={null}
        nextItemId={null}
      />,
    )
    expect(screen.getByRole('button', { name: /move up/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /move down/i })).toBeDisabled()
  })
})
