// @vitest-environment jsdom
// T6.5 — ShareLink (WS-6.7).
//
// Acceptance:
//   - Click copies `location.href` via `navigator.clipboard.writeText`.
//   - Shows a confirmation toast.
//   - The component's accessible help text contains the owner-recovery
//     warning copy (DR-26 / DR-48), e.g.
//     "Save this link — the owner can't recover the trip without it."
//
// ShareLink is a `'use client'` component at
// `components/trips/ShareLink.tsx`.

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

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

const toastSuccess = vi.fn()
const toastError = vi.fn()
const toast = vi.fn()
vi.mock('sonner', () => ({
  toast: Object.assign(toast, {
    success: toastSuccess,
    error: toastError,
    message: vi.fn(),
  }),
  Toaster: () => React.createElement('div', { 'data-testid': 'toaster' }),
}))

async function loadShareLink() {
  const mod = await import('@/components/trips/ShareLink')
  return mod.ShareLink ?? mod.default
}

beforeEach(() => {
  toastSuccess.mockClear()
  toastError.mockClear()
  toast.mockClear()
})

describe('T6.5 ShareLink', () => {
  it('copies location.href to the clipboard on click', async () => {
    const ShareLink = await loadShareLink()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, href: 'https://bearcamp.test/trips/trip_x' },
    })

    const user = userEvent.setup()
    render(<ShareLink />)
    const btn = screen.getByRole('button', { name: /copy\s+link|share|copy/i })
    await user.click(btn)
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'https://bearcamp.test/trips/trip_x',
      ),
    )
  })

  it('shows a toast after copying', async () => {
    const ShareLink = await loadShareLink()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    const user = userEvent.setup()
    render(<ShareLink />)
    await user.click(
      screen.getByRole('button', { name: /copy\s+link|share|copy/i }),
    )
    await waitFor(() => {
      const calls = [
        ...toastSuccess.mock.calls,
        ...toast.mock.calls,
      ].flat()
      const any = calls.some(
        (a) =>
          (typeof a === 'string' && /copied|copy/i.test(a)) ||
          (typeof a === 'object' &&
            a !== null &&
            /copied|copy/i.test(
              (a as { message?: string }).message ?? '',
            )),
      )
      expect(any).toBe(true)
    })
  })

  it('renders an accessible owner-recovery warning (DR-48)', async () => {
    const ShareLink = await loadShareLink()
    render(<ShareLink />)
    // The warning copy must be a string in the rendered DOM that mentions
    // both saving/keeping the link AND owner recovery. We accept any phrase
    // matching this conjunction so the implementer has wording freedom but
    // can't drop the safety message entirely.
    const text = document.body.textContent ?? ''
    const mentionsSave = /save|keep/i.test(text)
    const mentionsOwner = /owner/i.test(text)
    const mentionsRecover = /recover|recovery|access/i.test(text)
    expect(mentionsSave).toBe(true)
    expect(mentionsOwner).toBe(true)
    expect(mentionsRecover).toBe(true)
  })
})
