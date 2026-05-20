// CampsiteSource — WS-0.6. The catalog read-surface; impl is fixtures (WS-0)
// or seed/RIDB/OSM (WS-3). UI talks to this, never to a storage adapter
// directly, so source swap is one services.ts line.

import type { Campsite } from '../db/types'
import type { SearchArgs, SearchResult } from '../db/storage'

export interface CampsiteSource {
  search(args: SearchArgs): Promise<SearchResult>
  getById(id: string): Promise<Campsite | null>
  all(): Promise<Campsite[]>
}
