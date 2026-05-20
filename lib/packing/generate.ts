// Stub generate() — WS-0.7 ships the stub; WS-1 replaces this file behind
// the unchanged barrel (B1/B2).

import type { Amenities, TripItem, TripStyle } from '../db/types'

export function generate(_style: TripStyle, _amenities: Amenities): TripItem[] {
  throw new Error('generate not implemented (WS-0.7 stub — impl phase)')
}
