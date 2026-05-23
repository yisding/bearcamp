// WS-8.9 — liveness probe.
//
// Returns `{ ok: true, backend: 'memory' | 'prisma' }` so an orchestrator
// (Fly, Vercel, Kubernetes, etc.) can tell the process is up. The
// endpoint deliberately does NOT touch the database: a probe that
// queries Postgres turns the DB into a single point of failure for
// "is the process alive?" checks. The Prisma-vs-memory selection is
// reported only to ease incident triage; flipping the env var requires
// a restart (D1).
//
// Unauthenticated by design — health probes don't carry credentials.
// Trip / campsite endpoints with real PII / state are protected
// elsewhere (cookies, Server-Action allowed-origins).

import { getBackend } from "@/lib/services"

// Cache Components is incompatible with `dynamic = 'force-dynamic'`; the
// route is naturally request-time because the GET handler runs per-request.
// We don't need any cache control because the response carries no PII and
// the backend selection only changes on a process restart.

export async function GET() {
  return Response.json({
    ok: true,
    backend: getBackend(),
  })
}
