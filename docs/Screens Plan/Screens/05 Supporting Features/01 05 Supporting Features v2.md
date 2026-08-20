# PLAN 05 v2.0 — Supporting Features (Canonical, Tree-Verified)

**Supersedes:** the original Plan 05 draft, the Addendum, all AI review rounds, and the 2026-08-16 "FINAL Locked Plan". Where anything above conflicts with this document, **this document wins**.

**Method:** Every screen, route, endpoint, lib, and component below was re-baselined against `list.txt` (working tree) and every backend behavior was checked against `AGENTS.md` hard rules before being locked. Items are labeled:

- **FACT** — confirmed present in the tree
- **VERIFY** — file exists; contract/behavior must be confirmed before editing
- **NEW** — must be created
- **FIX / RESTYLE / REBUILD** — existing file, disposition as stated

---

## §1 Document Rules

1. This is a **single-source-of-truth spec**. A coding agent must never need to read the superseded drafts. All superseded content is archived, not part of this plan.
2. Every screen has: entry point, API contracts, loading/error/empty states, theming duties, cleanup duties.
3. Every endpoint has: auth, request schema, response shape, error codes, ownership rules.
4. `AGENTS.md` hard rules (paisa, write ownership, `parseJsonBody`, flat Expo params, H3-only, `platform_config` fresh reads, no `console.log`) are **non-negotiable** and are repeated inline wherever they bite.

---

## §2 Authoritative Scope Baseline (tree-verified)

**Counts:** 11 rider screen items + 4 route deletions · 12 driver screen items · 8 shared items · 14 backend API work items · 4 utils-server items · 6 lib items · **1 index-only migration** · 1 hygiene script.

### 2.1 Rider screens

| # | Item | Real path | Status | Disposition |
|---|---|---|---|---|
| R1 | Confirm Ride (+ Schedule toggle, ScheduleRideSheet, promo selector, book-for-other verify) | `app/(main)/(customer)/confirm-ride/index.tsx` | FACT | MODIFY |
| R2 | Ride Scheduled | `app/(main)/(customer)/ride-scheduled/index.tsx` | FACT | REBUILD (rideId param + live data) |
| R3 | Cancel Reason | `app/(main)/(customer)/cancel-reason/index.tsx` | FACT | FIX (server-bound) |
| R4 | Canceled | `app/(main)/(customer)/canceled/index.tsx` | FACT | FIX (server values) |
| R5 | Apply Promos | `app/(main)/(customer)/apply-promos/index.tsx` | FACT | FIX (deep-link param, handoff, redeem call) |
| R6 | Emergency SOS | `app/(main)/(customer)/emergency-sos/index.tsx` | FACT | REBUILD |
| R7 | Lost Items | `app/(main)/(customer)/(tabs)/settings/lost-items/index.tsx` | FACT | FIX (enum + 24h window) |
| R8 | Fare Dispute | `app/(main)/(customer)/fare-dispute/index.tsx` | FACT | VERIFY + status-badge wiring |
| R9 | Ride Passes | `app/(main)/(customer)/(tabs)/settings/ride-pass/index.tsx` | FACT | VERIFY |
| R10 | Share Trip | `app/(main)/(customer)/ride-tracking/[ride_id].tsx` | FACT | VERIFY + link-expiry |
| R11 | Scheduled Ride Detail | `app/(main)/(customer)/ride-details-scheduled/[id]/index.tsx` | FACT | FIX (missing rideId params bug + cancel entry) |
| DEL-1 | `schedule-ride` | `(customer)/schedule-ride/` | FACT | **DELETE after Gate G-1** |
| DEL-2 | `scheduling-user-ride` | `(customer)/scheduling-user-ride/` | FACT | **DELETE after Gate G-1** |
| DEL-3 | `schedule-ride-after-promo` | `(customer)/schedule-ride-after-promo/` | FACT | **DELETE after Gate G-1** |
| DEL-4 | `no-drivers-available` | `(customer)/no-drivers-available/` | FACT | **DELETE after Gate G-1** |

### 2.2 Driver screens

| # | Item | Real path | Status | Disposition |
|---|---|---|---|---|
| D1 | Find Customer (booked-for banner, call split, "Rider not here?" link) | `app/(main)/(rider)/find-customer/index.tsx` (+ `customer-navigation/[rideId].tsx` FACT) | FACT | MODIFY |
| D2 | Rider No-Show | `app/(main)/(rider)/rider-no-show/index.tsx` | FACT | VERIFY + entry wiring |
| D3 | Hotspot Map | `app/(main)/(rider)/hotspot-map/index.tsx` | FACT | BUILD content (shell exists) |
| D4 | Performance Stats | `app/(main)/(rider)/performance-stats/index.tsx` | FACT | FIX (retry bug) + daily bars |
| D5 | Incentives | `app/(main)/(rider)/incentives.tsx` | FACT | FIX (missing auth header ⇒ permanent 401) + restyle + call-credit copy |
| D6 | Earning tab (Incentives row + Earnings Goal modal) | `app/(main)/(rider)/(tabs)/earning/index.tsx` | FACT | MODIFY |
| D7 | Vehicle Management (docs badges, type-change flow) | `app/(main)/(rider)/vehicle-management/index.tsx` | FACT | REBUILD |
| D8 | Select Active Vehicle | `app/(main)/(rider)/select-active-vehicle.tsx` | FACT | **BUG FIX** (PATCHes `vehicle_type` to `/api/driver/me` which strips it — silent no-op) → repoint to `vehicle-type-change`, fold into D7 flow |
| D9 | Minimum Rate | `app/(main)/(rider)/min-rate/index.tsx` | NEW | BUILD (reuses FACT `components/MinRateSlider.tsx`) |
| D10 | Payout Methods | `app/(main)/(rider)/payout-methods/index.tsx` | NEW | BUILD (bKash only, per lock L16) |
| D11 | Subscription content fix | `subscription-plans`, `subscription-checkout`, `subscription-confirmation`, `subscription-details`, `subscription-renewal` (all FACT) | FACT | CONTENT FIX (call packages: N calls + validity days, PortPos) |
| D12 | Driver Settings (entry rows: Vehicle, Payout, Min Rate) | `app/(main)/(rider)/(tabs)/settings/index.tsx` | FACT | MODIFY |

### 2.3 Shared

| # | Item | Path | Disposition |
|---|---|---|---|
| S1 | ErrorBanner | `components/ErrorBanner.tsx` | NEW (Wave 0) |
| S2 | OfflineIndicator | `components/OfflineIndicator.tsx` | NEW (Wave 0; VERIFY NetInfo dep) |
| S3 | EmptyState | `components/plan03/EmptyState.tsx` | FACT — **reuse/restyle; never duplicate** |
| S4 | Schedule sheet | FACT `components/SchedulePicker.tsx` exists → VERIFY it covers date+time+Dhaka display; if yes rename-in-place/reuse as the schedule sheet; only build `ScheduleRideSheet.tsx` if it fails verification | VERIFY-first |
| S5 | SOSButton | `components/SOSButton.tsx` | FACT — **BUG FIX**: repoint from driver-only `/api/driver/sos-alert` (403s for riders today) to `POST /api/sos/alert` |
| S6 | i18n keys | `i18n/locales/{en,bn}/common.json` + `i18n/i18n.ts` | FACT — extend (en full, bn placeholders) |
| S7 | Legal content | `lib/legalContent.ts` | NEW (placeholders) — **BLOCKED on owner copy** |
| S8 | Terms/Privacy ×4 | `(customer)/(tabs)/settings/{terms-of-service,privacy-policy}` + `(rider)/settings/{terms-of-service,privacy-policy}` (all FACT) | FILL from S7 — BLOCKED |

### 2.4 Explicitly OUT of scope (do not build — prevents drift from old drafts)

`insurance` rebuild (stays static info screen, existing profile link stands) · `instant-pay` · `payout-history` (no withdrawal backend — separate epic; wallet keeps "No withdrawals are available yet.") · dedicated `missed-requests` screen (FACT endpoint `app/api/driver/missed-requests+api.ts` feeds the **call-ledger "missed" tab**, which is canonical) · referral deep link (no backend) · charts library (react-native-svg custom only) · any new state store.

---

## §3 Locked Decisions (carry-forward + new)

L-table from prior plans stands (L1–L17). New locks added by this revision:

| Lock | Decision |
|---|---|
| L18 | Scheduling = toggle inside `confirm-ride` + bottom sheet; standalone schedule routes deleted (DEL-1..4) |
| L19 | Cancel UI binds 100% to server: `fee_bdt` + `free_until` + `server_now`. Zero client-side fee/window math |
| L20 | `payment_events` rows for cancel fee / no-show comp are created **only via `lib/paymentEvents.ts`**, inside a DB transaction (AGENTS.md write-ownership) |
| L21 | All geo aggregation uses H3 res-9 via `lib/h3.ts` / `utils-server/h3Index.ts`. **Geohash is banned** |
| L22 | One migration (M1, index-only, zero new tables/columns) unlocks multi-zone + forecast perf. "ZERO migrations" from the old plan is formally rescinded |
| L23 | Emergency contacts single source of truth = `user_emergency_contacts` (`/api/user/emergency-contacts`, FACT). `/api/sos/contacts` must be verified as same-table; if not, deprecated |
| L24 | Driver screens: light-first, ≥56dp targets, no blur/glass, status = color+icon+text always |
| L25 | Feature kill-switches live in `platform_config` (never cached server-side) |
| L26 | i18n = existing `i18n/` + react-i18next; language from `useAppearance()`; no new `lib/i18n.ts`, no `useLanguageStore` |
| L27 | Quote stability: fare estimates carry `quote_valid_until = now + 5 min`; expired quotes re-estimate at request time |

---

## §4 Cross-Cutting Engineering Contracts

### 4.1 Pattern A (mandatory for every touched screen)
```tsx
const isDark = useIsDark();                    // lib/useAppearance
const { setTheme, language } = useAppearance(); // { theme, language, setTheme, setLanguage }
// <StatusBar style={isDark ? "light" : "dark"} />
// Header: <ThemeToggle onPress={() => setTheme(isDark ? "light" : "dark")} />
```
NativeWind `dark:` classes are **allowed** (AGENTS.md). Forbidden: `theme === "dark"` comparisons, `console.log` (use `lib/logger.ts`), `any`, hardcoded colors outside `theme/goRide.ts` tokens.

### 4.2 Money
Integer paisa everywhere in DB/API. Display only via `lib/money.ts` / `lib/format.ts` (`formatBDT(paisa)` → `৳ 245`). User-entered taka → `Math.round(taka * 100)` at the boundary. Applies to: cancel fee, no-show comp, min withdrawal futures, subscription prices, incentive bonuses, fares, min-rate.

### 4.3 Time & clock-skew (NEW)
- All API payloads: UTC ISO-8601. Display: Asia/Dhaka via `lib/time.ts`.
- **Every time-sensitive response includes `server_now` (UTC ISO).** Client countdown = `free_until − server_now`, anchored to local elapsed time — never raw device clock.
- NEW helpers in `lib/time.ts`: `toUtcIso(dhakaDateInput)`, `dhakaTodayKey()` (for earnings-goal reset), `msUntil(iso, serverNowIso)`.
- Schedule picker: min = now+30 min, max = now+7 days, displayed in Dhaka time, sent as UTC.

### 4.4 i18n
Keys added to `i18n/locales/en/common.json` (complete) and `bn/common.json` (empty-string placeholders are acceptable; en is fallback). All Plan-05 screen strings go through `t()` from day one (Wave 0 keys land before Wave 1 screens are edited). Formatting helpers (countdown, relative time, BDT) live in `lib/format.ts`, not in translation files.

### 4.5 Driver daylight & accessibility (L24)
Light-first surfaces even in dark theme for critical fields; labels ≥15px; targets ≥56dp; no animation >200ms on driver screens; every status badge = `StatusBadge` (FACT `components/plan03/StatusBadge.tsx`) with color+icon+text; `accessibilityLabel` on all interactive elements; radio lists announce selection via `accessibilityState={{ selected }}`.

### 4.6 Low-end Android performance budget
Charts: custom `react-native-svg` bars, ≤30 points, memoized, with tabular fallback prop. Map overlays: ≤50 circles; GeoJSON source updated via `setGeoJSON` (or explicit `removeSource` before `addSource`) — **never** repeated `addSource` (GL leak). No new heavy deps.

### 4.7 Resource cleanup (every screen)
All intervals/timeouts cleared on unmount; NetInfo/Linking subscriptions removed; location tasks stopped; map listeners detached; WS handlers scoped to screen lifetime.

### 4.8 Store hygiene
No new stores. `scheduledRides` filter fixed to `'scheduled'` (VERIFY in `store/useRiderStore.ts`) — currently `'pending'`. **All 7 stores gain/verify a `reset()` called from the logout flow** (prevents cross-account leakage of goals, staged promos, SOS state). AsyncStorage keys are user-scoped (`@driver_earnings_goal:{userId}`; key constant lives in `constants/data.ts`).

---

## §5 Rider Feature Specs

### 5.1 R1 — Confirm Ride: schedule toggle, promo selector, book-for-other
**Entry:** home booking flow (FACT). **FSM additions (locked):** `SCHEDULE_TOGGLE_ON/OFF`, `SCHEDULE_TIME_SET`, `PROMO_STAGED`, `PROMO_CLEARED`, `BOOK_FOR_OTHER_ON/OFF` with guards: schedule-on disables immediate-request CTA until time set; `PROMO_STAGED` only from `user_promos`-validated codes.
- Schedule toggle ON → sheet (S4): date + time (Asia/Dhaka display, UTC send), min/max enforced (§4.3), fare estimate shown with "estimate at schedule time; final fare at dispatch" copy.
- Submit → `POST /api/ride/schedule` (§8.10) → on success `router.replace({ pathname: "/ride-scheduled", params: { rideId } })`.
- Promo selector reads staged promo; discount computed **only** by `lib/discountEngine.ts` (§12.4 precedence). Fixes the home screen's unauthorized direct `redeem` call: redeem happens on `apply-promos`; confirm-ride only *selects* already-redeemed promos.
- Book-for-someone-else: VERIFY existing toggle; add edge guards (§12.7).
- Feature flags gate: `feature_scheduled_rides`, `feature_book_for_other`.

### 5.2 R2 — Ride Scheduled (rebuild)
`rideId` param → `GET /api/ride/[id]/details` (FACT route). Shows route, Dhaka datetime, estimated fare, **status chip** (`scheduled`), and actions: "View My Rides" (rides tab), "Cancel ride" → R3 with `rideId`. Loading skeleton; `ErrorBanner` on failure. This screen is reached only via R1 replace-navigation (no orphan entries).

### 5.3 R3/R4 — Cancel Reason / Canceled (server-bound, L19)
On mount: `GET /api/ride/[id]/cancel-preview` (§8.1). Render `fee_bdt` (paisa→taka) and countdown to `free_until` using `server_now`. If `free_until` null → fee applies now. Button danger when fee>0, primary when free. **No hardcoded ৳25, no 120s window anywhere.**
Confirm → `POST /api/ride/[id]/cancel` (§8.11). On `409 ride_not_cancellable` → show returned `current_status` message ("Driver already accepted") + refresh. Canceled screen renders server-returned `reason` + `fee_charged_bdt`.
Scheduled rides follow the scheduled policy branch automatically (server decides).

### 5.4 R5 — Apply Promos (fix)
Accepts `?code=` deep-link param (§13), pre-fills input. List = `GET /api/promo/list` (FACT). Redeem = `POST /api/promo/redeem` (FACT) — on success stage promo for confirm-ride selector (store field, reset on logout). Fixes the current no-op `applyPromo` store action. Errors via `ErrorBanner` ("Invalid or expired code").

### 5.5 R6 — Emergency SOS (rebuild) + S5 SOSButton fix
Flow: tap → confirm modal (double-tap protection) → **`Location.getCurrentPositionAsync()`** → `POST /api/sos/alert` (§8.2) → dial `tel:999` via `Linking` **regardless of API outcome**.
- Location failure → still dial 999; warning "Location could not be shared".
- Network failure → still dial 999; queue alert in AsyncStorage (`@sos_pending:{userId}`), retry on NetInfo reconnect (§4.7 cleanup).
- Post-trigger lifecycle: screen polls `GET /api/sos/active` (10s); shows `triggered → acknowledged → resolved` states; "I'm safe" button → `POST /api/sos/resolve` (§8.3).
- Emergency number 999 tappable. Contacts managed in FACT `(tabs)/settings/emergency-contacts/` (link shown).
- S5: rider `SOSButton` repointed to `/api/sos/alert` (current driver-only endpoint returns 403 — live bug).
- Driver parity: driver SOS stays on existing `/api/driver/sos-alert` (FACT) with entry verified in `(rider)/safety/index.tsx`; admin sees both via FACT `app/admin/sos-alerts.tsx`.

### 5.6 R7 — Lost Items (fix)
Status enum (locked): `reported → driver_confirmed → photo_provided → arranged_return → resolved | unresolved`. **Rider report = text only (no upload UI)**; `photo_provided` is set by the driver-side flow (FACT `/api/driver/lost-items` + `lib/imageToURL.ts`) — contradiction resolved. Ride picker shows rides completed **≤24h only**; server re-validates. Empty/loading/error states via S3/S1. Contact with driver goes through existing masked chat/call for that ride; support mediation via FACT `app/admin/lost-items.tsx`.

### 5.7 R8 — Fare Dispute (verify + badge)
VERIFY reasons/units (taka input → paisa §4.2). 48h window enforced client+server. Post-submit: `activity`/history-detail shows dispute status badge from `GET /api/rider/fare-disputes` (FACT) — minimal rider-side lifecycle; full tracking UI deferred (§17).

### 5.8 R9/R10 — Passes & Share Trip
VERIFY `ride-pass` uses **`GET /api/rider/passes` (FACT) for active-pass state** and `GET /api/admin/rider-passes` (FACT) for catalog only — never derive usage from catalog. Share Trip: share button emits `{EXPO_PUBLIC_SERVER_URL}/track/{rideId}`; **link dies when ride reaches a terminal status** (§12.8); public page FACT `app/track/[rideId].tsx` gets no-cache/noindex headers + expiry message.

### 5.9 R11 — Scheduled Ride Detail (fix)
Fix missing `rideId` params bug; add "Cancel ride" entry → R3; live status from details endpoint.

---

## §6 Driver Feature Specs

### 6.1 D1 — Find Customer / Customer Navigation (both FACT paths confirmed)
- "Booked for [Name] · [Phone]" banner when `secondary_rider_*` present in `ride:offer` payload (already on the wire).
- Call split: primary call button → **passenger**; secondary "Contact Booker" → booker (`tel:` both).
- "Rider not here?" link: **visible from the moment status = `driver_arrived`** (not after 5 min), hidden on any status change → routes to D2.
- SOS banner uses `infoLight` token (not `#EEF2FF`).

### 6.2 D2 — Rider No-Show (verify + entry)
VERIFY existing `POST /api/ride/[id]/no-show` (FACT route): sets `status='cancelled'`, `cancel_reason='rider_no_show'` — **no enum change needed**. Wait timer from FACT `wait-start/wait-end`; free wait = `max_free_wait_seconds` (system_config, default 60s; longer windows are ops config, not code). Compensation from `platform_config`, written via `lib/paymentEvents.ts` in transaction (L20). Entry: D1 link only.

### 6.3 D3 — Hotspot Map (build content)
FACT shell. Data from extended `GET /api/driver/heatmap` (§8.5). Render: MapLibre circles at zone centroids — size = predicted demand, color = demand/supply ratio (green `primary` / yellow `amber` / red `danger`), opacity = confidence, 13px white-outlined zone-name label. Manual refresh only + "Last updated". Legend bar. Mandatory `EmptyState` (S3) when no active zones/no forecasts. Boot states: no location permission → city-center default camera; map style failure → `ErrorBanner` + retry. GeoJSON update rules per §4.6. Entry: hotspot pill in driver home stats bar (FACT `(rider)/(tabs)/index.tsx`, `components/DriverStatsBar.tsx`) — pill disabled with helper text when no forecast data. Feature flag `feature_hotspots`.

### 6.4 D7/D8 — Vehicle Management rebuild + select-active-vehicle bug fix
One-vehicle model. Rows: registration date, `fitness_expires_at`, `tax_token_expires_at` — **no insurance column, no photo** (vehicle-type icon). Badges via `StatusBadge`: valid `successLight`, <30d `amberLight`, expired `dangerLight` + "Renew" CTA → FACT `documents/index.tsx`.
D8 fix: stop PATCHing `vehicle_type` to `/api/driver/me` (silently stripped) → use `POST /api/driver/vehicle-type-change` (§8.7); D8 route becomes a redirect into D7's flow (deleted after Gate G-2).
Type-change flow: if `is_online` → warning modal → **server auto-offlines in-transaction** → radio list of the 8 enum values from `lib/vehicleTypes.ts` → submit → on success prompt to go back online. Eligibility per §8.7.

### 6.5 D4 — Performance Stats (fix + bars)
Fix retry-refetch bug (§15 W4.12 pattern). Add daily-earnings bars from `daily_totals` (§8.6): react-native-svg, ≤30 points, memoized, tabular fallback. Weekly/Monthly segmented control; compare-vs-previous badges.

### 6.6 D5/D6 — Incentives + Earning tab
D5: add missing auth header (permanent 401 today); restyle Pattern A; rewards are **call credits** — show current credit balance and "Credits are added to your call ledger automatically" copy (FACT `call-ledger.tsx` + `useCallLedgerStore`). D6: "Incentives" row + **Earnings Goal modal**: amount input (৳100–৳100,000), persisted `@driver_earnings_goal:{userId}` = `{ amount_bdt, set_on }`; progress resets when `set_on ≠ dhakaTodayKey()` but goal persists; unset state shows "Set a daily earnings goal…" + button.

### 6.7 D9 — Minimum Rate (NEW screen, reuse-first)
Reuse FACT `components/MinRateSlider.tsx` (VERIFY dark-mode styling) + `GET /api/driver/slider-config` (§8.8) + `PATCH /api/driver/me { min_per_km_bdt }` validated by `validateDriverMinKm()` (AGENTS.md mandate). Expectation copy: current zone/vehicle per-km baseline + "Higher minimum = fewer offers" warning + reset-to-default. Entry: D12 settings row.

### 6.8 D10 — Payout Methods (NEW screen)
bKash only (L16). Active method card (masked number, Default badge) + add modal (`^01\d{9}$`). APIs: FACT `POST /api/driver/payout-method` + NEW GET (§8.4). Entry: D12 settings row.

### 6.9 D11/D12 — Subscriptions content + settings entries
D11: rewrite plan copy to call-packages (N calls + validity days, PortPos checkout — FACT flow via `lib/activateSubscription.ts` + `lib/paymentEvents.ts`). D12: SettingsRows for Vehicle, Payout Methods, Min Rate (reuse FACT `components/plan03/SettingsRow.tsx`).

---

## §7 Shared Components (Wave 0 — built BEFORE consumers)

### 7.1 ErrorBanner (NEW)
```ts
interface ErrorBannerProps { message: string; onRetry?: () => void; type?: "error"|"warning"|"info"; }
```
Full width, 12px radius; error=`dangerLight/danger`+`alert-circle`, warning=`amberLight/amber`, info=`infoLight/info`; retry button right-aligned, matching color; `accessibilityRole="alert"`.

### 7.2 OfflineIndicator (NEW)
Fixed 40px top bar, `amberLight/amber`, `wifi-outline` + "No internet connection", animated slide-in, auto-dismiss on reconnect, NetInfo subscription cleaned up on unmount.

### 7.3 EmptyState — reuse `components/plan03/EmptyState.tsx` (FACT). Restyle to Pattern A if needed; **duplicates are a review-blocker**.

### 7.4 Reuse mandates
`StatusBadge`, `SettingsRow`, `TransactionRow` (FACT plan03) for all badges/rows; `LoadingRider`/`Skeleton` for loading; `DriverStatsBar` for the hotspot pill host.

---

## §8 Backend Contracts (complete — no screen may call an endpoint not listed here)

All routes: `verifySupabaseToken(request)` / `requireRole` · bodies via `parseJsonBody(request, zodSchema)` · flat Expo params `GET(request, { id }: { id: string })` · errors `{ error: 'machine_code', message }` · money integer paisa.

| # | Endpoint | Method | Status |
|---|---|---|---|
| 8.1 | `/api/ride/[id]/cancel-preview` | GET | EXTEND |
| 8.2 | `/api/sos/alert` | POST | **NEW** |
| 8.3 | `/api/sos/resolve` + `/api/sos/active` | POST / GET | **NEW** |
| 8.4 | `/api/driver/payout-method` | GET | ADD to FACT file |
| 8.5 | `/api/driver/heatmap` | GET | EXTEND |
| 8.6 | `/api/driver/earnings/breakdown` | GET | EXTEND |
| 8.7 | `/api/driver/vehicle-type-change` | POST | VERIFY/EXTEND (FACT file) |
| 8.8 | `/api/driver/slider-config` | GET | VERIFY (FACT file) |
| 8.9 | `/api/driver/me` | PATCH | VERIFY `min_per_km_bdt` path |
| 8.10 | `/api/ride/schedule` | POST | VERIFY/EXTEND (FACT file) |
| 8.11 | `/api/ride/[id]/cancel` | POST | VERIFY/EXTEND (FACT file) |
| 8.12 | `/api/ride/[id]/no-show` | POST | VERIFY (FACT file) |
| 8.13 | `/api/promo/list` + `/api/promo/redeem` | GET/POST | VERIFY (FACT files) |
| 8.14 | `/api/rider/lost-items` | GET/POST | VERIFY enum (FACT file) |
| 8.15 | `/api/rider/passes` | GET | VERIFY active-pass shape (FACT file) |
| 8.16 | `/api/driver/incentives` | GET | FIX auth (FACT file) |
| 8.17 | `/api/driver/performance` | GET | VERIFY (FACT file) |
| 8.18 | `/api/driver/missed-requests` | GET | VERIFY — feeds call-ledger missed tab (FACT file) |
| 8.19 | `/api/admin/zones` | POST/PATCH | MODIFY (Z-5) |
| 8.20 | root `_layout.tsx` | — | MODIFY (track exemption + deep links) |

**8.1 cancel-preview (extended):** branches on ride status — on-demand: `free_until = created_at + platform_config.cancellation_free_window_seconds` (default 300); scheduled: `free_until = scheduled_at − platform_config.cancellation_scheduled_free_hours` (default 4h), fee 0 before it, policy fee after. Response:
```ts
{ fee_bdt: number; free_until: string|null; server_now: string;
  policy: "on_demand"|"scheduled"; ride_status: string; reason_required: boolean }
```
**8.2 sos/alert (NEW):** rider+driver. Zod: `{ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), ride_id: z.string().uuid().optional() }`. `ride_id` must belong to caller → else `403 not_your_ride`. Rate limit: existing alert <15 min → `429 sos_cooldown`. Insert `sos_alerts` (`ride_id` column FACT — no migration), push via `lib/notify`, SMS `user_emergency_contacts` via `lib/dprelay` with circuit breaker (§11.6). SMS template injects secondary-rider context when present: *"EMERGENCY: ride booked by [Booker] for passenger [Passenger]…"*. SMS failure never fails the alert (best-effort, one async retry, `SOS_SMS_FAILED` log). Response `201 { alert_id, status:"triggered", sms_sent:number, location_shared:boolean }`.
**8.3** `resolve`: `{ alert_id }`, creator-only → `resolved_self`. `active`: caller's non-terminal alert or `null`.
**8.4 payout-method GET:** `{ methods: [{ id, method:"bkash", number_masked:"01712****78", is_default, created_at }] }`. POST errors: `400 invalid_number`, `409 duplicate_number`.
**8.5 heatmap (extended):** join `zones` (active), centroid = mean of polygon ring vertices (JS, no PostGIS), join latest `demand_forecasts` per zone → `[{ zone_id, name, lat, lng, predicted_demand, predicted_supply, confidence_score, ratio }]`. `confidence_score` drives circle opacity only (never text).
**8.6 earnings/breakdown (extended):** adds `daily_totals: [{ date:"YYYY-MM-DD", total_bdt:number, trip_count:number }]`, ≤30 rows, grouped by **Dhaka date** (`AT TIME ZONE 'Asia/Dhaka'`).
**8.7 vehicle-type-change (verify/extend):** Zod `new_vehicle_type` from `lib/vehicleTypes.ts` enum. Checks, in order: (1) driver approved/active; (2) no non-terminal ride → `409 active_ride`; (3) `is_online` → **auto-offline in-transaction**, returns `was_online:true`; (4) target-type documents uploaded & unexpired → else `422 eligibility_not_met { missing_docs[], expired_docs[] }`; (5) **active vehicle-scoped subscription for the old type blocks change** → `409 scoped_subscription_active` (universal packages pass). Old-type docs are never deleted; target-type docs required. Response `{ success, was_online, subscription_impact }`.
**8.8 slider-config:** `{ min_bdt, max_bdt, step_bdt, current_bdt }` (paisa; floors from `platform_config`, current from driver row).
**8.10 ride/schedule (extend):** Zod incl. `scheduled_at` UTC ISO ∈ [now+30min, now+7d]; zone via Z-2 (`422 outside_zone`, `503 zones_not_configured`); **`pg_advisory_xact_lock(user_id)` + overlap guard** — any existing `scheduled`/`finding` ride within ±(30 min + est. duration) → `409 overlapping_ride` (this is also the idempotency mechanism); estimate via existing fare lib with L27 quote window. Response `{ ride_id, scheduled_at, estimated_fare_bdt }`.
**8.11 ride/[id]/cancel (verify/extend):** atomic status guard — `UPDATE rides SET status='cancelled', cancel_reason, cancelled_by WHERE id AND status IN (cancellable_set) RETURNING *`; 0 rows → `409 ride_not_cancellable { current_status }`. Cancellable set: `scheduled`, `finding`, `driver_assigned` (arrived+ excluded). Fee/comp via `lib/paymentEvents.ts` in the **same transaction** (L20); amounts from `platform_config` fresh read; driver notified + compensated per FACT `lib/cancellation.ts` / `cancellationCompensation.ts`.
**8.14 lost-items:** accept/return only the §5.6 enum; enforce 24h server-side.

---

## §9 utils-server Work

**9.1 Scheduled-ride dispatch (the old plan's P0 hole — now locked).** `scheduler.ts` tick (30s): promote `scheduled → finding` when `scheduled_at − pre_window ≤ now` (`system_config.scheduled_dispatch_pre_window_minutes`, default 15) and trigger normal dispatch. **Catch-up:** same query collects overdue rides (`status='scheduled'` past window) — backlog promotes immediately + `logger.warn SCHEDULED_PROMOTION_MISSED {lag}`. Reminders at `scheduled_reminder_offsets_minutes` (default [60,15]). Cutoff: no driver by `scheduled_at + scheduled_grace_minutes` (default 10) → auto-cancel (`cancel_reason='no_driver_found'`, `cancelled_by='system'`), push+SMS, zero fee.
**9.2 Z-6 forecast writer** (§10). **9.3 Z-4 truthful driver zones** (§10). **9.4** Job 19/26/27 verified zone-aware already — regression-checked at gate exit only.

---

## §10 Zone Foundation (Z-1…Z-8, safeguards merged)

Verified baseline (FACT): zones table + lifecycle + budgets + per-zone pricing + zone P&L + admin CRUD + intercity fencing (migration 0009) + H3 dispatch (zone-agnostic; zone is only the pricing key). Real single-zone locks: `zones_one_active` index, `lib/zone.ts` single-zone resolution, fake heartbeat zone stamp, sentinel nil-UUID writes, admin exclusive-activation sweep, `demand_forecasts` with no writer.

| ID | Work | Safeguards added by this revision |
|---|---|---|
| Z-1 | **Migration M1** (index-only): `DROP INDEX zones_one_active`; add `zones_active_idx (is_active)`; `CREATE UNIQUE INDEX IF NOT EXISTS` on `demand_forecasts(zone_id, forecast_hour)`; `CREATE INDEX IF NOT EXISTS rides(zone_id, created_at)` | Replaces the false "ZERO migrations" claim. TD-31 note: index-only ⇒ no GRANT exposure |
| Z-2 | `lib/zone.ts`: `getZoneForLocation(lat,lng)` — all active zones (60s cache), `normalizePolygon` once, point-in-polygon ordered by vertex count ASC; `validatePickupZone` switches over; Bangladesh fallback only at zero active zones → `503 zones_not_configured` | **Cache-bust hook:** admin zone activate/deactivate/polygon-save calls invalidate the cache explicitly |
| Z-3 | Kill sentinel writes at all 3 sites (estimate/request/schedule) → `422 outside_zone` / `503` | Never write nil-UUID/`'fallback'` again |
| Z-4 | Heartbeat backfill resolves `drivers.zone_id` from driver coordinates via Z-2 | **Hysteresis:** commit only after 3 consecutive heartbeats in a new H3 cell (GPS-drift thrash fix) **+ forced re-resolve every 10 min** (boundary-in-cell fix) |
| Z-5 | Admin API allows N active zones; sweeps removed | **Polygon validation:** closed ring, ≤500 vertices, finite coords → `422 invalid_polygon`; response carries `multi_zone_active:true` warning until UI catches up; gated by `feature_multi_zone` flag |
| Z-6 | Hourly forecast writer (:05): per active zone — demand = mean rides/hour over trailing 7 days **grouped by `EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Dhaka')`** (UTC-bug fix); supply = online drivers in zone (post-Z-4); confidence 0.5 (0.2 if <10 samples or zone <7 days old); upsert next `forecast_hour`; prune >14 days | **Runs after Z-7** (ordering fix); cold-start fallback = city-wide hourly average else 0 + low confidence; 60s timeout; `FORECAST_JOB_FAILED` alert; uses M1 index |
| Z-7 | Hygiene: NULL invalid `zone_id` on rides/drivers | **Batched script** `scripts/zone-hygiene.ts`: 5,000-row batches, `pg_sleep(0.1)` between, low-traffic window (02:00–04:00 Dhaka), manual `VACUUM ANALYZE` after — never one raw UPDATE (table-lock fix) |
| Z-8 | Ops note: `scripts/seed-pricing.js` run per zone | Documented in script header |

**Deploy order (AGENTS.md):** M1 push → utils-server → EAS. **Gate exit verification:** two zones active simultaneously; outside-both → 422; zero-zone boot → 503; no sentinel UUIDs after Z-7; driver zone flips only on boundary crossing; Job-19 per-zone counts non-zero; forecast rows + heatmap API return them; zone P&L/graduation regression clean; `tsc` both packages + lint pass.

---

## §11 System & Database Safeguards (the 10 deep-engineering fixes, now binding)

1. **Z-7 batching** (above). 2. **Z-6 Dhaka-timezone aggregation** (above). 3. **Z-4 hysteresis** (above). 4. **cancel-preview scheduled/on-demand branching** (§8.1). 5. **Route-deletion grep gates** (G-1/G-2 below — Expo Router hard-crash prevention). 6. **SOS SMS economics:** 15-min per-user cooldown (DB-backed, §8.2) + global hourly send cap circuit breaker in `lib/dprelay` (in-memory counter, `INSTANCE_COUNT=1` FACT) + `SOS_SMS_CIRCUIT_OPEN` alert. 7. **Vehicle-type change × subscriptions:** scoped-subscription block + doc invalidation semantics (§8.7). 8. **Promo × Pass precedence in `lib/discountEngine.ts`:** active pass consumes the ride first; if pass covers 100%, promo is not stackable (UI shows "Pass applied — promo unavailable"); otherwise promo applies to remaining out-of-pocket (tolls/waiting included), capped by `max_discount_bdt`; promo restored on cancellation only if unused and unexpired. 9. **MapLibre source hygiene** (§4.6). 10. **SOS SMS secondary-rider context** (§8.2).

**Grep Gates (hard blockers):**
- **G-1** (before DEL-1..4): `grep -rn "schedule-ride\|scheduling-user-ride\|schedule-ride-after-promo\|no-drivers-available" app/ lib/ store/ components/ utils-server/ app.config.js` → zero non-self references, including push templates in `lib/notify.ts`.
- **G-2** (before folding D8): same for `select-active-vehicle`.

---

## §12 Lifecycles & Behavior Matrices

**12.1 Scheduled-ride management:** visible in rides tab + `activity-scheduled` (FACT); detail = R11; cancel = R3 (scheduled policy); reschedule = cancel + rebook (v1, copy says so); driver-assigned visibility once dispatch starts via existing tracking flow.
**12.2 Notification matrix (scheduled rides):** booking confirm (push) · T-60/T-15 reminders (push) · dispatch started (in-app) · driver assigned (push+WS) · driver arriving/arrived (push) · driver cancelled (push + auto-redispatch until cutoff) · cutoff breach (push + SMS, no fee). Android channels: `sos` (max priority), `rides`, `marketing`; permission flow = FACT `(auth)/notifications-permission.tsx`; denied → SMS fallback for critical only.
**12.3 SOS lifecycle:** `triggered → acknowledged → resolved` (+`resolved_self`, +`resolved_auto` after 30 min via scheduler). Rider sees live state (§5.5); admin acts via FACT `sos-alerts.tsx` + ack route. Contacts CRUD = FACT emergency-contacts screens (max 3, `+880` validation).
**12.4 Promo/Pass/Quote rules:** §11.8 + L27 (`quote_valid_until`; expired → silent re-estimate with visible fare refresh).
**12.5 Fare-dispute lifecycle:** `submitted → under_review → resolved_refund | resolved_denied` via FACT admin screen; rider sees badge (§5.7); refund mechanism = existing admin refund route (FACT `admin/riders/[id]/refund+api.ts`).
**12.6 Lost-item comms:** masked in-app chat/call only, 72h contact window from report, then support mediation.
**12.7 Book-for-someone-else:** passenger phone ≠ booker phone; `+880` + 10 digits; consent microcopy ("They'll receive trip updates by SMS"); SMS rate limit 5/hour per booker; passenger gets SMS info (no live tracking); booker retains cancel rights; driver banner per §6.1.
**12.8 Share-trip hardening:** link dies on terminal status ("Ride has ended" page); `Cache-Control: no-store`, `X-Robots-Tag: noindex`; 10s refresh while live.
**12.9 Cancellation race matrix** — all rows resolved by the atomic status guard in §8.11 (`UPDATE … WHERE id AND status IN (cancellable_set) RETURNING *`; 0 rows ⇒ `409`):

| Client action | Server status at write | Outcome |
|---|---|---|
| Cancel during `scheduled` | `scheduled` | Cancelled, scheduled policy (§8.1) |
| Cancel during `finding` | `finding` | Cancelled, on-demand policy |
| Cancel during `driver_assigned` | `driver_assigned` | Cancelled + driver notified + compensation via FACT `lib/cancellationCompensation.ts` |
| Cancel after driver arrived | `driver_arrived`+ | `409 ride_not_cancellable { current_status }` → UI: "Driver has already arrived" |
| Cancel during `in_progress` | `in_progress` | `409` → "Ride in progress" |
| Two devices cancel simultaneously | either | First write wins; second gets 0 rows → `409` |
| Driver accepts mid-cancel | either | Transaction ordering decides; status guard makes it atomic — no double-terminal state possible |
| Scheduled ride cancelled mid-promotion | `scheduled`→`finding` race | Same guard; if promotion already committed, on-demand policy applies and preview re-fetched client-side on `409` |

**Rule:** client never retries a cancel after `409` — it re-fetches `cancel-preview` and shows the current state. Double-tap protection: button disables on first press; server guard is the real safety net (idempotency requirement satisfied without new schema).

---

## §13 Deep-Link Contract (fully specified — the old plan's headline-with-no-content item)

Scheme: `myapp` (FACT `app.config.js`) — unchanged. Universal links: none this plan (deferred, §17).

| Journey | Link | Target | Auth |
|---|---|---|---|
| Share trip (primary) | `{EXPO_PUBLIC_SERVER_URL}/track/{rideId}` | FACT `app/track/[rideId].tsx` (web) | **Public** — root `_layout.tsx` exempts `track` segment (Wave 0; fixes live bounce-to-login bug) |
| Promo link | `myapp://promo/{code}` | `apply-promos?code={code}` (pre-filled input) | Required — unauthenticated → login → redirect back with code preserved |
| Active ride | `myapp://ride/{rideId}` | `ride-tracking/[ride_id]` | Required |
| Push notification | data `{ type: 'ride_update', ride_id }` | `ride-tracking/[ride_id]` | Already works — VERIFY only |
| Referral | **CUT** (no backend) | — | — |

**Handling:** root `_layout.tsx` — cold start: `Linking.getInitialURL()` parsed once after auth state resolves; warm start: `Linking.addEventListener('url')`. Unknown paths → home. All links validated (`rideId` UUID regex, `code` alphanumeric ≤32) before routing — malformed links land on home, never crash.
**Environment:** URLs derive from `EXPO_PUBLIC_SERVER_URL` (already per-environment via `.env.local`); scheme identical in staging/prod.

---

## §14 Operational Readiness

**14.1 Feature flags (kill switches)** — live in `platform_config` (AGENTS.md: fresh read every request, admin-editable, no restart):

| Key | Default | Kill behavior |
|---|---|---|
| `feature_scheduled_rides` | on | Toggle hidden in confirm-ride; scheduler promotion skips (rides stay `scheduled`, alert raised) |
| `feature_sos_sms` | on | SOS alert still creates + dials 999; SMS skipped |
| `feature_hotspots` | on | Pill disabled with helper text; screen unreachable |
| `feature_multi_zone` | **off until Z-gate exit** | Z-2 falls back to legacy single-active-zone resolution — instant single-zone rollback |
| `feature_book_for_other` | on | Toggle hidden |

Client reads flags via the existing public config/reference endpoint (VERIFY which of FACT `reference/preferences+api.ts` / `admin/config+api.ts` is the public one); 60s client cache acceptable (flags are not money).

**14.2 Monitoring — structured log codes** (via FACT `lib/logger.ts`; alert thresholds set by ops, codes locked now):

`SOS_INSERT_FAILED` (page) · `SOS_SMS_FAILED` · `SOS_SMS_CIRCUIT_OPEN` (page) · `OUTSIDE_ZONE_SPIKE` (>20/min, page — signals Z-2 regression or boundary error) · `ZONE_RESOLVE_FAILED` · `FORECAST_JOB_FAILED` · `SCHEDULED_PROMOTION_MISSED {lag}` · `CANCEL_PREVIEW_FAILED_SPIKE` · `SCHEDULER_LAG`.

**14.3 Rollback runbook**

| Change | Rollback |
|---|---|
| Any feature | Flag off (§14.1) — instant, no deploy |
| Z-1 migration | `CREATE UNIQUE INDEX zones_one_active ON zones(is_active) WHERE is_active = true;` (exact SQL kept in migration header comment) |
| Z-6 job | Flag disables the hourly job; `demand_forecasts` rows age out (14d prune) |
| Route deletions | **Not rollbackable** — that is why Grep Gates G-1/G-2 precede them |
| Native modules | Previous EAS build remains installable; OTA updates carry JS-only fixes |

**14.4 Seed data + QA matrix** — extend the FACT `scripts/seed-pricing.js` pattern with `scripts/seed-qa.ts`: 2 active zones with polygons, forecast rows for both, 2 promos, 1 pass, 3 scheduled rides (future/overdue/conflict), 1 lost item per status, 1 dispute, 2 emergency contacts. Manual test matrix (compact): schedule→dispatch→assign→cancel-at-each-status; SOS offline; SOS no-permission; promo+pass precedence; overlap guard; book-for-other SMS; deep links cold/warm/unauthenticated; hotspot EmptyState→data; min-rate bounds; payout-method validation.

**14.5 Native module release checklist** (datetimepicker + slider require dev build): `npx expo install` (version-matched to SDK 53) → EAS build profile verified → permissions manifest review (no new Android permissions needed by either) → QA regression: theme toggle, navigation, map screens → previous store build preserved.

**14.6 Retention & PII policy** (policy locked; enforcement jobs deferred §17): `sos_alerts` 90d · `lost_items` 180d after resolved · `fare_disputes` resolved+365d · tracking links die at terminal ride status (§12.8) · `secondary_rider_phone` masked in all read APIs after 7d.

---

## §15 Wave Plan (authoritative order, exit criteria per wave)

**Wave 0 — Foundation** (blocks everything)
0.1 VERIFY/install deps: `@react-native-community/datetimepicker`, `@react-native-community/slider`, NetInfo → dev build via EAS (§14.5)
0.2 Tokens: VERIFY `amberLight` (#FEF3C7) + `successLight` (#E6F7EE) in `theme/goRide.ts`; add if missing
0.3 Build `ErrorBanner` (§7.1) + `OfflineIndicator` (§7.2)
0.4 VERIFY/RESTYLE FACT `components/plan03/EmptyState.tsx` (never duplicate)
0.5 i18n: add Plan-05 keys to FACT `i18n/locales/{en,bn}/common.json` — **keys land with screens, not after** (bn placeholders allowed; en fallback)
0.6 Root `_layout.tsx`: `track` auth exemption (§13)
0.7 `lib/time.ts`: `toUtcIso`, `dhakaTodayKey`, `msUntil` (§4.3)
0.8 Feature flags seeded in `platform_config` (§14.1)
0.9 **Grep Gate G-1** audit (strings only, no deletion yet)
*Exit:* components importable from a test screen; tsc×2 + lint pass.

**Wave 1 — Rider booking core**
1.1 Extend `cancel-preview` (§8.1) — lands first (cancel screens depend on it)
1.2 Schedule toggle + sheet in `confirm-ride` (S4: VERIFY FACT `SchedulePicker.tsx` first — reuse/rename, build new only if it fails)
1.3 `ride/schedule` backend extension (overlap guard, advisory lock, timezone validation §8.10)
1.4 Scheduler promotion + reminders + cutoff + catch-up (§9.1)
1.5 `ride-scheduled` rebuild (entry = `router.replace` from 1.2 — explicitly wired)
1.6 Route deletions DEL-1..4 — **only after G-1 passes**
1.7 `cancel-reason` + `canceled` fixes (server-bound §5.3)
1.8 `apply-promos` fix + `lib/discountEngine.ts` precedence rule (§11.8) + confirm-ride selector
1.9 `ride-details-scheduled` fix (rideId params bug + cancel entry)
1.10 Store fixes: `scheduledRides` filter `'scheduled'` (VERIFY in FACT `store/useRiderStore.ts`)
*Exit:* full scheduled-ride lifecycle works end-to-end in QA with seed data; overlap rejected; countdown uses `server_now`.

**Wave 2 — Rider safety & support**
2.1 `POST /api/sos/alert` + `sos/resolve` + `sos/active` (§8.2–8.3) with cooldown + circuit breaker
2.2 `emergency-sos` rebuild (§5.5) incl. offline queue
2.3 `SOSButton` rider repoint (S5)
2.4 `lost-items` fixes (§5.6)
2.5 `fare-dispute` VERIFY + status badge wiring (§5.7)
*Exit:* SOS works with location denied AND network off (999 always dials); cooldown enforced; secondary-rider SMS context verified.

**Wave 3 — Verify-only pass**
`ride-pass` (active-pass = FACT `rider/passes`, catalog = FACT `admin/rider-passes` — never mixed) · share-trip + link expiry (§12.8) · book-for-someone-else edge guards (§12.7) · call-ledger missed tab VERIFY (canonical; no `missed-requests` screen) · `insurance` untouched.
*Exit:* each item signed off with a one-line verification note.

**Zone gate — Z-1…Z-8** (parallel with Waves 1–3; **hard gate before Wave 4**)
Order: Z-1 → Z-2 → Z-3 → Z-4 → Z-5 → **Z-7 → Z-6** (hygiene before forecasting). Exit = §10 verification list (two active zones, 422/503 paths, truthful driver zones, Job-19 counts, forecast rows, P&L regression, tsc×2+lint).

**Wave 4 — Driver** (requires zone gate exit)
4.1 `find-customer` + `customer-navigation` banner/call-split/no-show link (§6.1; both FACT paths verified in tree)
4.2 `rider-no-show` VERIFY + entry (§6.2)
4.3 Heatmap extension (§8.5) + `hotspot-map` build (§6.3, MapLibre hygiene §4.6)
4.4 `vehicle-management` rebuild + `vehicle-type-change` extension (§8.7) + `select-active-vehicle` fix (fold into D7; delete route only after **Grep Gate G-2**)
4.5 `performance-stats` fix + daily bars (§8.6)
4.6 `incentives` auth fix + restyle + credits copy (§6.6)
4.7 Earning tab: Incentives row + Earnings Goal modal (§6.6)
4.8 `min-rate` (§6.7: FACT `MinRateSlider` + `slider-config` + `validateDriverMinKm`)
4.9 `payout-methods` (§6.8 + GET §8.4)
4.10 Subscription content fixes (5 FACT files §6.9)
4.11 Driver settings entry rows (§6.9)
4.12 **Retry-refetch fix, discovery-driven:** `grep -rn "onRetry\|ErrorBanner" app/(main)/(rider)` enumerates every affected screen (candidates: performance-stats, incentives, hotspot-map, vehicle-management); fix pattern = `refetch` via `useCallback` passed to the banner, never a stale closure. This replaces the vague "4 screens" item with a gate that finds all of them.
*Exit:* all driver screens reachable from a named entry; daylight rules (§4.5) spot-checked at max brightness screenshot.

**Wave 5 — Integration & release readiness**
5.1 Deep links (§13) · 5.2 Legal placeholders + 4 screen fills (BLOCKED §18) · 5.3 i18n sweep (VERIFY only — no rewrite, keys already in place) · 5.4 Seed script + QA matrix run (§14.4) · 5.5 Full verification (§16) · 5.6 Rollback runbook + log codes reviewed by ops (§14.2–14.3).

---

## §16 Verification Checklist (itemized against real scope)

**Screens:** every R1–R11 + D1–D12 item: Pattern A + `<StatusBar>` + theme toggle; driver items additionally pass §4.5.
**Grep gates (all must return zero):**
```
grep -rn "console\.log" app/ lib/ utils-server/ src/
grep -rn "theme === \"dark\"\|theme === 'dark'" app/ components/
grep -rn "request\.json()" app/api/
grep -rn "geohash" app/ lib/ utils-server/
grep -rn "schedule-ride\|scheduling-user-ride\|schedule-ride-after-promo\|no-drivers-available" app/ lib/ store/ components/ utils-server/ app.config.js   # post-G-1
grep -rn "select-active-vehicle" app/ lib/ store/   # post-G-2
grep -rn "00000000-0000-0000-0000-000000000000\|'fallback'" app/api/ride/ lib/zone.ts   # post-Z-3
```
**Build:** `npx tsc --noEmit` (root) + `cd utils-server && npx tsc --noEmit` + `npm run lint` (legacy config).
**AGENTS.md compliance:** all new POST bodies via `parseJsonBody`; all dynamic routes flat-param; `verifySupabaseToken`/`requireRole` on every protected route; money integer paisa with `lib/money.ts`/`format.ts` at display; `payment_events` writes only via `lib/paymentEvents.ts` inside transactions; `platform_config` fresh reads; snake_case Drizzle; vehicle enum from `lib/vehicleTypes.ts`.
**Zone gate:** §10 exit list. **Data:** FACT column canon (`cancel_reason`, `cancelled_by`, `arrived_at`, `valid_until`, `max_rides`, `min_per_km_bdt`) respected by all queries.

---

## §17 Deferred (with triggers) / Rejected

| Item | Trigger to un-defer |
|---|---|
| Rider-side dispute tracking UI (beyond badge) | First ops SLA commitment |
| Lost-item mediation UI (admin exists FACT; rider chat exists) | Support volume demands it |
| Analytics/telemetry event schema | Instrumentation epic |
| Immutable audit trails for admin actions | Compliance request |
| Contract tests / client types from Zod | First client-server drift bug |
| Nightly retention cleanup job (§14.6 policy locked now) | Data volume / DPA request |
| Universal links + referral deep link | Backend support exists |
| Withdrawal epic (instant-pay, payout-history) | Withdrawal backend built |
| Admin map polygon editor | Ops pain with JSON textarea |
| `zone_h3_cells` fast path / PostGIS | >50 zones or >10ms lookups |
| `zone_versions` writes | Boundary-audit requirement |

**Rejected:** zone-pair pricing (third geo-pricing system), destination `zone_id` column, client zone module, new state stores, new `lib/i18n.ts`, new `EmptyState`, charts library, `missed-requests` screen, geohash anywhere.

---

## §18 BLOCKED

**Legal copy** — `lib/legalContent.ts` ships as labeled placeholders (`// TODO: Replace with final legal copy`); the 4 Terms/Privacy screens fill from it. Owner-supplied text required before release. Nothing else in Plan 05 is blocked.

---

## Appendix A — Traceability: every critique → its resolution

| Source | Items | Resolution |
|---|---|---|
| DeepSeek-18 | #1 scope count | §2 authoritative tables |
| | #2 endpoint completeness | §8 full contract table (20 items) |
| | #3 tokens | Wave 0.2 |
| | #4 Pattern A | §4.1 |
| | #5 duplicate components | §7.3 reuse mandate |
| | #6 contracts | §8 (request/response/error/auth each) |
| | #7 confirm-ride path | FACT-verified §2.1 R1 |
| | #8 server countdown | §5.3 + §8.1 (`free_until`+`server_now`) |
| | #9 pass sources | Wave 3 rule |
| | #10 7-day vs 24h | §5.6 (24h both sides) |
| | #11 paisa conversion | §4.2 |
| | #12 SOS offline/location | §5.5 |
| | #13 map overlays | §6.3 + §4.6 |
| | #14 charts | §6.5 (svg, cap 30, fallback) |
| | #15 language store | §3 L26 (`useAppearance`) |
| | #16 legal text | §18 BLOCKED |
| | #17 NetInfo | Wave 0.1 VERIFY |
| | #18 checklist counts | §16 itemized |
| DeepSeek follow-up | P0 ZERO-migrations vs Z-1 | §3 L22 (1 index-only migration M1) |
| | P0 vehicle-type-change/slider-config missing | §8.7/§8.8 (FACT files — verify/extend, not build) |
| | P0 SOS auth/rate-limit | §8.2 |
| | P0 eligibility undefined | §8.7 checks 1–5 |
| | P1 entry points | every screen has Entry field; §6.11 settings rows |
| | P1 find-customer path | FACT: both `find-customer/` and `customer-navigation/[rideId]` exist — §6.1 |
| | P1 "4 screens" vague | Wave 4.12 grep-driven discovery |
| | P2 Z-6/Z-7 order | §15 gate order (Z-7 before Z-6) |
| | P2 Z-4 boundary thrash | §10 Z-4 hysteresis + 10-min forced re-resolve |
| | P2 admin guardrail | §10 Z-5 validation + warning + flag |
| | P3 deep links | §13 |
| | P3 superseded content | §1 (this doc supersedes all) |
| | P3 final checklist | §16 |
| | P3 EmptyState path | FACT `components/plan03/EmptyState.tsx` §7.3 |
| | P3 i18n double-work | Wave 0.5 (keys with screens); Wave 5 verify-only |
| 59-item list | A1–A20 scope/deletions/entries | §2, §15 W1.6, G-1, per-screen Entry fields |
| | B21–B40 contracts | §8.1–8.18 (response shapes, error codes, `server_now`, daily_totals, payout GET shape, confidence→opacity only) |
| | C41–C50 tokens/components | W0.2, §7, StatusBadge/SettingsRow reuse, DriverStatsBar pill host |
| | D51–D56 stores/wiring | W1.10, R11, W4.12, goal key in `constants/data.ts`, §13 snippet |
| | E57–E59 edge cases | §5.5 queue, §8.7 auto-offline, §8.11/8.12 transactions |
| Qwen-50 | #1 scheduled management | §12.1 |
| | #2 notifications | §12.2 matrix |
| | #3 conflicts | §8.10 overlap guard |
| | #4 pre-window | §9.1 (15 min default) |
| | #5 cancel races | §12.9 matrix |
| | #6–7 dispute lifecycle | §12.5 (v1 badge; full UI deferred) |
| | #8 photo_provided | §12.6/§5.6 (driver-side photo) |
| | #9 contact policy | §12.6 (masked, 72h) |
| | #10–11 promo/pass rules | §11.8 + L27 |
| | #12 consent/anti-abuse | §12.7 |
| | #13 tracking hardening | §12.8 |
| | #14 SOS lifecycle | §12.3 + §8.3 |
| | #15 contacts CRUD | FACT screens referenced §12.3 |
| | #16 driver SOS parity | §12.3 (FACT `driver/sos-alert`) |
| | #17 clock skew | §4.3 `server_now` |
| | #18 timezone | §4.3 + Z-6 `AT TIME ZONE` |
| | #19–20 formatting/i18n | §4.2/§4.4 |
| | #21 FSM | §5.1 transitions |
| | #22 realtime events | push-first §12.2 (no admin WS exists — FACT) |
| | #23 channels/permissions | §12.2 |
| | #24 store reset | §4.8 |
| | #25 goal rules | §6.6 (bounds, Dhaka-day reset) |
| | #26 credits UX | §6.6 copy |
| | #27–28 hotspot boot/degrade | §6.3 |
| | #29 doc expiry workflow | §6.4 (badges + Renew CTA → FACT documents screen) |
| | #30 min-rate expectations | §6.7 |
| | #31 idempotency | §8.10 advisory lock + §12.9 guards |
| | #32 scheduler catch-up | §9.1 |
| | #33 cache invalidation | §10 Z-2 bust hook |
| | #34 polygon validation | §10 Z-5 |
| | #35 cold start | §10 Z-6 fallback |
| | #36 forecast perf | §10 Z-6 (M1 index, timeout) |
| | #37 quote stability | §3 L27 |
| | #38 audit trails | §17 deferred |
| | #39 feature flags | §14.1 |
| | #40 analytics | §17 deferred |
| | #41 logging codes | §14.2 |
| | #42 contract tests | §17 deferred |
| | #43 seed/QA | §14.4 |
| | #44 rollback | §14.3 |
| | #45 monitoring | §14.2 |
| | #46 env links | §13 |
| | #47 native release | §14.5 |
| | #48 cleanup | §4.7 |
| | #49 support tooling | FACT admin screens; §17 |
| | #50 retention | §14.6 |
| 10 deep-engineering | #1 Z-7 table lock | §10 Z-7 batched script + VACUUM |
| | #2 Z-6 UTC bug | §10 Z-6 `AT TIME ZONE 'Asia/Dhaka'` |
| | #3 Z-4 GPS thrash | §10 Z-4 hysteresis (3 heartbeats) |
| | #4 cancel-preview branch | §8.1 |
| | #5 route deletion crash | G-1/G-2 grep gates |
| | #6 SMS exhaustion | §8.2 cooldown + §11.6 circuit breaker |
| | #7 vehicle change × subscription | §8.7 check 5 (`scoped_subscription_active`) |
| | #8 promo/pass precedence | §11.8 |
| | #9 MapLibre leaks | §4.6 source hygiene |
| | #10 SOS SMS context | §8.2 template injection |

---

**End of Plan 05 v2.0.** This document is the single source of truth for Plan 05; all prior drafts, addenda, review rounds, and the 2026-08-16 FINAL locked plan are superseded and archived. Next action: authorize Wave 0.