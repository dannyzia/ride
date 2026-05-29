-- Migration 0006: Remove bkash, nagad, and rocket from payment_provider enum
-- Only 'portpos' remains since all payments now go through PortPos.
-- Idempotent: skips if 'bkash' has already been removed from the enum.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'payment_provider'
      AND e.enumlabel = 'bkash'
  ) THEN
    -- Step 1: Drop default (if any) and convert column to text
    ALTER TABLE payment_events ALTER COLUMN provider DROP DEFAULT;
    ALTER TABLE payment_events ALTER COLUMN provider TYPE text;

    -- Step 2: Normalize old values to 'portpos'
    UPDATE payment_events SET provider = 'portpos' WHERE provider NOT IN ('portpos');

    -- Step 3: Drop old enum type
    DROP TYPE payment_provider;

    -- Step 4: Recreate enum with only 'portpos'
    CREATE TYPE payment_provider AS ENUM ('portpos');

    -- Step 5: Cast column back to the new enum
    ALTER TABLE payment_events ALTER COLUMN provider TYPE payment_provider USING provider::payment_provider;

    -- Step 6: Re-add default
    ALTER TABLE payment_events ALTER COLUMN provider SET DEFAULT 'portpos';
  END IF;
END $$;
