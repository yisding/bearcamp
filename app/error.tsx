"use client" // Error boundaries must be Client Components.

// WS-8 — root error boundary.
//
// Catches uncaught exceptions thrown while rendering any route segment below
// `app/` (pages, nested layouts, `loading.tsx`, `not-found.tsx`). It does NOT
// catch errors thrown by the root `app/layout.tsx` itself — see
// `app/global-error.tsx` for that case.
//
// Next 16.2.6 forwards `{ error, unstable_retry }` to this Client Component
// (see node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
// error.md — the `unstable_retry` prop was added in v16.2.0 and is the
// recommended recovery affordance: it re-fetches and re-renders the boundary's
// children, unlike `reset()` which only re-renders).
//
// Control-flow note: `notFound()` / `redirect()` are NOT caught here — Next
// routes them to `not-found.tsx` and the redirect target respectively, so this
// boundary never masks the not-found flow.

import { useEffect } from "react"

import { ErrorState } from "@/components/app"
import { Button } from "@/components/ui/button"

export default function RootError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    // Surface the error in logs; `digest` matches the server-side entry.
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <ErrorState
        title="Something went wrong"
        message="We hit an unexpected problem loading this page. It's not you — try again, and if it keeps happening, come back in a little while."
        action={
          <Button variant="outline" onClick={() => unstable_retry()}>
            Try again
          </Button>
        }
      />
    </main>
  )
}
