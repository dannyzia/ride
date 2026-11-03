-- Migration: 0089_p2p_mfs_and_dispatch_messaging.sql
-- Hand-crafted migration following Ride strict schema standards

ALTER TABLE "rides"
  ADD COLUMN IF NOT EXISTS "payment_method" varchar(20) DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS "mfs_provider" varchar(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "mfs_number" varchar(20) DEFAULT NULL;
