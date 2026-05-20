// In-memory StorageAdapter — WS-0.5.
// Implements the full StorageAdapter surface with Map-backed state. Async
// everywhere (Promise.resolve wrappers) so the Prisma/Neon impl (WS-2) is a
// drop-in swap.
//
// Note (T0.13 reconciliation): `createMemoryStorage()` returns a module-level
// singleton so that tests sharing a single backend (identity.stub.test) see
// data written through a freshly-created adapter. Each test still works
// because trips/items/participants are addressed by unique ids; per-test
// state isolation is provided by `_resetMemoryStorage()` (used internally;
// not part of the public StorageAdapter contract).

import type {
  AddItemInput,
  ClaimsRepo,
  CreateTripInput,
  CreateTripResult,
  ItemsRepo,
  ParticipantsRepo,
  ReorderArgs,
  SearchArgs,
  SearchResult,
  StorageAdapter,
  TripItemPatch,
  TripsRepo,
  ViewRepo,
  CampsitesRepo,
} from './storage'
import type {
  Campsite,
  Claim,
  Participant,
  RemovedItemWithClaims,
  Trip,
  TripItem,
  TripView,
  TripViewItem,
} from './types'
import { requiredQty, TENT_CAPACITY } from '../packing/quantities'
import {
  PARTICIPANT_CAP_PER_TRIP,
  SEARCH_PAGE_SIZE_DEFAULT,
  SEARCH_PAGE_SIZE_MAX,
  TENT_CAPACITY_MAX,
  TENT_CAPACITY_MIN,
} from '../limits'

interface State {
  campsites: Map<string, Campsite>
  trips: Map<string, Trip>
  // Owner token → trip id (for participants byOwnerToken lookups).
  ownerTokenIndex: Map<string, string>
  items: Map<string, TripItem>
  participants: Map<string, Participant>
  // tripId+token → participant id.
  participantTokenIndex: Map<string, string>
  // composite "itemId|participantId" → claim row.
  claims: Map<string, Claim & { tripId: string }>
  // monotonic counter for ids
  seq: number
}

function freshState(): State {
  return {
    campsites: new Map(),
    trips: new Map(),
    ownerTokenIndex: new Map(),
    items: new Map(),
    participants: new Map(),
    participantTokenIndex: new Map(),
    claims: new Map(),
    seq: 0,
  }
}

function nextId(state: State, kind: string): string {
  state.seq += 1
  return `${kind}_${state.seq.toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function clampTentCapacity(n: number | undefined): number {
  if (n === undefined) return TENT_CAPACITY
  if (!Number.isInteger(n)) {
    throw new Error(`tentCapacity must be an integer, got ${n}`)
  }
  if (n < TENT_CAPACITY_MIN || n > TENT_CAPACITY_MAX) {
    throw new Error(
      `tentCapacity out of bounds [${TENT_CAPACITY_MIN}, ${TENT_CAPACITY_MAX}]`,
    )
  }
  return n
}

function buildCampsites(state: State): CampsitesRepo {
  return {
    upsertMany: async (rows: Campsite[]): Promise<void> => {
      for (const c of rows) state.campsites.set(c.id, c)
    },
    getById: async (id: string): Promise<Campsite | null> => {
      return state.campsites.get(id) ?? null
    },
    search: async (args: SearchArgs): Promise<SearchResult> => {
      const page = Math.max(1, args.page ?? 1)
      const pageSize = Math.min(
        Math.max(1, args.pageSize ?? SEARCH_PAGE_SIZE_DEFAULT),
        SEARCH_PAGE_SIZE_MAX,
      )
      const q = args.q?.toLowerCase()
      let list = [...state.campsites.values()]
      if (q) {
        list = list.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            (c.description?.toLowerCase().includes(q) ?? false),
        )
      }
      if (args.state) list = list.filter((c) => c.state === args.state)
      if (args.agency) list = list.filter((c) => c.agency === args.agency)
      if (args.amenities && args.amenities.length > 0) {
        list = list.filter((c) =>
          args.amenities!.every((k) => Boolean(c.amenities[k])),
        )
      }
      const total = list.length
      const start = (page - 1) * pageSize
      return {
        campsites: list.slice(start, start + pageSize),
        total,
        page,
        pageSize,
      }
    },
  }
}

function buildTrips(state: State): TripsRepo {
  return {
    create: async (input: CreateTripInput): Promise<CreateTripResult> => {
      const tripId = nextId(state, 'trip')
      const trip: Trip = {
        id: tripId,
        name: input.name,
        campsiteId: input.campsiteId,
        campsite: input.campsite,
        style: input.style,
        tentCapacity: clampTentCapacity(input.tentCapacity),
        createdAt: Date.now(),
      }
      state.trips.set(tripId, trip)
      state.ownerTokenIndex.set(input.ownerToken, tripId)

      // Owner participant (creator is also a participant, DR-4).
      const ownerId = nextId(state, 'p')
      const owner: Participant = {
        id: ownerId,
        tripId,
        name: input.ownerName,
        isOwner: true,
        joinedAt: Date.now(),
      }
      state.participants.set(ownerId, owner)
      state.participantTokenIndex.set(
        `${tripId}|${input.ownerParticipantToken}`,
        ownerId,
      )

      // Persist items with stable ids + sortOrder.
      input.items.forEach((seed, idx) => {
        const id = nextId(state, 'i')
        const item: TripItem = {
          id,
          tripId,
          category: seed.category,
          name: seed.name,
          scope: seed.scope,
          baseQty: seed.baseQty ?? 1,
          unit: seed.unit,
          note: seed.note,
          source: seed.source,
          sortOrder: seed.sortOrder ?? idx,
          removed: false,
        }
        state.items.set(id, item)
      })

      return { trip, owner }
    },
    getById: async (id: string): Promise<Trip | null> => {
      return state.trips.get(id) ?? null
    },
    rename: async (id: string, name: string): Promise<Trip> => {
      const t = state.trips.get(id)
      if (!t) throw new Error(`trip not found: ${id}`)
      const updated = { ...t, name }
      state.trips.set(id, updated)
      return updated
    },
    updateSettings: async (
      id: string,
      patch: { tentCapacity?: number },
    ): Promise<Trip> => {
      const t = state.trips.get(id)
      if (!t) throw new Error(`trip not found: ${id}`)
      const next: Trip = { ...t }
      if (patch.tentCapacity !== undefined) {
        next.tentCapacity = clampTentCapacity(patch.tentCapacity)
      }
      state.trips.set(id, next)
      return next
    },
    delete: async (id: string): Promise<void> => {
      // Cascade: items, participants, claims, ownerTokenIndex,
      // participantTokenIndex entries belonging to this trip.
      const t = state.trips.get(id)
      if (!t) return
      state.trips.delete(id)
      for (const [tok, tid] of state.ownerTokenIndex) {
        if (tid === id) state.ownerTokenIndex.delete(tok)
      }
      for (const [iid, item] of state.items) {
        if (item.tripId === id) state.items.delete(iid)
      }
      for (const [pid, p] of state.participants) {
        if (p.tripId === id) state.participants.delete(pid)
      }
      for (const k of state.participantTokenIndex.keys()) {
        if (k.startsWith(`${id}|`)) state.participantTokenIndex.delete(k)
      }
      for (const [k, c] of state.claims) {
        if (c.tripId === id) state.claims.delete(k)
      }
    },
    byOwnerToken: async (
      id: string,
      tokenStr: string,
    ): Promise<Trip | null> => {
      const tripId = state.ownerTokenIndex.get(tokenStr)
      if (tripId !== id) return null
      return state.trips.get(id) ?? null
    },
  }
}

function buildItems(state: State): ItemsRepo {
  return {
    listByTrip: async (tripId: string): Promise<TripItem[]> => {
      const out: TripItem[] = []
      for (const item of state.items.values()) {
        if (item.tripId === tripId) out.push(item)
      }
      // Sort by sortOrder for determinism.
      return out.sort((a, b) => a.sortOrder - b.sortOrder)
    },
    add: async (input: AddItemInput): Promise<TripItem> => {
      const id = nextId(state, 'i')
      // Compute sortOrder = max+1 if omitted.
      let sortOrder = input.sortOrder
      if (sortOrder === undefined) {
        let max = -1
        for (const it of state.items.values()) {
          if (it.tripId === input.tripId && it.sortOrder > max) max = it.sortOrder
        }
        sortOrder = max + 1
      }
      const item: TripItem = {
        id,
        tripId: input.tripId,
        category: input.category,
        name: input.name,
        scope: input.scope,
        baseQty: input.baseQty ?? 1,
        unit: input.unit,
        note: input.note,
        source: input.source,
        sortOrder,
        removed: false,
      }
      state.items.set(id, item)
      return item
    },
    update: async (id: string, patch: TripItemPatch): Promise<TripItem> => {
      const it = state.items.get(id)
      if (!it) throw new Error(`item not found: ${id}`)
      // Restricted patch shape — only name|category|scope|baseQty|unit|note.
      const next: TripItem = {
        ...it,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.scope !== undefined ? { scope: patch.scope } : {}),
        ...(patch.baseQty !== undefined ? { baseQty: patch.baseQty } : {}),
        ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
      }
      state.items.set(id, next)
      return next
    },
    softRemove: async (id: string): Promise<TripItem> => {
      const it = state.items.get(id)
      if (!it) throw new Error(`item not found: ${id}`)
      const next = { ...it, removed: true }
      state.items.set(id, next)
      return next
    },
    restore: async (id: string): Promise<TripItem> => {
      const it = state.items.get(id)
      if (!it) throw new Error(`item not found: ${id}`)
      const next = { ...it, removed: false }
      state.items.set(id, next)
      return next
    },
    reorder: async (
      tripId: string,
      itemId: string,
      args: ReorderArgs,
    ): Promise<void> => {
      const target = state.items.get(itemId)
      if (!target || target.tripId !== tripId) {
        throw new Error(`item not found for reorder: ${itemId}`)
      }
      const siblings = [...state.items.values()]
        .filter((i) => i.tripId === tripId && i.id !== itemId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
      let insertAt: number
      if (args.beforeItemId !== undefined) {
        const idx = siblings.findIndex((s) => s.id === args.beforeItemId)
        insertAt = idx === -1 ? siblings.length : idx
      } else if (args.newIndex !== undefined) {
        insertAt = Math.max(0, Math.min(args.newIndex, siblings.length))
      } else {
        insertAt = siblings.length
      }
      siblings.splice(insertAt, 0, target)
      siblings.forEach((s, idx) => {
        state.items.set(s.id, { ...s, sortOrder: idx })
      })
    },
  }
}

function buildParticipants(state: State): ParticipantsRepo {
  return {
    listByTrip: async (tripId: string): Promise<Participant[]> => {
      const out: Participant[] = []
      for (const p of state.participants.values()) {
        if (p.tripId === tripId) out.push(p)
      }
      return out.sort((a, b) => a.joinedAt - b.joinedAt)
    },
    add: async (
      tripId: string,
      name: string,
      isOwner: boolean,
      tokenStr: string,
    ): Promise<Participant> => {
      // Cap check (DR-43): reject at or above the cap.
      let count = 0
      for (const p of state.participants.values()) {
        if (p.tripId === tripId) count += 1
      }
      if (count >= PARTICIPANT_CAP_PER_TRIP) {
        throw new Error('participant_cap_reached')
      }
      const id = nextId(state, 'p')
      const p: Participant = {
        id,
        tripId,
        name,
        isOwner,
        joinedAt: Date.now(),
      }
      state.participants.set(id, p)
      state.participantTokenIndex.set(`${tripId}|${tokenStr}`, id)
      return p
    },
    byToken: async (
      tripId: string,
      tokenStr: string,
    ): Promise<Participant | null> => {
      const id = state.participantTokenIndex.get(`${tripId}|${tokenStr}`)
      if (!id) return null
      return state.participants.get(id) ?? null
    },
    count: async (tripId: string): Promise<number> => {
      let n = 0
      for (const p of state.participants.values()) {
        if (p.tripId === tripId) n += 1
      }
      return n
    },
  }
}

function buildClaims(state: State): ClaimsRepo {
  return {
    listByTrip: async (tripId: string): Promise<Claim[]> => {
      const out: Claim[] = []
      for (const c of state.claims.values()) {
        if (c.tripId === tripId) {
          out.push({ itemId: c.itemId, participantId: c.participantId, qty: c.qty })
        }
      }
      return out
    },
    upsert: async (
      itemId: string,
      participantId: string,
      qty: number,
    ): Promise<Claim> => {
      const item = state.items.get(itemId)
      if (!item) throw new Error(`item not found: ${itemId}`)
      const key = `${itemId}|${participantId}`
      const row = { itemId, participantId, qty, tripId: item.tripId }
      state.claims.set(key, row)
      return { itemId, participantId, qty }
    },
    remove: async (itemId: string, participantId: string): Promise<void> => {
      state.claims.delete(`${itemId}|${participantId}`)
    },
  }
}

function buildView(state: State): ViewRepo {
  return {
    buildTripView: async (tripId: string): Promise<TripView | null> => {
      const trip = state.trips.get(tripId)
      if (!trip) return null

      const participants: Participant[] = []
      for (const p of state.participants.values()) {
        if (p.tripId === tripId) participants.push(p)
      }
      participants.sort((a, b) => a.joinedAt - b.joinedAt)
      const pById = new Map(participants.map((p) => [p.id, p]))

      const tripItems: TripItem[] = []
      for (const it of state.items.values()) {
        if (it.tripId === tripId) tripItems.push(it)
      }
      tripItems.sort((a, b) => a.sortOrder - b.sortOrder)

      // Bucket claims by itemId.
      const claimsByItem = new Map<
        string,
        Array<{ participant: Participant; qty: number }>
      >()
      for (const c of state.claims.values()) {
        if (c.tripId !== tripId) continue
        const participant = pById.get(c.participantId)
        if (!participant) continue
        if (!claimsByItem.has(c.itemId)) claimsByItem.set(c.itemId, [])
        claimsByItem.get(c.itemId)!.push({ participant, qty: c.qty })
      }

      const visibleItems: TripViewItem[] = []
      const removedItemsWithClaims: RemovedItemWithClaims[] = []
      const n = participants.length

      for (const it of tripItems) {
        const claims = claimsByItem.get(it.id) ?? []
        if (it.removed) {
          if (claims.length > 0) {
            removedItemsWithClaims.push({ ...it, claims })
          }
          continue
        }
        const needed = requiredQty(it, n, trip.tentCapacity)
        const claimed = claims.reduce((sum, c) => sum + c.qty, 0)
        const shortfall = Math.max(0, needed - claimed)
        visibleItems.push({ ...it, needed, claimed, shortfall, claims })
      }

      return {
        trip,
        participants,
        items: visibleItems,
        removedItemsWithClaims,
      }
    },
  }
}

function buildAdapter(state: State): StorageAdapter {
  return {
    campsites: buildCampsites(state),
    trips: buildTrips(state),
    items: buildItems(state),
    participants: buildParticipants(state),
    claims: buildClaims(state),
    view: buildView(state),
  }
}

// Module-level singleton state. createMemoryStorage() always returns an
// adapter over this state; tests addressing data by unique ids remain
// isolated, and the identity.stub test sees data written via any adapter
// instance.
const SINGLETON_STATE: State = freshState()
const SINGLETON_ADAPTER: StorageAdapter = buildAdapter(SINGLETON_STATE)

export function createMemoryStorage(): StorageAdapter {
  return SINGLETON_ADAPTER
}

export const memoryStorage = SINGLETON_ADAPTER

// Test-only helper to wipe state between tests when needed.
export function _resetMemoryStorage(): void {
  const fresh = freshState()
  Object.assign(SINGLETON_STATE, fresh)
}
