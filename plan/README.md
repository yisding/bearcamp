# Bearcamp — Plan

A trip-planning app for public campsites. Search campsites, pick a trip style
(car camping vs. backpacking), get an amenity-aware packing list grouped by
category, edit it, then share a link so a group can split the gear — with
per-person items (sleeping bags, pads) multiplying as people join.

This folder is the plan only. No app code is written yet.

## Documents

| File | What it covers |
|---|---|
| `README.md` (this) | Goals, scope, key decisions, open questions |
| `architecture.md` | Next.js 16.2.6 conventions, routes, caching, data flow |
| `data-model.md` | Prisma schema (Neon Postgres) + TypeScript domain DTOs |
| `local-dev.md` | Local Docker Postgres, Prisma migrate/seed, envs, deployment matrix |
| `packing-engine.md` | Base templates, amenity rules, quantity/multiplier logic |
| `milestones.md` | Phased, checkable implementation steps |
| `workstreams.md` | Parallelizable workstream split, contracts, ownership, waves |
| `tasks/` | One detailed, checkable task file per workstream (`tasks/README.md` indexes them + integration seams) |
| `review-remediation.md` | Decisions + fixes applied from the plan reviews (review-1 DR-1…DR-6; review-2 DR-7…DR-38; review-3 DR-39…DR-58 — traces each to a review finding) |

## Product requirements (from the request)

1. The app knows about **all public campsites** and you can **search** them.
2. Selecting a campsite lets you choose a **car camping** or **backpacking**
   list. The list is generated from the trip style **and the campsite's
   amenities**, with items **grouped by category**.
3. The user can **edit** the list (add / remove / rename / re-quantity items,
   and change an item's category/scope — see editable-field set in
   `data-model.md` and WS-7).
4. The user **selects which items they'll bring**, **names the trip**, and
   **copies a link** to invite others. *(Design decision: "selecting what
   I'll bring" == the owner's own claims. The trip creator is auto-joined as
   a participant at `createTrip`, so pre-share selections persist into the
   shared trip and appear under "who's bringing what." Resolves review G2.)*
5. Anyone with the link can **open the shared trip**, see **what is still
   needed** and **who is bringing what**, and claim items.
6. Certain items **multiply by the number of people** on the trip (sleeping
   bags, sleeping pads, etc.); others stay shared (stove, water filter).

## Scope

**In scope (v1):** campsite catalog + search, list generation, list editing,
trip naming, share-by-link, anonymous join with a display name, item claiming,
per-person/shared/per-tent quantity math, "still needed" view.

**Out of scope (v1):** user accounts/passwords, real-time websocket sync (we
use revalidation + manual/auto refresh — see `architecture.md`), maps,
reservations/availability, payments, mobile apps, i18n.

## Key decisions (deliberate defaults — each is reversible)

These are chosen so the app runs locally with **no API keys and no external
services**. Each notes how to swap later.

### D1 — Campsite data: bundled seed dataset, pluggable importer
Ship a curated `data/campsites.seed.json` (≥150 well-known US public
campgrounds across NPS / USFS / BLM / USACE / state parks, each with structured
amenities). At startup it is loaded into the local DB. An optional importer
(`scripts/import-ridb.ts`) backfills from the **Recreation Information Database
(RIDB / recreation.gov) API** when `RIDB_API_KEY` is set, and a second adapter
can pull OpenStreetMap `tourism=camp_site` via Overpass. The catalog is read
through one `CampsiteSource` interface so the source is swappable without
touching UI. *Rationale:* "all public campsites" via a live API needs a key,
network, and a lot of normalization; a seed set makes the whole product
demonstrable offline while keeping a real path to full coverage.

> **Accuracy caveat (review G5):** the seed is **best-effort** curated data,
> not authoritative. Amenity normalization from RIDB is governed by an
> explicit field-mapping table and a `bearRegions` list (deliverables in WS-3,
> `tasks/ws-3-campsite-data-search.md`); unknowns resolve to the conservative
> option (`toilets:'none'`, `bearCountry:true` inside `bearRegions`). v1 does
> not claim coverage of *every* public campsite — full coverage is the
> opt-in RIDB import path.

### D2 — Persistence: Neon (serverless Postgres) + Prisma
*(decision DR-6 — supersedes the earlier SQLite/`node:sqlite` choice)*

Trips, participants, items, and claims persist in **Neon serverless
Postgres**, accessed via **Prisma** (`@prisma/client` +
`@prisma/adapter-neon`). `prisma/schema.prisma` is the single source of
truth for schema, enums, and **migrations** (`prisma migrate` — fixes the
earlier bare-DDL migration gap). Repositories in `lib/db/*` map Prisma rows
to hand-written domain DTOs so `@prisma/client` never leaks into Server
Components / Server Actions / edge code, and the in-memory fake ↔ real
swap seam survives. *Rationale:* Neon's HTTP/WebSocket driver works on
**every** target — Node containers, **Vercel**, and Cloudflare — which
resolves the whole SQLite single-node / serverless deployment problem;
Prisma gives typed queries + real migrations. **Local dev** uses Docker
Compose Postgres (or a personal Neon branch); tests use an ephemeral
Postgres — full story in `local-dev.md`. The `StorageAdapter` interface
stays (now **async**), so the parallelization model and shared
`storageContract` suite are unchanged; Postgres handles concurrency
natively (no WAL/`busy_timeout`).

### D3 — Identity: capability links, no accounts
A trip's URL contains an unguessable id (`crypto.randomUUID()` slug, 122-bit).
The creator gets an **owner token** in a distinct httpOnly cookie named
**`bc_owner`**; every visitor (including the creator) gets a **participant
token** cookie named **`bc_participant`** — two separate names so the creator
is simultaneously owner *and* participant #1 (no collision; resolves review
B6). Both are `httpOnly`, `sameSite=lax`, `path=/trips/<id>`. Tokens are
≥128-bit, generated by `lib/ids.ts` `token()`. The owner can edit/rename;
participants claim items and revisit/edit their own claims. *Rationale:*
matches "copy a link to allow others to join" without building auth.
Possession of the link == capability to join (accepted, documented in UI).

### D4 — "Live" sharing: revalidation + auto-refresh, not websockets
Trip pages are uncached and rendered per request inside `<Suspense>`. Every
mutation is a Server Action that calls `updateTag('trip:<id>')` so the actor
sees their own write immediately. Other participants get fresh state on
navigation/refresh; the trip page also runs a light client `refresh()` poll
(~5–10 s) and a manual "Refresh" affordance for near-real-time feel.
*Rationale:* no socket infra; good enough for group packing coordination.
Upgrade path: swap the poll for SSE/websocket later without changing the data
model.

### D5 — UI: shadcn (radix-maia / olive) + lucide, already configured
Reuse the installed `components.json` setup. Add shadcn primitives as needed
(`input`, `card`, `checkbox`, `dialog`, `tabs`, `badge`, `select`,
`sonner`/toast, `skeleton`). Outdoorsy olive theme is already the base color.

### D6 — Validation & ids
Add `zod` for parsing Server Action `FormData`/JSON. Ids:
- `TripItem`/`Participant` use Prisma `@default(cuid())`.
- The public trip slug is `crypto.randomUUID()` (36 chars, 122-bit; kept
  full-length in v1 for clarity — shorter base64url is a v2 nice-to-have,
  review-2 G-slug).
- Owner/participant tokens are ≥128-bit `crypto.getRandomValues`.
- `Campsite.id` is **source-prefixed**: `seed:<slug>` (WS-3 dataset),
  `fixture:<slug>` (WS-0 in-memory fixtures), `ridb:<RecAreaID>` (RIDB
  importer), `osm:<node-id>` (optional Overpass adapter). Never bare
  (review-2 G-prefix).

(No `nanoid` — cuid covers short ids.) `crypto.randomUUID()` and token
generation run **only inside Server Actions** (request-time) — never in a
`'use cache'`/prerendered scope, which Cache Components forbids for
non-deterministic ops (WS-8.3 audit; review B5). Deps: `prisma`,
`@prisma/client`, `@prisma/adapter-neon`, `@neondatabase/serverless`, `zod`
(+ test stack) — see `milestones.md` Phase 0 / WS-0.1.

### D7 — Abuse control & retention (v1 minimum)
- **Participant cap per trip:** `joinTrip` rejects once a trip has
  `PARTICIPANT_CAP_PER_TRIP` (=50, from `lib/limits.ts` — review-3
  DR-43) participants. Typed `participant_cap_reached` error envelope
  → canonical UI toast *"This trip is full (50 people)."* (string lives
  in WS-7.6, asserted verbatim by T6.4; review-3 DR-46). Per-cookie
  rate limiting is v2.
- **Trip retention:** trips persist until the owner runs `deleteTrip`
  (hard-delete, cascades items/participants/claims). v1 has no auto-
  expiry. When the owner deletes, other participants on the trip page
  hit the 15-s poll, get a `null` `TripView`, and render the unified
  not-found page: *"This trip doesn't exist, or the owner deleted it."*
  No tombstone row, no targeted message (review-3 DR-47).
- **Cookie clearing on delete:** `deleteTrip` uses `jar.set(name, '',
  { path, maxAge: 0 })` to expire owner + participant cookies for the
  trip path. **Not `jar.delete(name)`** — that API ignores the `path`
  attribute and would leave the path-scoped cookies alive (review-3
  DR-40). Other participants' `bc_participant` cookies remain set on
  their devices (the action only sees the actor's cookies), but the
  path no longer resolves, so they're harmless.
- **Crawler indexing:** `/trips/<id>` exports `generateMetadata` with
  `robots: { index: false, follow: false }` AND the production
  `next.config.ts` sets `X-Robots-Tag: noindex, nofollow` via the
  `headers()` config for `/trips/:tripId*` (belt-and-braces against
  CDN configs that strip head metas — review-3 DR-51). Trip URLs are
  capability tokens; they must not be indexed.

### D8 — Concurrency & owner recovery (deliberate v1 punts)
- **Last-write-wins.** No `version` column on `TripItem`/`Claim`. Two
  owner devices editing the same item race-write and the later one wins.
  Claim `upsert` is composite-id, so concurrent claims by the same
  participant collapse to one row at the later qty. Documented in UI copy
  near the editor.
- **Owner cookie cleared = trip non-recoverable from this browser** in
  v1. UI copy at creation warns: *"Keep this link — it's the only way
  back as the owner."* A "download owner token" affordance is v2.

### D9 — Soft-delete on items + restore
`TripItem.removed` is a real soft-delete. Items with `removed=true` are
excluded from the visible packing list and "Still needed". Any claims on
them surface under a dedicated **"No longer needed (claimed)"** section.
`restoreItem` (owner-only) flips `removed=false`; the item rejoins the
list with its prior claims intact. `deleteTrip`, by contrast, is a
hard-delete.

## Open questions for the user (do not block planning)

1. **Coverage**: Is a curated US seed dataset acceptable for v1 (D1), or is a
   live nationwide RIDB import required up front? Affects Phase 2 size.
2. **Geography**: US public lands only, or also state parks / international
   (OSM)? The seed is US-first; the importer can extend.
3. **Identity**: Is anonymous "name + link" (D3) sufficient, or are real
   accounts wanted? Accounts are a sizable add.
4. **Liveness**: Is poll/refresh sync (D4) acceptable for v1, or is true
   real-time required?
5. **Hosting**: ~~Resolved by DR-6~~ — Neon Postgres works on Node, Vercel,
   and Cloudflare; no single-node constraint. See `local-dev.md`.

Defaults above let implementation start immediately; answers only narrow
choices already accounted for.
