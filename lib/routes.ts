// Pure URL builders — WS-0.10. Consumed read-only everywhere.
// No side effects; never reads cookies/headers/env.

import type { Amenities } from './db/types'

export const home = (): string => '/'

export interface CampsitesQuery {
  q?: string
  state?: string
  agency?: string
  amenities?: (keyof Amenities)[]
  page?: number
}

export function campsites(query?: CampsitesQuery): string {
  if (!query) return '/campsites'
  const params = new URLSearchParams()
  if (query.q) params.set('q', query.q)
  if (query.state) params.set('state', query.state)
  if (query.agency) params.set('agency', query.agency)
  if (query.amenities && query.amenities.length > 0) {
    for (const a of query.amenities) params.append('amenities', a)
  }
  if (query.page !== undefined) params.set('page', String(query.page))
  const qs = params.toString()
  return qs ? `/campsites?${qs}` : '/campsites'
}

export function campsite(id: string): string {
  // Campsite ids are source-prefixed (`seed:foo`); the colon is safe in
  // path segments but encoders are picky — explicitly encode.
  return `/campsites/${encodeURIComponent(id)}`
}

export function trip(id: string): string {
  return `/trips/${encodeURIComponent(id)}`
}
