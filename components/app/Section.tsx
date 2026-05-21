import * as React from "react"
import { cn } from "@/lib/utils"

export interface SectionProps {
  /** Required visible section title — rendered as an `<h2>` and used as the
   * section's accessible name (so it becomes a `region` landmark). */
  title: string
  /** Heading level — defaults to 2 since `PageHeader` owns h1. */
  level?: 2 | 3 | 4
  /** Optional actions slot rendered next to the heading. */
  actions?: React.ReactNode
  /** Section body. */
  children: React.ReactNode
  className?: string
}

/**
 * Group of related content inside a page. Renders a `<section>` with a
 * heading so that screen readers expose it as a `region` landmark.
 */
export function Section({
  title,
  level = 2,
  actions,
  children,
  className,
}: SectionProps) {
  // Generate a stable, deterministic id so the heading can label the region
  // both for `aria-labelledby` and the heading itself.
  const headingId = React.useId()
  const Heading = (`h${level}` as unknown) as keyof React.JSX.IntrinsicElements

  return (
    <section
      aria-labelledby={headingId}
      data-slot="section"
      className={cn("flex flex-col gap-3", className)}
    >
      <div className="flex items-center justify-between gap-3">
        <Heading
          id={headingId}
          className="font-heading text-lg font-semibold tracking-tight text-foreground"
        >
          {title}
        </Heading>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
      <div>{children}</div>
    </section>
  )
}
