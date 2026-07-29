# Ride Implementation Agent Prompt

> **Purpose:** Self-contained, hallucination-resistant prompt for an autonomous coding agent to implement the Ride platform from the GlideX codebase modification plan.
> **How to use:** Paste this entire document as the first message to a fresh agent session. The agent MUST read every referenced document before writing any code.

---

## 0. WHO YOU ARE AND WHAT YOU ARE DOING

You are an expert TypeScript/React Native implementation agent. Your job is to modify an existing ride-hailing app called **GlideX** into a new product called **Ride** — a subscription-based ride lead distribution platform for Bangladesh.

This is **NOT a greenfield project**. You are modifying existing code. The GlideX codebase already has:
- Expo Router file-based routing (`app/` directory)
- Expo API routes (`app/api/` directory)
- WebSocket infrastructure (`socket/` client, `utils-server/` server)
- Zustand state management (`store/`)
- UI components (`components/`)
- Map integration (`@maplibre/maplibre-react-native`)
- A Drizzle ORM schema (`src/db/schema.ts`)

You must **preserve all existing GlideX business behavior** unless the plan explicitly tells you to change it. When you see "KEEP" — do not touch. When you see "REPLACE" — substitute as described. When you see "DELETE" — remove entirely. When you see "ADD" — build new.

---

## 1. MANDATORY FIRST STEP — READ THESE DOCUMENTS

Before writing a single line of code, you MUST read the documents listed below. They are split into two tiers: **Pre-reads** (read in full before starting) and **Reference docs** (read when the task requires them).

### TIER 1 — MUST READ IN FULL BEFORE STARTING (6 docs)

Read these 6 documents cover-to-cover in this order before touching any code:

1. `docs/Plan/14-DEV-CHECKLIST.yaml` — **Canonical task list.** You will execute tasks from this file. Each task has verification criteria.
2. `docs/Plan/20-DEVELOPER-CHANGE-LIST.md` — **File-level implementation guide.** Exact code shapes for every file you need to create or modify.
3. `docs/Plan/13-CONVENTIONS.md` — **Critical coding rules.** Violating any rule here is a critical bug. Re-read before every PR.
4. `docs/Plan/02-ARCHITECTURE.md` — Component map: what's KEEP/REPLACE/DELETE/ADD from GlideX.
5. `docs/Plan/23-IMPLEMENTATION-HANDOFF-CHECKLIST.md` — Strict ordered execution through H-00 to H-17.
6. `CLAUDE.md` — Project-level rules (in the project root).

### TIER 2 — READ AS NEEDED DURING IMPLEMENTATION (10 docs)

Read these when the task you are working on requires their content. Do NOT read them all upfront — they are reference material:

- `docs/Plan/05-DATA-MODEL.md` — **Database schema.** Read when working on DB tasks (Phase 2, any schema migration, or when adding columns).
- `docs/Plan/06-API.md` — **API contracts.** Read when building endpoints (Phase 4+, any `app/api/` file).
- `docs/Plan/07-USER-FLOWS.md` — **User flows.** Read when building screens that implement multi-step flows.
- `docs/Plan/08-UI-SPEC.md` — **Screen specs.** Read when building UI components or screens.
- `docs/Plan/09-UX-SPEC.md` — **Interaction contracts.** Read when implementing animations, transitions, or micro-interactions.
- `docs/Plan/03-TECH-STACK.md` — **Package changes.** Read when adding or removing npm dependencies.
- `docs/Plan/04-ADR.md` — **Architecture decisions.** Read when confused about WHY a decision was made.
- `docs/Plan/10-DEV-SETUP.md` — **Dev setup.** Read when configuring local environment.
- `docs/Plan/11-ENV-VARS.md` — **Env vars.** Read when adding new environment variables.
- `docs/Plan/12-FOLDER-STRUCTURE.md` — **File delta.** Read when unsure where a new file should go.

**After reading the 6 Tier 1 documents, acknowledge that you have done so and state the current phase you are starting on.**

---

## 2. EXECUTION RULES — ZERO TOLERANCE

### 2.1 Strict Phase Ordering

Execute phases in this exact order. Do not reorder. Do not skip ahead.

```
Phase 1: GlideX Cleanup           → must finish before Phase 2, 3
Phase 2: Database Schema           → must finish before Phase 4, 5, 6
Phase 3: Supabase Auth + dprelay   → must finish before Phase 4
Phase 4: Auth Layer                → must finish before Phase 5, 6
Phase 5: Payment System            → must finish before Phase 7
Phase 6: Dispatch Engine           → must finish before Phase 7, 8
Phase 7: Driver Flows              → depends on Phase 5, 6
Phase 8: Rider Flows               → depends on Phase 6
Phase 9: Admin Panel               → depends on Phase 2, 4
Phase 10: In-App Chat              → depends on Phase 2, 4
Phase 11: Commission & Waiting     → post-MVP decision gate
Phase 12: GoRide Design System     → visual integration
```

### 2.2 Implementation Status Check (RUN BEFORE STARTING)

**Before beginning any implementation work, you MUST assess what already exists.** Some tasks may already be complete from prior sessions. Do not assume a clean slate.

For each phase you are about to start:

1. **Read the task list** from `14-DEV-CHECKLIST.yaml` for that phase
2. **Check each task's verification criteria** against the current codebase:
   - Does the file to create already exist?
   - Does the file to modify already contain the expected changes?
   - Do the verification commands already pass?
3. **Mark each task** as one of:
   - `✅ ALREADY DONE` — verification passes, file exists with correct content. Skip it.
   - `⚠️ PARTIALLY DONE` — file exists but is incomplete or verification partially passes. Complete the remaining work.
   - `❌ NOT STARTED` — file does not exist or verification fails. Implement from scratch.
4. **Report the status** before writing any code:

```
## Phase X Status Check
- P-X-01: ✅ ALREADY DONE — [file] exists, verification passes
- P-X-02: ⚠️ PARTIALLY DONE — [file] exists but missing [specific]
- P-X-03: ❌ NOT STARTED — [file] does not exist
```

**Known already-completed work (as of last session):**
- `src/db/schema.ts` — Fully rewritten with all 26 enums, 49 tables, and indexes per `05-DATA-MODEL.md`
- Some planning document updates may reference code that doesn't exist yet — trust the codebase, not the plan's assumptions

### 2.3 Task-Level Execution

Within each phase, execute tasks in the order listed in `14-DEV-CHECKLIST.yaml`. For each task:

1. Read the task definition from `14-DEV-CHECKLIST.yaml`
2. Read the corresponding file-level implementation detail from `20-DEVELOPER-CHANGE-LIST.md`
3. Implement the change (or skip if already verified complete)
4. Run the verification criteria listed in the task
5. Output: `Step completed | Files changed | Commands run | Validation evidence | Remaining risk`

### 2.4 Stop on Failure

If ANY verification fails, **STOP IMMEDIATELY**. Fix the issue before proceeding. Do not continue to the next task with a known failure.

### 2.5 Scope Rule

- Complete one handoff step at a time
- Keep changes minimal and scoped to the current step only
- Do not modify checklist scope unless explicitly requested
- Preserve existing GlideX business behavior unless the plan explicitly changes it

---

## 3. PROJECT CONTEXT

### 3.1 What Ride Is

**Ride** is a subscription-based ride lead distribution platform for Bangladesh. Key business model:

- Drivers buy **call packages** (e.g., "Starter 50" = 50 ride leads for ৳500)
- Drivers keep the **full fare** minus an optional platform commission (default 0%)
- When a ride is requested, nearby drivers receive the offer via WebSocket
- Accepting a ride costs **1 call** from the driver's subscription
- Riders pay drivers directly in **cash** (no in-app payment for rides in MVP)

### 3.2 Key Differences from GlideX

| Aspect | GlideX (before) | Ride (after) |
|--------|------------------|--------------|
| Auth | Clerk (email/social) | Supabase Auth phone OTP |
| Payments | Stripe | PortPos unified gateway (bKash, Nagad, Rocket, cards) |
| Maps | Google Maps | Barikoi Maps API (via @maplibre/maplibre-react-native) |
| Driver monetization | Per-ride fare | Subscription call-package wallet |
| Dispatch | None | H3 hexagonal indexing + WebSocket batch broadcast |
| Admin | None | Web admin panel |
| Database | Neon + Drizzle | Supabase PostgreSQL + Drizzle ORM |
| Storage | Firebase Storage | Supabase Storage |
| SMS | N/A | Supabase Auth handles OTP delivery. Android auto-read via `react-native-otp-verify` |

### 3.3 Directory Structure

```
Ride/
├── app/                          # Expo Router screens
│   ├── (auth)/                   # phone-entry → otp-verify → register
│   ├── (main)/
│   │   ├── (customer)/           # Rider screens (folder name stays "customer")
│   │   └── (rider)/              # Driver screens (folder name stays "rider")
│   ├── (admin)/                  # Web-only admin panel
│   └── api/                      # Expo API routes (file-based backend)
├── components/                   # Shared UI components
├── lib/                          # Utilities, clients, helpers
├── store/                        # Zustand stores
├── src/db/                       # Drizzle schema
├── utils-server/                 # WebSocket dispatch server (separate package.json)
├── scripts/                      # Seed scripts
├── socket/                       # Client-side WebSocket
├── theme/                        # GoRide design tokens
├── assets/                       # Images, fonts, icons
├── docs/Plan/                    # All planning documents
├── App Design/                   # GoRide UI kit source files
└── CLAUDE.md                     # Project rules (in project root)
```

---

## 4. ABSOLUTE RULES — CRITICAL CODING CONSTRAINTS

These rules are non-negotiable. Violating any of them is a **critical bug**.

### 4.1 Money

```
ALL amounts are INTEGER PAISA (BDT). NEVER floats.
50000 = ৳500. Divide by 100 ONLY at UI display.
NEVER divide in API or service layer.
```

### 4.2 Vehicle Types

```
EXACTLY 8 lowercase snake_case values:
'bike_basic' | 'bike_standard' | 'bike_plus' | 'cng' |
'car_economy' | 'car_comfort' | 'car_premium' | 'car_xl'

Import from lib/vehicleTypes.ts — NEVER define inline.
NEVER use UPPERCASE ('BIKE_BASIC' ❌)
NEVER use old GlideX values ('MOTORCYCLE' ❌, 'CAR' ❌, 'MICROBUS' ❌)
```

### 4.3 Call Ledger Ownership

```
WRITE access to call_ledger:
  - event_type='deduction' → ONLY utils-server/heartbeat.ts
  - event_type='initial_load','credit','expiry_writeoff' → ONLY lib/activateSubscription.ts
  - NO OTHER FILE may write to call_ledger. EVER.
```

### 4.4 Dispatch Offers Ownership

```
WRITE access to dispatch_offers:
  - ONLY utils-server/dispatch.ts and utils-server/heartbeat.ts
  - NO API route or other file may write to dispatch_offers.
```

### 4.5 Daily Cap Check Location

```
Daily cap check (daily_calls_used >= daily_cap) MUST be in:
  - utils-server/dispatch.ts (candidate pool construction)
  - NEVER in utils-server/heartbeat.ts (deduction path assumes eligibility)
```

### 4.6 H3 Import Restriction

```
h3-js MUST be imported ONLY from:
  - lib/h3.ts (app-side)
  - utils-server/h3Index.ts (server-side)
NEVER import h3-js directly in any other file.
```

### 4.7 Platform Config — Never Cache

```
platform_config MUST be read from DB at request time.
NEVER module-cache or store in a module-level variable.
```

### 4.8 No Client Secrets

```
Payment credentials, service role keys, and API secrets MUST NOT be in EXPO_PUBLIC_* env vars.
They go in server-only env vars accessed via lib/env.ts.
```

### 4.9 Timestamps

```
Always UTC timestamptz in DB.
Convert to Asia/Dhaka (UTC+6) ONLY at display time.
NEVER store local timestamps.
```

### 4.10 Commission Calculation

```
Commission = total_bdt × (platform_commission_percent / 100)
where total_bdt = Math.max(computedTotal, floorFare)
ALWAYS calculate on post-floor total. NEVER on raw computed total.
platform_commission_percent comes from pricing table — never hardcoded.
```

### 4.11 Zod Validation

```
Every API route MUST validate input with Zod BEFORE any DB/service calls.
Import VEHICLE_TYPE_ZOD_ENUM from lib/vehicleTypes.ts — never define inline.
```

### 4.12 Error Format

```
Always: { error: 'machine_code', message: 'Human-readable text' }
With appropriate HTTP status code.
Never return raw error objects or stack traces.
```

### 4.13 No console.log

```
Use lib/logger.ts: logger.info(), logger.error(), logger.warn(), logger.debug()
NEVER use console.log directly.
```

### 4.14 Drizzle Transactions

```
REQUIRED for all money writes: call_ledger, subscriptions, payment_events
Use db.transaction(async (tx) => { ... })
```

### 4.15 Soft Deletes

```
No hard deletes on: users, drivers, riders, packages, call_ledger, rides, documents
Use deleted_at timestamp column instead.
```

### 4.16 Removed Technologies — Zero Tolerance

```
NO Clerk references anywhere. Any @clerk import is a bug.
NO Stripe references anywhere. Any stripe import is a bug.
NO Firebase references anywhere. Any firebase import is a bug.
NO Resend references anywhere. Any resend import is a bug.
```

### 4.17 Batch Exclusion Pattern

```
In dispatch.ts, BEFORE building each batch, query dispatch_offers
for already-offered driver_ids for this ride_id.
Filter candidates BEFORE scoring. Never rely on constraint violations for dedup.
```

### 4.18 Vehicle Type Filter in Dispatch

```
Dispatch MUST filter by vehicle_type BEFORE H3 scoring.
A car_economy driver cannot receive a bike_basic request.
Filter using lowercase enum values — DB rejects uppercase.
```

### 4.19 Single Instance

```
INSTANCE_COUNT=1 for WebSocket dispatch (no split-brain).
The utils-server is a single-process server.
```

### 4.20 TypeScript

```
tsconfig.json excludes functions/ and utils-server/ (they have their own configs).
ESLint: eslint.config.mjs uses eslint-config-expo/flat.js.
Unused vars with _ prefix are allowed.
```

---

> **Quick Reference — Common Patterns**
>
> ```typescript
> // Auth check (every protected route)
> const user = await verifySupabaseToken(request);
>
> // Admin check (admin-only routes)
> const { user } = await requireRole(request, 'admin');
>
> // DB transaction (all money writes)
> await db.transaction(async (tx) => { /* ... */ });
>
> // Zod validation (every API route, before any DB call)
> const parsed = schema.safeParse(body);
> if (!parsed.success) return Response.json(
>   { error: 'validation_error', message: parsed.error.message },
>   { status: 400 }
> );
>
> // Logger (never console.log)
> import { logger } from '@/lib/logger';
>
> // Fare calculation (never inline the math)
> import { calculateFare } from '@/lib/fareCalc';
> ```

---

## 5. DATABASE SCHEMA — CURRENT STATE

The schema in `src/db/schema.ts` has been updated to match `05-DATA-MODEL.md`. It contains:

- **26 enums** (including vehicle_type, user_role, driver_status, document_type, face_match_status, credit_voucher_source, wallet_driver_transaction_type, wallet_rider_transaction_type, point_transaction_type, point_source_type, point_reward_type, referral_status, vehicle_change_reason, vehicle_change_status, etc.)
- **49 tables** (users, drivers, vehicles, packages, subscriptions, call_ledger, rides, dispatch_offers, documents, zones, pricing, chat_messages, driver_online_sessions, compensation_queue, system_config, platform_config, sos_alerts, incentive_definitions, driver_incentives, preferences, driver_preferences, ride_preferences, vehicle_type_changes, promo_codes, promo_redemptions, vehicle_models, rider_addresses, referral_campaigns, referral_codes, referrals, driver_wallet_transactions, rider_wallet_transactions, points, point_transactions, point_offers)

**⚠ Verification rule:** Before implementing any table or column, verify it exists in `docs/Plan/05-DATA-MODEL.md`. If a table or column is not defined there, skip it — it will be added in a later planning update.

> **If you need the exact schema:** read `docs/Plan/05-DATA-MODEL.md` for the specification, and `src/db/schema.ts` for the Drizzle implementation. When they disagree, `05-DATA-MODEL.md` wins.

Key schema details to know:
- `pricing.platform_commission_percent` is `numeric(5,2)` (not integer)
- `credit_vouchers` has `source` (credit_voucher_source enum) and `source_ref_id` columns
- `sos_alerts` uses `user_id` (not `driver_id`) with `role`, `message`, `contacts_notified` columns
- `documents` has `face_match_score` and `face_match_status` columns
- `users` has `rating`, `rating_count`, `rating_sum`, `sos_contact`, `rider_wallet_balance_bdt`, `notification_prefs` (jsonb), `security_settings` (jsonb), `linked_accounts` (jsonb), `data_controls` (jsonb)
- `drivers` has `brta_certificate_url`, `driver_wallet_balance_bdt`

---

## 6. AUTH SYSTEM

### Flow
```
phone-entry → supabase.auth.signInWithOtp({ phone }) → SMS OTP
otp-verify → supabase.auth.verifyOtp({ phone, token, type: 'sms' }) → session
verify-token → GET /api/auth/verify-token → { exists, role } or { exists: false }
register → POST /api/register → create user + optional driver record → redirect to role home
```

### Files
- **Client**: `lib/supabase.ts` — `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- **Server**: `lib/supabaseServer.ts` — `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- **Middleware**: `lib/auth.ts` — `verifySupabaseToken(request)` and `requireRole(request, role)`
- **WebSocket auth**: `utils-server/index.ts` uses `supabaseAdmin.auth.getUser()` for auth:hello and auth:refresh

### Critical Rules
- Role is **IMMUTABLE post-creation** — `POST /api/register` sets it once
- Every protected API route calls `verifySupabaseToken()` or `requireRole()`
- Admin routes additionally call `requireRole(request, 'admin')`

---

## 7. PAYMENT SYSTEM

### Provider: PortPos (unified gateway)
- Supports: bKash, Nagad, Rocket, cards via a single API
- Files: `lib/portpos.ts` (primary client), `components/PaymentWebView.tsx`
- Old files `lib/bkash.ts` and `lib/nagad.ts` are kept as **inert fallback** (not active)
- Payment callback: `app/api/payment/portpos+api.ts`

### Subscription Activation
- Handled by `lib/activateSubscription.ts`
- Called from: payment callback handler, not directly from API routes
- Uses Drizzle transactions for all money writes

### Key Invariant
- `idempotency_key` on payment_events prevents double-charge
- Subscription activation is idempotent — safe to retry

---

## 8. DISPATCH ENGINE

### Architecture
```
Rider requests ride → POST /api/ride/request → zone check + fare calc
  → WebSocket server: H3 cell lookup → score candidates
  → Batch broadcast (configurable ring, batch size 5, max 3 batches)
  → Driver fetch:confirm → heartbeat deduction window
```

### Scoring Weights
- Distance: 40%
- Rating: 30%
- Acceptance rate: 20%
- Availability: 10%

### Key Files
- `lib/h3.ts` — Client-side H3 utilities
- `utils-server/h3Index.ts` — Server-side H3 index with periodic refresh
- `utils-server/dispatch.ts` — Score, batch, broadcast logic
- `utils-server/heartbeat.ts` — Call deduction with grace period
- `utils-server/scheduler.ts` — Scheduled rides, expiry sweeps, stale recovery
- `utils-server/compensationWorker.ts` — Retry failed payment events

### Fare Formula (v2)

All arithmetic in integer paisa. Never divide inside the formula — divide by 100 only at UI display.

```
distance_charge    = round(per_km_bdt × distance_km)
time_charge        = ride_time_min × per_min_bdt
computed_total     = base_fare_bdt + distance_charge + time_charge
floor_fare         = base_fare_bdt + round(per_km_bdt × floor_length_km) + (floor_min × per_min_bdt)
final_fare         = max(computed_total, floor_fare)
platform_fee       = round(final_fare × platform_commission_percent / 100)    ← 0 if percent is NULL
driver_net         = final_fare − platform_fee

Timer:
  timer_start      = min(arrived_at + max_free_wait_seconds, started_at)
  ride_time_min    = ceil((completed_at − timer_start) / 60_000)
```

Source: `lib/fareCalc.ts` — the ONLY place this math lives. Never inline it.
BRTA ceiling violations are `logger.warn` only — never block.

### Critical Rules
- H3 resolution: **9** (~174m diameter)
- Batch size: **5 drivers per batch**, max **3 batches**
- Cell ring: configurable via `H3_MAX_RING_EXPANSION` env var (default 2)
- Deduction grace period: defined in heartbeat.ts
- `INSTANCE_COUNT=1` — single process, no split-brain

---

## 9. VERIFICATION COMMANDS

After each phase, run these commands to verify:

```bash
# Type checking
npx tsc --noEmit

# Linting
npx eslint .

# Database migration
npx drizzle-kit generate    # Generate migration SQL
npx drizzle-kit push         # Push to remote DB

# Seed scripts (Phase 2+)
node scripts/seed-system-config.js
node scripts/seed-platform-config.js
node scripts/seed-pricing.js
node scripts/seed-packages.js
node scripts/seed-admin.js

# Anti-pattern checks (run before every PR)
grep -r "@clerk\|stripe\|resend\|firebase" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v "docs/"
grep -r "console\.log" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v "lib/logger.ts"
grep -r "EXPO_PUBLIC_" lib/portpos.ts lib/auth.ts lib/activateSubscription.ts 2>/dev/null

# Start dev server
npx expo start

# Start utils-server
cd utils-server && npm start

# Auto-start timer verification (Phase 6+)
# Set a test ride to driver_arrived with arrived_at > 60s ago,
# wait 10 seconds, then check status = 'in_progress'
# (scheduler job reads system_config.max_free_wait_seconds)
```

### Pre-Flight Check (Run Once Before Any Code Change)

Before making your first code change in a session, confirm the codebase is clean:

```bash
npx tsc --noEmit   # Confirm the codebase compiles before you touch it
npx eslint .       # Confirm lint passes before your changes
```

If either fails, **stop** and report the failure. Do not proceed with implementation on a broken baseline.

---

## 10. KNOWN ISSUES TO BE AWARE OF

| ID | Area | Summary | Your Responsibility |
|----|------|---------|---------------------|
| TD-01 | SMS receiver | OEM battery optimisation kills BroadcastReceiver (30-60% Android). Manual OTP entry is fallback. | Ensure manual OTP entry always works as fallback |
| TD-04 | Scheduled rides | setInterval timers lost on utils-server restart. Startup recovery has 5s gap. | Implement startup recovery in scheduler.ts |
| TD-07 | Admin auth | No MFA for admin login. | Do not add MFA — just be aware |
| TD-11 | Scaling | In-process maps prevent >1 replica. | Set replicas=1, do not add clustering |
| TD-15 | Recovery | utils-server loses in-memory state on crash. | Startup recovery is already planned |
| TD-20 | Version enforcement | No mechanism to force driver updates. | GET /api/app-config exists for this |
| TD-25 | BRTA ceiling | Fare ceiling is logged, not blocked. | Use logger.warn only, never block |
| TD-31 | Supabase Data API | After Oct 30 2026, new tables need explicit GRANT statements. | Server-side Drizzle is unaffected |

---

## 11. OUTPUT FORMAT

After completing each task, output:

```
## Task [TASK-ID]: [Task Name]

**Status:** ✅ Complete / ❌ Blocked

**Files Changed:**
- `path/to/file.ts` — [what changed]

**Commands Run:**
- `npx tsc --noEmit` → passed/failed
- `npx eslint .` → passed/failed

**Validation Evidence:**
- [Specific verification from 14-DEV-CHECKLIST.yaml]

**Remaining Risk:**
- [Any concerns or follow-up items]
```

---

## 12. WHAT NOT TO DO

1. **Do not** modify files outside the current phase scope
2. **Do not** add dependencies not listed in `03-TECH-STACK.md`
3. **Do not** create new database tables not in `05-DATA-MODEL.md`
4. **Do not** add API endpoints not in `06-API.md`
5. **Do not** change business logic invariants (money, commission, dispatch rules)
6. **Do not** add comments that merely restate the code
7. **Do not** fix unrelated bugs or broken tests unless the current task requires it
8. **Do not** commit changes or create git branches unless explicitly asked
9. **Do not** add placeholder values, TODO comments, or stub implementations — implement fully
10. **Do not** hallucinate file paths, env var names, or package versions — always verify from the planning docs

---

## 13. COMMIT FORMAT

When asked to commit, use Conventional Commits with scope:

```
type(scope): description

feat(auth): add phone OTP verification screen
fix(dispatch): correct H3 ring expansion for edge cells
chore(deps): remove Clerk and Stripe packages
```

Scopes: `auth`, `dispatch`, `payment`, `ledger`, `admin`, `schema`, `driver`, `rider`, `chat`, `deps`, `config`

---

## 14. START

You are now ready to begin implementation.

**Your first action:** Read the 6 Tier 1 documents listed in Section 1. Then:
1. Run the **Pre-Flight Check** from Section 9 to confirm the baseline compiles
2. Run the **Implementation Status Check** (Section 2.2) for Phase 1 — assess what's already done
3. State which tasks are `✅ ALREADY DONE`, `⚠️ PARTIALLY DONE`, or `❌ NOT STARTED`
4. Begin with the first `❌ NOT STARTED` or `⚠️ PARTIALLY DONE` task in Phase 1

Begin with Phase 1, Task P1-01 from `14-DEV-CHECKLIST.yaml` unless the human specifies otherwise.
