// T0.14 — Result envelope + ErrorCode union (DR-39 / DR-44).
// lib/trips/result.ts exports exactly { ok, err } as values + { Result,
// ErrorCode } as types. The ErrorCode union has exactly 5 members; an
// exhaustive switch type-checks only at exactly these 5 codes.

import { describe, it, expect } from 'vitest'
import * as result from '../result'
import type { ErrorCode, Result } from '../result'

describe('T0.14 Result envelope + ErrorCode', () => {
  it('value-exports are exactly { ok, err }', () => {
    expect(Object.keys(result).sort()).toEqual(['err', 'ok'].sort())
  })

  it('ok() wraps data into a success envelope', () => {
    const r = result.ok(42)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toBe(42)
  })

  it('err() wraps a code + message into a failure envelope', () => {
    const r = result.err('not_found', 'Trip missing')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe('not_found')
      expect(r.error.message).toBe('Trip missing')
    }
  })

  it('ErrorCode union is exhausted by exactly 5 codes (compile-time assertion)', () => {
    // If the union shrinks/grows, `assertNever` line below stops type-checking.
    function exhaust(code: ErrorCode): string {
      switch (code) {
        case 'unauthorized':
        case 'not_found':
        case 'validation_failed':
        case 'participant_cap_reached':
        case 'internal':
          return code
        default: {
          const _never: never = code
          return _never
        }
      }
    }
    // Runtime sanity-check each documented code is acceptable.
    expect(exhaust('unauthorized')).toBe('unauthorized')
    expect(exhaust('not_found')).toBe('not_found')
    expect(exhaust('validation_failed')).toBe('validation_failed')
    expect(exhaust('participant_cap_reached')).toBe('participant_cap_reached')
    expect(exhaust('internal')).toBe('internal')
  })

  it('Result<T> discriminant narrows correctly', () => {
    const r: Result<string> = result.ok('hi')
    if (r.ok) {
      // type-narrowed to { ok: true; data: string }
      expect(r.data.length).toBe(2)
    }
    const r2: Result<string> = result.err('internal', 'oops')
    if (!r2.ok) {
      expect(r2.error.code).toBe('internal')
    }
  })
})
