"use client"

// WS-6.5 — ItemRow.
//
// Per-item row used inside PackingList and (with variant="removed") inside
// NoLongerNeeded. Shows the item name + a "claimed of needed" display.
// Over-claim renders the canonical string "claimed of needed — covered (extra)"
// (G-overclaim). Claim/unclaim use the injected Server Action props.
// Owners can inline-edit name|category|scope|baseQty|unit|note via
// `updateItem` (DR-3 restricted patch), and remove/restore the item.
//
// All actions are injected as props (I-2) so this component is testable
// without WS-7.

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

import type {
  ClaimItemResult,
  RemoveItemResult,
  RestoreItemResult,
  UnclaimItemResult,
  UpdateItemResult,
} from "@/lib/trips/action-types"
import type {
  ItemCategory,
  ItemScope,
  Participant,
  RemovedItemWithClaims,
  TripViewItem,
} from "@/lib/db/types"

const CATEGORY_OPTIONS: ItemCategory[] = [
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

const SCOPE_OPTIONS: { value: ItemScope; label: string }[] = [
  { value: "per_person", label: "Per person" },
  { value: "shared", label: "Shared" },
  { value: "per_tent", label: "Per tent" },
]

export interface ItemRowActions {
  claimItem: (input: {
    tripId: string
    itemId: string
    qty: number
  }) => Promise<ClaimItemResult>
  unclaimItem: (input: {
    tripId: string
    itemId: string
  }) => Promise<UnclaimItemResult>
  updateItem: (input: {
    tripId: string
    itemId: string
    patch: {
      name?: string
      category?: ItemCategory
      scope?: ItemScope
      baseQty?: number
      unit?: string
      note?: string
    }
  }) => Promise<UpdateItemResult>
  removeItem: (input: {
    tripId: string
    itemId: string
  }) => Promise<RemoveItemResult>
  restoreItem: (input: {
    tripId: string
    itemId: string
  }) => Promise<RestoreItemResult>
}

export interface ItemRowProps {
  item: TripViewItem | RemovedItemWithClaims
  currentParticipant: Participant | null
  isOwner: boolean
  actions: ItemRowActions
  /** "default" (the live PackingList row) or "removed" (NoLongerNeeded row). */
  variant?: "default" | "removed"
  className?: string
}

function isViewItem(
  item: TripViewItem | RemovedItemWithClaims,
): item is TripViewItem {
  return (item as TripViewItem).needed !== undefined
}

export function ItemRow({
  item,
  currentParticipant,
  isOwner,
  actions,
  variant = "default",
  className,
}: ItemRowProps) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [claimMode, setClaimMode] = React.useState(false)
  const [editing, setEditing] = React.useState(false)

  const viewItem = isViewItem(item) ? item : null
  const needed = viewItem?.needed ?? item.baseQty
  const claimed = viewItem?.claimed ?? 0
  const shortfall = viewItem?.shortfall ?? 0
  const overClaim = claimed > needed

  const myClaim = currentParticipant
    ? item.claims.find((c) => c.participant.id === currentParticipant.id)
    : undefined

  // Inline-edit field state (owner-only).
  const [name, setName] = React.useState(item.name)
  const [category, setCategory] = React.useState<ItemCategory>(item.category)
  const [scope, setScope] = React.useState<ItemScope>(item.scope)
  const [baseQty, setBaseQty] = React.useState<string>(String(item.baseQty))
  const [unit, setUnit] = React.useState<string>(item.unit ?? "")
  const [note, setNote] = React.useState<string>(item.note ?? "")

  // Claim qty input — defaults to the current shortfall (or 1 if the item is
  // already covered). The default MUST track `shortfall` across background
  // refreshes (WS-6.5 DoD: "claim defaults qty = shortfall"). State alone
  // doesn't re-derive, and keying the <Input> only remounts the DOM node — so
  // we (a) reset to the shortfall when the user enters claim mode, and (b)
  // sync via an effect when `shortfall` changes — but ONLY while the user is
  // not actively editing (claim mode closed), so a background refresh never
  // clobbers a qty the user is mid-edit on (review G3 / T6.7).
  const defaultClaimQty = Math.max(shortfall || 1, 1)
  const [claimQty, setClaimQty] = React.useState<number>(defaultClaimQty)

  React.useEffect(() => {
    if (!claimMode) {
      setClaimQty(defaultClaimQty)
    }
  }, [claimMode, defaultClaimQty])

  function enterClaimMode() {
    setClaimQty(defaultClaimQty)
    setClaimMode(true)
  }

  function runClaim(qty: number) {
    startTransition(async () => {
      const result = await actions.claimItem({
        tripId: item.tripId,
        itemId: item.id,
        qty,
      })
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      setClaimMode(false)
      router.refresh()
    })
  }

  function runUnclaim() {
    startTransition(async () => {
      const result = await actions.unclaimItem({
        tripId: item.tripId,
        itemId: item.id,
      })
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      router.refresh()
    })
  }

  function runSaveEdits() {
    startTransition(async () => {
      const patch: {
        name?: string
        category?: ItemCategory
        scope?: ItemScope
        baseQty?: number
        unit?: string
        note?: string
      } = {}
      if (name !== item.name) patch.name = name
      if (category !== item.category) patch.category = category
      if (scope !== item.scope) patch.scope = scope
      const parsedBaseQty = Number(baseQty)
      if (
        !Number.isNaN(parsedBaseQty) &&
        Number.isFinite(parsedBaseQty) &&
        parsedBaseQty !== item.baseQty
      ) {
        patch.baseQty = parsedBaseQty
      }
      // Coerce empty / whitespace-only fields to `undefined` so clearing a
      // field actually clears it (rather than persisting "").
      const nextUnit = unit.trim() || undefined
      const nextNote = note.trim() || undefined
      if (nextUnit !== item.unit) patch.unit = nextUnit
      if (nextNote !== item.note) patch.note = nextNote
      const result = await actions.updateItem({
        tripId: item.tripId,
        itemId: item.id,
        patch,
      })
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      setEditing(false)
      router.refresh()
    })
  }

  function runRemove() {
    startTransition(async () => {
      const result = await actions.removeItem({
        tripId: item.tripId,
        itemId: item.id,
      })
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      router.refresh()
    })
  }

  function runRestore() {
    startTransition(async () => {
      const result = await actions.restoreItem({
        tripId: item.tripId,
        itemId: item.id,
      })
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      router.refresh()
    })
  }

  // Quantity display string. Three forms:
  //   over-claim → "5 of 3 — covered (extra)"  (G-overclaim, canonical)
  //   covered    → "3 of 3 — covered"
  //   shortage   → "1 of 3"
  let qtyText: string
  if (overClaim) {
    qtyText = `${claimed} of ${needed} — covered (extra)`
  } else if (shortfall === 0 && claimed > 0) {
    qtyText = `${claimed} of ${needed} — covered`
  } else {
    qtyText = `${claimed} of ${needed}`
  }

  return (
    <li
      data-slot="item-row"
      data-category={item.category}
      aria-busy={pending || undefined}
      className={cn(
        "flex flex-col gap-2 rounded-2xl border border-border p-3",
        variant === "removed" && "opacity-80",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{item.name}</span>
          <span className="text-xs text-muted-foreground">
            {item.category} · {item.scope.replace("_", " ")}
            {item.unit ? ` · ${item.unit}` : ""}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span data-slot="qty">{qtyText}</span>
          {shortfall > 0 ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {shortfall} still needed
            </span>
          ) : null}
        </div>
      </div>

      {item.note ? (
        <p className="text-xs text-muted-foreground">{item.note}</p>
      ) : null}

      {/* Per-participant claim chips */}
      {item.claims.length > 0 ? (
        <ul className="flex flex-wrap gap-1">
          {item.claims.map((c) => (
            <li
              key={c.participant.id}
              className="rounded-full bg-muted px-2 py-0.5 text-xs"
            >
              {c.participant.name}
              {c.qty > 1 ? ` × ${c.qty}` : ""}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Action row */}
      {variant === "removed" ? (
        isOwner ? (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={runRestore}
              disabled={pending}
            >
              Restore
            </Button>
          </div>
        ) : null
      ) : (
        <div className="flex flex-wrap gap-2">
          {!claimMode && !myClaim ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={enterClaimMode}
              disabled={pending}
            >
              I&apos;ll bring
            </Button>
          ) : null}

          {!claimMode && myClaim ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={runUnclaim}
              disabled={pending}
            >
              Unclaim
            </Button>
          ) : null}

          {claimMode ? (
            <div className="flex items-center gap-2">
              <Label className="flex items-center gap-2 text-sm">
                qty
                <Input
                  type="number"
                  min={1}
                  // Cap the input affordance at what the item needs (WS-6.5:
                  // "capped via input"). Over-claim is still possible via
                  // other paths; this is just the spinner's sensible ceiling.
                  max={Math.max(needed, 1)}
                  step={1}
                  value={claimQty}
                  onChange={(e) =>
                    setClaimQty(Math.max(1, Number(e.target.value) || 1))
                  }
                  className="h-8 w-16"
                />
              </Label>
              <Button
                type="button"
                size="sm"
                onClick={() => runClaim(claimQty)}
                disabled={pending}
              >
                Confirm
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setClaimMode(false)}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          ) : null}

          {isOwner && !editing ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(true)}
                disabled={pending}
              >
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={runRemove}
                disabled={pending}
              >
                Remove
              </Button>
            </>
          ) : null}
        </div>
      )}

      {/* Owner inline editor */}
      {isOwner && editing && variant !== "removed" ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`name-${item.id}`}>Name</Label>
            <Input
              id={`name-${item.id}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`category-${item.id}`}>Category</Label>
              <select
                id={`category-${item.id}`}
                value={category}
                onChange={(e) => setCategory(e.target.value as ItemCategory)}
                className="h-9 rounded-2xl border border-input bg-input/30 px-3 text-sm"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`scope-${item.id}`}>Scope</Label>
              <select
                id={`scope-${item.id}`}
                value={scope}
                onChange={(e) => setScope(e.target.value as ItemScope)}
                className="h-9 rounded-2xl border border-input bg-input/30 px-3 text-sm"
              >
                {SCOPE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`baseQty-${item.id}`}>Base qty</Label>
              <Input
                id={`baseQty-${item.id}`}
                type="number"
                min={0}
                step={1}
                value={baseQty}
                onChange={(e) => setBaseQty(e.target.value)}
                className="w-20"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`unit-${item.id}`}>Unit</Label>
              <Input
                id={`unit-${item.id}`}
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-24"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`note-${item.id}`}>Note</Label>
            <Input
              id={`note-${item.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={runSaveEdits}
              disabled={pending}
            >
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false)
                setName(item.name)
                setCategory(item.category)
                setScope(item.scope)
                setBaseQty(String(item.baseQty))
                setUnit(item.unit ?? "")
                setNote(item.note ?? "")
              }}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

export default ItemRow
