// T0.5 — route builders emit exact paths, encoded queries.

import { describe, it, expect } from 'vitest'
import { home, campsites, campsite, trip } from '../routes'

describe('T0.5 routes', () => {
  it("home() === '/'", () => {
    expect(home()).toBe('/')
  })

  it("campsites() (no args) === '/campsites'", () => {
    expect(campsites()).toBe('/campsites')
  })

  it('campsites({ q }) URL-encodes the query', () => {
    expect(campsites({ q: 'big sur' })).toBe('/campsites?q=big+sur')
  })

  it('campsites({ q, state }) preserves both', () => {
    expect(campsites({ q: 'lake', state: 'CA' })).toBe(
      '/campsites?q=lake&state=CA',
    )
  })

  it('campsites with amenities[] appends each as a separate amenities= param', () => {
    const out = campsites({ amenities: ['potableWater', 'fireRings'] })
    // URLSearchParams keeps order
    expect(out).toBe('/campsites?amenities=potableWater&amenities=fireRings')
  })

  it('campsites with page', () => {
    expect(campsites({ page: 2 })).toBe('/campsites?page=2')
  })

  it("campsite(id) encodes the id (source-prefixed: 'seed:big-sur')", () => {
    expect(campsite('seed:big-sur')).toBe('/campsites/seed%3Abig-sur')
  })

  it('trip(id) encodes the slug', () => {
    expect(trip('abc-123')).toBe('/trips/abc-123')
  })
})
