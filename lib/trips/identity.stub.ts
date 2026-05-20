// Test-mode identity helper — WS-0.12b (DR-15 / DR-41).
// In vitest, callers `vi.mock('next/headers', () => ({ cookies: () => mockJar }))`
// so this module sees the injected cookie store. The real next/headers#cookies()
// requires a Next request scope vitest does not provide.
// WS-8.2 rewrites imports `identity.stub` → `identity` (WS-7's real helper).

import type { Participant } from '../db/types'

// Cookie names — DR-3 (distinct so creator is owner AND participant #1).
export const OWNER_COOKIE = 'bc_owner'
export const PARTICIPANT_COOKIE = 'bc_participant'

export function setOwnerToken(_tripId: string, _token: string): void {
  throw new Error('setOwnerToken not implemented (WS-0.12b — impl phase)')
}

export function setParticipantToken(_tripId: string, _token: string): void {
  throw new Error(
    'setParticipantToken not implemented (WS-0.12b — impl phase)',
  )
}

export async function assertOwner(_tripId: string): Promise<void> {
  throw new Error('assertOwner not implemented (WS-0.12b — impl phase)')
}

export async function assertParticipant(_tripId: string): Promise<Participant> {
  throw new Error('assertParticipant not implemented (WS-0.12b — impl phase)')
}

export async function currentParticipant(
  _tripId: string,
): Promise<Participant> {
  throw new Error(
    'currentParticipant not implemented (WS-0.12b — impl phase)',
  )
}
