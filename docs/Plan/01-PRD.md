I'll integrate the provided phone authentication system into the **Ride** PRD, replacing the generic OTP verification with this secure, HMAC‑signed flow. The result is an updated product requirements document with the authenticator embedded into passenger and driver sign‑up, along with necessary configuration and acceptance criteria.

---

# Product Requirements: Ride

> A subscription‑based ride lead distribution platform for Bangladesh.
> The app visual identity is based on the GoRide design system (a professional ride-hailing UI kit) and a custom logo.

## Problem statement
Drivers on commission‑based ride‑hailing platforms lose a significant portion of their earnings to per‑ride fees. Platforms like Uber and Pathao take 20–25% per completed ride, squeezing driver income. Riders face opaque fare multipliers. Drivers have no access to ride demand without paying commissions. **Ride** solves this by decoupling revenue from ride completion: drivers pay a predictable upfront subscription for ride leads (calls), keeping the fare minus any applicable platform commission (currently 0% by default). This model requires a fundamentally different system that delivers high‑quality ride opportunities reliably and fairly, without being a marketplace.

## Users
| User type | Description | Primary goal |
|-----------|-------------|--------------|
| Driver | Bike (Basic/Standard/Plus), CNG, or car (Economy/Comfort/Premium/XL) driver seeking paid ride opportunities | Buy call packages and convert leads into rides profitably — keeping the fare minus any applicable platform commission (currently 0%) |
| Rider | Passenger in Bangladesh needing point‑to‑point transport | Request rides at transparent, pre‑disclosed fares and get matched quickly |
| Admin | Platform operator managing drivers, packages, pricing, and disputes | Activate drivers, control system configuration, monitor health, and resolve issues |

## Functional requirements

### Must‑have (MVP)

#### Phone Authentication (shared service)
1. **Supabase Auth + dprelay SMS Gateway**: Both the Driver and Rider apps use Supabase Auth phone OTP for verification. dprelay is configured as the external SMS provider in the Supabase dashboard (Authentication → Phone → Custom SMS Provider). No custom Cloud Functions or RTDB polling required.
2. **Start Verification**: The app collects the phone number (normalised to E.164) and calls `supabase.auth.signInWithOtp({ phone })`. Supabase sends the OTP SMS via dprelay. Rate limiting is enforced by Supabase's built-in rate limiting. The app may also call `POST /api/auth/start-verification` as a server-side proxy to `signInWithOtp` for additional rate control.
3. **SMS Auto-Read**: The app uses Android SMS Retriever API to auto-detect and auto-fill the OTP from the incoming SMS. If auto-read fails or doesn't trigger within 20 seconds, manual OTP entry is shown. The app does NOT write to any external database — Supabase handles OTP verification internally.
4. **OTP Verification**: The app calls `supabase.auth.verifyOtp({ phone, token, type: 'sms' })`. Supabase returns a JWT session on success. The app then calls `POST /api/auth/verify-token` with the Supabase JWT to check if a user record exists. If exists → navigate to home. If not → navigate to register screen. No polling, no RTDB, no `challenge_jwt`.
5. **Rate Limiting & Security**: Supabase enforces built-in rate limiting on OTP sends and verification attempts. The Expo API proxy (`POST /api/auth/start-verification`) enforces additional per-phone rate limits at the API layer before proxying to Supabase. OTP expiry is handled by Supabase (default 60 seconds configurable in dashboard). Replay protection is handled internally by Supabase.

#### Vehicle Type Criteria

> Single source of truth for admin document review and driver onboarding. Vehicle type enum values are lowercase snake_case throughout the system.

| Vehicle Type | CC Range | AC | Seats | Min Age (BRTA) | Max Age (soft) | Typical Models (BD) | Driver Licence | Registration / Permit | Additional Verification | Driver Quality Gate |
|---|---|---|---|---|---|---|---|---|---|---|
| bike_basic | ≤ 100 cc | n/a | 1 | ≥ 1 year | No limit | Hero Splendor, Bajaj Platina, Runner Cheeta | Motorcycle | Bike reg + BRTA enlistment certificate | Helmet photos (driver + spare) | None |
| bike_standard | >100–150 cc | n/a | 1 | ≥ 1 year | No limit | Honda CB Shine SP, Bajaj Discover, Hero Glamour | Motorcycle | Bike reg + BRTA enlistment certificate | Helmet photos | None |
| bike_plus | >150 cc | n/a | 1 | ≥ 1 year | No limit | Yamaha FZ‑S, Suzuki Gixxer, Bajaj Pulsar, Honda Hornet | Motorcycle | Bike reg + BRTA enlistment certificate | Helmet photos | None |
| cng | n/a | No | 3 | ≥ 1 year | No limit | Standard CNG auto‑rickshaw | Light transport / CNG driver permit | CNG permit (green plate) + BRTA cert | Road‑legal check | None |
| car_economy | n/a | AC optional (Non\-AC discouraged) | 4 | ≥ 1 year | 15 years | Suzuki Alto, Toyota Vitz (older), Daihatsu Mira, Mitsubishi eK, Maruti Alto, Tata Indica \— kei car / very compact category | Private car licence | Car reg + BRTA enlistment certificate | Dashboard photo (AC verification); interior seats photo; 6 vehicle photos + walkaround video | None |
| car_comfort | n/a | AC optional (Non\-AC discouraged) | 4 | ≥ 1 year | 12 years | Toyota Axio, Honda City, Toyota Vitz (AC), Hyundai Accent | Private car licence | Car reg + BRTA enlistment certificate | Dashboard photo (AC verification); interior seats photo; 6 vehicle photos + walkaround video | None |
| car_premium | n/a | **AC required** | 4 | ≥ 1 year | 8 years | Toyota Camry, Honda Accord, newer Corolla, Hyundai Sonata | Private car licence | Car reg + BRTA enlistment certificate | Premium interior photo; dashboard photo (AC required); interior seats photo; 6 vehicle photos + walkaround video | Enforced after driver reaches 50 rides |
| car_xl | n/a | **AC required** | 6–7 | ≥ 1 year | 12 years | Toyota Noah, X‑Trail, Honda CR‑V, Mitsubishi Pajero | Private car (or light transport) | Car reg + BRTA enlistment certificate | Third‑row seat photo; dashboard photo (AC required); interior seats photo; 6 vehicle photos + walkaround video | Enforced after driver reaches 25 rides |

**Additional rules:**
- The 1‑year minimum age is a hard BRTA requirement — admin rejects younger vehicles with reason: “Vehicle must be at least 1 year old (BRTA requirement).”
- Max age is soft; admin may approve well‑maintained older vehicles with an explicit override note.
- Premium tier ride/rating gates apply only after the driver has completed the specified number of rides; new drivers are not blocked initially.
- BRTA vehicle enlistment certificate is mandatory for all vehicle types; driver uploads it with licence and registration.

**AC selection rules per car category:**

| Category | AC selection | Driver-facing behaviour |
|----------|-------------|------------------------|
| Car Economy | AC or Non-AC selectable | If Non-AC selected: red warning text — "Vehicles without AC receive fewer ride requests. Consider upgrading your vehicle to increase earnings." Driver can still proceed. |
| Car Comfort | AC or Non-AC selectable | Same red warning on Non-AC selection. |
| Car Premium | **AC required** | No Non-AC option. If dashboard photo shows no AC, auto-disqualify with red text: "Car Premium requires air conditioning. Your vehicle cannot be listed in this category." |
| Car XL | **AC required** | Same as Car Premium — AC is mandatory. |

If a driver selects a category where AC is optional but they choose Non-AC, the admin dashboard must show a prominent "Non-AC" flag on the approval card.

**Vehicle category auto-classification:**
- The system uses a `vehicle_models` reference table (admin-maintainable, seeded with top 50+ Bangladesh vehicles) to auto-suggest the vehicle category based on Brand + Model + Year combination.
- If the combination is found with high confidence, the system auto-assigns the category and pre-fills AC status and seat count.
- If not found, falls back to BRTA Vehicle Class Letter + CC range logic.
- Admin sees both the auto-suggested type and the driver's self-selected type, and makes the final call.

---

#### Driver Onboarding & Activation
6. **Three-Step Driver Onboarding & Document Upload**:
    - **Step 1 — Vehicle Registration**: Driver registers a vehicle: enters brand, model, and manufacturing year (system auto-suggests vehicle type from `vehicle_models` reference table; driver confirms or overrides). Selects AC status for car types (AC optional for Car Economy and Car Comfort with red warning if Non-AC selected; AC mandatory for Car Premium and Car XL). Composes registration number (BRTA registration area + vehicle class letter + numeric portion). Uploads BRTA enlistment certificate (mandatory for all vehicles), registration scan (front + back), fitness scan, tax token scan. Takes **6 vehicle photos** (front, left side, right side, rear, dashboard showing AC controls, interior front seats) — sample reference images shown from `system_config` URLs during capture. Takes **1 walkaround video** (15-30 seconds, all four sides + dashboard, sample video shown from `system_config`). Bike types must also upload helmet photos. Car XL must additionally upload a third-row seat photo. Enters vehicle registration date (for BRTA 1-year age compliance check), fitness and tax token expiry dates. All sample media URLs read from `system_config` — never hardcoded.
    - **Note**: BRTA enlistment certificate is mandatory for all vehicle types.
    - **Step 2 — Driver Registration**: Driver enters name, address, mobile number (pre-filled from auth), driving license number, and uploads driving license scan (front + back). Driver takes a **live selfie or uploads a passport-style photo** (`doc_type='driver_photo'`) — mandatory. The system performs a **face-match comparison** between the driver photo and the licence photo using a face-match API (interface defined in `lib/faceMatch.ts`; vendor TBD). A confidence score is stored in `documents.face_match_score`. Low-confidence matches (`face_match_status='low_confidence'`) are flagged in the admin dashboard for manual review. The driver photo appears on the admin approval card alongside the licence photo for visual comparison. Mobile phone authentication already completed during registration via Supabase phone OTP flow.
    - **Step 3 — Owner Consent**: Two paths based on vehicle ownership:
      - **Driver IS the vehicle owner**: Toggle confirmed. Optional "Legacy Operator?" tick mark (if checked, uploads Uber/Pathao registration screenshot). Submit → Admin approval → `drivers.status = 'active'`.
      - **Driver is NOT the vehicle owner**: Enter owner name, address, mobile number. Optional legacy operator tick mark. Upload owner consent scan copy (must be dated within 30 days — this validity window is a business rule stored as a configurable constant). Submit → Admin approval.
        - With consent scan copy → `drivers.status = 'temporary'` for 30 days (this consent validity period is a configurable business rule). Must re-submit consent after 30 days for full `active` status.
        - Without consent scan copy → `drivers.status = 'pending'` (registered but not activated).
7. **Manual Admin Approval**: Admin dashboard allows viewing pending driver submissions (all 3 steps), verifying documents (license, registration, fitness, tax token, vehicle photos, owner consent), and approving/rejecting. No automated KYC. Admin sets driver status based on consent path: `active` (self-owned), `temporary` (non-owner with consent), or `pending` (no consent yet).
8. **Legacy Operator Affiliation**: Driver claiming prior Uber/Pathao affiliation checks the "Legacy Operator?" tick mark in Step 3 and uploads a screenshot of their existing platform profile. The system validates the screenshot (file size > 50KB, resolution ≥ 720p, must contain the driver's registered phone number). Legacy operators who are also vehicle owners receive **fast-track approval** — admin review SLA reduced to **12 hours** (this is an operational SLA target, not a system-enforced value). Full documents must still be verified within **7 days** (this verification deadline is a configurable business rule); warnings sent on day 5 and 6. If documents not verified by day 7, account enters a **48‑hour grace period** with call volume capped at 50% of package (these grace period thresholds are configurable business rules); after that, full suspension.
9. **Admin Review SLA**: Full document review must be completed within **24 hours** (this is an operational SLA target, not a system-enforced deadline); auto‑escalation to senior admin if pending longer.

#### Subscription & Package System
10. **Admin Package Creation**: Admin defines packages with calls (positive integer or -1 for unlimited), duration (days), price (BDT). Additional **micro‑trial package** (e.g., 5 calls / 1 day) must be offered to new drivers.
11. **Unlimited Package Fair Usage Cap**: For unlimited packages, a hidden daily limit (stored in `packages.daily_cap`, default 200 for unlimited packages) is enforced; exceeding this suspends call delivery for the remainder of the day. Admin configures this per package.
12. **Driver Package Purchase with Idempotent Payment**: Driver selects package, pays via PortPos unified payment gateway (supporting bKash, Nagad, Rocket, and cards). Every purchase attempt carries a unique idempotency key; payment callback processing uses idempotency to prevent double charges. If no callback received within **5 minutes** (this callback timeout is a configurable constant), system auto-queries the provider's verification API; if paid, package is activated; else transaction marked failed.
13. **Partial Payment Failure Handling**: If payment succeeds but package activation fails (DB error), a compensating retry queue ensures activation or manual admin alert, avoiding “paid but not activated” state.
14. **Driver Call Wallet & Utilization Guarantee**: Driver sees active balance, expiry, and transaction ledger. If a driver uses <50% of purchased calls by expiry **due to platform‑side demand shortage** (not driver offline/unavailable time — this 50% utilization threshold is a configurable business rule), they receive a pro‑rata credit toward the next package automatically. **For unlimited packages** (`call_count = -1`), pro-rata credit is calculated based on lifetime deductions: if the driver was online for > 60% of the subscription duration AND the platform delivered fewer than 50% of the maximum possible daily cap calls (these percentage thresholds are configurable business rules) (i.e., `subscriptions.total_deductions < 0.5 * daily_cap * duration_days`), the driver receives a credit of `floor((daily_cap * duration_days - total_deductions) * 0.5)` calls (rounded down to nearest integer). `total_deductions` is a never-reset counter incremented in every deduction transaction. This credit is applied to the next subscription as a call add-on.

#### SOS Alert (Rider & Driver)
- **SOS Button (Both Roles)**: Both riders and drivers have an SOS button on their home screens. Each user can pre-configure a personal SOS contact (phone number, E.164 format) in their profile.
- **SOS Modal**: Tapping the SOS button opens a modal containing:
  - A **"Call Police"** button that opens the native dialer with the national emergency number (admin-configurable in `system_config.sos_police_number`; default: 999).
  - A **text area** for composing a custom SMS message.
  - A **"Send SOS"** button.
- **Triple SMS Dispatch**: When the user taps "Send SOS" (or places the police call), three SMS messages are sent simultaneously to: (1) the **Police Control Room** (`system_config.sos_police_number`), (2) the user's **personal SOS contact** (`users.sos_contact`), and (3) the **Ride platform SOS number** (`system_config.sos_ride_number`). Each SMS includes the user's name, role (driver/rider), current GPS coordinates, and a timestamp.
- **Call Police flow**: If the user taps "Call Police", the native dialer opens with the police number, and the three SMSes are still sent in the background.
- **Audit log**: Every SOS trigger is recorded in `sos_alerts` (columns: `user_id`, `role`, `message`, `contacts_notified`, `latitude`, `longitude`, `created_at`).
- **Zero-hardcoding**: All phone numbers stored in `system_config` (`sos_police_number`, `sos_ride_number`). Personal SOS contact stored in `users.sos_contact` (nullable, E.164).

#### Rider Features
15. **Rider Registration**: Sign‑up with phone number verified via Authenticator Service (AC‑AUTH). Minimal profile.
16. **Ride Request with Upfront Fare Breakdown**: Rider sets pickup (GPS/map pin), drop-off (address search via Google Places Autocomplete), and selects vehicle type from 8 categories: Bike Basic, Bike Standard, Bike Plus, CNG, Car Economy, Car Comfort, Car Premium, Car XL. System shows **full fare breakdown** (base, inside/outside distance, estimated waiting charge) before rider confirms.
17. **Intercity Geo-Fencing Pricing**: On every ride request and estimate, the server checks the pickup coordinate against active `city_boundaries`. If pickup is inside a city, that city becomes `origin_city`; otherwise `origin_city = null` and no intercity surcharge applies. If pickup is inside a city and dropoff is outside the same city polygon, `is_intercity = true`. Intercity rides call the Barikoi Route API with `geometries=polyline`, split the route with Turf.js against the origin city polygon, and calculate `inside_km` and `outside_km` rounded to 3 decimals. If Barikoi is unavailable, the system falls back to Haversine distance with a 1.3 urban factor for the inside segment and 1.0 for the outside segment. City polygons and intercity per-km rates are stored in DB and admin-configurable; no city, rate, or threshold is hardcoded.
17. **Scheduled Ride**: Rider selects a pickup time from preset options: Now, +15 min, +30 min, +45 min, +60 min. The app computes `scheduled_at = now() + offset` and sends it to the existing `POST /api/ride/request`. Driver call is deducted only when the system broadcasts the request within the scheduled pickup window (not at booking time).
18. **Mutual Ratings**: Rider rate driver 1‑5 after ride; driver also rates rider. Rider rating used for rider quality scoring and abuse detection.
49. **Promo Codes (Enhanced)**: Rider can apply a promo code during booking for a fare discount. The driver's fare is unchanged; the platform absorbs the discount. Features include:
  - **Discount types**: Percentage and flat, with configurable max uses, expiry dates, and per-rider usage limits.
  - **Interval eligibility**: Admin can set a promo to be valid only on every Nth completed ride (e.g., every 5th ride). `promo_codes.usage_interval` (integer, NULL = no interval) tracks this. The system counts the rider's completed rides since their last promo redemption; eligibility is granted when count reaches the interval.
  - **Driver wallet receivable**: After a subsidised ride completes, a `driver_wallet_transactions` row is created showing the platform's receivable amount to the driver. This helps drivers track platform-owed subsidies.
  - **Rider promo list**: Riders can view all currently active promo codes and their conditions (interval, discount type, expiry) on a dedicated screen (`GET /api/promo/available`).
  - **Driver offer card**: The driver's ride offer card does NOT show promo/discount information. The driver only sees the undiscounted `driver_fare_bdt`. Discount details appear only on the final invoice after ride completion.
  - The fare breakdown separates `driver_fare_bdt`, `rider_payable_bdt`, and `platform_subsidy_bdt` to maintain transparency.
  - Admin creates and manages promo codes via the admin panel.
50. **Driver Incentives**: Drivers earn bonus call credits for meeting activity targets (completed rides, online time, acceptance rate). Admin defines incentive campaigns with measurable criteria. When a driver completes an incentive, the system awards bonus calls via the existing `credit_vouchers` table. Drivers view active incentives and progress on an incentive dashboard.
51. **Rider Preferences**: Riders can select practical add‑ons during booking (large luggage, quiet ride, female‑friendly driver, AC required). Some preferences affect pricing (surcharge) and driver matching (filter). Admin manages the preference catalogue. Drivers opt‑in to preferences they can accommodate during onboarding or in settings.
    - **Limitation (female‑friendly):** The `female_friendly` preference with `affects_matching=true` requires the system to know the driver's gender. This is not currently stored or verified in the onboarding flow. For MVP, `female_friendly` should be created with `affects_matching=false` (informational only — displayed to rider but not used as a dispatch filter). Post-MVP: add optional gender field to driver profile with admin verification during document review, then set `affects_matching=true`.
52. **Polished Offer Sheet**: Driver offer sheet shows pickup distance, ETA, rider rating, fare breakdown, and scheduled badge. Sound and vibration alert on offer arrival (gated by driver settings toggle).
53. **Referral Codes**: A referral system allowing users to earn rewards for bringing new riders/drivers to the platform.
  - Admin creates referral campaigns with: `referrer_reward_percent` (discount % on referrer's next ride), `referee_reward_percent` (discount % on referee's first ride), `max_uses_per_referrer`, `max_uses_per_campaign`.
  - Each user receives a unique referral code (auto-generated, e.g. `RIDE-A3F9B2`), visible in their profile.
  - When a new user signs up with a referral code, a `referrals` record is created linking referrer and referee.
  - On the referee's first completed ride, the referral discount is applied automatically. The referrer receives a reward (wallet credit for riders, or receivable entry for drivers).
  - Admin manages referral campaigns via the admin panel (CRUD).
54. **Wallet System (Driver & Rider)**:
  - **Driver Wallet**: Tracks platform receivables (promo subsidies, referral rewards) minus any payouts. Drivers view transaction history via `GET /api/driver/wallet`. Balances are computed from `driver_wallet_transactions`.
  - **Rider Wallet**: Tracks referral rewards and platform credits. Riders view balance and history via `GET /api/rider/wallet`. MVP: informational only (future: PortPos top-up integration). Riders can apply wallet balance as a ride discount at booking.
  - All wallet values stored as integer paisa.
55. **Points System (Driver & Rider)**:
  - **Earning**: Riders earn 1 point per BDT spent on the final invoice (after discounts). Drivers earn 1 point per BDT of commission paid to Ride (not package payments).
  - **Redemption**: Admin creates redeemable point offers (e.g., "500 points → free micro-trial package", "1000 points → BDT 50 wallet credit"). Users browse offers and redeem from their profile.
  - Point balances stored in a `points` table. All transactions logged in `point_transactions`.
  - Admin manages point offers via the admin panel (CRUD).

#### Matching & Call Deduction
19. **Geospatial Indexing with H3**: The system uses Uber’s H3 hexagonal grid for spatial indexing. When an exact cell lacks enough drivers, it expands to adjacent cells in ring steps before falling back to larger area.
20. **Supply‑Demand Heatmap Cache**: Driver density per H3 cell cached every 30 seconds (H3 refresh interval is a configurable dispatch constant) to reduce real‑time recomputation.
21. **Weighted Driver Selection**: Top‑N drivers selected by weighted score. Default weights: distance (40%), rating (30%), acceptance rate (20%), availability bonus (10%). Weights are configurable constants in `utils-server/dispatch.ts`.
22. **Call Deduction on App‑Level Interaction**: A call is deducted only when the driver’s app **actively acknowledges** the request via a WebSocket `fetch:confirm` message when the driver begins interacting with the offer sheet. Passive delivery alone does **not** trigger deduction.
23. **Call Deduction Window & Auto‑Refund**: When a ride offer is sent via WebSocket, a 5-second deduction window opens (stored as `CALL_DEDUCTION_WINDOW_MS`, a configurable dispatch constant). If the driver’s app does not send a `fetch:confirm` within this window, the system automatically aborts the deduction (or refunds it if pre-authorized).
24. **WebSocket-First Dispatch & FCM Fallback**: Active dispatch routing is handled via a dedicated Node.js WebSocket server (`utils-server`). FCM push notifications are used as a fallback to wake up the app if the WebSocket connection is dormant.
25. **Controlled Broadcast & Deduplication**: Requests are sent in batches of N drivers (`BATCH_SIZE` is a configurable dispatch constant, default 5). Per driver, a call is deducted at most once for a given ride, managed by a strict database-level unique constraint on the call ledger. Once a driver accepts, all other offers are cancelled immediately.
26. **Driver Response UX**: 15‑second countdown timer on request card (offer timeout is a configurable dispatch constant); swipe-to-accept or reject actions. No response = ignore.
27. **Retry Logic**: Maximum 3 dispatch batches (batch count is a configurable dispatch constant). If no driver accepts after all batches are exhausted, the request expires.

#### Trip Lifecycle & Communication
28. **Match Information**: After match, rider sees driver name, photo, vehicle number, rating, ETA. Driver sees pickup and rider info.
29. **In‑App Chat & Native Dialer**: Text chat and button to open native dialer; no VoIP.
30. **Trip States**: Five-step lifecycle: `matched` → `driver_arriving` (set automatically on match) → `driver_arrived` (driver taps "I've Arrived" at pickup) → `in_progress` (driver taps "Start Ride" **OR auto-starts after 60-second free wait timer expires**) → `completed` (driver taps "Complete Ride"). When `driver_arrived` is set, the server starts a 60-second timer (`system_config.max_free_wait_seconds`). If the driver hasn't tapped "Start Ride" within 60 seconds, the scheduler auto-transitions the ride to `in_progress` with `started_at = arrived_at + 60s`. Manual "I've Arrived" button is MVP; auto-geofence detection is post-MVP. The rider is shown the actual fare on a final fare summary screen before paying cash. Rider sees driver GPS from start to completion.

#### Cancel & Dispute Handling
31. **Rider Cancellation**: Rider cancels before any accept: no rider penalty, driver calls already deducted are not refunded. Cancellation after acceptance: rider must select a reason. Repeated post‑accept cancellations trigger a 1‑hour cooldown (this cooldown duration is a configurable business rule).
32. **Driver Cancellation**: Driver cancels after accept: negatively impacts acceptance rate, and if >3 such cancellations in a day (this threshold is a configurable business rule), account flagged for admin review.
33. **Dispute Interface**: Driver sees “Missed Requests” log with timestamps; admin can view raw delivery and heartbeat logs.

#### Anti‑Fraud & Abuse
34. **Rider Spam Detection**: Rider requests rate limited to 5/hour (this rate limit is a configurable architectural constant). Device fingerprint and IP throttling. Behavioral detection flags riders whose requests never complete a ride; suspended accounts pending admin review.
35. **Collusion Detection**: Repeated identical pickup‑drop pairs and overlapping device pairings generate admin alerts.
36. **Account Sharing Prevention**: For unlimited package holders, **device binding** enforced; changing device requires OTP re‑verification and 24‑hour cooldown (this cooldown period is a configurable business rule). Biometric check (fingerprint/Face ID) recommended.
37. **Driver Earnings Monitoring**: Admin dashboard highlights drivers with negative net earnings, enabling proactive support.

#### Infrastructure Resilience
38. **Offline Driver Request Queue**: If driver device loses data connectivity, app caches incoming requests locally for the timeout window. On reconnect, pending requests are presented.
39. **Low‑Bandwidth Mode**: Request payload stripped to essential text when network is classified as 2G/EDGE; maps loaded on‑demand.
40. **Battery Optimization**: Expo Push high‑priority messages with wake locks, and foreground service for driver app.

#### Admin & Operations
41. **Comprehensive Admin Dashboard**: A centralized web portal where the admin exercises total control over the platform. Features include:
    - **Driver Management**: Approve/Reject registrations (Stage 1 & 2), suspend accounts, and view detailed driver logs.
    - **Package Management**: Create/edit call packages, set pricing, and manage the micro-trial packages.
    - **Pricing & Zone Configuration**: Dynamically change the normal rate per km, intercity per-km rate, rate per minute waiting, and base fare. Set `platform_commission_percent` per vehicle type per zone (default 0.00%). Add new vehicle types. Define and update the Bangladesh operational zone polygon and manage city-boundary polygons for intercity pricing.
    - **Dispute & Monitoring**: View the approval queue SLA, monitor drivers with negative earnings, and view raw delivery/heartbeat logs for dispute resolution.

#### Data & Compliance
42. **Data Localization**: All driver PII, documents, trip logs stored on servers physically located in Bangladesh.
43. **Document Retention**: Uploaded document images purged 90 days after account closure (this retention period is a configurable compliance constant); verification metadata retained indefinitely.
44. **Chat Log Retention**: In‑app chat logs retained 30 days rolling (this retention period is a configurable compliance constant), with admin export for dispute resolution.
45. **Driver‑Set Minimum Per-Km Rate**: Each driver may set a personal `min_per_km_bdt` floor rate via a slider in the driver app. The allowed range is dynamically computed as `system_per_km_bdt × driver_min_ratio` to `system_per_km_bdt × driver_max_ratio`, where both ratios are stored in `platform_config` (defaults: 0.70 and 1.50). The slider defaults to the system rate (100%). The driver will not be offered rides where the system rate is below their minimum. The driver may change the minimum at any time with no cooldown. The driver sees a stat showing estimated rides missed due to their minimum setting.
46. **Fallback When No Driver of Requested Type Available**: When dispatch exhausts all batches without finding a driver for the requested vehicle type, the system checks availability of other vehicle types in the pickup area. If alternatives exist, the rider receives a `no_drivers` status with an `alternatives` array listing available vehicle types, their fare estimates, and driver counts. The rider can select an alternative and re-request. If no alternatives exist either, the ride expires normally. Auto-downgrade requires explicit rider consent via an `allow_downgrade` flag (default false).
47. **Vehicle Age Compliance (BRTA)**: All vehicles must be at least 1 year old from first registration date (BRTA requirement). Admin must reject vehicles younger than 1 year. Maximum vehicle age is a soft limit (admin may override for well-maintained vehicles). Vehicle type age limits (defined in `lib/vehicleTypes.ts`, configurable as code constants): Bike types — no max; CNG — no max; Car Economy — 15 years; Car Comfort — 12 years; Car Premium — 8 years; Car XL — 12 years.
48. **Vehicle Type Categorization and Admin Downgrade**: Driver self-selects a vehicle type during onboarding. Admin reviews uploaded documents and either approves the claimed type or downgrades to a more appropriate type with a mandatory reason. Driver-initiated type changes require admin review with a 7-day cooling-off period after approval (this cooling-off duration is a configurable business rule).

#### Pricing & Fare Structure

**Production fare matrix (all money values in integer paisa; BDT shown in parentheses for readability):**

| Vehicle Type | base_fare_bdt | per_km_bdt | intercity_per_km_bdt | per_min_bdt | floor_length_km | floor_min | floor_fare (BDT) |
|---|---|---|---|---|---|---|---|
| bike_basic | 2500 (25) | 775 (7.75) | 1160 (11.60) | 175 (1.75) | 2.0 | 10 | 58 |
| bike_standard | 2500 (25) | 950 (9.50) | 1425 (14.25) | 180 (1.80) | 2.0 | 10 | 62 |
| bike_plus | 2500 (25) | 1050 (10.50) | 1575 (15.75) | 190 (1.90) | 2.0 | 10 | 65 |
| cng | 4000 (40) | 1500 (15.00) | 2250 (22.50) | 200 (2.00) | 3.0 | 15 | 115 |
| car_economy | 4500 (45) | 1500 (15.00) | 2250 (22.50) | 350 (3.50) | 4.0 | 20 | 175 |
| car_comfort | 5000 (50) | 1800 (18.00) | 2700 (27.00) | 375 (3.75) | 4.0 | 20 | 197 |
| car_premium | 6500 (65) | 2100 (21.00) | 3150 (31.50) | 400 (4.00) | 4.0 | 20 | 229 |
| car_xl | 8000 (80) | 2500 (25.00) | 3750 (37.50) | 425 (4.25) | 4.0 | 20 | 265 |

> **Note:** All fare values are defaults stored in the `pricing` table and configurable by admin via `POST /api/admin/pricing`. `intercity_per_km_bdt = 0` means outside-city kilometers use the normal `per_km_bdt` with no surcharge. `floor_fare` column is informational — it is computed at runtime, not stored.

**Fare calculation formula (in `lib/fareCalc.ts`):**
```
// Meter components
// For non-intercity rides: inside_km = distance_km, outside_km = 0.
// For rural-origin rides: origin_city = null, is_intercity = false, outside_km = 0.
// When intercity_per_km_bdt = 0: effective_outside_rate = per_km_bdt (no surcharge).
effective_outside_rate = intercity_per_km_bdt > 0 ? intercity_per_km_bdt : per_km_bdt
inside_charge    = round(per_km_bdt × inside_km)
outside_charge   = round(effective_outside_rate × outside_km)
distance_charge  = inside_charge + outside_charge
time_charge      = ride_time_min × per_min_bdt          // integer — per_min_bdt is integer paisa

// Ride time definition:
//   Free waiting is a platform-wide constant: 60 seconds (max_free_wait_seconds in system_config).
//   After 60s from arrived_at, the ride auto-transitions to in_progress and billing begins.
//   If driver taps Start Ride before 60s: billing starts at started_at.
//   timer_start = min(arrived_at + 60_000, started_at)  ← whichever comes FIRST
//   If arrived_at IS NULL: timer_start = started_at
//   ride_time_min = CEIL((completed_at − timer_start) / 60)
//   At estimation time: ride_time_min = 0

computed_total   = base_fare_bdt + distance_charge + time_charge
floor_fare       = base_fare_bdt + round(per_km_bdt × floor_length_km) + (floor_min × per_min_bdt)
final_fare       = max(computed_total, floor_fare)

preference_surcharge_bdt = SUM(charge_bdt for selected preferences)
driver_fare_bdt  = final_fare + preference_surcharge_bdt
promo_discount_bdt = calculate from promo code (if applied)
rider_payable_bdt = driver_fare_bdt − promo_discount_bdt
platform_subsidy_bdt = promo_discount_bdt  // platform absorbs the discount
platform_fee     = round(driver_fare_bdt × platform_commission_percent / 100)
driver_net       = driver_fare_bdt − platform_fee
```
Rider pays `rider_payable_bdt` to driver in cash. Driver receives `driver_fare_bdt` (unchanged by promo). Platform absorbs `platform_subsidy_bdt`. Driver owes platform `platform_fee` (tracked as liability; no automated collection in MVP). Preference surcharges are added on top of `final_fare` and paid to the driver. Promo discounts are deducted from what the rider pays; the driver's fare is NOT reduced.

**Timer semantics:** Free waiting is a platform-wide constant: **60 seconds** (stored in `system_config.max_free_wait_seconds`). When the driver taps "I've Arrived", a 60-second countdown begins. If the driver taps "Start Ride" before 60 seconds, billing starts at `started_at`. After 60 seconds, the ride **automatically transitions** to `in_progress` (`started_at = arrived_at + 60s`) and per-minute billing begins immediately — even if the driver hasn't tapped Start Ride. The billable timer runs continuously from `timer_start = min(arrived_at + 60s, started_at)` until the ride is completed.

**Fare recalculation at ride completion:** `final_fare` is recomputed in `POST /api/ride/:id/complete` using actual `ride_time_min`. For percentage promo codes, `promo_discount_bdt` is recalculated against the new `driver_fare_bdt` (capped by `max_discount_bdt`); for flat promo codes, the discount remains unchanged from booking time. `rider_payable_bdt` and `platform_subsidy_bdt` are always recomputed.

**Preference surcharge and BRTA ceiling:** Preference surcharges are rider-opted extras, not fare components. They are EXEMPT from the BRTA fare ceiling check in `lib/fareCalc.ts`. The ceiling check applies only to `final_fare` (base + distance + time). If `final_fare` exceeds the ceiling, it is logged as a warning; the ride is never blocked (TD-25).

**Promo cancellation policy:** If a ride with an applied promo is cancelled before dispatch completes (`status IN ('pending','dispatching')`), the `promo_redemptions` row is deleted and the promo usage count is decremented atomically. If cancelled after match, the promo usage stands — the dispatch and driver engagement cost is already incurred.

**Notes (driver-first framing):**
- Pricing is designed so drivers earn more than on commission platforms even when the sticker price is lower. Rider savings are a byproduct of the low-commission model, not the design goal.
- An admin-configurable commission may apply (default 0%). When commission is 0%, drivers keep the entire fare. Commission is always calculated as a percentage of `final_fare` (post-floor), never of the raw computed total.
- Bike time rates are differentiated by tier (1.75 / 1.80 / 1.90 BDT/min), reflecting the higher per-km earning profile. Free waiting is 60 seconds for all vehicle types — after that, billing begins automatically. The short free window ensures drivers are compensated for their time promptly.
- CNG has a 3 km / 15 min floor, aligning with the longer typical CNG boarding time in Dhaka traffic. Zero commission ensures drivers net the full fare.
- `floor_fare` is a computed hard floor: `final_fare = max(computed_total, floor_fare)`. Applied in `lib/fareCalc.ts`. Cannot be overridden per-ride.
- BRTA fare ceiling compliance: `lib/fareCalc.ts` logs a warning if a calculated fare exceeds the BRTA ceiling values stored in `platform_config` (`brta_max_per_km_bdt`, `brta_max_base_bdt`). The ride is NOT blocked; admin must review pricing.
- Post-MVP commission collection: `platform_commission_bdt` will be aggregated per driver and deducted from their call-wallet balance or subtracted at subscription renewal. In MVP, admin can query total outstanding via `SELECT SUM(platform_commission_bdt) FROM rides WHERE driver_id=? AND status='completed'`.

**Operational zone source:** The active `zones.polygon` is the Bangladesh mainland border, not a rectangle and not a city-only launch area. Source: `https://github.com/ifahimreza/bangladesh-geojson` (`src/data/bangladesh.geojson`). Update method: derive the non-shared exterior boundary from the administrative polygons, keep the largest mainland ring, simplify to 80-150 points, convert `[lng, lat]` coordinates into `{lat, lng}` objects, and update the currently active `zones` row. This operational zone controls service availability only; `city_boundaries` controls intercity pricing.

### Should‑have (post‑MVP)
1. Driver earnings dashboard with net income projection and zone/vehicle switching suggestions.
2. Advanced real‑time ETA using traffic data from third‑party APIs.
3. Rider ride history and digital receipts.
4. iOS app support.
5. Automated document OCR for admin verification.
6. Mobile money rider payment integration (pay driver via app).
7. In‑driver‑app package upgrade with pro‑rata calculation.
8. Advanced heatmap‑driven driver demand incentives.

### Explicitly out of scope
1. VoIP calling.
2. Fully automated KYC/driver activation.
3. Rider‑to‑driver payment escrow; initial phase cash only.
4. Marketplace fare negotiation; fares are fixed.
5. Real‑time surge pricing.
6. Multiple operational countries or region-specific app launches. Bangladesh is the single active operational zone for MVP; city boundaries are an internal pricing layer, not separate launch markets.
7. Driver multi‑vehicle support per account (one vehicle type per account initially).

## Non‑functional requirements
| Category    | Requirement                                    | How to verify           |
|-------------|------------------------------------------------|-------------------------|
| Performance | Request broadcast < 2s P95 from rider confirm to first driver notification | Load test |
| Performance | Driver response timer (15s) strictly enforced; expired offer cancelled within 1s | Unit/E2E test |
| Performance | Heartbeat poll latency < 500ms P95 for 5,000 concurrent drivers | Stress test |
| Security    | Driver documents encrypted at rest, API endpoints authenticated & authorized | Security scan |
| Security    | Driver phone visible to rider from `status='matched'` onward. Rider masked phone visible to driver from `status='matched'` onward. Full rider phone is never shared with driver. | Manual test |
| Security    | Supabase Auth: JWT verification on all API routes; OTP replay prevention by Supabase; no secrets in client code | Security review |
| Reliability | 99.5% core API uptime during operational hours | Uptime monitor |
| Reliability | ≤0.1% false call deductions (deductions without actual app‑level delivery) | Log audit |
| Reliability | Supabase Auth: OTP delivery ≤ 10s P95 (via dprelay SMS gateway) | Monitor OTP delivery latency |
| Scalability | Support 5,000 concurrent drivers, 500 ride requests/min in initial zone | Stress test |
| Data Integrity | Immutable call deduction ledger; all events tied to request/driver | DB audit |
| Business     | Driver payback period ≤ 3 days (subscription cost recovered from fares) | Cohort analysis |
| Fraud        | <0.5% of calls deducted from fake/spam requests | Post‑completion analysis |
| Operations   | Admin review queue depth = 0 within 24h of submission | Dashboard alert |
| Compliance   | Data stored within Bangladesh; document retention policies enforced | Infrastructure audit |
| Compliance | BRTA vehicle age: admin rejects vehicles < 1 year old (hard rule). Admin may override max-age soft limit with explicit note. | Admin flow test |
| Compliance | BRTA fare ceiling: `lib/fareCalc.ts` logs warning when fare exceeds `platform_config.brta_max_per_km_bdt` or `brta_max_base_bdt`. Ride is not blocked; admin must review pricing configuration. | Monitoring log check |
| Compliance | Floor fare enforced in `lib/fareCalc.ts`: `floor_fare = base_fare_bdt + round(per_km_bdt × floor_length_km) + (floor_min × per_min_bdt)`; `final_fare = max(computed_total, floor_fare)`. No per-ride override allowed. | Unit test |

## Acceptance criteria
| ID   | Criterion                        | Verified by              |
|------|----------------------------------|--------------------------|
AC\-AUTH\-1 | A Rider or Driver enters phone number, triggers `supabase.auth.signInWithOtp({ phone })` (or `POST /api/auth/start-verification` proxy). Supabase sends OTP via dprelay SMS gateway. | Manual test with valid phone |
AC\-AUTH\-2 | An SMS with OTP is sent to the entered phone via dprelay. The app auto-reads OTP via Android SMS Retriever (or manual entry after 20s). App calls `supabase.auth.verifyOtp({ phone, token, type: 'sms' })` and receives a JWT session. | E2E test |
| AC\-AUTH\-3 | Invalid OTP or expired OTP returns an error from `supabase.auth.verifyOtp`. Rate-limited requests (too many OTP sends) return 429. Both return descriptive error messages. | Unit test |
| AC\-AUTH\-4 | Supabase Auth handles OTP verification internally — no receipt spoofing possible. Invalid OTP returns error. No RTDB or anonymous UID involved. | Supabase Auth security review |
| AC\-AUTH\-5 | After successful verification, the user can proceed to registration/login. | Integration test |
| AC‑1 | Given a ride offer is broadcast and the driver app sends `fetch:confirm` within 5s, exactly one `call_ledger` row with `event_type='deduction'`, `delta=-1` is written for that `(ride_id, driver_id)`. | DB query + unit test |
| AC‑2 | Given a ride offer is broadcast and the driver app does NOT send `fetch:confirm` within 5s, zero `call_ledger` rows are written for that `(ride_id, driver_id)`. | DB query + unit test |
| AC‑3 | Two POSTs to `/api/package/purchase` with the same `Idempotency-Key` header produce exactly one `payment_events` row and at most one `subscriptions` row. Server returns 200 on replay. | Integration test |
| AC‑4 | A driver cannot have two `subscriptions.status='active'` rows simultaneously (DB unique partial index enforced). | Migration verification + concurrent purchase test |
| AC‑5 | If `subscriptions.calls_remaining=0` (or unlimited capped), `is_online` cannot be set true via `POST /api/driver/status`; the driver does not appear in any dispatch batch. | API test + dispatch query |
| AC‑6 | Pickup outside `zones.is_active=true` polygon returns 422 `outside_zone` before any `rides` row is inserted. | API test |
| AC‑6A | Active `zones.polygon` uses the simplified Bangladesh mainland border derived from `ifahimreza/bangladesh-geojson`, contains 80-150 `{lat,lng}` points, and is updated by SQL/migration rather than a hardcoded rectangle. | Migration review + zone test |
| AC‑6B | If pickup is inside an active `city_boundaries` polygon and dropoff is outside that same polygon, `fare_breakdown.origin_city` is set, `is_intercity=true`, and `inside_km`/`outside_km` drive inside/outside distance charges. Rural pickup (`origin_city=null`) never applies an intercity surcharge. | API test + fare unit test |
| AC‑7 | `fetch:confirm` followed by driver ignoring offer for full 15s results in a `call_ledger` refund row (`event_type='refund'`, `delta=+1`) and `dispatch_offers.outcome='refunded'`. | Integration test |
| AC‑8 | Three dispatch batches (5 drivers each) exhausted with no accept → `rides.status='expired'` within 60s of request creation. | Dispatch smoke test |
| AC\-9 | Scheduled ride (`scheduled_at` set) is NOT dispatched immediately; dispatch begins 60–120 seconds before `scheduled_at`. | Scheduler unit test |
| AC‑10 | Subscription expiring with `< 50% calls used` AND `online_minutes > 60% of duration` AND `received_offers_count < 50% of zone-average offers for the subscription period` (platform-side shortage) → INSERT `credit_vouchers` row with pro-rata call credit. Next activation redeems voucher. | Scheduler + activation test |
AC‑11 | Owner consent scan copy submitted and admin-approved → `owner_consents.status='approved'`, `drivers.owner_consent_verified=true`. Scan copy dated within 30 days. Without consent scan → driver remains `pending`. | Owner consent flow test |
AC‑12 | Legacy operator (self-owned vehicle) not submitting full documents within 7 days → `drivers.status='suspended'` after 48h grace period with 50% cap. | Scheduler + time mock test |
AC‑13 | Temporarily activated driver (`status='temporary'`) not re-submitting owner consent scan within 30 days → `drivers.status='suspended'`. Re-submission approved → `drivers.status='active'`. | Scheduler + provisional_expires_at test |
| AC‑14 | Admin document review SLA: documents pending > 24h trigger escalation alert in monitoring dashboard. | Monitoring alert test |
| AC‑15 | Driver sets `min_per_km_bdt` via `PATCH /api/driver/me`. Value outside `driver_min_ratio`–`driver_max_ratio` range of the system rate (from `platform_config`) → rejected with 422. NULL → resets to system rate. `GET /api/driver/slider-config` returns the correct `lower_bound`, `upper_bound`, and `system_per_km_bdt` for the driver's vehicle type. Dispatch excludes drivers whose `min_per_km_bdt` > active pricing row's `per_km_bdt`. | API test + dispatch query |
| AC‑16 | Ride request for `car_premium` with zero available drivers → response includes `status="no_drivers"` + `alternatives` array listing available types with fare breakdowns (using new production fare values). Rider selects alternative → re-request succeeds with new vehicle type. | Integration test |
| AC‑17 | Vehicle registration date < 1 year ago → admin dashboard shows warning. Admin approves → allowed. Admin rejects → driver notified with reason "Vehicle must be at least 1 year old (BRTA requirement)." | Admin flow test |
| AC‑18 | `car_premium` driver with < 50 completed rides → allowed to remain `car_premium` (gate not retroactive for new drivers). After 50 rides with rating < 4.5 → admin dashboard shows warning suggesting downgrade to `car_comfort`. `car_xl` gate: after 25 rides with rating < 4.3 → downgrade warning. | Admin dashboard test |
| AC‑19 | `lib/fareCalc.ts`: for a bike_standard ride of 4 km, 30 min: `computed = 2500 + round(950 × 4) + (180 × 30) = 2500 + 3800 + 5400 = 11700`; `floor = 2500 + round(950 × 2) + (180 × 10) = 6200`; `final_fare = max(11700, 6200) = 11700` paisa (117 BDT). For a 1 km bike_basic ride with 0 min time: `computed = 2500 + 775 = 3275`; `floor = 2500 + 1550 + 1750 = 5800`; `final_fare = max(3275, 5800) = 5800` paisa (58 BDT — floor applies). | Unit test |
| AC‑20 | `PATCH /api/admin/config` with `{ driver_min_ratio: 0.40 }` → rejected 400 (below the allowed floor of 0.50). `{ driver_min_ratio: 0.60 }` → accepted 200. `{ driver_max_ratio: 3.50 }` → rejected 400 (above ceiling of 3.00). Changes to valid keys update `platform_config` and are immediately reflected in the next `GET /api/driver/slider-config` response without a server restart. | API test |
| AC-SOS-1 | Rider or Driver taps SOS button → modal opens with Call Police button, SMS text area, and Send SOS button. Numbers (`sos_police_number`, `sos_ride_number`) read from `system_config` at runtime. | Manual test + DB check |
| AC-SOS-2 | Tapping Send SOS sends exactly 3 SMS messages simultaneously (police number, user's personal SOS contact, platform SOS number). SOS alert logged in `sos_alerts` with `user_id`, `role`, `message`, `contacts_notified`. | Integration test |
| AC-SOS-3 | Tapping Call Police opens native dialer with `system_config.sos_police_number` AND still dispatches the 3 SMSes in background. | Manual test |
| AC-PROMO-2 | Promo code with `usage_interval=5` → eligible only when rider's completed rides since last redemption ≥ 5. `POST /api/promo/redeem` returns 422 `promo_interval_not_met` when interval not satisfied. | API test |
| AC-PROMO-3 | After ride completes with promo applied, a `driver_wallet_transactions` row is created with `transaction_type='promo_receivable'`, `amount_bdt = promo_discount_bdt`. | DB query + integration test |
| AC-REF-1 | New user signs up with valid referral code → `referrals` row created. On referee's first completed ride, referral reward applied automatically. Referrer receives reward entry in wallet/credit. | E2E test |
| AC-WALLET-1 | `GET /api/driver/wallet` returns `balance_bdt` = sum of non-payout `driver_wallet_transactions`. `GET /api/rider/wallet` returns `balance_bdt` = sum of `rider_wallet_transactions`. | API test + DB query |
| AC-POINTS-1 | After ride completes: rider's `point_transactions` row inserted with `amount = FLOOR(rider_payable_bdt / 100)`, `source_type='ride'`. Driver's `point_transactions` row inserted with `amount = FLOOR(platform_commission_bdt / 100)`, `source_type='commission'` (only when commission > 0). | DB query + unit test |
| AC-POINTS-2 | `POST /api/points/redeem` with valid offer and sufficient balance → `point_transactions` row with `transaction_type='redeemed'`, reward applied (package or wallet credit). Insufficient balance → 422 `insufficient_points`. | API test |
| AC-PHOTO-1 | Driver uploads a live selfie or passport photo during onboarding (`doc_type='driver_photo`). Face-match API returns a confidence score stored in `documents.face_match_score`. Scores below the admin-configured threshold are flagged as `face_match_status='low_confidence'` in the admin approval queue. | Integration test |
| AC-PHOTO-2 | Admin approval card shows driver photo alongside licence photo for visual comparison. Low-confidence face-match entries display a prominent warning badge. | Manual test |
| AC-VMODEL-1 | Driver enters Brand='Toyota', Model='Axio', Year=2019. System queries `vehicle_models`, finds a match, and auto-suggests `car_comfort` with `has_ac=true` pre-filled. Driver confirms or overrides. | Integration test |
| AC-VMODEL-2 | Driver enters Brand='UnknownBrand', Model='XYZ', Year=2020. No match in `vehicle_models`. System falls back to BRTA Vehicle Class Letter + CC range logic. Admin sees both the fallback suggestion and the driver's self-selected type. | Integration test |
| AC-AC-1 | Driver selects Car Economy with Non-AC. Red warning text appears: "Vehicles without AC receive fewer ride requests." Driver can still proceed. Admin dashboard shows "Non-AC" flag on the approval card. | UI test + admin flow |
| AC-AC-2 | Driver selects Car Premium with Non-AC. System shows: "Car Premium requires air conditioning. Your vehicle cannot be listed in this category." Selection is blocked. | UI test |
| AC-VID-1 | Driver records vehicle walkaround video (15-30s, ≥720p, ≤50MB). Video stored in Supabase Storage with `doc_type='vehicle_video'`. Video outside duration/resolution bounds shows inline error. | Integration test |
| AC-VID-2 | Sample media URLs (`sample_vehicle_photo_front`, etc.) are read from `system_config` at onboarding time. Admin updates URLs via admin panel. App displays sample thumbnails alongside capture buttons. | API test + UI test |

> **Note**: The acceptance criteria above are the complete, current set.

---
