"use client"

// WS-6.10 — RefreshPoller.
//
// Calls `useRouter().refresh()` from `next/navigation` (NOT `next/cache`'s
// Server-Actions-only `refresh` — DR-9) every 15s (DR-29). Pauses when
// `document.hidden`. A manual "Refresh now" button triggers an immediate
// refresh.
//
// With Cache Components / Activity the refresh preserves DOM and React state
// of sibling components, so any open Join dialog or claim-qty input is not
// clobbered (G3). The poller itself owns no state that resets siblings; it
// just kicks the router.

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"

const POLL_INTERVAL_MS = 15_000

export interface RefreshPollerProps {
  /** Override poll interval (ms). Tests rely on the 15s default. */
  intervalMs?: number
  className?: string
}

export function RefreshPoller({
  intervalMs = POLL_INTERVAL_MS,
  className,
}: RefreshPollerProps) {
  const router = useRouter()
  // Track tab visibility so we can pause polling when the tab is hidden.
  const [hidden, setHidden] = React.useState<boolean>(
    typeof document !== "undefined" ? document.hidden : false,
  )

  React.useEffect(() => {
    function onVis() {
      setHidden(document.hidden)
    }
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [])

  React.useEffect(() => {
    if (hidden) return
    const id = window.setInterval(() => {
      router.refresh()
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [router, hidden, intervalMs])

  return (
    <div
      data-slot="refresh-poller"
      className={className}
    >
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => router.refresh()}
      >
        Refresh now
      </Button>
    </div>
  )
}

export default RefreshPoller
