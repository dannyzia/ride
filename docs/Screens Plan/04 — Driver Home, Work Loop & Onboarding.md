# Plan 04 — Driver Home, Work Loop & Onboarding
## v2.2 — Implementation Report (Validated) — 2026-08-15

> **Status:** Waves 1–3 IMPLEMENTED and VALIDATED (`tsc --noEmit` clean in root + utils-server, `npm run lint` 0 errors). This document serves as the **spec of record** for what was built, plus verification evidence. **Device-run E2E is the only remaining gate** (§8 Review 2 — code-path verified, device run pending).
>
> **Scope:** Theme, wire, and implement the complete driver-facing core loop (home, offer, pickup, dropoff, rate, break, cancel) plus the **full driver + vehicle onboarding spec** (v2 requirements). Includes the database migration plan and backend endpoint plan required before any UI work.
>
> **Batch size:** 10 main screens + 4 shared components + 2 migrations + 8 backend tasks.
> **Estimated complexity:** HIGH.
> **Depends on:** Plans 01–03 (theme, components, auth, rider flow already complete).
>
> **Change log v2.1:** Post-implementation audit reconciliation — added AGENTS.md Compliance section (§1.5), implementation evidence to §8, explicit B-7 route contract, driver-photo canonical-path decision (§4.11), requirement→step mapping (PART C.4), verify-driver endpoint 410-stub. Auditor claims about §9 exclusions and "phantom" schema columns were verified FALSE against the tree (see §8 Review 4).
>
> **Change log v2.2 (2026-08-15, second code-skeptic audit — all kill-list items fixed):** documents resubmission 500 (partial unique index `documents_one_per_type` conflict — now handled server-side: transaction + soft-delete of superseded rows before insert) · cancel race (atomic guarded-UPDATE claim on status + affected-row check BEFORE any fee/credit writes; fee evaluated from the pre-cancel snapshot) · BRTA age check wired to `vehicles.registration_date` (was reading `drivers.vehicle_registration_date`, which B-2 never writes) · vehicle-type reconciliation (B-2 enforces `checkDriverEligibility` on type change + syncs `drivers.vehicle_type` in the same transaction; `vehicle-type-change` mirrors into `vehicles.vehicle_type`; `checkDriverEligibility` ride-count/rating thresholds fixed) · daily-stats now includes `tip_bdt` and uses `prevBdtMidnightUtc()` (DST-safe) · `verify-driver+api.ts` DELETED (was 410 stub) · finish-ride displays paisa with 2 decimals · doc corrections: B-2/D-1 `registration_date` contradiction resolved (Jan-1 rule — matches code), B-7 payload now carries `cancelled_by`.
>
> **Change log v2.3 (2026-08-15, third code-skeptic audit — round-4 delta):** `PATCH /driver/me` no longer accepts `vehicle_type` (was a third, unguarded write path bypassing the B-2/type-change gates — N1) · RideOfferSheet accept handshake is exactly-once (blind 3s `offer:accept` removed; only `fetch:confirmed` commits; `fetch:error`/timeout abort with toast — C1, previously could double-deduct/refund or match without deduction) · cancellation listeners on find-customer/finish-ride use `addEventListener`+cleanup instead of clobbering Home's `ws.onmessage`, and apply the `cancelled_by` guard where driver-cancels actually originate (N2/N4) · enter-otp has a 15s verify timeout so a half-open socket can't brick the Start button (N4) · `status+api.ts` rejects going online at (0,0) and always resolves the driver row (N5); Home omits coords when GPS is unfixed · upfront tips are never silently dropped — new `rides.upfront_tip_forfeited_bdt` (migration 0038) records the forfeit and finish-ride surfaces it (N3) · documents POST serializes concurrent submissions with a per-driver advisory lock (N6) · storage URLs are allow-listed to the project's own Supabase storage in documents + profile-image PATCH (C3a) · upload paths are user-scoped and `upsert` dropped; DocumentUploadCard surfaces upload errors (H2/H3) · utils-server closes the previous socket on driver re-auth (one driver, one live connection) and `types.ts` protocol types now match the real wire messages, including string `ts` in heartbeat (B-8).
>
> **Change log v2.4 (2026-08-15, fourth code-skeptic audit):** C2 closed — driver-home heartbeat reads `useWSStore.getState().ws` live on every tick (was a per-mount `wsRef` that an unmounted mount's orphaned `onclose` kept rewriting, stranding the current mount on a dead socket while the store still reported connected); `wsRef` deleted outright so the stale-ref class cannot recur. Doc correction: Review 6 previously labeled the server-side re-auth dup-close as "(C2)" — that fix addresses a different bug (two live sockets for one driver); C2's broken link was client-side and is closed here in v2.4.
>
> **Change log v2.5 (2026-08-15, fifth code-skeptic audit):** both round-6 criticals fixed — (C-1) `DriverStatusGuard` no longer routes `pending`/`rejected` drivers to the deleted `onboarding/documents` route; buttons go to `/onboarding` and the guard passes through on the onboarding/verification routes so the wizard's exit to `/verification` isn't bricked behind the same guard; (C-2) `reviewed_by` in admin approve/reject/verify-driver now writes the DB `users.id` (was the Supabase auth UID, which violates the `documents.reviewed_by → users.id` FK — every admin document decision 500'd; pattern matches `admin/driver/approve`). H-1: `me` PATCH and `status` POST use `parseJsonBody` (empty/truncated bodies now 400 instead of 500). H-2: Decline aborts an in-flight accept handshake (a late `fetch:confirmed` can no longer send `offer:accept` for a ride just declined) and WS-closed accept/decline now toast instead of logging silently. H-3: complete response surfaces `rider_payable_bdt` + `wallet_debit_bdt`; finish-ride's cash line is now payable − wallet debit (was gross fare — overcharged whenever a wallet redemption or collected tip settled part of the bill). H-4: Home cleanup detaches `onmessage` on unmount (both reuse and connect paths) while keeping `onclose` so reconnect-while-away survives. M-1: documents POST ownership-checks `vehicle_id`. M-2: empty `documents: {}` no longer 500s (schema refine + insert length guard). M-3: B-2 writes `drivers.vehicle_id` (wizard "skip" path is live again; docs can't be orphaned after an app kill). M-4: stats-bar double `৳` removed. M-5: offer sheet `৳NaN` guard when no fare_breakdown. M-6: theme toggle added to enter-otp and onboarding. M-7: `cancelled_by: 'system'` no longer labeled "Rider cancelled". M-8: `phone` removed from `PATCH /me` (identity — was transferable with no OTP). M-9: consent persisted unconditionally at wizard finish. M-10: §4.1's "sound + vibrate" — no sound asset exists; documented as haptics-only (see §4.1 note). LOW: emoji→Ionicons in RideOfferSheet, Pattern-A tip badge, ratio bounds through `validateMinPerKm`, verification gate includes the 4 vehicle photos, stop progress resumes from the server, endBreak surfaces failure, reverse-geocode deduped to the ≥5m branch, `activeRideId` cleared on completion, goHomeDelayed timer cleaned on unmount, vehicle type shown as display name, wait-fee `toFixed(2)`.
>
> **Change log v2.7 (2026-08-15, seventh code-skeptic audit — BUG-4 + AC-7 sweep):** BUG-4 — `dispatch_offers.fetch_confirmed_at` existed in the schema but was NEVER written: `recordCallDeduction` accepted `confirmedAt` and ignored it, so the dispatch-log views always showed `null` and the AC-7 confirmed-but-ignored refund path had no data to act on. `recordCallDeduction`'s transaction now stamps `fetch_confirmed_at` (WHERE `outcome='delivered'` — a concurrent expiry/refund no-ops, and the deduction is still refunded by the sweep). The AC-7 timeout refund (debt from Review 9) is now implemented in scheduler job 20: offers that are confirmed (`fetch_confirmed_at IS NOT NULL`) but unresponded for 15s get an append-only refund row via `recordCallRefund` and `outcome='refunded'` — covering both driver ignore and race loss; unconfirmed offers still expire at 30s. The race-loss refund in the accept handler and the scheduler sweep are now double coverage, both idempotent.
>
> **Change log v2.6 (2026-08-15, sixth code-skeptic audit — accept flow and dispatch-money fixes):** K-1 (CRITICAL): the accept handshake was dead — **nothing ever sent `fetch:confirm`**, so the server never emitted `fetch:confirmed` and every Accept fell through to the 3s timeout toast. `RideOfferSheet.handleAccept` now sends `fetch:confirm` before arming the listener (the maestro `driver-core.yaml` flow documents Accept as the trigger: "sends fetch:confirm then offer:accept"). NOTE: PRD-141's "when the driver begins interacting with the offer sheet" would deduct on any sheet touch (including Decline); this implementation keeps decline-free — a product decision to confirm (see Review 9). K-2 (CRITICAL): the losing-driver refund **hard-deleted `call_ledger` rows** (append-only — AGENTS.md) and did `calls_remaining + 1` unguarded: an unlimited subscription's `-1` sentinel became `0`, permanently benching the driver as exhausted; the two writes were also non-transactional. Replaced with `recordCallRefund` in `heartbeat.ts` (the documented `call_ledger` owner): one transaction appends a `refund` row (`delta=+1`, per AC-7), restores `calls_remaining` with the `-1` guard, reverses `daily_calls_used`, and is idempotent (existing-refund check). The offer is marked `outcome='refunded'` per AC-7. H-A (HIGH): the offer payload never carried `rider_phone`/`rider_id` — find-customer's Call button always showed "Phone number not available"; both are now sent and the rider's phone is pre-fetched with the name/rating. H-B (HIGH): the round-6 cash fix double-subtracted the wallet discount — `cash = rider_payable − wallet_debit = total − 2·discount` (worked example: ৳200 fare, ৳20 redemption → modal said ৳160 instead of ৳180). The server now computes `cash_to_collect_bdt = total + surcharge − discount` (tip never in cash: wallet-settled when collected, zero when forfeited) and finish-ride prefers it. M-A: `fetch:confirm` no longer stamps `dispatch_offers.outcome='accepted'` (confirm-then-ignore was counted as an acceptance); the stamp now happens only at real accept / rejected / refunded. Revenue guard: `offer:accept` without a `deduction` ledger row is rejected (`no_deduction`) — previously a client could match with zero deduction. M-B: offer payload now sends `driver_fare_bdt` (= `fare_breakdown.total_bdt` + `preference_surcharge_bdt`) per 06-API.md §ride:offer, and the sheet displays it instead of the raw total. M-C: v2.5's "M-4 fixed" claim was FALSE — the `DriverStatsBar` double `৳` was never edited; now actually fixed. M-D: `CountdownRing` seeds its countdown from the server's `expires_in_ms` (elapsed-local), immune to device clock skew (a clock ahead >15s used to expire every offer instantly). M-E: `rider_id` now sent.
>
> **Change log v2:** Original draft and first "corrected" draft superseded — both retained conflicts that would ship bugs (wrong WS message names, a cancel button that 409s, a feedback field the API rejects, a phantom stats source). Every claim in this document has been verified against the actual tree by the orchestrator. Resolutions are inline.

---

## 0. Orchestrator Verification Banner — RESOLVED

All items below were audited against the real tree on 2026-08-15. **These are facts, not assumptions.**

| Claim from earlier drafts | Verified Reality | Resolution (binding) |
|---|---|---|
| `app/(main)/(rider)/index.tsx` is driver home | TWO homes exist: flat `index.tsx` (477 lines, 6-state machine, no WS creation) and `(tabs)/index.tsx` (owns `new WebSocket`, `ride:offer` handling, reconnect backoff). Both resolve to the same route | **`(tabs)/index.tsx` wins.** Flat `index.tsx` is DELETED. Its legacy sends (`ride:arrived`/`ride:started`/`ride:completed`) are already covered by find-customer / enter-otp / HTTP-complete. Home renders **3 states + offer modal** |
| `reach-customer.tsx` exists | Does NOT exist. Real screen: **`find-customer/index.tsx`** (component literally named `ReachCustomer`, 461 lines). `customer-navigation/[rideId].tsx` (47 lines) renders `DriverNavigation` full-screen nav | Refactor **`find-customer/index.tsx`**. Keep `customer-navigation` as the full-screen nav it is |
| Theming = NativeWind `dark:` classes | Plans 01–02 locked **`useIsDark()` from `lib/useAppearance.ts` + inline `colors.*` ternaries** (Pattern A). Used in 100+ files. AGENTS.md is stale on this. Tailwind `go*` palette has **conflicting hex values** vs `goRide.ts colors` (e.g. `goPrimary` #0A9B4C vs `colors.primary` #0CC25F) | **Pattern A only** for all Plan 04 screens. Never `dark:` classes in driver screens. Palette source of truth = `theme/goRide.ts` |
| `OtpInput` component exists | AMENDED (M-22): `react-native-otp-entry` dep removed — `enter-otp` and `ride-tracking` use custom `components/PinInput.tsx` | Custom PinInput is the decision: lighter, themed, already tested. Do not restore the dep |
| WS messages `ride:offer_expired`, `ride:offer_cancelled`, `ride:status_update` | None exist on the wire. Real protocol (`utils-server/index.ts`): **`offer:lost`**, **`ride:status`**, **`fetch:confirmed`/`fetch:error`**, **`offer:accepted`**, **`ride:started`/`ride:start_failed`**, **`ride:arrived`** | Use ONLY the real message names (§6). `offer:expired` is declared in types.ts but never sent — treat `offer:lost` as expiry |
| Rider cancellation resets driver to ONLINE | **`ride:cancelled` / `rider:cancelled` is NEVER sent by the server.** Driver currently listens for a message that never arrives | Backend task **B-7** adds the broadcast. Client keeps listening for `rider:cancelled` AND `ride:cancelled` (both spellings) |
| Cancel button on finish-ride | `/api/ride/[id]/cancel` 409s for `in_progress` rides | **Cancel affordance lives in find-customer only** (statuses `pending…driver_arrived` are cancellable). Removed from finish-ride |
| Rate-rider feedback TextInput | `/api/ride/[id]/rate` Zod accepts ONLY `{ rating: 1–5, role }`. No feedback field, no DB column | **Feedback box dropped** from rate-rider UI. Backend change out of scope |
| Stats bar reads `/api/driver/daily-stats` | Endpoint exists but is a **mock stub** (hardcoded, no auth) | Backend task **B-6** makes it real (Dhaka midnight via `nextBdtMidnightUtc()`) |
| `reach-customer`/`finish-ride` may create fallback WS | They do — and finish-ride's fallback **never sends `auth:hello`** (unauthenticated socket stored in the singleton) | **Delete all fallback WS creators.** Only the home screen creates the connection |
| `UserAvatar` component | Does not exist | Themed placeholder circle with `Ionicons person` |
| `useWSStore`, `useRideOfferStore`, `useDriver` | All exist — inside legacy `store/index.ts` (not the dedicated store files) | Import from `@/store` as today. Store refactor is out of scope |
| Onboarding wizard posts somewhere | `onboarding.tsx` (834 lines) POSTs to `/api/driver/onboarding/submit` — **route does not exist, submission 404s silently** | Wizard rebuilt per §4.8; dead route reference deleted |
| NID docs stored as `nid_front/back` | No such enum values. Current `DOC_TYPE_MAP` **aliases NID→`license_front/back` and license→`brta_certificate`** — admin reviews mislabeled docs today | Migration **M-1** adds honest enum values; `DOC_TYPE_MAP` deleted (**B-4**) |
| Driver activation gate | `admin/documents/approve` auto-activates on 7 types: `license_front, license_back, reg_scan_front, reg_scan_back, fitness_scan, tax_token_scan, brta_certificate` — but no UI submits 3 of them, so **no driver can ever activate** | **Auto-activation REMOVED** (B-5, owner D-2) — approving sets `approved` only; admin activates manually via existing `/api/admin/driver/activate` |

---

## 1. Locked Architecture Decisions (Non-Negotiable)

| Decision | Source | Rule |
|---|---|---|
| **Theming** | Plan 02 TASK A | `useIsDark()` from `lib/useAppearance.ts` + inline `colors.*` ternaries (Pattern A). **No NativeWind `dark:` classes in Plan 04 screens.** Default `'system'` follows device |
| **Driver toggle** | Plan 03 | Moon/Sun toggle (`components/ThemeToggle.tsx` exists) in every screen header except full-screen modals |
| **Icons** | Plan 03 | **Ionicons only.** No emoji in production UI |
| **Map** | Master Plan §7 | `components/Map.tsx` (MapLibre) + `useBarikoiMapStyle(isDark)` from `utils/mapUtils.ts`. Map theme independent of UI theme |
| **Typography** | Plan 02 | Driver screens one step larger than rider scale: headings 22, body 16, labels 14, captions 12. `fontVariant: ['tabular-nums']` on all timers |
| **StatusBar** | Plan 02 | Each screen owns its StatusBar; map-dominant screens use `translucent` |
| **WS** | Verified | **Singleton in `useWSStore`.** ONLY driver home creates the connection and owns `onmessage`. All other screens use `addEventListener("message")` with cleanup. **No fallback creators anywhere** |
| **Reduced motion** | Master Plan §16 | `AccessibilityInfo.isReduceMotionEnabled()` gates pulse/radar animations |
| **Money** | AGENTS.md | Integer paisa everywhere; divide by 100 only at display |

## 1.5 AGENTS.md Compliance Requirements (binding on every B-task)

| Rule | Application | Implementation status |
|---|---|---|
| **Error format** | EVERY route returns `{ error: '<machine_code>', message: '<human>' }`. Codes used: B-1 `unauthorized`/`driver_not_found`/`invalid_vehicle_type`; B-2 `invalid_json`/`invalid_vehicle_type`/`vehicle_not_created`; B-3 `invalid_json`/`invalid_account_number`; B-4 `invalid_json`/`invalid_doc_type`/`invalid_uuid`; B-6 `unauthorized`/`driver_not_found`; path params everywhere → `invalid_uuid` | ✅ implemented |
| **B-3 atomicity** | Deactivate-old + insert-new MUST be one transaction. | ✅ `db.transaction` in `payout-method+api.ts` |
| **B-6 money-type clarity** | `earnings_bdt` is integer **paisa**. `online_hours` is **decimal hours** (a duration, NOT money — never apply paisa rules to it). `rating`/`acceptance_rate` are numeric percentages. | ✅ documented here; implemented |
| **B-7 write-ownership guard** | Rider cancellation path writes ONLY `rides`, `accounting_entries*`, compensation tables via the existing cancel route. It does **NOT** write `call_ledger` or `dispatch_offers` — deduction remains exclusively in `utils-server/heartbeat.ts`. Any future "fix" adding those writes is a critical bug. | ✅ no such writes exist |
| **B-2 year bound** | `registration_year` max is `new Date().getFullYear() + 1` computed **at runtime** — never a hardcoded year. | ✅ implemented |
| **Zod + parseJsonBody** | All POST bodies via `parseJsonBody`; URL params `z.string().uuid()`; Drizzle snake_case; `lib/logger.ts` (no console.log). | ✅ verified across Wave 1 files |

---

## 2. Screen Inventory & File Mapping (verified paths)

| # | Screen | File Path | Action |
|---|---|---|---|
| 1 | **Driver Home** | `app/(main)/(rider)/(tabs)/index.tsx` | Rewrite: 3-state machine + offer modal, stats bar, toggle |
| — | *(old flat home)* | `app/(main)/(rider)/index.tsx` | **DELETE** (duplicate route, legacy sends) |
| 2 | **Reach Customer** | `app/(main)/(rider)/find-customer/index.tsx` | Theme + unify. Keep ALL logic (wait timer, toll modal, multi-stop) |
| 3 | **Finish Ride** | `app/(main)/(rider)/finish-ride/index.tsx` | Theme + delete dead `verifyReached` (~100 lines) + delete fallback WS + remove Cancel button |
| 4 | **Rate Rider** | `app/(main)/(rider)/rate-rider/index.tsx` | Ionicons stars, themed placeholder avatar, NO feedback field |
| 5 | **Break Mode** | `app/(main)/(rider)/break-mode/index.tsx` | Convert Pattern C → Pattern A; tabular timer; resume from `GET /api/driver/me` (`on_break`, `break_started_at`) |
| 6 | **Enter OTP** | `app/(main)/(rider)/enter-otp/index.tsx` | Theme in place (currently hardcoded `bg-white` light) |
| 7 | **Cancellation Reasons** | `app/(main)/(rider)/cancellation-reasons/index.tsx` | Theme + wire; body is `{ reason?: string(255) }` free text |
| 8 | **Onboarding Wizard** | `app/(main)/(rider)/onboarding/index.tsx` (NEW) | Full rebuild per §4.8 spec; delete flat `onboarding.tsx` and dead `/onboarding/submit` call |
| 9 | **Driver Documents** | `app/(main)/(rider)/documents/index.tsx` | Theme status list; consume new enum values |
| 10 | **Driver Verification** | `app/(main)/(rider)/verification/index.tsx` | Rebuild: stepper derived from `drivers.status` + document statuses (no granular pipeline exists) |

**Not touched:** `customer-navigation/[rideId].tsx` (already Pattern B — convert colors to Pattern A only where trivial), `add-vehicle/index.tsx` (rewired in §4.8 step 2), `select-active-vehicle.tsx` (verify only).

---

# PART A — Database Plan

**Executed BEFORE any UI work. Two additive migrations, no destructive changes, no write-ownership surfaces touched (`call_ledger`, `dispatch_offers`, `subscriptions` untouched).**

## M-1: `document_type` enum additions

```sql
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'nid_front';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'nid_back';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'uber_screenshot';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'pathao_screenshot';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'obhai_screenshot';
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'indrive_screenshot';
```

- **Why per-platform values instead of a platform column:** the partial unique index `documents_one_per_type (driver_id, doc_type) WHERE status IN ('pending','approved')` already enforces "one live doc per type" — four enum values give each platform exactly one slot with **zero index changes**. A `legacy_platform` column would require redefining the unique index.
- Existing `legacy_screenshot` value stays (owner-consent flow references it); new uploads use the platform-specific values.
- **Data cleanup (code-side, not SQL):** stop aliasing via `DOC_TYPE_MAP` (B-4). Historical mislabeled rows (NID stored as `license_front`) are soft-deleted by a one-time admin action, not by migration.

## M-2: `vehicle_models` provenance

```sql
ALTER TABLE vehicle_models ADD COLUMN source varchar(20) NOT NULL DEFAULT 'admin';
ALTER TABLE vehicle_models ADD COLUMN created_by uuid REFERENCES users(id);
```

- **"Others adds to the database" flow:** driver-submitted brand/model inserts with `source='driver'`, `created_by=<user_id>`, `is_active=false` → invisible to other drivers' dropdowns until an admin activates. Unmoderated strings never enter everyone's dropdown.
- Existing rows default to `source='admin'` — no backfill needed.
- **DBA note (audit item 8):** adding a column with a constant `DEFAULT` on Postgres 11+ is a metadata-only change — **no table rewrite, no long lock**. The migration uses `ADD COLUMN IF NOT EXISTS ... NOT NULL DEFAULT 'admin'`, which is safe on large tables. Supabase is PG15+.

## M-3: NOT REQUIRED

- `vehicles` already has `manufacturing_year int` + `registration_date date` (spec's "Registration Year" → `manufacturing_year`, see D-1).
- `driver_payout_methods` already exists (`method_type varchar(20)`, `account_number varchar(50)`, `is_default`) — bKash stores as `method_type='bkash'`. No bKash-specific column; **no other bank fields collected** per owner decision.
- Vehicle photos (F/L/B/R) are `documents` rows with existing `vehicle_photo_*` enum values, linked via `documents.vehicle_id`. No photos table needed.

---

# PART B — Backend Plan

All tasks: Zod at boundary, `parseJsonBody`, Expo param convention (`{ id }` direct second arg), `lib/logger.ts`, snake_case props, transactions where money tables are touched.

## B-1: `GET /api/driver/vehicle-models` (NEW)
`app/api/driver/vehicle-models+api.ts`. Driver-auth (`verifySupabaseToken` + drivers row). Query: `?vehicle_type=<enum>` optional. Returns `{ models: [{ id, brand, model, year_start, year_end }] }` filtered `is_active = true`. **Drivers cannot create via this endpoint** — creation happens only through B-2's "Others" path.

## B-2: `POST /api/driver/vehicles` (REWRITE)
`app/api/driver/vehicles+api.ts`. New body:
```ts
{ brand: string(1–100), model: string(1–100), registration_year: int(1980–currentYear+1),
  vehicle_type: VEHICLE_TYPE_ZOD_ENUM, registration_plate: string(1–50), number_of_seats?: int }
```
- Writes `vehicles`: `manufacturer=brand`, `model`, `manufacturing_year=registration_year` (**D-1**), `registration_date=Jan-1-of-registration-year` (**D-1** — v2.2 removed the earlier contradictory "=today" wording; code has always written Jan-1), real plate parsing kept from existing logic where sane.
- **Vehicle-type reconciliation (v2.2):** B-2 enforces `checkDriverEligibility` when the driver already has a vehicle of a different type (first-time setup exempt — the admin adjusts type at activation via `admin/driver/approve` `vehicle_type_adjusted`), and syncs `drivers.vehicle_type` in the same transaction — dispatch reads `drivers.vehicle_type` for candidate filtering, so the onboarding choice must reach it. `vehicle-type-change+api.ts` mirrors the type into `vehicles.vehicle_type` so the two tables never diverge.
- **"Others" path:** if `(brand, model)` not found in `vehicle_models` (case-insensitive) → insert `vehicle_models (brand, model, source='driver', created_by=<user>, is_active=false, default_vehicle_type=<vehicle_type>, passenger_seats=number_of_seats ?? 4)`.
- Kill the regex-parse hack; stop fabricating `fitness/tax_token` expiry beyond existing behavior (keep +1y defaults — column NOT NULL — but flag with TODO comment).
- Existing `onConflictDoUpdate` on `driver_id` (1 vehicle per driver) preserved.

## B-3: `POST /api/driver/payout-method` (NEW)
`app/api/driver/payout-method+api.ts`. Driver-auth. Body: `{ account_number: regex ^01\d{9}$ }`. Writes `driver_payout_methods (method_type='bkash', account_number, account_name=<driver name>, is_default=true, is_active=true)`; deactivates prior defaults. **No bank/nagad fields — bkash only, per owner.**

## B-4: `POST /api/driver/documents` — kill the alias map
- **Delete `DOC_TYPE_MAP` entirely.** All 20+ enum values accepted as-is (pass-through remains).
- New accepted keys include `nid_front`, `nid_back`, `reg_scan_front`, `reg_scan_back`, `license_front`, `license_back`, `brta_certificate`, `vehicle_photo_front/left/back/right`, `uber_screenshot`, `pathao_screenshot`, `obhai_screenshot`, `indrive_screenshot`, `driver_photo`.
- Optional `vehicle_id: uuid` in body → stamped on inserted rows (links vehicle photos to the vehicle).
- If any `*_screenshot` type submitted → set `drivers.is_legacy_operator = true`.
- Fix `file_size_bytes` hardcode: accept optional per-doc `file_size_bytes` in the record value shape OR keep 0 with TODO (implementer's choice; no blocker).

## B-5: Admin approval — NO automatic activation (owner D-2)
`app/api/admin/documents/approve+api.ts`. **Delete the auto-activate block entirely** (and the required-set constant). Approving a document sets `status='approved'` + `reviewed_by`/`reviewed_at` only. Driver/vehicle activation is a **manual admin decision** via the existing `/api/admin/driver/activate` endpoint — the admin reviews driver docs, vehicle docs, and legacy screenshots (informational, D-3) together, then activates or reverts (admin calls the driver on revert).

## B-6: `GET /api/driver/daily-stats` — make it REAL
Driver-auth. Today = `nextBdtMidnightUtc()` boundary (Dhaka midnight, per AGENTS.md `lib/time.ts` convention). Returns `{ earnings_bdt, trips, online_hours }` (integer paisa; hours decimal) from completed rides today + `driver_online_sessions` today. Delete mock data + TODO.

## B-7: Rider cancellation → driver WS broadcast
**Route contract (exact):** `POST {UTILS_SERVER_URL}/internal/ride/cancelled` (utils-server reuses its internal HTTP listener; same base-URL resolution and `Authorization: Bearer ${WEBSOCKET_INTERNAL_SECRET}` guard as `/internal/ride/completed`). Payload `{ ride_id: uuid, driver_id: uuid, cancelled_by?: 'rider' | 'driver' | 'system' }` (**v2.2:** `cancelled_by` added so the client can suppress the "Rider cancelled" alert for a driver's own cancel). Server sends `{ type: "ride:cancelled", ride_id, cancelled_by }` to the driver's socket.
- `app/api/ride/[id]/cancel+api.ts`: after successful cancel, IF the ride had an assigned driver (driver_id not null), fire-and-forget POST (3s timeout) — `.catch` + `logger.error`.
- **Failure behavior:** DB cancel is NEVER blocked by utils-server being down (log + continue; driver discovers via home's existing state recovery).
- **Write-ownership:** no `call_ledger`/`dispatch_offers` writes — see §1.5.

## B-8: `utils-server/types.ts` protocol sync
Fix declared inbound types (`driver_arrived`→`ride:arrived`, `ride_completed`→`ride:complete`), add `ride:cancelled` outbound. Type-only change.

---

# PART C — Onboarding Spec (Owner Requirements v2, Mapped)

## C.1 Vehicle Onboarding

| # | Requirement | Storage | API | Status |
|---|---|---|---|---|
| 1 | Registration document (image) | `documents.reg_scan_front` (+`reg_scan_back` if both captured) | B-4 | ✅ |
| 2 | Vehicle images F/L/B/R | `documents.vehicle_photo_front/left/back/right` + `vehicle_id` link | B-4 | ✅ |
| 3 | BRTA enlistment certificate (image) | `documents.brta_certificate` | B-4 | ✅ |
| 4 | Legacy rideshare profiles (Uber/Pathao/Obhai/Indrive, image each) | `documents.uber_screenshot` etc. (M-1) | B-4 | ✅ M-1 required |
| 5 | Brand dropdown from DB + Others | `vehicle_models` via B-1 list; Others → insert `source='driver'` (M-2) | B-1/B-2 | ✅ M-2 required |
| 6 | Model dropdown from DB + Others | same | B-1/B-2 | ✅ |
| 7 | Registration year (wheel/dial) | `vehicles.manufacturing_year` | B-2 | ✅ |

## C.2 Driver Onboarding

| # | Requirement | Storage | Status |
|---|---|---|---|
| 1 | Name | `users.name` (collected at register; editable in wizard) | ✅ |
| 2 | Phone (= the ID) | Supabase phone OTP — phone IS identity | ✅ |
| 3 | Picture | `users.profile_image_url` via upload → `PATCH /api/driver/me` | ✅ |
| 4 | License both sides | `documents.license_front/back` | ✅ |
| 5 | NID both sides | `documents.nid_front/back` (**M-1**) | ✅ M-1 required |
| 6 | bKash account number | `driver_payout_methods` (**B-3**) | ✅ |

**Explicitly excluded (owner decision):** bank name, branch, nagad, routing — any bank details beyond bKash number. Plan 03's "Bank Details" stepper (bKash/Nagad/bank selector) is **cut** to a single bKash field.

## C.3 Owner Decisions Locked (D-1…D-4)

- **D-1 Registration Year** = **BRTA Registration Year** (owner: "the BRTA Registration Year would be enough"). Single year field in UI; writes `vehicles.registration_date` = Jan 1 of that year; `manufacturing_year` = same year as admin-correctable placeholder.
- **D-2 Activation** = **manual admin approval ONLY** (owner). No automatic activation when docs are approved. Admin uses existing `/api/admin/driver/activate`.
- **D-3 Legacy platforms** = **fully optional, informational** (owner). No minimum, none required. Screenshots exist so the admin can decide activate vs revert; on revert the admin calls the driver.
- **D-4 Image capture** = **gallery only** (owner: "let not invoke camera and make the app heavy"). Keep `launchImageLibraryAsync` only.

## C.4 Requirement → Wizard Step Mapping (audit item 12)

| Spec requirement | Collected in |
|---|---|
| Driver 1: Name | Step 1 Profile (prefilled from `/driver/me`, editable) |
| Driver 2: Phone | Pre-onboarding (Supabase OTP at register — phone IS identity; read-only) |
| Driver 3: Picture | Step 1 Profile → `PATCH /driver/me` (see §4.11) |
| Driver 4: License ×2 | Step 4 Driver Docs |
| Driver 5: NID ×2 | Step 4 Driver Docs |
| Driver 6: bKash number | Step 6 Payout |
| Vehicle 1: Registration doc | Step 3 Vehicle Docs |
| Vehicle 2: Vehicle images ×4 | Step 3 Vehicle Docs |
| Vehicle 3: BRTA certificate | Step 3 Vehicle Docs |
| Vehicle 4: Legacy platform shots ×4 | Step 5 Legacy (all optional) |
| Vehicle 5/6: Brand/Model + Others | Step 2 Vehicle |
| Vehicle 7: BRTA Registration Year | Step 2 Vehicle |

---

# PART D — Screen-by-Screen Spec

## 4.1 Driver Home — `app/(main)/(rider)/(tabs)/index.tsx`

**3 states + offer modal. Work-loop states live on other screens.**

| State | Visual | Interaction |
|---|---|---|
| `OFFLINE` | Map dimmed 30%. 80dp pulsing green "Go Online" circle. Top-right "Take a Break" pill → break-mode. Bottom: `DriverStatsBar` | Tap circle → `POST /api/driver/status` online + WS heartbeat → `ONLINE` |
| `ONLINE` | Map active. Searching radar (3 rings, staggered 500ms, scale 0.5→2.0). Top-right "Go Offline" pill (danger border). Stats bar | Auto → `RIDE_OFFER` on `ride:offer` |
| `RIDE_OFFER` | Map dimmed 40%. Existing `RideOfferSheet` + `CountdownRing` slides up (spring, 300ms) | Slide accept → `fetch:confirm` → on `fetch:confirmed` send `offer:accept` → on `offer:accepted` navigate find-customer. Reject → `offer:reject` → `ONLINE` |

**WS handling (this screen ONLY owns `ws.onmessage`):**

| Inbound | Action |
|---|---|
| `ride:offer` | Populate `useRideOfferStore` + `useDriverFlowStore.setActiveOffer`, show sheet, haptic + vibrate (M-10 v2.5: "sound + vibrate" was amended — no sound asset ships; `RideOfferSheet` fires `Haptics.notificationAsync(.Warning)` on offer and `impactAsync(.Medium)` on accept. Adding a chime requires a bundled audio asset, tracked as debt.) |
| `offer:lost` (or `offer:expired`) | Hide sheet, toast "Offer expired" |
| `ride:cancelled` / `rider:cancelled` | Alert "Rider cancelled", reset `ONLINE`, clear offer state |

- Keep existing reconnect backoff (1s→30s + jitter) and `auth:hello` on open.
- **Delete** flat `app/(main)/(rider)/index.tsx`.
- Stats bar: `GET /api/driver/daily-stats` (B-6) — `Today: ৳X • N trips • Hh` (paisa/100 at display). Tappable → `/earnings`.
- Amber "Reconnecting…" banner on `onclose` while ONLINE.

## 4.2 Reach Customer — `find-customer/index.tsx`

Keep ALL logic: wait timer (`/wait-start`, `/wait-end`), `TollParkingModal`, multi-stop (`/stops` GET/POST), call/chat actions, slide-to-arrive (`driver:arrived` WS or `/arrive`).

Refactor:
- Convert hardcoded-dark inline `colors.*Dark` → Pattern A theme object (`isDark ? ... : ...`).
- Replace emoji buttons with `DriverActionBar` (Ionicons `call` / `navigate` / `chatbubble`).
- Multi-stop list: completed = secondary + line-through, current = primary bold, future = secondary.
- **Delete the fallback `new WebSocket` block** (lines ~68) — read from `useWSStore` only; if null, navigate home (connection lost anyway).
- Cancel Ride button → `cancellation-reasons` (valid here: ride is `matched/driver_arriving/driver_arrived`).

## 4.3 Finish Ride — `finish-ride/index.tsx`

- Theme per Pattern A.
- **Delete** `verifyReached`/`verifyReachedStage` state + ~100 lines of unreachable modal JSX.
- **Delete fallback WS creator** (never sent `auth:hello` — stored an unauthenticated socket).
- **Remove Cancel button** (in_progress → 409).
- Completion: slide → `POST /api/ride/[id]/complete` (HTTP, never WS) → modal: `SuccessCheckmark`, **"Collect ৳{fare} cash from rider"** (largest text, `colors.accent`), fare breakdown (total paisa/100, distance, duration), [Rate Rider] → rate-rider, [Back to Home] → `router.replace("/(main)/(rider)")`.
- **Null-guard (implemented):** modal parses the complete response's `fare_breakdown` defensively — `total_bdt` ?? store total; `distance_km` ?? store distance; `ride_time_min` ?? store duration; all four fallback to `—` if everything is missing. A missing/empty breakdown renders the modal with dashes, never crashes.

## 4.4 Rate Rider — `rate-rider/index.tsx`

- Ionicons `star`/`star-outline`, 36dp, `colors.amber`.
- Avatar: themed placeholder circle + `Ionicons person` (no `UserAvatar` exists).
- **NO feedback TextInput** — API accepts `{ rating, role: 'driver' }` only.
- Submit → toast → `router.replace("/(main)/(rider)")`.

## 4.5 Break Mode — `break-mode/index.tsx`

- Convert NativeWind Pattern C → Pattern A.
- Timer `fontVariant: ['tabular-nums']`; coffee = `Ionicons cafe` breathing (scale 1→1.05, 3s) gated by reduce-motion.
- Start: `POST /api/driver/break/start`; End: `/break/end`.
- **Resume-from-kill:** on mount `GET /api/driver/me` → if `on_break && break_started_at`, restore elapsed timer (no new endpoint needed).

## 4.6 Enter OTP — `enter-otp/index.tsx`

- Theme in place: `theme.bg`, focus color `colors.primary`, error `border colors.danger` + shake. AMENDED (M-22): custom `components/PinInput.tsx` (dep removed).
- Keeps `addEventListener` for `ride:started` / `ride:start_failed` (correct pattern).

## 4.7 Cancellation Reasons — `cancellation-reasons/index.tsx`

- Ionicons radio list; presets map to free-text strings (≤255): "Rider no-show", "Wrong address shown", "Vehicle issue", "Personal emergency", "Other" (+ TextInput).
- Submit `POST /api/ride/:id/cancel { reason }` → `router.replace("/(main)/(rider)")`.

## 4.8 Onboarding Wizard — `onboarding/index.tsx` (NEW, replaces dead 834-line screen)

**Entry:** post-register drivers with `status='pending'|'temporary'`. **Exit:** submit → `status='pending'` → verification screen.

```
Step 1 Profile      → Name (prefilled), Picture (camera/selfie 1:1) → PATCH /api/driver/me
Step 2 Vehicle      → Brand ▼ (B-1) + Others→input · Model ▼ + Others→input · BRTA Registration Year (dial 1980–2026)
                      · Type (VEHICLE_TYPES) · Plate → POST /api/driver/vehicles (B-2)
Step 3 Vehicle Docs → Reg scan (front+back) · BRTA cert · Vehicle photos F/L/B/R
                      → uploads + POST /api/driver/documents { vehicle_id }
Step 4 Driver Docs  → NID front/back · License front/back → POST /api/driver/documents
Step 5 Legacy (opt) → "Driven with Uber/Pathao/Obhai/Indrive?" → per-platform screenshots, ALL optional, informational for admin (D-3)
Step 6 Payout       → bKash number (^01\d{9}$) → POST /api/driver/payout-method (B-3)
Step 7 Review       → checklist + consent checkboxes → submit → verification screen
```

- Segmented progress bar: active `colors.primary`, inactive `colors.borderLight/Dark`. Ionicons only.
- **Delete** flat `onboarding.tsx` + `onboarding/documents.tsx` dead flows; `documents/index.tsx` and `verification/index.tsx` remain as standalone status screens.
- Upload = existing Supabase Storage pattern (bucket `driver-documents`) but via shared `uploadImage()` from `lib/imageToURL.ts` (kill per-screen inline copies). **Gallery only** (D-4) — no camera.

## 4.9 Driver Documents — `documents/index.tsx`

- Status list from `GET /api/driver/documents`: `verified` (success), `pending` (amber), `rejected` (danger + `rejection_reason`), grouped Driver Docs / Vehicle Docs / Legacy.
- 15% alpha badges: `colors.success + "26"` etc. (`success`/`successLight` tokens to be added in Task 0 if missing).

## 4.10 Driver Verification — `verification/index.tsx`

- Stepper **derived from real data** — no fake pipeline:
  - ✅/○ Profile submitted (`drivers.status != 'temporary'`)
  - ✅/⏳/○ Documents (`GET /api/driver/documents` aggregate: all approved / some pending / missing)
  - ⏳ Admin review & activation — **manual decision** (D-2); complete when `drivers.status === 'active'`
- Estimated copy: "1–2 business days". Contact Support button → existing support screen.
- **Delete** legacy `POST /api/driver/verify-driver` usage from this screen. ✅ done — client usage removed AND the endpoint file **deleted** (`app/api/driver/verify-driver+api.ts` removed 2026-08-15, v2.2) since zero callers remained.

## 4.11 Driver Photo — Canonical Path Decision (audit item 7)

Two storage paths existed for the driver's picture:
1. `PATCH /api/driver/me { profile_image_url }` → `users.profile_image_url` — displayed in-app (profile, home)
2. `POST /api/driver/documents { driver_photo }` → `documents` row — admin verification evidence

**Canonical for UI: path 1.** The wizard (Step 1) uploads the photo and PATCHes `/api/driver/me` — one write, immediately displayable. The `driver_photo` doc type **remains a valid enum value** for future admin-evidence collection but is NOT collected by any Plan 04 screen. The documents API still accepts it (pass-through). No dual-write.

---

# PART E — Shared Components

| Component | Status | Spec |
|---|---|---|
| `DriverStatsBar` | NEW | "Today: ৳1,240 • 8 trips • 4.5h", Pattern A, tappable → earnings |
| `RideInfoCard` | NEW | Origin (green dot) / destination (red pin) / stop badge. Reused 4.2 + 4.3 |
| `DriverActionBar` | NEW | Call (`colors.primary`) / Navigate / Chat icon buttons, 64dp, a11y labels |
| `VerificationStep` | NEW | Vertical stepper item: completed/current/pending |
| `DocumentUploadCard` | EXISTS | Add preview thumbnail; keep gallery-only picker (D-4) and callback shape |
| `SlideButton` | EXISTS | Accepts `bgColor` — pass theme tokens at call sites |
| `RideOfferSheet`, `CountdownRing`, `TollParkingModal`, `SuccessCheckmark`, `Map`, `ThemeToggle` | EXISTS | Verify Pattern A compliance, no rewrite |

**Task 0 (before Phase A):** add missing `goRide.ts` tokens if absent: `success`, `successLight`. Everything else verified present.

---

## 5. Real WS Protocol (authoritative — from `utils-server/index.ts`)

**Inbound (client→server):** `auth:hello {access_token, role:"driver"}`, `heartbeat {lat,lng,ts}`, `location:update {lat,lng,ride_id}`, `fetch:confirm {ride_id}`, `offer:accept {ride_id}`, `offer:reject {ride_id}`, `ride:arrived {ride_id}`, `ride:start {ride_id, pin}`, `ride:complete {ride_id}` (legacy — prefer HTTP), `chat:typing`.

**Outbound (server→client):** `auth:ok`, `auth:error`, `ride:offer`, `fetch:confirmed {ride_id}`, `fetch:error {ride_id, reason}`, `offer:accepted {ride_id}`, `offer:rejected {ride_id, reason?}`, `offer:lost {ride_id}`, `ride:arrived` (ack), `ride:started` / `ride:start_failed {error:"invalid_pin"}`, `ride:completed {ride_id, total_bdt, driver_net_bdt, ride_time_min, fare_breakdown}`, `ride:cancelled {ride_id}` (NEW, B-7), `location:driver`, `chat:message`, `chat:typing`, `error`.

**Never emitted (do not handle):** `ride:offer_expired`, `ride:offer_cancelled`, `ride:status_update`, `subscription:expired`.

---

## 6. Backend Contract Summary (verified + planned)

| Endpoint | Status | Notes |
|---|---|---|
| `POST /api/ride/:id/wait-start` `/wait-end` `/stops` `/complete` `/rate` `/cancel` | ✅ exists | rate = `{rating, role}` ONLY; cancel body `{reason?}`, 409 if `in_progress` |
| `POST /api/driver/break/start` `/end` | ✅ exists | |
| `GET/PATCH /api/driver/me` | ✅ exists | includes `on_break`, `break_started_at`, `status` |
| `GET/POST /api/driver/documents` | ✅ → **B-4** | alias map deleted, new types, `vehicle_id`, legacy flag |
| `GET/POST /api/driver/vehicles` | ✅ → **B-2 rewrite** | structured fields + Others-insert |
| `GET /api/driver/vehicle-models` | **B-1 NEW** | active models for dropdowns |
| `POST /api/driver/payout-method` | **B-3 NEW** | bkash only |
| `GET /api/driver/daily-stats` | ✅ stub → **B-6 real** | Dhaka midnight |
| `GET /api/driver/verification-status` | ❌ does not exist | derive from `/driver/me` + `/driver/documents` — do NOT build |
| `POST /api/driver/onboarding/submit` | ❌ does not exist | dead reference — DELETE from client |

---

## 7. Implementation Order

**Wave 1 — DB + Backend (blocking):** M-1, M-2 → `drizzle-kit generate` (NOT push — orchestrator runs push) → B-1…B-8.
**Wave 2 — Components:** Task 0 tokens → DriverStatsBar, RideInfoCard, DriverActionBar, VerificationStep, DocumentUploadCard preview thumbnail (gallery-only picker per D-4).
**Wave 3a — Core loop:** 4.1 home consolidation (+ delete flat index), 4.2, 4.3, 4.6.
**Wave 3b — Secondary:** 4.4, 4.5, 4.7.
**Wave 3c — Onboarding:** 4.8, 4.9, 4.10, add-vehicle rewiring.
**Wave 4 — Validation:** `npx tsc --noEmit` → `npm run lint` → console.log scan → grep for banned patterns.

---

## 8. Verification Checklist (3x) — POST-IMPLEMENTATION EVIDENCE

**Review 1 — Architecture:** [x] `new WebSocket(` grep across `app/` → exactly ONE match (driver home `(tabs)/index.tsx:333`) · [x] all Wave 3 screens use `useIsDark()` + Pattern A; zero `dark:` classes introduced in changed files (pre-existing Pattern-B screens outside Plan 04 scope remain — see §9) · [x] theme toggle present on every Wave 3 screen · [x] Ionicons only, no emoji in changed files · [x] `console.log` scan across `app/` → zero matches.

**Review 2 — Functionality (code-path verification; device E2E pending):** [x] accept chain wired: `fetch:confirm` → `offer:accept` → `offer:accepted` → find-customer · [x] `offer:lost`/`offer:expired` clears sheet + activeOffer · [x] `ride:cancelled`/`rider:cancelled` handled on home (Alert + reset ONLINE) · [x] break resume-from-kill reads `/driver/me` before calling break/start · [x] cancel affordance only in find-customer; finish-ride Cancel removed · [x] wizard submits docs + consent; NO auto-activation code path remains (B-5 deleted it) · [x] Others-insert verified against `vehicle_models` schema columns (`default_vehicle_type` :1212, `passenger_seats` :1216). **[ ] device-run E2E — pending.**

**Review 3 — Data & Money:** [x] all money integer paisa, /100 at display only (finish-ride modal bug where raw paisa printed as ৳ was fixed) · [x] stats bar consumes real B-6 endpoint with Bearer auth · [x] zero client writes to `call_ledger`/`dispatch_offers` · [x] `nextBdtMidnightUtc()` confirmed in daily-stats · [x] migrations additive only (ALTER TYPE ADD VALUE ×6, ADD COLUMN ×2).

**Review 4 — Audit Reconciliation (2026-08-15):** external audit claims verified against the tree: "phantom columns" (`vehicle_models.default_vehicle_type`, `passenger_seats`) — **FALSE, exist in schema**; `vehicle_photo_*` enum values "possibly missing" — **FALSE, pre-existing at schema.ts:82–85**; §9 "excludes break-mode/rate-rider/cancellation/enter-OTP" — **FALSE, §9 lists none of those screens**. Valid audit findings applied: document identity (§ header), compliance section (§1.5), B-7 route contract, §4.11 photo path, C.4 mapping, M-2 DBA note, §4.3 null-guard, verify-driver 410 stub.

**Review 5 — Second code-skeptic audit, all kill-list items fixed (2026-08-15):** documents unique-index conflict → transaction + soft-delete of superseded rows (v2.2) · cancel race → atomic claim UPDATE + affected-row check before any fee/credit write; fee evaluated from pre-cancel snapshot; `cancelled_by` in WS payload (home no longer shows "Rider cancelled" for the driver's own cancel) · BRTA age check → reads `vehicles.registration_date` (was `drivers.vehicle_registration_date`, never written) · vehicle-type eligibility → B-2 gates type CHANGES + syncs `drivers.vehicle_type`; `vehicle-type-change` syncs `vehicles.vehicle_type`; `checkDriverEligibility` thresholds corrected (ride minimum is now an independent gate) · daily-stats → `earnings_bdt` includes `tip_bdt`, window via `prevBdtMidnightUtc()` · `verify-driver+api.ts` deleted · finish-ride `toFixed(2)` (paisa not rounded) · `expiry_date` no longer discarded by `documents+api.ts` · `model_created` reports only real inserts. Doc corrections: B-2/D-1 `registration_date` (Jan-1, one sentence removed), B-7 payload.

**Review 6 — Third code-skeptic audit delta (2026-08-15, v2.3):** all round-4 required items fixed — see v2.3 change log. Verified against source: `PATCH /me` vehicle_type removed (N1), RideOfferSheet exactly-once accept (C1), `cancelled_by` guard on find-customer/finish-ride with listener cleanup (N2/N4), enter-otp verify timeout (N4), (0,0) rejection + driver-existence on status (N5), `upfront_tip_forfeited_bdt` + driver surfacing (N3, migration 0038 pushed), documents advisory lock (N6), storage-URL allow-list (C3a), user-scoped upload paths + error surfacing (H2/H3), server closes the duplicate-identity socket on driver re-auth (one driver, one live connection — **NOT C2**; C2 is client-side and closed in Review 7), protocol types corrected (B-8).

**Review 7 — Fourth code-skeptic audit, C2 closed (2026-08-15, v2.4):** C2 (stale `wsRef` heartbeat death) — fixed. Heartbeat now reads `useWSStore.getState().ws` live on every tick instead of a per-mount `wsRef`; `wsRef` deleted outright so the stale-ref class cannot recur. Chain that motivated it: mount #1's orphaned `onclose` rebuilt the socket after a background drop and wrote mount #1's ref; mount #2's ref pointed at the corpse forever — the store (and green dot) said connected while heartbeats silently returned and the driver received zero offers. Remaining tracked debt (known, unfixed): M1 (driver docs persisted only at wizard step 7 — abandonment at steps 5–6 orphans uploads), M3 (Home's onmessage survives unmount; stray `offer:accepted` on another screen can still hijack navigation — mitigated by downstream listener cleanup), M8 (payout-method rows grow unboundedly per save), unsigned storage URLs for NID/license (PII posture — consciously deferred, owner TBD).

**Review 8 — Fifth code-skeptic audit, driver lifecycle unblocked (2026-08-15, v2.5):** both criticals from the round-6 read verified in source and fixed — (C-1) `DriverStatusGuard` gated the entire (rider) stack and pushed `pending`/`rejected` drivers to `onboarding/documents`, a route §4.8 deleted, so finishing the wizard (or a fresh registration) bricked the app behind a CTA to nowhere; the guard now pushes to `/onboarding` and passes through on the onboarding/verification routes, and the wizard's `/verification` exit renders. (C-2) `documents.reviewed_by` is an FK to `users.id`, but approve/reject/verify-driver wrote the Supabase auth UID — an FK violation on every decision; all three now use `dbUser.id` (the pattern already in `admin/driver/approve`). Also fixed: H-1 parseJsonBody on me/status, H-2 decline-aborts-accept + WS-closed toasts, H-3 cash line = `rider_payable_bdt − wallet_debit_bdt` (gross fare overcharged when a wallet redemption or collected tip settled part of the bill), H-4 Home unmount detaches `onmessage` (keeps `onclose`), M-1 vehicle ownership check, M-2 empty-docs 500, M-3 `drivers.vehicle_id` written by B-2, M-4 double `৳`, M-5 `৳NaN`, M-6 toggles on enter-otp/onboarding, M-7 system-cancel copy, M-8 `phone` stripped from `PATCH /me`, M-9 consent always persisted, M-10 haptics-only documented (§4.1). Low-tier polish applied: emoji→Ionicons in RideOfferSheet, Pattern-A tip badge, `validateMinPerKm` ratios, verification gate now expects all 11 required uploads (was 7 — photos excluded), stop progress resumes from server state, endBreak surfaces failure, reverse-geocode deduped, `activeRideId` cleared on completion, goHomeDelayed unmount cleanup, vehicle-type display name, wait-fee 2-decimal. Remaining tracked debt unchanged from Review 7 (M1/M3/M8, unsigned PII URLs). **Device-run E2E remains the open gate** — it is the check that would have caught C-1/C-2, and is now blocking for the completion claim.

**Review 10 — Seventh code-skeptic audit, BUG-4 + AC-7 sweep (2026-08-15, v2.7):** all v2.6 fixes re-verified in source (K-1 fetch:confirm at `RideOfferSheet` before arming the listener; K-2 append-only `recordCallRefund` + `outcome='refunded'`; M-A SELECT-only confirm; M-B `driver_fare_bdt`; H-A `rider_id`/`rider_phone`). New finding BUG-4 verified: `dispatch_offers.fetch_confirmed_at` (schema.ts:764) was never written — `recordCallDeduction`'s `confirmedAt` param was dead; the dispatch-log views and any confirmed-but-ignored refund logic had no signal. Fixed: the deduction transaction now stamps it. AC-7 (01-PRD.md:313 — "`fetch:confirm` followed by driver ignoring offer for full 15s results in a `call_ledger` refund row and `dispatch_offers.outcome='refunded'`") was unimplemented and is now scheduler job 20's confirmed-offer branch. Remaining open items: PRD-141 confirm-on-interaction vs confirm-on-Accept semantics (product decision), `offer:expired` still not emitted on timeout (client counts down from `expires_in_ms`), and the standing tracked debt (M1/M3/M8, unsigned PII URLs). Device-run E2E remains the open gate.

**Review 9 — Sixth code-skeptic audit, accept flow + dispatch money (2026-08-15, v2.6):** K-1 — the accept handshake was dead: a repo-wide grep found ZERO client send sites for `fetch:confirm` (every match was a comment or the `fetch:confirmed` reply handler); the v2.3 C1 rewrite had deleted the blind-accept timer that was the only thing ever triggering the handshake, and three rounds of "verified" handshakes never asked who fires it. `handleAccept` now sends `fetch:confirm` first, then arms the listener — the server replies `fetch:confirmed` (after the deduction), the client sends `offer:accept`. K-2 — the race-loss refund deleted `call_ledger` rows and did `calls_remaining + 1` unguarded (unlimited sentinel `-1 → 0` benches the driver) with no transaction; now an append-only AC-7 refund row in a single transaction (`recordCallRefund`, heartbeat.ts owns it), `-1`-guarded restore, `daily_calls_used` reversal, idempotent, and `outcome='refunded'`. H-A — `rider_phone`/`rider_id` added to the offer payload (find-customer's Call button was dead). H-B — round-6's cash formula double-subtracted the discount; server-side `cash_to_collect_bdt` is the figure. M-A — confirm no longer stamps `accepted`; a `no_deduction` revenue guard blocks match-without-deduction. M-B — `driver_fare_bdt` sent and displayed per 06-API.md. M-C — v2.5 falsely claimed M-4 fixed; DriverStatsBar actually fixed now. M-D — countdown seeds from `expires_in_ms` (clock-skew-proof). M-E — `rider_id` sent. **Open product decisions / debt:** (1) PRD-141 "begins interacting with the offer sheet" vs this implementation's confirm-on-Accept — decline stays free; confirm the intended semantics. (2) AC-7's 15s ignore-refund is still unimplemented server-side (confirm-then-ignore loses the call) — needs a scheduler sweep. (3) `offer:expired` is still never emitted on timeout (client relies on `expires_at`/`expires_in_ms`). (4) Prior tracked debt unchanged (M1/M3/M8, unsigned PII URLs). Device-run E2E remains the open gate — K-1 proves it is not optional.

**PENDING → RESOLVED:** `npx tsc --noEmit` ✅ passed (3 type errors fixed: `setActiveRideId` store typing, `fontVariant` readonly tuple, Ionicons `name` prop). `npm run lint` ✅ passed (0 errors). `npx drizzle-kit generate` ✅ produced canonical migration `0035_bored_scarlet_spider.sql`. `npx drizzle-kit push` ✅ reported `[i] No changes detected` — live DB already matches `schema.ts` (Plan 04 enum values + `vehicle_models` columns are live in Supabase). `code-review-graph update` ✅ completed.

---

## 9. Explicitly NOT in This Plan (scope exclusions — these ITEMS are excluded, all §2 screens ARE in scope)

| Item | Reason |
|---|---|
| Bank/nagad payout fields | Owner decision — bKash only |
| Rate-rider feedback | API/DB have no field |
| `UserAvatar` component | Doesn't exist; placeholder in scope |
| Bengali i18n | Deferred to Plan 06 |
| Central WS dispatcher refactor | Real architecture work; current pattern (home owns onmessage + addEventListener elsewhere) verified working — deferred |
| Offline charge queue | No module exists |
| Store consolidation (`store/index.ts` legacy) | Out of scope, tracked separately |
| Tailwind `go*` palette reconciliation | Tracked separately (G3); Pattern A avoids it |
| Re-theming of pre-existing Pattern-B screens (earnings, wallet, subscription, FAQ, etc.) | Plan 05 scope — Plan 04 touched only its §2 inventory |

---

**End of Plan 04 v2 — Orchestrator-verified.**
