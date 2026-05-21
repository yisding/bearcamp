-- WS-2.3 Postgres features migration.
--
-- 1. pg_trgm extension + GIN trigram indexes (gin_trgm_ops) on Campsite.name
--    and Campsite.description. Required for `Prisma.contains` / `ILIKE %q%`
--    to actually hit a GIN index instead of falling back to a sequential
--    scan (review-2 DR-11; T2.2b proves the planner picks the index).
-- 2. Trip.tentCapacity CHECK constraint enforcing the [1, 12] bounds at the
--    DB layer, so direct DB writes can't bypass lib/validation/actions.ts
--    (review-3 DR-54; T2.15 verifies a direct INSERT with 0/13 is rejected).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS campsite_name_trgm_idx
  ON "Campsite" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS campsite_description_trgm_idx
  ON "Campsite" USING GIN ("description" gin_trgm_ops);

ALTER TABLE "Trip"
  ADD CONSTRAINT trip_tent_capacity_check
  CHECK ("tentCapacity" BETWEEN 1 AND 12);
