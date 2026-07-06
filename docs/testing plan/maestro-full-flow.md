Prompt for Maestro Test Agent
Context:
The Ride mobile app (Expo Android) is ready for end‑to‑end testing. You have access to the Maestro MCP (Model Context Protocol) – a mobile automation framework that runs .yaml flow files against a connected Android emulator or physical device. All UI identifiers (testID, accessibilityLabel, or resource-id) match the screens defined in 08-UI-SPEC.md.

Your task: Write and execute 5 granular Maestro test suites that cover the entire app lifecycle. Do not write one giant monolithic test. Each part must be a separate .yaml file that can run independently (so failures in one do not block the others).

## ⚠️ Build-specific notes (2026-07) — READ FIRST

1. **Two devices are required for the ride loop.** Rider = `emulator-5554`, Driver = `emulator-5556`, app id `com.ride.bd`. Maestro runs **one device at a time**, so the core ride loop (Parts 3 + 4) **cannot be a single YAML** — it needs cross-device coordination (rider requests, driver accepts, **Ride Pin hand-off**). For Parts 3 + 4, follow the **manual plan** (`manual-testing-full-flow.md`) instead of (or alongside) Maestro. Reserve Maestro for the single-device flows: Part 1 (auth), Part 2 (onboarding), Part 5 (edge cases).
2. **Ride Pin (new).** When a driver accepts, the rider is shown a 4-digit PIN. The driver enters that PIN (read off the rider screen) on the **Ride Pin** screen and taps **Start Ride** to begin the trip. There is no 60-second auto-start button in the UI path.
3. **Arrival / drop-off are slides, not taps.** "Slide to Confirm Arrival" (→ `ride:arrived`) and "Slide to Confirm Drop-off" (→ `ride:complete`). Implement with Maestro `swipe` across the handle bounds, or do these manually.
4. **WebSocket messages use the colon form.** The server parses the action from `type.split(":")`. Valid types: `ride:status`, `ride:arrived`, `ride:start`, `ride:complete`, `location:update`, `auth:hello`. (The old `ride:matched` is now `ride:status { status: "matched" }`.)
5. **OTP login** uses dpRelay SMS — the OTP must be read from the target phone's SMS inbox; it is not predictable and cannot be hard-coded.
6. **Test route:** pickup Banani (Dhaka), dropoff Savar (intercity), vehicle **Bike Plus** (the test driver is `bike_plus`). Expected fare ≈ ৳523 with the outside-Dhaka portion at 2× per-km.

Info Needed: 

Existing Rider: 
+8801613249520
Password: test1234

Existing Driver: 
+8801700000001
Password: test1234

Part 1: Authentication Flow (auth-flow.yaml)
Scope: Full sign‑up / login path for both Rider and Driver.

Steps:

Launch the app → Verify the splash screen transitions to the Phone Entry screen (Screen 1).

Phone Entry:

Enter +8801613249520 (the test rider number).

Select role: "I'm a Rider".

Tap Send Code.

Wait for the OTP screen.

OTP Verification:

Informa the user for OTP receipt and let you know the OTP. 

Tap Verify.

Registration (New User):

Verify navigation to /register.

Enter Test Rider as name.

Tap Create Account.

Verify navigation to the Rider Home screen (app/(main)/(customer)/).

Logout & Driver Login:

Navigate to Account → Logout.

Repeat steps 2–4 but select "I'm a Driver" and verify navigation to Driver Home (app/(main)/(rider)/).

Assert: Driver sees the Call Wallet card (0 calls).

Failure criteria:

App stuck on splash.

OTP screen does not auto‑advance.

Wrong role home screen loads.

Part 2: Driver Onboarding Flow (driver-onboarding.yaml)
Scope: Complete the entire multi‑step onboarding (vehicle registration, driver profile, owner consent) and submit for admin approval.

Pre‑condition: Test driver is pending (status = pending) and has no vehicle registered.

Steps:

Open Driver Home → because status = 'pending', the DriverStatusGuard should render the Upload Documents screen.

Step 1 – Vehicle Registration:

Enter Brand: Toyota.

Enter Model: Axio.

Enter Year: 2020.

Confirm the auto‑suggestion (car_comfort).

Select Registration Area → DHAKA_METRO.

Select Vehicle Class Letter → GA.

Enter Registration Number: 123456.

Enter Vehicle Registration Date: 2023-01-01 (valid, >1 year ago).

Upload dummy images for:

BRTA Certificate

Registration Scan (front/back)

Fitness Scan

Tax Token Scan

6 Vehicle Photos (front/left/right/rear/dashboard/seats)

1 Walkaround Video (15s dummy).

Tap Next.

Step 2 – Driver Registration:

Enter Address: Dhaka, Bangladesh.

Enter Driving License Number: DL-123456.

Upload License Scan (front/back).

Take a Driver Photo (use dummy test.png).

Tap Next.

Step 3 – Owner Consent:

Toggle "I own this vehicle" → true.

Optional: tick Legacy Operator and upload dummy screenshot.

Tap Submit.

Post‑Submit:

Verify the success screen: "Application submitted!".

Verify driver status becomes 'pending' (or 'temporary' if consent is auto‑approved in dev).

Admin Approval (Manual or API Hook):

For E2E completion, after step 4, call the admin API directly to approve the driver (POST /api/admin/driver/approve) so the test can continue to buying packages. (Or mock the admin panel response).

Failure criteria:

Auto‑classification fails (vehicle type not pre‑filled).

Photo uploads time out.

Owner consent validation blocks submission.

Part 3: Driver Core Loop (driver-core.yaml)
Scope: Package purchase → Go Online → Receive an offer → Accept → Navigate → Arrive → Complete.

Pre‑condition: Driver is active (status='active') and has 0 calls.

Steps:

Buy Micro‑trial Package:

Open Driver Home → Tap Buy Calls (Screen 5).

Select the Micro Trial package.

Tap Proceed to Payment.

Payment: Use the PortPos sandbox test card or bypass payment via a test environment flag (if available) – the flow should open a WebView and succeed.

Poll GET /api/package/active until status='active'.

Verify Driver Home now shows Calls remaining: 5.

Go Online:

Toggle Online switch.

Verify WebSocket connection establishes (check logs or UI status).

Verify drivers.is_online = true in DB.

Trigger a Ride Request (Rider side or API):

Use the Rider app (or direct POST /api/ride/request) to create a ride with vehicle_type = 'bike_plus' (the test driver's type) and pickup within the active zone.

Receive & Accept Offer:

Wait for the ride:offer WebSocket event.

Verify UI: the Ride Offer sheet appears — countdown ring, rider name, fare (৳…), distance, pickup/dropoff addresses, plus Decline / Accept buttons.

Tap Accept. (Sends fetch:confirm → call deduction, then offer:accept.)

Verify call deduction: subscriptions.calls_remaining decrements by 1.

Verify rides.status = 'matched' and rides.start_pin is set (4-digit).

Navigate to Pickup (find-customer):

Verify the find-customer screen shows pickup/destination and a green "Slide to Confirm Arrival" bar.

Slide "Confirm Arrival" → sends ride:arrived.

Verify rides.status = 'driver_arrived', arrived_at set; the rider is notified.

Ride Pin → Start:

On the Ride Pin screen, enter the 4-digit PIN that the rider reads aloud (= rides.start_pin), then tap Start Ride → sends ride:start.

On success, rides.status = 'in_progress', started_at set; the rider screen shows the "Ride in progress" banner.

(Note: the rider must read the PIN off their own screen — this cross-device hand-off is why the core loop is best run manually; see manual-testing-full-flow.md.)

Complete Ride (finish-ride):

Slide "Confirm Drop-off" → sends ride:complete.

Verify rides.status = 'completed', completed_at set.

Verify fare_breakdown.total_bdt > 0.

Verify Driver Home reflects updated earnings and decremented calls.

Failure criteria:

WebSocket connection fails.

fetch:confirm does not trigger deduction.

Map route does not render.

Completion does not update driver earnings.

Part 4: Rider Core Loop (rider-core.yaml)
Scope: Rider requests a ride, sees driver location, cancels (or completes) and rates.

Pre‑condition: Rider is logged in, has no active ride.

Steps:

Open Rider Home (Screen 8A).

Set Pickup/Dropoff:

Use Barikoi Places autocomplete to enter Dhaka as pickup.

Enter Gazipur as dropoff (intercity trigger).

Verify the route polyline draws on the map.

Select Vehicle & Fare Estimate:

Expand the Bottom Sheet (Screen 8B).

Verify all 8 vehicle options are displayed with estimates.

Select Bike Plus (matches the test driver's vehicle_type).

Verify intercity split: Fare breakdown shows inside_km and outside_km, plus a badge "Intercity (From Dhaka)".

Confirm Ride:

Tap Confirm Ride.

Verify rides.status = 'pending' (then dispatching).

Verify the "Finding your driver…" pulse animation appears (Screen 8B finding state).

Tracking (Driver matched):

Wait for the ride:status WebSocket event with status "matched" (carries driver info + the ride PIN).

Verify the Rider sees: driver name + vehicle, the Ride Pin card ("Tell your driver your Ride Pin" + a 4-digit code), and the driver marker on the map.

Read the PIN — the driver will enter it on their device.

When the driver slides "Confirm Arrival", verify the rider shows a "driver arrived" indication.

When the driver enters the PIN and taps Start Ride, verify status = 'in_progress' and the "🚗 Ride in progress" banner appears; the driver card title becomes "On the way".

Completion:

When the driver slides "Confirm Drop-off", verify the rider shows "Ride Complete!" with the total fare (> 0).

If a Rating screen appears, select 5 stars and Submit; otherwise the rider returns to Home.

Failure criteria:

Intercity split does not show outside‑city rate.

Driver location does not update in real‑time.

Rating screen fails to load.

Part 5: Edge Cases & Settings (edge-cases.yaml)
Scope: Cancellations, Minimum Rate slider, Wallet, and SOS.

Steps:

Rider Cancellation (post‑match):

Request a ride.

After match, cancel with reason waiting_too_long.

Verify cooldown warning (if repeated).

Verify ride.status = 'cancelled' and no deduction for rider.

Driver Minimum Rate Slider (Screen 17):

Driver opens Settings → Set minimum per‑km rate.

Move slider to 120% of system rate.

Verify warning: "At this rate, rides with a lower system rate will not be offered to you."

Save.

Verify dispatch: Request a ride with per_km_bdt lower than the driver's minimum → driver should NOT receive the offer (check dispatch_offers.outcome = 'filtered').

Reset to system rate.

SOS Alert (Driver):

Driver taps the shield icon on the home screen.

Verify SOS modal opens (Screen 8F).

Tap Send SOS (without typing a message).

Verify sos_alerts table gets an entry.

Verify the confirmation screen "SOS Sent" appears.

Wallet Top‑Up (Rider) (Screen 23a):

Rider opens Account → Wallet.

Verify balance (defaults to 0).

Tap Top Up.

Enter 500 BDT.

Select payment method (mock/test).

Verify transaction appears in history.

Forced Update (Screen 14):

(Optional) Temporarily set min_app_version to 99.9.9 in system_config.

Restart the app.

Verify the blocking "Update required" screen appears with a download button.

Execution & Reporting
For each part, the agent must:

Write the .yaml file in the maestro/flows/ directory.

Run:

bash
maestro test maestro/flows/<part>.yaml
Capture the output (success/failure) and a video/screenshot on failure.

Report back to the orchestrator with the status of each part.

Final Deliverable
5 Maestro YAML files (auth-flow.yaml, driver-onboarding.yaml, driver-core.yaml, rider-core.yaml, edge-cases.yaml).

A summary report listing which flows passed/failed, with timestamps.

Start with Part 1. Do not proceed to Part 2 until Part 1 is fully green.

