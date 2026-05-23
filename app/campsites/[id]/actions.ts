"use server"

// WS-8.2 — seam adapter for the StylePicker form on the campsite
// detail page. Bridges the FormData posted by the client-side
// `<StylePicker>` (which uses `useActionState`) into the typed
// `createTrip(input)` call from `lib/trips/actions.ts`.
//
// Kept thin on purpose: only field extraction + type narrowing. The
// real validation, identity, and persistence still live in WS-7.

import { createTrip } from "@/lib/trips/actions"
import type {
  CreateTripInput,
  CreateTripResult,
} from "@/lib/trips/action-types"

function readStyle(form: FormData): CreateTripInput["style"] {
  const raw = form.get("style")
  if (raw === "backpacking") return "backpacking"
  return "car"
}

// `form.get` returns `""` (not `null`) for an empty text field. Passing
// `""` straight through produces e.g. `ownerName: ""`, which trips
// CreateTripSchema's `.min(1)` with a confusing "string too small" error
// rather than the intended "optional, omitted" path. Coerce empty /
// whitespace-only strings to `undefined` so optional fields stay optional.
function readOptional(form: FormData, key: string): string | undefined {
  const v = form.get(key)
  return typeof v === "string" && v.trim() ? v : undefined
}

export async function createTripFromForm(
  _prev: CreateTripResult | null,
  form: FormData,
): Promise<CreateTripResult> {
  const campsiteId = String(form.get("campsiteId") ?? "")
  const style = readStyle(form)
  const ownerName = readOptional(form, "ownerName")
  const tripName = readOptional(form, "name")
  // createTrip is Form A — on success it `redirect()`s and never returns.
  // The Result envelope only surfaces here for the failure path.
  return createTrip({
    campsiteId,
    style,
    ownerName,
    name: tripName,
  })
}
