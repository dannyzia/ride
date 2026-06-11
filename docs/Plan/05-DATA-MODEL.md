<!--
AI INSTRUCTIONS
===============
Base schema: GlideX src/db/schema.ts — defines users, drivers, rides tables.
This file describes ONLY the changes to that baseline.
KEEP the existing GlideX tables (users, drivers, rides) with the modifications noted below.
ADD all new tables listed here.
All changes go through src/db/schema.ts using Drizzle table builder syntax.
Run: npx drizzle-kit generate  →  npx drizzle-kit migrate  (never raw SQL).
Hard rules: uuid PKs, created_at/updated_at on every table, soft deletes (deleted_at) on user-facing tables.
All timestamps: timestamptz (UTC). Never local time.

VEHICLE TYPE CHANGE NOTE (integrated 2025-05, case-normalised 2025-07):
The vehicle_type enum was expanded from 4 types (MOTORCYCLE, CNG_AUTO_RICKSHAW, CAR, MICROBUS)
to 8 granular types, then normalised from UPPERCASE to lowercase snake_case.
All references to the old 4-type enum AND the old UPPERCASE 8-type enum must use the new lowercase values.
The old enum values are REMOVED. Existing data must be migrated (see migration note at bottom).
-->

> **Database:** Supabase PostgreSQL (ap-southeast-1 / Singapore), accessed via Drizzle ORM with a direct connection string from Supabase dashboard (Settings → Database → Connection string → URI). Supabase provides the PostgreSQL instance; Drizzle remains the ORM. All migrations work identically.
>
> **RLS Note:** Supabase Row Level Security (RLS) is available but not required for MVP. The existing middleware-based auth (`lib/auth.ts`) handles authorization at the API layer. RLS may be added post-MVP for defense-in-depth.

# Data Model: Ride
> Delta from GlideX schema. File to modify: `src/db/schema.ts`

---

## Hard rules (apply to every table)

- PK: `id` uuid, default `gen_random_uuid()`
- Every table: `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`
- **Exception:** Append-only tables that are never updated (`call_ledger`, `dispatch_offers`, `used_challenges`, `rate_limits`, `promo_redemptions`, `ride_preferences`, `driver_preferences`) are exempt from the `updated_at` requirement. These tables only have `created_at`.
- Soft-delete tables (user-facing): add `deleted_at timestamptz NULL`
- No hard deletes on: users, drivers, riders, packages, call_ledger, rides, documents
- Exempt from soft delete (append-only audit/ledger): `call_ledger`, `dispatch_offers`, `promo_redemptions`, `ride_preferences`, `driver_preferences`
- `daily_reset_at` is stored as the absolute UTC instant equal to next 00:00 Asia/Dhaka. Computed in `lib/time.ts: nextBdtMidnightUtc()`. All callers MUST use this helper.
- Pricing–ride vehicle_type consistency: `lib/fareCalc.ts` throws if `pricing.vehicle_type !== ride.vehicle_type` (application-layer assertion). A database trigger may be added later for strict enforcement; the application layer is the primary enforcer for MVP.

---

## Modifications to EXISTING GlideX tables

### users (modify existing)
| Change | Detail |
|--------|--------|
| REMOVE `clerk_id` column | Clerk removed; replaced by Supabase Auth |
| ADD `auth_uid` varchar(128) UNIQUE NOT NULL | Supabase Auth UID (sub claim from JWT). Stores the Supabase Auth user ID. |
| ADD `phone` varchar(20) UNIQUE NOT NULL | E.164 format e.g. +8801XXXXXXXXX |
| ADD `role` varchar(20) NOT NULL DEFAULT 'rider' | Enum: 'rider', 'driver', 'admin'. **IMMUTABLE post-creation** — enforced at application layer: `POST /api/register` sets it once; no endpoint allows changing it. |
| KEEP `name`, `profile_image_url` | No change |
| MODIFY `email` | `varchar(255) NULL` — MVP: collected only for admin user; not used for rider/driver flows. |
| ADD `device_id` varchar(255) NULL | For unlimited-package device binding |
| ADD `device_bound_at` timestamptz NULL | When device was bound |
| ADD `rating` numeric(3,2) DEFAULT NULL | Rider's average rating as seen by drivers. NULL until first driver rating received. Computed as `rating_sum / NULLIF(rating_count, 0)`. |
| ADD `rating_count` integer NOT NULL DEFAULT 0 | Total number of ratings received by this rider. Incremented on every `POST /api/ride/:id/rate` (role='driver'). |
| ADD `rating_sum` integer NOT NULL DEFAULT 0 | Running sum of all ratings received. Updated atomically alongside `rating_count` on each `POST /api/ride/:id/rate` (role='driver'). |
| ADD `sos_contact` | varchar(20) NULL | User's personal SOS emergency contact phone number in E.164 format. Nullable — not required. Set via `PATCH /api/user/sos-contact`. |
| ADD `rider_wallet_balance_bdt` | integer NOT NULL DEFAULT 0 | Denormalised rider wallet balance in paisa. Updated on each `rider_wallet_transactions` insert via trigger or application logic. |
| ADD `notification_prefs` | jsonb NULL | Per-user notification toggles. Shape: `{ ride_offers: boolean, promotions: boolean, chat: boolean, sounds: boolean }`. Read/written by `GET/PUT /api/rider/preferences/notifications`. NULL = no preferences set (app uses defaults). |
| ADD `security_settings` | jsonb NULL | Per-user security settings. Shape: `{ two_factor_enabled: boolean, biometric_enabled: boolean }`. Read/written by `GET/PUT /api/rider/preferences/security`. NULL = no security preferences set. |
| ADD `linked_accounts` | jsonb NULL | Third-party account links. Shape: `{ google: { id: string, email: string }, facebook: { id: string, name: string } }`. Read/written by `GET /api/rider/linked-accounts` and connect/disconnect endpoints. NULL = no linked accounts. |
| ADD `data_controls` | jsonb NULL | Privacy/data-sharing settings. Shape: `{ share_location: boolean, share_analytics: boolean }`. Read/written by `GET/PUT /api/rider/data-controls`. NULL = defaults (share_location: true, share_analytics: false). |

**Rating side effect (role='driver'):** On `POST /api/ride/:id/rate` with `role='driver'`, the server atomically increments `users.rating_count`, adds the rating value to `users.rating_sum`, and recalculates `users.rating = rating_sum / NULLIF(rating_count, 0)`.

### drivers (modify existing)
| Change | Detail |
|--------|--------|
| KEEP `user_id`, `rating` | No change — `rating` stores current average |
| REMOVE `car_image_url`, `car_seats` | Replaced by `vehicles` table with multiple photos |
| ADD `rating_count` integer NOT NULL DEFAULT 0 | Total number of ratings received. Incremented on every `POST /api/ride/:id/rate` from rider. |
| ADD `rating_sum` integer NOT NULL DEFAULT 0 | Running sum of all ratings. Compute average as `rating_sum / NULLIF(rating_count, 0)`. Update both columns atomically with `rides.rider_rating`. |
| ADD `vehicle_type` varchar(20) NOT NULL | **Use vehicleTypeEnum (8 values — see Enums section).** Maps to driver's registered vehicle. Updated when vehicle type changes via admin type-change approval. |
| ADD `min_per_km_bdt` integer NULL | Driver-set minimum per-km rate in paisa. NULL = no minimum (accept system rate). Range enforced: 70%–150% of the current system `per_km_bdt` for the driver's vehicle type and zone. Validated via `lib/vehicleTypes.ts: validateDriverMinKm()`. |
| ADD `vehicle_registration_date` date NULL | Date vehicle was first registered (for BRTA 1-year age check). Set during vehicle registration step. **⚠ Redundancy note:** this value is also stored as `vehicles.registration_date` (the canonical source). Both must always be set together from the same source. Prefer querying `vehicles.registration_date` via JOIN when accuracy matters; this column exists only for quick admin-queue lookups without a JOIN. |

> **Invariant:** `drivers.vehicle_registration_date = vehicles.registration_date WHERE drivers.vehicle_id = vehicles.id`. Any code that updates one must update both. See `POST /api/vehicle/register` side effect in 06-API.md.
| ADD `address` text NULL | Driver's residential address |
| ADD `status` varchar(20) NOT NULL DEFAULT 'pending' | Enum: 'pending', 'temporary', 'active', 'suspended', 'rejected' |
| ADD `license_number` varchar(100) NULL | Driving license number |
| ADD `owner_consent_verified` boolean NOT NULL DEFAULT false | Owner consent document confirmed by admin |
| ADD `is_legacy_operator` boolean NOT NULL DEFAULT false | Tick mark: driver claims prior Uber/Pathao affiliation |
| ADD `provisional_expires_at` timestamptz NULL | Temporary activation window end (30 days from admin approval) |
| ADD `vehicle_id` uuid NULL | FK → vehicles.id. NULL until vehicle is registered. |
| ADD `acceptance_rate` numeric(5,2) NOT NULL DEFAULT 100.00 | % of offers accepted; **lifetime average**, updated asynchronously after each offer outcome resolves (not in dispatch critical path). Default 100.00 for drivers with < 10 lifetime offers (insufficient data). See `acceptance_rate update trigger` in 02-ARCHITECTURE.md for the exact SQL. |
| ADD `completed_rides_count` integer NOT NULL DEFAULT 0 | Lifetime completed rides. Incremented on `POST /api/ride/:id/complete`. Used for premium/XL tier eligibility gate. |
| ADD `is_online` boolean NOT NULL DEFAULT false | Currently available for rides |
| ADD `last_location_lat` numeric(10,7) NULL | Last known latitude |
| ADD `last_location_lng` numeric(10,7) NULL | Last known longitude |
| ADD `last_location_at` timestamptz NULL | When location was last updated |
| ADD `h3_cell_res9` varchar(20) NULL | H3 cell index at resolution 9 |
| ADD `stage2_due_at` timestamptz NULL | Owner consent re-submission deadline (provisional_expires_at for temporary drivers). Set to `provisional_expires_at` when admin sets `status='temporary'`; NULL for `active`/`pending` drivers. |
| ADD `brta_certificate_url` text NULL | Supabase Storage path of the approved BRTA enlistment certificate for this driver's vehicle. Denormalised from `documents WHERE doc_type='brta_certificate' AND status='approved'`. Set by admin on approval; used for quick admin-queue lookups without a documents JOIN. |
| ADD `driver_wallet_balance_bdt` | integer NOT NULL DEFAULT 0 | Denormalised driver wallet balance in paisa. Sum of all non-payout `driver_wallet_transactions`. Updated on each transaction insert. |

### rides (modify existing)
| Change | Detail |
|--------|--------|
| KEEP `origin_address`, `destination_address`, `origin_latitude`, `origin_longitude`, `destination_latitude`, `destination_longitude`, `user_id`, `created_at` | No change |
| MODIFY `driver_id` | MAKE NULLABLE (uuid NULL FK → drivers.id). Pre-match it MUST be NULL. |
| REMOVE `fare_price` (single value) | Replaced by fare_breakdown |
| ADD `zone_id` uuid NOT NULL | FK → zones.id, RESTRICT |
| ADD `pricing_id` uuid NOT NULL | FK → pricing.id, RESTRICT |
| ADD `distance_km` numeric(7,3) NOT NULL | Extracted from fare_breakdown |
| ADD `fare_breakdown` jsonb NOT NULL | `{base_fare_bdt: int (paisa), distance_charge_bdt: int (paisa), time_charge_bdt: int (paisa), total_bdt: int (paisa), floor_fare_bdt: int (paisa), distance_km: number, platform_commission_percent: number, platform_commission_bdt: int \| null, driver_net_bdt: int \| null}` |
| ADD `vehicle_type` varchar(20) NOT NULL | **Use vehicleTypeEnum (8 values).** Matches rider's selection at request time. |
| ADD `status` varchar(30) NOT NULL DEFAULT 'pending' | Enum: see rides_status enum below |
| ADD `scheduled_at` timestamptz NULL | NULL = immediate; set = scheduled pickup time |
| ADD `matched_at` timestamptz NULL | When driver accepted |
| ADD `eta_minutes` smallint NULL | Estimated driver arrival time in minutes, calculated at match time from Google Maps Distance Matrix API. NULL until status='matched'. Fallback: Haversine / 30km/h. |
| ADD `arrived_at` timestamptz NULL | When driver tapped "I've Arrived" (or auto-geofence post-MVP). NULL until `driver_arrived` status is set. Used to compute actual waiting time at ride completion. |
| ADD `started_at` timestamptz NULL | When driver tapped Start Ride |
| ADD `completed_at` timestamptz NULL | When driver tapped Complete Ride |
| ADD `platform_commission_bdt` integer NULL | Commission charged to driver in paisa. Populated at ride completion from `pricing.platform_commission_percent` active at ride creation time. NULL until status='completed'. |
| ADD `rider_rating` smallint NULL | 1–5; rider's rating of driver |
| ADD `driver_rating` smallint NULL | 1–5; driver's rating of rider |
| ADD `cancel_reason` varchar(255) NULL | Populated on cancellation |
| ADD `cancelled_by` varchar(10) NULL | Enum: 'rider', 'driver', 'system'. Populated on cancellation. |
| ADD `scheduled_dispatched_at` timestamptz NULL | Set when scheduler triggers dispatch for a scheduled ride. Prevents double-dispatch on utils-server restart. NULL until dispatch is triggered. |
| ADD `promo_code_id` uuid NULL | FK → promo_codes.id. Set when a valid promo code is applied at booking time. NULL if no promo. |
| ADD `promo_discount_bdt` integer NULL | Actual discount applied in paisa. NULL if no promo. |
| ADD `driver_fare_bdt` integer NULL | What the driver receives (full fare + preference surcharges, before platform commission). Set at booking time. NULL until ride is created. |
| ADD `rider_payable_bdt` integer NULL | What the rider pays (driver_fare_bdt − promo_discount_bdt). Set at booking time. NULL until ride is created. |
| ADD `platform_subsidy_bdt` integer NULL | Platform cost = promo_discount_bdt. NULL if no promo. |
| ADD `preference_surcharge_bdt` integer NOT NULL DEFAULT 0 | Sum of all preference surcharges in paisa. 0 if no preferences selected. |
| REMOVE `payment_status` | No in-app payment for rides (cash only, MVP) |

> **Distance vs ETA source note:** Distance for fare calculation uses the **Google Maps Directions API** (returns the most accurate road-route distance). ETA for `rides.eta_minutes` uses the **Google Maps Distance Matrix API** (faster response, no route geometry needed). Both APIs use `GOOGLE_MAPS_SERVER_API_KEY` (server-side only, never exposed to client). See also `02-ARCHITECTURE.md` — fare calculation lifecycle.

---

## NEW tables

### vehicles
Separated from drivers table. A driver registers exactly ONE vehicle.

| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| driver_id | uuid | yes | — | FK → drivers.id, UNIQUE (one vehicle per driver) |
| vehicle_type | varchar(20) | yes | — | **vehicleTypeEnum (8 values).** Set by driver; may be admin-adjusted during approval (downgrade/upgrade with reason). |
| manufacturer | varchar(100) | yes | — | e.g. 'Honda', 'Toyota', 'Bajaj' |
| model | varchar(100) | yes | — | e.g. 'City', 'Axio', 'Pulsar' |
| manufacturing_year | integer | yes | — | 4-digit year. Must be ≥ current_year - max_vehicle_age for the claimed vehicle_type (validated at admin approval; max_vehicle_age from `lib/vehicleTypes.ts` code constant). |
| cc_range | varchar(30) | no | NULL | Engine displacement range for motorcycle subtypes: '≤100', '101-150', '>150'. Required when vehicle_type IN ('bike_basic','bike_standard','bike_plus'). NULL for CNG and car types. |
| has_ac | boolean | no | NULL | Air conditioning present. Required for car types. For `car_economy` and `car_comfort`: selectable (true or false); selecting false shows a discouragement warning to the driver. For `car_premium` and `car_xl`: must be true (AC mandatory). NULL for motorcycles and CNG. Validated at admin approval via dashboard photo review. Non-AC vehicles are flagged in the admin dashboard. |
| passenger_seats | integer | yes | — | Seat capacity from `lib/vehicleTypes.ts` code constant (`seats` field). Seeded values: bike_basic/bike_standard/bike_plus=1, cng=3, car_economy/car_comfort/car_premium=4, car_xl=6–7 (7 as stored integer). |
| registration_area | varchar(30) | yes | — | Enum from BRTA reference: 'DHAKA_METRO', 'CHITTAGONG_METRO', etc. |
| vehicle_class_letter | varchar(10) | yes | — | Enum from BRTA reference: 'KA', 'KHA', 'GA', 'HA', 'LA', 'DAW', 'THAW', etc. |
| registration_number | varchar(50) | yes | — | Composed: `{registration_area}-{vehicle_class_letter}-XXXXXX` |
| registration_date | date | yes | — | Vehicle first registration date (BRTA). Used for 1-year minimum age enforcement (code constant `min_age_years` in `lib/vehicleTypes.ts`, currently 1). |
| fitness_expires_at | date | yes | — | Vehicle fitness expiry date |
| tax_token_expires_at | date | yes | — | Vehicle tax token expiry date |
| admin_type_note | text | no | NULL | Admin note if vehicle_type was changed during approval (e.g. "Downgraded from car_comfort to car_economy: no AC visible in dashboard photo"). Shown to driver. |
| type_change_effective_at | timestamptz | no | NULL | When a driver-initiated type change becomes effective (created_at + 7 days cooling-off). NULL if no pending type change. |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |

**Notes:**
- Vehicle photos (front, left, right, back), registration scan (front + back), fitness scan, and tax token scan are in the `documents` table.
- **Photo requirements by vehicle type:** Bike types must include helmet photos; car types must include a dashboard photo (showing AC controls or confirming no-AC); car_xl must include a third-row seat photo.
- The `BRTA enlistment certificate` document is mandatory for all vehicles: stored as `doc_type='brta_certificate'` in the `documents` table.
- `registration_date` is used for BRTA 1-year minimum age enforcement — a vehicle must be at least 1 year old from its first registration date to be eligible (code constant `min_age_years` in `lib/vehicleTypes.ts`).
- The 7-day cooling-off on driver-initiated type changes is tracked via `type_change_effective_at`. Dispatch uses the CURRENT `vehicles.vehicle_type`; the new type takes effect only after `type_change_effective_at` passes (scheduler updates the field).
- Max vehicle age soft limit (admin may override but default is rejection): bike_basic/bike_standard/bike_plus: no limit, cng: no limit, car_economy: 15yr, car_comfort: 12yr, car_premium: 8yr, car_xl: 12yr — all from `max_age_years` code constant in `lib/vehicleTypes.ts`. All have a 1-year minimum age (hard BRTA requirement, code constant `min_age_years`).
- **`passenger_seats` MUST be updated atomically with every `vehicle_type` change.** When `vehicles.vehicle_type` is updated (via admin downgrade, admin upgrade, or cooling-off completion), `vehicles.passenger_seats` must be set to the corresponding seat count from the vehicle type reference in the same transaction. Never update one without the other.

---

### vehicle_models
Reference table mapping known Bangladesh vehicle Brand/Model/Year combinations to Ride vehicle categories. Admin-maintainable. Used by the auto-classification engine in `lib/vehicleTypes.ts` to suggest the vehicle type during onboarding.

| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| brand | varchar(100) | yes | — | Manufacturer name (e.g. 'Toyota', 'Honda', 'Suzuki', 'Bajaj', 'Yamaha') |
| model | varchar(100) | yes | — | Model name (e.g. 'Axio', 'Vitz', 'Alto', 'FZ-S', 'Pulsar') |
| year_start | integer | no | NULL | First manufacturing year for this model variant. NULL = no lower bound. |
| year_end | integer | no | NULL | Last manufacturing year for this model variant. NULL = still in production or no upper bound. |
| default_vehicle_type | varchar(20) | yes | — | FK-style reference to vehicle_type enum. The Ride category this model maps to. |
| typical_cc_min | integer | no | NULL | Typical minimum engine CC for this model |
| typical_cc_max | integer | no | NULL | Typical maximum engine CC for this model |
| has_ac | boolean | no | NULL | Whether this model typically has factory AC. NULL = varies by variant. |
| passenger_seats | integer | yes | 4 | Typical seat count |
| is_active | boolean | yes | true | Admin toggle |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |

**Constraints:**
- `UNIQUE (brand, model, year_start, year_end)` — one entry per model-year range.
- `CHECK (default_vehicle_type IN ('bike_basic','bike_standard','bike_plus','cng','car_economy','car_comfort','car_premium','car_xl'))`.

**Seed data note:** This table must be seeded with at least the top 50 most common Bangladeshi ride-hailing vehicles. Admin can add/edit entries via admin panel. Seed script: `scripts/seed-vehicle-models.js`.

**Sample seed rows:**

| brand | model | year_start | year_end | default_vehicle_type | typical_cc_min | typical_cc_max | has_ac | passenger_seats |
|-------|-------|-----------|---------|---------------------|---------------|---------------|--------|----------------|
| Toyota | Axio | 2007 | 2024 | car_comfort | 1496 | 1798 | true | 4 |
| Toyota | Vitz | 2005 | 2014 | car_economy | 996 | 1329 | false | 4 |
| Toyota | Vitz | 2015 | 2024 | car_comfort | 996 | 1329 | true | 4 |
| Honda | City | 2009 | 2024 | car_comfort | 1497 | 1799 | true | 4 |
| Suzuki | Alto | 2005 | 2024 | car_economy | 796 | 1061 | false | 4 |
| Daihatsu | Mira | 2012 | 2024 | car_economy | 660 | 660 | false | 4 |
| Mitsubishi | eK | 2013 | 2024 | car_economy | 660 | 660 | false | 4 |
| Maruti | Alto | 2005 | 2024 | car_economy | 796 | 1061 | false | 4 |
| Tata | Indica | 2005 | 2018 | car_economy | 1396 | 1396 | false | 4 |
| Toyota | Camry | 2015 | 2024 | car_premium | 2487 | 2487 | true | 4 |
| Honda | Accord | 2015 | 2024 | car_premium | 1997 | 2400 | true | 4 |
| Toyota | Corolla | 2018 | 2024 | car_premium | 1798 | 1798 | true | 4 |
| Hyundai | Sonata | 2018 | 2024 | car_premium | 1999 | 2497 | true | 4 |
| Toyota | Noah | 2014 | 2024 | car_xl | 1986 | 2493 | true | 7 |
| Nissan | X-Trail | 2014 | 2024 | car_xl | 1997 | 2488 | true | 7 |
| Honda | CR-V | 2015 | 2024 | car_xl | 1997 | 2400 | true | 7 |
| Mitsubishi | Pajero | 2012 | 2024 | car_xl | 2835 | 3200 | true | 7 |
| Yamaha | FZ-S | 2010 | 2024 | bike_plus | 153 | 153 | n/a | 1 |
| Suzuki | Gixxer | 2015 | 2024 | bike_plus | 155 | 155 | n/a | 1 |
| Bajaj | Pulsar | 2005 | 2024 | bike_plus | 150 | 220 | n/a | 1 |
| Honda | Hornet | 2018 | 2024 | bike_plus | 184 | 184 | n/a | 1 |
| Honda | CB Shine SP | 2010 | 2024 | bike_standard | 124 | 124 | n/a | 1 |
| Bajaj | Discover | 2008 | 2024 | bike_standard | 125 | 150 | n/a | 1 |
| Hero | Glamour | 2010 | 2024 | bike_standard | 124 | 125 | n/a | 1 |
| Hero | Splendor | 2005 | 2024 | bike_basic | 97 | 97 | n/a | 1 |
| Bajaj | Platina | 2005 | 2024 | bike_basic | 100 | 102 | n/a | 1 |
| Runner | Cheeta | 2012 | 2024 | bike_basic | 100 | 108 | n/a | 1 |

**Auto-classification logic (in `lib/vehicleTypes.ts:suggestVehicleType()`):**
1. Driver enters brand + model + manufacturing year.
2. System queries `vehicle_models WHERE brand ILIKE input AND model ILIKE input AND year_start <= input_year AND year_end >= input_year AND is_active = true`.
3. If found: return `default_vehicle_type` as auto-suggestion. Also return `has_ac` and `passenger_seats` for form pre-fill.
4. If not found: fall back to BRTA Vehicle Class Letter + CC range logic (existing).
5. Admin sees both the auto-suggested type and the driver's self-selected type. Admin makes the final call.

---

### packages
| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| name | varchar(100) | yes | — | e.g. "Starter 50" |
| call_count | integer | yes | — | -1 = unlimited |
| duration_days | integer | yes | — | Package validity in days |
| price_bdt | integer | yes | — | Price in BDT paisa (e.g. 50000 = ৳500) |
| is_trial | boolean | yes | false | Micro-trial package flag |
| is_active | boolean | yes | true | Admin can deactivate |
| daily_cap | integer | yes | 200 | Hidden daily limit for unlimited packages. Admin configures per package; 200 is the default for new unlimited packages. |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |
| deleted_at | timestamptz | no | NULL | Soft delete |

### subscriptions
| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| driver_id | uuid | yes | — | FK → drivers.id |
| package_id | uuid | yes | — | FK → packages.id |
| calls_remaining | integer | yes | — | Decremented on deduction; -1 if unlimited |
| daily_calls_used | integer | yes | 0 | Reset to 0 at midnight BDT |
| daily_reset_at | timestamptz | yes | nextBdtMidnightUtc() | Set to nextBdtMidnightUtc() at subscription creation. |
| cap_override | numeric(3,2) | no | NULL | e.g. 0.50. Dispatch cap multiplier. |
| status | varchar(20) | yes | 'active' | Enum: 'active', 'expired', 'suspended' |
| purchased_at | timestamptz | yes | now() | — |
| expires_at | timestamptz | yes | — | purchased_at + duration_days |
| credit_calls_received | integer | yes | 0 | Total credit calls added to this subscription |
| total_deductions | integer | yes | 0 | Lifetime count of calls deducted. Never reset. Used for unlimited pro-rata credit: `credit_calls = floor((daily_cap * duration_days - total_deductions) * 0.5)` — the 0.5 multiplier is a business rule, not a config value. Incremented inside every deduction transaction. |
| is_trial | boolean | yes | false | Denormalised from packages.is_trial at purchase time. Required for DB-level trial-once enforcement. |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |

### credit_vouchers
| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| driver_id | uuid | yes | — | FK → drivers.id |
| calls | integer | yes | — | Pro-rata credit amount in calls |
| source | varchar(30) | yes | 'pro_rata' | Enum: `'pro_rata'`, `'incentive_reward'`, `'admin_grant'`. Distinguishes credit origin for wallet display and ledger filtering. |
| source_ref_id | uuid | no | NULL | FK reference to the originating entity. For `incentive_reward`: `driver_incentives.id`. For `pro_rata`: `subscriptions.id`. NULL for `admin_grant`. |
| expires_at | timestamptz | yes | — | Voucher void after this time (90 days from creation — business rule, not a DB constant) |
| redeemed_subscription_id | uuid | no | NULL | FK → subscriptions.id when used |
| status | varchar(20) | yes | 'active' | Enum: 'active', 'redeemed', 'expired' |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |

**Constraint:** `CHECK (source IN ('pro_rata', 'incentive_reward', 'admin_grant'))`.

> **Pro-rata shortage check:** query `COUNT(*) FROM dispatch_offers WHERE ride_id IN (SELECT id FROM rides WHERE zone_id=? AND created_at BETWEEN sub.purchased_at AND sub.expires_at)` as `zone_total_offers`, divided by online-driver count for the period. This is computed at expiry time — no additional table needed.

### call_ledger
| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| subscription_id | uuid | yes | — | FK → subscriptions.id |
| driver_id | uuid | yes | — | FK → drivers.id (denormalised) |
| ride_id | uuid | no | NULL | FK → rides.id. NULL for non-ride events. CHECK: `(event_type IN ('initial_load','credit','expiry_writeoff') AND ride_id IS NULL) OR (event_type IN ('deduction','refund') AND ride_id IS NOT NULL)`. |
| event_type | varchar(30) | yes | — | callEventTypeEnum |
| delta | integer | yes | — | Negative for deduction, positive for refund/credit |
| balance_after | integer | yes | — | Snapshot of calls_remaining after this event |
| reason | varchar(255) | yes | — | 'app_fetch', 'no_interaction_refund', 'pro_rata_credit', 'initial_load', etc. |
| created_at | timestamptz | yes | now() | — |

### dispatch_offers
| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| ride_id | uuid | yes | — | FK → rides.id |
| driver_id | uuid | yes | — | FK → drivers.id |
| batch_index | smallint | yes | — | — |
| sent_at | timestamptz | yes | — | — |
| fetch_confirmed_at | timestamptz | no | NULL | — |
| responded_at | timestamptz | no | NULL | — |
| outcome | varchar(20) | yes | 'delivered' | offerOutcomeEnum. Also supports 'filtered': set when driver is excluded from batch due to min_per_km_bdt floor. |
| rejection_reason | varchar(100) | no | NULL | Populated by `offer:reject` with a reason string (e.g. "too_far", "busy", "vehicle_issue"). NULL for all other outcomes. |
| filtered_reason | varchar(50) | no | NULL | Populated when `outcome='filtered'`. Describes why driver was excluded (e.g. "min_per_km"). |
| created_at | timestamptz | yes | now() | — |

**Note on `outcome='filtered'`:** When a driver's `min_per_km_bdt` exceeds the system's `per_km_bdt` for the requested vehicle type and zone, no offer is sent to that driver but a `dispatch_offers` row is written with `outcome='filtered'`. This row feeds the driver's "missed due to minimum" preview stat (`GET /api/driver/missed-requests`).

### owner_consents
| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| driver_id | uuid | yes | — | FK → drivers.id |
| owner_name | varchar(200) | yes | — | Vehicle owner's full name |
| owner_address | text | yes | — | Vehicle owner's address |
| owner_phone | varchar(20) | yes | — | E.164 format |
| consent_document_id | uuid | no | NULL | FK → documents.id (owner_consent_scan). Must be dated within 30 days. |
| legacy_screenshot_document_id | uuid | no | NULL | FK → documents.id (legacy_screenshot). |
| status | varchar(20) | yes | 'pending' | ownerConsentStatusEnum |
| reviewed_by | uuid | no | NULL | FK → users.id (admin) |
| reviewed_at | timestamptz | no | NULL | — |
| rejection_reason | varchar(500) | no | NULL | — |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |

### used_challenges
| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| jti | varchar(64) | yes | — | PK |
| used_at | timestamptz | yes | now() | — |
| expires_at | timestamptz | yes | — | — |
| created_at | timestamptz | yes | now() | — |

> **Replay guard note:** A replayed `challenge_jwt` with a JTI that was already cleaned up from `used_challenges` would also fail the JWT `exp` claim check (expired JWT). The `used_challenges` table is a secondary replay guard; the primary guard is the JWT `exp` claim. This is safe.

> **Deprecated note:** This table is retained for schema compatibility but may be simplified post-MVP. Supabase Auth handles OTP replay protection internally; the `used_challenges` table was originally for `challenge_jwt` replay prevention which is no longer applicable with Supabase Auth.

### rate_limits
| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| key | varchar(128) | yes | — | e.g. "ride_req:user:123" |
| window_start | timestamptz | yes | — | Bucket start |
| count | integer | yes | 0 | — |
| created_at | timestamptz | yes | now() | — |
**PK: (key, window_start)**

> **Cleanup note:** The `rate_limits` cleanup scheduler (every 60 minutes) must run reliably. If delayed, stale rows from the previous window may persist. This is acceptable for MVP scale.

### payment_events
| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| driver_id | uuid | yes | — | FK → drivers.id |
| package_id | uuid | yes | — | FK → packages.id |
| idempotency_key | varchar(64) | yes | — | UNIQUE — client-generated UUID |
| provider | varchar(20) | yes | — | paymentProviderEnum |
| provider_txn_id | varchar(255) | no | NULL | Returned by provider on success |
| amount_bdt | integer | yes | — | In paisa |
| status | varchar(20) | yes | 'initiated' | paymentStatusEnum |
| initiated_at | timestamptz | yes | now() | — |
| confirmed_at | timestamptz | no | NULL | When provider confirmed payment |
| subscription_id | uuid | no | NULL | FK → subscriptions.id — populated after activation |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |

### documents
| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| driver_id | uuid | yes | — | FK → drivers.id |
| vehicle_id | uuid | no | NULL | FK → vehicles.id. NULL for driver-level docs. NOT NULL for vehicle-level docs. |
| doc_type | varchar(30) | yes | — | documentTypeEnum (see below — now includes brta_certificate) |
| storage_url | text | yes | — | Supabase Storage path (NOT a public URL) |
| status | varchar(20) | yes | 'pending' | documentStatusEnum |
| reviewed_by | uuid | no | NULL | FK → users.id (admin) |
| reviewed_at | timestamptz | no | NULL | — |
| rejection_reason | varchar(500) | no | NULL | — |
| face_match_score | numeric(5,2) | no | NULL | Confidence score from face-match API comparing this document (driver_photo) against the licence photo. NULL for non-photo documents. Values 0.00–100.00. |
| face_match_status | varchar(20) | no | 'pending' | Enum: 'pending', 'matched', 'low_confidence', 'failed', 'not_applicable'. 'pending' = not yet processed; 'matched' = score above threshold; 'low_confidence' = score below threshold, flagged for admin; 'failed' = API error; 'not_applicable' = non-driver_photo doc type. |
| file_size_bytes | integer | yes | — | > 50KB for legacy_screenshot |
| purge_at | timestamptz | no | NULL | Set on account closure: `now() + 90 days`. Scheduler purges Supabase Storage and sets `storage_url = NULL`. |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |
| deleted_at | timestamptz | no | NULL | — |

### zones
| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| name | varchar(100) | yes | — | e.g. "Dhaka Zone 1" |
| polygon | jsonb | yes | — | Array of `{lat, lng}` points. Min 3 points, no self-intersection. |
| is_active | boolean | yes | false | Only one zone active at a time |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |

### chat_messages
| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| ride_id | uuid | yes | — | FK → rides.id |
| sender_id | uuid | yes | — | FK → users.id |
| content | text | yes | — | Max 1000 chars |
| created_at | timestamptz | yes | now() | — |

**Notes:** Only allowed when `rides.status` IN ('matched', 'driver_arriving', 'driver_arrived', 'in_progress'). 30-day retention by scheduler.

### pricing
| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| zone_id | uuid | yes | — | FK → zones.id |
| vehicle_type | varchar(20) | yes | — | **vehicleTypeEnum (8 values).** One pricing row per vehicle type per zone. |
| base_fare_bdt | integer | yes | — | In paisa. Charged on every ride. Also included in floor fare computation. |
| per_km_bdt | integer | yes | — | In paisa per km. Used for both distance charge and floor computation. |
| per_min_bdt | integer | yes | — | In paisa per minute of billable ride time. Applies to the unified ride timer (see below). |
| floor_length_km | numeric(10,2) | yes | — | Minimum km used for floor fare computation. `floor_fare = base_fare_bdt + round(per_km_bdt × floor_length_km) + (floor_min × per_min_bdt)`. |
| floor_min | integer | yes | — | Minimum minutes used for floor fare computation (same formula as above). |
| platform_commission_percent | numeric(5,2) | yes | 0.00 | Platform's share of the final fare (%). DEFAULT 0.00 = zero commission. Admin-configurable per vehicle type per zone via admin panel. Commission is calculated as a percentage of `final_fare` (post-floor). |
| is_active | boolean | yes | true | — |
| brta_fare_ceiling_bdt | integer | no | NULL | Government BRTA fare ceiling in paisa for this vehicle type. Admin reference only — system logs warning if calculated fare exceeds ceiling but does NOT block the ride. |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |

**Initial production values (seed via migration — all money in integer paisa; floor_length_km is decimal km). These are defaults; admin can adjust per zone/vehicle type via admin panel at any time:**
| vehicle_type | base_fare_bdt | per_km_bdt | per_min_bdt | floor_length_km | floor_min | platform_commission_percent |
|---|---|---|---|---|---|---|
| bike_basic | 2500 | 775 | 175 | 2.00 | 10 | 0.00 |
| bike_standard | 2500 | 950 | 180 | 2.00 | 10 | 0.00 |
| bike_plus | 2500 | 1050 | 190 | 2.00 | 10 | 0.00 |
| cng | 4000 | 1500 | 200 | 3.00 | 15 | 0.00 |
| car_economy | 4500 | 1500 | 350 | 4.00 | 20 | 0.00 |
| car_comfort | 5000 | 1800 | 375 | 4.00 | 20 | 0.00 |
| car_premium | 6500 | 2100 | 400 | 4.00 | 20 | 0.00 |
| car_xl | 8000 | 2500 | 425 | 4.00 | 20 | 0.00 |

> **Floor fare verification (BDT):** bike_basic 58 | bike_standard 62 | bike_plus 65 | cng 115 | car_economy 175 | car_comfort 197 | car_premium 229 | car_xl 265
> Computed as: `base_fare_bdt + round(per_km_bdt × floor_length_km) + (floor_min × per_min_bdt)` — all in paisa, divide by 100 for BDT display.

**Fare calculation formula (implemented in `lib/fareCalc.ts`):**
```
distance_charge  = round(per_km_bdt × distance_km)
time_charge      = ride_time_min × per_min_bdt          // integer arithmetic; per_min_bdt is integer paisa
computed_total   = base_fare_bdt + distance_charge + time_charge
floor_fare       = base_fare_bdt + round(per_km_bdt × floor_length_km) + (floor_min × per_min_bdt)
final_fare       = max(computed_total, floor_fare)
platform_fee     = round(driver_fare_bdt × platform_commission_percent / 100)
driver_net       = final_fare − platform_fee
```
All arithmetic in integer paisa; `Math.round` after each multiplication.

**Ride time definition:** Free waiting is a platform-wide constant: 60 seconds (`system_config.max_free_wait_seconds`). The billable timer starts at `timer_start = min(arrived_at + 60_000, started_at)` — whichever comes **first**. If `arrived_at IS NULL`, `timer_start = started_at`. At ride completion: `ride_time_min = CEIL((completed_at − timer_start) / 60_000)`. At estimation/request time: `ride_time_min = 0` (timer not yet running). **Auto-start:** When a ride enters `driver_arrived` status, the server starts a 60-second timer. On expiry, if status is still `driver_arrived`, the server automatically sets `started_at = arrived_at + 60s` and `status = 'in_progress'`. The `arrived_at` timestamp is set when the driver taps "I've Arrived"; `started_at` is set when the driver taps "Start Ride" (or auto-set after 60s).

**Commission note:** Rider pays `final_fare` to driver in cash. Driver owes platform `platform_fee` (tracked as liability via `rides.platform_commission_bdt`; no automated collection in MVP). Default commission is 0.00% — effectively zero commission unless admin configures otherwise.

**Notes (driver-first framing):**
- Time rates are differentiated per tier (175 / 180 / 190 paisa/min for bikes; 200 for CNG; 350–425 for cars). This unified timer covers both post-free-wait time and trip duration, ensuring drivers are compensated for traffic delays during the ride.
- CNG has a 3 km / 15 min floor — the most generous in the matrix — consistent with the longer boarding and traffic context in Dhaka for CNG trips.
- The floor fare guarantees a minimum driver earning on every trip, even very short ones. It is computed dynamically from `floor_length_km` and `floor_min` rather than stored as a static value, so admin adjustments to `per_km_bdt` or `per_min_bdt` automatically update the floor.
- `lib/fareCalc.ts` logs a warning if a calculated fare exceeds `brta_fare_ceiling_bdt` (from `pricing` or `system_config` — see below) or `brta_max_per_km_bdt` (from `platform_config`) but does NOT block the ride.

**BRTA fare ceiling lookup order (`lib/fareCalc.ts`):**
1. Check `pricing.brta_fare_ceiling_bdt` for the ride's vehicle type and zone (per-type ceiling).
2. If `pricing.brta_fare_ceiling_bdt` is NULL, fall back to `system_config.brta_fare_ceiling_bdt` (global ceiling).
3. If both are NULL or `'0'`, skip the ceiling check entirely.
4. Admin should prefer setting the per-type value in `pricing`; `system_config` serves as a fallback only.

**All `pricing` column values above are seeded defaults in the Drizzle migration. Admin can adjust via admin panel at any time. The floor fare (`base_fare_bdt + round(per_km_bdt × floor_length_km) + (floor_min × per_min_bdt)`) is a hard floor enforced at fare calculation time — it cannot be overridden per-ride.**

### driver_online_sessions
| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| driver_id | uuid | yes | — | FK → drivers.id |
| subscription_id | uuid | yes | — | FK → subscriptions.id |
| went_online_at | timestamptz | yes | — | When driver toggled online |
| went_offline_at | timestamptz | no | NULL | Set when driver goes offline. NULL = currently online. |
| duration_minutes | integer | no | NULL | Computed on offline: `EXTRACT(EPOCH FROM (went_offline_at - went_online_at)) / 60`. |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |

> **Application note — `subscription_id` update on renewal:** On subscription activation (`lib/activateSubscription.ts`): check if the driver is currently online (`drivers.is_online=true` AND an open session row exists where `went_offline_at IS NULL`). If so, close the old session (set `went_offline_at=now()`, compute `duration_minutes`) and open a new session row with the new `subscription_id`. This ensures every online session always references the correct active subscription.

### compensation_queue
| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| payment_event_id | uuid | yes | — | FK → payment_events.id |
| attempt_count | integer | yes | 0 | Incremented on each retry |
| max_attempts | integer | yes | 10 | — |
| next_retry_at | timestamptz | yes | now() | Next scheduled retry time |
| status | varchar(20) | yes | 'pending' | Enum: 'pending', 'completed', 'failed' |
| last_error | text | no | NULL | — |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |

> **Sequencing note — `activateSubscription()` transaction order:** (1) UPDATE `payment_events.status='paid'`, `confirmed_at=now()`, `subscription_id=new_sub.id`; (2) INSERT subscriptions; (3) INSERT call_ledger initial_load. If (1) fails (e.g., already 'paid'), raise idempotency error and skip steps 2–3.

### system_config
| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| key | varchar(100) | yes | — | PK |
| value | text | yes | — | String-encoded |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |

**Initial rows (all admin-configurable at runtime):** `dispatch_paused = 'false'`, `min_app_version = '1.0.0'`, `brta_fare_ceiling_bdt = '0'` (means "not configured" — `lib/fareCalc.ts` skips ceiling check when value is `'0'`). Admin must set actual BRTA ceiling before first production ride. `max_free_wait_seconds = '60'` — platform-wide free waiting constant (seconds); used by `utils-server/scheduler.ts` auto-start timer and `POST /api/ride/:id/complete` to compute `timer_start`. **Post-deploy checklist:** Set `system_config.brta_fare_ceiling_bdt` to the correct BRTA-mandated value (in paisa) for the operational region. If per-type ceilings are needed, set `pricing.brta_fare_ceiling_bdt` per vehicle type instead; the global value serves as fallback. Referenced by `lib/fareCalc.ts` and 15-RUNBOOK-DEPLOY.md.

Additional rows (admin must maintain):
- `apk_download_url = ''` — Direct download URL for the latest APK. Admin must set after each EAS build. Empty string means no download link available.
- `latest_version = '1.0.0'` — Current app version string. Admin must update on each release. Used by the forced-update screen (Screen 14) to compare against `min_app_version`.
- `geofence_arrival_radius_meters = '100'` — Post-MVP auto-detection: radius (meters) within which driver is considered "arrived" at pickup. Manual "I've Arrived" button is MVP.
- `geofence_arrival_dwell_seconds = '30'` — Post-MVP auto-detection: dwell time (seconds) driver must remain within geofence radius before auto-arrival triggers.
- `stale_arrived_timeout_minutes = '15'` — Auto-cancel if `rides.status = 'driver_arrived'` for longer than this value (minutes) after `arrived_at` without progressing to `in_progress`. Cancelled with `cancelled_by = 'system'`, `cancel_reason = 'driver_no_show_after_arrival'`.
- `sos_police_number = '999'` — National emergency number for SOS alerts (police control room). Used by `POST /api/sos/alert` triple SMS dispatch. Admin-configurable.
- `sos_ride_number = ''` — Platform's dedicated SOS monitoring number. All SOS alerts are also forwarded here. Admin must configure before production. Used by `POST /api/sos/alert`.
- `sample_vehicle_photo_front = ''` — Reference image URL showing a properly framed vehicle front photo. Admin must upload to Supabase Storage public bucket and set URL. Displayed to drivers during onboarding photo capture.
- `sample_vehicle_photo_left = ''` — Reference image URL for left-side photo.
- `sample_vehicle_photo_right = ''` — Reference image URL for right-side photo.
- `sample_vehicle_photo_rear = ''` — Reference image URL for rear photo.
- `sample_vehicle_photo_dashboard = ''` — Reference image URL for dashboard photo (showing AC controls clearly).
- `sample_vehicle_photo_seats = ''` — Reference image URL for interior front-seats photo.
- `sample_vehicle_video = ''` — Reference video URL for 15-30s walkaround video example. Admin must upload MP4 to Supabase Storage public bucket.
- `face_match_min_score = '70.00'` — Minimum face-match confidence score (0.00–100.00) for driver selfie vs licence photo comparison. Scores below this threshold set `documents.face_match_status = 'low_confidence'` and flag for admin review. Admin-configurable.

> **Note:** Driver-slider ratios and BRTA ceiling reference values are stored in the separate `platform_config` table (below), not `system_config`. Keep these tables separate: `system_config` = operational toggles & app version; `platform_config` = pricing policy & driver constraints.

---

### platform_config
Stores platform-level pricing policy and driver-constraint configuration. Admin-editable via `GET /PATCH /api/admin/config`. Read at runtime by `lib/fareCalc.ts` and `utils-server/dispatch.ts`.

| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| key | varchar(100) | yes | — | PK |
| value | text | yes | — | String-encoded numeric or boolean |
| updated_at | timestamptz | yes | now() | — |

**DDL:**
```sql
CREATE TABLE platform_config (
  key        varchar(100) PRIMARY KEY,
  value      text         NOT NULL,
  updated_at timestamptz  NOT NULL DEFAULT now()
);
```

**Seed rows (all values are admin-configurable defaults; modify via admin panel):**
| key | value | description |
|-----|-------|-------------|
| `driver_min_ratio` | `0.70` | Lower bound for driver's `min_per_km_bdt` slider, expressed as a ratio of the system `per_km_bdt`. Default: 70%. |
| `driver_max_ratio` | `1.50` | Upper bound for the slider. Default: 150%. |
| `brta_max_base_bdt` | `8500` | Default: ৳85 (8500 paisa). BRTA government ceiling for base fare. Admin-configurable — system warns if `pricing.base_fare_bdt` exceeds this. |
| `brta_max_per_km_bdt` | `3400` | Default: ৳34/km (3400 paisa). BRTA ceiling for per-km rate. Admin-configurable; system warns if `pricing.per_km_bdt` exceeds this. |
| `brta_max_wait_per_2min_bdt` | `850` | Default: ৳8.50/2 min (850 paisa). BRTA ceiling for waiting charge per 2 minutes. Admin-configurable; used in fare ceiling check in `lib/fareCalc.ts`. |

**Usage:**
- `lib/fareCalc.ts`: reads `brta_max_base_bdt`, `brta_max_per_km_bdt`, `brta_max_wait_per_2min_bdt` to determine whether to emit a BRTA ceiling warning. Warning is logged; the ride is never blocked.
- `app/api/driver/me` (PATCH): reads `driver_min_ratio` and `driver_max_ratio` to validate `min_per_km_bdt` update against the allowed slider range.
- `GET /api/driver/slider-config`: reads all three ratio/ceiling keys to build the slider bounds response.
- Changes via `PATCH /api/admin/config` take effect immediately for all future requests. No restart required.

### vehicle_type_changes
Audit trail for all vehicle type changes — admin downgrades, admin upgrades, and driver-initiated type changes with 7-day cooling-off.

| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| driver_id | uuid | yes | — | FK → drivers.id |
| old_vehicle_type | varchar(20) | yes | — | Previous type (enum: vehicle_type) |
| new_vehicle_type | varchar(20) | yes | — | Requested/approved type (enum: vehicle_type) |
| change_reason | varchar(20) | yes | — | Enum: 'admin_downgrade', 'admin_upgrade', 'driver_request' |
| reason_text | varchar(500) | yes | — | Mandatory explanation (shown to driver) |
| changed_by | uuid | no | NULL | FK → users.id (admin who made the change). NULL for driver-initiated. |
| status | varchar(20) | yes | 'pending' | Enum: 'pending', 'approved', 'rejected', 'cooling_off' |
| effective_at | timestamptz | no | NULL | When the change takes effect. For driver requests: approved_at + 7 days. For admin changes: approved_at immediately. |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |

**Notes:**
- Admin downgrades are immediate (`status='approved'`, `effective_at=now()`).
- Admin upgrades (`change_reason='admin_upgrade'`): immediate, no cooling-off period. `status` goes to `'approved'` directly.
- Driver-initiated type changes require admin review. On approval: `status='cooling_off'`, `effective_at=now() + 7 days`. After 7 days, scheduler sets `status='approved'` and updates `drivers.vehicle_type`.
- Downgrade order: car_xl > car_premium > car_comfort > car_economy > cng > bike_plus > bike_standard > bike_basic.

**Invariant:** For any vehicle with a pending type change: `vehicles.type_change_effective_at = vehicle_type_changes.effective_at` (for the most recent `cooling_off` row for this vehicle's driver). These are set together in `POST /api/admin/driver/type-change-approve`.

### promo_codes
Platform-funded promo codes for rider fare discounts. Driver fare is unaffected; the platform absorbs the subsidy.

| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| code | varchar(30) | yes | — | Unique, case-insensitive promo code (e.g. `SAVE20`). Indexed unique. |
| title | varchar(100) | no | NULL | Display title (e.g. "20% off your next ride") |
| description | text | no | NULL | Full terms/description |
| discount_type | varchar(10) | yes | — | Enum: `'percent'`, `'flat'`. Percent = % off; flat = fixed BDT off. |
| discount_value | integer | yes | — | For `percent`: whole number 1–100. For `flat`: integer paisa. |
| max_uses | integer | yes | — | Total redemption limit across all riders. `NULL` = unlimited. |
| max_uses_per_rider | integer | no | 1 | Max times a single rider can redeem. Default 1. |
| usage_interval | integer | no | NULL | If set, the promo is only eligible every Nth completed ride since the rider's last redemption. NULL = no interval restriction. Admin-configurable. |
| max_discount_bdt | integer | no | NULL | Cap on discount in paisa (for `percent` type). `NULL` = no cap. |
| min_spend_bdt | integer | no | NULL | Minimum `total_bdt` required to apply. In paisa. |
| valid_from | timestamptz | yes | — | Promo becomes active at this time |
| expires_at | timestamptz | yes | — | Promo expires at this time |
| is_active | boolean | yes | true | Admin can deactivate without deleting |
| created_by | uuid | no | NULL | FK → users.id (admin) |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |
| deleted_at | timestamptz | no | NULL | Soft delete. `is_active` toggle is the primary deactivation mechanism; this is for admin permanent removal. |

**Constraints:**
- `UNIQUE (code)` — case-insensitive via CITEXT or `LOWER(code)` index.
- `CHECK (discount_value > 0)`.
- `CHECK (discount_type IN ('percent', 'flat'))`.
- `CHECK (discount_type != 'percent' OR discount_value <= 100)`.

### promo_redemptions
Immutable append-only log of every promo code redemption.

| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| promo_code_id | uuid | yes | — | FK → promo_codes.id |
| rider_id | uuid | yes | — | FK → users.id |
| ride_id | uuid | yes | — | FK → rides.id |
| discount_type | varchar(10) | yes | — | Snapshot from promo_codes at redemption time |
| discount_value | integer | yes | — | Snapshot from promo_codes |
| discounted_amount_bdt | integer | yes | — | Actual discount applied in paisa |
| driver_fare_bdt | integer | yes | — | What the driver receives (full fare, unchanged) |
| rider_payable_bdt | integer | yes | — | What the rider pays (fare − discount) |
| platform_subsidy_bdt | integer | yes | — | Platform cost = discounted_amount_bdt |
| created_at | timestamptz | yes | now() | — |

**Constraints:**
- `UNIQUE (promo_code_id, rider_id, ride_id)` — prevent double-redemption per ride.
- No `updated_at` — this is an append-only table.

### incentive_definitions
Admin-defined incentive campaigns for drivers. Completed incentives award bonus calls via `credit_vouchers`.

| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| name | varchar(100) | yes | — | e.g. "Complete 20 rides this week" |
| description | text | no | NULL | Human-readable details |
| target_metric | varchar(20) | yes | — | Enum: `'completed_rides'`, `'online_hours'`, `'acceptance_rate'`, `'consecutive_accepts'` |
| target_value | numeric | yes | — | Threshold to complete (e.g. 20 rides, 40 hours, 0.90 rate) |
| reward_calls | integer | yes | — | Bonus call credits awarded on completion |
| vehicle_type_filter | varchar(20) | no | NULL | If set, only drivers of this vehicle_type are eligible. FK-style reference to vehicle_type enum. |
| starts_at | timestamptz | yes | — | Campaign start |
| ends_at | timestamptz | yes | — | Campaign end |
| is_active | boolean | yes | true | Admin toggle |
| created_by | uuid | no | NULL | FK → users.id (admin) |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |
| deleted_at | timestamptz | no | NULL | Soft delete. `is_active` toggle is the primary deactivation mechanism; this is for admin permanent removal. |

**Constraints:**
- `CHECK (target_metric IN ('completed_rides', 'online_hours', 'acceptance_rate', 'consecutive_accepts'))`.
- `CHECK (target_value > 0)`.
- `CHECK (reward_calls > 0)`.

### driver_incentives
Tracks each driver's progress toward an active incentive.

| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| driver_id | uuid | yes | — | FK → drivers.id |
| incentive_id | uuid | yes | — | FK → incentive_definitions.id |
| current_progress | numeric | yes | 0 | Current value toward target_value |
| completed_at | timestamptz | no | NULL | Set when `current_progress >= target_value` |
| reward_voucher_id | uuid | no | NULL | FK → credit_vouchers.id. Set when reward is granted. |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |

**Constraints:**
- `UNIQUE (driver_id, incentive_id)` — one progress row per driver per incentive.

### preferences
Ride preference definitions managed by admin (e.g. large luggage, quiet ride, AC required).

| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| name | varchar(50) | yes | — | Machine key (e.g. `'large_luggage'`, `'quiet_ride'`, `'female_friendly'`, `'ac_required'`) |
| display_label_en | varchar(100) | yes | — | English display label |
| display_label_bn | varchar(100) | yes | — | Bengali display label |
| icon | varchar(50) | no | NULL | Icon name from icon library |
| charge_bdt | integer | no | 0 | Additional charge in paisa for this preference |
| affects_matching | boolean | yes | false | If true, dispatch filters by driver_preferences |
| is_active | boolean | yes | true | Admin toggle |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |

**Constraints:**
- `UNIQUE (name)` — unique machine key.

### driver_preferences
Which preferences a driver has opted into. Used by dispatch to match rider preferences.

| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| driver_id | uuid | yes | — | FK → drivers.id |
| preference_id | uuid | yes | — | FK → preferences.id |
| created_at | timestamptz | yes | now() | — |

**Constraints:**
- `UNIQUE (driver_id, preference_id)` — no duplicates.

### ride_preferences
Records which preferences were selected for a specific ride and any associated surcharge.

| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| ride_id | uuid | yes | — | FK → rides.id |
| preference_id | uuid | yes | — | FK → preferences.id |
| charge_bdt | integer | yes | 0 | Surcharge applied (snapshot from preferences.charge_bdt at booking time) |
| created_at | timestamptz | yes | now() | — |

**Constraints:**
- `UNIQUE (ride_id, preference_id)` — no duplicates per ride.
- No `updated_at` — immutable after creation.

---

### rider_addresses
Saved favourite addresses for riders. Used for quick pickup/dropoff selection on the ride booking screen.

| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| user_id | uuid | yes | — | FK → users.id |
| label | varchar(100) | yes | — | User-assigned label (e.g. "Home", "Office", "Gym") |
| address | text | yes | — | Full address string from Barikoi autocomplete |
| details | text | no | NULL | Optional extra info (e.g. "3rd floor", "near the mosque") |
| lat | numeric(10,7) | yes | — | Latitude |
| lng | numeric(10,7) | yes | — | Longitude |
| is_favorite | boolean | yes | false | Marked as favorite for quick access on home screen |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |
| deleted_at | timestamptz | no | NULL | Soft delete. `DELETE /api/rider/addresses/:id` sets this; `POST .../undo-delete` clears it. |

**Constraints:**
- Max 20 active addresses per user (enforced at application layer in `POST /api/rider/addresses`).

---

### sos_alerts
Audit log of SOS alert triggers for both riders and drivers. Written by `POST /api/sos/alert`.

| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| user_id | uuid | yes | — | FK → users.id. The user who triggered the SOS (rider or driver). |
| role | varchar(10) | yes | — | Enum: `'rider'`, `'driver'`. Role of the user at alert time. |
| latitude | numeric(10,7) | yes | — | User's location at alert time |
| longitude | numeric(10,7) | yes | — | User's location at alert time |
| message | text | no | NULL | Custom SMS message composed by user in the SOS modal. |
| contacts_notified | jsonb | yes | — | Array of contact objects: `[{type: 'police'|'personal'|'platform', phone: string, sms_sent: boolean}]`. Records which contacts were notified. |
| created_at | timestamptz | yes | now() | — |

**Note:** Append-only — no `updated_at`. No soft delete (audit log).

---

## Enums (define as Drizzle pgEnum)

| Enum name | Values | Notes |
|-----------|--------|-------|
| user_role | 'rider', 'driver', 'admin' | — |
| driver_status | 'pending', 'temporary', 'active', 'suspended', 'rejected' | — |
| **vehicle_type** | **'bike_basic', 'bike_standard', 'bike_plus', 'cng', 'car_economy', 'car_comfort', 'car_premium', 'car_xl'** | **Lowercase snake_case. Replaces old 4-value enum AND old UPPERCASE 8-value enum. All tables, API responses, Zod schemas, and UI constants must use exactly these 8 strings.** |
| ride_status | 'pending', 'dispatching', 'matched', 'driver_arriving', **'driver_arrived'**, 'in_progress', 'completed', 'cancelled', 'expired', 'no_drivers' | `driver_arrived` inserted between `driver_arriving` and `in_progress`. Set when driver taps "I've Arrived" at pickup (MVP) or via auto-geofence (post-MVP). |
| subscription_status | 'active', 'expired', 'suspended' | — |
| call_event_type | 'deduction', 'refund', 'credit', 'initial_load', 'expiry_writeoff' | — |
| payment_provider | 'portpos' | Formerly 'bkash', 'nagad'. Consolidated to PortPos as unified payment gateway. Old callbacks kept as inert fallback. |
| payment_status | 'initiated', 'paid', 'failed', 'callback_pending' | — |
| document_type | 'license_front', 'license_back', 'reg_scan_front', 'reg_scan_back', 'fitness_scan', 'tax_token_scan', 'brta_certificate', 'vehicle_photo_front', 'vehicle_photo_left', 'vehicle_photo_right', 'vehicle_photo_back', 'legacy_screenshot', 'owner_consent_scan', 'helmet_photo', 'dashboard_photo', 'interior_photo', 'third_row_photo', 'driver_photo', 'vehicle_video', 'vehicle_photo_seats' | `brta_certificate` — mandatory BRTA vehicle enlistment certificate for all vehicles; `helmet_photo` — mandatory for bike_basic/bike_standard/bike_plus; `dashboard_photo` — mandatory for all car types (AC verification); `interior_photo` — optional for car types; `third_row_photo` — mandatory for car_xl; `driver_photo` — mandatory live selfie or passport-style photo for face-match against driving licence; `vehicle_video` — mandatory 15-30s walkaround video for all vehicle types; `vehicle_photo_seats` — mandatory interior front-seats photo for car types |
| document_status | 'pending', 'approved', 'rejected' | — |
| offer_outcome | 'delivered', 'accepted', 'rejected', 'expired', 'refunded', 'filtered' | `filtered` added — for min_per_km_bdt exclusions |
| credit_voucher_source | 'pro_rata', 'incentive_reward', 'admin_grant' | Distinguishes credit origin in `credit_vouchers.source` |
| owner_consent_status | 'pending', 'approved', 'rejected', 'expired' | — |
| registration_area | 'DHAKA_METRO', 'CHITTAGONG_METRO', 'KHULNA_METRO', 'RAJSHAHI_METRO', 'BARISAL_METRO', 'SYLHET_METRO', 'RANGPUR_METRO', 'MYMENSINGH_METRO' | — |
| vehicle_class_letter | 'KA', 'KHA', 'GA', 'GHA', 'CHA', 'CHHA', 'JA', 'JHA', 'TA', 'THA', 'DA', 'NA', 'PA', 'BHA', 'MA', 'DAW', 'THAW', 'HA', 'LA', 'EE', 'YA' | — |
| wallet_driver_transaction_type | 'promo_receivable', 'referral_receivable', 'payout', 'adjustment' | Driver wallet transaction types |
| wallet_rider_transaction_type | 'referral_reward', 'ride_discount', 'adjustment' | Rider wallet transaction types |
| point_transaction_type | 'earned', 'redeemed', 'expired' | Point transaction types |
| point_source_type | 'ride', 'commission', 'admin_grant' | Source of point earning |
| point_reward_type | 'package_grant', 'wallet_credit' | How point offer reward is delivered |
| referral_status | 'pending', 'rewarded' | Referral lifecycle |
| face_match_status | 'pending', 'matched', 'low_confidence', 'failed', 'not_applicable' | Driver photo face-match result. 'pending' = not yet processed; 'matched' = score above threshold; 'low_confidence' = score below threshold, flagged for admin; 'failed' = API error; 'not_applicable' = non-driver_photo doc type. |
| vehicle_change_reason | 'admin_downgrade', 'admin_upgrade', 'driver_request' | Why a vehicle type change was initiated |
| vehicle_change_status | 'pending', 'approved', 'rejected', 'cooling_off' | Vehicle type change lifecycle |

---

## Vehicle Type Reference (canonical — used by admin approval, dispatch, pricing, UI)

> This table is the single source of truth for all vehicle-type-specific rules.
> Stored in `lib/vehicleTypes.ts` as a typed constant (not a DB table).
> Admin approval screens and dispatch logic import from this file.
> **cc_range stored values:** `'≤100'`, `'101-150'`, `'>150'` (no 'cc' suffix). These are the exact string values stored in `vehicles.cc_range` and validated by `POST /api/vehicle/register`. Display labels (e.g. "≤100cc") are formatted only in the UI layer.

| vehicle_type | display_en | display_bn | cc_range | has_ac | seats | min_age_years | max_age_years | licence_type | typical_models | extra_docs | driver_req |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bike_basic | Bike Basic | বাইক বেসিক | ≤100 | n/a | 1 | 1 | none | Motorcycle | Hero Splendor, Bajah Platina, Runner Cheeta | Helmet photos (driver + spare) | none |
| bike_standard | Bike Standard | বাইক স্ট্যান্ডার্ড | 101-150 | n/a | 1 | 1 | none | Motorcycle | Honda CB Shine SP, Bajah Discover, Hero Glamour | Helmet photos | none |
| bike_plus | Bike Plus | বাইক প্লাস | >150 | n/a | 1 | 1 | none | Motorcycle | Yamaha FZ-S, Suzuki Gixxer, Bajah Pulsar, Honda Hornet | Helmet photos | none |
| cng | CNG | সিএনজি | n/a | false | 3 | 1 | none | Light transport / CNG driver permit | Standard CNG auto-rickshaw | Road-legal check | none |
| car_economy | Car Economy | কার ইকোনমি | n/a | optional (Non-AC discouraged) | 4 | 1 | 15 | Private car licence | Suzuki Alto, Toyota Vitz (older), Daihatsu Mira, Mitsubishi eK, Maruti Alto, Tata Indica | Dashboard photo (AC verification); interior seats photo | none |
| car_comfort | Car Comfort | কার কমফোর্ট | n/a | optional (Non-AC discouraged) | 4 | 1 | 12 | Private car licence | Toyota Axio, Honda City, Toyota Vitz (AC), Hyundai Accent | Dashboard photo (AC verification); interior seats photo | none |
| car_premium | Car Premium | কার প্রিমিয়াম | n/a | required (AC mandatory) | 4 | 1 | 8 | Private car licence | Toyota Camry, Honda Accord, newer Corolla, Hyundai Sonata | Premium interior photo; dashboard photo (AC required); interior seats photo | ≥50 rides, rating ≥4.5 (gate enforced after 50 rides) |
| car_xl | Car XL | কার এক্সএল | n/a | required (AC mandatory) | 6–7 (7 stored) | 1 | 12 | Private car or light transport licence | Toyota Noah, X-Trail, Honda CR-V, Mitsubishi Pajero | Third-row seat photo; dashboard photo (AC required); interior seats photo | ≥25 rides, rating ≥4.3 (gate enforced after 25 rides) |

**Driver requirement gate logic (`lib/vehicleTypes.ts: checkDriverEligibility()`):**
- `car_premium`: if `drivers.completed_rides_count >= 50` → require `drivers.rating >= 4.5`. If count < 50 → gate NOT applied (new drivers start unrestricted).
- `car_xl`: if `drivers.completed_rides_count >= 25` → require `drivers.rating >= 4.3`. If count < 25 → gate NOT applied.
- All other types: no driver requirement gate.
- Threshold values (50 rides, 4.5 rating, 25 rides, 4.3 rating) are code constants defined in `lib/vehicleTypes.ts` and can be changed by updating that source file.
- Called by: admin approval screen (shows eligibility warning), `POST /api/vehicle/register` validation, `utils-server/dispatch.ts` (filters ineligible drivers from batches).

**Max vehicle age enforcement (values from `min_age_years` and `max_age_years` code constants in `lib/vehicleTypes.ts`):**
- Hard minimum (`min_age_years = 1`, BRTA requirement) enforced at admin approval. Admin MUST reject vehicles with `manufacturing_year > current_year - 1`.
- Max age is a soft limit (`max_age_years` varies by vehicle type; see table above). Admin may approve older well-maintained vehicles but default UI shows a rejection warning. Admin must explicitly override with a note.

---

## Critical indexes (add to Drizzle schema)

| Table | Column(s) | Type | Reason |
|-------|-----------|------|--------|
| drivers | `h3_cell_res9` | btree | Dispatch geo-query |
| drivers | `is_online, status` | btree | Dispatch filter |
| drivers | `last_location_at` | btree | Stale driver cleanup |
| drivers | `user_id` | unique | 1:1 mapping |
| drivers | `vehicle_id` | unique | 1:1 driver-vehicle mapping |
| drivers | `vehicle_type` | btree | Dispatch vehicle-type filter |
| drivers | `min_per_km_bdt` WHERE `min_per_km_bdt IS NOT NULL` | btree partial | Driver minimum KM rate filter in dispatch |
| drivers | `completed_rides_count` | btree | Premium/XL tier eligibility check |
| vehicles | `driver_id` | unique | One vehicle per driver |
| vehicles | `registration_number` | unique | BRTA registration uniqueness |
| vehicles | `fitness_expires_at` | btree | Fitness expiry sweep |
| vehicles | `tax_token_expires_at` | btree | Tax token expiry sweep |
| vehicles | `vehicle_type` | btree | Vehicle type filter |
| vehicles | `type_change_effective_at` WHERE `type_change_effective_at IS NOT NULL` | btree partial | Scheduler: apply pending type changes |
| vehicles | `registration_date` | btree | Age check queries |
| call_ledger | `driver_id, created_at` | btree | Ledger history query |
| call_ledger | `ride_id, driver_id` WHERE `event_type='deduction'` | unique partial | Prevent double deduction |
| call_ledger | `subscription_id, created_at` | btree | Subscription auditing |
| subscriptions | `driver_id, status` | btree | Active lookup |
| subscriptions | `driver_id` WHERE `status='active'` | unique partial | Only 1 active per driver |
| subscriptions | `expires_at` WHERE `status='active'` | btree | Expiry sweeps |
| payment_events | `idempotency_key` | unique | Idempotency enforcement |
| payment_events | `status` WHERE `subscription_id IS NULL AND status='paid'` | btree | Orphan recovery |
| rides | `status, created_at` | btree | Admin queue, dispatch retry |
| rides | `user_id, status` | btree | Rider history |
| rides | `driver_id, status` | btree | Driver history |
| rides | `vehicle_type` | btree | Vehicle-type ride analytics |
| rides | `scheduled_at` WHERE `status='pending' AND scheduled_at IS NOT NULL AND scheduled_dispatched_at IS NULL` | btree | Scheduled dispatch sweep |
| rides | `promo_code_id` WHERE `promo_code_id IS NOT NULL` | btree partial | Promo usage lookup |
| documents | `driver_id, status` | btree | Admin approval queue |
| documents | `driver_id, doc_type` WHERE `status IN ('pending','approved') AND deleted_at IS NULL` | unique partial | Max 1 doc per type per driver |
| documents | `vehicle_id` WHERE `vehicle_id IS NOT NULL` | btree | Vehicle document lookup |
| documents | `doc_type` | btree | Document type filter |
| documents | `purge_at` WHERE `purge_at IS NOT NULL` | btree | Document retention purge sweep |
| dispatch_offers | `ride_id, batch_index` | btree | Deduplication |
| dispatch_offers | `driver_id, sent_at DESC` | btree | Missed requests log |
| dispatch_offers | `ride_id, driver_id` | unique | Prevent same driver receiving same ride twice |
| dispatch_offers | `outcome` WHERE `outcome='filtered'` | btree partial | Driver min-KM filtered offers lookup |
| rate_limits | `key, window_start` | unique | Throttle deduplication |
| users | `phone` | unique | Contact uniqueness |
| users | `auth_uid` | unique | Auth uniqueness |
| zones | `(1)` WHERE `is_active=true` | unique partial | Only 1 active zone |
| pricing | `zone_id, vehicle_type` WHERE `is_active=true` | unique partial | 1 active price per combo |
| pricing | `vehicle_type` | btree | Vehicle-type pricing lookup |
| subscriptions | `(driver_id)` WHERE `is_trial=true AND status IN ('active','expired')` | unique partial | Trial allowed only once |
| chat_messages | `ride_id, created_at` | btree | Chat history by ride |
| credit_vouchers | `driver_id` WHERE `status='active'` | btree partial | Active voucher lookup |
| driver_online_sessions | `driver_id, subscription_id` | btree | Online duration query |
| driver_online_sessions | `subscription_id, went_offline_at` | btree | Pro-rata credit sum query |
| compensation_queue | `status, next_retry_at` WHERE `status='pending'` | btree partial | Worker poll query |
| compensation_queue | `payment_event_id` | unique | Prevent duplicate queue entries |
| system_config | `key` | unique PK | Config lookup |
| platform_config | `key` | unique PK | Config lookup — no additional index needed beyond PK |
| drivers | `brta_certificate_url` WHERE `brta_certificate_url IS NOT NULL` | btree partial | Admin quick lookup of BRTA cert without documents JOIN |
| vehicle_type_changes | `driver_id, created_at DESC` | btree | Driver's type change history |
| vehicle_type_changes | `status, effective_at` WHERE `status='cooling_off'` | btree partial | Cooling-off sweep query |
| promo_codes | `LOWER(code)` | unique | Case-insensitive code uniqueness |
| promo_codes | `is_active, valid_from, expires_at` | btree | Active promo lookup |
| promo_redemptions | `promo_code_id, rider_id, ride_id` | unique | Prevent double-redemption per ride |
| promo_redemptions | `rider_id, created_at` | btree | Rider promo history |
| promo_redemptions | `ride_id` | btree | Ride promo lookup |
| incentive_definitions | `is_active, starts_at, ends_at` | btree | Active incentive lookup |
| driver_incentives | `driver_id, incentive_id` | unique | One progress row per driver per incentive |
| driver_incentives | `driver_id, completed_at` WHERE `completed_at IS NULL` | btree partial | Active incentive progress lookup |
| preferences | `name` | unique | Preference key uniqueness |
| preferences | `is_active` | btree | Active preference filter |
| driver_preferences | `driver_id, preference_id` | unique | No duplicate driver-preference pairs |
| driver_preferences | `preference_id` | btree | Dispatch preference filter |
| ride_preferences | `ride_id, preference_id` | unique | No duplicate ride-preference pairs |
| ride_preferences | `ride_id` | btree | Ride preference lookup |
| sos_alerts | `user_id, created_at` | btree | SOS alert history by user |
| sos_alerts | `role` | btree | Filter by role |
| credit_vouchers | `driver_id, status` WHERE `status='active'` | btree partial | Active voucher lookup by source |
| credit_vouchers | `source, source_ref_id` WHERE `source_ref_id IS NOT NULL` | btree partial | Source traceability lookup |
| referral_campaigns | `is_active` WHERE `is_active=true` | unique partial | Only one active campaign at a time |
| referral_codes | `user_id` | unique | One code per user |
| referral_codes | `code` | unique | Code uniqueness |
| referrals | `referrer_id, created_at` | btree | Referrer's referral history |
| referrals | `referee_id` | unique | One referral per referee |
| referrals | `campaign_id` | btree | Campaign usage tracking |
| driver_wallet_transactions | `driver_id, created_at` | btree | Driver wallet history |
| driver_wallet_transactions | `reference_id` WHERE `reference_id IS NOT NULL` | btree partial | Transaction traceability |
| rider_wallet_transactions | `rider_id, created_at` | btree | Rider wallet history |
| rider_wallet_transactions | `reference_id` WHERE `reference_id IS NOT NULL` | btree partial | Transaction traceability |
| points | `user_id` | unique | One balance row per user |
| point_transactions | `user_id, created_at` | btree | User points history |
| point_transactions | `reference_id` WHERE `reference_id IS NOT NULL` | btree partial | Transaction traceability |
| point_offers | `is_active` | btree | Active offer lookup |
| vehicle_models | `brand, model` | btree | Model lookup by brand+model |
| vehicle_models | `default_vehicle_type` | btree | Filter by vehicle type |
| vehicle_models | `is_active` | btree | Active model filter |
| vehicle_models | `brand, model, year_start, year_end` | unique | One entry per model-year range |
| documents | `face_match_status` WHERE `face_match_status IN ('pending','low_confidence')` | btree partial | Unprocessed and flagged face matches |
| rider_addresses | `user_id, created_at DESC` | btree | List user's addresses ordered by recency |
| rider_addresses | `user_id` WHERE `deleted_at IS NULL` | btree partial | Active addresses lookup |
| rider_addresses | `user_id, is_favorite` WHERE `deleted_at IS NULL AND is_favorite = true` | btree partial | Quick favorite lookup |

---

### referral_campaigns
Admin-defined referral reward rules. Only one active at a time.

| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| name | varchar(100) | yes | — | Campaign name |
| referrer_reward_percent | integer | yes | — | Discount % for referrer's next ride |
| referee_reward_percent | integer | yes | — | Discount % for referee's first ride |
| max_uses_per_referrer | integer | yes | — | Max friends a single user can invite |
| max_uses_per_campaign | integer | no | NULL | Global limit |
| is_active | boolean | yes | true | Only 1 can be active at once |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |

### referral_codes
Unique invite codes for every user.

| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| user_id | uuid | yes | — | FK → users.id |
| code | varchar(20) | yes | — | e.g. RIDE-A3F9B2. Unique. |
| created_at | timestamptz | yes | now() | — |

### referrals
Links referrer and referee. Reward issued on referee's first completed ride.

| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| referrer_id | uuid | yes | — | FK → users.id |
| referee_id | uuid | yes | — | FK → users.id |
| campaign_id | uuid | yes | — | FK → referral_campaigns.id |
| status | varchar(20) | yes | 'pending' | Enum: 'pending', 'rewarded' |
| rewarded_at | timestamptz | no | NULL | Set on referee's first completed ride |
| created_at | timestamptz | yes | now() | — |

### driver_wallet_transactions
Ledger of platform receivables owed to drivers (subsidies, rewards) minus payouts.

| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| driver_id | uuid | yes | — | FK → drivers.id |
| transaction_type | varchar(30) | yes | — | Enum: 'promo_receivable', 'referral_receivable', 'payout', 'adjustment' |
| amount_bdt | integer | yes | — | Paisa. Positive for receivables (owed to driver), negative for payouts/adjustments. |
| reference_id | uuid | no | NULL | FK to rides.id or referrals.id |
| balance_after | integer | yes | — | Snapshot of wallet balance after transaction |
| created_at | timestamptz | yes | now() | — |

### rider_wallet_transactions
Ledger of platform credits available to riders. MVP is informational.

| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| rider_id | uuid | yes | — | FK → users.id |
| transaction_type | varchar(30) | yes | — | Enum: 'referral_reward', 'ride_discount', 'adjustment' |
| amount_bdt | integer | yes | — | Paisa. Positive = credit added, Negative = credit used |
| reference_id | uuid | no | NULL | FK to rides.id or referrals.id |
| balance_after | integer | yes | — | Snapshot of wallet balance after transaction |
| created_at | timestamptz | yes | now() | — |

### points
Current point balance for all users (drivers and riders).

| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| user_id | uuid | yes | — | FK → users.id. Unique constraint. |
| balance | integer | yes | 0 | Current point balance |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |

### point_transactions
Log of all point earnings and redemptions.

| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| user_id | uuid | yes | — | FK → users.id |
| transaction_type | varchar(30) | yes | — | Enum: 'earned', 'redeemed', 'expired' |
| source_type | varchar(30) | no | NULL | Enum: 'ride', 'commission', 'admin_grant' |
| amount | integer | yes | — | Positive for earned, negative for redeemed/expired |
| reference_id | uuid | no | NULL | FK to rides.id or point_offers.id |
| balance_after | integer | yes | — | Snapshot |
| created_at | timestamptz | yes | now() | — |

### point_offers
Admin-defined rewards redeemable with points.

| Column | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | yes | gen_random_uuid() | PK |
| title | varchar(100) | yes | — | e.g. "Free Starter Package" |
| points_required | integer | yes | — | Points needed to redeem |
| reward_type | varchar(30) | yes | — | Enum: 'package_grant', 'wallet_credit' |
| reward_value | varchar(100) | yes | — | Package ID or BDT paisa amount |
| is_active | boolean | yes | true | — |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |

---

## Reference Data (lib/vehicleTypes.ts and lib/referenceData.ts)

Reference data is served via API endpoints from typed constants — NOT as DB tables.

### `lib/vehicleTypes.ts` (canonical vehicle type reference)
Exports:
- `VEHICLE_TYPES: VehicleTypeDefinition[]` — the 8-row table above, typed (free waiting is a platform-wide constant from `system_config.max_free_wait_seconds`, not a per-type field)
- `VEHICLE_TYPE_ZOD_ENUM` — Zod enum with the 8 lowercase values (`'bike_basic'` … `'car_xl'`). Import this in all API route Zod schemas; never define vehicle_type inline.
- `getVehicleType(key: VehicleTypeEnum): VehicleTypeDefinition`
- `checkDriverEligibility(vehicleType: VehicleTypeEnum, driver: { completed_rides_count: number, rating: number }): { eligible: boolean, reason?: string }`
- `validateDriverMinKm(vehicleType: VehicleTypeEnum, zonePerKmBdt: number, minPerKmBdt: number, minRatio: number, maxRatio: number): { valid: boolean, error?: string }` — validates against dynamically computed bounds from `platform_config.driver_min_ratio` and `driver_max_ratio` (caller passes the ratio values; this function does the arithmetic)

### `lib/referenceData.ts` (BRTA reference data)
Exports:
- `REGISTRATION_AREAS: RegistrationArea[]`
- `VEHICLE_CLASS_LETTERS: VehicleClassLetter[]`

### Registration Areas
| Value | display_bn | display_en |
|-------|-----------|-----------|
| DHAKA_METRO | ঢাকা মেট্রো | Dhaka Metro |
| CHITTAGONG_METRO | চট্টগ্রাম মেট্রো | Chittagong Metro |
| KHULNA_METRO | খুলনা মেট্রো | Khulna Metro |
| RAJSHAHI_METRO | রাজশাহী মেট্রো | Rajshahi Metro |
| BARISAL_METRO | বরিশাল মেট্রো | Barisal Metro |
| SYLHET_METRO | সিলেট মেট্রো | Sylhet Metro |
| RANGPUR_METRO | রংপুর মেট্রো | Rangpur Metro |
| MYMENSINGH_METRO | ময়মনসিংহ মেট্রো | Mymensingh Metro |

### Vehicle Class Letters (BRTA)
| Value | display_bn | display_en | description |
|-------|-----------|-----------|-------------|
| DAW | দ | Daw | Private CNG / Auto Rickshaw |
| THAW | থ | Thaw | Passenger CNG (For Hire) |
| HA | হ | Ha | Motorcycle (80–125 cc) |
| LA | ল | La | Motorcycle (126–165 cc) |
| KA | ক | Ka | Private car (up to 1000 cc) |
| KHA | খ | Kha | Private car (1001–1300 cc) |
| GA | গ | Ga | Private car (1301–2000 cc) |
| GHA | ঘ | Gha | SUV / Crossover |
| CHA | চ | Cha | Private MPV / Microbus |
| CHHA | ছ | Chha | Rental Microbus / Tempo |
| JA | জ | Ja | Mini Bus |
| JHA | ঝ | Jha | Large Bus / Coach Bus |
| TA | ট | Ta | Heavy Truck |
| THA | ঠ | Tha | Commercial Double Cabin Pickup |
| DA | ড | Da | Medium Truck |
| NA | ন | Na | Small Pickup |
| PA | প | Pa | Taxicab |
| BHA | ভ | Bha | Private car (2000+ cc) |
| MA | ম | Ma | Pickup (Goods/Delivery) |
| EE | ই | Ee | Small Truck / Agricultural Vehicle |
| YA | য | Ya | Prime Minister's Office |

---

## Migration note for vehicle_type enum expansion

When running `npx drizzle-kit generate` after adding the new vehicleTypeEnum values, the generated migration will need to handle the old 4-value enum. Since PostgreSQL does not support removing enum values, the migration strategy is:

1. **Create new enum** `vehicle_type_new` with all 8 values.
2. **ALTER TABLE** drivers, rides, vehicles, pricing, dispatch_offers: change column type to varchar(20) temporarily.
2. **Data migration:** UPDATE existing rows to map old values to new lowercase values (MOTORCYCLE → 'bike_standard' as a safe default; CNG_AUTO_RICKSHAW → 'cng'; CAR → 'car_comfort'; MICROBUS → 'car_xl'; 'BIKE_BASIC' → 'bike_basic'; 'BIKE_STANDARD' → 'bike_standard'; 'BIKE_PLUS' → 'bike_plus'; 'CNG' → 'cng'; 'CAR_ECONOMY' → 'car_economy'; 'CAR_COMFORT' → 'car_comfort'; 'CAR_PREMIUM' → 'car_premium'; 'CAR_XL' → 'car_xl'). **These mappings are provisional — admin must review and manually correct each driver's vehicle type after migration.**
4. **ALTER** columns to use new enum type.
5. **DROP** old enum.

**AI MUST NOT run this migration automatically in production.** Flag for human review with the note: "Vehicle type migration requires admin review of existing driver vehicle types."
