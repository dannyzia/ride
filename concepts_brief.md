# Ride Safety & Documentation: WhatsApp Sharing, Post-Ride Email Receipts, and SOS Compliance

* **Author:** Zia / Antigravity
* **Date:** 2026-11-02
* **Status:** Working Hypothesis Refinement

## Overview

This specification unifies passenger safety sharing, post-trip documentation, and statutory emergency response into three cleanly decoupled subsystems:
1. **Rider-Initiated Live Ride Sharing:** Simple 1-tap WhatsApp dispatch sharing real-time tracking during active trips at zero platform cost.
2. **Post-Trip Email Documentation:** Asynchronous receipt and trip summary email (bill, route overview, vehicle details) sent upon ride completion for documentation and corporate reimbursement.
3. **Statutory 999 SOS & Platform-Funded Distress SMS:** Instant native 999 cellular dialing backed by automated backend distress SMS with GPS coordinates broadcast to emergency contacts.

---

## Analysis & Architectural Alignments

### 1. Live Ride Sharing via WhatsApp (Rider-Initiated)
* **Execution:** Tapping "Share via WhatsApp" on the active tracking screen (`app/(main)/(customer)/ride-tracking/[ride_id].tsx`) opens WhatsApp with a pre-filled, localized string:
  > *"I am on a Ride trip with [Driver Name] ([Vehicle Model], Plate: [Plate Number]). Track my ride live: https://ride.com.bd/track/[ride_id]"*
* **Security & Privacy (P1-17 Invariant):** The public tracking URL displays real-time driver coordinates and moving car marker *only while the ride is active*. Once the ride transitions to `completed` or `cancelled`, the public link strictly degrades to a status-only receipt with coordinates nulled.
* **Cost & Friction:** 0 BDT platform gateway cost; zero dependency on third-party WhatsApp Business API; rider maintains full autonomy over which contact or group receives the link.

### 2. Post-Trip Email Documentation (Uber-Style Trip Receipts)
* **Trigger:** Fired asynchronously upon ride completion (`POST /api/ride/[id]/complete`).
* **Recipient:** Sent to the rider's registered email (`users.email`). If `users.email` is absent, the dispatch gracefully skips with zero disruption.
* **Content:**
  * Trip Bill: Fare breakdown, payment method (cash / MFS), base fare, distance fee, and discounts applied.
  * Trip Details: Date, start time, end time, pickup location name, dropoff location name.
  * Vehicle & Driver: Driver name, rating, vehicle model, plate number.
  * Route Snapshot: Static map image or link to in-app route history.
* **Delivery Infrastructure:** Uses a lightweight transactional email provider (e.g. Resend or standard SMTP) via an isolated background queue that never blocks the ride completion HTTP response.

### 3. Statutory Emergency Response & Distress SMS
* **Local Law (999 Mandate):** "DIAL FIRST (T-1)" rule is enforced on the SOS screen (`app/(main)/(customer)/emergency-sos/index.tsx`). Tapping SOS immediately launches `tel:999` via the cellular dialer, guaranteeing emergency connection even without mobile data.
* **Platform-Funded Distress SMS:** `POST /api/sos/alert` sends distress SMS messages via `sendSmsSos` to all registered `user_emergency_contacts`:
  > *"Emergency SOS! [Rider Name] needs help. Location: [lat],[lng]. Track: https://ride.com.bd/track/[ride_id]"*
* **Cost Allocation:** Platform absorbs the ~0.35 BDT SMS gateway fee per contact as an operational safety obligation. Distress events are rare (<0.01% of rides), keeping monthly costs negligible.

### 4. In-Progress GPS Breadcrumbs & In-App Route Playback
* **Telematics Loop:** Emitted every 5 seconds over WebSocket by `finish-ride/index.tsx`, buffered purely in-memory in `utils-server/breadcrumbs.ts`, eliminating hot-path relational database queries.
* **Storage Model:** Persisted upon ride completion as a single compact record in `ride_routes` (`points JSONB`), cutting database row churn by 99.7% (~1,000 rows/day vs 240,000 rows/day) and eliminating connection pool starvation on Postgres.
* **Security:** `ride_routes` is protected with `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and `REVOKE ALL FROM anon, authenticated`.
* **In-App Display:** Authenticated riders and drivers can review the exact route polyline driven on the customer history detail screen (`history-detail/index.tsx`) via MapLibreGL with bounding camera.
* **Retention:** 30-day automated purge (Scheduler Job 61) using a bounded subquery, with safety holds protecting routes associated with active `sos_alerts` or unresolved `fare_disputes`.

---

## Goals vs. Non-Goals

* **In-Scope Goals:**
  * 1-tap WhatsApp deep link for active trip sharing.
  * Post-ride receipt email generation and dispatch for users with registered email addresses.
  * Instant 999 native cellular dialing on SOS tap.
  * Platform-funded distress SMS broadcast to emergency contacts on SOS.
  * In-progress in-memory telematics ingestion buffer, compact single-record route storage, and authenticated in-app route polyline display.

* **Out-of-Scope Non-Goals:**
  * Routine match-time SMS notifications for non-emergency trips.
  * Server-side automated WhatsApp Business API messaging.
  * Mandatory email collection during initial phone OTP onboarding.
  * VoIP / SIP in-app voice calling (native cellular `tel:` only).

---

## Alternatives Weighed

1. **Email for Real-Time Emergency Alerts:**
   * *Rejected.* Email latency (5–15 minutes) and spam filters make it dangerous for active emergency tracking. WhatsApp and SMS are immediate.
2. **Automated Server-Side WhatsApp Dispatch:**
   * *Rejected.* Requires Meta Business verification and per-template fees (~$0.03/msg). User-initiated WhatsApp sharing is zero-cost and preserves rider control.
3. **Real-Time GPS Trail on Public Tracking Link Post-Ride:**
   * *Rejected.* Violates P1-17 security invariant. Public links must never expose historical home/work locations after a trip ends. Replay is strictly authenticated inside the mobile app.

---

## Key Decisions & Staging for Next Steps

1. **Email Receipts:** Add optional email field prompt in customer profile settings ("Add email to receive ride receipts") and hook receipt generation to ride completion.
2. **WhatsApp Button:** Embed 1-tap share button in `ride-tracking/[ride_id].tsx`.
3. **Proceed to Formal Goldfish Review:** Validate the complete architecture across the 6 specialized review lenses (Design, Codebase Details, Zoom-Out/YAGNI, Comprehension, Implementation Readiness, Structural).
