<!--
AI INSTRUCTIONS
===============
These are the canonical definitions of every domain-specific term in Ride.
This platform's business model is unique (subscription call-based, not commission-based), so many terms
do not exist in standard ride-hailing vocabulary and must be defined precisely here.
Use the exact spelling and casing from this table in all code, DB columns, UI copy, and docs.
Never use synonyms for defined terms — synonyms cause context confusion across files.
-->

# Glossary: Ride

> Terms defined here are the single source of truth. If a term appears in code, databases, UI copy, or docs, it must use the exact spelling and casing from this table.

---

## Core domain terms

| Term | Definition | Used in |
|------|------------|---------| 
| **City Boundary** | A polygon defining the geographic extent of a divisional city, stored in `city_boundaries`. Used for intercity ride detection: if pickup is inside a city polygon and dropoff is outside that same polygon, the ride is intercity. Polygons represent divisional administrative boundaries (not tight urban footprints) and are admin-configurable via `/admin/city-boundaries`. | DB table: `city_boundaries`; lib: `lib/cityBoundary.ts` |
| **Origin City** | The city (from `city_boundaries`) that contains the ride's pickup coordinate. Determined by point-in-polygon at ride request time. `null` if the pickup is not inside any active city boundary (rural pickup). | DB: `rides.fare_breakdown.origin_city`; API: `GET /api/ride/estimate`, `POST /api/ride/request` |
| **Intercity Ride** | A ride where the pickup is inside an active city boundary and the dropoff is outside that same city polygon (`is_intercity = true`). Intercity rides use a split-rate fare model: the inside-city portion uses the normal `per_km_bdt` and the outside-city portion uses `intercity_per_km_bdt`. If `origin_city = null` (rural pickup), the ride is never intercity. | DB: `rides.fare_breakdown.is_intercity`; lib: `lib/fareCalc.ts`, `lib/routeSplit.ts` |
| **Route Splitting** | The process of dividing a ride's total road distance into `inside_km` (inside the origin city polygon) and `outside_km` (outside it). Primary path: Barikoi Route API returns road geometry as an encoded polyline; decoded into GeoJSON and split with Turf.js against the city polygon. Fallback: Haversine straight-line distance with a 1.3 urban factor for inside and 1.0 for outside. | Lib: `lib/routeSplit.ts`; API: `POST /api/ride/request`, `GET /api/ride/estimate` |
| **Call** | A single unit from a driver's subscription package that is consumed when the driver's app actively fetches a ride request. One call = one ride opportunity viewed. NOT the same as a phone call. | DB: `call_ledger.delta`, `subscriptions.calls_remaining`; UI: "You have 42 calls remaining" |
| **Call Wallet** | The driver-visible summary of their current call balance, active subscription, and expiry. Displayed as a card on the driver home screen. | UI component: `CallWalletCard`; docs |
| **Call Ledger** | The immutable append-only log of every call event (deduction, refund, credit, initial load) for a driver. Never updated; only appended. | DB table: `call_ledger`; API: `GET /api/call-ledger` |
| **Package** | An admin-defined subscription product with a fixed number of calls, a duration in days, and a price in BDT. Drivers purchase packages to receive ride leads. | DB table: `packages`; UI: "Starter 50", "Unlimited Monthly" |
| **Subscription** | A driver's active instance of a purchased package. One subscription is active at a time per driver. Tracks `calls_remaining`, `expires_at`, and `daily_calls_used`. | DB table: `subscriptions` |
| **Lead** | Synonym for a ride request as seen by the driver. NOT used in code or DB — use "ride request" or "offer" in code. Used only in informal documentation and marketing. | Informal docs only — avoid in code |
| **Offer** | A ride request that has been broadcast to a specific driver via WebSocket (`ride:offer` event). An offer has a countdown (default: 15 seconds; configurable). Distinct from a ride request (the rider's action). | WebSocket event: `ride:offer`; DB table: `dispatch_offers` (see 05-DATA-MODEL.md) |
| **Deduction** | A `call_ledger` event that subtracts 1 call from a driver's balance. Triggered only when the driver's app actively fetches a ride offer (`fetch:confirm` WebSocket message received). | DB: `call_ledger.event_type = 'deduction'`; code: `heartbeat.ts` |
| **Fetch Confirm** | The WebSocket message (`fetch:confirm`) sent by the driver app on the **first user interaction** with the ride offer card (touch on swipe handle, card area, or any button). This triggers the call deduction window. NOT the accept action, and NOT automatic on render. | WebSocket event name: `fetch:confirm`; code: `heartbeat.ts` |
| **Heartbeat** | The recurring WebSocket message (`heartbeat`) sent by the driver app at a configurable interval (default: every 10 seconds) while online. Used to track driver presence and update `last_location_at`. | WebSocket event: `heartbeat`; code: `heartbeat.ts` |
| **Broadcast** | The act of the WebSocket server sending a ride offer to a group of selected drivers simultaneously. Dispatch happens in batches (up to a configurable maximum; default: 3 batches per ride request). | Code: `dispatch.ts`; docs |
| **Batch** | One round of offer broadcasting to a set of top-N drivers. If no driver accepts in Batch 1, the server moves to Batch 2 (different drivers). Maximum is configurable (default: 3 batches). | Code: `dispatch.ts`; PRD requirement 27 |
| **Pro-rata Credit** | A compensating credit issued to a driver when their subscription expires with less than a configurable threshold (default: 50%) of calls used AND the platform (not the driver) is responsible for the low utilisation (insufficient ride demand). The credit is applied to the next subscription. | DB: `call_ledger.event_type = 'credit'`; UI notification; flow 5 in 07-USER-FLOWS.md |
| **Provisional / Temporary** | A driver account status: `temporary` is granted to non-owner drivers whose consent scan copy was approved (valid for a configurable period, default: 30 days; must re-submit for full activation). Legacy operators who are self-owned vehicle drivers get fast-track admin SLA (configurable, default: 12h). Full documents must be verified within a configurable window (default: 7 days). | DB: `drivers.status = 'temporary'`, `drivers.provisional_expires_at`; UI: "Temporarily active" |
| **Utilisation** | The percentage of purchased calls a driver has used from their active subscription: `calls_used / package.call_count`. Used to calculate pro-rata credit eligibility. | Code: `scheduler.ts`; docs |
| **Zone** | A polygon defining the geographic area where Ride operates. Ride requests with pickup outside the active zone are rejected. MVP: one active zone (Dhaka). | DB table: `zones`; lib: `zone.ts` |
| **Owner Consent** | The process by which the vehicle owner (if different from the driver) provides written consent via a scanned document (dated within a configurable recency window, default: 30 days) allowing their vehicle to be registered on the platform. Admin reviews and approves the scan copy. NOT an OTP flow. | DB: `owner_consents`, `drivers.owner_consent_verified`; flow 2 in 07-USER-FLOWS.md |
| **Micro-trial Package** | A specially flagged package (e.g., default: 5 calls / 1 day; values are admin-configurable per package) offered exclusively to new drivers for their first purchase. Always displayed first in the package list. | DB: `packages.is_trial = true` |
| **Compensation Queue** | A DB-backed retry mechanism (`compensation_queue` table) that handles the "payment confirmed but activation failed" scenario. `compensationWorker.ts` polls the table at a configurable interval (default: every 30 seconds), up to a configurable max (default: 10 retries). | Code: `compensationWorker.ts`; DB table: `compensation_queue`; 18-KNOWN-ISSUES.md TD-10, TD-17 |
| **Daily Cap** | The hidden maximum number of calls an unlimited-package driver can receive in a single day (default: 200). Exceeding it suspends call delivery for the rest of that day. Not displayed to drivers. | DB: `packages.daily_cap`; `subscriptions.daily_calls_used` |
| **H3 Cell** | An Uber H3 hexagonal grid cell. Driver locations are indexed into H3 cells at a configurable resolution (default: resolution 9, ~174m diameter). Used for fast geospatial driver lookup during dispatch. | DB: `drivers.h3_cell_res9`; code: `lib/h3.ts`, `utils-server/h3Index.ts` |
| **Ring Expansion** | The process of expanding H3 driver search outward ring-by-ring when an exact cell has insufficient available drivers. Ring 0 = exact cell; Ring 1 = adjacent cells; Ring 2 = next layer. | Code: `lib/h3.ts findNearbyDrivers()` |
| **Idempotency Key** | A client-generated UUID attached to every payment initiation request. Prevents double-charging if the client retries the same request. Stored in `payment_events.idempotency_key` with a UNIQUE constraint. | DB: `payment_events.idempotency_key`; API: `Idempotency-Key` header |
| **Acceptance Rate** | The percentage of ride offers a driver has accepted out of all offers presented. Tracked as `drivers.acceptance_rate`. Used as one of four weighted factors in driver scoring during dispatch. | DB: `drivers.acceptance_rate`; code: `dispatch.ts` |
| **driver_arrived** | Ride status set when the driver physically reaches the pickup location and taps "I've Arrived" (or via auto-geofence — post-MVP). Sets `arrived_at` timestamp. A 60-second free wait timer starts (platform-wide constant from `system_config.max_free_wait_seconds`). The billable timer starts at whichever comes first: driver clicks "Start Ride" or 60 seconds expire after `arrived_at`. After 60s, the ride auto-transitions to `in_progress`. | DB: `rides.status = 'driver_arrived'` |
| **ride_time_min** | Billable minutes from timer start to ride completion. `timer_start = min(arrived_at + 60_000, started_at)` (60s free wait is a platform-wide constant from `system_config.max_free_wait_seconds`). `ride_time_min = CEIL((completed_at − timer_start) / 60_000)`. Falls back to `started_at` if `arrived_at IS NULL`. | Code: `lib/fareCalc.ts` |
| **platform_commission_percent** | Admin-configurable commission rate (%) stored in `pricing` per vehicle type per zone. Default 0.00. The platform's share of the final fare, tracked as a driver liability. | DB: `pricing.platform_commission_percent` |
| **platform_commission_bdt** | Integer paisa value computed at ride completion as `round(total_bdt × platform_commission_percent / 100)`. Stored on `rides`. NULL until completed. | DB: `rides.platform_commission_bdt` |
| **driver_net_bdt** | `total_bdt − platform_commission_bdt`. The amount the driver retains after commission. Equals `total_bdt` when commission is 0%. | Code: `lib/fareCalc.ts` |
| **Base Fare** | Flat pickup charge stored in `pricing.base_fare_bdt`. Included in every fare calculation and the floor fare computation. | DB: `pricing.base_fare_bdt`; code: `lib/fareCalc.ts` |
| **Floor Fare** | Minimum fare amount calculated as `base_fare_bdt + round(per_km_bdt × floor_length_km) + (floor_min × per_min_bdt)`. The system applies `final_fare = max(computed_total, floor_fare)` at completion. Not stored as a separate column. | DB: `pricing.floor_length_km`, `pricing.floor_min`; code: `lib/fareCalc.ts` |
| **Free Waiting Time** | 60 seconds for all vehicle types, stored in `system_config.max_free_wait_seconds`. After `arrived_at`, the ride auto-starts at `arrived_at + 60s` if the driver has not tapped Start Ride. | DB: `system_config.max_free_wait_seconds`; code: `utils-server/scheduler.ts`, `app/api/ride/[id]/complete+api.ts` |
| **Per-Minute Rate** | Charge per minute of ride time after the free waiting period. Stored in `pricing.per_min_bdt`. Used in `calculateFare` as `ride_time_min × per_min_bdt`. | DB: `pricing.per_min_bdt`; code: `lib/fareCalc.ts` |
| **Floor Length** | Minimum distance component of the floor fare, in kilometers. Stored in `pricing.floor_length_km`. Used in the floor fare formula with `round(per_km_bdt × floor_length_km)`. | DB: `pricing.floor_length_km`; code: `lib/fareCalc.ts` |
| **Floor Minutes** | Minimum time component of the floor fare, in minutes. Stored in `pricing.floor_min`. Used in the floor fare formula as `floor_min × per_min_bdt`. | DB: `pricing.floor_min`; code: `lib/fareCalc.ts` |
| **GoRide Design System** | The adopted visual language for Ride, based on the GoRide ride-hailing UI Kit CSS tokens, screen patterns, and marker iconography. It is the source of truth for colors, typography, spacing, radius, and component surfaces. | Docs: `08-UI-SPEC.md`, `09-UX-SPEC.md`; Theme: `theme/goRide.ts` |
| **Ride Primary Logo** | The primary brand mark used across splash, app icon, auth, and in-app header contexts. Selected from the logo source set as the largest and simplest variant. | Asset: `assets/logo/logo.png` (source: App Design/Logo/image-2026-05-04T15-36-03-285Z.png) |

---

## BRTA & Vehicle Registration Terms

| Term | Definition | Used in |
|------|------------|---------|
| **BRTA** | Bangladesh Road Transport Authority. The government body responsible for vehicle registration and licensing. | Docs, reference data |
| **Registration Area** | The BRTA metro area where a vehicle is registered (e.g., DHAKA_METRO, CHITTAGONG_METRO). 8 metro areas total. Stored as enum in `vehicles.registration_area`. | DB: `vehicles.registration_area`; enum: `registration_area` |
| **Vehicle Class Letter** | The BRTA alphanumeric class code on a vehicle's registration plate (e.g., KA = private car ≤1000cc, GA = private car 1301-2000cc, DAW = private CNG, HA = motorcycle 80-125cc). 21 classes total. Stored as enum in `vehicles.vehicle_class_letter`. | DB: `vehicles.vehicle_class_letter`; enum: `vehicle_class_letter` |
| **Vehicle Type** | The ride-sharing vehicle category: bike_basic (≤100cc, 1 seat), bike_standard (>100-150cc, 1 seat), bike_plus (>150cc, 1 seat), cng (no AC, 3 seats), car_economy (AC optional, Non-AC discouraged, 4 seats), car_comfort (AC optional, Non-AC discouraged, 4 seats), car_premium (AC mandatory, 4 seats), car_xl (AC mandatory, 7 seats). Used for dispatch filtering, pricing, fare calculation, and rider selection. | DB: `drivers.vehicle_type`, `vehicles.vehicle_type`, `pricing.vehicle_type`; enum: `vehicle_type` |
| **Vehicle Fitness** | The BRTA-issued fitness certificate that confirms a vehicle is road-worthy. Has an expiry date stored in `vehicles.fitness_expires_at`. | DB: `vehicles.fitness_expires_at`; document type: `fitness_scan` |
| **Tax Token** | The BRTA-issued tax token confirming road tax is paid. Has an expiry date stored in `vehicles.tax_token_expires_at`. | DB: `vehicles.tax_token_expires_at`; document type: `tax_token_scan` |
| **Driver Minimum Rate** | The driver's personal floor per-km rate (`min_per_km_bdt`). When set, the driver won't receive ride offers where the system per-km rate is below this minimum. Configurable range (default: 70%–150% of the system rate for the driver's vehicle type). Stored in `drivers.min_per_km_bdt`. | DB: `drivers.min_per_km_bdt`; dispatch query filter; UI: driver settings slider |
| **Vehicle Downgrade** | Admin action that reduces a driver's claimed vehicle type to a more appropriate category (e.g., Car Comfort → Car Economy if no AC is visible). Requires a mandatory reason shown to the driver. | Admin panel: vehicle type downgrade action; DB: `vehicles.vehicle_type` updated by admin |
| **BRTA Certificate** | The mandatory Bangladesh Road Transport Authority vehicle enlistment certificate. Required for all vehicle types. Uploaded during onboarding as `doc_type='brta_certificate'`. | DB: `documents.doc_type = 'brta_certificate'`; onboarding flow |
| **Fallback Alternative** | When no driver of the requested vehicle type is available, the system suggests alternative types with available drivers. Shown to the rider via the Alternatives Sheet. Requires explicit rider consent. | UI: Alternatives Sheet; dispatch: fallback type matching |

---

## Abbreviations

| Abbreviation | Full form | Notes |
|-------------|-----------|-------|
| BDT | Bangladeshi Taka | Currency. All prices stored in paisa (BDT × 100). Display with ৳ symbol. |
| E.164 | International phone number format | +countrycode + number, no spaces. Example: `+8801712345678`. Used for all phone storage. |
| HMAC | Hash-based Message Authentication Code | **Deprecated.** Previously used in Firebase Cloud Function phone auth. Replaced by Supabase Auth built-in phone OTP in ADR-017. No longer used in Ride. |
| RTDB | Firebase Realtime Database | **Deprecated.** Previously used for `verification_requests` during phone auth. Removed in Supabase migration (ADR-017). No longer used in Ride. |
| FCM | Firebase Cloud Messaging | **Deprecated as primary.** Expo Push Notifications is now the primary push mechanism. FCM may be used as a fallback for Android background delivery if needed post-MVP. |
| CF | Cloud Function | **Deprecated.** Previously referred to Firebase Cloud Functions. No longer used after Supabase migration (ADR-017). |
| H3 | Hexagonal hierarchical geospatial indexing system | Uber's open-source library. Resolution 9 used for driver dispatch; resolution 7 for heatmap. |
| KYC | Know Your Customer | Refers to the driver document review and approval process (license, vehicle registration). |
| SLA | Service Level Agreement | Admin document review SLA: configurable (default: 24 hours). Monitored via admin queue dashboard. |
| EAS | Expo Application Services | Used for Android builds and OTA updates. |
| Supabase | Open-source Firebase alternative | Provides PostgreSQL database, Auth (phone OTP, email, social), Storage, and Realtime. Used as the canonical backend for Ride. Project region: ap-southeast-1 (Singapore). |
| dprelay | SMS OTP relay provider | Configured as Supabase's external SMS gateway. Sends verification messages for phone authentication in Bangladesh. |

---

## New System Terms (Features 1–7)

| Term | Definition | Used in |
|------|------------|---------|
| **SOS Contact** | A user-configurable personal emergency contact (phone number in E.164 format) stored in `users.sos_contact`. When an SOS alert is triggered, an SMS is sent to this number in addition to the police and platform numbers. NULL if not configured. | DB: `users.sos_contact`; UI: profile settings |
| **SOS Police Number** | The national emergency number (default: 999) stored in `system_config.sos_police_number`. Admin-configurable. Read at runtime — never hardcoded. | DB: `system_config.sos_police_number`; API: `POST /api/sos/alert` |
| **SOS Ride Number** | The Ride platform's dedicated SOS monitoring number, stored in `system_config.sos_ride_number`. Admin-configurable. All SOS alerts are also forwarded here. | DB: `system_config.sos_ride_number`; API: `POST /api/sos/alert` |
| **Driver Wallet** | A ledger of platform receivables owed to a driver (promo subsidies, referral rewards) minus payouts and adjustments. Balance is computed from `driver_wallet_transactions`. Distinct from the Call Wallet (which tracks call credits). | DB: `driver_wallet_transactions`, `drivers.driver_wallet_balance_bdt`; API: `GET /api/driver/wallet` |
| **Rider Wallet** | A ledger of platform credits available to a rider (referral rewards, promo credits). Balance computed from `rider_wallet_transactions`. MVP: informational only. | DB: `rider_wallet_transactions`, `users.rider_wallet_balance_bdt`; API: `GET /api/rider/wallet` |
| **Platform Receivable** | An amount the platform owes to a driver as a result of subsidising a rider's promo discount or referral reward. Recorded in `driver_wallet_transactions` with `transaction_type='promo_receivable'` or `'referral_receivable'`. | DB: `driver_wallet_transactions`; UI: Driver Wallet screen |
| **Referral Code** | A unique, auto-generated code (e.g., `RIDE-A3F9B2`) assigned to each user. When a new user signs up using this code, both the referrer and referee receive rewards per the active referral campaign rules. | DB: `referral_codes.code`; UI: profile screen |
| **Referral Campaign** | An admin-defined set of rules governing referral rewards: `referrer_reward_percent`, `referee_reward_percent`, `max_uses_per_referrer`, `max_uses_per_campaign`. One campaign can be active at a time. | DB: `referral_campaigns`; API: admin CRUD |
| **Usage Interval** | A promo code attribute (`promo_codes.usage_interval`) that restricts eligibility to every Nth completed ride. E.g., `usage_interval=5` means the promo is only valid when the rider has completed 5 rides since their last redemption. NULL = no interval restriction. | DB: `promo_codes.usage_interval`; API: `POST /api/promo/redeem` |
| **Points** | A loyalty currency earned by riders (1 point per BDT of `rider_payable_bdt`) and drivers (1 point per BDT of `platform_commission_bdt`). Points are stored as integers in the `points` table and redeemed via `point_offers`. | DB: `points`, `point_transactions`; API: `GET /api/user/points` |
| **Point Offer** | An admin-defined redeemable reward available in exchange for a set number of points (e.g., 500 points for a free micro-trial package). Defined in the `point_offers` table. | DB: `point_offers`; API: `GET /api/points/offers`, `POST /api/points/redeem` |
| **Wallet** (disambiguation) | In Ride, **"Wallet"** has three distinct meanings depending on context: (1) **Call Wallet** = driver call balance (legacy term); (2) **Driver Wallet** = platform receivables ledger; (3) **Rider Wallet** = rider credit ledger. Always qualify with "Call", "Driver", or "Rider" to avoid ambiguity. | All wallet-related screens and APIs |

## Onboarding Terms (Phase 3 Additions)

| Term | Definition | Used in |
|------|------------|--------|
| **Driver Photo** | A mandatory live selfie or passport-style photo captured during driver onboarding (document_type `driver_photo`). Used for face-match comparison against the driving licence photo. Stored in `documents` with `doc_type='driver_photo'`. | DB: `documents` with `doc_type='driver_photo'`; UI: Screen 4b |
| **Face Match** | An automated comparison of the driver's live photo (`driver_photo`) against their uploaded driving licence photo. Returns a confidence score (0.00–100.00) stored in `documents.face_match_score`. Threshold configured in `system_config.face_match_min_score` (default: 70.00). Vendor is pluggable via `lib/faceMatch.ts`. | DB: `documents.face_match_score`, `documents.face_match_status`; Config: `system_config.face_match_min_score` |
| **Vehicle Models** | A reference table (`vehicle_models`) mapping known Bangladesh vehicle brand/model/year combinations to Ride vehicle categories. Admin-maintainable. Used during onboarding to auto-suggest vehicle type, AC status, and seat count. | DB: `vehicle_models`; API: `GET /api/reference/vehicle-models`, `GET /api/reference/vehicle-suggest`; Admin: CRUD endpoints |
| **Auto-Classification** | The process of determining a vehicle's Ride category from its brand, model, and year by querying the `vehicle_models` table. Implemented in `suggestVehicleType()` in `lib/vehicleTypes.ts`. Falls back to BRTA class letter + engine CC heuristic if no database match. | Lib: `lib/vehicleTypes.ts`; API: `GET /api/reference/vehicle-suggest` |
| **Walkaround Video** | A mandatory 15–30 second video of the vehicle exterior, captured during driver onboarding (document_type `vehicle_video`). Requirements: ≥720p resolution, ≤50MB file size. Stored in `documents` with `doc_type='vehicle_video'`. | DB: `documents` with `doc_type='vehicle_video'`; UI: Screen 4c |
| **Sample Media** | Reference images and video stored in `system_config` showing properly framed vehicle photos and a walkaround video example. Displayed to drivers during onboarding to illustrate expected quality. Keys: `sample_vehicle_photo_front`, `sample_vehicle_photo_left`, `sample_vehicle_photo_right`, `sample_vehicle_photo_rear`, `sample_vehicle_photo_dashboard`, `sample_vehicle_photo_seats`, `sample_vehicle_video`. | DB: `system_config` seed rows; UI: Screen 4c |

---

## GlideX Folder Naming Convention (critical — do not rename)

| Folder path | Contains | Named in GlideX as | Display label in Ride |
|-------------|----------|--------------------|--------------------|
| `app/(main)/(rider)/` | **Driver** screens | "rider" (GlideX called the driver a "rider") | "Driver" |
| `app/(main)/(customer)/` | **Rider** screens | "customer" | "Rider" |

Do NOT rename these folders. The mismatch is a GlideX legacy. All display labels, user-facing text, and documentation use "Driver" and "Rider" correctly.

| Avoid | Use instead | Reason |
|-------|-------------|--------|
| Wallet (for money) | Call Wallet | "Wallet" in this codebase means the call balance, not a money balance. Rider-to-driver payment is cash only in MVP. Using "wallet" for money will confuse AI models reading the code. |
| Trip | Ride | Use "ride" consistently in code, DB (`rides` table), and UI. "Trip" is not used. |
| Customer | Rider | "Customer" is the GlideX folder name (`app/(main)/(customer)/`) kept for routing; all display labels and docs use "Rider". |
| Driver (for the GlideX folder) | — | GlideX confusingly calls the driver route group `(rider)`. Do not rename the folder; only rename display labels. |
| Token (for calls) | Call | Avoid: "Token" when referring to the call balance unit. Use: "Call". Exception: "token" is correct for authentication tokens (Firebase ID token, JWT). |
| Credit (ambiguous) | Pro-rata credit | Always qualify — "credit" alone is ambiguous (could mean money credit or call credit). Use "pro-rata credit" when referring to the platform compensation mechanism. |
