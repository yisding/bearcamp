// WS-6.9 — WhoIsBringing.
//
// Server component listing claims grouped by participant. Claims on removed
// items still appear here, tagged "no longer needed" (DR-19).

import * as React from "react"

import { EmptyState, Section } from "@/components/app"

import type { Participant, TripView } from "@/lib/db/types"

interface ClaimRow {
  itemId: string
  itemName: string
  qty: number
  removed: boolean
}

export interface WhoIsBringingProps {
  view: TripView
}

export function WhoIsBringing({ view }: WhoIsBringingProps) {
  // Walk both visible and removed-with-claims items, grouping by participant.
  const groups = new Map<
    string,
    { participant: Participant; claims: ClaimRow[] }
  >()

  function pushClaim(
    participant: Participant,
    row: ClaimRow,
  ): void {
    const existing = groups.get(participant.id)
    if (existing) {
      existing.claims.push(row)
    } else {
      groups.set(participant.id, { participant, claims: [row] })
    }
  }

  for (const it of view.items) {
    for (const c of it.claims) {
      pushClaim(c.participant, {
        itemId: it.id,
        itemName: it.name,
        qty: c.qty,
        removed: false,
      })
    }
  }
  for (const it of view.removedItemsWithClaims) {
    for (const c of it.claims) {
      pushClaim(c.participant, {
        itemId: it.id,
        itemName: it.name,
        qty: c.qty,
        removed: true,
      })
    }
  }

  const ordered = [...groups.values()].sort(
    (a, b) => a.participant.joinedAt - b.participant.joinedAt,
  )

  return (
    <Section title="Who's bringing what">
      {ordered.length === 0 ? (
        <EmptyState
          title="No claims yet"
          description="Once people pick what they'll bring, it'll show up here."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {ordered.map((g) => (
            <section
              key={g.participant.id}
              data-slot="participant-group"
              className="flex flex-col gap-2 rounded-2xl border border-border p-3"
            >
              <h3 className="font-heading text-sm font-semibold">
                {g.participant.name}
                {g.participant.isOwner ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (owner)
                  </span>
                ) : null}
              </h3>
              <ul className="flex flex-col gap-1">
                {g.claims.map((c) => (
                  <li key={c.itemId} className="flex flex-wrap gap-2 text-sm">
                    <span>{c.itemName}</span>
                    <span className="text-muted-foreground">× {c.qty}</span>
                    {c.removed ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        no longer needed
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Section>
  )
}

export default WhoIsBringing
