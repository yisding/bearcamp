// WS-5.6 — Campsite detail page.
//
// Cache strategy: the detail content is cached via a `'use cache'` child
// (`cacheTag('campsites')` + `cacheLife('days')` per review I-A). The
// outer page passes the `params` Promise *through* without awaiting it
// — awaiting `params` at the page level is request-time data which
// would trip Cache Components' "uncached outside Suspense" guard. A
// thin async wrapper inside the Suspense boundary awaits `params` and
// passes the bare `id` string into the cached child.
//
// `'use cache'` cannot access request-time APIs and its arguments must
// be serialisable, so passing the string id (not the Promise) is
// required.

import { Suspense } from "react"
import { notFound } from "next/navigation"
import { cacheLife, cacheTag } from "next/cache"
import { ListSkeleton, PageHeader, Section } from "@/components/app"
import { AmenityGrid } from "@/components/campsites/AmenityGrid"
import { StylePickerPlaceholder } from "@/components/campsites/StylePickerPlaceholder"
import { getCampsiteSource } from "@/lib/services"

async function CampsiteDetail({ id }: { id: string }) {
  "use cache"
  cacheTag("campsites")
  cacheLife("days")

  const source = getCampsiteSource()
  const campsite = await source.getById(id)
  if (!campsite) {
    notFound()
  }

  const meta = [campsite.agency, campsite.state]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={campsite.name} description={meta || undefined} />

      {campsite.description ? (
        <p className="text-base text-foreground/90">{campsite.description}</p>
      ) : null}

      <Section title="Amenities">
        <AmenityGrid amenities={campsite.amenities} />
      </Section>

      {campsite.activities.length > 0 ? (
        <Section title="Activities">
          <ul
            data-slot="activities"
            className="flex flex-wrap gap-1.5"
          >
            {campsite.activities.map((a) => (
              <li
                key={a}
                className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground"
              >
                {a}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Plan a trip">
        <StylePickerPlaceholder
          campsite={{ id: campsite.id, name: campsite.name }}
        />
      </Section>
    </div>
  )
}

async function ResolveParamsThenDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <CampsiteDetail id={id} />
}

export default function CampsiteDetailPage({
  params,
}: {
  // Next 16: `params` is a Promise. We pass it through, unawaited, into
  // a Suspense child that resolves it and renders the cached detail.
  params: Promise<{ id: string }>
}) {
  return (
    <Suspense fallback={<ListSkeleton rows={4} label="Loading campsite…" />}>
      <ResolveParamsThenDetail params={params} />
    </Suspense>
  )
}
