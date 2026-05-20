# Data Model

**Neon (serverless Postgres) + Prisma** (decision DR-6). `prisma/schema.prisma`
is the single source of truth for tables, enums, and migrations. The app
never imports `@prisma/client` outside `lib/db/*`: repositories map Prisma
rows to hand-written **domain DTOs** (`lib/db/types.ts`) so Server
Components, Server Actions, and any edge/client code stay Prisma-free and the
parallelization seam (in-memory fake ↔ Prisma impl) holds.

Connection: `@prisma/client` with `@prisma/adapter-neon`
(`@neondatabase/serverless` driver) — works on Node, Vercel, and Cloudflare.
See `local-dev.md` for envs, migrations, and the local Docker story.

## Amenities (input to list generation)

A campsite's amenities drive `packing-engine.md`. Stored as a Postgres
`Json` column, but **validated and typed in the app** via
`lib/validation/domain.ts` (zod) → this DTO (Prisma's generated `Json` type
is opaque; the zod schema is the contract):

```ts
type Amenities = {
  potableWater: boolean
  toilets: 'none' | 'vault' | 'flush'
  showers: boolean
  electricity: boolean
  fireRings: boolean
  firewoodAvailable: boolean
  picnicTables: boolean
  bearLockers: boolean
  bearCountry: boolean
  trashService: boolean
  dumpStation: boolean
  cellService: 'none' | 'weak' | 'good'
  potableWaterNote?: string
  accessLevel: 'drive-in' | 'walk-in' | 'backcountry'
}
```

Source adapters map raw fields into `Amenities` via the explicit
`lib/campsites/amenity-map.ts` table + `bearRegions` list (WS-3); unknowns
resolve conservatively (`toilets:'none'`, `bearCountry:true` iff in
`bearRegions`, else `false`). Seed is best-effort, not authoritative
(README D1).

## Prisma schema (`prisma/schema.prisma`, WS-0-owned contract)

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pooled (Neon) — app queries
  directUrl = env("DIRECT_URL")     // unpooled — prisma migrate
}

enum TripStyle    { car backpacking }
enum ItemScope    { per_person shared per_tent }
enum ItemSource   { template amenity custom }
enum ItemCategory { Shelter Sleep Kitchen Water Food Clothing Navigation
                    Health_Safety Hygiene Tools_Repair Personal_Misc }

model Campsite {
  id          String   @id                       // source-prefixed, e.g. "ridb:12345"
  name        String
  agency      String?
  state       String?  @db.Char(2)
  lat         Float?
  lng         Float?
  description String?
  amenities   Json                                // validated as Amenities
  activities  String[]
  source      String                              // 'seed' | 'ridb' | 'osm'
  updatedAt   DateTime @updatedAt
  @@index([state])
  @@index([agency])
  // pg_trgm GIN indexes on name/description added via migration SQL
}

model Trip {
  id               String     @id                 // crypto.randomUUID() slug
  name             String
  campsiteId       String
  campsiteSnapshot Json                            // name/amenities frozen at creation
  style            TripStyle
  ownerToken       String                          // ≥128-bit; matches bc_owner cookie
  createdAt        DateTime   @default(now())
  items            TripItem[]
  participants     Participant[]
  claims           Claim[]
}

model TripItem {
  id        String       @id @default(cuid())
  tripId    String
  trip      Trip         @relation(fields: [tripId], references: [id], onDelete: Cascade)
  category  ItemCategory
  name      String
  scope     ItemScope
  baseQty   Int          @default(1)
  unit      String?
  note      String?
  source    ItemSource
  sortOrder Int
  removed   Boolean      @default(false)           // soft delete
  claims    Claim[]
  @@index([tripId])
}

model Participant {
  id       String   @id @default(cuid())
  tripId   String
  trip     Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
  name     String
  token    String                                  // ≥128-bit; matches bc_participant cookie
  isOwner  Boolean  @default(false)                // creator row: isOwner=true AND is a participant
  joinedAt DateTime @default(now())
  claims   Claim[]
  @@index([tripId])
}

model Claim {
  tripId        String
  trip          Trip        @relation(fields: [tripId], references: [id], onDelete: Cascade)
  itemId        String
  item          TripItem    @relation(fields: [itemId], references: [id], onDelete: Cascade)
  participantId String
  participant   Participant @relation(fields: [participantId], references: [id], onDelete: Cascade)
  qty           Int         @default(1)
  updatedAt     DateTime    @updatedAt
  @@id([itemId, participantId])                    // one claim row per person per item
  @@index([tripId])
}
```

Notes:
- `campsiteSnapshot` freezes amenities used to generate the list, so later
  catalog re-imports don't change an existing trip.
- `@@id([itemId, participantId])` makes claim an `upsert`; delete = unclaim.
- `removed` soft-delete keeps historical claims valid and supports undo.
- **Cascade deletes** handled by Prisma relations (no manual FK SQL).
- `crypto.randomUUID()` (trip slug) and token generation run **only in
  Server Actions** (request-time) — never a `'use cache'`/prerendered scope
  (Cache Components; review B5, WS-8.3 audit).
- **Editable item fields (owner only):** `name`, `category`, `scope`,
  `baseQty`, `unit`, `note`. `id/tripId/source/removed` not user-editable;
  `scope`/`baseQty` edits recompute `requiredQty` on the next render
  (req 3, review G1).
- **Solo-creator math:** creator is a `Participant` row (`isOwner=true`), so
  `participantCount ≥ 1`; solo `per_person` `requiredQty` is 1 (review B6).

## Search (replaces SQLite FTS5)

A migration enables the `pg_trgm` extension and adds **GIN trigram indexes**
on `Campsite.name` / `description`. `search()` filters with
`contains` + `mode: 'insensitive'` (Prisma) over name/description plus
equality filters on `state`/`agency`/amenities-JSON; ranking via
`prisma.$queryRaw` `similarity()` when needed. Upgrade path: a generated
`tsvector` column + `to_tsvector` query, same repository signature.

## TypeScript domain DTOs (`lib/db/types.ts`, Prisma-free)

```ts
export type TripStyle = 'car' | 'backpacking'
export type ItemScope = 'per_person' | 'shared' | 'per_tent'
export type ItemCategory =
  | 'Shelter' | 'Sleep' | 'Kitchen' | 'Water' | 'Food'
  | 'Clothing' | 'Navigation' | 'Health & Safety'
  | 'Hygiene' | 'Tools & Repair' | 'Personal & Misc'

export interface Campsite {
  id: string; name: string; agency?: string; state?: string
  lat?: number; lng?: number; description?: string
  amenities: Amenities; activities: string[]; source: string
}
export interface TripItem {
  id: string; tripId: string; category: ItemCategory; name: string
  scope: ItemScope; baseQty: number; unit?: string; note?: string
  source: 'template' | 'amenity' | 'custom'; sortOrder: number
}
export interface Participant {
  id: string; tripId: string; name: string; isOwner: boolean; joinedAt: number
}
export interface Claim { itemId: string; participantId: string; qty: number }
export interface Trip {
  id: string; name: string; campsiteId: string
  campsite: Pick<Campsite, 'name' | 'amenities' | 'state' | 'agency'>
  style: TripStyle; createdAt: number
}
export interface TripView {
  trip: Trip
  participants: Participant[]
  items: Array<TripItem & {
    needed: number; claimed: number; shortfall: number
    claims: Array<{ participant: Participant; qty: number }>
  }>
}
```

Enum mapping note: Prisma enum members can't contain spaces/`&`, so DB uses
`Health_Safety`/`Tools_Repair`/`Personal_Misc`; repositories map to/from the
display DTO values (`'Health & Safety'`, etc.). The DTO `ItemCategory` is the
contract everything else uses.

## Repository surface (`lib/db/*`) — async

The `StorageAdapter` interface (WS-0-owned) is **fully async** (every method
returns a `Promise`); the in-memory fake and the Prisma/Neon impl both
satisfy it. Prisma calls are async-native; the fake wraps values in
`Promise.resolve`.

```
campsites:    upsertMany(Campsite[]) ; search(SearchArgs) ; getById(id)
trips:        create(input) ; getById(id) ; rename(id, name)
items:        listByTrip(tripId) ; add(item) ; update(id, patch) ; softRemove(id)
              ; reorder(tripId, itemId, { beforeItemId?: string; newIndex?: number })
participants: listByTrip(tripId) ; add(tripId, name, isOwner) ; byToken(tripId, token)
              ; count(tripId)
claims:       listByTrip(tripId) ; upsert(itemId, participantId, qty) ; remove(itemId, participantId)
view:         buildTripView(tripId) -> TripView | null
```

`items.update` `patch` is restricted to
`Partial<Pick<TripItem,'name'|'category'|'scope'|'baseQty'|'unit'|'note'>>`.
`buildTripView` returns `null` for an unknown `tripId` (trip page →
`notFound()`, review G8). Multi-write operations that must be atomic
(`createTrip` = trip + items + owner participant) use a single
`prisma.$transaction([...])`; the in-memory fake performs them
synchronously. `SearchArgs = { q?, state?, agency?, amenities?: (keyof
Amenities)[], page?, pageSize? }`. `search()` is wrapped by the `'use cache'`
helper in `lib/campsites/search.ts` (`cacheTag('campsites')`,
`cacheLife('hours')`; detail uses the same tag with `cacheLife('days')`);
the importer/reseed pings the dev `revalidate-campsites` Route Handler
(review I-A).
