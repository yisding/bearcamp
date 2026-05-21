// WS-5.1 — Landing page.
//
// A short pitch + a prominent CTA into `/campsites`. The page is a fully
// static shell so `unstable_instant = { prefetch: 'static' }` causes
// Cache Components to validate the instant-navigation contract during dev
// and at build time.

import Link from "next/link"
import { PageHeader } from "@/components/app"
import { campsites } from "@/lib/routes"

// Validates the static-shell contract on every entry into this route.
// See node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/instant.md.
export const unstable_instant = { prefetch: "static" }

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12">
      <PageHeader
        title="Plan camping trips, together."
        description="Find a campsite, generate a tailored packing list, and share the load with your group."
        actions={
          <Link
            href={campsites()}
            className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Find a campsite
          </Link>
        }
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4 text-card-foreground">
          <h2 className="font-heading text-base font-semibold">Browse</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Search 150+ public-land campsites by state, agency, and amenity.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 text-card-foreground">
          <h2 className="font-heading text-base font-semibold">Pack smart</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We tailor a packing list to the campsite&apos;s amenities and your
            trip style.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 text-card-foreground">
          <h2 className="font-heading text-base font-semibold">Share</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Invite friends with a link. Claim items so nobody packs the same
            stove twice.
          </p>
        </div>
      </section>

      <div className="flex flex-col items-start gap-3">
        <Link
          href={campsites()}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Start by browsing campsites →
        </Link>
      </div>
    </main>
  )
}
