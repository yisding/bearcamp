"use server"

// WS-6 — stub Server Actions to wire the trip page against in-memory storage
// before WS-7 ships the real ones. These thunks all use the cookie-based
// identity resolution (DR-15) and return the canonical Result envelope from
// `lib/trips/result`. WS-8.2 swaps imports here to WS-7's real `lib/trips/actions`.
//
// Each action re-resolves identity from cookies on every call (frozen rule
// I-C / DR-3 — no participantId/token in client inputs).

import { randomBytes } from "node:crypto"
import { cookies } from "next/headers"

import { getStorage } from "@/lib/services"
import { OWNER_COOKIE, PARTICIPANT_COOKIE } from "@/lib/trips/identity.stub"
import { err, ok } from "@/lib/trips/result"
import type {
  AddItemInput,
  AddItemResult,
  ClaimItemInput,
  ClaimItemResult,
  DeleteTripInput,
  DeleteTripResult,
  JoinTripInput,
  JoinTripResult,
  RemoveItemInput,
  RemoveItemResult,
  RenameTripInput,
  RenameTripResult,
  RestoreItemInput,
  RestoreItemResult,
  UnclaimItemInput,
  UnclaimItemResult,
  UpdateItemInput,
  UpdateItemResult,
  UpdateTripSettingsInput,
  UpdateTripSettingsResult,
} from "@/lib/trips/action-types"

function genToken(): string {
  return randomBytes(24).toString("base64url")
}

async function readOwnerToken(): Promise<string | null> {
  const j = await cookies()
  return j.get(OWNER_COOKIE)?.value ?? null
}

async function readParticipantToken(): Promise<string | null> {
  const j = await cookies()
  return j.get(PARTICIPANT_COOKIE)?.value ?? null
}

async function assertOwner(tripId: string): Promise<boolean> {
  const tok = await readOwnerToken()
  if (!tok) return false
  const t = await getStorage().trips.byOwnerToken(tripId, tok)
  return t !== null
}

export async function joinTrip(
  input: JoinTripInput,
): Promise<JoinTripResult> {
  try {
    const tok = genToken()
    const participant = await getStorage().participants.add(
      input.tripId,
      input.name,
      false,
      tok,
    )
    const j = await cookies()
    j.set(PARTICIPANT_COOKIE, tok, { path: "/" })
    return ok(participant)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("participant_cap_reached")) {
      return err(
        "participant_cap_reached",
        "This trip is full (50 people).",
      )
    }
    return err("internal", msg)
  }
}

export async function claimItem(
  input: ClaimItemInput,
): Promise<ClaimItemResult> {
  try {
    const tok = await readParticipantToken()
    if (!tok) return err("unauthorized", "Join this trip to claim items.")
    const p = await getStorage().participants.byToken(input.tripId, tok)
    if (!p) return err("unauthorized", "Unknown participant.")
    const claim = await getStorage().claims.upsert(
      input.itemId,
      p.id,
      input.qty,
    )
    return ok(claim)
  } catch (e) {
    return err("internal", e instanceof Error ? e.message : String(e))
  }
}

export async function unclaimItem(
  input: UnclaimItemInput,
): Promise<UnclaimItemResult> {
  try {
    const tok = await readParticipantToken()
    if (!tok) return err("unauthorized", "Join this trip to unclaim items.")
    const p = await getStorage().participants.byToken(input.tripId, tok)
    if (!p) return err("unauthorized", "Unknown participant.")
    await getStorage().claims.remove(input.itemId, p.id)
    return ok({ itemId: input.itemId })
  } catch (e) {
    return err("internal", e instanceof Error ? e.message : String(e))
  }
}

export async function addItem(
  input: AddItemInput,
): Promise<AddItemResult> {
  try {
    if (!(await assertOwner(input.tripId))) {
      return err("unauthorized", "Owner only.")
    }
    const item = await getStorage().items.add({
      tripId: input.tripId,
      category: input.category,
      name: input.name,
      scope: input.scope,
      baseQty: input.baseQty,
      unit: input.unit,
      note: input.note,
      source: "custom",
    })
    return ok(item)
  } catch (e) {
    return err("internal", e instanceof Error ? e.message : String(e))
  }
}

export async function updateItem(
  input: UpdateItemInput,
): Promise<UpdateItemResult> {
  try {
    if (!(await assertOwner(input.tripId))) {
      return err("unauthorized", "Owner only.")
    }
    const it = await getStorage().items.update(input.itemId, input.patch)
    return ok(it)
  } catch (e) {
    return err("internal", e instanceof Error ? e.message : String(e))
  }
}

export async function removeItem(
  input: RemoveItemInput,
): Promise<RemoveItemResult> {
  try {
    if (!(await assertOwner(input.tripId))) {
      return err("unauthorized", "Owner only.")
    }
    const it = await getStorage().items.softRemove(input.itemId)
    return ok(it)
  } catch (e) {
    return err("internal", e instanceof Error ? e.message : String(e))
  }
}

export async function restoreItem(
  input: RestoreItemInput,
): Promise<RestoreItemResult> {
  try {
    if (!(await assertOwner(input.tripId))) {
      return err("unauthorized", "Owner only.")
    }
    const it = await getStorage().items.restore(input.itemId)
    return ok(it)
  } catch (e) {
    return err("internal", e instanceof Error ? e.message : String(e))
  }
}

export async function renameTrip(
  input: RenameTripInput,
): Promise<RenameTripResult> {
  try {
    if (!(await assertOwner(input.tripId))) {
      return err("unauthorized", "Owner only.")
    }
    const updated = await getStorage().trips.rename(input.tripId, input.name)
    return ok(updated)
  } catch (e) {
    return err("internal", e instanceof Error ? e.message : String(e))
  }
}

export async function updateTripSettings(
  input: UpdateTripSettingsInput,
): Promise<UpdateTripSettingsResult> {
  try {
    if (!(await assertOwner(input.tripId))) {
      return err("unauthorized", "Owner only.")
    }
    const updated = await getStorage().trips.updateSettings(
      input.tripId,
      input.patch,
    )
    return ok(updated)
  } catch (e) {
    return err("internal", e instanceof Error ? e.message : String(e))
  }
}

export async function deleteTrip(
  input: DeleteTripInput,
): Promise<DeleteTripResult> {
  try {
    if (!(await assertOwner(input.tripId))) {
      return err("unauthorized", "Owner only.")
    }
    await getStorage().trips.delete(input.tripId)
    return ok({ tripId: input.tripId })
  } catch (e) {
    return err("internal", e instanceof Error ? e.message : String(e))
  }
}
