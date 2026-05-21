"use client"

// WS-6.3 — StylePicker.
//
// Two-style form (car|backpacking) that posts to a `createTrip` Server
// Action injected as a prop. Uses React 19 `useActionState` so the form
// surfaces a `pending` state while the action is in flight.
//
// The component intentionally takes the action as a prop (not an import)
// so it remains decoupled from WS-7 and testable with a stub.

import * as React from "react"
import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

import type {
  CreateTripResult,
} from "@/lib/trips/action-types"

export interface StylePickerProps {
  campsiteId: string
  /**
   * Server Action that creates a trip. Accepts either the typed input or a
   * FormData (the form posts FormData via useActionState). WS-7 will pass a
   * real action wired to `lib/trips/actions`.
   */
  createTripAction: (
    prevState: CreateTripResult | null,
    formData: FormData,
  ) => Promise<CreateTripResult>
  className?: string
}

export function StylePicker({
  campsiteId,
  createTripAction,
  className,
}: StylePickerProps) {
  const [state, formAction, isPending] = useActionState<
    CreateTripResult | null,
    FormData
  >(async (prev, formData) => createTripAction(prev, formData), null)

  return (
    <form
      action={formAction}
      data-slot="style-picker"
      className={cn("flex flex-col gap-4", className)}
      aria-busy={isPending || undefined}
    >
      <input type="hidden" name="campsiteId" value={campsiteId} />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Trip style</legend>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
          <Label className="flex items-center gap-2">
            <input
              type="radio"
              name="style"
              value="car"
              defaultChecked
              className="size-4"
            />
            Car camping
          </Label>
          <Label className="flex items-center gap-2">
            <input
              type="radio"
              name="style"
              value="backpacking"
              className="size-4"
            />
            Backpacking
          </Label>
        </div>
      </fieldset>

      <Button type="submit" disabled={isPending} aria-busy={isPending || undefined}>
        {isPending ? "Creating…" : "Create trip"}
      </Button>

      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error.message}
        </p>
      ) : null}
    </form>
  )
}

export default StylePicker
