// Invokes the shared storage contract suite against the in-memory adapter
// (WS-0.15). WS-2 ships its own .test.ts that imports the same contract
// and pipes a Prisma factory.

import { storageContract } from './storage.contract'
import { createMemoryStorage } from '../storage.memory'

storageContract('memory', () => createMemoryStorage())
