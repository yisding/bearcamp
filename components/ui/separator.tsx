"use client"

import * as React from "react"
import { Separator as SeparatorPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

// WS-4: default `decorative` to false so a Separator given an `aria-label`
// keeps its semantic role (Radix flips to role="none" when decorative=true).
//
// Trade-off: the upstream shadcn default is `decorative={true}` (purely
// visual). We invert it because T4.1 asserts `role="separator"` reachable by
// accessible name — a stricter a11y posture that costs downstream consumers
// nothing as long as they pass `decorative={true}` explicitly for rules that
// are *only* visual chrome (e.g. card-internal dividers). The semantic
// default is the safer choice for screen-reader users.
function Separator({
  className,
  orientation = "horizontal",
  decorative = false,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
