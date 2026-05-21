// @vitest-environment jsdom
// T6.13 — TripSettings (WS-6.12b).
//
// Acceptance:
//   - Owner-only component. Tests assert the component renders nothing
//     (or null) when isOwner=false.
//   - Owner can edit trip name (renameTrip) and tentCapacity
//     (updateTripSettings). updateTripSettings patch is restricted to
//     `{ tentCapacity }` (DR-21).
//   - Danger zone: deleteTrip is behind a confirm flow; on success, navigates
//     to "/" (DR-20). Tests assert the action is called and router.push("/")
//     is invoked.

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

import { ok } from '@/lib/trips/result'
import type {
  RenameTripResult,
  UpdateTripSettingsResult,
  DeleteTripResult,
} from '@/lib/trips/action-types'
import type { Trip } from '@/lib/db/types'

const push = vi.fn()
const replace = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, refresh, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/trips/trip_x',
}))

async function loadTripSettings() {
  const mod = await import('@/components/trips/TripSettings')
  return mod.TripSettings ?? mod.default
}

const trip: Trip = {
  id: 'trip_x',
  name: 'Coastal weekend',
  campsiteId: 'fixture:big-sur-state',
  campsite: { name: 'Big Sur', amenities: {} as never },
  style: 'car',
  tentCapacity: 2,
  createdAt: Date.now(),
}

beforeEach(() => {
  push.mockClear()
  replace.mockClear()
  refresh.mockClear()
})

function makeActions() {
  const renameTrip = vi.fn<(input: { tripId: string; name: string }) => Promise<RenameTripResult>>(
    async (input) => ok({ ...trip, name: input.name }),
  )
  const updateTripSettings = vi.fn<(input: {
    tripId: string
    patch: { tentCapacity?: number }
  }) => Promise<UpdateTripSettingsResult>>(async (input) =>
    ok({ ...trip, tentCapacity: input.patch.tentCapacity ?? trip.tentCapacity }),
  )
  const deleteTrip = vi.fn<(input: { tripId: string }) => Promise<DeleteTripResult>>(
    async (input) => ok({ tripId: input.tripId }),
  )
  return { renameTrip, updateTripSettings, deleteTrip }
}

describe('T6.13 TripSettings', () => {
  it('renders nothing for non-owners', async () => {
    const TripSettings = await loadTripSettings()
    const actions = makeActions()
    const { container } = render(
      <TripSettings trip={trip} isOwner={false} {...actions} />,
    )
    expect(container.textContent ?? '').toBe('')
  })

  it('owner edits tentCapacity via updateTripSettings (restricted patch DR-21)', async () => {
    const TripSettings = await loadTripSettings()
    const actions = makeActions()
    const user = userEvent.setup()
    render(<TripSettings trip={trip} isOwner={true} {...actions} />)

    const tentInput = screen.getByLabelText(/tent\s*capacity/i) as HTMLInputElement
    await user.clear(tentInput)
    await user.type(tentInput, '6')
    // Save can be a single section button or the input may auto-save on blur;
    // we accept either path. Click "Save" if it exists.
    const save =
      screen.queryByRole('button', { name: /save\s+settings|save\s+capacity|save/i })
    if (save) {
      await user.click(save)
    } else {
      tentInput.blur()
    }

    await waitFor(() => expect(actions.updateTripSettings).toHaveBeenCalled())
    const lastCall = actions.updateTripSettings.mock.calls.at(-1)?.[0]
    expect(lastCall?.tripId).toBe('trip_x')
    expect(lastCall?.patch.tentCapacity).toBe(6)
    // Patch must be restricted to tentCapacity only.
    expect(Object.keys(lastCall?.patch ?? {})).toEqual(['tentCapacity'])
  })

  it('owner renames the trip via renameTrip', async () => {
    const TripSettings = await loadTripSettings()
    const actions = makeActions()
    const user = userEvent.setup()
    render(<TripSettings trip={trip} isOwner={true} {...actions} />)

    const nameInput = screen.getByLabelText(/trip\s*name|^name$/i) as HTMLInputElement
    await user.clear(nameInput)
    await user.type(nameInput, 'Mountain weekend')
    const save =
      screen.queryByRole('button', { name: /save\s+name|rename|save/i })
    if (save) {
      await user.click(save)
    } else {
      nameInput.blur()
    }
    await waitFor(() => expect(actions.renameTrip).toHaveBeenCalled())
    expect(actions.renameTrip).toHaveBeenCalledWith({
      tripId: 'trip_x',
      name: 'Mountain weekend',
    })
  })

  it('deleteTrip is gated behind a confirm and redirects to "/" on success', async () => {
    const TripSettings = await loadTripSettings()
    const actions = makeActions()
    const user = userEvent.setup()
    render(<TripSettings trip={trip} isOwner={true} {...actions} />)

    const dangerBtn = screen.getByRole('button', { name: /delete\s+trip/i })
    await user.click(dangerBtn)

    // A confirm dialog or "Type to confirm" surface should appear. Accept
    // either an extra confirm button or a textbox + button flow.
    const confirmBtn = screen.getByRole('button', {
      name: /confirm\s+delete|yes,?\s+delete|delete\s+forever|i\s+understand/i,
    })
    // If there is a confirmation textbox (e.g. type the trip name) — fill it
    // with the trip name to unblock the confirm button.
    const confirmInput = screen.queryByRole('textbox', {
      name: /type|confirm/i,
    }) as HTMLInputElement | null
    if (confirmInput) {
      await user.type(confirmInput, trip.name)
    }
    // Now click.
    if (confirmBtn.hasAttribute('disabled')) {
      // Manually enable the test by triggering the input value change again.
      if (confirmInput) {
        confirmInput.focus()
      }
    }
    await user.click(confirmBtn)

    await waitFor(() => expect(actions.deleteTrip).toHaveBeenCalledWith({
      tripId: 'trip_x',
    }))
    // Redirect to "/" — the implementation may use redirect() (Server
    // Action throws) or router.push('/') from the client. Accept either.
    await waitFor(() => {
      const wentHome =
        push.mock.calls.some((c) => c[0] === '/') ||
        replace.mock.calls.some((c) => c[0] === '/')
      expect(wentHome).toBe(true)
    })
  })
})
