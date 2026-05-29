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
- **Exception:** Append-only tables that are never updated (`call_ledger`, `dispatch_offers`, `used_challenges`, `rate_limits`) are exempt from the `updated_at` requirement. These tables only have `created_at`.
- Soft-delete tables (user-facing): add `deleted_at timestamptz NULL`
- No hard deletes on: users, drivers, riders, packages, call_ledger, rides, documents
- Exempt from soft delete (append-only audit/ledger): `call_ledger`, `dispatch_offers`
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

### rides (modify existing)
| Change | Detail |
|--------|--------|
| KEEP `origin_address`, `destination_address`, `origin_latitude`, `origin_longitude`, `destination_latitude`, `destination_longitude`, `user_id`, `created_at` | No change |
| MODIFY `driver_id` | MAKE NULLABLE (uuid NULL FK → drivers.id). Pre-match it MUST be NULL. |
| REMOVE `fare_price` (single value) | Replaced by fare_breakdown |
| ADD `zone_id` uuid NOT NULL | FK → zones.id, RESTRICT |
| ADD `pricing_id` uuid NOT NULL | FK → pricing.id, RESTRICT |
| ADD `distance_km` numeric(7,3) NOT NULL | Extracted from fare_breakdown |
| ADD `fare_breakdown` jsonb NOT NULL | `{base_fare_bdt: int (paisa), distance_charge_bdt: int (paisa), wait_charge_bdt: int (paisa), total_bdt: int (paisa), distance_km: number, platform_commission_percent: number, platform_commission_bdt: int \| null, driver_net_bdt: int \| null}` |
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
| has_ac | boolean | no | NULL | Air conditioning present. Required for car types ('car_economy' must be false, 'car_comfort'/'car_premium'/'car_xl' must be true). NULL for motorcycles and CNG. Validated at admin approval via dashboard photo review. |
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
| expires_at | timestamptz | yes | — | Voucher void after this time (90 days from creation — business rule, not a DB constant) |
| redeemed_subscription_id | uuid | no | NULL | FK → subscriptions.id when used |
| status | varchar(20) | yes | 'active' | Enum: 'active', 'redeemed', 'expired' |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |

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
| base_fare_bdt | integer | yes | — | In paisa |
| per_km_bdt | integer | yes | — | In paisa per km |
| per_min_wait_bdt | integer | yes | — | In paisa per minute after free wait |
| free_wait_minutes | integer | yes | — | Free waiting minutes before charges begin. Default values (seeded, admin-configurable per zone/vehicle type): 2 for bikes, 1 for CNG, 2 for cars. See also `free_wait_minutes` in `lib/vehicleTypes.ts`. |
| minimum_fare_bdt | integer | yes | — | Hard floor for the final fare in paisa. `final_fare = max(computed_total, minimum_fare_bdt)`. Applied in `lib/fareCalc.ts`. |
| platform_commission_percent | numeric(5,2) | yes | 0.00 | Platform's share of the final fare (%). DEFAULT 0.00 = zero commission. Admin-configurable per vehicle type per zone via admin panel. Commission is calculated as a percentage of `final_fare` (post-minimum-floor). |
| is_active | boolean | yes | true | — |
| brta_fare_ceiling_bdt | integer | no | NULL | Government BRTA fare ceiling in paisa for this vehicle type. Admin reference only — system logs warning if calculated fare exceeds ceiling but does NOT block the ride. |
| created_at | timestamptz | yes | now() | — |
| updated_at | timestamptz | yes | now() | — |

**Initial production values (seed via migration — all amounts in paisa). These are defaults; admin can adjust per zone/vehicle type via admin panel at any time:**
| vehicle_type | base_fare_bdt | per_km_bdt | per_min_wait_bdt | free_wait_minutes | minimum_fare_bdt | platform_commission_percent |
|---|---|---|---|---|---|---|
| bike_basic | 2000 | 900 | 50 | 2 | 6000 | 0.00 |
| bike_standard | 2400 | 1050 | 50 | 2 | 7000 | 0.00 |
| bike_plus | 2800 | 1250 | 50 | 2 | 8000 | 0.00 |
| cng | 4000 | 1200 | 200 | 1 | 8000 | 0.00 |
| car_economy | 3500 | 1300 | 250 | 2 | 15000 | 0.00 |
| car_comfort | 4000 | 1600 | 300 | 2 | 18000 | 0.00 |
| car_premium | 5000 | 1900 | 300 | 2 | 25000 | 0.00 |
| car_xl | 7000 | 2200 | 350 | 2 | 30000 | 0.00 |

**Fare calculation formula (implemented in `lib/fareCalc.ts`):**
```
total          = base_fare_bdt + (per_km_bdt × distance_km) + max(0, actual_wait_min − free_wait_minutes) × per_min_wait_bdt
final_fare     = max(total, minimum_fare_bdt)
platform_fee   = round(final_fare × platform_commission_percent / 100)
driver_net     = final_fare − platform_fee
```
All arithmetic in integer paisa; round after each multiplication.

**Actual wait time:** At ride completion, `actual_wait_min = max(0, CEIL((started_at − arrived_at) / 60))` if `arrived_at IS NOT NULL`; otherwise the estimated wait from the original fare breakdown is used. The `arrived_at` timestamp is the canonical start of the waiting timer.

**Commission note:** Rider pays `final_fare` to driver in cash. Driver owes platform `platform_fee` (tracked as liability via `rides.platform_commission_bdt`; no automated collection in MVP). Default commission is 0.00% — effectively zero commission unless admin configures otherwise.

**Notes (driver-first framing):**
- Bike waiting charges are unified at 50 paisa/min across all bike tiers (seeded default in `pricing` table; admin-configurable), consistent with market norms. Differentiation comes from base fare + per-km rate, ensuring drivers earn more per km than on commission platforms.
- CNG fares respect BRTA meter guidelines. The 1-minute free wait (seeded default in `pricing` table; admin-configurable; vs. competitors' 0) is possible because Ride takes zero commission — the driver is not penalised by platform overhead on each fare.
- `lib/fareCalc.ts` logs a warning if a calculated fare exceeds `brta_fare_ceiling_bdt` (from `pricing` or `system_config` — see below) or `brta_max_per_km_bdt` (from `platform_config`) but does NOT block the ride.

**BRTA fare ceiling lookup order (`lib/fareCalc.ts`):**
1. Check `pricing.brta_fare_ceiling_bdt` for the ride's vehicle type and zone (per-type ceiling).
2. If `pricing.brta_fare_ceiling_bdt` is NULL, fall back to `system_config.brta_fare_ceiling_bdt` (global ceiling).
3. If both are NULL or `'0'`, skip the ceiling check entirely.
4. Admin should prefer setting the per-type value in `pricing`; `system_config` serves as a fallback only.

**All `pricing` column values above are seeded defaults in the Drizzle migration. Admin can adjust via admin panel at any time. `minimum_fare_bdt` is a hard floor enforced at fare calculation time — it cannot be overridden per-ride.**

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

**Initial rows (all admin-configurable at runtime):** `dispatch_paused = 'false'`, `min_app_version = '1.0.0'`, `brta_fare_ceiling_bdt = '0'` (means "not configured" — `lib/fareCalc.ts` skips ceiling check when value is `'0'`). Admin must set actual BRTA ceiling before first production ride. **Post-deploy checklist:** Set `system_config.brta_fare_ceiling_bdt` to the correct BRTA-mandated value (in paisa) for the operational region. If per-type ceilings are needed, set `pricing.brta_fare_ceiling_bdt` per vehicle type instead; the global value serves as fallback. Referenced by `lib/fareCalc.ts` and 15-RUNBOOK-DEPLOY.md.

Additional rows (admin must maintain):
- `apk_download_url = ''` — Direct download URL for the latest APK. Admin must set after each EAS build. Empty string means no download link available.
- `latest_version = '1.0.0'` — Current app version string. Admin must update on each release. Used by the forced-update screen (Screen 14) to compare against `min_app_version`.
- `geofence_arrival_radius_meters = '100'` — Post-MVP auto-detection: radius (meters) within which driver is considered "arrived" at pickup. Manual "I've Arrived" button is MVP.
- `geofence_arrival_dwell_seconds = '30'` — Post-MVP auto-detection: dwell time (seconds) driver must remain within geofence radius before auto-arrival triggers.
- `stale_arrived_timeout_minutes = '15'` — Auto-cancel if `rides.status = 'driver_arrived'` for longer than this value (minutes) after `arrived_at` without progressing to `in_progress`. Cancelled with `cancelled_by = 'system'`, `cancel_reason = 'driver_no_show_after_arrival'`.

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
| document_type | 'license_front', 'license_back', 'reg_scan_front', 'reg_scan_back', 'fitness_scan', 'tax_token_scan', 'brta_certificate', 'vehicle_photo_front', 'vehicle_photo_left', 'vehicle_photo_right', 'vehicle_photo_back', 'legacy_screenshot', 'owner_consent_scan', 'helmet_photo', 'dashboard_photo', 'interior_photo', 'third_row_photo' | `brta_certificate` — mandatory BRTA vehicle enlistment certificate for all vehicles; `helmet_photo` — mandatory for bike_basic/bike_standard/bike_plus; `dashboard_photo` — mandatory for all car types (AC verification); `interior_photo` — optional for car types; `third_row_photo` — mandatory for car_xl |
| document_status | 'pending', 'approved', 'rejected' | — |
| offer_outcome | 'delivered', 'accepted', 'rejected', 'expired', 'refunded', 'filtered' | `filtered` added — for min_per_km_bdt exclusions |
| owner_consent_status | 'pending', 'approved', 'rejected', 'expired' | — |
| registration_area | 'DHAKA_METRO', 'CHITTAGONG_METRO', 'KHULNA_METRO', 'RAJSHAHI_METRO', 'BARISAL_METRO', 'SYLHET_METRO', 'RANGPUR_METRO', 'MYMENSINGH_METRO' | — |
| vehicle_class_letter | 'KA', 'KHA', 'GA', 'GHA', 'CHA', 'CHHA', 'JA', 'JHA', 'TA', 'THA', 'DA', 'NA', 'PA', 'BHA', 'MA', 'DAW', 'THAW', 'HA', 'LA', 'EE', 'YA' | — |

---

## Vehicle Type Reference (canonical — used by admin approval, dispatch, pricing, UI)

> This table is the single source of truth for all vehicle-type-specific rules.
> Stored in `lib/vehicleTypes.ts` as a typed constant (not a DB table).
> Admin approval screens and dispatch logic import from this file.
> **cc_range stored values:** `'≤100'`, `'101-150'`, `'>150'` (no 'cc' suffix). These are the exact string values stored in `vehicles.cc_range` and validated by `POST /api/vehicle/register`. Display labels (e.g. "≤100cc") are formatted only in the UI layer.

| vehicle_type | display_en | display_bn | cc_range | has_ac | seats | min_age_years | max_age_years | free_wait_minutes | licence_type | typical_models | extra_docs | driver_req |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bike_basic | Bike Basic | বাইক বেসিক | ≤100 | n/a | 1 | 1 | none | 2 | Motorcycle | Hero Splendor, Bajah Platina, Runner Cheeta | Helmet photos (driver + spare) | none |
| bike_standard | Bike Standard | বাইক স্ট্যান্ডার্ড | 101-150 | n/a | 1 | 1 | none | 2 | Motorcycle | Honda CB Shine SP, Bajah Discover, Hero Glamour | Helmet photos | none |
| bike_plus | Bike Plus | বাইক প্লাস | >150 | n/a | 1 | 1 | none | 2 | Motorcycle | Yamaha FZ-S, Suzuki Gixxer, Bajah Pulsar, Honda Hornet | Helmet photos | none |
| cng | CNG | সিএনজি | n/a | false | 3 | 1 | none | 1 | Light transport / CNG driver permit | Standard CNG auto-rickshaw | Road-legal check | none |
| car_economy | Car Economy | কার ইকোনমি | n/a | false | 4 | 1 | 15 | 2 | Private car licence | Toyota Vitz (non-AC), Maruti Alto, Tata Indica | Dashboard photo (no-AC confirmation) | none |
| car_comfort | Car Comfort | কার কমফোর্ট | n/a | true (OEM) | 4 | 1 | 12 | 2 | Private car licence | Toyota Axio, Honda City, Toyota Vitz (AC) | Dashboard photo (OEM AC controls) | none |
| car_premium | Car Premium | কার প্রিমিয়াম | n/a | true (OEM) | 4 | 1 | 8 | 2 | Private car licence | Toyota Camry, Honda Accord, newer Corolla, Hyundai Sonata | Premium interior photo | ≥50 rides, rating ≥4.5 (gate enforced after 50 rides) |
| car_xl | Car XL | কার এক্সএল | n/a | true (OEM) | 6–7 (7 stored) | 1 | 12 | 2 | Private car or light transport licence | Toyota Noah, X-Trail, Honda CR-V, Mitsubishi Pajero | Third-row seat photo | ≥25 rides, rating ≥4.3 (gate enforced after 25 rides) |

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

---

## Reference Data (lib/vehicleTypes.ts and lib/referenceData.ts)

Reference data is served via API endpoints from typed constants — NOT as DB tables.

### `lib/vehicleTypes.ts` (canonical vehicle type reference)
Exports:
- `VEHICLE_TYPES: VehicleTypeDefinition[]` — the 8-row table above, typed (includes `free_wait_minutes: number` field — 2 for bikes, 1 for CNG, 2 for cars)
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
