// Fixture campsite catalog — WS-0.6 (impl agent fills in).
// Must contain 12-15 campsites spanning every amenity rule branch in
// plan/packing-engine.md, all `fixture:` prefixed.

import type { Campsite } from '../db/types'
import type { CampsiteSource } from './source'

export const fixtures: Campsite[] = []

export function createFixtureSource(): CampsiteSource {
  return {
    all: () => Promise.resolve(fixtures),
    getById: (id: string) =>
      Promise.resolve(fixtures.find((c) => c.id === id) ?? null),
    search: () => {
      throw new Error(
        'fixtureSource.search not implemented (WS-0.6 — impl phase)',
      )
    },
  }
}
