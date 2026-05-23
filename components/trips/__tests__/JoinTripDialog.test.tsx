// @vitest-environment jsdom
// T6.4 — JoinTripDialog (WS-6.6).
//
// Acceptance:
//   - Dialog is shown when there is no `bc_participant` cookie for THIS trip.
//   - A visitor whose cookie jar carries a `bc_participant` cookie for a
//     DIFFERENT trip still sees the dialog (cookie path scope; server sees
//     no cookie for this trip). DR-35.
//   - Submitting calls `joinTrip` with { tripId, name }. No participantId
//     or token in the input (I-C / DR-3).
//   - Cap reached (51st join): the action returns
//     `error.code === 'participant_cap_reached'` with the canonical message
//     "This trip is full (50 people)." (DR-46). The dialog surfaces that
//     verbatim via a toast.
//
// JoinTripDialog is a `'use client'` component at
// `components/trips/JoinTripDialog.tsx`. Tests inject the action.

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

import { err, ok } from '@/lib/trips/result'
import type { JoinTripResult } from '@/lib/trips/action-types'

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

// sonner toast spy.
const toastError = vi.fn()
const toastSuccess = vi.fn()
const toast = vi.fn()
vi.mock('sonner', () => ({
  toast: Object.assign(toast, {
    error: toastError,
    success: toastSuccess,
    message: vi.fn(),
  }),
  Toaster: () => React.createElement('div', { 'data-testid': 'toaster' }),
}))

async function loadJoinDialog() {
  const mod = await import('@/components/trips/JoinTripDialog')
  return mod.JoinTripDialog ?? mod.default
}

beforeEach(() => {
  toastError.mockClear()
  toastSuccess.mockClear()
  toast.mockClear()
})

describe('T6.4 JoinTripDialog', () => {
  it('renders open when isParticipant=false', async () => {
    const JoinTripDialog = await loadJoinDialog()
    const joinTrip = vi.fn<() => Promise<JoinTripResult>>()
    render(
      <JoinTripDialog
        tripId="trip_x"
        isParticipant={false}
        joinTripAction={joinTrip}
      />,
    )
    // Radix Dialog with `open=true` exposes role=dialog.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // Name input is labelled.
    expect(screen.getByLabelText(/your\s+name|name/i)).toBeInTheDocument()
    // Submit button.
    expect(
      screen.getByRole('button', { name: /join|i['’]m\s+in|continue/i }),
    ).toBeInTheDocument()
  })

  it('does NOT render when isParticipant=true', async () => {
    const JoinTripDialog = await loadJoinDialog()
    const joinTrip = vi.fn<() => Promise<JoinTripResult>>()
    render(
      <JoinTripDialog
        tripId="trip_x"
        isParticipant={true}
        joinTripAction={joinTrip}
      />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the dialog even when a bc_participant cookie exists for a DIFFERENT trip (DR-35)', async () => {
    // The cookie is path-scoped: server doesn't see a cookie for this trip,
    // so isParticipant=false on render. The component MUST honor that flag
    // and not silently hide itself.
    const JoinTripDialog = await loadJoinDialog()
    const joinTrip = vi.fn<() => Promise<JoinTripResult>>()
    render(
      <JoinTripDialog
        tripId="trip_x"
        isParticipant={false}
        joinTripAction={joinTrip}
      />,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('submits joinTrip with { tripId, name } and no participantId/token', async () => {
    const JoinTripDialog = await loadJoinDialog()
    const joinTrip = vi.fn(
      async (_input: { tripId: string; name: string }): Promise<JoinTripResult> =>
        ok({
          id: 'p_new',
          tripId: 'trip_x',
          name: 'Alex',
          isOwner: false,
          joinedAt: Date.now(),
        }),
    )
    const user = userEvent.setup()
    render(
      <JoinTripDialog
        tripId="trip_x"
        isParticipant={false}
        joinTripAction={joinTrip}
      />,
    )

    const name = screen.getByLabelText(/your\s+name|name/i)
    await user.type(name, 'Alex')
    const submit = screen.getByRole('button', {
      name: /join|i['’]m\s+in|continue/i,
    })
    await user.click(submit)

    await waitFor(() => expect(joinTrip).toHaveBeenCalled())
    const lastCall = joinTrip.mock.calls.at(-1)?.[0]
    expect(lastCall?.tripId).toBe('trip_x')
    expect(lastCall?.name).toBe('Alex')
    // Frozen contract: must NOT smuggle in a participantId or token.
    const keys = Object.keys(lastCall ?? {})
    expect(keys).not.toContain('participantId')
    expect(keys).not.toContain('token')
  })

  it('stays open when the user presses Escape (non-dismissible until join)', async () => {
    const JoinTripDialog = await loadJoinDialog()
    const joinTrip = vi.fn<() => Promise<JoinTripResult>>()
    const user = userEvent.setup()
    render(
      <JoinTripDialog
        tripId="trip_x"
        isParticipant={false}
        joinTripAction={joinTrip}
      />,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    // Dialog must still be present — there is no affordance to reopen it
    // and a stuck non-participant cannot claim items (Codex P2 on PR #7).
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(joinTrip).not.toHaveBeenCalled()
  })

  it('surfaces the canonical cap-reached message via toast (DR-46)', async () => {
    const JoinTripDialog = await loadJoinDialog()
    const CANONICAL = 'This trip is full (50 people).'
    const joinTrip = vi.fn(
      async (): Promise<JoinTripResult> =>
        err('participant_cap_reached', CANONICAL),
    )
    const user = userEvent.setup()
    render(
      <JoinTripDialog
        tripId="trip_x"
        isParticipant={false}
        joinTripAction={joinTrip}
      />,
    )

    await user.type(screen.getByLabelText(/your\s+name|name/i), 'Alex')
    await user.click(
      screen.getByRole('button', { name: /join|i['’]m\s+in|continue/i }),
    )

    // Implementation may call toast.error(message) or toast(message) — accept
    // either, and assert the canonical message is passed verbatim.
    await waitFor(() => {
      const allCalls = [
        ...toastError.mock.calls,
        ...toast.mock.calls,
        ...toastSuccess.mock.calls,
      ]
      const passed = allCalls.flat().some((arg) =>
        typeof arg === 'string'
          ? arg === CANONICAL
          : typeof arg === 'object' &&
            arg !== null &&
            ((arg as { message?: string }).message === CANONICAL ||
              (arg as { description?: string }).description === CANONICAL),
      )
      expect(passed).toBe(true)
    })
  })
})
