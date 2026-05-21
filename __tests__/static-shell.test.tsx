// @vitest-environment jsdom
// T4.5 — static shell intact.
//
// The architecture forbids an app-wide empty `<Suspense>` above the body —
// it would force the entire app off the static shell and break the
// `unstable_instant` prefetch contract on `/`, `/campsites`, and
// `/campsites/[id]`.
//
// Playwright (the canonical harness from `plan/tasks/ws-4-design-system-app-shell.md`)
// is NOT yet wired in this repo, so the implementer should add it as part of
// turning this red phase green — see `e2e/static-shell.spec.ts` for the
// Playwright stub. In the meantime we approximate the assertion by
// server-rendering the root layout with a representative landing-page child
// and verifying:
//   - the output is non-empty
//   - the child content arrives in the initial HTML (not behind a fallback)
//   - there is no top-level <body> containing only a <template/$> Suspense
//     fallback marker followed by no content.

import React, { Suspense } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/font/google', () => {
  const make = (variableName: string) => () => ({
    variable: `--${variableName}`,
    className: variableName,
    style: { fontFamily: variableName },
  })
  return {
    Geist: make('font-geist'),
    Geist_Mono: make('font-geist-mono'),
    IBM_Plex_Sans: make('font-sans'),
    Montserrat: make('font-heading'),
  }
})

vi.mock('@/components/app', () => ({
  Header: () =>
    React.createElement('header', { 'data-testid': 'header' }, 'Bearcamp'),
}))

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => React.createElement('div', { 'data-testid': 'toaster' }),
}))

describe('T4.5 static shell intact', () => {
  it('root layout server-renders a non-empty static shell with child content', async () => {
    const layoutMod = await import('@/app/layout')
    const RootLayout = layoutMod.default

    // Use a synchronous server component analogue — a plain function returning
    // landing-page content. Async server components don't render in raw
    // react-dom/server, but the *landing* page is allowed to be sync because
    // `/` only reads cached data.
    const Landing = () =>
      React.createElement(
        'main',
        { 'data-testid': 'landing' },
        'Plan a camping trip with friends.'
      )

    const html = renderToStaticMarkup(
      React.createElement(RootLayout, null, React.createElement(Landing))
    )

    expect(html.length).toBeGreaterThan(100)
    expect(html).toContain('data-testid="header"')
    expect(html).toContain('data-testid="landing"')
    expect(html).toContain('Plan a camping trip with friends.')
  })

  it('layout source does NOT wrap children in an app-wide empty <Suspense>', async () => {
    // Belt-and-braces: read the source. An accidental
    //   <Suspense fallback={null}>{children}</Suspense>
    // wrapper around `{children}` inside <body> would defeat the static
    // shell. We assert the file does not contain any `<Suspense` tag in the
    // root layout (suspense boundaries belong on sub-routes, not the root).
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const src = await fs.readFile(
      path.resolve(process.cwd(), 'app/layout.tsx'),
      'utf8'
    )
    expect(src).not.toMatch(/<\s*Suspense\b/)
  })

  it('control: Suspense with no fallback would defer (sanity check on the harness)', () => {
    // Documents the failure mode we're protecting against. This is a
    // self-test of the assertion strategy, not a layout test.
    const Defer = () =>
      React.createElement(
        Suspense,
        null,
        React.createElement('span', null, 'hidden')
      )
    const html = renderToStaticMarkup(React.createElement(Defer))
    // With no fallback and no async work, sync renderToStaticMarkup *does*
    // render the children — so the production guard is "don't add an empty
    // Suspense above body" via the source-check above, not via this harness.
    // We just assert the harness does what we expect for the sync case.
    expect(typeof html).toBe('string')
  })
})
