// WS-1.4 — Real generate pipeline. Pure, deterministic, no I/O.
//
// Pipeline:
//   1. Filter the base template by `style`.
//   2. Apply the amenity-rule pipeline in defined order.
//   3. Sort by (categoryIndex, originalTemplateIndex), then assign
//      `sortOrder` as a strictly-ascending integer.
//   4. Return TripItem[]. The caller (storage adapter) assigns
//      `id`/`tripId`; we leave those empty strings per the contract on
//      CreateTripInput.items.
//
// `index.ts` is frozen (WS-0). Signature here matches the stub exactly so
// the barrel re-export keeps working unchanged (T0.11).

import type { Amenities, TripItem, TripStyle } from '../db/types'
import { templates, CATEGORY_ORDER, type TemplateItem } from './templates'
import { applyRules } from './rules'

function templateToTripItem(
  t: TemplateItem,
  templateIdx: number,
): TripItem & { __templateIdx: number } {
  return {
    id: '',
    tripId: '',
    category: t.category,
    name: t.name,
    scope: t.scope,
    baseQty: t.baseQty ?? 1,
    unit: t.unit,
    note: t.note,
    source: 'template',
    sortOrder: 0, // assigned in the final sort pass
    removed: false,
    // Stash original template index for stable secondary sort. Stripped
    // before return so we don't leak it past the engine.
    __templateIdx: templateIdx,
  }
}

function categoryIndex(c: TripItem['category']): number {
  const idx = CATEGORY_ORDER.indexOf(c)
  // Unknown category → push to end (shouldn't happen with typed inputs).
  return idx < 0 ? CATEGORY_ORDER.length : idx
}

export function generate(style: TripStyle, _amenities: Amenities): TripItem[] {
  // 1. Filter by style. Stash the original template index for stable sort.
  const filtered = templates
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.styles.includes(style))
    .map(({ t, i }) => templateToTripItem(t, i))

  // 2. Apply rule pipeline. Rules mutate `filtered` in place and may push
  //    new items (which won't carry a __templateIdx — they get a synthetic
  //    one larger than any template index so they sort after template rows
  //    in the same category).
  applyRules(filtered as unknown as TripItem[], _amenities, style)

  // 3. Sort. New items (no __templateIdx) sort after template items of the
  //    same category, in insertion order.
  const TEMPLATE_TAIL = templates.length // any index < this is a template row
  const withSortKey = filtered.map((it, insertionIdx) => {
    const tIdx = (it as TripItem & { __templateIdx?: number }).__templateIdx
    const secondary = typeof tIdx === 'number' ? tIdx : TEMPLATE_TAIL + insertionIdx
    return { it, primary: categoryIndex(it.category), secondary }
  })
  withSortKey.sort((a, b) => {
    if (a.primary !== b.primary) return a.primary - b.primary
    return a.secondary - b.secondary
  })

  // 4. Assign sortOrder and strip the internal __templateIdx field.
  return withSortKey.map(({ it }, idx) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { __templateIdx, ...clean } = it as TripItem & { __templateIdx?: number }
    return { ...clean, sortOrder: idx }
  })
}
