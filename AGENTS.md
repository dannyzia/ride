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

### Current Implementation Status (as of 2026-06)

All core features are **fully implemented**:
- **Auth**: Supabase phone OTP (not Firebase/HMAC). `app/(auth)/phone-entry`, `otp-verify`, `register`. API routes in `app/api/auth/`. **No Firebase Cloud Functions exist.**
- **Payments**: PortPos unified gateway (not bKash/Nagad directly). `lib/portpos.ts` active. `lib/bkash.ts` and `lib/nagad.ts` are inert stubs (throw errors).
- **Dispatch**: WebSocket server in `utils-server/` with H3 indexing, heartbeat-gated call deduction, batch broadcasting.
- **Database**: 22 tables in `src/db/schema.ts` with all enums (vehicleTypeEnum with 8 lowercase values, rideStatusEnum, etc.).
- **Admin panel**: `app/(admin)/` with web-only routes for verification, packages, zones, configuration. **Phase F15** consolidated all admin entities (driver queue, lifecycle, incentives, promos, preferences, referral campaigns, point offers, vehicle models, sample media, platform config, monitoring) into one coherent dashboard. All 10 API items + 14 UI items built and tsc-clean. See `docs/Plan/14-DEV-CHECKLIST.yaml` phase F15.
- **Chat**: In-app messaging with `store/useChatStore.ts` and `app/api/chat/`.
- **Driver flows**: Onboarding, home, offers, ledger. 6 Zustand stores in `store/`.

**Verification:** No Clerk, Stripe, or Firebase references remain in the codebase (checked 2026-06).

This repo has **two independently-typed packages**:
- **Root** (`package.json`): Expo app — React Native mobile client + Expo API routes (`app/api/`).
- **`utils-server/`** (`utils-server/package.json`): WebSocket dispatch server (`index.ts`, `dispatch.ts`, `heartbeat.ts`, `h3Index.ts`, `scheduler.ts`, `compensationWorker.ts`). Separate `tsconfig.json`, separate dependencies.

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

**For implementation methodology and what changed from GlideX:**
- `CLAUDE.md` — Implementation methodology, execution rules, development phases status, auth/dispatch flows, glossary.

**Additional reference files (lower priority, load as needed):**
`.claude/RULES.md`, `.claude/SECURITY.md`, `.claude/STYLEGUIDE.md`, `.claude/TESTING.md`, `.claude/WORKFLOWS.md`, `.claude/REVIEW-CHECKLIST.md`, `.claude/CONTEXT/phase-context.md`, `.claude/MEMORY/decisions.md`, plus other docs in `docs/Plan/`.

## Essential Commands

```bash
# Expo app
npx expo start                              # Dev server
npx expo run:android                        # Native build (required after plugin changes)
npx tsc --noEmit                            # Type check (must pass)
npx eslint .                                # Lint (must pass; unused _-prefixed vars allowed)
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

## Architecture Map

- `app/(auth)/` — Auth screens (phone-entry → otp-verify → register)
- `app/(main)/(customer)/` — Rider screens (keep folder name `(customer)`, rider is a display label)
- `app/(main)/(rider)/` — Driver screens
- `app/(admin)/` — Web-only admin panel
- `app/api/` — Expo API routes (file-based backend, `[public]` prefix = no JWT required)
- `lib/` — Shared utilities (auth, DB, map, payment, validation)
- `store/` — Zustand state stores (6 stores: useDriverStore, useRiderStore, useChatStore, useDriverStatusStore, usePackageStore, useCallLedgerStore, useDriverFlowStore)
- `src/db/schema.ts` — Drizzle schema (22 tables, all enums exported)
- `utils-server/` — WebSocket dispatch server (separate package)
- `scripts/` — Seed scripts (system-config, pricing, packages, platform-config, admin)

**Two backend services:**
1. Expo API routes (`app/api/`) — request/response, DB queries, JWT-gated.
2. Utils server (`utils-server/`) — stateful WebSocket dispatch, heartbeat-gated call deduction, H3 index, scheduler, compensation worker. `INSTANCE_COUNT=1` required (no split-brain).

## Critical Rules

### Money
**Always integer paisa (BDT).** Never floats. Never strings. Divide by 100 only at UI display. Every `*_bdt` column and API field is integer paisa. Commission calculated on post-minimum-floor fare, never on raw total.

### Write Ownership (violating these is a critical bug)
- `call_ledger` deduction rows (`event_type='deduction'`) → ONLY `utils-server/heartbeat.ts`
- `call_ledger` all other event types (`initial_load`, `credit`, `expiry_writeoff`) → ONLY `lib/activateSubscription.ts`
- `dispatch_offers` → ONLY `utils-server/dispatch.ts` and `utils-server/heartbeat.ts`
- No other file writes these tables directly.

### Auth
Supabase phone OTP. Client uses `lib/supabase.ts` (`EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`). Server uses `lib/supabaseServer.ts` (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`). Protected API routes call `verifySupabaseToken(request)` or `requireRole(request, role)` from `lib/auth.ts`. **No exceptions.** No `x-user-id` header substitution.

### Vehicle Types
8 lowercase values: `bike_basic`, `bike_standard`, `bike_plus`, `cng`, `car_economy`, `car_comfort`, `car_premium`, `car_xl`. Import Zod enum from `lib/vehicleTypes.ts` — never define inline. Old values (`MOTORCYCLE`, `CNG_AUTO_RICKSHAW`, `CAR`, `MICROBUS`) are removed.

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
- Transactions required for all writes touching `call_ledger`, `subscriptions`, or `payment_events`.
- Use `typeof schema.$inferSelect` / `typeof schema.$inferInsert` — never manually redeclare DB row types.
- Driver `min_per_km_bdt` validation: use `validateDriverMinKm()` from `lib/validateMinPerKm.ts` — never inline.
- **NULL checks**: use `isNull(col)` / `isNotNull(col)`. NEVER `eq(col, null)` — it compiles to `col = NULL` which is always false in SQL (NULL is not equality-comparable). This caused the critical BUG-3 (packages GET returned `[]` despite rows existing).

### Dispatch Logic
- Daily cap check belongs in dispatch candidate pool construction (`dispatch.ts`), NOT in heartbeat deduction path.
- Batch exclusion: query `dispatch_offers` for previously-offered `driver_id`s before building each batch.
- Vehicle type filter applied BEFORE H3 scoring.
- `dispatch_offers` has a unique index on `(ride_id, driver_id)` preventing the same driver receiving the same ride twice. `call_ledger` has a SEPARATE partial unique index on `(ride_id, driver_id) WHERE event_type='deduction'`. Do not confuse the two.

### Client Secrets
Payment credentials (`PORTPOS_APP_KEY`, `PORTPOS_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are server-side only. Never in `EXPO_PUBLIC_*` vars.

### TypeScript Rules
- No `any`, no `@ts-ignore`, no `@ts-expect-error` without explanatory comment.
- `interface` for DB row shapes and API response shapes. `type` for unions.
- Exhaustive switch statements on enums/unions: `default: assertNever(value)` (import from `@/lib/utils`).
- WebSocket message types defined in `utils-server/types.ts`.

### Database Tables
All tables: uuid PKs, created_at/updated_at timestamptz. Append-only tables (`call_ledger`, `dispatch_offers`, `used_challenges`, `rate_limits`) are exempt from `updated_at`. Soft deletes (no hard deletes) on users, drivers, riders, packages, `call_ledger`, rides, documents.

### File Naming
- `lib/`: camelCase (`fareCalc.ts`, `activateSubscription.ts`)
- `app/api/`: kebab-case with `+api.ts` (`purchase+api.ts`)
- `components/`: PascalCase (`CallWalletCard.tsx`)
- `store/`: `use{Name}Store.ts` (`usePackageStore.ts`)
- WebSocket events: `{domain}:{action}` kebab-case (`ride:offer`, `fetch:confirm`, `location:update`)

### ESLint
`eslint.config.mjs` uses `eslint-config-expo/flat.js`. Unused vars with `_` prefix allowed. Config ignores `_reference/` and `utils-server/`.

## Environment Variables

Two `.env` files:
- `.env.local` — Expo app (API routes)
- `utils-server/.env` — WebSocket server

Required Expo app server vars: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PORTPOS_APP_KEY`, `PORTPOS_SECRET_KEY`, `PORTPOS_BASE_URL`, `PORTPOS_CALLBACK_URL`, `BARIKOI_API_KEY`, `UTILS_SERVER_PORT` (default `3001`), `WEBSOCKET_INTERNAL_SECRET` (min 32 chars).

Required client vars (safe for `EXPO_PUBLIC_`): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_BARIKOI_API_KEY`, `EXPO_PUBLIC_SERVER_URL`, `EXPO_PUBLIC_WEB_SOCKET_SERVER_URL`, `EXPO_PUBLIC_SUPPORT_PHONE`.

Full reference: `docs/Plan/11-ENV-VARS.md`.

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

## Known Issues (`docs/Plan/18-KNOWN-ISSUES.md` — check before fixing bugs)

- **TD-01:** SMS receiver killed by OEM battery optimization on 30-60% of Android devices. Manual OTP entry is the fallback.
- **TD-11:** In-process maps prevent >1 replica. `INSTANCE_COUNT=1` always.
- **TD-15:** utils-server loses all in-memory state on crash. Startup recovery exists.
- **TD-31:** After Oct 30 2026, new tables need explicit GRANT statements for supabase-js/PostgREST access. Server-side Drizzle unaffected.

## Git Conventions

- Commit format: `type(scope): description` (Conventional Commits)
- Scopes: `auth`, `dispatch`, `payment`, `ledger`, `admin`, `schema`, `driver`, `rider`
- Branch names: `type/short-description` (e.g., `feat/hmac-auth`, `fix/call-deduction-race`)
- Protected branches: `main`, `develop` — no force push, PR required.

## Deploy Order

1. `npx drizzle-kit push` (DB migrations)
2. `utils-server` (depends on current schema)
3. EAS build + submit (last — references updated API)
