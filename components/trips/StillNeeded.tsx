// WS-6.8 — StillNeeded.
//
// Server component listing visible items with `shortfall > 0` as
// "claimed of needed". Removed items are NOT shown here — they belong to
// `NoLongerNeeded` (DR-19).

import * as React from "react"

import { EmptyState, Section } from "@/components/app"

import type { TripView } from "@/lib/db/types"

export interface StillNeededProps {
  view: TripView
}

export function StillNeeded({ view }: StillNeededProps) {
  const items = view.items.filter((i) => i.shortfall > 0)

  return (
    <Section title="Still needed">
      {items.length === 0 ? (
        <EmptyState
          title="All covered"
          description="Nothing still needed — every item has someone bringing it."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              data-slot="still-needed-row"
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border p-3"
            >
              <span className="font-medium">{item.name}</span>
              <span className="text-sm">
                {item.claimed} of {item.needed}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

export default StillNeeded
