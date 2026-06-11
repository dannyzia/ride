<!--
AI INSTRUCTIONS
===============
GlideX has basic Uber-clone flows (book ride, track driver, view history).
This file documents ONLY flows that are NEW or DIVERGE significantly from a standard Uber clone.
Standard flows (view map, see nearby drivers, view ride history) — inherit GlideX implementation.
Every flow here must be implemented completely including all alternate paths and error states.
Cross-reference: each step that calls an API must name the exact endpoint from 06-API.md.
-->

# User Flows: Ride
> Delta from GlideX. Only divergent or new flows documented here.

---

## Flow 1: Supabase Phone OTP Registration

### Entry points
- Fresh app install, no existing session
- "Sign up" from welcome screen (both Driver and Rider variants)

### Happy path
1. User enters phone number in E.164 format (+8801XXXXXXXXX). Client normalises input.
2. App calls `supabase.auth.signInWithOtp({ phone })`. Supabase sends OTP SMS via dprelay (configured as external SMS gateway in Supabase dashboard). Rate limiting is enforced by Supabase's built-in limits + optional API proxy rate limiting.
3. App uses Android Sms Retriever API to auto-detect and auto-fill the OTP. If auto-read doesn't trigger within 20 seconds, show manual OTP entry field.
4. App calls `supabase.auth.verifyOtp({ phone, token, type: 'sms' })`. Supabase verifies the OTP internally (replay protection built-in) and returns a JWT session on success.
5. App calls `POST /api/auth/verify-token` with the Supabase JWT to check if a user record exists. If user exists: navigate to role home. If not: proceed to step 6 for registration.
6. App calls `POST /api/register` with `{ name, role, vehicle_type? }`. Server extracts uid and phone from the Supabase JWT (already verified by middleware). Creates user record in a transaction. Returns `{ user_id, role, next }`.
7. App navigates to role-appropriate home screen (rider home or driver onboarding).

### Alternate paths
#### SMS auto-read not triggered (OEM battery optimisation)
- At step 3, if auto-read doesn't trigger within 20s, show manual OTP entry field.
- User reads SMS manually and types the OTP code.
- App calls `supabase.auth.verifyOtp({ phone, token, type: 'sms' })` with the manually entered code.

#### Invalid or expired OTP
- `supabase.auth.verifyOtp` returns an error. Show: "Invalid or expired code. Please try again." Allow retry without restarting the flow.

#### Rate limited (too many OTP sends)
- Supabase returns a rate limit error. Show: "Too many attempts. Please wait before trying again."

#### Phone already registered
- `POST /api/register` returns 409. Show: "This number is already registered. Please log in."

### Post-conditions
- `users` row exists with `auth_uid` (Supabase Auth UID), `phone`, `role`.
- Supabase session active. All subsequent API calls include Supabase JWT in Authorization header.

---

## Flow 2: Driver Onboarding (Vehicle + Documents + Owner Consent)

### Entry points
- After registration with `role = 'driver'`
- Drivers are gated on `drivers.status` — `pending` status blocks access to ride offers

### Step 1 — Vehicle Registration
1. Driver enters **Brand** (e.g., Honda, Toyota, Bajaj). Input field with autocomplete from `vehicle_models` table (sourced via `GET /api/reference/vehicle-models?search=`). Free text fallback if not in list.
1a. Driver enters **Model** (e.g., City, Axio, Pulsar). Autocomplete filtered by selected brand. Free text fallback if not in list.
1b. Driver enters **Manufacturing Year** — 4-digit number.
1c. **Auto-classification:** App calls `GET /api/reference/vehicle-suggest?brand=X&model=Y&year=Z`. If `vehicle_models` has a match, the system auto-suggests: vehicle type, AC status, and seat count. Driver confirms or overrides the suggestion. If no match, driver manually selects from 8 vehicle type options (sourced from `GET /api/reference/vehicle-types`):
   - **Bike Basic** (enum: `bike_basic`, ≤100cc), **Bike Standard** (`bike_standard`, 101–150cc), **Bike Plus** (`bike_plus`, >150cc)
   - **CNG** (`cng`)
   - **Car Economy** (`car_economy`, AC optional), **Car Comfort** (`car_comfort`, AC optional), **Car Premium** (`car_premium`, AC required), **Car XL** (`car_xl`, AC required, 7 seats)
   - Driver confirms the type. Admin may override during approval.
1d. **AC selection** (car types only): If vehicle type is `car_economy` or `car_comfort`, driver selects AC or Non-AC. If Non-AC selected, red warning appears: "Vehicles without AC receive fewer ride requests. Consider upgrading your vehicle to increase earnings." Driver can proceed. If vehicle type is `car_premium` or `car_xl`, AC is pre-selected and cannot be changed. Admin dashboard shows "Non-AC" flag for non-AC vehicles.

**Vehicle Type Criteria Reference (admin approval single source of truth):**
> **Note:** All vehicle type criteria below (age limits, seat counts, driver eligibility gates) are defined in `lib/vehicleTypes.ts` and are admin-configurable. Values shown are production defaults.

| Vehicle Type | CC Range | AC | Seats | Min Age (BRTA) | Max Age (soft) | Typical Models (BD) | Driver Licence | Additional Verification | Quality Gate |
|---|---|---|---|---|---|---|---|---|---|
| bike_basic | ≤ 100 cc | n/a | 1 | ≥ 1 yr | None | Hero Splendor, Bajaj Platina, Runner Cheeta | Motorcycle | Helmet photos (driver + spare) | None |
| bike_standard | >100–150 cc | n/a | 1 | ≥ 1 yr | None | Honda CB Shine SP, Bajaj Discover, Hero Glamour | Motorcycle | Helmet photos | None |
| bike_plus | >150 cc | n/a | 1 | ≥ 1 yr | None | Yamaha FZ‑S, Suzuki Gixxer, Bajaj Pulsar | Motorcycle | Helmet photos | None |
| cng | n/a | No | 3 | ≥ 1 yr | None | Standard CNG auto‑rickshaw | CNG driver permit | Road-legal check | None |
| car_economy | n/a | AC optional (Non-AC discouraged) | 4 | ≥ 1 yr | 15 yrs | Suzuki Alto, Toyota Vitz (older), Daihatsu Mira, Mitsubishi eK, Maruti Alto, Tata Indica — kei car / compact | Private car | Dashboard photo; interior seats photo; 6 vehicle photos + walkaround video | None |
| car_comfort | n/a | AC optional (Non-AC discouraged) | 4 | ≥ 1 yr | 12 yrs | Toyota Axio, Honda City, Vitz (AC), Hyundai Accent | Private car | Dashboard photo; interior seats photo; 6 vehicle photos + walkaround video | None |
| car_premium | n/a | **AC required** | 4 | ≥ 1 yr | 8 yrs | Toyota Camry, Honda Accord, Hyundai Sonata | Private car | Premium interior photo; dashboard (AC required); interior seats; 6 vehicle photos + walkaround video | ≥50 rides, ≥4.5★ (after 50 rides) |
| car_xl | n/a | **AC required** | 6–7 | ≥ 1 yr | 12 yrs | Toyota Noah, X-Trail, Honda CR-V, Pajero | Private/light transport | Third-row seat photo; dashboard (AC required); interior seats; 6 vehicle photos + walkaround video | ≥25 rides, ≥4.3★ (after 25 rides) |

**Categorisation rules (admin approval flow):**
- Driver self-selects a vehicle type during onboarding. Admin reviews uploaded documents and either **approves** the claimed type or **downgrades** to a more appropriate type (e.g., `car_comfort` → `car_economy` if no AC visible in dashboard photo) with a mandatory reason stored in `vehicles.admin_type_note`.
- Admin may also **upgrade** a vehicle type if supporting documents clearly justify it.
- Driver is notified of any type change via push notification + in-app modal showing old type, new type, and admin reason.
Driver may request a type change by uploading new documents (`POST /api/driver/vehicle-type-change`). Admin reviews the request. On approval, a **7-day cooling-off period** (configurable business rule; default 7 days) begins; the change takes effect after cooling-off (`vehicles.type_change_effective_at = approved_at + 7 days`). During cooling-off, the driver continues receiving offers for their current type.
- *(Optional enhancement)* Admin panel can auto-suggest a type based on document analysis, but the final decision is always human.

**BRTA age check in this step:**
- If driver enters a vehicle registration date less than 1 year ago (threshold defined per vehicle type in `lib/vehicleTypes.ts` `min_age_years`): a warning is shown immediately at submission: "Your vehicle was registered less than 1 year ago. This may be flagged for admin review per BRTA regulations." Allow submit.
- Admin sees the same warning in the approval queue. Admin must reject with reason "Vehicle must be at least 1 year old (BRTA requirement — configurable via `lib/vehicleTypes.ts`)" unless exceptional circumstances apply and admin provides a manual override note.
2. Driver enters **Manufacturer** (e.g., Honda, Toyota, Bajaj) — free text.
3. Driver enters **Model** (e.g., City, Axio, Pulsar) — free text.
4. Driver enters **Manufacturing Year** — 4-digit number.
5. Driver selects **Registration Area** from dropdown (DHAKA_METRO, CHITTAGONG_METRO, etc. — sourced from `GET /api/reference/registration-areas`).
6. Driver selects **Vehicle Class Letter** from dropdown (DAW, THAW, HA, KA, etc. — sourced from `GET /api/reference/vehicle-class-letters`). The dropdown shows both Bengali and English labels.
7. Driver enters the numeric portion of the **Registration Number**. System composes full registration: `{area}-{class}-{number}`.
8. Driver enters **Vehicle Registration Date** (date picker) — the date the vehicle was first registered with BRTA. Used for the 1-year age check (threshold from `lib/vehicleTypes.ts` `min_age_years`; configurable): if the registration date is less than 1 year ago, a warning is shown to both the driver (at submission) and the admin (at review).
9. Driver uploads **BRTA Certificate** → `doc_type='brta_certificate'`. **Mandatory for all vehicle types.**
10. Driver uploads **Registration Scan Copy** (front and back) → Firebase Storage → `POST /api/driver/document/upload-confirm` with `doc_type='reg_scan_front'` and `'reg_scan_back'`.
11. Driver enters **Vehicle Fitness Expiry Date**.
12. Driver uploads **Fitness Scan Copy** (front only) → `doc_type='fitness_scan'`.
13. Driver enters **Vehicle Tax Token Expiry Date**.
14. Driver uploads **Tax Token Scan Copy** (front only) → `doc_type='tax_token_scan'`.
15. Driver takes/uploads **Vehicle Photos** — 6 photos total:
    - **Exterior (4):** Front (`doc_type='vehicle_photo_front'`), Left side (`'vehicle_photo_left'`), Right side (`'vehicle_photo_right'`), Rear (`'vehicle_photo_back'`).
    - **Interior (2):** Dashboard showing AC controls (`'dashboard_photo'`), Front seats (`'vehicle_photo_seats'`).
    - Before each capture, the app shows a **sample reference image** (sourced from `system_config` keys: `sample_vehicle_photo_front`, `sample_vehicle_photo_left`, etc.) as a tappable thumbnail beside the capture button. Driver can compare their photo to the sample before submitting.
    - Client-side validation: resolution ≥ 720p, 50KB–20MB, JPEG/PNG, blur detection.
16. Driver records **Vehicle Walkaround Video** — 15–30 second video showing all four sides of the vehicle, ending with the dashboard → `doc_type='vehicle_video'`. Stored in Supabase Storage as `documents/{driver_id}/vehicle_video_{timestamp}.mp4`.
    - Before recording, the app shows the **sample walkaround video** (sourced from `system_config.vehicle_video` URL) as a tappable thumbnail or short video player.
    - Client-side validation: duration 15–30 seconds, resolution ≥ 720p, file size ≤ 50MB. If outside bounds, inline error shown and driver cannot proceed.
17. **Conditional uploads based on vehicle type:**
    - **Bike types** (Bike Basic, Bike Standard, Bike Plus): Driver uploads **Helmet Photos** — 2 photos → `doc_type='helmet_photo'` × 2. Mandatory for all bike categories.
    - **Car XL only** (in addition to above photos): Driver uploads **Third-Row Seat Photo** → `doc_type='third_row_photo'`. Used to verify 6–7 seat capacity.

**API call:** `POST /api/vehicle/register` with all vehicle fields. Creates `vehicles` row linked to driver.

### Step 2 — Driver Registration
1. **Driver Name** — pre-filled from registration.
2. **Address** — free text.
3. **Mobile Number** — pre-filled from authenticated phone (read-only).
4. **Driving License Number** — free text.
5. Driver uploads **License Scan Copy** (front and back) → `doc_type='license_front'` and `'license_back'`.
6. **Driver Photo (mandatory):** Driver takes a live selfie using the device camera, or uploads a recent passport-style photo → `doc_type='driver_photo'`.
    - Client-side validation: resolution ≥ 720p, 50KB–20MB, JPEG/PNG, blur detection (same rules as document uploads).
    - The system performs a **face-match comparison** between the driver photo and the uploaded licence photo using a face-match API (interface defined in `lib/faceMatch.ts`; vendor TBD).
    - A confidence score (`documents.face_match_score`, 0.00–100.00) is stored. Scores below the admin-configured threshold (from `system_config.face_match_min_score`, default 70.00) set `face_match_status='low_confidence'` and are flagged in the admin dashboard.
    - The driver photo appears on the admin approval card alongside the licence photo for visual side-by-side comparison.
7. **Mobile Phone Authentication** — already completed during registration (Supabase phone OTP flow).

**API call:** `POST /api/driver/profile` with address and license fields. Updates `drivers` row.

### Step 3 — Owner Consent
Two paths depending on whether the driver owns the vehicle:

**Path A: Driver IS the vehicle owner**
1. Toggle "I own this vehicle" → confirmed.
2. Optional: "Legacy Operator?" tick mark. If checked: upload Uber/Pathao registration screenshot → `doc_type='legacy_screenshot'`.
3. Submit → goes to Admin Approval.
4. Admin approves → `drivers.status = 'active'`. Driver can purchase packages and receive ride offers.

**Path B: Driver is NOT the vehicle owner**
1. Enter **Owner Name** — free text.
2. Enter **Owner Address** — free text.
3. Enter **Owner Mobile Number** — E.164 format.
4. Optional: "Legacy Operator?" tick mark. If checked: upload Uber/Pathao registration screenshot → `doc_type='legacy_screenshot'`.
5. Upload **Owner Consent Scan Copy** (document must be dated within the last 30 days — configurable business rule; default 30 days) → `doc_type='owner_consent_scan'`.
6. Submit → goes to Admin Approval.

**Admin approval outcomes (Path B):**
- **With consent scan copy submitted:**
  - Approved → `drivers.status = 'temporary'`, `provisional_expires_at = now() + 30 days` (configurable business rule; default 30 days). Driver is **temporarily activated**. Can purchase packages and receive ride offers.
  - After 30 days (configurable business rule; default 30 days): driver must re-submit owner consent scan copy. On re-approval → `drivers.status = 'active'` (full activation).
  - Not approved → `drivers.status = 'rejected'`.
- **Without consent scan copy:**
  - Approved → `drivers.status = 'pending'` (registered but not activated). Must submit consent scan copy to proceed.
  - Not approved → `drivers.status = 'rejected'`.

**API calls:**
- `POST /api/driver/owner-consent/submit` with owner details and document IDs.
- After the consent form is submitted, the app calls `POST /api/driver/documents/submit` to finalize the document submission and move the driver to the admin review queue.
- `POST /api/admin/driver/approve` sets status based on consent path.

### Error states
| Trigger | Behavior |
|---------|----------|
| Vehicle upload to Supabase Storage fails | Show retry. Document not submitted until confirm API returns 201. |
| Fitness or tax token expired at submission | Show warning: "Your [fitness/tax token] is expired. You can still submit but must renew before driving." Allow submit. |
| Admin rejects documents | Push notification + in-app message with rejection reason. Driver can re-upload. |
| Consent scan copy older than 30 days (configurable; default 30 days) | Show error: "Consent document must be dated within the last 30 days." Block submit. |
| Vehicle registration date < 1 year ago (threshold from `lib/vehicleTypes.ts`) | Warning shown to driver at submission: "Your vehicle was registered less than 1 year ago. This may be flagged for admin review per BRTA regulations." Allow submit. Warning also shown to admin during review. Admin may reject with reason: "Vehicle must be at least 1 year old per BRTA regulations." |
| Payment stuck | "Payment received. Activating your package..." Show support phone number: `EXPO_PUBLIC_SUPPORT_PHONE`. |
| Driver photo fails blur/resolution check | Inline error: "Photo is too blurry or low resolution. Please retake in good lighting." Block submit. |
| Face-match API unavailable | Set `face_match_status='pending'`. Allow submit. Admin dashboard shows "Face match pending" badge. Background job retries. |
| Vehicle video duration < 15s or > 30s | Inline error: "Video must be 15–30 seconds long." Block submit. |
| Vehicle video resolution < 720p | Inline error: "Video resolution too low. Please record in HD or higher." Block submit. |
| Vehicle video file size > 50MB | Inline error: "Video file is too large. Please re-record." Block submit. |
| Sample media URL not configured (system_config empty) | Skip sample thumbnail display. Capture button still works. Log warning server-side. |

---

## Flow 3: Package Purchase (PortPos)

### Entry points
- After driver approval (directed from approval notification)
- From driver home screen "Buy Calls" button
- When `subscriptions.calls_remaining = 0`

### Happy path
1. Driver sees package list screen. `GET /api/package/list` returns available packages. Micro-trial always shown first.
2. Driver selects package and payment method (bKash/Nagad/Rocket/card — PortPos handles all methods).
3. App generates `idempotency_key = uuid()`. Calls `POST /api/package/purchase` with header `Idempotency-Key: <uuid>` and body `{package_id, provider: 'portpos'}`. Body fields named `idempotency_key` are rejected with 400.
4. Server initiates PortPos payment. Returns `{payment_url}`. App opens `payment_url` in `react-native-webview` via `components/PaymentWebView.tsx`.
5. Driver completes payment on PortPos page. Provider redirects to callback URL.
6. Server receives `GET /api/payment/portpos/callback`. Verifies payment with PortPos API. Calls `activateSubscription(db, payment_event_id)` from `lib/activateSubscription.ts` — that function handles the full activation transaction (INSERT subscriptions + INSERT call_ledger initial_load + UPDATE payment_events) atomically. Do NOT inline these writes in the callback handler.
7. App polls `GET /api/package/active` every 3s. On `status='active'` → close WebView → show success screen with balance.

### Alternate paths
#### WebView closed by driver before payment completes
- App stops polling. If callback still arrives later, server processes it. Next time driver opens app, `GET /api/package/active` returns the activated subscription.

#### PortPos callback never arrives (5 min timeout)
- Server auto-queries PortPos payment status. If paid: activate and insert subscription. If not paid: mark `payment_events.status = 'failed'`. Driver sees "Payment not confirmed. If charged, contact support."

#### Payment succeeds but DB write fails
- The `compensation_queue` DB table entry retries activation via `compensationWorker` every 30s up to 10 times. If still failing: admin alert. Driver sees "Payment received. Activating your package..." until resolved.

#### Duplicate purchase attempt (same idempotency key)
- `POST /api/package/purchase` returns **200 OK** with the original `{payment_url, payment_event_id}`. Client re-opens the WebView or resumes polling `GET /api/package/active`.

### Post-conditions
- `subscriptions` row with `status='active'`, `calls_remaining` = package call_count (-1 for unlimited).
- `call_ledger` row: `event_type='initial_load'`, `delta=call_count`, `balance_after=call_count`. For unlimited packages (`call_count=-1`): `delta=-1`, `balance_after=-1` (the -1 value is a sentinel for "unlimited" — not a real balance). This matches `lib/activateSubscription.ts` which uses `delta=call_count` directly.

---

## Flow 4: Ride Request and Dispatch (Rider + Driver)

### Entry points (Rider)
- Rider home screen → set pickup and dropoff on map

### Happy path
1. Rider sets pickup (GPS auto-set or map pin), dropoff (Google Places autocomplete), vehicle type.
2. Rider sees location-search stabilization state on home map (pulse around current location, tab bar visible, non-blocking).
2. App calls `POST /api/ride/request`. Server checks: inside zone, rider not rate-limited. Returns `fare_breakdown`. Rider sees upfront fare breakdown (base + per-km + est. wait). Rider taps Confirm.
3. Rider sees fare options in collapsed sheet first (selected vehicle + payment + promo + primary CTA), then can expand to full options list while preserving selected option highlight.
3a. Rider can open Payment method selector and Promos/Vouchers selector before confirm.
3b. If promo applies successfully, discounted prices appear with original values struck through.
3. Ride created with `status='pending'`. Rider sees "Finding your driver…" with animated map.
4. Finding-driver state includes explanatory text + cancel CTA. Cancel CTA opens reason selection flow.
4. WebSocket server selects top-N drivers via H3 query + weighted scoring. Broadcasts `ride:offer` to Batch 1 (batch size configurable via `BATCH_SIZE` env var; default 5 drivers).
5. **Driver side:** Offer card appears with a countdown (default 15s; configurable via `OFFER_TIMEOUT_MS` env var). INSERT `dispatch_offers` row with `outcome='delivered'`.
   - On first user interaction with the offer card (touch on swipe handle or any button): app sends `fetch:confirm` WebSocket message.
   - Server opens a deduction window (default 5s; configurable via `CALL_DEDUCTION_WINDOW_MS` env var, plus 1s grace via `CALL_DEDUCTION_GRACE_MS`):
     - If `fetch:confirm` received:
        → ATOMIC TX: For FINITE (`calls_remaining > 0`): INSERT `call_ledger` (deduction, delta=-1, balance_after=calls_remaining-1) + UPDATE `subscriptions` SET `calls_remaining=calls_remaining-1`, `daily_calls_used = CASE WHEN daily_reset_at <= now() THEN 1 ELSE daily_calls_used + 1 END`, `daily_reset_at = CASE WHEN daily_reset_at <= now() THEN nextBdtMidnightUtc() ELSE daily_reset_at END`, `total_deductions = total_deductions + 1` + UPDATE `dispatch_offers.fetch_confirmed_at`. For UNLIMITED (`calls_remaining=-1`): INSERT `call_ledger` (deduction, delta=-1, balance_after=-1) + UPDATE `subscriptions` SET `daily_calls_used = CASE WHEN daily_reset_at <= now() THEN 1 ELSE daily_calls_used + 1 END`, `daily_reset_at = CASE WHEN daily_reset_at <= now() THEN nextBdtMidnightUtc() ELSE daily_reset_at END`, `total_deductions = total_deductions + 1`. Do NOT decrement calls_remaining for unlimited.
     - If no `fetch:confirm` within the deduction window: no ledger entry written; UPDATE `dispatch_offers.outcome='expired'`; trigger FCM SMS fallback.
     - If `fetch:confirm` received but driver ignores offer for the full countdown period: INSERT `call_ledger` refund row; UPDATE `dispatch_offers.outcome='refunded'`.
   - Driver accepts within the countdown period → `offer:accept` sent. Server: sets `rides.status='matched'`, UPDATE `dispatch_offers.outcome='accepted'`.
   - Driver rejects → `offer:reject`. Driver is excluded from further batches for this ride. UPDATE `dispatch_offers.outcome='rejected'`.
6. On match: server sets `rides.status = 'matched'`, `rides.driver_id`, `rides.matched_at`. Emits `ride:matched` to rider WebSocket. Rider sees driver name, photo, vehicle number, rating, ETA. The `rides.status` advances to `driver_arriving` immediately on match. The driver then taps 'I've Arrived' when at the pickup point (transitions to `driver_arrived`), then taps 'Start Ride' to begin the trip (transitions to `in_progress`).
7. **Chat and call available:** Both rider and driver can open in-app chat. Messages are sent via `POST /api/ride/:id/message`, delivered via WebSocket `chat:message`, and may include inline image attachments. Voice/video call can be escalated from chat or ride contact actions through `POST /api/ride/:id/call-session`, with full-screen call UI that returns to the prior ride context when ended. `GET /api/ride/:id/contact` remains available for direct dial fallback. Chat remains active until ride is completed or cancelled, including during `driver_arrived` waiting.
8. During `driver_arriving`, rider can expand the bottom sheet to view structured details: driver card, ride/payment summary, fare summary, and cancel action.
9. Driver navigates to pickup (Google Maps). Driver location updates sent every 5s via `location:update` → `location:driver` forwarded to rider.
10. Driver reaches pickup → taps "I've Arrived". `POST /api/ride/:id/arrive` → `rides.status = 'driver_arrived'`, `rides.arrived_at = now()`.
11. Rider app receives `driver_arrived` WebSocket event → shows persistent "Your driver has arrived" banner. Waiting timer visible to both parties.
12. Driver taps "Start Ride" (OR ride auto-starts after 60-second free wait timer expires — whichever comes first). `POST /api/ride/:id/start` → `rides.status = 'in_progress'`, `rides.started_at = now()`. If driver doesn't start within 60s of `arrived_at`, scheduler auto-sets `started_at = arrived_at + 60s`. Billable timer starts at `min(arrived_at + 60_000, started_at)`.
13. Rider sees live driver location on map during trip.
14. Driver taps "Complete Ride". `POST /api/ride/:id/complete` → fare recalculated with actual `ride_time_min` (timer from `min(arrived_at + 60_000, started_at)` to completion), floor fare applied, commission derived from `pricing.platform_commission_percent`.
15. Rider receives `ride_completed` WebSocket event → post-arrival summary panel shown (trip metrics + optional mood capture + final action), then final fare summary (time charge + distance charge + base fare). Rider pays driver exact `total_bdt` amount in cash.
16. Both apps show rating screen. Rider rates driver (1–5). Driver rates rider (1–5). Both call `POST /api/ride/:id/rate`.
17. Rider can expand/collapse rating fare details (show/hide) without resetting selected stars.
18. If tip flow is enabled and rule matches (for example 5-star): rider sees preset tip chips, custom tip entry, and dual CTA (`Skip`, `Pay Tip`). Tip charge is wallet-backed where configured.
19. Rider sees a final thanks confirmation screen and explicitly acknowledges with OK before returning to home/activity.

> **Edge case — `arrived_at IS NULL`:** If rider cancels while driver is en route (before `driver_arrived`), no actual waiting charge applies; commission is not applicable. If ride completes but `arrived_at` is somehow NULL, the estimated wait from the original fare breakdown is used instead.

### Alternate path: No driver accepts (batches exhausted; default 3 batches, configurable via `MAX_BATCH_COUNT` env var)
- `rides.status = 'expired'`. Rider sees "No drivers available right now. Try again in a few minutes."

### Alternate path: No driver of requested type available (no_drivers)
1. Dispatch exhausts all configured batches (default 3; configurable via `MAX_BATCH_COUNT`) for requested vehicle type with zero accepts.
2. If `allow_downgrade=true` in ride request: server queries H3 index for ALL vehicle types in pickup area.
3. For each type with ≥1 available driver, compute fare estimate.
4. Server emits WebSocket `ride:alternatives` event to rider with alternatives array.
5. Rider app shows alternatives sheet (see 08-UI-SPEC.md): "No Car Premium drivers nearby. Try Car Comfort at ৳94 or Car Economy at ৳76?" (fare amounts sourced from the `pricing` table; admin-configurable)
6. Rider selects alternative → app calls `POST /api/ride/request` with new vehicle type.
7. Original ride cancelled (status='no_drivers'). New ride created with selected type.
8. If no alternatives exist → ride expires normally (status='expired').

### Alternate path: SMS fallback
- If driver app does not send `fetch:confirm` within the deduction window of `ride:offer` broadcast: server triggers Expo Push notification (or SMS deep link as fallback). If driver taps link → app opens, offer card renders, `fetch:confirm` sent. Normal deduction flow continues.

### Alternate path: Scheduled ride
- Rider sets `scheduled_at` (15–60 min in future). Ride created as `status='pending'` but WebSocket dispatch does NOT start yet. Scheduler runs every 60s and queries `rides WHERE scheduled_at BETWEEN now()+60s AND now()+120s AND status='pending' AND scheduled_dispatched_at IS NULL`. This window targets rides whose scheduled time is 1–2 minutes away, so dispatch begins at approximately `scheduled_at - 120s` (AC-9). For each match: set `scheduled_dispatched_at = now()` (prevents double-dispatch on restart), then trigger dispatch exactly as step 4 above. Call deduction happens at dispatch time, not booking time.

Scheduled ride UX detail:
1. Rider opens schedule picker from fare sheet.
2. Rider selects day/date/time and confirms.
3. Fare sheet CTA switches to schedule mode with selected datetime chip.
4. On submit, rider sees "Scheduling your ride..." progress panel.
5. Rider receives "Ride scheduled" confirmation with scheduled datetime and Activity navigation hint.

Promo/Voucher & Referral subflow:
1. Rider opens promos/vouchers screen from the fare sheet.
2. Rider sees a list of available promos (`GET /api/promo/available`).
3. Rider can tap to apply a promo from the list, or type a code (promo or referral) in the input field. The code input field is always visible on every ride booking screen.
4. App calls `POST /api/promo/validate` (or referral validation).
5. Invalid code -> invalid modal, retry preserved.
6. Valid code -> success modal with `use_now` or `use_later`.
7. `use_now` updates fare sheet pricing and promo row badge immediately. If code is referral, applies referral discount (e.g. 50%).

Activity and ride details subflow:
1. Rider opens Activity and chooses one lifecycle tab: ongoing, scheduled, completed, or canceled.
2. Ongoing item -> "Track Route" returns rider to live tracking state for active ride.
3. Scheduled item -> Ride Details (scheduled) showing datetime, status chip, IDs, fare, and share/cancel actions.
4. When scheduled ride is matched, rider receives assignment event and sees driver-found modal.
5. Acknowledge modal -> Ride Details updates to show assigned driver card while preserving booking and fare sections.
6. Completed item -> Ride Details (completed) shows final totals including optional tip.
7. Canceled item -> Ride Details (canceled/refunded) shows refund-aware status and payment context.
8. Rider can trigger Share Receipt from ride details in scheduled/completed/canceled states.

Wallet top-up & usage subflow:
1. Rider starts top-up from Account wallet card or Activity Top Up tab.
2. Rider enters amount using preset chip or manual keypad.
3. Rider continues to payment method selector and chooses one method.
4. Rider confirms top-up with amount-bound CTA.
5. On successful provider confirmation, rider sees top-up success modal.
6. After acknowledgment, wallet balance (`GET /api/rider/wallet`) updates and top-up transaction appears in Activity Top Up history.
7. Rider can open Top Up Details and share receipt for that top-up transaction.
8. When Rider pays for a ride using wallet, amount is deducted. If insufficient funds, rider uses combined payment (Wallet + Cash/Card).

Saved addresses subflow:
1. Rider opens Saved Addresses from Account.
2. Rider can create a new address using map search/pin + name/details form.
3. On save success, rider returns to list with new address visible.
4. Rider can open address overflow menu and choose Edit or Delete.
5. Delete opens confirmation sheet with selected address preview.
6. Confirm delete removes address and shows "Address deleted!" feedback with Undo.
7. Undo restores the deleted address within the configured undo window.

Settings and payment methods subflow:
1. Rider opens Account settings and enters one of: Personal Info, Notifications, Account & Security, Linked Accounts, Data & Analytics, Payment Methods.
2. Personal Info updates profile fields and avatar, then persists changes.
3. Notifications and security toggles update preference state immediately with server sync.
4. Linked Accounts allows connect/disconnect flows for supported identity providers.
5. Data & Analytics routes to usage controls, ad preference controls, and data export request.
6. Payment Methods lists connected instruments and supports Add New Payment form.
7. Successful new card save returns to list with the added method visible and selectable for future top-up/payment flows.

Appearance/help/logout subflow:
1. Rider opens App Appearance and can adjust theme and app language.
2. Theme change is chosen in modal sheet and applied only after explicit confirmation.
3. Language selection updates app display language and returns to appearance root with new value reflected.
4. Rider opens Help & Support and can enter FAQ, Contact Support channels, Privacy Policy, or Terms of Service.
5. FAQ supports category-filtered search and expandable answers.
6. Contact Support channels open respective in-app or external surfaces.
7. Rider chooses Logout from account screen, confirms in destructive sheet, and session is cleared before redirecting to auth route.

### Error states
| Trigger | Behavior |
|---------|----------|
| Pickup outside zone | "Sorry, we only operate in Dhaka currently." |
| Rider rate-limited (>5 req/hr) | "You've made too many requests. Please wait before trying again." |
| Driver cancels after accept | Driver acceptance rate decremented. If >3 cancels/day: flag for admin. Ride is cancelled (`rides.status = 'cancelled'`, `cancelled_by = 'driver'`). Rider must create a new ride request. |
| Rider cancels after match | Reason required from standard reason list. If reason is `other`, free-text detail is required. If repeated → 1h cooldown on rider. `rides.status = 'cancelled'`. |

Cancellation completion UX step:
- After successful cancel API response, show cancellation confirmation screen with OK action before returning rider to home/activity.
- Refund sentence is shown only when wallet/preauthorized funds were actually reversed.

### Standard rider cancellation reason set
- `change_in_plans`
- `waiting_too_long`
- `unable_to_contact_driver`
- `driver_denied_destination`
- `driver_denied_pickup`
- `wrong_address_shown`
- `price_not_reasonable`
- `emergency_situation`
- `booking_mistake`
- `poor_weather`
- `other` (requires details text)

### Edge case: Subscription expires during active ride
- If a driver's subscription `expires_at` passes while `rides.status` IN ('matched', 'driver_arriving', 'driver_arrived', 'in_progress'):
  - The `subscription:expired` event is delayed until the ride reaches a terminal state (`completed` or `cancelled`).
  - Maximum defer: 2 hours (configurable business rule; default 2 hours / grace period). If the subscription has been expired for > 2 hours regardless of ride state, emit `subscription:expired` and prevent new offers. The active ride continues unaffected.
  - The driver remains online until the ride completes.
  - After ride completion, the driver is immediately forced offline. No new offers are dispatched.
  - The scheduler checks for this condition every 60 seconds.

Post-ride closure sequence:
1. Arrival summary panel (trip metrics and optional mood capture).
2. Driver rating screen (required for progression unless skipped by policy).
3. Optional tip selection screen (feature-flag or payment-scope gated).
4. Final "Thanks for your feedback" confirmation screen.

---

## Flow 5: Call Wallet and Utilisation Guarantee

### Trigger: Subscription expires with < 50% calls used (platform-side shortage; the 50% threshold is a configurable business rule)
1. At `subscriptions.expires_at`, server job checks: `calls_used / package.call_count < 0.5`.
2. Check if shortage was platform-side: query `driver_online_sessions` table for this subscription: `SELECT SUM(duration_minutes) FROM driver_online_sessions WHERE subscription_id = X AND went_offline_at IS NOT NULL`. If `total_online_minutes > 60% of (duration_days * 1440)` — the driver was online for most of the subscription — AND rides dispatched to driver < expected per-driver average, the shortage is platform-side.
3. "Expected per-driver average" = `total_offers_dispatched_in_zone / total_active_drivers_in_zone` during the subscription period. If a driver received < 50% of this average, the platform failed to deliver enough opportunities (50% threshold is configurable).
4. If platform-side: compute pro-rata credit in CALLS (not BDT):
   - For FINITE packages (call_count > 0): `credit_calls = floor(calls_remaining * 0.5)`. The driver receives half the unused calls as credit toward next package.
   - For UNLIMITED packages (call_count = -1): `credit_calls = floor((packages.daily_cap * packages.duration_days - subscriptions.total_deductions) * 0.5)`. Uses `total_deductions` column (never reset, incremented in every deduction transaction) — NOT `daily_calls_used` (which resets at midnight).
   - Round down to nearest integer.
5. INSERT `credit_vouchers` row: `{driver_id, calls=credit_calls, expires_at=now()+90 days, redeemed_subscription_id=NULL}` (90-day voucher expiry is a configurable business rule; default 90 days). On the next package activation, `lib/activateSubscription.ts` redeems the voucher inside the activation transaction: INSERT `call_ledger` row `{event_type='credit', delta=+voucher.calls, reason='pro_rata_credit'}` against the new subscription and sets `redeemed_subscription_id`.
6. Push notification: "You've received a credit of X calls on your next package due to low demand."

### Driver views wallet
- Home screen shows: current balance, subscription expiry, today's calls used.
- All sourced from `GET /api/package/active` + `GET /api/call-ledger` (last 5 transactions).

---

## Flow 6: Admin Driver Approval

### Entry points
- Admin web panel → Approval Queue
- SLA breach alert (> 24h pending; configurable review SLA, default 24 hours)

### Happy path
1. Admin opens queue. `GET /api/admin/queue?status=pending` returns list sorted by `submitted_at` ascending.
2. Admin clicks driver row. Sees: profile info, vehicle details, document images (presigned Supabase Storage URLs via `GET /api/admin/document/:id/presigned-url`, time-limited). **Driver photo** appears alongside licence photo for visual side-by-side comparison. If `documents.face_match_status` is `'low_confidence'`, a prominent amber warning badge is shown: "Face match score below threshold (XX/100). Verify identity manually."
3. Admin checks **Vehicle Registration Date**. If < 1 year old (threshold from `lib/vehicleTypes.ts` `min_age_years`; configurable): warning banner displayed — "Vehicle registered less than 1 year ago. BRTA regulations require minimum 1-year age." Admin may reject with reason.
4. Admin reviews **Vehicle Type Claim** against submitted documents. If documents don't support the claimed type (e.g., no AC visible in dashboard photo for Car Comfort, or no third-row seat visible for Car XL): admin may **downgrade** the vehicle to a more appropriate type. Downgrade requires a mandatory reason input. Example: "No AC visible in dashboard photo — downgraded from Car Comfort to Car Economy."
5. Admin reviews BRTA certificate document.
6. Admin reviews documents. Taps Approve → `POST /api/admin/driver/approve`. Or taps Reject with reason → `POST /api/admin/driver/reject`.
7. Driver receives push notification of outcome.
8. Queue depth widget on admin dashboard updates. Alert fires if any item pending > 24h (configurable review SLA; default 24 hours).

**Note on premium tier gates:** Car Premium and Car XL have ride-count and rating gates (see vehicle type list; thresholds defined in `lib/vehicleTypes.ts` `driver_req`; admin-configurable). These gates are checked at vehicle registration and type-change request time — the admin does not need to verify them manually during initial approval. There is **no automatic promotion**: a driver must explicitly select or request the premium type. The gate is also **not retroactive** — a driver already on Car Premium with < 50 rides (default threshold) keeps the type; the gate only blocks new registrations once the threshold is reached with insufficient rating (see AC-18).

### SLA breach auto-escalation
- Background job runs every 30 min. Any `documents.created_at < now() - 24h` (configurable review SLA; default 24 hours) `AND status='pending'` triggers an admin alert (push to admin app + log entry).

## Flow 7: Driver Vehicle Type Change Request

### Entry points
- Driver settings screen → "Change vehicle type" option
- Only available if `drivers.status` IN ('active', 'temporary')

### Happy path
1. Driver taps "Change vehicle type" in settings.
2. App shows current type and available types (only valid upgrades or same-category changes).
3. Driver selects new type and provides reason (free text).
4. App prompts for supporting documents (new photos, updated registration, BRTA certificate if changed).
5. Driver uploads documents via `POST /api/driver/document/upload-confirm`.
6. Driver submits request via `POST /api/driver/vehicle-type-change`.
7. App shows: "Request submitted. We'll review within 24 hours (configurable review SLA; default 24 hours). If approved, the change takes effect in 7 days (configurable cooling-off; default 7 days)."
8. Admin reviews via standard approval queue. Approve → `status='cooling_off'`. Reject → driver notified.
9. After 7-day cooling-off (configurable business rule; default 7 days): scheduler updates `drivers.vehicle_type` and `vehicles.vehicle_type`. Driver notified.

### Alternate paths
| Trigger | Behavior |
|---------|----------|
| Pending request exists | Show existing request status. Block new submission. |
| Admin rejects | Push notification + in-app message with rejection reason. Driver can re-submit with new documents. |
| Driver suspended during cooling-off | Type change paused (status remains `cooling_off`). `effective_at` is extended by the duration of the suspension. Admin may manually reject the type change during the suspension review. |

### Post-conditions
- Driver receives ride offers for NEW type after 7-day cooling-off (configurable; default 7 days) completes.
- Old pricing row no longer applies. New pricing row used for fare calculation.
- `min_per_km_bdt` is reset to NULL (system rate for new type) on effective date.

---

## Flow 8: Enhanced SOS Alert (Rider & Driver)

### Entry points
- Shield icon on the active ride map screen (Rider and Driver).

### Happy path
1. User taps the Shield icon.
2. A bottom sheet appears offering two choices:
   a. "Call Emergency (999)" - Dials the default system emergency number immediately.
   b. "Send SOS Alert" - Proceeds to the SOS alert screen.
3. User selects "Send SOS Alert".
4. User optionally types a custom message (e.g., "Car broke down, feeling unsafe", max 160 chars) or leaves it blank.
5. User taps "Send".
6. App calls `POST /api/sos/alert` with location and message.
7. System simultaneously sends SMS to:
   - Police/Emergency (configured in system_config).
   - User's personal SOS contact (configured in profile via `PATCH /api/user/sos-contact`).
   - Platform admin (configured in system_config).
8. Admin dashboard receives WebSocket alert with location and details.
9. App shows "SOS Sent" confirmation screen.

---

## Flow 9: Driver Wallet and Payout

### Entry points
- Driver profile / earnings screen.

### Happy path
1. Driver opens Wallet tab.
2. System calls `GET /api/driver/wallet` to fetch current balance of platform receivables (from promo subsidies and referral rewards).
3. If balance > 500 BDT (admin-configurable minimum), driver taps "Withdraw".
4. Driver enters amount and confirms bKash/Nagad account details.
5. System creates payout request (deducts from `driver_wallet_balance_bdt` via `driver_wallet_transactions`).
6. Admin processes payout. Driver receives funds.

---

## Flow 10: Referral Program

### Entry points
- "Invite Friends" menu option in user profile/account.
- Referral code input field on ride booking fare sheet (both promo and referral codes accepted).

### Happy path (Referrer)
1. Referrer opens "Invite Friends" screen from profile.
2. App fetches referral code via `GET /api/referral/code`. Auto-generates if not exists.
3. Screen shows: unique code (e.g. `RIDE-A3F9B2`), reward summary ("Give 50% off, get ৳50 credit"), stats (friends invited, total earned).
4. Referrer taps "Share" → native share sheet opens with pre-filled message containing the code.
5. Referrer taps "Copy Code" → code copied to clipboard, toast shown.

### Happy path (Referee signup with code)
1. Referee receives referral code (via share link, message, etc.).
2. Referee downloads app and enters phone number during registration.
3. On the registration screen or first ride booking screen, referee enters the referral code in the code input field.
4. App calls `POST /api/referral/apply` with `{code}`.
5. Server validates: code exists, campaign active, referrer hasn't exceeded max_uses_per_referrer, campaign hasn't exceeded max_uses_per_campaign.
6. On validation: `referrals` row created linking referrer and referee. `referral_codes` usage count incremented.
7. Invalid code → error toast with specific reason (not found, expired, limit reached).

### Happy path (Referee first ride — reward distribution)
1. Referee completes their first ride.
2. In `POST /api/ride/:id/complete`, server checks if referee has a pending referral (`referrals WHERE referee_id=user_id AND status='pending'`).
3. If yes: UPDATE `referrals.status='rewarded'`, `rewarded_at=now()`.
4. Referee reward: apply `campaign.referee_reward_percent` as discount on this ride. INSERT `rider_wallet_transactions` with credit.
5. Referrer reward: INSERT wallet transaction (driver_wallet_transactions if driver, rider_wallet_transactions if rider) with referrer reward amount.
6. Both parties receive push notification about the reward.

### Happy path (Referrer uses reward)
1. Referrer opens ride booking screen.
2. In the promo/referral code input area, available referral reward is shown as a badge or chip.
3. Referrer taps to apply. Discount applied to fare.
4. On ride completion, the reward credit is consumed.

### Error states
| Error | Condition | Behavior |
|-------|-----------|----------|
| Invalid code | Code not found | Toast: "Invalid referral code." |
| Campaign inactive | No active campaign or campaign expired | Toast: "This referral code is no longer active." |
| Limit reached | Referrer max uses exceeded | Toast: "This code has reached its usage limit." |
| Self-referral | User enters own code | Toast: "You cannot use your own referral code." |
| Already referred | User already has a referral record | Toast: "You've already used a referral code." |

---

## Flow 11: Points & Rewards

### Entry points
- "My Points" card on Rider/Driver home screen or Account menu.

### Happy path
1. User completes a ride (Rider pays fare, Driver pays commission).
2. System automatically awards points: Rider earns 1 point per BDT of `rider_payable_bdt`; Driver earns 1 point per BDT of `platform_commission_bdt` (only when commission > 0). System inserts `point_transactions` for each. Both user balances update.
3. User opens Points screen (`GET /api/user/points`). Sees balance and history.
4. User switches to "Offers" tab (`GET /api/points/offers`).
5. User selects an offer (e.g., "50 BDT Wallet Credit" for 5000 points).
6. User taps "Redeem". App calls `POST /api/points/redeem`.
7. System deducts points and credits the user's wallet.
8. Success modal shown.
