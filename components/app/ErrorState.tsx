import * as React from "react"
import { cn } from "@/lib/utils"

export interface ErrorStateProps {
  /** Short summary (e.g. "Couldn't load campsites"). */
  title: string
  /** Detail message — root cause or recovery hint. */
  message: React.ReactNode
  /** Optional retry / dismiss action. */
  action?: React.ReactNode
  className?: string
}

/**
 * Assertive error surface — renders inside `role="alert"` so screen readers
 * announce the failure. Use for recoverable inline errors (failed fetch,
 * mutation rejected). For full-page crashes, render `app/error.tsx` instead.
 */
export function ErrorState({
  title,
  message,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      data-slot="error-state"
      className={cn(
        "flex flex-col gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-destructive",
        className,
      )}
    >
      <p className="font-heading text-sm font-semibold">{title}</p>
      <p className="text-sm text-destructive/90">{message}</p>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}
