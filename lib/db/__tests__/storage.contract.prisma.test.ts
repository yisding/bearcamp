// T2.12 — `storageContract(prismaFactory)` runs the shared WS-0 suite with
//   ZERO suite edits. The same suite the in-memory fake passes
//   (storage.contract.test.ts) must pass against Prisma/Neon.
//
// We piggy-back on WS-0's `storageContract` factory in
// `lib/db/__tests__/storage.contract.ts`. Per `vitest.config.ts`, that file
// is excluded from collection — it exposes a function that callers invoke
// once. The suite the function defines IS the contract; we wire it to the
// Prisma adapter via `makePrismaStorage()`.

import { afterEach, beforeAll, beforeEach, describe } from 'vitest'
import { skipUnlessDocker } from './_helpers/docker'
import { storageContract } from './storage.contract'
import {
  getPostgres,
  makePrismaStorage,
  truncateAll,
} from './_helpers/postgres'

// Wrap the contract in a skipIf-Docker guard. Because `storageContract`
// internally calls `describe(...)`, we register a top-level container that
// can be skipped on docker-less CI. (vitest allows nested describes; hooks
// inherit.)
describe.skipIf(skipUnlessDocker())(
  'T2.12 storageContract against Prisma/Neon (real Postgres)',
  () => {
    beforeAll(async () => {
      await getPostgres()
    }, 120_000)

    // Wipe per test — each storageContract case creates its own trip etc.
    beforeEach(async () => {
      await truncateAll()
    })

    afterEach(async () => {
      await truncateAll()
    })

    // T2.12 is "ZERO suite edits". We invoke the shared factory with a
    // Prisma-backed adapter; if a case fails, WS-0 contract drift is the
    // signal, not anything in this file.
    storageContract('prisma', () => makePrismaStorage())
  },
)
