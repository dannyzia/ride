import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  numeric,
  smallint,
  date,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
  timestamp as ts,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// timestamptz compat for drizzle-orm versions that use timestamp() with withTimezone
const timestamptz = (col: string) => ts(col, { withTimezone: true });

export const vehicleTypeEnum = pgEnum("vehicle_type", [
  "bike_basic",
  "bike_standard",
  "bike_plus",
  "cng",
  "car_economy",
  "car_comfort",
  "car_premium",
  "car_xl",
]);
export const userRoleEnum = pgEnum("user_role", ["rider", "driver", "admin"]);
export const driverStatusEnum = pgEnum("driver_status", [
  "pending",
  "temporary",
  "active",
  "suspended",
  "rejected",
]);
export const discountTypeEnum = pgEnum("discount_type", ["percent", "flat"]);
export const rideStatusEnum = pgEnum("ride_status", [
  "pending",
  "dispatching",
  "matched",
  "driver_arriving",
  "driver_arrived",
  "in_progress",
  "completed",
  "cancelled",
  "expired",
  "no_drivers",
  "scheduled",
]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "expired",
  "suspended",
]);
export const callEventTypeEnum = pgEnum("call_event_type", [
  "deduction",
  "refund",
  "credit",
  "initial_load",
  "expiry_writeoff",
]);
export const paymentProviderEnum = pgEnum("payment_provider", ["portpos"]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "initiated",
  "paid",
  "failed",
  "callback_pending",
]);
export const documentTypeEnum = pgEnum("document_type", [
  "license_front",
  "license_back",
  "reg_scan_front",
  "reg_scan_back",
  "fitness_scan",
  "tax_token_scan",
  "brta_certificate",
  "vehicle_photo_front",
  "vehicle_photo_left",
  "vehicle_photo_right",
  "vehicle_photo_back",
  "legacy_screenshot",
  "owner_consent_scan",
  "helmet_photo",
  "dashboard_photo",
  "interior_photo",
  "third_row_photo",
  "driver_photo",
  "vehicle_video",
  "vehicle_photo_seats",
  "nid_front",
  "nid_back",
  "uber_screenshot",
  "pathao_screenshot",
  "obhai_screenshot",
  "indrive_screenshot",
]);
export const documentStatusEnum = pgEnum("document_status", [
  "pending",
  "approved",
  "rejected",
]);
export const offerOutcomeEnum = pgEnum("offer_outcome", [
  "delivered",
  "accepted",
  "rejected",
  "expired",
  "refunded",
  "filtered",
]);
export const ownerConsentStatusEnum = pgEnum("owner_consent_status", [
  "pending",
  "approved",
  "rejected",
  "expired",
]);
export const targetMetricEnum = pgEnum("target_metric", [
  "completed_rides",
  "online_hours",
  "acceptance_rate",
  "consecutive_accepts",
]);
export const registrationAreaEnum = pgEnum("registration_area", [
  "DHAKA_METRO",
  "CHITTAGONG_METRO",
  "KHULNA_METRO",
  "RAJSHAHI_METRO",
  "BARISAL_METRO",
  "SYLHET_METRO",
  "RANGPUR_METRO",
  "MYMENSINGH_METRO",
]);
export const vehicleClassLetterEnum = pgEnum("vehicle_class_letter", [
  "KA",
  "KHA",
  "GA",
  "GHA",
  "CHA",
  "CHHA",
  "JA",
  "JHA",
  "TA",
  "THA",
  "DA",
  "NA",
  "PA",
  "BHA",
  "MA",
  "DAW",
  "THAW",
  "HA",
  "LA",
  "EE",
  "YA",
]);
export const faceMatchStatusEnum = pgEnum("face_match_status", [
  "pending",
  "matched",
  "low_confidence",
  "failed",
  "not_applicable",
]);
export const creditVoucherSourceEnum = pgEnum("credit_voucher_source", [
  "pro_rata",
  "incentive_reward",
  "admin_grant",
]);
export const walletDriverTxnTypeEnum = pgEnum(
  "wallet_driver_transaction_type",
  ["promo_receivable", "referral_receivable", "payout", "adjustment", "cancellation_compensation"],
);
export const walletRiderTxnTypeEnum = pgEnum("wallet_rider_transaction_type", [
  "referral_reward",
  "ride_discount",
  "adjustment",
  "upfront_tip",
  "cashback_earn",
  "cashback_redeem",
  "cashback_expire",
]);
export const pointTransactionTypeEnum = pgEnum("point_transaction_type", [
  "earned",
  "redeemed",
  "expired",
]);
export const pointSourceTypeEnum = pgEnum("point_source_type", [
  "ride",
  "commission",
  "admin_grant",
]);
export const pointRewardTypeEnum = pgEnum("point_reward_type", [
  "package_grant",
  "wallet_credit",
]);
export const referralStatusEnum = pgEnum("referral_status", [
  "pending",
  "rewarded",
]);
export const vehicleChangeReasonEnum = pgEnum("vehicle_change_reason", [
  "admin_downgrade",
  "admin_upgrade",
  "driver_request",
]);
export const vehicleChangeStatusEnum = pgEnum("vehicle_change_status", [
  "pending",
  "approved",
  "rejected",
  "cooling_off",
]);

export const cancellationCreditStatusEnum = pgEnum("cancellation_credit_status", [
  "pending",
  "applied",
  "expired",
]);

export const riderFeeDeductionStatusEnum = pgEnum("rider_fee_deduction_status", [
  "pending",
  "partially_collected",
  "collected",
  "expired",
]);

export const zoneLifecycleStageEnum = pgEnum("zone_lifecycle_stage", [
  "candidate",
  "pilot",
  "active",
  "growth",
  "mature",
  "expansion",
  "paused",
  "closed",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    auth_uid: varchar("auth_uid", { length: 128 }).notNull().unique(),
    phone: varchar("phone", { length: 20 }).notNull().unique(),
    number: varchar("number", { length: 20 }),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    city: varchar("city", { length: 100 }),
    role: userRoleEnum("role").notNull().default("rider"),
    profile_image_url: varchar("profile_image_url", { length: 500 }),
    device_id: varchar("device_id", { length: 255 }),
    device_bound_at: timestamptz("device_bound_at"),
    rating: numeric("rating", { precision: 3, scale: 2 }),
    rating_count: integer("rating_count").notNull().default(0),
    rating_sum: integer("rating_sum").notNull().default(0),
    account_status: varchar("account_status", { length: 20 }).default("active"),
    fraud_score: integer("fraud_score").default(0),
    total_rides: integer("total_rides").default(0),
    total_spent_bdt: integer("total_spent_bdt").default(0),
    last_ride_at: timestamptz("last_ride_at"),
    sos_contact: varchar("sos_contact", { length: 20 }),
    rider_wallet_balance_bdt: integer("rider_wallet_balance_bdt")
      .notNull()
      .default(0),
    notification_prefs: jsonb("notification_prefs"),
    security_settings: jsonb("security_settings"),
    linked_accounts: jsonb("linked_accounts"),
    data_controls: jsonb("data_controls"),
    deleted_at: timestamptz("deleted_at"),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_auth_uid_idx").on(t.auth_uid),
    uniqueIndex("users_phone_idx").on(t.phone),
  ],
);

export const drivers = pgTable(
  "drivers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id)
      .unique(),
    vehicle_id: uuid("vehicle_id"),
    vehicle_type: vehicleTypeEnum("vehicle_type").notNull(),
    status: driverStatusEnum("status").notNull().default("pending"),
    rating: numeric("rating", { precision: 3, scale: 2 })
      .notNull()
      .default("5.00"),
    rating_count: integer("rating_count").notNull().default(0),
    rating_sum: integer("rating_sum").notNull().default(0),
    min_per_km_bdt: integer("min_per_km_bdt"),
    vehicle_registration_date: date("vehicle_registration_date"),
    address: text("address"),
    license_number: varchar("license_number", { length: 100 }),
    owner_consent_verified: boolean("owner_consent_verified")
      .notNull()
      .default(false),
    is_legacy_operator: boolean("is_legacy_operator").notNull().default(false),
    provisional_expires_at: timestamptz("provisional_expires_at"),
    acceptance_rate: numeric("acceptance_rate", { precision: 5, scale: 2 })
      .notNull()
      .default("100.00"),
    completed_rides_count: integer("completed_rides_count")
      .notNull()
      .default(0),
    is_online: boolean("is_online").notNull().default(false),
    last_location_lat: numeric("last_location_lat", {
      precision: 10,
      scale: 7,
    }),
    last_location_lng: numeric("last_location_lng", {
      precision: 10,
      scale: 7,
    }),
    last_location_at: timestamptz("last_location_at"),
    h3_cell_res9: varchar("h3_cell_res9", { length: 20 }),
    zone_id: uuid("zone_id"),
    consent_accepted: boolean("consent_accepted").default(false),
    consent_version: varchar("consent_version", { length: 20 }),
    consent_accepted_at: timestamptz("consent_accepted_at"),
    stage2_due_at: timestamptz("stage2_due_at"),
    brta_certificate_url: text("brta_certificate_url"),
    driver_wallet_balance_bdt: integer("driver_wallet_balance_bdt")
      .notNull()
      .default(0),
    on_break: boolean("on_break").notNull().default(false),
    break_started_at: timestamptz("break_started_at"),
    auto_accept_enabled: boolean("auto_accept_enabled").notNull().default(false),
    auto_accept_radius_meters: integer("auto_accept_radius_meters").notNull().default(500),
    gender: varchar("gender", { length: 10 }),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("drivers_user_id_idx").on(t.user_id),
    index("drivers_h3_cell_idx").on(t.h3_cell_res9),
    index("drivers_online_status_idx").on(t.is_online, t.status),
    index("drivers_vehicle_type_idx").on(t.vehicle_type),
    index("drivers_last_location_at_idx").on(t.last_location_at),
    index("drivers_vehicle_id_idx").on(t.vehicle_id),
    index("drivers_min_per_km_idx")
      .on(t.min_per_km_bdt)
      .where(sql`min_per_km_bdt IS NOT NULL`),
    index("drivers_completed_rides_idx").on(t.completed_rides_count),
    index("drivers_brta_cert_idx")
      .on(t.brta_certificate_url)
      .where(sql`brta_certificate_url IS NOT NULL`),
  ],
);

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driver_id: uuid("driver_id")
      .notNull()
      .references(() => drivers.id)
      .unique(),
    vehicle_type: vehicleTypeEnum("vehicle_type").notNull(),
    manufacturer: varchar("manufacturer", { length: 100 }).notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    manufacturing_year: integer("manufacturing_year").notNull(),
    cc_range: varchar("cc_range", { length: 30 }),
    has_ac: boolean("has_ac"),
    passenger_seats: integer("passenger_seats").notNull(),
    registration_area: registrationAreaEnum("registration_area").notNull(),
    vehicle_class_letter: vehicleClassLetterEnum(
      "vehicle_class_letter",
    ).notNull(),
    registration_number: varchar("registration_number", { length: 50 })
      .notNull()
      .unique(),
    registration_date: date("registration_date").notNull(),
    fitness_expires_at: date("fitness_expires_at").notNull(),
    tax_token_expires_at: date("tax_token_expires_at").notNull(),
    admin_type_note: text("admin_type_note"),
    type_change_effective_at: timestamptz("type_change_effective_at"),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("vehicles_driver_id_idx").on(t.driver_id),
    uniqueIndex("vehicles_reg_number_idx").on(t.registration_number),
    index("vehicles_fitness_expires_idx").on(t.fitness_expires_at),
    index("vehicles_tax_token_expires_idx").on(t.tax_token_expires_at),
    index("vehicles_vehicle_type_idx").on(t.vehicle_type),
    index("vehicles_type_change_idx")
      .on(t.type_change_effective_at)
      .where(sql`type_change_effective_at IS NOT NULL`),
    index("vehicles_registration_date_idx").on(t.registration_date),
  ],
);

export const packages = pgTable(
  "packages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    call_count: integer("call_count").notNull(),
    duration_days: integer("duration_days").notNull(),
    price_bdt: integer("price_bdt").notNull(),
    is_trial: boolean("is_trial").notNull().default(false),
    is_active: boolean("is_active").notNull().default(true),
    daily_cap: integer("daily_cap").notNull().default(200),
    vehicle_type: vehicleTypeEnum("vehicle_type"),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
    deleted_at: timestamptz("deleted_at"),
  },
  (t) => [index("packages_vehicle_type_idx").on(t.vehicle_type)],
);

export const promoCodes = pgTable(
  "promo_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 30 }).notNull().unique(),
    title: varchar("title", { length: 100 }),
    description: text("description"),
    discount_type: discountTypeEnum("discount_type").notNull(),
    discount_value: integer("discount_value").notNull(),
    max_uses: integer("max_uses"),
    max_uses_per_rider: integer("max_uses_per_rider").notNull().default(1),
    max_discount_bdt: integer("max_discount_bdt"),
    min_spend_bdt: integer("min_spend_bdt"),
    usage_interval: integer("usage_interval"), // F15-API-09: valid only on every Nth completed ride; NULL = no interval
    valid_from: timestamptz("valid_from").notNull(),
    expires_at: timestamptz("expires_at").notNull(),
    is_active: boolean("is_active").notNull().default(true),
    target_role: varchar("target_role", { length: 20 }).notNull().default("rider"),
    metric: varchar("metric", { length: 30 }),
    target_value: integer("target_value"),
    validity_days: integer("validity_days").notNull().default(7),
    created_by: uuid("created_by").references(() => users.id),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
    deleted_at: timestamptz("deleted_at"),
  },
  (t) => [
    uniqueIndex("promo_codes_lower_idx").on(sql`LOWER(${t.code})`),
    index("promo_codes_active_dates_idx").on(
      t.is_active,
      t.valid_from,
      t.expires_at,
    ),
  ],
);

export const promoRedemptions = pgTable(
  "promo_redemptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    promo_code_id: uuid("promo_code_id")
      .notNull()
      .references(() => promoCodes.id),
    rider_id: uuid("rider_id")
      .notNull()
      .references(() => users.id),
    ride_id: uuid("ride_id")
      .notNull()
      .references(() => rides.id),
    discount_type: discountTypeEnum("discount_type").notNull(),
    discount_value: integer("discount_value").notNull(),
    discounted_amount_bdt: integer("discounted_amount_bdt").notNull(),
    driver_fare_bdt: integer("driver_fare_bdt").notNull(),
    rider_payable_bdt: integer("rider_payable_bdt").notNull(),
    platform_subsidy_bdt: integer("platform_subsidy_bdt").notNull(),
    created_at: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("promo_redemptions_unique_idx").on(
      t.promo_code_id,
      t.rider_id,
      t.ride_id,
    ),
    index("promo_redemptions_rider_idx").on(t.rider_id, t.created_at),
    index("promo_redemptions_ride_idx").on(t.ride_id),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driver_id: uuid("driver_id")
      .notNull()
      .references(() => drivers.id),
    package_id: uuid("package_id")
      .notNull()
      .references(() => packages.id),
    calls_remaining: integer("calls_remaining").notNull(),
    daily_calls_used: integer("daily_calls_used").notNull().default(0),
    daily_reset_at: timestamptz("daily_reset_at").notNull(),
    cap_override: numeric("cap_override", { precision: 3, scale: 2 }),
    status: subscriptionStatusEnum("status").notNull().default("active"),
    purchased_at: timestamptz("purchased_at").notNull().defaultNow(),
    expires_at: timestamptz("expires_at").notNull(),
    credit_calls_received: integer("credit_calls_received")
      .notNull()
      .default(0),
    total_deductions: integer("total_deductions").notNull().default(0),
    is_trial: boolean("is_trial").notNull().default(false),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("subs_driver_status_idx").on(t.driver_id, t.status),
    uniqueIndex("subs_one_active_per_driver")
      .on(t.driver_id)
      .where(sql`status = 'active'`),
    uniqueIndex("subs_one_trial_per_driver")
      .on(t.driver_id)
      .where(sql`is_trial = true AND status IN ('active','expired')`),
    index("subs_expires_active_idx")
      .on(t.expires_at)
      .where(sql`status = 'active'`),
  ],
);

export const creditVouchers = pgTable(
  "credit_vouchers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driver_id: uuid("driver_id")
      .notNull()
      .references(() => drivers.id),
    calls: integer("calls").notNull(),
    source: creditVoucherSourceEnum("source").notNull().default("pro_rata"),
    source_ref_id: uuid("source_ref_id"),
    expires_at: timestamptz("expires_at").notNull(),
    redeemed_subscription_id: uuid("redeemed_subscription_id").references(
      () => subscriptions.id,
    ),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("credit_vouchers_driver_active_idx")
      .on(t.driver_id)
      .where(sql`status = 'active'`),
    index("credit_vouchers_source_ref_idx")
      .on(t.source, t.source_ref_id)
      .where(sql`source_ref_id IS NOT NULL`),
  ],
);

export const callLedger = pgTable(
  "call_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subscription_id: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id),
    driver_id: uuid("driver_id")
      .notNull()
      .references(() => drivers.id),
    ride_id: uuid("ride_id").references(() => rides.id),
    event_type: callEventTypeEnum("event_type").notNull(),
    delta: integer("delta").notNull(),
    balance_after: integer("balance_after").notNull(),
    reason: varchar("reason", { length: 255 }).notNull(),
    created_at: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("call_ledger_driver_date_idx").on(t.driver_id, t.created_at),
    uniqueIndex("call_ledger_no_double_deduct")
      .on(t.ride_id, t.driver_id)
      .where(sql`event_type = 'deduction'`),
    index("call_ledger_sub_date_idx").on(t.subscription_id, t.created_at),
  ],
);

export const rides = pgTable(
  "rides",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    driver_id: uuid("driver_id").references(() => drivers.id),
    zone_id: uuid("zone_id").notNull(),
    pricing_id: uuid("pricing_id").notNull(),
    origin_address: varchar("origin_address", { length: 255 }).notNull(),
    destination_address: varchar("destination_address", {
      length: 255,
    }).notNull(),
    origin_latitude: numeric("origin_latitude", {
      precision: 10,
      scale: 7,
    }).notNull(),
    origin_longitude: numeric("origin_longitude", {
      precision: 10,
      scale: 7,
    }).notNull(),
    destination_latitude: numeric("destination_latitude", {
      precision: 10,
      scale: 7,
    }).notNull(),
    destination_longitude: numeric("destination_longitude", {
      precision: 10,
      scale: 7,
    }).notNull(),
    vehicle_type: vehicleTypeEnum("vehicle_type").notNull(),
    status: rideStatusEnum("status").notNull().default("pending"),
    fare_breakdown: jsonb("fare_breakdown").notNull(),
    surge_multiplier: numeric("surge_multiplier", { precision: 4, scale: 2 }),
    surge_zone_id: uuid("surge_zone_id"),
    wait_start_at: timestamptz("wait_start_at"),
    wait_end_at: timestamptz("wait_end_at"),
    wait_fee_bdt: integer("wait_fee_bdt").notNull().default(0),
    secondary_rider_name: varchar("secondary_rider_name", { length: 255 }),
    secondary_rider_phone: varchar("secondary_rider_phone", { length: 20 }),
    is_booked_for_someone_else: boolean("is_booked_for_someone_else").default(false),
    reminder_sent: boolean("reminder_sent").default(false),
    cancellation_fee_bdt: integer("cancellation_fee_bdt"),
    cancellation_compensation_driver_id: uuid("cancellation_compensation_driver_id")
      .references(() => drivers.id),
    cancellation_fee_applied: boolean("cancellation_fee_applied").notNull().default(false),
    cancellation_fee_pending: boolean("cancellation_fee_pending").notNull().default(false),
    upfront_tip_bdt: integer("upfront_tip_bdt").default(0),
    // Set when an upfront tip was promised at request but the rider's wallet
    // couldn't cover it at completion. Never silently drop the tip: the amount
    // is recorded and surfaced to the driver (see [id]/complete+api.ts).
    upfront_tip_forfeited_bdt: integer("upfront_tip_forfeited_bdt").notNull().default(0),
    female_driver_preference: boolean("female_driver_preference").default(false),
    distance_km: numeric("distance_km", { precision: 7, scale: 3 }).notNull(),
    platform_commission_bdt: integer("platform_commission_bdt"),
    scheduled_at: timestamptz("scheduled_at"),
    dispatch_window_start: timestamptz("dispatch_window_start"),
    dispatch_window_end: timestamptz("dispatch_window_end"),
    matched_at: timestamptz("matched_at"),
    // 4-digit ride-start PIN. Generated when a driver accepts (ride -> matched).
    // Shown to the rider (to read aloud) and verified against the driver's entry
    // before the ride transitions to in_progress.
    start_pin: varchar("start_pin", { length: 8 }),
    arrived_at: timestamptz("arrived_at"),
    eta_minutes: smallint("eta_minutes"),
    started_at: timestamptz("started_at"),
    completed_at: timestamptz("completed_at"),
    rider_rating: smallint("rider_rating"),
    driver_rating: smallint("driver_rating"),
    cancel_reason: varchar("cancel_reason", { length: 255 }),
    cancelled_by: varchar("cancelled_by", { length: 10 }),
    scheduled_dispatched_at: timestamptz("scheduled_dispatched_at"),
    promo_code: varchar("promo_code", { length: 50 }),
    promo_code_id: uuid("promo_code_id").references(() => promoCodes.id),
    promo_discount_bdt: integer("promo_discount_bdt").notNull().default(0),
    applied_discount_type: text("applied_discount_type", {
      enum: ["intro", "promo", "pass", "wallet", "none"],
    })
      .notNull()
      .default("none"),
    applied_discount_bdt: integer("applied_discount_bdt").notNull().default(0),
    wallet_redeemed_bdt: integer("wallet_redeemed_bdt").notNull().default(0),
    driver_fare_bdt: integer("driver_fare_bdt"),
    rider_payable_bdt: integer("rider_payable_bdt"),
    tip_bdt: integer("tip_bdt").default(0),
    platform_subsidy_bdt: integer("platform_subsidy_bdt"),
    preference_surcharge_bdt: integer("preference_surcharge_bdt")
      .notNull()
      .default(0),
    preference_ids: jsonb("preference_ids"),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("rides_status_created_idx").on(t.status, t.created_at),
    index("rides_user_status_idx").on(t.user_id, t.status),
    index("rides_driver_status_idx").on(t.driver_id, t.status),
    index("rides_scheduled_dispatch_idx")
      .on(t.scheduled_at)
      .where(
        sql`status = 'scheduled' AND scheduled_dispatched_at IS NULL`,
      ),
    index("rides_promo_code_idx")
      .on(t.promo_code_id)
      .where(sql`promo_code_id IS NOT NULL`),
    index("rides_vehicle_type_idx").on(t.vehicle_type),
  ],
);

export const cancellationPolicies = pgTable("cancellation_policies", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  canceller_role: varchar("canceller_role", { length: 20 }).notNull(),
  ride_status: varchar("ride_status", { length: 30 }).notNull(),
  time_threshold_seconds: integer("time_threshold_seconds").notNull(),
  fee_type: varchar("fee_type", { length: 10 }).notNull(),
  fee_amount_bdt: integer("fee_amount_bdt").notNull(),
  max_fee_bdt: integer("max_fee_bdt").notNull(),
  is_active: boolean("is_active").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  created_at: timestamptz("created_at").notNull().defaultNow(),
  updated_at: timestamptz("updated_at").notNull().defaultNow(),
});

export const cancellationCredits = pgTable(
  "cancellation_credits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    original_driver_id: uuid("original_driver_id")
      .notNull()
      .references(() => drivers.id),
    cancellation_ride_id: uuid("cancellation_ride_id")
      .notNull()
      .references(() => rides.id),
    amount_bdt: integer("amount_bdt").notNull(),
    status: cancellationCreditStatusEnum("status").notNull().default("pending"),
    applied_to_ride_id: uuid("applied_to_ride_id").references(() => rides.id),
    applied_at: timestamptz("applied_at"),
    expires_at: timestamptz("expires_at").notNull(),
    created_at: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("cancellation_credits_driver_status_idx").on(t.original_driver_id, t.status),
    index("cancellation_credits_expires_idx").on(t.expires_at),
    uniqueIndex("cancellation_credits_ride_unique")
      .on(t.cancellation_ride_id)
      .where(sql`status = 'pending'`),
  ],
);

export const riderFeeDeductions = pgTable(
  "rider_fee_deductions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rider_id: uuid("rider_id")
      .notNull()
      .references(() => users.id),
    ride_id: uuid("ride_id")
      .notNull()
      .references(() => rides.id),
    total_amount_bdt: integer("total_amount_bdt").notNull(),
    remaining_amount_bdt: integer("remaining_amount_bdt").notNull(),
    status: riderFeeDeductionStatusEnum("status").notNull().default("pending"),
    expires_at: timestamptz("expires_at").notNull(),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("rider_fee_deductions_rider_idx").on(t.rider_id),
    index("rider_fee_deductions_status_idx").on(t.status),
    index("rider_fee_deductions_expires_idx").on(t.expires_at),
  ],
);

export const dispatchOffers = pgTable(
  "dispatch_offers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ride_id: uuid("ride_id")
      .notNull()
      .references(() => rides.id),
    driver_id: uuid("driver_id")
      .notNull()
      .references(() => drivers.id),
    batch_index: smallint("batch_index").notNull(),
    sent_at: timestamptz("sent_at").notNull(),
    fetch_confirmed_at: timestamptz("fetch_confirmed_at"),
    responded_at: timestamptz("responded_at"),
    outcome: offerOutcomeEnum("outcome").notNull().default("delivered"),
    rejection_reason: varchar("rejection_reason", { length: 100 }),
    filtered_reason: varchar("filtered_reason", { length: 50 }),
    created_at: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("dispatch_offers_ride_driver_idx").on(t.ride_id, t.driver_id),
    index("dispatch_offers_batch_idx").on(t.ride_id, t.batch_index),
    index("dispatch_offers_driver_sent_idx").on(t.driver_id, t.sent_at),
    index("dispatch_offers_filtered_idx")
      .on(t.driver_id, t.outcome, t.sent_at)
      .where(sql`outcome = 'filtered'`),
  ],
);

export const ownerConsents = pgTable("owner_consents", {
  id: uuid("id").defaultRandom().primaryKey(),
  driver_id: uuid("driver_id")
    .notNull()
    .references(() => drivers.id),
  owner_name: varchar("owner_name", { length: 200 }).notNull(),
  owner_address: text("owner_address").notNull(),
  owner_phone: varchar("owner_phone", { length: 20 }).notNull(),
  consent_document_id: uuid("consent_document_id"),
  legacy_screenshot_document_id: uuid("legacy_screenshot_document_id"),
  status: ownerConsentStatusEnum("status").notNull().default("pending"),
  reviewed_by: uuid("reviewed_by").references(() => users.id),
  reviewed_at: timestamptz("reviewed_at"),
  rejection_reason: varchar("rejection_reason", { length: 500 }),
  created_at: timestamptz("created_at").notNull().defaultNow(),
  updated_at: timestamptz("updated_at").notNull().defaultNow(),
});

export const usedChallenges = pgTable("used_challenges", {
  jti: varchar("jti", { length: 64 }).primaryKey(),
  used_at: timestamptz("used_at").notNull().defaultNow(),
  expires_at: timestamptz("expires_at").notNull(),
});

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: varchar("key", { length: 128 }).notNull(),
    window_start: timestamptz("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.window_start] })],
);

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id").references(() => users.id),
    driver_id: uuid("driver_id").references(() => drivers.id),
    package_id: uuid("package_id").references(() => packages.id),
    idempotency_key: varchar("idempotency_key", { length: 64 })
      .notNull()
      .unique(),
    provider: paymentProviderEnum("provider").notNull(),
    provider_txn_id: varchar("provider_txn_id", { length: 255 }),
    amount_bdt: integer("amount_bdt").notNull(),
    status: paymentStatusEnum("status").notNull().default("initiated"),
    initiated_at: timestamptz("initiated_at").notNull().defaultNow(),
    confirmed_at: timestamptz("confirmed_at"),
    subscription_id: uuid("subscription_id").references(() => subscriptions.id),
    ride_id: uuid("ride_id").references(() => rides.id),
    purpose: varchar("purpose", { length: 20 }).default("ride"),
    pass_id: uuid("pass_id").references(() => riderPasses.id),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payment_events_idempotency_idx").on(t.idempotency_key),
    index("payment_events_orphan_paid_idx")
      .on(t.status)
      .where(sql`subscription_id IS NULL AND status = 'paid'`),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driver_id: uuid("driver_id")
      .notNull()
      .references(() => drivers.id),
    vehicle_id: uuid("vehicle_id"),
    doc_type: documentTypeEnum("doc_type").notNull(),
    storage_url: text("storage_url").notNull(),
    expiry_date: timestamptz("expiry_date"),
    alert_sent_30d: boolean("alert_sent_30d").default(false),
    alert_sent_7d: boolean("alert_sent_7d").default(false),
    alert_sent_1d: boolean("alert_sent_1d").default(false),
    status: documentStatusEnum("status").notNull().default("pending"),
    reviewed_by: uuid("reviewed_by").references(() => users.id),
    reviewed_at: timestamptz("reviewed_at"),
    rejection_reason: varchar("rejection_reason", { length: 500 }),
    face_match_score: numeric("face_match_score", { precision: 5, scale: 2 }),
    face_match_status:
      faceMatchStatusEnum("face_match_status").default("pending"),
    file_size_bytes: integer("file_size_bytes").notNull(),
    purge_at: timestamptz("purge_at"),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
    deleted_at: timestamptz("deleted_at"),
  },
  (t) => [
    index("documents_driver_status_idx").on(t.driver_id, t.status),
    uniqueIndex("documents_one_per_type")
      .on(t.driver_id, t.doc_type)
      .where(sql`status IN ('pending','approved') AND deleted_at IS NULL`),
    index("documents_vehicle_id_idx")
      .on(t.vehicle_id)
      .where(sql`vehicle_id IS NOT NULL`),
    index("documents_doc_type_idx").on(t.doc_type),
    index("documents_purge_idx")
      .on(t.purge_at)
      .where(sql`purge_at IS NOT NULL`),
    index("documents_face_match_idx")
      .on(t.face_match_status)
      .where(sql`face_match_status IN ('pending', 'low_confidence')`),
  ],
);

export const zones = pgTable(
  "zones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    polygon: jsonb("polygon").notNull(),
    is_active: boolean("is_active").notNull().default(false),
    lifecycle_stage: zoneLifecycleStageEnum("lifecycle_stage")
      .notNull()
      .default("candidate"),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (_t) => [
    uniqueIndex("zones_one_active")
      .on(sql`(1)`)
      .where(sql`is_active = true`),
  ],
);

export const surgeCurrent = pgTable("surge_current", {
  zone_id: uuid("zone_id").primaryKey().references(() => zones.id),
  multiplier: numeric("multiplier", { precision: 4, scale: 2 }).notNull().default("1.0"),
  demand_count: integer("demand_count").notNull().default(0),
  supply_count: integer("supply_count").notNull().default(0),
  updated_at: timestamptz("updated_at").notNull().defaultNow(),
});

export const surgeHistory = pgTable("surge_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  zone_id: uuid("zone_id").notNull().references(() => zones.id),
  multiplier: numeric("multiplier", { precision: 4, scale: 2 }).notNull(),
  demand_count: integer("demand_count").notNull(),
  supply_count: integer("supply_count").notNull(),
  triggered_at: timestamptz("triggered_at").notNull().defaultNow(),
  ended_at: timestamptz("ended_at"),
});

export const cityBoundaries = pgTable(
  "city_boundaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    polygon: jsonb("polygon").notNull(),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("city_boundaries_name_idx").on(t.name),
    index("city_boundaries_active_idx").on(t.is_active),
  ],
);

export const pricing = pgTable(
  "pricing",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    zone_id: uuid("zone_id")
      .notNull()
      .references(() => zones.id),
    vehicle_type: vehicleTypeEnum("vehicle_type").notNull(),
    base_fare_bdt: integer("base_fare_bdt").notNull(),
    per_km_bdt: integer("per_km_bdt").notNull(),
    intercity_per_km_bdt: integer("intercity_per_km_bdt").notNull().default(0),
    per_min_bdt: integer("per_min_bdt").notNull(),
    floor_length_km: numeric("floor_length_km", {
      precision: 10,
      scale: 2,
    }).notNull(),
    floor_min: integer("floor_min").notNull(),
    platform_commission_percent: numeric("platform_commission_percent", {
      precision: 5,
      scale: 2,
    }),
    is_active: boolean("is_active").notNull().default(true),
    free_wait_minutes: integer("free_wait_minutes").notNull().default(3),
    wait_fee_per_minute_bdt: integer("wait_fee_per_minute_bdt").notNull().default(200),
    brta_fare_ceiling_bdt: integer("brta_fare_ceiling_bdt"),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pricing_zone_type_active_idx")
      .on(t.zone_id, t.vehicle_type)
      .where(sql`is_active = true`),
    index("pricing_vehicle_type_idx").on(t.vehicle_type),
  ],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ride_id: uuid("ride_id")
      .notNull()
      .references(() => rides.id),
    sender_id: uuid("sender_id")
      .notNull()
      .references(() => users.id),
    content: text("content").notNull(),
    created_at: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("chat_messages_ride_created_idx").on(t.ride_id, t.created_at)],
);

export const driverOnlineSessions = pgTable(
  "driver_online_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driver_id: uuid("driver_id")
      .notNull()
      .references(() => drivers.id),
    subscription_id: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id),
    went_online_at: timestamptz("went_online_at").notNull(),
    went_offline_at: timestamptz("went_offline_at"),
    duration_minutes: integer("duration_minutes"),
    created_at: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("dos_driver_sub_idx").on(t.driver_id, t.subscription_id),
    index("dos_sub_offline_idx").on(t.subscription_id, t.went_offline_at),
  ],
);

export const compensationQueue = pgTable(
  "compensation_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    payment_event_id: uuid("payment_event_id")
      .notNull()
      .references(() => paymentEvents.id)
      .unique(),
    attempt_count: integer("attempt_count").notNull().default(0),
    max_attempts: integer("max_attempts").notNull().default(10),
    next_retry_at: timestamptz("next_retry_at").notNull().defaultNow(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    last_error: text("last_error"),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("comp_queue_status_retry_idx")
      .on(t.status, t.next_retry_at)
      .where(sql`status = 'pending'`),
  ],
);

export const systemConfig = pgTable("system_config", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updated_at: timestamptz("updated_at").notNull().defaultNow(),
});

export const platformConfig = pgTable("platform_config", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updated_at: timestamptz("updated_at").notNull().defaultNow(),
});

export const sosAlerts = pgTable(
  "sos_alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: userRoleEnum("role").notNull(),
    latitude: numeric("latitude", { precision: 10, scale: 7 }).notNull(),
    longitude: numeric("longitude", { precision: 10, scale: 7 }).notNull(),
    message: text("message"),
    contacts_notified: jsonb("contacts_notified").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    acknowledged_by: uuid("acknowledged_by").references(() => users.id),
    acknowledged_at: timestamptz("acknowledged_at"),
    created_at: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("sos_alerts_user_created_idx").on(t.user_id, t.created_at),
    index("sos_alerts_role_idx").on(t.role),
  ],
);

export const incentiveDefinitions = pgTable(
  "incentive_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    target_metric: targetMetricEnum("target_metric").notNull(),
    target_value: numeric("target_value").notNull(),
    reward_calls: integer("reward_calls").notNull(),
    vehicle_type_filter: vehicleTypeEnum("vehicle_type_filter"),
    starts_at: timestamptz("starts_at").notNull(),
    ends_at: timestamptz("ends_at").notNull(),
    is_active: boolean("is_active").notNull().default(true),
    created_by: uuid("created_by").references(() => users.id),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
    deleted_at: timestamptz("deleted_at"),
  },
  (t) => [
    index("incentive_defs_active_dates_idx").on(
      t.is_active,
      t.starts_at,
      t.ends_at,
    ),
    index("incentive_defs_vehicle_type_idx").on(t.vehicle_type_filter),
  ],
);

export const driverIncentives = pgTable(
  "driver_incentives",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driver_id: uuid("driver_id")
      .notNull()
      .references(() => drivers.id),
    incentive_id: uuid("incentive_id")
      .notNull()
      .references(() => incentiveDefinitions.id),
    current_progress: numeric("current_progress", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    completed_at: timestamptz("completed_at"),
    reward_voucher_id: uuid("reward_voucher_id").references(
      () => creditVouchers.id,
    ),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("driver_incentives_unique_idx").on(t.driver_id, t.incentive_id),
    index("driver_incentives_completed_idx")
      .on(t.completed_at)
      .where(sql`completed_at IS NULL`),
  ],
);

export const preferences = pgTable("preferences", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  display_label_en: varchar("display_label_en", { length: 100 }).notNull(),
  display_label_bn: varchar("display_label_bn", { length: 100 }).notNull(),
  icon: varchar("icon", { length: 50 }),
  charge_bdt: integer("charge_bdt").notNull().default(0),
  affects_matching: boolean("affects_matching").notNull().default(false),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamptz("created_at").notNull().defaultNow(),
  updated_at: timestamptz("updated_at").notNull().defaultNow(),
});

export const driverPreferences = pgTable(
  "driver_preferences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driver_id: uuid("driver_id")
      .notNull()
      .references(() => drivers.id),
    preference_id: uuid("preference_id")
      .notNull()
      .references(() => preferences.id),
    created_at: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("driver_prefs_unique_idx").on(t.driver_id, t.preference_id),
    index("driver_prefs_preference_idx").on(t.preference_id),
  ],
);

export const ridePreferences = pgTable(
  "ride_preferences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ride_id: uuid("ride_id")
      .notNull()
      .references(() => rides.id),
    preference_id: uuid("preference_id")
      .notNull()
      .references(() => preferences.id),
    charge_bdt: integer("charge_bdt").notNull().default(0),
    created_at: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ride_prefs_unique_idx").on(t.ride_id, t.preference_id),
    index("ride_prefs_ride_idx").on(t.ride_id),
  ],
);

export const vehicleTypeChanges = pgTable(
  "vehicle_type_changes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driver_id: uuid("driver_id")
      .notNull()
      .references(() => drivers.id),
    old_vehicle_type: vehicleTypeEnum("old_vehicle_type").notNull(),
    new_vehicle_type: vehicleTypeEnum("new_vehicle_type").notNull(),
    change_reason: varchar("change_reason", { length: 20 }).notNull(),
    reason_text: varchar("reason_text", { length: 500 }).notNull(),
    changed_by: uuid("changed_by").references(() => users.id),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    effective_at: timestamptz("effective_at"),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("vtc_driver_created_idx").on(t.driver_id, t.created_at),
    index("vtc_cooling_off_idx")
      .on(t.status, t.effective_at)
      .where(sql`status = 'cooling_off'`),
  ],
);

// ── New tables (added per DATA-MODEL audit) ──

export const vehicleModels = pgTable(
  "vehicle_models",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brand: varchar("brand", { length: 100 }).notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    year_start: integer("year_start"),
    year_end: integer("year_end"),
    default_vehicle_type: vehicleTypeEnum("default_vehicle_type").notNull(),
    typical_cc_min: integer("typical_cc_min"),
    typical_cc_max: integer("typical_cc_max"),
    has_ac: boolean("has_ac"),
    passenger_seats: integer("passenger_seats").notNull().default(4),
    is_active: boolean("is_active").notNull().default(true),
    source: varchar("source", { length: 20 }).notNull().default("admin"),
    created_by: uuid("created_by").references((): any => users.id),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("vm_brand_model_idx").on(t.brand, t.model),
    index("vm_vehicle_type_idx").on(t.default_vehicle_type),
    index("vm_is_active_idx").on(t.is_active),
    uniqueIndex("vm_brand_model_years_idx").on(
      t.brand,
      t.model,
      t.year_start,
      t.year_end,
    ),
  ],
);

export const riderAddresses = pgTable(
  "rider_addresses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    label: varchar("label", { length: 100 }).notNull(),
    address: text("address").notNull(),
    details: text("details"),
    lat: numeric("lat", { precision: 10, scale: 7 }).notNull(),
    lng: numeric("lng", { precision: 10, scale: 7 }).notNull(),
    is_favorite: boolean("is_favorite").notNull().default(false),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
    deleted_at: timestamptz("deleted_at"),
  },
  (t) => [
    index("ra_user_created_idx").on(t.user_id, t.created_at),
    index("ra_user_active_idx")
      .on(t.user_id)
      .where(sql`deleted_at IS NULL`),
    index("ra_user_favorite_idx")
      .on(t.user_id, t.is_favorite)
      .where(sql`deleted_at IS NULL AND is_favorite = true`),
  ],
);

export const referralCampaigns = pgTable(
  "referral_campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    referrer_reward_percent: integer("referrer_reward_percent").notNull(),
    referee_reward_percent: integer("referee_reward_percent").notNull(),
    max_uses_per_referrer: integer("max_uses_per_referrer").notNull(),
    max_uses_per_campaign: integer("max_uses_per_campaign"),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (_t) => [
    uniqueIndex("rc_one_active_idx")
      .on(sql`(1)`)
      .where(sql`is_active = true`),
  ],
);

export const referralCodes = pgTable("referral_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id)
    .unique(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  created_at: timestamptz("created_at").notNull().defaultNow(),
});

export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    referrer_id: uuid("referrer_id")
      .notNull()
      .references(() => users.id),
    referee_id: uuid("referee_id")
      .notNull()
      .references(() => users.id)
      .unique(),
    campaign_id: uuid("campaign_id")
      .notNull()
      .references(() => referralCampaigns.id),
    status: referralStatusEnum("status").notNull().default("pending"),
    rewarded_at: timestamptz("rewarded_at"),
    created_at: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("referrals_referrer_idx").on(t.referrer_id, t.created_at),
    index("referrals_campaign_idx").on(t.campaign_id),
  ],
);

export const driverWalletTransactions = pgTable(
  "driver_wallet_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driver_id: uuid("driver_id")
      .notNull()
      .references(() => drivers.id),
    transaction_type: walletDriverTxnTypeEnum("transaction_type").notNull(),
    amount_bdt: integer("amount_bdt").notNull(),
    reference_id: uuid("reference_id"),
    balance_after: integer("balance_after").notNull(),
    created_at: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("dwt_driver_date_idx").on(t.driver_id, t.created_at),
    index("dwt_reference_idx")
      .on(t.reference_id)
      .where(sql`reference_id IS NOT NULL`),
  ],
);

export const riderWalletTransactions = pgTable(
  "rider_wallet_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rider_id: uuid("rider_id")
      .notNull()
      .references(() => users.id),
    transaction_type: walletRiderTxnTypeEnum("transaction_type").notNull(),
    amount_bdt: integer("amount_bdt").notNull(),
    reference_id: uuid("reference_id"),
    balance_after: integer("balance_after").notNull(),
    expires_at: timestamptz("expires_at"),
    created_at: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("rwt_rider_date_idx").on(t.rider_id, t.created_at),
    index("rwt_reference_idx")
      .on(t.reference_id)
      .where(sql`reference_id IS NOT NULL`),
    index("rwt_expires_active_idx")
      .on(t.expires_at)
      .where(sql`expires_at IS NOT NULL`),
    index("rwt_rider_expires_idx")
      .on(t.rider_id, t.expires_at)
      .where(sql`expires_at IS NOT NULL`),
  ],
);

export const points = pgTable("points", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id)
    .unique(),
  balance: integer("balance").notNull().default(0),
  created_at: timestamptz("created_at").notNull().defaultNow(),
  updated_at: timestamptz("updated_at").notNull().defaultNow(),
});

export const pointTransactions = pgTable(
  "point_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    transaction_type: pointTransactionTypeEnum("transaction_type").notNull(),
    source_type: pointSourceTypeEnum("source_type"),
    amount: integer("amount").notNull(),
    reference_id: uuid("reference_id"),
    balance_after: integer("balance_after").notNull(),
    created_at: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("pt_user_date_idx").on(t.user_id, t.created_at),
    index("pt_reference_idx")
      .on(t.reference_id)
      .where(sql`reference_id IS NOT NULL`),
  ],
);

export const pointOffers = pgTable(
  "point_offers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 100 }).notNull(),
    points_required: integer("points_required").notNull(),
    reward_type: pointRewardTypeEnum("reward_type").notNull(),
    reward_value: varchar("reward_value", { length: 100 }).notNull(),
    reward_value_bdt: integer("reward_value_bdt"),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("po_is_active_idx").on(t.is_active)],
);

// ── Tier 2 tables ───────────────────────────────────────────────────────

export const faqs = pgTable(
  "faqs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    role: userRoleEnum("role").notNull(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    category: varchar("category", { length: 50 }),
    sort_order: integer("sort_order").default(0),
    is_active: boolean("is_active").default(true),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("faqs_role_active_idx").on(t.role, t.is_active),
  ],
);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    assigned_to: uuid("assigned_to").references(() => users.id),
    ride_id: uuid("ride_id").references(() => rides.id),
    category: varchar("category", { length: 50 }).notNull(),
    subject: varchar("subject", { length: 200 }),
    description: text("description").notNull(),
    status: varchar("status", { length: 20 }).default("open"),
    priority: varchar("priority", { length: 10 }).default("normal"),
    sla_deadline: timestamptz("sla_deadline"),
    internal_notes: text("internal_notes"),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("support_tickets_user_idx").on(t.user_id),
    index("support_tickets_status_idx").on(t.status),
  ],
);

export const ticketReplies = pgTable(
  "ticket_replies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ticket_id: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id),
    author_id: uuid("author_id")
      .notNull()
      .references(() => users.id),
    is_internal: boolean("is_internal").default(false),
    message: text("message").notNull(),
    attachments: jsonb("attachments"),
    created_at: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ticket_replies_ticket_idx").on(t.ticket_id),
  ],
);

export const userEmergencyContacts = pgTable(
  "user_emergency_contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 100 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    relationship: varchar("relationship", { length: 50 }),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("emergency_contacts_user_idx").on(t.user_id),
  ],
);

export const driverSchedule = pgTable(
  "driver_schedule",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driver_id: uuid("driver_id")
      .notNull()
      .references(() => drivers.id),
    day_of_week: integer("day_of_week").notNull(),
    start_time: varchar("start_time", { length: 5 }).notNull(),
    end_time: varchar("end_time", { length: 5 }).notNull(),
    is_active: boolean("is_active").default(true),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("driver_schedule_driver_idx").on(t.driver_id),
  ],
);

export const driverPayoutMethods = pgTable(
  "driver_payout_methods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driver_id: uuid("driver_id")
      .notNull()
      .references(() => drivers.id),
    method_type: varchar("method_type", { length: 20 }).notNull(),
    account_number: varchar("account_number", { length: 50 }).notNull(),
    account_name: varchar("account_name", { length: 100 }),
    bank_name: varchar("bank_name", { length: 100 }),
    branch_name: varchar("branch_name", { length: 100 }),
    is_default: boolean("is_default").default(false),
    is_active: boolean("is_active").default(true),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("dpm_driver_idx").on(t.driver_id),
  ],
);

// ── Push Notifications ─────────────────────────────────────────────────

export const userDevices = pgTable(
  "user_devices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    push_token: varchar("push_token", { length: 255 }).notNull(),
    platform: varchar("platform", { length: 20 }).notNull(),
    device_id: varchar("device_id", { length: 255 }).notNull(),
    last_active_at: timestamptz("last_active_at").notNull().defaultNow(),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("user_devices_user_id_device_id_key").on(t.user_id, t.device_id),
    index("user_devices_user_idx").on(t.user_id),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id),
    type: varchar("type", { length: 50 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body"),
    data: jsonb("data"),
    sent_at: timestamptz("sent_at").notNull().defaultNow(),
    delivered_at: timestamptz("delivered_at"),
    failed_reason: varchar("failed_reason", { length: 255 }),
    created_at: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_idx").on(t.user_id),
    index("notifications_sent_idx").on(t.sent_at),
  ],
);

// ── Phase 2: Revenue Features ──────────────────────────────────────────

// P4-006: Driver Commute Preferences
export const driverCommutePreferences = pgTable("driver_commute_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  driver_id: uuid("driver_id").references(() => drivers.id, { onDelete: "cascade" }).notNull(),
  destination_lat: numeric("destination_lat", { precision: 10, scale: 8 }).notNull(),
  destination_lng: numeric("destination_lng", { precision: 11, scale: 8 }).notNull(),
  destination_address: text("destination_address").notNull(),
  max_deviation_meters: integer("max_deviation_meters").notNull().default(2000),
  active: boolean("active").notNull().default(true),
  created_at: timestamptz("created_at").notNull().defaultNow(),
  updated_at: timestamptz("updated_at").notNull().defaultNow(),
});

// P4-009: Rider Passes
export const riderPasses = pgTable("rider_passes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  price_bdt: integer("price_bdt").notNull(),
  discount_percent: integer("discount_percent").notNull().default(10),
  max_rides: integer("max_rides"),
  validity_days: integer("validity_days").notNull(),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamptz("created_at").notNull().defaultNow(),
  updated_at: timestamptz("updated_at").notNull().defaultNow(),
});

// P4-009: Rider Subscriptions (active pass per rider)
export const riderSubscriptions = pgTable("rider_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  rider_id: uuid("rider_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  pass_id: uuid("pass_id").references(() => riderPasses.id).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  rides_used: integer("rides_used").notNull().default(0),
  valid_until: timestamptz("valid_until").notNull(),
  purchased_at: timestamptz("purchased_at").notNull().defaultNow(),
  payment_event_id: uuid("payment_event_id").references(() => paymentEvents.id),
});

// P4-011: Ride Extra Charges (toll/parking)
export const rideExtraCharges = pgTable("ride_extra_charges", {
  id: uuid("id").primaryKey().defaultRandom(),
  ride_id: uuid("ride_id").references(() => rides.id).notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  amount_bdt: integer("amount_bdt").notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  submitted_by_driver: boolean("submitted_by_driver").notNull().default(true),
  created_at: timestamptz("created_at").notNull().defaultNow(),
  resolved_at: timestamptz("resolved_at"),
});

// ── Tax & Accounting Engine (P4 Phase 3) ──────────────────────────────────

export const taxRates = pgTable("tax_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  code: text("code", { enum: ['vat_commission', 'vat_subscription', 'source_tax_payout', 'source_tax_instant_pay'] }).notNull().unique(),
  rate_percent: numeric("rate_percent", { precision: 5, scale: 2 }).notNull(),
  applies_to: text("applies_to", { enum: ['commission', 'subscription', 'driver_payout', 'driver_instant_pay'] }).notNull(),
  is_active: boolean("is_active").notNull().default(true),
  description: text("description"),
  created_at: timestamptz("created_at").notNull().defaultNow(),
  updated_at: timestamptz("updated_at").notNull().defaultNow(),
});

export const taxLedgers = pgTable("tax_ledgers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tax_rate_id: uuid("tax_rate_id").references(() => taxRates.id).notNull(),
  reference_type: text("reference_type", { enum: ['ride_commission', 'subscription_sale', 'driver_payout', 'driver_instant_pay'] }).notNull(),
  reference_id: uuid("reference_id").notNull(),
  base_amount_bdt: integer("base_amount_bdt").notNull(),
  tax_amount_bdt: integer("tax_amount_bdt").notNull(),
  net_amount_bdt: integer("net_amount_bdt").notNull(),
  driver_id: uuid("driver_id").references(() => drivers.id),
  rider_id: uuid("rider_id").references(() => users.id),
  tax_date: timestamptz("tax_date").notNull(),
  is_reported: boolean("is_reported").notNull().default(false),
  reported_at: timestamptz("reported_at"),
  created_at: timestamptz("created_at").notNull().defaultNow(),
});

export const dailyTaxSummaries = pgTable("daily_tax_summaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  summary_date: date("summary_date").notNull(),
  tax_rate_id: uuid("tax_rate_id").references(() => taxRates.id).notNull(),
  tax_code: text("tax_code").notNull(),
  transaction_count: integer("transaction_count").notNull().default(0),
  total_base_amount_bdt: integer("total_base_amount_bdt").notNull().default(0),
  total_tax_amount_bdt: integer("total_tax_amount_bdt").notNull().default(0),
  total_net_amount_bdt: integer("total_net_amount_bdt").notNull().default(0),
  created_at: timestamptz("created_at").notNull().defaultNow(),
  updated_at: timestamptz("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("dts_summary_code_idx").on(t.summary_date, t.tax_code),
]);

export const accountingAccounts = pgTable("accounting_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type", { enum: ['asset', 'liability', 'equity', 'income', 'expense'] }).notNull(),
  sub_type: text("sub_type"),
  parent_id: uuid("parent_id").references((): any => accountingAccounts.id),
  is_active: boolean("is_active").notNull().default(true),
  description: text("description"),
  opening_balance_bdt: integer("opening_balance_bdt").notNull().default(0),
  current_balance_bdt: integer("current_balance_bdt").notNull().default(0),
  created_at: timestamptz("created_at").notNull().defaultNow(),
});

export const accountingEntries = pgTable("accounting_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  entry_number: text("entry_number").notNull().unique(),
  reference_type: text("reference_type", {
    enum: ['ride', 'subscription', 'driver_payout', 'wallet_topup', 'rider_pass', 'tax', 'cancellation_fee', 'tip', 'adjustment'],
  }).notNull(),
  reference_id: uuid("reference_id"),
  entry_date: timestamptz("entry_date").notNull(),
  description: text("description").notNull(),
  notes: text("notes"),
  is_reversed: boolean("is_reversed").notNull().default(false),
  reversed_by_id: uuid("reversed_by_id").references((): any => accountingEntries.id),
   zone_id: uuid("zone_id").references(() => zones.id),
   campaign_id: uuid("campaign_id"),
   subsidy_category: text("subsidy_category", {
     enum: [
       "rider_subsidy",
       "driver_incentive",
       "promo_redemption",
       "wallet_credit",
       "streak_reward",
       "corporate_discount",
       "behavior_reward",
       "referral_bonus",
     ],
   }),
   created_by: uuid("created_by").references(() => users.id),
  created_at: timestamptz("created_at").notNull().defaultNow(),
});

export const accountingEntryLines = pgTable("accounting_entry_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  entry_id: uuid("entry_id").references(() => accountingEntries.id, { onDelete: "cascade" }).notNull(),
  account_id: uuid("account_id").references(() => accountingAccounts.id).notNull(),
  debit_bdt: integer("debit_bdt").notNull().default(0),
  credit_bdt: integer("credit_bdt").notNull().default(0),
  description: text("description"),
  created_at: timestamptz("created_at").notNull().defaultNow(),
});

// ── Multi-Stop + Upfront Tip ────────────────────────────────────────────

export const rideStops = pgTable("ride_stops", {
  id: uuid("id").primaryKey().defaultRandom(),
  ride_id: uuid("ride_id").references(() => rides.id, { onDelete: "cascade" }).notNull(),
  stop_order: integer("stop_order").notNull(),
  lat: numeric("lat", { precision: 10, scale: 8 }).notNull(),
  lng: numeric("lng", { precision: 11, scale: 8 }).notNull(),
  address: text("address").notNull(),
  status: text("status", { enum: ['pending', 'arrived', 'completed', 'skipped'] }).notNull().default('pending'),
  wait_start_at: timestamptz("wait_start_at"),
  wait_end_at: timestamptz("wait_end_at"),
  wait_fee_bdt: integer("wait_fee_bdt").default(0),
  completed_at: timestamptz("completed_at"),
  created_at: timestamptz("created_at").notNull().defaultNow(),
});

// ── Trust & Quality System ──────────────────────────────────────────────

export const lostItems = pgTable("lost_items", {

  id: uuid("id").primaryKey().defaultRandom(),
  ride_id: uuid("ride_id").references(() => rides.id, { onDelete: "cascade" }).notNull(),
  rider_id: uuid("rider_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  driver_id: uuid("driver_id").references(() => drivers.id, { onDelete: "cascade" }).notNull(),
  item_description: text("item_description").notNull(),
  status: text("status", { enum: ['reported', 'driver_confirmed', 'photo_provided', 'arranged_return', 'resolved', 'unresolved'] }).notNull().default('reported'),
  driver_response: text("driver_response"),
  driver_photo_url: text("driver_photo_url"),
  return_method: text("return_method", { enum: ['driver_returns', 'rider_pickup', 'drop_at_hub', 'undeliverable'] }),
  return_fee_bdt: integer("return_fee_bdt").default(0),
  admin_mediation: boolean("admin_mediation").default(false),
  reported_at: timestamptz("reported_at").notNull().defaultNow(),
  resolved_at: timestamptz("resolved_at"),
  created_at: timestamptz("created_at").notNull().defaultNow(),
  updated_at: timestamptz("updated_at").notNull().defaultNow(),
});


export const fareDisputes = pgTable("fare_disputes", {
  id: uuid("id").primaryKey().defaultRandom(),
  ride_id: uuid("ride_id").references(() => rides.id, { onDelete: "cascade" }).notNull(),
  rider_id: uuid("rider_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  driver_id: uuid("driver_id").references(() => drivers.id, { onDelete: "cascade" }).notNull(),
  claimed_fare_bdt: integer("claimed_fare_bdt").notNull(),
  charged_fare_bdt: integer("charged_fare_bdt").notNull(),
  dispute_reason: text("dispute_reason", { enum: ['route_longer', 'wrong_vehicle', 'wait_fee_unfair', 'surge_unexplained', 'other'] }).notNull(),
  rider_note: text("rider_note"),
  actual_distance_meters: integer("actual_distance_meters"),
  estimated_distance_meters: integer("estimated_distance_meters"),
  route_deviation_percent: numeric("route_deviation_percent", { precision: 5, scale: 2 }),
  auto_refund_bdt: integer("auto_refund_bdt").default(0),
  admin_adjustment_bdt: integer("admin_adjustment_bdt").default(0),
  final_resolution: text("final_resolution", { enum: ['auto_approved', 'auto_rejected', 'admin_approved', 'admin_rejected', 'pending'] }),
  status: text("status", { enum: ['open', 'under_review', 'resolved', 'escalated'] }).notNull().default('open'),
  resolved_by: uuid("resolved_by").references(() => users.id),
  created_at: timestamptz("created_at").notNull().defaultNow(),
  resolved_at: timestamptz("resolved_at"),
}, (t) => [
  // One dispute per ride — DB-level guard against duplicate disputes / double refunds.
  uniqueIndex("fare_disputes_one_per_ride").on(t.ride_id),
]);

export const driverBlocklists = pgTable("driver_blocklists", {
  id: uuid("id").primaryKey().defaultRandom(),
  rider_id: uuid("rider_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  driver_id: uuid("driver_id").references(() => drivers.id, { onDelete: "cascade" }).notNull(),
  reason: text("reason", { enum: ['rude_behavior', 'unsafe_driving', 'overcharged', 'harassment', 'no_show', 'other'] }),
  created_at: timestamptz("created_at").notNull().defaultNow(),
});

export const ridePhotos = pgTable("ride_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  ride_id: uuid("ride_id").references(() => rides.id, { onDelete: "cascade" }).notNull(),
  photo_type: text("photo_type", { enum: ['pickup', 'dropoff', 'delivery', 'lost_item', 'dispute_evidence'] }).notNull(),
  taken_by: text("taken_by", { enum: ['driver', 'rider'] }).notNull(),
  storage_url: text("storage_url").notNull(),
  lat: numeric("lat", { precision: 10, scale: 8 }),
  lng: numeric("lng", { precision: 11, scale: 8 }),
  created_at: timestamptz("created_at").notNull().defaultNow(),
});

// ── P5 Growth Features ──────────────────────────────────────────────────

// Gamification: Driver Tiers
export const driverTiers = pgTable("driver_tiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(), rank: integer("rank").notNull(),
  min_rides: integer("min_rides").notNull().default(0),
  min_rating: numeric("min_rating", { precision: 3, scale: 2 }).notNull().default('4.0'),
  commission_discount_percent: integer("commission_discount_percent").notNull().default(0),
  priority_boost: numeric("priority_boost", { precision: 3, scale: 2 }).notNull().default('1.0'),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamptz("created_at").notNull().defaultNow(),
});

// Gamification: Driver Streaks
export const driverStreaks = pgTable("driver_streaks", {
  id: uuid("id").primaryKey().defaultRandom(),
  driver_id: uuid("driver_id").references(() => drivers.id, { onDelete: "cascade" }).notNull(),
  streak_type: text("streak_type", { enum: ['daily_rides', 'weekly_hours', 'perfect_rating'] }).notNull(),
  current_count: integer("current_count").notNull().default(0),
  best_count: integer("best_count").notNull().default(0),
  updated_at: timestamptz("updated_at").notNull().defaultNow(),
  created_at: timestamptz("created_at").notNull().defaultNow(),
});

// Gamification: Driver Achievements
export const driverAchievements = pgTable("driver_achievements", {
  id: uuid("id").primaryKey().defaultRandom(),
  driver_id: uuid("driver_id").references(() => drivers.id, { onDelete: "cascade" }).notNull(),
  achievement_key: text("achievement_key").notNull(),
  title: text("title").notNull(), description: text("description"),
  reward_bdt: integer("reward_bdt").default(0),
  unlocked_at: timestamptz("unlocked_at").notNull().defaultNow(),
  created_at: timestamptz("created_at").notNull().defaultNow(),
});

// Gamification: Mystery Bonuses
export const driverMysteryBonuses = pgTable("driver_mystery_bonuses", {
  id: uuid("id").primaryKey().defaultRandom(),
  driver_id: uuid("driver_id").references(() => drivers.id, { onDelete: "cascade" }).notNull(),
  target_metric: text("target_metric").notNull(),
  target_value: integer("target_value").notNull(),
  reward_bdt: integer("reward_bdt").notNull(),
  progress: integer("progress").notNull().default(0),
  status: text("status", { enum: ['active', 'completed', 'expired'] }).notNull().default('active'),
  expires_at: timestamptz("expires_at"),
  created_at: timestamptz("created_at").notNull().defaultNow(),
});

// Gamification: Leaderboard Entries
export const driverLeaderboardEntries = pgTable("driver_leaderboard_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  driver_id: uuid("driver_id").references(() => drivers.id, { onDelete: "cascade" }).notNull(),
  period: text("period", { enum: ['daily', 'weekly', 'monthly'] }).notNull(),
  zone_id: uuid("zone_id").references(() => zones.id),
  metric: text("metric", { enum: ['earnings', 'rides', 'rating'] }).notNull(),
  score: integer("score").notNull().default(0),
  rank: integer("rank"),
  created_at: timestamptz("created_at").notNull().defaultNow(),
});

// Safety: Ride Audio Recordings
export const rideAudioRecordings = pgTable("ride_audio_recordings", {
  id: uuid("id").primaryKey().defaultRandom(),
  ride_id: uuid("ride_id").references(() => rides.id, { onDelete: "cascade" }).notNull(),
  driver_id: uuid("driver_id").references(() => drivers.id).notNull(),
  storage_url: text("storage_url"),
  status: text("status", { enum: ['recording', 'completed', 'deleted'] }).notNull().default('recording'),
  duration_seconds: integer("duration_seconds"),
  started_at: timestamptz("started_at").notNull().defaultNow(),
  created_at: timestamptz("created_at").notNull().defaultNow(),
});

// Safety: Safety Anomalies
export const safetyAnomalies = pgTable("safety_anomalies", {
  id: uuid("id").primaryKey().defaultRandom(),
  ride_id: uuid("ride_id").references(() => rides.id, { onDelete: "cascade" }),
  driver_id: uuid("driver_id").references(() => drivers.id),
  anomaly_type: text("anomaly_type", { enum: ['route_deviation', 'stationary_long', 'night_ride_no_check', 'sos_triggered', 'harsh_braking', 'speeding'] }).notNull(),
  severity: text("severity", { enum: ['low', 'medium', 'high', 'critical'] }).notNull(),
  description: text("description"),
  metadata: jsonb("metadata"),
  created_at: timestamptz("created_at").notNull().defaultNow(),
});

// AI Demand: Forecasts
export const demandForecasts = pgTable("demand_forecasts", {
  id: uuid("id").primaryKey().defaultRandom(),
  zone_id: uuid("zone_id").references(() => zones.id).notNull(),
  forecast_hour: timestamptz("forecast_hour").notNull(),
  predicted_demand: integer("predicted_demand").notNull(),
  predicted_supply: integer("predicted_supply").notNull(),
  confidence_score: numeric("confidence_score", { precision: 4, scale: 2 }),
  created_at: timestamptz("created_at").notNull().defaultNow(),
});

// AI Demand: Driver Repositioning Nudges
export const driverRepositioningNudges = pgTable("driver_repositioning_nudges", {
  id: uuid("id").primaryKey().defaultRandom(),
  driver_id: uuid("driver_id").references(() => drivers.id, { onDelete: "cascade" }).notNull(),
  zone_id: uuid("zone_id").references(() => zones.id).notNull(),
  message: text("message").notNull(),
  demand_probability: integer("demand_probability").notNull(),
  status: text("status", { enum: ['sent', 'viewed', 'accepted', 'dismissed'] }).notNull().default('sent'),
  created_at: timestamptz("created_at").notNull().defaultNow(),
});

// Weather: Conditions
export const weatherConditions = pgTable("weather_conditions", {
  id: uuid("id").primaryKey().defaultRandom(),
  zone_id: uuid("zone_id").references(() => zones.id).notNull(),
  condition: text("condition").notNull(),
  temperature_celsius: numeric("temperature_celsius", { precision: 4, scale: 1 }),
  is_severe: boolean("is_severe").notNull().default(false),
  surge_multiplier_override: numeric("surge_multiplier_override", { precision: 3, scale: 2 }),
  fetched_at: timestamptz("fetched_at").notNull().defaultNow(),
  created_at: timestamptz("created_at").notNull().defaultNow(),
});

// Weather: Event Calendar
export const eventCalendar = pgTable("event_calendar", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  venue: text("venue"),
  latitude: numeric("latitude", { precision: 10, scale: 8 }),
  longitude: numeric("longitude", { precision: 11, scale: 8 }),
  event_start: timestamptz("event_start").notNull(),
  event_end: timestamptz("event_end").notNull(),
  demand_multiplier: numeric("demand_multiplier", { precision: 3, scale: 2 }).notNull().default('1.5'),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamptz("created_at").notNull().defaultNow(),
});

// ── Rider Growth Tier 1 ────────────────────────────────────────────────────

// Audit trail of zone boundary + metadata revisions
export const zoneVersions = pgTable(
  "zone_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    zone_id: uuid("zone_id")
      .notNull()
      .references(() => zones.id, { onDelete: "cascade" }),
    version_number: integer("version_number").notNull(),
    boundary_geojson: jsonb("boundary_geojson").notNull(),
    lifecycle_stage: zoneLifecycleStageEnum("lifecycle_stage")
      .notNull()
      .default("candidate"),
    daily_budget_bdt: integer("daily_budget_bdt").notNull().default(0),
    changed_by: uuid("changed_by").references(() => users.id),
    change_reason: text("change_reason"),
    created_at: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("zone_versions_zone_version_idx").on(t.zone_id, t.version_number),
    index("zone_versions_zone_idx").on(t.zone_id),
  ],
);

// Thresholds that drive zone lifecycle graduation (stage → stage)
export const zoneGraduationRules = pgTable(
  "zone_graduation_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    zone_id: uuid("zone_id").references(() => zones.id, { onDelete: "cascade" }),
    from_stage: text("from_stage", {
      enum: ["candidate", "pilot", "active", "growth", "mature"],
    }).notNull(),
    to_stage: text("to_stage", {
      enum: ["pilot", "active", "growth", "mature", "expansion"],
    }).notNull(),
    min_rides_per_day: integer("min_rides_per_day").notNull().default(0),
    max_eta_seconds: integer("max_eta_seconds"),
    min_acceptance_rate_pct: integer("min_acceptance_rate_pct"),
    min_driver_utilization_pct: integer("min_driver_utilization_pct"),
    evaluation_window_days: integer("evaluation_window_days").notNull().default(7),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("zone_grad_rules_zone_stages_idx").on(t.zone_id, t.from_stage, t.to_stage),
  ],
);

// Daily platform-funded discount budget per zone (reset at Dhaka midnight)
export const zoneBudgets = pgTable(
  "zone_budgets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    zone_id: uuid("zone_id")
      .notNull()
      .references(() => zones.id, { onDelete: "cascade" })
      .unique(),
    daily_budget_bdt: integer("daily_budget_bdt").notNull().default(0),
    spent_today_bdt: integer("spent_today_bdt").notNull().default(0),
    auto_pause_threshold_pct: integer("auto_pause_threshold_pct").notNull().default(100),
    is_paused: boolean("is_paused").notNull().default(false),
    reset_at: timestamptz("reset_at").notNull().defaultNow(),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("zone_budgets_zone_idx").on(t.zone_id),
  ],
);

// Append-only log of every budget spend event
export const zoneBudgetLogs = pgTable(
  "zone_budget_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    zone_budget_id: uuid("zone_budget_id")
      .notNull()
      .references(() => zoneBudgets.id, { onDelete: "cascade" }),
    zone_id: uuid("zone_id")
      .notNull()
      .references(() => zones.id),
    amount_bdt: integer("amount_bdt").notNull(),
    balance_before_bdt: integer("balance_before_bdt").notNull(),
    balance_after_bdt: integer("balance_after_bdt").notNull(),
    event: text("event", {
      enum: ["spend", "reset", "pause", "resume", "reallocate_in", "reallocate_out"],
    }).notNull(),
    reference_id: uuid("reference_id"),
    reason: text("reason"),
    triggered_by: uuid("triggered_by").references(() => users.id),
    created_at: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("zone_budget_logs_zone_idx").on(t.zone_id, t.created_at),
    index("zone_budget_logs_budget_idx").on(t.zone_budget_id, t.created_at),
  ],
);

// Per-zone intro incentive discount curve for new riders
export const riderIntroConfigs = pgTable(
  "rider_intro_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    zone_id: uuid("zone_id")
      .notNull()
      .references(() => zones.id, { onDelete: "cascade" }),
    is_active: boolean("is_active").notNull().default(true),
    ride_number: integer("ride_number").notNull(),
    discount_percent: integer("discount_percent").notNull().default(50),
    max_discount_bdt: integer("max_discount_bdt"),
    daily_cap_bdt: integer("daily_cap_bdt").notNull().default(10000),
    effective_from: timestamptz("effective_from").notNull().defaultNow(),
    effective_to: timestamptz("effective_to"),
    created_at: timestamptz("created_at").notNull().defaultNow(),
    updated_at: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("rider_intro_configs_zone_ride_idx").on(t.zone_id, t.ride_number),
    index("rider_intro_configs_active_idx")
      .on(t.is_active, t.created_at)
      .where(sql`is_active = true`),
  ],
);
