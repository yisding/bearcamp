// Prisma 7.x moved datasource URLs out of schema.prisma (DR-32). Connection
// strings live here for Migrate / introspection; the runtime PrismaClient
// receives an adapter (@prisma/adapter-neon) in WS-2.
//
// `validate` doesn't need real URLs, so we tolerate missing env vars at
// load time (the `env` helper from @prisma/config throws). `migrate` /
// `db push` will of course need `DATABASE_URL` set.

import { defineConfig } from 'prisma/config'

const PLACEHOLDER = 'postgresql://user:password@localhost:5432/bearcamp'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? PLACEHOLDER,
    shadowDatabaseUrl: process.env.DIRECT_URL ?? PLACEHOLDER,
  },
})
