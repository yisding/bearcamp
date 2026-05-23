// @vitest-environment jsdom
// T6.10 / T6.11 — trip page server-side behavior.
//
// Acceptance:
//   T6.10 — visiting an unknown `/trips/<id>` calls `notFound()` (which throws
//           NEXT_NOT_FOUND in Next 16; Next renders not-found.tsx). The page
//           must NOT crash — it must `await params`, look up the trip view,
//           and bail via notFound() when the view is null.
//   T6.11 — server-rendered HTML contains
//           `<meta name="robots" content="noindex,nofollow">` (DR-17). This
//           comes from `generateMetadata()` returning `{ robots: { index:
//           false, follow: false } }`.
//
// We import the page module dynamically and render it. The page is an async
// server component that wraps its data fetch in a `<Suspense>` boundary (an
// async `<TripContent>` child does the `buildTripView` await + `notFound()`),
// so we render the page tree and let React resolve the suspended child rather
// than calling the page as a bare function.

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock next/navigation BEFORE importing the page so its `notFound()` is the
// spy we own.
const notFound = vi.fn(() => {
  // Next.js notFound() throws a special error that Next catches. Throw a
  // tagged sentinel error so we can assert it was triggered.
  const e = new Error('NEXT_NOT_FOUND')
  ;(e as Error & { digest?: string }).digest = 'NEXT_NOT_FOUND'
  throw e
})
const redirect = vi.fn((url: string) => {
  const e = new Error(`NEXT_REDIRECT:${url}`)
  ;(e as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};307;`
  throw e
})
vi.mock('next/navigation', () => ({
  notFound,
  redirect,
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/trips/trip_x',
}))

// Mock next/headers — the page uses identity.stub which calls cookies().
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (_name: string) => undefined,
    set: vi.fn(),
    delete: vi.fn(),
  })),
}))

// Mock services to control buildTripView responses.
const buildTripView = vi.fn()
vi.mock('@/lib/services', async () => {
  const actual: typeof import('@/lib/services') = await vi.importActual(
    '@/lib/services',
  )
  return {
    ...actual,
    getStorage: () => ({
      ...actual.getStorage(),
      view: { buildTripView },
    }),
  }
})

async function loadPage() {
  const mod = await import('@/app/trips/[tripId]/page')
  return mod.default
}
async function loadMetadata() {
  const mod = await import('@/app/trips/[tripId]/page')
  return mod.generateMetadata
}

// The page returns `<main><Suspense><TripContent tripId=… /></Suspense></main>`.
// `TripContent` is the async server component that performs `buildTripView`
// and calls `notFound()`. Walk the element tree the page produced and invoke
// every async function-component we find, so the suspended data fetch (and any
// `notFound()` it throws) actually runs — mirroring what React's RSC renderer
// would do behind the `<Suspense>` boundary.
async function resolveTree(node: unknown): Promise<unknown> {
  if (node == null || typeof node !== 'object') return node
  if (Array.isArray(node)) {
    return Promise.all(node.map(resolveTree))
  }
  const el = node as {
    type?: unknown
    props?: { children?: unknown } & Record<string, unknown>
  }
  if (typeof el.type === 'function') {
    // Async function component — invoke it (this may throw notFound()).
    const out = await (el.type as (p: unknown) => unknown)(el.props ?? {})
    return resolveTree(out)
  }
  if (el.props && 'children' in el.props) {
    await resolveTree(el.props.children)
  }
  return node
}

beforeEach(() => {
  notFound.mockClear()
  redirect.mockClear()
  buildTripView.mockReset()
})

describe('T6.10 trip page — not-found for unknown ids', () => {
  it('calls notFound() when buildTripView returns null', async () => {
    buildTripView.mockResolvedValue(null)
    const Page = await loadPage()
    // Next 16 async params: pass a Promise<{ tripId }> per AGENTS.md.
    // The page wraps the data fetch in <Suspense>; resolving the tree drives
    // the async <TripContent> child, which is where notFound() now lives.
    let threw: unknown
    try {
      const tree = await Page({
        params: Promise.resolve({ tripId: 'doesnotexist' }),
      })
      await resolveTree(tree)
    } catch (e) {
      threw = e
    }
    expect((threw as { digest?: string } | undefined)?.digest).toBe(
      'NEXT_NOT_FOUND',
    )
    expect(notFound).toHaveBeenCalledTimes(1)
    expect(buildTripView).toHaveBeenCalledWith('doesnotexist')
  })
})

describe('T6.11 trip page — noindex metadata (DR-17)', () => {
  it('generateMetadata returns robots: { index:false, follow:false }', async () => {
    const generateMetadata = await loadMetadata()
    expect(typeof generateMetadata).toBe('function')
    const meta = await generateMetadata!(
      { params: Promise.resolve({ tripId: 'trip_x' }) } as never,
      {} as never,
    )
    // Accept either the structured shape or the canonical string form Next
    // serializes it to.
    const robots = (meta as { robots?: unknown }).robots
    if (typeof robots === 'string') {
      expect(robots).toMatch(/noindex/i)
      expect(robots).toMatch(/nofollow/i)
    } else if (robots && typeof robots === 'object') {
      const r = robots as { index?: boolean; follow?: boolean }
      expect(r.index).toBe(false)
      expect(r.follow).toBe(false)
    } else {
      throw new Error(
        'generateMetadata did not return a `robots` field — DR-17 violated',
      )
    }
  })
})
