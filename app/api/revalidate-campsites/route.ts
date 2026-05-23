// WS-3.3b — dev-only revalidate route for the campsites cache tag.
//
// The dev importer / `prisma db seed` pings this endpoint after writing
// so the next read repopulates the catalog immediately (DR-50). We call
// the `{ expire: 0 }` options form — NOT the `'max'` profile, which
// would defer refresh up to 30 days under stale-while-revalidate.
//
// Route Handlers may call `revalidateTag`; scripts cannot (I-A). The
// importer scripts therefore POST here when `BC_DEV_URL` is set.
//
// Spec: WS-3.3b says "dev-only, guarded by env". Without a guard a
// production deploy exposes a public, unauthenticated endpoint that any
// caller can hit in a loop to repeatedly invalidate the `campsites`
// cache, forcing expensive cache misses (Codex review P1). The guard
// here is two-tier:
//   1) NODE_ENV !== 'production'      → unconditionally allow (dev/test)
//   2) BEARCAMP_REVALIDATE_SECRET set → allow if the caller presents
//      the same value in the `x-revalidate-secret` header (lets a prod
//      operator opt-in to webhook-style invalidation behind a shared
//      secret, the pattern documented in revalidateTag.md). All other
//      production requests are 404.

import { revalidateTag } from 'next/cache'

function isAuthorized(req: Request): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  const secret = process.env.BEARCAMP_REVALIDATE_SECRET
  if (!secret) return false
  return req.headers.get('x-revalidate-secret') === secret
}

async function revalidate(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    // 404 (not 403) so we don't advertise the route's existence to
    // unauthenticated callers in production.
    return new Response('Not Found', { status: 404 })
  }
  revalidateTag('campsites', { expire: 0 })
  return Response.json({ ok: true })
}

export async function POST(req: Request): Promise<Response> {
  return revalidate(req)
}

// GET is exported so dev can poke the endpoint from a browser without a
// REST client. The test accepts either verb (`route.POST ?? route.GET`).
export async function GET(req: Request): Promise<Response> {
  return revalidate(req)
}
