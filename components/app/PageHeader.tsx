import * as React from "react"
import { cn } from "@/lib/utils"

export interface PageHeaderProps {
  /** Required visible page title — rendered as an `<h1>`. */
  title: string
  /** Optional sub-line under the title. */
  description?: React.ReactNode
  /** Optional actions slot rendered to the right of the title (e.g. CTA buttons). */
  actions?: React.ReactNode
  /** Extra className for the wrapping element. */
  className?: string
}

/**
 * Top-of-page heading block. Pairs a level-1 heading with an optional
 * description and an optional actions slot. WS-5/WS-6 consume this via the
 * frozen barrel `@/components/app`.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
      data-slot="page-header"
    >
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}
