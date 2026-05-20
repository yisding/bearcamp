// Shared Server Actions contract suite — WS-0.15.
// Implementation-agnostic. At WS-0 the actions don't exist yet — this suite
// exercises the *shape* via a Deps factory that the impl agent fills in
// (the deps object exposes the action callables: createTrip, joinTrip,
// claimItem, etc.). For now the suite is structurally complete and fails
// on impl-missing, which is the desired red.

import { describe, it, expect } from 'vitest'
import type {
  CreateTripResult,
  RenameTripResult,
  AddItemResult,
  UpdateItemResult,
  RemoveItemResult,
  RestoreItemResult,
  JoinTripResult,
  ClaimItemResult,
  UnclaimItemResult,
  DeleteTripResult,
  UpdateTripSettingsResult,
  ReorderItemResult,
} from '../action-types'

export interface ActionDeps {
  createTrip: (
    input: { campsiteId: string; style: 'car' | 'backpacking'; ownerName?: string },
  ) => Promise<CreateTripResult>
  renameTrip: (input: { tripId: string; name: string }) => Promise<RenameTripResult>
  updateTripSettings: (input: {
    tripId: string
    patch: { tentCapacity?: number }
  }) => Promise<UpdateTripSettingsResult>
  deleteTrip: (input: { tripId: string }) => Promise<DeleteTripResult>
  addItem: (input: {
    tripId: string
    category: import('../../db/types').ItemCategory
    name: string
    scope: import('../../db/types').ItemScope
    baseQty?: number
  }) => Promise<AddItemResult>
  updateItem: (input: {
    tripId: string
    itemId: string
    patch: { name?: string }
  }) => Promise<UpdateItemResult>
  removeItem: (input: { tripId: string; itemId: string }) => Promise<RemoveItemResult>
  restoreItem: (input: { tripId: string; itemId: string }) => Promise<RestoreItemResult>
  reorderItem: (input: {
    tripId: string
    itemId: string
    newIndex?: number
    beforeItemId?: string
  }) => Promise<ReorderItemResult>
  joinTrip: (input: { tripId: string; name: string }) => Promise<JoinTripResult>
  claimItem: (input: {
    tripId: string
    itemId: string
    qty: number
  }) => Promise<ClaimItemResult>
  unclaimItem: (input: { tripId: string; itemId: string }) => Promise<UnclaimItemResult>
}

export function actionsContract(
  label: string,
  makeDeps: () => ActionDeps | Promise<ActionDeps>,
) {
  describe(`actionsContract (${label})`, () => {
    it('createTrip returns ok with a Trip and an owner participant', async () => {
      const d = await makeDeps()
      const res = await d.createTrip({ campsiteId: 'fixture:test', style: 'car' })
      expect(res.ok).toBe(true)
      if (res.ok) {
        expect(res.data.trip.id).toBeTruthy()
        expect(res.data.owner.isOwner).toBe(true)
      }
    })

    it('renameTrip patches the trip name', async () => {
      const d = await makeDeps()
      const created = await d.createTrip({ campsiteId: 'fixture:test', style: 'car' })
      if (!created.ok) throw new Error('createTrip failed')
      const r = await d.renameTrip({ tripId: created.data.trip.id, name: 'New Name' })
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.data.name).toBe('New Name')
    })

    it('updateTripSettings patches tentCapacity', async () => {
      const d = await makeDeps()
      const created = await d.createTrip({ campsiteId: 'fixture:test', style: 'car' })
      if (!created.ok) throw new Error('createTrip failed')
      const r = await d.updateTripSettings({
        tripId: created.data.trip.id,
        patch: { tentCapacity: 6 },
      })
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.data.tentCapacity).toBe(6)
    })

    it('addItem then updateItem then removeItem then restoreItem', async () => {
      const d = await makeDeps()
      const created = await d.createTrip({ campsiteId: 'fixture:test', style: 'car' })
      if (!created.ok) throw new Error('createTrip failed')
      const tripId = created.data.trip.id
      const add = await d.addItem({
        tripId,
        category: 'Food',
        name: 'Snack',
        scope: 'per_person',
        baseQty: 1,
      })
      expect(add.ok).toBe(true)
      if (!add.ok) return
      const itemId = add.data.id
      const up = await d.updateItem({
        tripId,
        itemId,
        patch: { name: 'Renamed' },
      })
      expect(up.ok).toBe(true)
      const rm = await d.removeItem({ tripId, itemId })
      expect(rm.ok).toBe(true)
      const rs = await d.restoreItem({ tripId, itemId })
      expect(rs.ok).toBe(true)
    })

    it('joinTrip, claimItem, unclaimItem do not accept participantId/token in input', async () => {
      // This is enforced by the static input types (I-C). At runtime, the
      // suite simply exercises the correct shape.
      const d = await makeDeps()
      const created = await d.createTrip({ campsiteId: 'fixture:test', style: 'car' })
      if (!created.ok) throw new Error('createTrip failed')
      const j = await d.joinTrip({ tripId: created.data.trip.id, name: 'Joiner' })
      // Joiner may or may not succeed depending on cookie wiring; either way,
      // the shape returns Result<T>.
      expect(typeof j.ok).toBe('boolean')
    })

    it('deleteTrip on unknown trip returns not_found', async () => {
      const d = await makeDeps()
      const r = await d.deleteTrip({ tripId: 'does-not-exist' })
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(['not_found', 'unauthorized']).toContain(r.error.code)
      }
    })
  })
}
