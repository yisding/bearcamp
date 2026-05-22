"use client"

// WS-6.8b — NoLongerNeeded.
//
// Lists items that the owner has soft-removed but which still have live
// claims, so participants see why their previous claim disappeared (DR-19).
// Owner sees a per-row Restore button (calls `restoreItem`). When the list
// is empty the component renders nothing (no noisy header on healthy trips).
//
// "use client" because the restore button is interactive — but the component
// is render-flat: it does no polling or local state beyond a transition.

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Section } from "@/components/app"
import { Button } from "@/components/ui/button"

import type { RestoreItemResult } from "@/lib/trips/action-types"
import type { RemovedItemWithClaims } from "@/lib/db/types"

export interface NoLongerNeededProps {
  items: RemovedItemWithClaims[]
  isOwner: boolean
  restoreItemAction: (input: {
    tripId: string
    itemId: string
  }) => Promise<RestoreItemResult>
}

export function NoLongerNeeded({
  items,
  isOwner,
  restoreItemAction,
}: NoLongerNeededProps) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  if (items.length === 0) return null

  function onRestore(itemId: string, tripId: string) {
    startTransition(async () => {
      const result = await restoreItemAction({ tripId, itemId })
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      toast.success("Item restored")
      router.refresh()
    })
  }

  return (
    <Section title="No longer needed">
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.id}
            data-slot="no-longer-needed-row"
            className="flex flex-col gap-2 rounded-2xl border border-border p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{item.name}</span>
                <span className="text-xs text-muted-foreground">
                  {item.category}
                </span>
              </div>
              {isOwner ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onRestore(item.id, item.tripId)}
                  disabled={pending}
                >
                  Restore
                </Button>
              ) : null}
            </div>
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
          </li>
        ))}
      </ul>
    </Section>
  )
}

export default NoLongerNeeded
