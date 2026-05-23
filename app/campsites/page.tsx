// WS-5.3 — Campsite browse page.
//
// Static shell (PageHeader + Suspense boundary) is rendered immediately;
// the search results stream in via `<Suspense fallback={<ListSkeleton/>}>`
// so the page satisfies Cache Components' "uncached data inside Suspense"
// contract.
//
// `unstable_instant = { prefetch: 'static' }` opts the route into
// instant-navigation validation (see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/instant.md).
//
// IMPORTANT: `searchParams` is request-time data. Reading it (even via
// `await`) at the page level makes the entire route dynamic and trips
// the Cache Components validator. To keep the page's static shell
// prerenderable, we pass the `searchParams` promise *unawaited* into the
// streamed `<CampsiteResults>` child, which lives inside the Suspense
// boundary. The await happens there.

import Link from "next/link"
import { Suspense } from "react"
import { EmptyState, ListSkeleton, PageHeader } from "@/components/app"
import { CampsiteCard } from "@/components/campsites/CampsiteCard"
import { getCampsiteSource } from "@/lib/services"
import type { Amenities } from "@/lib/db/types"
import {
  SEARCH_PAGE_SIZE_DEFAULT,
  SEARCH_PAGE_SIZE_MAX,
} from "@/lib/limits"
import { campsites as campsitesRoute } from "@/lib/routes"

// Instant-navigation validation. Next 16's instant validator wraps
// `searchParams` in an EXHAUSTIVE proxy keyed by `samples[].searchParams`:
// reading any key not enumerated in a sample throws INSTANT_VALIDATION_ERROR
// at build time. `samples` must therefore list EVERY searchParam key this
// route (and the shared `campsites/layout.tsx` SearchBar) reads — here:
// `q`, `state`, `agency`, `amenities`, `page`, `pageSize`. Values are
// representative string fixtures. `samples` is an optional field on the
// `prefetch: 'static'` variant (InstantConfigStaticSchema in
// node_modules/next/dist/build/segment-config/app/app-segment-config.js);
// the draft instant.md TS type omits it and is out of sync — trust the schema.
export const unstable_instant = {
  prefetch: "static",
  samples: [
    {
      // Representative request-time fixtures only — these are NOT the
      // route's defaults/bounds (those live in lib/limits.ts; DR-43/T0.15).
      // Next's segment-config parser requires plain literals here, so the
      // value cannot be `String(SEARCH_PAGE_SIZE_DEFAULT)`; any valid
      // page-size string suffices for the instant proxy to enumerate the key.
      searchParams: {
        q: "",
        state: "",
        agency: "",
        amenities: "",
        page: "1",
        pageSize: "10",
      },
    },
  ],
}

type SearchParams = {
  q?: string
  state?: string
  agency?: string
  amenities?: string | string[]
  page?: string
  pageSize?: string
}

function toInt(v: string | undefined, fallback: number): number {
  if (!v) return fallback
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : fallback
}

function clampPageSize(raw: string | undefined): number {
  // DR-23: bounds come from lib/limits.ts; never restated as numeric
  // literals here (T0.15).
  const n = toInt(raw, SEARCH_PAGE_SIZE_DEFAULT)
  if (n < 1) return 1
  if (n > SEARCH_PAGE_SIZE_MAX) return SEARCH_PAGE_SIZE_MAX
  return n
}

function clampPage(raw: string | undefined): number {
  const n = toInt(raw, 1)
  return n < 1 ? 1 : n
}

function asAmenityList(
  raw: string | string[] | undefined,
): (keyof Amenities)[] {
  if (!raw) return []
  const arr = Array.isArray(raw) ? raw : [raw]
  return arr as (keyof Amenities)[]
}

function buildPageUrl(
  base: { q?: string; state?: string; agency?: string; amenities: string[] },
  page: number,
  pageSize: number,
): string {
  const params = new URLSearchParams()
  if (base.q) params.set("q", base.q)
  if (base.state) params.set("state", base.state)
  if (base.agency) params.set("agency", base.agency)
  for (const a of base.amenities) params.append("amenities", a)
  if (page !== 1) params.set("page", String(page))
  if (pageSize !== SEARCH_PAGE_SIZE_DEFAULT)
    params.set("pageSize", String(pageSize))
  const qs = params.toString()
  return qs ? `${campsitesRoute()}?${qs}` : campsitesRoute()
}

// Streamed results — uncached, lives inside <Suspense>. Awaits the
// searchParams promise here (not in the page) so the page's static
// shell stays prerenderable. WS-3's `cachedSearch` wrapper is not
// present on this branch yet (PR #4); WS-8 rewires this to use it.
// For now we call the WS-0 fixture source directly.
async function CampsiteResults({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const q = sp.q?.trim() || undefined
  const stateFilter = sp.state?.trim() || undefined
  const agency = sp.agency?.trim() || undefined
  const amenities = asAmenityList(sp.amenities)
  const page = clampPage(sp.page)
  const pageSize = clampPageSize(sp.pageSize)

  const source = getCampsiteSource()
  const result = await source.search({
    q,
    state: stateFilter,
    agency,
    amenities: amenities.length > 0 ? amenities : undefined,
    page,
    pageSize,
  })

  if (result.campsites.length === 0) {
    return (
      <EmptyState
        title="No campsites match your filters"
        description="Try removing a filter or searching for a different name."
      />
    )
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize))
  const prevHref =
    result.page > 1
      ? buildPageUrl(
          {
            q,
            state: stateFilter,
            agency,
            amenities: amenities as string[],
          },
          result.page - 1,
          result.pageSize,
        )
      : null
  const nextHref =
    result.page < totalPages
      ? buildPageUrl(
          {
            q,
            state: stateFilter,
            agency,
            amenities: amenities as string[],
          },
          result.page + 1,
          result.pageSize,
        )
      : null

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {result.total === 1
          ? "1 campsite"
          : `${result.total} campsites`}
        {totalPages > 1
          ? ` · page ${result.page} of ${totalPages}`
          : ""}
      </p>
      <ul
        data-slot="campsite-list"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {result.campsites.map((campsite) => (
          <li key={campsite.id}>
            <CampsiteCard campsite={campsite} />
          </li>
        ))}
      </ul>
      {(prevHref || nextHref) && (
        <nav
          data-slot="pagination"
          aria-label="Pagination"
          className="flex items-center justify-between gap-3 pt-2"
        >
          {prevHref ? (
            <Link
              href={prevHref}
              className="rounded-full border border-input bg-background px-4 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
              rel="prev"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          {nextHref ? (
            <Link
              href={nextHref}
              className="rounded-full border border-input bg-background px-4 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
              rel="next"
            >
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  )
}

export default function CampsitesBrowsePage({
  searchParams,
}: {
  // Next 16: `searchParams` is a Promise. We pass it through, unawaited,
  // into the Suspense child so the page's static shell prerenders.
  searchParams: Promise<SearchParams>
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Campsites"
        description="Public-land sites curated for trip planning."
      />
      <Suspense
        fallback={<ListSkeleton rows={6} label="Loading campsites…" />}
      >
        <CampsiteResults searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
