"use client"

// WS-6.7 — ShareLink.
//
// Click copies `location.href` via `navigator.clipboard.writeText` and shows
// a confirmation toast. Accessible help text reminds the user (especially the
// owner) to save this link because the trip is not recoverable without it
// (DR-26 / DR-48).

import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface ShareLinkProps {
  className?: string
}

export function ShareLink({ className }: ShareLinkProps) {
  const onCopy = React.useCallback(async () => {
    try {
      const url =
        typeof window !== "undefined" ? window.location.href : ""
      await navigator.clipboard.writeText(url)
      toast.success("Link copied")
    } catch {
      toast.error("Couldn't copy link")
    }
  }, [])

  return (
    <div
      data-slot="share-link"
      className={cn("flex flex-col gap-2", className)}
    >
      <Button type="button" variant="outline" onClick={onCopy}>
        Copy link
      </Button>
      <p className="text-xs text-muted-foreground">
        Save this link — it&apos;s the only way back into this trip. If
        you&apos;re the owner and lose it, you can&apos;t recover access in v1.
      </p>
    </div>
  )
}

export default ShareLink
