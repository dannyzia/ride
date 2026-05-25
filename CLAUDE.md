# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Implementation Methodology

This is a **modification of existing GlideX code**, not a greenfield build. Follow these execution rules:

1. Use strict execution order from `D:\My Projects\Current Project\Ride\docs\Plan\23-IMPLEMENTATION-HANDOFF-CHECKLIST.md`, with phase definitions from `D:\My Projects\Current Project\Ride\docs\Plan\14-DEV-CHECKLIST.yaml` and file-level changes from `D:\My Projects\Current Project\Ride\docs\Plan\20-DEVELOPER-CHANGE-LIST.md`.
2. Follow API and WS contracts in `D:\My Projects\Current Project\Ride\docs\Plan\06-API.md`, UX/UI contracts in `D:\My Projects\Current Project\Ride\docs\Plan\07-USER-FLOWS.md`, `D:\My Projects\Current Project\Ride\docs\Plan\08-UI-SPEC.md`, `D:\My Projects\Current Project\Ride\docs\Plan\09-UX-SPEC.md`, and test requirements in `D:\My Projects\Current Project\Ride\docs\Plan\22-TEST-TEMPLATES.md`.
3. Complete one handoff step at a time — do not reorder.
4. Stop immediately on any failure condition from `D:\My Projects\Current Project\Ride\docs\Plan\14-DEV-CHECKLIST.yaml`, fix, then continue.
5. After each completed step, output: Step completed, Files changed, Commands run, Validation evidence, Remaining risk.
6. Keep changes minimal and scoped to current step only.
7. Do not modify checklist scope unless explicitly requested.
8. Preserve existing GlideX business behavior unless plan explicitly changes it.
9. At phase boundaries, run full validation and provide a go or no-go recommendation.

## Source of Truth

- **`D:\My Projects\Current Project\Ride\docs\Plan\14-DEV-CHECKLIST.yaml`** — Canonical machine-readable implementation spec. Parse at start of every session. Treat failure_conditions as hard blockers.
- **`D:\My Projects\Current Project\Ride\docs\Plan\23-IMPLEMENTATION-HANDOFF-CHECKLIST.md`** — Strict ordered execution through H-00 through H-17. Do not reorder.
- **`D:\My Projects\Current Project\Ride\docs\Plan\20-DEVELOPER-CHANGE-LIST.md`** — File-by-file implementation guide with exact code shapes per phase.
- **`D:\My Projects\Current Project\Ride\docs\Plan\02-ARCHITECTURE.md`** — Component map: what's KEEP/REPLACE/DELETE/ADD from GlideX.
- **`D:\My Projects\Current Project\Ride\docs\Plan\06-API.md`** — API and WebSocket event contracts.
- **`D:\My Projects\Current Project\Ride\docs\Plan\05-DATA-MODEL.md`** — Database schema deltas from GlideX.
- **`D:\My Projects\Current Project\Ride\docs\Plan\13-CONVENTIONS.md`** — Coding conventions, naming, and critical Ride-specific rules.
- **`D:\My Projects\Current Project\Ride\docs\Plan\07-USER-FLOWS.md`** — User flow specs with all alternate paths.
- **`D:\My Projects\Current Project\Ride\docs\Plan\08-UI-SPEC.md`** — Screen specs with GoRide design tokens.
- **`D:\My Projects\Current Project\Ride\docs\Plan\09-UX-SPEC.md`** — Interaction contracts and GoRide micro-interactions.
- **`D:\My Projects\Current Project\Ride\docs\Plan\01-PRD.md`** — Product requirements with acceptance criteria.
- **`D:\My Projects\Current Project\Ride\docs\Plan\03-TECH-STACK.md`** — Package changes from GlideX baseline.
- **`D:\My Projects\Current Project\Ride\docs\Plan\04-ADR.md`** — Architecture Decision Records explaining WHY decisions were made.
- **`D:\My Projects\Current Project\Ride\docs\Plan\10-DEV-SETUP.md`** — Local dev setup steps (execute in order).
- **`D:\My Projects\Current Project\Ride\docs\Plan\11-ENV-VARS.md`** — Complete env var reference.
- **`D:\My Projects\Current Project\Ride\docs\Plan\12-FOLDER-STRUCTURE.md`** — File delta from GlideX (delete/replace/add).
- **`D:\My Projects\Current Project\Ride\docs\Plan\15-RUNBOOK-DEPLOY.md`** — Deploy procedures for all 3 components.
- **`D:\My Projects\Current Project\Ride\docs\Plan\16-INCIDENT-RESPONSE.md`** — Ride-specific incident response (P1-P4).
- **`D:\My Projects\Current Project\Ride\docs\Plan\17-MONITORING.md`** — Dashboards and alert thresholds.
- **`D:\My Projects\Current Project\Ride\docs\Plan\18-KNOWN-ISSUES.md`** — Known bugs and tech debt (check before fixing bugs).
- **`D:\My Projects\Current Project\Ride\docs\Plan\19-GLOSSARY.md`** — Canonical domain term definitions.
- **`D:\My Projects\Current Project\Ride\docs\Plan\21-MIGRATION-SQL.md`** — SQL migration reference.
- **`D:\My Projects\Current Project\Ride\docs\Plan\22-TEST-TEMPLATES.md`** — Unit test templates for critical modules.

## Project Overview

**Ride** is a subscription-based ride lead distribution platform for Bangladesh. Drivers buy call packages and keep the fare minus optional platform commission. Rebuilt from the GlideX open-source ride-hailing codebase.

Key differences from GlideX:
- **Auth**: Clerk (email/social) → Firebase HMAC phone OTP via Cloud Functions
- **Payments**: Stripe → bKash + Nagad mobile money
- **Map**: Google Maps → Barikoi Maps API (via @maplibre/maplibre-react-native)
- **Driver monetization**: Per-ride fare → Subscription call-package wallet
- **Dispatch**: None → H3 hexagonal indexing + WebSocket batch broadcast
- **Admin**: None → Web admin panel

## Development Commands

```bash
# Start dev server
npx expo start

# Android dev build (required after native plugin changes)
npx expo run:android

# iOS dev build
npx expo run:ios

# Database migrations
npx drizzle-kit generate    # Generate migration SQL
npx drizzle-kit push         # Push to remote DB
npx drizzle-kit studio       # Drizzle Studio UI

# Type checking
npx tsc --noEmit

# Linting & formatting
npx eslint .
npx prettier --write .

# Testing
npx jest --watchAll          # Watch mode
npx jest --testPathPattern="testName"  # Single test

# WebSocket server (utils-server)
cd utils-server && npm start

# Firebase emulators
firebase emulators:start

# Deploy Cloud Functions
firebase deploy --only functions

# EAS builds
eas build --platform android --profile production
eas build --platform ios --profile production
```

## Architecture

### Route Structure (Expo Router)
- `app/(auth)/` — phone-entry → otp-polling → register (Firebase HMAC flow)
- `app/(main)/(customer)/` — Rider screens (keep folder name, "rider" as display label)
- `app/(main)/(rider)/` — Driver screens
- `app/(admin)/` — Web-only admin panel (queue, packages, zones, monitoring)
- `app/api/` — Expo API routes (file-based backend endpoints)

### Key Libraries
- **UI**: NativeWind (TailwindCSS), Lottie, react-native-paper, GoRide design tokens in `theme/goRide.ts`
- **State**: Zustand stores in `store/index.ts`. Add: `usePackageStore`, `useCallLedgerStore`, `useDriverStatusStore`, `useChatStore`
- **Map**: `@maplibre/maplibre-react-native` + Barikoi API (`barikoiapis`) via `utils/mapUtils.ts`
- **Database**: Neon PostgreSQL + Drizzle ORM (`src/db/schema.ts`)
- **Auth**: Firebase Auth + Admin SDK (`lib/auth.ts`, `lib/firebase.ts`). HMAC signing in `functions/` only.
- **Payments**: bKash/Nagad via WebView (`lib/bkash.ts`, `lib/nagad.ts`, `components/PaymentWebView.tsx`)
- **WebSocket**: `ws` library in `utils-server/` (dispatch.ts, heartbeat.ts, h3Index.ts, scheduler.ts, compensationWorker.ts)
- **Geo**: H3 hex grid (`lib/h3.ts`) at resolution 9. Import only via `lib/h3.ts` and `utils-server/h3Index.ts`.
- **SMS**: dpRelay API for OTP. Android SMS_RETRIEVER_API via `react-native-otp-verify`.
- **JWT**: `lib/jwt.ts` for challenge_jwt verify only (HS256, FUNCTIONS_JWT_SECRET). Signing in `functions/src/checkAuth.ts` only.
- **Validation**: Zod at every API route boundary (`lib/vehicleTypes.ts` exports `VEHICLE_TYPE_ZOD_ENUM`)

### Backend Services
1. **Expo API Routes** (`app/api/`) — Business logic, DB queries, rate limiting. Firebase ID token required (unless marked `[public]`).
2. **Cloud Functions** (`functions/`) — `startVerification`, `checkAuth`, `cleanupVerification`. Called exclusively by Expo API proxy routes, never directly by client.
3. **Utils Server** (`utils-server/`) — WebSocket dispatch, heartbeat-gated call deduction, H3 index, scheduler (14 cron jobs), compensation worker.

### Auth Flow
```
phone-entry → POST /api/auth/challenge → startVerification CF → dpRelay SMS
otp-polling → polls checkAuth CF → signInWithCustomToken → verify-token → register
register → POST /api/register with challenge_jwt → role home
```

### Dispatch Flow
```
Rider requests ride → POST /api/ride/request → zone check + fare calc
  → WebSocket server: H3 cell lookup → score candidates (distance 40% + rating 30% + acceptance 20% + availability 10%)
  → Batch broadcast (k=2 cell ring, batch size 5, max 3 batches)
  → Driver fetch:confirm → heartbeat deduction window (call_ledger write, unique on ride_id+driver_id)
```

### Deploy Order (dependency-aware)
```
1. Firebase Cloud Functions (no deps)
2. DB migrations (after Functions)
3. utils-server (depends on current schema)
4. EAS build + submit (last — references updated API)
```

## 11 Development Phases (critical path order)

| Phase | Name | Depends On |
|-------|------|------------|
| 1 | Foundation — GlideX Cleanup (remove Clerk/Stripe/Resend) | — |
| 2 | Database Schema (new tables, enums, migrations) | 1 |
| 3 | Firebase Cloud Functions (startVerification, checkAuth) | 1 |
| 4 | Auth Layer (screens, middleware, verify-token) | 2, 3 |
| 5 | Payment System (bKash/Nagad, idempotent activation) | 2, 4 |
| 6 | Dispatch Engine (WebSocket, H3, heartbeat, scheduler) | 2, 4 |
| 7 | Driver Flows (onboarding, home, offers, ledger) | 5, 6 |
| 8 | Rider Flows (request, pricing, tracking, cancel) | 6 |
| 9 | Admin Panel (approval queue, packages, zones) | 2, 4 |
| 10 | In-App Chat (rider-driver messaging) | 2, 4 |
| 11 | Commission & Waiting Time (post-MVP decision gate) | — |

## 18 Handoff Gates (H-00 to H-17)

| Gate | Name | Evidence Required |
|------|------|-------------------|
| H-00 | Baseline and branch freeze | Branch name, baseline hash, owner |
| H-01 | Environment and tooling gate | Expo app + utils-server + Firebase emulators startup |
| H-02 | Phase 1 completion | Type-check passes, no Clerk/Stripe references |
| H-03 | Phase 2 completion | Migrations applied, seeds execute |
| H-04 | Phase 3 completion | Emulator tests: OTP start, auth check, replay resistance |
| H-05 | Phase 4 completion | Auth screens + protected routes work for all roles |
| H-06 | Phase 5 completion | Payment callbacks + subscription activation + audit trail |
| H-07 | Phase 6 completion | Dispatch scenarios + ledger invariants + stale recovery |
| H-08 | Phase 7 completion | Driver lifecycle E2E |
| H-09 | Phase 8 completion | Rider lifecycle E2E |
| H-10 | Phase 9 completion | Admin approval + quality hooks |
| H-11 | Phase 10 completion | Chat history + real-time delivery |
| H-12 | Phase 11 decision | Signed decision (defer or include) |
| H-13 | Phase 12 integration | GoRide assets + theme + no hardcoded styles |
| H-14 | API contract lock | Verification against 06-API.md |
| H-15 | Test execution lock | Test templates converted to executable suites |
| H-16 | Operational readiness | Monitoring + runbook + incident response verified |
| H-17 | Final handoff sign-off | All gates signed, known issues documented |

## Glossary (key domain terms)

- **Call** — a single unit from a driver's subscription; consumed on fetch:confirm
- **Call Wallet** — driver-visible balance/expiry card
- **Call Ledger** — immutable append-only log of all call events
- **Package** — admin-defined subscription product (calls + duration + price)
- **Subscription** — driver's active instance of a purchased package
- **Offer** — a ride request broadcast to a specific driver via WebSocket
- **Deduction** — call_ledger event subtracting 1 call; heartbeat.ts only
- **Fetch Confirm** — WebSocket message on first user interaction with offer card (triggers deduction window)
- **Batch** — one round of offering to top-N drivers (default: 3 batches max)
- **Pro-rata Credit** — compensating credit for low utilisation due to platform demand shortage
- **Zone** — polygon defining operational area (MVP: Dhaka)
- **Daily Cap** — hidden max calls/day for unlimited packages (default: 200)
- **H3 Cell** — Uber H3 hex grid at resolution 9 (~174m diameter)
- **Idempotency Key** — UUID on payment initiation to prevent double-charge
- **panelty** — BDT paisa (integer). All money is integer paisa until display.
- **Utilisation** — calls_used / package.call_count for pro-rata eligibility
- **Platform Commission** — per-ride percentage (default 0%); stored as driver liability

## Critical Coding Rules

- **Money**: All amounts in integer paisa (BDT), never floats. Divide by 100 only at UI display.
- **Vehicle types**: 8 lowercase: `bike_basic`, `bike_standard`, `bike_plus`, `cng`, `car_economy`, `car_comfort`, `car_premium`, `car_xl`
- **call_ledger writes**: ONLY `utils-server/heartbeat.ts` (deductions) and `lib/activateSubscription.ts` (initial_load, credit, expiry_writeoff)
- **dispatch_offers writes**: ONLY `utils-server/dispatch.ts` and `utils-server/heartbeat.ts`
- **Single instance**: `INSTANCE_COUNT=1` required for WebSocket dispatch (no split-brain)
- **No client secrets**: Payment credentials never in `EXPO_PUBLIC_*` vars
- **No Clerk/Stripe**: Removed entirely — any reference is a bug
- **Timestamps**: Always UTC `timestamptz`, convert to Asia/Dhaka only at display
- **Zod validation**: Every API route validates input before DB/service calls
- **Error format**: Always `{ error: 'machine_code', message: '...' }` with appropriate status
- **H3**: Import `h3-js` only via `lib/h3.ts` and `utils-server/h3Index.ts`
- **platform_config**: Never cache — read from DB at request time
- **Drizzle transactions**: Required for all money writes (call_ledger, subscriptions, payment_events)
- **Firebase ID token**: Required on every protected API route via `verifyFirebaseIdToken()`
- **No console.log**: Use `lib/logger.ts` (`logger.info`, `logger.error`)
- **Vehicle type filter**: Dispatch must filter by vehicle_type BEFORE H3 scoring, using lowercase enum values
- **Daily cap check**: In dispatch candidate pool, not in heartbeat deduction path
- **Batch exclusion**: Query `dispatch_offers` for excluded driver_ids before building each batch
- **All tables**: uuid PKs, created_at/updated_at timestamptz. Append-only tables (call_ledger, dispatch_offers, used_challenges, rate_limits) exempt from updated_at.
- **Soft deletes**: No hard deletes on users, drivers, riders, packages, call_ledger, rides, documents
- **Commit format**: Conventional Commits with scope (auth, dispatch, payment, ledger, admin, schema, driver, rider)

## Known Issues & Tech Debt (check before fixing bugs)

| ID | Area | Summary | Severity |
|----|------|---------|----------|
| TD-01 | SMS receiver | OEM battery optimisation kills BroadcastReceiver (30-60% of Android devices). Manual OTP entry is fallback. | high |
| TD-04 | Scheduled rides | setInterval timers lost on utils-server restart. Startup recovery has 5s gap. | med |
| TD-06 | Nagad | Sandbox credentials unavailable. Ship bKash-only; Nagad shows "Coming soon". | med |
| TD-07 | Admin auth | No MFA for admin login. Admin phone compromise = full access. | med |
| TD-11 | Scaling | In-process maps prevent >1 replica. Set replicas=1. | high (post-MVP) |
| TD-14 | HMAC auth | Anonymous UID binding needed to prevent receipt spoofing. Fix before production. | high |
| TD-15 | Recovery | utils-server loses all in-memory state on crash. Startup recovery added. | high |
| TD-20 | Version enforcement | No mechanism to force driver updates. GET /api/app-config added. | med |
| TD-25 | BRTA ceiling | Fare ceiling is logged, not blocked. Admin must verify pricing. | low |

## Monitoring Alert Thresholds (key metrics)

| Metric | Normal | Alert at | Severity |
|--------|--------|----------|----------|
| API error rate | <0.5% | >2% for 5min | P2 |
| P95 response time | <500ms | >2000ms for 5min | P2 |
| Connected driver count | >0 in ops hours | 0 for 5min | P1 |
| Call deduction/offer ratio | 0.8-1.0 | <0.5 or >1.0 for 30min | P1 |
| Offer broadcast latency | <2s | >5s P95 | P2 |
| compensation_queue depth | 0 | >5 items for 15min | P2 |
| callback_pending >10min | 0 | >0 | P2 |
| callback_pending >60min | 0 | >0 | P1 |
| startVerification error rate | <1% | >5% for 5min | P2 |

## Graph Maintenance

After modifying any code files, run:
- `code-review-graph update` — always (fast, <2s)
- `graphify update .` — after large batches of changes only

## GoRide Design Tokens (from 08-UI-SPEC.md)

- Primary accent: `#0CC25F`, pressed: `#0A9B4C`
- Error/danger: `#E31D1C`, Info/auxiliary: `#2E42A5`
- Background light: `#F7FCFF`, dark: `#181A20`
- Surface light: `#FFFFFF`, elevated dark: `#212121`
- Border light: `#DADADA`, dark: `#35383F`
- Text primary: `#212121` (light), `#FFFFFF` (dark)
- Font heading: Urbanist, body/caption: Inter
- Primary button: filled `#0CC25F`, text white, radius pill(1000)
- Corner radius scale: 4, 6, 10, 16, 20, 24, 32, pill(1000)
- Elevation: -32px 32px 48px rgba(24, 26, 32, 0.1)
- Source: `D:/My Projects/Current Project/Ride/App Design/GoRide - Ride-Hailing App UI Kit (Preview)/GoRide.css`
