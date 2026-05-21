// WS-6.11 — Trip not-found.
//
// Unified copy for both unknown-trip and deleted-trip cases (DR-47). v1 does
// not distinguish the two (no tombstone row); README D7 documents this gap.

import Link from "next/link"

import { PageHeader } from "@/components/app"
import { Button } from "@/components/ui/button"

export default function TripNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <PageHeader
        title="Trip not found"
        description={
          <>This trip doesn&apos;t exist, or the owner deleted it.</>
        }
      />
      <p className="text-sm text-muted-foreground">
        If you had a link to this trip, it&apos;s no longer valid. Trips are
        accessed by their link only — once deleted, they can&apos;t be
        recovered.
      </p>
      <Button asChild className="self-start">
        <Link href="/">Back to home</Link>
      </Button>
    </main>
  )
}
