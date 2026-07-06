# Ride — Manual End-to-End Test Plan (Vision-Capable Tester)

> **Audience:** A human tester or a vision-enabled AI agent that can see the emulator screens, read text, and tap/type. This plan is the source of truth for manually walking the full ride lifecycle across **two** Android emulators.
>
> **Last validated build:** 2026-07 (branch `implementation`). Covers all fixes from the dispatch/map/Ride-Pin/completion work.

---

## 0. Objective

Walk one complete ride from request to completion across a **Rider** and a **Driver** device, verifying every screen transition, the Ride Pin hand-off, fare calculation (including intercity 2× surcharge), call deduction, and driver earnings. Produce a filled report at the end.

---

## 1. Test Environment & Pre-conditions

### 1.1 Devices
| Role | Emulator | AVD | App |
|---|---|---|---|
| **Rider** | `emulator-5554` | Medium_Phone | `com.ride.bd` |
| **Driver** | `emulator-5556` | Pixel_6a | `com.ride.bd` |

### 1.2 Services running
- **Metro / Expo dev server**: `npx expo start --dev-client` (serves the app + API routes).
- **utils-server (WebSocket dispatch)**: `cd utils-server && npm run dev` → must log `[ws] dispatch server listening on :3001`.
- **Supabase** (Free tier, Tokyo pooler) reachable — verify with health check:
  ```powershell
  (Invoke-WebRequest http://localhost:3001/health -UseBasicParsing).Content
  ```
  Expect `"status":"ok"`.

### 1.3 Test accounts (must already exist & be set up)
| Role | Phone | Password | Notes |
|---|---|---|---|
| Rider | `+8801613249520` | `test1234` | user role `rider` |
| Driver | `+8801700000001` | `test1234` | `drivers.status = active`, `vehicle_type = bike_plus`, has an **active subscription with calls remaining > 0** |

### 1.4 Data pre-conditions (verify before testing)
- **Active zone**: a `zones` row with `is_active = true` whose polygon covers Dhaka (Banani/Gulshan).
- **Pricing**: a `pricing` row for `bike_plus` in that zone, with `per_km_bdt` and `intercity_per_km_bdt` (= 2× per_km) set.
- **Active city boundary**: a `city_boundaries` row `is_active = true` named "Dhaka" whose polygon contains Banani but **not** Savar (so Savar dropoff = intercity).
- **No active rides** for the rider (otherwise "you already have an active ride"). Clean up if needed:
  ```sql
  update rides set status='cancelled', cancel_reason='test_cleanup'
  where status in ('pending','dispatching','matched','driver_arriving','driver_arrived','in_progress');
  ```
- **Emulator GPS** set to a Dhaka point for both devices (so pickup/driver location is in-zone):
  ```powershell
  adb -s emulator-5554 emu geo fix 90.4125 23.8103
  adb -s emulator-5556 emu geo fix 90.4125 23.8103
  ```
  (`geo fix` takes **longitude latitude** order.)

### 1.5 Known caveats (do not file as bugs unless they regress)
- **Map rendering on emulator**: the emulator uses software GL (SwiftShader). MapLibre may render slowly or briefly blank. If the map is blank but the rest of the flow works, note it but continue. Reliable map rendering requires a **physical device**.
- **OTP login**: by default OTP is sent via dpRelay SMS. **In this dev environment `DEV_OTP_BYPASS=true` is enabled** — any phone's OTP is the fixed code **`123456`** (configurable via `DEV_OTP`). No SMS needed. If a session is already active (app not killed), login can be skipped.
- **WebSocket session architecture**: the WS is currently owned by the Home screen (not a session provider). The fixes in this build keep it persistent across screens; do not navigate the driver away from the Home→ride screens out of order.

---

## 2. Test Route
- **Pickup**: Banani, Dhaka (in-zone, inside Dhaka city boundary).
- **Dropoff**: Savar Cantonment Zoo Road, Savar (intercity, ~30 km).
- **Vehicle**: Bike Plus.
- **Expected fare**: ~৳523 (base ৳25 + inside-km × per_km + outside-km × 2× per_km). The exact value depends on the route split; confirm it is **> ৳0** and that the **intercity (outside) portion is charged at double** the per-km rate.

---

## 3. Phase-by-Phase Test

> Convention: **[R]** = Rider device (5554), **[D]** = Driver device (5556). Each step lists: **Screen → What you see → Action → Expected result → Verify**.

---

### Phase A — Login (both devices)

#### A1 [R][D] Launch app
- **See**: Splash → **Phone Entry** screen ("Ride", "Your ride, your way", phone field, Rider/Driver toggle, Login/Register).
- **Action**: none yet.

#### A2 [R] Rider login
- **Action**: enter `+8801613249520`, select **Rider**, tap **Login**.
- **See**: OTP verification screen.
- **Coordination**: obtain the OTP sent to `+8801613249520` (SMS via dpRelay). Enter the 6-digit OTP, tap **Verify**.
- **Expected**: navigates to **Rider Home** ("Welcome, …", map, "Search destination…").
- **Pass**: Rider Home visible.

#### A3 [D] Driver login
- **Action**: enter `+8801700000001`, select **Driver**, tap **Login**, enter OTP, **Verify**.
- **Expected**: navigates to **Driver Home** ("Driver", map, "Calls Remaining: N", a **Go Online / Go Offline** button).
- **Pass**: Driver Home visible, calls remaining > 0.
- **Verify (DB)**: `select status, vehicle_type, is_online from drivers where ...` → `status=active, vehicle_type=bike_plus`.

> If either app is already logged in (session persisted), skip to the next phase.

---

### Phase B — Driver goes online  [D]

#### B1 [D] Go Online
- **Screen**: Driver Home.
- **Action**: tap **Go Online**.
- **See**: button flips to **Go Offline**; header shows **"Connected"**.
- **Verify (server)**: utils-server log shows `[ws] auth:hello success { role: 'driver' }`.
- **Verify (health)**: `/health` → `connected_drivers >= 1`, `h3_index.drivers_indexed >= 1`.
- **Pass**: driver is connected + indexed.

---

### Phase C — Rider requests the ride  [R]

#### C1 [R] Open search
- **Screen**: Rider Home.
- **Action**: tap **"Search destination…"**.
- **See**: "Where do you want to go?" + a search input.

#### C2 [R] Enter destination
- **Action**: type **Savar** in the search box.
- **See**: Barikoi autocomplete results (e.g. "Savar Cantonment Zoo Road, Savar Union, Savar, Dhaka").
- **Action**: tap the **Savar Cantonment Zoo Road** result.

#### C3 [R] Set pickup
- **Screen**: Ride setup ("From" / "To" / **Find now**).
- **See**: "To" = Savar; "From" empty.
- **Action**: tap **Use Dhaka Center** (or set pickup to the current/Banani location).
- **See**: "From" populated with a Dhaka address.

#### C4 [R] Get estimate
- **Action**: tap **Find now**.
- **See**: estimate screen with vehicle options.
- **Action**: select **Bike Plus**.
- **See**: fare estimate (~৳523), distance (~30 km), ETA.
- **Verify**: fare is non-zero; if intercity split is shown, outside-km is charged at double the per-km rate.

#### C5 [R] Confirm & request
- **Action**: tap **Confirm Ride**, then **Request Ride**.
- **See**: transitions to **final-page → "Finding your ride…"** with a spinner and a **Cancel Request** button.
- **Verify (DB)**: a new `rides` row, `status` moves `pending → dispatching`; `dispatch_offers` row created with `outcome='delivered'` for the driver.
- **Pass**: rider on "Finding…".

---

### Phase D — Driver receives offer & accepts  [D]

#### D1 [D] Offer popup
- **Screen**: Driver Home.
- **See**: **Ride Offer sheet** slides up — title "New Ride Offer", countdown ring, rider first-name, **fare (৳…)**, distance, pickup/dropoff addresses, **Decline** / **Accept** buttons.
- **Pass**: popup appears within a few seconds of C5. (If it does **not** appear, this is a **FAIL** — the #1 regression to watch for: a downstream screen overwriting the WS `onmessage`.)

#### D2 [D] Accept
- **Action**: tap **Accept**.
- **See**: sheet animates out; navigates to **find-customer** screen (pickup/destination + a green **"Slide to Confirm Arrival"** bar).
- **Verify (DB)**: `rides.status = matched`; `start_pin` is set (4-digit); `subscriptions.calls_remaining` **decremented by 1** (fetch:confirm deduction).
- **Pass**: driver on find-customer; call deducted.

---

### Phase E — Rider sees the match & PIN  [R]

#### E1 [R] Driver Found
- **Screen**: final-page.
- **See**: flips from "Finding…" to **"Driver Found!"** (or "Arriving in X min"), driver name + vehicle, **and a Ride Pin card** ("Tell your driver your Ride Pin" + a 4-digit code, e.g. `4 2 7 1`). Map should now show the driver marker.
- **Action**: **read the 4-digit PIN aloud** (this is the value the driver will enter in Phase F).
- **Verify (DB)**: `rides.start_pin` matches the PIN shown.
- **Pass**: rider sees driver info + PIN.

> ⚠️ **Map note**: if the map area is blank, that's the emulator software-GL limitation — continue. The driver marker + PIN card are the pass criteria.

---

### Phase F — Driver arrives & starts (Ride Pin)  [D] + [R]

#### F1 [D] Confirm Arrival
- **Screen**: find-customer.
- **Action**: drag the **"Slide to Confirm Arrival"** handle all the way to the right.
- **See**: navigates to the **Ride Pin** screen (title "Ride Pin", a 4-digit input, **Start Ride** button).
- **Verify (DB)**: `rides.status = driver_arrived`, `arrived_at` set.
- **Verify [R]**: rider screen updates — "driver arrived" indication (status banner changes).
- **Pass**: arrived_at is set; rider notified.

#### F2 [D] Enter the Ride Pin
- **Screen**: Ride Pin.
- **Coordination**: enter the **4-digit PIN read from the rider screen (E1)** into the driver's pin input.
- **Action**: type the PIN, tap **Start Ride**.
- **See**: button shows "Starting…", then navigates to **finish-ride** (dropoff details + **"Slide to Confirm Drop-off"**).
- **Verify (DB)**: `rides.status = in_progress`, `started_at` set.
- **Verify [R]**: rider screen shows the **"🚗 Ride in progress — On the way to your destination"** banner; driver card title = "On the way".
- **Pass**: ride in_progress on both sides.

> If the driver enters a wrong PIN, they should see "Incorrect Ride Pin. Ask your rider and try again." and stay on the screen — verify this once intentionally.

---

### Phase G — Driver completes the drop-off  [D]

#### G1 [D] Confirm Drop-off
- **Screen**: finish-ride.
- **Action**: drag the **"Slide to Confirm Drop-off"** handle to the right.
- **See**: a **"Ride Completed ✅"** summary (Total Fare ৳…, Distance, Duration), then returns to **Driver Home**.
- **Verify (DB)**: `rides.status = completed`, `completed_at` set.
- **Pass**: ride completed; driver back on Home.

---

### Phase H — Verify completion on both sides  [R] + [D]

#### H1 [R] Ride Complete
- **Screen**: final-page.
- **See**: **"Ride Complete!"** with the **total fare (৳523…)** — must be **non-zero**.
- **(Optional)**: if a **Rating** screen appears, select 5 stars and submit; if no rating screen, skip.
- **Pass**: fare shown and > 0.

#### H2 [D] Earnings updated
- **Screen**: Driver Home.
- **See**: "Today" earnings now reflect the completed fare (e.g. ৳523), and "Calls Remaining" decremented.
- **Verify (API)**: `GET /api/driver/calculate-price` (with driver bearer token) → `totalEarnings` ≈ the ride fare, in **taka** (not paisa).
- **Pass**: earnings > 0 and correct.

---

## 4. Verification Matrix (quick DB checks)

Run these via the Supabase SQL editor or a `postgres` probe (DATABASE_URL from `utils-server/.env`):

| Check | Query | Expected |
|---|---|---|
| Ride lifecycle | `select status, matched_at, arrived_at, started_at, completed_at, start_pin from rides order by created_at desc limit 1;` | `completed`; all four timestamps set; `start_pin` 4-digit |
| Offer delivered | `select outcome from dispatch_offers where ride_id = <id>;` | `accepted` |
| Call deducted | `select calls_remaining from subscriptions where driver_id = <drv>;` | decremented by 1 vs. pre-test |
| Fare stored | `select fare_breakdown->>'total_bdt' from rides where id = <id>;` | > 0 (paisa); `is_intercity=true`, `outside_charge` = 2× rate |
| Driver earnings | `GET /api/driver/calculate-price` | `totalEarnings` ≈ fare (taka) |

utils-server log keywords to confirm (in order): `auth:hello success { role: 'driver' }`, `auth:hello success { role: 'rider' }`, and **no** `CONNECT_TIMEOUT` / `unknown_type` errors.

---

## 5. Failure Triage (most likely → least)

| Symptom | First thing to check |
|---|---|
| Driver **no offer popup** after rider requests | DB `dispatch_offers.outcome` (delivered?) → if delivered but no popup, a screen overwrote `ws.onmessage` (the known regression). Reload both apps. |
| Rider **stuck on "Finding…"** after driver accepts | Rider WS not registered → check utils-server log for `auth:hello success { role: 'rider' }`. If missing, rider auth message isn't firing. |
| `arrived_at` stays null after sliding Arrival | Driver WS dropped the `ride:arrived` message (or driver navigated before auth). Check the driver stayed on Home→ride screens. |
| Start button stuck on "Starting…" | `ride:start` message format / WS — check server log for the `ride:start` handler. |
| "already have an active ride" | A previous ride is stranded; run the cleanup SQL in §1.4. |
| Map blank | Emulator software-GL; verify on a physical device before filing. |
| Fare shows ৳0 / "–" | `rides.fare_breakdown.total_bdt` in DB; if present, the rider `activeRide` wasn't seeded (confirm-ride). |

---

## 6. Cleanup (after each run)
```sql
update rides set status='cancelled', cancel_reason='test_cleanup'
where status in ('pending','dispatching','matched','driver_arriving','driver_arrived','in_progress');
```
Reset the driver's calls if needed via the admin/packages tooling.

---

## 7. Test Report (fill in)

```
Test run date/time : ____________________
Build / commit     : ____________________
Tester             : ____________________

Phase A (Login)            : PASS / FAIL  ─ notes:
Phase B (Driver online)    : PASS / FAIL  ─ connected_drivers=___
Phase C (Rider request)    : PASS / FAIL  ─ ride id: __________
Phase D (Offer + accept)   : PASS / FAIL  ─ calls_remaining: ___ → ___
Phase E (Rider match+PIN)  : PASS / FAIL  ─ PIN shown: ____
Phase F (Arrive + Pin→Start): PASS / FAIL ─ arrived_at set? Y/N  in_progress? Y/N
Phase G (Drop-off complete): PASS / FAIL  ─ completed_at set? Y/N
Phase H (Fare + earnings)  : PASS / FAIL  ─ fare ৳____  earnings ৳____

Ride Pin (rider→driver)    : PASS / FAIL
Intercity 2× applied       : PASS / FAIL  ─ outside_charge vs per_km
Map rendered               : FULL / PARTIAL / BLANK  (emulator caveat)
Bugs found                 :
```

---

## 8. Notes for a vision-AI tester
- You can drive the emulators with **Maestro** (`maestro_run` / `maestro_inspect_screen`) for taps and reading the text hierarchy — useful for the single-device phases. But the **PIN hand-off** (read PIN on the rider, type on the driver) and the **OTP** are easiest done by a human or a vision model that can see both screens.
- The screen element you can rely on for taps: visible **text** (e.g. `tapOn: "Accept"`, `tapOn: "Request Ride"`). Slides require a coordinate drag — use Maestro `swipe` across the slide handle bounds, or do it manually.
- If you re-deploy code, ask the operator to **reload via Metro `r`** (not `killApp`, which logs the apps out).
