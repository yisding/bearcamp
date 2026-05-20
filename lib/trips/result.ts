// Result envelope + ErrorCode union — WS-0.8b (DR-39 / DR-44).
// Every Server Action returns Promise<Result<T>>. The union is closed at
// exactly 5 codes — adding/removing a code is a contract bump asserted by
// T0.14.

export type ErrorCode =
  | 'unauthorized'
  | 'not_found'
  | 'validation_failed'
  | 'participant_cap_reached'
  | 'internal'

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string } }

export const ok = <T>(data: T): Result<T> => ({ ok: true, data })

export const err = (code: ErrorCode, message: string): Result<never> => ({
  ok: false,
  error: { code, message },
})
