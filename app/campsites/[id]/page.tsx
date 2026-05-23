// WS-5.6 + WS-8.2 — Campsite detail page.
//
// Cache strategy: the detail content is cached via the shared
// `cachedGetById(id)` helper (`lib/campsites/search.ts` — `'use cache'` +
// `cacheTag('campsites')` + `cacheLife('days')` per review I-A), the same
// way the browse page uses `cachedSearch`. The outer page resolves the
// `params` Promise *inline* via the JSX-thenable pattern
// (`params.then(({ id }) => <CampsiteDetail id={id} />)`) — this is the
// canonical Next 16 idiom for handing a plain value to a cached child
// (see `node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md`
// lines 36–46). An async wrapper that `await`s `params` outside the
// cached function trips the `INSTANT_VALIDATION_ERROR` guard because
// the validator can't enumerate the awaited value at build time.
//
// `cachedGetById` returns the campsite-or-null; `notFound()` is called by
// the caller OUTSIDE the cached helper (request-time control flow must
// not live inside `'use cache'`).
//
// WS-8.2 wires the real WS-6 `StylePicker` client component into the
// trip-style slot (seam I-1) and wires its `createTripAction` prop to the
// WS-7 `createTrip` Server Action (via the FormData adapter in
// `./actions.ts`).
//
// WS-8.5 adds the `unstable_instant` route export so Cache Components
// validates the static shell for this navigation.
//
// WHY `samples` IS REQUIRED (WS-8.4 fix):
// The instant-navigation validator (`prefetch: 'static'`) wraps `params`
// and `searchParams` in an *exhaustive proxy* keyed by the keys present
// in `unstable_instant.samples[].params` / `.searchParams`. Accessing any
// param/searchParam key NOT enumerated in a sample throws
// `INSTANT_VALIDATION_ERROR` at build time ("Generating static pages").
// With no `samples` declared, EVERY access of the dynamic `[id]` segment
// throws. The fix is to declare a representative sample supplying `id`.
// The `samples` field is an OPTIONAL part of the static-prefetch schema —
// see the zod `InstantConfigStaticSchema` / `RuntimeSampleSchema` in
// `node_modules/next/dist/build/segment-config/app/app-segment-config.js`
// (the draft `instant.md` TS type omits it and is out of sync; trust the
// schema). We use the real seed campsite id `seed:upper-pines-campground-ca`
// (present in `data/campsites.seed.json`) — `getCampsiteSource()` returns
// the seed-backed source so the cached `CampsiteDetail` child renders at
// build time with no DB.
//
// The sample also enumerates `searchParams` keys (`q`, `state`, `agency`,
// `amenities`) because `app/campsites/layout.tsx` wraps this route and
// renders the `SearchBar` client component, which reads those keys via
// `useSearchParams()`. The validator's exhaustive proxy spans the whole
// route tree, so layout-level reads must be covered here too.

import { Suspense } from "react"
import { notFound } from "next/navigation"
import { ListSkeleton, PageHeader, Section } from "@/components/app"
import { AmenityGrid } from "@/components/campsites/AmenityGrid"
import { StylePicker } from "@/components/trips/StylePicker"
import { cachedGetById } from "@/lib/campsites/search"
import { createTripFromForm } from "./actions"

// Instant-navigation validation (WS-5.6/5.9/T5.6 + WS-8.4/8.5). Next 16's
// instant validator wraps `params`/`searchParams` in an EXHAUSTIVE proxy
// keyed by `samples[].params` / `.searchParams`: reading any key not
// enumerated in a sample throws INSTANT_VALIDATION_ERROR at build time. So
// `samples` must list every key read:
//   - `params.id` — this dynamic segment. The id below is a REAL id from
//     the seed catalog used by the prisma-backed source (WS-8.1 flipped
//     the default backend to prisma).
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
      params: { id: "seed:upper-pines-campground-ca" },
      searchParams: { q: "", state: "", agency: "", amenities: "" },
    },
  ],
}

async function CampsiteDetail({ id }: { id: string }) {
  // `cachedGetById` is the shared `'use cache'` helper (cacheTag/cacheLife
  // applied inside it). `notFound()` is request-time control flow, so it
  // runs HERE — outside the cached helper — on a null result.
  const campsite = await cachedGetById(id)
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

export default function CampsiteDetailPage({
  params,
}: {
  // Next 16: `params` is a Promise. Resolve it inline via the JSX-thenable
  // pattern so the cached child receives a plain `id` string — see the
  // instant-navigation guide referenced in the file header.
  params: Promise<{ id: string }>
}) {
  return (
    <Suspense fallback={<ListSkeleton rows={4} label="Loading campsite…" />}>
      {params.then(({ id }) => (
        <CampsiteDetail id={id} />
      ))}
    </Suspense>
  )
}
