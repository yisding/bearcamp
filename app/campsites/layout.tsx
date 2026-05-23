// WS-5.2 — search shell.
//
// Persistent layout shared by `/campsites` and `/campsites/[id]`. Renders
// the SearchBar so the search region is preserved when navigating
// between the list and a detail page (T5.6 instant() shell contract).
//
// SearchBar is a Client Component that reads `useSearchParams()`, which
// the Cache Components validator treats as dynamic request data. It
// must therefore live behind a `<Suspense>` boundary — the static shell
// renders the surrounding chrome plus the `<SearchBarSkeleton/>`
// fallback, then the bar hydrates with the current params after the
// router resolves them.

import { Suspense } from "react"
import { SearchBar } from "@/components/campsites/SearchBar"

function SearchBarSkeleton() {
  return (
    <div
      data-slot="search-bar-skeleton"
      aria-hidden="true"
      className="h-9 w-full rounded-4xl border border-input bg-input/30"
    />
  )
}

export default function CampsitesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6">
      <Suspense fallback={<SearchBarSkeleton />}>
        <SearchBar />
      </Suspense>
      <div>{children}</div>
    </div>
  )
}
