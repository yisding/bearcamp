"use client"

// WS-6.6 — JoinTripDialog.
//
// Shown when there is no participant cookie for THIS trip (server resolves
// this and passes `isParticipant`; if a `bc_participant` cookie exists for a
// DIFFERENT trip, the path-scoped cookie isn't sent on this trip's path, so
// `isParticipant` is false here — DR-35).
//
// On `error.code === 'participant_cap_reached'`, surfaces `error.message`
// verbatim via toast (canonical string lives in WS-7.6 — DR-46).

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import type { JoinTripResult } from "@/lib/trips/action-types"

export interface JoinTripDialogProps {
  tripId: string
  isParticipant: boolean
  joinTripAction: (input: {
    tripId: string
    name: string
  }) => Promise<JoinTripResult>
}

export function JoinTripDialog({
  tripId,
  isParticipant,
  joinTripAction,
}: JoinTripDialogProps) {
  const router = useRouter()
  const [name, setName] = React.useState("")
  const [pending, startTransition] = React.useTransition()
  const [open, setOpen] = React.useState(true)

  if (isParticipant) return null

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    startTransition(async () => {
      const result = await joinTripAction({ tripId, name: trimmed })
      if (result.ok) {
        setOpen(false)
        router.refresh()
      } else {
        // Surface error.message verbatim — canonical strings live action-side
        // (DR-46 for cap-reached).
        toast.error(result.error.message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Join this trip</DialogTitle>
          <DialogDescription>
            Add your name so others can see what you&apos;re bringing.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="join-name">Your name</Label>
            <Input
              id="join-name"
              name="name"
              autoFocus
              required
              minLength={1}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Joining…" : "Join"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default JoinTripDialog
