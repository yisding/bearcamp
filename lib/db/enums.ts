// Prisma <-> DTO enum mapping — WS-2.
//
// Prisma enum members cannot contain spaces or `&`, so the DB uses
// `Health_Safety` / `Tools_Repair` / `Personal_Misc` while DTOs carry the
// display strings (`Health & Safety`, etc.). All conversions go through
// these helpers so the rest of `lib/db/*` doesn't sprinkle the mapping
// inline. See plan/data-model.md "Enum mapping note".

import type { ItemCategory } from './types'

// Mirror of the Prisma `ItemCategory` enum values — kept here as string
// literals so callers don't need to import `@prisma/client` types.
export type DbItemCategory =
  | 'Shelter'
  | 'Sleep'
  | 'Kitchen'
  | 'Water'
  | 'Food'
  | 'Clothing'
  | 'Navigation'
  | 'Health_Safety'
  | 'Hygiene'
  | 'Tools_Repair'
  | 'Personal_Misc'

const TO_DB: Record<ItemCategory, DbItemCategory> = {
  Shelter: 'Shelter',
  Sleep: 'Sleep',
  Kitchen: 'Kitchen',
  Water: 'Water',
  Food: 'Food',
  Clothing: 'Clothing',
  Navigation: 'Navigation',
  'Health & Safety': 'Health_Safety',
  Hygiene: 'Hygiene',
  'Tools & Repair': 'Tools_Repair',
  'Personal & Misc': 'Personal_Misc',
}

const FROM_DB: Record<DbItemCategory, ItemCategory> = {
  Shelter: 'Shelter',
  Sleep: 'Sleep',
  Kitchen: 'Kitchen',
  Water: 'Water',
  Food: 'Food',
  Clothing: 'Clothing',
  Navigation: 'Navigation',
  Health_Safety: 'Health & Safety',
  Hygiene: 'Hygiene',
  Tools_Repair: 'Tools & Repair',
  Personal_Misc: 'Personal & Misc',
}

export function toDbCategory(cat: ItemCategory): DbItemCategory {
  const v = TO_DB[cat]
  if (!v) throw new Error(`unknown ItemCategory: ${cat}`)
  return v
}

export function fromDbCategory(cat: DbItemCategory): ItemCategory {
  const v = FROM_DB[cat]
  if (!v) throw new Error(`unknown DB ItemCategory: ${cat}`)
  return v
}
