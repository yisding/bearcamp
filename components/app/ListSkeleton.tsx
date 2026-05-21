import * as React from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface ListSkeletonProps {
  /** Number of placeholder rows. Defaults to 5. */
  rows?: number
  /** Accessible label announced while content loads. */
  label?: string
  className?: string
}

/**
 * Vertical stack of `<Skeleton>` rows used as a Suspense fallback for lists.
 * Marked `role="status" aria-busy="true"` so assistive tech announces the
 * loading state.
 */
export function ListSkeleton({
  rows = 5,
  label = "Loading…",
  className,
}: ListSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
      data-slot="list-skeleton"
      className={cn("flex flex-col gap-2", className)}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton
          key={i}
          data-slot="list-skeleton-row"
          data-row={i}
          className="h-10 w-full"
        />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  )
}
