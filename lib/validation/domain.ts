// Zod schemas for Amenities + Campsite — WS-0.11.
// Stub: impl agent writes the real schemas (parses must reject malformed
// inputs and the source-prefix scheme on Campsite.id; G-state/G-prefix).

import { z } from 'zod'

// Placeholder — impl agent replaces with the real shape (DR-30/DR-31).
// Using z.never() guarantees parse() rejects everything until implemented;
// tests will see deliberate failures.
export const AmenitiesSchema: z.ZodType<unknown> = z.never()
export const CampsiteSchema: z.ZodType<unknown> = z.never()
