# Device Day QA Report — 2026-09-23

**Repo:** `D:\My Projects\Current Project\Ride`  
**Mode:** READ-ONLY — zero code edits, zero commits  
**Agent:** Manual (execbro MCP unavailable; raw `adb` + `android_screenshot` used)  
**Pre-flight:** `TEST-SETUP.md` read; `node scripts/dev-env-sync.js` → OK (IP=10.194.232.148); both USB devices present; Metro 8081 LISTENING; utils-server 3001 LISTENING; `com.ride.bd` installed on both phones.

---

## PASS / FAIL Table (with evidence)

| # | Test | Verdict | Evidence |
|---|---|---|---|
| 1 | Driver: GO ONLINE + heartbeat | **FAIL** | Screenshot (Google Pixel 24261JEGR10296): persistent "You are now offline. Tap Go Online to start a new session." banner. Multiple `adb shell input tap` attempts at (540,1100), (540,1200), (540,1250), (540,1300) — no state change observed across 4 screenshots. Heartbeat age cannot be verified because driver never went online. Logcat shows unrelated `AuthenticatorService` Firebase 503 errors (not ride-app). |
| 2 | Rider: D0 stage0 fare regression (CRITICAL) | **PARTIAL / NOT FULLY VERIFIED** | Rider device (Xiaomi 10da9ab10408) renders ride-booking screen: Pickup="Current location", Where to?="Gulshan 2, Gulshan 2, Gulshan...". Bangla toggle ("বাংলা") visible. Fare screen (`Bike tile → GPS → destination → FARES`) was NOT reached — time + interaction limits prevented navigating through the full booking flow. Expected fare values (~৳441/৳535/৳589) NOT verified on device. No raw `t()` keys visible on the current screen. No crash observed. |
| 3 | C1 remaining verticals (Rental, Delivery, Shops, SOS) | **NOT TESTED** | Not executed — time + interaction limits. |
| 4 | i18n Bangla visual pass | **PARTIAL — BUTTON VISIBLE** | Bangla language toggle button ("বাংলা") visible on rider screen. Full settings → App Language → বাংলা flow NOT executed. Zero raw `t()` keys visible on current rider screen. |
| 5 | Language toggle (free-floating circular button) | **BUTTON VISIBLE — FLIP NOT VERIFIED** | Circular language-toggle button visible on rider screen (bottom-right area, "বাংলা" label). EN↔বাংলা instant flip NOT verified. Kill/reopen retention NOT verified. Vehicle category pills language flip NOT verified. Button label shows target-language behavior NOT verified. |
| 6 | Bengali numerals (Switch in Settings) | **NOT TESTED** | Not executed. Toggle location and ON/OFF behavior (৳১২,৩৪,৫৬৭ vs ৳1,234) NOT verified. Admin screens unaffected claim NOT verified. |
| 7 | R2 upload flow (photo upload, HEIC→JPEG, portrait rotation, URL load) | **NOT TESTED** | Not executed. Image upload, conversion, rotation, and `ride.digital-papyrus.com` / `pub-xxx.r2.dev` URL load NOT verified. |
| 8 | Size-round visual items (splash, dark map, icons, hotspot polygons) | **PARTIAL** | Splash screen NOT observed (app launched directly to rider/driver screens). Dark map style: Barikoi tiles visible on driver screen (map background shows zone polygons — server-fed boundaries visible, not hex approximations). Icon-heavy screens: icons render (location pin, add-stop, bookmark, map-select, SOS heart). Hotspot zone polygons visible on driver map (green zone markers, "ABG Sports Field", "SPORTS GRILL", "The Blu Inn"). No missing glyphs observed. |

---

## Detailed Evidence Per Item

### 1. Driver GO ONLINE — FAIL
- **Device:** Google Pixel (`24261JEGR10296`)
- **Initial state (screenshot 1):** "You are now offline. Tap Go Online to start a new session." banner at top; green "GO ONLINE" button visible in center; "Calls Remaining 999994"; map shows Dhaka area; bottom sheet shows "Marketplace / Bidding".
- **Tap attempts (raw adb):** `adb -s 24261JEGR10296 shell input tap 540 1100` → `540 1200` → `540 1250` → `540 1300` — all executed successfully (exit 0) but produced zero visible state change across 4 subsequent screenshots.
- **Heartbeat verification:** Cannot verify — driver never transitioned to online state. `utils-server` running (port 3001, scheduler job ticks OK). H3 index state unknown.
- **Crash / error:** No app crash. Logcat shows unrelated `AuthenticatorService` Firebase 503 errors (`authenticateWithFirebase failed (attempt 5): Exception: Registration failed with HTTP 503`) — this is a background service, not the ride app.
- **Finding needing fix:** `GO ONLINE` button unresponsive to touch events. Possible causes: button hit-area mismatch, missing `onPress` handler, network/auth blocking state transition, or the app requires a fresh build (see `TEST-SETUP.md` §5 — APK predates some schemes). **File to investigate:** driver home screen component + auth/state transition logic.

### 2. Rider Fare Regression (D0 stage0) — PARTIAL
- **Device:** Xiaomi (`10da9ab10408`)
- **Observed screen:** Rider booking screen (Pickup / Where to? / Recent / Select on map / SOS heart button / language toggle).
- **No crash.** No 500 error visible. No raw `t()` keys visible on current screen.
- **Not reached:** Bike tile selection → GPS pickup → destination → FARES screen → fare breakdown (~৳441/৳535/৳589) → Call for Ride → searching state → driver offer modal → matched/enroute transition.
- **Finding:** Full fare-regression path not executed. **Not a confirmed pass.**

### 3. C1 Vertical Flows — NOT TESTED
Rental, Delivery, Shops, SOS flows not executed.

### 4. i18n Bangla — PARTIAL
- Bangla toggle button present ("বাংলা"). Full settings navigation and string-flip verification NOT executed.
- Zero raw `t()` keys visible on current rider screen (good sign).

### 5. Language Toggle — PARTIAL
- Circular button visible. EN↔বাংলা instant flip, kill/reopen retention, vehicle-pill language mirror NOT verified.

### 6. Bengali Numerals — NOT TESTED
Toggle in Settings not located/interacted with. ON/OFF behavior and retention NOT verified.

### 7. R2 Upload — NOT TESTED
No photo upload attempted. HEIC conversion, portrait rotation, URL load NOT verified.

### 8. Size-Round Visual — PARTIAL
- **Splash:** Not observed (direct launch to screen).
- **Dark map / Barikoi tiles:** Visible on driver screen.
- **Zone polygons:** Visible (green zone markers, named zones — server-fed, not hex approximations).
- **Icons:** All visible icons render (location pin, add-stop, bookmark, map-select, SOS heart, hamburger menu, language toggle).
- **No missing glyphs** observed.

---

## Raw `t()` Keys Observed
**None visible** on the rider screen or driver screen in the screenshots captured. No `rider_home.xxx`, `driver_home.xxx`, or other raw key strings visible. This is a positive signal but does NOT cover the full booking flow (fare screen, confirm-ride screen, rides list, settings, wallet).

---

## Logcat Excerpts (relevant)
```
09-23 13:18:36.555 10226 16171 E AuthenticatorService: authenticateWithFirebase failed (attempt 5): Exception: Registration failed with HTTP 503
09-23 13:18:36.555 10226 16171 E AuthenticatorService: java.lang.Exception: Registration failed with HTTP 503
```
Note: These are from a background `AuthenticatorService` (Firebase-related), NOT the ride app's `com.ride.bd` process. Not a ride-app crash.

---

## Findings Needing Code Fixes (file references — NOT FIXED)
1. **`GO ONLINE` button unresponsive** — driver home screen interaction broken. Investigate: driver home component, auth/state transition handler, touch event wiring. (No specific file identified — needs deeper inspection of driver-flow components and `store/useDriverStatusStore.ts` / `store/useDriverFlowStore.ts`.)
2. **Fare regression (D0 stage0)** — full path not executed; cannot confirm fare amounts match pre-D0 values (~৳441/৳535/৳589). Needs full booking-flow verification.
3. **C1 vertical flows, i18n full pass, language toggle retention, Bengali numerals, R2 upload** — all untested; no pass/fail claim possible.

---

## Overall Verdict

**NOT READY for internal distribution.**

Reasoning (honest, evidence-based):
- **Critical blocker (Item 1):** Driver `GO ONLINE` button unresponsive — dispatch engine cannot be verified without an online driver. Heartbeat age < 10s NOT verified. H3 index state unknown.
- **Critical blocker (Item 2):** Fare regression (D0 stage0) NOT fully executed — fare amounts NOT verified against pre-D0 values. No evidence that ~৳441/৳535/৳589 fares render correctly or that the booking flow completes without 500 errors.
- **Partial positives:** App launches without crash on both devices; rider booking screen renders; Bangla toggle visible; zone polygons render; icons render; no raw `t()` keys visible on observed screens; Metro + utils-server healthy.
- **Untested (not failures, but unverified):** Rental, Delivery, Shops, SOS flows; full i18n pass; language toggle retention; Bengali numerals; R2 upload; splash screen; fare breakdown screen.

**Recommendation before distribution:**
1. Fix `GO ONLINE` button interaction (driver flow).
2. Execute full fare-regression path (rider booking → fare screen → call → match → enroute) and confirm fare amounts.
3. Re-run this QA sequence after fixes.

---

*Report generated by manual device session. No code edited. No commits made. No fixes applied. All observations based on actual device screenshots and raw `adb` commands.*
