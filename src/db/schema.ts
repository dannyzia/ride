import {
  pgTable, pgEnum, uuid, varchar, text, integer, boolean,
  numeric, smallint, date, jsonb, primaryKey,
  uniqueIndex, index, timestamp as ts
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// timestamptz compat for drizzle-orm versions that use timestamp() with withTimezone
const timestamptz = (col: string) => ts(col, { withTimezone: true });

export const vehicleTypeEnum = pgEnum('vehicle_type', [
  'bike_basic', 'bike_standard', 'bike_plus',
  'cng',
  'car_economy', 'car_comfort', 'car_premium', 'car_xl',
]);
export const userRoleEnum          = pgEnum('user_role',          ['rider', 'driver', 'admin']);
export const driverStatusEnum      = pgEnum('driver_status',      ['pending', 'temporary', 'active', 'suspended', 'rejected']);
export const rideStatusEnum        = pgEnum('ride_status',        ['pending', 'dispatching', 'matched', 'driver_arriving', 'driver_arrived', 'in_progress', 'completed', 'cancelled', 'expired', 'no_drivers']);
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

export const users = pgTable('users', {
  id:               uuid('id').defaultRandom().primaryKey(),
  firebase_uid:     varchar('firebase_uid', { length: 128 }).notNull().unique(),
  phone:            varchar('phone', { length: 20 }).notNull().unique(),
  number:           varchar('number', { length: 20 }),
  name:             varchar('name', { length: 255 }).notNull(),
  email:            varchar('email', { length: 255 }),
  role:             userRoleEnum('role').notNull().default('rider'),
  profile_image_url:varchar('profile_image_url', { length: 500 }),
  device_id:        varchar('device_id', { length: 255 }),
  device_bound_at:  timestamptz('device_bound_at'),
  created_at:       timestamptz('created_at').notNull().defaultNow(),
  updated_at:       timestamptz('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('users_firebase_uid_idx').on(t.firebase_uid),
  uniqueIndex('users_phone_idx').on(t.phone),
]);

export const drivers = pgTable('drivers', {
  id:                       uuid('id').defaultRandom().primaryKey(),
  user_id:                  uuid('user_id').notNull().references(() => users.id).unique(),
  vehicle_id:               uuid('vehicle_id'),
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

export const vehicles = pgTable('vehicles', {
  id:                       uuid('id').defaultRandom().primaryKey(),
  driver_id:                uuid('driver_id').notNull().references(() => drivers.id).unique(),
  vehicle_type:             vehicleTypeEnum('vehicle_type').notNull(),
  manufacturer:             varchar('manufacturer', { length: 100 }).notNull(),
  model:                    varchar('model', { length: 100 }).notNull(),
  manufacturing_year:       integer('manufacturing_year').notNull(),
  cc_range:                 varchar('cc_range', { length: 30 }),
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

export const packages = pgTable('packages', {
  id:            uuid('id').defaultRandom().primaryKey(),
  name:          varchar('name', { length: 100 }).notNull(),
  call_count:    integer('call_count').notNull(),
  duration_days: integer('duration_days').notNull(),
  price_bdt:     integer('price_bdt').notNull(),
  is_trial:      boolean('is_trial').notNull().default(false),
  is_active:     boolean('is_active').notNull().default(true),
  daily_cap:     integer('daily_cap').notNull().default(200),
  created_at:    timestamptz('created_at').notNull().defaultNow(),
  updated_at:    timestamptz('updated_at').notNull().defaultNow(),
  deleted_at:    timestamptz('deleted_at'),
});

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
  uniqueIndex('subs_one_active_per_driver').on(t.driver_id)
    .where(sql`status = 'active'`),
  uniqueIndex('subs_one_trial_per_driver').on(t.driver_id)
    .where(sql`is_trial = true AND status IN ('active','expired')`),
]);

export const creditVouchers = pgTable('credit_vouchers', {
  id:                      uuid('id').defaultRandom().primaryKey(),
  driver_id:               uuid('driver_id').notNull().references(() => drivers.id),
  calls:                   integer('calls').notNull(),
  expires_at:              timestamptz('expires_at').notNull(),
  redeemed_subscription_id:uuid('redeemed_subscription_id').references(() => subscriptions.id),
  status:                  varchar('status', { length: 20 }).notNull().default('active'),
  created_at:              timestamptz('created_at').notNull().defaultNow(),
});

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
  uniqueIndex('call_ledger_no_double_deduct')
    .on(t.ride_id, t.driver_id)
    .where(sql`event_type = 'deduction'`),
]);

export const rides = pgTable('rides', {
  id:                   uuid('id').defaultRandom().primaryKey(),
  user_id:              uuid('user_id').notNull().references(() => users.id),
  driver_id:            uuid('driver_id').references(() => drivers.id),
  zone_id:              uuid('zone_id').notNull(),
  pricing_id:           uuid('pricing_id').notNull(),
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
  platform_commission_bdt: integer('platform_commission_bdt'),
  scheduled_at:         timestamptz('scheduled_at'),
  matched_at:           timestamptz('matched_at'),
  arrived_at:           timestamptz('arrived_at'),
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

export const dispatchOffers = pgTable('dispatch_offers', {
  id:                  uuid('id').defaultRandom().primaryKey(),
  ride_id:             uuid('ride_id').notNull().references(() => rides.id),
  driver_id:           uuid('driver_id').notNull().references(() => drivers.id),
  batch_index:         smallint('batch_index').notNull(),
  sent_at:             timestamptz('sent_at').notNull(),
  fetch_confirmed_at:  timestamptz('fetch_confirmed_at'),
  responded_at:        timestamptz('responded_at'),
  outcome:             offerOutcomeEnum('outcome').notNull().default('delivered'),
  rejection_reason:   varchar('rejection_reason', { length: 100 }),
  filtered_reason:     varchar('filtered_reason', { length: 50 }),
  created_at:          timestamptz('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('dispatch_offers_ride_driver_idx').on(t.ride_id, t.driver_id),
  index('dispatch_offers_driver_sent_idx').on(t.driver_id, t.sent_at),
  index('dispatch_offers_filtered_idx').on(t.driver_id, t.outcome, t.sent_at)
    .where(sql`outcome = 'filtered'`),
]);

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

export const usedChallenges = pgTable('used_challenges', {
  jti:        varchar('jti', { length: 64 }).primaryKey(),
  used_at:    timestamptz('used_at').notNull().defaultNow(),
  expires_at: timestamptz('expires_at').notNull(),
});

export const rateLimits = pgTable('rate_limits', {
  key:          varchar('key', { length: 128 }).notNull(),
  window_start: timestamptz('window_start').notNull(),
  count:        integer('count').notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.key, t.window_start] }),
]);

export const paymentEvents = pgTable('payment_events', {
  id:               uuid('id').defaultRandom().primaryKey(),
  driver_id:        uuid('driver_id').references(() => drivers.id),
  package_id:       uuid('package_id').references(() => packages.id),
  idempotency_key:  varchar('idempotency_key', { length: 64 }).notNull().unique(),
  provider:         paymentProviderEnum('provider').notNull(),
  provider_txn_id:  varchar('provider_txn_id', { length: 255 }),
  amount_bdt:       integer('amount_bdt').notNull(),
  status:           paymentStatusEnum('status').notNull().default('initiated'),
  initiated_at:     timestamptz('initiated_at').notNull().defaultNow(),
  confirmed_at:     timestamptz('confirmed_at'),
  subscription_id:  uuid('subscription_id').references(() => subscriptions.id),
  ride_id:          uuid('ride_id').references(() => rides.id),
  created_at:       timestamptz('created_at').notNull().defaultNow(),
  updated_at:       timestamptz('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('payment_events_idempotency_idx').on(t.idempotency_key),
]);

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
  uniqueIndex('documents_one_per_type').on(t.driver_id, t.doc_type)
    .where(sql`status IN ('pending','approved') AND deleted_at IS NULL`),
]);

export const zones = pgTable('zones', {
  id:         uuid('id').defaultRandom().primaryKey(),
  name:       varchar('name', { length: 100 }).notNull(),
  polygon:    jsonb('polygon').notNull(),
  is_active:  boolean('is_active').notNull().default(false),
  created_at: timestamptz('created_at').notNull().defaultNow(),
  updated_at: timestamptz('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('zones_one_active').on(sql`(1)`)
    .where(sql`is_active = true`),
]);

export const pricing = pgTable('pricing', {
  id:                         uuid('id').defaultRandom().primaryKey(),
  zone_id:                    uuid('zone_id').notNull().references(() => zones.id),
  vehicle_type:               vehicleTypeEnum('vehicle_type').notNull(),
  base_fare_bdt:              integer('base_fare_bdt').notNull(),
  per_km_bdt:                 integer('per_km_bdt').notNull(),
  per_min_wait_bdt:           integer('per_min_wait_bdt').notNull(),
  free_wait_minutes:          integer('free_wait_minutes').notNull(),
  platform_commission_percent:integer('platform_commission_percent'),
  is_active:                  boolean('is_active').notNull().default(true),
  brta_fare_ceiling_bdt:      integer('brta_fare_ceiling_bdt'),
  minimum_fare_bdt:           integer('minimum_fare_bdt').notNull(),
  created_at:           timestamptz('created_at').notNull().defaultNow(),
  updated_at:           timestamptz('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('pricing_zone_type_active_idx').on(t.zone_id, t.vehicle_type)
    .where(sql`is_active = true`),
  index('pricing_vehicle_type_idx').on(t.vehicle_type),
]);

export const chatMessages = pgTable('chat_messages', {
  id:         uuid('id').defaultRandom().primaryKey(),
  ride_id:    uuid('ride_id').notNull().references(() => rides.id),
  sender_id:  uuid('sender_id').notNull().references(() => users.id),
  content:    text('content').notNull(),
  created_at: timestamptz('created_at').notNull().defaultNow(),
}, (t) => [
  index('chat_messages_ride_created_idx').on(t.ride_id, t.created_at),
]);

export const driverOnlineSessions = pgTable('driver_online_sessions', {
  id:               uuid('id').defaultRandom().primaryKey(),
  driver_id:        uuid('driver_id').notNull().references(() => drivers.id),
  subscription_id:  uuid('subscription_id').notNull().references(() => subscriptions.id),
  went_online_at:   timestamptz('went_online_at').notNull(),
  went_offline_at:  timestamptz('went_offline_at'),
  duration_minutes: integer('duration_minutes'),
  created_at:       timestamptz('created_at').notNull().defaultNow(),
});

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

export const systemConfig = pgTable('system_config', {
  key:        varchar('key', { length: 100 }).primaryKey(),
  value:      text('value').notNull(),
  updated_at: timestamptz('updated_at').notNull().defaultNow(),
});

export const platformConfig = pgTable('platform_config', {
  key:        varchar('key', { length: 100 }).primaryKey(),
  value:      text('value').notNull(),
  updated_at: timestamptz('updated_at').notNull().defaultNow(),
});

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
