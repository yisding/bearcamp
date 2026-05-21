// WS-3.3b — dev-only revalidate route for the campsites cache tag.
//
// The dev importer / `prisma db seed` pings this endpoint after writing
// so the next read repopulates the catalog immediately (DR-50). We call
// the `{ expire: 0 }` options form — NOT the `'max'` profile, which
// would defer refresh up to 30 days under stale-while-revalidate.
//
// Route Handlers may call `revalidateTag`; scripts cannot (I-A). The
// importer scripts therefore POST here when `BC_DEV_URL` is set.

import { revalidateTag } from 'next/cache'

async function revalidate(): Promise<Response> {
  revalidateTag('campsites', { expire: 0 })
  return Response.json({ ok: true })
}

export async function POST(): Promise<Response> {
  return revalidate()
}

// GET is exported so dev can poke the endpoint from a browser without a
// REST client. The test accepts either verb (`route.POST ?? route.GET`).
export async function GET(): Promise<Response> {
  return revalidate()
}
