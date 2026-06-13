# Developer Change List
> Compact, file-by-file implementation guide for the Ride project.
> Base codebase: `D:\My Projects\Current Project\Ride`
> Phases follow the critical path in `14-DEV-CHECKLIST.yaml`.
> Each section lists: files to delete, files to modify, files to create — with exact code shapes.

---

## Quick Reference — Critical Path

```
Phase 1: GlideX Cleanup        → must finish before Phase 2, 3
Phase 2: Database Schema        → must finish before Phase 4, 5, 6
Phase 3: Supabase Auth + dprelay → must finish before Phase 4
Phase 4: Auth Layer             → must finish before Phase 5, 6
Phase 5: Payment System         → must finish before Phase 7 (Driver flows)
Phase 6: Dispatch Engine        → must finish before Phase 7, 8 (Driver + Rider flows)
```

## GoRide Design System Integration

1. Copy primary logo into project assets. Source: App Design/Logo/image-2026-05-04T15-36-03-285Z.png. Target: assets/logo/logo.png. Apply in splash screen, auth screens, app icon pipeline, and in-app header mark.
1. Create theme/goRide.ts from GoRide.css tokens. Source CSS: App Design/GoRide - Ride-Hailing App UI Kit (Preview)/GoRide.css. Export semantic tokens for color, typography, radius, spacing, and elevation.
1. Replace all existing color/font constants with GoRide theme references. No hardcoded colors or fonts in UI components.
1. Copy marker icons from Elements to app assets/icons and update pickup/dropoff and vehicle marker usage.
1. Update screen components to match GoRide patterns for auth and onboarding cards, driver home floating wallet and online toggle, rider home bottom sheet and vehicle chips, and offer/scheduled/cancel flows.
1. Align API and flow contracts with validated UX states. Enforce cancel reason codes in `POST /api/ride/:id/cancel`, require details for `other`, include expanded driver-arriving details cards, and preserve post-arrival summary before final fare/rating closeout.
1. Add E2E coverage for lifecycle UX: finding-driver pulse state, cancel reason confirm gating, driver-arriving detail sheet composition, and post-arrival summary progression.

### Bundle-Level Execution Traceability (B-G)

1. Bundle B - Scheduled ride, promo, payment selector: implement schedule state contracts (`idle -> selecting_date -> selecting_time -> confirmed -> dispatched`); wire promo discovery/redeem with `/api/promo/list` and `/api/promo/redeem`; use canonical `GET /api/payment/methods` plus `PUT /api/payment/default-method`; add tests for schedule validation, promo expired/ineligible handling, and payment default persistence.

1. Bundle C - Activity, ride details, receipt share: implement activity list states (loading, populated, empty, pagination append); render ride details from `/api/ride/:id/details` with status-specific cards; implement `/api/ride/:id/share-receipt` with share fallback behavior; add tests for timeline consistency and receipt share success/failure.

1. Bundle D - Wallet top-up: integrate `/api/wallet/balance` and `/api/wallet/topup/history`; implement top-up create/confirm pipeline (`/api/wallet/topup`, `/api/wallet/topup/:id`, `/api/wallet/topup/:id/confirm`); add top-up receipt share with `/api/wallet/topup/:id/share-receipt`; add tests for pending/confirmed/failed states and idempotent confirm.

1. Bundle E - Saved addresses: implement CRUD plus undo-delete using `/api/rider/addresses`, `/api/rider/addresses/:id`, and `/api/rider/addresses/:id/undo-delete`; enforce max-saved-address and duplicate-label rules; add tests for optimistic update, rollback, and undo retention window behavior.

1. Bundle F - Settings and payment methods management: implement profile/notification/security/linked-account/data-control settings screens; use `GET/POST /api/payment/methods` and `PUT /api/payment/default-method` for payment-method management; add tests for security confirmations and linked-account connect/disconnect error paths.

1. Bundle G - Appearance, help, legal, logout: integrate `GET /api/settings/appearance`, `PUT /api/settings/appearance/theme`, and `PUT /api/settings/appearance/language`; implement help/legal from `/api/help/faq`, `/api/help/support-channels`, `/api/legal/privacy-policy`, and `/api/legal/terms-of-service`; add logout guard behavior and tests for preference persistence plus offline fallback for cached help/legal content.

---

## Phase 1 — GlideX Cleanup

### FILES TO DELETE
```
app/api/clerk-role+api.ts
app/api/create-payment+api.ts
app/api/login+api.ts
app/api/send-email+api.ts
app/api/unique-email+api.ts
app/(auth)/sign-in.tsx          ← replace with phone-entry.tsx (Phase 4)
app/(auth)/sign-up.tsx          ← replace with register.tsx (Phase 4)
```

### `package.json` — MODIFY

Remove from `dependencies`:
```
@clerk/clerk-expo
@clerk/express
@stripe/stripe-react-native
stripe
resend
```

Add to `dependencies`:
```
@supabase/supabase-js@^2.45.0
zod@^3.22.0
h3-js@^4.1.0
ws@^8.18.0
```

Add to `devDependencies`:
```
@types/ws@^8.5.0
```

Change `name` from `"glidex"` to `"ride"`.

### `app.config.js` — MODIFY

- Change `name`, `slug`, `bundleIdentifier`/`package` from GlideX values to Ride values.
- Remove `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`.
- Add all vars from `11-ENV-VARS.md` as `EXPO_PUBLIC_*` entries (Supabase config, server URL, maps key).

### `app/_layout.tsx` — MODIFY (full rewrite deferred to Phase 4)

For now: remove `<ClerkProvider>` wrapper and all `@clerk/*` imports. Replace with a simple pass-through that renders `<Slot />`. Auth state listener added in Phase 4.

```
// TEMP (Phase 1 — stub until Phase 4)
import { Slot } from 'expo-router';
export default function RootLayout() {
  return <Slot />;
}
```

### `src/db/schema.ts` — MODIFY (full rewrite in Phase 2)

In Phase 1, just confirm the file can compile after Clerk/Stripe removal. The full schema rewrite is Phase 2.

### `lib/logger.ts` — CREATE

```typescript
// lib/logger.ts
const LEVEL = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = levels[LEVEL as keyof typeof levels] ?? 2;

function log(level: keyof typeof levels, ...args: unknown[]) {
  if (levels[level] <= currentLevel) console[level](...args);
}

export const logger = {
  error: (...a: unknown[]) => log('error', '[ERROR]', ...a),
  warn:  (...a: unknown[]) => log('warn',  '[WARN]',  ...a),
  info:  (...a: unknown[]) => log('info',  '[INFO]',  ...a),
  debug: (...a: unknown[]) => log('debug', '[DEBUG]', ...a),
};
```

### `lib/env.ts` — CREATE

Validates all required env vars at startup using Zod. Called at the top of every server entry point.

```typescript
// lib/env.ts
import { z } from 'zod';

const serverEnvSchema = z.object({
  DATABASE_URL:                z.string().url(),
  SUPABASE_URL:               z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY:  z.string().min(1),
  BKASH_APP_KEY:               z.string().min(1),
  BKASH_APP_SECRET:            z.string().min(1),
  BKASH_USERNAME:              z.string().min(1),
  BKASH_PASSWORD:              z.string().min(1),
  BKASH_BASE_URL:              z.string().url(),
  GOOGLE_MAPS_SERVER_API_KEY:  z.string().min(1),
});

export function validateServerEnv() {
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map(i => i.path.join('.')).join(', ');
    throw new Error(`[env] Missing or invalid env vars: ${missing}`);
  }
  return result.data;
}
```

---

## Phase 2 — Database Schema

### `src/db/schema.ts` — FULL REWRITE

Complete replacement. Key structure below (abbreviated — expand from `05-DATA-MODEL.md`):

```typescript
// src/db/schema.ts
import {
  pgTable, pgEnum, uuid, varchar, text, integer, boolean,
  numeric, smallint, date, timestamptz, jsonb, primaryKey,
  uniqueIndex, index
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── Enums ──────────────────────────────────────────────────────
export const vehicleTypeEnum = pgEnum('vehicle_type', [
  'bike_basic', 'bike_standard', 'bike_plus',
  'cng',
  'car_economy', 'car_comfort', 'car_premium', 'car_xl',
]);
export const userRoleEnum          = pgEnum('user_role',          ['rider', 'driver', 'admin']);
export const driverStatusEnum      = pgEnum('driver_status',      ['pending', 'temporary', 'active', 'suspended', 'rejected']);
export const rideStatusEnum        = pgEnum('ride_status',        ['pending', 'dispatching', 'matched', 'driver_arriving', 'in_progress', 'completed', 'cancelled', 'expired', 'no_drivers']);
export const subscriptionStatusEnum= pgEnum('subscription_status',['active', 'expired', 'suspended']);
export const callEventTypeEnum     = pgEnum('call_event_type',    ['deduction', 'refund', 'credit', 'initial_load', 'expiry_writeoff']);
export const paymentProviderEnum   = pgEnum('payment_provider',   ['bkash', 'nagad']);
export const paymentStatusEnum     = pgEnum('payment_status',     ['initiated', 'paid', 'failed', 'callback_pending']);
export const documentTypeEnum      = pgEnum('document_type',      [
  'license_front', 'license_back',
  'reg_scan_front', 'reg_scan_back',
  'fitness_scan', 'tax_token_scan', 'brta_certificate',
  'vehicle_photo_front', 'vehicle_photo_left', 'vehicle_photo_right', 'vehicle_photo_back',
  'legacy_screenshot', 'owner_consent_scan',
  'helmet_photo', 'dashboard_photo', 'interior_photo', 'third_row_photo',
]);
export const documentStatusEnum    = pgEnum('document_status',    ['pending', 'approved', 'rejected']);
export const offerOutcomeEnum      = pgEnum('offer_outcome',      ['delivered', 'accepted', 'rejected', 'expired', 'refunded', 'filtered']);
export const ownerConsentStatusEnum= pgEnum('owner_consent_status',['pending', 'approved', 'rejected', 'expired']);
export const registrationAreaEnum  = pgEnum('registration_area',  ['DHAKA_METRO','CHITTAGONG_METRO','KHULNA_METRO','RAJSHAHI_METRO','BARISAL_METRO','SYLHET_METRO','RANGPUR_METRO','MYMENSINGH_METRO']);
export const vehicleClassLetterEnum= pgEnum('vehicle_class_letter',['KA','KHA','GA','GHA','CHA','CHHA','JA','JHA','TA','THA','DA','NA','PA','BHA','MA','DAW','THAW','HA','LA','EE','YA']);

// ── users ──────────────────────────────────────────────────────
export const users = pgTable('users', {
  id:               uuid('id').defaultRandom().primaryKey(),
  auth_uid:     varchar('auth_uid', { length: 128 }).notNull().unique(),
  phone:            varchar('phone', { length: 20 }).notNull().unique(),
  name:             varchar('name', { length: 255 }).notNull(),
  email:            varchar('email', { length: 255 }),           // nullable — only admin needs it
  role:             userRoleEnum('role').notNull().default('rider'),
  profile_image_url:varchar('profile_image_url', { length: 500 }),
  device_id:        varchar('device_id', { length: 255 }),
  device_bound_at:  timestamptz('device_bound_at'),
  created_at:       timestamptz('created_at').notNull().defaultNow(),
  updated_at:       timestamptz('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('users_auth_uid_idx').on(t.auth_uid),
  uniqueIndex('users_phone_idx').on(t.phone),
]);

// ── drivers ─────────────────────────────────────────────────────
export const drivers = pgTable('drivers', {
  id:                       uuid('id').defaultRandom().primaryKey(),
  user_id:                  uuid('user_id').notNull().references(() => users.id).unique(),
  vehicle_id:               uuid('vehicle_id'),                // FK → vehicles.id — added after vehicles table
  vehicle_type:             vehicleTypeEnum('vehicle_type').notNull(),
  status:                   driverStatusEnum('status').notNull().default('pending'),
  rating:                   numeric('rating', { precision: 3, scale: 2 }).notNull().default('5.00'),
  rating_count:             integer('rating_count').notNull().default(0),
  rating_sum:               integer('rating_sum').notNull().default(0),
  min_per_km_bdt:           integer('min_per_km_bdt'),
  vehicle_registration_date:date('vehicle_registration_date'),
  address:                  text('address'),
  license_number:           varchar('license_number', { length: 100 }),
  owner_consent_verified:   boolean('owner_consent_verified').notNull().default(false),
  is_legacy_operator:       boolean('is_legacy_operator').notNull().default(false),
  provisional_expires_at:   timestamptz('provisional_expires_at'),
  acceptance_rate:          numeric('acceptance_rate', { precision: 5, scale: 2 }).notNull().default('100.00'),
  completed_rides_count:    integer('completed_rides_count').notNull().default(0),
  is_online:                boolean('is_online').notNull().default(false),
  last_location_lat:        numeric('last_location_lat', { precision: 10, scale: 7 }),
  last_location_lng:        numeric('last_location_lng', { precision: 10, scale: 7 }),
  last_location_at:         timestamptz('last_location_at'),
  h3_cell_res9:             varchar('h3_cell_res9', { length: 20 }),
  stage2_due_at:            timestamptz('stage2_due_at'),
  created_at:               timestamptz('created_at').notNull().defaultNow(),
  updated_at:               timestamptz('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('drivers_user_id_idx').on(t.user_id),
  index('drivers_h3_cell_idx').on(t.h3_cell_res9),
  index('drivers_online_status_idx').on(t.is_online, t.status),
  index('drivers_vehicle_type_idx').on(t.vehicle_type),
]);

// ── vehicles ────────────────────────────────────────────────────
export const vehicles = pgTable('vehicles', {
  id:                       uuid('id').defaultRandom().primaryKey(),
  driver_id:                uuid('driver_id').notNull().references(() => drivers.id).unique(),
  vehicle_type:             vehicleTypeEnum('vehicle_type').notNull(),
  manufacturer:             varchar('manufacturer', { length: 100 }).notNull(),
  model:                    varchar('model', { length: 100 }).notNull(),
  manufacturing_year:       integer('manufacturing_year').notNull(),
  cc_range:                 varchar('cc_range', { length: 30 }),  // '≤100' | '101-150' | '>150'
  has_ac:                   boolean('has_ac'),
  passenger_seats:          integer('passenger_seats').notNull(),
  registration_area:        registrationAreaEnum('registration_area').notNull(),
  vehicle_class_letter:     vehicleClassLetterEnum('vehicle_class_letter').notNull(),
  registration_number:      varchar('registration_number', { length: 50 }).notNull().unique(),
  registration_date:        date('registration_date').notNull(),
  fitness_expires_at:       date('fitness_expires_at').notNull(),
  tax_token_expires_at:     date('tax_token_expires_at').notNull(),
  admin_type_note:          text('admin_type_note'),
  type_change_effective_at: timestamptz('type_change_effective_at'),
  created_at:               timestamptz('created_at').notNull().defaultNow(),
  updated_at:               timestamptz('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('vehicles_driver_id_idx').on(t.driver_id),
  uniqueIndex('vehicles_reg_number_idx').on(t.registration_number),
]);

// ── packages ────────────────────────────────────────────────────
export const packages = pgTable('packages', {
  id:            uuid('id').defaultRandom().primaryKey(),
  name:          varchar('name', { length: 100 }).notNull(),
  call_count:    integer('call_count').notNull(),                 // -1 = unlimited
  duration_days: integer('duration_days').notNull(),
  price_bdt:     integer('price_bdt').notNull(),                  // paisa
  is_trial:      boolean('is_trial').notNull().default(false),
  is_active:     boolean('is_active').notNull().default(true),
  daily_cap:     integer('daily_cap').notNull().default(200),
  created_at:    timestamptz('created_at').notNull().defaultNow(),
  updated_at:    timestamptz('updated_at').notNull().defaultNow(),
  deleted_at:    timestamptz('deleted_at'),
});

// ── subscriptions ────────────────────────────────────────────────
export const subscriptions = pgTable('subscriptions', {
  id:                    uuid('id').defaultRandom().primaryKey(),
  driver_id:             uuid('driver_id').notNull().references(() => drivers.id),
  package_id:            uuid('package_id').notNull().references(() => packages.id),
  calls_remaining:       integer('calls_remaining').notNull(),
  daily_calls_used:      integer('daily_calls_used').notNull().default(0),
  daily_reset_at:        timestamptz('daily_reset_at').notNull(),
  cap_override:          numeric('cap_override', { precision: 3, scale: 2 }),
  status:                subscriptionStatusEnum('status').notNull().default('active'),
  purchased_at:          timestamptz('purchased_at').notNull().defaultNow(),
  expires_at:            timestamptz('expires_at').notNull(),
  credit_calls_received: integer('credit_calls_received').notNull().default(0),
  total_deductions:      integer('total_deductions').notNull().default(0),
  is_trial:              boolean('is_trial').notNull().default(false),
  created_at:            timestamptz('created_at').notNull().defaultNow(),
  updated_at:            timestamptz('updated_at').notNull().defaultNow(),
}, (t) => [
  index('subs_driver_status_idx').on(t.driver_id, t.status),
  // unique partial: only 1 active sub per driver
  uniqueIndex('subs_one_active_per_driver').on(t.driver_id)
    .where(sql`status = 'active'`),
  // unique partial: trial allowed only once
  uniqueIndex('subs_one_trial_per_driver').on(t.driver_id)
    .where(sql`is_trial = true AND status IN ('active','expired')`),
]);

// ── credit_vouchers ──────────────────────────────────────────────
export const creditVouchers = pgTable('credit_vouchers', {
  id:                      uuid('id').defaultRandom().primaryKey(),
  driver_id:               uuid('driver_id').notNull().references(() => drivers.id),
  calls:                   integer('calls').notNull(),
  expires_at:              timestamptz('expires_at').notNull(),
  redeemed_subscription_id:uuid('redeemed_subscription_id').references(() => subscriptions.id),
  status:                  varchar('status', { length: 20 }).notNull().default('active'),
  created_at:              timestamptz('created_at').notNull().defaultNow(),
});

// ── call_ledger ──────────────────────────────────────────────────
export const callLedger = pgTable('call_ledger', {
  id:              uuid('id').defaultRandom().primaryKey(),
  subscription_id: uuid('subscription_id').notNull().references(() => subscriptions.id),
  driver_id:       uuid('driver_id').notNull().references(() => drivers.id),
  ride_id:         uuid('ride_id').references(() => rides.id),
  event_type:      callEventTypeEnum('event_type').notNull(),
  delta:           integer('delta').notNull(),
  balance_after:   integer('balance_after').notNull(),
  reason:          varchar('reason', { length: 255 }).notNull(),
  created_at:      timestamptz('created_at').notNull().defaultNow(),
}, (t) => [
  index('call_ledger_driver_date_idx').on(t.driver_id, t.created_at),
  // Prevent double-deduction — the most important index in the system
  uniqueIndex('call_ledger_no_double_deduct')
    .on(t.ride_id, t.driver_id)
    .where(sql`event_type = 'deduction'`),
]);

// ── rides ────────────────────────────────────────────────────────
export const rides = pgTable('rides', {
  id:                   uuid('id').defaultRandom().primaryKey(),
  user_id:              uuid('user_id').notNull().references(() => users.id),
  driver_id:            uuid('driver_id').references(() => drivers.id),  // nullable pre-match
  zone_id:              uuid('zone_id').notNull(),                        // FK → zones.id
  pricing_id:           uuid('pricing_id').notNull(),                     // FK → pricing.id
  origin_address:       varchar('origin_address', { length: 255 }).notNull(),
  destination_address:  varchar('destination_address', { length: 255 }).notNull(),
  origin_latitude:      numeric('origin_latitude', { precision: 10, scale: 7 }).notNull(),
  origin_longitude:     numeric('origin_longitude', { precision: 10, scale: 7 }).notNull(),
  destination_latitude: numeric('destination_latitude', { precision: 10, scale: 7 }).notNull(),
  destination_longitude:numeric('destination_longitude', { precision: 10, scale: 7 }).notNull(),
  vehicle_type:         vehicleTypeEnum('vehicle_type').notNull(),
  status:               rideStatusEnum('status').notNull().default('pending'),
  fare_breakdown:       jsonb('fare_breakdown').notNull(),
  distance_km:          numeric('distance_km', { precision: 7, scale: 3 }).notNull(),
  scheduled_at:         timestamptz('scheduled_at'),
  matched_at:           timestamptz('matched_at'),
  eta_minutes:          smallint('eta_minutes'),
  started_at:           timestamptz('started_at'),
  completed_at:         timestamptz('completed_at'),
  rider_rating:         smallint('rider_rating'),
  driver_rating:        smallint('driver_rating'),
  cancel_reason:        varchar('cancel_reason', { length: 255 }),
  cancelled_by:         varchar('cancelled_by', { length: 10 }),
  scheduled_dispatched_at: timestamptz('scheduled_dispatched_at'),
  created_at:           timestamptz('created_at').notNull().defaultNow(),
  updated_at:           timestamptz('updated_at').notNull().defaultNow(),
}, (t) => [
  index('rides_status_created_idx').on(t.status, t.created_at),
  index('rides_user_status_idx').on(t.user_id, t.status),
  index('rides_driver_status_idx').on(t.driver_id, t.status),
  index('rides_scheduled_dispatch_idx').on(t.scheduled_at)
    .where(sql`status = 'pending' AND scheduled_at IS NOT NULL AND scheduled_dispatched_at IS NULL`),
]);

// ── dispatch_offers ──────────────────────────────────────────────
export const dispatchOffers = pgTable('dispatch_offers', {
  id:                  uuid('id').defaultRandom().primaryKey(),
  ride_id:             uuid('ride_id').notNull().references(() => rides.id),
  driver_id:           uuid('driver_id').notNull().references(() => drivers.id),
  batch_index:         smallint('batch_index').notNull(),
  sent_at:             timestamptz('sent_at').notNull(),
  fetch_confirmed_at:  timestamptz('fetch_confirmed_at'),
  responded_at:        timestamptz('responded_at'),
  outcome:             offerOutcomeEnum('outcome').notNull().default('delivered'),
  rejection_reason:   varchar('rejection_reason', { length: 100 }),  // reason from offer:reject WebSocket event
  filtered_reason:     varchar('filtered_reason', { length: 50 }),      // set when outcome='filtered' (e.g. 'min_per_km')
  created_at:          timestamptz('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('dispatch_offers_ride_driver_idx').on(t.ride_id, t.driver_id),
  index('dispatch_offers_driver_sent_idx').on(t.driver_id, t.sent_at),
  index('dispatch_offers_filtered_idx').on(t.driver_id, t.outcome, t.sent_at)
    .where(sql`outcome = 'filtered'`),  // for missed-requests stat query
]);

// ── owner_consents ────────────────────────────────────────────────
export const ownerConsents = pgTable('owner_consents', {
  id:                   uuid('id').defaultRandom().primaryKey(),
  driver_id:            uuid('driver_id').notNull().references(() => drivers.id),
  owner_name:           varchar('owner_name', { length: 200 }).notNull(),
  owner_address:        text('owner_address').notNull(),
  owner_phone:          varchar('owner_phone', { length: 20 }).notNull(),
  consent_document_id:  uuid('consent_document_id'),
  legacy_screenshot_document_id: uuid('legacy_screenshot_document_id'),
  status:               ownerConsentStatusEnum('status').notNull().default('pending'),
  reviewed_by:          uuid('reviewed_by').references(() => users.id),
  reviewed_at:          timestamptz('reviewed_at'),
  rejection_reason:     varchar('rejection_reason', { length: 500 }),
  created_at:           timestamptz('created_at').notNull().defaultNow(),
  updated_at:           timestamptz('updated_at').notNull().defaultNow(),
});

// ── used_challenges ───────────────────────────────────────────────
export const usedChallenges = pgTable('used_challenges', {
  jti:        varchar('jti', { length: 64 }).primaryKey(),
  used_at:    timestamptz('used_at').notNull().defaultNow(),
  expires_at: timestamptz('expires_at').notNull(),
});

// ── rate_limits ───────────────────────────────────────────────────
export const rateLimits = pgTable('rate_limits', {
  key:          varchar('key', { length: 128 }).notNull(),
  window_start: timestamptz('window_start').notNull(),
  count:        integer('count').notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.key, t.window_start] }),
]);

// ── payment_events ────────────────────────────────────────────────
export const paymentEvents = pgTable('payment_events', {
  id:               uuid('id').defaultRandom().primaryKey(),
  driver_id:        uuid('driver_id').notNull().references(() => drivers.id),
  package_id:       uuid('package_id').notNull().references(() => packages.id),
  idempotency_key:  varchar('idempotency_key', { length: 64 }).notNull().unique(),
  provider:         paymentProviderEnum('provider').notNull(),
  provider_txn_id:  varchar('provider_txn_id', { length: 255 }),
  amount_bdt:       integer('amount_bdt').notNull(),               // paisa
  status:           paymentStatusEnum('status').notNull().default('initiated'),
  initiated_at:     timestamptz('initiated_at').notNull().defaultNow(),
  confirmed_at:     timestamptz('confirmed_at'),
  subscription_id:  uuid('subscription_id').references(() => subscriptions.id),
  created_at:       timestamptz('created_at').notNull().defaultNow(),
  updated_at:       timestamptz('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('payment_events_idempotency_idx').on(t.idempotency_key),
]);

// ── documents ─────────────────────────────────────────────────────
export const documents = pgTable('documents', {
  id:               uuid('id').defaultRandom().primaryKey(),
  driver_id:        uuid('driver_id').notNull().references(() => drivers.id),
  vehicle_id:       uuid('vehicle_id'),
  doc_type:         documentTypeEnum('doc_type').notNull(),
  storage_url:      text('storage_url').notNull(),
  status:           documentStatusEnum('status').notNull().default('pending'),
  reviewed_by:      uuid('reviewed_by').references(() => users.id),
  reviewed_at:      timestamptz('reviewed_at'),
  rejection_reason: varchar('rejection_reason', { length: 500 }),
  file_size_bytes:  integer('file_size_bytes').notNull(),
  purge_at:         timestamptz('purge_at'),
  created_at:       timestamptz('created_at').notNull().defaultNow(),
  updated_at:       timestamptz('updated_at').notNull().defaultNow(),
  deleted_at:       timestamptz('deleted_at'),
}, (t) => [
  index('documents_driver_status_idx').on(t.driver_id, t.status),
  // Only 1 active doc per type per driver
  uniqueIndex('documents_one_per_type').on(t.driver_id, t.doc_type)
    .where(sql`status IN ('pending','approved') AND deleted_at IS NULL`),
]);

// ── zones ─────────────────────────────────────────────────────────
export const zones = pgTable('zones', {
  id:         uuid('id').defaultRandom().primaryKey(),
  name:       varchar('name', { length: 100 }).notNull(),
  polygon:    jsonb('polygon').notNull(),
  is_active:  boolean('is_active').notNull().default(false),
  created_at: timestamptz('created_at').notNull().defaultNow(),
  updated_at: timestamptz('updated_at').notNull().defaultNow(),
}, (t) => [
  // Only 1 active zone at a time
  uniqueIndex('zones_one_active').on(sql`(1)`)
    .where(sql`is_active = true`),
]);

// ── pricing ───────────────────────────────────────────────────────
export const pricing = pgTable('pricing', {
  id:                   uuid('id').defaultRandom().primaryKey(),
  zone_id:              uuid('zone_id').notNull().references(() => zones.id),
  vehicle_type:         vehicleTypeEnum('vehicle_type').notNull(),
  base_fare_bdt:        integer('base_fare_bdt').notNull(),
  per_km_bdt:           integer('per_km_bdt').notNull(),
  per_min_bdt:          integer('per_min_bdt').notNull(),         // paisa/min for unified ride timer
  floor_length_km:      numeric('floor_length_km', { precision: 10, scale: 2 }).notNull(), // min km for floor fare
  floor_min:            integer('floor_min').notNull(),           // min minutes for floor fare
  is_active:            boolean('is_active').notNull().default(true),
  brta_fare_ceiling_bdt:integer('brta_fare_ceiling_bdt'),
  platform_commission_percent: numeric('platform_commission_percent', { precision: 5, scale: 2 }).notNull().default('0.00'),
  created_at:           timestamptz('created_at').notNull().defaultNow(),
  updated_at:           timestamptz('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('pricing_zone_type_active_idx').on(t.zone_id, t.vehicle_type)
    .where(sql`is_active = true`),
  index('pricing_vehicle_type_idx').on(t.vehicle_type),
]);

// ── chat_messages ─────────────────────────────────────────────────
export const chatMessages = pgTable('chat_messages', {
  id:         uuid('id').defaultRandom().primaryKey(),
  ride_id:    uuid('ride_id').notNull().references(() => rides.id),
  sender_id:  uuid('sender_id').notNull().references(() => users.id),
  content:    text('content').notNull(),
  created_at: timestamptz('created_at').notNull().defaultNow(),
}, (t) => [
  index('chat_messages_ride_created_idx').on(t.ride_id, t.created_at),
]);

// ── driver_online_sessions ────────────────────────────────────────
export const driverOnlineSessions = pgTable('driver_online_sessions', {
  id:               uuid('id').defaultRandom().primaryKey(),
  driver_id:        uuid('driver_id').notNull().references(() => drivers.id),
  subscription_id:  uuid('subscription_id').notNull().references(() => subscriptions.id),
  went_online_at:   timestamptz('went_online_at').notNull(),
  went_offline_at:  timestamptz('went_offline_at'),
  duration_minutes: integer('duration_minutes'),
  created_at:       timestamptz('created_at').notNull().defaultNow(),
});

// ── compensation_queue ────────────────────────────────────────────
export const compensationQueue = pgTable('compensation_queue', {
  id:                uuid('id').defaultRandom().primaryKey(),
  payment_event_id:  uuid('payment_event_id').notNull().references(() => paymentEvents.id).unique(),
  attempt_count:     integer('attempt_count').notNull().default(0),
  max_attempts:      integer('max_attempts').notNull().default(10),
  next_retry_at:     timestamptz('next_retry_at').notNull().defaultNow(),
  status:            varchar('status', { length: 20 }).notNull().default('pending'),
  last_error:        text('last_error'),
  created_at:        timestamptz('created_at').notNull().defaultNow(),
  updated_at:        timestamptz('updated_at').notNull().defaultNow(),
}, (t) => [
  index('comp_queue_status_retry_idx').on(t.status, t.next_retry_at)
    .where(sql`status = 'pending'`),
]);

// ── system_config ─────────────────────────────────────────────────
export const systemConfig = pgTable('system_config', {
  key:        varchar('key', { length: 100 }).primaryKey(),
  value:      text('value').notNull(),
  updated_at: timestamptz('updated_at').notNull().defaultNow(),
});

// ── platform_config ───────────────────────────────────────────────
// Pricing policy & driver constraints. Admin-editable via GET/PATCH /api/admin/config.
// Read at runtime by lib/fareCalc.ts and utils-server/dispatch.ts.
export const platformConfig = pgTable('platform_config', {
  key:        varchar('key', { length: 100 }).primaryKey(),
  value:      text('value').notNull(),
  updated_at: timestamptz('updated_at').notNull().defaultNow(),
});

// ── vehicle_type_changes ──────────────────────────────────────────
export const vehicleTypeChanges = pgTable('vehicle_type_changes', {
  id:               uuid('id').defaultRandom().primaryKey(),
  driver_id:        uuid('driver_id').notNull().references(() => drivers.id),
  old_vehicle_type: vehicleTypeEnum('old_vehicle_type').notNull(),
  new_vehicle_type: vehicleTypeEnum('new_vehicle_type').notNull(),
  change_reason:    varchar('change_reason', { length: 20 }).notNull(),
  reason_text:      varchar('reason_text', { length: 500 }).notNull(),
  changed_by:       uuid('changed_by').references(() => users.id),
  status:           varchar('status', { length: 20 }).notNull().default('pending'),
  effective_at:     timestamptz('effective_at'),
  created_at:       timestamptz('created_at').notNull().defaultNow(),
  updated_at:       timestamptz('updated_at').notNull().defaultNow(),
}, (t) => [
  index('vtc_driver_created_idx').on(t.driver_id, t.created_at),
  index('vtc_cooling_off_idx').on(t.status, t.effective_at)
    .where(sql`status = 'cooling_off'`),
]);
```

> ⚠ **Migration note for vehicle_type enum:** When drizzle-kit generates the migration,
> it may try to rename or drop the old 4-value enum. You **must** manually review the
> generated SQL and follow the 5-step strategy in `05-DATA-MODEL.md § Migration note`.
> Never auto-apply this in production without human review.

### `scripts/seed-system-config.js` — CREATE

```javascript
// scripts/seed-system-config.js
// Seeds operational toggles and app version. All values admin-configurable at runtime
// via POST /api/admin/config. These are production defaults only.
const { drizzle } = require('drizzle-orm/neon-serverless');
const { neon } = require('@neondatabase/serverless');

async function seed() {
  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql);
  await db.execute(`
    INSERT INTO system_config (key, value, updated_at) VALUES
      ('dispatch_paused',        'false',  now()),
      ('min_app_version',        '1.0.0',  now()),
      ('brta_fare_ceiling_bdt',  '50000',  now()),   -- 500 BDT in paisa. Review vs current BRTA regs.
      ('max_free_wait_seconds',  '60',     now())    -- 60-second free wait for all vehicle types; auto-start after expiry
    ON CONFLICT (key) DO NOTHING;
  `);
  console.log('system_config seeded');
}
seed().catch(console.error);
```

### `scripts/seed-platform-config.js` — CREATE

```javascript
// scripts/seed-platform-config.js
// Seeds the platform_config table with driver-slider ratios and BRTA ceiling values.
// All values are admin-configurable at runtime via PATCH /api/admin/config.
// These are production defaults only. Safe to re-run — uses ON CONFLICT DO NOTHING.
const { drizzle } = require('drizzle-orm/neon-serverless');
const { neon }    = require('@neondatabase/serverless');

async function seed() {
  const sql = neon(process.env.DATABASE_URL);
  const db  = drizzle(sql);
  await db.execute(`
    INSERT INTO platform_config (key, value, updated_at) VALUES
      ('driver_min_ratio',           '0.70',  now()),   -- Lower slider bound: 70% of system per_km
      ('driver_max_ratio',           '1.50',  now()),   -- Upper slider bound: 150% of system per_km
      ('brta_max_base_bdt',          '8500',  now()),   -- BRTA base ceiling: ৳8500 paisa = ৳85
      ('brta_max_per_km_bdt',        '3400',  now()),   -- BRTA per-km ceiling: 3400 paisa = ৳34/km
      ('brta_max_wait_per_2min_bdt', '850',   now())    -- BRTA wait ceiling: 850 paisa/2min = ৳8.50
    ON CONFLICT (key) DO NOTHING;
  `);
  console.log('platform_config seeded (5 keys)');
}
seed().catch(console.error);
```

### `scripts/seed-pricing.js` — CREATE

```javascript
// scripts/seed-pricing.js
// Inserts/updates production pricing rows (all amounts in paisa).
// All values are admin-configurable at runtime via POST /api/admin/pricing.
// These are production seed defaults only.
// Usage: ACTIVE_ZONE_ID=<uuid> node scripts/seed-pricing.js
const { drizzle } = require('drizzle-orm/neon-serverless');
const { neon }    = require('@neondatabase/serverless');

const PRICING = [
  // vehicle_type, base_fare_bdt (paisa), per_km_bdt (paisa/km), per_min_bdt (paisa/min),
  // floor_length_km (decimal km), floor_min (integer minutes)
  // Floor = base_fare + round(per_km × floor_length_km) + (floor_min × per_min_bdt)
  // Free waiting is a platform-wide constant: 60 seconds (system_config.max_free_wait_seconds)
  { vehicle_type: 'bike_basic',    base_fare_bdt: 2500, per_km_bdt:  775, per_min_bdt: 175, floor_length_km: '2.00', floor_min: 10 },
  { vehicle_type: 'bike_standard', base_fare_bdt: 2500, per_km_bdt:  950, per_min_bdt: 180, floor_length_km: '2.00', floor_min: 10 },
  { vehicle_type: 'bike_plus',     base_fare_bdt: 2500, per_km_bdt: 1050, per_min_bdt: 190, floor_length_km: '2.00', floor_min: 10 },
  { vehicle_type: 'cng',           base_fare_bdt: 4000, per_km_bdt: 1500, per_min_bdt: 200, floor_length_km: '3.00', floor_min: 15 },
  { vehicle_type: 'car_economy',   base_fare_bdt: 4500, per_km_bdt: 1500, per_min_bdt: 350, floor_length_km: '4.00', floor_min: 20 },
  { vehicle_type: 'car_comfort',   base_fare_bdt: 5000, per_km_bdt: 1800, per_min_bdt: 375, floor_length_km: '4.00', floor_min: 20 },
  { vehicle_type: 'car_premium',   base_fare_bdt: 6500, per_km_bdt: 2100, per_min_bdt: 400, floor_length_km: '4.00', floor_min: 20 },
  { vehicle_type: 'car_xl',        base_fare_bdt: 8000, per_km_bdt: 2500, per_min_bdt: 425, floor_length_km: '4.00', floor_min: 20 },
];

async function seed() {
  const zoneId = process.env.ACTIVE_ZONE_ID;
  if (!zoneId) throw new Error('ACTIVE_ZONE_ID env var required');
  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql);
  for (const row of PRICING) {
    await db.execute(`
      INSERT INTO pricing
        (zone_id, vehicle_type, base_fare_bdt, per_km_bdt, per_min_bdt,
         floor_length_km, floor_min, is_active, created_at, updated_at)
      VALUES
        ('${zoneId}', '${row.vehicle_type}', ${row.base_fare_bdt}, ${row.per_km_bdt},
         ${row.per_min_bdt}, ${row.floor_length_km}, ${row.floor_min},
         true, now(), now())
      ON CONFLICT (zone_id, vehicle_type) WHERE is_active = true
      DO UPDATE SET
        base_fare_bdt    = EXCLUDED.base_fare_bdt,
        per_km_bdt       = EXCLUDED.per_km_bdt,
        per_min_bdt      = EXCLUDED.per_min_bdt,
        floor_length_km  = EXCLUDED.floor_length_km,
        floor_min        = EXCLUDED.floor_min,
        updated_at       = now();
    `);
  }
  console.log('pricing seeded (➜ 8 vehicle types, production fare matrix)');
}
seed().catch(console.error);
```

### `scripts/seed-packages.js` — CREATE

```javascript
// scripts/seed-packages.js
// All package attributes (call_count, duration_days, price_bdt, daily_cap) are
// admin-configurable at runtime via admin panel. These are production defaults.
const packages = [
  { name:'Free Trial',   call_count:5,   duration_days:7,  price_bdt:0,     is_trial:true,  daily_cap:5   },
  { name:'Starter 50',  call_count:50,  duration_days:30, price_bdt:30000, is_trial:false, daily_cap:50  },
  { name:'Pro 200',     call_count:200, duration_days:30, price_bdt:80000, is_trial:false, daily_cap:200 },
  { name:'Unlimited',   call_count:-1,  duration_days:30, price_bdt:150000,is_trial:false, daily_cap:200 },
];
// INSERT INTO packages ... ON CONFLICT DO NOTHING
```

---

## Phase 3 — Supabase Auth + dprelay Integration

### Supabase Project Setup (dashboard)

1. Create Supabase project at https://supabase.com/dashboard. Region: ap-southeast-1 (Singapore).
2. Configure dprelay as external SMS provider: Supabase Dashboard → Authentication → Phone → Custom SMS Provider. Set dprelay API endpoint and key.
3. Get connection string: Supabase Dashboard → Settings → Database → Connection string → URI. Copy to `DATABASE_URL`.
4. Get API keys: Supabase Dashboard → Settings → API. Copy `Project URL`, `anon public` key, and `service_role` key.

### `lib/supabase.ts` — CREATE (client-side Supabase initialization)

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

### `lib/supabase-server.ts` — CREATE (server-side Supabase initialization)

```typescript
// lib/supabase-server.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseServer = createClient(supabaseUrl, supabaseServiceRoleKey);
```

### Verify phone OTP flow works

1. Call `supabase.auth.signInWithOtp({ phone: '+8801XXXXXXXXX' })` from the app.
2. Supabase sends SMS via dprelay.
3. App auto-reads OTP or manual entry.
4. Call `supabase.auth.verifyOtp({ phone, token, type: 'sms' })`.
5. Supabase returns JWT session.
6. Call `POST /api/auth/verify-token` with JWT to check user record.
7. If new user: call `POST /api/register`.

---

## Phase 4 — Auth Layer

### `lib/auth.ts` — CREATE
```typescript
// lib/auth.ts
import { createClient } from '@supabase/supabase-js';
import { users } from '../db/schema';
import { db } from '../db';
import { eq } from 'drizzle-orm';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseServer = createClient(supabaseUrl, supabaseServiceRoleKey);

export async function verifySupabaseJWT(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing Authorization header');
  }
  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabaseServer.auth.getUser(token);
  if (error || !user) {
    throw new Error('Invalid or expired token');
  }
  return user; // user.id = Supabase Auth UID, user.phone from metadata
}

export async function requireAuth(request: Request) {
  const authUser = await verifySupabaseJWT(request);
  const [user] = await db.select().from(users).where(eq(users.auth_uid, authUser.id)).limit(1);
  if (!user) throw new Error('User not found');
  return { user, authUser };
}
```

### `app/api/register+api.ts` — FULL REWRITE (replace GlideX version)

```typescript
// app/api/register+api.ts
import { z } from 'zod';
import { db } from '../../src/db';
import { users, drivers } from '../../src/db/schema';
import { eq } from 'drizzle-orm';
import { verifySupabaseJWT } from '../../lib/auth';

const schema = z.object({
  name:           z.string().min(2).max(100),
  role:           z.enum(['rider','driver']),
  vehicle_type:   z.string().optional(),
});

export async function POST(request: Request) {
  const body = await request.json();

  // Reject if client tries to inject auth_uid or phone
  if ('auth_uid' in body || 'phone' in body)
    return Response.json({ error: 'body_field_forbidden' }, { status: 400 });

  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'invalid_body' }, { status: 400 });

  const { name, role, vehicle_type } = parsed.data;

  const authUser = await verifySupabaseJWT(request);

  // All DB work in one transaction
  try {
    const result = await db.transaction(async (tx) => {
      // Check phone uniqueness
      const [existing] = await tx.select().from(users).where(eq(users.phone, authUser.phone!));
      if (existing) throw { status: 409, error: 'phone_exists' };

      // INSERT user
      const [user] = await tx.insert(users).values({
        auth_uid: authUser.id, phone: authUser.phone!, name, role,
      }).returning();

      // INSERT driver if applicable
      if (role === 'driver') {
        await tx.insert(drivers).values({ user_id: user.id, vehicle_type: vehicle_type as any ?? 'bike_basic', status: 'pending' });
      }

      return { user_id: user.id, role };
    });

    return Response.json({ ...result, next: role === 'driver' ? '/driver/home' : '/rider/home' }, { status: 201 });
  } catch (e: any) {
    if (e?.status) return Response.json({ error: e.error }, { status: e.status });
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}
```

### `app/api/auth/verify-token+api.ts` — CREATE
```typescript
import { verifySupabaseJWT } from '../../../lib/auth';
import { db } from '../../../src/db';
import { users } from '../../../src/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: Request) {
  try {
    const authUser = await verifySupabaseJWT(request);
    const [user] = await db.select().from(users).where(eq(users.auth_uid, authUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'Register first via /api/register' }, { status: 404 });
    return Response.json({ user_id: user.id, role: user.role, phone: user.phone });
  } catch (e: any) {
    return Response.json({ error: 'unauthorized' }, { status: e.status ?? 401 });
  }
}
```

### `app/_layout.tsx` — MODIFY (Phase 4 full version)
```typescript
import { useEffect, useState } from 'react';
import { Slot, useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!session?.user) { router.replace('/(auth)/phone-entry'); setReady(true); return; }
      const token = session.access_token;
      const res = await fetch('/api/auth/verify-token', { method:'POST', headers: { Authorization:`Bearer ${token}` } });
      if (res.ok) {
        const { role } = await res.json();
        router.replace(role === 'driver' ? '/(main)/(rider)/' : '/(main)/(customer)/');
      } else {
        router.replace('/(auth)/phone-entry');
      }
      setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!ready) return null;  // or <SplashScreen />
  return <Slot />;
}
```

---

## Phase 5 — Payment System

### `lib/time.ts` — CREATE
```typescript
// lib/time.ts
export function nextBdtMidnightUtc(): Date {
  const now = new Date();
  // BDT is UTC+6
  const bdtNow = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const midnight = new Date(Date.UTC(bdtNow.getUTCFullYear(), bdtNow.getUTCMonth(), bdtNow.getUTCDate() + 1));
  return new Date(midnight.getTime() - 6 * 60 * 60 * 1000); // back to UTC
}
```

### `lib/bkash.ts` — CREATE

```typescript
// lib/bkash.ts
import { logger } from './logger';

let _token: string | null = null;
let _tokenExpiry = 0;

async function getToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiry - 60_000) return _token;
  const res = await fetch(`${process.env.BKASH_BASE_URL}/tokenized/checkout/token/grant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', username: process.env.BKASH_USERNAME!, password: process.env.BKASH_PASSWORD! },
    body: JSON.stringify({ app_key: process.env.BKASH_APP_KEY, app_secret: process.env.BKASH_APP_SECRET }),
  });
  const data = await res.json();
  _token = data.id_token;
  _tokenExpiry = Date.now() + (data.expires_in ?? 3600) * 1000;
  return _token!;
}

export const bkashClient = {
  getToken,
  async createPayment(params: { amount: number; idempotencyKey: string; callbackUrl: string }) {
    const token = await getToken();
    const res = await fetch(`${process.env.BKASH_BASE_URL}/tokenized/checkout/create`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', Authorization: token, 'X-APP-Key': process.env.BKASH_APP_KEY! },
      body: JSON.stringify({
        mode: '0011', payerReference: params.idempotencyKey,
        callbackURL: params.callbackUrl,
        amount: (params.amount / 100).toFixed(2),  // paisa → taka
        currency: 'BDT', intent: 'sale',
        merchantInvoiceNumber: params.idempotencyKey,
      }),
    });
    const data = await res.json();
    logger.info('[bKash] createPayment', { paymentID: data.paymentID, status: res.status });
    return { paymentID: data.paymentID as string, bkashURL: data.bkashURL as string };
  },
  async queryPayment(paymentID: string) {
    const token = await getToken();
    const res = await fetch(`${process.env.BKASH_BASE_URL}/tokenized/checkout/payment/status?paymentID=${paymentID}`, {
      headers: { Authorization: token, 'X-APP-Key': process.env.BKASH_APP_KEY! },
    });
    const data = await res.json();
    logger.info('[bKash] queryPayment', { paymentID, status: data.transactionStatus });
    return { transactionStatus: data.transactionStatus as string, trxID: data.trxID as string };
  },
  async executePayment(paymentID: string) {
    const token = await getToken();
    const res = await fetch(`${process.env.BKASH_BASE_URL}/tokenized/checkout/execute`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', Authorization: token, 'X-APP-Key': process.env.BKASH_APP_KEY! },
      body: JSON.stringify({ paymentID }),
    });
    const data = await res.json();
    return { transactionStatus: data.transactionStatus as string, trxID: data.trxID as string };
  },
};
```

### `lib/activateSubscription.ts` — CREATE

> **Single source of truth** for subscriptions + initial_load ledger writes.
> Called by: bKash callback, Nagad callback, compensationWorker, admin recovery.

```typescript
// lib/activateSubscription.ts
import { db } from '../src/db';
import { paymentEvents, packages, subscriptions, callLedger, creditVouchers } from '../src/db/schema';
import { eq, and } from 'drizzle-orm';
import { nextBdtMidnightUtc } from './time';
import { logger } from './logger';

export async function activateSubscription(paymentEventId: string): Promise<{ subscriptionId: string }> {
  return db.transaction(async (tx) => {
    // 1. Fetch payment event
    const [evt] = await tx.select().from(paymentEvents).where(eq(paymentEvents.id, paymentEventId));
    if (!evt) throw new Error(`payment_event not found: ${paymentEventId}`);

    // 2. Idempotency check
    if (evt.subscription_id) {
      logger.info('[activateSub] already activated', { paymentEventId, subscriptionId: evt.subscription_id });
      return { subscriptionId: evt.subscription_id };
    }

    // 3. Verify amount
    const [pkg] = await tx.select().from(packages).where(eq(packages.id, evt.package_id));
    if (!pkg) throw new Error(`package not found: ${evt.package_id}`);
    if (evt.amount_bdt !== pkg.price_bdt) throw new Error('amount_mismatch');

    const isUnlimited = pkg.call_count === -1;
    const expiresAt = new Date(Date.now() + pkg.duration_days * 86400_000);

    // 4. INSERT subscription
    const [sub] = await tx.insert(subscriptions).values({
      driver_id:          evt.driver_id,
      package_id:         evt.package_id,
      calls_remaining:    isUnlimited ? -1 : pkg.call_count,
      daily_reset_at:     nextBdtMidnightUtc(),
      status:             'active',
      expires_at:         expiresAt,
      total_deductions:   0,
      is_trial:           pkg.is_trial,
    }).returning();

    // 5. INSERT initial_load ledger entry
    await tx.insert(callLedger).values({
      subscription_id: sub.id,
      driver_id:       evt.driver_id,
      event_type:      'initial_load',
      delta:           isUnlimited ? -1 : pkg.call_count,
      balance_after:   isUnlimited ? -1 : pkg.call_count,
      reason:          'initial_load',
    });

    // 6. Apply active credit vouchers
    const vouchers = await tx.select().from(creditVouchers)
      .where(and(eq(creditVouchers.driver_id, evt.driver_id), eq(creditVouchers.status, 'active')));
    for (const v of vouchers) {
      if (!isUnlimited) {
        await tx.update(subscriptions).set({ calls_remaining: sub.calls_remaining + v.calls }).where(eq(subscriptions.id, sub.id));
      }
      await tx.update(creditVouchers).set({ status: 'redeemed', redeemed_subscription_id: sub.id }).where(eq(creditVouchers.id, v.id));
      await tx.insert(callLedger).values({
        subscription_id: sub.id, driver_id: evt.driver_id,
        event_type: 'credit', delta: v.calls, balance_after: sub.calls_remaining + v.calls,
        reason: 'pro_rata_credit',
      });
    }

    // 7. UPDATE payment event
    await tx.update(paymentEvents).set({ status: 'paid', confirmed_at: new Date(), subscription_id: sub.id })
      .where(eq(paymentEvents.id, paymentEventId));

    logger.info('[activateSub] success', { paymentEventId, subscriptionId: sub.id });
    return { subscriptionId: sub.id };
  });
}
```

### `utils-server/compensationWorker.ts` — CREATE

```typescript
// utils-server/compensationWorker.ts
import { db } from '../src/db';
import { compensationQueue } from '../src/db/schema';
import { and, eq, lte } from 'drizzle-orm';
import { activateSubscription } from '../lib/activateSubscription';
import { logger } from '../lib/logger';

const MAX_ATTEMPTS = 10;

function backoffMs(attempt: number): number {
  return Math.min(30_000 * Math.pow(2, attempt), 30 * 60_000); // max 30 min
}

export function startCompensationWorker(): void {
  setInterval(async () => {
    try {
      const rows = await db.select().from(compensationQueue)
        .where(and(eq(compensationQueue.status, 'pending'), lte(compensationQueue.next_retry_at, new Date())))
        .limit(10);

      for (const row of rows) {
        try {
          await activateSubscription(row.payment_event_id);
          await db.update(compensationQueue).set({ status: 'completed', updated_at: new Date() })
            .where(eq(compensationQueue.id, row.id));
          logger.info('[compensationWorker] success', { id: row.id });
        } catch (err) {
          const newCount = row.attempt_count + 1;
          if (newCount >= MAX_ATTEMPTS) {
            await db.update(compensationQueue).set({ status: 'failed', attempt_count: newCount, last_error: String(err), updated_at: new Date() })
              .where(eq(compensationQueue.id, row.id));
            logger.error('[compensationWorker] MAX_RETRIES_EXCEEDED', { id: row.id, payment_event_id: row.payment_event_id });
          } else {
            await db.update(compensationQueue).set({
              attempt_count: newCount, last_error: String(err),
              next_retry_at: new Date(Date.now() + backoffMs(newCount)), updated_at: new Date(),
            }).where(eq(compensationQueue.id, row.id));
          }
        }
      }
    } catch (e) { logger.error('[compensationWorker] tick error', e); }
  }, 30_000);
}
```

---

## Phase 6 — Dispatch Engine

### `lib/fareCalc.ts` — CREATE

All arithmetic **must** be in integer paisa. Never use floating-point division until display time.

```typescript
// lib/fareCalc.ts
import { logger } from './logger';

export interface PricingRow {
  base_fare_bdt:        number;         // paisa — charged on every ride
  per_km_bdt:           number;         // paisa per km
  intercity_per_km_bdt: number;         // paisa per km outside origin city; 0 = use per_km_bdt (no surcharge)
  per_min_bdt:          number;         // paisa per minute of billable ride time
  floor_length_km:      number;         // decimal km used for floor fare
  floor_min:            number;         // minutes used for floor fare
  brta_fare_ceiling_bdt?: number | null; // optional per-row ceiling (paisa)
  platform_commission_percent: number;  // e.g. 0.00 for zero commission
}

export interface PlatformCeilings {
  brta_max_base_bdt:          number;  // paisa
  brta_max_per_km_bdt:        number;  // paisa
  brta_max_wait_per_2min_bdt: number;  // paisa per 2 minutes
}

export interface FareBreakdown {
  base_fare_bdt:              number;   // paisa (always = pricing.base_fare_bdt)
  distance_charge_bdt:        number;   // paisa (= inside_charge_bdt + outside_charge_bdt)
  inside_charge_bdt:          number;   // paisa — round(per_km_bdt × inside_km)
  outside_charge_bdt:         number;   // paisa — round(effective_outside_rate × outside_km); 0 if not intercity
  time_charge_bdt:            number;   // paisa — 0 at estimate time, actual at completion
  total_bdt:                  number;   // paisa (after floor)
  floor_fare_bdt:             number;   // paisa (computed floor, for client display)
  distance_km:                number;   // km (inside_km + outside_km, for display only)
  origin_city:                string | null; // name of origin city; null if rural pickup
  is_intercity:               boolean;  // true if dropoff is outside origin city polygon
  inside_km:                  number;   // km inside origin city, rounded to 3 decimals
  outside_km:                 number;   // km outside origin city, rounded to 3 decimals; 0 if not intercity
  platform_commission_percent: number;  // e.g. 0.00 for zero commission
  platform_commission_bdt:     number;  // paisa — round(total_bdt × commission_percent / 100)
  driver_net_bdt:              number;  // paisa — total_bdt − platform_commission_bdt
}

/**
 * Calculate final fare in integer paisa.
 *
 * Formula (extended v2 with intercity split):
 *   effective_outside_rate = intercity_per_km_bdt > 0 ? intercity_per_km_bdt : per_km_bdt
 *   inside_charge  = round(per_km_bdt × inside_km)
 *   outside_charge = round(effective_outside_rate × outside_km)
 *   distance_charge = inside_charge + outside_charge
 *   time_charge      = ride_time_min × per_min_bdt          // integer; per_min_bdt is integer paisa
 *   computed_total   = base_fare_bdt + distance_charge + time_charge
 *   floor_fare       = base_fare_bdt + round(per_km_bdt × floor_length_km) + (floor_min × per_min_bdt)
 *   final_fare       = max(computed_total, floor_fare)
 *
 * For non-intercity rides: inside_km = distance_km, outside_km = 0.
 * For rural-origin rides: origin_city = null, is_intercity = false, outside_km = 0.
 * When intercity_per_km_bdt = 0, outside km uses normal per_km_bdt (no surcharge).
 *
 * Ride time (rideTimeMin):
 *   At estimation/request time → pass 0.
 *   At ride completion → caller computes:
 *     timer_start   = min(arrived_at + 60_000, started_at)  // 60s free wait is platform-wide constant
 *     if arrived_at IS NULL: timer_start = started_at
 *     ride_time_min = Math.ceil((completed_at - timer_start) / 60_000)
 *     After 60s from arrived_at, the scheduler auto-sets started_at and status=in_progress.
 *
 * BRTA ceiling violations are logged as warnings but never block a ride.
 */
export function calculateFare(
  pricing:      PricingRow,
  insideKm:     number,         // km inside origin city (or total distance for non-intercity)
  outsideKm:    number,         // km outside origin city; 0 for non-intercity
  rideTimeMin:  number,         // 0 at estimate time; actual ride_time_min at completion
  ceilings?:    PlatformCeilings,
): FareBreakdown {
  // Intercity rate fallback: if intercity_per_km_bdt = 0, use normal per_km_bdt for outside km
  const effectiveOutsideRate = pricing.intercity_per_km_bdt > 0
    ? pricing.intercity_per_km_bdt
    : pricing.per_km_bdt;

  // Integer paisa arithmetic — round after each multiplication
  const insideCharge    = Math.round(pricing.per_km_bdt * insideKm);
  const outsideCharge   = Math.round(effectiveOutsideRate * outsideKm);
  const distanceCharge  = insideCharge + outsideCharge;
  const timeCharge      = rideTimeMin * pricing.per_min_bdt;             // already integer
  const computedTotal   = pricing.base_fare_bdt + distanceCharge + timeCharge;
  const floorFare       = pricing.base_fare_bdt
                        + Math.round(pricing.per_km_bdt * pricing.floor_length_km)
                        + (pricing.floor_min * pricing.per_min_bdt);
  const finalFare       = Math.max(computedTotal, floorFare);

  // —— BRTA ceiling checks (warn-only, never block) ——————————————————————————————
  if (ceilings) {
    if (pricing.base_fare_bdt > ceilings.brta_max_base_bdt) {
      logger.warn('[fareCalc] base_fare exceeds BRTA ceiling', {
        value: pricing.base_fare_bdt, ceiling: ceilings.brta_max_base_bdt,
      });
    }
    if (pricing.per_km_bdt > ceilings.brta_max_per_km_bdt) {
      logger.warn('[fareCalc] per_km_bdt exceeds BRTA ceiling', {
        value: pricing.per_km_bdt, ceiling: ceilings.brta_max_per_km_bdt,
      });
    }
    // Convert per_min_bdt to per-2-min for BRTA comparison
    if (pricing.per_min_bdt * 2 > ceilings.brta_max_wait_per_2min_bdt) {
      logger.warn('[fareCalc] per_min_bdt (×2) exceeds BRTA ceiling', {
        value: pricing.per_min_bdt * 2,
        ceiling: ceilings.brta_max_wait_per_2min_bdt,
      });
    }
    if (pricing.brta_fare_ceiling_bdt != null && finalFare > pricing.brta_fare_ceiling_bdt) {
      logger.warn('[fareCalc] final fare exceeds per-row BRTA ceiling', {
        finalFare, ceiling: pricing.brta_fare_ceiling_bdt,
      });
    }
  }

  // Commission calculation (applied after floor fare)
  const commissionBdt = Math.round(finalFare * pricing.platform_commission_percent / 100);
  const driverNetBdt  = finalFare - commissionBdt;

  const totalDistanceKm = insideKm + outsideKm;

  return {
    base_fare_bdt:               pricing.base_fare_bdt,
    distance_charge_bdt:         distanceCharge,
    inside_charge_bdt:           insideCharge,
    outside_charge_bdt:          outsideCharge,
    time_charge_bdt:             timeCharge,
    total_bdt:                   finalFare,
    floor_fare_bdt:              floorFare,
    distance_km:                 totalDistanceKm,
    origin_city:                 null,  // set by caller
    is_intercity:                false, // set by caller
    inside_km:                   insideKm,
    outside_km:                  outsideKm,
    platform_commission_percent: pricing.platform_commission_percent,
    platform_commission_bdt:     commissionBdt,
    driver_net_bdt:              driverNetBdt,
  };
}

/** Divide paisa by 100 for display. Always call this at the UI boundary only. */
export function paisaToTaka(paisa: number): number {
  return paisa / 100;
}
```

**Usage in `app/api/ride/estimate+api.ts` and `app/api/ride/request+api.ts`:**
```typescript
import { calculateFare } from '../../../lib/fareCalc';
import { detectOriginCity, isIntercity } from '../../../lib/cityBoundary';
import { splitRoute } from '../../../lib/routeSplit';
import { db } from '../../../src/db';
import { pricing, platformConfig } from '../../../src/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

// Load ceilings from platform_config once per request (not cached — admin may change them)
async function loadCeilings() {
  const keys  = ['brta_max_base_bdt', 'brta_max_per_km_bdt', 'brta_max_wait_per_2min_bdt'];
  const rows  = await db.select().from(platformConfig).where(inArray(platformConfig.key, keys));
  const get   = (k: string) => parseInt(rows.find(r => r.key === k)?.value ?? '0');
  return {
    brta_max_base_bdt:          get('brta_max_base_bdt'),
    brta_max_per_km_bdt:        get('brta_max_per_km_bdt'),
    brta_max_wait_per_2min_bdt: get('brta_max_wait_per_2min_bdt'),
  };
}

// Then in your handler:
const [pricingRow] = await db.select().from(pricing)
  .where(and(eq(pricing.vehicle_type, vehicleType), eq(pricing.is_active, true)));
const ceilings = await loadCeilings();

// City detection and route splitting
const { origin_city, origin_city_polygon } = await detectOriginCity(pickup);
const intercity = origin_city_polygon ? isIntercity(dropoff, origin_city_polygon) : false;
let insideKm = 0, outsideKm = 0;

if (intercity && origin_city_polygon) {
  const split = await splitRoute(pickup, dropoff, origin_city_polygon);
  insideKm = split.inside_km;
  outsideKm = split.outside_km;
} else {
  // Non-intercity: all distance is inside (or rural — use total route distance)
  insideKm = totalRouteDistanceKm;
  outsideKm = 0;
}

const breakdown = calculateFare(pricingRow, insideKm, outsideKm, estimatedWaitMin, ceilings);
breakdown.origin_city = origin_city;
breakdown.is_intercity = intercity;
```

> ⚠️ **Key Invariant:** `lib/fareCalc.ts` must never import from `utils-server/`. It is a pure
> library used by both the Next.js API routes and any future test runners.

---

### `lib/vehicleTypes.ts` — CREATE
```typescript
// lib/vehicleTypes.ts
export const VEHICLE_TYPE_VALUES = ['bike_basic','bike_standard','bike_plus','cng','car_economy','car_comfort','car_premium','car_xl'] as const;
export type VehicleTypeEnum = typeof VEHICLE_TYPE_VALUES[number];

export interface VehicleTypeDefinition {
  key: VehicleTypeEnum;
  display_en: string;
  display_bn: string;
  cc_range: '≤100'|'101-150'|'>150'|null;
  has_ac: boolean|null;
  seats: number;
  min_age_years: number;
  max_age_years: number|null;
  driver_req: { min_rides?: number; min_rating?: number } | null;
}

export const VEHICLE_TYPES: VehicleTypeDefinition[] = [
  { key:'bike_basic',    display_en:'Bike Basic',    display_bn:'বাইক বেসিক',        cc_range:'≤100',     has_ac:null,  seats:1, min_age_years:1, max_age_years:null, driver_req:null },
  { key:'bike_standard', display_en:'Bike Standard', display_bn:'বাইক স্ট্যান্ডার্ড', cc_range:'101-150',  has_ac:null,  seats:1, min_age_years:1, max_age_years:null, driver_req:null },
  { key:'bike_plus',     display_en:'Bike Plus',     display_bn:'বাইক প্লাস',         cc_range:'>150',     has_ac:null,  seats:1, min_age_years:1, max_age_years:null, driver_req:null },
  { key:'cng',           display_en:'CNG',           display_bn:'সিএনজি',             cc_range:null,       has_ac:false, seats:3, min_age_years:1, max_age_years:null, driver_req:null },
  { key:'car_economy',   display_en:'Car Economy',   display_bn:'কার ইকোনমি',         cc_range:null,       has_ac:false, seats:4, min_age_years:1, max_age_years:15,   driver_req:null },
  { key:'car_comfort',   display_en:'Car Comfort',   display_bn:'কার কমফোর্ট',        cc_range:null,       has_ac:true,  seats:4, min_age_years:1, max_age_years:12,   driver_req:null },
  { key:'car_premium',   display_en:'Car Premium',   display_bn:'কার প্রিমিয়াম',      cc_range:null,       has_ac:true,  seats:4, min_age_years:1, max_age_years:8,    driver_req:{ min_rides:50, min_rating:4.5 } },
  { key:'car_xl',        display_en:'Car XL',        display_bn:'কার এক্সএল',          cc_range:null,       has_ac:true,  seats:7, min_age_years:1, max_age_years:12,   driver_req:{ min_rides:25, min_rating:4.3 } },
];

export function getVehicleType(key: VehicleTypeEnum): VehicleTypeDefinition {
  const t = VEHICLE_TYPES.find(v => v.key === key);
  if (!t) throw new Error(`Unknown vehicle type: ${key}`);
  return t;
}

export function checkDriverEligibility(
  vehicleType: VehicleTypeEnum,
  driver: { completed_rides_count: number; rating: number }
): { eligible: boolean; reason?: string } {
  const def = getVehicleType(vehicleType);
  if (!def.driver_req) return { eligible: true };
  const { min_rides, min_rating } = def.driver_req;
  if (min_rides && driver.completed_rides_count >= min_rides && driver.rating < (min_rating ?? 0))
    return { eligible: false, reason: `Rating must be ≥ ${min_rating} for ${vehicleType}` };
  return { eligible: true };
}

export function validateDriverMinKm(vehicleType: VehicleTypeEnum, zonePerKmBdt: number, minPerKmBdt: number): { valid: boolean; error?: string } {
  const lo = Math.floor(zonePerKmBdt * 0.70);
  const hi = Math.ceil(zonePerKmBdt * 1.50);
  if (minPerKmBdt < lo || minPerKmBdt > hi)
    return { valid: false, error: `min_per_km_bdt must be between ${lo} and ${hi} paisa (70%–150% of zone rate)` };
  return { valid: true };
}
```

### `lib/h3.ts` — CREATE
```typescript
// lib/h3.ts — only file that imports h3-js
import { latLngToCell, gridDisk, cellToBoundary } from 'h3-js';

const RESOLUTION = 9;  // ~174m cells

export function getH3Cell(lat: number, lng: number): string {
  return latLngToCell(lat, lng, RESOLUTION);
}

export function getH3Ring(lat: number, lng: number, k: number): string[] {
  return gridDisk(latLngToCell(lat, lng, RESOLUTION), k);
}

export function findNearbyDrivers(lat: number, lng: number, k = 2): string[] {
  // Returns H3 cell IDs at resolution 9 within k rings of the given coordinate
  return gridDisk(latLngToCell(lat, lng, RESOLUTION), k);
}
```

### `utils-server/h3Index.ts` — CREATE
```typescript
// utils-server/h3Index.ts
// In-memory index: Map<h3Cell, Map<vehicleType, Set<driverId>>>
import { db } from '../src/db';
import { drivers } from '../src/db/schema';
import { eq, isNotNull } from 'drizzle-orm';
import { logger } from '../lib/logger';

const TTL_MS = (parseInt(process.env.H3_CACHE_TTL_SECONDS ?? '30')) * 1000;

let index: Map<string, Map<string, Set<string>>> = new Map();
let lastRefresh = 0;

export function getDriversInCells(cells: string[], vehicleType: string): string[] {
  const ids = new Set<string>();
  for (const cell of cells) {
    const byType = index.get(cell);
    if (!byType) continue;
    for (const id of byType.get(vehicleType) ?? []) ids.add(id);
  }
  return [...ids];
}

export async function refreshH3Index(): Promise<void> {
  const rows = await db.select({
    id: drivers.id, h3_cell_res9: drivers.h3_cell_res9, vehicle_type: drivers.vehicle_type,
  }).from(drivers).where(eq(drivers.is_online, true));

  const newIndex: typeof index = new Map();
  for (const row of rows) {
    if (!row.h3_cell_res9) continue;
    if (!newIndex.has(row.h3_cell_res9)) newIndex.set(row.h3_cell_res9, new Map());
    const byType = newIndex.get(row.h3_cell_res9)!;
    if (!byType.has(row.vehicle_type)) byType.set(row.vehicle_type, new Set());
    byType.get(row.vehicle_type)!.add(row.id);
  }
  index = newIndex;
  lastRefresh = Date.now();
  logger.debug('[h3Index] refreshed', { cells: newIndex.size, drivers: rows.length });
}

export function startH3IndexRefresh(): void {
  refreshH3Index().catch(e => logger.error('[h3Index] initial refresh failed', e));
  setInterval(() => refreshH3Index().catch(e => logger.error('[h3Index] refresh error', e)), TTL_MS);
}

export function getLastRefreshAge(): number { return Date.now() - lastRefresh; }
```

### `utils-server/heartbeat.ts` — CREATE

> **This is the ONLY file that writes `event_type='deduction'` to `call_ledger`.**
> All other ledger writes (initial_load, credit, expiry_writeoff) go through `lib/activateSubscription.ts`.

```typescript
// utils-server/heartbeat.ts
import { db } from '../src/db';
import { subscriptions, callLedger, dispatchOffers, rides } from '../src/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../lib/logger';

const DEDUCTION_GRACE_MS = parseInt(process.env.CALL_DEDUCTION_GRACE_MS ?? '500');

interface HeartbeatContext {
  driverId: string;
  subscriptionId: string;
  rideId: string;
  confirmedAt: Date;
}

/**
 * Records a call deduction for a driver fetching/confirming a ride.
 * Uses a partial unique index on (ride_id, driver_id) WHERE event_type='deduction'
 * to prevent double-deduction even under concurrent calls.
 *
 * ONLY called from utils-server/heartbeat.ts — never imported elsewhere for deduction writes.
 */
export async function recordCallDeduction(ctx: HeartbeatContext): Promise<{ deducted: boolean }> {
  return db.transaction(async (tx) => {
    // 1. Lock and read subscription
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, ctx.subscriptionId));
    if (!sub || sub.status !== 'active') {
      logger.warn('[heartbeat] deduction skipped — no active subscription', ctx);
      return { deducted: false };
    }

    // 2. Check daily cap
    const isUnlimited = sub.calls_remaining === -1;
    const pkg = { daily_cap: 200 }; // fetch from packages join in production
    if (sub.daily_calls_used >= pkg.daily_cap) {
      logger.warn('[heartbeat] daily cap reached', ctx);
      return { deducted: false };
    }

    // 3. Check finite balance
    if (!isUnlimited && sub.calls_remaining <= 0) {
      logger.warn('[heartbeat] zero balance', ctx);
      return { deducted: false };
    }

    // 4. INSERT deduction — unique index prevents duplicate
    try {
      await tx.insert(callLedger).values({
        subscription_id: ctx.subscriptionId,
        driver_id:       ctx.driverId,
        ride_id:         ctx.rideId,
        event_type:      'deduction',
        delta:           -1,
        balance_after:   isUnlimited ? -1 : sub.calls_remaining - 1,
        reason:          'app_fetch',
      });
    } catch (e: any) {
      if (e.code === '23505') {  // unique violation = already deducted
        logger.info('[heartbeat] duplicate deduction prevented', ctx);
        return { deducted: false };
      }
      throw e;
    }

    // 5. UPDATE subscription balance
    await tx.update(subscriptions).set({
      calls_remaining:  isUnlimited ? -1 : sub.calls_remaining - 1,
      daily_calls_used: sub.daily_calls_used + 1,
      total_deductions: sub.total_deductions + 1,
    }).where(eq(subscriptions.id, ctx.subscriptionId));

    return { deducted: true };
  });
}
```

### `utils-server/dispatch.ts` — CREATE

```typescript
// utils-server/dispatch.ts
import { db } from '../src/db';
import { drivers, dispatchOffers, rides, systemConfig, pricing } from '../src/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getH3Ring } from '../lib/h3';
import { getDriversInCells } from './h3Index';
import { checkDriverEligibility } from '../lib/vehicleTypes';
import { logger } from '../lib/logger';

// Scoring weights (must sum to 1.0)
const W_DISTANCE    = 0.40;
const W_RATING      = 0.30;
const W_ACCEPTANCE  = 0.20;
const W_AVAILABILITY= 0.10;

export interface ScoredDriver {
  driverId: string;
  score: number;
}

export async function isDispatchPaused(): Promise<boolean> {
  const [row] = await db.select().from(systemConfig).where(eq(systemConfig.key, 'dispatch_paused'));
  return row?.value === 'true';
}

export async function scoreAndBatchDrivers(
  rideId: string,
  originLat: number,
  originLng: number,
  vehicleType: string,
  zoneId: string,          // needed to look up the correct pricing row
  batchSize = 5,
): Promise<ScoredDriver[]> {
  // 1. H3 geo-lookup (pre-filtered by vehicle type)
  const cells = getH3Ring(originLat, originLng, 2);
  const candidateIds = getDriversInCells(cells, vehicleType);
  if (!candidateIds.length) return [];

  // 2. Look up system per_km_bdt for this vehicle type (used for min_per_km filter)
  const [pricingRow] = await db.select({ per_km_bdt: pricing.per_km_bdt })
    .from(pricing)
    .where(and(
      eq(pricing.vehicle_type, vehicleType as any),
      eq(pricing.zone_id, zoneId),
      eq(pricing.is_active, true),
    ))
    .limit(1);
  const systemPerKmBdt = pricingRow?.per_km_bdt ?? 0;

  // 3. Fetch driver rows (filter by vehicle_type, is_online, status)
  const driverRows = await db.select({
    id: drivers.id,
    last_location_lat: drivers.last_location_lat,
    last_location_lng: drivers.last_location_lng,
    rating: drivers.rating,
    acceptance_rate: drivers.acceptance_rate,
    last_location_at: drivers.last_location_at,
    completed_rides_count: drivers.completed_rides_count,
    min_per_km_bdt: drivers.min_per_km_bdt,
    vehicle_type: drivers.vehicle_type,
  }).from(drivers).where(
    and(
      eq(drivers.is_online, true),
      eq(drivers.status, 'active'),
      eq(drivers.vehicle_type, vehicleType as any),
      inArray(drivers.id, candidateIds),
    )
  );

  // 4. Exclude drivers already in dispatch_offers for this ride
  const existingOffers = await db.select({ driver_id: dispatchOffers.driver_id })
    .from(dispatchOffers).where(eq(dispatchOffers.ride_id, rideId));
  const alreadyOffered = new Set(existingOffers.map(o => o.driver_id));

  // 5. Score each driver
  const scored: ScoredDriver[] = [];
  for (const d of driverRows) {
    if (alreadyOffered.has(d.id)) continue;

    // Eligibility gate (car_premium, car_xl)
    const { eligible } = checkDriverEligibility(vehicleType as any, {
      completed_rides_count: d.completed_rides_count,
      rating: parseFloat(d.rating?.toString() ?? '5'),
    });
    if (!eligible) continue;

    // Min per-km rate filter: skip drivers whose minimum rate exceeds the system rate.
    // Record a 'filtered' dispatch_offer row so the driver's missed-requests stat is accurate.
    if (d.min_per_km_bdt != null && systemPerKmBdt < d.min_per_km_bdt) {
      await db.insert(dispatchOffers).values({
        ride_id:         rideId,
        driver_id:       d.id,
        batch_index:     -1,             // -1 = never sent, excluded pre-dispatch
        sent_at:         new Date(),
        outcome:         'filtered' as any,
        filtered_reason: 'min_per_km',
      }).onConflictDoNothing();          // idempotent: ride may be re-processed
      continue;
    }

    // Distance score (inverse Haversine — closer is better)
    const distKm = haversineKm(
      originLat, originLng,
      parseFloat(d.last_location_lat?.toString() ?? '0'),
      parseFloat(d.last_location_lng?.toString() ?? '0'),
    );
    const distScore    = Math.max(0, 1 - distKm / 5);   // 5km = 0 score
    const ratingScore  = (parseFloat(d.rating?.toString() ?? '5') - 1) / 4;  // 1–5 → 0–1
    const acceptScore  = parseFloat(d.acceptance_rate?.toString() ?? '100') / 100;
    const availScore   = 1.0;  // availability bonus (all online drivers get 1.0 for now)

    const score = W_DISTANCE * distScore + W_RATING * ratingScore + W_ACCEPTANCE * acceptScore + W_AVAILABILITY * availScore;
    scored.push({ driverId: d.id, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, batchSize);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLon = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
```

### `utils-server/index.ts` — FULL REWRITE

```typescript
// utils-server/index.ts
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { validateServerEnv } from '../lib/env';
import { startH3IndexRefresh, refreshH3Index } from './h3Index';
import { startCompensationWorker } from './compensationWorker';
import { startScheduler } from './scheduler';
import { logger } from '../lib/logger';

validateServerEnv();

// Offer lock map to deduplicate concurrent fetch:confirm
const offerLocks = new Map<string, true>();  // key: 'rideId:driverId'

const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200); res.end('ok'); }
  else { res.writeHead(404); res.end(); }
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket, req) => {
  logger.info('[ws] new connection');
  ws.on('message', (raw) => {
    // message routing to heartbeat.ts handlers
  });
  ws.on('close', () => {
    // write driver_online_sessions.went_offline_at here
  });
});

// Startup recovery
async function startup() {
  await refreshH3Index();  // rebuild H3 index from DB
  startH3IndexRefresh();
  startCompensationWorker();
  startScheduler();
  // TODO: re-offer rides WHERE status='dispatching' AND updated_at < now() - 60s

  const PORT = parseInt(process.env.UTILS_SERVER_PORT ?? '3001');
  server.listen(PORT, () => logger.info(`[ws] listening on :${PORT}`));
}

startup().catch(e => { logger.error('[startup] fatal', e); process.exit(1); });
```

---

## Phase 6 (continued) — `utils-server/scheduler.ts`

This file contains 14 cron jobs. Below is the critical path subset:

```typescript
// utils-server/scheduler.ts  (key cron jobs only — expand per 12-FOLDER-STRUCTURE.md)
import cron from 'node-cron';           // or setInterval — see note below
import { db } from '../src/db';
import { rides, subscriptions, systemConfig, vehicles, vehicleTypeChanges } from '../src/db/schema';
import { and, eq, lt, lte, isNull, isNotNull, sql } from 'drizzle-orm';
import { scoreAndBatchDrivers } from './dispatch';
import { nextBdtMidnightUtc } from '../lib/time';
import { logger } from '../lib/logger';

// NOTE: use node-cron for named jobs or setInterval for simplicity.
// All intervals below use setInterval for clarity; replace with cron if preferred.

export function startScheduler(): void {
  // ── (1) Scheduled ride dispatch — every 60s ──────────────────
  setInterval(async () => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + 120_000); // 2 min ahead
    const cutoffLo = new Date(now.getTime() + 60_000); // 1 min ahead
    const scheduled = await db.select().from(rides).where(
      and(
        eq(rides.status, 'pending'),
        isNotNull(rides.scheduled_at),
        isNull(rides.scheduled_dispatched_at),
        lte(rides.scheduled_at, cutoff),
        sql`${rides.scheduled_at} >= ${cutoffLo}`,
      )
    );
    for (const ride of scheduled) {
      await db.update(rides).set({ scheduled_dispatched_at: now }).where(eq(rides.id, ride.id));
      // trigger dispatch
    }
  }, 60_000);

  // ── (10) Subscription expiry — every 60s ─────────────────────
  setInterval(async () => {
    await db.update(subscriptions)
      .set({ status: 'expired' })
      .where(and(eq(subscriptions.status, 'active'), lt(subscriptions.expires_at, new Date())));
  }, 60_000);

  // ── (13) Stale matched rides — every 60s ──────────────────────
  setInterval(async () => {
    const staleThreshold = new Date(Date.now() - 30 * 60_000);
    await db.update(rides).set({ status: 'cancelled', cancelled_by: 'system', cancel_reason: 'driver_no_show' })
      .where(and(eq(rides.status, 'matched'), lt(rides.matched_at, staleThreshold)));
  }, 60_000);

  // ── Vehicle type cooling-off promotion — every 60s ───────────
  setInterval(async () => {
    const now = new Date();
    const due = await db.select().from(vehicleTypeChanges).where(
      and(eq(vehicleTypeChanges.status, 'cooling_off'), lte(vehicleTypeChanges.effective_at, now))
    );
    for (const change of due) {
      await db.transaction(async (tx) => {
        await tx.update(vehicleTypeChanges).set({ status: 'approved' }).where(eq(vehicleTypeChanges.id, change.id));
        // update drivers.vehicle_type and vehicles.vehicle_type
      });
    }
  }, 60_000);

  logger.info('[scheduler] started');
}
```

---

## Phase 7 — New Features (Platform Config, Driver Slider, Alternatives)

These items implement the features added in the PRD/API update. All depend on Phase 6 being complete.

---

### `app/api/driver/slider-config+api.ts` — CREATE

```typescript
// app/api/driver/slider-config+api.ts
import { db } from '../../../src/db';
import { drivers, pricing, platformConfig } from '../../../src/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireRole } from '../../../lib/auth';

export async function GET(req: Request) {
  const decoded = await requireRole(req, 'driver');
  if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const [driver] = await db.select({ vehicle_type: drivers.vehicle_type })
    .from(drivers).where(eq(drivers.user_id, decoded.userId)).limit(1);
  if (!driver) return Response.json({ error: 'Driver not found' }, { status: 404 });

  // Get active pricing for this vehicle type (zone-agnostic — use first active row)
  const [pricingRow] = await db.select({ per_km_bdt: pricing.per_km_bdt })
    .from(pricing)
    .where(and(eq(pricing.vehicle_type, driver.vehicle_type), eq(pricing.is_active, true)))
    .limit(1);
  const systemPerKmBdt = pricingRow?.per_km_bdt ?? 0;

  // Get ratios from platform_config
  const configRows = await db.select()
    .from(platformConfig)
    .where(inArray(platformConfig.key, ['driver_min_ratio', 'driver_max_ratio']));
  const get = (k: string, def: number) =>
    parseFloat(configRows.find(r => r.key === k)?.value ?? String(def));
  const minRatio = get('driver_min_ratio', 0.70);
  const maxRatio = get('driver_max_ratio', 1.50);

  return Response.json({
    vehicle_type:     driver.vehicle_type,
    system_per_km_bdt: systemPerKmBdt,
    min_ratio:        minRatio,
    max_ratio:        maxRatio,
    lower_bound:      Math.floor(systemPerKmBdt * minRatio),
    upper_bound:      Math.ceil(systemPerKmBdt * maxRatio),
  });
}
```

---

### `app/api/driver/me+api.ts` — PATCH handler addition

Add the `min_per_km_bdt` update logic to the PATCH handler. This is an addition to the existing PATCH handler built in Phase 4.

```typescript
// Inside PATCH handler for /api/driver/me
// After parsing the request body and verifying the driver exists:

const { min_per_km_bdt } = body as { min_per_km_bdt?: number };

if (min_per_km_bdt !== undefined) {
  if (!Number.isInteger(min_per_km_bdt) || min_per_km_bdt < 0) {
    return Response.json({ error: 'min_per_km_bdt must be a non-negative integer' }, { status: 400 });
  }

  // Validate against slider bounds
  const [pricingRow] = await db.select({ per_km_bdt: pricing.per_km_bdt })
    .from(pricing)
    .where(and(eq(pricing.vehicle_type, driver.vehicle_type), eq(pricing.is_active, true)))
    .limit(1);
  const systemPerKmBdt = pricingRow?.per_km_bdt ?? 0;

  const configRows = await db.select()
    .from(platformConfig)
    .where(inArray(platformConfig.key, ['driver_min_ratio', 'driver_max_ratio']));
  const get = (k: string, def: number) =>
    parseFloat(configRows.find(r => r.key === k)?.value ?? String(def));
  const lowerBound = Math.floor(systemPerKmBdt * get('driver_min_ratio', 0.70));
  const upperBound = Math.ceil(systemPerKmBdt  * get('driver_max_ratio', 1.50));

  if (min_per_km_bdt !== 0 && (min_per_km_bdt < lowerBound || min_per_km_bdt > upperBound)) {
    // 0 = driver clearing the minimum (allowed)
    return Response.json({
      error: `min_per_km_bdt must be 0 (clear) or between ${lowerBound} and ${upperBound}`,
      system_rate_bdt:    systemPerKmBdt,
      percent_of_system:  null,
    }, { status: 400 });
  }

  const savedValue = min_per_km_bdt === 0 ? null : min_per_km_bdt;
  await db.update(drivers).set({ min_per_km_bdt: savedValue }).where(eq(drivers.id, driver.id));

  return Response.json({
    min_per_km_bdt:   savedValue,
    system_rate_bdt:  systemPerKmBdt,
    percent_of_system: savedValue ? Math.round((savedValue / systemPerKmBdt) * 100) : null,
  });
}
```

> **Rule:** `min_per_km_bdt = null` in the DB means the driver has no minimum (accepts all dispatches).
> `min_per_km_bdt = 0` in the PATCH body clears the minimum (sets DB NULL). Any other value must be within slider bounds.

---

### `app/api/admin/config+api.ts` — CREATE

```typescript
// app/api/admin/config+api.ts
import { db } from '../../../src/db';
import { platformConfig } from '../../../src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '../../../lib/auth';

// Keys admin is allowed to read/write via this endpoint
const ALLOWED_KEYS = new Set([
  'driver_min_ratio',
  'driver_max_ratio',
  'brta_max_base_bdt',
  'brta_max_per_km_bdt',
  'brta_max_wait_per_2min_bdt',
]);

export async function GET(req: Request) {
  const decoded = await requireRole(req, 'admin');
  if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await db.select().from(platformConfig);
  return Response.json({ config });
}

export async function PATCH(req: Request) {
  const decoded = await requireRole(req, 'admin');
  if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { updates: Array<{ key: string; value: string }> };
  if (!Array.isArray(body.updates) || body.updates.length === 0) {
    return Response.json({ error: 'updates must be a non-empty array' }, { status: 400 });
  }

  const errors: string[] = [];
  for (const { key, value } of body.updates) {
    if (!ALLOWED_KEYS.has(key)) {
      errors.push(`Unknown key: ${key}`);
      continue;
    }
    if (isNaN(parseFloat(value))) {
      errors.push(`Value for ${key} must be numeric, got: ${value}`);
      continue;
    }
    // Sanity-check ratios stay in a safe range
    if ((key === 'driver_min_ratio' || key === 'driver_max_ratio')) {
      const v = parseFloat(value);
      if (v < 0.10 || v > 5.00) {
        errors.push(`${key} must be between 0.10 and 5.00`);
        continue;
      }
    }
  }
  if (errors.length) return Response.json({ errors }, { status: 400 });

  for (const { key, value } of body.updates) {
    if (!ALLOWED_KEYS.has(key)) continue;
    await db.update(platformConfig)
      .set({ value, updated_at: new Date() })
      .where(eq(platformConfig.key, key));
  }

  const config = await db.select().from(platformConfig);
  return Response.json({ config });
}
```

---

### `app/api/ride/[id]/alternatives+api.ts` — CREATE

Serves the alternatives list when dispatch returns `status = 'no_drivers'`.

```typescript
// app/api/ride/[id]/alternatives+api.ts
import { db } from '../../../../src/db';
import { rides, drivers, pricing } from '../../../../src/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { requireRole } from '../../../../lib/auth';
import { getH3Ring } from '../../../../lib/h3';
import { getDriversInCells } from '../../../../utils-server/h3Index';
import { calculateFare } from '../../../../lib/fareCalc';
import { VEHICLE_TYPE_VALUES } from '../../../../lib/vehicleTypes';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const decoded = await requireRole(req, 'rider');
  if (!decoded) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const [ride] = await db.select().from(rides)
    .where(and(eq(rides.id, params.id), eq(rides.user_id, decoded.userId)))
    .limit(1);
  if (!ride) return Response.json({ error: 'Ride not found' }, { status: 404 });
  if (ride.status !== 'no_drivers' && ride.status !== 'pending') {
    return Response.json({ error: 'Ride not in no_drivers state' }, { status: 409 });
  }

  // Find available vehicle types in pickup H3 cell + ring-1
  const cells = getH3Ring(
    parseFloat(ride.origin_latitude?.toString() ?? '0'),
    parseFloat(ride.origin_longitude?.toString() ?? '0'),
    1,
  );

  const alternatives: Array<{
    vehicle_type: string;
    fare_breakdown: object;
    available_drivers: number;
  }> = [];

  for (const vt of VEHICLE_TYPE_VALUES) {
    if (vt === ride.vehicle_type) continue; // skip the already-requested type
    const driverIds = getDriversInCells(cells, vt);
    if (!driverIds.length) continue;

    // Get pricing for this vehicle type
    const [pricingRow] = await db.select().from(pricing)
      .where(and(eq(pricing.vehicle_type, vt as any), eq(pricing.is_active, true)))
      .limit(1);
    if (!pricingRow) continue;

    const breakdown = calculateFare(
      pricingRow,
      parseFloat(ride.distance_km?.toString() ?? '0'),
      0, // assume 0 wait for estimate
    );
    alternatives.push({
      vehicle_type:      vt,
      fare_breakdown:    breakdown,
      available_drivers: driverIds.length,
    });
  }

  return Response.json({
    ride_id:                params.id,
    requested_vehicle_type: ride.vehicle_type,
    alternatives,
  });
}
```

> **Note:** The alternatives endpoint reads from the in-memory H3 index (`utils-server/h3Index.ts`). Since this is a Next.js API route (not in `utils-server/`), it imports from `h3Index.ts` directly. Ensure that `utils-server/h3Index.ts` exports `getDriversInCells` as a named export callable from the Next.js context, **or** call the `utils-server` process via a local HTTP call. For MVP, co-location in the same process is acceptable.

---

### Key Invariants Update (Phase 7 additions)

| Invariant | File enforcing it |
|-----------|-------------------|
| `platform_config` reads at request time (not cached) | `app/api/driver/slider-config`, `app/api/driver/me`, `lib/fareCalc.ts` usage |
| Fare arithmetic in integer paisa, `Math.round` after each multiply | `lib/fareCalc.ts` |
| Floor fare (`base + round(per_km × floor_length_km) + floor_min × per_min_bdt`) applied before returning fare | `lib/fareCalc.ts — calculateFare()` |
| BRTA ceiling violations logged but never block rides | `lib/fareCalc.ts — logger.warn` |
| `min_per_km_bdt = null` ⇒ no minimum (dispatch includes driver) | `utils-server/dispatch.ts` |
| Filtered drivers recorded as `dispatch_offers(outcome='filtered')` | `utils-server/dispatch.ts` |
| Admin config only changes `ALLOWED_KEYS` | `app/api/admin/config+api.ts` |

---

## Key Invariants — Quick Reference

| Invariant | File enforcing it |
|-----------|-------------------|
| `event_type='deduction'` writes **only** | `utils-server/heartbeat.ts` |
| `initial_load`, `credit`, `expiry_writeoff` writes **only** | `lib/activateSubscription.ts` |
| Subscription activation **only** | `lib/activateSubscription.ts` |
| `h3-js` import **only** | `lib/h3.ts` and `utils-server/h3Index.ts` |
| Payment credentials **never** in `EXPO_PUBLIC_*` | enforced by `lib/env.ts` + linting |
| `call_ledger` double-deduction blocked by DB | `unique partial index (ride_id, driver_id) WHERE event_type='deduction'` |
| Single active subscription per driver | `unique partial index (driver_id) WHERE status='active'` on subscriptions |
| Single trial per driver | `unique partial index (driver_id) WHERE is_trial=true AND status IN ('active','expired')` |
| Dispatch skips paused state | `utils-server/dispatch.ts: isDispatchPaused()` reads `system_config.dispatch_paused` |
| Admin routes never in `app/(main)/` | placement rule in `12-FOLDER-STRUCTURE.md` |
| Supabase client utilities in `lib/` | placement rule in `12-FOLDER-STRUCTURE.md` |
| Clerk/Stripe imports **zero** | P1 cleanup + CI anti-pattern check |
| Fare arithmetic in integer paisa; `Math.round` only after multiply | `lib/fareCalc.ts` — never `/ 100` inside calculateFare |
| Floor fare applied inside `calculateFare` | `lib/fareCalc.ts` — `total_bdt = Math.max(computedTotal, floorFare)` |
| BRTA ceiling violations warn-only, never block | `lib/fareCalc.ts` — `logger.warn` only |
| `platform_config` read from DB at request time, never module-cached | `app/api/driver/slider-config`, `PATCH /api/driver/me`, `lib/fareCalc.ts` callers |
| `min_per_km_bdt = null` in DB ⇒ driver accepts all dispatches | `utils-server/dispatch.ts` filter condition |
| Filtered drivers recorded in `dispatch_offers(outcome='filtered')` | `utils-server/dispatch.ts` min_per_km branch |
| Slider bound validation only in `lib/validateMinPerKm.ts` | never inline in handlers |

---

## Grep Anti-Patterns to Run Before Each PR

```bash
# Zero Clerk/Stripe
grep -r "@clerk\|stripe\|resend" --include="*.ts" --include="*.tsx" . | grep -v node_modules

# No deductions outside heartbeat.ts
grep -r "event_type.*deduction\|deduction.*event_type" --include="*.ts" . \
  | grep -v "heartbeat.ts" | grep -v "schema.ts" | grep -v ".test.ts"

# No activation logic outside activateSubscription.ts
grep -r "INSERT.*subscriptions\|INSERT.*call_ledger" --include="*.ts" . \
  | grep -v "activateSubscription.ts" | grep -v "schema.ts" | grep -v ".test.ts"

# No in-memory compensation (was a TD item)
grep -r "compensationQueue\s*=\s*\[\]" --include="*.ts" .

# No h3-js outside allowed files
grep -r "from 'h3-js'\|require('h3-js')" --include="*.ts" . \
  | grep -v "lib/h3.ts" | grep -v "h3Index.ts"

# No EXPO_PUBLIC_ in payment/server files
grep -r "EXPO_PUBLIC_" lib/bkash.ts lib/nagad.ts lib/auth.ts lib/activateSubscription.ts 2>/dev/null

# No /100 inside fareCalc.ts except via paisaToTaka (float guard)
grep -n "/ 100\|\/100" lib/fareCalc.ts | grep -v "paisaToTaka\|#\|//"

# No module-level platform_config cache
grep -rn "^const.*platform\|^let.*platform" --include="*.ts" . \
  | grep -v "from\|import\|schema\|test"

# Admin config endpoint must not accept unknown keys
grep -n "ALLOWED_KEYS" app/api/admin/config+api.ts  # must exist
```

---

## Recent Updates

### Commission System & Waiting Time Clarification
- **Capabilities:** Commission System (Capability 1) + Waiting Time Clarification (Capability 2)
- **Files modified:** 01-PRD.md, 02-ARCHITECTURE.md, 05-DATA-MODEL.md, 06-API.md, 07-USER-FLOWS.md, 08-UI-SPEC.md, 09-UX-SPEC.md, 13-CONVENTIONS.md, 14-DEV-CHECKLIST.yaml, 14-DEV-CHECKLIST.json, 19-GLOSSARY.md, 20-DEVELOPER-CHANGE-LIST.md, 21-MIGRATION-SQL.md, 22-TEST-TEMPLATES.md
- **Migration required:** Yes (ALTER TABLE + enum value + system_config seeds)

### Intercity Geo-Fencing Model (replaces district-based intercity design)
- **Files ADD:**
  - `lib/cityBoundary.ts` — point-in-polygon city detection with 60s TTL cache. Exports: `detectOriginCity()`, `isIntercity()`, `clearCityBoundaryCache()`.
  - `lib/routeSplit.ts` — Barikoi Route API integration with Turf.js route splitting. Exports: `splitRoute()`. Falls back to Haversine with urban factors.
  - `scripts/seed-city-boundaries.js` — seeds 8 divisional city boundary polygons.
  - `scripts/update-bangladesh-zone-polygon.js` — updates active zone with Bangladesh mainland border polygon.
  - `app/(admin)/city-boundaries/` — admin CRUD UI for city boundary management (reuse zone map editor).
- **Files MODIFY:**
  - `src/db/schema.ts` — add `city_boundaries` table; add `intercity_per_km_bdt` column to `pricing`.
  - `lib/fareCalc.ts` — extend `calculateFare` to accept `inside_km`, `outside_km`, `intercity_per_km_bdt`; add `inside_charge_bdt`, `outside_charge_bdt`, `origin_city`, `is_intercity` to FareBreakdown. Ensure `intercity_per_km_bdt = 0` fallback: `effective_outside_rate = intercity_per_km_bdt > 0 ? intercity_per_km_bdt : per_km_bdt`.
  - `app/api/ride/request+api.ts` — integrate city detection (detectOriginCity) and route splitting (splitRoute) into ride request flow.
  - `app/api/ride/estimate+api.ts` — same integration for pre-request fare estimates.
  - `app/api/ride/:id/complete+api.ts` — recompute inside_km/outside_km at ride completion using actual route distance.
  - `utils-server/dispatch.ts` — no changes needed; intercity detection happens at request time, not dispatch time.
- **Files REMOVE (old district-based design):**
  - `intercity_routes` table (DROP via M-13 migration).
  - `intercity_min_distance_km` from `system_config` (DELETE via M-13 migration).
  - `intercity_surcharge_bdt`, `pre_promo_total_bdt`, `post_promo_total_bdt` from FareBreakdown (if present).
- **Migrations:** M-10 (city_boundaries table + seed), M-11 (intercity_per_km_bdt column + seed), M-12 (zone polygon UPDATE), M-13 (DROP intercity_routes).
- **Env vars:** `BARIKOI_API_KEY` already in 11-ENV-VARS.md. `CITY_BOUNDARY_CACHE_TTL_MS` (default 60000) for cache TTL. Verify `@turf/turf` and `@mapbox/polyline` in package.json.
- **Package additions:** `@turf/turf@^7`, `@mapbox/polyline@^2` (installed in P1-09).
- **Zero-hardcoding:** All per-km rates, city polygons, and thresholds are admin-configurable and stored in the DB. No city name or rate is hardcoded in `lib/fareCalc.ts`, `lib/cityBoundary.ts`, or `lib/routeSplit.ts`.
