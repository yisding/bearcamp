// Prisma 7.x moved datasource URLs out of schema.prisma (DR-32). Connection
// strings live here for Migrate / introspection; the runtime PrismaClient
// receives an adapter (@prisma/adapter-neon / @prisma/adapter-pg, see
// lib/db/prisma.ts).
//
// `migrations.seed` wires `pnpm prisma db seed` to our TS entrypoint
// (WS-2.11). `directUrl` (DIRECT_URL) is used by `prisma migrate` only;
// pooled `DATABASE_URL` is used by the app for queries.
//
// `validate` doesn't need real URLs, so we tolerate missing env vars at
// load time. `migrate` / `db push` will of course need `DATABASE_URL` set.
//
// No `shadowDatabaseUrl`: for local Postgres, Prisma Migrate auto-provisions
// a temporary shadow database on the same server. Pointing it at DIRECT_URL
// would reuse the working DB (DIRECT_URL == DATABASE_URL in .env.example),
// and `prisma migrate dev` drops/recreates the shadow DB — that would
// corrupt the working data. Omit it and let Prisma manage the shadow DB.

import { defineConfig } from 'prisma/config'

const PLACEHOLDER = 'postgresql://user:password@localhost:5432/bearcamp'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? PLACEHOLDER,
  },
})
