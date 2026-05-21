// @vitest-environment jsdom
// T6.1 — StylePicker (WS-6.3).
//
// Acceptance:
//   - Renders both styles `car` and `backpacking` as user-pickable options
//     (radio buttons / segmented control).
//   - Submitting the form invokes the `createTrip` Server Action with the
//     chosen `style` (and the `campsiteId` it was instantiated for).
//   - Uses React 19 `useActionState` so the form surfaces a `pending` state
//     while the action is in flight.
//
// The component is a `'use client'` component that lives at
// `components/trips/StylePicker.tsx`. The implementer will wire it to
// `createTrip` from `lib/trips/actions` (signature frozen in
// `lib/trips/action-types.ts`). Tests inject a controlled action stub via
// props so the test stays decoupled from the WS-7 implementation.

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

import { ok } from '@/lib/trips/result'
import type {
  CreateTripInput,
  CreateTripResult,
} from '@/lib/trips/action-types'

// Mock next/navigation so a redirect after success doesn't blow up jsdom.
const push = vi.fn()
const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
    replace,
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/campsites/fixture:big-sur-state',
  redirect: vi.fn(),
}))

async function loadStylePicker() {
  const mod = await import('@/components/trips/StylePicker')
  return mod.StylePicker ?? mod.default
}

// Build a "stub server action" matching the `createTrip` envelope so we can
// observe what the form posts. The component must accept this via props so it
// can be tested without importing WS-7.
function makeAction() {
  const calls: Array<CreateTripInput | FormData> = []
  let resolve: ((value: CreateTripResult) => void) | null = null
  const action = vi.fn(
    async (..._args: unknown[]): Promise<CreateTripResult> => {
      // useActionState passes (prevState, formData) — capture the FormData.
      const last = _args[_args.length - 1]
      calls.push(last as FormData | CreateTripInput)
      return await new Promise<CreateTripResult>((res) => {
        resolve = res
      })
    },
  )
  return {
    action,
    calls,
    resolve: (r: CreateTripResult) => resolve?.(r),
  }
}

beforeEach(() => {
  push.mockClear()
  replace.mockClear()
})

describe('T6.1 StylePicker', () => {
  it('renders both car and backpacking options', async () => {
    const StylePicker = await loadStylePicker()
    const { action } = makeAction()
    render(
      <StylePicker
        campsiteId="fixture:big-sur-state"
        createTripAction={action}
      />,
    )

    // Both styles must be selectable. Implementation may use radios, a
    // segmented control, or buttons; we accept any of role=radio /
    // role=button with the right accessible name.
    const car =
      screen.queryByRole('radio', { name: /car/i }) ??
      screen.queryByRole('button', { name: /car/i }) ??
      screen.queryByLabelText(/car/i)
    const bp =
      screen.queryByRole('radio', { name: /backpack/i }) ??
      screen.queryByRole('button', { name: /backpack/i }) ??
      screen.queryByLabelText(/backpack/i)
    expect(car).toBeTruthy()
    expect(bp).toBeTruthy()
  })

  it('submits selected style via createTrip with the campsiteId', async () => {
    const StylePicker = await loadStylePicker()
    const { action, calls, resolve } = makeAction()
    render(
      <StylePicker
        campsiteId="fixture:big-sur-state"
        createTripAction={action}
      />,
    )

    // Pick backpacking.
    const user = userEvent.setup()
    const bp =
      screen.queryByRole('radio', { name: /backpack/i }) ??
      screen.getByLabelText(/backpack/i)
    await user.click(bp as Element)

    // Submit. The form may use a button labelled "Create trip" / "Start" /
    // "Go" — accept any submit button.
    const submit = screen.getByRole('button', { name: /create|start|go|plan/i })
    await user.click(submit)

    await waitFor(() => expect(action).toHaveBeenCalled())
    expect(calls.length).toBeGreaterThan(0)
    const last = calls[calls.length - 1]
    // Form-data interface: read style + campsiteId off the FormData.
    if (last instanceof FormData) {
      expect(last.get('style')).toBe('backpacking')
      expect(last.get('campsiteId')).toBe('fixture:big-sur-state')
    } else {
      expect((last as CreateTripInput).style).toBe('backpacking')
      expect((last as CreateTripInput).campsiteId).toBe(
        'fixture:big-sur-state',
      )
    }

    // Resolve the in-flight action so we don't leak open promises.
    resolve(
      ok({
        trip: {
          id: 'trip_x',
          name: 'X',
          campsiteId: 'fixture:big-sur-state',
          campsite: { name: 'X', amenities: {} as never },
          style: 'backpacking',
          tentCapacity: 2,
          createdAt: Date.now(),
        },
        owner: {
          id: 'p_1',
          tripId: 'trip_x',
          name: 'Owner',
          isOwner: true,
          joinedAt: Date.now(),
        },
      }),
    )
  })

  it('shows pending state while createTrip is in flight (useActionState)', async () => {
    const StylePicker = await loadStylePicker()
    const { action, resolve } = makeAction()
    render(
      <StylePicker
        campsiteId="fixture:big-sur-state"
        createTripAction={action}
      />,
    )

    const user = userEvent.setup()
    const submit = screen.getByRole('button', { name: /create|start|go|plan/i })
    await user.click(submit)

    // Pending UI signals — accept any of: disabled submit, aria-busy on a
    // form-level region, or a visible "Creating…"/"Loading…"-style label.
    await waitFor(() => {
      const submitNow = screen.getByRole('button', {
        name: /create|start|go|plan|creating|loading|saving/i,
      })
      const busy =
        submitNow.hasAttribute('disabled') ||
        submitNow.getAttribute('aria-busy') === 'true' ||
        /creating|loading|saving/i.test(submitNow.textContent ?? '')
      expect(busy).toBe(true)
    })

    // Resolve so React unwinds the pending transition.
    resolve(
      ok({
        trip: {
          id: 'trip_x',
          name: 'X',
          campsiteId: 'fixture:big-sur-state',
          campsite: { name: 'X', amenities: {} as never },
          style: 'car',
          tentCapacity: 2,
          createdAt: Date.now(),
        },
        owner: {
          id: 'p_1',
          tripId: 'trip_x',
          name: 'Owner',
          isOwner: true,
          joinedAt: Date.now(),
        },
      }),
    )
  })
})
