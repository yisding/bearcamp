// @vitest-environment jsdom
// T5.2 — CampsiteCard (WS-5.5).
//
// Acceptance:
//   - renders the campsite name, agency, state.
//   - is wrapped in a link that points at routes.campsite(id).
//   - is keyboard-focusable (the link receives focus on Tab).
//
// CampsiteCard is a Server Component but contains no async work — it can be
// rendered synchronously by RTL.

import React from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

import { fixtures } from '@/lib/campsites/fixtures'
import { campsite as campsiteRoute } from '@/lib/routes'
import type { Campsite } from '@/lib/db/types'

async function loadCampsiteCard() {
  const mod = await import('@/components/campsites/CampsiteCard')
  return mod.CampsiteCard ?? mod.default
}

function pickFixture(): Campsite {
  const c = fixtures.find((f) => f.agency && f.state)
  if (!c) throw new Error('expected at least one fixture with agency + state')
  return c
}

describe('T5.2 CampsiteCard', () => {
  let campsite: Campsite

  beforeEach(() => {
    campsite = pickFixture()
  })

  it('renders the campsite name', async () => {
    const CampsiteCard = await loadCampsiteCard()
    render(<CampsiteCard campsite={campsite} />)
    expect(screen.getByText(campsite.name)).toBeInTheDocument()
  })

  it('renders the agency and state', async () => {
    const CampsiteCard = await loadCampsiteCard()
    render(<CampsiteCard campsite={campsite} />)
    // Loose: agency and state must appear somewhere in the rendered output
    // (the visual layout is implementation-defined).
    expect(screen.getByText(new RegExp(campsite.agency!, 'i'))).toBeInTheDocument()
    expect(screen.getByText(new RegExp(campsite.state!, 'i'))).toBeInTheDocument()
  })

  it('links to routes.campsite(id)', async () => {
    const CampsiteCard = await loadCampsiteCard()
    render(<CampsiteCard campsite={campsite} />)
    // The card's accessible name should include the campsite name; the
    // wrapping link (or a primary link inside) must point at the detail page.
    const expectedHref = campsiteRoute(campsite.id)
    const link = screen.getByRole('link', { name: new RegExp(campsite.name, 'i') })
    expect(link).toHaveAttribute('href', expectedHref)
  })

  it('is keyboard-focusable (Tab moves focus onto the card link)', async () => {
    const CampsiteCard = await loadCampsiteCard()
    const user = userEvent.setup()
    render(<CampsiteCard campsite={campsite} />)
    const link = screen.getByRole('link', { name: new RegExp(campsite.name, 'i') })
    // Initially nothing is focused; Tab once should land on the link (no
    // earlier focusable controls in the rendered card).
    await user.tab()
    expect(link).toHaveFocus()
  })

  it('renders gracefully when agency/state are missing', async () => {
    const CampsiteCard = await loadCampsiteCard()
    const minimal: Campsite = {
      ...campsite,
      agency: undefined,
      state: undefined,
    }
    // Should not throw; the link must still resolve.
    render(<CampsiteCard campsite={minimal} />)
    expect(screen.getByText(minimal.name)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: new RegExp(minimal.name, 'i') }),
    ).toHaveAttribute('href', campsiteRoute(minimal.id))
  })
})
