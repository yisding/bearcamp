// WS-5.5 — server component. Renders a single campsite as a card whose
// primary action is a link to the detail page. Pure synchronous render —
// no async work, no data fetching, no cookies/headers.

import Link from "next/link"
import type { Campsite } from "@/lib/db/types"
import { campsite as campsiteRoute } from "@/lib/routes"
import { cn } from "@/lib/utils"

export interface CampsiteCardProps {
  campsite: Campsite
  className?: string
}

// Pick a small set of "top" amenity chips to surface on the card. Mirrors
// the WS-3 search facets we expose in the SearchBar so users get a visual
// confirmation that the card matches their filter set.
function topAmenityChips(campsite: Campsite): string[] {
  const chips: string[] = []
  const a = campsite.amenities
  if (a.potableWater) chips.push("Water")
  if (a.showers) chips.push("Showers")
  if (a.electricity) chips.push("Electric")
  if (a.bearLockers) chips.push("Bear lockers")
  if (a.fireRings) chips.push("Fire rings")
  return chips.slice(0, 4)
}

// Render the agency and state as a single text node so each test regex
// (e.g. /CA State Parks/i for agency, /CA/i for state) resolves to the
// same element. Splitting them across sibling spans would produce two
// distinct text nodes and trip RTL's "found multiple elements" guard for
// a fixture where agency contains the state's 2-letter code (e.g. "CA
// State Parks" + state "CA").
function metaLine(agency?: string, state?: string): string | null {
  const parts = [agency, state].filter(Boolean) as string[]
  if (parts.length === 0) return null
  return parts.join(" · ")
}

export function CampsiteCard({ campsite, className }: CampsiteCardProps) {
  const href = campsiteRoute(campsite.id)
  const chips = topAmenityChips(campsite)
  const meta = metaLine(campsite.agency, campsite.state)

  return (
    <article
      data-slot="campsite-card"
      className={cn(
        "group rounded-2xl border border-border bg-card p-4 text-card-foreground transition-shadow hover:shadow-md focus-within:shadow-md",
        className,
      )}
    >
      <h3 className="font-heading text-lg font-semibold leading-tight">
        <Link
          href={href}
          className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60 group-hover:underline"
        >
          {campsite.name}
        </Link>
      </h3>

      {meta ? (
        <p className="mt-1 text-sm text-muted-foreground">{meta}</p>
      ) : null}

      {campsite.description ? (
        <p className="mt-2 line-clamp-2 text-sm text-foreground/80">
          {campsite.description}
        </p>
      ) : null}

      {chips.length > 0 ? (
        <ul
          data-slot="campsite-card-chips"
          className="mt-3 flex flex-wrap gap-1.5"
          aria-label="Amenities"
        >
          {chips.map((chip) => (
            <li
              key={chip}
              className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
            >
              {chip}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}

export default CampsiteCard
