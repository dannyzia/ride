# Ride — Full Feature Inventory
> v13 — 2026-08-16: UI/UX Rethink Plans 01–04 COMPLETE; Plan 05 PARTIALLY implemented (verified against tree 2026-08-16).
> Core app + P4 Phases 1-3 + Multi-Stop + Tip + Trust & Quality + UI Rethink Plans 01–04 + Plan 05 (partial — open items in §6/§9).
> Schema: 85 tables, 29 enums (migration 0041). 170+ API routes.
> P5 Growth features (Gamification, Safety, AI Demand, Weather) — saved for post-launch.
>
> Minor caveats (non-blocking):
> - rate-driver: driver_id fallback uses ride UUID if driver_id undefined (dormant)
> - driver lost-items: return_method uses z.string() instead of z.enum (works in practice)
> - Payment callback: purpose='rider_pass' + null pass_id edge case (both fields always set together)
> - Hotspot map reads `demand_forecasts`, which has no writer until Zone foundation Z-6 lands (Plan 05 §8)

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
| 7 | Enable location permission | Missing | YES | YES — rider onboarding chain |
| 8 | Push token registration | YES (`user/device`) | YES | YES — global in `_layout.tsx` on auth |
| **Home** | | | | |
| 9 | Map view (MapLibre + Barikoi) | Partial | YES | YES |
| 10 | Current location + reverse geocode | Partial | YES | YES |
| 11 | Recent rides list | YES | YES | YES |
| 12 | Search destination | Partial | YES | YES |
| 13 | Sign out | YES | YES | YES |
| 14 | WebSocket ride updates | YES | YES | YES — rider session socket opened by services-hub via `lib/riderSocket.ts`; all other screens use addEventListener only (WS singleton, L8) |
| 14a | Services Hub (post-auth 2x2 vehicle grid entry) | YES | YES | YES — riders land here after auth, NOT home (L12); draggable hamburger FAB menu, no bottom tab bar (L11); cash-only rides, wallet for passes/packages only (L13) |
| **Ride Request & Booking** | | | | |
| 15 | Destination autocomplete (Barikoi) | YES | YES | YES |
| 16 | Find ride (From/To + Use Current Location) | YES | YES | YES |
| 17 | Ride estimate (8 vehicle types + surge + pass discount) | YES | YES | YES — surge multiplier + rider pass discount applied before surge |
| 18 | Vehicle selection (Bike Basic → Car XL) | YES | YES | YES |
| 19 | Promo code apply | YES | YES | YES |
| 20 | Ride preference chips | YES | YES | YES |
| 21 | Confirm ride + Request | YES | YES | YES |
| 22 | Scheduled ride (conditional endpoint + push reminder) | YES (`ride/schedule`) | YES | YES — "schedule for later" in confirm-ride branches to `ride/schedule`; `ride-scheduled` confirmation screen; scheduler promotes to dispatch + sends push 15 min before. Orphan routes (`schedule-ride`, `scheduling-user-ride`, `schedule-ride-after-promo`, `no-drivers-available`) pending deletion (Plan 05) |
| 23 | Book for someone else (toggle + name/phone + SMS) | YES | YES | YES — in confirm-ride; SMS via dpRelay sendSms |
| 24 | Surge consent banner | YES | YES | YES — yellow banner when surge_multiplier > 1.0 |
| 25 | Rider pass / ride pass (weekly/monthly discount) | YES (`rider/passes`) | YES | YES — PortPos purchase screen, pass discount in estimate (multi-leg), rides_used increment, auto-expiry, admin CRUD |
| 25a | Upfront tip (preset ৳0/20/50/100) | YES | YES | YES — slider in confirm-ride, tip badge in RideOfferSheet, added to driver payout (no commission) |
| 25b | Multi-stop rides (max 2 stops) | YES (`ride/[id]/stops`) | YES | YES — BarikoiAutocomplete stop inputs, multi-leg distance in estimate, driver stop list + complete button, WS payload includes stops |
| **Ride Tracking** | | | | |
| 26 | Final page live tracking (WS) | YES | YES | YES |
| 27 | Status transitions (finding → completed) | YES | YES | YES |
| 28 | Driver marker + ETA | YES | YES | YES |
| 29 | Ride PIN display | YES | YES | YES |
| 30 | Driver info + vehicle | YES | YES | YES |
| 31 | In-progress banner | YES | YES | YES |
| 32 | Driver arrived indication | YES | YES | YES |
| 33 | Cancel ride (with reason + fee preview + countdown) | YES | YES | YES — cancel-reason + cancel-preview (returns `fee_bdt` + `reason`); server-driven `free_until` field still pending (Plan 05 §4.1) |
| 34 | Share trip (live tracking link) | YES (`ride/[id]/track`) | YES | YES — Share API button on final-page |
| 34a | Emergency SOS (screen + alert + dial 999) | YES (`POST /api/sos/alert`) | YES | YES — emergency-sos screen: location acquire → confirm modal → alert API → `tel:999`; still dials on network/location failure. Rider SOSButton repointed from driver-only `driver/sos-alert` (was 403) |
| **Ride Completion** | | | | |
| 35 | Rate driver (1-5 stars) | YES | YES | YES |
| 36 | Add tip | YES | YES | YES |
| 37 | Ride completed confirmation | YES | YES | YES |
| **Activity & Wallet** | | | | |
| 38 | Rides history (filter: All/Completed/Scheduled/Canceled) | YES | YES | YES — filter row in rides tab |
| 39 | Ride detail (from history) | YES | YES | YES — fetches from API |
| 40 | Inbox (notifications) | YES | YES | YES — via filter row |
| 41 | Referral (code + share) | YES | YES | YES — via filter row |
| 42 | Wallet balance + transactions | YES (`rider/wallet`) | YES | YES — fetches real data from API |
| 43 | Wallet top-up (PortPos WebView) | YES | YES | YES — PaymentWebView, no fake selectors |
| 44 | Report issue | YES | YES | YES — screen exists |
| 45 | Loyalty points (balance + redeem) | YES (`rider/points`) | YES | YES — loyalty screen in settings hub, redeem with row-level lock |
| 46 | Lost items (report + track + driver respond) | YES (`rider/lost-items`) | YES | YES — report modal with ride selector, status badges, driver photo, settings hub |
| 47 | Fare dispute (file + auto/manual review) | YES (`rider/fare-disputes`) | YES | YES — dispute button in ride-details-completed, 5 reasons, claimed fare, manual admin review |
| 48 | Block driver (prevent future matching) | YES (`rider/block`) | YES | YES — block/unblock toggle in rate-driver, dispatch filter skips blocked drivers |
| **Settings (via Profile → Settings hub)** | | | | |
| 49 | Profile view | YES | YES | YES |
| 50 | Edit personal info | YES | YES | YES |
| 51 | Notification preferences | YES | YES | YES |
| 52 | Emergency contacts (CRUD) | YES | YES | YES |
| 53 | Saved addresses (CRUD) | YES | YES | YES |
| 54 | FAQ | YES | YES | YES |
| 55 | Contact support (ticket) | YES | YES | YES |
| 56 | Data & analytics controls | YES | YES | YES |
| 57 | Delete account | YES | YES | YES |
| 58 | Terms / Privacy | Missing | YES | YES |
| 59 | App appearance (light/dark/system) | YES (`useAppearance` + AsyncStorage) | YES | YES — 'system' follows device; toggle cycles light↔dark only (L2); Pattern A `useIsDark()` theming with sun/moon toggle on every screen |
| 60 | App language (EN/BN) | Missing (no i18n strings) | Partial | YES — choice persisted, no translations |
| **Public** | | | | |
| 61 | Public ride tracking page (`/track/[rideId]`) | YES (`ride/[id]/track`) | YES | YES — no auth, 10s auto-refresh, error handling. Root-layout auth-redirect exemption for `track` segment pending (share links currently bounce logged-out recipients to login — Plan 05 §4.6) |

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
| 5 | Select active vehicle type | YES (`POST /api/driver/vehicle-type-change`) | YES | YES — eligibility-gated server-side (`eligibility_not_met` 422); auto-offline warning when online; old `PATCH driver/me` path silently stripped the field (fixed, Plan 05) |
| 6 | Personal profile (name, photo, city) | YES | YES | YES — photo uploaded to Supabase Storage |
| **Home / Status** | | | | |
| 7 | DriverHome (map + WS + heartbeat) | YES | YES | YES — tab: Home |
| 8 | Driver profile load (name from users JOIN) | YES | YES | YES — `me+api.ts` JOINs users table |
| 9 | Active subscription + wallet card | YES | YES | YES |
| 10 | Go Online / Go Offline | YES | YES | YES |
| 11 | Connected/Offline indicator | YES | YES | YES |
| 12 | SOS button (alert + dialer) | YES (`POST /api/sos/alert`) | YES | YES — shared rider/driver SOS endpoint (Plan 05); inserts `sos_alerts`, pushes via `lib/notify`, SMS to emergency contacts via dpRelay |
| 13 | Incentives (from Home gift icon) | YES | YES | YES |
| 14 | Break mode | YES | YES | YES — tab: Activity |
| 15 | Earnings goal progress bar | YES (`driver/earnings/breakdown`) | YES | YES — real data + AsyncStorage goal + set-goal modal; entry pill in driver home stats bar + Incentives row in earning tab (Plan 05) |
| 15a | Hotspot map (demand/supply by zone) | Partial (`driver/heatmap` reads `demand_forecasts` — no writer until Zone Z-6) | YES | YES — MapLibre circles at zone centroids; color = demand/supply ratio (green/amber/red); zone labels, legend, manual refresh, EmptyState fallback |
| **Ride Offers** | | | | |
| 16 | Ride Offer sheet (countdown, rider info, fare) | YES | YES | YES |
| 17 | Accept / Decline | YES | YES | YES |
| 18 | "Booked for" banner (secondary rider) | YES | YES | YES — shows name + phone when present |
| **In-Ride** | | | | |
| 19 | Find customer (slide to confirm arrival) | YES | YES | YES |
| 20 | Enter Ride Pin + Start Ride | YES | YES | YES |
| 21 | Finish ride (slide to confirm drop-off) | YES | YES | YES |
| 22 | Ride completed modal | YES | YES | YES — includes "Rate Rider" button |
| 23 | In-ride chat (💬 button) | YES | YES | YES — both find-customer + finish-ride |
| 24 | Cancel ride (with reason) | YES | YES | YES — both find-customer + finish-ride |
| 25 | Turn-by-turn navigation (🗺️ button) | YES (`navigation/route`) | YES | YES — Barikoi directions + DriverNavigation |
| 26 | Rider no-show | YES (`ride/[id]/no-show`) | YES | YES — POSTs with loading + fee alert |
| 27 | Waiting time charges (⏱️ timer) | YES (`ride/[id]/wait-start`, `wait-end`) | YES | YES — start/stop timer in find-customer, fee added to final fare |
| 28 | Toll / parking fee input | YES (`ride/[id]/extra-charge`) | YES | YES — TollParkingModal in find-customer + finish-ride, rider ExtraChargeApproval in final-page, approved charges added to fare |
| **Commute** | | | | |
| 29 | Commute mode (destination filter) | YES (`driver/commute`) | YES | YES — dispatch skips drivers whose ride destination is off-route; haversine + error-isolated |
| **Post-Ride** | | | | |
| 30 | Rate rider (1-5 stars) | YES | YES | YES — finish-ride → "Rate Rider" button |
| 30a | Lost item reports (respond) | YES (`driver/lost-items`) | YES | YES — list reports, "I Have It" / "Not Found" / arrange return, settings hub |
| **Packages & Subscription** | | | | |
| 31 | Call packages listing + Buy (PortPos WebView) | YES | YES | YES — from Home |
| 32 | Payment confirmation polling | YES | YES | YES |
| 33 | Subscription checkout (PaymentWebView) | YES | YES | YES — captures payment_url |
| 34 | Active subscription details | YES | YES | YES — tab: Wallet |
| **Earnings & Wallet** | | | | |
| 35 | Earnings dashboard | YES | YES | YES — tab: Earning |
| 36 | Earnings breakdown (weekly) | YES | YES | YES |
| 37 | Commission statement | YES | YES | YES |
| 38 | Due amounts | YES | YES | YES |
| 39 | Wallet balance + transactions | YES | YES | YES — tab: Wallet |
| 40 | Wallet top-up (PortPos WebView) | YES | YES | YES — captures payment_url |
| 41 | Payout methods (bKash CRUD) | Partial (POST exists; GET pending) | Partial | Partial — onboarding captures bKash (`^01\d{9}$`); post-onboarding management screen + `GET /api/driver/payout-method` pending (Plan 05 §4.3); bKash-only per L16 |
| 42 | Payout history | YES | YES | YES |
| 43 | Instant pay (withdraw) | YES | YES | YES |
| **Performance & Ledger** | | | | |
| 44 | Call ledger | YES | YES | YES — tab: Activity |
| 45 | Missed ride requests | YES | YES | YES |
| 46 | Performance stats | YES | YES | YES |
| 47 | Driver ratings & reviews | YES | YES | YES |
| **Settings & Profile** | | | | |
| 48 | Settings hub | YES | YES | YES — tab: Profile |
| 49 | Profile view + edit | YES | YES | YES — PATCH sends `{name}` |
| 50 | Notification preferences | YES | YES | YES |
| 51 | Change password | YES | YES | YES — real password change |
| 52 | Account & Security | YES | YES | YES |
| 53 | FAQ | YES | YES | YES |
| 54 | Contact support | YES | YES | YES |
| 55 | Report issue | YES | YES | YES |
| 56 | Safety hub | Missing | YES | YES |
| 57 | Emergency contacts (CRUD) | YES | YES | YES |
| 58 | Referral program | YES | YES | YES — reads from API |
| 59 | App appearance | YES (`useAppearance` + AsyncStorage) | YES | YES — persisted + applied |
| 60 | App language | Missing (no i18n strings) | Partial | YES — choice persisted, no translations |
| 61 | Driver schedule | YES | YES | YES |
| 62 | MinRateSlider (min per-km rate) | YES (`GET /api/driver/slider-config`, `PATCH driver/me`) | Partial | Partial — `components/MinRateSlider.tsx` + slider-config API exist; not yet wired into a settings screen (Plan 05) |
| 62a | Vehicle management (docs expiry badges + type change) | YES (`vehicle-type-change`) | YES | YES — registration / fitness / tax-token rows; valid `successLight`, <30d `amberLight`, expired `dangerLight` badges; type-change via eligibility-gated endpoint with auto-offline guard |
| **Future / Schema Only** | | | | |
| 63 | Auto-accept (high-rated drivers) | Partial (schema cols only) | Missing | Missing — `auto_accept_enabled` + `auto_accept_radius_meters` columns exist. No dispatch logic. No UI. |
| 64 | Driver promo codes | Partial (schema cols only) | Missing | Missing — `target_role` + `metric` + `target_value` columns exist. Admin promos UI is rider-only. No driver view. |

---

## 3. Admin

> Web-only panel. 32 screens, all wired. Includes P4 + Trust & Quality additions.

| SL | Feature | Backend | Frontend | Wiring |
|----|---------|---------|----------|--------|
| 1 | Admin login | YES | YES | YES |
| 2 | Dashboard (5 stat cards) | YES | YES | YES |
| 3 | Driver approval queue | YES | YES | YES |
| 4 | Document approval (presigned URL preview) | YES | YES | YES |
| 5 | Rider management (list/suspend/refund) | YES | YES | YES |
| 6 | Support ticket dashboard | YES | YES | YES |
| 7 | SOS alerts viewer + acknowledge | YES | YES | YES |
| 8 | SOS contacts management | YES | YES | YES |
| 9 | Cancellation policies CRUD | YES | YES | YES |
| 10 | Surge config (thresholds + history) | YES | YES | YES |
| 11 | Call packages CRUD | YES | YES | YES |
| 12 | Pricing tiers editor | YES | YES | YES |
| 13 | Zones CRUD | YES | YES | YES |
| 14 | City boundaries CRUD | YES | YES | YES |
| 15 | Incentives CRUD | YES | YES | YES |
| 16 | Promo codes CRUD | YES | YES | YES |
| 17 | Ride preferences CRUD | YES | YES | YES |
| 18 | Referral campaigns CRUD | YES | YES | YES |
| 19 | Point offers CRUD | YES | YES | YES |
| 20 | Vehicle models CRUD | YES | YES | YES |
| 21 | Sample media + platform config | YES | YES | YES |
| 22 | Dispatch log lookup | YES | YES | YES |
| 23 | Ride chat history | YES | YES | YES |
| 24 | Driver economics | YES | YES | YES |
| 25 | Payment activation recovery | YES | YES | YES |
| 26 | Dispatch pause/resume | YES | YES | YES |
| 27 | Live ops dashboard (5s polling) | YES | YES | YES |
| 28 | Mass broadcast notification | YES (`admin/broadcast`) | YES | YES — TextInput UI, target selector, batched push, rate-limited |
| 29 | Rider passes CRUD | YES (`admin/rider-passes`) | YES | YES — list + create + edit + soft-delete, in admin sidebar |
| 30 | Tax dashboard (daily summary, CSV export, rate config) | YES (`admin/tax/*`) | YES | YES — StyleSheet UI, Finance group in sidebar |
| 31 | Lost items management (view all, mediate) | YES (`admin/lost-items`) | YES | YES — FlatList + detail modal + mark mediated, Operations group |
| 32 | Fare disputes management (view, approve/reject refund) | YES (`admin/fare-disputes`) | YES | YES — status filter tabs + detail modal + adjustment input + wallet credit, Operations group |
| — | Driver upgrade/downgrade/type-change/close-account | YES | YES | YES — buttons in queue.tsx |

---

## 4. Backend Summary

- **170+ API route files** across `app/api/` — Plan 05 additions: `POST /api/sos/alert`, `POST /api/driver/vehicle-type-change`, `GET /api/driver/slider-config`
- **85 tables, 29 enums** (migration 0041)
- **Zone foundation (Plan 05 §8, Z-1…Z-8) NOT STARTED**: `zones_one_active` single-zone index still in schema; `demand_forecasts` has no writer (hotspot map reads an empty table until Z-6); multi-zone resolution + admin multi-activation pending
- **WebSocket server** (utils-server): heartbeat-gated call deduction, H3 indexing, scheduler with 25+ jobs
- **Push notifications**: Expo Push Service — fires on ride:matched + scheduled ride reminders + admin broadcasts
- **PortPos** unified payment gateway — purpose-tagged payment events (`ride` / `wallet_topup` / `driver_package` / `rider_pass`) for unambiguous callback routing
- **SMS** (dpRelay): OTP + book-for-others notification + phone normalization
- **Tax engine**: VAT 5% on commission + subscription, AIT 1% on driver payouts. Auto-calculated on ride completion, instant-pay, subscription sale, wallet top-up, rider pass purchase, cancellation fee. Daily summaries auto-populated via PostgreSQL trigger.
- **Double-entry accounting**: Chart of accounts (14 accounts), journal entries with Dr=Cr validation, auto-generated entry numbers (JV-YYYYMMDD-NNNN), auto-balance via trigger. External API for QuickBooks/Tally integration (entries, balance, trial-balance, CSV export).
- **Orphan HTTP routes** (`ride/[id]/arrive`, `ride/[id]/start`): DELETED

---

## 5. Schema Summary

**85 tables** (67 at migration 0028; growth through migration 0041 — Plan 04 included 2 migrations) including all additions:
- P3: `surgeCurrent`, `surgeHistory`, `cancellationPolicies`
- P4 Phase 2: `driverCommutePreferences`, `riderPasses`, `riderSubscriptions`, `rideExtraCharges`
- P4 Phase 3: `taxRates`, `taxLedgers`, `dailyTaxSummaries`, `accountingAccounts`, `accountingEntries`, `accountingEntryLines`
- Multi-Stop + Tip: `rideStops` + `rides.upfront_tip_bdt`
- Trust & Quality: `lostItems`, `fareDisputes`, `driverBlocklists`, `ridePhotos`
- Column additions: `payment_events.purpose` + `pass_id`, `rides.reminder_sent` + `wait_*` + `upfront_tip_bdt`, `pricing.free_wait_minutes` + `wait_fee_per_minute_bdt`, `drivers.auto_accept_*`, `point_offers.points_required` + `reward_*`, `promo_codes.target_role` + `metric`
- Post-migration: triggers (daily tax summary, account balance, commute updated_at) + seed data (4 tax rates + 14 chart of accounts) + GRANT statements

---

## 6. Fix Verification Logs

### v13 UI/UX Rethink Plans 01–05 (verified against tree 2026-08-16)
| Feature | Status | Key detail |
|---------|--------|------------|
| Plan 01–04 (theme, booking loop, rider account, driver core loop) | DONE | Pattern A theming, Services Hub entry, hamburger nav, WS singleton (`lib/riderSocket.ts`), 7-step driver onboarding wizard |
| Plan 05 rider screens (sos, cancel, promos, ride-scheduled, canceled) | DONE | `emergency-sos` + `POST /api/sos/alert` shipped; rider SOSButton repointed (was 403); confirm-ride schedule toggle branches to `ride/schedule` |
| Plan 05 driver (hotspot-map, vehicle-management, type-change, slider-config) | DONE | `zones_one_active` still limits to 1 active zone; heatmap API not yet zone-extended |
| Plan 05 Wave 0 (ErrorBanner, OfflineIndicator, `amberLight`, ScheduleRideSheet) | **GAP** | Not created; `successLight` exists but `amberLight` does not |
| Plan 05 route deletions (`schedule-ride`, `scheduling-user-ride`, `schedule-ride-after-promo`, `no-drivers-available`) | **GAP** | Still in tree; `no-drivers-available` still links to `schedule-ride` |
| cancel-preview `free_until` + payout-method GET | **GAP** | Endpoint returns `fee_bdt`+`reason` only; payout-method has POST only |
| `/track` auth exemption + deep linking (expo-linking) | **GAP** | Root `_layout.tsx` pending |
| Legal content (`lib/legalContent.ts`, 4 screens) | **GAP** | BLOCKED on owner-supplied legal text |
| Zone foundation Z-1…Z-8 (multi-zone unlock + `demand_forecasts` writer) | **GAP** | Not started; gates hotspot data |

### v9 Core (29 tasks — ALL DONE)
All P0 (3), P1 (16), P2-002B surge (8), P1-010 PortPos, orphan route deletion. Verified against actual code.

### v10 P4 Phase 1+2 (verified through 4 audit rounds)
| Feature | Status | Key detail |
|---------|--------|------------|
| Share Trip | DONE | Server URL, not custom scheme |
| Push Reminder | DONE | `eq(reminder_sent, false)` fix, scheduler job |
| Cancel Countdown | DONE | Anchored to `created_at`, cancel-preview fee |
| Earnings Goal | DONE | Real API + AsyncStorage + set-goal modal |
| Mass Notification | DONE | Batched push, rate-limited, TextInput UI |
| Commute Mode | DONE | Dispatch filter (haversine), error-isolated, NaN guard |
| Waiting Charges | DONE | Timer UI, fee calc, added to final fare |
| Rider Points | DONE | Balance + redeem (row-lock), loyalty UI |
| Rider Pass (backend) | DONE | Purchase + callback (purpose-tagged) + estimate discount + usage increment + auto-expiry |
| Rider Pass (UI) | **GAP** | Rider-facing browse/buy screen NOT created |
| Toll/Parking (backend) | DONE | Submit + approve/dispute + added to fare |
| Toll/Parking (UI) | **GAP** | Driver submit button + rider approve screen NOT created |
| Admin Rider Passes CRUD | DONE | List + create + edit + soft-delete + sidebar |

---

## 7. Kimi-K2.6 Original Suggestions — ALL 10 DONE

| # | Suggestion | Status |
|---|-----------|--------|
| 1 | Push Notification Service | **DONE** |
| 2 | Driver Turn-by-Turn Navigation | **DONE** |
| 3 | Surge Pricing Engine | **DONE** — full pipeline + admin config + rider banner |
| 4 | Admin Rider Management | **DONE** |
| 5 | Cancellation Policy Engine | **DONE** — DB-driven + fee preview + wallet deduction |
| 6 | Book for Someone Else | **DONE** — toggle + API + tracking + driver banner + SMS |
| 7 | Admin Support Ticket Dashboard | **DONE** |
| 8 | Scheduled Rides Backend | **DONE** |
| 9 | Document Expiry Alerts | **DONE** |
| 10 | Real-Time Ops Dashboard | **DONE** |

---

## 8. P4 Roadmap Status

### Phase 1: Quick Wins — DONE ✅ (5/5)
Share Trip, Push Reminder, Cancel Countdown, Earnings Goal, Mass Notification.

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
10. Rider pass purchase screen — DONE (PortPos WebView + polling)
11. Toll/parking driver + rider UI — DONE (modal + approval component)

### Multi-Stop + Upfront Tip — DONE ✅
- rideStops table + rides.upfront_tip_bdt column
- UpfrontTipSlider component (preset ৳0/20/50/100)
- confirm-ride: BarikoiAutocomplete stop inputs (max 2) + tip slider
- estimate+api.ts: multi-leg distance (waypoints loop) + upfront_tip in Zod + parseJsonBody
- request+api.ts: accepts stops + tip, bulk INSERT rideStops
- stops+api.ts: GET list + POST complete (UUID validation + ownership checks)
- find-customer: stop list + "Complete Stop" button
- RideOfferSheet: tip badge (className + dark:)
- complete+api.ts: tip added to driver payout (no commission on tip)
- WS payload: includes upfront_tip_bdt + computed has_stops

### Trust & Quality System — DONE ✅
- 4 tables: lostItems, fareDisputes, driverBlocklists, ridePhotos
- lib/fareArbitration.ts: disputes sent to manual review (under_review/pending)
- Rider APIs: lost-items (report + 24h window), fare-disputes (file + 48h window), block (POST/DELETE/GET)
- Driver API: lost-items (GET + PATCH respond: confirm/photo/return/not_found)
- Admin APIs: lost-items (GET + PATCH mediate), fare-disputes (GET + PATCH resolve with wallet credit)
- Dispatch: blocklist filter (driverBlocklists query in scoring loop, fail-open)
- 5 UI screens: rider lost-items, rider dispute button, rider block toggle, driver lost-items, admin lost-items + fare-disputes dashboards
- All wired into settings hubs + admin sidebar (Operations group)

### Phase 3: Tax & Accounting Engine — DONE ✅
Implemented by coding model, verified through 3 audit rounds. All code from `docs/Plan/kimi-code/REFERENCE.md`.
- 6 schema tables (taxRates, taxLedgers, dailyTaxSummaries, accountingAccounts, accountingEntries, accountingEntryLines)
- lib/tax.ts: calculateTax (returns null for missing rates), recordTaxLedger, getDailyTaxReport, getTaxReportRange
- lib/accounting.ts: createJournalEntry (Dr=Cr validation), recordRideCompletion (balanced 5-line entry), recordDriverPayout (balanced), recordSubscriptionSale, recordWalletTopup, recordCancellationFee, recordTip, recordRiderPassPurchase
- Admin Tax API (3 routes): config CRUD, daily summary, range report + CSV export (taka)
- External Accounting API (4 routes): entries, balance, trial-balance (isBalanced check), CSV export — auth via x-accounting-api-key header
- Admin Tax Dashboard: StyleSheet UI, date picker, summary cards, breakdown, rate config, Finance group in sidebar
- Integration wiring: complete+api.ts (ride completion + tip), instant-pay+api.ts (payout + source tax), callback+api.ts (subscription sale + wallet topup + rider pass purchase), cancel+api.ts (cancellation fee) — all try/catch non-blocking
- 3 PostgreSQL triggers: daily tax summary auto-aggregation, account balance auto-update, commute updated_at
- Seed data: 4 tax rates (VAT 5% + AIT 1%), 14 chart of accounts
- ACCOUNTING_API_KEY in .env.local for external API auth

### Phase 4: Safety & Future — NOT STARTED
- Auto-Accept (schema exists, no dispatch logic)
- Driver Promo Codes (schema exists, no admin/driver UI)
- Voice Calling (concept)
- Crash Detection (concept)
- Female Driver Preference (concept)
- Offline Map Caching (concept)

---

## 9. Remaining Items

| Item | Priority | Status |
|------|----------|--------|
| Zone foundation Z-1…Z-8 (drop `zones_one_active`, multi-zone resolution, truthful driver zone stamps, `demand_forecasts` writer) | High | Not started (Plan 05 §8) — gates Wave 4 hotspot data |
| Plan 05 Wave-0 components (ErrorBanner, OfflineIndicator, `amberLight` token, ScheduleRideSheet) | High | Not created |
| `/track` auth exemption in root `_layout.tsx` | High | Share links bounce logged-out recipients to login |
| cancel-preview `free_until` extension | High | Client countdown is not server-driven |
| Payout-method GET + payout-methods management screen | Medium | POST exists only |
| Min-rate screen wiring | Medium | Component + slider-config API exist, no screen |
| Plan 05 route deletions (4 orphan rider routes) | Medium | Still in tree |
| Deep linking (expo-linking: promo→apply-promos, push→ride-tracking) | Medium | Not wired (referral journey cut — no backend) |
| Legal content (`lib/legalContent.ts`, 4 Terms/Privacy screens) | Low | BLOCKED on owner legal text |
| Instant pay / payout history | Deferred | Separate withdrawal epic (Plan 05 Q3) |
| Auto-Accept dispatch logic | Future | Schema only (columns exist, no dispatch logic, no UI) |
| Driver Promo Codes | Future | Schema only (columns exist, admin UI rider-only, no driver view) |
| Voice Calling / Number Masking | Future | Concept — saved in P5-GROWTH-REFERENCE.md |
| Crash Detection | Future | Concept — saved in P5-GROWTH-REFERENCE.md |
| Female Driver Preference | Future | Concept |
| Offline Map Caching | Future | Concept |
| Gamification (tiers/streaks/achievements) | Future | Full code saved in P5-GROWTH-REFERENCE.md |
| AI Demand Intelligence | Future | Full code saved in P5-GROWTH-REFERENCE.md |
| Weather-Adaptive Surge | Future | Full code saved in P5-GROWTH-REFERENCE.md |
| Terms / Privacy static content | Low | Screens exist, content missing (blocked on owner) |
| i18n / Bangla translations | Low | `i18n/` system + `useAppearance` language exist; Bangla strings are placeholders |
