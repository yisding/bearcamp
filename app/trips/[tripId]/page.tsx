// WS-6.2 + WS-8.2 — Trip page.
//
// Async params (Next 16). Loads `TripView` via the services storage; if
// `buildTripView` returns `null`, calls `notFound()` (G8 / DR-47).
// Resolves identity by reading the `bc_owner` / `bc_participant` cookies
// inline. It imports only the cookie-NAME constants (`OWNER_COOKIE` /
// `PARTICIPANT_COOKIE`) from the production identity module
// (`lib/trips/identity`); it deliberately does NOT use that module's
// `assert*` helpers, because those throw on a missing cookie and this
// page must tolerate a not-yet-joined visitor (and render the Join
// dialog instead). WS-6 originally imported the constants from
// `lib/trips/identity.stub`; WS-8.2 (seam I-2) flips this to the
// production module so the cookie names match the real Server Actions.
//
// Server Actions are imported directly from `lib/trips/actions` (seam
// I-4) — the local `./actions.ts` shim was retired at WS-8.2 so there
// is exactly one definition of every Server Action in the codebase.
//
// Exports `generateMetadata` with `robots: { index:false, follow:false }`
// (DR-17) so trip URLs aren't crawled. The body must remain STATIC:
// no `cookies()`, no `headers()`, no DB calls (DR-52 / T8.4(h)).

import type { Metadata, ResolvingMetadata } from "next"
import { Suspense } from "react"
import { notFound } from "next/navigation"
import { cookies } from "next/headers"

import { PageHeader, Section } from "@/components/app"
import { getStorage } from "@/lib/services"
import { OWNER_COOKIE, PARTICIPANT_COOKIE } from "@/lib/trips/identity"

import { JoinTripDialog } from "@/components/trips/JoinTripDialog"
import { NoLongerNeeded } from "@/components/trips/NoLongerNeeded"
import { PackingList } from "@/components/trips/PackingList"
import { RefreshPoller } from "@/components/trips/RefreshPoller"
import { ShareLink } from "@/components/trips/ShareLink"
import { StillNeeded } from "@/components/trips/StillNeeded"
import { TripSettings } from "@/components/trips/TripSettings"
import { WhoIsBringing } from "@/components/trips/WhoIsBringing"

import {
  addItem,
  claimItem,
  deleteTrip,
  joinTrip,
  removeItem,
  renameTrip,
  reorderItem,
  restoreItem,
  unclaimItem,
  updateItem,
  updateTripSettings,
} from "@/lib/trips/actions"

interface PageProps {
  params: Promise<{ tripId: string }>
}

export async function generateMetadata(
  props: PageProps,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  // DR-17: trip URLs are private (link-as-access-key). Disable crawling.
  // The (props, parent) shape is the Next 16 contract — we don't use either,
  // but the page test asserts the signature accepts two arguments.
  void props
  void parent
  return {
    robots: { index: false, follow: false },
  }
}

const itemActions = {
  claimItem,
  unclaimItem,
  updateItem,
  removeItem,
  restoreItem,
  reorderItem,
}

/**
 * Async content component. Lives INSIDE the page's `<Suspense>` boundary so the
 * uncached `buildTripView` fetch (WS-6.2 — "render inside `<Suspense>`") streams
 * behind the loading fallback rather than blocking the whole page.
 *
 * `notFound()` is called here, on a null view, and is deliberately kept OUTSIDE
 * any try/catch (DR-45) — `notFound()` throws the NEXT_NOT_FOUND sentinel and
 * must propagate. Identity resolution (cookies) also happens here.
 */
async function TripContent({ tripId }: { tripId: string }) {
  const storage = getStorage()
  const view = await storage.view.buildTripView(tripId)
  if (!view) {
    notFound()
  }

  // Resolve identity from cookies — do NOT use the identity.stub asserters
  // (they throw on absence). The page tolerates a missing cookie (visitor
  // hasn't joined yet) and renders the Join dialog.
  const jar = await cookies()
  const ownerTokenStr = jar.get(OWNER_COOKIE)?.value ?? ""
  const participantTokenStr = jar.get(PARTICIPANT_COOKIE)?.value ?? ""

  const ownerTrip = ownerTokenStr
    ? await storage.trips.byOwnerToken(tripId, ownerTokenStr)
    : null
  const isOwner = ownerTrip !== null

  const currentParticipant = participantTokenStr
    ? await storage.participants.byToken(tripId, participantTokenStr)
    : null
  const isParticipant = currentParticipant !== null

  return (
    <>
      <PageHeader
        title={view.trip.name}
        description={
          <>
            {view.trip.campsite.name}
            {view.trip.campsite.state ? `, ${view.trip.campsite.state}` : ""}
            {" · "}
            {view.trip.style === "car" ? "Car camping" : "Backpacking"}
            {" · sleeps "}
            {view.trip.tentCapacity} per tent
          </>
        }
        actions={<RefreshPoller />}
      />

      <ShareLink />

      <JoinTripDialog
        tripId={view.trip.id}
        isParticipant={isParticipant}
        joinTripAction={joinTrip}
      />

      <PackingList
        view={view}
        isOwner={isOwner}
        currentParticipant={currentParticipant}
        itemActions={itemActions}
        addItemAction={addItem}
      />

      <StillNeeded view={view} />

      <WhoIsBringing view={view} />

      <NoLongerNeeded
        items={view.removedItemsWithClaims}
        isOwner={isOwner}
        restoreItemAction={restoreItem}
      />

      {isOwner ? (
        <Section title="Manage trip">
          <TripSettings
            trip={view.trip}
            isOwner={isOwner}
            renameTrip={renameTrip}
            updateTripSettings={updateTripSettings}
            deleteTrip={deleteTrip}
          />
        </Section>
      ) : null}
    </>
  )
}

function decodeRouteParam(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export default async function TripPage({ params }: PageProps) {
  const { tripId: rawTripId } = await params
  const tripId = decodeRouteParam(rawTripId)

  // The trip view is uncached/per-user — fetch it INSIDE the Suspense
  // boundary (WS-6.2) via <TripContent>, so the `await buildTripView` streams
  // behind the fallback instead of blocking the whole route.
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 p-6">
      <Suspense fallback={<TripLoading />}>
        <TripContent tripId={tripId} />
      </Suspense>
    </main>
  )
}

function TripLoading() {
  return (
    <p className="text-sm text-muted-foreground" aria-busy="true">
      Loading trip…
    </p>
  )
}
