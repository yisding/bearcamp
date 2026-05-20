// Id helpers — WS-0.9. Non-deterministic: callable ONLY from Server Actions,
// never inside `'use cache'` / prerendered scope (WS-8.3 audit; B5).

import { randomBytes, randomUUID } from 'node:crypto'

const CAMPSITE_PREFIXES = ['seed', 'fixture', 'ridb', 'osm'] as const
export type CampsitePrefix = (typeof CAMPSITE_PREFIXES)[number]

// Trip slug = canonical UUID v4 (122-bit entropy; kept full-length per DR-27).
export function tripSlug(): string {
  return randomUUID()
}

// Url-safe random token with ≥128-bit entropy (G7). 24 bytes → 192 bits.
export function token(): string {
  return randomBytes(24).toString('base64url')
}

// The only sanctioned way to construct a Campsite.id (DR-30). Runtime guard
// covers the JS-callsite path even though the type prevents it at compile.
export function campsiteId(prefix: CampsitePrefix, raw: string): string {
  if (!CAMPSITE_PREFIXES.includes(prefix)) {
    throw new Error(`campsiteId: unknown prefix '${prefix}'`)
  }
  return `${prefix}:${raw}`
}

export const __CAMPSITE_PREFIXES = CAMPSITE_PREFIXES
