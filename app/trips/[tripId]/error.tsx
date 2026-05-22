"use client" // Error boundaries must be Client Components.

// WS-8 — trip-detail error boundary.
//
// Wraps `app/trips/[tripId]/page.tsx` and its `not-found.tsx`. An uncaught
// throw in `TripContent` or a trip storage read renders this in-app surface.
//
// This boundary does NOT catch a `notFound()` call from the trip page — Next
// routes that to `app/trips/[tripId]/not-found.tsx`, so an unknown trip still
// shows the friendly "Trip not found" view rather than this error UI. It also
// does not catch errors thrown by `app/trips/layout.tsx`; those bubble to the
// root boundary.
//
// Receives `{ error, unstable_retry }` per the Next 16.2.6 `error.js`
// convention (node_modules/.../03-file-conventions/error.md).

import { useEffect } from "react"

import { ErrorState } from "@/components/app"
import { Button } from "@/components/ui/button"

export default function TripError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <ErrorState
        title="Couldn't load this trip"
        message="Something went wrong loading the trip. Try again — your trip and its packing list are safe."
        action={
          <Button variant="outline" onClick={() => unstable_retry()}>
            Try again
          </Button>
        }
      />
    </main>
  )
}
