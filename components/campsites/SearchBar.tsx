"use client"

// WS-5.4 — debounced search bar.
//
// Reads current URL params on mount and writes back a coalesced URL via
// `useRouter().replace(...)` after a short debounce. Writes pass through
// `lib/routes.campsites(...)` so callers can swap the URL builder in one
// place. The handler builds a fresh `URLSearchParams` each tick to avoid
// re-render thrash.
//
// Contract (T5.1):
//   - input has role="searchbox" with an accessible name matching /search/i
//   - state + agency rendered as native <select> with role="combobox"
//   - amenities rendered as <input type="checkbox"> with role="checkbox"
//   - debounce window ≤ 500ms; one URL write per typed burst
//   - mount pre-fills every control from `useSearchParams()`

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { Amenities } from "@/lib/db/types"
import { campsites as campsitesRoute } from "@/lib/routes"

// Subset of amenities surfaced as filter checkboxes. The full enum lives in
// `lib/db/types.ts`; the search bar exposes the booleans most users want as
// hard filters. The displayed label is the human-readable form (the value
// posted to URLSearchParams is the camelCase key).
const AMENITY_FILTERS: Array<{ key: keyof Amenities; label: string }> = [
  { key: "potableWater", label: "Potable water" },
  { key: "showers", label: "Showers" },
  { key: "electricity", label: "Electricity" },
  { key: "fireRings", label: "Fire rings" },
  { key: "picnicTables", label: "Picnic tables" },
  { key: "bearLockers", label: "Bear lockers" },
  { key: "dumpStation", label: "Dump station" },
]

const STATES: Array<{ value: string; label: string }> = [
  { value: "", label: "Any state" },
  { value: "AZ", label: "AZ" },
  { value: "CA", label: "CA" },
  { value: "CO", label: "CO" },
  { value: "FL", label: "FL" },
  { value: "NV", label: "NV" },
  { value: "OR", label: "OR" },
  { value: "UT", label: "UT" },
  { value: "WA", label: "WA" },
]

const AGENCIES: Array<{ value: string; label: string }> = [
  { value: "", label: "Any agency" },
  { value: "BLM", label: "BLM" },
  { value: "CA State Parks", label: "CA State Parks" },
  { value: "NPS", label: "NPS" },
  { value: "Private", label: "Private" },
  { value: "USFS", label: "USFS" },
]

const DEBOUNCE_MS = 300

function buildHref(state: {
  q: string
  state: string
  agency: string
  amenities: string[]
}): string {
  const params = new URLSearchParams()
  if (state.q) params.set("q", state.q)
  if (state.state) params.set("state", state.state)
  if (state.agency) params.set("agency", state.agency)
  for (const a of state.amenities) params.append("amenities", a)
  const qs = params.toString()
  return qs ? `${campsitesRoute()}?${qs}` : campsitesRoute()
}

export function SearchBar() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Initialise from current URL params so the bar reflects the page state
  // on mount (T5.1 — "mounts pre-filled from current params").
  const initialQ = searchParams.get("q") ?? ""
  const initialState = searchParams.get("state") ?? ""
  const initialAgency = searchParams.get("agency") ?? ""
  const initialAmenities = React.useMemo(
    () => searchParams.getAll("amenities"),
    [searchParams],
  )

  const [q, setQ] = React.useState(initialQ)
  const [stateValue, setStateValue] = React.useState(initialState)
  const [agency, setAgency] = React.useState(initialAgency)
  const [amenities, setAmenities] = React.useState<string[]>(initialAmenities)

  // Track whether the user has interacted yet so the debounce effect doesn't
  // immediately rewrite the URL on mount with the same values.
  const hasInteracted = React.useRef(false)

  React.useEffect(() => {
    if (!hasInteracted.current) return
    const handle = setTimeout(() => {
      router.replace(
        buildHref({ q, state: stateValue, agency, amenities }),
      )
    }, DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [q, stateValue, agency, amenities, router])

  function markInteracted() {
    hasInteracted.current = true
  }

  function toggleAmenity(key: string, checked: boolean) {
    markInteracted()
    setAmenities((prev) => {
      const set = new Set(prev)
      if (checked) set.add(key)
      else set.delete(key)
      return Array.from(set)
    })
  }

  return (
    <form
      role="search"
      data-slot="search-bar"
      className="flex flex-col gap-3"
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="campsite-search" className="sr-only">
          Search campsites
        </label>
        <input
          id="campsite-search"
          type="search"
          role="searchbox"
          aria-label="Search campsites"
          placeholder="Find a campsite by name…"
          value={q}
          onChange={(e) => {
            markInteracted()
            setQ(e.target.value)
          }}
          className="h-9 w-full min-w-0 flex-1 rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />

        <label htmlFor="campsite-state" className="sr-only">
          State
        </label>
        <select
          id="campsite-state"
          aria-label="State"
          value={stateValue}
          onChange={(e) => {
            markInteracted()
            setStateValue(e.target.value)
          }}
          className="h-9 rounded-4xl border border-input bg-input/30 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {STATES.map((s) => (
            <option key={s.value || "any-state"} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <label htmlFor="campsite-agency" className="sr-only">
          Agency
        </label>
        <select
          id="campsite-agency"
          aria-label="Agency"
          value={agency}
          onChange={(e) => {
            markInteracted()
            setAgency(e.target.value)
          }}
          className="h-9 rounded-4xl border border-input bg-input/30 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {AGENCIES.map((a) => (
            <option key={a.value || "any-agency"} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset
        data-slot="amenity-filters"
        className="flex flex-wrap items-center gap-x-4 gap-y-2"
      >
        <legend className="sr-only">Amenities</legend>
        {AMENITY_FILTERS.map((amenity) => {
          const id = `amenity-${amenity.key}`
          const checked = amenities.includes(amenity.key)
          return (
            <label
              key={amenity.key}
              htmlFor={id}
              className="inline-flex items-center gap-2 text-sm text-foreground"
            >
              <input
                id={id}
                type="checkbox"
                checked={checked}
                aria-label={amenity.label}
                onChange={(e) => toggleAmenity(amenity.key, e.target.checked)}
                className="size-4 rounded border-input"
              />
              {amenity.label}
            </label>
          )
        })}
      </fieldset>
    </form>
  )
}

export default SearchBar
