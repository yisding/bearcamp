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

export async function createTripFromForm(
  _prev: CreateTripResult | null,
  form: FormData,
): Promise<CreateTripResult> {
  const campsiteId = String(form.get("campsiteId") ?? "")
  const style = readStyle(form)
  const ownerName =
    form.get("ownerName") != null ? String(form.get("ownerName")) : undefined
  const tripName =
    form.get("name") != null ? String(form.get("name")) : undefined
  // createTrip is Form A — on success it `redirect()`s and never returns.
  // The Result envelope only surfaces here for the failure path.
  return createTrip({
    campsiteId,
    style,
    ownerName,
    name: tripName,
  })
}
