// WS-6.2 — Trip page.
//
// Async params (Next 16). Loads `TripView` via the services storage; if
// `buildTripView` returns `null`, calls `notFound()` (G8 / DR-47).
// Resolves identity from the `bc_owner` / `bc_participant` cookies (WS-0
// stub at I-2; WS-8.2 swaps to WS-7's real `lib/trips/identity`).
//
// Exports `generateMetadata` with `robots: { index:false, follow:false }`
// (DR-17) so trip URLs aren't crawled.

import type { Metadata, ResolvingMetadata } from "next"
import { Suspense } from "react"
import { notFound } from "next/navigation"
import { cookies } from "next/headers"

import { PageHeader, Section } from "@/components/app"
import { getStorage } from "@/lib/services"
import { OWNER_COOKIE, PARTICIPANT_COOKIE } from "@/lib/trips/identity.stub"

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
  restoreItem,
  unclaimItem,
  updateItem,
  updateTripSettings,
} from "./actions"

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

export default async function TripPage({ params }: PageProps) {
  const { tripId } = await params
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

  const itemActions = {
    claimItem,
    unclaimItem,
    updateItem,
    removeItem,
    restoreItem,
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 p-6">
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

      <Suspense fallback={null}>
        <PackingList
          view={view}
          isOwner={isOwner}
          currentParticipant={currentParticipant}
          itemActions={itemActions}
          addItemAction={addItem}
        />
      </Suspense>

      <Suspense fallback={null}>
        <StillNeeded view={view} />
      </Suspense>

      <Suspense fallback={null}>
        <WhoIsBringing view={view} />
      </Suspense>

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
    </main>
  )
}
