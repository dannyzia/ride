-- D2-3 notify locale (STAGE D2-FIX): recipient locale for server-side
-- push copy selection (lib/notifyCopy.ts en/bn dictionary, default 'en').
-- NOT NULL with default so every existing row reads 'en' with no backfill.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locale" varchar(5) DEFAULT 'en' NOT NULL;
