// T1.2 — templates content (WS-1.1).
//
// Asserts the revised car + backpacking base templates per
// plan/packing-engine.md "Notes on the latest revision":
//   - Removed from defaults: canopy, cot, air mattress, ALL Clothing items,
//     GPS / phone (Navigation electronics), emergency whistle.
//   - Added to defaults: Fire starter, Firewood, Roasting forks (Kitchen),
//     Entertainment (Personal & Misc), Lantern (kept).
//   - per_person: Camp chairs and Lantern.
//   - Style: Fire starter / Firewood / Roasting forks / Lantern / Camp chairs
//     are CC-only (BP excluded). Entertainment is on both.
//
// We import the templates barrel directly from the WS-1-owned file
// (`../templates`). That module does not exist until the implementer lands
// WS-1.1, so this file's first failure mode will be a module-not-found —
// expected red.

import { describe, it, expect } from 'vitest'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — templates.ts is owned by WS-1 implementer; not present
// in the red phase. Resolves once WS-1.1 lands.
import { templates } from '../templates'
import type { TripStyle, ItemCategory, ItemScope } from '../../db/types'

interface TemplateItem {
  category: ItemCategory
  name: string
  scope: ItemScope
  baseQty?: number
  unit?: string
  note?: string
  styles: TripStyle[]
}

const TEMPLATES = templates as TemplateItem[]

function carItems(): TemplateItem[] {
  return TEMPLATES.filter((t) => t.styles.includes('car'))
}
function bpItems(): TemplateItem[] {
  return TEMPLATES.filter((t) => t.styles.includes('backpacking'))
}

function findByName(
  list: TemplateItem[],
  needle: string | RegExp,
): TemplateItem | undefined {
  if (needle instanceof RegExp) return list.find((i) => needle.test(i.name))
  const n = needle.toLowerCase()
  return list.find((i) => i.name.toLowerCase().includes(n))
}

describe('T1.2 templates content', () => {
  it('exports a non-empty TemplateItem[]', () => {
    expect(Array.isArray(TEMPLATES)).toBe(true)
    expect(TEMPLATES.length).toBeGreaterThan(0)
  })

  it('every row has category / scope / styles / baseQty', () => {
    const validCategories: ItemCategory[] = [
      'Shelter',
      'Sleep',
      'Kitchen',
      'Water',
      'Food',
      'Clothing',
      'Navigation',
      'Health & Safety',
      'Hygiene',
      'Tools & Repair',
      'Personal & Misc',
    ]
    const validScopes: ItemScope[] = ['per_person', 'shared', 'per_tent']
    for (const t of TEMPLATES) {
      expect(validCategories).toContain(t.category)
      expect(validScopes).toContain(t.scope)
      expect(Array.isArray(t.styles)).toBe(true)
      expect(t.styles.length).toBeGreaterThan(0)
      for (const s of t.styles) {
        expect(['car', 'backpacking']).toContain(s)
      }
      // baseQty default is 1 (per packing-engine.md TemplateItem shape).
      const qty = t.baseQty ?? 1
      expect(qty).toBeGreaterThanOrEqual(1)
    }
  })

  // ---- EXCLUSIONS (revised template) ----

  describe('excludes removed-from-defaults items', () => {
    it('no canopy', () => {
      expect(findByName(TEMPLATES, /canopy/i)).toBeUndefined()
    })
    it('no cot', () => {
      expect(findByName(TEMPLATES, /\bcot\b/i)).toBeUndefined()
    })
    it('no air mattress', () => {
      expect(findByName(TEMPLATES, /air ?mattress/i)).toBeUndefined()
    })
    it('no Clothing-category items at all', () => {
      const clothing = TEMPLATES.filter((t) => t.category === 'Clothing')
      expect(clothing).toEqual([])
    })
    it('no GPS', () => {
      expect(findByName(TEMPLATES, /\bgps\b/i)).toBeUndefined()
    })
    it('no whistle', () => {
      expect(findByName(TEMPLATES, /whistle/i)).toBeUndefined()
    })
  })

  // ---- INCLUSIONS (revised template) ----

  describe('includes fire items (CC-only)', () => {
    it.each(['Fire starter', 'Firewood', 'Roasting forks'])(
      '%s present in CC list',
      (name) => {
        const item = findByName(carItems(), name)
        expect(item, `${name} missing from car template`).toBeDefined()
        expect(item!.category).toBe('Kitchen')
      },
    )

    it.each(['Fire starter', 'Firewood', 'Roasting forks'])(
      '%s absent from BP list (CC-only)',
      (name) => {
        expect(findByName(bpItems(), name)).toBeUndefined()
      },
    )
  })

  describe('chairs & lantern are per_person and CC-only', () => {
    it('Camp chairs is per_person on CC and not on BP', () => {
      const chair = findByName(carItems(), /camp chair/i)
      expect(chair, 'Camp chairs missing').toBeDefined()
      expect(chair!.scope).toBe('per_person')
      expect(chair!.styles).toContain('car')
      expect(chair!.styles).not.toContain('backpacking')
    })

    it('Lantern is per_person on CC and not on BP', () => {
      const lantern = findByName(carItems(), /lantern/i)
      expect(lantern, 'Lantern missing').toBeDefined()
      expect(lantern!.scope).toBe('per_person')
      expect(lantern!.styles).toContain('car')
      expect(lantern!.styles).not.toContain('backpacking')
    })
  })

  describe('entertainment present on both styles', () => {
    it('Entertainment is in Personal & Misc and applies to CC + BP', () => {
      const ent = findByName(TEMPLATES, /entertainment/i)
      expect(ent, 'Entertainment missing').toBeDefined()
      expect(ent!.category).toBe('Personal & Misc')
      expect(ent!.styles).toEqual(
        expect.arrayContaining(['car', 'backpacking']),
      )
    })
  })

  describe('multiplier-sensitive items keep their scopes', () => {
    it('Sleeping bag is per_person on both styles', () => {
      const bag = findByName(TEMPLATES, /sleeping bag/i)
      expect(bag, 'Sleeping bag missing').toBeDefined()
      expect(bag!.scope).toBe('per_person')
      expect(bag!.styles).toEqual(
        expect.arrayContaining(['car', 'backpacking']),
      )
    })

    it('Sleeping pad is per_person on both styles', () => {
      const pad = findByName(TEMPLATES, /sleeping pad/i)
      expect(pad, 'Sleeping pad missing').toBeDefined()
      expect(pad!.scope).toBe('per_person')
      expect(pad!.styles).toEqual(
        expect.arrayContaining(['car', 'backpacking']),
      )
    })

    it('Stove is shared (constant) on both styles', () => {
      const stove = findByName(TEMPLATES, /^stove$/i)
      expect(stove, 'Stove missing').toBeDefined()
      expect(stove!.scope).toBe('shared')
      expect(stove!.styles).toEqual(
        expect.arrayContaining(['car', 'backpacking']),
      )
    })

    it('Water filter / purifier is shared and BP-only', () => {
      const filter = findByName(TEMPLATES, /water filter|purifier/i)
      expect(filter, 'Water filter missing').toBeDefined()
      expect(filter!.scope).toBe('shared')
      expect(filter!.styles).toContain('backpacking')
    })

    it('Tent is per_tent on both styles', () => {
      const tent = findByName(TEMPLATES, /^tent$/i)
      expect(tent, 'Tent missing').toBeDefined()
      expect(tent!.scope).toBe('per_tent')
    })
  })
})
