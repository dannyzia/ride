<!--
AI INSTRUCTIONS
===============
Base codebase: Ride (D:\My Projects\Current Project\Ride)
This file describes the TARGET architecture after modification. It is NOT a from-scratch design.
Before reading this file: understand GlideX's existing structure (Expo Router, app/api/, socket/, store/, components/).
When you see "KEEP" — do not touch that part of GlideX.
When you see "REPLACE" — remove the GlideX implementation and substitute as described.
When you see "ADD" — this does not exist in GlideX; build it new.
When you see "DELETE" — remove entirely from GlideX; it has no equivalent in Ride.
-->

# Architecture: Ride

> Subscription-based ride lead distribution platform for Bangladesh.
> Drivers pay upfront for call packages and keep the fare minus any applicable platform commission (currently 0% by default). NOT a commission marketplace.
> Base: GlideX modified. Business model, auth, payments, and dispatch logic are all replaced or extended.

---

## What changes from GlideX — overview

| Layer | GlideX | Ride (target) |
|-------|--------|---------------|
| Auth | Clerk (email/social) | REPLACE → Supabase Auth phone OTP (dprelay SMS gateway) |
| Payments | Stripe | REPLACE → PortPos unified payment gateway (bKash, Nagad, Rocket, cards) |
| Driver monetisation | Per-ride fare collection | REPLACE → Subscription call-package wallet; calls deducted per app-level fetch |
| Geo matching | None (Stripe/Clerk focused) | ADD → H3 hexagonal indexing, weighted driver scoring |
| Real-time | WebSocket (exists in socket/) | EXTEND → add heartbeat-gated call deduction, SMS fallback, batch broadcast |
| Admin | None | ADD → Admin web panel (protected route group or separate React app) |
| Database schema | users, drivers, rides (thin) | EXTEND → add packages, call_ledger, subscriptions, documents, zones columns, wallets, points, referrals, sos_alerts. Ratings stored directly on `rides` table (`rider_rating`, `driver_rating` columns) — no separate `ratings` table. |
| Notifications | Expo Notifications (push) | KEEP + EXTEND → Expo Push primary; optional Supabase Edge Function for wake-up push |
| Storage | Firebase Storage (exists) | REPLACE → Supabase Storage for driver document uploads |

---

## Component map

### Design System (GoRide)
- Source of truth for UI styling: D:/My Projects/Current Project/Ride/App Design/GoRide - Ride-Hailing App UI Kit (Preview)/GoRide.css
- All app components must consume theme tokens generated from the GoRide CSS into theme/goRide.ts.
- Component logic, API behavior, and domain state machines are unchanged by this visual-system adoption.

### KEEP (no structural change)
- `app/(main)/(customer)/` — Rider screens. Rename "customer" → "rider" in display labels only; route group name stays.
- `app/(main)/(rider)/` — Driver screens. GlideX names this "rider" for the driver role; keep the folder name, change screen content.
- `components/` — Keep all GlideX components; extend, do not rewrite unless a component is Clerk/Stripe-coupled.
- `store/index.ts` — Keep all Zustand stores. Add new stores: `usePackageStore`, `useCallLedgerStore`, `useDriverStatusStore`, `useChatStore`.
- `lib/` — Keep existing utilities. Add `lib/h3.ts`, `lib/fareCalc.ts`, `lib/zone.ts`.
- `assets/` — KEEP.
- `socket/` — KEEP WebSocket client logic; server-side logic in `utils-server/` is REPLACED.
- Supabase Storage — driver document uploads. Bucket: `driver-documents`.

### REPLACE (same location, different implementation)
- `app/(auth)/` — Remove all Clerk screens. Replace with phone-entry → OTP verification screens using Supabase Auth phone OTP.
- `app/api/login+api.ts` — Remove Clerk login. Replace with Supabase JWT verification middleware.
- `app/api/register+api.ts` — Remove Clerk registration. Replace with phone-verified user creation.
- `app/api/create-payment+api.ts` — Remove Stripe. Replace with bKash/Nagad initiation endpoint.
- `app/api/ride/create+api.ts` — Extend with zone validation, upfront fare breakdown, scheduled ride logic.
- `utils-server/` — Replace Express server. New server handles: WebSocket dispatch, heartbeat-gated call deduction, FCM fallback, compensation retry queue, chat message relay (`chat:message`, `chat:typing` events).

### DELETE (remove from GlideX entirely)
- All Clerk SDK imports (`@clerk/clerk-expo`, `@clerk/express`).
- All Stripe SDK imports (`@stripe/stripe-react-native`, `stripe`).
- `app/api/send-email+api.ts` — email notifications out of scope for MVP.
- `components/OAuth.tsx` — social auth removed.
- `components/Payment.tsx` — Stripe payment sheet removed; replaced by bKash/Nagad WebView flow.
- `resend` package — removed.

### ADD (net-new, does not exist in GlideX)
- `app/(admin)/` — Admin web panel route group: approval queue, KYC review, package management, zone config, pricing, heatmap.
- `app/api/package/` — Package CRUD, purchase initiation, activation, idempotency.
- `app/api/call-ledger/` — Call balance query, deduction audit log.
- `app/api/document/` — Driver document upload confirmation, admin review endpoints.
- `app/api/admin/` — Admin-scoped endpoints: driver approval, rejection, escalation, zone write, promo CRUD, incentive CRUD, preference CRUD, referral campaign CRUD, point offer CRUD, vehicle model CRUD.
- `app/api/driver/owner-consent/` — Owner consent scan-copy submission (Step 3). Creates `owner_consents` rows. No OTP.
- `app/api/payment/portpos+api.ts` — PortPos payment callback + verification. Initiation is handled by `POST /api/package/purchase` with `{provider: 'portpos'}`.
- `app/api/payment/bkash+api.ts` — bKash callback (inert fallback, not active).
- `app/api/payment/nagad+api.ts` — Nagad callback (inert fallback, not active).
- `app/api/auth/start-verification+api.ts` — Server-side proxy to `supabase.auth.signInWithOtp({ phone })`. Enforces rate limiting before calling Supabase.
- `app/api/ride/request+api.ts` — REPLACES GlideX ride/create. Adds zone check, fare breakdown, rate limiting.
- `lib/h3.ts` — H3 hex grid indexing: `findNearbyDrivers(lat, lng, ringSteps, vehicleType)` returns pre-filtered driver IDs from h3Index by cell+vehicleType. `getH3Cell(lat, lng, res)`. `getH3Ring(cell, ringSteps)`.
- `lib/auth.ts` — Supabase JWT verification middleware (`supabase.auth.getUser(jwt)`). Replaces Clerk and Firebase token verification.
- `lib/fareCalc.ts` — Fare breakdown: base + per-km distance charge + per-min time charge. **Formula:** `distance_charge = round(per_km_bdt × distance_km)`; `time_charge = ride_time_min × per_min_bdt`; `computed_total = base_fare_bdt + distance_charge + time_charge`; `floor_fare = base_fare_bdt + round(per_km_bdt × floor_length_km) + (floor_min × per_min_bdt)`; `final_fare = max(computed_total, floor_fare)`. **Timer:** Free waiting is a platform-wide constant (60 seconds, from `system_config.max_free_wait_seconds`). At ride completion, `timer_start = min(arrived_at + 60_000, started_at)` (whichever comes first); `ride_time_min = CEIL((completed_at − timer_start) / 60_000)`. At estimation time, `ride_time_min = 0`. **Auto-start:** When `driver_arrived` is set, the scheduler starts a 60-second timer. On expiry, if status is still `driver_arrived`, the server auto-sets `started_at = arrived_at + 60s` and `status = 'in_progress'`. **Commission:** `platform_fee = round(final_fare × pricing.platform_commission_percent / 100)`; `driver_net = final_fare − platform_fee`. Writes `rides.platform_commission_bdt` as driver liability (no automated collection in MVP). Post-MVP: `platform_commission_bdt` will be aggregated per driver and deducted from their call-wallet balance or subtracted at subscription renewal. In MVP, admin can query total outstanding via `SELECT SUM(platform_commission_bdt) FROM rides WHERE driver_id=? AND status='completed'`. **Fare ceiling:** Logs a warning if calculated fare exceeds BRTA reference values stored in `platform_config` (`brta_max_per_km_bdt`, `brta_max_base_bdt`) or the per-ride ceiling in `system_config` (`brta_fare_ceiling_bdt`). Does not block the ride; admin must adjust pricing.
- `lib/vehicleTypes.ts` — Vehicle type criteria constants (8 types with CC range, AC, seats, age limits, license requirements, driver requirements). Exports `checkDriverEligibility(driver, vehicleType)` used by admin approval and vehicle registration. Called by `POST /api/vehicle/register`, admin approval screen, and `utils-server/dispatch.ts` (filters ineligible `car_premium`/`car_xl` drivers).
- `lib/zone.ts` — Point-in-polygon check for active zone.
- `lib/activateSubscription.ts` — Idempotent subscription activation transaction. Called by payment callbacks and compensationWorker. Compensation retries are persisted via the `compensation_queue` DB table — no in-memory queue. **Idempotency check:** at the start of the transaction, read `payment_events.subscription_id`. If already non-null (activation already completed), return early without throwing. This prevents double-activation from concurrent `compensationWorker` and admin recovery calls.
- `lib/portpos.ts` — PortPos unified payment gateway API client (bKash, Nagad, Rocket, cards). Primary payment integration.
- `lib/bkash.ts`, `lib/nagad.ts` — Payment provider API clients (inert fallback, not active).
- `lib/presignUrl.ts` — Supabase Storage signed URLs for admin document review (`supabase.storage.from('driver-documents').createSignedUrl(...)`).
- `lib/time.ts` — BDT midnight calculation (nextBdtMidnightUtc), ISO formatting.
- `lib/logger.ts` — Structured logger (wraps console, respects LOG_LEVEL).
- `lib/walletService.ts` — Wallet transaction helpers: createDriverWalletTransaction(), createRiderWalletTransaction(). All wallet writes go through this module to ensure balance_after snapshots are consistent. Used by POST /api/ride/:id/complete, referral reward, and points redemption.
- `lib/pointsService.ts` — Points calculation and award helpers: awardRidePoints(riderId, riderPayableBdt, rideId), awardCommissionPoints(driverId, commissionBdt, rideId). Called from POST /api/ride/:id/complete within the same transaction.
- `lib/referralService.ts` — Referral validation and reward helpers: validateReferralCode(), applyReferralReward(). Called from POST /api/referral/apply and POST /api/ride/:id/complete.
- `lib/smsService.ts` — SMS dispatch for SOS alerts. Sends via configured SMS gateway. Reads sos_police_number and sos_ride_number from system_config at runtime. Never hardcodes phone numbers.
- `lib/faceMatch.ts` — Pluggable face-match interface for comparing driver selfie against licence photo. Exports `compareFaces(driverPhotoUrl: string, licencePhotoUrl: string): Promise<{ score: number, status: 'matched' | 'low_confidence' | 'failed' }>` and `getFaceMatchMinScore(): Promise<number>`. Vendor implementation is injected at runtime (MVP: stub returning `not_applicable`; production: AWS Rekognition or similar). Called by `POST /api/driver/document/upload-confirm` when `doc_type='driver_photo'`.
- `components/PaymentWebView.tsx` — REPLACES Payment.tsx; PortPos WebView checkout.
- `components/RideOfferSheet.tsx`, `CallWalletCard.tsx`, `FareBreakdownSheet.tsx`, `CountdownRing.tsx`, `DriverStatusBadge.tsx`, `AdminDocumentViewer.tsx`, `DocumentUploadCard.tsx`, `SOSModal.tsx`, `WalletCard.tsx`, `ReferralShareCard.tsx`, `PointsBalanceCard.tsx` — See 08-UI-SPEC.md for screen mappings.
- `store/usePackageStore.ts`, `useCallLedgerStore.ts`, `useDriverStatusStore.ts`, `useWalletStore.ts`, `useReferralStore.ts`, `usePointsStore.ts` — Zustand stores for subscription, wallet, referral, and points state.
- `utils-server/` — REPLACED internals: dispatch.ts, heartbeat.ts, smsGateway.ts, h3Index.ts, scheduler.ts, compensationWorker.ts — See 12-FOLDER-STRUCTURE.md for complete listing.
- `src/db/schema.ts` — EXTEND existing schema. See 05-DATA-MODEL.md for all new tables.

- `scripts/seed-admin.js` — Creates admin user for local dev.

> **Complete file listing:** See 12-FOLDER-STRUCTURE.md for every new file path. This section lists architecturally significant additions only.

---

## Request lifecycle: ride request (full path)

```
Rider app
  → POST /api/ride/request  [JWT: Supabase JWT in Authorization header]
  → lib/auth.ts: supabase.auth.getUser(jwt)  [401 if invalid]
  → lib/zone.ts: isInsideZone(pickup)  [422 if outside operational zone]
  → lib/fareCalc.ts: computeBreakdown()
      → **Distance source:** Google Maps Directions API (road distance in km) between pickup and dropoff.
        Uses server-side `GOOGLE_MAPS_SERVER_API_KEY` (never exposed to client).
        Fallback if API unavailable or over quota: Haversine straight-line distance × 1.3 (urban Dhaka road factor).
      → Applies formula: `distance_charge = round(per_km_bdt × distance_km)`; at request time `ride_time_min = 0` (timer not started); `computed_total = base_fare_bdt + distance_charge`; `floor_fare = base_fare_bdt + round(per_km_bdt × floor_length_km) + (floor_min × per_min_bdt)`; `final_fare = max(computed_total, floor_fare)`
      → BRTA ceiling check (three-tier): (1) check `pricing.brta_fare_ceiling_bdt` for the ride's vehicle type; if NULL, (2) fallback to `system_config.brta_fare_ceiling_bdt`; if also NULL or '0', (3) skip ceiling check entirely. Logs a warning if fare exceeds the resolved ceiling (does not block the ride; admin must adjust pricing).
      → Returns {base_fare_bdt, distance_charge_bdt, time_charge_bdt, total_bdt, floor_fare_bdt, distance_km}
      → **Note:** `floor_fare_bdt` is a computed-only value (not stored in `fare_breakdown` jsonb). `time_charge_bdt = 0` at request time; recomputed with actual `ride_time_min` at ride completion.
      → **Note:** Distance for fare uses Google Maps Directions API (accurate route). ETA for `rides.eta_minutes` uses Google Maps Distance Matrix API (faster, no route details needed). Both use `GOOGLE_MAPS_SERVER_API_KEY`.
  → DB: INSERT rides (status=pending, fare_breakdown=jsonb)
  → internal HTTP: notify WebSocket server of new ride ID

WebSocket server (utils-server/)
  → STARTUP CHECK: If more than one instance is detected (e.g., via advisory lock on DB or env `INSTANCE_COUNT != '1'`), throw at startup to prevent split-brain dispatch.
  → CHECK: Is dispatch paused? Read `system_config` table WHERE `key = 'dispatch_paused'`. If value = 'true': log warning, do not broadcast, return immediately. Ride stays in 'dispatching' status. (Env var `DISPATCH_PAUSED` checked at startup as fallback; DB value is the runtime source — allows hot toggle via `POST /api/admin/dispatch-toggle` without restart.)

  **`system_config` initial seed rows:**

  | key | value | description |
  |-----|-------|-------------|
  | `dispatch_paused` | `false` | Hot toggle to pause all dispatch without restart |
  | `max_free_wait_seconds` | `60` | Platform-wide free wait constant; auto-start timer and `timer_start` computation at ride completion |
  | `brta_fare_ceiling_bdt` | (value TBD — set by admin) | Current BRTA government taxi fare ceiling for reference |

  > **Driver slider ratios and BRTA per-km/base ceiling values are in `platform_config`, not `system_config`.** See 05-DATA-MODEL.md § platform_config for seed rows.

  → lib/h3.ts: findNearbyDrivers()  [H3 cell + ring expansion]
  → H3 INDEX STRUCTURE: h3Index.ts stores Map<h3Cell, Map<vehicleType, Set<driverId>>>. `getDriversInCells(cells, vehicleType)` returns pre-filtered driver IDs without a DB round-trip. Updated on every heartbeat and DB refresh cycle.
  → VEHICLE TYPE FILTER: Only include drivers whose drivers.vehicle_type matches the ride's vehicle_type. Applied via H3 index vehicleType key — no DB query needed.
  → EXCLUSION FILTER: Before scoring, exclude any driver whose driver_id already appears in dispatch_offers for this ride_id (regardless of outcome). Query: SELECT driver_id FROM dispatch_offers WHERE ride_id=? Run this once per batch and subtract from the candidate pool before H3 scoring. Do NOT attempt an INSERT that will fail the unique constraint as a deduplication strategy.
  → DAILY CAP FILTER (unlimited packages only): Also exclude drivers whose active subscription has daily_calls_used >= packages.daily_cap. This check is performed by joining subscriptions to packages during the candidate pool query. A driver at cap is treated as 'unavailable' for dispatch purposes until midnight BDT reset.
  → MIN_PER_KM FILTER: Exclude drivers whose min_per_km_bdt is set and exceeds the active pricing row's per_km_bdt for their vehicle type. Query joins: WHERE drivers.min_per_km_bdt IS NULL OR pricing.per_km_bdt >= drivers.min_per_km_bdt. This filter runs after the vehicle type filter and before scoring.
  → score drivers: distance(40%) + rating(30%) + acceptance_rate(20%) + availability_bonus(10%)
  → Acceptance Rate Calculation:
    - Formula: **Lifetime average** — total accepted / total resolved offers (lifetime, not windowed).
    - acceptance_rate = (offers_accepted / offers_received) * 100
    - offers_received = count of dispatch_offers rows for this driver with outcome IN ('accepted', 'rejected', 'expired', 'refunded').
    - offers_accepted = count with outcome = 'accepted'.
    - Updated asynchronously after each offer outcome is resolved (not in the critical dispatch path).
    - Drivers with < 10 lifetime offers use 100.00 as default (insufficient data for meaningful rate).
  → Batch 1: emit ride:offer to top BATCH_SIZE drivers (default 5)
  → for each driver: INSERT dispatch_offers {ride_id, driver_id, batch_index, sent_at, outcome:'delivered'}
  → per driver: record sent_at in dispatch_offers. Server accepts fetch:confirm for this ride+driver if received within CALL_DEDUCTION_WINDOW_MS + CALL_DEDUCTION_GRACE_MS of sent_at.
    → OFFER LOCK: Before processing fetch:confirm, check in-memory `offerLocks: Map<'rideId:driverId', true>` in utils-server/index.ts. If lock exists, drop the duplicate message immediately (idempotent). Set lock on first fetch:confirm, clear after transaction completes or times out. This prevents the race condition where two concurrent fetch:confirm messages both pass the DB unique-constraint check before either INSERT commits.
    → driver app sends fetch:confirm (on first user interaction with offer card):
        → ATOMIC TX: INSERT call_ledger (deduction) + UPDATE dispatch_offers.fetch_confirmed_at = now()
        → For UNLIMITED subscriptions (calls_remaining = -1):
            - INSERT call_ledger: event_type='deduction', delta=-1, balance_after=-1
            - UPDATE subscriptions: daily_calls_used = CASE WHEN daily_reset_at <= now() THEN 1 ELSE daily_calls_used + 1 END, daily_reset_at = CASE WHEN daily_reset_at <= now() THEN nextBdtMidnightUtc() ELSE daily_reset_at END, total_deductions = total_deductions + 1
            - Do NOT UPDATE calls_remaining
        → For FINITE subscriptions (calls_remaining > 0):
            - INSERT call_ledger: delta=-1, balance_after=(calls_remaining - 1)
            - UPDATE subscriptions: calls_remaining = calls_remaining - 1, daily_calls_used = CASE WHEN daily_reset_at <= now() THEN 1 ELSE daily_calls_used + 1 END, daily_reset_at = CASE WHEN daily_reset_at <= now() THEN nextBdtMidnightUtc() ELSE daily_reset_at END, total_deductions = total_deductions + 1
        → NOTE: Daily reset embedded in deduction transaction eliminates the midnight cron race condition (TD-05). The separate daily reset cron remains as a fallback for drivers who are online but not receiving offers.
        → driver accepts within 15s → UPDATE dispatch_offers.outcome='accepted' → rides.status='matched'
        → emit ride:matched to rider, cancel all other offers for this ride
    → driver app does NOT send fetch:confirm within 5s (plus grace):
        → no ledger entry written; UPDATE dispatch_offers.outcome='expired'
        → trigger FCM data message fallback (SMS deep link)
    → fetch:confirm received but driver ignores offer for full 15s:
        → INSERT call_ledger {event_type='refund', delta=+1} + UPDATE dispatch_offers.outcome='refunded'
  → after 3 batches with no accept → rides.status='expired', emit ride:expired to rider (reason: 'no_drivers_available' if alternatives checked and none found, or 'timeout' for general expiry). See 06-API.md WebSocket events for ride:expired payload.

Scheduler (utils-server/scheduler.ts)
  → Every 60s: query `subscriptions WHERE expires_at < now() AND status='active'`
  → For each expired subscription:
    - UPDATE subscriptions SET status='expired'
    - Check if driver has active ride (rides.status IN ('matched','driver_arriving','driver_arrived','in_progress') AND driver_id = driver.id)
    - If active ride exists: defer — do NOT emit subscription:expired yet. Schedule re-check in 60s. **Maximum defer: 2 hours.** If subscription has been expired for > 2 hours regardless of ride state, force `status='expired'` and emit `subscription:expired`. The ride continues (driver sees navigation), but no new offers are dispatched.
    - If no active ride: emit `subscription:expired` via WebSocket to driver → server forces is_online=false.

---

## utils-server startup recovery

On crash or restart, the `utils-server` MUST perform the following recovery steps before accepting WebSocket connections:

```
1. Rebuild H3 index: query drivers WHERE is_online=true AND status IN ('active','temporary') → populate h3Index.
2. Recover stuck dispatches: query rides WHERE status='dispatching' AND created_at > now() - interval '5 min' → re-offer each ride through the dispatch pipeline (creates new batch, excludes drivers from existing dispatch_offers for these rides).
3. Replay compensation queue: no manual action needed — compensationWorker polls compensation_queue WHERE status='pending' AND next_retry_at <= now() continuously via setInterval. Pending rows created before the restart are automatically picked up on the next poll cycle. Do NOT enqueue in-memory; the DB table is the authoritative queue.
4. Recover scheduled rides: query rides WHERE `status='pending' AND scheduled_at IS NOT NULL AND scheduled_dispatched_at IS NULL AND scheduled_at BETWEEN now() AND now()+60min`. Register setInterval callbacks for each, as if the scheduler had detected them.
5. Clear stale offerLocks: since this is a fresh process, the in-memory Map starts empty. No cleanup needed.
6. Start accepting WebSocket connections.
```

PaaS health check: `utils-server` exposes `GET /health` (HTTP) returning `200 {"status":"ok","drivers_connected":0,"h3_index_age_ms":0}`. Configure Railway/Fly.io to hit this endpoint at the configurable health check interval (default 10 s, `HEALTH_CHECK_INTERVAL_MS`) and auto-restart on 3 consecutive failures.

---

## acceptance_rate update trigger

After each offer outcome is resolved (`accepted`, `rejected`, `expired`, `refunded`), fire an **async background update** to `drivers.acceptance_rate`:

```sql
UPDATE drivers SET
  acceptance_rate = (
    SELECT COALESCE(
      COUNT(*) FILTER (WHERE outcome = 'accepted') * 100.0 /
      NULLIF(COUNT(*) FILTER (WHERE outcome IN ('accepted','rejected','expired','refunded')), 0),
      100.00
    )
    FROM dispatch_offers WHERE driver_id = :driverId
  )
WHERE id = :driverId
```

This update is **NOT awaited** in the offer-processing critical path. It fires as a `.catch()`-guarded background promise. If it fails, the default 100.00 is used in the next dispatch cycle, and the next successful update corrects the value.

---

## Ride completion: rating and ride-count counters

On ride completion (`rides.status = 'completed'`): atomically increment `drivers.completed_rides_count` and update `drivers.rating_sum`/`drivers.rating_count`. The completed_rides_count is used by `checkDriverEligibility()` for car_premium (≥50 rides) and car_xl (≥25 rides) gate enforcement.

---

## WebSocket reconnection policy (driver)

If the driver's WebSocket connection drops during an active offer window:
- The server treats disconnection as **implicit rejection**: `dispatch_offers.outcome` is set to `'expired'` for any offers where `fetch_confirmed_at IS NULL AND responded_at IS NULL AND sent_at < now() - 5s`.
- The driver is excluded from further batches for this ride (already handled by the `dispatch_offers` unique constraint on `ride_id, driver_id`).
- On reconnect (`auth:hello`), the server does **NOT** re-deliver expired offers. The driver may receive new offers for new rides.
- If disconnection occurs during an active ride (`matched`/`driver_arriving`/`driver_arrived`/`in_progress`), the ride continues unaffected. `location:update` messages resume on reconnect.
- On disconnect: UPDATE `driver_online_sessions SET went_offline_at=now(), duration_minutes=EXTRACT(EPOCH FROM (now()-went_online_at))/60` WHERE the session row for this driver has `went_offline_at IS NULL`. Also UPDATE `drivers.is_online = false`.

---

## Stale ride timeout (driver not arriving)

If a ride stays in `driver_arriving` status for longer than the configurable `STALE_RIDE_TIMEOUT_MS` (default 30 minutes) after `matched_at` without progressing to `driver_arrived` or `in_progress`, auto-cancel it:
- `rides.status = 'cancelled'`, `cancelled_by = 'system'`, `cancel_reason = 'driver_no_show'`
- Notify both rider and driver via WebSocket `ride:cancelled`
- This prevents a stale ride from blocking a subscription expiry indefinitely

## Stale ride timeout (driver arrived but not starting)

If a ride stays in `driver_arrived` status for longer than the configurable `stale_arrived_timeout_minutes` (from `system_config`, default 15 minutes) after `arrived_at` without progressing to `in_progress`:
- `rides.status = 'cancelled'`, `cancelled_by = 'system'`, `cancel_reason = 'driver_no_show_after_arrival'`
- Notify both rider and driver via WebSocket `ride:cancelled`
- The `stale_arrived_timeout_minutes` value is admin-configurable via `system_config` (never hardcoded)

```

---

## Fallback Dispatch Logic (No Driver of Requested Type)

When the dispatch engine exhausts all configured batches (default `MAX_BATCH_COUNT` = 3) without finding a driver for the requested `vehicle_type`:

**Step 1 — Check alternatives:**
- Query H3 index for ALL vehicle types in the pickup cell and adjacent cells.

> **H3 alternatives query:** The H3 index structure is `Map<h3Cell, Map<vehicleType, Set<driverId>>>`. To find all available types, iterate the inner Map keys for the target cells. This is O(number_of_types) per cell — negligible at 8 types.

- For each vehicle type with ≥ 1 available driver, compute fare estimate using the active `pricing` row for that type + the ride's `distance_km`.
- Sort alternatives by: (1) closest vehicle category to requested (bike→bike, then car→car), (2) lowest fare.
- Return to rider app via WebSocket `ride:alternatives` event with `{ride_id, requested_vehicle_type, alternatives: [{vehicle_type, fare_breakdown, available_drivers}]}`.

**Step 2 — Rider selection:**
- Rider app shows alternatives sheet (see 08-UI-SPEC.md).
- Rider selects alternative → app calls `POST /api/ride/request` with the new vehicle type (same pickup/dropoff).
- Original ride is cancelled (`rides.status = 'no_drivers'`). New ride created with selected type.
- The `allow_downgrade: true` flag in the request body indicates rider consented to receiving alternatives.

**Step 3 — No alternatives:**
- If NO vehicle type has available drivers in the area → `rides.status = 'expired'` with standard expiry message.
- No `alternatives` array returned.

**MVP constraint:** The dispatch server does NOT auto-expand to lower tiers during batch retries. Alternatives are only shown AFTER all batches fail. The `allow_downgrade` flag defaults to `false` — the rider must explicitly opt in via the alternatives sheet.

---

## Request lifecycle: package purchase (PortPos — unified gateway)

PortPos is the single payment gateway aggregator. Its hosted checkout page supports bKash, Nagad, Rocket, Visa, Mastercard, and more. Users pick their preferred method on the PortPos page, not in the Ride app.

```
Driver app
  → POST /api/package/purchase  [{provider: 'portpos', package_id}, idempotency-key header required]
  → verify driver is approved and active
  → call PortPos API: createInvoice() with amount, reference (idempotency key), redirect URL, IPN URL
  → return PortPos hosted checkout URL to client → open in WebView

PortPos redirect callback (GET /api/payment/portpos/callback)
  → PortPos redirects user to callback URL with ?invoice=INVOICE_ID
  → verify invoice status via portposClient.getInvoice()
  → if ACCEPTED/COMPLETED: INSERT subscriptions row + INSERT call_ledger initial_load row (via lib/activateSubscription.ts)
  → if DB write fails: INSERT row into compensation_queue DB table → compensationWorker retries every 30s up to 10 times → admin alert if unresolved

PortPos IPN callback (POST /api/payment/portpos/callback)
  → PortPos sends { invoice, amount, status, reference } JSON body
  → validate via portposClient.verifyIPN()
  → same activation flow as redirect callback

Driver app polls GET /api/package/active every 3s until status=active
```

### Old payment callbacks (inert fallback)

The bKash and Nagad callback files (`app/api/payment/bkash/callback+api.ts`, `app/api/payment/nagad/callback+api.ts`) are kept on disk but are no longer the primary payment path. They serve as inert reference for future maintenance. All new purchases route through PortPos.

### ADR-018: PortPos as Single Payment Gateway Aggregator

**Decision:** Replace direct bKash, Nagad integrations with a single PortPos aggregation gateway.

**Rationale:**
- PortPos hosted checkout supports bKash, Nagad, Rocket, Visa, Mastercard, and more — no separate integrations needed
- Single callback/verification path reduces code complexity
- Payment method selection moves from app UI to PortPos page, removing app update dependency for new methods
- SSLCommerz/PortPos is widely adopted in Bangladesh, with established sandbox and production environments

**Supersedes:** ADR-002 (bKash/Nagad direct integration). The old bKash and Nagad callback files are kept as inert fallback.

**Env vars:** `PORTPOS_APP_KEY`, `PORTPOS_SECRET_KEY`, `PORTPOS_BASE_URL` (see 11-ENV-VARS.md)

---

## Auth lifecycle: Supabase Phone OTP

```
App (Driver or Rider)
  → collect phone (E.164 normalised)
  → call supabase.auth.signInWithOtp({ phone })
    → Supabase sends OTP SMS via dprelay (configured as external SMS gateway in Supabase dashboard)
    → App starts listening for SMS via Android SMS Retriever API
  
  → App auto-reads OTP from SMS OR user enters manually (after 20s timeout)
  → call supabase.auth.verifyOtp({ phone, token, type: 'sms' })
    → Supabase verifies OTP internally (replay protection built-in)
    → Returns JWT session on success
  
  → App calls POST /api/auth/verify-token with Supabase JWT
    → Server calls supabase.auth.getUser(jwt) to verify token
    → If user record exists in DB: return { user_id, role, exists: true }
    → If no user record: return { exists: false }
  
  → If user exists: navigate to role-appropriate home screen
  → If new user: navigate to register screen
    → Register screen: enter name, select role
    → Call POST /api/register with { name, role, vehicle_type? }
      Server extracts phone and uid from the Supabase JWT (already verified by middleware).
      In a single DB transaction: INSERT users row + (if role='driver') INSERT drivers row.
      If either INSERT fails, entire transaction rolls back (no orphan user/driver records).
      Returns 201. App navigates to role-appropriate home screen.
  
  → all subsequent API calls use Supabase JWT in Authorization header
    → Server verifies via supabase.auth.getUser(jwt) in lib/auth.ts middleware
```

---

## Security boundaries

| Boundary | Rule |
|----------|------|
| Supabase JWT verification | Every `/api/**` route. Middleware in `lib/auth.ts` calls `supabase.auth.getUser(jwt)`. No exceptions. |
| Call deduction writes | `utils-server/heartbeat.ts` only. No other module writes `event_type='deduction'` rows to `call_ledger`. Non-deduction writes (`initial_load`, `credit`, `expiry_writeoff`) use `lib/activateSubscription.ts` which is callable from both Expo API routes and utils-server. |
| Admin endpoints | `app/api/admin/**` — additional middleware checks `users.role = 'admin'` after token verification. |
| Driver documents | Supabase Storage bucket `driver-documents`: authenticated upload (any verified user); read restricted to uploader + admin role via presigned URLs. |
| dispatch_offers writes | Only `utils-server/dispatch.ts` and `utils-server/heartbeat.ts`. No other module writes to that table. |
| owner_consents writes | Expo API route only (`app/api/driver/owner-consent/submit`). Document-based (scan copy), not OTP. utils-server must not write to this table. |
| vehicle_type_changes writes | Admin API routes (`app/api/admin/driver/downgrade`) and driver API routes (`app/api/driver/vehicle-type-change`). utils-server scheduler applies cooling-off changes. |
| Phone masking | Driver phone not sent to rider until `rides.status = 'matched'`. Rider full phone never sent to driver. A masked form (`+880 1X-XXXX-789`) is provided via `GET /api/ride/:id/contact` during matched/active rides. |
| bKash/Nagad secrets | Server-side env vars only. Never in Expo client bundle. |
| Payment callback verification | bKash: HMAC-SHA256 checksum of callback fields using `BKASH_APP_SECRET`, compared to `x-api-signature` header. Nagad: JWT signature verification using `NAGAD_MERCHANT_PUBLIC_KEY`. Callback amount MUST match `payment_events.amount_bdt` or activation is rejected (H‑2). |
| Data region | Supabase project region: ap-southeast-1 (Singapore). Closest to Bangladesh. |

---

## Known risks (Ride-specific, beyond GlideX)

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Call deduction race: two servers deduct same call simultaneously | med | high | Atomic DB transaction + unique constraint `(ride_id, driver_id)` in `call_ledger` |
| bKash callback never arrives | med | high | 5-min timeout → auto-query bKash verifyPayment; compensation_queue table for persistent retry (TD-17) |
| SMS receiver fails on some Android OEMs (battery optimisation kills receiver) | high | med | Show manual OTP entry fallback; instruct user to disable battery optimisation |
| H3 index stale during H3 refresh interval (configurable `H3_REFRESH_INTERVAL_MS`, default 30 s) → suboptimal driver selection | med | low | Fallback to application-level Haversine scan (in `lib/h3.ts`, no PostGIS dependency); acceptable at MVP scale (single Dhaka zone) |
| Unlimited package abuse via device sharing | med | med | Device binding enforced server-side; OTP re-verify + configurable device-change cooldown (default 24 h) |
| Stale ride blocks subscription expiry | low | med | Configurable `STALE_RIDE_TIMEOUT_MS` (default 30 min) driver_arriving timeout → auto-cancel as `driver_no_show`; configurable `stale_arrived_timeout_minutes` (default 15 min from `system_config`) driver_arrived timeout → auto-cancel as `driver_no_show_after_arrival` (see stale ride timeout sections) |
| utils-server crash loses all in-memory state | med | high | Startup recovery procedure rebuilds H3 index, re-offers stuck dispatches, replays compensation queue from DB table (TD-15, TD-17) |
