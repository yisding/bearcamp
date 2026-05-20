// Invokes the shared actions contract suite against fake deps wired to
// memory storage + stub generate. WS-7 will swap the deps factory for the
// real Server Actions (zero suite changes).

import { actionsContract } from './actions.contract'
import type { ActionDeps } from './actions.contract'
import { createMemoryStorage } from '../../db/storage.memory'
import { generate } from '../../packing'
import { ok, err } from '../result'
import { token } from '../../ids'

// Fake Server Action deps: minimal implementations that exercise the
// StorageAdapter + stub generate, with the same Result<T> envelope WS-7
// will return. Identity (owner/participant cookies) is simulated by
// remembering the most-recent owner+participant tokens in a per-deps
// scope.
function makeFakeDeps(): ActionDeps {
  const storage = createMemoryStorage()
  // Track participant identity per trip (creator is the most recent).
  const lastParticipant = new Map<string, string>() // tripId -> participantId

  return {
    createTrip: async (input) => {
      try {
        const items = generate(input.style, {
          potableWater: true,
          toilets: 'flush',
          showers: true,
          electricity: true,
          fireRings: true,
          firewoodAvailable: true,
          picnicTables: true,
          bearLockers: false,
          bearCountry: false,
          trashService: true,
          dumpStation: false,
          cellService: 'good',
          accessLevel: 'drive-in',
        })
        const created = await storage.trips.create({
          name: 'Untitled trip',
          campsiteId: input.campsiteId,
          campsite: {
            name: 'Stub Campsite',
            amenities: {
              potableWater: true,
              toilets: 'flush',
              showers: true,
              electricity: true,
              fireRings: true,
              firewoodAvailable: true,
              picnicTables: true,
              bearLockers: false,
              bearCountry: false,
              trashService: true,
              dumpStation: false,
              cellService: 'good',
              accessLevel: 'drive-in',
            },
          },
          style: input.style,
          ownerName: input.ownerName ?? 'Owner',
          ownerToken: token(),
          ownerParticipantToken: token(),
          items: items.map((i) => ({
            category: i.category,
            name: i.name,
            scope: i.scope,
            baseQty: i.baseQty,
            unit: i.unit,
            note: i.note,
            source: i.source,
          })),
        })
        lastParticipant.set(created.trip.id, created.owner.id)
        return ok({ trip: created.trip, owner: created.owner })
      } catch (e) {
        return err('internal', (e as Error).message)
      }
    },
    renameTrip: async (input) => {
      try {
        const t = await storage.trips.rename(input.tripId, input.name)
        return ok(t)
      } catch (e) {
        return err('not_found', (e as Error).message)
      }
    },
    updateTripSettings: async (input) => {
      try {
        const t = await storage.trips.updateSettings(input.tripId, input.patch)
        return ok(t)
      } catch (e) {
        return err('validation_failed', (e as Error).message)
      }
    },
    deleteTrip: async (input) => {
      const t = await storage.trips.getById(input.tripId)
      if (!t) return err('not_found', `trip not found: ${input.tripId}`)
      await storage.trips.delete(input.tripId)
      return ok({ tripId: input.tripId })
    },
    addItem: async (input) => {
      try {
        const item = await storage.items.add({
          tripId: input.tripId,
          category: input.category,
          name: input.name,
          scope: input.scope,
          baseQty: input.baseQty,
          source: 'custom',
        })
        return ok(item)
      } catch (e) {
        return err('internal', (e as Error).message)
      }
    },
    updateItem: async (input) => {
      try {
        const item = await storage.items.update(input.itemId, input.patch)
        return ok(item)
      } catch (e) {
        return err('not_found', (e as Error).message)
      }
    },
    removeItem: async (input) => {
      try {
        const item = await storage.items.softRemove(input.itemId)
        return ok(item)
      } catch (e) {
        return err('not_found', (e as Error).message)
      }
    },
    restoreItem: async (input) => {
      try {
        const item = await storage.items.restore(input.itemId)
        return ok(item)
      } catch (e) {
        return err('not_found', (e as Error).message)
      }
    },
    reorderItem: async (input) => {
      try {
        await storage.items.reorder(input.tripId, input.itemId, {
          beforeItemId: input.beforeItemId,
          newIndex: input.newIndex,
        })
        return ok({ tripId: input.tripId, itemId: input.itemId })
      } catch (e) {
        return err('not_found', (e as Error).message)
      }
    },
    joinTrip: async (input) => {
      try {
        const p = await storage.participants.add(
          input.tripId,
          input.name,
          false,
          token(),
        )
        lastParticipant.set(input.tripId, p.id)
        return ok(p)
      } catch (e) {
        const msg = (e as Error).message
        if (msg === 'participant_cap_reached') {
          return err('participant_cap_reached', msg)
        }
        return err('internal', msg)
      }
    },
    claimItem: async (input) => {
      const pid = lastParticipant.get(input.tripId)
      if (!pid) return err('unauthorized', 'no participant cookie')
      try {
        const c = await storage.claims.upsert(input.itemId, pid, input.qty)
        return ok(c)
      } catch (e) {
        return err('not_found', (e as Error).message)
      }
    },
    unclaimItem: async (input) => {
      const pid = lastParticipant.get(input.tripId)
      if (!pid) return err('unauthorized', 'no participant cookie')
      await storage.claims.remove(input.itemId, pid)
      return ok({ itemId: input.itemId })
    },
  }
}

actionsContract('memory+stub', () => makeFakeDeps())
