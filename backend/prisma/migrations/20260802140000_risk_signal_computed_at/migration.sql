-- When a risk signal was last COMPUTED, as opposed to when it first appeared.
-- Re-running the agents upserts onto (taxpayerId, year, agentKey), so createdAt
-- stops tracking reality after the first run; a stale signal then reads as
-- current fact on the agent-signals page.
ALTER TABLE "risk_signals" ADD COLUMN "computedAt" TIMESTAMP(3);

-- Existing rows: the best available approximation of when they were computed is
-- when they were created. Backfill, then make the column required.
UPDATE "risk_signals" SET "computedAt" = "createdAt" WHERE "computedAt" IS NULL;
ALTER TABLE "risk_signals" ALTER COLUMN "computedAt" SET NOT NULL;
