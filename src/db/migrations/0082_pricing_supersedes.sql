-- D1-1 rate-basis pin: pricing becomes append-versioned (admin edits mint a
-- successor row and move the is_active pointer; rows are never updated
-- in place, so ride.pricing_id always pins an immutable rate basis).
-- Nullable self-reference; existing rows keep NULL (version roots).
ALTER TABLE "pricing" ADD COLUMN IF NOT EXISTS "supersedes_id" uuid REFERENCES "pricing"("id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pricing_supersedes_idx" ON "pricing" USING btree ("supersedes_id");
