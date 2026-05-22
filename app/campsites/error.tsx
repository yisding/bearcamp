"use client" // Error boundaries must be Client Components.

// WS-8 — campsites segment error boundary.
//
// Wraps `/campsites` and `/campsites/[id]` (and their `loading`/`not-found`
// files). An uncaught throw in `CampsiteResults`, the detail page, or a
// storage read renders this in-app surface instead of blowing away the whole
// app shell. `notFound()` still routes to the relevant `not-found.tsx`.
//
// Receives `{ error, unstable_retry }` per the Next 16.2.6 `error.js`
// convention (node_modules/.../03-file-conventions/error.md).

import { useEffect } from "react"

import { ErrorState } from "@/components/app"
import { Button } from "@/components/ui/button"

export default function CampsitesError({
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
        title="Couldn't load campsites"
        message="Something went wrong fetching campsite data. Try again — the catalog is usually back in a moment."
        action={
          <Button variant="outline" onClick={() => unstable_retry()}>
            Try again
          </Button>
        }
      />
    </main>
  )
}
