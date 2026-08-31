# Ride — Full Feature Inventory
> v18 — 2026-08-31 03:48 UTC: Fleet universal model (portal + APIs + admin screens — MOSTLY UNCOMMITTED, see §3b). Fare Framework v6.4 Stage 0 (shadow mode) complete: zone fee (flat monthly schedule), zone recovery hysteresis, night multiplier, REV-4 per-tier rate derivation, fuel engine (per-bike-tier joma), zone fee explainer; scheduler 41→45 jobs. Admin RBAC (4 roles) wired into all 64 admin routes (migration 0047). GlobalActionButtons replaces FloatingNavMenu+SOSButton; SOS offline queue (lib/sosQueue.ts). Driver zombie-session force-end + silent background OTA. fare-gate-metrics admin screen. Tests relocated to root `tests/`.
> v17 — 2026-08-25: Ride Fare Framework v1 COMPLETE. Surge fully removed; sequential dispatch + debit-on-offer live; heat engine (zone_heat, Lever 0/1/2/3); pickup fee 3-state lifecycle (measurement live, charge gated by `pickup_fee_enabled`); fraud protocol (dawdle, off-platform, cancel-rate, heat manipulation); ~50 fare framework config keys; 4 new admin screens (fare-config, heat-monitor, pickup-analytics, trust-safety); new scheduler jobs 37–41.
> Core app + P4 Phases 1-3 + Multi-Stop + Tip + Trust & Quality + UI Rethink Plans 01–04 + Plan 05 (Waves 0–3 mostly in; Wave-4 driver leftovers — see §6/§9).
> Schema: ~106 tables, ~41 enums. Fare Framework v1 added: zone_heat, zone_heat_history, pickup_distance_samples, fraud_flags, zone_recalibration_queue, cancel_surveys. v6.4 Stage 0 added: zone_fee_schedule, zone_recovery_samples, trip_time_samples, config_audit_log, driver_online_sessions. Fleet model added: fleets, fleet_members, fleet_vehicle_assignments, fleet_subscription_plans, fleet_subscriptions, fleet_billing_transactions, fleet_alerts, audit_logs, fleet_integrations, integration_sync_jobs, external_entity_mappings. 205 API route files. Scheduler: 45 jobs.
> P5 Growth features (Gamification, Safety, AI Demand, Weather) — saved for post-launch.
>
> Minor caveats (non-blocking):
> - **Fleet portal + fleet/admin-fleet APIs + fleet libs are UNCOMMITTED** (working tree only; schema push `d99c089` is committed) — see §3b
> - **Fare Framework v6 is Stage 0 (shadow)**: v6 fares computed but NOT charged; rider-quoted fares still v2 (`fare_framework_stage='stage0'`); zone fee + night multiplier inert until enabled — see §4
> - SOS: config cooldown (`sos_cooldown_seconds`) still read but never time-applied server-side; client has a 5s debounce + offline queue (lib/sosQueue.ts); active-SOS polling still not implemented
> - rate-driver: driver_id fallback uses ride UUID if driver_id undefined (dormant)
> - driver lost-items: return_method uses z.string() instead of z.enum (admin route uses the proper enum)
> - Payment callback: purpose='rider_pass' + null pass_id edge case (both fields always set together)
> - Apply-promos screen sends `{code}` only; redeem API requires vehicle_type + pickup coords → 400 as written (contract mismatch)
> - Schedule overlap semantics implemented: `lib/scheduleUtils.ts` checkRideOverlap + `app/api/ride/schedule/overlap+api.ts` client-side check
> - Zone sentinel nil-UUID writes removed; callers map `zones_not_configured` → 503, `outside_zone` → 422
> - All 6 Plan-05 `platform_config` keys admin-settable via `PATCH /api/admin/config` with range validation; `zone_multi_active_enabled` seeded as false
> - 6 built-but-unwired shared components: ProgressBar, Badge, Avatar, CheckboxGroup, HeatmapOverlay, MinRateSlider
> - Driver earnings-goal UI REMOVED from tree (was YES at v13; earnings-tab rebuild dropped it) — regression, see §2 #15
> - Pickup fee Stage 1 (charge) gated by `pickup_fee_enabled` config — code complete, disabled until activated
> - Test files relocated from scattered `__tests__/` folders to root `tests/` mirror (uncommitted move)

---

## 1. Rider

| SL | Feature | Backend | Frontend | Wiring |
|----|---------|---------|----------|--------|
| **Auth & Onboarding** | | | | |
| 1 | Phone entry + role selector | YES | YES | YES |
| 2 | Send OTP (dpRelay / dev bypass `123456`) | YES | YES | YES |
| 3 | Verify OTP | YES | YES | YES |
| 4 | Registration (name + password) | YES | YES | YES — riders → enable-location → home; drivers → driver app |
| 5 | Login (phone + password) | YES | YES | YES |
| 6 | Forgot password | YES | YES | YES |
| 7 | Enable location permission | Missing (client-only screen) | YES | YES — rider onboarding chain, non-blocking |
| 8 | Push token registration | YES (`user/device`) | YES | YES — global in `_layout.tsx` on auth |
| **Home** | | | | |
| 9 | Map view (MapLibre + Barikoi) | Partial | YES | YES |
| 10 | Current location + reverse geocode | Partial | YES | YES |
| 11 | Recent rides list | YES | YES | YES |
| 12 | Search destination | YES | YES | YES — H-3 wired: BarikoiAutocomplete in home DESTINATION sheet; Saved places (GET `/api/rider/addresses`) + Recent (deduped completed-ride dropoffs, ≤5) tabs; Book Now hands off to confirm-ride (which POSTs `ride/request`) |
| 13 | Sign out | YES | YES | YES — `lib/authCleanup.ts` clears all 7 stores + tears down WS first |
| 14 | WebSocket ride updates | YES | YES | YES — rider session socket opened by services-hub via `lib/riderSocket.ts`; identity-tagged adoption + teardown on sign-out (H-1); all other screens use addEventListener only (WS singleton, L8) |
| 14a | Services Hub (post-auth 2x2 vehicle grid entry) | YES | YES | YES — riders land here after auth, NOT home (L12); draggable hamburger FAB menu, no bottom tab bar (L11); cash-only rides, wallet for passes/packages only (L13) |
| **Ride Request & Booking** | | | | |
| 15 | Destination autocomplete (Barikoi) | YES | YES | YES |
| 16 | Find ride (From/To + Use Current Location) | YES | YES | YES |
| 16a | Nearby driver markers on home map | YES (`POST /api/ride/nearby-markers` — UNCOMMITTED) | YES | YES — H3 K-ring (k=30) query returns nearby online drivers by vehicle type; home map renders markers |
| 17 | Ride estimate (8 vehicle types + heat tag + pass discount) | YES | YES | YES — heat score tags (hot/neutral/cold) replace surge; rider pass discount applied; `quote_valid_until` (5 min) on estimate response. No surge fields remain. |
| 18 | Vehicle selection (Bike Basic → Car XL) | YES | YES | YES |
| 19 | Promo code apply | YES | Partial | Partial — `lib/discountEngine.ts` + staged-promo server flow done (`promo/redeem` stages via `lib/promoCache.ts`, consumed in ride tx); **apply-promos screen contract bug**: sends `{code}` only while API requires vehicle_type + pickup coords → 400 |
| 20 | Ride preference chips | YES | YES | YES |
| 21 | Confirm ride + Request | YES | YES | YES |
| 22 | Scheduled ride (conditional endpoint + push reminder) | YES (`ride/schedule`) | YES | YES — "schedule for later" branches to `ride/schedule` (config-driven +30m/+7d bounds); `ride-scheduled` confirmation; `components/ScheduleRideSheet.tsx` (Dhaka tz, client bounds mirror, overlap poll tolerating missing endpoint); scheduler promotes to dispatch + T-60m/T-15m reminder push (idempotent) + cutoff cancellation. NOTE: schedule-ride + no-drivers-available routes are REFERENCED (FloatingNavMenu, finding-driver) — retained; scheduling-user-ride + schedule-ride-after-promo are true orphans |
| 23 | Book for someone else (toggle + name/phone + SMS) | YES | YES | YES — in confirm-ride; SMS via dpRelay sendSms (schedule-path validation still loose: no phone regex/self-phone/consent) |
| 24 | ~~Surge consent banner~~ | **REMOVED** | — | — | Surge fully removed from codebase. Heat score tags (hot/neutral/cold) replace surge multiplier; no rider consent banner needed. |
| 24a | Zone fee explainer (first-ride sheet) | YES (`POST /api/user/zone-fee-explained` — UNCOMMITTED) | YES | YES — `components/ZoneFeeExplainerSheet.tsx` shown once in confirm-ride; `users.zone_fee_explained` flag set on dismiss; Stage-0 explainer copy |
| 25 | Rider pass / ride pass (weekly/monthly discount) | YES (`rider/passes`) | YES | YES — PortPos purchase (PaymentWebView purpose='rider_pass'), pass discount in estimate (multi-leg), rides_used progress bar (rides_used/max_rides, unlimited fallback), auto-expiry, admin CRUD |
| 25a | Upfront tip (preset ৳0/20/50/100) | YES | YES | YES — slider in confirm-ride, tip badge in RideOfferSheet, added to driver payout (no commission) |
| 25b | Multi-stop rides (max 2 stops) | YES (`ride/[id]/stops`) | YES | YES — BarikoiAutocomplete stop inputs (confirm-ride owns stops — L14; home's dead stop inputs deleted, H-3), multi-leg distance in estimate, driver stop list + complete button, WS payload includes stops |
| **Ride Tracking** | | | | |
| 26 | Final page live tracking (WS) | YES | YES | YES |
| 27 | Status transitions (finding → completed) | YES | YES | YES |
| 28 | Driver marker + ETA | YES | YES | YES |
| 29 | Ride PIN display | YES | YES | YES — custom PinInput at arrived state, "share with driver" caption (M-22) |
| 30 | Driver info + vehicle | YES | YES | YES |
| 31 | In-progress banner | YES | YES | YES |
| 32 | Driver arrived indication | YES | YES | YES |
| 33 | Cancel ride (with reason + fee preview + countdown) | YES | YES | YES — cancel-preview returns FULL server contract: `fee_bdt` + `free_until` + `server_now` + `policy` + `ride_status` + `reason_required` (grace from fresh platform_config); countdown server-bound; cancel POST is atomic (status-guard in tx, 409 loser) + fee event via `lib/paymentEvents.ts` in-tx |
| 34 | Share trip (live tracking link) | YES (`ride/[id]/track`) | YES | YES — Share API (header + action buttons) on ride-tracking; track API terminal-state gated + `no-store`/`noindex` headers |
| 34a | Emergency SOS (screen + alert + dial 999) | YES (`POST /api/sos/alert`) | YES | YES — dial-999-first, confirm modal, double-submit guard; full lifecycle: GET `/api/sos/active`, POST `/api/sos/resolve` (creator-only), scheduler auto-resolves open alerts after 30 min (configurable), best-effort SMS to user_emergency_contacts (SOS-scoped hourly circuit breaker; OTP unaffected), push to user + admin, WS broadcast to admin dashboard (F-15). Screen-side offline retry + active-SOS polling not implemented |
| **Ride Completion** | | | | |
| 35 | Rate driver (1-5 stars) | YES | YES | YES |
| 36 | Add tip | YES | YES | YES — tip now INLINE in rate-driver (POSTs /rate then /tip, non-blocking); standalone add-tip screen orphaned (only dev FloatingNavMenu links it) |
| 37 | Ride completed confirmation | YES | YES | YES |
| **Activity & Wallet** | | | | |
| 38 | Rides history (filter: All/Completed/Scheduled/Canceled) | YES | YES | YES — filter chips + search bar + date-grouped SectionList (Dhaka tz) + Rebook handoff (coords → home) + 48h dispute gate; Inbox/Referral are NAVIGATION chips (arrow icons) |
| 39 | Ride detail (from history) | YES | YES | YES — fetches from API; route-polyline snapshot via lib/routeGeometry |
| 40 | Inbox (notifications) | YES | YES | YES — sample data ONLY on fetch-fail with "Using sample data" caption (never persisted); read-state persisted (AsyncStorage, pruned to 200); in-app deep links from notification payload |
| 41 | Referral (code + share) | YES | YES | YES — via filter row |
| 42 | Wallet balance + transactions | YES (`rider/wallet`) | YES | YES — fetches real data from API |
| 43 | Wallet top-up (PortPos WebView) | YES | YES | YES — (tabs)/settings/top-up → top-up-method (paisa body) → PaymentWebView → top-up-success; PaymentResultScreen auto-returns via `ride://` after 3s from PortPos hosted page (purpose label currently only on ride-pass) |
| 44 | Report issue | YES | YES | YES — screen exists |
| 45 | Loyalty points (balance + redeem) | YES (`rider/points`) | YES | YES — loyalty screen in settings hub, redeem with row-level lock |
| 46 | Lost items (report + track + driver respond) | YES (`rider/lost-items`) | YES | YES — report modal with ride selector, 24h window enforced (422), status badges, driver photo, settings hub |
| 47 | Fare dispute (file + auto/manual review) | YES (`rider/fare-disputes`) | YES | YES — dispute button gated 48h (server 422 + client hide), 5 reasons, claimed fare, advisory-lock tx, manual admin review |
| 48 | Block driver (prevent future matching) | YES (`rider/block`) | YES | YES — block/unblock toggle in rate-driver, dispatch filter skips blocked drivers |
| **Settings (via Profile → Settings hub)** | | | | |
| 49 | Profile view | YES | YES | YES |
| 50 | Edit personal info | YES | YES | YES |
| 51 | Notification preferences | YES | YES | YES |
| 52 | Emergency contacts (CRUD) | YES | YES | YES — `user_emergency_contacts` also feeds SOS SMS recipients |
| 53 | Saved addresses (CRUD) | YES | YES | YES |
| 54 | FAQ | YES | YES | YES |
| 55 | Contact support (ticket) | YES | YES | YES |
| 56 | Data & analytics controls | YES | YES | YES |
| 57 | Delete account | YES | YES | YES |
| 58 | Terms / Privacy | YES (inline content) | YES | YES — real content on 4 screens (rider + driver ToS/Privacy, "Last updated July 15 2026"); `lib/legalContent.ts` never created (plan artifact); owner legal-review status unconfirmed |
| 59 | App appearance (light/dark/system) | YES (`useAppearance` + AsyncStorage) | YES | YES — 'system' follows device; toggle cycles light↔dark only (L2); Pattern A `useIsDark()` theming with sun/moon toggle on every screen (dark: classes eliminated repo-wide) |
| 60 | App language (EN/BN) | Partial (i18n real) | Partial | YES — i18next system exists with REAL Bangla strings (`i18n/locales/bn/common.json`), imported globally; consumed by only 2 screens (cancel-reason, driver language); rider choice persisted via useAppearance, driver language screen switches i18n without persistence; full sweep pending |
| **Public** | | | | |
| 61 | Public ride tracking page (`/track/[rideId]`) | YES (`ride/[id]/track`) | YES | YES — no auth (root `_layout.tsx` exempts `track` — FIXED), 10s auto-refresh, error handling, terminal-state expiry + no-store/noindex headers |

---

## 2. Driver

> Tab bar with 5 tabs (Home / Earning / Activity / Wallet / Profile) at `(tabs)/_layout.tsx`.
> DriverStatusGuard wraps the Stack — pending/suspended/rejected drivers see status screens.
> Push token registered globally in `_layout.tsx`.

| SL | Feature | Backend | Frontend | Wiring |
|----|---------|---------|----------|--------|
| **Auth & Onboarding** | | | | |
| 1 | Phone entry + OTP (shared) | YES | YES | YES |
| 2 | Registration | YES | YES | YES — drivers → `/(main)/(rider)` (driver app) |
| 3 | Login (password) | YES | YES | YES |
| 4 | Upload documents + Owner consent | YES (`driver/documents`) | YES | YES — via DriverStatusGuard + consent persisted |
| 5 | Select active vehicle type | YES (`POST /api/driver/vehicle-type-change`) | YES | YES — eligibility-gated server-side (`eligibility_not_met` 422); auto-offline warning when online |
| 6 | Personal profile (name, photo, city) | YES | YES | YES — photo uploaded to Supabase Storage |
| **Home / Status** | | | | |
| 7 | DriverHome (map + WS + heartbeat) | YES | YES | YES — tab: Home; identity-checked WS adoption + module-level message-handler indirection (H-1); reconnect re-fetches session |
| 8 | Driver profile load (name from users JOIN) | YES | YES | YES — `me+api.ts` JOINs users table |
| 9 | Active subscription + wallet card | YES | YES | YES |
| 10 | Go Online / Go Offline | YES | YES | YES |
| 11 | Connected/Offline indicator | YES | YES | YES — live WS state chip + reconnecting banner |
| 12 | SOS button (alert + dialer) | YES (`POST /api/sos/alert`) | YES | YES — shared rider/driver SOS endpoint; inserts `sos_alerts`, SMS to user_emergency_contacts (SOS-scoped breaker), push, WS broadcast to admin dashboards, 30-min auto-resolve |
| 13 | Incentives (from Home gift icon) | YES | YES | YES — auth header fixed (was silent 401) |
| 14 | Break mode | YES | YES | YES — tab: Activity |
| 15 | Earnings goal progress bar | YES (`driver/earnings/breakdown` API remains) | **Missing (regression)** | **Missing** — goal UI/persistence ABSENT from tree (0 grep hits for goal code anywhere); was YES at v13, dropped in earnings-tab rebuild (af364075). Restore or formally drop |
| 15a | Hotspot map (demand/supply by zone) | YES (`driver/hotspots`) | YES | YES — GET `/api/driver/hotspots` joins surge_current × zones → demandPressure → 0..1 intensity; Map heat-styled circles (blur) + multiplier badges + legend + refresh + offline pause. NOTE: `demand_forecasts` NOW has a writer (lib/forecast.ts hourly upserts, scheduler job 34) but hotspots reads surge_current; HeatmapOverlay component built-but-unwired |
| **Ride Offers** | | | | |
| 16 | Ride Offer sheet (countdown, rider info, fare) | YES | YES | YES — Slide-to-Accept (SlideButton 64dp) + full-width Decline (≥56dp) below; tip badge; fetch:confirm handshake |
| 17 | Accept / Decline | YES | YES | YES |
| 18 | "Booked for" banner (secondary rider) | YES | YES | YES — shows name + phone when present |
| **In-Ride** | | | | |
| 19 | Find customer (slide to confirm arrival) | YES | YES | YES — route-line map overlay (Map origin/destination/route via `lib/routeGeometry.ts` Barikoi polyline; 30s throttle + ~25m move gate — M-10) |
| 20 | Enter Ride Pin + Start Ride | YES | YES | YES — custom `components/PinInput.tsx` (react-native-otp-entry removed — M-22) |
| 21 | Finish ride (slide to confirm drop-off) | YES | YES | YES |
| 22 | Ride completed modal | YES | YES | YES — includes "Rate Rider" button |
| 23 | In-ride chat (💬 button) | YES | YES | YES — both find-customer + finish-ride |
| 24 | Cancel ride (with reason) | YES | YES | YES — both find-customer + finish-ride |
| 25 | Turn-by-turn navigation (🗺️ button) | YES (`navigation/route`) | YES | YES — Barikoi directions + DriverNavigation |
| 26 | Rider no-show | YES (`ride/[id]/no-show`) | YES | YES — wait timer anchored to SERVER `wait_start_at` (1s tick, MM:SS — M-13), POST no-show with fee alert, cancel-instead path |
| 27 | Waiting time charges (⏱️ timer) | YES (`ride/[id]/wait-start`, `wait-end`) | YES | YES — start/stop timer in find-customer, fee added to final fare |
| 28 | Toll / parking fee input | YES (`ride/[id]/extra-charge`) | YES | YES — TollParkingModal in find-customer + finish-ride, rider ExtraChargeApproval in final-page, approved charges added to fare |
| **Commute** | | | | |
| 29 | Commute mode (destination filter) | YES (`driver/commute`) | YES | YES — dispatch skips drivers whose ride destination is off-route; haversine + error-isolated |
| **Post-Ride** | | | | |
| 30 | Rate rider (1-5 stars) | YES | YES | YES — finish-ride → "Rate Rider" button |
| 30a | Lost item reports (respond) | YES (`driver/lost-items`) | YES | YES — list reports, "I Have It" / "Not Found" / arrange return, settings hub |
| **Packages & Subscription** | | | | |
| 31 | Call packages listing + Buy (PortPos WebView) | YES | YES | YES — from Home; vehicle-type-scoped packages (403 on mismatch) |
| 32 | Payment confirmation polling | YES | YES | YES |
| 33 | Subscription checkout (PaymentWebView) | YES | YES | YES — captures payment_url |
| 34 | Active subscription details | YES | YES | YES — tab: Wallet |
| **Earnings & Wallet** | | | | |
| 35 | Earnings dashboard | YES | YES | YES — tab: Earning; daily-stats drilldown (earnings-detail/[date]) |
| 36 | Earnings breakdown (weekly) | YES | YES | YES |
| 37 | Commission statement | YES | YES | YES |
| 38 | Due amounts | YES | YES | YES |
| 39 | Wallet balance + transactions | YES | YES | YES — tab: Wallet |
| 40 | Wallet top-up (PortPos WebView) | YES | YES | YES — captures payment_url |
| 41 | Payout methods (bKash CRUD) | Partial (POST exists; GET pending) | Partial | Partial — onboarding captures bKash (`^01\d{9}$`, method_type='bkash', deactivates prior); NO GET handler, NO post-onboarding management screen (Plan 05 v2.1 Phase 4 D10 pending); bKash-only per L16 |
| 42 | Payout history | YES | YES | YES |
| 43 | Instant pay (withdraw) | YES | YES | YES |
| 44 | Ride-completion wallet credit | YES | — | YES — H-2 fix: `promo_receivable` only (platform subsidy, reference_id=ride_id); full-fare `adjustment` credit removed (double-pay hazard). Legacy bogus adjustment rows NOT backfilled — flag before payout epic |
| **Performance & Ledger** | | | | |
| 45 | Call ledger | YES | YES | YES — tab: Activity; min-rate rejections (`min_per_km`) visible in missed list |
| 46 | Missed ride requests | YES | YES | YES |
| 47 | Performance stats (charts) | YES (`driver/performance?period=week\|month`) | YES | YES — Weekly/Monthly toggle + ChartBar (৳ earnings series) + ChartLine (rating trend), Dhaka-bucketed; Retry actually refetches (M-12) |
| 48 | Driver ratings & reviews | YES | YES | YES |
| **Settings & Profile** | | | | |
| 49 | Settings hub | YES | YES | YES — tab: Profile |
| 50 | Profile view + edit | YES | YES | YES — PATCH sends `{name}` |
| 51 | Notification preferences | YES | YES | YES |
| 52 | Change password + Sign out | YES | YES | YES — real password change; Account Security gained Sign Out row + confirm modal (driver sign-out previously absent — H-1) |
| 53 | FAQ | YES | YES | YES |
| 54 | Contact support | YES | YES | YES |
| 55 | Report issue | YES | YES | YES |
| 56 | Safety hub | Missing (static screen) | YES | YES — tel:999 + tel:16263 links, emergency-contacts link, safety tips; no API |
| 57 | Emergency contacts (CRUD) | YES | YES | YES |
| 58 | Referral program | YES | YES | YES — reads from API |
| 59 | App appearance | YES (`useAppearance` + AsyncStorage) | YES | YES — persisted + applied |
| 60 | App language | Partial (i18n real) | Partial | YES — driver language screen calls i18n.changeLanguage but does NOT persist; bn strings real, sweep pending |
| 61 | Driver schedule | YES | YES | YES |
| 62 | MinRateSlider (min per-km rate) | YES (`GET /api/driver/slider-config`, `PATCH driver/me` w/ validateDriverMinPerKm) | Partial | Partial — `components/MinRateSlider.tsx` + slider-config API exist but have ZERO importers; no min-rate settings screen (Plan 05 v2.1 Phase 4 D9 pending) |
| 62a | Vehicle management (docs expiry badges + type change) | YES (`vehicle-type-change`) | YES | YES — registration / fitness / tax-token rows; valid `successLight`, <30d `amberLight`, expired `dangerLight` badges; type-change via eligibility-gated endpoint with auto-offline guard. v18: vehicle classification now routed through `lib/fleetAssignment.assignVehicleToDriver` (authoritative `fleet_vehicle_assignments` row + active-pointer cache sync — UNCOMMITTED) |
| 62c | Zombie session recovery (force-end) | YES (`POST /api/driver/session/force-end` — UNCOMMITTED) | YES | YES — `driver_online_sessions` + `useDriverStore` session fields (`sessionId`/`onBreak`/`breakStartedAt`/`clearSession`); recovery flow force-closes open sessions, resets `is_online`/`on_break` |
| 62d | Silent background OTA updates | YES (EAS Update infra) | YES | YES — `lib/otaBackgroundUpdate.ts` (UNCOMMITTED): pre-downloads JS updates ONLY while driver online + account active; cold boots stay instant (`fallbackToCacheTimeout: 0`) |
| 62b | Insurance (M-24) | YES (`GET /api/driver/insurance`) | YES | YES — platform_config `driver_insurance` (admin-editable, never cached, Zod-validated, default fallback); covered status, policy number, coverage cards, support call |
| **Future / Partial** | | | | |
| 63 | Auto-accept (high-rated drivers) | YES | YES | YES — dispatch reads `auto_accept_enabled` + `auto_accept_radius_meters` (gated rating ≥ 4.8, default 500m); settings screen loads GET me + PATCHes both fields (Zod 100–5000m) — IMPLEMENTED (was schema-only at v13) |
| 64 | Driver promo codes | Partial | Missing | Missing — scheduler job 23 auto-credits driver wallets for `target_role='driver'` promos (10-min cadence) but admin form is rider-only and no driver promo UI exists |

---

## 3. Admin

> Web-only panel. 42 .tsx files (41 screens + `_layout`), all wired. `monitoring.tsx` consolidates dispatch-log / ride-chat / driver-economics (3 tabs); `login.tsx` is the login screen (`index.tsx` = dashboard). Phase F16 added: `fare-config`, `heat-monitor`, `pickup-analytics`, `trust-safety`. v18 added: `fare-gate-metrics` + RBAC enforcement on ALL admin routes (REV-5); fleet admin screens (`fleets`, `fleet-plans`, `fleet-billing` — UNCOMMITTED).

| SL | Feature | Backend | Frontend | Wiring |
|----|---------|---------|----------|--------|
| 1 | Admin login | YES | YES | YES |
| 2 | Dashboard (stat cards) | YES | YES | YES — index.tsx |
| 3 | Driver approval queue | YES | YES | YES — queue.tsx (upgrade/downgrade/type-change/close-account buttons) |
| 4 | Document approval (presigned URL preview) | YES | YES | YES |
| 5 | Rider management (list/suspend/refund) | YES | YES | YES — riders.tsx |
| 6 | Support ticket dashboard | YES | YES | YES |
| 7 | SOS alerts viewer + acknowledge + LIVE alerts | YES | YES | YES — F-15: `POST /internal/sos/alert` (utils-server) broadcasts `admin:sos` to connected admin sockets; `lib/adminSocket.ts` singleton (with teardown); screen prepends + id-dedupe + "New SOS alert" toast on top of fetch/ack flow |
| 8 | SOS contacts management | YES | YES | YES |
| 9 | Cancellation policies CRUD | YES | YES | YES |
| 10 | ~~Surge config (thresholds + history)~~ | **REMOVED** | — | — | Surge fully removed. `lib/surge.ts`, `app/admin/surge-config.tsx`, `app/api/admin/surge-history+api.ts` deleted. Replaced by Fare Framework v1 heat engine (admin screens: fare-config, heat-monitor). |
| 11 | Call packages CRUD | YES | YES | YES |
| 12 | Pricing tiers editor | YES | YES | YES |
| 13 | Zones CRUD (multi-activation) | YES | YES | YES — Z-5: no exclusive-activation sweep (multiple active zones), polygon validation (422 invalid_polygon), zone-cache invalidation on writes |
| 14 | City boundaries CRUD | YES | YES | YES |
| 15 | Incentives CRUD | YES | YES | YES |
| 16 | Promo codes CRUD (rider-only) | YES | YES | YES — no target_role field in form |
| 17 | Ride preferences CRUD | YES | YES | YES — preferences.tsx |
| 18 | Referral campaigns CRUD | YES | YES | YES |
| 19 | Point offers CRUD | YES | YES | YES |
| 20 | Vehicle models CRUD | YES | YES | YES |
| 21 | Sample media + platform config | YES | YES | YES — NOTE: `zone_multi_active_enabled` is settable via API; 5 remaining Plan-05 keys (SOS/schedule/cancel) still require direct DB |
| 22 | Dispatch log lookup | YES | YES | YES — tab 1 of monitoring.tsx |
| 23 | Ride chat history | YES | YES | YES — tab 2 of monitoring.tsx |
| 24 | Driver economics | YES | YES | YES — tab 3 of monitoring.tsx |
| 25 | Payment activation recovery + dispatch pause/resume | YES | YES | YES — recovery.tsx (+ dispatch-toggle in platform-config) |
| 26 | Live ops dashboard (5s polling) | YES | YES | YES |
| 27 | Mass broadcast notification | YES (`admin/broadcast`) | YES | YES — TextInput UI, target selector, batched push, rate-limited |
| 28 | Rider passes CRUD | YES (`admin/rider-passes`) | YES | YES — ride-passes.tsx, soft-delete, admin sidebar |
| 29 | Tax dashboard (daily summary, CSV export, rate config) | YES (`admin/tax/*`) | YES | YES — tax-dashboard.tsx, Finance group |
| 30 | Lost items management (view all, mediate) | YES (`admin/lost-items`) | YES | YES — return_method uses proper z.enum here |
| 31 | Fare disputes management (view, approve/reject refund) | YES (`admin/fare-disputes`) | YES | YES — status filter tabs + wallet credit, Operations group |
| 32 | Zone P&L dashboard | YES (`admin/zone-pnl`) | YES | YES — per-zone profitability (zone-pnl.tsx) |
| 33 | Rider intro configs | YES | YES | YES — rider-intro-configs.tsx (onboarding intro content) |
| 34 | Fare config (Fare Framework v1) | YES (`PATCH /api/admin/config`) | YES | YES — fare-config.tsx; ~50 fare framework keys (pickup_fee_enabled, heat_*, dawdle_*, cold_drop_*, etc.) |
| 35 | Heat monitor | YES (`GET /api/admin/heat-monitor`) | YES | YES — heat-monitor.tsx; real-time zone heat scores + history |
| 36 | Pickup analytics | YES (`GET /api/admin/pickup-analytics`) | YES | YES — pickup-analytics.tsx; distance samples, true-up stats, dawdle rates |
| 37 | Trust & safety (fraud flags) | YES (`GET/PATCH /api/admin/fraud-flags`) | YES | YES — trust-safety.tsx; fraud flag management (dawdle, off-platform, cancel-rate, heat manipulation) |
| 38 | Admin RBAC enforcement (REV-5) | YES (`lib/adminRbac.ts` on all 64 admin routes) | — (server-enforced) | YES — 4-role family: owner (superuser) / admin / ops_manager / moderator; 10-permission map (`admin.read` … `staff.manage`, `price.write` owner-only); owner-only config keys + pickup-allowance guardrails (±0.25km/±1min) per-key in config API; owner seeded via SQL only (no self-escalation); migration 0047; `lib/adminRoles.ts` zero-dep client-safe type |
| 39 | Role-based sidebar + role badge | YES (role from `me` fetch) | YES | YES — AdminShell filters nav groups by role (619c8fc); owner/admin/ops_manager/moderator badge in sidebar header (3188d94); config-audit test asserts actor_role |
| 40 | Fare gate metrics (Stage-gate dashboard) | YES (`GET /api/admin/fare-gate-metrics`) | YES | YES — fare-gate-metrics.tsx; per-metric green/red/calibration_needed vs admin-adjustable thresholds; gates Fare Framework v6 Stage 1 promotion |
| 41 | Fleet admin screens | YES (`/api/admin/fleets`, `/api/admin/fleet-plans`, `/api/admin/fleet-billing` — UNCOMMITTED) | YES | YES — fleets.tsx, fleet-plans.tsx, fleet-billing.tsx; fleet CRUD, subscription plans, billing transactions — see §3b |

---

## 3b. Fleet (Universal Fleet Model + Fleet Manager Portal)

> **STATUS: WORKING TREE ONLY (uncommitted)** except the schema push (`d99c089`, 2026-08-31) which added the fleet tables + `source_type` columns to `src/db/schema.ts`.
> Universal model: every driver owns exactly one fleet (`drivers.fleet_id` NOT NULL; solo drivers get an implicit solo NATIVE fleet at registration — `app/api/register+api.ts` — or via `scripts/fleet-backfill.ts`). `vehicles.fleet_id` NOT NULL. The strict 1:1 driver↔vehicle unique index is DROPPED (`docs/vehicle-model-decision.md`); `fleet_vehicle_assignments` is the authoritative append-only assignment source (partial unique indexes enforce single active row per vehicle/driver).
> Fleet staff roles (OWNER|MANAGER|DISPATCHER|ACCOUNTANT|VIEWER) live EXCLUSIVELY in `fleet_members` — NEVER `users.role`. Money = integer paisa.

| SL | Feature | Backend | Frontend | Wiring |
|----|---------|---------|----------|--------|
| 1 | Fleet portal app surface (`app/(main)/(fleet)/`) | YES | YES | YES — tab bar: Dashboard / Finance / More (+ Operations); detail screens `drivers/[id]`, `vehicles/[id]`, `trips/[id]`; `alerts.tsx`, `assign.tsx`, `subscription.tsx`; `components/fleet/FleetScreen.tsx` + `FleetTabBar.tsx` |
| 2 | Current-mode switching (RIDER / DRIVER / FLEET) | — (local state only) | YES | YES — `store/useFleetStore.ts` `activeMode`; switching NEVER logs out, NEVER re-authenticates, NEVER mutates immutable `users.role`; server truth = active `fleet_members` row |
| 3 | Fleet dashboard / finance / operations / more | YES (`/api/fleet/dashboard`, `/finance`, `/trips`+[id], `/drivers`, `/vehicles`, `/alerts`, `/assignments`, `/staff`, `/subscription`, `/limits`, `/plans`, `/integrations`) | YES | YES — all guarded by `requireFleetMember(fleetId, allowedRoles?)` (`lib/auth.ts`): Supabase token → users row → ACTIVE `fleet_members` row (+ role check) → 403 on miss; fleetId bound into the curried guard so URL-param cross-fleet tampering is structurally impossible |
| 4 | Vehicle assignment (authoritative + pointer cache) | YES (`lib/fleetAssignment.ts`) | YES | YES — sole writer of `fleet_vehicle_assignments` + denormalized `vehicles.driver_id` / `drivers.vehicle_id` / `drivers.vehicle_type` pointers, same transaction; `lib/fleetLimits.ts` enforces subscription plan limits before add (no active subscription = open access; NULL field = unenforced); driver `vehicles` classification routes through it |
| 5 | Fleet auth helpers (client) | — | YES | YES — `lib/fleetAuth.ts` (`getAuthHeaders` / `requireAuthHeaders`) |
| 6 | Fleet subscription plans + billing | YES (`/api/admin/fleet-plans`, `/api/admin/fleet-billing`) | YES | YES — admin CRUD screens (fleets.tsx / fleet-plans.tsx / fleet-billing.tsx); paisa money fields |
| 7 | Fleet alerts | YES (`/api/fleet/alerts` + `fleet_alerts` table) | YES | YES — alerts screen |
| 8 | External ride-platform integrations | YES (`/api/fleet/webhook` + `lib/integrations/`: baseAdapter, mockRidePlatform, syncEngine, webhookHandler) | — | YES — `fleet_integrations` + `integration_sync_jobs` + `external_entity_mappings` tables; `users.source_type` ('native' \| 'external_api') + loyalty `point_source_type`; sync-dedup + plan-limit + cross-fleet tests in `tests/api/fleet/`, `tests/api/fleets/` |

---

## 4. Backend Summary

- **205 API route files** across `app/api/` — v18 additions: `POST /api/user/zone-fee-explained`, `GET /api/admin/fare-gate-metrics`, `POST /api/driver/session/force-end`, `POST /api/ride/nearby-markers`, 14 routes under `/api/fleet/*` + `/api/fleets/[id]`, 4 admin fleet routes (fleet set UNCOMMITTED); Plan 05 additions: `GET /api/sos/active`, `POST /api/sos/resolve`, `GET /api/driver/insurance`; earlier: `POST /api/sos/alert`, `POST /api/driver/vehicle-type-change`, `GET /api/driver/slider-config`, `GET /api/driver/hotspots` (never a `heatmap` route)
- **~97 tables, ~32 enums** (Fare Framework v1 added 6 tables: zone_heat, zone_heat_history, pickup_distance_samples, fraud_flags, zone_recalibration_queue, cancel_surveys)
- **Zone foundation (Plan 05 §8): DONE** — Z-1 ✓ (0042), Z-2/Z-3 ✓ (`lib/zone.ts` `getZoneForLocation`: multi-zone gated by fresh `zone_multi_active_enabled` read, smallest-polygon-first, 60s TTL cache + `invalidateZoneCache`, 503/422 semantics), Z-4 ✓ (`utils-server/index.ts` heartbeat stamps driver zone via `getZoneForLocation(lat, lng)` + 3-beat hysteresis), Z-5 ✓ (admin multi-activation), Z-6 ✓ (`lib/forecast.ts` hourly upserts), Z-7 ✓ (`scripts/zone-hygiene.ts` — Zone Gate PASS/FAIL), Z-8 ✓ (`scripts/zone-seed-pricing.ts` — BD defaults for all 8 vehicle types, reference-zone clone, `--zone`/`--force`/`--dry-run` flags, upsert). all 6 Plan-05 keys admin-settable via config API + UI; `zone_multi_active_enabled` seeded as false
- **WebSocket server** (utils-server): heartbeat-gated call deduction, H3 indexing; scheduler now **45 jobs** — v17 added SOS auto-resolve (60s tick, 30-min cutoff, `sos:auto_resolved` push), scheduled-ride cutoff cancellation, demand-forecast writer, stalled-pending re-dispatch, heat_backtest_correlation (37, weekly), dawdle detection (38), zone recalibration (39), response ladder (40), decline monitoring (41); **v18 added 42 zone recovery (60s, upserts `zone_heat.recovery_time_min`), 43 zone fee schedule (monthly), 44 billed-min aggregation (daily), 45 fuel recompute (30s)**. Raw-SQL templates fixed to pass ISO strings (not Date objects); job 44/45 no-op bugs fixed. Auto-redispatch on DRIVER cancel NOT implemented (stale matched rides get cancelled, nothing re-dispatches). Admin socket registry + `POST /internal/sos/alert` broadcast (F-15)
- **SOS lifecycle**: insert `open` → creator-only `resolve` OR 30-min scheduler auto-resolve; SMS to `user_emergency_contacts` (best-effort + 1 retry; SOS-only hourly circuit breaker in `lib/dprelay.ts` — OTP unaffected); push to user + admin; 201 on new insert; dedupe = any-open-per-user/per-ride (cooldown config read but not time-applied)
- **Cancellation**: `lib/cancellation.ts` (DB-driven policy tiers); cancel-preview full contract (`fee_bdt`/`free_until`/`server_now`/`policy`/`ride_status`/`reason_required`); atomic cancel (conditional UPDATE in tx, 409 loser) + fee event via `lib/paymentEvents.ts` in-tx
- **Scheduling**: config-driven +30m/+7d bounds (`schedule_min_lead_minutes`/`schedule_max_lead_days`); estimate carries `quote_valid_until` (5 min); overlap-window semantics via `lib/scheduleUtils.ts` + `/api/ride/schedule/overlap`; book-for-other hardening (regex/self-phone/consent/5-per-hour SMS limit) pending, quote in schedule response pending
- **Discount engine**: `lib/discountEngine.ts` (intro/promo/pass/wallet options — rider-SELECTABLE, pass-first precedence NOT enforced); staged promos via `lib/promoCache.ts` (in-memory 10-min TTL, single-instance documented); consumed + cleared only on ride-tx success
- **platform_config**: `lib/platformConfig.ts` with 6 Plan-05 keys (`sos_cooldown_seconds`, `sos_auto_resolve_seconds`, `schedule_min_lead_minutes`, `schedule_max_lead_days`, `cancel_grace_period_seconds`, `zone_multi_active_enabled`), always fresh-read; all 6 admin-settable via `PATCH /api/admin/config` with range validation + UI toggle; `zone_multi_active_enabled` seeded as `false`
- **Fare Framework v1 (Phase F16)**: Surge fully removed (no tables/columns/code/UI). Heat engine replaces surge: `zone_heat` + `zone_heat_history` tables, EWMA demand/supply scoring (0–1), heat tags (hot/neutral/cold), Lever 0 (baseline) / Lever 1 (live EWMA) / Lever 2 (cold-drop boost, temporary multiplier ~15 min decay) / Lever 3 (return-lead affinity, pickup zone matches recent cold drop zone). Pickup fee 3-state lifecycle: range (estimate at request) → firm (Barikoi route distance at accept) → trued (completion, 1.25× cap down, uncapped up). Gated by `pickup_fee_enabled` config. Fraud protocol: `fraud_flags` table + dawdle guard (inflated realized/firm ratio, rolling 30 charged pickups, zone-relative thresholds), off-platform detection, cancel-rate monitoring, heat manipulation detection. `cancel_surveys` for structured post-cancel feedback. `zone_recalibration_queue` for heat backtest adjustments. ~50 fare framework keys in `platform_config` (admin-editable via `PATCH /api/admin/config`). 4 new admin screens: `fare-config`, `heat-monitor`, `pickup-analytics`, `trust-safety`. New scheduler jobs: 37 (heat_backtest_correlation, weekly), 38 (dawdle detection), 39 (zone recalibration), 40 (response ladder), 41 (decline monitoring). New lib files: `pickupFee.ts`, `pickupQuote.ts`, `pickupTrueup.ts`, `fareFrameworkConfig.ts`. New utils-server files: `leadBilling.ts`, `dispatchChain.ts`, `coldDrop.ts`, `trace.ts`, `firmQuote.ts`, `barikoiRoute.ts`, `polyline.ts`, `offPlatform.ts`. `BARIKOI_API_KEY` now required in utils-server/.env.
- **Fare Framework v6.4 Stage 0 (shadow mode)**: `fare_framework_stage='stage0'` — v6 fares are computed in shadow for telemetry/gating WITHOUT touching rider-quoted v2 fares (`shadow-isolation` test). New engines: **zone fee** (`lib/zoneFee.ts` — published flat monthly schedule `zone_fee_schedule` per zone × vehicle_category × effective_month; structurally incapable of acting as a live multiplier; driver receives 100%, not commission base; derivation ≈ recovery_time_min × time_rate × coverage_factor 0.55; gated by `zone_fee_enabled=false`); **zone recovery** (`lib/zoneRecovery.ts` — median driver recovery per zone from `zone_recovery_samples` written at ride completion; >30 min → cold (fee applies), <20 min → warm (retires), 10-min hysteresis band; scheduler job 42); **night multiplier** (`lib/nightSchedule.ts` — config JSON schedule + `night_mult_value`, applies ONLY to time_rate terms, ships disabled); **per-tier rate derivation** (`lib/tierRateDerivation.ts`, REV-4 — bike/CNG stack bottom-up fuel/km + driver_maint/km + joma/km, parking owner-borne inside joma; car back-solves from `daily_target`, owner takes 50% of net; AU-6/7: all tier params in taka, engine converts to paisa); **fuel engine** (`lib/fuelConfig.ts` — global fuel prices + per-tier efficiency in platform_config, per-bike-tier joma overrides, seeded via `scripts/seed-fuel-config.js`, admin "Fare Engine Setup" section in fare-config with CSV export). Rider surfaces: `ZoneFeeExplainerSheet` (first-run, `users.zone_fee_explained`), `PickupFeeExplainerSheet` wired into confirm-ride; driver: `DriverPricingReference` (stage-gated v6 formula card, `GET /api/driver/pricing-reference`). New tables: `zone_fee_schedule`, `zone_recovery_samples`, `trip_time_samples`, `config_audit_log`. Stage-gate metrics dashboard (admin fare-gate-metrics) gates Stage 1 promotion.
- **Admin RBAC (REV-4/REV-5)**: `lib/adminRbac.ts` — owner (superuser, passes every check) / admin / ops_manager / moderator; 10-permission map (admin.read, safety.write, review.write, verification.write, config.write, catalog.write, price.write [owner-only], finance.write, support.write, staff.manage); wired into ALL 64 admin routes; owner-only config keys + pickup-allowance guardrails (±0.25km / ±1min) enforced per-key in config API; NO self-escalation endpoint (first owner via SQL); migration `0047_rbac_admin_roles.sql`; `lib/adminRoles.ts` is the zero-dep client-safe type module (Metro client-bundle safe)
- **Fleet backend (universal fleet model — UNCOMMITTED except schema)**: `drivers.fleet_id` / `vehicles.fleet_id` NOT NULL; `fleet_vehicle_assignments` authoritative (append-only, single-active partial unique indexes); denormalized pointers written ONLY via `lib/fleetAssignment.ts` in-transaction; `requireFleetMember(fleetId, allowedRoles?)` curried guard in `lib/auth.ts`; `lib/fleetLimits.ts` plan-limit enforcement; 14 `/api/fleet/*` routes + `/api/fleets/[id]` + 4 admin fleet routes; external ride-platform integrations via `lib/integrations/` (baseAdapter, mockRidePlatform sync engine, webhook handler) + `fleet_integrations` / `integration_sync_jobs` / `external_entity_mappings` tables; `scripts/fleet-backfill.ts` solo-fleet backfill, `scripts/verify-fleet-schema.ts`
- **Driver resilience**: zombie-session recovery (`driver_online_sessions` + `POST /api/driver/session/force-end` + `useDriverStore` session fields — UNCOMMITTED); silent background OTA (`lib/otaBackgroundUpdate.ts` — EAS Update pre-download while driver online + active, instant cold boot via `fallbackToCacheTimeout: 0` — UNCOMMITTED)
- **Push notifications**: Expo Push Service — ride:matched + scheduled reminders + admin broadcasts + `sos:auto_resolved` + cutoff notifications
- **PortPos** unified payment gateway — purpose-tagged payment events (`ride` / `wallet_topup` / `driver_package` / `rider_pass`); `PaymentResultScreen` auto-returns via `ride://` scheme from hosted result page
- **SMS** (dpRelay): OTP + book-for-others + SOS (scoped breaker) + phone normalization
- **Tax engine**: VAT 5% on commission + subscription, AIT 1% on driver payouts. Auto-calculated on ride completion, instant-pay, subscription sale, wallet top-up, rider pass purchase, cancellation fee. Daily summaries auto-populated via PostgreSQL trigger.
- **Double-entry accounting**: Chart of accounts (14 accounts), journal entries with Dr=Cr validation, auto-generated entry numbers (JV-YYYYMMDD-NNNN), auto-balance via trigger. External API for QuickBooks/Tally integration (entries, balance, trial-balance, CSV export).
- **Deep linking**: scheme `ride` declared (app.config.js W-4); expo-linking is a dependency but imported NOWHERE — push taps route via router.push; no ride://promo→apply-promos mapping

---

## 5. Schema Summary

**~106 tables, ~41 enums** (67 at migration 0028; growth through Fare Framework v1 + v6.4 Stage 0 + fleet model) including all additions:
- P3: `surgeCurrent`, `surgeHistory`, `cancellationPolicies`
- P4 Phase 2: `driverCommutePreferences`, `riderPasses`, `riderSubscriptions`, `rideExtraCharges`
- P4 Phase 3: `taxRates`, `taxLedgers`, `dailyTaxSummaries`, `accountingAccounts`, `accountingEntries`, `accountingEntryLines`
- Multi-Stop + Tip: `rideStops` + `rides.upfront_tip_bdt`
- Trust & Quality: `lostItems`, `fareDisputes`, `driverBlocklists`, `ridePhotos`
- Fare Framework v1: `zoneHeat`, `zoneHeatHistory`, `pickupDistanceSamples`, `fraudFlags`, `zoneRecalibrationQueue`, `cancelSurveys`
- Fare Framework v6.4 Stage 0: `zoneFeeSchedule`, `zoneRecoverySamples`, `tripTimeSamples`, `configAuditLog`, `driverOnlineSessions`
- Fleet model: `fleets`, `fleetMembers`, `fleetVehicleAssignments`, `fleetSubscriptionPlans`, `fleetSubscriptions`, `fleetBillingTransactions`, `fleetAlerts`, `auditLogs`, `fleetIntegrations`, `integrationSyncJobs`, `externalEntityMappings`
- Column additions: `payment_events.purpose` + `pass_id`, `rides.reminder_sent` + `reminder_60_sent` + `wait_*` + `upfront_tip_bdt`, `notifications.idempotency_key`, `pricing.free_wait_minutes` + `wait_fee_per_minute_bdt`, `drivers.auto_accept_*`, `point_offers.points_required` + `reward_*`, `promo_codes.target_role` + `metric`
- v18 columns: `users.source_type` ('native' | 'external_api') + `users.zone_fee_explained`, `users.fleet_id`, `drivers.fleet_id` (NOT NULL), `vehicles.fleet_id` (NOT NULL), loyalty `source_type` (`point_source_type` enum); 1:1 driver↔vehicle unique index DROPPED (fleet assignments replace it)
- Migration 0042 (Zone Z-1): `DROP INDEX zones_one_active` + `zones_active_idx` + `demand_forecasts_zone_hour_idx` (unique) + `demand_forecasts_hour_idx` + `rides_zone_created_idx`
- Migration 0047 (RBAC): admin role family support (owner / admin / ops_manager / moderator)
- Post-migration: triggers (daily tax summary, account balance, commute updated_at) + seed data (4 tax rates + 14 chart of accounts) + GRANT statements

---

## 6. Fix Verification Logs

### v18 Fleet + Fare v6.4 Stage 0 + Admin RBAC (verified against working tree 2026-08-31)
| Feature | Status | Key detail |
|---------|--------|------------|
| Fleet universal model | DONE (UNCOMMITTED) | `drivers.fleet_id`/`vehicles.fleet_id` NOT NULL; solo NATIVE fleet at registration/backfill; `fleet_vehicle_assignments` authoritative; pointers written only via `lib/fleetAssignment.ts` in-tx; 1:1 driver↔vehicle index dropped. Schema push committed (`d99c089`); libs/APIs/screens uncommitted. |
| Fleet portal (`app/(main)/(fleet)/`) | DONE (UNCOMMITTED) | Dashboard/Finance/Operations/More tabs + drivers/vehicles/trips detail + alerts/assign/subscription; `useFleetStore` local-mode switch (never mutates `users.role`). |
| Fleet APIs + admin fleet screens | DONE (UNCOMMITTED) | 14 `/api/fleet/*` routes + `/api/fleets/[id]` + `/api/admin/fleets|fleet-plans|fleet-billing`; `requireFleetMember` curried guard; plan-limit enforcement (`lib/fleetLimits.ts`). |
| External ride-platform integrations | DONE (UNCOMMITTED) | `lib/integrations/` (baseAdapter, mockRidePlatform, syncEngine, webhookHandler) + `/api/fleet/webhook` + 3 tables; `users.source_type`; sync-dedup/plan-limit/cross-fleet tests. |
| Fare Framework v6.4 Stage 0 (shadow) | DONE | `fare_framework_stage='stage0'`; v6 computed in shadow, rider-quoted v2 untouched; shadow-isolation test. |
| Zone fee engine | DONE (gated) | `lib/zoneFee.ts` — flat monthly `zone_fee_schedule`, driver gets 100%, coverage factor 0.55 derivation; `zone_fee_enabled=false`. |
| Zone recovery tracking | DONE | `lib/zoneRecovery.ts` — 30/20-min hysteresis ±10-min band; samples at completion; job 42 upserts `zone_heat.recovery_time_min`. |
| Night multiplier | DONE (disabled) | `lib/nightSchedule.ts` — config JSON, time-rate terms only, ships at 1.000. |
| Per-tier rate derivation (REV-4) | DONE | `lib/tierRateDerivation.ts` — bike/CNG bottom-up (fuel+maint+joma), car back-solve from daily_target (owner 50% net), parking inside joma; AU-6/7 taka convention. |
| Fuel engine + Fare Engine Setup | DONE | `lib/fuelConfig.ts` + REV-6 sections in fare-config (fuel prices, per-tier efficiency, per-bike-tier joma overrides, CSV export); seeded. |
| Zone fee + pickup fee explainers | DONE | ZoneFeeExplainerSheet wired in confirm-ride (first-run flag); PickupFeeExplainerSheet wired into rider flow (ffeb422). |
| fare-gate-metrics dashboard | DONE | Admin screen + API; green/red/calibration_needed vs thresholds; gates Stage 1. |
| Scheduler jobs 42–45 | DONE | 42 zone recovery (60s), 43 zone fee monthly, 44 billed-min daily, 45 fuel recompute (30s); ISO-string raw-SQL fixes; job 44/45 bug fixes. |
| Admin RBAC (REV-5) | DONE | 4 roles, 10-permission map, wired into all 64 admin routes; owner-only keys + pickup guardrails; migration 0047; no self-escalation. |
| Admin sidebar role filtering + badge | DONE | AdminShell filters nav by role; role badge in sidebar header. |
| GlobalActionButtons | DONE | FloatingNavMenu + SOSButton deleted; draggable hamburger (stacked above SOS, bottom-right) mounted in `app/(main)/_layout.tsx` Stack sibling; rider/driver/admin role-aware; theme-toggle attempt reverted. |
| SOS offline queue | DONE | `lib/sosQueue.ts` — user-scoped AsyncStorage queue, reconnect replay w/ exponential backoff, dedupe; 5s client debounce. Active-SOS polling + server cooldown still open (§9). |
| Driver zombie-session recovery | DONE (UNCOMMITTED) | `driver_online_sessions` + `POST /api/driver/session/force-end` + `useDriverStore` session fields. |
| Silent background OTA | DONE (UNCOMMITTED) | `lib/otaBackgroundUpdate.ts` — pre-download while online+active; instant cold boot preserved. |
| Nearby driver markers | DONE (UNCOMMITTED) | `POST /api/ride/nearby-markers` (H3 k=30 ring); wired into customer home map. |
| Tests relocation + CI gates | DONE | All `__tests__/` folders → root `tests/` mirror (uncommitted move); `.maestro/smoke-app-launch.yaml`; `scripts/check-web-imports.js` native-module web validator + Metro Node-stdlib blocklist; git hooks (pre-commit fast, tsc at pre-push); maplibre platform-split; Render deploy verification (`verify-render-deploy.sh`). |
| LiveMeter component | BUILT, UNWIRED | Display-only in-progress ride fare meter (Stage 0 shows request-time estimate; Stage 1 will use `ride:progress` WS) — zero importers. |

### v17 Ride Fare Framework v1 (Phase F16 — verified 2026-08-25)
| Feature | Status | Key detail |
|---------|--------|------------|
| Surge removal | DONE | All surge tables, columns, code, UI, and references fully removed. `lib/surge.ts`, `app/admin/surge-config.tsx`, `app/api/admin/surge-history+api.ts` deleted. |
| Sequential dispatch + debit-on-offer | DONE | One outstanding offer per ride; lead debited at offer time (not fetch:confirm); every offered driver billed regardless of outcome. `utils-server/dispatchChain.ts` + `leadBilling.ts`. |
| Ordering tiers | DONE | (1) new-driver protection, (2) cold-drop boost Lever 2 (~15 min decay), (3) return-lead affinity Lever 3, (4) commute bonus 1.1×. |
| Auto-accept at offer step | DONE | Rating ≥ 4.8, radius gate, first-wins. Auto-accept drivers billed same 1 lead. |
| Heat engine | DONE | `zone_heat` + `zone_heat_history` tables; EWMA demand/supply scoring (0–1); heat tags hot/neutral/cold; Lever 0/1/2/3. |
| Pickup fee measurement (Stage 0) | DONE | `pickup_distance_samples` table; haversine×1.4 estimate at offer time; firm quote at accept (Barikoi route); true-up at completion (1.25× cap down, uncapped up). Gated by `pickup_fee_enabled`. |
| Pickup fee charge (Stage 1) | GATED | Code complete; charge disabled until `pickup_fee_enabled` config set to true. |
| Fraud protocol | DONE | `fraud_flags` table; dawdle guard (rolling 30 charged pickups, zone-relative thresholds); off-platform detection; cancel-rate monitoring; heat manipulation detection. |
| Cancel surveys | DONE | `cancel_surveys` table; structured post-cancel feedback (reason_code, details, would_rebook). |
| Zone recalibration queue | DONE | `zone_recalibration_queue` table; heat backtest adjustments via scheduler job 37. |
| Fare framework config | DONE | ~50 keys in `platform_config`; all admin-editable via `PATCH /api/admin/config`. |
| New admin screens | DONE | `fare-config`, `heat-monitor`, `pickup-analytics`, `trust-safety` — 4 new screens in `app/admin/`. |
| New scheduler jobs | DONE | 37 (heat_backtest_correlation), 38 (dawdle), 39 (zone recal), 40 (response ladder), 41 (decline monitoring). |
| New API routes | DONE | `POST /api/ride/[id]/pickup-move`, `POST /api/ride/[id]/cancel-survey`, `GET/PATCH /api/admin/fraud-flags`, `GET /api/admin/pickup-analytics`, `GET /api/admin/heat-monitor`, `GET /api/admin/zone-recalibration`. |
| WS protocol updates | DONE | `ride:offer` carries `dropoff_zone` + `pickup_fee_estimate_bdt` + `lead_cost_calls` + `balance_after_calls`; new `lead:billed` outbound; `offer:lost` carries `reason`; `offer:accepted` reveals exact dropoff. |
| BARIKOI_API_KEY (utils-server) | DONE | Now required in `utils-server/.env` for firm-quote routing in `barikoiRoute.ts`. |
| Dispatch invariants (10) | DONE | All 10 invariants asserted by tests: single offer per ride, single deduction per (ride_id, driver_id), calls_remaining=0 excluded, daily-cap excluded, no duplicate offers, every offered driver deducted, declined/expired → next, rider cancel → abort, re-dispatch no re-bill, billing atomicity. |

### v14 Plans 01–04 polish + Plan 05 Waves 0–3 + Zone foundation (verified against working tree 2026-08-21)
| Feature | Status | Key detail |
|---------|--------|------------|
| Theme/palette/typing sweep (2026-08-19) | DONE | `dark:` 78 files→0 · `: any` 123→0 · emoji→Ionicons · Inter→Jakarta · maplibre 10.4.2 `mapStyle` migration + missing `<Camera>` fixes (3 maps never centered before) · tailwind tokens aligned to goRide.ts, #0A9B4C purged |
| M-2 real splash | DONE | logo + scale-in, 1.5s → auth routing (welcome/services-hub/driver-home/phone-entry), 5xx → stay + Retry, ref-guarded |
| M-5/M-7/M-14 rides tab | DONE | Scheduled chip, Inbox/Referral NAV chips, search bar, Dhaka date groups, Rebook handoff |
| M-8/M-9 ride-pass + PaymentWebView | DONE | rides_used/max_rides progress bar (inline Views — shared ProgressBar still unwired); `purpose` prop label |
| M-10 find-customer route map | DONE | Map overlay + lib/routeGeometry (Barikoi polyline), 30s/25m refetch gates |
| M-12 performance charts | DONE | `?period=week\|month` Dhaka-bucketed series + ChartBar/ChartLine; retry refetches |
| M-13 no-show timer | DONE | anchored to server `wait_start_at` |
| M-22 PinInput | DONE | custom component (enter-otp + ride-tracking); react-native-otp-entry removed from deps |
| M-24 insurance endpoint | DONE | platform_config `driver_insurance`, Zod-validated + default fallback |
| F-3..F-9 components | DONE | ProgressBar/Badge/Avatar/CheckboxGroup/ChartBar/ChartLine/HeatmapOverlay built (6 of them currently unwired; ChartBar/ChartLine used in performance-stats) |
| F-15 admin SOS live alerts | DONE | utils-server admin role + `POST /internal/sos/alert` broadcast; `lib/adminSocket.ts` (+teardown); sos-alerts screen live prepend + toast |
| H-1 WS lifecycle | DONE | identity-tagged sockets (`socketRole`/`socketUserId`/`resetWebSocket`), teardown on sign-out (rider/driver/admin), `authCleanup()` WS-first, driver-home handler indirection |
| H-2 ride-completion wallet credit | DONE | `promo_receivable` only (platform subsidy); full-fare `adjustment` credit removed (double-pay hazard); legacy bogus rows NOT backfilled — flag before payout epic; `lib/rideCompletionWallet.ts` + 5 tests |
| H-3 home booking wiring | DONE | real autocomplete + saved/recent places; fake "finding" state deleted; confirm-ride owns stops/promo/tip; `as any` vehicle-type cast killed |
| Plan 05 Wave 0 | DONE | ErrorBanner/OfflineIndicator (a11y + tokens + retry/cleanup), ScheduleRideSheet (400 lines), amberLight/infoLight/successLight tokens, NetInfo dep, `lib/time.ts` toUtcIso/dhakaTodayKey/msUntil |
| Plan 05 cancellation (W1) | DONE | full preview contract + atomic cancel + payment-event ownership in tx |
| Plan 05 SOS (W2) | DONE (1 gap) | active/resolve + auto-resolve + SMS/push + SOS-scoped breaker; cooldown value read but not time-applied; no offline retry/polling on screen |
| Plan 05 scheduling (W1) | PARTIAL | bounds + estimate quote_valid_until done; overlap windows, book-for-other hardening, schedule-response quote pending |
| Plan 05 discount engine (R5) | PARTIAL | engine + server staging done; pass-first precedence not enforced (rider-selectable); apply-promos screen contract bug (sends `{code}`, API needs vehicle_type+coords) |
| Zone foundation | DONE | Z-1/2/3/4/5/6/7/8 all done; flag admin-settable + seeded; sentinel writes removed; 3-beat hysteresis |
| EAS | DONE | production android buildType apk→appBundle (Play Store AAB) |
| RideOfferSheet slide-accept | DONE | SlideButton 64dp primary + full-width Decline ≥56dp; handshakes byte-identical |
| Driver earnings goal | **REGRESSION** | goal UI absent from tree (0 grep hits; earnings-tab rebuild af364075); breakdown API remains |
| Splash W-4 scheme | DONE | `ride` scheme (was "myapp" placeholder) |

### v13 UI/UX Rethink Plans 01–05 (originally verified 2026-08-16 — updated dispositions)
| Feature | Status | Key detail |
|---------|--------|------------|
| Plan 01–04 (theme, booking loop, rider account, driver core loop) | DONE | Pattern A theming, Services Hub entry, hamburger nav, WS singleton (`lib/riderSocket.ts`), 7-step driver onboarding wizard |
| Plan 05 rider screens (sos, cancel, promos, ride-scheduled, canceled) | DONE | `emergency-sos` + universal `/api/sos/alert`; confirm-ride schedule toggle → `ride/schedule` |
| Plan 05 driver (hotspot-map, vehicle-management, type-change, slider-config) | DONE | hotspots now real-data (surge_current × zones); `zones_one_active` dropped (0042) |
| Plan 05 Wave 0 (ErrorBanner, OfflineIndicator, `amberLight`, ScheduleRideSheet) | **DONE** | All exist with contracts; OfflineIndicator mounted in both tab layouts; ErrorBanner used in cancel-reason |
| Plan 05 route deletions | **RE-SCOPED** | scheduling-user-ride + schedule-ride-after-promo = true orphans (delete candidates); schedule-ride (used by FloatingNavMenu, no-drivers-available, hosts ScheduleRideSheet) + no-drivers-available (used by finding-driver ×2) are LIVE — FINAL's delete-list was wrong |
| cancel-preview `free_until` | **DONE** | Full contract: fee_bdt/free_until/server_now/policy/ride_status/reason_required |
| payout-method GET | **GAP** | POST only; management screen pending (D10) |
| `/track` auth exemption | **DONE** | root `_layout.tsx` exempts `track` in all 3 redirect paths; deep linking (expo-linking) still unwired |
| Legal content | **DONE (differently)** | Real inline content on 4 screens ("Last updated July 15 2026"); `lib/legalContent.ts` never created; owner review unconfirmed |
| Zone foundation Z-1…Z-8 | **DONE** | See §4 Backend Summary; all gaps resolved |

### v9 Core (29 tasks — ALL DONE)
All P0 (3), P1 (16), P2-002B surge (8), P1-010 PortPos, orphan route deletion. Verified against actual code.

### v10 P4 Phase 1+2 (verified through 4 audit rounds)
| Feature | Status | Key detail |
|---------|--------|------------|
| Share Trip | DONE | Server URL, not custom scheme |
| Push Reminder | DONE | T-60m + T-15m reminders; `reminder_60_sent`/`reminder_sent` boolean gates; `notifications.idempotency_key` partial unique index for dedup; migration 0043 |
| Cancel Countdown | DONE | Server-driven (`server_now`/`free_until`) |
| Earnings Goal | **REVERTED** | Was done; UI removed from tree in later rebuild — see §2 #15 |
| Mass Notification | DONE | Batched push, rate-limited, TextInput UI |
| Commute Mode | DONE | Dispatch filter (haversine), error-isolated, NaN guard |
| Waiting Charges | DONE | Timer UI, fee calc, added to final fare |
| Rider Points | DONE | Balance + redeem (row-lock), loyalty UI |
| Rider Pass (backend) | DONE | Purchase + callback (purpose-tagged) + estimate discount + usage increment + auto-expiry |
| Rider Pass (UI) | DONE | Browse/buy screen + progress bar (M-8) |
| Toll/Parking | DONE | Submit + approve/dispute + added to fare (TollParkingModal + ExtraChargeApproval) |
| Admin Rider Passes CRUD | DONE | List + create + edit + soft-delete + sidebar |

---

## 7. Kimi-K2.6 Original Suggestions — ALL 10 DONE

| # | Suggestion | Status |
|---|-----------|--------|
| 1 | Push Notification Service | **DONE** |
| 2 | Driver Turn-by-Turn Navigation | **DONE** |
| 3 | ~~Surge Pricing Engine~~ | **REMOVED** — replaced by Fare Framework v1 heat engine (zone_heat, Lever 0/1/2/3, heat tags hot/neutral/cold). Surge tables, columns, code, and UI fully deleted. |
| 4 | Admin Rider Management | **DONE** |
| 5 | Cancellation Policy Engine | **DONE** — DB-driven + full preview contract + wallet deduction |
| 6 | Book for Someone Else | **DONE** — toggle + API + tracking + driver banner + SMS |
| 7 | Admin Support Ticket Dashboard | **DONE** |
| 8 | Scheduled Rides Backend | **DONE** |
| 9 | Document Expiry Alerts | **DONE** |
| 10 | Real-Time Ops Dashboard | **DONE** |

---

## 8. P4 Roadmap Status

### Phase 1: Quick Wins — DONE ✅ (5/5)
Share Trip, Push Reminder, Cancel Countdown, Earnings Goal (since reverted — see §2 #15), Mass Notification.

### Phase 2: Revenue Features — DONE ✅ (11/11)
1. Commute Mode (dispatch filter + driver UI)
2. Waiting Charges (timer UI + fee calc + fare integration)
3. Rider Points (API + redeem + loyalty UI)
4. Rider Pass (purchase screen + callback activation + estimate discount + usage increment + auto-expiry + admin CRUD)
5. Toll/Parking (TollParkingModal + ExtraChargeApproval + fare integration)
6. Admin Rider Passes CRUD (list + create + edit + soft-delete + sidebar)
7. Payment callback disambiguation (purpose-tagged payment_events)
8. Estimate pass discount (both single-vehicle + all-vehicle branches)
9. Commute error isolation (try/catch + NaN guard)
10. Rider pass purchase screen — DONE (PortPos WebView + polling + purpose label)
11. Toll/parking driver + rider UI — DONE (modal + approval component)

### Multi-Stop + Upfront Tip — DONE ✅
- rideStops table + rides.upfront_tip_bdt column
- UpfrontTipSlider component (preset ৳0/20/50/100)
- confirm-ride: BarikoiAutocomplete stop inputs (max 2) + tip slider
- estimate+api.ts: multi-leg distance (waypoints loop) + upfront_tip in Zod + parseJsonBody
- request+api.ts: accepts stops + tip, bulk INSERT rideStops
- stops+api.ts: GET list + POST complete (UUID validation + ownership checks)
- find-customer: stop list + "Complete Stop" button
- RideOfferSheet: tip badge (Pattern A tokens)
- complete+api.ts: tip added to driver payout (no commission on tip)
- WS payload: includes upfront_tip_bdt + computed has_stops

### Trust & Quality System — DONE ✅
- 4 tables: lostItems, fareDisputes, driverBlocklists, ridePhotos
- lib/fareArbitration.ts: disputes sent to manual review (under_review/pending)
- Rider APIs: lost-items (report + 24h window enforced), fare-disputes (file + 48h window enforced server+client), block (POST/DELETE/GET)
- Driver API: lost-items (GET + PATCH respond: confirm/photo/return/not_found)
- Admin APIs: lost-items (GET + PATCH mediate), fare-disputes (GET + PATCH resolve with wallet credit)
- Dispatch: blocklist filter (driverBlocklists query in scoring loop, fail-open)
- 5 UI surfaces: rider lost-items, rider dispute button (48h-gated), rider block toggle, driver lost-items, admin lost-items + fare-disputes dashboards
- All wired into settings hubs + admin sidebar (Operations group)

### Phase 3: Tax & Accounting Engine — DONE ✅
Implemented by coding model, verified through 3 audit rounds. All code from `docs/Plan/kimi-code/REFERENCE.md`.
- 6 schema tables (taxRates, taxLedgers, dailyTaxSummaries, accountingAccounts, accountingEntries, accountingEntryLines)
- lib/tax.ts: calculateTax (returns null for missing rates), recordTaxLedger, getDailyTaxReport, getTaxReportRange
- lib/accounting.ts: createJournalEntry (Dr=Cr validation), recordRideCompletion (balanced 5-line entry), recordDriverPayout (balanced), recordSubscriptionSale, recordWalletTopup, recordCancellationFee, recordTip, recordRiderPassPurchase
- Admin Tax API (3 routes): config CRUD, daily summary, range report + CSV export (taka)
- External Accounting API (4 routes): entries, balance, trial-balance (isBalanced check), CSV export — auth via x-accounting-api-key header
- Admin Tax Dashboard: StyleSheet UI, date picker, summary cards, breakdown, rate config, Finance group in sidebar
- Integration wiring: complete+api.ts (ride completion + tip), instant-pay+api.ts (payout + source tax), callback+api.ts (subscription sale + wallet top-up + rider pass purchase), cancel+api.ts (cancellation fee) — all try/catch non-blocking
- 3 PostgreSQL triggers: daily tax summary auto-aggregation, account balance auto-update, commute updated_at
- Seed data: 4 tax rates (VAT 5% + AIT 1%), 14 chart of accounts
- ACCOUNTING_API_KEY in .env.local for external API auth

### Phase 4: Safety & Future — PARTIAL
- Auto-Accept — **IMPLEMENTED** (dispatch logic + settings screen; was schema-only)
- Driver Promo Codes — backend scheduler credits exist; admin UI rider-only, no driver view
- Voice Calling (concept)
- Crash Detection (concept)
- Female Driver Preference (concept)
- Offline Map Caching (concept)

---

## 9. Remaining Items

| Item | Priority | Status |
|------|----------|--------|
| Zone Z-4 (heartbeat coordinate-based zone resolution, 3-beat hysteresis, 10-min refresh) | High | DONE — heartbeat uses `getZoneForLocation(lat, lng)` for multi-zone resolution |
| Zone cleanup: remove nil-UUID sentinel writes (estimate/request/schedule), map `zones_not_configured` → 503 at callers | High | DONE — sentinel removed; all callers use validatePickupZone with 503/422 |
| `zone_multi_active_enabled` admin-settable + seeded (defaults false → multi-zone path dormant) | High | DONE — added to config+api.ts ALLOWED_KEYS + seed-platform-config.js |
| Apply-promos ↔ redeem API contract fix (screen sends `{code}`; API requires vehicle_type + pickup coords) | High | 400 as written — promo apply flow broken at the screen |
| SOS offline retry | Medium | **DONE** — `lib/sosQueue.ts` AsyncStorage queue + reconnect replay (backoff, dedupe) + 5s client debounce |
| SOS server-side cooldown enforcement (time-bound dedupe vs any-open-alert) + SOS active-alert polling | Medium | Config value still read but dead; active-polling still not implemented |
| Schedule overlap-window semantics + overlap API | Medium | DONE — overlap check via lib/scheduleUtils.ts + /api/ride/schedule/overlap; book-for-other hardening + quote pending |
| Auto-redispatch on driver cancellation | Medium | Scheduler cancels stale matched rides but nothing re-dispatches |
| Driver earnings goal — restore or formally drop | Medium | REGRESSION: UI absent (earnings-tab rebuild); breakdown API remains |
| Payout-method GET + payout-methods management screen (D10) | Medium | POST exists only (onboarding capture) |
| Min-rate settings screen (D9, reuse MinRateSlider + slider-config) | Medium | Component + API have zero importers |
| Pass-first discount precedence (currently rider-selectable) | Low | Engine exists; precedence not enforced |
| Commit the fleet work (portal + APIs + libs + admin screens + auth guard + tests relocation) | **High** | All working-tree only — one `d99c089`-successor commit needed before any deploy |
| Fare Framework v6 Stage 1 promotion | High (gated) | Blocked on fare-gate-metrics thresholds going green; zone fee + night mult + pickup charge stay inert until then |
| Orphan route deletion: scheduling-user-ride, schedule-ride-after-promo | Low | True orphans (schedule-ride + no-drivers-available are referenced — KEEP) |
| Unwire-or-wire: ProgressBar, Badge, Avatar, CheckboxGroup, HeatmapOverlay, MinRateSlider, LiveMeter components | Low | Built, zero importers (LiveMeter is Stage-1 gated on `ride:progress` WS events) |
| i18n sweep (bn strings real; only 2 screens consume; driver language choice not persisted) | Low | `i18n/` system live |
| Deep linking with expo-linking (promo→apply-promos, push→ride-tracking; dep present, imported nowhere) | Low | Only `ride://` manual use in PaymentResultScreen |
| Instant pay / payout history | Deferred | Separate withdrawal epic (Plan 05 Q3) |
| Driver Promo Codes UI + admin target_role form | Future | Scheduler auto-credits exist |
| Voice Calling / Number Masking | Future | Concept — saved in P5-GROWTH-REFERENCE.md |
| Crash Detection | Future | Concept — saved in P5-GROWTH-REFERENCE.md |
| Female Driver Preference | Future | Concept |
| Offline Map Caching | Future | Concept |
| Gamification (tiers/streaks/achievements) | Future | Full code saved in P5-GROWTH-REFERENCE.md |
| AI Demand Intelligence | Future | Full code saved in P5-GROWTH-REFERENCE.md |
| Weather-Adaptive Surge | Future | Full code saved in P5-GROWTH-REFERENCE.md |
| Terms / Privacy owner legal review | Low | Real content live since July 2026 (inline per-screen) — owner sign-off unconfirmed |
| Maestro device E2E pass (booking path, SOS, payments) | Recommended | H-3 booking path verified by code-trace only |
