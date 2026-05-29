<!--
AI INSTRUCTIONS
===============
These are the key architectural decisions that diverge from GlideX defaults.
Each ADR explains WHY something was chosen so an AI model does not second-guess or revert the decision.
Do not change a decision recorded here without creating a new superseding ADR.
-->

# Architecture Decision Records: Ride

---

## ADR-001: Replace Clerk with Firebase HMAC Phone OTP

| Field | Value |
|-------|-------|
| Status | **Superseded by ADR-017** |
| Supersedes | GlideX default (Clerk) |

> **⚠️ Superseded:** Clerk was removed; Firebase HMAC flow is now also removed. Replaced by Supabase Auth phone OTP with dprelay as external SMS gateway. See ADR-017.

### Context (Historical)
Bangladesh users authenticate via phone number + SMS OTP. Clerk supports phone auth but not the custom HMAC-signed verification flow required by the PRD. The PRD specified a security model: client sends phone + timestamp + App Check token to a Cloud Function, which computes an HMAC-derived session code server-side, sends the SMS, and writes to RTDB for the app to poll. This prevented SMS spoofing and replay attacks common on Bangladeshi networks.

### Decision (Historical)
Used Firebase Cloud Functions (`startVerification` + `checkAuth`) with HMAC-SHA256 signing. Firebase ID tokens were used for all subsequent API authentication. Clerk was removed entirely.

### Consequences (Historical)
- Firebase Admin SDK replaced `@clerk/express` for token verification in API routes.
- All auth screens rewritten from Clerk flows to phone-entry + polling screens.
- HMAC secret lived in Firebase Cloud Function env only — never in the app bundle.
- **No client-side HMAC signing.** `lib/hmac.ts` was NOT created on the client.
- iOS SMS auto-read was not available in managed Expo workflow; Android BroadcastReceiver handled it.

---

## ADR-002: Replace Stripe with bKash + Nagad

| Field | Value |
|-------|-------|
| Status | **Superseded by ADR-018** |
| Supersedes | GlideX default (Stripe) |

> **⚠️ Superseded:** Direct bKash/Nagad merchant integrations replaced by PortPos aggregation gateway (ADR-018). Old callback files kept as inert fallback.

### Context
Stripe does not support bKash or Nagad, which are the dominant mobile money platforms in Bangladesh. Drivers and riders in Bangladesh do not have international credit cards. All package purchases must go through bKash or Nagad.

### Decision (Historical)
Implement bKash Merchant API (primary) and Nagad Merchant API (secondary) via server-side calls. Payment flow uses a WebView to load the payment gateway URL returned by the API. Stripe and its React Native SDK are removed entirely.

### Consequences (Historical)
- No Google Pay or Apple Pay (Stripe's enableGooglePay plugin config removed from app.config.js).
- Payment UI is a WebView (bKash/Nagad hosted page) not a native sheet — acceptable for Bangladesh market.
- Server must handle idempotency keys, 5-min callback timeout with auto-verify, and `compensation_queue` DB table for persistent activation failure retry.
- `components/Payment.tsx` removed. New `components/PaymentWebView.tsx` added.
- Replaced by ADR-018: PortPos aggregator. bKash/Nagad callback files kept as inert fallback.

---

## ADR-003: Use H3 Hexagonal Grid for Driver Geo-Indexing

| Field | Value |
|-------|-------|
| Status | Accepted |
| Supersedes | None (GlideX had no geo-indexing) |

### Context
PRD requirement 19 explicitly specifies Uber's H3 hexagonal grid. When an exact H3 cell has insufficient drivers, the system expands to adjacent ring steps. H3 provides consistent cell sizes and efficient ring queries compared to bounding-box or Haversine-only approaches.

### Decision
Use `h3-js` npm package. Driver locations are indexed into H3 cells at resolution 9 (~174m diameter) on each heartbeat update. Dispatch queries start at resolution 9, expand to ring-1, ring-2 as needed. Supply-demand heatmap is cached at resolution 7 (~5.16km) every 30 seconds.

### Consequences
- `lib/h3.ts` encapsulates all H3 operations. No other file imports `h3-js` directly.
- WebSocket server maintains an in-memory H3 index map, refreshed from DB every 30s.
- Fallback: if H3 index is empty (cold start), falls back to application-level Haversine distance calculation in `lib/h3.ts` (no PostGIS dependency).

---

## ADR-004: Heartbeat-Gated Call Deduction (not on FCM ACK)

| Field | Value |
|-------|-------|
| Status | Accepted |
| Supersedes | None (GlideX had no call deduction concept) |

### Context
PRD requirement 22: a call is deducted ONLY when the driver's app actively fetches the ride request — either via the heartbeat cycle or by the driver tapping the notification to open the request. FCM delivery acknowledgement alone does NOT trigger deduction. This prevents drivers from being charged for requests their app received but could not display (e.g. device locked, app backgrounded on aggressive OEMs).

### Decision
The WebSocket server starts a 5-second window when a ride offer is broadcast. The window closes with deduction ONLY if the driver app sends a `fetch:confirm` WebSocket message within that window. If the window expires without confirmation, the offer is auto-refunded (no ledger entry written) and SMS fallback is triggered.

### Consequences
- The `fetch:confirm` WebSocket message must be sent by the driver app on the **first user interaction** with the ride offer card — typically when the driver touches the card (swipe handle, card area, or any button). This is NOT on render (which would charge drivers for offers they never saw) and NOT on accept/reject (which is a separate action). The 5-second window starts when the offer is broadcast; `fetch:confirm` must arrive within this window. If the driver never interacts with the card, no `fetch:confirm` is sent and no deduction occurs (AC-2). If the driver interacts (triggering `fetch:confirm`) but does not accept within 15 seconds, the call is refunded (AC-7).
- This requires the driver app to be connected to the WebSocket server and to send the confirmation when the user first touches the offer card.
- Call deduction is an atomic DB transaction: `INSERT call_ledger` + `UPDATE dispatch_offers SET fetch_confirmed_at=now()` in a single transaction. If either fails, the whole operation rolls back (no phantom deduction).
- **Late `offer:accept` without `fetch:confirm` (edge case):** If `offer:accept` is received without a prior `fetch:confirm`: the server treats this as a late confirmation. If still within the 5s deduction window, process as normal. If outside the window, process the accept without deduction (no call charged) — the driver will receive the ride but no call is deducted (edge case acceptable at MVP scale; deduction-less accepts are logged for monitoring).

---

## ADR-005: Separate WebSocket Server (not Expo API routes)

| Field | Value |
|-------|-------|
| Status | Accepted |
| Supersedes | GlideX utils-server (Express only) |

### Context
Expo API routes are serverless-style (stateless, short-lived). WebSocket connections are stateful and long-lived (drivers stay connected for their entire shift). Serverless functions cannot maintain persistent WebSocket connections. The WebSocket server must also maintain the in-memory H3 index.

### Decision
Keep the `utils-server/` Node.js process from GlideX but replace its Express-only internals with a `ws`-based WebSocket server. This process runs alongside the Expo app (local dev) or as a separate service (production). It shares the same PostgreSQL database for call_ledger writes.

### Consequences
- `utils-server/` is no longer an Express email/Stripe helper — it is the core dispatch engine.
- Production deployment: `utils-server/` runs as a separate process (e.g. Fly.io, Railway, or EC2). Not on EAS.
- The WebSocket server URL is a separate env var from the Expo API server URL.
- `EXPO_PUBLIC_WEB_SOCKET_SERVER_URL` already exists in GlideX — keep and point to new server.

---

## ADR-006: Admin Panel as Protected Expo Web Route Group (MVP)

| Field | Value |
|-------|-------|
| Status | Accepted |
| Supersedes | None (GlideX has no admin panel) |

### Context
PRD requires an admin panel for driver approval, KYC review, package management, zone config, and dispute resolution. Building a fully separate React web app adds deployment complexity. Expo Router supports web output; a protected `app/(admin)/` route group can serve the admin panel via the same codebase and same API routes.

### Decision
Add `app/(admin)/` route group with web-only layout. Admin routes check `users.role = 'admin'` server-side on every request. Admin panel is accessible only on web (not rendered in mobile app bundle via platform checks).

### Consequences
- Admin screens are web-only. Mobile app ignores `(admin)` routes.
- Admin authentication uses same Supabase phone auth + JWT, with additional role check.
- If admin panel complexity grows (post-MVP), extract to a separate React app. ADR to be created at that time.

---

## ADR-007: Drizzle ORM for All Schema Changes (no raw SQL migrations)

| Field | Value |
|-------|-------|
| Status | Accepted |
| Supersedes | GlideX default (Drizzle already used — this ADR locks the pattern) |

### Context
GlideX uses Drizzle ORM with `src/db/schema.ts` as the schema definition. All new tables for Ride (packages, call_ledger, subscriptions, documents, zones, pricing, dispatch_offers, compensation_queue, vehicle_type_changes, etc.) must be added to this file and migrated via `npx drizzle-kit push` (dev) or generated migration files (production). **Note:** There is no separate `ratings` table — rider and driver ratings are stored as columns directly on the `rides` table (`rides.rider_rating`, `rides.driver_rating`). See 02-ARCHITECTURE.md component map.

### Decision
All schema changes go through `src/db/schema.ts` + Drizzle migrations. No raw SQL files. No `db.execute(sql`...`)` for schema changes.

### Consequences
- Every new table must be defined in `src/db/schema.ts` with Drizzle table builder syntax.
- Migrations are generated with `npx drizzle-kit generate` and applied with `npx drizzle-kit migrate`.
- Production migrations require human review before running (see 15-RUNBOOK-DEPLOY.md).

---

## ADR-008: Single Dhaka Operational Zone for MVP

| Field | Value |
|-------|-------|
| Status | Accepted |

### Context
PRD explicitly states single Dhaka zone for initial launch. Multi-city is out of scope. However, the zone polygon and pricing must be DB-driven (not hardcoded) so expansion requires only a DB insert, not a code change.

### Decision
Zone polygon and per-vehicle-type pricing are stored in `zones` and `pricing` tables respectively. The system enforces that all ride requests have pickup coordinates inside the active zone polygon. `lib/zone.ts` reads the active zone from DB (cached 5 min).

### Consequences
- No hardcoded Dhaka coordinates anywhere in the codebase.
- Adding a new city = insert a new row in `zones` and `pricing`. No code change needed.
- Zone cache must be invalidated when admin updates zone polygon via admin panel.

---

## ADR-009: Compensation Queue Persisted to Database

| Field | Value |
|-------|-------|
| Status | Accepted |
| Supersedes | In-memory compensationQueue described in earlier architecture |

### Context
The original architecture used an in-memory array for the compensation queue. If utils-server crashes with items in the queue, drivers who paid but were not activated lose their money with no automated recovery. This is a financial data loss scenario.

### Decision
Compensation queue is persisted to a `compensation_queue` database table. The `compensationWorker.ts` polls the table instead of an in-memory array. On utils-server crash, recovery is automatic on restart by querying pending rows.

### Consequences
- `compensation_queue` table added to schema. INSERT happens in the same transaction as `payment_events` status update.
- Worker polls: `SELECT * FROM compensation_queue WHERE status='pending' AND next_retry_at <= now()`.
- After max attempts (10): `status='failed'`, admin alert triggered.
- Replaces the in-memory approach from TD-10.

---

## ADR-010: DB-Based Dispatch Kill Switch

| Field | Value |
|-------|-------|
| Status | Accepted |

### Context
The `DISPATCH_PAUSED` environment variable requires a full utils-server restart to change. In a P1 emergency (double-charging detected), the operator needs to pause dispatch instantly without dropping 5,000 WebSocket connections.

### Decision
`system_config` table stores `dispatch_paused` key. `utils-server/dispatch.ts` reads this value from DB at the top of every dispatch cycle. Admin endpoint `POST /api/admin/dispatch-toggle` flips it instantly. The env var remains as a startup-time fallback.

### Consequences
- `system_config` table added to schema with initial seed rows.
- Change takes effect within one dispatch cycle (< 2 seconds).
- No WebSocket disconnection required.

---

## ADR-011: Google Maps Directions API for Fare Distance

| Field | Value |
|-------|-------|
| Status | Accepted |

### Context
`lib/fareCalc.ts` must compute `distance_km` between pickup and dropoff. This distance drives the per-km charge. Straight-line (Haversine) distance underestimates actual road distance in Dhaka by 20-40%, leading to inaccurate fares and driver earnings discrepancies.

### Decision
Primary distance source: Google Maps Directions API (road distance in km), using a server-side API key (`GOOGLE_MAPS_SERVER_API_KEY`) never exposed to the client. Fallback: Haversine straight-line distance × 1.3 (urban Dhaka road factor) when API is unavailable or over quota.

### Consequences
- New env var `GOOGLE_MAPS_SERVER_API_KEY` required (separate from client-side `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`).
- Estimated cost: $5/1000 calls × 500 rides/day = ~$75/month.
- Fallback ensures fares are still computed even if Google Maps API is down.

---

## ADR-012: Owner Consent Uses Scan Copy (Not OTP)

| Field | Value |
|-------|-------|
| Status | Accepted |
| Supersedes | Original OTP-based design |

### Context
The original design used Firebase Phone Auth OTP for vehicle owner consent. This had two problems: (1) TD-09 identified that sending the owner's phone number to Firebase potentially violates Bangladesh data localization (PRD req 43), and (2) not all vehicle owners have smartphones or are comfortable with OTP flows. A document-based approach is simpler and more accessible for the Bangladesh market.

### Decision
Owner consent is now **document-based (scan copy)**, not OTP-based. The driver uploads a scanned consent document signed by the vehicle owner, dated within 30 days. Admin reviews and approves/rejects the document. Two activation paths:
- **With consent scan copy**: Admin approves → `drivers.status = 'temporary'` for 30 days. Must re-submit consent for full `active` status.
- **Without consent scan copy** (or if driver IS the owner): Admin approves → `drivers.status = 'active'` (self-owned) or `pending` (no consent yet).

### Consequences
- No Firebase Phone Auth is used for owner consent — **TD-09 is fully resolved**.
- No owner phone number is sent to any third-party service.
- Admin must visually verify the consent document signature and date — adds ~30s per review.
- Post-MVP: consider digital signature or e-KYC integration for owner consent to reduce admin overhead.

---

## ADR-013: HMAC Anonymous UID Binding for Receipt Verification

| Field | Value |
|-------|-------|
| Status | **Superseded by ADR-017** |

> **⚠️ Superseded:** Supabase Auth handles OTP verification internally. No RTDB receipt writes needed. Anonymous UID binding is no longer applicable. See ADR-017.

### Context (Historical)
TD-14 identified that any anonymous Firebase user could write to RTDB `verification_requests/{sessionCode}/receipt`. An attacker who intercepted a sessionCode could write a spoofed receipt and hijack the auth. The fix required binding the anonymous UID at verification start.

### Decision (Historical)
`startVerification` CF stored the anonymous Firebase UID at `verification_requests/{sessionCode}/initiator_uid`. `checkAuth` CF validated that the RTDB receipt's sender UID matched the stored initiator UID. RTDB security rules restricted writes to authenticated UIDs matching the stored initiator.

### Consequences (Historical)
- Prevented receipt spoofing attacks.
- Required RTDB security rules update.
- `functions/src/startVerification.ts` captured and stored the anonymous UID.
- `functions/src/checkAuth.ts` validated UID match before returning `"received"`.

---

## ADR-014: Eight Vehicle Type Categories

| Field | Value |
|-------|-------|
| Status | Accepted |
| Supersedes | Original 4-type system (MOTORCYCLE, CNG_AUTO_RICKSHAW, CAR, MICROBUS) |

### Context
The original 4 vehicle types (Motorcycle, CNG, Car, Microbus) did not capture market segmentation in Bangladesh. Riders expect fare differentiation between economy and premium cars, and between bike categories by engine displacement. Competitors like Uber and Pathao offer tiered pricing. Additionally, BRTA regulations require tracking vehicle age and AC status.

### Decision
Expand to 8 vehicle types with independent pricing: bike_basic (≤100cc), bike_standard (101-150cc), bike_plus (>150cc), cng (no AC, 3 seats), car_economy (non-AC, 4 seats), car_comfort (AC, 4 seats), car_premium (AC, 4 seats), car_xl (AC, 7 seats). Each type has a dedicated `pricing` row. Drivers self-select during onboarding; admin may downgrade. Vehicle registration date tracked for BRTA 1-year age rule.

### Consequences
- 8 independent pricing rows per zone (up from 4).
- Rider vehicle selector shows 8 options with fare ranges.
- Dispatch filters unchanged conceptually (match by vehicle_type) but applied across 8 types.
- Admin panel must support vehicle type downgrade with reason.
- BRTA certificate mandatory for all vehicles.

---

## ADR-015: Driver-Set Minimum Per-Km Rate

| Field | Value |
|-------|-------|
| Status | Accepted |

### Context
Drivers may want to filter out low-value ride offers. In a subscription model, drivers keep 100% of fares but pay upfront for calls. Wasting calls on short-distance or low-rate rides reduces their ROI. A personal floor rate lets drivers opt out of offers below their comfort level.

### Decision
Add `min_per_km_bdt` column to `drivers` table. During dispatch, exclude drivers whose minimum exceeds the system per-km rate. Driver sets via slider in app (range: 70%–150% of system rate). No cooldown on changes. NULL = use system rate (default).

### Consequences
- Dispatch query gains an additional JOIN/filter condition.
- Drivers see missed-ride preview when adjusting slider.
- No impact on call deduction or subscription logic.

---

## ADR-017: Consolidate Backend on Supabase

| Field | Value |
|-------|-------|
| Status | Accepted |
| Supersedes | ADR-001 (Firebase HMAC Phone OTP), ADR-013 (HMAC Anonymous UID Binding) |

### Context
Ride originally used Neon for PostgreSQL and Firebase for Auth (phone OTP via HMAC Cloud Functions), Storage (driver documents), RTDB (verification polling), Cloud Functions (auth logic), and FCM (push notifications). This was 4+ services with separate billing, SDKs, and operational overhead. Firebase's free tier was cut in July 2025, increasing costs. Neon's free tier limits (0.5 GB, 100 hours/month) are restrictive for a bootstrapped startup targeting Bangladesh.

Supabase provides PostgreSQL database, Auth (phone OTP, email, social), Storage, and Realtime on a generous free tier (500 MB, 50K auth users) with predictable $25/month Pro pricing. It is fully open-source with a self-hosting escape hatch. PostgreSQL portability means the database can be migrated to any Postgres host later without schema changes.

dprelay is configured as an external SMS provider in the Supabase dashboard (Authentication → Phone → Custom SMS Provider), ensuring SMS delivery through a Bangladesh-local provider.

### Decision
Migrate from Neon + Firebase to Supabase as the canonical backend. Specifically:
- **Database:** Supabase PostgreSQL (ap-southeast-1 / Singapore) replaces Neon. Drizzle ORM stays, connects via direct connection string from Supabase dashboard.
- **Auth:** Supabase Auth phone OTP replaces Firebase HMAC Cloud Functions + RTDB polling. dprelay is the external SMS gateway.
- **Storage:** Supabase Storage replaces Firebase Storage for driver document uploads. Bucket name: `driver-documents`.
- **Push:** Expo Push Notifications remains primary (already in GlideX). FCM dropped unless needed later for Android background delivery.
- **WebSocket server:** `utils-server` stays unchanged for dispatch, heartbeat, call deduction. NOT replaced by Supabase Realtime.
- **Keep external:** Barikoi (maps/geocoding), bKash/Nagad (payments), dprelay (SMS via Supabase).

### Consequences
- **Fewer services:** 1 backend platform (Supabase) instead of 2 (Neon + Firebase). Simpler ops, fewer SDKs, one dashboard.
- **Lower cost:** Free tier covers development; $25/month Pro covers production with 8 GB DB, daily backups, PITR.
- **PostgreSQL portability:** Standard PostgreSQL; can `pg_dump`/`pg_restore` to any host. No vendor lock-in at the DB layer.
- **SMS gateway config required:** dprelay must be configured as external SMS provider in Supabase dashboard before phone auth works.
- **No Cloud Functions:** `functions/` directory and all Firebase Cloud Functions removed entirely. Auth logic moves to Supabase Auth (managed) + API routes (user registration).
- **No RTDB:** Firebase RTDB removed. No polling loops. Supabase Auth handles OTP verification internally.
- **RLS deferred:** Supabase Row Level Security is available but skipped for MVP. Existing middleware-based auth (`lib/auth.ts`) handles authorization. RLS may be added post-MVP for defense-in-depth.
- **Drizzle unchanged:** All Drizzle migrations, schema definitions, and queries work identically against Supabase PostgreSQL.
- **Payments consolidated:** PortPos aggregation gateway replaces direct bKash/Nagad integrations (see ADR-018). Old callback files kept as inert fallback.

---

## ADR-018: PortPos as Single Payment Gateway Aggregator

| Field | Value |
|-------|-------|
| Status | Accepted |
| Supersedes | ADR-002 (bKash + Nagad direct integration) |

### Context
The original plan (ADR-002) used direct bKash Merchant API (primary) and Nagad Merchant API (secondary). This required:
- Separate merchant agreements with each provider
- Separate callback verification logic (HMAC-SHA256 for bKash, RSA JWT for Nagad)
- Separate error handling and retry paths
- UI-level provider selection in the app

Maintaining multiple direct payment integrations was adding complexity without proportional benefit for MVP.

### Decision
Replace direct bKash/Nagad integrations with PortPos as the single payment gateway aggregator. PortPos's hosted checkout page supports bKash, Nagad, Rocket, Visa, Mastercard, and more. The user picks their preferred method on the PortPos page, not in the Ride app.

| Aspect | Before (ADR-002) | After (ADR-018) |
|--------|-------------------|------------------|
| Pay | 2 integrations + UI selection | 1 PortPos integration |
| Callback paths | 3 (bkash, nagad) | 1 (portpos) |
| Verification | HMAC-SHA256 + RSA JWT | PortPos invoice status check |
| Provider selection | App radio buttons | PortPos hosted checkout page |
| `payment_provider` enum | `'bkash', 'nagad'` | `'portpos'` |

### Consequences
- **Simpler code:** Single callback/verification path. No more bKash HMAC or Nagad RSA JWT verification.
- **More payment methods:** PortPos adds Rocket, cards, and other methods without app changes.
- **No provider UI:** Payment method selection removed from app. User picks on PortPos page.
- **Old callbacks kept:** `app/api/payment/bkash/callback+api.ts` and `app/api/payment/nagad/callback+api.ts` kept on disk as inert fallback.
- **bKash/Nagad libs kept:** `lib/bkash.ts` and `lib/nagad.ts` remain importable for reference but are no longer called by any active code path.

### Env Vars
- `PORTPOS_APP_KEY`, `PORTPOS_SECRET_KEY`, `PORTPOS_BASE_URL` (see 11-ENV-VARS.md)
