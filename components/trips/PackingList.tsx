// WS-6.4 — PackingList.
//
// Server component that groups visible (removed=false) items by the fixed
// category order from plan/packing-engine.md, rendering one `<ItemRow>` per
// item. Owner-only "Add item" affordance is gated by `isOwner`.
//
// Server Action props are passed through to ItemRow + AddItemForm so this
// component remains decoupled from WS-7 (I-2). At wire-up time the page
// supplies real actions; for the WS-6 acceptance tests, stubs are injected.

import * as React from "react"

import { Section } from "@/components/app"
import { cn } from "@/lib/utils"

import { ItemRow, type ItemRowActions } from "./ItemRow"
import { AddItemForm, type AddItemAction } from "./AddItemForm"

import type {
  ItemCategory,
  Participant,
  TripView,
} from "@/lib/db/types"

const CATEGORY_ORDER: ItemCategory[] = [
  "Shelter",
  "Sleep",
  "Kitchen",
  "Water",
  "Food",
  "Clothing",
  "Navigation",
  "Health & Safety",
  "Hygiene",
  "Tools & Repair",
  "Personal & Misc",
]

export interface PackingListProps {
  view: TripView
  isOwner: boolean
  currentParticipant?: Participant | null
  itemActions?: ItemRowActions
  addItemAction?: AddItemAction
  className?: string
}

export function PackingList({
  view,
  isOwner,
  currentParticipant = null,
  itemActions,
  addItemAction,
  className,
}: PackingListProps) {
  const byCategory = new Map<ItemCategory, TripView["items"]>()
  for (const it of view.items) {
    const arr = byCategory.get(it.category) ?? []
    arr.push(it)
    byCategory.set(it.category, arr)
  }

  const presentCategories = CATEGORY_ORDER.filter((c) =>
    byCategory.has(c) && (byCategory.get(c)?.length ?? 0) > 0,
  )

  return (
    <div
      data-slot="packing-list"
      className={cn("flex flex-col gap-6", className)}
    >
      {isOwner && addItemAction ? (
        <AddItemForm tripId={view.trip.id} addItemAction={addItemAction} />
      ) : isOwner ? (
        // Affordance visible even before actions are wired (tests assert
        // owner-only button presence). Disabled until the action arrives.
        <button
          type="button"
          disabled
          className="self-start rounded-2xl border border-dashed border-border px-3 py-1 text-sm text-muted-foreground"
        >
          Add custom item
        </button>
      ) : null}

      {presentCategories.map((cat) => (
        <Section key={cat} title={cat}>
          <ul className="flex flex-col gap-2">
            {byCategory.get(cat)!.map((item) =>
              itemActions ? (
                <ItemRow
                  key={item.id}
                  item={item}
                  currentParticipant={currentParticipant}
                  isOwner={isOwner}
                  actions={itemActions}
                />
              ) : (
                // No actions wired yet — render a static row so tests that
                // mock ItemRow still see the right grouping.
                <ItemRow
                  key={item.id}
                  item={item}
                  currentParticipant={currentParticipant}
                  isOwner={isOwner}
                  actions={NOOP_ACTIONS}
                />
              ),
            )}
          </ul>
        </Section>
      ))}
    </div>
  )
}

const NOOP_ACTIONS: ItemRowActions = {
  claimItem: async () => ({
    ok: false,
    error: { code: "internal", message: "no action wired" },
  }),
  unclaimItem: async () => ({
    ok: false,
    error: { code: "internal", message: "no action wired" },
  }),
  updateItem: async () => ({
    ok: false,
    error: { code: "internal", message: "no action wired" },
  }),
  removeItem: async () => ({
    ok: false,
    error: { code: "internal", message: "no action wired" },
  }),
  restoreItem: async () => ({
    ok: false,
    error: { code: "internal", message: "no action wired" },
  }),
}

export default PackingList
