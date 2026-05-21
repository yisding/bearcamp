// @vitest-environment jsdom
// T5.1 — SearchBar (WS-5.4).
//
// Acceptance:
//   - typing into the search input debounced-writes
//     `?q=&state=&agency=&amenities[]` to URLSearchParams via the
//     `next/navigation` router (we mock useRouter/useSearchParams).
//   - mounts pre-filled from the current URL params.
//
// Per AGENTS.md: SearchBar is a `'use client'` component that lives at
// `components/campsites/SearchBar.tsx`. It must read params via
// `useSearchParams()` and write them via `useRouter().replace(routes.campsites(...))`
// (or equivalent) — never via direct `window.location` assignment.

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

// next/navigation mock — every hook is replaced with vitest-controlled spies.
// The implementation may call `router.push`, `router.replace`, or both; both
// are spied so the test stays implementation-agnostic.
const push = vi.fn()
const replace = vi.fn()
const refresh = vi.fn()

let searchParamsState: URLSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
    replace,
    refresh,
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  useSearchParams: () => searchParamsState,
  usePathname: () => '/campsites',
}))

// Resolve SearchBar lazily so vi.mock above is in effect before the module
// graph is loaded. Importing fails until WS-5.4 lands the file.
async function loadSearchBar() {
  const mod = await import('@/components/campsites/SearchBar')
  return mod.SearchBar ?? mod.default
}

function lastWrittenUrl(): string | null {
  const writes = [...push.mock.calls, ...replace.mock.calls]
  if (writes.length === 0) return null
  const arg = writes[writes.length - 1][0]
  return typeof arg === 'string' ? arg : null
}

function lastWrittenParams(): URLSearchParams | null {
  const url = lastWrittenUrl()
  if (!url) return null
  const qs = url.includes('?') ? url.slice(url.indexOf('?') + 1) : url
  return new URLSearchParams(qs)
}

beforeEach(() => {
  push.mockClear()
  replace.mockClear()
  refresh.mockClear()
  searchParamsState = new URLSearchParams()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('T5.1 SearchBar', () => {
  it('renders a labelled search input', async () => {
    const SearchBar = await loadSearchBar()
    render(<SearchBar />)
    // Accessible name should match /search|query|q\b/i — implementation choice
    // is open, but the input must be reachable by accessible name.
    const input = screen.getByRole('searchbox', { name: /search|query|find/i })
    expect(input).toBeInTheDocument()
  })

  it('mounts pre-filled from current URL params', async () => {
    searchParamsState = new URLSearchParams({
      q: 'sierra',
      state: 'CA',
      agency: 'NPS',
    })
    searchParamsState.append('amenities', 'showers')
    searchParamsState.append('amenities', 'bearLockers')

    const SearchBar = await loadSearchBar()
    render(<SearchBar />)

    const input = screen.getByRole('searchbox', { name: /search|query|find/i })
    expect(input).toHaveValue('sierra')

    // state / agency / amenities must be reflected in the UI somehow — we
    // accept any control whose accessible name or value mentions them.
    // The most testable contract: form controls bear the current values.
    expect(screen.getByDisplayValue('CA')).toBeInTheDocument()
    expect(screen.getByDisplayValue('NPS')).toBeInTheDocument()
    // Amenity checkboxes for the two enabled amenities must be checked.
    const showers = screen.getByRole('checkbox', { name: /showers/i })
    const bearLockers = screen.getByRole('checkbox', { name: /bear lockers?/i })
    expect(showers).toBeChecked()
    expect(bearLockers).toBeChecked()
  })

  it('debounces typing and then writes `?q=...` to the URL via the router', async () => {
    const SearchBar = await loadSearchBar()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<SearchBar />)

    const input = screen.getByRole('searchbox', { name: /search|query|find/i })
    await user.type(input, 'redwood')

    // Synchronous write would break the "debounced" contract: no calls yet.
    expect(push).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()

    // Flush debounce window — 500ms is generous and bounds the
    // implementation's debounce; anything faster passes too.
    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    const params = lastWrittenParams()
    expect(params).not.toBeNull()
    expect(params!.get('q')).toBe('redwood')
  })

  it('writes state + agency + multi-valued amenities[] when fields change', async () => {
    const SearchBar = await loadSearchBar()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<SearchBar />)

    const input = screen.getByRole('searchbox', { name: /search|query|find/i })
    await user.type(input, 'lake')

    // Select state CA / agency NPS / amenities showers + bearLockers. The
    // implementation may use native <select> or a combobox; we drive both
    // by their accessible name.
    const stateField = screen.getByRole('combobox', { name: /state/i })
    await user.selectOptions(stateField, 'CA').catch(async () => {
      // combobox might be a custom control — fall back to typing the value.
      await user.click(stateField)
      await user.keyboard('CA')
    })

    const agencyField = screen.getByRole('combobox', { name: /agency/i })
    await user.selectOptions(agencyField, 'NPS').catch(async () => {
      await user.click(agencyField)
      await user.keyboard('NPS')
    })

    const showers = screen.getByRole('checkbox', { name: /showers/i })
    const bearLockers = screen.getByRole('checkbox', { name: /bear lockers?/i })
    await user.click(showers)
    await user.click(bearLockers)

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    const params = lastWrittenParams()
    expect(params).not.toBeNull()
    expect(params!.get('q')).toBe('lake')
    expect(params!.get('state')).toBe('CA')
    expect(params!.get('agency')).toBe('NPS')
    // Multi-valued — same key, repeated. URLSearchParams.getAll returns both.
    expect(params!.getAll('amenities').sort()).toEqual(['bearLockers', 'showers'])
  })

  it('does not write to the URL on every keystroke (debounce coalesces writes)', async () => {
    const SearchBar = await loadSearchBar()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<SearchBar />)

    const input = screen.getByRole('searchbox', { name: /search|query|find/i })
    await user.type(input, 'big sur')

    // Mid-stream: nothing flushed yet.
    expect(push.mock.calls.length + replace.mock.calls.length).toBe(0)

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    // After the debounce window flushes, there should be exactly one URL
    // write (coalesced). If the implementation writes on each keystroke
    // this would explode to 7+.
    const totalWrites = push.mock.calls.length + replace.mock.calls.length
    expect(totalWrites).toBeLessThanOrEqual(2)
    expect(totalWrites).toBeGreaterThanOrEqual(1)
  })

  it('writes URLs prefixed with /campsites (uses routes.campsites builder)', async () => {
    const SearchBar = await loadSearchBar()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<SearchBar />)

    const input = screen.getByRole('searchbox', { name: /search|query|find/i })
    await user.type(input, 'desert')

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    const url = lastWrittenUrl()
    expect(url).not.toBeNull()
    expect(url!.startsWith('/campsites')).toBe(true)
  })
})
