# Packing Engine

`generate(style, amenities) → TripItem[]` (categorized). Pure, deterministic,
no I/O — runs in the static shell. Steps:

1. Start from the **base template** for `style`.
2. Apply **amenity rules** in order (add / remove / adjust qty / annotate).
3. Assign `sortOrder` by category then template order.
4. Persist as `trip_items`; quantities are computed later from participant
   count (see "Quantity math").

## Categories (fixed order)

`Shelter → Sleep → Kitchen → Water → Food → Clothing → Navigation →
Health & Safety → Hygiene → Tools & Repair → Personal & Misc`

## Item shape (template-level)

```ts
interface TemplateItem {
  category: ItemCategory
  name: string
  scope: 'per_person' | 'shared' | 'per_tent'
  baseQty?: number       // default 1, per unit of scope
  unit?: string
  note?: string
  styles: TripStyle[]    // which base lists include it
}
```

`scope` decides how quantity multiplies (see below). This is where "sleeping
bags and mats multiply by people" is encoded: they are `per_person`.

## Base templates (`lib/packing/templates.ts`)

Representative contents — final list is tuned during implementation. **CC** =
car camping, **BP** = backpacking.

| Category | Item | scope | Styles | Notes |
|---|---|---|---|---|
| Shelter | Tent | per_tent | CC, BP | 1 per ~2 people |
| Shelter | Tent stakes & guylines | per_tent | CC, BP | |
| Shelter | Footprint / ground tarp | per_tent | CC, BP | |
| Sleep | **Sleeping bag** | **per_person** | CC, BP | temp-rated |
| Sleep | **Sleeping pad** | **per_person** | CC, BP | |
| Sleep | Pillow | per_person | CC | |
| Kitchen | Stove | shared | CC, BP | |
| Kitchen | Fuel | shared | CC, BP | |
| Kitchen | Cook pot | shared | CC, BP | |
| Kitchen | Eating kit (bowl/spork/mug) | per_person | CC, BP | |
| Kitchen | Cooler | shared | CC | |
| Kitchen | Camp table | shared | CC | |
| Kitchen | Dish kit (soap/sponge/towel) | shared | CC, BP | |
| Kitchen | Fire starter | shared | CC | matches/lighter + tinder |
| Kitchen | Firewood | shared | CC | qty/note set by amenity rules |
| Kitchen | Roasting forks | shared | CC | |
| Water | Water bottles / reservoir | per_person | CC, BP | |
| Water | Water filter / purifier | shared | BP | |
| Water | Water carry/storage jug | shared | CC, BP | |
| Food | Meals & snacks | per_person | CC, BP | planned per day |
| Food | Bear canister | shared | BP | |
| Navigation | Map & compass | shared | BP | |
| Navigation | Headlamp | per_person | CC, BP | + spare batteries |
| Navigation | Lantern | per_person | CC | |
| Health & Safety | First-aid kit | shared | CC, BP | |
| Health & Safety | Sunscreen | shared | CC, BP | |
| Health & Safety | Insect repellent | shared | CC, BP | |
| Health & Safety | Fire extinguisher / bucket | shared | CC | |
| Hygiene | Toiletries | per_person | CC, BP | |
| Hygiene | Toilet paper | shared | CC, BP | |
| Hygiene | Trowel (catholes) | shared | BP | |
| Hygiene | Wag bag / pack-out kit | per_person | BP | |
| Hygiene | Trash bags | shared | CC, BP | |
| Tools & Repair | Multi-tool / knife | shared | CC, BP | |
| Tools & Repair | Duct tape / repair kit | shared | CC, BP | |
| Tools & Repair | Paracord | shared | CC, BP | |
| Personal & Misc | ID / permits / reservation | per_person | CC, BP | |
| Personal & Misc | Cash | per_person | CC, BP | |
| Personal & Misc | Camp chairs | per_person | CC | |
| Personal & Misc | Entertainment (cards/games/book) | shared | CC, BP | |
| Personal & Misc | Power bank | shared | BP | |

**Notes on the latest revision:**

- Removed from defaults: canopy, cot/air mattress, **all Clothing items**,
  GPS/phone, emergency whistle. `Clothing` stays a valid `ItemCategory` so
  users can still add clothing as custom items — it just has no template
  defaults.
- Added to defaults: Fire starter, Firewood, Roasting forks (Kitchen),
  Entertainment (Personal & Misc), Lantern (kept).
- **Per-person:** Camp chairs and Lantern are `per_person` (multiply with
  group size). Fire starter, Firewood, Roasting forks, and Entertainment are
  `shared` (the request only called out chairs and lanterns as per-person).
- **Style:** the new fire items, chairs, and lantern default to **car camping
  (CC)** only — they don't make sense for backpacking weight/access.
  Entertainment is both. Flag if you want any of these on the backpacking
  list too.

## Amenity rules (`lib/packing/rules.ts`)

Ordered transforms; each is `(items, amenities) → items`. Rules **adjust** the
generated list so the same campsite produces different lists per style.

| Condition | Effect |
|---|---|
| `potableWater === true` | Water carry/storage jug → note "tap on site"; reduce BP `Water carry` qty; keep bottles. |
| `potableWater === false` | **Add** extra water storage (CC: large jug, baseQty↑); BP: emphasize filter + capacity; note "no water — bring/treat all". |
| `toilets === 'flush' \| 'vault'` | **Remove** Trowel and Wag bag (not needed). |
| `toilets === 'none'` | Keep/strengthen Trowel (BP) or **add** portable toilet (CC). |
| `showers === false` | Add "camp towel + biodegradable soap (no showers)". |
| `electricity === true` (CC) | Add: extension cord, power strip, device chargers; downgrade power bank to optional. |
| `electricity === false` (CC) | Add power bank / car inverter; keep lantern. |
| `fireRings === true` | Ensure fire items present (Fire starter, Firewood, Roasting forks); add campfire grill grate (CC). |
| `fireRings === false` | Remove fire items (Fire starter, Firewood, Roasting forks); add note "no fires — stove only". |
| `firewoodAvailable === false && fireRings` | Annotate Firewood "none on site — bring your own"; bump qty. |
| `firewoodAvailable === true` | Annotate Firewood "available on site — buy local". |
| `picnicTables === false` (CC) | Promote Camp table to required (baseQty ensured). |
| `bearLockers === true` | **Remove** bear canister; add note "use provided lockers". |
| `bearLockers === false && bearCountry === true` | Ensure bear canister (BP) / bear-proof container or hang kit (CC); add note. |
| `cellService === 'none'` | Add: paper map & compass (promote to required even CC), offline maps, satellite messenger (optional, BP). |
| `trashService === false` | Strengthen trash bags; add "pack out all trash". |
| `accessLevel === 'walk-in'` | Add gear cart / haul straps (CC). |
| `accessLevel === 'backcountry'` (BP) | Add permit reminder; emphasize pack weight; remove CC-only bulky items if style mismatch. |

Rules never duplicate: each checks for an existing item by `name` before
adding; "adjust" mutates the existing entry. Every rule-added/removed item is
tagged `source: 'amenity'` so the UI can show *why* an item is on the list
("Added because: no potable water").

## Quantity math (`lib/packing/quantities.ts`)

The user requirement: some items multiply with the number of people; others
stay shared. Encoded by `scope`:

```ts
function requiredQty(
  item: TripItem,
  participantCount: number,
  tentCapacity: number = TENT_CAPACITY, // module default = 2; per-trip override read from Trip.tentCapacity
): number {
  const n = Math.max(1, participantCount)
  const cap = Math.max(1, tentCapacity)
  switch (item.scope) {
    case 'per_person': return item.baseQty * n               // sleeping bag, pad, eating kit
    case 'per_tent':   return item.baseQty * Math.ceil(n / cap) // cap defaults to 2; owner can change per trip
    case 'shared':     return item.baseQty                    // stove, filter, first-aid kit
  }
}
```

- **`per_person`** → multiplies linearly with people. This is the
  sleeping-bags-and-mats requirement.
- **`per_tent`** → multiplies stepwise (1 tent per `tentCapacity` people,
  `Math.ceil`). **`tentCapacity` is a per-trip field on `Trip`** (default
  2; owner-editable). One 6-person tent → owner sets `tentCapacity=6` and
  the shortfall stays at 1 tent (review-2 G-tent).
- **`shared`** → constant regardless of group size.

`participantCount` = number of `participants` rows for the trip (the owner is
also a participant). When the trip has no joiners yet, `n` floors at 1 so the
solo list is sensible. `buildTripView` passes the trip's `tentCapacity` to
`requiredQty`.

### Shortfall / "still needed"

For each visible (`removed === false`) item:

```
needed    = requiredQty(item, participantCount)
claimed   = Σ claims.qty for that item
shortfall = max(0, needed - claimed)
```

- **Still needed** view = items with `shortfall > 0` (visible items only),
  showing `claimed / needed` (e.g. "Sleeping bag — 2 of 4").
- **Who's bringing what** = claims grouped by participant, with item + qty.
- An item with `shortfall === 0` renders as fully covered (checkmark) but is
  still editable.
- **Over-claim** (`claimed > needed`): allowed; displayed as
  `"claimed of needed — covered (extra)"` (e.g. "5 of 3 — covered (extra)").
  `shortfall = max(0, needed − claimed)`, so over-claim never goes
  negative. A test asserts the display string (T6.3b, review-2 G-overclaim).
- **Removed items with live claims** render under a dedicated
  **"No longer needed (claimed)"** section so participants see why a claim
  they previously made has disappeared. Restoring the item (owner action
  `restoreItem`) moves the claim back to the main list (review-2 G-soft).

### Claim UX rules

- A participant claiming an item defaults `qty` to the remaining `shortfall`
  (capped) but may set any non-negative integer; over-claim is allowed and
  shown as "covered (extra)".
- Claims persist per participant; reopening the link (same participant cookie)
  shows their existing claims editable.
- `per_person`/`per_tent` needed-qty recomputes automatically as people join —
  the trip page derives it on every (uncached) render, so it stays correct
  without migrating stored rows.
