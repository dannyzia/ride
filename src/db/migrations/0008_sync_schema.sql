-- Migration 0008: Sync schema — add missing tables, columns, and indexes
-- Generated from schema diff between src/db/schema.ts and remote DB

-- ============================================================
-- PART 1: Add missing columns to existing tables
-- ============================================================

-- rides: add promo_code_id (FK) and new monetary columns
-- Note: DB has 'promo_code' (varchar) but schema uses 'promo_code_id' (FK uuid).
-- We keep both during migration — promo_code is used by F4 coupon system.
ALTER TABLE rides ADD COLUMN IF NOT EXISTS promo_code_id uuid REFERENCES promo_codes(id);
ALTER TABLE rides ADD COLUMN IF NOT EXISTS driver_fare_bdt integer;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS rider_payable_bdt integer;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS platform_subsidy_bdt integer;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS preference_surcharge_bdt integer NOT NULL DEFAULT 0;

-- credit_vouchers: add source tracking
ALTER TABLE credit_vouchers ADD COLUMN IF NOT EXISTS source varchar(20) NOT NULL DEFAULT 'pro_rata';
ALTER TABLE credit_vouchers ADD COLUMN IF NOT EXISTS source_ref_id uuid;

-- users: add new profile columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS rating numeric(3, 2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rating_sum integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sos_contact varchar(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS rider_wallet_balance_bdt integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_settings jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS linked_accounts jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS data_controls jsonb;

-- ============================================================
-- PART 2: Add missing indexes
-- ============================================================

-- dispatch_offers: batch index
CREATE INDEX IF NOT EXISTS dispatch_offers_batch_idx ON dispatch_offers (ride_id, batch_index);

-- rides: promo_code_id index
CREATE INDEX IF NOT EXISTS rides_promo_code_id_idx ON rides (promo_code_id) WHERE promo_code_id IS NOT NULL;

-- rides: vehicle_type index (may already exist)
CREATE INDEX IF NOT EXISTS rides_vehicle_type_idx ON rides (vehicle_type);

-- drivers: min_per_km_bdt partial index
CREATE INDEX IF NOT EXISTS drivers_min_rate_idx ON drivers (min_per_km_bdt) WHERE min_per_km_bdt IS NOT NULL;

-- drivers: completed_rides_count index
CREATE INDEX IF NOT EXISTS drivers_completed_rides_idx ON drivers (completed_rides_count);

-- drivers: vehicle_id unique (may already exist as drivers_vehicle_id_key)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'drivers_vehicle_id_key') THEN
    CREATE UNIQUE INDEX drivers_vehicle_id_key ON drivers (vehicle_id);
  END IF;
END $$;

-- drivers: last_location_at index
CREATE INDEX IF NOT EXISTS drivers_last_location_idx ON drivers (last_location_at);

-- vehicles: vehicle_type index
CREATE INDEX IF NOT EXISTS vehicles_vehicle_type_idx ON vehicles (vehicle_type);

-- vehicles: type_change_effective_at partial index
CREATE INDEX IF NOT EXISTS vehicles_type_change_idx ON vehicles (type_change_effective_at) WHERE type_change_effective_at IS NOT NULL;

-- vehicles: registration_date index
CREATE INDEX IF NOT EXISTS vehicles_reg_date_idx ON vehicles (registration_date);

-- vehicles: fitness/tax token expiry indexes
CREATE INDEX IF NOT EXISTS vehicles_fitness_idx ON vehicles (fitness_expires_at);
CREATE INDEX IF NOT EXISTS vehicles_tax_token_idx ON vehicles (tax_token_expires_at);

-- owner_consents: driver_id index
CREATE INDEX IF NOT EXISTS owner_consents_driver_idx ON owner_consents (driver_id);

-- credit_vouchers: active voucher lookup
CREATE INDEX IF NOT EXISTS credit_vouchers_active_idx ON credit_vouchers (driver_id) WHERE status = 'active';

-- subscriptions: expires_at sweep index
CREATE INDEX IF NOT EXISTS subs_expires_idx ON subscriptions (expires_at) WHERE status = 'active';

-- driver_online_sessions: indexes
CREATE INDEX IF NOT EXISTS driver_online_sessions_driver_sub_idx ON driver_online_sessions (driver_id, subscription_id);
CREATE INDEX IF NOT EXISTS driver_online_sessions_sub_offline_idx ON driver_online_sessions (subscription_id, went_offline_at);

-- documents: additional indexes
CREATE INDEX IF NOT EXISTS documents_vehicle_id_idx ON documents (vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS documents_doc_type_idx ON documents (doc_type);
CREATE INDEX IF NOT EXISTS documents_purge_idx ON documents (purge_at) WHERE purge_at IS NOT NULL;

-- call_ledger: subscription audit log
CREATE INDEX IF NOT EXISTS call_ledger_sub_date_idx ON call_ledger (subscription_id, created_at);

-- pricing: vehicle_type index (may already exist)
CREATE INDEX IF NOT EXISTS pricing_vehicle_type_idx ON pricing (vehicle_type);

-- ============================================================
-- PART 3: Create missing tables (feature tables F9, F10, F12)
-- ============================================================

-- vehicle_models (F12)
CREATE TABLE IF NOT EXISTS vehicle_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_type varchar(25) NOT NULL,
  manufacturer varchar(100) NOT NULL,
  model varchar(100) NOT NULL,
  manufacturing_year integer NOT NULL,
  body_type varchar(50),
  engine_cc integer,
  default_seats integer NOT NULL DEFAULT 2,
  has_ac boolean DEFAULT false,
  popularity_score integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vehicle_models_type_idx ON vehicle_models (vehicle_type);
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_models_unique_idx ON vehicle_models (vehicle_type, manufacturer, model, manufacturing_year);

-- rider_addresses (F9)
CREATE TABLE IF NOT EXISTS rider_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  label varchar(50) NOT NULL,
  address text NOT NULL,
  latitude numeric(10, 7) NOT NULL,
  longitude numeric(10, 7) NOT NULL,
  is_favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rider_addresses_user_idx ON rider_addresses (user_id);

-- referral_campaigns (F10)
CREATE TABLE IF NOT EXISTS referral_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  description text,
  inviter_reward_type varchar(20) NOT NULL,
  inviter_reward_value integer NOT NULL,
  invitee_reward_type varchar(20) NOT NULL,
  invitee_reward_value integer NOT NULL,
  max_referrals integer,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- referral_codes (F10)
CREATE TABLE IF NOT EXISTS referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  code varchar(20) NOT NULL,
  campaign_id uuid NOT NULL REFERENCES referral_campaigns(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS referral_codes_code_idx ON referral_codes (code);
CREATE INDEX IF NOT EXISTS referral_codes_user_idx ON referral_codes (user_id);

-- referrals (F10)
CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES users(id),
  referred_id uuid NOT NULL REFERENCES users(id),
  code_id uuid NOT NULL REFERENCES referral_codes(id),
  status varchar(20) NOT NULL DEFAULT 'pending',
  reward_credited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS referrals_referred_idx ON referrals (referred_id);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals (referrer_id);

-- driver_wallet_transactions (F9)
CREATE TABLE IF NOT EXISTS driver_wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id),
  ride_id uuid REFERENCES rides(id),
  type varchar(30) NOT NULL,
  amount_bdt integer NOT NULL,
  balance_after_bdt integer NOT NULL,
  description varchar(255),
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS driver_wallet_tx_driver_idx ON driver_wallet_transactions (driver_id, created_at);

-- rider_wallet_transactions (F9)
CREATE TABLE IF NOT EXISTS rider_wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  ride_id uuid REFERENCES rides(id),
  type varchar(30) NOT NULL,
  amount_bdt integer NOT NULL,
  balance_after_bdt integer NOT NULL,
  description varchar(255),
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rider_wallet_tx_user_idx ON rider_wallet_transactions (user_id, created_at);

-- points (F10)
CREATE TABLE IF NOT EXISTS points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  balance integer NOT NULL DEFAULT 0,
  total_earned integer NOT NULL DEFAULT 0,
  total_redeemed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS points_user_idx ON points (user_id);

-- point_transactions (F10)
CREATE TABLE IF NOT EXISTS point_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  type varchar(30) NOT NULL,
  source varchar(30) NOT NULL,
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS point_tx_user_idx ON point_transactions (user_id, created_at);

-- point_offers (F10)
CREATE TABLE IF NOT EXISTS point_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(100) NOT NULL,
  description text,
  points_cost integer NOT NULL,
  reward_type varchar(30) NOT NULL,
  reward_value integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  max_redemptions integer,
  redeemed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
