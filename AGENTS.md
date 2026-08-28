# AGENTS.md — Ride

## Cross-Reference with CLAUDE.md

**Read CLAUDE.md for implementation context.** This file (AGENTS.md) provides:
- Critical rules (money, ownership, auth, dispatch)
- Essential commands and validation order
- Architecture map and package boundaries
- Environment variables reference
- Known issues to check before fixing bugs
- Deploy order

**When updating AGENTS.md:** You must also update CLAUDE.md if you change:
- Critical rules or conventions
- Architecture boundaries or package structure
- Environment variables reference
- Known issues list
- Any content that duplicates CLAUDE.md information

**When updating CLAUDE.md:** You must also update AGENTS.md if you change:
- Critical rules that should appear in the quick reference
- Implementation status or phase completion
- Architecture boundaries
- Essential commands or workflows

**The two files stay in sync.** AGENTS.md is the "quick reference" for day-to-day work. CLAUDE.md is the "deep dive" for implementation context. If you change one, review the other for consistency.

## What This Is

Ride is a subscription-based ride lead distribution platform for Bangladesh, rebuilt from the GlideX open-source codebase. Drivers buy call packages; riders request rides; the WebSocket dispatch engine matches them using H3 hexagonal geo-indexing.

### Current Implementation Status (as of 2026-08)

All core features are **fully implemented**:
- **Auth**: Supabase phone OTP (not Firebase/HMAC). `app/(auth)/phone-entry`, `otp-verify`, `register`. API routes in `app/api/auth/`. **No Firebase Cloud Functions exist.**
- **Payments**: PortPos unified gateway (not bKash/Nagad directly). `lib/portpos.ts` active. `lib/bkash.ts` and `lib/nagad.ts` are inert stubs (throw errors).
- **Dispatch**: WebSocket server in `utils-server/` with H3 indexing, sequential dispatch (one outstanding offer per ride), debit-on-offer lead billing (`leadBilling.ts`).
- **Database**: ~97 tables, ~32 enums in `src/db/schema.ts` (vehicleTypeEnum with 9 lowercase values, bodyTypeEnum, rideStatusEnum, pickupFeeStateEnum, etc.). Fare Framework v1 added: `zone_heat`, `zone_heat_history`, `pickup_distance_samples`, `fraud_flags`, `zone_recalibration_queue`, `cancel_surveys`. See `docs/Plan/IMPLEMENTATION-AGENT-PROMPT.md` § Database Schema for the full inventory — do not manually re-list all tables here or elsewhere; reference that doc.
- **Admin panel**: `app/admin/` with web-only routes for verification, packages, zones, configuration. **Phase F15** consolidated all admin entities (driver queue, lifecycle, incentives, promos, preferences, referral campaigns, point offers, vehicle models, sample media, platform config, monitoring) into one coherent dashboard. All 10 API items + 14 UI items built and tsc-clean. See `docs/Plan/14-DEV-CHECKLIST.yaml` phase F15. **Phase F16** (Ride Fare Framework v1) added 4 admin screens: `fare-config`, `heat-monitor`, `pickup-analytics`, `trust-safety`.
- **Chat**: In-app messaging with `store/useChatStore.ts` and `app/api/chat/`.
- **Driver flows**: Onboarding, home, offers, ledger. 7 Zustand stores in `store/`.

**Verification:** No Clerk, Stripe, or Firebase references remain in the codebase (checked 2026-06).

This repo has **two independently-typed packages**:
- **Root** (`package.json`): Expo app — React Native mobile client + Expo API routes (`app/api/`).
- **`utils-server/`** (`utils-server/package.json`): WebSocket dispatch server (`index.ts`, `dispatch.ts`, `dispatchChain.ts`, `leadBilling.ts`, `h3Index.ts`, `scheduler.ts`, `compensationWorker.ts`, `coldDrop.ts`, `trace.ts`, `firmQuote.ts`, `barikoiRoute.ts`, `polyline.ts`, `offPlatform.ts`). Separate `tsconfig.json`, separate dependencies.

`tsconfig.json` excludes `utils-server/` and `functions/`. ESLint ignores `utils-server/` and `_reference/`.

## Source of Truth (read in this order)

**Start with these:**
1. `docs/Plan/14-DEV-CHECKLIST.yaml` — Canonical implementation spec. Parse at session start. `failure_conditions` are hard blockers.
2. `docs/Plan/23-IMPLEMENTATION-HANDOFF-CHECKLIST.md` — Strict execution order H-00 through H-17.
3. `docs/Plan/20-DEVELOPER-CHANGE-LIST.md` — File-by-file code shapes per phase.
4. `AGENTS.md` (this file) — Critical rules, essential commands, architecture map, env vars reference, known issues.

**Then:**
5. `docs/Plan/06-API.md` — API and WebSocket contracts.
6. `docs/Plan/05-DATA-MODEL.md` — Database schema deltas.
7. `docs/Plan/13-CONVENTIONS.md` — Coding conventions and critical rules.
8. `docs/Plan/IMPLEMENTATION-AGENT-PROMPT.md` — Canonical backend spec: full schema (~97 tables, ~32 enums), auth flow, PortPos payment integration, dispatch engine architecture. Treat this as authoritative over any older doc that states a different table count.

**For frontend/backend AI-agent coding sessions:**
- `App Design/GoRide - Ride-Hailing App UI Kit (Preview)/GoRide-Wireframes.md` — Canonical 182-screen UI spec (Rider + Driver), with a standard-header convention note and per-screen build/modify guidance.
- `App Design/GoRide - Ride-Hailing App UI Kit (Preview)/implementationPrompt.md` — Three-part coding prompt: PART 0 is a terse BANNED/MANDATORY/TEMPLATE "Strict Agent Mode" for smaller coding agents (e.g. Raptor Mini) that struggle with long prose; PART 1/2 are the full prose Frontend/Backend prompts. All three reference the wireframe file and this AGENTS.md; keep screen-number priority tables and design-token values in sync if `GoRide-Wireframes.md` or `theme/goRide.ts`/`tailwind.config.js` ever change.

**For implementation methodology and what changed from GlideX:**
- `CLAUDE.md` — Implementation methodology, execution rules, development phases status, auth/dispatch flows, glossary.

**Additional reference files (lower priority, load as needed):**
`.claude/RULES.md`, `.claude/SECURITY.md`, `.claude/STYLEGUIDE.md`, `.claude/TESTING.md`, `.claude/WORKFLOWS.md`, `.claude/REVIEW-CHECKLIST.md`, `.claude/CONTEXT/phase-context.md`, `.claude/MEMORY/decisions.md`, plus other docs in `docs/Plan/`.

## Model Chain & Orchestration

Four roles: **Owner (Zia)** — final rulings, kickoff/field decisions · **Architect** — design brain, NO codebase access; its output is proposals/rulings, never verified state · **Orchestrator** — execution + gatekeeping; the only role that confirms on-disk state; verdict-first reporting to the owner (done / acceptable / rejected + messages to other models — no prose explanations) · **Planning/Coding models** — plan and build against the codebase.

Protocol (non-negotiable):
1. **Verify state assertions.** Any "X is done/closed/exists" claim from a party that cannot see the files is checked against disk before it becomes a ledger fact.
2. **Rulings beat artifacts.** Owner-chain rulings (Zia/Architect) win over artifact text. On divergence: the ruling wins, the divergence is recorded in-file — never silently reconciled.
3. **The file is the single source of truth.** If chat memory and the artifact file disagree, the file wins. Re-read before editing; re-grep after editing before calling anything closed.
4. **Handoffs are artifacts** (`.kilo/plans/*.md`), not chat history. Implementers start from disk state, with round-verification notes appended at the bottom.
5. **Orchestrator reports are verdict-first.** One-line verdict + short messages to the models concerned. Detail lives in the artifact files.

## Essential Commands

```bash
# Expo app
npx expo start                              # Dev server
npx expo run:android                        # Native build (required after plugin changes)
npx tsc --noEmit                            # Type check (must pass)
npm run lint                                # Lint (must pass; unused _-prefixed vars allowed). Uses legacy .eslintrc.json — do NOT run bare `npx eslint .`
npx jest --testPathPattern="name"           # Single test

# Database
npx drizzle-kit generate                    # Generate migration SQL from schema
npx drizzle-kit push                        # Push to remote Supabase DB

# utils-server (separate process)
cd utils-server && npm run dev              # Start WebSocket server with tsx watch

# Validation order: lint → typecheck → test (all must pass)

# Commit-time checks (run all)
# On Windows (PowerShell):
Get-ChildItem app/, lib/, utils-server/, src/ -Recurse -Include "*.ts", "*.tsx" | Select-String "console\.log"
# On Linux/Mac:
grep -r "console\.log" app/ lib/ utils-server/ src/       # must return nothing
grep -ri "clerk\|stripe\|firebase" app/ lib/ utils-server/ src/   # must return nothing
```

## ⛔ HARD CONSTRAINT: Expo Managed Workflow (Non-Negotiable)

The Ride project MUST remain on **Expo Managed workflow with Development Builds**. This is non-negotiable and applies to all future development, build configurations, and architectural decisions.

### What this means
- **NO bare workflow migration** — Do not eject to Expo bare workflow or React Native CLI. The project is intentionally designed to leverage Expo's managed services (OTA updates, EAS Build, EAS Submit).
- **NO react-native.config.js** — Do not add native module configurations that require bare workflow.
- **Development Builds ONLY** — When native code changes are needed, use Expo Development Builds (not Expo Go). Development builds allow custom native code while staying in the managed workflow.
- **EAS Build for production** — All production builds (Android APK/AAB, iOS IPA) must go through EAS Build. Do not use local builds for production releases.
- **EAS Submit for stores** - App Store and Play Store uploads must go through EAS Submit.
- **Keep app.json clean** — The `app.json` / `app.config.js` is the source of truth for Expo configuration. Do not duplicate settings in `eas.json` unless they're build-profile-specific.

### Why this matters
- OTA updates require managed workflow — `expo-updates` is incompatible with bare workflow.
- Simplifies CI/CD — No Xcode/Android Studio setup required for most team members.
- Consistent build environment — EAS Build provides reproducible builds across the team.
- Faster iteration — OTA updates allow instant bugfixes without new app store submissions.

## Architecture Map

- `app/(auth)/` — Auth screens (phone-entry → otp-verify → register)
- `app/(main)/(customer)/` — Rider screens (keep folder name `(customer)`, rider is a display label)
- `app/(main)/(rider)/` — Driver screens (folder name `(rider)` is legacy — contains driver flows, do not rename)
- `app/admin/` — Web-only admin panel (no parentheses — plain segment, not a route group)
- `app/api/` — Expo API routes (file-based backend, `[public]` prefix = no JWT required)
- `components/` — Shared UI components, flat (no `src/` prefix, no `components/common/` subfolder); has `components/admin/` and `components/auth/` subfolders only
- `theme/goRide.ts` — Single-file design token source (colors, typography, spacing, radii, shadows). Dark mode is handled by NativeWind `dark:` variants + `tailwind.config.js` aliases — there is no `ThemeProvider`/theme Context
- `lib/` — Shared utilities (auth, DB, map, payment, validation)
- `store/` — Zustand state stores (7 stores: useDriverStore, useRiderStore, useChatStore, useDriverStatusStore, usePackageStore, useCallLedgerStore, useDriverFlowStore)
- `src/db/schema.ts` — Drizzle schema (~97 tables, ~32 enums exported)
- `utils-server/` — WebSocket dispatch server (separate package)
- `scripts/` — Seed scripts (system-config, pricing, packages, platform-config, admin)

**Two backend services:**
1. Expo API routes (`app/api/`) — request/response, DB queries, JWT-gated.
2. Utils server (`utils-server/`) — stateful WebSocket dispatch, sequential chains with debit-on-offer lead billing, H3 index, scheduler, compensation worker. `INSTANCE_COUNT=1` required (no split-brain).

## Critical Rules

### Money
**Always integer paisa (BDT).** Never floats. Never strings. Divide by 100 only at UI display. Every `*_bdt` column and API field is integer paisa. Commission calculated on post-minimum-floor fare, never on raw total.

### Write Ownership (violating these is a critical bug)
- `call_ledger` deduction rows (`event_type='deduction'`, `reason='offer_sent'`) → ONLY `utils-server/leadBilling.ts` (`debitLeadForOffer` — Phase D debit-on-offer; `heartbeat.ts` is DELETED). Refund rows no longer exist: AC-7 accept-race refunds and the unconsumed-deduction sweep are deleted (ruling 8 — every offered driver is billed regardless of outcome)
- `call_ledger` all other event types (`initial_load`, `credit`, `expiry_writeoff`) → ONLY `lib/activateSubscription.ts`
- `dispatch_offers` new rows (outcome `delivered`) → ONLY `utils-server/leadBilling.ts` (inserted in the SAME transaction as the call_ledger deduction). Terminal-outcome updates and `fetch_confirmed_at` telemetry stamps → `utils-server/index.ts` (offer:accept `accepted`, offer:reject `rejected`, chain `expired` stamps, fetch:confirm stamps) and `utils-server/scheduler.ts` job 20 (stale-offer crash-recovery `expired` flips, threshold `dispatch_offer_ttl_seconds + 5s`). `utils-server/dispatch.ts` no longer writes dispatch_offers (no 'filtered' audit rows — pool exclusions are not persisted). Sequential dispatch = one outstanding offer per ride, debit at offer time (`utils-server/dispatchChain.ts` holds the in-memory chain state)
- `payment_events` row creation + PortPos invoice initiation → ONLY `lib/paymentEvents.ts` (`initiatePortposPayment`, `createZeroAmountPaymentEvent`), called by `app/api/rider/wallet/topup+api.ts`, `app/api/rider/passes+api.ts`, `app/api/driver/wallet/topup+api.ts`, `app/api/package/purchase+api.ts`
- `payment_events` status transitions (`paid`/`failed`, `confirmed_at`, `subscription_id`) → `lib/activateSubscription.ts`, `app/api/payment/portpos/callback+api.ts`, and `lib/paymentRepair.ts` (`repairPaymentEvent` — shared transactional repair invoked by the callback itself and by `utils-server/compensationWorker.ts`; audited Z-2/Z-3)
- `platform_config` gains one job-writer: `heat_backtest_correlation` via scheduler job 37 (weekly backtest). All other `platform_config` writes are admin-only via `PATCH /api/admin/config`.
- No other file writes these tables directly.

### Payments (PortPos callback security)
- `app/api/payment/portpos/callback+api.ts` is a public endpoint that credits wallets / activates subscriptions. It MUST call `portposClient.verifyIPN(invoiceId, amountTaka)` (secret-bearing) and Zod-validate the PortPos response BEFORE touching any state. Never remove the signature check.
- The callback compares the invoice amount against the locally-stored `payment_events.amount_bdt` in integer paisa (never float taka).

### Auth
Supabase phone OTP. Client uses `lib/supabase.ts` (`EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`). Server uses `lib/supabaseServer.ts` (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`). Protected API routes call `verifySupabaseToken(request)` or `requireRole(request, role)` from `lib/auth.ts`. **No exceptions.** No `x-user-id` header substitution.

### Vehicle Types
9 lowercase values: `bike_basic`, `bike_standard`, `bike_plus`, `cng`, `car_compact`, `car_economy`, `car_comfort`, `car_premium`, `car_xl`. Import Zod enum from `lib/vehicleTypes.ts` — never define inline. Old values (`MOTORCYCLE`, `CNG_AUTO_RICKSHAW`, `CAR`, `MICROBUS`) are removed. `car_compact` sits between `cng` and `car_economy` in tier order.

### Packages
Call packages may be scoped to a specific vehicle type via `packages.vehicle_type` (nullable). NULL = universal (every driver sees it and can buy it); non-null = only drivers whose `drivers.vehicle_type` matches see it in `GET /api/package/list` and can purchase it. `POST /api/package/purchase` returns `403 vehicle_type_mismatch` if a driver tries to buy a package scoped to a different vehicle type. Mirrors the `incentive_definitions.vehicle_type_filter` pattern. Admin sets the scope via the Packages screen or `POST /api/admin/packages`.

### H3
`h3-js` is imported ONLY in `lib/h3.ts` and `utils-server/h3Index.ts`. All other files use the wrappers. Resolution 9 (~174m diameter).

### Removed Technologies
No Clerk/Stripe/Firebase. Any reference is a bug.

### platform_config
Never cache. Read from DB at every request. Admin changes via `PATCH /api/admin/config` must take effect without restart.

### Timestamps
Always UTC `timestamptz`. Convert to `Asia/Dhaka` only at display. Use `lib/time.ts` → `nextBdtMidnightUtc()` for Dhaka midnight calculations (e.g., `daily_reset_at`).

### Validation & Errors
- Zod at every API route boundary before any DB/service call. Use `parsed.data` after `safeParse`, never raw request body.
- POST/PUT/PATCH bodies: use `parseJsonBody(request, schema)` from `lib/parseBody.ts` — it handles body reading + Zod validation and returns a `{ ok, response }` discriminated union. Never call `await request.json()` directly.
- URL path params (dynamic segments): validate with `z.string().uuid()` before any DB query. Invalid UUIDs return `400 invalid_uuid`.
- Error format: `{ error: 'machine_code', message: 'Human description' }`. Never expose stack traces or Drizzle internals.
- Bodyless POST endpoints (e.g. `auth/logout`, `auth/verify-token`, `driver/break/start|end`, `user/request-data`) take no request body — the only input boundary is the auth token, so `parseJsonBody` is NOT required there. Any POST that reads a body MUST validate it.

### Expo API Routes (NOT Next.js)
Expo's `@expo/server` adapter passes dynamic route params **directly** as the second argument — flat, NOT wrapped in `{ params }`. This differs from Next.js.

**Correct (Expo):**
```ts
// file: app/api/admin/ride/[id]/chat+api.ts
export async function GET(request: Request, { id }: { id: string }) {
  // id is available directly
}
```

**WRONG (Next.js convention — crashes in Expo):**
```ts
// ❌ params will be undefined, destructuring throws TypeError
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { id } = params; // 💥 TypeError: Cannot destructure property 'id' of undefined
}
```

This caused BUG-1 and BUG-2 in the admin panel — the handlers crashed before UUID validation could run. All 7 dynamic-segment admin routes were fixed in commit `9fdfd0c0`.

**Server entry point** (`server.js`): must buffer the request body stream for non-GET/HEAD methods before constructing the Web `Request`. Without this, POST/PUT/PATCH bodies arrive empty and `request.json()` throws `SyntaxError: Unexpected end of JSON input`.

### Logging
No `console.log`. Use `lib/logger.ts` (`logger.info`, `logger.error`, etc.).

### Drizzle
- **Property names are snake_case throughout** (e.g., `base_amount_bdt`, `tax_rate_id`, `ride_id`). The JS property name in `pgTable()` definitions matches the DB column name. This applies to ALL tables — existing and new. Do NOT use camelCase property names (e.g., `baseAmountBdt`) even though Drizzle supports it. Libs and API routes reference the same snake_case names. This was confirmed during the P4 Tax Engine audit — the REFERENCE.md camelCase recommendation was wrong for this codebase.
- Transactions required for all writes touching `call_ledger`, `subscriptions`, `payment_events`, `tax_ledgers`, `accounting_entries`, or `accounting_entry_lines`.
- Use `typeof schema.$inferSelect` / `typeof schema.$inferInsert` — never manually redeclare DB row types.
- Driver `min_per_km_bdt` validation: use `validateDriverMinKm()` from `lib/validateMinPerKm.ts` — never inline.
- **NULL checks**: use `isNull(col)` / `isNotNull(col)`. NEVER `eq(col, null)` — it compiles to `col = NULL` which is always false in SQL (NULL is not equality-comparable). This caused the critical BUG-3 (packages GET returned `[]` despite rows existing).
- **Money columns**: ALL `*_bdt` columns are `integer` (paisa). The ONLY exception is `rate_percent` columns (e.g., `tax_rates.rate_percent`) which are `numeric(5,2)` because they store a percentage (5.00), not money.
- **Self-referencing FKs**: use the `(): any => tableName.id` pattern to avoid TypeScript circular reference errors. (Historical example: `accountingAccounts.parentId` — the column has since been made snake_case; the pattern rule stands.)

### Dispatch Logic
- Sequential chain: one outstanding offer per ride at any time (`utils-server/dispatchChain.ts` holds in-memory chain state). No chain-length cap.
- Bill-on-offer: lead debited at offer time (not fetch:confirm). Every offered driver is billed regardless of outcome (accept/reject/expire). `fetch:confirm` is telemetry-only.
- Ordering tiers (applied to score, stable sort desc): (1) new-driver protection tier (`new_driver_priority_leads` within `new_driver_priority_days`), (2) cold-drop boost Lever 2 (temporary multiplier decaying over ~15 min), (3) return-lead affinity Lever 3 (pickup zone matches recent cold drop zone), (4) existing commute bonus (1.1×).
- Auto-accept relocated to offer step (rating ≥ 4.8, radius gate, first-wins). Auto-accept drivers billed the same 1 lead.
- Pool filters unchanged: vehicle type (BEFORE H3 scoring), calls_remaining > 0 / unlimited, daily cap, chain-exclusion (previously billed drivers skipped), suspension/online, commute, min_per_km, blocklist, female-preference, cooldown.
- Daily cap check belongs in dispatch candidate pool construction (`dispatch.ts`); `leadBilling.ts` re-checks it as defense-in-depth inside the debit transaction.
- `dispatch_offers` has a unique index on `(ride_id, driver_id)` preventing the same driver receiving the same ride twice. `call_ledger` has a SEPARATE partial unique index on `(ride_id, driver_id) WHERE event_type='deduction'`. Do not confuse the two.
- Surge is fully removed. No surge tables, columns, code, or UI references remain.

### Client Secrets
Payment credentials (`PORTPOS_APP_KEY`, `PORTPOS_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are server-side only. Never in `EXPO_PUBLIC_*` vars.

### TypeScript Rules
- No `any`, no `@ts-ignore`, no `@ts-expect-error` without explanatory comment. **Exception**: Drizzle type casts (`as any`) are permitted for enum comparisons and FK-column insert inference gaps — see `docs/Plan/13-CONVENTIONS.md` § Drizzle type casts.
- `interface` for DB row shapes and API response shapes. `type` for unions.
- Exhaustive switch statements on enums/unions: `default: assertNever(value)` (import from `@/lib/utils`).
- WebSocket message types defined in `utils-server/types.ts`.

### Database Tables
All tables: uuid PKs, created_at/updated_at timestamptz. Append-only tables (`call_ledger`, `dispatch_offers`, `used_challenges`, `rate_limits`) are exempt from `updated_at`. Soft deletes (`deleted_at` column, no hard deletes) exist on: users, packages, promoCodes, documents, incentiveDefinitions, riderAddresses. Rides use status transitions (`cancelled`/`expired`) instead of `deleted_at`; drivers use `status` (`suspended`/`rejected`) instead of `deleted_at`.

### File Naming
- `lib/`: camelCase (`fareCalc.ts`, `activateSubscription.ts`)
- `app/api/`: kebab-case with `+api.ts` (`purchase+api.ts`)
- `components/`: PascalCase (`CallWalletCard.tsx`)
- `store/`: `use{Name}Store.ts` (`usePackageStore.ts`)
- WebSocket events: `{domain}:{action}` kebab-case (`ride:offer`, `fetch:confirm`, `location:update`)

### ESLint
Legacy `.eslintrc.json` config (NOT flat config). Always lint via `npm run lint` (script sets `ESLINT_USE_FLAT_CONFIG=false`). Unused vars with `_` prefix allowed. Config ignores `_reference/` and `utils-server/`.

## Environment Variables

Two `.env` files:
- `.env.local` — Expo app (API routes)
- `utils-server/.env` — WebSocket server

Required Expo app server vars: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PORTPOS_APP_KEY`, `PORTPOS_SECRET_KEY`, `PORTPOS_BASE_URL`, `PORTPOS_CALLBACK_URL`, `BARIKOI_API_KEY`, `UTILS_SERVER_PORT` (default `3001`), `WEBSOCKET_INTERNAL_SECRET` (min 32 chars).

Required utils-server vars: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEBSOCKET_INTERNAL_SECRET`, `INSTANCE_COUNT` (must be `"1"`), `BARIKOI_API_KEY` (required for firm-quote routing in `barikoiRoute.ts`).

Required client vars (safe for `EXPO_PUBLIC_`): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_BARIKOI_API_KEY`, `EXPO_PUBLIC_SERVER_URL`, `EXPO_PUBLIC_WEB_SOCKET_SERVER_URL`, `EXPO_PUBLIC_SUPPORT_PHONE`.

Full reference: `docs/Plan/11-ENV-VARS.md`.

## Testing

- `npx jest --testPathPattern="name"` — single test
- At phase gates run: `npx jest --watchAll=false` (full suite)
- **Dispatch invariants (Phase D — sequential dispatch, debit-on-offer)** that must always pass: (1) exactly one outstanding offer per ride at any time, (2) single deduction per `(ride_id, driver_id)`, (3) `calls_remaining = 0` drivers never in candidate pool, (4) daily cap exceeded drivers never in candidate pool, (5) no driver receives the same offer twice, (6) every offered driver has a `call_ledger` deduction row regardless of outcome (accept/reject/expire/auto-accept), (7) declined/expired offer → next candidate offered, (8) rider cancel mid-chain → chain aborts, no further offers, no refunds, (9) re-dispatch → previously billed drivers not re-billed, (10) billing atomicity — `dispatch_offers` row + deduction commit in ONE transaction.
- **Payment invariants**: (1) same idempotency key → exactly one `payment_events` row, (2) duplicate callback activates subscription exactly once, (3) failed activation → `compensation_queue` entry within 30 seconds.
- Test templates: `docs/Plan/22-TEST-TEMPLATES.md`.

### Maestro / UI-flow testing — mandatory pre-reads
Before generating, editing, or evaluating ANY Maestro YAML flow file, read in full:
1. `.claude/rules/testing-agent.md` — 4 non-negotiable rules: (1) Section 4 Feature Coverage Matrix is the only feature source of truth, NOT `FEATURES.md`; (2) Section 17 folder paths are authoritative; (3) the 6 Section 20 pre-implementation gates are hard blockers — refuse to generate and report open gates if unmet; (4) generate all 29 subflows before any module/E2E flow.
2. `plans/maestro-architecture.md` — complete enterprise QA blueprint (157 features, 195 planned flows, 12 testability gaps). Carries a top-of-file MANDATORY READ banner.

## Graph Maintenance

After modifying any code files, run:
- `code-review-graph update` — always (fast, <2s)
- `graphify update .` — after large batches of changes only

### Codebase Memory MCP

`codebase-memory-mcp` is available as an additional tool for code understanding and structural analysis. It can be used alongside `code-review-graph` and `graphify` — do not treat it as a replacement for either.

Use it when:
- You need fast structural queries across the codebase (`search_graph`, `trace_path`, `get_architecture`, `detect_changes`, etc.)
- You want to explore relationships or trace call paths without running a full graph rebuild
- You are investigating unfamiliar areas and need an index-assisted overview

It complements the existing graph tools; run it in addition to them when it adds value to the current task.

## Known Issues (`docs/Plan/18-KNOWN-ISSUES.md` — check before fixing bugs)

- **TD-01:** SMS receiver killed by OEM battery optimization on 30-60% of Android devices. Manual OTP entry is the fallback.
- **TD-11:** In-process maps prevent >1 replica. `INSTANCE_COUNT=1` always.
- **TD-15:** utils-server loses all in-memory state on crash. Startup recovery exists.
- **TD-31:** After Oct 30 2026, new tables need explicit GRANT statements for supabase-js/PostgREST access. Server-side Drizzle unaffected.
- **FOLLOWUP-A:** `vehicle_class_letter` hardcoded to `KA`. Multi-class support is a separate feature.
- **FOLLOWUP-B:** `registration_area` hardcoded to `DHAKA_METRO`. Multi-city support is a separate feature.

## Git Conventions

- Commit format: `type(scope): description` (Conventional Commits)
- Scopes: `auth`, `dispatch`, `payment`, `ledger`, `admin`, `schema`, `driver`, `rider`
- Branch names: `type/short-description` (e.g., `feat/hmac-auth`, `fix/call-deduction-race`)
- Protected branches: `main`, `develop` — no force push, PR required.

## Deploy Order

1. `npx drizzle-kit push` (DB migrations)
2. `utils-server` (depends on current schema)
3. EAS build + submit (last — references updated API)

`INSTANCE_COUNT=1`. Not independently rollback-safe (fare framework changes + dispatch code are one release).

## MCP Tool Selection Policy (Strict Priority Order)

Follow this EXACT order. Do NOT skip to a lower-priority tool if a higher-priority one can achieve the goal.

---

### 1. Sequential Thinking (ALWAYS FIRST)
- **Trigger**: Any task with 3+ steps, architectural decisions, refactoring, or uncertainty.
- **Action**: Break the problem into a step-by-step plan before touching any other tool.
- **Rule**: NEVER execute code changes without first logging a plan here for complex tasks.

---

### 2. Context7 (External Knowledge)
- **Trigger**: Any question about third-party libraries, frameworks, or packages.
- **Action**: Fetch the latest API docs BEFORE writing code that uses that library.
- **Rule**: If Context7 has the docs, do NOT use Fetch or Search as a fallback.

---

### 3. Memory (Context Persistence)
- **Trigger**: Storing decisions, architecture choices, bug fixes, or patterns for future sessions.
- **Action**: Call `write_memory` after completing a significant task.
- **Rule**: Check `read_memory` at the start of a session if the user says "remember" or mentions a previous decision.

---

### 4. Serena (Semantic Code Operations) — PRIMARY for code
- **Trigger**: ANY operation on existing project code (reading, finding, editing, refactoring).
- **Preferred Tools**: `find_symbol`, `find_referencing_symbols`, `replace_symbol_body`, `insert_after_symbol`.
- **Rule**: NEVER use Filesystem or Git to read or edit existing code files if Serena can handle it.

---

### 5. Playwright (UI & Browser)
- **Trigger**: Visual testing, UI verification, E2E tests, or any task requiring a live browser.
- **Rule**: Only use AFTER the code is written and the dev server is running.

---

### 6. Git (Local Version Control)
- **Trigger**: Committing changes, checking status, viewing diffs, creating branches.
- **Rule**: Use Git for local VCS operations. Use GitHub MCP (if added later) for PRs/Issues.

---

### 7. Fetch (Web Scraping / Fallback Docs)
- **Trigger**: ONLY when Context7 does NOT have the documentation you need.
- **Rule**: Ask the user for permission before scraping large pages.

---

### 8. Filesystem (Raw File I/O) — LAST RESORT
- **Trigger**: ONLY for non-code files (README, .env, package.json, .yaml, .toml) OR creating entirely new files from scratch.
- **RULE**: NEVER use Filesystem to modify existing code files (.py, .js, .ts, .java, .go, .rs, .cpp, etc.). That is Serena's job.
