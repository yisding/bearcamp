// Write-once barrel — WS-0 owns permanently (DR-1 / B2).
// The export set is frozen at exactly { generate, requiredQty, TENT_CAPACITY }.
// T0.11 asserts this; WS-1 replaces only generate.ts behind this barrel and
// MUST NOT add new exports here.
export { generate } from './generate'
export { requiredQty, TENT_CAPACITY } from './quantities'
