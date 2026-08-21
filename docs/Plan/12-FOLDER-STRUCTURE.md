<!--
AI INSTRUCTIONS
===============
Base: GlideX directory structure — treat it as implicit. Do not re-document what already exists in GlideX.
This file lists ONLY:
  - New directories being added
  - New files being added to existing directories
  - GlideX files being DELETED
  - GlideX files being REPLACED (same path, new content)
Read: 02-ARCHITECTURE.md (component map) for the full KEEP/REPLACE/DELETE/ADD breakdown.
Hard rule: every new file you create must appear in this document or in 02-ARCHITECTURE.md.
-->

# Folder Structure: Ride
> Delta from GlideX. GlideX tree is the implicit baseline — only changes listed here.

---

## GlideX files to DELETE

```
app/(auth)/                       ← DELETE all Clerk screen files inside
  sign-in.tsx                     ← DELETE (Clerk)
  sign-up.tsx                     ← DELETE (Clerk)
  (any other Clerk auth screens)  ← DELETE

app/api/login+api.ts              ← DELETE
app/api/clerk-role+api.ts         ← DELETE
app/api/create-payment+api.ts     ← DELETE (Stripe)
app/api/send-email+api.ts         ← DELETE
app/api/unique-email+api.ts       ← DELETE

components/OAuth.tsx               ← DELETE (social auth)
components/Payment.tsx             ← DELETE (Stripe sheet)
```

---

## GlideX files to REPLACE (same path, full rewrite)

```
app/(auth)/                       ← replace contents (see below for new files)
app/_layout.tsx                   ← ADD: expo-font preload for Noto Sans Bengali. ADD: min_app_version check via GET /api/app-config on launch.
app/api/register+api.ts           ← replace: Clerk → Supabase Auth phone OTP
app/api/ride/create+api.ts        ← replace: renamed + extended (see API.md)
src/db/schema.ts                  ← extend: add all new tables (see DATA-MODEL.md)
utils-server/index.ts             ← replace: Express → ws WebSocket server
```

---

## New directories and files

### `app/(auth)/` — New auth screens (replacing Clerk screens)

```
app/(auth)/
  phone-entry.tsx                 ← Phone number input + role selector
  otp-polling.tsx                 ← OTP verification screen (auto-fill via SMS Retriever + manual entry fallback)
  register.tsx                    ← Name input after OTP verified
```

### `assets/` and `theme/` — GoRide design system assets

```
assets/
  logo/
    logo.png                      ← primary brand mark copied from App Design/Logo/image-2026-05-04T15-36-03-285Z.png
  icons/
    marker-navigation.png         ← from Elements/Marker Navigation.png
    marker-navigation-1.png       ← from Elements/Marker Navigation-1.png
    marker-navigation-2.png       ← from Elements/Marker Navigation-2.png
    marker-navigation-3.png       ← from Elements/Marker Navigation-3.png
    marker-navigation-4.png       ← from Elements/Marker Navigation-4.png
    marker-navigation-5.png       ← from Elements/Marker Navigation-5.png
    marker-navigation-6.png       ← from Elements/Marker Navigation-6.png
    marker-navigation-7.png       ← from Elements/Marker Navigation-7.png
    marker-navigation-8.png       ← from Elements/Marker Navigation-8.png
    marker-navigation-9.png       ← from Elements/Marker Navigation-9.png

theme/
  goRide.ts                       ← React Native theme tokens generated from GoRide.css (reference source only, no component hardcoding)
```

Reference-only source file (not runtime asset):
- D:/My Projects/Current Project/Ride/App Design/GoRide - Ride-Hailing App UI Kit (Preview)/GoRide.css

### `app/(main)/` — Chat screens (rider + driver)

```
app/(main)/
  (customer)/
    chat.tsx                     ← Rider chat screen (imports shared ChatScreen.tsx component)
  (rider)/
    chat.tsx                     ← Driver chat screen (imports shared ChatScreen.tsx component)
```

Both chat routes use the shared `components/ChatScreen.tsx` component.

### `app/(admin)/` — NEW: Admin web panel (web-only route group)

```
app/(admin)/
  _layout.tsx                     ← Web-only layout; checks users.role='admin'; redirects non-admin
  index.tsx                       ← Redirect → /admin/queue
  queue.tsx                       ← Driver approval queue
  queue/[driverId].tsx            ← Driver detail drawer (renders inside queue.tsx as sheet)
  packages.tsx                    ← Package management (list + create/edit)
  zones.tsx                       ← Zone polygon map + pricing table
  monitoring.tsx                  ← Queue depth widget, call deduction error rate
```

### `app/api/` — New API route files

```
app/api/
  auth/
    start-verification+api.ts   ← POST proxy to supabase.auth.signInWithOtp (rate limit 5/phone/10min)
    verify-token+api.ts         ← Verify Supabase JWT → check user record exists
    logout+api.ts               ← POST sign out from Supabase session
  app-config+api.ts             ← GET public: returns min_app_version, latest_version, apk_download_url
  package/
    list+api.ts                 ← GET active packages
    purchase+api.ts             ← POST initiate purchase (returns payment URL)
    active+api.ts               ← GET driver's active subscription (polled after payment)
  payment/
    bkash/
      callback+api.ts           ← POST bKash payment callback (webhook)
    nagad/
      callback+api.ts           ← POST Nagad payment callback (webhook)
  call-ledger/
    index+api.ts                ← GET driver call transaction history
  driver/
    document/
      upload-confirm+api.ts       ← POST confirm Supabase Storage upload → create document record
    documents/
      submit+api.ts             ← POST finalize document submission, triggers admin review
    profile+api.ts              ← POST update driver profile (address, license)
    me+api.ts                   ← GET driver profile; PATCH update driver preferences (min_per_km_bdt validated against platform_config slider bounds)
    slider-config+api.ts        ← GET returns slider bounds for min_per_km_bdt from platform_config (lower_bound, upper_bound, min_ratio, max_ratio)
    missed-requests+api.ts      ← GET driver's missed dispatch requests (7-day history, includes filtered outcome rows)
    pricing-reference+api.ts    ← GET returns active pricing row for driver's vehicle type (deprecated in favour of slider-config+api.ts for bound queries)
    vehicle-type-change+api.ts  ← POST driver requests vehicle type change (7-day cooling-off after approval)
    owner-consent/
      submit+api.ts             ← POST submit owner consent with scan copy (replaces old initiate/verify OTP flow)
    status+api.ts               ← POST driver go-online/go-offline toggle (body: {"online": true/false})
  reference/
    vehicle-types+api.ts        ← GET returns vehicle type data for registration dropdowns
    registration-areas+api.ts   ← GET returns BRTA registration area data
    vehicle-class-letters+api.ts ← GET returns BRTA vehicle class letter data
  vehicle/
    register+api.ts             ← POST register vehicle for authenticated driver
  admin/
    queue+api.ts                ← GET pending driver queue
    driver-economics+api.ts    ← GET driver economics dashboard (negative earners, cost-per-ride)
    dispatch-toggle+api.ts     ← POST hot-toggle dispatch paused/resume (system_config)
    config+api.ts              ← GET+PATCH+POST platform_config keys: driver_min_ratio, driver_max_ratio, brta_max_*. Admin-only. Changes take effect immediately. (Single file exports GET, PATCH, and POST handlers.)
    package+api.ts              ← POST create new package
    package/
      [id]+api.ts             ← PATCH edit existing package (name, call_count, price, is_active)
    zone+api.ts                 ← POST create/update zone polygon
    pricing+api.ts              ← POST set per-vehicle pricing for a zone
    driver/
      approve+api.ts            ← POST approve driver (status pending → active/temporary)
      reject+api.ts             ← POST reject driver with reason
      activate+api.ts           ← POST activate temporary driver (status temporary → active, consent re-verified)
      suspend+api.ts            ← POST suspend driver with reason (status → suspended)
      downgrade+api.ts          ← POST admin downgrade driver vehicle type (immediate, with mandatory reason)
      type-change-approve+api.ts ← POST approve/reject driver vehicle type change request
      close-account+api.ts       ← POST /api/admin/driver/close-account — Admin-initiated account closure. Side effect: UPDATE documents SET purge_at=now()+90days WHERE driver_id=?
      upgrade+api.ts             ← POST /api/admin/driver/upgrade — Admin vehicle type upgrade (mirrors downgrade). Immediate, no cooling-off.
    dispatch-log/
      [rideId]+api.ts           ← GET dispatch log details for a specific ride
    payment-event/
      [id]/
        recover+api.ts          ← POST manual activation for paid payment_events stuck without subscription
    document/
      [id]/
        presigned-url+api.ts    ← GET time-limited Supabase Storage signed URL for admin document review
    ride/
      [id]/
        chat+api.ts             ← GET full chat log for a completed/active ride (admin export)
  ride/
    get-all+api.ts              ← GET all rides for authenticated user (replaces GlideX version)
    estimate+api.ts             ← GET pre-request fare estimate (query: origin, destination, vehicle_type)
    request+api.ts              ← POST create ride request (replaces ride/create); accept allow_downgrade boolean; returns 202+alternatives when no drivers found
    alternatives+api.ts         ← GET alternative vehicle types for a ride (query param ?ride_id=…). H3-based lookup.
    [id]/
      status+api.ts             ← GET ride status (polling during dispatch)
      contact+api.ts            ← GET contact info (masked/unmasked per status rules)
      cancel+api.ts             ← POST cancel ride
      start+api.ts              ← POST driver starts ride
      complete+api.ts           ← POST driver completes ride
      rate+api.ts               ← POST submit rating
      messages+api.ts           ← GET chat message history (paginated)
      message+api.ts            ← POST send chat message
```

### `lib/` — New utility modules (add to existing GlideX lib/)

```
lib/
  h3.ts                           ← H3 hex grid: findNearbyDrivers(), getH3Cell(), getH3Ring()
  env.ts                          ← Zod-based startup validation of all required env vars. Throws descriptive error on missing/invalid var. Called before any server handler initialises.
  fareCalc.ts                     ← calculateFare(pricing, distanceKm, rideTimeMin, ceilings?) → FareBreakdown. All arithmetic in integer paisa. Computes floor_fare = base + round(per_km × floor_length_km) + (floor_min × per_min_bdt); applies as hard floor. Logs BRTA ceiling warnings (never blocks). paisaToTaka() utility for display boundary only. **Distance source:** Google Maps Directions API (road distance). Fallback: Haversine × 1.3.
  zone.ts                         ← Point-in-polygon check: isInsideZone(lat, lng)
  auth.ts                         ← Supabase JWT verification middleware: supabase.auth.getUser(jwt). Replaces Clerk and Firebase token verification.
  logger.ts                        ← Structured logger (wraps console with level filtering)
  activateSubscription.ts          ← Shared subscription activation: INSERT subscriptions + INSERT call_ledger initial_load + redeem credit_voucher if applicable. **Idempotency check:** at the start of the transaction, read `payment_events.subscription_id`. If already non-null (activation already completed), return early without throwing. This prevents double-activation from concurrent `compensationWorker` and admin recovery calls.
  bkash.ts                        ← bKash Merchant API client: createPayment(), queryPayment()
  nagad.ts                        ← Nagad Merchant API client: initPayment(), verifyPayment()
  presignUrl.ts                   ← Generate Supabase Storage signed URLs for admin document review: supabase.storage.from('driver-documents').createSignedUrl(...)
  time.ts                         ← BDT midnight calculation (nextBdtMidnightUtc), ISO formatting helpers
  supabase.ts                     ← Supabase client initialization (client-side). Uses EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY. Exports `supabase` for supabase.auth.signInWithOtp() and session management.
  supabaseServer.ts               ← Supabase server admin initialization. Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Exports `supabaseAdmin` — bypasses RLS, used server-side only for user lookups and token verification.
  barikoi.ts                      ← Barikoi API client. Uses the `barikoiapis` npm package (not raw REST) to call Barikoi APIs (route overview, autocomplete, etc.) for typed responses and built-in error handling.
  vehicleTypes.ts                ← Vehicle type criteria constants (8 types with CC, AC, seats, age limits, driver requirements). Exports checkDriverEligibility(driver, vehicleType) for admin approval and vehicle registration validation. Also exports validateDriverMinKm(vehicleType, zonePerKmBdt, minPerKmBdt, minRatio, maxRatio) for slider-bound validation.
  referenceData.ts                ← Serves BRTA reference data (vehicle types, registration areas, class letters) for reference API endpoints
```

### `utils-server/` — New dispatch server modules (replace existing Express content)

```
utils-server/
  index.ts                        ← REPLACE: ws WebSocket server entry point. Maintains `offerLocks: Map<string, true>` keyed by 'rideId:driverId' to deduplicate concurrent fetch:confirm messages before they reach heartbeat.ts. **Startup recovery:** rebuilds H3 index from DB, re-offers stuck dispatching rides, replays compensation_queue table. (4) Recover scheduled rides: query rides WHERE `status='pending' AND scheduled_at IS NOT NULL AND scheduled_dispatched_at IS NULL AND scheduled_at BETWEEN now() AND now()+60min`. Register setInterval callbacks for each, as if the scheduler had detected them. Exposes HTTP `GET /health` endpoint for PaaS health checks.
  dispatch.ts                     ← ADD: batch broadcast, driver scoring, ride offer management. **Implementation note:** The unique index on `(ride_id, driver_id)` prevents re-offering the same ride to the same driver. The EXCLUSION FILTER (query dispatch_offers before scoring) ensures this case never reaches an INSERT attempt. The unique index is a safety net only.
  heartbeat.ts                    ← ADD: per-driver heartbeat, fetch:confirm window, call deduction
  smsGateway.ts                   ← ADD: FCM data message trigger for SMS fallback
  h3Index.ts                      ← ADD: in-memory H3 driver location index. Structure: Map<h3Cell, Map<vehicleType, Set<driverId>>>. `getDriversInCells(cells, vehicleType)` returns pre-filtered IDs. Refreshed from DB every H3_CACHE_TTL_SECONDS (default 30s).
  scheduler.ts                    ← ADD: cron jobs. (1) Scheduled ride dispatch: every 60s, query rides WHERE scheduled_at BETWEEN now()+60s AND now()+120s AND status='pending' AND scheduled_dispatched_at IS NULL (dispatches rides ~2 min early per AC-9), set scheduled_dispatched_at=now(), trigger dispatch. (2) Daily call reset: fallback midnight BDT reset for drivers not actively deducting. (3) Pro-rata credit: every 60s, process expired subscriptions per Flow 5 using total_deductions for unlimited packages. Uses `driver_online_sessions` table for online duration check. (4) Temporary activation expiry check: every 60s — set cap_override=0.50 for 48h grace, then status='suspended'. (5) Consent scan copy deadline check: every 60s, suspend drivers with expired temporary status who have not re-submitted consent scan copy. (6) used_challenges cleanup: every 60 minutes. (7) Document purge: daily. For each documents row WHERE `purge_at < now() AND storage_url IS NOT NULL`: call Firebase Storage `deleteObject(storage_url)`. Then `UPDATE documents SET storage_url=NULL WHERE purge_at < now()`. Do NOT delete the documents DB row - it is retained indefinitely per no-hard-delete rule. (8) Chat message retention: daily, DELETE FROM chat_messages WHERE created_at < now() - interval '30 days'. (9) Subscription expiry: every 60s, emit subscription:expired to online drivers whose subscription expired, deferred if driver has active ride. Maximum defer: 2 hours. (10) callback_pending recovery: every 10 minutes, query payment_events WHERE status='callback_pending' AND initiated_at < now()-10min, call provider verification API, activate if paid. (11) Rate limits cleanup: every 60 minutes, DELETE FROM rate_limits WHERE window_start < now() - interval '1 hour'. (12) Stale rides (driver not arriving): every 60s, auto-cancel rides WHERE status='driver_arriving' AND matched_at < now() - interval '30 min' (driver_no_show). (13) Credit voucher expiry: daily, UPDATE credit_vouchers SET status='expired' WHERE expires_at < now() AND status='active'. (14) Stuck in-progress rides: every 60s, auto-cancel rides WHERE status='in_progress' AND started_at < now() - interval '4 hours' (cancelled_by='system').
  compensationWorker.ts           ← ADD: processes compensation_queue **DB table** (not in-memory array) every 30s. Queries `compensation_queue WHERE status='pending' AND next_retry_at <= now()`. On success: sets `status='completed'`. After max_attempts: sets `status='failed'`, triggers admin alert.
  package.json                    ← REPLACE: add ws, h3-js, @supabase/supabase-js, @neondatabase/serverless, drizzle-orm
```

### `store/` — New Zustand stores (add to existing GlideX stores)

```
store/
  usePackageStore.ts              ← Active subscription state, calls_remaining, expiry
  useCallLedgerStore.ts           ← Last N ledger transactions, real-time balance
  useDriverStatusStore.ts         ← drivers.status, is_online toggle state
  useChatStore.ts                 ← Chat messages state, typing indicator, WebSocket chat:message listener
```

### `components/` — New components (GlideX components kept as-is)

```
components/
  PaymentWebView.tsx              ← Replaces Payment.tsx; wraps react-native-webview for bKash/Nagad
  CallWalletCard.tsx              ← Driver home wallet card (balance, expiry, today's usage)
  RideOfferSheet.tsx              ← Bottom sheet for incoming ride offer + 15s countdown
  FareBreakdownSheet.tsx          ← Rider fare estimate display before confirm
  AlternativesSheet.tsx          ← Rider bottom sheet: shows alternative vehicle types when no drivers of requested type available
  MinRateSlider.tsx               ← Driver settings: slider for personal minimum per-km rate (70%-150% of system rate)
  ChatScreen.tsx                  ← GiftedChat wrapper for rider-driver in-app messaging (used in both route groups)
  DocumentUploadCard.tsx          ← Per-document upload UI with progress and retry
  CountdownRing.tsx               ← Animated SVG ring countdown (used in RideOfferSheet)
  DriverStatusBadge.tsx           ← Displays driver status with human-readable label
  AdminDocumentViewer.tsx         ← Web-only: presigned URL image viewer with expiry refresh
```

### `scripts/` — New scripts

```
scripts/
  seed-admin.js                   ← Creates admin user record for local dev (uses SEED_ADMIN_PHONE)
  seed-system-config.js           ← Creates initial system_config rows (dispatch_paused=false, min_app_version=1.0.0)
  seed-platform-config.js         ← Seeds platform_config table with 6 keys (driver_min_ratio, driver_max_ratio, brta_max_*, zone_multi_active_enabled). Safe to re-run (ON CONFLICT DO NOTHING).
  seed-pricing.js                 ← Seeds pricing table with 8 vehicle type rows, production fare matrix (paisa). Uses ON CONFLICT...DO UPDATE.
  seed-packages.js                ← Inserts initial micro-trial and starter packages into `packages` table. Safe to re-run (ON CONFLICT DO NOTHING).
  generate-env-example.js         ← Generates .env.example and utils-server/.env.example from 11-ENV-VARS.md
  check-temporary-expiry.js        ← CLI tool for manual scheduler triggers. Flags: `--mode` ('expiry', 'pro-rata', 'consent-deadline'), `--date` (ISO-8601, defaults to now), `--driver-id` (optional, target specific driver).
```

---

## Placement rules (Ride additions — GlideX rules still apply)

| File type | Goes in | Example |
|-----------|---------|---------|
| Supabase client utilities | `lib/` | `lib/auth.ts`, `lib/presignUrl.ts`, `lib/supabase.ts` |
| Payment provider clients | `lib/` | `lib/bkash.ts`, `lib/nagad.ts` |
| H3 geo utilities | `lib/h3.ts` only | No other file imports `h3-js` directly |
| Call deduction logic | `utils-server/heartbeat.ts` only | No other file writes to `call_ledger` |
| Non-deduction call_ledger writes | `lib/activateSubscription.ts` only | Initial_load, credit, expiry_writeoff events. Callable from Expo API routes and utils-server |
| WebSocket event handlers | `utils-server/dispatch.ts` | Not in Expo API routes |
| Cron/scheduled jobs | `utils-server/scheduler.ts` | Not in Expo API routes |
| Admin-only screens | `app/(admin)/` | Web-only; platform-guarded in layout |
| Owner consent writes | `app/api/driver/owner-consent/submit` | Document-based (scan copy), not OTP. Not in utils-server |
| Online session writes | `app/api/driver/status` (Expo API) + `utils-server` (WebSocket disconnect) | driver_online_sessions table |
| system_config reads | `utils-server/dispatch.ts` (dispatch_paused) + `app/api/app-config+api.ts` (min_app_version) | DB-based runtime config |
| platform_config reads | `app/api/driver/slider-config`, `app/api/driver/me` (PATCH), `lib/fareCalc.ts` callers | Never cache — read at request time so admin changes take effect immediately |
| Fare arithmetic | `lib/fareCalc.ts` only | All amounts in integer paisa; `Math.round` after each multiplication; `paisaToTaka()` only at UI boundary |
| Slider bound validation | `lib/validateMinPerKm.ts` (pure function) | Called by PATCH /api/driver/me before any DB write. Never inline the validation logic. |
| Alternatives lookup | `app/api/ride/[id]/alternatives+api.ts` | Reads H3 index via `utils-server/h3Index.ts`. MVP: co-located process. |
| Vehicle type criteria constants | `lib/vehicleTypes.ts` only | Imported by admin approval, vehicle registration, and dispatch. Single source of truth for 8-type criteria. |
| Vehicle type change audit | `app/api/admin/driver/downgrade` + `app/api/driver/vehicle-type-change` | Writes to vehicle_type_changes table |

## What must never happen

- Payment credentials in any `EXPO_PUBLIC_*` variable or client-side code.
- `h3-js` imported directly in any file other than `lib/h3.ts` and `utils-server/h3Index.ts`.
- `call_ledger` writes in any file except `utils-server/heartbeat.ts`.
- Admin route files inside `app/(main)/` — admin lives in `app/(admin)/` only.
- Any Clerk or Stripe import anywhere in the codebase.
- Floating-point division on fare amounts — all arithmetic stays in integer paisa until `paisaToTaka()` at the UI boundary.
- Slider bound validation logic duplicated outside `lib/validateMinPerKm.ts` — call the pure function, do not inline.
- `platform_config` values cached in module-level variables — always read from DB at request time.
- `app/api/admin/config+api.ts` accepting keys not in `ALLOWED_KEYS` — unknown keys must return 400.
