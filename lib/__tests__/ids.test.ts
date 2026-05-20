// T0.4 — id helpers.
// tripSlug() = crypto.randomUUID() (122-bit, UUID shape); 1000x unique.
// token() ≥16 bytes (≥128-bit) when decoded.
// campsiteId('seed','foo') === 'seed:foo'; unknown prefix throws.

import { describe, it, expect } from 'vitest'
import { tripSlug, token, campsiteId } from '../ids'

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('T0.4 ids', () => {
  it('tripSlug() shape matches canonical crypto.randomUUID()', () => {
    const id = tripSlug()
    expect(id).toMatch(UUID_V4_REGEX)
  })

  it('tripSlug() is unique across 1000 calls', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) seen.add(tripSlug())
    expect(seen.size).toBe(1000)
  })

  it('token() decodes to ≥16 bytes (≥128-bit entropy) (G7)', () => {
    const t = token()
    expect(typeof t).toBe('string')
    // url-safe base64 / base64url: every 4 chars encode 3 bytes.
    // We accept any encoding so long as decoded byte length is ≥16.
    // Try base64url decode first; fall back to assuming hex; finally count
    // raw chars as bytes. The strictest reasonable lower-bound check:
    let bytes = 0
    // base64url-ish: strip padding, decode
    const b64 = t.replace(/-/g, '+').replace(/_/g, '/')
    try {
      // padded
      const pad =
        b64.length % 4 === 2 ? '==' : b64.length % 4 === 3 ? '=' : ''
      bytes = Buffer.from(b64 + pad, 'base64').length
    } catch {
      bytes = 0
    }
    if (bytes < 16 && /^[0-9a-f]+$/i.test(t)) {
      // hex
      bytes = t.length / 2
    }
    expect(bytes).toBeGreaterThanOrEqual(16)
  })

  it("campsiteId('seed','foo') === 'seed:foo'", () => {
    expect(campsiteId('seed', 'foo')).toBe('seed:foo')
  })

  it('campsiteId accepts all sanctioned prefixes', () => {
    expect(campsiteId('fixture', 'bar')).toBe('fixture:bar')
    expect(campsiteId('ridb', '12345')).toBe('ridb:12345')
    expect(campsiteId('osm', 'n42')).toBe('osm:n42')
  })

  it('campsiteId rejects unknown prefix (DR-30)', () => {
    // @ts-expect-error — the type prevents this at compile time; we still
    // assert the runtime guard so the JS-callsite path is covered.
    expect(() => campsiteId('bogus', 'x')).toThrow()
  })
})
