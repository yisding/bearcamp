// Test-mode identity helper — WS-0.12b (DR-15 / DR-41 / DR-42 / DR-40).
//
// In vitest, callers `vi.mock('next/headers', () => ({ cookies: () => mockJar }))`
// so this module sees an injected cookie store. The real next/headers#cookies()
// is async (DR-42) and requires a Next request scope vitest does not provide.
// Cookie clearing uses `set(name, '', { path, maxAge: 0 })` per DR-40 —
// never `delete()` (which is single-arg and ignores `path`).
// WS-8.2 rewrites imports `identity.stub` → `identity` (WS-7's real helper).

import { cookies } from 'next/headers'
import type { Participant } from '../db/types'
import { getStorage } from '../services'

// Cookie names — DR-3 (distinct so creator is owner AND participant #1).
export const OWNER_COOKIE = 'bc_owner'
export const PARTICIPANT_COOKIE = 'bc_participant'

const COOKIE_PATH = '/'

export async function setOwnerToken(
  _tripId: string,
  tokenStr: string,
): Promise<void> {
  const jar = await cookies()
  jar.set(OWNER_COOKIE, tokenStr, { path: COOKIE_PATH })
}

export async function setParticipantToken(
  _tripId: string,
  tokenStr: string,
): Promise<void> {
  const jar = await cookies()
  jar.set(PARTICIPANT_COOKIE, tokenStr, { path: COOKIE_PATH })
}

// DR-40 — clear via empty value + maxAge 0 + path, NOT jar.delete(name).
export async function clearOwnerToken(_tripId: string): Promise<void> {
  const jar = await cookies()
  jar.set(OWNER_COOKIE, '', { path: COOKIE_PATH, maxAge: 0 })
}

export async function clearParticipantToken(_tripId: string): Promise<void> {
  const jar = await cookies()
  jar.set(PARTICIPANT_COOKIE, '', { path: COOKIE_PATH, maxAge: 0 })
}

export async function assertOwner(tripId: string): Promise<void> {
  const jar = await cookies()
  const c = jar.get(OWNER_COOKIE)
  if (!c?.value) {
    throw new Error(`unauthorized: missing ${OWNER_COOKIE} cookie`)
  }
  const trip = await getStorage().trips.byOwnerToken(tripId, c.value)
  if (!trip) {
    throw new Error('unauthorized: owner token mismatch')
  }
}

export async function assertParticipant(tripId: string): Promise<Participant> {
  return currentParticipant(tripId)
}

export async function currentParticipant(
  tripId: string,
): Promise<Participant> {
  const jar = await cookies()
  const c = jar.get(PARTICIPANT_COOKIE)
  if (!c?.value) {
    throw new Error(`unauthorized: missing ${PARTICIPANT_COOKIE} cookie`)
  }
  const p = await getStorage().participants.byToken(tripId, c.value)
  if (!p) {
    throw new Error('unauthorized: participant token not found')
  }
  return p
}
