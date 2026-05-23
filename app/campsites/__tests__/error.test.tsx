// @vitest-environment jsdom
// WS-8 — campsites segment error boundary renders the `ErrorState` surface
// and wires the "Try again" button to Next 16's `unstable_retry` prop.

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

import CampsitesError from '@/app/campsites/error'

describe('WS-8 campsites error boundary', () => {
  it('renders an alert surface with friendly section copy', () => {
    render(
      <CampsitesError
        error={new Error('boom')}
        unstable_retry={() => {}}
      />
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/couldn't load campsites/i)
  })

  it('calls unstable_retry when the user clicks "Try again"', async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    render(
      <CampsitesError error={new Error('boom')} unstable_retry={retry} />
    )
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(retry).toHaveBeenCalledTimes(1)
  })
})
