// WS-6.1 — Trips layout.
//
// Per-user/dynamic content (auth-scoped: identity cookies decide what's
// visible), so we opt this subtree out of `unstable_instant` validation.
// This keeps the rest of the app (homepage / campsites) eligible for instant
// navigation while letting the trip routes render dynamically.

import * as React from "react"

export const unstable_instant = false

export default function TripsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
