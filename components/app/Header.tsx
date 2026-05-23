import Link from "next/link"
import { campsites, home } from "@/lib/routes"

/**
 * App shell brand bar. Renders as a `<header>` (banner landmark), shows the
 * Bearcamp wordmark linked to `/`, and a primary link to `/campsites`. The
 * static shell must stay synchronous and JS-optional — this is a pure server
 * component with no client state.
 */
export function Header() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link
          href={home()}
          className="font-heading text-lg font-semibold tracking-tight text-foreground"
        >
          Bearcamp
        </Link>
        <nav aria-label="Primary">
          <Link
            href={campsites()}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Campsites
          </Link>
        </nav>
      </div>
    </header>
  )
}
