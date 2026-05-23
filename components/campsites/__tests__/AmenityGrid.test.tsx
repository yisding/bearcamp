// @vitest-environment jsdom
// T5.3 — AmenityGrid (WS-5.8).
//
// Acceptance:
//   - one labeled entry per `Amenities` field, covering enum values
//     (`toilets`: 'none'|'vault'|'flush'; `cellService`: 'none'|'weak'|'good';
//     `accessLevel`: 'drive-in'|'walk-in'|'backcountry').
//   - boolean amenities render a human label whose state is observable from
//     the rendered text (e.g. "Showers: yes" / "Showers: no" / present-as-chip).
//
// AmenityGrid is a server component but synchronous — it just maps over the
// fields of `Amenities`. We feed it a hand-built object that hits every
// enum value and both boolean states, then assert the resulting DOM
// contains a labeled entry for each field.

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

import type { Amenities } from '@/lib/db/types'

async function loadAmenityGrid() {
  const mod = await import('@/components/campsites/AmenityGrid')
  return mod.AmenityGrid ?? mod.default
}

// Every boolean amenity and every enum value at least once across the
// fixtures we'll render. The grid is rendered for ONE campsite at a time,
// so we run multiple renders to verify enum-value coverage.

const baseAmenities: Amenities = {
  potableWater: true,
  toilets: 'flush',
  showers: true,
  electricity: true,
  fireRings: true,
  firewoodAvailable: true,
  picnicTables: true,
  bearLockers: true,
  bearCountry: true,
  trashService: true,
  dumpStation: true,
  cellService: 'good',
  accessLevel: 'drive-in',
}

// Boolean Amenities keys (excludes the enums + the optional note).
// `as const` keeps the literal tuple type so derived types stay narrow.
const BOOLEAN_KEYS = [
  'potableWater',
  'showers',
  'electricity',
  'fireRings',
  'firewoodAvailable',
  'picnicTables',
  'bearLockers',
  'bearCountry',
  'trashService',
  'dumpStation',
] as const satisfies ReadonlyArray<keyof Amenities>

type BoolKey = (typeof BOOLEAN_KEYS)[number]

// Human labels — we accept any reasonable English rendering. Keep the
// regex permissive so the implementation can phrase it as "Potable water"
// or "Drinking water", "Bear lockers" or "Bear-resistant lockers", etc.
const BOOLEAN_LABEL_PATTERNS = {
  potableWater: /potable\s*water|drinking\s*water/i,
  showers: /showers?/i,
  electricity: /electric(ity|al)?|power/i,
  fireRings: /fire\s*rings?/i,
  firewoodAvailable: /firewood/i,
  picnicTables: /picnic\s*tables?/i,
  bearLockers: /bear\s*(lockers?|boxes?|canisters?)/i,
  bearCountry: /bear\s*country/i,
  trashService: /trash|garbage/i,
  dumpStation: /dump\s*station/i,
} as const satisfies Record<BoolKey, RegExp>

describe('T5.3 AmenityGrid', () => {
  it('renders a labeled entry for every Amenities field (full + true case)', async () => {
    const AmenityGrid = await loadAmenityGrid()
    const { container } = render(<AmenityGrid amenities={baseAmenities} />)
    const text = container.textContent ?? ''

    for (const key of BOOLEAN_KEYS) {
      expect(text).toMatch(BOOLEAN_LABEL_PATTERNS[key])
    }
    // Enum fields: at least the value should render somewhere.
    expect(text).toMatch(/toilets?/i)
    expect(text).toMatch(/flush/i)
    expect(text).toMatch(/cell\s*service|cell\s*signal|cellular/i)
    expect(text).toMatch(/good/i)
    expect(text).toMatch(/access|drive-?in/i)
    expect(text).toMatch(/drive-?in/i)
  })

  it('reflects each `toilets` enum value', async () => {
    const AmenityGrid = await loadAmenityGrid()
    for (const v of ['none', 'vault', 'flush'] as const) {
      const { container } = render(
        <AmenityGrid amenities={{ ...baseAmenities, toilets: v }} />,
      )
      // The value (or a synonym for 'none') must appear in the rendered text.
      const text = container.textContent ?? ''
      if (v === 'none') {
        expect(text).toMatch(/none|no\s+toilets?/i)
      } else {
        expect(text).toMatch(new RegExp(v, 'i'))
      }
    }
  })

  it('reflects each `cellService` enum value', async () => {
    const AmenityGrid = await loadAmenityGrid()
    for (const v of ['none', 'weak', 'good'] as const) {
      const { container } = render(
        <AmenityGrid amenities={{ ...baseAmenities, cellService: v }} />,
      )
      const text = container.textContent ?? ''
      if (v === 'none') {
        expect(text).toMatch(/none|no\s+(cell|service|signal)/i)
      } else {
        expect(text).toMatch(new RegExp(v, 'i'))
      }
    }
  })

  it('reflects each `accessLevel` enum value', async () => {
    const AmenityGrid = await loadAmenityGrid()
    for (const v of ['drive-in', 'walk-in', 'backcountry'] as const) {
      const { container } = render(
        <AmenityGrid amenities={{ ...baseAmenities, accessLevel: v }} />,
      )
      const text = container.textContent ?? ''
      expect(text).toMatch(new RegExp(v.replace('-', '-?'), 'i'))
    }
  })

  it('renders a recognisably-different state for boolean=false vs boolean=true', async () => {
    const AmenityGrid = await loadAmenityGrid()
    const allTrue = render(<AmenityGrid amenities={baseAmenities} />)
    const allFalse = render(
      <AmenityGrid
        amenities={{
          ...baseAmenities,
          potableWater: false,
          showers: false,
          electricity: false,
          fireRings: false,
          firewoodAvailable: false,
          picnicTables: false,
          bearLockers: false,
          bearCountry: false,
          trashService: false,
          dumpStation: false,
        }}
      />,
    )
    // Concretely the rendered HTML must differ (e.g. checkmark vs cross,
    // muted text, or "no"). We assert non-equality of normalized text.
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
    expect(norm(allFalse.container.textContent ?? '')).not.toBe(
      norm(allTrue.container.textContent ?? ''),
    )
  })

  it('renders the optional `potableWaterNote` when present', async () => {
    const AmenityGrid = await loadAmenityGrid()
    const note = 'Spring 0.5 mi from camp'
    const { container } = render(
      <AmenityGrid
        amenities={{
          ...baseAmenities,
          potableWater: false,
          potableWaterNote: note,
        }}
      />,
    )
    expect(container.textContent).toContain(note)
  })
})
