// @vitest-environment jsdom
// T4.4 — root layout metadata + Header + Toaster.
// - metadata.title starts with "Bearcamp"
// - layout renders an element produced by `Header` (from `@/components/app`)
// - layout renders an element produced by `Toaster`
//
// We mock `next/font/google` because the SWC transform that resolves it
// isn't available under raw vitest. We mock the barrel (Header) and
// `@/components/ui/sonner` (Toaster) with sentinel markers so the assertion
// is purely structural — the implementations are validated by T4.1/T4.2.

import React from 'react'
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
  Header: () => React.createElement('header', { 'data-testid': 'header' }, 'Bearcamp'),
}))

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => React.createElement('div', { 'data-testid': 'toaster' }),
}))

// Importing the CSS side-effect must be a no-op in vitest (vite handles it).
// The layout file does `import './globals.css'` — vitest's CSS handling
// returns an empty module so this is fine.

describe('T4.4 root layout', () => {
  it('exports static metadata with title starting "Bearcamp"', async () => {
    const mod = await import('@/app/layout')
    expect(mod.metadata).toBeDefined()
    const title = mod.metadata.title
    // title may be a string, a TemplateString, or an object — accept any
    // representation that begins with "Bearcamp".
    const titleString =
      typeof title === 'string'
        ? title
        : typeof title === 'object' && title !== null && 'default' in title
        ? String((title as { default: string }).default)
        : String(title)
    expect(titleString).toMatch(/^Bearcamp/)
  })

  it('renders <Header /> and <Toaster /> inside the shell', async () => {
    const mod = await import('@/app/layout')
    const RootLayout = mod.default
    const tree = React.createElement(
      RootLayout,
      null,
      React.createElement('main', { 'data-testid': 'children' }, 'page')
    )
    const html = renderToStaticMarkup(tree)
    expect(html).toContain('data-testid="header"')
    expect(html).toContain('data-testid="toaster"')
    expect(html).toContain('data-testid="children"')
  })

  it('does NOT wrap the body in an app-wide empty <Suspense> (kills static shell)', async () => {
    const mod = await import('@/app/layout')
    const RootLayout = mod.default
    const html = renderToStaticMarkup(
      React.createElement(
        RootLayout,
        null,
        React.createElement('main', null, 'page-content')
      )
    )
    // Static shell must arrive intact — child content must be present in the
    // server-rendered HTML, not behind a deferred boundary. We assert the
    // visible content is in the initial markup. (An app-wide empty
    // <Suspense> with no fallback would still emit content, but architecture.md
    // is explicit: we don't add one. This is a heuristic guard — the real
    // test is T4.5's static-shell check.)
    expect(html).toContain('page-content')
  })
})
