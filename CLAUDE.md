# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Cross-Reference with AGENTS.md

**Read AGENTS.md first for critical rules and commands.** This file (CLAUDE.md) focuses on:
- Implementation methodology and execution rules
- Source of truth hierarchy and what changed from GlideX
- Development phases and their current status
- Auth/dispatch flows
- Glossary

**When updating CLAUDE.md:** You must also update AGENTS.md if you change:
- Critical rules (money, auth, dispatch, database)
- Architecture boundaries or package structure
- Environment variables reference
- Known issues list
- Essential commands

**When updating AGENTS.md:** You must also update CLAUDE.md if you change:
- Implementation status
- Development phases or gates
- What's implemented vs planned
- Any methodology or workflow guidance

**The two files stay in sync.** AGENTS.md is the "quick reference" for day-to-day work. CLAUDE.md is the "deep dive" for implementation context.

## Quick Reference

For the most up-to-date command reference, critical rules, and architecture map, see **AGENTS.md**. This file focuses on implementation methodology, source of truth hierarchy, and what has changed from the original GlideX codebase.

## Implementation Methodology

This is a **modification of existing GlideX code**, not a greenfield build. Follow these execution rules:

1. Use strict execution order from `docs/Plan/23-IMPLEMENTATION-HANDOFF-CHECKLIST.md`, with phase definitions from `docs/Plan/14-DEV-CHECKLIST.yaml` and file-level changes from `docs/Plan/20-DEVELOPER-CHANGE-LIST.md`.
2. Follow API and WebSocket contracts in `docs/Plan/06-API.md`, UX/UI contracts in `docs/Plan/07-USER-FLOWS.md`, `docs/Plan/08-UI-SPEC.md`, `docs/Plan/09-UX-SPEC.md`, and test requirements in `docs/Plan/22-TEST-TEMPLATES.md`.
3. Complete one handoff step at a time — do not reorder.
4. Stop immediately on any failure condition from `docs/Plan/14-DEV-CHECKLIST.yaml`, fix, then continue.
5. After each completed step, output: Step completed, Files changed, Commands run, Validation evidence, Remaining risk.
6. Keep changes minimal and scoped to current step only.
7. Do not modify checklist scope unless explicitly requested.
8. Preserve existing GlideX business behavior unless plan explicitly changes it.
9. At phase boundaries, run full validation and provide a go or no-go recommendation.

## Source of Truth

Read in this order:

**Primary:**
- **`AGENTS.md`** — Critical rules, essential commands, architecture map, known issues, env vars reference
- **`docs/Plan/14-DEV-CHECKLIST.yaml`** — Canonical machine-readable implementation spec. Parse at start of every session. Treat `failure_conditions` as hard blockers.
- **`docs/Plan/23-IMPLEMENTATION-HANDOFF-CHECKLIST.md`** — Strict ordered execution through H-00 through H-17. Do not reorder.
- **`docs/Plan/20-DEVELOPER-CHANGE-LIST.md`** — File-by-file implementation guide with exact code shapes per phase.

**Contracts:**
- **`docs/Plan/06-API.md`** — API and WebSocket event contracts.
- **`docs/Plan/05-DATA-MODEL.md`** — Database schema deltas from GlideX.
- **`docs/Plan/13-CONVENTIONS.md`** — Coding conventions, naming, and critical Ride-specific rules.

**Additional reference (load as needed):**
- `docs/Plan/02-ARCHITECTURE.md` — Component map: what's KEEP/REPLACE/DELETE/ADD from GlideX.
- `docs/Plan/07-USER-FLOWS.md` — User flow specs with all alternate paths.
- `docs/Plan/08-UI-SPEC.md` — Screen specs with GoRide design tokens.
- `docs/Plan/09-UX-SPEC.md` — Interaction contracts and GoRide micro-interactions.
- `docs/Plan/01-PRD.md` — Product requirements with acceptance criteria.
- `docs/Plan/03-TECH-STACK.md` — Package changes from GlideX baseline.
- `docs/Plan/04-ADR.md` — Architecture Decision Records explaining WHY decisions were made.
- `docs/Plan/10-DEV-SETUP.md` — Local dev setup steps (execute in order).
- `docs/Plan/11-ENV-VARS.md` — Complete env var reference.
- `docs/Plan/12-FOLDER-STRUCTURE.md` — File delta from GlideX (delete/replace/add).
- `docs/Plan/15-RUNBOOK-DEPLOY.md` — Deploy procedures for all 3 components.
- `docs/Plan/16-INCIDENT-RESPONSE.md` — Ride-specific incident response (P1-P4).
- `docs/Plan/17-MONITORING.md` — Dashboards and alert thresholds.
- `docs/Plan/18-KNOWN-ISSUES.md` — Known bugs and tech debt (check before fixing bugs).
- `docs/Plan/19-GLOSSARY.md` — Canonical domain term definitions.
- `docs/Plan/21-MIGRATION-SQL.md` — SQL migration reference.
- `docs/Plan/22-TEST-TEMPLATES.md` — Unit test templates for critical modules.

> ⚠️ **The root `README.md` is stale.** It is the original GlideX README and contradicts the current architecture (it documents Clerk auth, Stripe payments, Google Maps, Firebase storage, Neon DB, and wrong store names). **Do not trust it.** Auth = Supabase phone OTP, payments = PortPos, maps = Barikoi/MapLibre, storage = Supabase, DB = Supabase Postgres. For accuracy, read this file and AGENTS.md instead. (If you rewrite README.md, update or remove this note.)

## Project Overview

**Ride** is a subscription-based ride lead distribution platform for Bangladesh. Drivers buy call packages and keep the fare minus optional platform commission. Rebuilt from the GlideX open-source ride-hailing codebase.

### Key differences from GlideX (current implementation)

| Area | GlideX (Old) | Ride (Current) |
|------|--------------|----------------|
| **Auth** | Clerk (email/social) | **Supabase Auth phone OTP** |
| **Payments** | Stripe | **PortPos unified gateway** (bKash/Nagad stubs kept inert) |
| **Map** | Google Maps | **Barikoi Maps API** (via @maplibre/maplibre-react-native) |
| **Driver monetization** | Per-ride fare | Subscription call-package wallet |
| **Dispatch** | None | H3 hexagonal indexing + WebSocket batch broadcast |
| **Admin** | None | Web admin panel |
| **Database** | Neon + Prisma | **Supabase PostgreSQL + Drizzle ORM** |
| **Cloud Functions** | Firebase (planned) | **None** — all backend in Expo API routes + utils-server |

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

### Architecture Boundaries

Two independently-typed packages:
1. **Root** (`package.json`): Expo app — React Native mobile client + Expo API routes (`app/api/`)
2. **`utils-server/`** (`utils-server/package.json`): WebSocket dispatch server with separate `tsconfig.json` and dependencies

`tsconfig.json` excludes `utils-server/` and `functions/` (functions/ doesn't exist). ESLint ignores `utils-server/` and `_reference/`.

## Development Commands

See AGENTS.md for the complete command reference. Key commands:

```bash
# Expo app
npx expo start                  # Dev server  (alias: `npm start`)
npx expo run:android            # Native build (required after plugin changes)
npx tsc --noEmit                # Type check (must pass)
npm run lint                    # Lint (must pass; unused _-prefixed vars allowed)
npx jest --testPathPattern="name"  # Single test

# Database
npx drizzle-kit generate        # Generate migration SQL from schema
npx drizzle-kit push            # Push to remote Supabase DB  (alias: `npm run push`)

# utils-server (separate process)
cd utils-server && npm run dev  # Start WebSocket server with tsx watch

# Commit-time checks (run all)
grep -r "console\.log" app/ lib/ utils-server/ src/       # must return nothing
grep -ri "clerk\|stripe" app/ lib/ utils-server/           # must return nothing
```

## Architecture Map

### Route Structure (Expo Router)
- `app/(auth)/` — Auth screens (phone-entry → otp-verify → register). **Supabase phone OTP**.
- `app/(main)/(customer)/` — Rider screens (keep folder name `(customer)`, rider is a display label)
- `app/(main)/(rider)/` — Driver screens (folder name `(rider)` is legacy — contains driver flows, do not rename)
- `app/admin/` — Web-only admin panel (dashboard, verification, packages, zones, configuration) — no parentheses, plain segment not a route group
- `app/api/` — Expo API routes (file-based backend, `[public]` prefix = no JWT required)
- `components/` — Shared UI components, flat (no `src/` prefix, no `components/common/` subfolder); has `components/admin/` and `components/auth/` subfolders only
- `theme/goRide.ts` — Single-file design token source (colors, typography, spacing, radii, shadows). Dark mode via NativeWind `dark:` variants + `tailwind.config.js` aliases — no `ThemeProvider`/theme Context

> **Expo API route params**: Dynamic segment params are passed **directly** as the second argument (`{ id }`), not wrapped in `{ params: { id } }` like Next.js. See Critical Coding Rules below.

### 🧪 Testing / Maestro Work — Mandatory Pre-Reads

**Before generating, editing, or evaluating ANY Maestro YAML flow file**, you MUST read — in full, no skipping:
1. **`.claude/rules/testing-agent.md`** — the 4 non-negotiable rules (feature scope source, folder layout source, the 6 pre-implementation gates as hard blockers, and "subflows before flows").
2. **`plans/maestro-architecture.md`** — the complete enterprise QA blueprint (157 features, 16 business capabilities, 6 state machines, 29 subflows, 20 journeys, 24 edge cases, 195 planned flows, 12 testability gaps). It carries a top-of-file MANDATORY READ banner.

If you cannot confirm the six Section 20 gates are complete, **do not generate flows** — refuse and report which gates are open (per Rule 3 of `testing-agent.md`).

### Auth System (Supabase — Implemented)
- **Client**: `lib/supabase.ts` — client-side Supabase client (`EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`)
- **Server**: `lib/supabaseServer.ts` — server-side admin client (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`)
- **Middleware**: `lib/auth.ts` — `verifySupabaseToken(request)` and `requireRole(request, role)` using `supabaseAdmin.auth.getUser(jwt)`
- **Flow**: `signInWithOtp({ phone })` → SMS OTP → `verifyOtp({ phone, token, type: 'sms' })` → verify-token API → register API
- **WebSocket auth**: `utils-server/index.ts` uses `supabaseAdmin.auth.getUser()` for auth:hello and auth:refresh

### Key Libraries (implemented)
- **UI**: NativeWind (TailwindCSS), Lottie, react-native-paper, GoRide design tokens in `theme/goRide.ts`
- **State**: Zustand stores in `store/` (7 stores: useDriverStore, useRiderStore, useChatStore, useDriverStatusStore, usePackageStore, useCallLedgerStore, useDriverFlowStore)
- **Map**: `@maplibre/maplibre-react-native` + Barikoi API (`barikoiapis`) via `utils/mapUtils.ts`
- **Database**: Supabase PostgreSQL + Drizzle ORM (`src/db/schema.ts`) — 49 tables, 26 enums
- **Auth**: Supabase Auth phone OTP (`lib/auth.ts`, `lib/supabase.ts`, `lib/supabaseServer.ts`)
- **Storage**: Supabase Storage (`driver-documents` bucket via `lib/imageToURL.ts`)
- **Payments**: PortPos via WebView (`lib/portpos.ts`, `components/PaymentWebView.tsx`). Old `lib/bkash.ts` and `lib/nagad.ts` kept as inert fallback.
- **WebSocket**: `ws` library in `utils-server/` (dispatch.ts, heartbeat.ts, h3Index.ts, scheduler.ts, compensationWorker.ts)
- **Geo**: H3 hex grid (`lib/h3.ts`) at resolution 9. Import only via `lib/h3.ts` and `utils-server/h3Index.ts`.
- **SMS**: Supabase Auth handles OTP delivery natively. Android SMS_RETRIEVER_API via `react-native-otp-verify`.
- **Validation**: Zod at every API route boundary (`lib/vehicleTypes.ts` exports `VEHICLE_TYPE_ZOD_ENUM`)
- **Logging**: `lib/logger.ts` — use `logger.info`, `logger.error`, etc. No `console.log`.

### Backend Services (implemented)
1. **Expo API Routes** (`app/api/`) — Business logic, DB queries, rate limiting. Supabase JWT required (unless marked `[public]` or using `requireRole`).
2. **Utils Server** (`utils-server/`) — WebSocket dispatch, heartbeat-gated call deduction, H3 index, scheduler, compensation worker. Separate package.json with own dependencies.

### Auth Flow (implemented)
```
phone-entry → supabase.auth.signInWithOtp({ phone }) → SMS OTP
otp-verify → supabase.auth.verifyOtp({ phone, token, type: 'sms' }) → session
verify-token → GET /api/auth/verify-token → { exists, role } or { exists: false }
register → POST /api/register → create user + optional driver record → role home
```

### Dispatch Flow (implemented)
```
Rider requests ride → POST /api/ride/request → zone check + fare calc
  → WebSocket server: H3 cell lookup → score candidates (distance 40% + rating 30% + acceptance 20% + availability 10%)
  → Batch broadcast (k=2 cell ring, batch size 5, max 3 batches)
  → Driver fetch:confirm → heartbeat deduction window (call_ledger write, unique on ride_id+driver_id)
```

### Database Schema (49 tables, 26 enums, implemented)
See `docs/Plan/IMPLEMENTATION-AGENT-PROMPT.md` § Database Schema or `docs/Plan/05-DATA-MODEL.md` for the full, authoritative table/enum inventory — do not manually re-list all 49 tables here; this avoids the list drifting out of sync (this section previously understated the count as "22 tables" for that reason).

### Seed Scripts (`scripts/`)
`seed-system-config.js`, `seed-pricing.js`, `seed-packages.js`, `seed-platform-config.js`, `seed-admin.js`

### Deploy Order (dependency-aware)
```
1. DB migrations (drizzle-kit push)
2. utils-server (depends on current schema)
3. EAS build + submit (last — references updated API)
```

## Development Phases (current state)

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 1 | Foundation — GlideX Cleanup | ✅ Done | Clerk/Stripe removed |
| 2 | Database Schema | ✅ Done | All tables, enums, migrations |
| 3 | Supabase Auth Integration | ✅ Done | Replaced Firebase HMAC plan |
| 4 | Auth Layer | ✅ Done | Screens, middleware, verify-token |
| 5 | Payment System | ✅ Done | PortPos implemented |
| 6 | Dispatch Engine | ✅ Done | WebSocket, H3, heartbeat, scheduler |
| 7 | Driver Flows | ✅ Done | Onboarding, home, offers, ledger |
| 8 | Rider Flows | ✅ Done | Request, pricing, tracking, cancel |
| 9 | Admin Panel (basic) | ✅ Done | Approval queue, packages, zones (subset) |
| 10 | In-App Chat | ✅ Done | Rider-driver messaging |
| 11 | Commission & Waiting Time | — | Post-MVP decision gate |
| F7–F14 | Feature bundles (offer sheet, promos, incentives, preferences, SOS, wallets, referrals, vehicle models, face match, vehicle media) | ✅ Done | Underlying tables and APIs shipped |
| **F15** | **Admin Dashboard Consolidation** | ✅ **Done** | Full web-only admin panel: 10 API items + 14 UI items built and tsc-clean. Includes `packages.vehicle_type` scoping (F15-API-10). See `docs/Plan/14-DEV-CHECKLIST.yaml` phase F15. |

**Note:** Phase 3 was originally "Firebase Cloud Functions" in planning documents, but was **replaced by Supabase Auth**. The `functions/` directory does not exist. All auth logic is in Expo API routes (`app/api/auth/`) and client screens (`app/(auth)/`).

## Handoff Gates (H-00 to H-17)

See `docs/Plan/23-IMPLEMENTATION-HANDOFF-CHECKLIST.md` for full gate definitions.

## Glossary (key domain terms)

See `docs/Plan/19-GLOSSARY.md` for complete glossary. Key terms:
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

See AGENTS.md for the complete rules reference. Key rules:

- **Money**: All amounts in integer paisa (BDT), never floats. Divide by 100 only at UI display.
- **Vehicle types**: 8 lowercase: `bike_basic`, `bike_standard`, `bike_plus`, `cng`, `car_economy`, `car_comfort`, `car_premium`, `car_xl`
- **call_ledger writes**: ONLY `utils-server/heartbeat.ts` (deductions) and `lib/activateSubscription.ts` (initial_load, credit, expiry_writeoff)
- **dispatch_offers writes**: ONLY `utils-server/dispatch.ts` and `utils-server/heartbeat.ts`
- **Single instance**: `INSTANCE_COUNT=1` required for WebSocket dispatch (no split-brain)
- **No client secrets**: Payment credentials never in `EXPO_PUBLIC_*` vars
- **No Clerk/Stripe**: Removed entirely — any reference is a bug
- **No Firebase**: Supabase replaced all Firebase auth. Any Firebase reference is a bug.
- **Timestamps**: Always UTC `timestamptz`, convert to Asia/Dhaka only at display
- **Zod validation**: Every API route validates input before DB/service calls
- **Body parsing**: Use `parseJsonBody(request, schema)` from `lib/parseBody.ts` for POST/PUT/PATCH bodies. Never call `await request.json()` directly.
- **Expo route params**: Expo passes dynamic segment params directly as the 2nd arg: `GET(request, { id }: { id: string })`. NEVER use the Next.js `{ params }: { params: { id } }` convention — `params` will be undefined and destructuring crashes (caused BUG-1, BUG-2; fixed in `9fdfd0c0`).
- **UUID validation**: All URL path params used in DB queries must be validated with `z.string().uuid()` before the query. Invalid UUIDs return `400 invalid_uuid`.
- **Drizzle NULL checks**: Use `isNull(col)` / `isNotNull(col)`. NEVER `eq(col, null)` — it compiles to `col = NULL` which is always false in SQL. Caused BUG-3 (fixed in `fe5c5860`).
- **server.js body buffering**: The production server entry point (`server.js`) must buffer the request body stream for non-GET/HEAD methods before constructing the Web `Request`. Without this, POST/PUT/PATCH bodies arrive empty (fixed in `88f7a68d`).
- **Error format**: Always `{ error: 'machine_code', message: '...' }` with appropriate status
- **H3**: Import `h3-js` only via `lib/h3.ts` and `utils-server/h3Index.ts`
- **platform_config**: Never cache — read from DB at request time
- **Drizzle transactions**: Required for all money writes (call_ledger, subscriptions, payment_events)
- **Supabase JWT**: Required on every protected API route via `verifySupabaseToken()` or `requireRole()`
- **No console.log**: Use `lib/logger.ts` (`logger.info`, `logger.error`)
- **Vehicle type filter**: Dispatch must filter by vehicle_type BEFORE H3 scoring, using lowercase enum values
- **Packages vehicle-type scope**: `packages.vehicle_type` (nullable) gates visibility and purchase — NULL = universal, non-null = only matching `drivers.vehicle_type`. Enforced in `GET /api/package/list` (filtered) and `POST /api/package/purchase` (403 `vehicle_type_mismatch`)
- **Daily cap check**: In dispatch candidate pool, not in heartbeat deduction path
- **Batch exclusion**: Query `dispatch_offers` for excluded driver_ids before building each batch
- **All tables**: uuid PKs, created_at/updated_at timestamptz. Append-only tables (call_ledger, dispatch_offers, used_challenges, rate_limits) exempt from updated_at.
- **Soft deletes**: No hard deletes on users, drivers, riders, packages, call_ledger, rides, documents
- **Commit format**: Conventional Commits with scope (auth, dispatch, payment, ledger, admin, schema, driver, rider)
- **ESLint**: This repo uses the **legacy `.eslintrc.json`** config (NOT flat config). Always lint via `npm run lint` — the script sets `ESLINT_USE_FLAT_CONFIG=false` explicitly, so do not run bare `npx eslint .`. Unused vars with `_` prefix are allowed (`argsIgnorePattern: '^_'`, `varsIgnorePattern: '^_'`).
- **TypeScript**: `tsconfig.json` excludes `functions/` and `utils-server/`. Those have their own configs.

## Known Issues & Tech Debt

See `docs/Plan/18-KNOWN-ISSUES.md` before fixing bugs. Key issues:
- **TD-01:** SMS receiver killed by OEM battery optimisation on 30-60% of Android devices. Manual OTP entry is fallback.
- **TD-11:** In-process maps prevent >1 replica. `INSTANCE_COUNT=1` always.
- **TD-15:** utils-server loses all in-memory state on crash. Startup recovery added.
- **TD-31:** After Oct 30 2026, new tables need explicit GRANT statements for supabase-js/PostgREST access. Server-side Drizzle unaffected.

## Testing

- `npx jest --testPathPattern="name"` — single test
- At phase gates run: `npx jest --watchAll=false` (full suite)
- **Dispatch invariants** that must always pass: (1) single deduction per `(ride_id, driver_id)`, (2) deduction row has matching `dispatch_offers` row with `outcome='delivered'`, (3) `calls_remaining = 0` drivers never in candidate pool, (4) daily cap exceeded drivers never in candidate pool, (5) no driver receives same offer in consecutive batches.
- **Payment invariants**: (1) same idempotency key → exactly one `payment_events` row, (2) duplicate callback activates subscription exactly once, (3) failed activation → `compensation_queue` entry within 30 seconds.
- Test templates: `docs/Plan/22-TEST-TEMPLATES.md`.

## Graph Maintenance

After modifying any code files, run:
- `code-review-graph update` — always (fast, <2s)
- `graphify update .` — after large batches of changes only

## File Naming Conventions

- `lib/`: camelCase (`fareCalc.ts`, `activateSubscription.ts`)
- `app/api/`: kebab-case with `+api.ts` (`purchase+api.ts`)
- `components/`: PascalCase (`CallWalletCard.tsx`)
- `store/`: `use{Name}Store.ts` (`usePackageStore.ts`)
- WebSocket events: `{domain}:{action}` kebab-case (`ride:offer`, `fetch:confirm`, `location:update`)

## GoRide Design Tokens

See `theme/goRide.ts` for full tokens. Key tokens:
- Primary accent: `#0CC25F`, pressed: `#0A9B4C`
- Error/danger: `#E31D1C`, Info/auxiliary: `#2E42A5`
- Background light: `#F7FCFF`, dark: `#181A20`
- Font heading: Urbanist, body: Inter

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