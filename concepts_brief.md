# Brainstorm Brief: Peer-to-Peer MFS Assistance, Dispatch Messaging, and Core Tracking Rulings

* **Author:** Zia / Antigravity
* **Date:** 2026-11-02
* **Status:** In-Progress Brainstorm (Step 1: Clarification & Stress-Testing)
* **Topics:**
  1. Peer-to-Peer (P2P) MFS Assistance at Drop-off (Zero Escrow / Zero Custody)
  2. Reassuring Dispatch Stage Messaging in `finding-driver`
  3. Authoritative Core Tracking Architecture Rulings (Adopted in Plan 28 v3.2)

---

## 1. Feature 1: Peer-to-Peer MFS Assistance at Drop-Off

### 1.1 Problem Statement & Context
In Bangladesh, passengers frequently lack exact physical cash at trip end and negotiate to pay via bKash or Nagad. Today, this process creates severe friction:
1. The driver recites an 11-digit mobile number aloud in loud traffic.
2. The passenger manually types the number into their bKash/Nagad app, reads it back to confirm the driver's name, enters the fare, and enters their PIN.
3. Both parties wait 30–90 seconds for cellular SMS confirmation before parting ways, blocking roadside traffic.
4. Any mistyped digit results in funds being sent to a random stranger, triggering immediate customer distress.

### 1.2 Proposed Technical Architecture (Preserving Zero Custody)
* **Driver Configuration:**
  * Drivers register their primary personal MFS provider (`bKash`, `Nagad`, `Rocket`) and personal wallet number in their driver profile.
  * Defaults to their authenticated login phone number if not overridden.
* **Rider Drop-Off UI (`app/(main)/(customer)/ride-tracking/[ride_id].tsx`):**
  * When the ride enters drop-off / fare settlement, the rider screen displays a payment method selector: `[ Cash ]` vs `[ bKash / Nagad ]`.
  * If `[ bKash / Nagad ]` is selected:
    * Displays the driver's MFS provider logo and verified phone number.
    * A **"Copy Number"** button to eliminate manual typing errors.
    * A dynamically generated **MFS QR Code** encoding the driver's personal wallet number and the exact payable BDT fare.
    * The rider scans the QR code directly inside their bKash or Nagad app, which pre-populates the recipient number and fare amount in the Send Money screen.
* **Zero Escrow Invariant:**
  * The transaction occurs 100% peer-to-peer between the rider's wallet and the driver's wallet.
  * Ride backend **never handles, routes, or holds** passenger fare money.
  * The driver confirms receipt on their device (`finish-ride/index.tsx`) by sliding "Payment Received (MFS)", completing the ride state machine.

### 1.3 Critical Stress-Testing & Counter-Arguments
1. **Send Money Telecom Fee:**
   * Sending money between personal bKash/Nagad accounts incurs a 5 BDT transaction fee (unless configured as a favorite number). Will riders complain if they pay 5 BDT extra on top of the fare?
2. **MFS Network Delay vs. Driver Distrust:**
   * During peak evening hours, bKash/Nagad SMS notifications often experience 1–3 minute network delivery delays on local mobile operators (Grameenphone, Banglalink, Robi). If the rider shows their phone screen ("Transaction Successful") but the driver's phone has not yet received the SMS, drivers frequently refuse to let riders exit.
3. **Number Entry Error Risk at Onboarding:**
   * If a driver mistypes their MFS number in profile settings, riders will send real money to an incorrect party. The driver onboarding flow must enforce verification (e.g., matching the registered driver KYC SIM or requiring a confirmation re-entry).

---

## 2. Feature 2: Transparent Dispatch Stage Messaging

### 2.1 Problem Statement & Context
In `app/(main)/(customer)/finding-driver/index.tsx`, when a ride request is dispatched:
1. The screen renders a generic pulsing radar animation.
2. If Driver 1 declines or times out (15s timer), the sequential dispatch chain expands rings and offers to Driver 2 and Driver 3.
3. The rider receives zero feedback about this background progress. After 15–20 seconds of an unresponsive radar pulse, riders assume the app is stuck and cancel the request.

### 2.2 Proposed Technical Architecture
* **Client-Side or WebSocket Stage Indicators:**
  * Replace the static text ("Looking for nearby drivers...") with dynamic, informative stage transitions:
    * **0–15s:** *"Checking with nearest drivers in [Zone/Neighborhood]..."*
    * **15–45s:** *"Expanding search to nearby [Vehicle Type]s (2–3 km)..."*
    * **45–90s:** *"Connecting with active drivers in wider area..."*
    * **90–120s:** *"High demand nearby; finalizing search options..."*
* **Option A (Pure Client Heuristic):** Driven by elapsed search timers in `finding-driver/index.tsx` using the known pickup zone name from `useRiderStore`. Requires 0 WebSocket protocol changes.
* **Option B (Server WebSocket Event):** `utils-server/dispatch.ts` emits a lightweight `ride:dispatch_stage` event whenever the H3 ring expands (`k_ring: 1 -> 2 -> 3`).

### 2.3 Critical Stress-Testing & Counter-Arguments
1. **Perceived ETA Anxiety:**
   * If the UI explicitly says *"Expanding search to 3 km"*, riders may anticipate a 10–15 minute pickup wait and cancel immediately to try another app, whereas a generic message might have kept them waiting.
2. **Exposing Supply Scarcity:**
   * Revealing too much dispatch telemetry exposes low platform driver density in cold zones. Messaging must communicate activity and diligence without signaling desperation or empty roads.

---

## 3. Core Architecture Rulings (Adopted in Plan 28 v3.2)

### Ruling 1: Public Web Tracking Screen (`app/track/[rideId].tsx`)
* **Decision:** **Option A (Dedicated Live Status & Safety Card)**
* **Rationale:** `@maplibre/maplibre-react-native` stubs to `null` on web builds (`utils/maplibreLoader.web.ts`). Attempting to render native map components on web falls back to a broken gray box. Re-scoping the web page to a responsive mobile-first Live Status Card provides full reassurance (driver photo, vehicle plate, journey addresses, live status pill, GPS freshness age, and a 1-tap 999 police button) without bundle bloat or broken canvas stubs.

### Ruling 2: Driver GPS Capture Scope (`finish-ride/index.tsx`)
* **Decision:** **Option A (Foreground-Only Capture with High Accuracy)**
* **Rationale:** `Location.watchPositionAsync` in React Native Expo operates while the app is in the foreground. True headless background execution requires `expo-task-manager` (uninstalled) and complex native socket bridging. In Bangladesh, drivers keep their phones mounted on the vehicle dashboard with the Ride screen active during trips. Precision is restored to `Location.Accuracy.High` (5–10m resolution) for sharp corridor deviation detection.

---

## 4. Goals vs. Non-Goals

### In-Scope Goals
* Design a frictionless, error-free peer-to-peer MFS QR and copy flow at drop-off that adheres strictly to Zero Custody.
* Design reassuring, multi-stage dispatch status copy in `finding-driver` to reduce premature rider cancellations.
* Build a responsive Mobile-Web Live Status & Safety Card on `app/track/[rideId].tsx` with live signal freshness and emergency 999 dialing.
* Maintain high-accuracy foreground telematics in `finish-ride/index.tsx`.

### Out-of-Scope Non-Goals
* On-platform digital fare collection, escrow wallets, or payment gateway routing (strictly rejected).
* Automated verification of personal bKash/Nagad transaction IDs (requires merchant API access which violates zero custody and incurs merchant discount rates).
* Headless background GPS collection via `expo-task-manager`.
