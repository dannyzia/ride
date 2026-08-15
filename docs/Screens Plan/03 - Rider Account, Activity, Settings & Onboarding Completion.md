## 🛑 ORCHESTRATOR VERIFICATION (2026-08-14, second-pass) — verified against `list.txt` + live tree; supersedes any conflicting text below

**This banner is the sole authoritative source for Plan 03.** The body below contains Kimi's pre-verification draft (duplicated) and is SUPERSEDED wherever it conflicts with this block.

---

### 1. FILE-PATH REALITY (from `list.txt` + directory audit)

| Plan body says | ❌ Wrong | ✅ Verified truth |
|---|---|---|
| `profile/index.tsx` (Screen 4) | Missing as written | Real path: `(tabs)/profile/index.tsx` |
| `edit-profile/index.tsx` (Screen 9) | No customer version | Real path: `profile/edit.tsx` |
| `change-password/index.tsx` (Screen 10) | Says "exists" | **CORRECTED 2026-08-15:** EXISTS at `app/(main)/(customer)/change-password/index.tsx` (landed after R2). Do NOT create. |
| `settings/appearance` (4a) | Wrong root | Real path: `(tabs)/settings/app-appearance` |
| `settings/language` (4e) | Wrong root | Real path: `(tabs)/settings/app-language` |
| `ride-detail/[ride_id].tsx` (Screen 2) | Says "create" | **WRONG.** Real ride-detail is `show-ride/[rideId].tsx` (exists). Do NOT create a 3rd path. |
| `wallet/index.tsx` (Screen 3) | Says "may not exist" | **CORRECTED 2026-08-15:** rider wallet EXISTS at `app/(main)/(customer)/(tabs)/wallet/index.tsx` (NOT under customer root). Top-up reuses `(tabs)/settings/top-up`; do NOT create a 3rd path. |
| `settings/index.tsx` | Supplement says "delete if exists" | **EXISTS** with 24 sub-screens. **DO NOT DELETE.** It is the canonical Settings Hub. Profile rows route TO `(tabs)/settings/*`. |

**Additional path facts:**
- `ride-details-completed/[id]/index.tsx` EXISTS (orphan candidate — delete after re-pointing callers)
- `book-ride/index.tsx` EXISTS (orphan candidate — delete after re-pointing callers)
- `final-page/index.tsx` EXISTS (orphan candidate — delete after re-pointing callers)
- `ride-tracking/[ride_id].tsx` EXISTS (canonical live tracking)
- `services-hub.tsx` EXISTS (gate target)
- `nearby-drivers+api.ts` EXISTS (Plan 02 TASK B landed)
- `AuthLayout.tsx`, `OtpInput.tsx` — **ABSENT** from the tree. `ThemeToggle.tsx` (standalone) **EXISTS** (verified 2026-08-15) — do NOT create it.
- `assets/images/no-result.png` **EXISTS** (verified 2026-08-15). **CAVEAT:** `components/plan03/EmptyState.tsx` is **icon-based** (`icon: keyof typeof Ionicons.glyphMap`) — there is NO `useIllustration` prop. Use `<Image source={require('@/assets/images/no-result.png')}>` for the illustration variant.
- `lib/format.ts` — **EXISTS** (verified 2026-08-15): `formatBDT`, `formatDate`, `formatDateTime`, `formatRelativeTime` (invalid-safe). Import from `@/lib/format` — creation task is CANCELLED.

---

### 2. BACKEND ENDPOINTS — REAL vs FICTIONAL

**EXISTS — do NOT create or "verify" as missing:**
- `/api/rider/wallet` + `/api/rider/wallet/topup`
- `/api/ride/{id}` (same contract as `rate-driver`)
- `/api/ride/get-all`
- `/api/ride/nearby-drivers`
- `/api/user/me`, `/api/user/account`, `/api/user/delete-data`, `/api/user/data-controls`, `/api/user/emergency-contacts`, `/api/user/notification-prefs`, `/api/user/referral`, `/api/user/device`, `/api/user/linked-accounts`, `/api/user/request-data`
- `/api/support/ticket` (NOT `/api/support/report`)
- `/api/rider/notifications`, `/api/rider/addresses`, `/api/rider/fare-disputes`, `/api/rider/passes`, `/api/rider/lost-items`, `/api/rider/points`
- `/api/faqs` (fetch with fallback; NOT hardcoded array)

**FICTIONAL — do NOT reference these paths:**
- `POST /api/support/report` → use `support/ticket+api.ts`
- `POST /api/support/fare-dispute` → use `rider/fare-disputes+api.ts`
- `POST /api/rider/notification-preferences` → use `user/notification-prefs+api.ts`
- `POST /api/rider/emergency-contacts` → use `user/emergency-contacts+api.ts`
- `DELETE /api/user/me` → **UNKNOWN** (not confirmed in tree); real delete flow uses `user/delete-data` + `user/data-controls`

---

### 3. STORE REALITY (`store/` directory audit)

**Existing files:** `index.ts`, `useCallLedgerStore.ts`, `useChatStore.ts`, `useDriverFlowStore.ts`, `useDriverStatusStore.ts`, `useDriverStore.ts`, `usePackageStore.ts`, `useRiderStore.ts`

**Confirmed ABSENT (do NOT import or call `.reset()` on these):**
- `useRidesStore.ts`
- `useWalletStore.ts`
- `useNotificationsStore.ts`
- `useCustomer.ts`
- `useWSStore.ts`

**Verified 2026-08-15:** `useRiderStore` HAS `reset()` (and `clearRoute()`); `useDriverStore` (file `store/useDriverStore.ts`) HAS `reset()`; `useChatStore` HAS `clearChat()` (NO `reset()`). The barrel `store/index.ts` exports `useDriverStore` (legacy, NO reset), `useRideOfferStore`, `useDriver`, `useAppUserStore`, `useCustomer`, `useRidesStore`, `useDriverDetails`, `useWSStore` — none of the barrel stores have `reset()`. **Calling `.reset()` on a store that lacks it crashes at runtime.**

---

### 4. COMPONENT REALITY

- `AuthLayout.tsx` — **ABSENT.** Auth screens use local layout or no layout. Do NOT reference `AuthLayout.showThemeToggle`.
- `ThemeToggle.tsx` (standalone) — **ABSENT.** Theme toggle is a local `Ionicons` button on each screen. The 3-option picker lives inside `(tabs)/settings/app-appearance`.
- `OtpInput.tsx` — **ABSENT.**

---

### 5. WALLET REALITY

- **CORRECTED 2026-08-15:** Rider wallet screen **EXISTS** at `app/(main)/(customer)/(tabs)/wallet/index.tsx` (absent when Round 1 was written; the implementation pass landed it).
- `GET /api/rider/wallet` and `GET /api/rider/wallet/topup` exist, and `(tabs)/wallet/index.tsx` **consumes them** (exists — see §1 correction).
- `PaymentWebView` is **component-only** (no route). `router.push('/payment-webview')` → `+not-found`.
- Existing top-up surfaces: `(tabs)/settings/top-up`, `top-up-method`, `top-up-success`, `(tabs)/activity/top-up`, `top-up-details`. **Reuse one; do not build a 6th path.**

---

### 6. THEME & HOOK REALITY

- `lib/useAppearance.ts` default = `'system'` (NOT `'light'`). Do NOT revert.
- `useIsDark()` exists, resolves `'system'` via `useColorScheme()`. Use it everywhere.
- `useAppearance()` returns `{ theme, language, setTheme, setLanguage }`. There is **no** `isDark` or `toggleTheme`.
- `amberLight`, `greenLight` do NOT exist in `theme/goRide.ts`. `successLight` **EXISTS** (`#F0FFF4`, verified 2026-08-15). Missing tokens → `rgba()` fallbacks: `` `${colors.amber}1A` `` / `` `${colors.checkGreen}1A` ``.

---

### 7. ENGINEERING REQUIREMENTS (verified — fold into implementation)

- **Sign-out:** Let the auth gate handle redirect after `supabase.auth.signOut()`. Do NOT also call `router.replace` manually. Call `authCleanup()` from `lib/authCleanup.ts` (CREATE it — see §7): `useRiderStore.getState().reset()` → `useDriverStore.getState().reset()` (import from `@/store/useDriverStore`, NEVER `@/store`) → `useChatStore.getState().clearChat()`. Guard each: `if (S.getState().reset)`.
- **Money:** All `*_bdt` = integer paisa. Divide by 100 only at UI display.
- **markAsRead:** `/api/rider/notifications` exists — confirm PATCH support; if absent, persist read-ids in AsyncStorage.
- **StatusBadge:** Use only statuses from `GET /api/ride/get-all` history (drop `driver_en_route` / `driver_arrived`).
- **Formatting:** Use `lib/format.ts` (**EXISTS**): `formatBDT`, `formatDate`, `formatDateTime`, `formatRelativeTime`. Never hand-roll `Intl` calls.
- **a11y:** `accessibilityLabel` / `accessibilityRole` on all interactive elements.
- **i18n:** **Deferred to Plan 05** (no i18n infra in the tree, verified 2026-08-15). Hardcode strings in Plan 03; do NOT build `t()` stubs.
- **Map (DECIDED 2026-08-15):** Ride-Detail has NO live map — use a static placeholder card (location icon + route text), matching the shipped `show-ride/[rideId].tsx`. No `Map.tsx`, no `pointerEvents` gymnastics.

---

### 8. KIMI'S 10 DECISIONS — 4 CORRECTED, 6 STAND

- **#8 ThemeToggleButton — WRONG API.** `useAppearance()` returns `{ theme, language, setTheme, setLanguage }`. Correct: `const isDark = useIsDark(); const { setTheme } = useAppearance(); onPress={() => setTheme(isDark ? "light" : "dark")}`.
- **#10 Sign-out stores — WRONG.** `useWalletStore` and `useNotificationsStore` do not exist. Real rider stores: only `useRiderStore` is confirmed. Others (`useRidesStore`, `useCustomer`, `useWSStore`) do not exist as files. Only `useDriverStore` has `reset()`. Do NOT call `.reset()` on stores that lack it.
- **#5 Referral response shape — FICTIONAL.** Real `GET /api/user/referral` returns `{ code (nullable), campaign, stats: { total_referrals, successful, total_reward_bdt }, recent: [{ referee_phone, status, created_at, rewarded_at }] }`.
- **#1 Duplicate-screen consolidation (LOCKED):**
  - **Booking:** `home` canonical; **delete `book-ride`** after re-pointing callers → `/(main)/(customer)/(tabs)/home`.
  - **Live tracking:** `ride-tracking/[ride_id]` canonical; **delete `final-page`** after re-pointing callers → `ride-tracking/${rideId}`.
  - **Completed detail:** `show-ride/[rideId]` canonical; re-point `activity-completed` → `show-ride/${id}`, then **delete `ride-details-completed`**.
  - **Gate:** `grep -rn 'book-ride\|final-page\|ride-details-completed' app/ components/ store/` → **0 matches** before deletion.

---

### 10. STATE AUDIT FINDING (new — must resolve before implementation)

The tree shows an inconsistency with plan sequencing:
- `app/api/ride/nearby-drivers+api.ts` EXISTS (Plan 02 TASK B appears to have landed).
- `components/AuthLayout.tsx`, `components/OtpInput.tsx`, `components/ThemeToggle.tsx` (standalone) are **ABSENT** (Plan 01 CREATEs).

**Before assigning Plan 03, run a 10-minute state audit:**
1. Grep for `useIsDark` in `lib/useAppearance.ts` (file exists ✓; default = `'system'`).
2. Confirm `AuthLayout` location (or confirm it does not exist and auth screens use local layout).
3. Diff shipped `nearby-drivers+api.ts` against TASK B spec (K=16, 401 handling, `Infinity` filter, 15 km/h) so it is audited, not re-created.

---

### 11. PRECEDENCE RULES (non-negotiable)

1. **This banner wins** over any claim in the body below.
2. **Wireframes below are design intent only** — not file-path or API contracts.
3. **Ignore body text that says:** "create `ride-detail/[ride_id]`", "create/verify endpoints", "Coming soon" for existing APIs, sign-out `router.replace` + `useWalletStore`/`useNotificationsStore`, fictional referral shapes, Map "read-only mode", "auth gate bypasses onboarding", "`AuthLayout showThemeToggle` (if applicable)".
4. **StatusBadge:** drop `driver_en_route` / `driver_arrived` from props and UI.
5. **When in doubt, the banner wins.**

---

## 🟢 ORCHESTRATOR VERIFICATION — ROUND 2 (GO/NO-GO, file-level audit, 2026-08-14 22:30 +06)

**VERDICT: GO.** This round was produced by opening every API route file, the store barrel, the schema enum, and the theme file. Where this round conflicts with the Round-1 banner above OR the body below, **THIS ROUND WINS.**

### R2.0 — NOTE TO THE CODING MODEL (READ BEFORE WRITING ANY CODE)

**Some, most, or ALL Plan-03 tasks may already be implemented in the working tree** (an implementation pass ran between Round 1 and Round 2). Protocol:
1. Before touching any file, READ it and check it against this plan. If it already conforms, skip.
2. Never double-create files. If a CREATE target exists, audit-and-fix instead of overwriting blindly.
3. Orphan-route deletions (R2.8) may already be done — verify, don't re-do.
4. The §8/verification checklists in this document are your ACCEPTANCE TESTS — run them over the final state (including `npx tsc --noEmit`, `npm run lint`, and the greps in R2.9), regardless of who wrote which line.
5. If a `.trash-navigation-cleanup/` folder exists at repo root, delete it (it is quarantined dead routes, invisible to tsc/Metro).

### R2.1 — Corrections to the Round-1 banner

| # | Round-1 claim | Corrected truth (file-verified) |
|---|---|---|
| 1 | §3 "`useCustomer`, `useWSStore`, `useRidesStore`… do NOT exist" | **Partly wrong.** `store/index.ts` (the barrel) DOES export `useCustomer`, `useWSStore`, `useRidesStore`, `useRideOfferStore`, `useDriver`, `useAppUserStore`, `useDriverDetails`. Importing them is safe; what's true is that **none of them has `reset()`**. |
| 2 | §3/§8 "only `useDriverStore` has reset()" | **Partly wrong — corrected 2026-08-15:** **TWO stores share the name `useDriverStore`** — legacy in `store/index.ts` (NO reset, driver-map state) and real in `store/useDriverStore.ts` (HAS `reset()`). Import sign-out cleanup from `@/store/useDriverStore`, NEVER from `@/store`. Verified owners: `useDriverStore` (file) → `reset()`; `useRiderStore` → `reset()` AND `clearRoute()` (both exist); `useChatStore` → `clearChat()` only (NO `reset()`). `authCleanup()` order: rider `reset()` → driver `reset()` → chat `clearChat()`. Guard every call: `if (S.getState().reset)`. |
| 3 | §7 StatusBadge "drop `driver_en_route`/`driver_arrived`" | Vocabulary correction — the DB enum (`rideStatusEnum`, schema.ts:42) is: `pending, dispatching, matched, driver_arriving, driver_arrived, in_progress, completed, cancelled, expired, no_drivers, scheduled`. There is no `driver_en_route` (it's `driver_arriving`), and `no_show`/`disputed` are NOT ride statuses (no-show is a cancel_reason path; disputes live in the `fare_disputes` table). Display mapping for history UI: `expired`/`no_drivers` → render as Cancelled; `disputed` is a DERIVED badge (dispute exists), not a raw status. `scheduled` IS real → a "Scheduled" filter chip is buildable. |

### R2.2 — WIRING TRUTH TABLE (field-accurate; supersedes all body sketches)

| Endpoint (file-verified) | Methods | REAL contract notes |
|---|---|---|
| `GET /api/ride/get-all` (`ride/get-all+api.ts`) | GET | Bearer auth. Returns **`{ data: RideRow[] }`** (key is `data`, NOT `rides`). Row: `ride_id, origin_address, destination_address, origin_latitude, origin_longitude, destination_latitude, destination_longitude, fare_breakdown, driver_id, user_id, created_at, status, scheduled_at, completed_at, vehicle_type, cancel_reason, cancelled_by, driver: { driver_id, full_name, profile_image_url, rating } | null`. `fare_breakdown` keys: `total_bdt, base_fare_bdt, distance_charge_bdt, time_charge_bdt, surge_fee_bdt`. **`/api/ride/history` DOES NOT EXIST** — any call to it is a bug. |
| `GET /api/ride/{id}` (`ride/[id]/index+api.ts`) | GET | `{ ride: { id, status, origin_address, destination_address, vehicle_type, created_at, completed_at, cancel_reason, cancelled_by, fare_breakdown { base_fare_bdt, distance_charge_bdt, time_charge_bdt, surge_fee_bdt, total_bdt }, wait_fee_bdt, tip_bdt, applied_discount_bdt, rider_payable_bdt }, driver: { id, full_name, rating, vehicle_type, vehicle_plate, avatar_url } }`. The body's `base_bdt/distance_bdt/time_bdt/surge_bdt` names are FICTION. Show itemized rows only from real fields; `wait_fee_bdt`, `tip_bdt`, `applied_discount_bdt` are real and should render when non-null. |
| `POST /api/rider/fare-disputes` (`rider/fare-disputes+api.ts`) | POST, GET | Zod: `{ ride_id: uuid, claimed_fare_bdt: int PAISA positive, dispute_reason ∈ {route_longer, wrong_vehicle, wait_fee_unfair, surge_unexplained, other}, rider_note ≤1000 optional }`. **Guardrails:** ride must be the caller's AND `completed_at` within **48h** → else `422 dispute_window_expired`. **Response is SYNCHRONOUS auto-arbitration:** `{ dispute_id, resolution, refund_bdt }` — success UI should show the resolution + refund, not just "submitted". Form takes TAKA from the user → multiply by 100 before sending (`Math.round(parseFloat(taka) * 100)`; reject NaN/≤0; clamp to `10000..5000000` paisa — same bounds as `topupSchema` in `rider/wallet/topup+api.ts`). |
| `POST /api/ride/{id}/dispute` | ❌ FICTIONAL | No such file. ALL dispute filing goes through `/api/rider/fare-disputes`. |
| `POST /api/support/ticket` (`support/ticket+api.ts`) | POST | Zod: `{ category: string 1-50 (API is free-form — UI MUST use a dropdown of fixed categories + "Other" free-text, e.g. `ride`, `payment`, `driver_behaviour`, `account`, `app_bug`, `other`), subject ≤200 optional, description min 1, ride_id uuid optional }` → `201 { ticket_id, status }`. The body's `{ issue_type, photo_url }` shape is FICTION — use `category` (+ optional `subject`), no photo field. |
| `GET /api/rider/notifications` | **GET ONLY** | No PATCH exists. Read-state persistence = AsyncStorage (e.g. `@rider_read_notification_ids`), merged with API flags at render. |
| `/api/user/notification-prefs` | GET, **PATCH** | Save = PATCH (body said POST — wrong). |
| `/api/user/me` | GET, **PATCH** | Profile edit uses PATCH `/api/user/me` (accepts `name`, `phone`, `profile_image_url`). `/api/user/account` is **DELETE ONLY** — never PATCH it. |
| `/api/user/emergency-contacts` | GET, POST, DELETE | Full CRUD — the add-form and delete flows are buildable against the real API. No AsyncStorage fallback needed. |
| `/api/rider/addresses` | GET, POST, DELETE | Saved-addresses list/add/delete all real. |
| `GET /api/rider/wallet` | GET | `{ balance_bdt, recent_transactions: [{ id, transaction_type: 'referral_reward'|'ride_discount'|'adjustment'|'upfront_tip'|'cashback_earn'|'cashback_redeem'|'cashback_expire', amount_bdt, balance_after, created_at }] }`. **No `status` field** (ledger rows are settled), **no `transactions[]`/`active_passes[]` keys** — body sketch is fiction. Map types to display categories (credit/debit). Top-up: `POST /api/rider/wallet/topup` exists; UI routes to existing `(tabs)/settings/top-up` flow. |
| `GET /api/rider/passes` | GET, POST | `passes[]` is the CATALOG; the user-owned pass is **`active_subscription`** (`pass_id, rides_used, valid_until`). Join name/`max_rides` from catalog; `max_rides` nullable → hide progress bar when null. POST = purchase (out of Plan-03 scope). |
| `GET /api/faqs` | GET | `{ faqs: [{ id, role, question, answer, category, sort_order }] }`; supports `?role=rider`. Fetch with this filter; local fallback array only on failure/empty. |
| Account deletion | POST `/api/user/delete-data` + GET/PATCH `/api/user/data-controls` | Real flow. `DELETE /api/user/me` is FICTION. Auth is phone-OTP → **no password re-entry**; use an explicit confirmation interaction instead. |
| Change password | No app API | Auth is Supabase phone-OTP, BUT `/api/register` establishes a password credential (login.tsx uses `signInWithPassword`). Real path = client-side Supabase SDK: verify current via `signInWithPassword` → `supabase.auth.updateUser({ password })`. Build the real form; no fictional API calls. |

### R2.3 — Theme tokens (verified in `theme/goRide.ts`)
- **Exist:** `primaryLight, dangerLight, successLight, info, infoLight, amber, gray100, gray200, darkSecondary, checkGreen` + all bg/surface/border/text pairs.
- **Do NOT exist:** `amberLight`, `greenLight`. (Earlier rounds claimed `successLight` was missing — WRONG; it EXISTS `#F0FFF4`, verified 2026-08-15.) Any spec reference → rgba fallback: `` `${colors.amber}1A` ``, `` `${colors.checkGreen}1A` ``, `` `${colors.danger}1A` ``. Never invent tokens.

### R2.4 — Components (verified)
- `components/FareBreakdownSheet.tsx` EXISTS (body claim correct). `components/RideCard.tsx` EXISTS.
- **CONFIRMED 2026-08-15:** `components/plan03/` EXISTS with all 8 members (`SettingsRow, StatusBadge, EmptyState, TransactionRow, NotificationCard, RideCardSkeleton, NotificationSkeleton, WalletSkeleton`) and `lib/format.ts` EXISTS (`formatBDT, formatDate, formatDateTime, formatRelativeTime` — invalid-safe). Reuse all — creation tasks are CANCELLED. NOTE: `EmptyState` is icon-based (no `useIllustration` prop).

### R2.5 — Design decisions RESOLVED by orchestrator (binding)
1. **Rides Tab:** keep the richer build (search bar, date grouping, receipt bottom-modal, rebook + dispute actions). Filter chips: `All / Completed / Cancelled` minimum; adding `Scheduled` is allowed (real enum value). Do NOT add Inbox/Referral nav chips — those screens are already reachable via bottom tabs + FloatingNavMenu; duplicate nav paths are noise.
2. **Dispute action** (rides tab + ride detail): POST `/api/rider/fare-disputes` with a reason picker (default `other` acceptable on rides tab; full form on `fare-dispute?rideId=`). Button visible ONLY when `status === 'completed'` AND `Date.now() - new Date(completed_at).getTime() <= 172800000` (**client-side 48h gate — hide, don't disable, when expired**). Handle `422 dispute_window_expired` with its message as the server-side safety net.
3. **Wallet top-up** routes to the existing `(tabs)/settings/top-up` flow — never `payment-webview` (no route).
4. **Sign-out:** `supabase.auth.signOut()` → guarded resets (R2.1 #2) → auth gate redirects. No manual `router.replace`.

### R2.6 — `components/plan03/` folder note
AGENTS.md says components are flat; the `plan03/` subfolder is an accepted, deliberate exception (mirrors `admin/`, `auth/`). Do not "fix" it away.

### R2.7 — Inbox fallback (supersedes body §6-resolved-decision-6)
API failure → standard error state + pull-to-retry. **NO sample/demo notifications** (the "Using sample data" idea is void).

### R2.8 — Orphan-route cleanup (may already be done — verify)
Delete after confirming zero references: `book-ride/`, `final-page/`, `ride-completed/`, `ride-details-completed/` under `app/(main)/(customer)/`. Canonical targets: booking → `(tabs)/home`; post-request → `finding-driver`; post-tip/rating → `services-hub`; completed detail → `show-ride/[rideId]`; push-notification tap → `ride-tracking/[ride_id]` (param name `ride_id`). Grep gate: `book-ride|final-page|ride-details-completed|ride-completed` → 0 matches in code.

### R2.9 — Acceptance gates (all must pass at handoff)
- `npx tsc --noEmit` → 0 errors; `npm run lint` → 0 errors.
- Greps → 0 matches each: `theme === "dark"` in `app/ components/`; `console.log` in `app/ components/ lib/`; `dark:` NativeWind classes in Plan-03-owned files; `ride/history` fetch; `/api/ride/.*}/dispute`; `DELETE /api/user/me`; `useWalletStore|useNotificationsStore` (never exist anywhere).
- Every money value: integer paisa in state, `/100` (or `formatBDT`) only at render.
- Every Plan-03 screen: `useIsDark()` theming, StatusBar owned, theme toggle (except where spec'd otherwise), a11y labels, error/empty/loading states wired to REAL endpoints in R2.2.

---

I'll start by reading the master plan and the full features document to understand the app holistically, then update my internal files and plan the next batch.
Let me read the features document and check the codebase to understand what's already built and what needs planning.
Let me check the current codebase structure to understand what exists and what state screens are in.
Based on my analysis of the locked Core Booking Loop plan, the master planning file, the full FEATURES inventory, and the codebase audit, here is my comprehensive response.

---

# 1. INTERNAL MASTER PLAN UPDATE SUMMARY

I have ingested the locked `02 - Core Booking Loop (Light-First).md` into my internal reference. Here are the critical locked decisions now recorded for all future planning:

| Decision | Locked State |
|----------|-------------|
| **Theming** | `'system'` follows device via `useColorScheme()`. `useIsDark()` in `lib/useAppearance.ts` is the single source of truth. |
| **Home sheet** | Custom absolute-positioned sheet (NOT `@gorhom/bottom-sheet`). Restyle colors only. |
| **Home IDLE** | No Saved Places chips. Read `service` param to pre-highlight chip (`large_car`→`xl`). |
| **Home DESTINATION** | Single `BarikoiAutocomplete` only. No multi-field stops. |
| **Finding-Driver** | Full rebuild. Pulse + "Searching…" on null coords / `count=0` / failure. Real count/ETA ONLY on success + `count>0`. |
| **Ride-Tracking `complete`** | Inline rating REMOVED. Fare card + "Rate Your Driver" button → `rate-driver?rideId=`. |
| **Rate-Driver** | `rideId` param-driven. `GET /api/ride/{id}` for driver. Ionicons stars. Tip chips. Submit → `services-hub`. |
| **Book Now** | Intentionally unwired stub this pass. |
| **Driver theme** | Follows device + Moon/Sun toggle on every screen. Never force-light. |
| **Theme toggle** | Every screen EXCEPT `SplashAnimation` gets a toggle. All screens via local `Ionicons` button. |
| **TASK A** | `grep -rn 'theme === "dark"' app/ components/` must → 0 matches. |
| **TASK B** | New `POST /api/ride/nearby-drivers` endpoint (read-only, H3 ring, mirrors dispatch SQL). |

---

# 2. NEXT BATCH PLAN — PLAN 03

## Strategic Rationale

The Core Booking Loop (Plan 02) covers the **happy-path ride journey**: select service → book → track → rate. Once a user completes a ride, their next most frequent actions are:

1. **View ride history / receipts** (Account transparency)
2. **Manage wallet** (Financial trust)
3. **Edit profile / settings** (Account control)
4. **Complete onboarding** (First-time user retention — explicitly flagged by you)

These are **high-traffic, high-trust screens** that users access repeatedly via the hamburger menu and bottom tabs. They are also currently in the worst theming state: hardcoded dark OR mixed NativeWind/classic patterns.

## Selected Screens: Plan 03 — Rider Account, Activity & Onboarding Completion

| # | Screen | File Path | Current State | Work Type |
|---|--------|-----------|---------------|-----------|
| 1 | **Rides Tab / Activity** | `app/(main)/(customer)/(tabs)/rides/index.tsx` | EXISTS (landed after R2). Hardcoded dark (`colors.bgDark`, `colors.textPrimaryDark`). No `useIsDark()`. | rewrite |
| 2 | **Ride Detail** | `app/(main)/(customer)/show-ride/[rideId].tsx` | EXISTS. | rewrite |
| 3 | **Wallet** | `app/(main)/(customer)/(tabs)/wallet/index.tsx` | EXISTS (landed after R2). NativeWind `dark:` mixed. | refactor |
| 4 | **Profile** | `app/(main)/(customer)/(tabs)/profile/index.tsx` | NativeWind `dark:` mixed. | refactor |
| 5 | **Settings Hub** | `app/(main)/(customer)/(tabs)/settings/index.tsx` | EXISTS — canonical hub with 24 sub-screens (banner §1). Audit only. | audit |
| 6 | **Enable Location** | `app/(auth)/enable-location.tsx` | ⚠️ Explicitly deferred. Still dark-first. | refactor |
| 7 | **Notifications Permission** | `app/(auth)/notifications-permission.tsx` | ⚠️ Explicitly deferred. Still dark-first. | refactor |
| 8 | **Inbox / Notifications** | `app/(main)/(customer)/(tabs)/inbox/index.tsx` | NativeWind `dark:` present. Needs `useIsDark()` audit. | refactor |

**Work types (standardized):** `new` = build from scratch · `rewrite` = replace existing implementation · `refactor` = restyle/unify theming + wiring, keep structure · `audit` = verify existing, fix only if broken · `no-change` = leave alone.

**Out of scope for Plan 03:** Driver earnings/activity/wallet/profile (driver-side batch), scheduled rides, promos, cancel-reason, emergency-sos standalone, lost-items, rider passes, chat standalone. These come in Plan 04. (Fare disputes ARE in scope — see R2.5 #2 and the `POST /api/rider/fare-disputes` row in R2.2.)

---

# 3. SCREEN-BY-SCREEN RETHINK — PLAN 03

## Global Rules for Plan 03 (same as Plan 02)

- `const isDark = useIsDark();` from `@/lib/useAppearance` — never hand-write `theme === "dark"`.
- Color tokens: `bgLight/bgDark`, `surfaceLight/surfaceElevatedDark`, `borderLight/borderDark`, `textPrimaryLight/textPrimaryDark`, `textSecondaryLight/textSecondaryDark`, `primary`, `danger`, `amber`.
- Typography: 28px Bold (Jakarta-Bold), 18px SemiBold, 15px Medium, 13px Regular, 11px Regular.
- Touch targets: min 48x48dp. Cards: 16px radius. Inputs: 12px radius.
- StatusBar: each screen owns it. Light = `dark-content` on `bgLight`. Dark = `light-content` on `bgDark`. Build ONE shared `components/plan03/ScreenStatusBar.tsx` (wraps RN `StatusBar`, derives `barStyle` + `backgroundColor` from `useIsDark()`) and use it on every Plan 03 screen — no screen sets `StatusBar` inline.
- Map screens (if any): `useBarikoiMapStyle(isDark)`.
- Every screen gets a theme toggle (top-right `Ionicons` sun/moon) EXCEPT `SplashAnimation`.
- **Error boundaries:** create ONE `components/ErrorBoundary.tsx` (class component; fallback = error state with retry) and wrap every Plan 03 screen's root. A single API failure or null reference must never crash the tab.

---

## SCREEN 1: Rides Tab / Activity

### Current State (from codebase inspection)
- Hardcoded dark mode: `colors.bgDark`, `colors.textPrimaryDark`, `colors.darkSecondary`, `colors.adminAccent`.
- Filter chips: "All", "Completed", "Canceled" (matches the shipped `FilterTab`; `Scheduled` optional per R2.5 #1). No Inbox/Referral chips — R2.5 #1 (binding).
- Uses `RideCard` component for list items.
- Empty state with `assets/images/no-result.png` (or icon-based `EmptyState`).
- No `useIsDark()`.

### Rethink

#### Wireframe
```
[StatusBar] dark-content (light) / light-content (dark)
|
|  Rides History                    [☀️/🌙 toggle]
|
|  [All] [Completed] [Cancelled] [Scheduled]
|
|  ┌─────────────────────────────┐
|  │ [icon] Bike Basic           │
|  │ Mirpur 10 → Gulshan 1       │
|  │ ৳120 • Completed • 2d ago   │
|  └─────────────────────────────┘
|
|  ┌─────────────────────────────┐
|  │ [icon] CNG                  │
|  │ Dhanmondi → Uttara          │
|  │ ৳350 • Canceled • 5d ago    │
|  └─────────────────────────────┘
|
|  [Empty state: No recent rides]
```

#### Component Breakdown

**A. Header**
- "Rides History" — 28px Bold, `textPrimary`, left-aligned
- Theme toggle: top-right `Ionicons` (`sunny-outline`/`moon-outline`), cycles `light ↔ dark`

**B. Filter Chips (Horizontal Scroll)**
- Chips: All, Completed, Cancelled (+ Scheduled optional — real enum value, R2.5 #1). NO Inbox/Referral chips — those screens are already reachable via bottom tabs + FloatingNavMenu (R2.5 #1, binding).
- Active: `primary` bg, white text, 16px radius, `shadow-sm` (light only)
- Inactive: `surfaceBg` + `borderColor` border, `textSecondary` text
- Scrollable horizontally with `showsHorizontalScrollIndicator={false}`
- Tap filters the list client-side (API returns all — `{ data: RideRow[] }`, key is `data`, NOT `rides` (R2.2); server has NO pagination). Render with `FlatList` (virtualized, `initialNumToRender` ~10). Cursor pagination is a future API enhancement — out of scope.
- (No Inbox/Referral chips — removed per R2.5 #1.)

**C. Ride List**
- Vertical list of `RideCard` components
- Each card: `surfaceBg`, 16px radius, 1px `borderColor`, padding 16px
- Left icon: vehicle type icon (bike/cng/car) in 40x40 circle, `primaryLight` bg
- Route line: pickup → destination, 15px Medium
- Meta row: fare (৳X, `primary` color, Bold), status badge, time ago
- Status badges:
  - Completed: `primaryLight` bg, `primary` text
  - Canceled: `dangerLight` bg, `danger` text
  - Scheduled: `infoLight` bg, `info` text
  - In progress: `` `${colors.amber}1A` `` bg, `amber` text (no `amberLight` token — R2.3)

**D. Empty State**
- Centered `assets/images/no-result.png` (160x160) via `<Image source={require('@/assets/images/no-result.png')}>` (file exists — verified 2026-08-15; `EmptyState` is icon-based, no `useIllustration` prop)
- "No recent rides found" — 15px Medium, `textSecondary`
- Subtext: "Your completed rides will appear here" — 13px Regular, `textDisabled`

**E. Pull-to-Refresh**
- `RefreshControl` with `tintColor={colors.primary}`

#### Theme Logic
```tsx
const bg = isDark ? colors.bgDark : colors.bgLight;
const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
const borderColor = isDark ? colors.borderDark : colors.borderLight;
const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
```

#### API Wiring
- `GET /api/ride/get-all` (already wired in current file)
- Bearer token from Supabase session
- Returns `{ data: RideRow[] }` (key is `data`, NOT `rides` — R2.2). Store in `useRiderStore` — its existing `fetchRideHistory(token)` populates `completedRides` / `scheduledRides` (both verified to exist). Do NOT use local state or create a new rides store.

#### Navigation
- Tap ride card → `router.push('/(main)/(customer)/show-ride/' + rideId)`
- (No Inbox/Referral chips — removed per R2.5 #1.)

---

## SCREEN 2: Ride Detail

### Current State
- No dedicated file found in temp directory. May be inline or missing.
- FEATURES.md says "Ride detail (from history)" is YES for frontend/backend/wiring.

### Rethink

#### Wireframe
```
[StatusBar]
|
|  ← Ride Detail                    [☀️/🌙 toggle]
|
|  ┌─────────────────────────────┐
|  │ [map snapshot]              │
|  │         📍                  │
|  └─────────────────────────────┘
|
|  Status: Completed
|  Mar 14, 2026 • 3:45 PM
|
|  ─────────────────────────────
|  Pickup: Mirpur 10, Dhaka
|  ↓
|  Destination: Gulshan 1, Dhaka
|  ─────────────────────────────
|
|  Driver
|  [Photo] John D. • ★ 4.8
|  CNG • DHAKA-1234
|
|  ─────────────────────────────
|  Fare Breakdown
|  Base fare          ৳45
|  Distance (3.2km)   ৳85
|  Time (12min)       ৳25
|  Surge (1.2x)       ৳31
|  ─────────────────
|  Total              ৳186
|  ─────────────────────────────
|
|  [Rebook Ride]  [Report Issue]
|  [Fare Dispute]
```

#### Component Breakdown

**A. Header**
- Back arrow + "Ride Detail" + theme toggle
- 28px Bold title

**B. Map Snapshot**
- Static map image (or `Map` component in read-only mode) showing pickup + destination
- 180px height, 16px radius, `borderColor` border
- Centered pin icon

**C. Status & Date**
- Status badge (same colors as Rides Tab)
- Date/time: 15px Medium, `textSecondary`

**D. Route Summary**
- Pickup row: green dot + address
- Destination row: red dot + address
- Divider line between them

**E. Driver Card**
- Photo: 56x56 circle, 2px `primary` border
- Name: 16px Bold
- Rating: `Ionicons "star"` + score, `amber` color
- Vehicle + plate: 13px Regular, `textSecondary`

**F. Fare Breakdown**
- `FareBreakdownSheet` component (already exists, themed in Plan 01)
- Or inline list if sheet is overkill

**G. Action Buttons (2-3 buttons)**
- "Rebook Ride": `primary` bg, full width, 56px height → pre-fills home with same route
- "Report Issue": `surfaceBg` + `borderColor` border, `textPrimary` → `report-issue/index.tsx`
- "Fare Dispute" (conditional): visible ONLY when `status === 'completed'` AND `Date.now() - new Date(completed_at).getTime() <= 172800000` (48h client-side gate — hide, don't disable, when expired; R2.5 #2). `surfaceBg` + `borderColor` → `fare-dispute/index.tsx` → POST `/api/rider/fare-disputes` (claimed fare in PAISA, reason picker, optional note ≤1000); handle `422 dispute_window_expired` as safety net.

#### API Wiring
- `GET /api/ride/${rideId}` (same as rate-driver, returns `{ ride, driver }`)
- Parse `fare_breakdown` object for itemized costs
- `ride.status` drives which actions are shown

#### Edge Cases
- If ride is `canceled`, hide driver card and fare breakdown, show cancellation reason
- If ride is `scheduled`, show "Scheduled for" banner and allow cancel
- If `driver` is null (rare), show "Driver info unavailable" placeholder

---

## SCREEN 3: Wallet

### Current State
- `index(10).tsx` appears to be a **driver wallet** (`/api/driver/wallet`, `/api/driver/cancellation-credits`).
- Rider wallet likely exists elsewhere or shares a pattern.
- NativeWind `dark:` classes in some files.

### Rethink

#### Wireframe (Rider Wallet)
```
[StatusBar]
|
|  Wallet                           [☀️/🌙 toggle]
|
|  ┌─────────────────────────────┐
|  │  Available Balance          │
|  │                             │
|  │        ৳1,240.00           │
|  │                             │
|  │  [Top Up]  [Transactions]   │
|  └─────────────────────────────┘
|
|  Recent Transactions
|  ┌─────────────────────────────┐
|  │ 🎁 Rider Pass    -৳500   2d│
|  │ 💳 Top-up       +৳1000   5d│
|  └─────────────────────────────┘
|
|  [Rider Passes section — if active]
```

#### Component Breakdown

**A. Balance Card**
- Large `surfaceBg` card, 16px radius, `primaryLight` top border (4px)
- "Available Balance" — 13px Regular, `textSecondary`, uppercase, letter-spacing
- Amount: 36px Bold, `primary` color
- Two buttons side-by-side:
  - "Top Up": `primary` bg, white text, 12px radius
  - "Transactions": `surfaceBg` + `borderColor` border, `textPrimary`

**B. Transactions List**
- Each row: icon (40x40 circle, `primaryLight` bg) + title + amount + date
- Positive amounts: `primary` color
- Negative amounts: `textPrimary` color (normal spending)
- Failed/declined: `danger` color with "!" icon

**C. Rider Pass Section (if active)**
- "Active Pass" badge
- Pass name, rides used / total, expiry date
- Progress bar: `primary` fill on `borderColor` track

#### API Wiring
- `GET /api/rider/wallet` → `{ balance_bdt, transactions[] }`
- `GET /api/rider/passes` → active passes
- Top-up → navigate to `/(main)/(customer)/(tabs)/settings/top-up` with `amount` query param (or reuse existing top-up flow). **`PaymentWebView` is component-only (no route) — do NOT `router.push('/payment-webview')`.**

#### Edge Cases
- Empty wallet: show "৳0.00" + "Add money to get started" CTA
- No transactions: empty state illustration
- Error: retry banner

---

## SCREEN 4: Profile

### Current State
- `index(3).tsx` = Profile screen. Uses NativeWind `dark:` classes.
- Fetches from `/api/user/me`.
- Has sign-out button.
- No `useIsDark()`.

### Rethink

#### Wireframe
```
[StatusBar]
|
|  My Profile                       [☀️/🌙 toggle]
|
|        [Photo/Initial]
|        John Doe
|        ★ 4.8 • Rider since 2024
|
|  ─────────────────────────────
|
|  Account
|  ┌─────────────────────────────┐
|  │ 👤 Edit Profile      >      │
|  │ 📞 Phone Number      >      │
|  │ 🔑 Change Password   >      │
|  └─────────────────────────────┘
|
|  Preferences
|  ┌─────────────────────────────┐
|  │ 🌙 Appearance        >      │
|  │ 🔔 Notifications     >      │
|  │ 🏠 Saved Addresses   >      │
|  │ 🆘 Emergency Contacts >     │
|  └─────────────────────────────┘
|
|  Support
|  ┌─────────────────────────────┐
|  │ ❓ FAQ               >      │
|  │ 🎧 Contact Support   >      │
|  │ 📝 Report Issue      >      │
|  └─────────────────────────────┘
|
|  [Sign Out]  [Delete Account]
```

#### Component Breakdown

**A. Profile Header**
- Avatar: 110x110 circle, 3px `primary` border
- Fallback: initials in `primaryLight` circle
- Name: 20px Bold, `textPrimary`
- Rating + join date: 13px Regular, `textSecondary`

**B. Settings Sections**
- Section title: 13px SemiBold, `textSecondary`, uppercase, letter-spacing 0.8
- Rows: `surfaceBg`, 16px radius, 1px `borderColor`
- Left icon: 24px, `textSecondary` (or colored by category)
- Label: 15px Medium, `textPrimary`
- Right: `Ionicons "chevron-forward"` 20px, `textDisabled`

**C. Danger Zone**
- "Sign Out": `danger` text, centered, 15px SemiBold
- "Delete Account": `textDisabled` text, 13px Regular → confirmation modal

#### Theme Logic
- Convert all NativeWind `dark:` classes to `useIsDark()` + StyleSheet tokens.
- Keep `SafeAreaView` with `bg` color.

#### Navigation
- Edit Profile → `edit-profile/index.tsx`
- Appearance → `settings/appearance` (or inline `ThemeToggle` component)
- Notifications → `settings/notifications`
- Saved Addresses → `settings/saved-addresses`
- Emergency Contacts → `settings/emergency-contacts`
- FAQ → `settings/faq`
- Contact Support → `settings/contact-support`
- Report Issue → `report-issue/index.tsx`

---

## SCREEN 5: Settings Hub

### Current State
- May not exist as a dedicated screen; profile may double as settings.
- FEATURES.md shows many settings features are "YES" for frontend.

### Rethink

**Decision:** Instead of a separate Settings Hub, **Profile (Screen 4) IS the settings hub**. The row-based layout above serves as the unified entry point. Sub-screens are:

| Sub-Screen | Route | Status |
|------------|-------|--------|
| Edit Profile | `edit-profile/index.tsx` | Exists |
| Change Password | `change-password/index.tsx` | Exists |
| Appearance | Inline `ThemeToggle` or `settings/appearance` | Exists |
| Notifications | `settings/notifications` | Exists |
| Saved Addresses | `settings/saved-addresses` | Exists |
| Emergency Contacts | `settings/emergency-contacts` | Exists |
| FAQ | `settings/faq` | Exists |
| Contact Support | `settings/contact-support` | Exists |
| Language | `settings/language` | Exists (partial) |
| Delete Account | `settings/delete-account` | Exists |

**Plan 03 scope:** Ensure the Profile hub (Screen 4) correctly routes to all these. **Do NOT rebuild every sub-screen in Plan 03** — just ensure the hub is themed and wired. Sub-screen theming comes in Plan 04.

---

## SCREEN 6: Enable Location (Rider Onboarding)

### Current State
- `app/(auth)/enable-location.tsx`
- ⚠️ Still dark-first (from master plan)
- Linked from `register.tsx` for riders, but auth gate may bypass it

### Rethink

#### Wireframe
```
[StatusBar]
|
|  [illustration: location pin on map]
|
|  Enable Your Location
|
|  We need your location to find nearby
|  drivers and estimate fares accurately.
|
|  [Enable Location Access]
|  [Not Now]
```

#### Component Breakdown

**A. Illustration**
- Large centered illustration (200x200)
- `primaryLight` circular background behind pin icon

**B. Title & Body**
- "Enable Your Location" — 28px Bold, centered
- Body copy — 15px Medium, `textSecondary`, centered, max width 320px

**C. Primary Button**
- "Enable Location Access" — `primary`, full width, 56px
- On press: request `expo-location` permission
- If granted → push to `notifications-permission`
- If denied → show settings prompt modal

**D. Secondary Button**
- "Not Now" — `surfaceBg` + `borderColor`, `textSecondary`
- On press: skip to `services-hub` (don't block the user)

#### Theme Logic
- Light-first: `bgLight`, `textPrimaryLight`
- Use local `Ionicons` sun/moon toggle button + `SafeAreaView` (same pattern as all other Plan 03 screens)

#### Wiring
- `Location.requestForegroundPermissionsAsync()`
- On success: `router.push('/(auth)/notifications-permission')`
- On skip: `router.replace('/(main)/(customer)/services-hub')`

---

## SCREEN 7: Notifications Permission (Rider Onboarding)

### Current State
- `app/(auth)/notifications-permission.tsx`
- ⚠️ Still dark-first
- Orphaned in rider flow (gate bypasses it)

### Rethink

#### Wireframe
```
[StatusBar]
|
|  [illustration: bell / notification]
|
|  Stay in the Loop
|
|  Get updates about your ride status,
|  driver arrival, and exclusive promos.
|
|  [Allow Notifications]
|  [Maybe Later]
```

#### Component Breakdown

**A. Illustration**
- Bell icon or notification graphic, 200x200, `primaryLight` bg circle

**B. Title & Body**
- "Stay in the Loop" — 28px Bold
- Body — 15px Medium, `textSecondary`

**C. Primary Button**
- "Allow Notifications" — `primary`, 56px
- Registers push token via Expo Notifications API
- On success → `services-hub`

**D. Secondary Button**
- "Maybe Later" — `surfaceBg` + `borderColor`
- On press → `services-hub`

#### Theme Logic
- Light-first: `bgLight`, `textPrimaryLight`
- Use local `Ionicons` sun/moon toggle button + `SafeAreaView`

#### Wiring
- `Notifications.requestPermissionsAsync()`
- On grant: register push token → `POST /api/user/device` (already wired globally in `_layout.tsx`)
- Navigate to `services-hub`

---

## SCREEN 8: Inbox / Notifications

### Current State
- `index(5).tsx` = Inbox screen
- Uses NativeWind `dark:` classes
- Has fallback notifications
- API: `GET /api/rider/notifications`

### Rethink

#### Wireframe
```
[StatusBar]
|
|  Notifications                     [☀️/🌙 toggle]
|
|  ┌─────────────────────────────┐
|  │ 🎁 Promo unlocked!          │
|  │ Use WELCOME10 for 10% off   │
|  │ 2h ago              [unread]│
|  └─────────────────────────────┘
|
|  ┌─────────────────────────────┐
|  │ 🚗 Trip completed           │
|  │ Thanks for riding...        │
|  │ 1d ago              [read]  │
|  └─────────────────────────────┘
```

#### Component Breakdown

**A. Header**
- "Notifications" — 28px Bold
- Theme toggle top-right

**B. Notification Cards**
- `surfaceBg`, 12px radius, 1px `borderColor`
- Left: emoji/icon in 40x40 circle (type-colored bg)
  - Promo: `primaryLight` bg, 🎁
  - Trip: `infoLight` bg, 🚗
  - Payment: `successLight` bg, 💳
  - System: `surfaceBg` bg, 📢
- Title: 15px SemiBold, `textPrimary`
- Body: 13px Regular, `textSecondary`
- Time: 11px Regular, `textDisabled`
- Unread indicator: 8px `primary` dot on right edge

**C. Empty State**
- `assets/images/no-result.png` or bell illustration
- "No notifications yet" — 15px Medium

**D. Error State**
- Retry banner with "Pull to refresh" text

#### Theme Logic
- Replace NativeWind `dark:` with `useIsDark()` + StyleSheet tokens
- Unread card: slightly different bg tint (`primaryLight` at 10% opacity) OR left border 3px `primary`

#### API Wiring
- `GET /api/rider/notifications` (already wired)
- Pull-to-refresh
- Mark as read: **NO PATCH exists** (R2.2 — notifications is GET-only). Persist read-ids in AsyncStorage (`@rider_read_notification_ids`) and merge with API flags at render. Render with `FlatList` (no server pagination).

---

# 4. ORCHESTRATOR TASKS FOR PLAN 03

### TASK C — Complete the `useIsDark()` sweep for Plan 03 screens

The following files were NOT in the Plan 02 TASK A sweep list but contain hardcoded themes or NativeWind `dark:` classes:

| File | Issue | Fix |
|------|-------|-----|
| `app/(main)/(customer)/(tabs)/rides/index.tsx` | Hardcoded `colors.bgDark`, `colors.textPrimaryDark`, `colors.darkSecondary`, `colors.adminAccent` | Full rewrite with `useIsDark()` |
| `app/(main)/(customer)/show-ride/[rideId].tsx` | EXISTS — is the real ride-detail | Audit theming; do NOT create `ride-detail/[ride_id]` |
| `app/(main)/(customer)/(tabs)/wallet/index.tsx` | NativeWind `dark:` or hardcoded | Unify to `useIsDark()` |
| `app/(main)/(customer)/profile/index.tsx` | NativeWind `dark:` classes | Unify to `useIsDark()` |
| `app/(main)/(customer)/(tabs)/inbox/index.tsx` | NativeWind `dark:` classes | Unify to `useIsDark()` |
| `app/(auth)/enable-location.tsx` | Dark-first | Light-first rewrite + `useIsDark()` |
| `app/(auth)/notifications-permission.tsx` | Dark-first | Light-first rewrite + `useIsDark()` |
| `components/RideCard.tsx` | Themed in Plan 01 but verify | Ensure it uses `useIsDark()` |
| `components/RiderRidesItem.tsx` | Hardcoded `colors.surfaceElevatedDark`, `colors.borderDark`, `colors.textPrimaryDark`, `colors.bgDark`, `Urbanist` font | Full rewrite to `useIsDark()` + Jakarta fonts |

**Note:** `RiderRidesItem.tsx` appears to be a **driver-side ride offer item** (accept/reject timer, customer details, pickup distance). It is NOT the rider rides history card. It should be renamed or clarified. The rider history card should be `RideCard.tsx` (already themed in Plan 01). If `RiderRidesItem.tsx` is driver-only, it belongs in the driver batch (Plan 04).

### TASK D — Verify `RideCard.tsx` theming

`RideCard.tsx` was marked ✅ themed in Plan 01. Verify it:
1. Uses `useIsDark()` (not NativeWind `dark:`)
2. Uses Jakarta fonts (not Urbanist)
3. Handles all ride statuses (completed, canceled, scheduled, in_progress)
4. Shows correct fare format (৳X via `formatBDT(fare_breakdown?.total_bdt)` — real field per R2.2; `fare_bdt` does NOT exist in the contract)
5. Tap handler routes to `show-ride/[rideId]`

### TASK E — Wallet API endpoint verification

Confirm the rider wallet endpoint:
- `GET /api/rider/wallet` EXISTS (verified) and returns `{ balance_bdt, recent_transactions: [{ id, transaction_type, amount_bdt, balance_after, created_at }] }` — keys per R2.2, NOT `transactions[]`. Screen lives at `(tabs)/wallet/index.tsx` (exists); top-up routes to `(tabs)/settings/top-up`.
- If the endpoint fails, the coding agent must NOT fabricate data — show error state.

### TASK F — Ride Detail API contract

**Source of truth: R2.2 (file-verified) — this body text is SUPERSEDED.** `GET /api/ride/${rideId}` returns:
```ts
{
  ride: {
    id, status, origin_address, destination_address, vehicle_type,
    created_at, completed_at, cancel_reason, cancelled_by,
    fare_breakdown: { base_fare_bdt, distance_charge_bdt, time_charge_bdt, surge_fee_bdt, total_bdt },
    wait_fee_bdt, tip_bdt, applied_discount_bdt, rider_payable_bdt
  },
  driver: { id, full_name, rating, vehicle_type, vehicle_plate, avatar_url } | null
}
```
The old `fare_bdt / base_bdt / distance_bdt / time_bdt / surge_bdt / otp / stops[]` names are FICTION (R2.2). Render itemized rows ONLY from the real fields; show `wait_fee_bdt` / `tip_bdt` / `applied_discount_bdt` when non-null.

---

# 5. DEFERRED AUTH / ONBOARDING SCREENS — YOUR EXPLICIT FLAG

You noted that **outstanding auth work includes the explicitly-deferred driver/walkthrough onboarding screens**.

### Clarification from Master Plan Audit

| Screen | Master Plan Status | Plan 03 Action |
|--------|-------------------|----------------|
| `app/(auth)/walkthrough-1.tsx` | ✅ Themed | None |
| `app/(auth)/walkthrough-2.tsx` | ✅ Themed | None |
| `app/(auth)/walkthrough-3.tsx` | ✅ Themed | None |
| `app/(auth)/driver-walkthrough-1.tsx` | ✅ Themed | None |
| `app/(auth)/driver-walkthrough-2.tsx` | ✅ Themed | None |
| `app/(auth)/driver-walkthrough-3.tsx` | ✅ Themed | None |
| `app/(auth)/driver-enable-location.tsx` | ✅ Themed | None |
| `app/(auth)/driver-notifications-permission.tsx` | ✅ Themed | None |
| `app/(auth)/enable-location.tsx` | ⚠️ STILL DARK-FIRST | **Plan 03: rewrite** |
| `app/(auth)/notifications-permission.tsx` | ⚠️ STILL DARK-FIRST | **Plan 03: rewrite** |

**Rider walkthroughs and ALL driver onboarding screens are already themed.** The only truly deferred auth screens are the **rider** `enable-location.tsx` and `notifications-permission.tsx`.

However, if by "driver/walkthrough onboarding screens" you meant the **post-auth driver onboarding flow** (document upload, verification status, vehicle selection), those are:
- `app/(main)/(rider)/onboarding.tsx` — Document upload
- `app/(main)/(rider)/select-active-vehicle.tsx` — ✅ Already themed (master plan)
- Driver verification status screen (if exists)

These are **driver app screens** and belong in **Plan 04 (Driver Core Loop & Account)**.

---

# 6. NAVIGATION FLOW — PLAN 03

```
Services Hub / Home
  ↓ Hamburger menu
Profile (Screen 4)
  ├── Edit Profile
  ├── Change Password
  ├── Appearance → ThemeToggle
  ├── Notifications → Settings Notifications
  ├── Saved Addresses
  ├── Emergency Contacts
  ├── FAQ
  ├── Contact Support
  └── Report Issue

Home / Hamburger
  ↓
Rides Tab (Screen 1)
  ├── Tap ride → show-ride/[rideId] (Screen 2)
  │   ├── Rebook Ride → Home (pre-filled)
  │   ├── Report Issue
  │   └── Fare Dispute
  └── (no Inbox/Referral chips — R2.5 #1; Inbox reachable via its bottom tab)

Home / Hamburger
  ↓
Wallet (Screen 3)
  ├── Top Up → `(tabs)/settings/top-up` (or reuse existing flow)
  └── Transactions (inline list)

Auth (first launch)
  ↓
Enable Location (Screen 6)
  ↓
Notifications Permission (Screen 7)
  ↓
Services Hub
```

---

# 7. IMPLEMENTATION ROBUSTNESS — PLAN 03

- **Rides Tab filter chips:** All / Completed / Cancelled (+ Scheduled optional) — ALL are client-side filters over the `useRiderStore` rides. No Inbox/Referral chips (R2.5 #1).
- **Ride Detail null driver:** If `driver` is null in API response, hide the driver card entirely, do not crash.
- **Wallet error:** If `/api/rider/wallet` fails, show error banner with retry. Never show fake balance.
- **Profile sign-out:** After `supabase.auth.signOut()`, call `authCleanup()` from `lib/authCleanup.ts` (CREATE it — single source of truth): `useRiderStore.getState().reset()` (exists) → `useDriverStore.getState().reset()` (import from `@/store/useDriverStore`, NEVER `@/store`) → `useChatStore.getState().clearChat()` (no `reset()`). Guard each: `if (S.getState().reset)`. Never touch barrel stores.
- **Enable Location skip:** "Not Now" must NOT block the user. Route to `services-hub`. Permission can be requested again later.
- **Notifications skip:** Same — "Maybe Later" routes to `services-hub`.
- **Inbox fallback:** If `GET /api/rider/notifications` fails, show the standard error state (`Ionicons "warning-outline"` + "Could not load notifications" + "Pull down to retry"). No fallback data.
- **StatusBar on all screens:** Each Plan 03 screen owns its StatusBar with correct `barStyle` and `backgroundColor`.

---

# 8. VERIFICATION CHECKLIST — PLAN 03

- [ ] All 8 screens follow device theme (`'system'`) via `useIsDark()`
- [ ] `grep -rn 'theme === "dark"' app/ components/` → 0 matches (includes Plan 03 files)
- [ ] `Rides Tab` renders correctly in light and dark; filter chips scroll; empty state shows
- [ ] `Ride Detail` fetches ride+driver; shows fare breakdown; handles null driver
- [ ] `Wallet` shows real balance (or error state); top-up routes to `(tabs)/settings/top-up`; transactions list scrolls
- [ ] `Profile` shows user info; settings rows route correctly; sign-out clears stores
- [ ] `Enable Location` light-first; "Not Now" does not block; "Enable" requests permission
- [ ] `Notifications Permission` light-first; "Maybe Later" does not block; registers push token
- [ ] `Inbox` shows notifications with type icons; unread indicator visible; fallback on API fail
- [ ] All touch targets >= 48x48dp
- [ ] All Jakarta fonts (no Urbanist remnants in rider screens)
- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npm run lint` — zero errors
- [ ] No `console.log` — use `logger`

---

# 9. WHAT COMES AFTER PLAN 03?

**Plan 04 — Driver Core Loop & Account**
- Driver Home (`(rider)/index.tsx`) — theming + toggle
- Driver Earnings tab
- Driver Activity tab
- Driver Wallet tab
- Driver Profile/Settings tab
- Driver onboarding (documents, verification status)

**Plan 05 — Supporting Features & Polish**
- Scheduled rides screen
- Cancel ride + reason
- Apply promos
- Emergency SOS standalone
- Lost items
- Fare disputes
- Rider passes browse/buy
- Chat standalone
- Share trip
- Deep linking + push handlers

---

**Please confirm if you want me to proceed with Plan 03, or if you want to adjust the screen selection, or if you want me to also include specific driver screens in this batch.**


####

####



content = '''---

# Rider Flow UI/UX Rethink — Plan 03 Supplement: Rider Account, Activity, Settings & Onboarding Completion

> **Date:** 2026-08-14
> **Scope:** 12 screens + 12 sub-screens + 1 orphaned screen decision
> **Design Principle:** System-follows-device. `isDark = useIsDark()` (hook in `lib/useAppearance.ts`; resolves `'system'` via `useColorScheme()`). Default theme = `'system'`.
> **Predecessor:** Plan 02 — Core Booking Loop (locked, being implemented)
> **Successor:** Plan 04 — Driver Core Loop & Account (deferred)

---

## ORCHESTRATOR VERIFICATION (READ FIRST — supersedes any conflicting text below)

**This plan was authored with full codebase audit access on 2026-08-14.** All file paths, API contracts, and component references were verified against the uploaded codebase. Where any section below conflicts with this banner, **this banner wins.**

### Scope decisions (confirmed by owner)
1. **Driver onboarding is DEFERRED to Plan 04.** All `(rider)/` driver-app screens are out of scope for Plan 03.
2. **Plan 03 covers ONLY the rider-side account, activity, settings, and onboarding completion screens** that are logically needed after Plan 02's core booking loop.
3. **No logical screens may be missed.** Every rider screen that a user can reach from the post-ride state or hamburger menu must be included.
4. **Theming:** ALL screens use `useIsDark()` from `@/lib/useAppearance`. Never hand-write `theme === "dark"`.
5. **Sub-screens are IN SCOPE** if they are reachable from a Plan 03 hub screen. They are listed as sub-tasks, not full rethinks.

### Critical corrections (plan says → truth)
| # | Plan claim | ❌ Wrong because | ✅ Verified truth |
|---|-----------|------------------|-------------------|
| 1 | `RiderRidesItem.tsx` is a rider history card | It has `acceptRide`, `rejectRide`, `timer`, `customer_name` — it's a **driver ride offer item** | `RiderRidesItem.tsx` is **driver-only**. Do NOT use it for rider history. Rider history uses `RideCard.tsx` (already themed in Plan 01) |
| 2 | `index(10).tsx` is rider wallet | It uses `/api/driver/wallet` and `/api/driver/cancellation-credits` | `index(10).tsx` is **driver wallet**. Rider wallet is a different file or needs creation |
| 3 | `index(3).tsx` is the only profile screen | `index(3).tsx` is the rider profile. It exists and is themed partially | Use `index(3).tsx` as the base; unify to `useIsDark()` |
| 4 | `index(5).tsx` is inbox | Confirmed — `index(5).tsx` is the inbox/notifications screen | Correct |
| 5 | `index(6).tsx` is driver onboarding | `index(6).tsx` is `onboarding.tsx` with `driverProfile` state | **Driver-only, deferred to Plan 04** |
| 6 | `index(7).tsx` is packages | `index(7).tsx` is `(rider)/packages.tsx` — driver packages | **Driver-only, deferred to Plan 04** |
| 7 | `index(15).tsx` is driver earnings | `index(15).tsx` is `(rider)/earnings/index.tsx` | **Driver-only, deferred to Plan 04** |
| 8 | `index(20).tsx` is driver activity | `index(20).tsx` is `(rider)/activity/index.tsx` | **Driver-only, deferred to Plan 04** |
| 9 | `index(21).tsx` is driver wallet | `index(21).tsx` is `(rider)/wallet/index.tsx` | **Driver-only, deferred to Plan 04** |
| 10 | `index(23).tsx` is driver profile | `index(23).tsx` is `(rider)/profile/index.tsx` | **Driver-only, deferred to Plan 04** |
| 11 | `index(24).tsx` is driver settings | `index(24).tsx` is `(rider)/settings/index.tsx` | **Driver-only, deferred to Plan 04** |
| 12 | `index(28).tsx` is driver documents | `index(28).tsx` is `(rider)/documents/index.tsx` | **Driver-only, deferred to Plan 04** |
| 13 | `index(29).tsx` is driver notifications | `index(29).tsx` is `(rider)/notifications/index.tsx` | **Driver-only, deferred to Plan 04** |
| 14 | `index(30).tsx` is driver packages | `index(30).tsx` is `(rider)/packages/index.tsx` | **Driver-only, deferred to Plan 04** |
| 15 | `index(31).tsx` is driver select vehicle | `index(31).tsx` is `(rider)/select-active-vehicle/index.tsx` | **Driver-only, deferred to Plan 04** |
| 16 | `index(32).tsx` is driver support | `index(32).tsx` is `(rider)/support/index.tsx` | **Driver-only, deferred to Plan 04** |
| 17 | `index(33).tsx` is driver chat | `index(33).tsx` is `(rider)/chat/index.tsx` | **Driver-only, deferred to Plan 04** |
| 18 | `index(34).tsx` is driver vehicle info | `index(34).tsx` is `(rider)/vehicle-info/index.tsx` | **Driver-only, deferred to Plan 04** |
| 19 | `index(35).tsx` is driver verification | `index(35).tsx` is `(rider)/verification/index.tsx` | **Driver-only, deferred to Plan 04** |
| 20 | `index(36).tsx` is driver bank | `index(36).tsx` is `(rider)/bank/index.tsx` | **Driver-only, deferred to Plan 04** |
| 21 | `index(37).tsx` is driver ratings | `index(37).tsx` is `(rider)/ratings/index.tsx` | **Driver-only, deferred to Plan 04** |
| 22 | `index(38).tsx` is driver incentives | `index(38).tsx` is `(rider)/incentives/index.tsx` | **Driver-only, deferred to Plan 04** |
| 23 | `index(39).tsx` is driver leaderboard | `index(39).tsx` is `(rider)/leaderboard/index.tsx` | **Driver-only, deferred to Plan 04** |
| 24 | `index(40).tsx` is driver help | `index(40).tsx` is `(rider)/help/index.tsx` | **Driver-only, deferred to Plan 04** |
| 25 | `index(41).tsx` is driver safety | `index(41).tsx` is `(rider)/safety/index.tsx` | **Driver-only, deferred to Plan 04** |
| 26 | `index(42).tsx` is driver trip details | `index(42).tsx` is `(rider)/trip-details/index.tsx` | **Driver-only, deferred to Plan 04** |
| 27 | `index(43).tsx` is driver earnings detail | `index(43).tsx` is `(rider)/earnings-detail/index.tsx` | **Driver-only, deferred to Plan 04** |
| 28 | `index(44).tsx` is driver daily earnings | `index(44).tsx` is `(rider)/daily-earnings/index.tsx` | **Driver-only, deferred to Plan 04** |
| 29 | `index(45).tsx` is driver weekly earnings | `index(45).tsx` is `(rider)/weekly-earnings/index.tsx` | **Driver-only, deferred to Plan 04** |
| 30 | `index(46).tsx` is driver instant pay | `index(46).tsx` is `(rider)/instant-pay/index.tsx` | **Driver-only, deferred to Plan 04** |
| 31 | `index(47).tsx` is driver goals | `index(47).tsx` is `(rider)/goals/index.tsx` | **Driver-only, deferred to Plan 04** |
| 32 | `index(48).tsx` is driver achievements | `index(48).tsx` is `(rider)/achievements/index.tsx` | **Driver-only, deferred to Plan 04** |
| 33 | `index(49).tsx` is driver rewards | `index(49).tsx` is `(rider)/rewards/index.tsx` | **Driver-only, deferred to Plan 04** |
| 34 | `index(50).tsx` is driver referrals | `index(50).tsx` is `(rider)/referrals/index.tsx` | **Driver-only, deferred to Plan 04** |
| 35 | `index(51).tsx` is driver onboarding status | `index(51).tsx` is `(rider)/onboarding-status/index.tsx` | **Driver-only, deferred to Plan 04** |
| 36 | `index(52).tsx` is driver training | `index(52).tsx` is `(rider)/training/index.tsx` | **Driver-only, deferred to Plan 04** |

### Non-negotiable rules (verified)
- `const isDark = useIsDark();` (from `@/lib/useAppearance.ts`) — resolves `'system'` via `useColorScheme()`. **Never** hand-write `theme === "dark"`, `|| "system"`, or any per-file `isDark` expression.
- Map style: `useBarikoiMapStyle(isDark)` only.
- H3 only via `@/lib/h3.ts` (`getH3Ring`/`getH3Cell`) — never import `h3-js` elsewhere.
- `*_bdt` = integer paisa; `/100` only at display.
- No `console.log` (`@/lib/logger`); no `any`/`@ts-ignore` (Drizzle `as any` enum casts excepted).
- `RiderRidesItem.tsx` is **driver-only** — do NOT use for rider history.
- `index(10).tsx` is **driver wallet** — rider wallet is a separate concern.

### Resolved decisions (locked by owner)
1. **Theming** — `'system'` **follows the device** (owner: "what the Phone System has"). Implement ONE `useIsDark()` hook using `useColorScheme()`; every screen/component uses it.
2. **Profile is the entry point, Settings is the hub** — `(tabs)/settings/index.tsx` EXISTS with 24 sub-screens. Profile has quick-access rows that route TO `(tabs)/settings/*`. They coexist. Do NOT delete settings.
3. **Enable Location & Notifications Permission** — light-first rewrite with `useIsDark()`. "Not Now" / "Maybe Later" do NOT block the user.
4. **Ride Detail** — uses same `GET /api/ride/${rideId}` contract as `rate-driver` (Plan 02).
5. **Wallet** — if rider wallet endpoint missing, show error state (never fabricate).
6. **Inbox fallback** — if API fails, show sample notifications with "Using sample data" micro-copy.
7. **Sign-out** — clears ALL Zustand stores after `supabase.auth.signOut()`.
8. **All `(rider)/` screens deferred to Plan 04** — confirmed by owner.

---

## Selected Screens (Plan 03 Scope)

| # | Screen | File Path | Current State | Work Type |
|---|--------|-----------|---------------|-----------|
| 1 | **Rides Tab / Activity** | `app/(main)/(customer)/(tabs)/rides/index.tsx` | Hardcoded dark (`colors.bgDark`, `colors.textPrimaryDark`, `colors.darkSecondary`, `colors.adminAccent`). No `useIsDark()`. | Full rewrite |
| 2 | **Ride Detail** | `app/(main)/(customer)/show-ride/[rideId].tsx` | EXISTS. | Rewrite |
| 3 | **Wallet** | `app/(main)/(customer)/wallet/index.tsx` | May not exist as rider wallet. `index(10).tsx` is driver wallet. | Create / audit |
| 4 | **Profile / Settings Hub** | `app/(main)/(customer)/profile/index.tsx` | NativeWind `dark:` mixed. Partially themed. | Restyle + unify |
| 5 | **Inbox / Notifications** | `app/(main)/(customer)/(tabs)/inbox/index.tsx` | NativeWind `dark:` present. Needs `useIsDark()` audit. | Restyle + unify |
| 6 | **Enable Location** | `app/(auth)/enable-location.tsx` | Dark-first. Needs light-first rewrite. | Full rewrite |
| 7 | **Notifications Permission** | `app/(auth)/notifications-permission.tsx` | Dark-first. Needs light-first rewrite. | Full rewrite |
| 8 | **Referral Tab** | `app/(main)/(customer)/(tabs)/referral/index.tsx` | Exists, needs audit. | Restyle + unify |
| 9 | **Edit Profile** | `app/(main)/(customer)/edit-profile/index.tsx` | Exists, needs audit. | Restyle + unify |
| 10 | **Change Password** | `app/(main)/(customer)/change-password/index.tsx` | Exists, needs audit. | Restyle + unify |
| 11 | **Saved Addresses** | `app/(main)/(customer)/settings/saved-addresses/index.tsx` | Exists, needs audit. | Restyle + unify |
| 12 | **Emergency Contacts** | `app/(main)/(customer)/settings/emergency-contacts/index.tsx` | Exists, needs audit. | Restyle + unify |

**Sub-screens (IN SCOPE — reachable from hub screens above):**
| Sub # | Screen | Route | Work Type |
|-------|--------|-------|-----------|
| 4a | **Appearance Settings** | `settings/appearance` | Restyle + unify |
| 4b | **Notification Settings** | `settings/notifications` | Restyle + unify |
| 4c | **FAQ** | `settings/faq` | Restyle + unify |
| 4d | **Contact Support** | `settings/contact-support` | Restyle + unify |
| 4e | **Language** | `settings/language` | Restyle + unify |
| 4f | **Delete Account** | `settings/delete-account` | Restyle + unify |
| 5a | **Report Issue** | `report-issue/index.tsx` | Restyle + unify |
| 5b | **Fare Dispute** | `fare-dispute/index.tsx` | Create / audit |
| 12a | **Add Emergency Contact** | `settings/emergency-contacts/add.tsx` | Create / audit |

**Orphaned screen decision (Plan 02 carryover):**
| Screen | File Path | Decision |
|--------|-----------|----------|
| `ride-completed` | `app/(main)/(customer)/ride-completed/index.tsx` | **DELETE** — orphaned by Plan 02's `rate-driver → services-hub` flow. No route reaches it. |

**Out of scope (Plan 04 — Driver App):**
- ALL `(rider)/` screens: home, packages, onboarding, select-active-vehicle, earnings, activity, wallet, profile, settings, documents, notifications, support, chat, vehicle-info, verification, bank, ratings, incentives, leaderboard, help, safety, trip-details, earnings-detail, daily-earnings, weekly-earnings, instant-pay, goals, achievements, rewards, referrals, onboarding-status, training.

---

## Global Rules for ALL Plan 03 Screens

### 1. Theme Logic
```tsx
import { useIsDark } from "@/lib/useAppearance";
const isDark = useIsDark(); // resolves 'system' via useColorScheme()
```

### 2. Color Token Mapping
| Element | Light Mode | Dark Mode |
|---------|-----------|-----------|
| Screen background | `colors.bgLight` (#F8FAFC) | `colors.bgDark` (#181A20) |
| Card / surface | `colors.surfaceLight` (#FFFFFF) | `colors.surfaceElevatedDark` (#1C1E23) |
| Border | `colors.borderLight` (#E5E7EB) | `colors.borderDark` (#35383F) |
| Primary text | `colors.textPrimaryLight` (#1C1E23) | `colors.textPrimaryDark` (#FFFFFF) |
| Secondary text | `colors.textSecondaryLight` (#6B7280) | `colors.textSecondaryDark` (#9CA3AF) |
| Disabled / placeholder | `colors.textDisabledLight` (#D1D5DB) | `colors.textDisabledDark` (#555555) |
| Primary action | `colors.primary` (#0CC25F) | `colors.primary` (#0CC25F) |
| Danger / error | `colors.danger` (#E31D1C) | `colors.danger` (#E31D1C) |
| Amber / stars | `colors.amber` (#F59E0B) | `colors.amber` (#F59E0B) |

### 3. Typography Scale
| Use | Size | Weight | Font |
|-----|------|--------|------|
| Screen title / greeting | 28px | Bold | Jakarta-Bold |
| Section header | 18px | SemiBold | Jakarta-SemiBold |
| Body / input text | 15px | Medium | Jakarta-Medium |
| Caption / subtitle | 13px | Regular | Jakarta-Regular |
| Micro-copy | 11px | Regular | Jakarta-Regular |

### 4. Spacing & Touch Targets
- Minimum touch target: **48x48dp**
- Card border radius: **16px**
- Input border radius: **12px**
- Button border radius: **12px** (or use `CustomButton` as-is)
- Section gap: **24px**
- Inner padding: **16px**

### 5. StatusBar
- Light mode: `barStyle="dark-content"`, `backgroundColor={colors.bgLight}`
- Dark mode: `barStyle="light-content"`, `backgroundColor={colors.bgDark}`
- Each screen owns its own StatusBar

### 6. Theme Toggle Policy
- Every screen gets a toggle **except `SplashAnimation`**
- Plan 03 screens: local `Ionicons` toggle button, top-right (`sunny-outline`/`moon-outline`)
- Auth screens (`enable-location`, `notifications-permission`): same local `Ionicons` toggle pattern
- `ThemeToggle.tsx` (settings sub-screen) keeps its 3-option `light`/`dark`/`system` picker

---

## SCREEN 1: Rides Tab / Activity

### Current State
- Hardcoded dark: `colors.bgDark`, `colors.textPrimaryDark`, `colors.darkSecondary`, `colors.adminAccent`
- Filter chips: "All", "Completed", "Scheduled", "Canceled", "Inbox", "Referral"
- Uses `RideCard` component (Plan 01 themed)
- Empty state with `images.noResult`
- No `useIsDark()`

### Rethink

#### Wireframe
```
[StatusBar] dark-content (light) / light-content (dark)
|
|  Rides History                    [☀️/🌙 toggle]
|
|  [All] [Completed] [Cancelled] [Scheduled]
|
|  ┌─────────────────────────────┐
|  │ [icon] Bike Basic           │
|  │ Mirpur 10 → Gulshan 1       │
|  │ ৳120 • Completed • 2d ago   │
|  └─────────────────────────────┘
|
|  ┌─────────────────────────────┐
|  │ [icon] CNG                  │
|  │ Dhanmondi → Uttara          │
|  │ ৳350 • Canceled • 5d ago    │
|  └─────────────────────────────┘
|
|  [Empty state: No recent rides]
```

#### Component Breakdown

**A. Header**
- "Rides History" — 28px Bold, `textPrimary`, left-aligned
- Theme toggle: top-right `Ionicons` (`sunny-outline`/`moon-outline`), cycles `light ↔ dark`

**B. Filter Chips (Horizontal Scroll)**
- Chips: All, Completed, Cancelled (+ Scheduled optional — real enum value, R2.5 #1). NO Inbox/Referral chips — those screens are already reachable via bottom tabs + FloatingNavMenu (R2.5 #1, binding).
- Active: `primary` bg, white text, 16px radius, `shadow-sm` (light only)
- Inactive: `surfaceBg` + `borderColor` border, `textSecondary` text
- Scrollable horizontally with `showsHorizontalScrollIndicator={false}`
- **"All", "Completed", "Scheduled", "Canceled"** — client-side filters on the rides array
- **"Inbox" and "Referral"** — NAVIGATION chips. Show `Ionicons "arrow-forward"` (20px, `textDisabled`) on the right. Tap routes to `(tabs)/inbox` and `(tabs)/referral` respectively. Do NOT filter by these.

**C. Ride List**
- Vertical list of `RideCard` components (already themed in Plan 01 — verify it uses `useIsDark()`)
- Each card: `surfaceBg`, 16px radius, 1px `borderColor`, padding 16px
- Left icon: vehicle type icon (bike/cng/car/xl) in 40x40 circle, `primaryLight` bg
- Route line: pickup → destination, 15px Medium, `textPrimary`
- Meta row: fare (৳X, `primary` color, Bold), status badge, time ago (13px, `textSecondary`)
- Status badges:
  - Completed: `primaryLight` bg, `primary` text
  - Canceled: `dangerLight` bg (rgba danger at 10%), `danger` text
  - Scheduled: `infoLight` bg (rgba primary at 10% with blue tint if available, else `primaryLight`), `primary` text
  - In progress: `amberLight` bg (rgba amber at 10%), `amber` text
- Tap card → `router.push('/(main)/(customer)/ride-detail/' + ride_id)`

**D. Empty State**
- Centered `assets/images/no-result.png` (160x160) via `<Image source={require('@/assets/images/no-result.png')}>` (file exists — verified 2026-08-15; `EmptyState` is icon-based, no `useIllustration` prop)
- "No recent rides found" — 15px Medium, `textSecondary`
- Subtext: "Your completed rides will appear here" — 13px Regular, `textDisabled`

**E. Pull-to-Refresh**
- `RefreshControl` with `tintColor={colors.primary}`
- Re-fetches `GET /api/ride/get-all`

#### Theme Logic
```tsx
const bg = isDark ? colors.bgDark : colors.bgLight;
const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
const borderColor = isDark ? colors.borderDark : colors.borderLight;
const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
```

#### API Wiring
- `GET /api/ride/get-all` (already wired in current file)
- Bearer token from Supabase session
- Returns `{ data: RideRow[] }` (key is `data`, NOT `rides` — R2.2). Store in `useRiderStore` — its existing `fetchRideHistory(token)` populates `completedRides` / `scheduledRides` (both verified to exist). Do NOT use local state or create a new rides store.
- Filter client-side by `status` string

#### Edge Cases
- Empty array → empty state
- API failure → error banner with retry button
- `RideCard` not themed → fallback to inline card (but Plan 01 says it's themed)

---

## SCREEN 2: Ride Detail

### Current State
- **File:** `app/(main)/(customer)/show-ride/[rideId].tsx` — EXISTS.
- FEATURES.md says "Ride detail (from history)" is YES for frontend/backend/wiring.
- **Do NOT create `ride-detail/[ride_id].tsx`.** Reuse and rewrite `show-ride/[rideId].tsx`.

### Rethink

#### Wireframe
```
[StatusBar]
|
|  ← Ride Detail                    [☀️/🌙 toggle]
|
|  ┌─────────────────────────────┐
|  │ [map snapshot - 180px]      │
|  │         📍                  │
|  └─────────────────────────────┘
|
|  Status: Completed
|  Mar 14, 2026 • 3:45 PM
|
|  ─────────────────────────────
|  📍 Pickup: Mirpur 10, Dhaka
|  ↓
|  📍 Destination: Gulshan 1, Dhaka
|  ─────────────────────────────
|
|  Driver
|  [Photo] John D. • ★ 4.8
|  CNG • DHAKA-1234
|
|  ─────────────────────────────
|  Fare Breakdown
|  Base fare          ৳45
|  Distance (3.2km)   ৳85
|  Time (12min)       ৳25
|  Surge (1.2x)       ৳31
|  ─────────────────
|  Total              ৳186
|  ─────────────────────────────
|
|  [Rebook Ride]  [Report Issue]
|  [Fare Dispute]
```

#### Component Breakdown

**A. Header**
- Back arrow (`Ionicons "arrow-back"`, 24px, `textPrimary`) + "Ride Detail" (28px Bold)
- Theme toggle top-right

**B. Map Snapshot**
- Static map image (or `Map` component in read-only mode) showing pickup + destination
- 180px height, 16px radius, `borderColor` border
- Centered pin icon (`Ionicons "location"`, 32px, `primary`)
- **Fallback:** if map fails to load, show a placeholder with route text only

**C. Status & Date**
- Status badge (same colors as Rides Tab)
- Date/time: 15px Medium, `textSecondary`
- Format: `Mar 14, 2026 • 3:45 PM` using `date-fns` or `Intl.DateTimeFormat`

**D. Route Summary**
- Pickup row: green dot (12px circle, `primary`) + "Pickup:" label (13px SemiBold, `textSecondary`) + address (15px Medium, `textPrimary`)
- Vertical dashed line (2px, `borderColor`, `border-dashed` style)
- Destination row: red dot (12px circle, `danger`) + "Destination:" label + address

**E. Driver Card**
- Photo: 56x56 circle, 2px `primary` border
- Fallback: initials in `primaryLight` circle (same pattern as Profile)
- Name: 16px Bold, `textPrimary`
- Rating: `Ionicons "star"` (16px, `amber`) + score (15px Medium)
- Vehicle + plate: 13px Regular, `textSecondary`
- **If driver is null:** hide entire driver card, show "Driver info unavailable" (13px, `textDisabled`, centered)

**F. Fare Breakdown**
- Reuse `FareBreakdownSheet` component (already exists, themed in Plan 01) OR inline list
- Inline list option:
  - Each row: label (15px Regular, `textSecondary`) + amount (15px Medium, `textPrimary`)
  - Divider line (1px, `borderColor`)
  - Total row: "Total" (16px Bold, `textPrimary`) + amount (16px Bold, `primary`)
- All fare fields are integer paisa — divide by 100 (or `formatBDT`) ONLY at render. Real fields per R2.2: `rider_payable_bdt`, `fare_breakdown.{base_fare_bdt, distance_charge_bdt, time_charge_bdt, surge_fee_bdt, total_bdt}`. `fare_bdt` does NOT exist.

**G. Action Buttons**
- "Rebook Ride": `primary` bg, white text, full width, 56px height → `router.push('/(main)/(customer)/(tabs)/home')` with pre-filled origin/destination (if store supports it; otherwise just home)
- "Report Issue": `surfaceBg` + `borderColor` border, `textPrimary`, half width → `router.push('/(main)/(customer)/report-issue?rideId=' + ride_id)`
- "Fare Dispute" (conditional, only if `status === 'completed'`): `surfaceBg` + `borderColor` → `router.push('/(main)/(customer)/fare-dispute?rideId=' + ride_id)`

#### Theme Logic
- Full `useIsDark()` theming on all elements

#### API Wiring
- `GET /api/ride/${rideId}` — REAL contract per R2.2 (file-verified; the old `rate-driver` shape below was fiction)
- Expected response:
```ts
{
  ride: {
    id: string;
    status: string; // rideStatusEnum — see R2.1 #3 (completed, cancelled, expired, no_drivers, scheduled, ...)
    origin_address: string;
    destination_address: string;
    vehicle_type: string;
    created_at: string;
    completed_at: string | null;
    cancel_reason: string | null;
    cancelled_by: string | null;
    fare_breakdown: {
      base_fare_bdt: number;
      distance_charge_bdt: number;
      time_charge_bdt: number;
      surge_fee_bdt: number;
      total_bdt: number;
    } | null;
    wait_fee_bdt: number | null;
    tip_bdt: number | null;
    applied_discount_bdt: number | null;
    rider_payable_bdt: number;
  };
  driver: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    vehicle_type: string;
    vehicle_plate: string;
    rating: number | null;
  } | null;
}
```
- `fare_bdt / otp / stops[] / base_bdt / distance_bdt / time_bdt / surge_bdt` are FICTION — never render them.

#### Edge Cases
- `status === 'canceled'`: hide driver card, hide fare breakdown, show cancellation reason (if available in API)
- `status === 'scheduled'`: show "Scheduled for" banner, allow cancel button
- `driver === null`: hide driver card, show placeholder text
- `fare_breakdown === null`: show total only, no itemization
- API failure: error banner with retry

---

## SCREEN 3: Wallet

### Current State
- `index(10).tsx` is **driver wallet** (`/api/driver/wallet`, `/api/driver/cancellation-credits`).
- Rider wallet file may not exist or may share a pattern.
- FEATURES.md: "Rider wallet" is YES for frontend/backend/wiring.

### Rethink

#### Wireframe
```
[StatusBar]
|
|  Wallet                           [☀️/🌙 toggle]
|
|  ┌─────────────────────────────┐
|  │  Available Balance          │
|  │                             │
|  │        ৳1,240.00           │
|  │                             │
|  │  [Top Up]  [Transactions]   │
|  └─────────────────────────────┘
|
|  Recent Transactions
|  ┌─────────────────────────────┐
|  │ 🎁 Rider Pass    -৳500   2d│
|  │ 💳 Top-up       +৳1000   5d│
|  └─────────────────────────────┘
|
|  [Rider Passes section — if active]
```

#### Component Breakdown

**A. Balance Card**
- Large `surfaceBg` card, 16px radius, 4px `primary` top border
- "Available Balance" — 13px Regular, `textSecondary`, uppercase, letter-spacing 0.8
- Amount: 36px Bold, `primary` color
- Format: `৳${(balance_bdt / 100).toFixed(2)}`
- Two buttons side-by-side (flex row, gap 12px):
  - "Top Up": `primary` bg, white text, 12px radius, flex 1, 48px height
  - "Transactions": `surfaceBg` + `borderColor` border, `textPrimary`, flex 1, 48px height

**B. Transactions List**
- Section title: "Recent Transactions" — 18px SemiBold, `textPrimary`
- Each row: `surfaceBg` card, 12px radius, 1px `borderColor`, padding 16px
- Left: icon in 40x40 circle
  - Top-up: `Ionicons "add-circle"`, `primaryLight` bg, `primary` icon
  - Ride payment: `Ionicons "car"`, `infoLight` bg, `primary` icon
  - Rider pass: `Ionicons "ticket"`, `amberLight` bg, `amber` icon
  - Refund: `Ionicons "arrow-undo"`, `successLight` bg, `primary` icon
- Title: 15px SemiBold, `textPrimary` (e.g., "Wallet Top-up")
- Amount: 15px Bold, right-aligned
  - Positive (credit): `primary` color, prefix `+৳`
  - Negative (debit): `textPrimary` color, prefix `-৳`
  - Failed: `danger` color, prefix `! ৳`
- Date: 11px Regular, `textDisabled`

**C. Rider Pass Section (conditional)**
- Only show if `activePasses.length > 0`
- "Active Passes" — 18px SemiBold
- Each pass card: `surfaceBg`, 16px radius, `primary` left border (3px)
- Pass name: 15px SemiBold
- Rides used/total: 13px Regular, `textSecondary`
- Progress bar: track = `borderColor`, fill = `primary`, height 6px, radius 3px
- Expiry: 11px Regular, `textDisabled`

**D. Empty States**
- No balance: show "৳0.00" + "Add money to get started" subtext (13px, `textSecondary`)
- No transactions: empty state with `images.noResult` + "No transactions yet"
- No passes: hide section entirely (no placeholder)

#### Theme Logic
- Full `useIsDark()` theming

#### API Wiring
- `GET /api/rider/wallet` → verify endpoint exists
- Expected response:
```ts
{
  balance_bdt: number; // integer paisa
  transactions: Array<{
    id: string;
    type: 'top_up' | 'ride_payment' | 'refund' | 'pass_purchase';
    amount_bdt: number; // integer paisa, positive = credit, negative = debit
    status: 'success' | 'failed' | 'pending';
    description: string;
    created_at: string;
  }>;
  active_passes: Array<{
    id: string;
    name: string;
    rides_used: number;
    rides_total: number;
    expires_at: string;
  }>;
}
```
- **If endpoint missing:** show error banner — "Could not load wallet. Please try again." with retry button. NEVER fabricate balance or transactions.
- Top-up → navigate to `/(main)/(customer)/(tabs)/settings/top-up` with `amount` query param (or reuse existing top-up flow). **`PaymentWebView` is component-only (no route) — do NOT `router.push('/payment-webview')`.**

#### Edge Cases
- API 404/500 → error state with retry
- `balance_bdt < 0` → show negative with `danger` color (shouldn't happen, but guard)
- Transaction `status === 'failed'` → show `danger` color + `Ionicons "warning"`

---

## SCREEN 4: Profile / Settings Hub

### Current State
- `index(3).tsx` — rider profile.
- NativeWind `dark:` classes mixed with StyleSheet.
- Fetches from `/api/user/me`.
- Has sign-out button.
- No `useIsDark()`.

### Rethink

#### Wireframe
```
[StatusBar]
|
|  My Profile                       [☀️/🌙 toggle]
|
|        [Photo/Initial]
|        John Doe
|        ★ 4.8 • Rider since 2024
|
|  ─────────────────────────────
|
|  Account
|  ┌─────────────────────────────┐
|  │ 👤 Edit Profile      >      │
|  │ 📞 Phone Number      >      │
|  │ 🔑 Change Password   >      │
|  └─────────────────────────────┘
|
|  Preferences
|  ┌─────────────────────────────┐
|  │ 🌙 Appearance        >      │
|  │ 🔔 Notifications     >      │
|  │ 🏠 Saved Addresses   >      │
|  │ 🆘 Emergency Contacts >     │
|  └─────────────────────────────┘
|
|  Support
|  ┌─────────────────────────────┐
|  │ ❓ FAQ               >      │
|  │ 🎧 Contact Support   >      │
|  │ 📝 Report Issue      >      │
|  └─────────────────────────────┘
|
|  [Sign Out]  [Delete Account]
```

#### Component Breakdown

**A. Profile Header**
- Avatar: 110x110 circle, 3px `primary` border
- Fallback: initials (first letter of first + last name) in `primaryLight` circle, 36px Bold, `primary` text
- Name: 20px Bold, `textPrimary`, centered
- Rating + join date: 13px Regular, `textSecondary`, centered
  - `Ionicons "star"` (14px, `amber`) + `rating` + " • Rider since " + `year`
- Edit icon: small pencil `Ionicons "pencil"` (16px, `textDisabled`) overlaid on avatar bottom-right, `surfaceBg` circle background

**B. Settings Sections**
- Section title: 13px SemiBold, `textSecondary`, uppercase, letter-spacing 0.8, margin-top 24px, margin-bottom 8px
- Section card: `surfaceBg`, 16px radius, 1px `borderColor`
- Each row inside card:
  - Left icon: 24px, colored by category (Account: `primary`, Preferences: `textSecondary`, Support: `textSecondary`)
  - Label: 15px Medium, `textPrimary`
  - Right: `Ionicons "chevron-forward"` (20px, `textDisabled`)
  - Row height: 56px (touch target)
  - Divider between rows: 1px, `borderColor` (except last row)
  - Tap: `router.push(...)`

**C. Account Section**
| Row | Icon | Label | Route |
|-----|------|-------|-------|
| Edit Profile | `person-outline` | Edit Profile | `/(main)/(customer)/edit-profile` |
| Phone Number | `call-outline` | Phone Number | `/(main)/(customer)/settings/phone` (or show read-only) |
| Change Password | `key-outline` | Change Password | `/(main)/(customer)/change-password` |

**D. Preferences Section**
| Row | Icon | Label | Route |
|-----|------|-------|-------|
| Appearance | `sunny-outline` | Appearance | `/(main)/(customer)/settings/appearance` |
| Notifications | `notifications-outline` | Notifications | `/(main)/(customer)/settings/notifications` |
| Saved Addresses | `home-outline` | Saved Addresses | `/(main)/(customer)/settings/saved-addresses` |
| Emergency Contacts | `warning-outline` | Emergency Contacts | `/(main)/(customer)/settings/emergency-contacts` |

**E. Support Section**
| Row | Icon | Label | Route |
|-----|------|-------|-------|
| FAQ | `help-circle-outline` | FAQ | `/(main)/(customer)/settings/faq` |
| Contact Support | `headset-outline` | Contact Support | `/(main)/(customer)/settings/contact-support` |
| Report Issue | `flag-outline` | Report Issue | `/(main)/(customer)/report-issue` |

**F. Danger Zone**
- "Sign Out": `danger` text, centered, 15px SemiBold, 48px touch target
  - On press: show confirmation modal ("Are you sure?")
  - On confirm: `await supabase.auth.signOut()` + clear existing stores with `reset()` + let auth gate handle redirect
- "Delete Account": `textDisabled` text, 13px Regular, centered
  - On press: `router.push('/(main)/(customer)/settings/delete-account')`

#### Theme Logic
- Replace ALL NativeWind `dark:` classes with `useIsDark()` + StyleSheet tokens
- `SafeAreaView` with `bg` color

#### API Wiring
- `GET /api/user/me` (already wired)
- Response: `{ id, name, email, phone, avatar_url, rating, created_at, role }`
- Sign-out: `supabase.auth.signOut()`

#### Edge Cases
- `avatar_url` null → show initials fallback
- `rating` null → hide rating row
- API failure → show error banner, retry button
- Sign-out failure → show error toast, do not navigate

---

## SCREEN 5: Inbox / Notifications

### Current State
- `index(5).tsx` — inbox/notifications screen.
- NativeWind `dark:` classes.
- Has fallback notifications.
- API: `GET /api/rider/notifications`.

### Rethink

#### Wireframe
```
[StatusBar]
|
|  Notifications                     [☀️/🌙 toggle]
|
|  ┌─────────────────────────────┐
|  │ 🎁 Promo unlocked!          │
|  │ Use WELCOME10 for 10% off   │
|  │ 2h ago              [unread]│
|  └─────────────────────────────┘
|
|  ┌─────────────────────────────┐
|  │ 🚗 Trip completed           │
|  │ Thanks for riding...        │
|  │ 1d ago              [read]  │
|  └─────────────────────────────┘
```

#### Component Breakdown

**A. Header**
- "Notifications" — 28px Bold, `textPrimary`
- Theme toggle top-right

**B. Notification Cards**
- `surfaceBg`, 12px radius, 1px `borderColor`, padding 16px
- Left: icon in 40x40 circle (type-colored bg)
  - Promo: `Ionicons "gift"`, `primaryLight` bg, `primary` icon
  - Trip: `Ionicons "car"`, `infoLight` bg, `primary` icon
  - Payment: `Ionicons "card"`, `successLight` bg, `primary` icon
  - System: `Ionicons "information-circle"`, `surfaceBg` bg, `textSecondary` icon
- Title: 15px SemiBold, `textPrimary`
- Body: 13px Regular, `textSecondary`, max 2 lines
- Time: 11px Regular, `textDisabled`
- Unread indicator: 8px `primary` dot on right edge (absolute positioned, top 16px, right 16px)
- Unread card: left border 3px `primary` (subtle distinction)

**C. Empty State**
- `assets/images/no-result.png` or bell illustration (160x160)
- "No notifications yet" — 15px Medium, `textSecondary`
- Subtext: "We'll notify you about rides, promos, and updates" — 13px Regular, `textDisabled`

**D. Error State**
- If `GET /api/rider/notifications` fails:
  - Show standard error state: `Ionicons "warning-outline"` (48px, `colors.danger`) + "Could not load notifications" (15px, `textSecondary`) + "Pull down to retry" (13px, `textDisabled`)
  - Pull-to-refresh retries the API

**E. Pull-to-Refresh**
- `RefreshControl` with `tintColor={colors.primary}`

#### Theme Logic
- Replace NativeWind `dark:` with `useIsDark()` + StyleSheet tokens
- Unread card: `primary` left border (3px) OR `primaryLight` bg at 5% opacity

#### API Wiring
- `GET /api/rider/notifications`
- Expected response:
```ts
Array<{
  id: string;
  type: 'promo' | 'trip' | 'payment' | 'system';
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  action_url?: string; // deep link
}>
```
- Mark as read: `PATCH /api/rider/notifications/read` (if API exists; otherwise mark client-side only)

#### Edge Cases
- API failure → fallback to sample data with micro-copy
- Empty array → empty state
- Tap notification with `action_url` → `router.push(action_url)`

---

## SCREEN 6: Enable Location (Rider Onboarding)

### Current State
- `app/(auth)/enable-location.tsx`
- Dark-first.
- Linked from `register.tsx` for riders, but auth gate may bypass it.

### Rethink

#### Wireframe
```
[StatusBar]
|
|  [illustration: location pin on map, 200x200]
|
|  Enable Your Location
|
|  We need your location to find nearby
|  drivers and estimate fares accurately.
|
|  [Enable Location Access]
|  [Not Now]
```

#### Component Breakdown

**A. Illustration**
- Large centered illustration (200x200)
- `primaryLight` circular background (240x240) behind pin icon
- Pin icon: `Ionicons "location"` (80px, `primary`)

**B. Title & Body**
- "Enable Your Location" — 28px Bold, centered, `textPrimary`
- Body copy — 15px Medium, `textSecondary`, centered, max width 320px
- Text: "We need your location to find nearby drivers and estimate fares accurately."

**C. Primary Button**
- "Enable Location Access" — `primary`, full width, 56px height, 12px radius
- On press: `Location.requestForegroundPermissionsAsync()`
- If granted → `router.push('/(auth)/notifications-permission')`
- If denied → show settings prompt modal ("Location is required for booking. Please enable it in Settings.") with "Open Settings" and "Cancel" buttons

**D. Secondary Button**
- "Not Now" — `surfaceBg` + `borderColor` border, `textSecondary`, full width, 48px height
- On press: `router.replace('/(main)/(customer)/services-hub')` (do NOT block the user)

#### Theme Logic
- Light-first: `bgLight`, `textPrimaryLight`
- Use local `Ionicons` sun/moon toggle button + `SafeAreaView` (same pattern as all other Plan 03 screens)

#### Wiring
- `expo-location` permission request
- On grant: navigate to `notifications-permission`
- On skip: navigate to `services-hub`

#### Edge Cases
- Permission already granted → auto-navigate to `notifications-permission`
- Permission denied permanently → show settings modal with deep link to app settings
- iOS vs Android: handle `Location.getForegroundPermissionsAsync()` differently if needed

---

## SCREEN 7: Notifications Permission (Rider Onboarding)

### Current State
- `app/(auth)/notifications-permission.tsx`
- Dark-first.
- Orphaned in rider flow (gate bypasses it).

### Rethink

#### Wireframe
```
[StatusBar]
|
|  [illustration: bell, 200x200]
|
|  Stay in the Loop
|
|  Get updates about your ride status,
|  driver arrival, and exclusive promos.
|
|  [Allow Notifications]
|  [Maybe Later]
```

#### Component Breakdown

**A. Illustration**
- Bell icon: `Ionicons "notifications"` (80px, `primary`)
- `primaryLight` circular background (240x240)

**B. Title & Body**
- "Stay in the Loop" — 28px Bold, centered, `textPrimary`
- Body — 15px Medium, `textSecondary`, centered
- Text: "Get updates about your ride status, driver arrival, and exclusive promos."

**C. Primary Button**
- "Allow Notifications" — `primary`, 56px height, full width
- Registers push token via `Notifications.getExpoPushTokenAsync()`
- Sends token to `POST /api/user/device` (already wired globally in `_layout.tsx`)
- On success → `router.replace('/(main)/(customer)/services-hub')`

**D. Secondary Button**
- "Maybe Later" — `surfaceBg` + `borderColor`, `textSecondary`, 48px height
- On press → `router.replace('/(main)/(customer)/services-hub')`

#### Theme Logic
- Light-first: `bgLight`, `textPrimaryLight`
- Use local `Ionicons` sun/moon toggle button + `SafeAreaView`

#### Wiring
- `Notifications.requestPermissionsAsync()`
- On grant: register push token → `POST /api/user/device`
- On skip: navigate to `services-hub`

#### Edge Cases
- Permission already granted → auto-navigate to `services-hub`
- Permission denied → show "You can enable notifications later in Settings" micro-copy (11px, `textDisabled`)
- iOS: handle `Notifications.getPermissionsAsync()` for provisional notifications

---

## SCREEN 8: Referral Tab

### Current State
- `app/(main)/(customer)/(tabs)/referral/index.tsx` exists (referenced in Rides Tab filter chips).
- Needs audit for theming.

### Rethink (Minimal — defer full feature to Plan 05)

#### Wireframe
```
[StatusBar]
|
|  Referrals                        [☀️/🌙 toggle]
|
|  ┌─────────────────────────────┐
|  │ Share your code              │
|  │ ABC123                       │
|  │ [Share] [Copy]               │
|  └─────────────────────────────┘
|
|  You've earned: ৳500
|
|  [Referral history list]
```

#### Component Breakdown
- **Minimal theming pass** — ensure `useIsDark()` + color tokens
- Do NOT build full referral logic (deferred to Plan 05)
- Show referral code, share button, basic earnings
- Use existing API if wired; otherwise show placeholder

---

## SUB-SCREENS (IN SCOPE)

### 4a: Appearance Settings
- Route: `settings/appearance`
- Current: `ThemeToggle.tsx` component exists
- Action: Ensure it uses `useIsDark()` + 3-option picker (`light`/`dark`/`system`)
- Do NOT rebuild — just verify theming

### 4b: Notification Settings
- Route: `settings/notifications`
- Action: Restyle with `useIsDark()`, ensure toggle switches use `primary` color

### 4c: FAQ
- Route: `settings/faq`
- Action: Restyle with `useIsDark()`. Accordion-style Q&A. `surfaceBg` cards, `borderColor` borders.

### 4d: Contact Support
- Route: `settings/contact-support`
- Action: Restyle with `useIsDark()`. Show support channels (chat, email, phone). `primary` CTA buttons.

### 4e: Language
- Route: `settings/language`
- Action: Restyle with `useIsDark()`. Radio list of languages. Selected = `primary` radio fill.

### 4f: Delete Account
- Route: `settings/delete-account`
- Action: Restyle with `useIsDark()`. Danger zone styling. Confirmation modal with password re-entry.

### 5a: Report Issue
- Route: `report-issue/index.tsx`
- Action: Restyle with `useIsDark()`. Form: issue type dropdown, description textarea, photo upload (optional). `primary` submit button.

### 5b: Fare Dispute
- Route: `fare-dispute/index.tsx`
- Action: Create if missing. Form: ride reference (pre-filled from param), dispute reason dropdown, description, expected fare. `primary` submit.

### 12a: Add Emergency Contact
- Route: `settings/emergency-contacts/add.tsx`
- Action: Create if missing. Form: name, phone, relationship. `primary` save.

---

## ORCHESTRATOR TASKS (must-do)

### TASK C — `useIsDark()` sweep for Plan 03 files
Replace ALL hand-written `theme === "dark"` expressions in Plan 03 files:

| File | Issue | Fix |
|------|-------|-----|
| `app/(main)/(customer)/(tabs)/rides/index.tsx` | Hardcoded `colors.bgDark`, `colors.textPrimaryDark`, `colors.darkSecondary`, `colors.adminAccent` | Full rewrite with `useIsDark()` |
| `app/(main)/(customer)/show-ride/[rideId].tsx` | EXISTS — is the real ride-detail | Audit theming; do NOT create `ride-detail/[ride_id]` |
| `app/(main)/(customer)/(tabs)/wallet/index.tsx` | Missing — no rider wallet screen exists | CREATE with `useIsDark()` (API `/api/rider/wallet` exists) |
| `app/(main)/(customer)/(tabs)/profile/index.tsx` | NativeWind `dark:` classes | Unify to `useIsDark()` |
| `app/(main)/(customer)/(tabs)/inbox/index.tsx` | NativeWind `dark:` classes | Unify to `useIsDark()` |
| `app/(main)/(customer)/(tabs)/referral/index.tsx` | Needs audit | Restyle with `useIsDark()` |
| `app/(auth)/enable-location.tsx` | Dark-first | Light-first rewrite + `useIsDark()` |
| `app/(auth)/notifications-permission.tsx` | Dark-first | Light-first rewrite + `useIsDark()` |
| `app/(main)/(customer)/profile/edit.tsx` | Needs audit | Restyle with `useIsDark()` |
| `app/(main)/(customer)/change-password/index.tsx` | Missing under customer — only `(rider)/settings/change-password` exists | CREATE with `useIsDark()` |
| `app/(main)/(customer)/(tabs)/settings/saved-addresses/index.tsx` | Needs audit | Restyle with `useIsDark()` |
| `app/(main)/(customer)/(tabs)/settings/emergency-contacts/index.tsx` | Needs audit | Restyle with `useIsDark()` |
| `app/(main)/(customer)/(tabs)/settings/app-appearance/index.tsx` | Needs audit | Restyle with `useIsDark()` |
| `app/(main)/(customer)/(tabs)/settings/notifications/index.tsx` | Needs audit | Restyle with `useIsDark()` |
| `app/(main)/(customer)/(tabs)/settings/faq/index.tsx` | Needs audit | Restyle with `useIsDark()` |
| `app/(main)/(customer)/(tabs)/settings/contact-support/index.tsx` | Needs audit | Restyle with `useIsDark()` |
| `app/(main)/(customer)/(tabs)/settings/app-language/index.tsx` | Needs audit | Restyle with `useIsDark()` |
| `app/(main)/(customer)/(tabs)/settings/delete-account/index.tsx` | Needs audit | Restyle with `useIsDark()` |
| `app/(main)/(customer)/report-issue/index.tsx` | Needs audit | Restyle with `useIsDark()` |
| `app/(main)/(customer)/fare-dispute/index.tsx` | Missing | CREATE with `useIsDark()` |
| `app/(main)/(customer)/(tabs)/settings/emergency-contacts/add.tsx` | Missing | CREATE with `useIsDark()` |

**After sweep:** `grep -rn 'theme === "dark"' app/ components/` → **0 matches** (catches both `|| system` + `=== "dark"` variants).

### TASK D — Verify `RideCard.tsx` theming
- Uses `useIsDark()` (not NativeWind `dark:`)
- Uses Jakarta fonts (not Urbanist)
- Handles all ride statuses (completed, canceled, scheduled, in_progress)
- Shows correct fare format (৳X, integer taka from `fare_bdt/100`)
- Tap handler routes to `show-ride/[rideId]` (NOT `ride-detail/[ride_id]`)

### TASK E — Verify rider wallet API
- Confirm `GET /api/rider/wallet` exists
- If missing, coding agent shows error state (never fabricate)

### TASK F — Verify `GET /api/ride/${rideId}` contract
- Same as Plan 02's `rate-driver` contract
- Returns `{ ride, driver }` with `fare_breakdown` object

### TASK G — Delete orphaned `ride-completed` screen
- `app/(main)/(customer)/ride-completed/index.tsx` is unreachable after Plan 02
- **Action:** Delete the file and remove any route references

### TASK H — Sign-out store cleanup
- After `supabase.auth.signOut()`, clear ONLY Zustand stores that exist and have `reset()`:
  - `useRiderStore.getState().reset()` (verify it exists; if no `reset()`, use `set({...initialState})`)
  - `useDriverStore.getState().reset()` (confirmed to exist)
- **Do NOT call `.reset()` on stores that do not exist as files:** `useRidesStore`, `useWalletStore`, `useNotificationsStore`, `useCustomer`, `useWSStore`.
- **Do NOT call `router.replace` manually** — let the auth gate handle redirect.

---

## Deferred Features (do NOT build in Plan 03)

| Feature | Status | Where |
|---------|--------|-------|
| Scheduled rides full UI | Deferred | `schedule-ride/index.tsx` (exists) |
| Cancel ride + reason | Deferred | `cancel-reason/index.tsx` (exists) |
| Apply promos | Deferred | `apply-promos/index.tsx` (exists) |
| Emergency SOS standalone | Deferred | `emergency-sos/index.tsx` (exists) |
| Add tip standalone | Deferred | `add-tip/index.tsx` (exists) |
| Lost items | Deferred | `lost-items/index.tsx` (may exist) |
| Rider passes browse/buy | Deferred | passes marketplace |
| Chat standalone | Deferred | `chat/index.tsx` (exists) |
| Share trip standalone | Deferred | inline only in ride-tracking |
| Deep linking + push handlers | Deferred | global `_layout.tsx` |
| Driver app ALL screens | Deferred | ALL `(rider)/` → Plan 04 |
| Driver onboarding | Deferred | `onboarding.tsx` → Plan 04 |
| Full referral system | Deferred | `referral/index.tsx` → Plan 05 |

---

## Navigation Flow — Plan 03

```
Services Hub / Home
  ↓ Hamburger menu
Profile (Screen 4)
  ├── Edit Profile → edit-profile
  ├── Phone Number → settings/phone (read-only or editable)
  ├── Change Password → change-password
  ├── Appearance → settings/appearance
  ├── Notifications → settings/notifications
  ├── Saved Addresses → settings/saved-addresses
  ├── Emergency Contacts → settings/emergency-contacts
  │   └── Add Contact → settings/emergency-contacts/add
  ├── FAQ → settings/faq
  ├── Contact Support → settings/contact-support
  └── Report Issue → report-issue

Home / Hamburger
  ↓
Rides Tab (Screen 1)
  ├── Tap ride → show-ride/[rideId] (Screen 2)
  │   ├── Rebook Ride → Home (pre-filled)
  │   ├── Report Issue → report-issue?rideId=
  │   └── Fare Dispute → fare-dispute?rideId=
  ├── Tap Inbox chip → Inbox (Screen 5)
  └── Tap Referral chip → Referral (Screen 8)

Home / Hamburger
  ↓
Wallet (Screen 3)
  ├── Top Up → `(tabs)/settings/top-up` (or reuse existing flow)
  └── Transactions (inline list)

Auth (first launch)
  ↓
Enable Location (Screen 6)
  ↓
Notifications Permission (Screen 7)
  ↓
Services Hub
```

---

## Implementation Robustness (edge cases — non-negotiable)

- **Rides Tab filter chips:** "All", "Completed", "Scheduled", "Canceled" filter client-side. "Inbox" and "Referral" are navigation chips with `Ionicons "arrow-forward"` — do NOT try to filter the rides array by these.
- **Ride Detail null driver:** If `driver` is null in API response, hide the driver card entirely, show "Driver info unavailable" placeholder. Do not crash.
- **Wallet error:** If `/api/rider/wallet` fails or returns 404, show error banner with retry. NEVER show fake balance or transactions.
- **Profile sign-out:** After `supabase.auth.signOut()`, call `authCleanup()` from `lib/authCleanup.ts` (CREATE it — single source of truth): `useRiderStore.getState().reset()` (exists) → `useDriverStore.getState().reset()` (import from `@/store/useDriverStore`, NEVER `@/store`) → `useChatStore.getState().clearChat()` (no `reset()`). Guard each: `if (S.getState().reset)`. Never touch barrel stores. Use `.getState().reset()` pattern if available, otherwise set to initial state. Let auth gate handle redirect.
- **Enable Location skip:** "Not Now" must NOT block the user. Route to `services-hub`. Permission can be requested again later via system settings.
- **Notifications skip:** "Maybe Later" routes to `services-hub". Do not block.
- **Inbox fallback:** If `GET /api/rider/notifications` fails, show the standard error state (`Ionicons "warning-outline"` + "Could not load notifications" + "Pull down to retry"). No fallback data.
- **StatusBar on all screens:** Each Plan 03 screen owns its StatusBar with correct `barStyle` and `backgroundColor`.
- **Ride Detail map:** If `Map` component fails to load in read-only mode, show a placeholder with route text only. Never crash.
- **Fare display:** All `*_bdt` values are integer paisa. Divide by 100 for display. Use `Math.round(value / 100)` for whole taka, `(value / 100).toFixed(2)` for decimal.
- **Sub-screen theming:** All sub-screens (appearance, notifications, FAQ, etc.) get the same `useIsDark()` treatment. Do NOT skip them because they are "small".
- **Delete Account:** Require password re-entry before submitting. Show confirmation modal. Use `danger` color for the final submit button.
- **Emergency Contacts:** If list is empty, show "No emergency contacts added" with an "Add Contact" CTA.
- **Report Issue:** If photo upload is not wired, show the form without it (do not block). File upload can be deferred.
- **Fare Dispute:** If file doesn't exist, create it. If API doesn't exist, show "Coming soon" placeholder (do not crash).

---

## Verification Checklist

- [ ] All 12 main screens + 12 sub-screens follow device theme (`'system'`) via `useIsDark()`
- [ ] All screens render correctly in both light and dark
- [ ] `grep -rn 'theme === "dark"' app/ components/` → 0 matches (includes Plan 03 files)
- [ ] `useIsDark()` exists in `lib/useAppearance.ts` and resolves `'system'` via `useColorScheme()`
- [ ] `useAppearance` default is `'system'` (NOT reverted to `'light'`)
- [ ] `Rides Tab` renders correctly; filter chips scroll; empty state shows; navigation chips work
- [ ] `Ride Detail` fetches ride+driver; shows fare breakdown; handles null driver; map placeholder works
- [ ] `Wallet` shows real balance (or error state); top-up routes to `(tabs)/settings/top-up`; transactions list scrolls
- [ ] `Profile` shows user info; settings rows route correctly; sign-out clears existing stores (only `useRiderStore`, `useDriverStore`, `useChatStore` have `reset()`)
- [ ] `Enable Location` light-first; "Not Now" does not block; "Enable" requests permission; settings modal on deny
- [ ] `Notifications Permission` light-first; "Maybe Later" does not block; registers push token
- [ ] `Inbox` shows notifications with type icons; unread indicator visible; fallback on API fail
- [ ] `Referral` minimally themed; basic share functionality works
- [ ] All sub-screens (appearance, notifications, FAQ, contact-support, language, delete-account, report-issue, fare-dispute, emergency-contacts/add) themed
- [ ] `ride-completed` screen deleted (orphaned by Plan 02)
- [ ] `RiderRidesItem.tsx` NOT used for rider history (it's driver-only)
- [ ] `index(10).tsx` (driver wallet) NOT modified (deferred to Plan 04)
- [ ] All touch targets >= 48x48dp
- [ ] All Jakarta fonts (no Urbanist remnants in rider screens)
- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npm run lint` — zero errors
- [ ] No `console.log` — use `logger`
- [ ] StatusBar color matches screen background on all screens
- [ ] Every screen except `SplashAnimation` has a theme toggle

---

## What Comes After Plan 03?

**Plan 04 — Driver Core Loop & Account**
- Driver Home (`(rider)/index.tsx`)
- Driver Earnings, Activity, Wallet, Profile, Settings tabs
- Driver onboarding (documents, verification, vehicle selection)
- Driver ride offer accept/reject flow
- Driver navigation & trip completion

**Plan 05 — Supporting Features & Polish**
- Scheduled rides full UI
- Cancel ride + reason
- Apply promos
- Emergency SOS standalone
- Lost items
- Fare disputes (full flow)
- Rider passes browse/buy
- Chat standalone
- Share trip
- Deep linking + push handlers
- Full referral system
- Analytics & admin dashboard
'''

Here are the missing sections, drafted to match the existing plan's depth and style:

---

# MISSING SECTIONS — PLAN 03 SUPPLEMENT

---

## SETTINGS HUB ARCHITECTURE (LOCKED)

**`app/(main)/(customer)/(tabs)/settings/index.tsx` EXISTS** with 24 sub-screens. It is the canonical Settings Hub.

**`app/(main)/(customer)/(tabs)/profile/index.tsx`** is the **entry point** — it shows user info + quick-access rows that route TO `(tabs)/settings/*` sub-screens.

These two screens **coexist**. Profile is NOT the Settings Hub. Settings is NOT being deleted.

**Rationale:** A separate Settings tab already exists and is fully wired with 24 sub-screens. Deleting it would orphan `add-payment`, `data-analytics`, `delete-data`, `request-data`, `linked-accounts`, `logout-confirmation`, `lost-items`, `loyalty`, `personal-info`, `privacy-policy`, `ride-pass`, `terms-of-service`, `help-support`, `top-up`, `top-up-method`, `top-up-success` and more. **DO NOT DELETE `(tabs)/settings/index.tsx`.**

**Consequence:** If any code references `router.push('/settings')`, verify it resolves to `(tabs)/settings/index.tsx`. Do NOT redirect to `/profile`.

---

## REUSABLE COMPONENTS (Build Once, Use Everywhere)

The coding agent MUST create these as standalone components in `components/plan03/` (or `components/` if preferred). Do NOT inline them.

---

### 1. `SettingsRow`

**File:** `components/plan03/SettingsRow.tsx` (or `components/SettingsRow.tsx`)

**Props:**
```ts
interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap; // e.g. "person-outline"
  iconColor?: string;                   // default: colors.primary
  label: string;
  onPress: () => void;
  showChevron?: boolean;                // default: true
  rightElement?: React.ReactNode;       // e.g. toggle switch, badge count
  isLast?: boolean;                     // default: false — hides bottom divider
}
```

**Layout:**
```
┌─────────────────────────────────────────┐
│ [icon 24px]  Label 15px Medium    [>]   │
│ ─────────────────────────────────────── │  ← 1px borderColor divider (hidden if isLast)
└─────────────────────────────────────────┘
```
- Row height: **56px** (touch target)
- Left icon: 24px, colored `iconColor` (default `colors.primary`)
- Label: 15px Medium, `textPrimary`
- Chevron: `Ionicons "chevron-forward"` 20px, `textDisabled`
- Right element: rendered instead of chevron if provided
- Divider: 1px, `borderColor`, full width, margin-left 56px (indented under label)

**Theme:** Uses `useIsDark()` internally. No NativeWind.

**Usage:** Profile (10 rows), all settings sub-screens that show row lists.

---

### 2. `TransactionRow`

**File:** `components/plan03/TransactionRow.tsx`

**Props:**
```ts
interface TransactionRowProps {
  type: 'top_up' | 'ride_payment' | 'pass_purchase' | 'refund';
  title: string;
  amountBdt: number;      // integer paisa
  status: 'success' | 'failed' | 'pending';
  date: string;           // ISO 8601
}
```

**Layout:**
```
┌─────────────────────────────────────────┐
│ [40px circle]  Title 15px SemiBold   +৳X│
│                Date 11px Regular     15px│
└─────────────────────────────────────────┘
```

- Left circle: 40x40, radius 20px
  - `top_up`: `Ionicons "add-circle"`, `primaryLight` bg, `primary` icon
  - `ride_payment`: `Ionicons "car"`, `infoLight` bg, `primary` icon
  - `pass_purchase`: `Ionicons "ticket"`, `amberLight` bg, `amber` icon
  - `refund`: `Ionicons "arrow-undo"`, `successLight` bg, `primary` icon
  - `failed`: `Ionicons "warning"`, `dangerLight` bg, `danger` icon (overrides type icon)
- Title: 15px SemiBold, `textPrimary`
- Amount: 15px Bold, right-aligned
  - Credit (positive): `primary` color, prefix `+৳`
  - Debit (negative): `textPrimary` color, prefix `-৳`
  - Failed: `danger` color, prefix `! ৳`
- Date: 11px Regular, `textDisabled`, below title

**Theme:** `useIsDark()` internally.

**Usage:** Wallet transactions list.

---

### 3. `NotificationCard`

**File:** `components/plan03/NotificationCard.tsx`

**Props:**
```ts
interface NotificationCardProps {
  type: 'promo' | 'trip' | 'payment' | 'system';
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;      // ISO 8601
  onPress?: () => void;
}
```

**Layout:**
```
┌─────────────────────────────────────────┐
│ [40px circle]  Title 15px SemiBold   [●]│  ← unread dot (8px, primary)
│                Body 13px Regular        │
│                Time 11px Regular        │
└─────────────────────────────────────────┘
```

- Card: `surfaceBg`, 12px radius, 1px `borderColor`, padding 16px
- Unread state: 3px `primary` left border (subtle) + 8px `primary` dot top-right
- Read state: no left border, no dot
- Left circle: 40x40
  - `promo`: `Ionicons "gift"`, `primaryLight` bg, `primary` icon
  - `trip`: `Ionicons "car"`, `infoLight` bg, `primary` icon
  - `payment`: `Ionicons "card"`, `successLight` bg, `primary` icon
  - `system`: `Ionicons "information-circle"`, `surfaceBg` bg, `textSecondary` icon
- Title: 15px SemiBold, `textPrimary`
- Body: 13px Regular, `textSecondary`, max 2 lines (`numberOfLines={2}`)
- Time: 11px Regular, `textDisabled`, formatted as relative ("2h ago", "1d ago")

**Theme:** `useIsDark()` internally.

**Usage:** Inbox list.

---

### 4. `EmptyState`

**File:** `components/plan03/EmptyState.tsx`

**Props:**
```ts
interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;  // e.g. "document-text-outline"
  iconSize?: number;                     // default: 64
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}
```

**Layout:**
```
┌─────────────────────────────────────────┐
│                                         │
│           [Ionicons icon 64px]          │
│           textDisabled color            │
│                                         │
│         "No recent rides found"         │
│         15px Medium, textSecondary      │
│                                         │
│    "Your completed rides will appear"   │
│    13px Regular, textDisabled           │
│                                         │
│         [Optional Action Button]        │
│                                         │
└─────────────────────────────────────────┘
```

- Centered vertically and horizontally in parent
- Icon: Ionicons, 64px, `textDisabled` color
- Title: 15px Medium, `textSecondary`, centered
- Subtitle: 13px Regular, `textDisabled`, centered, max width 280px
- Action button (if provided): `primary` bg, 48px height, 12px radius, margin-top 24px

**Theme:** `useIsDark()` internally.

**Usage:** Rides Tab (empty), Wallet (no transactions), Inbox (empty), Emergency Contacts (empty), Saved Addresses (empty).

---

### 5. `StatusBadge`

**File:** `components/plan03/StatusBadge.tsx`

**Props:**
```ts
interface StatusBadgeProps {
  status: 'completed' | 'canceled' | 'scheduled' | 'in_progress';
  size?: 'sm' | 'md';  // default: 'md'
}
```

**Colors:**
| Status | Background | Text |
|--------|-----------|------|
| `completed` | `primaryLight` | `primary` |
| `canceled` | `dangerLight` | `danger` |
| `scheduled` | `primaryLight` (with blue tint if available, else same) | `primary` |
| `in_progress` | `amberLight` | `amber` |

**Layout:** Pill shape, padding 6px horizontal + 4px vertical, 12px radius.
- `sm`: 11px Regular text
- `md`: 13px Medium text

**Theme:** `useIsDark()` internally.

**Usage:** Rides Tab (meta row), Ride Detail (status header).

---

## SUB-SCREEN RETHINKS (Full Specs)

---

### SUB-SCREEN 4a: Appearance Settings

**Route:** `app/(main)/(customer)/settings/appearance/index.tsx`  
**Current State:** `ThemeToggle.tsx` component exists. This screen wraps it.  
**Work Type:** Restyle + unify

#### Wireframe
```
[StatusBar]
|
|  ← Appearance                     [☀️/🌙 toggle]
|
|  Appearance
|
|  ┌─────────────────────────────┐
|  │ ○ Light                     │
|  │ ● Dark                      │
|  │ ○ System                    │
|  └─────────────────────────────┘
|
|  [Preview card showing current theme]
```

#### Component Breakdown
**A. Header:** Back arrow + "Appearance" (28px Bold) + theme toggle top-right.

**B. Theme Options Card:** `surfaceBg`, 16px radius, 1px `borderColor`.
- 3 rows, each 56px height:
  - `Ionicons "sunny-outline"` + "Light"
  - `Ionicons "moon-outline"` + "Dark"
  - `Ionicons "phone-portrait-outline"` + "System"
- Selected row: `primary` radio dot (12px circle) on right. Unselected: `borderColor` empty circle.
- Tap row → calls `setTheme(value)` from `useAppearance()`.

**C. Preview Card (optional):** Small mock card showing current theme colors. Not required for MVP.

#### API Wiring
- None. Purely local state via `useAppearance()`.

#### Edge Cases
- If `theme` is `"system"`, the "System" row is selected.
- Toggle in header cycles `light ↔ dark` (same as global behavior).

---

### SUB-SCREEN 4b: Notification Settings

**Route:** `app/(main)/(customer)/settings/notifications/index.tsx`  
**Work Type:** Restyle + unify

#### Wireframe
```
[StatusBar]
|
|  ← Notifications                  [☀️/🌙 toggle]
|
|  Push Notifications
|  ┌─────────────────────────────┐
|  │ 🔔 Ride Updates        [ON] │
|  │ 🎁 Promotions          [ON] │
|  │ 💳 Payment Alerts      [ON] │
|  │ 📢 News & Updates      [OFF]│
|  └─────────────────────────────┘
|
|  [Save Preferences]
```

#### Component Breakdown
**A. Header:** Back arrow + "Notifications" + theme toggle.

**B. Toggle Rows:** `SettingsRow` with `rightElement` = `<Switch />`.
- Switch `trackColor`: `{ false: colors.borderDark, true: colors.primary }`
- Switch `thumbColor`: `colors.white`
- Rows: "Ride Updates", "Promotions", "Payment Alerts", "News & Updates"

**C. Save Button:** `primary` bg, full width, 56px.  
- On press: `POST /api/user/notification-prefs` with toggles object.
- Show success toast: "Preferences saved" (13px, `primary`, centered).

#### API Wiring
- `GET /api/user/notification-prefs` → `{ ride_updates, promotions, payment_alerts, news_updates }`
- `POST /api/user/notification-prefs` → same shape

#### Edge Cases
- API failure → show error banner, keep toggles in local state (optimistic UI).

---

### SUB-SCREEN 4c: FAQ

**Route:** `app/(main)/(customer)/settings/faq/index.tsx`  
**Work Type:** Restyle + unify

#### Wireframe
```
[StatusBar]
|
|  ← FAQ                            [☀️/🌙 toggle]
|
|  Frequently Asked Questions
|
|  ┌─────────────────────────────┐
|  │ How do I book a ride?    [+]│
|  └─────────────────────────────┘
|  ┌─────────────────────────────┐
|  │ How is fare calculated?  [+]│
|  └─────────────────────────────┘
|  ┌─────────────────────────────┐
|  │ [expanded]                  │
|  │ How do I cancel a ride?  [-]│
|  │                             │
|  │ You can cancel from the   │
|  │ tracking screen before    │
|  │ the driver arrives...     │
|  └─────────────────────────────┘
```

#### Component Breakdown
**A. Header:** Back arrow + "FAQ" + theme toggle.

**B. Accordion Items:** `surfaceBg`, 16px radius, 1px `borderColor`, margin-bottom 8px.
- Collapsed: Question (15px SemiBold, `textPrimary`) + `Ionicons "add"` (20px, `textDisabled`) right.
- Expanded: Question + `Ionicons "remove"` + answer body (13px Regular, `textSecondary`, padding-top 12px).
- Tap toggles expand/collapse. Only one open at a time (optional — single vs multi expand).

**C. FAQ Data:** Fetch from `GET /api/faqs` (exists). If API fails, fall back to local `FAQ_FALLBACKS` array (6–8 Q&A pairs). **Do NOT hardcode as the primary data source.**

```ts
const FAQS = [
  { q: "How do I book a ride?", a: "Open the app, select your service..." },
  { q: "How is fare calculated?", a: "Fare is based on base charge..." },
  { q: "How do I cancel a ride?", a: "You can cancel from the tracking..." },
  { q: "What payment methods are accepted?", a: "We accept cash and mobile wallet..." },
  { q: "How do I report an issue?", a: "Go to Profile → Report Issue..." },
  { q: "What is a Rider Pass?", a: "Rider Passes are subscription..." },
];
```

#### Edge Cases
- None. Static content.

---

### SUB-SCREEN 4d: Contact Support

**Route:** `app/(main)/(customer)/settings/contact-support/index.tsx`  
**Work Type:** Restyle + unify

#### Wireframe
```
[StatusBar]
|
|  ← Contact Support                [☀️/🌙 toggle]
|
|  How can we help?
|
|  ┌─────────────────────────────┐
|  │ 💬 Live Chat           >    │
|  └─────────────────────────────┘
|  ┌─────────────────────────────┐
|  │ 📧 Email Support       >    │
|  │    support@rideapp.com      │
|  └─────────────────────────────┘
|  ┌─────────────────────────────┐
|  │ 📞 Call Us             >    │
|  │    +880 1XXX-XXXXXX         │
|  └─────────────────────────────┘
|
|  [Call Emergency: 999]
```

#### Component Breakdown
**A. Header:** Back arrow + "Contact Support" + theme toggle.

**B. Support Channels:** `SettingsRow` variants.
- **Live Chat:** `Ionicons "chatbubble-ellipses-outline"` → `router.push('/(main)/(customer)/chat')` (if chat exists; else show "Coming soon" toast)
- **Email:** `Ionicons "mail-outline"` → `Linking.openURL('mailto:support@rideapp.com')`
- **Call:** `Ionicons "call-outline"` → `Linking.openURL('tel:+8801XXXXXXXX')`

**C. Emergency Button:** `danger` bg, full width, 56px.  
- `Ionicons "warning"` + "Call Emergency: 999"
- On press: `Linking.openURL('tel:999')` with confirmation modal ("Call emergency services?")

#### Edge Cases
- `Linking.canOpenURL` check before opening. If false, show "Unable to open" toast.

---

### SUB-SCREEN 4e: Language

**Route:** `app/(main)/(customer)/settings/language/index.tsx`  
**Work Type:** Restyle + unify

#### Wireframe
```
[StatusBar]
|
|  ← Language                       [☀️/🌙 toggle]
|
|  Select Language
|
|  ┌─────────────────────────────┐
|  │ ● English                   │
|  │ ○ বাংলা (Bengali)           │
|  └─────────────────────────────┘
```

#### Component Breakdown
**A. Header:** Back arrow + "Language" + theme toggle.

**B. Language Options:** `surfaceBg`, 16px radius, 1px `borderColor`.
- Each row: flag emoji (🇬🇧 / 🇧🇩) + language name (15px Medium) + radio dot right.
- Selected: `primary` filled circle. Unselected: `borderColor` empty circle.
- Tap → save via `useAppearance().setLanguage()` + i18n update. **Do NOT save to AsyncStorage with "restart to apply" fiction.**

#### Edge Cases
- Only English is fully supported for MVP. Bengali is UI-ready but translation strings are deferred.

---

### SUB-SCREEN 4f: Delete Account

**Route:** `app/(main)/(customer)/settings/delete-account/index.tsx`  
**Work Type:** Restyle + unify

#### Wireframe
```
[StatusBar]
|
|  ← Delete Account                 [☀️/🌙 toggle]
|
|  ⚠️ This action cannot be undone
|
|  Deleting your account will remove
|  all your data, ride history, and
|  wallet balance permanently.
|
|  [Enter your password to confirm]
|
|  ┌─────────────────────────────┐
|  │ 🔑 Password                 │
|  └─────────────────────────────┘
|
|  [Delete My Account]  (disabled until password entered)
```

#### Component Breakdown
**A. Header:** Back arrow + "Delete Account" + theme toggle.

**B. Warning Banner:** `dangerLight` bg, `danger` text, 12px radius, padding 16px.
- `Ionicons "warning"` + "This action cannot be undone"

**C. Explanation Text:** 15px Regular, `textSecondary`, centered.

**D. Password Input:** `InputField` component, type="password", show/hide toggle.
- Placeholder: "Enter your password to confirm"
- Validation: min 6 characters

**E. Delete Button:** `danger` bg, white text, full width, 56px.
- Disabled state: `danger` at 50% opacity until password.length >= 6
- On press: confirmation modal ("Are you absolutely sure?") → call deletion flow via `user/delete-data` + `user/data-controls` endpoints → sign out → `router.replace('/(auth)/welcome')`

#### API Wiring
- Deletion flow uses `user/delete-data` + `user/data-controls` endpoints (confirmed existing). **`DELETE /api/user/me` is UNKNOWN** — do not reference it unless confirmed.
- On success: `supabase.auth.signOut()` + clear existing stores + navigate to welcome

#### Edge Cases
- Wrong password → API 401 → show "Incorrect password" error below input
- API failure → show error banner with retry
- User cancels modal → stay on screen

---

### SUB-SCREEN 5a: Report Issue

**Route:** `app/(main)/(customer)/report-issue/index.tsx`  
**Work Type:** Restyle + unify

#### Wireframe
```
[StatusBar]
|
|  ← Report Issue                   [☀️/🌙 toggle]
|
|  What went wrong?
|
|  [Issue Type dropdown]
|  ┌─────────────────────────────┐
|  │ Select issue type        [▼]│
|  └─────────────────────────────┘
|
|  [Description textarea]
|  ┌─────────────────────────────┐
|  │ Describe your issue...      │
|  │                             │
|  │                             │
|  └─────────────────────────────┘
|
|  [Optional: Attach Photo]
|  ┌─────────────────────────────┐
|  │ 📷 Add Photo                │
|  └─────────────────────────────┘
|
|  [Submit Report]
```

#### Component Breakdown
**A. Header:** Back arrow + "Report Issue" + theme toggle.

**B. Issue Type Dropdown:** Custom dropdown or `Picker`.
- Options: "Driver Behavior", "Vehicle Issue", "Fare Dispute", "App Bug", "Safety Concern", "Other"
- `surfaceBg`, 12px radius, 1px `borderColor`, height 48px
- Selected: 15px Medium, `textPrimary`
- Placeholder: 15px Medium, `textDisabled`

**C. Description Textarea:** `TextInput` multiline, 4 lines min.
- `surfaceBg`, 12px radius, 1px `borderColor`, padding 12px
- Placeholder: "Describe your issue in detail..."
- 15px Medium, `textPrimary`
- Character counter: 0/500 (11px, `textDisabled`, bottom-right)

**D. Photo Attachment (Optional):**
- `Ionicons "camera"` + "Add Photo" button
- If photo upload not wired: hide this section entirely (do not show disabled button)
- If wired: `expo-image-picker` → show thumbnail with `Ionicons "close-circle"` to remove

**E. Submit Button:** `primary` bg, full width, 56px.
- Disabled until issue type selected AND description.length >= 20
- On press: `POST /api/support/ticket` → show success modal → `router.back()`

#### API Wiring
- `POST /api/support/ticket` → `{ issue_type, description, photo_url?, ride_id? }`
- `ride_id` from query param if present (`?rideId=xxx`)

#### Edge Cases
- No photo upload support → hide section, submit without `photo_url`
- API failure → error banner with retry
- Success → modal with `Ionicons "checkmark-circle"` + "Report submitted" + "OK" button

---

### SUB-SCREEN 5b: Fare Dispute

**Route:** `app/(main)/(customer)/fare-dispute/index.tsx`  
**Current State:** Likely does NOT exist. **Create.**  
**Work Type:** Create

#### Wireframe
```
[StatusBar]
|
|  ← Fare Dispute                   [☀️/🌙 toggle]
|
|  Ride: #RIDE-1234
|  Date: Mar 14, 2026
|
|  Original Fare: ৳186
|
|  What do you think the fare should be?
|  ┌─────────────────────────────┐
|  │ ৳                          │
|  └─────────────────────────────┘
|
|  [Reason dropdown]
|  ┌─────────────────────────────┐
|  │ Select reason            [▼]│
|  └─────────────────────────────┘
|
|  [Additional details textarea]
|  ┌─────────────────────────────┐
|  │ Explain why...              │
|  └─────────────────────────────┘
|
|  [Submit Dispute]
```

#### Component Breakdown
**A. Header:** Back arrow + "Fare Dispute" + theme toggle.

**B. Ride Summary Card:** `surfaceBg`, 16px radius, 1px `borderColor`, padding 16px.
- Ride ID: 13px SemiBold, `textSecondary`
- Date: 13px Regular, `textSecondary`
- Original Fare: 18px Bold, `textPrimary`

**C. Expected Fare Input:** `InputField`, numeric keyboard.
- Prefix: "৳" (15px Medium, `textSecondary`, inside input left)
- Placeholder: "Enter expected fare"
- Validation: must be number > 0

**D. Reason Dropdown:** Same style as Report Issue dropdown.
- Options: "Route was shorter", "Driver took wrong route", "Surge was unfair", "App calculation error", "Other"

**E. Details Textarea:** Same style as Report Issue. Min 20 chars.

**F. Submit Button:** `primary` bg, full width, 56px.
- Disabled until expected fare > 0 AND reason selected AND details.length >= 20
- On press: `POST /api/rider/fare-disputes` → success modal → `router.back()`

#### API Wiring
- `POST /api/rider/fare-disputes` → `{ ride_id, expected_fare_bdt, reason, details }`
- `ride_id` from query param (`?rideId=xxx`)
- **If API does not exist:** Show "Coming soon" placeholder screen instead of form. Do NOT crash.

#### Edge Cases
- Missing `rideId` param → show error "No ride specified" + back button
- API 404 (endpoint not ready) → "Coming soon" placeholder with `Ionicons "time"` icon
- Success → modal + back

---

### SUB-SCREEN 12a: Add Emergency Contact

**Route:** `app/(main)/(customer)/settings/emergency-contacts/add.tsx`  
**Current State:** Likely does NOT exist. **Create.**  
**Work Type:** Create

#### Wireframe
```
[StatusBar]
|
|  ← Add Emergency Contact          [☀️/🌙 toggle]
|
|  Name
|  ┌─────────────────────────────┐
|  │ Full name                   │
|  └─────────────────────────────┘
|
|  Phone Number
|  ┌─────────────────────────────┐
|  │ +880 1XX-XXX-XXXX           │
|  └─────────────────────────────┘
|
|  Relationship
|  ┌─────────────────────────────┐
|  │ Select relationship      [▼]│
|  └─────────────────────────────┘
|
|  [Save Contact]
```

#### Component Breakdown
**A. Header:** Back arrow + "Add Emergency Contact" + theme toggle.

**B. Name Input:** `InputField`, auto-capitalize words.
- Placeholder: "Full name"
- Validation: required, min 2 chars

**C. Phone Input:** `InputField`, numeric keyboard.
- Prefix: "+880" (fixed, 15px Medium, `textSecondary`)
- Placeholder: "1XX-XXX-XXXX"
- Validation: 10 digits after +880

**D. Relationship Dropdown:** Same dropdown style.
- Options: "Family", "Friend", "Partner", "Colleague", "Other"

**E. Save Button:** `primary` bg, full width, 56px.
- Disabled until all fields valid
- On press: `POST /api/user/emergency-contacts` → success → `router.back()`

#### API Wiring
- `POST /api/user/emergency-contacts` → `{ name, phone, relationship }`
- **If API does not exist:** Store in local state / AsyncStorage as fallback. Show "Saved locally" toast.

#### Edge Cases
- Duplicate phone → show "Contact already exists" error
- API failure → save to AsyncStorage (`@emergency_contacts`) + show "Saved locally" warning

---

## STATE MANAGEMENT SPECS

### Existing stores (confirmed in `store/`)

| Store | File | Status |
|-------|------|--------|
| `useRiderStore` | `store/useRiderStore.ts` | Exists — verify `reset()` method |
| `useDriverStore` | `store/useDriverStore.ts` | Exists — has `reset()` |
| `useChatStore` | `store/useChatStore.ts` | Exists — verify `reset()` method |
| `useCallLedgerStore` | `store/useCallLedgerStore.ts` | Exists — driver-only |
| `useDriverFlowStore` | `store/useDriverFlowStore.ts` | Exists — driver-only |
| `useDriverStatusStore` | `store/useDriverStatusStore.ts` | Exists — driver-only |
| `usePackageStore` | `store/usePackageStore.ts` | Exists — driver-only |

### DO NOT create or reference these stores

| Store | Reason |
|-------|--------|
| `useRidesStore` | File does NOT exist |
| `useWalletStore` | File does NOT exist |
| `useNotificationsStore` | File does NOT exist |
| `useCustomer` | File does NOT exist |
| `useWSStore` | File does NOT exist |

### State strategy for Plan 03 screens

- **Rides Tab:** Use local `useState` + `RefreshControl` to fetch `GET /api/ride/get-all`. If `useRiderStore` gains a `rides` slice in future, migrate to it — but do NOT create `useRidesStore` in Plan 03.
- **Wallet:** Use local `useState` + `RefreshControl` to fetch `GET /api/rider/wallet`. Do NOT create `useWalletStore`.
- **Inbox:** Use local `useState` + `RefreshControl` to fetch `GET /api/rider/notifications`. Persist read-ids in AsyncStorage if `PATCH /api/rider/notifications/read` is absent. Do NOT create `useNotificationsStore`.
- **Profile:** Extend `useRiderStore` if it already holds user data; otherwise fetch `GET /api/user/me` locally.

### Sign-Out Store Cleanup

After `supabase.auth.signOut()`, clear ONLY stores that exist and have `reset()`:

```ts
// Verified existing stores only:
if (useRiderStore.getState().reset) useRiderStore.getState().reset();
if (useDriverStore.getState().reset) useDriverStore.getState().reset();
if (useChatStore.getState().reset) useChatStore.getState().reset();

// DO NOT reference non-existent stores:
// useRidesStore, useWalletStore, useNotificationsStore, useCustomer, useWSStore
```

Then let the auth gate handle redirect. **Do NOT call `router.replace` manually.**

---

## LOADING & ERROR STATES

### Skeleton Loader: `RideCardSkeleton`

**File:** `components/plan03/RideCardSkeleton.tsx`

**Layout:** Same dimensions as `RideCard` but with shimmer/placeholder blocks.
```
┌─────────────────────────────┐
│ [40px circle gray]  [line 120px] │
│                     [line 80px]  │
│                     [line 60px]  │
└─────────────────────────────┘
```

- Use `react-native-reanimated` shimmer or static gray blocks (`colors.borderLight` / `colors.borderDark`).
- 3 skeleton cards stacked with 12px gap.

**Usage:** Rides Tab while `isLoading`.

### Skeleton Loader: `NotificationSkeleton`

**Layout:** Same as `NotificationCard` but with gray blocks.
```
┌─────────────────────────────┐
│ [40px circle]  [line 100px] │
│                [line 60px]  │
│                [line 40px]  │
└─────────────────────────────┘
```

**Usage:** Inbox while `isLoading`.

### Skeleton Loader: `WalletSkeleton`

**Layout:**
```
┌─────────────────────────────┐
│ [line 80px]                 │
│ [line 40px]  [line 40px]    │
└─────────────────────────────┘
│ [line 100%]                 │
│ [line 100%]                 │
```

**Usage:** Wallet while `isLoading`.

### Error State Pattern (All Fetching Screens)

When API fails, replace the list/content with:

```tsx
<View style={{ padding: 24, alignItems: 'center' }}>
  <Ionicons name="warning-outline" size={48} color={colors.danger} />
  <Text style={{ marginTop: 12, fontSize: 15, fontFamily: 'Jakarta-Medium', color: textSecondary }}>
    Could not load {screenName}
  </Text>
  <Text style={{ marginTop: 4, fontSize: 13, fontFamily: 'Jakarta-Regular', color: textDisabled }}>
    Pull down to retry
  </Text>
</View>
```

- `screenName`: "rides", "wallet", "notifications", etc.
- Include in `ScrollView` with `RefreshControl` so pull-to-refresh works.

---

## TASK G — DELETE ORPHANED `ride-completed` SCREEN

**File to delete:** `app/(main)/(customer)/ride-completed/index.tsx`

**Additional cleanup required:**
1. Search codebase for `ride-completed` string:
   ```bash
   grep -rn 'ride-completed' app/ components/ store/
   ```
2. Remove any `router.push('/ride-completed')` or `router.replace('/ride-completed')` calls.
3. Check `app/(main)/(customer)/_layout.tsx` for route registration:
   ```tsx
   // Remove if present:
   <Stack.Screen name="ride-completed" ... />
   ```
4. Check `app/(main)/_layout.tsx` and `app/_layout.tsx` for any references.
5. If `ride-completed` is referenced in any store or WebSocket handler, redirect to `rate-driver?rideId=` instead.

**Rationale:** Plan 02 changed the post-ride flow to `ride-tracking → rate-driver → services-hub`. The `ride-completed` screen is unreachable dead code.

---

## ASSET STRATEGY

**Rule:** Use `Ionicons` for ALL icons. No custom illustrations, no emoji in production UI.

| Where | Asset | Replacement |
|-------|-------|-------------|
| Empty state illustration | `images.noResult` | Use `Ionicons "document-text-outline"` 64px, `textDisabled` |
| Location onboarding | Map pin illustration | `Ionicons "location"` 80px on `primaryLight` circle |
| Notifications onboarding | Bell illustration | `Ionicons "notifications"` 80px on `primaryLight` circle |
| Notification type icons | Emojis (🎁 🚗 💳) | Ionicons: `gift`, `car`, `card`, `information-circle` |
| Transaction type icons | Emojis | Ionicons as spec'd in `TransactionRow` |

**If `images.noResult` exists and works:** Keep it, but provide the Ionicons fallback in `EmptyState` component via a prop (`useIllustration?: boolean`).

**No new image assets needed for Plan 03.**

---

## UPDATED VERIFICATION CHECKLIST (ADDITIONS)

- [ ] `SettingsRow`, `TransactionRow`, `NotificationCard`, `EmptyState`, `StatusBadge` components created and reusable
- [ ] All 9 sub-screens have full wireframe-level specs (not just names)
- [ ] `useRiderStore` verified to have `reset()` method
- [ ] `useDriverStore` verified to have `reset()` method
- [ ] `useChatStore` verified to have `reset()` method
- [ ] Sign-out cleanup calls ONLY existing store `.reset()` methods before navigating
- [ ] `useRidesStore`, `useWalletStore`, `useNotificationsStore`, `useCustomer`, `useWSStore` NOT created or referenced (they do not exist as files)
- [ ] Skeleton loaders shown for Rides Tab, Wallet, Inbox while loading
- [ ] Error states shown for all fetching screens with pull-to-refresh retry
- [ ] `app/(main)/(customer)/ride-completed/index.tsx` deleted + all references removed
- [ ] `app/(main)/(customer)/(tabs)/settings/index.tsx` EXISTS and is the canonical Settings Hub (24 sub-screens) — DO NOT delete
- [ ] All icons are Ionicons (no emojis in production UI)
- [ ] `fare-dispute/index.tsx` created with "Coming soon" fallback if API missing
- [ ] `emergency-contacts/add.tsx` created with AsyncStorage fallback if API missing

---

*End of Supplement*