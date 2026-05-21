// WS-5 — internal shim for the WS-6 `StylePicker` component (seam I-1).
//
// Purpose: the campsite detail page needs *something* in the StylePicker
// slot before WS-6 is integrated. This placeholder renders a clearly-
// marked region with the `[data-slot="style-picker-placeholder"]`
// selector that WS-8.2 looks for when rewiring the real component in.
//
// Do not depend on this component from outside WS-5. It is intentionally
// minimal so removing it leaves no trace beyond the WS-5 page imports.

import * as React from "react"
import type { Campsite } from "@/lib/db/types"

export interface StylePickerPlaceholderProps {
  campsite: Pick<Campsite, "id" | "name">
}

export function StylePickerPlaceholder({
  campsite,
}: StylePickerPlaceholderProps) {
  return (
    <div
      data-slot="style-picker-placeholder"
      data-testid="style-picker-placeholder"
      data-campsite-id={campsite.id}
      role="region"
      aria-label="Trip style picker (coming soon)"
      className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground"
    >
      <p className="font-heading text-base font-medium text-foreground">
        Plan a trip here
      </p>
      <p className="mt-1">
        Pick a trip style for {campsite.name} to generate a tailored packing
        list. The full style picker arrives with the trip experience release.
      </p>
    </div>
  )
}

export default StylePickerPlaceholder
