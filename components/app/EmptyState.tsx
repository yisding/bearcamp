import * as React from "react"
import { cn } from "@/lib/utils"

export interface EmptyStateProps {
  /** Headline for the empty state (e.g. "No trips yet"). */
  title: string
  /** Optional supporting copy explaining how to add content. */
  description?: React.ReactNode
  /** Optional call-to-action — typically a `<Button>`. */
  action?: React.ReactNode
  /** Optional decorative icon rendered above the title. */
  icon?: React.ReactNode
  className?: string
}

/**
 * Friendly placeholder when a list/collection is empty. Not assertive — for
 * error surfaces use `ErrorState`.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border p-8 text-center",
        className,
      )}
    >
      {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      <p className="font-heading text-lg font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  )
}
