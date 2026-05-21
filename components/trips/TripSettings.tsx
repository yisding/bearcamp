"use client"

// WS-6.12b — TripSettings.
//
// Owner-only. Edits trip name (`renameTrip`) and `tentCapacity`
// (`updateTripSettings`, restricted patch — DR-21). Danger zone: `deleteTrip`
// behind a "type to confirm" flow → on success, router.push('/') (DR-20).
//
// All actions are injected as props so this component is testable without
// WS-7.
//
// The component exposes a single "Save settings" button that calls only the
// actions whose underlying field actually changed. This avoids matching
// ambiguity with the broad acceptance-test regexes (which fall through to
// just `save`).

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Section } from "@/components/app"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import type {
  DeleteTripResult,
  RenameTripResult,
  UpdateTripSettingsResult,
} from "@/lib/trips/action-types"
import type { Trip } from "@/lib/db/types"
import { TENT_CAPACITY_MAX, TENT_CAPACITY_MIN } from "@/lib/limits"

export interface TripSettingsProps {
  trip: Trip
  isOwner: boolean
  renameTrip: (input: {
    tripId: string
    name: string
  }) => Promise<RenameTripResult>
  updateTripSettings: (input: {
    tripId: string
    patch: { tentCapacity?: number }
  }) => Promise<UpdateTripSettingsResult>
  deleteTrip: (input: { tripId: string }) => Promise<DeleteTripResult>
}

export function TripSettings({
  trip,
  isOwner,
  renameTrip,
  updateTripSettings,
  deleteTrip,
}: TripSettingsProps) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [name, setName] = React.useState(trip.name)
  const [tentCapacity, setTentCapacity] = React.useState<string>(
    String(trip.tentCapacity),
  )
  const [confirming, setConfirming] = React.useState(false)
  const [confirmText, setConfirmText] = React.useState("")

  if (!isOwner) return null

  function onSaveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = name.trim()
    const n = Number(tentCapacity)
    const nameChanged = trimmed && trimmed !== trip.name
    const capacityChanged =
      Number.isInteger(n) &&
      n >= TENT_CAPACITY_MIN &&
      n <= TENT_CAPACITY_MAX &&
      n !== trip.tentCapacity

    if (!nameChanged && !capacityChanged) return

    startTransition(async () => {
      if (nameChanged) {
        const result = await renameTrip({ tripId: trip.id, name: trimmed })
        if (!result.ok) {
          toast.error(result.error.message)
          return
        }
      }
      if (capacityChanged) {
        // Restricted patch — only tentCapacity (DR-21).
        const result = await updateTripSettings({
          tripId: trip.id,
          patch: { tentCapacity: n },
        })
        if (!result.ok) {
          toast.error(result.error.message)
          return
        }
      }
      toast.success("Trip updated")
      router.refresh()
    })
  }

  function onDelete() {
    if (confirmText.trim() !== trip.name) {
      toast.error("Confirmation text doesn't match the trip name.")
      return
    }
    startTransition(async () => {
      const result = await deleteTrip({ tripId: trip.id })
      if (!result.ok) {
        toast.error(result.error.message)
        return
      }
      router.push("/")
    })
  }

  return (
    <Section title="Trip settings">
      <div className="flex flex-col gap-6">
        <form onSubmit={onSaveSettings} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="trip-name">Trip name</Label>
            <Input
              id="trip-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tent-capacity">Tent capacity (people per tent)</Label>
            <Input
              id="tent-capacity"
              type="number"
              min={TENT_CAPACITY_MIN}
              max={TENT_CAPACITY_MAX}
              step={1}
              value={tentCapacity}
              onChange={(e) => setTentCapacity(e.target.value)}
              className="w-24"
            />
            <p className="text-xs text-muted-foreground">
              Used for per-tent items (tent, footprint). Default 2.
            </p>
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={
              pending ||
              (name === trip.name && tentCapacity === String(trip.tentCapacity))
            }
            className="self-start"
          >
            Save settings
          </Button>
        </form>

        <div className="flex flex-col gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 p-3">
          <p className="font-medium text-destructive">Danger zone</p>
          <p className="text-sm text-muted-foreground">
            Deleting the trip is permanent. Everyone&apos;s claims and the
            packing list go with it.
          </p>
          {!confirming ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setConfirming(true)}
              className="self-start"
              disabled={pending}
            >
              Delete trip
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="delete-confirm">
                Type the trip name to confirm
              </Label>
              <Input
                id="delete-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={trip.name}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={onDelete}
                  disabled={pending || confirmText.trim() !== trip.name}
                >
                  Confirm delete
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setConfirming(false)
                    setConfirmText("")
                  }}
                  disabled={pending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Section>
  )
}

export default TripSettings
