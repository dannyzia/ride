# Supabase Security Advisor Fixes — 2026-08-14

**Project:** Ride (`swzgkhwjvikyfaqnbrix`)
**Region:** ap-northeast-1
**Severity:** CRITICAL (active data exposure via PostgREST)

---

## 1. Problems Found

### 1.1 RLS Disabled on All Public Tables (CRITICAL)

All 85 tables in the `public` schema had Row Level Security (RLS) disabled. Since Supabase exposes the `public` schema to PostgREST by default, and both `anon` and `authenticated` roles had `SELECT` privileges on all tables, **any user with the anon key could dump the entire database** — including users, payment events, driver payout methods, call ledger, rides, SOS alerts, etc.

The anon key is embedded in the mobile app (`EXPO_PUBLIC_SUPABASE_ANON_KEY`) and is extractable.

**Confirmed exploitable:**
- `anon` role: SELECT on all 85 tables
- `authenticated` role: SELECT on all 85 tables
- No RLS policies = no row filtering = full table dumps

**Example attack vector:**
```
GET https://swzgkhwjvikyfaqnbrix.supabase.co/rest/v1/users?select=*
Headers: apikey: <EXPO_PUBLIC_SUPABASE_ANON_KEY>
```

### 1.2 SECURITY DEFINER Function Exposed (WARN)

`public.rls_auto_enable()` was a `SECURITY DEFINER` event trigger function callable by `anon` and `authenticated` roles via `/rest/v1/rpc/rls_auto_enable`. While event triggers can't actually be invoked via RPC, the exposure was a hygiene issue flagged by the advisor.

### 1.3 Duplicate Indexes (WARN)

Six tables had redundant non-unique indexes alongside unique indexes on the same columns:
- `drivers_user_id_idx` + `drivers_user_id_unique`
- `payment_events_idempotency_idx` + `payment_events_idempotency_key_unique`
- `users_auth_uid_idx` + `users_auth_uid_unique`
- `users_phone_idx` + `users_phone_unique`
- `vehicles_driver_id_idx` + `vehicles_driver_id_unique`
- `vehicles_reg_number_idx` + `vehicles_registration_number_unique`

### 1.4 Sensitive Columns Exposed (CRITICAL)

`public.drivers` and `public.driver_payout_methods` had sensitive columns (phone, NID, payout account numbers) accessible without RLS.

### 1.5 Leaked Password Protection Disabled (WARN)

Supabase Auth's HaveIBeenPwned integration was not enabled.

### 1.6 Client Directly Queries PostgREST (Architecture Issue)

Contrary to the documented architecture (client → API routes → service_role → DB), the mobile client has 4 Zustand stores that query PostgREST directly using the anon key:

| Store | Table(s) | Operation |
|-------|----------|-----------|
| `useDriverStatusStore` | `drivers` | SELECT + UPDATE (online/offline toggle) |
| `useCallLedgerStore` | `call_ledger` | SELECT (call history) |
| `usePackageStore` | `subscriptions`, `packages` | SELECT (active subscription + package) |
| `app/admin/_layout.tsx` | `users` | SELECT (role check, has server fallback) |

This meant a blanket deny-all RLS policy would break driver functionality. Per-user policies were required.

### 1.7 Stuck Database Query (2+ hours)

A `utils-server` scheduler job (auto-start timer for `driver_arrived` rides) was stuck in an `UPDATE rides` query for 2+ hours, blocking the `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on the `rides` table. The query could not be killed via `pg_terminate_backend` and required a database restart.

**Root cause:** The postgres.js client had no `statement_timeout` or `max_lifetime` configured, so a lost pooler connection could leave a query hanging indefinitely.

### 1.8 utils-server Crashes on Connection Drop

The `utils-server` process crashed with `PostgresError: Failed to connect to database: {:error, :timeout}` when the database connection dropped (e.g., during restart). The postgres.js client threw unhandled rejections that weren't caught by the scheduler's try/catch blocks.

---

## 2. What Was Done

### 2.1 RLS Enabled on All 85 Tables

Enabled via MCP (`execute_sql`) in batches of 3-20 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statements, plus 30 tables via the Supabase SQL editor (user ran the statements directly due to MCP timeouts).

**Tables enabled:** All 85 tables in `public` schema.

### 2.2 Per-User RLS Policies Created (6 policies on 5 tables)

Created via Supabase SQL editor (user ran the SQL directly):

| Policy | Table | Operation | Rule |
|--------|-------|-----------|------|
| `users_self_select` | `users` | SELECT | `auth_uid::text = auth.uid()::text` |
| `drivers_self_select` | `drivers` | SELECT | `user_id` linked to current user via `users.auth_uid` |
| `drivers_self_update` | `drivers` | UPDATE | Same ownership check, with `WITH CHECK` |
| `call_ledger_self_select` | `call_ledger` | SELECT | `driver_id` belongs to current user |
| `subscriptions_self_select` | `subscriptions` | SELECT | `driver_id` belongs to current user |
| `packages_authenticated_read` | `packages` | SELECT | `true` (public catalog) |

**Ownership chain:** `auth.uid()` → `users.auth_uid` → `users.id` → `drivers.user_id` → `drivers.id` → `{call_ledger, subscriptions}.driver_id`

### 2.3 Function Security Fixed

```sql
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
```

### 2.4 Duplicate Indexes Dropped

```sql
DROP INDEX IF EXISTS public.drivers_user_id_idx;
DROP INDEX IF EXISTS public.payment_events_idempotency_idx;
DROP INDEX IF EXISTS public.users_auth_uid_idx;
DROP INDEX IF EXISTS public.users_phone_idx;
DROP INDEX IF EXISTS public.vehicles_driver_id_idx;
DROP INDEX IF EXISTS public.vehicles_reg_number_idx;
```

### 2.5 Database Restarted

The Supabase database was restarted to kill the stuck 2+ hour query on `rides` that was blocking RLS enablement.

---

## 3. Code Changes

### File: `src/db/index.ts`

Added connection resilience to the postgres.js client:

```typescript
const client = postgres(DATABASE_URL, {
  ssl: "require",
  prepare: false,
  max: 5,
  idle_timeout: 30,
  connect_timeout: 30,
  // NEW: Recycle connections every 30min to prevent stale pooler connections
  max_lifetime: 60 * 30,
  // NEW: Set statement_timeout to 30s so no query can hang forever
  connection: {
    statement_timeout: 30000,
  },
});
```

### File: `utils-server/index.ts`

Added global error handlers before the `startup()` call:

```typescript
// ── Global Error Handlers ──────────────────────────────────────────────
// Prevent postgres.js or other async errors from crashing the process.
process.on("unhandledRejection", (reason: unknown) => {
  logger.error("[process] unhandled rejection — keeping server alive", reason);
});

process.on("uncaughtException", (err: Error) => {
  logger.error("[process] uncaught exception — keeping server alive", err);
});
```

---

## 4. Remaining Items (Orchestrator Action Required)

### 4.1 Enable Leaked Password Protection (Dashboard Toggle)

**Location:** Supabase Dashboard → Project `swzgkhwjvikyfaqnbrix` → Auth → Settings → Password → Enable leaked password protection

This is a dashboard-only setting, not a SQL fix. Enable it to check passwords against HaveIBeenPwned.org.

### 4.2 Unindexed Foreign Keys (Performance)

The performance advisor flagged ~60 foreign keys without covering indexes. These are INFO-level and do not affect security. They can be addressed in a separate pass by adding indexes like:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_table_fk_column ON public.table_name(fk_column);
```

Refer to the Supabase performance advisor output for the full list.

### 4.3 Unused Indexes (Leave Alone)

The performance advisor flagged ~50 unused indexes. These are anticipatory indexes for production query patterns in a pre-launch app. **Do not drop them** — they will be needed when the app has real traffic.

### 4.4 Architecture Reconciliation (Future)

The documented architecture says "client → API routes → service_role → DB", but 4 Zustand stores query PostgREST directly. The RLS policies handle this safely, but the team should decide whether to:
- **Option A:** Keep the direct PostgREST queries with per-user RLS (current state)
- **Option B:** Refactor the stores to use API routes, then remove the RLS policies and go deny-all

### 4.5 utils-server Scheduler Stability

The scheduler has 31 jobs, all with try/catch. The `unhandledRejection` handler now prevents hard crashes, but the root cause (stale pooler connections) is fixed by `max_lifetime` and `statement_timeout`. Monitor `utils-server` logs for connection errors after restart.

---

## 5. Verification

After all fixes, the security advisor should show:

- **0 `rls_disabled_in_public` errors** (all 85 tables have RLS)
- **79 `rls_enabled_no_policy` INFO lints** (expected — these are server-only tables with deny-by-default)
- **0 `sensitive_columns_exposed` errors**
- **0 `anon_security_definer_function_executable` warnings**
- **1 `auth_leaked_password_protection` warning** (pending dashboard toggle)

**Test the 4 client-touched flows after deploy:**
1. Admin login (`app/admin/_layout.tsx` role gate)
2. Driver toggle online/offline (`useDriverStatusStore`)
3. Driver call ledger screen (`useCallLedgerStore`)
4. Driver package/subscription screen (`usePackageStore`)

If any return empty, the RLS policy ownership chain may need adjustment.

---

## 6. Timeline

| Time | Event |
|------|-------|
| T+0 | Advisor screenshots reviewed, vulnerabilities confirmed |
| T+5m | MCP `execute_sql` applied: function security fix, duplicate index drops |
| T+10m | RLS enabled on 55/85 tables via MCP (batched, some timeouts) |
| T+15m | Remaining 30 tables + 6 policies applied via SQL editor |
| T+20m | Stuck query discovered on `rides` (2+ hours, PID 2065506) |
| T+25m | Database restarted to kill stuck query |
| T+30m | `rides` RLS enabled, verification passed |
| T+35m | Code changes applied to `src/db/index.ts` and `utils-server/index.ts` |
| T+40m | `tsc --noEmit` passed clean |
