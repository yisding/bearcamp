// Single source of truth for magic numbers — WS-0.8c / DR-43.
// Every doc cites these by name; T0.15 grep-asserts no other file restates
// the literal values in a participant-cap / tent-max / page-size context.

export const PARTICIPANT_CAP_PER_TRIP = 50
export const TENT_CAPACITY_MIN = 1
export const TENT_CAPACITY_MAX = 12
export const SEARCH_PAGE_SIZE_DEFAULT = 20
export const SEARCH_PAGE_SIZE_MAX = 50
