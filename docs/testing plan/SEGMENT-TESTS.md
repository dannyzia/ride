# Segment Tests — Small Chunks, One Per Session

<!-- AI-READER HEADER — every artifact written for AI consumption in this repo starts with this block. -->
**Purpose:**     Copy-paste prompts for small, time-boxed test segments (backend-first, then frontend). One segment per Test-Engineer session.
**Owner:**       Orchestrator (this file) · Test-Engineer model executes · Zia pastes.
**Status:**      ACTIVE — created 2026-08-29.
**Source of truth:** `docs/testing plan/master-testing-prompt.md` for the deep phase recipes (§6 tap targets, §7 phases, §8 verification matrix, §9 triage, §11 cleanup). This file slices it into small runs.
**Related (concrete paths):**
  - `docs/testing plan/TESTING-SETUP.md` — bring-up chain + failure catalogue (read §1 before any run)
  - `docs/testing plan/master-testing-prompt.md` — full A→I recipe this file slices
  - `docs/testing plan/TEST-ENGINEER-PROMPT.md` — the Segment-4 full visual pass prompt
  - `theme/goRide.ts` — design-token source of truth
**Last verified:** 2026-08-29 by Orchestrator (devices probed via `adb devices`; docs audited against disk).
**How to update:** After each segment run, append the report filename + verdict to §6. Fix any stale fact in ALL prompt files, not just this one.

---

## 0. Device pair (same for every segment)

| Priority | Device | ID | Role |
|--------|--------|----|------|
| 1 — primary | Pixel 6a (physical) | `24261JEGR10296` | Rider |
| 1 — primary | POCO X3 (physical) | `9a76528e` | Driver |
| 2 — backup | Medium_Phone emulator | `emulator-5554` | Rider |
| 2 — backup | Pixel_6a emulator | `emulator-5556` | Driver |

Run `adb devices` first; use whichever pair is attached. Physical phones use real GPS (near a window; the app has an 8s GPS timeout + Barikoi fallback). Emulator GPS: `adb -s <id> emu geo fix 90.4125 23.8103` (longitude first).

## 1. Universal prelude (already embedded in each prompt below — this section is reference)

Health: `GET http://localhost:3001/health` → top-level `"status":"ok"` (ignore `database.status:"unknown"`). Accounts: rider `1613249520` / driver `1700000001`, password `test1234` (password login — OTP is registration-only). Route: Banani → Savar Cantonment Zoo Road, vehicle **Bike Plus**, expected fare ≈ ৳523 with intercity 2× (`is_intercity=true`). Cleanup SQL between runs is in master-testing-prompt.md §11.

---

## 2. SEGMENT 1 — Dispatch chain (backend) · ~10 min

```
You are an autonomous mobile QA agent with vision and device control. ONE segment only, 12-minute hard cap, 1 retry per phase, then report and stop. Never modify code. Never killApp (it logs out) — ask the operator to press r in Metro for reloads.

DEVICES (run `adb devices` first): Rider = 24261JEGR10296 (Pixel 6a physical) or emulator-5554; Driver = 9a76528e (POCO X3 physical) or emulator-5556. App id com.ride.bd.
HEALTH FIRST: GET http://localhost:3001/health → "status":"ok" (ignore database.status). If not ok → STOP, report BLOCKED.
ACCOUNTS (password login, NOT OTP): rider phone 1613249520, driver phone 1700000001, password test1234. Type number without +880 → Login → tap "Password" → type → Login. Skip login if already on Home.

PHASE A — LOGIN both devices. Driver Home must show "Calls Remaining" > 0.
PHASE B — DRIVER ONLINE: tap "Go Online" (native dialog → "While using the app"). Expect "Go Offline" + "Connected". Record calls_remaining BEFORE the request (see DB below).
PHASE C — RIDER REQUESTS: "Search destination..." → type "Savar" → tap a Savar result → "Use Current Location" (or "Use Dhaka Center") → "Find now" → "Choose Vehicle" → "Bike Plus" → "Confirm Ride" → "Request Ride" → "Finding your ride...". Capture ride_id from DB immediately.
PHASE D — DRIVER OFFER: "New Ride Offer" sheet should appear in seconds. Tap "Accept" → navigates to "Slide to Confirm Arrival". STOP HERE — do not proceed further. (Segment 2 covers the ride itself.)

DB CHECKS (after each phase, Supabase SQL):
- After C: SELECT id, status FROM rides ORDER BY created_at DESC LIMIT 1; → status in ('pending','dispatching','matched'). Capture ride_id.
- After C: SELECT outcome, driver_id FROM dispatch_offers WHERE ride_id='<id>'; → 'delivered' (billing debit happened at OFFER time, reason='offer_sent').
- After D: rides.status='matched'; rides.start_pin is a 4-digit code; dispatch_offers.outcome='accepted'.
- After D: SELECT calls_remaining FROM subscriptions WHERE driver_id=(SELECT id FROM drivers WHERE phone='+8801700000001') AND status='active'; → exactly −1 vs before.
- After D: SELECT count(*) FROM call_ledger WHERE ride_id='<id>' AND event_type='deduction'; → exactly 1.

IF NO OFFER APPEARS: the #1 regression is a screen clobbering the WS onmessage. Ask operator to reload both apps (r in Metro), retry ONCE, then FAIL and move on.
WATCH-ITEM: utils-server /health showed h3_index.drivers_indexed=1 with 0 connected drivers on 2026-08-29 (stale index). If dispatch silently targets a ghost driver (no offer, no dispatch_offers row), ask operator to restart utils-server (01→02 bats) and retry once.

REPORT (mandatory, even if partial): per phase PASS/FAIL/SKIP + notes; ride_id; calls before→after; dispatch_offers outcome; call_ledger deduction count; screenshots of any FAIL. OVERALL: PASS only if A–D all PASS and all 5 DB checks correct.
```

## 3. SEGMENT 2 — Ride in motion (backend) · ~10 min

```
You are an autonomous mobile QA agent with vision and device control. ONE segment only, 12-minute hard cap, 1 retry per phase, then report and stop. Never modify code. Never killApp — ask the operator to press r in Metro for reloads.

PREREQ: Segment 1 just completed — a ride is in 'matched' state, driver on "Slide to Confirm Arrival" (find-customer), rider on "Driver Found!" with "Tell your driver your Ride Pin" + 4-digit code. If not, STOP and report BLOCKED (re-run Segment 1 first).

DEVICES: same pair as Segment 1 (rider 24261JEGR10296 / emulator-5554, driver 9a76528e / emulator-5556).

PHASE F1 — DRIVER ARRIVES: "Slide to Confirm Arrival" is a DRAG, not a tap — long-press the left handle, drag fully right. Navigates to "Ride Pin" screen. DB: rides.status='driver_arrived', arrived_at set. Rider device shows driver-arrived indication.
PHASE F2 — PIN → START: on Rider device READ the 4-digit PIN. On Driver "Ride Pin" screen FIRST type a WRONG pin (e.g. 0000) → must show "Incorrect Ride Pin. Ask your rider and try again." THEN type the correct pin → "Start Ride" → "Starting...". DB: status='in_progress', started_at set. Rider shows "Ride in progress" / "On the way to your destination".
PHASE G — DROP-OFF: DRAG "Slide to Confirm Drop-off" fully right → modal "Ride Completed" → tap "Browse Home". DB: status='completed', completed_at set, fare_breakdown->>'total_bdt' > 0, is_intercity=true.
PHASE H — VERIFY: Rider shows "Ride Complete!" + "Total Fare"; tap "Rate Driver" if shown → 5 stars → "Submit Rating". Driver Home "Calls Remaining" decremented. No stuck spinners.

CAVEATS: keep the driver on Home → find-customer → enter-otp → finish-ride order (WS session is owned by Home in this build — do not navigate away mid-ride). Blank map on emulator = software-GL caveat, NOT a bug.

REPORT: per phase PASS/FAIL; wrong-pin error seen Y/N; arrived_at/started_at/completed_at Y/N/Y/N/Y/N; fare ৳; is_intercity Y/N; intercity 2× applied (outside charge vs per-km) PASS/FAIL; PIN matched rides.start_pin Y/N; screenshots of FAILs. OVERALL: PASS only if F1,F2,G,H all PASS with all DB stamps.
```

## 4. SEGMENT 3 — Silent invariants: tax + accounting (DB only) · ~5 min

```
You are a DB verification agent. No device interaction. Run these 4 probes against Supabase SQL for the ride_id produced by Segments 1–2 (most recent completed ride if unsure: SELECT id FROM rides WHERE status='completed' ORDER BY completed_at DESC LIMIT 1;).

I1 — Tax ledger: SELECT tl.reference_type, tr.code, tr.rate_percent, tl.base_amount_bdt, tl.tax_amount_bdt, tl.net_amount_bdt FROM tax_ledgers tl JOIN tax_rates tr ON tr.id=tl.tax_rate_id WHERE tl.reference_id='<ride_id>';
  → ≥1 row. If rate_percent>0 then tax_amount_bdt>0. FAIL if empty (accounting wiring threw — check utils-server log for "[accounting] ride completion entry failed").

I2 — Per-entry balance (CRITICAL): SELECT ae.entry_number, SUM(ael.debit_bdt) AS total_dr, SUM(ael.credit_bdt) AS total_cr, SUM(ael.debit_bdt)-SUM(ael.credit_bdt) AS imbalance FROM accounting_entries ae JOIN accounting_entry_lines ael ON ael.entry_id=ae.id WHERE ae.reference_id='<ride_id>' GROUP BY ae.id, ae.entry_number;
  → imbalance MUST be exactly 0. Non-zero = CRITICAL FAIL — stop, report, bisect newest entries.

I3 — Daily summary trigger: SELECT summary_date, tax_code, transaction_count, total_base_amount_bdt, total_tax_amount_bdt FROM daily_tax_summaries WHERE summary_date=CURRENT_DATE ORDER BY tax_code;
  → ≥1 row. Empty = trigger dropped (re-run trigger SQL from docs/Plan/kimi-code/REFERENCE.md).

I4 — Global imbalance: SELECT SUM(debit_bdt)-SUM(credit_bdt) AS global_imbalance FROM accounting_entry_lines;
  → MUST be exactly 0. If it was 0 before this run and isn't now, this run's entry is the culprit — identify via I2 on recent entries.

REPORT: I1 rowcount, I2 imbalance, I3 rowcount, I4 value, OVERALL PASS only if I1≥1 AND I2=0 AND I3≥1 AND I4=0. Any non-zero I2/I4 = CRITICAL — do not run further segments until Debug model fixes it.
```

## 5. Playbook — author from the CODE, run NATIVELY (Maestro performance rules)

The Test Engineer does **not** drive the phone screen-by-screen. The codebase is the source of truth. The deliverable is `.yaml` flows in `docs/testing plan/segments/` (S1 + S2 = Maestro flows; S3 = SQL file; S4 = vision prompt — vision is the right tool for the visual pass). Each flow `launchApp: clearState: true` first → the phone state doesn't matter; the flow bootstraps the app, logs in, and runs its phase.

| Segment | Artifact | Run command |
|---|---|---|
| 1a — Rider | `segments/s1-rider.yaml` | `maestro test --device-id 24261JEGR10296 docs/testing plan/segments/s1-rider.yaml` |
| 1b — Driver | `segments/s1-driver.yaml` | `maestro test --device-id 9a76528e docs/testing plan/segments/s1-driver.yaml` |
| 2a — Rider | `segments/s2-rider.yaml` | `maestro test --device-id 24261JEGR10296 docs/testing plan/segments/s2-rider.yaml` |
| 2b — Driver | `segments/s2-driver.yaml` | `maestro test --device-id 9a76528e --env RIDE_PIN=<4-digit> docs/testing plan/segments/s2-driver.yaml` |
| 3 — Invariants | `segments/s3-invariants.sql` | Supabase SQL editor (run I1–I4 against the latest completed ride) |
| 4 — Visual | `TEST-ENGINEER-PROMPT.md` | Paste to the vision model (vision is the right tool here, not Maestro) |

**Why a11y/selectors, not screenshots:** every `tapOn: text: "..."` / `assertVisible: text: "..."` matches the component's rendered text (read from the code — `app/(auth)/phone-entry.tsx`, `login.tsx`, etc.). No per-step vision LLM round-trip. Native `maestro test` is dramatically faster than `maestro_run` per action.

**First-run tuning:** the flows are authored from the code; some selectors (slide handle coords, the "Use Current Location" CTA exact text, the "Rate Driver" button) are best-guess on first pass. The playbook iterate loop is: run → assertion fails → fix the one selector → re-run. Each round is seconds, not minutes.

**S3 — Silent invariants:** the Segment 3 prompts in §4 above are the canonical spec. The `s3-invariants.sql` file has the exact I1–I4 probes. Run them after S2 completes against the most recent completed ride.

## 6. SEGMENT 4 — Frontend visual pass · ~25 min

Paste **`docs/testing plan/TEST-ENGINEER-PROMPT.md`** verbatim (facts refreshed 2026-08-29: tokens #0CC25F primary / #181A20 dark bg / #E5E7EB border; physical devices primary). Run it ONLY after Segments 1–3 are PASS — visual findings are meaningless on a broken backend. It re-runs the full ride with per-screen visual scoring; its §11 report template includes the visual-quality table.

Quick token reference (source of truth `theme/goRide.ts`): primary `#0CC25F` · danger `#E31D1C` · bg `#F8FAFC`/`#181A20` · surface `#FFFFFF` · text `#1C1E23` · textSecondary `#6B7280` · border `#E5E7EB` · font PlusJakartaSans · pill buttons · 16px cards.

## 7. Run log (append after every run)

| Date | Segment | Verdict | Report file / notes |
|------|---------|---------|---------------------|
| 2026-08-29 | 1 — Dispatch | **BLOCKED** (never started; bring-up + app crash) | utf-16le RedBox reproduces on fresh bundle — root cause is `h3-js` line 260 `new TextDecoder("utf-16le")` + Expo winter polyfill (`TESTING-SETUP.md` §3 Class 2), NOT the closed `ws` class; Phase A unreachable. Env note: Metro died 4× from RAM starvation (0.8 GB free) until relaunched via 02/03 bats with `EXPO_OFFLINE=1`. |
| 2026-08-29 (retry 2) | 1 — Dispatch | **UNBLOCKED — ready to run** | Permanent fix: `index.js` pre-graph polyfill entry (`require('./shims/textDecoder').install()` then `require('expo-router/entry')`); `package.json` `"main": "./index.js"`; shim refactored to export `install()` (DCE-proof, called explicitly). Metro log shows `Android Bundled 9143ms index.js (2479 modules)`. **Both phones now render the Welcome screen** (`com.ride.bd/.MainActivity` foreground, zero utf-16le/Uncaught in logcat). Rider Pixel: Welcome screen confirmed (Maestro screenshot). Driver POCO: Welcome screen confirmed (adb screencap 38KB dark-mode + MainActivity + clean logcat). Side warning: `@react-native-community/slider` "Requiring unknown module 2482" (package not installed) — non-fatal, slider is a no-op; flag for coding follow-up. **Operational blocker for TE**: Maestro `maestro_take_screenshot` on POCO failed with `INSTALL_FAILED_USER_RESTRICTED: Install canceled by user` (MIUI blocks adb installs of unknown-source APKs). Zia decision: (a) approve install on POCO when prompted, or (b) use `Pixel_6a` emulator (run `05 Emulator Pixel6A.bat` → emulator-5556) as the driver role (emulators are Maestro-native, no install), or (c) hand-drive POCO while Maestro runs the Pixel. No ride created yet — Segment 1 prompt ready to paste once the driver device is decided. |
| — | — | — | — |
