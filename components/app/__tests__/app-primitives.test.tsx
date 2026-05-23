// @vitest-environment jsdom
// T4.2 — app-level primitives in `components/app/*` render the expected
// roles and content given typed props.
//
// Contract sketched against WS-4.4 (`PageHeader`, `EmptyState`, `ErrorState`,
// `ListSkeleton`, `Section`). Each module is imported directly (not via the
// barrel — that's covered by T4.3) so a missing single component shows up
// here distinctly.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

import { PageHeader } from '@/components/app/PageHeader'
import { EmptyState } from '@/components/app/EmptyState'
import { ErrorState } from '@/components/app/ErrorState'
import { ListSkeleton } from '@/components/app/ListSkeleton'
import { Section } from '@/components/app/Section'

describe('T4.2 app primitives', () => {
  describe('PageHeader', () => {
    it('renders title as a heading and optional description', () => {
      render(<PageHeader title="Campsites" description="Find a spot" />)
      expect(
        screen.getByRole('heading', { name: 'Campsites' })
      ).toBeInTheDocument()
      expect(screen.getByText('Find a spot')).toBeInTheDocument()
    })

    it('renders an optional actions slot', () => {
      render(
        <PageHeader
          title="Trip"
          actions={<button>Share</button>}
        />
      )
      expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
    })
  })

  describe('EmptyState', () => {
    it('renders title + description + optional action', () => {
      render(
        <EmptyState
          title="No items yet"
          description="Add your first item to get started."
          action={<button>Add item</button>}
        />
      )
      expect(screen.getByText('No items yet')).toBeInTheDocument()
      expect(
        screen.getByText('Add your first item to get started.')
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument()
    })
  })

  describe('ErrorState', () => {
    it('renders an alert role with the provided message', () => {
      render(<ErrorState title="Something went wrong" message="Try again." />)
      // ErrorState is an assertive surface — role=alert announces it.
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/something went wrong/i)
      expect(alert).toHaveTextContent(/try again/i)
    })

    it('renders an optional retry action', () => {
      render(
        <ErrorState
          title="Boom"
          message="No connection"
          action={<button>Retry</button>}
        />
      )
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    })
  })

  describe('ListSkeleton', () => {
    it('renders multiple placeholder rows', () => {
      const { container } = render(<ListSkeleton rows={5} />)
      // Each row should be a discrete element — we count direct children
      // descendants. Loose: at least one element must be aria-busy or have
      // role=status to mark loading state.
      const busy = container.querySelector('[aria-busy="true"], [role="status"]')
      expect(busy).not.toBeNull()
      // And the requested row count should be reachable (loose: ≥ N
      // elements with a row-marking data-attribute or animate-pulse class).
      const rows = container.querySelectorAll(
        '[data-slot="list-skeleton-row"], [data-row], .animate-pulse'
      )
      expect(rows.length).toBeGreaterThanOrEqual(5)
    })

    it('defaults to a sensible number of rows when no prop is given', () => {
      const { container } = render(<ListSkeleton />)
      const busy = container.querySelector('[aria-busy="true"], [role="status"]')
      expect(busy).not.toBeNull()
    })
  })

  describe('Section', () => {
    it('renders a section landmark with a heading and children', () => {
      render(
        <Section title="Still needed">
          <p>contents</p>
        </Section>
      )
      // <section> with an accessible name becomes a region landmark.
      expect(
        screen.getByRole('region', { name: 'Still needed' })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: 'Still needed' })
      ).toBeInTheDocument()
      expect(screen.getByText('contents')).toBeInTheDocument()
    })

    it('accepts an actions slot rendered next to the heading', () => {
      render(
        <Section title="Members" actions={<button>Invite</button>}>
          <p>x</p>
        </Section>
      )
      expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument()
    })
  })
})
