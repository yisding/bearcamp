// @vitest-environment jsdom
// T6.7 — RefreshPoller (WS-6.10).
//
// Acceptance:
//   - Calls `useRouter().refresh()` from `next/navigation` (NOT `refresh`
//     from `next/cache`, which is Server-Actions-only — DR-9) every
//     15 s (DR-29).
//   - Pauses when `document.hidden`.
//   - A manual "Refresh now" button triggers an immediate refresh.
//   - A background refresh MUST NOT clobber an open/edited claim-qty input
//     or the Join dialog (G3). With Cache Components / Activity, client
//     state is preserved across refresh; we assert by rendering an input
//     beside the poller and checking it retains its value + focus across
//     a poll tick.
//
// RefreshPoller is a `'use client'` component at
// `components/trips/RefreshPoller.tsx`.

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh,
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/trips/trip_x',
}))

// Guard against accidentally importing refresh from next/cache (DR-9).
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  // No `refresh` export — that's the server-actions version we must NOT
  // use here. Importing it would throw against this mock.
}))

async function loadRefreshPoller() {
  const mod = await import('@/components/trips/RefreshPoller')
  return mod.RefreshPoller ?? mod.default
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: hidden,
  })
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: hidden ? 'hidden' : 'visible',
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  refresh.mockClear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  setHidden(false)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('T6.7 RefreshPoller', () => {
  it('calls router.refresh on a 15s interval', async () => {
    const RefreshPoller = await loadRefreshPoller()
    render(<RefreshPoller />)
    // No refresh on mount (or one — both are acceptable). Reset to make the
    // assertion robust either way.
    refresh.mockClear()

    act(() => {
      vi.advanceTimersByTime(15_000)
    })
    expect(refresh).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(15_000)
    })
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('pauses polling while document.hidden', async () => {
    const RefreshPoller = await loadRefreshPoller()
    render(<RefreshPoller />)
    refresh.mockClear()

    act(() => {
      setHidden(true)
    })

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(refresh).not.toHaveBeenCalled()

    // Resume when visible again.
    act(() => {
      setHidden(false)
    })
    act(() => {
      vi.advanceTimersByTime(15_000)
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('has a manual "Refresh now" affordance that triggers a refresh', async () => {
    const RefreshPoller = await loadRefreshPoller()
    render(<RefreshPoller />)
    refresh.mockClear()
    const btn = screen.getByRole('button', {
      name: /refresh(\s+now)?|update/i,
    })
    // userEvent + fake timers — switch to real for this click then back.
    vi.useRealTimers()
    const user = userEvent.setup()
    await user.click(btn)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('a background refresh does NOT clobber an open/edited claim-qty input (G3)', async () => {
    const RefreshPoller = await loadRefreshPoller()
    // Render the poller alongside an input that represents the user's open
    // claim-qty edit. Activity preserves DOM/state across refresh — but the
    // critical invariant is that the poller itself does not reset sibling
    // inputs (e.g. by calling refresh() in a way that unmounts them). We
    // check the value + focus are preserved across a tick.
    render(
      <div>
        <label>
          claim qty
          <input data-testid="qty" defaultValue="3" />
        </label>
        <RefreshPoller />
      </div>,
    )
    const qty = screen.getByTestId('qty') as HTMLInputElement
    qty.focus()
    qty.value = '7'
    expect(document.activeElement).toBe(qty)

    act(() => {
      vi.advanceTimersByTime(15_000)
    })
    // router.refresh was called…
    expect(refresh).toHaveBeenCalled()
    // …but the user's edited value and focus survived.
    expect(qty.value).toBe('7')
    expect(document.activeElement).toBe(qty)
  })

  it('a background refresh does NOT clobber an open Join dialog (G3)', async () => {
    const RefreshPoller = await loadRefreshPoller()
    render(
      <div>
        <dialog open data-testid="join-dialog">
          <input data-testid="join-name" defaultValue="Alex" />
        </dialog>
        <RefreshPoller />
      </div>,
    )
    const dialog = screen.getByTestId('join-dialog')
    const input = screen.getByTestId('join-name') as HTMLInputElement
    expect(dialog.hasAttribute('open')).toBe(true)

    act(() => {
      vi.advanceTimersByTime(15_000)
    })
    expect(refresh).toHaveBeenCalled()
    // Dialog remains open; input retains its draft value.
    expect(dialog.hasAttribute('open')).toBe(true)
    expect(input.value).toBe('Alex')
  })
})
