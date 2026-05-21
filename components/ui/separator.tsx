"use client"

import * as React from "react"
import { Separator as SeparatorPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

// WS-4: default `decorative` to false so a Separator given an `aria-label`
// keeps its semantic role (Radix flips to role="none" when decorative=true).
// Consumers that want a purely visual rule can opt back in via `decorative`.
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
