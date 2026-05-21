// WS-5.7 — campsite-detail 404 view.
//
// Rendered when `app/campsites/[id]/page.tsx` calls `notFound()` for an
// unknown id. Returns a friendly message and a path back to the browse
// page. The framework returns HTTP 404 for non-streamed responses.

import Link from "next/link"
import { campsites } from "@/lib/routes"

export default function CampsiteNotFound() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border bg-card p-8 text-card-foreground">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Campsite not found
      </h1>
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t find a campsite with that id. It may have been
        renamed or removed from the catalog.
      </p>
      <Link
        href={campsites()}
        className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Browse all campsites
      </Link>
    </div>
  )
}
