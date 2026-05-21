// WS-1.1 — Base templates. Pure data, no I/O.
// Encodes the revised car + backpacking tables from
// `plan/packing-engine.md` (post-edit: no canopy/cot/clothing/GPS/whistle;
// with fire starter, firewood, roasting forks, entertainment; chairs &
// lantern `per_person`, CC-only fire items). Each row declares which
// styles include it; the engine filters at generation time.
//
// Item ordering within a category here drives the secondary "template
// order" that `generate.ts` uses when assigning `sortOrder` (category
// order first, then this declared order).

import type { ItemCategory, ItemScope, TripStyle } from '../db/types'

export interface TemplateItem {
  category: ItemCategory
  name: string
  scope: ItemScope
  /** Default 1 if omitted. Per unit of scope (per_person/per_tent/shared). */
  baseQty?: number
  unit?: string
  note?: string
  /** Which base lists include this row. */
  styles: TripStyle[]
}

/**
 * Base template catalog. Single source of truth for default items.
 * Order within a category matters — it's the stable secondary sort key.
 */
export const templates: TemplateItem[] = [
  // ---------------- Shelter ----------------
  {
    category: 'Shelter',
    name: 'Tent',
    scope: 'per_tent',
    baseQty: 1,
    styles: ['car', 'backpacking'],
    note: '1 per ~2 people (configurable on trip)',
  },
  {
    category: 'Shelter',
    name: 'Tent stakes & guylines',
    scope: 'per_tent',
    baseQty: 1,
    styles: ['car', 'backpacking'],
  },
  {
    category: 'Shelter',
    name: 'Footprint / ground tarp',
    scope: 'per_tent',
    baseQty: 1,
    styles: ['car', 'backpacking'],
  },

  // ---------------- Sleep ----------------
  {
    category: 'Sleep',
    name: 'Sleeping bag',
    scope: 'per_person',
    baseQty: 1,
    styles: ['car', 'backpacking'],
    note: 'temp-rated for expected lows',
  },
  {
    category: 'Sleep',
    name: 'Sleeping pad',
    scope: 'per_person',
    baseQty: 1,
    styles: ['car', 'backpacking'],
  },
  {
    category: 'Sleep',
    name: 'Pillow',
    scope: 'per_person',
    baseQty: 1,
    styles: ['car'],
  },

  // ---------------- Kitchen ----------------
  {
    category: 'Kitchen',
    name: 'Stove',
    scope: 'shared',
    baseQty: 1,
    styles: ['car', 'backpacking'],
  },
  {
    category: 'Kitchen',
    name: 'Fuel',
    scope: 'shared',
    baseQty: 1,
    styles: ['car', 'backpacking'],
  },
  {
    category: 'Kitchen',
    name: 'Cook pot',
    scope: 'shared',
    baseQty: 1,
    styles: ['car', 'backpacking'],
  },
  {
    category: 'Kitchen',
    name: 'Eating kit (bowl/spork/mug)',
    scope: 'per_person',
    baseQty: 1,
    styles: ['car', 'backpacking'],
  },
  {
    category: 'Kitchen',
    name: 'Cooler',
    scope: 'shared',
    baseQty: 1,
    styles: ['car'],
  },
  {
    category: 'Kitchen',
    name: 'Camp table',
    scope: 'shared',
    baseQty: 1,
    styles: ['car'],
  },
  {
    category: 'Kitchen',
    name: 'Dish kit (soap/sponge/towel)',
    scope: 'shared',
    baseQty: 1,
    styles: ['car', 'backpacking'],
  },
  {
    category: 'Kitchen',
    name: 'Fire starter',
    scope: 'shared',
    baseQty: 1,
    styles: ['car'],
    note: 'matches/lighter + tinder',
  },
  {
    category: 'Kitchen',
    name: 'Firewood',
    scope: 'shared',
    baseQty: 1,
    styles: ['car'],
    note: 'qty/note set by amenity rules',
  },
  {
    category: 'Kitchen',
    name: 'Roasting forks',
    scope: 'shared',
    baseQty: 1,
    styles: ['car'],
  },

  // ---------------- Water ----------------
  {
    category: 'Water',
    name: 'Water bottles / reservoir',
    scope: 'per_person',
    baseQty: 1,
    styles: ['car', 'backpacking'],
  },
  {
    category: 'Water',
    name: 'Water filter / purifier',
    scope: 'shared',
    baseQty: 1,
    styles: ['backpacking'],
  },
  {
    category: 'Water',
    name: 'Water carry/storage jug',
    scope: 'shared',
    baseQty: 1,
    styles: ['car', 'backpacking'],
  },

  // ---------------- Food ----------------
  {
    category: 'Food',
    name: 'Meals & snacks',
    scope: 'per_person',
    baseQty: 1,
    styles: ['car', 'backpacking'],
    note: 'planned per day',
  },
  {
    category: 'Food',
    name: 'Bear canister',
    scope: 'shared',
    baseQty: 1,
    styles: ['backpacking'],
  },

  // ---------------- Navigation ----------------
  {
    category: 'Navigation',
    name: 'Map & compass',
    scope: 'shared',
    baseQty: 1,
    styles: ['backpacking'],
  },
  {
    category: 'Navigation',
    name: 'Headlamp',
    scope: 'per_person',
    baseQty: 1,
    styles: ['car', 'backpacking'],
    note: '+ spare batteries',
  },
  {
    category: 'Navigation',
    name: 'Lantern',
    scope: 'per_person',
    baseQty: 1,
    styles: ['car'],
  },

  // ---------------- Health & Safety ----------------
  {
    category: 'Health & Safety',
    name: 'First-aid kit',
    scope: 'shared',
    baseQty: 1,
    styles: ['car', 'backpacking'],
  },
  {
    category: 'Health & Safety',
    name: 'Sunscreen',
    scope: 'shared',
    baseQty: 1,
    styles: ['car', 'backpacking'],
  },
  {
    category: 'Health & Safety',
    name: 'Insect repellent',
    scope: 'shared',
    baseQty: 1,
    styles: ['car', 'backpacking'],
  },
  {
    category: 'Health & Safety',
    name: 'Fire extinguisher / bucket',
    scope: 'shared',
    baseQty: 1,
    styles: ['car'],
  },

  // ---------------- Hygiene ----------------
  {
    category: 'Hygiene',
    name: 'Toiletries',
    scope: 'per_person',
    baseQty: 1,
    styles: ['car', 'backpacking'],
  },
  {
    category: 'Hygiene',
    name: 'Toilet paper',
    scope: 'shared',
    baseQty: 1,
    styles: ['car', 'backpacking'],
  },
  {
    category: 'Hygiene',
    name: 'Trowel (catholes)',
    scope: 'shared',
    baseQty: 1,
    styles: ['backpacking'],
  },
  {
    category: 'Hygiene',
    name: 'Wag bag / pack-out kit',
    scope: 'per_person',
    baseQty: 1,
    styles: ['backpacking'],
  },
  {
    category: 'Hygiene',
    name: 'Trash bags',
    scope: 'shared',
    baseQty: 1,
    styles: ['car', 'backpacking'],
  },

  // ---------------- Tools & Repair ----------------
  {
    category: 'Tools & Repair',
    name: 'Multi-tool / knife',
    scope: 'shared',
    baseQty: 1,
    styles: ['car', 'backpacking'],
  },
  {
    category: 'Tools & Repair',
    name: 'Duct tape / repair kit',
    scope: 'shared',
    baseQty: 1,
    styles: ['car', 'backpacking'],
  },
  {
    category: 'Tools & Repair',
    name: 'Paracord',
    scope: 'shared',
    baseQty: 1,
    styles: ['car', 'backpacking'],
  },

  // ---------------- Personal & Misc ----------------
  {
    category: 'Personal & Misc',
    name: 'ID / permits / reservation',
    scope: 'per_person',
    baseQty: 1,
    styles: ['car', 'backpacking'],
  },
  {
    category: 'Personal & Misc',
    name: 'Cash',
    scope: 'per_person',
    baseQty: 1,
    styles: ['car', 'backpacking'],
  },
  {
    category: 'Personal & Misc',
    name: 'Camp chairs',
    scope: 'per_person',
    baseQty: 1,
    styles: ['car'],
  },
  {
    category: 'Personal & Misc',
    name: 'Entertainment (cards/games/book)',
    scope: 'shared',
    baseQty: 1,
    styles: ['car', 'backpacking'],
  },
  {
    category: 'Personal & Misc',
    name: 'Power bank',
    scope: 'shared',
    baseQty: 1,
    styles: ['backpacking'],
  },
]

/**
 * The canonical category ordering. Used by `generate.ts` to assign
 * `sortOrder` (category index × stride + template index).
 */
export const CATEGORY_ORDER: ItemCategory[] = [
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
