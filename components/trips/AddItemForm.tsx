"use client"

// WS-6.12 — AddItemForm (owner-only).
//
// Renders the "Add custom item" affordance and the add-item form.
// Calls the injected `addItemAction` (typed input). Server-Action wiring
// happens in WS-7; this component receives the action as a prop so WS-6 can
// be tested without the real action.

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import type {
  AddItemInput,
  AddItemResult,
} from "@/lib/trips/action-types"
import type { ItemCategory, ItemScope } from "@/lib/db/types"

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

export type AddItemAction = (
  input: AddItemInput,
) => Promise<AddItemResult>

export interface AddItemFormProps {
  tripId: string
  addItemAction: AddItemAction
}

export function AddItemForm({ tripId, addItemAction }: AddItemFormProps) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [name, setName] = React.useState("")
  const [category, setCategory] = React.useState<ItemCategory>("Personal & Misc")
  const [scope, setScope] = React.useState<ItemScope>("shared")
  const [baseQty, setBaseQty] = React.useState<string>("1")
  const [unit, setUnit] = React.useState<string>("")
  const [note, setNote] = React.useState<string>("")

  function reset() {
    setName("")
    setCategory("Personal & Misc")
    setScope("shared")
    setBaseQty("1")
    setUnit("")
    setNote("")
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    startTransition(async () => {
      const baseQtyNum = Number(baseQty)
      const input: AddItemInput = {
        tripId,
        name: trimmed,
        category,
        scope,
        baseQty:
          Number.isFinite(baseQtyNum) && baseQtyNum > 0 ? baseQtyNum : 1,
        unit: unit.trim() || undefined,
        note: note.trim() || undefined,
      }
      const result = await addItemAction(input)
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      reset()
      setOpen(false)
      toast.success("Item added")
      router.refresh()
    })
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="self-start"
      >
        Add custom item
      </Button>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      data-slot="add-item-form"
      className="flex flex-col gap-3 rounded-2xl border border-border p-3"
      aria-busy={pending || undefined}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="add-item-name">Name</Label>
        <Input
          id="add-item-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="add-item-category">Category</Label>
          <select
            id="add-item-category"
            name="category"
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
          <Label htmlFor="add-item-scope">Scope</Label>
          <select
            id="add-item-scope"
            name="scope"
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
          <Label htmlFor="add-item-qty">Quantity</Label>
          <Input
            id="add-item-qty"
            type="number"
            min={1}
            step={1}
            value={baseQty}
            onChange={(e) => setBaseQty(e.target.value)}
            className="w-20"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="add-item-unit">Unit</Label>
          <Input
            id="add-item-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-24"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="add-item-note">Note</Label>
        <Input
          id="add-item-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !name.trim()}>
          {pending ? "Adding…" : "Add item"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false)
            reset()
          }}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

export default AddItemForm
