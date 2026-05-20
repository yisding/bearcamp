// T0.9 — smoke.
// Create a trip from a fixture campsite via memory + stub generate; the
// resulting view yields ≥1 item per category (template covers all 11).

import { describe, it, expect } from 'vitest'
import { createMemoryStorage } from '../lib/db/storage.memory'
import { generate } from '../lib/packing'
import { fixtures } from '../lib/campsites/fixtures'
import type { ItemCategory } from '../lib/db/types'

describe('T0.9 smoke', () => {
  it('end-to-end: fixture + generate + memory → view has ≥1 item per generated category', async () => {
    expect(fixtures.length).toBeGreaterThan(0)
    const c = fixtures[0]

    const items = generate('car', c.amenities)
    expect(items.length).toBeGreaterThan(0)

    const s = createMemoryStorage()
    const { trip } = await s.trips.create({
      name: `Trip to ${c.name}`,
      campsiteId: c.id,
      campsite: {
        name: c.name,
        amenities: c.amenities,
        state: c.state,
        agency: c.agency,
      },
      style: 'car',
      ownerName: 'Smoke',
      ownerToken: 'o-' + 'x'.repeat(30),
      ownerParticipantToken: 'p-' + 'x'.repeat(30),
      items: items.map((i) => ({
        category: i.category,
        name: i.name,
        scope: i.scope,
        baseQty: i.baseQty,
        unit: i.unit,
        note: i.note,
        source: i.source,
      })),
    })

    const view = await s.view.buildTripView(trip.id)
    expect(view).not.toBeNull()

    // Every category present in the generated items appears with ≥1 item in
    // the rendered view.
    const generatedCats = new Set<ItemCategory>(items.map((i) => i.category))
    for (const cat of generatedCats) {
      const cnt = view!.items.filter((i) => i.category === cat).length
      expect(cnt).toBeGreaterThanOrEqual(1)
    }
  })
})
