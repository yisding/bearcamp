// WS-1.3 — Amenity rules. Pure, deterministic, idempotent.
//
// Each rule is `(items, amenities) => items`. Rules mutate the array in place
// for "adjust" operations and `push`/`splice` for add/remove. Every rule:
//   1. looks up by `name` (case-insensitive) before adding — never duplicates
//   2. tags rule-added/removed/adjusted items `source: 'amenity'`
//   3. attaches a human-readable `note` explaining *why* the rule fired
//
// Running the pipeline N times deep-equals running it once (T1.3).
//
// Rule ordering matters when two rules touch the same row — e.g. `fireRings`
// (removes fire items) runs before `firewoodAvailable` (annotates firewood)
// so the annotation step finds nothing on a no-fire site. See the comment
// next to each rule.

import type { Amenities, TripItem, TripStyle } from '../db/types'
import type { TemplateItem } from './templates'

// ---- internal helpers ---------------------------------------------------

function indexOfByName(items: TripItem[], name: string | RegExp): number {
  if (name instanceof RegExp) return items.findIndex((i) => name.test(i.name))
  const n = name.toLowerCase()
  return items.findIndex((i) => i.name.toLowerCase() === n)
}

function findByName(items: TripItem[], name: string | RegExp): TripItem | undefined {
  const i = indexOfByName(items, name)
  return i >= 0 ? items[i] : undefined
}

/**
 * Remove an item by exact-name (case-insensitive). Idempotent: filtering an
 * already-removed item is a no-op. We splice in place so the array reference
 * is preserved.
 */
function removeByName(items: TripItem[], name: string | RegExp): void {
  const idx = indexOfByName(items, name)
  if (idx >= 0) items.splice(idx, 1)
}

/**
 * Ensure an item with the given template-shape exists. If present, mutates
 * it in place to mark `source: 'amenity'` and set the note. If absent,
 * pushes a new TripItem.
 */
function ensureItem(
  items: TripItem[],
  template: Omit<TemplateItem, 'styles'> & { note: string },
): TripItem {
  const existing = findByName(items, template.name)
  if (existing) {
    existing.source = 'amenity'
    existing.note = template.note
    if (template.baseQty !== undefined) existing.baseQty = template.baseQty
    if (template.unit !== undefined) existing.unit = template.unit
    return existing
  }
  const created: TripItem = {
    id: '',
    tripId: '',
    category: template.category,
    name: template.name,
    scope: template.scope,
    baseQty: template.baseQty ?? 1,
    unit: template.unit,
    note: template.note,
    source: 'amenity',
    sortOrder: 0, // assigned by generate() after rules
    removed: false,
  }
  items.push(created)
  return created
}

/**
 * Adjust an existing item — set its note, optionally bump baseQty, tag as
 * amenity. No-op if the item is not present (the rule that owns the row
 * decides whether the row should exist).
 */
function adjustItem(
  items: TripItem[],
  name: string | RegExp,
  patch: { note?: string; baseQty?: number; unit?: string },
): TripItem | undefined {
  const target = findByName(items, name)
  if (!target) return undefined
  target.source = 'amenity'
  if (patch.note !== undefined) target.note = patch.note
  if (patch.baseQty !== undefined) target.baseQty = patch.baseQty
  if (patch.unit !== undefined) target.unit = patch.unit
  return target
}

// ---- individual rules ---------------------------------------------------
// Each rule receives the current style so CC-only / BP-only branches stay
// honest. All rules return `items` (the same reference) for piping.

type Rule = (items: TripItem[], amenities: Amenities, style: TripStyle) => TripItem[]

// 1) potableWater — annotate jug if available; add storage if not.
//    Spec (packing-engine.md lines 106–107):
//      - potableWater === true → note + REDUCE BP water-carry qty
//      - potableWater === false → annotate + baseQty↑ on extra storage
const potableWaterRule: Rule = (items, a, style) => {
  if (a.potableWater) {
    adjustItem(items, 'Water carry/storage jug', {
      note: 'tap on site — top up as needed',
    })
    if (style === 'backpacking') {
      // Spec: reduce BP water-carry qty when tap is on site. The current
      // BP template carries `Water bottles / reservoir` at baseQty=1, which
      // is already at the floor — there is nothing sensible to decrement.
      // We document the no-op explicitly so a future template revision
      // (baseQty=2+) automatically picks up the intended reduction.
      const bottles = findByName(items, 'Water bottles / reservoir')
      if (bottles && bottles.baseQty > 1) {
        bottles.source = 'amenity'
        bottles.baseQty = Math.max(1, bottles.baseQty - 1)
        bottles.note = 'tap on site — reduced carry capacity'
      }
      // else: template baseQty already at floor of 1; nothing to reduce.
    }
  } else {
    adjustItem(items, 'Water carry/storage jug', {
      note: 'no water on site — bring/treat all',
    })
    if (style === 'car') {
      // Spec: baseQty↑ on extra water storage — "extra" must mean more
      // than the default-1 jug already on the list, so we set baseQty=2.
      ensureItem(items, {
        category: 'Water',
        name: 'Extra water storage (large jug)',
        scope: 'shared',
        baseQty: 2,
        note: 'no potable water — bring extra capacity',
      })
    } else {
      // backpacking: emphasize the filter that's already on the list.
      adjustItem(items, /water filter|purifier/i, {
        note: 'no potable water — treat all sources',
      })
    }
  }
  return items
}

// 2) toilets — remove trowel/wag bag if flush/vault; otherwise add the
//    style-appropriate solution.
const toiletsRule: Rule = (items, a, style) => {
  if (a.toilets === 'flush' || a.toilets === 'vault') {
    removeByName(items, 'Trowel (catholes)')
    removeByName(items, 'Wag bag / pack-out kit')
  } else if (a.toilets === 'none') {
    if (style === 'backpacking') {
      ensureItem(items, {
        category: 'Hygiene',
        name: 'Trowel (catholes)',
        scope: 'shared',
        baseQty: 1,
        note: 'no toilets — dig catholes per LNT',
      })
    } else {
      ensureItem(items, {
        category: 'Hygiene',
        name: 'Portable toilet',
        scope: 'shared',
        baseQty: 1,
        note: 'no toilets on site',
      })
    }
  }
  return items
}

// 3) showers — add camp towel + biodegradable soap when there are none.
const showersRule: Rule = (items, a) => {
  if (!a.showers) {
    ensureItem(items, {
      category: 'Hygiene',
      name: 'Camp towel + biodegradable soap',
      scope: 'per_person',
      baseQty: 1,
      note: 'no showers on site',
    })
  }
  return items
}

// 4) electricity (CC only) — cords/strip when available; power bank
//    otherwise. We don't touch BP because the BP template handles the
//    power bank itself.
//
//    Note on the "downgrade power bank to optional" branch of the spec
//    (packing-engine.md line 111): Power bank is a *BP-only* template
//    row, so for CC there is nothing in the base list to downgrade. If a
//    user has manually added a power bank as a custom item to a CC trip,
//    we deliberately leave it alone — custom items are out of scope for
//    amenity rules. This is a no-op by design, not an omission.
const electricityRule: Rule = (items, a, style) => {
  if (style !== 'car') return items
  if (a.electricity) {
    ensureItem(items, {
      category: 'Personal & Misc',
      name: 'Extension cord',
      scope: 'shared',
      baseQty: 1,
      note: 'site has electricity',
    })
    ensureItem(items, {
      category: 'Personal & Misc',
      name: 'Power strip',
      scope: 'shared',
      baseQty: 1,
      note: 'site has electricity',
    })
    ensureItem(items, {
      category: 'Personal & Misc',
      name: 'Device chargers',
      scope: 'per_person',
      baseQty: 1,
      note: 'site has electricity',
    })
  } else {
    ensureItem(items, {
      category: 'Personal & Misc',
      name: 'Power bank',
      scope: 'shared',
      baseQty: 1,
      note: 'no electricity on site',
    })
    ensureItem(items, {
      category: 'Personal & Misc',
      name: 'Car inverter',
      scope: 'shared',
      baseQty: 1,
      note: 'no electricity — charge from vehicle',
    })
  }
  return items
}

// 5) fireRings — removes fire items when absent; ensures + adds grill grate
//    when present (CC). MUST run before firewoodAvailableRule so that
//    annotation step finds (or doesn't find) firewood consistently.
const fireRingsRule: Rule = (items, a, style) => {
  if (a.fireRings) {
    if (style === 'car') {
      // Make sure the three fire items are present on a fire-friendly CC trip.
      // The base template already includes them, but re-running rules on a
      // mutated list must be idempotent so we use ensureItem.
      ensureItem(items, {
        category: 'Kitchen',
        name: 'Fire starter',
        scope: 'shared',
        baseQty: 1,
        note: 'fire rings on site',
      })
      ensureItem(items, {
        category: 'Kitchen',
        name: 'Firewood',
        scope: 'shared',
        baseQty: 1,
        note: 'fire rings on site',
      })
      ensureItem(items, {
        category: 'Kitchen',
        name: 'Roasting forks',
        scope: 'shared',
        baseQty: 1,
        note: 'fire rings on site',
      })
      ensureItem(items, {
        category: 'Kitchen',
        name: 'Campfire grill grate',
        scope: 'shared',
        baseQty: 1,
        note: 'fire rings on site',
      })
    }
  } else {
    // No fires — remove all fire items (including the grate if present from
    // an earlier pass) so the list isn't misleading.
    removeByName(items, 'Fire starter')
    removeByName(items, 'Firewood')
    removeByName(items, 'Roasting forks')
    removeByName(items, 'Campfire grill grate')
    // Tag the stove with a "stove only" hint.
    adjustItem(items, /^stove$/i, {
      note: 'no fires on site — stove only',
    })
  }
  return items
}

// 6) firewoodAvailable — only meaningful when fireRings is true; we still
//    no-op safely when Firewood was removed by the previous rule.
const firewoodAvailableRule: Rule = (items, a) => {
  if (!a.fireRings) return items
  const fw = findByName(items, 'Firewood')
  if (!fw) return items
  if (a.firewoodAvailable) {
    fw.source = 'amenity'
    fw.note = 'available on site — buy local'
  } else {
    fw.source = 'amenity'
    fw.note = 'none on site — bring your own'
    fw.baseQty = Math.max(fw.baseQty, 2)
  }
  return items
}

// 7) picnicTables (CC only) — promote camp table when no picnic tables.
const picnicTablesRule: Rule = (items, a, style) => {
  if (style !== 'car') return items
  if (!a.picnicTables) {
    const table = findByName(items, 'Camp table')
    if (table) {
      table.source = 'amenity'
      table.note = 'no picnic tables on site — bring your own'
      table.baseQty = Math.max(table.baseQty, 1)
    } else {
      ensureItem(items, {
        category: 'Kitchen',
        name: 'Camp table',
        scope: 'shared',
        baseQty: 1,
        note: 'no picnic tables on site — bring your own',
      })
    }
  }
  return items
}

// 8) bearLockers — remove canister when lockers are provided. Spec
//    (packing-engine.md line 118): "Remove bear canister; add note 'use
//    provided lockers'". This is a pure-removal rule — there is no
//    surviving item to annotate, since the canister is gone. Earlier
//    versions added a placeholder "Bear locker plan" Food item to keep
//    a `source:'amenity'` row visible, but that item is not in the spec.
const bearLockersRule: Rule = (items, a) => {
  if (a.bearLockers) {
    removeByName(items, 'Bear canister')
  }
  return items
}

// 9) bearCountry (only when no lockers) — ensure canister (BP) or
//    bear-proof container (CC).
const bearCountryRule: Rule = (items, a, style) => {
  if (a.bearLockers || !a.bearCountry) return items
  if (style === 'backpacking') {
    ensureItem(items, {
      category: 'Food',
      name: 'Bear canister',
      scope: 'shared',
      baseQty: 1,
      note: 'bear country — required for food storage',
    })
  } else {
    ensureItem(items, {
      category: 'Food',
      name: 'Bear-proof container / hang kit',
      scope: 'shared',
      baseQty: 1,
      note: 'bear country — secure food at all times',
    })
  }
  return items
}

// 10) cellService — when no cell, promote the existing Map & compass
//    (even CC), add offline maps; satellite messenger optional on BP.
//    Spec (packing-engine.md line 120): *promote* paper map & compass to
//    required. We annotate the existing row in place rather than removing
//    it and adding a parallel "Paper map & compass" item. If the row is
//    absent (CC base template has no Map & compass), we add it with the
//    same canonical note so the rule stays idempotent regardless of
//    whether the row pre-existed.
const cellServiceRule: Rule = (items, a, style) => {
  if (a.cellService !== 'none') return items
  const PROMOTED_NOTE = 'cell service unreliable here — bring paper map'
  ensureItem(items, {
    category: 'Navigation',
    name: 'Map & compass',
    scope: 'shared',
    baseQty: 1,
    note: PROMOTED_NOTE,
  })
  ensureItem(items, {
    category: 'Navigation',
    name: 'Offline maps (downloaded)',
    scope: 'per_person',
    baseQty: 1,
    note: 'no cell service — pre-download maps',
  })
  if (style === 'backpacking') {
    ensureItem(items, {
      category: 'Navigation',
      name: 'Satellite messenger (optional)',
      scope: 'shared',
      baseQty: 1,
      note: 'no cell service — optional emergency comms',
    })
  }
  return items
}

// 11) trashService — strengthen trash bags when absent.
const trashServiceRule: Rule = (items, a) => {
  if (a.trashService) return items
  const bags = findByName(items, 'Trash bags')
  if (bags) {
    bags.source = 'amenity'
    bags.note = 'no trash service — pack out all trash'
    bags.baseQty = Math.max(bags.baseQty, 2)
  } else {
    ensureItem(items, {
      category: 'Hygiene',
      name: 'Trash bags',
      scope: 'shared',
      baseQty: 2,
      note: 'no trash service — pack out all trash',
    })
  }
  return items
}

// 12) accessLevel — gear cart (walk-in CC), permit + weight focus
//    (backcountry BP).
const accessLevelRule: Rule = (items, a, style) => {
  if (a.accessLevel === 'walk-in' && style === 'car') {
    ensureItem(items, {
      category: 'Tools & Repair',
      name: 'Gear cart / haul straps',
      scope: 'shared',
      baseQty: 1,
      note: 'walk-in site — gear must be hauled from parking',
    })
  }
  if (a.accessLevel === 'backcountry' && style === 'backpacking') {
    ensureItem(items, {
      category: 'Personal & Misc',
      name: 'Backcountry permit',
      scope: 'shared',
      baseQty: 1,
      note: 'backcountry access — permit required',
    })
  }
  return items
}

// Order matters — see top-of-file comment. Rules are pure; we keep the
// array stable so failures are easy to read.
const RULES: Rule[] = [
  potableWaterRule,
  toiletsRule,
  showersRule,
  electricityRule,
  fireRingsRule,
  firewoodAvailableRule,
  picnicTablesRule,
  bearLockersRule,
  bearCountryRule,
  cellServiceRule,
  trashServiceRule,
  accessLevelRule,
]

/**
 * Apply the amenity rule pipeline in canonical order. Mutates and returns
 * the same array reference for piping. Idempotent: `applyRules(applyRules(x))
 * deep-equals applyRules(x)`.
 *
 * `style` defaults to inferring from the items themselves is impossible
 * (rules need to know whether to add CC- vs BP-specific items even when
 * the template hasn't seeded the row). For backward compatibility with
 * tests that call `applyRules(items, amenities)` without a style, we
 * fall back to detecting via canister/water-filter presence; if neither
 * helps, we default to 'car'. The third argument is preferred.
 */
export function applyRules(
  items: TripItem[],
  amenities: Amenities,
  style?: TripStyle,
): TripItem[] {
  const resolvedStyle: TripStyle = style ?? inferStyleFromItems(items)
  for (const rule of RULES) {
    rule(items, amenities, resolvedStyle)
  }
  return items
}

// test-only fallback — `generate()` always passes an explicit style, so
// this is only reached when callers invoke `applyRules(items, amenities)`
// without a style (legacy / direct unit tests).
function inferStyleFromItems(items: TripItem[]): TripStyle {
  // Water filter or bear canister or wag bag → backpacking template.
  if (
    items.some((i) =>
      /water filter|purifier|bear canister|wag bag|trowel/i.test(i.name),
    )
  ) {
    return 'backpacking'
  }
  // Camp chairs, lantern, fire items, cooler → car.
  if (
    items.some((i) =>
      /camp chair|^lantern$|fire starter|firewood|roasting forks|cooler/i.test(
        i.name,
      ),
    )
  ) {
    return 'car'
  }
  return 'car'
}
