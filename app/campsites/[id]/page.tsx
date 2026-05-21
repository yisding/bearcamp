// WS-5.6 + WS-8.2 — Campsite detail page.
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
//
// WS-8.2 swaps the WS-5 `StylePickerPlaceholder` for the real WS-6
// `StylePicker` client component (seam I-1) and wires its
// `createTripAction` prop to the WS-7 `createTrip` Server Action (via
// the FormData adapter in `./actions.ts`).
//
// WS-8.5 adds the `unstable_instant` route export so Cache Components
// validates the static shell for this navigation.

import { Suspense } from "react"
import { notFound } from "next/navigation"
import { cacheLife, cacheTag } from "next/cache"
import { ListSkeleton, PageHeader, Section } from "@/components/app"
import { AmenityGrid } from "@/components/campsites/AmenityGrid"
import { StylePicker } from "@/components/trips/StylePicker"
import { getCampsiteSource } from "@/lib/services"
import { createTripFromForm } from "./actions"

// WS-8.4 / WS-8.5 — opt this route into instant-navigation validation.
// The static shell (PageHeader + Suspense fallback) is prerendered;
// the cached `<CampsiteDetail>` child renders behind the Suspense
// boundary.
export const unstable_instant = { prefetch: "static" }

// Instant-navigation validation (WS-5.6/5.9/T5.6). Next 16's instant
// validator wraps `params`/`searchParams` in an EXHAUSTIVE proxy keyed by
// `samples[].params` / `.searchParams`: reading any key not enumerated in a
// sample throws INSTANT_VALIDATION_ERROR at build time. So `samples` must
// list every key read:
//   - `params.id` — this dynamic segment. The fixture id below is a REAL id
//     from the WS-0 fixture source `getCampsiteSource()` returns on this
//     branch (`fixtures` in lib/campsites/fixtures.ts, built via
//     `campsiteId('fixture', 'big-sur-state')` → `"fixture:big-sur-state"`).
//   - `searchParams` keys — the shared `campsites/layout.tsx` renders
//     `SearchBar`, which reads `q`/`state`/`agency`/`amenities` from
//     `useSearchParams()`; they must be enumerated for the layout proxy too.
// `samples` is an optional field on the `prefetch: 'static'` variant
// (InstantConfigStaticSchema in
// node_modules/next/dist/build/segment-config/app/app-segment-config.js);
// the draft instant.md TS type omits it and is out of sync — trust the schema.
export const unstable_instant = {
  prefetch: "static",
  samples: [
    {
      params: { id: "fixture:big-sur-state" },
      searchParams: {
        q: "",
        state: "",
        agency: "",
        amenities: "",
      },
    },
  ],
}

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
        <StylePicker
          campsiteId={campsite.id}
          createTripAction={createTripFromForm}
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
