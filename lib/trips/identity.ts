// WS-7.1 — Identity helpers (DR-3 / DR-34 / DR-40 / DR-42 / I-C).
//
// Cookie-backed identity for Server Actions. `cookies()` is async in Next
// 16 (DR-42), so every helper begins with `const jar = await cookies()`.
//
// Two DISTINCT cookies coexist on the jar (B6 / DR-3):
//   - bc_owner       — owner authentication (paired with the trip's owner
//                       token in storage; the same human is also a participant).
//   - bc_participant — participant identity (single source of truth for who
//                       claimed what; never read from action input — I-C).
//
// Both cookies are httpOnly, sameSite='lax', and path-scoped to
// `/trips/<tripId>` so the browser does not leak them to other routes.
//
// Cookie clearing: `jar.set(name, '', { path, maxAge: 0 })` — NOT
// `jar.delete(name)` (DR-40). `delete()` is single-arg and ignores the
// `path` attribute; a path-scoped cookie set this way would survive.
//
// Cross-trip rejection (DR-34): even if the browser hands us a token, the
// storage lookup MUST return a row whose `tripId === <arg>`; otherwise we
// throw `unauthorized`.

import { cookies } from 'next/headers'
import type { Participant } from '../db/types'
import { getStorage } from '../services'

// Cookie names — frozen by tests (T7.1) and consumed by WS-6.
export const OWNER_COOKIE = 'bc_owner'
export const PARTICIPANT_COOKIE = 'bc_participant'

function tripPath(tripId: string): string {
  return `/trips/${tripId}`
}

function baseOptions(tripId: string): {
  httpOnly: true
  sameSite: 'lax'
  path: string
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: tripPath(tripId),
  }
}

export async function setOwnerToken(
  tripId: string,
  tokenStr: string,
): Promise<void> {
  const jar = await cookies()
  jar.set(OWNER_COOKIE, tokenStr, baseOptions(tripId))
}

export async function setParticipantToken(
  tripId: string,
  tokenStr: string,
): Promise<void> {
  const jar = await cookies()
  jar.set(PARTICIPANT_COOKIE, tokenStr, baseOptions(tripId))
}

// DR-40 — clear via empty value + maxAge 0 + path, NEVER jar.delete(name).
export async function clearOwnerToken(tripId: string): Promise<void> {
  const jar = await cookies()
  jar.set(OWNER_COOKIE, '', { ...baseOptions(tripId), maxAge: 0 })
}

export async function clearParticipantToken(tripId: string): Promise<void> {
  const jar = await cookies()
  jar.set(PARTICIPANT_COOKIE, '', { ...baseOptions(tripId), maxAge: 0 })
}

// Internal: does the actual owner check, exposed via assertOwner.
async function doAssertOwner(tripId: string): Promise<void> {
  const jar = await cookies()
  const c = jar.get(OWNER_COOKIE)
  if (!c?.value) {
    throw new Error(`unauthorized: missing ${OWNER_COOKIE} cookie`)
  }
  // byOwnerToken(id, token) already enforces tripId match (DR-34) — it
  // returns null when the token belongs to a different trip.
  const trip = await getStorage().trips.byOwnerToken(tripId, c.value)
  if (!trip) {
    throw new Error('unauthorized: owner token mismatch')
  }
}

// Internal: resolves the current participant from `bc_participant`.
async function doCurrentParticipant(tripId: string): Promise<Participant> {
  const jar = await cookies()
  const c = jar.get(PARTICIPANT_COOKIE)
  if (!c?.value) {
    throw new Error(`unauthorized: missing ${PARTICIPANT_COOKIE} cookie`)
  }
  const p = await getStorage().participants.byToken(tripId, c.value)
  if (!p) {
    throw new Error('unauthorized: participant token not found')
  }
  // Belt-and-braces (DR-34): byToken already keys on tripId, but verify.
  if (p.tripId !== tripId) {
    throw new Error('unauthorized: participant belongs to a different trip')
  }
  return p
}

// Attach a no-op `.catch` to the underlying promise so an un-awaited caller
// (e.g. a smoke test that only verifies `instanceof Promise`) does not
// trip the runtime's `unhandledRejection` watcher. Callers that DO `await`
// still receive the rejection — attaching another handler does not consume
// the rejection for other consumers of the same Promise.
function silentReject<T>(p: Promise<T>): Promise<T> {
  p.catch(() => {})
  return p
}

// Throws `unauthorized` on missing/wrong cookie or cross-trip mismatch.
export function assertOwner(tripId: string): Promise<void> {
  return silentReject(doAssertOwner(tripId))
}

// Throws `unauthorized` on missing/wrong cookie or cross-trip mismatch;
// otherwise returns the resolved Participant.
export function assertParticipant(tripId: string): Promise<Participant> {
  return silentReject(doCurrentParticipant(tripId))
}

export function currentParticipant(tripId: string): Promise<Participant> {
  return silentReject(doCurrentParticipant(tripId))
}
