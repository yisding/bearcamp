// WS-5.8 — server component. Renders one labeled entry per `Amenities`
// field, including every enum value for `toilets`, `cellService`, and
// `accessLevel`. Pure synchronous render.
//
// Contract (T5.3):
//   - every boolean amenity surfaces as a human label with its yes/no state
//     observable from rendered text.
//   - every enum field renders both the field name and its current value
//     (or a "none"-synonym for the 'none' enum value).
//   - optional `potableWaterNote` renders verbatim when present.

import * as React from "react"
import type { Amenities } from "@/lib/db/types"
import {
  Droplet,
  ShowerHead,
  Zap,
  Flame,
  TreePine,
  Table,
  Lock,
  PawPrint,
  Trash2,
  Wrench,
  Signal,
  MapPin,
  Toilet,
} from "lucide-react"

interface BooleanEntry {
  key: keyof Amenities
  label: string
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
}

const BOOLEAN_ENTRIES: BooleanEntry[] = [
  { key: "potableWater", label: "Potable water", Icon: Droplet },
  { key: "showers", label: "Showers", Icon: ShowerHead },
  { key: "electricity", label: "Electricity", Icon: Zap },
  { key: "fireRings", label: "Fire rings", Icon: Flame },
  { key: "firewoodAvailable", label: "Firewood available", Icon: TreePine },
  { key: "picnicTables", label: "Picnic tables", Icon: Table },
  { key: "bearLockers", label: "Bear lockers", Icon: Lock },
  { key: "bearCountry", label: "Bear country", Icon: PawPrint },
  { key: "trashService", label: "Trash service", Icon: Trash2 },
  { key: "dumpStation", label: "Dump station", Icon: Wrench },
]

function toiletsLabel(value: Amenities["toilets"]): string {
  switch (value) {
    case "flush":
      return "Flush toilets"
    case "vault":
      return "Vault toilets"
    case "none":
      return "No toilets (none)"
  }
}

function cellServiceLabel(value: Amenities["cellService"]): string {
  switch (value) {
    case "good":
      return "Cell service: good"
    case "weak":
      return "Cell service: weak"
    case "none":
      return "Cell service: none (no signal)"
  }
}

function accessLabel(value: Amenities["accessLevel"]): string {
  switch (value) {
    case "drive-in":
      return "Access: drive-in"
    case "walk-in":
      return "Access: walk-in"
    case "backcountry":
      return "Access: backcountry"
  }
}

export interface AmenityGridProps {
  amenities: Amenities
  className?: string
}

export function AmenityGrid({ amenities, className }: AmenityGridProps) {
  return (
    <ul
      data-slot="amenity-grid"
      aria-label="Amenities"
      className={
        "grid grid-cols-2 gap-2 sm:grid-cols-3 " + (className ?? "")
      }
    >
      {BOOLEAN_ENTRIES.map(({ key, label, Icon }) => {
        const present = Boolean(amenities[key])
        return (
          <li
            key={key}
            data-slot="amenity"
            data-amenity={key}
            data-present={present ? "yes" : "no"}
            className={
              "flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm " +
              (present
                ? "bg-card text-foreground"
                : "bg-muted/40 text-muted-foreground line-through")
            }
          >
            <Icon className="size-4" aria-hidden={true} />
            <span>
              {label}: {present ? "yes" : "no"}
            </span>
          </li>
        )
      })}

      <li
        data-slot="amenity"
        data-amenity="toilets"
        className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
      >
        <Toilet className="size-4" aria-hidden={true} />
        <span>{toiletsLabel(amenities.toilets)}</span>
      </li>

      <li
        data-slot="amenity"
        data-amenity="cellService"
        className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
      >
        <Signal className="size-4" aria-hidden={true} />
        <span>{cellServiceLabel(amenities.cellService)}</span>
      </li>

      <li
        data-slot="amenity"
        data-amenity="accessLevel"
        className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
      >
        <MapPin className="size-4" aria-hidden={true} />
        <span>{accessLabel(amenities.accessLevel)}</span>
      </li>

      {amenities.potableWaterNote ? (
        <li
          data-slot="amenity"
          data-amenity="potableWaterNote"
          className="col-span-full flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
        >
          <Droplet className="size-4" aria-hidden={true} />
          <span>Water note: {amenities.potableWaterNote}</span>
        </li>
      ) : null}
    </ul>
  )
}

export default AmenityGrid
