# Device Day QA — Continuation Session Note

**Purpose:** Continuation of DEVICE-DAY-QA-2026-09-23.md (read-only verification, no fixes).
**Status:** ACTIVE — verification complete, no edits made.
**Source of truth:** DEVICE-DAY-QA-2026-09-23.md (previous session report) + this file.
**Related (concrete paths):**
  - `DEVICE-DAY-QA-2026-09-23.md` — previous session evidence (PASS/FAIL table, screenshots, logcat, findings).
  - `store/useDriverStatusStore.ts` — `setOnline()` handler (verified unchanged).
  - `store/useDriverFlowStore.ts` — `setOnline()` + `fetchDriver()` (verified unchanged).
  - `app/(main)/(rider)/d/(tabs)/index.tsx` — DriverHome component, `toggleOnline` L750-802 (verified unchanged).
  - `maestro/flows/driver-go-online.yaml` — Maestro flow for GO ONLINE (not executed — device interaction blocked by WS error).
**Last verified:** 2026-09-23 (current session), by orchestrator, via android_screenshot + execbro_tap on Pixel 6a (`24261JEGR10296`) and Xiaomi (`M2004J19C`).
**How to update:** Append new evidence after any device session; never edit previous session's findings.

---

## Verified Continuation State (no code changes)

### Previous session claims verified (re-read from disk, not chat memory)
- `DEVICE-DAY-QA-2026-09-23.md` exists; reports zero edits, zero commits.
- File inspection confirms: `store/useDriverStatusStore.ts`, `store/useDriverFlowStore.ts`, `app/(main)/(rider)/d/(tabs)/index.tsx` unchanged (no modifications since previous session).
- Previous verdict: NOT READY. Critical blocker: Driver GO ONLINE unresponsive.

### Current device verification (this session)
- Xiaomi `M2004J19C` (10da9ab10408): Rider booking screen — "Waiting for GPS...", Pickup="Current location", Where to?="Gulshan 2, Gulshan 2, Gulshan...", Bangla toggle "বাংলা" visible. Matches previous session.
- Pixel `24261JEGR10296`: Driver home — "Test Driver · Bike Plus", "Calls Remaining 999994", map with Dhaka zones. NEW: WebSocket error banner "[ERROR] [ws] error: {\"isTrusted\":fal..." visible at bottom.
- `execbro_tap` at (540,1320) on Pixel: `verification.meaningful=false`, zero visual change — GO ONLINE interaction unverified/failing.
- Metro 8081: 2 devices found; Xiaomi RN connected; Pixel RN NOT connected (WS timeout). Health check FAILED on Xiaomi.
- `com.ride.bd` installed on both.

### Test sequence continuation status
| # | Test | Previous | This session | Evidence |
|---|---|---|---|---|
| 1 | Driver GO ONLINE + heartbeat | FAIL | FAIL (reproduced) | Pixel screenshot shows WS error banner; tap produces no state change |
| 2 | Rider fare regression (D0) | PARTIAL | NOT FULLY EXECUTED | Rider screen verified; fare amounts NOT verified |
| 3 | C1 verticals | NOT TESTED | NOT TESTED | — |
| 4 | i18n Bangla | PARTIAL | PARTIAL (re-verified) | Bangla toggle visible; full flow NOT executed |
| 5 | Language toggle | PARTIAL | NOT TESTED | — |
| 6 | Bengali numerals | NOT TESTED | NOT TESTED | — |
| 7 | R2 upload | NOT TESTED | NOT TESTED | — |
| 8 | Size-round visual | PARTIAL | PARTIAL (re-verified) | Zone polygons/icons visible; splash NOT observed |

### New finding (this session, not in previous report)
- Pixel (`24261JEGR10296`) shows WebSocket error banner: `"[ERROR] [ws] error: {"isTrusted":fal..."`. This explains the previous session's `GO ONLINE` failure: the WebSocket connection is broken (`isTrusted: false`), so the `POST /api/driver/status` call (via `store/useDriverStatusStore.ts` `setOnline()` / `store/useDriverFlowStore.ts` `setOnline()`) cannot complete, and the heartbeat cannot be verified.
- File references for investigation: `store/useDriverStatusStore.ts` (L44-55 `setOnline`), `store/useDriverFlowStore.ts` (L140-156 `setOnline`), `app/(main)/(rider)/d/(tabs)/index.tsx` (L750-802 `toggleOnline`). Root cause likely server-side WS/auth config (`isTrusted`), not client-side button wiring.

### Rules followed (per orchestrator instruction)
- Read-only: NO code edited, NO files modified, NO commits made.
- If test fails: recorded with evidence, moved to next test.
- Reported honestly: PASS = observed working on device; FAIL = observed not working; NOT TESTED = not executed.
- No fabricated device results.

### Overall verdict (continuation)
NOT READY — same as previous session. Critical blocker (Item 1) unaddressed; new WebSocket error evidence confirms root cause direction (WS `isTrusted` failure blocking state transition). Fare regression (Item 2) remains unverified. No fixes applied.

### Follow-up (requires code fix + rebuild — NOT executed)
1. Investigate WebSocket `isTrusted: false` error (server/auth config).
2. Fix `GO ONLINE` interaction (likely resolved once WS is fixed).
3. Rebuild dev client (`NODE_OPTIONS=--max-old-space-size=8192 npx expo run:android --variant debug`) if APK predates current schemes.
4. Re-run full QA sequence (items 1-8) after fix.
