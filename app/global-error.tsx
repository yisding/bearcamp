"use client" // Error boundaries must be Client Components.

// WS-8 — global error boundary.
//
// `app/error.tsx` wraps every route segment but NOT the root `app/layout.tsx`
// itself. A failure in the root layout (e.g. font loading, the `Header`, the
// `Toaster`) would otherwise fall through to Next's default unstyled error
// page. `global-error.tsx` is the documented convention for that case
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
// error.md — "Global Error"): when active it REPLACES the root layout, so it
// must render its own `<html>` and `<body>` tags and cannot rely on the app
// shell or `globals.css`.
//
// Receives `{ error, unstable_retry }` like `error.js`. Kept dependency-free
// (no `@/components/app`, no Tailwind) since the layout that provides styling
// is exactly what failed.

import { useEffect } from "react"

export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
        }}
      >
        <div role="alert" style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
            Something went wrong
          </h1>
          <p style={{ color: "#52525b" }}>
            Bearcamp hit an unexpected problem. Try again, and if it keeps
            happening, come back in a little while.
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              marginTop: "0.5rem",
              padding: "0.5rem 1rem",
              borderRadius: "9999px",
              border: "1px solid #d4d4d8",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
