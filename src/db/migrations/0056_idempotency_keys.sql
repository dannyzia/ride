-- Idempotency-Key convention storage (decision 01M23628A1566SK1D5XXV1NT5G).
-- Hand-authored per the 0047+ precedent (drizzle-kit generate requires a TTY
-- this environment does not have). Fresh-install history: the live DB already
-- carries every column/table this file creates — all statements are
-- IF NOT EXISTS-guarded so re-application is a no-op.
CREATE TABLE IF NOT EXISTS "idempotency_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "route" varchar(120) NOT NULL,
  "key" varchar(255) NOT NULL,
  "user_id" uuid,
  "request_fingerprint" varchar(64),
  "response_status" integer,
  "response_body" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_keys_route_key_uq" ON "idempotency_keys" USING btree ("route", "key");
CREATE INDEX IF NOT EXISTS "idempotency_keys_user_idx" ON "idempotency_keys" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "idempotency_keys_created_at_idx" ON "idempotency_keys" USING btree ("created_at");
