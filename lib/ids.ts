// Id helpers — WS-0.9. Non-deterministic: callable ONLY from Server Actions,
// never inside `'use cache'` / prerendered scope (WS-8.3 audit; B5).
// Stub form for the TDD red pass; impl agent supplies bodies per DR-27 / G7.

const CAMPSITE_PREFIXES = ['seed', 'fixture', 'ridb', 'osm'] as const
export type CampsitePrefix = (typeof CAMPSITE_PREFIXES)[number]

export function tripSlug(): string {
  throw new Error('tripSlug not implemented (WS-0.9 — impl phase)')
}

export function token(): string {
  throw new Error('token not implemented (WS-0.9 — impl phase)')
}

export function campsiteId(_prefix: CampsitePrefix, _raw: string): string {
  throw new Error('campsiteId not implemented (WS-0.9 — impl phase)')
}

export const __CAMPSITE_PREFIXES = CAMPSITE_PREFIXES
