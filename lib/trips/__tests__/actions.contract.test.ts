// Invokes the shared actions contract suite against fake deps wired to
// memory storage + stub generate. WS-7 will swap the deps factory for the
// real Server Actions (zero suite changes).
//
// For WS-0 (red phase), `makeFakeDeps` throws because the action wiring
// doesn't exist yet — the impl agent fills it in. This is intentionally
// red.

import { actionsContract } from './actions.contract'
import type { ActionDeps } from './actions.contract'

function makeFakeDeps(): ActionDeps {
  throw new Error(
    'actionsContract deps factory not wired (WS-0 red — impl phase wires actions against memory+stub generate)',
  )
}

actionsContract('memory+stub', () => makeFakeDeps())
