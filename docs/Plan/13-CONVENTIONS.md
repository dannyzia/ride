<!--
AI INSTRUCTIONS
===============
Base: GlideX coding conventions (TypeScript, Expo Router, NativeWind, Drizzle, Prettier, ESLint).
This file inherits all GlideX conventions. Only Ride-specific overrides and additions are documented here.
If a rule is not listed here, apply the GlideX default.
Read: 03-TECH-STACK.md for tool versions and package list.
-->

# Coding Conventions: Ride
> Inherits GlideX conventions. Only overrides and critical additions listed here.

---

## Tooling (same as GlideX — confirming for clarity)

| Tool | Value | Run command |
|------|-------|-------------|
| Language | TypeScript (strict mode) | — |
| Formatter | Prettier (GlideX config) | `npx prettier --write .` |
| Linter | ESLint (GlideX config) | `npx eslint .` |
| Type checker | `tsc --noEmit` | `npx tsc --noEmit` |

All three must pass before every commit. No exceptions.

---

## Naming conventions (GlideX baseline — unchanged)

| Thing | Convention | Example |
|-------|------------|---------| 
| Source files | camelCase for `lib/` files, kebab-case for Expo Router files | `fareCalc.ts`, `activateSubscription.ts` (lib); `otp-polling.tsx`, `purchase+api.ts` (routes) |
| React Native components | PascalCase | `RideOfferSheet.tsx`, `CallWalletCard.tsx` |
| Functions | camelCase | `findNearbyDrivers()`, `verifyFirebaseIdToken()` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_DISPATCH_BATCHES`, `CALL_DEDUCTION_WINDOW_MS` |
| Types / interfaces | PascalCase | `CallLedgerEntry`, `PackageWithSubscription` |
| Database tables | snake_case, plural | `call_ledger`, `payment_events` |
| Database columns | snake_case | `driver_id`, `expires_at`, `calls_remaining` |
| Environment variables | SCREAMING_SNAKE_CASE | `BKASH_APP_KEY`, `HMAC_SIGNING_SECRET` |
| Expo Router files | `[segment]+api.ts` (API) or `screen-name.tsx` (screens) | `purchase+api.ts`, `otp-polling.tsx` |
| Zustand stores | `use{Name}Store.ts` | `usePackageStore.ts` |
| WebSocket events | `{domain}:{action}` where domain is kebab-case (hyphens allowed) and action is kebab-case | `ride:offer`, `vehicle-type:change-applied`, `fetch:confirm`, `location:update` |

---

## Critical Ride-specific rules

### Money — always in paisa (integer), never floats
```typescript
// CORRECT
const priceBdt = 50000; // 500 taka in paisa
const displayPrice = `৳${priceBdt / 100}`; // "৳500" — convert only for display

// WRONG — never store or transmit as float
const priceBdt = 500.00; // ❌
const priceBdt = "500";  // ❌ (string)
```
- All `*_bdt` columns in DB and all API fields: **integer, paisa**.
- Divide by 100 only at the final display layer (`components/` or `screens/`).
- Never divide in the API or service layer.

### Commission calculation — always post-minimum-floor
```typescript
// Commission is always calculated as a percentage of `total_bdt` (post-floor),
// never of the raw computed total. Commission functions receive all inputs as parameters; no constants are embedded.
//
// WRONG — calculating commission on raw total before applying floor fare:
const computedTotal = base + distanceCharge + timeCharge;
const commission = Math.round(computedTotal * 0.10); // ❌ wrong base amount, hardcoded percentage

// CORRECT — calculating commission on post-floor total using parameter:
const floorFare = base + Math.round(perKm * floorLengthKm) + (floorMin * perMin);
const totalBdt = Math.max(floorFare, computedTotal);
const commission = Math.round(totalBdt * (pricing.platform_commission_percent / 100)); // ✅
```

### Waiting time — arrived_at is canonical
```typescript
// The billable timer starts at whichever comes FIRST:
//   (a) driver clicks "Start Ride" (started_at), or
//   (b) 60 seconds expire after arrived_at (platform-wide constant from system_config).
// After 60s, the scheduler auto-transitions the ride to in_progress.
// Never use client-supplied timestamps.
//
// WRONG — relying on client timestamps:
const rideTime = payload.client_ride_time; // ❌ never trust the client

// CORRECT — calculating from DB timestamps:
const MAX_FREE_WAIT_MS = 60_000; // system_config.max_free_wait_seconds × 1000
const timerStart   = new Date(Math.min(
  arrived_at.getTime() + MAX_FREE_WAIT_MS,
  started_at.getTime()
)); // ✅ whichever comes first
const rideTimeMin  = Math.ceil((completed_at.getTime() - timerStart.getTime()) / 60_000); // ✅
```

### Call deduction — single ownership
```typescript
// ONLY utils-server/heartbeat.ts may write event_type='deduction' rows to call_ledger.
// Every other file that needs a call DEDUCTION calls heartbeat.ts.
//
// For NON-DEDUCTION writes (initial_load, credit, expiry_writeoff):
// Use lib/activateSubscription.ts which is callable from Expo API routes AND utils-server.
//
// The unified rule:
//   deduction rows → heartbeat.ts only
//   all other event types → activateSubscription.ts only
//   no file writes call_ledger directly outside these two modules

// WRONG — never write a deduction row outside heartbeat.ts:
await db.insert(callLedger).values({ event_type: 'deduction', ... }); // ❌

// WRONG — never write ANY call_ledger row directly (even non-deduction):
await db.insert(callLedger).values({ event_type: 'initial_load', ... }); // ❌

// CORRECT — for non-deduction writes:
import { activateSubscription } from '@/lib/activateSubscription'; // ✅ correct
```
Violation of the deduction-only restriction is a **critical bug** — it breaks idempotency and double-deduction protection.

### dispatch_offers — single ownership
```typescript
// ONLY utils-server/dispatch.ts and utils-server/heartbeat.ts may write to dispatch_offers.
// No other file imports or references the dispatch_offers table for writes.

// CORRECT — in dispatch.ts:
await tx.insert(dispatchOffers).values({ ride_id, driver_id, batch_index, sent_at, outcome: 'delivered' });

// WRONG — never in an API route or other lib file:
await db.insert(dispatchOffers).values({ ... }); // ❌ outside dispatch.ts/heartbeat.ts
```

### Daily cap check — dispatch query only (never in heartbeat)
```typescript
// The daily_calls_used >= daily_cap check MUST be performed in
// utils-server/dispatch.ts during candidate pool construction, not in
// utils-server/heartbeat.ts at deduction time. The deduction path assumes
// the driver is eligible — eligibility is the dispatch layer's responsibility.

// CORRECT — in dispatch.ts candidate query:
WHERE (
  sub.calls_remaining > 0
  OR (sub.calls_remaining = -1 AND sub.daily_calls_used < pkg.daily_cap)
)

// WRONG — checking cap in heartbeat.ts after offer is sent:
if (sub.daily_calls_used >= pkg.daily_cap) return; // ❌ offer already sent
```

### BATCH EXCLUSION PATTERN — dispatch must filter previously-offered drivers
```typescript
// utils-server/dispatch.ts MUST query dispatch_offers for excluded
// driver_ids before building each batch. Never rely on constraint
// violations as a deduplication mechanism.
// Pattern:
const excluded = await db.select({ driver_id: dispatchOffers.driver_id })
  .from(dispatchOffers)
  .where(eq(dispatchOffers.ride_id, rideId));
const excludedIds = new Set(excluded.map(r => r.driver_id));
// filter candidateDrivers before scoring
```

### VEHICLE TYPE ENUM — always lowercase snake_case
```typescript
// The vehicle_type Drizzle pgEnum uses LOWERCASE SNAKE_CASE values:
//   'bike_basic' | 'bike_standard' | 'bike_plus' | 'cng' |
//   'car_economy' | 'car_comfort' | 'car_premium' | 'car_xl'
//
// Source of truth: src/db/schema.ts vehicleTypeEnum and lib/vehicleTypes.ts VEHICLE_TYPE_ZOD_ENUM
// Import the Zod enum from lib/vehicleTypes.ts — never define inline.
//
// WRONG — UPPERCASE casing; DB enum will reject these:
const vt = 'BIKE_BASIC';         // ❌
const vt = 'CAR_ECONOMY';        // ❌
// WRONG — old 4-type enum values — removed from the schema:
const vt = 'MOTORCYCLE';         // ❌ old value
const vt = 'CNG_AUTO_RICKSHAW';  // ❌ old value
const vt = 'CAR';                // ❌ old value
const vt = 'MICROBUS';           // ❌ old value

// CORRECT
const vt = 'bike_basic';   // ✅
const vt = 'car_economy';  // ✅
import { VEHICLE_TYPE_ZOD_ENUM } from '@/lib/vehicleTypes'; // ✅ for Zod schemas
```

### VEHICLE TYPE FILTER — dispatch must match driver vehicle_type to ride
```typescript
// CORRECT — in dispatch.ts candidate query:
// The candidate pool must filter by vehicle_type BEFORE H3 scoring.
// A car_economy driver cannot receive a bike_basic request and vice versa.
// Use lowercase enum values — the DB will reject UPPERCASE.
WHERE drivers.vehicle_type = rides.vehicle_type  -- exact lowercase match
  AND drivers.is_online = true
  AND drivers.status IN ('active', 'temporary')

// WRONG — uppercase casing causes a DB enum violation:
WHERE drivers.vehicle_type = 'BIKE_BASIC'  // ❌ wrong case
WHERE drivers.vehicle_type = 'MOTORCYCLE'  // ❌ old enum value — removed
```

### VEHICLE TYPE FILTER — also includes min_per_km_bdt exclusion
```typescript
// After vehicle type + daily cap + batch exclusion filters, add:
WHERE (
  d.min_per_km_bdt IS NULL
  OR d.min_per_km_bdt <= p.per_km_bdt  -- p = pricing row for this ride's vehicle_type + zone
)
// Excluded drivers get a dispatch_offers row written with outcome='filtered'.
// They are NOT sent a ride:offer WebSocket message.
// The filtered row feeds GET /api/driver/missed-requests filtered_count_7d.
```

### platform_config — never cache; always read from DB at request time
```typescript
// platform_config values (driver_min_ratio, driver_max_ratio, brta_max_*) must
// be read from the DB on every request — never stored in module-level variables.
//
// WRONG — module-level cache:
let minRatio: number; // ❌ cached; admin config change doesn't take effect immediately

// CORRECT — read at request time:
const config = await db.select().from(platformConfig).where(eq(platformConfig.key, 'driver_min_ratio'));
const minRatio = parseFloat(config[0].value); // ✅ always fresh
```
This ensures admin updates via `PATCH /api/admin/config` take effect on the next request without restart.

### Driver minimum rate — validate via lib/vehicleTypes.ts: validateDriverMinKm() (pure function)
```typescript
// All validation of min_per_km_bdt updates MUST use the pure function in
// lib/validateMinPerKm.ts. Never inline the validation logic.

// WRONG — inline validation:
if (value < systemRate * 0.70 || value > systemRate * 1.50) return 422; // ❌ duplicated logic; ratios should come from platform_config

// CORRECT:
import { validateDriverMinKm } from '@/lib/vehicleTypes';
const result = validateDriverMinKm(requestedValue, { lower_bound, upper_bound });
if (!result.valid) return Response.json({ error: 'min_km_out_of_range', ...result }, { status: 422 });
```
The bounds (`lower_bound`, `upper_bound`) are computed from `platform_config` values by the calling endpoint, then passed into this pure function. The function itself never reads from DB.

### H3 — single import point
```typescript
// ONLY lib/h3.ts and utils-server/h3Index.ts may import h3-js directly.
import { latLngToCell } from 'h3-js'; // ❌ NOT in any other file

// All other files call the wrapper:
import { getH3Cell, findNearbyDrivers } from '@/lib/h3'; // ✅
```

### Timestamps — always UTC, always `timestamptz`
```typescript
// CORRECT — store UTC, convert to Asia/Dhaka only at display
const expiresAt = new Date(); // UTC
expiresAt.setDate(expiresAt.getDate() + durationDays); // UTC arithmetic

// WRONG
const expiresAt = new Date().toLocaleString('en-BD'); // ❌ local time
```
- All DB writes: UTC `Date` objects. Drizzle serialises as `timestamptz`.
- All display: `toLocaleString('en-BD', { timeZone: 'Asia/Dhaka' })` or `dayjs().tz('Asia/Dhaka')`.

### Single source of truth for BDT day boundary
```typescript
// ALL code that computes "next midnight in Dhaka" MUST use lib/time.ts:
import { nextBdtMidnightUtc } from '@/lib/time';

// CORRECT
const dailyReset = nextBdtMidnightUtc(); // returns UTC timestamptz of next 00:00 Asia/Dhaka

// WRONG — never compute midnight inline:
const midnight = new Date(); midnight.setHours(0, 0, 0, 0); // ❌ local time, wrong timezone
```
- `daily_reset_at` on subscriptions, scheduler daily resets — all must call this helper.
- Do NOT duplicate the midnight calculation in any other file.

### No client-side secrets
```typescript
// WRONG — never in Expo app code
const hmacSecret = process.env.HMAC_SIGNING_SECRET; // ❌ not available client-side
const bkashKey = process.env.EXPO_PUBLIC_BKASH_APP_KEY; // ❌ never expose payment credentials

// HMAC signing is done entirely server-side in Firebase Cloud Functions.
// The client sends {phone, timestamp, appCheckToken} to startVerification CF.
// The CF validates App Check + rate limits, then computes HMAC and sends SMS.
// No signing code exists on the client. See: 02-ARCHITECTURE.md — Auth lifecycle.
```

### Firebase ID token — every protected API route
```typescript
// Every app/api/**+api.ts that is NOT marked [public] in 06-API.md:
import { verifyFirebaseIdToken } from '@/lib/auth';

export async function GET(request: Request) {
  const user = await verifyFirebaseIdToken(request); // throws 401 if invalid
  // ... rest of handler
}
// Never skip this. Never check req.headers['x-user-id'] instead.
```

### Zod validation — every API route boundary
```typescript
// Every API route validates its input with Zod before any DB or service call.
// Import vehicle_type enum from lib/vehicleTypes.ts — never define inline:
import { VEHICLE_TYPE_ZOD_ENUM } from '@/lib/vehicleTypes';

const schema = z.object({
  vehicle_type: VEHICLE_TYPE_ZOD_ENUM, // ✅ canonical enum — lowercase values
  provider: z.enum(['bkash', 'nagad']),
});
const parsed = schema.safeParse(await request.json());
if (!parsed.success) {
  return Response.json({ error: 'validation_error', message: parsed.error.format() }, { status: 400 });
}
// Then use parsed.data — never use raw request body after this point.
```

### Error responses — consistent format
```typescript
// ALL API errors follow this shape (from 06-API.md):
return Response.json(
  { error: 'machine_code', message: 'Human-readable description' },
  { status: 4xx | 5xx }
);

// Machine codes: snake_case, specific. Examples:
// 'validation_error', 'phone_already_registered', 'outside_zone',
// 'insufficient_calls', 'payment_not_confirmed', 'driver_not_active',
// 'vehicle_too_new', 'cc_range_mismatch', 'min_km_out_of_range'

// WRONG — never expose stack traces or Drizzle internals:
return Response.json({ error: err.message }); // ❌
```

### No `console.log` — use the project logger
```typescript
import { logger } from '@/lib/logger';

logger.info('Package activated', { driver_id, subscription_id });
logger.error('bKash callback failed', { error, payment_event_id });
// logger respects LOG_LEVEL env var; strips debug logs in production.

console.log('something'); // ❌ never in committed code
```

### Drizzle transactions for all money writes
```typescript
// Any DB operation that touches call_ledger, subscriptions, or payment_events:
await db.transaction(async (tx) => {
  await tx.update(subscriptions).set({ calls_remaining: newBalance }).where(...);
  await tx.insert(callLedger).values({ ... });
  // Both succeed or both roll back. Never two separate awaits.
});
```

---

## TypeScript rules (Ride additions)

- **No `any`**. No `// @ts-ignore`. No `// @ts-expect-error` without an explanatory comment.
- **Drizzle inferred types**: use `typeof schema.$inferSelect` and `typeof schema.$inferInsert` — do not manually redeclare DB row types.
- **WebSocket message types**: define in `utils-server/types.ts`. Every `ws.send()` call must be typed.
- **`interface` for DB row shapes and API response shapes**. `type` for unions (e.g. `DriverStatus = 'pending' | 'active' | ...`).
- **Exhaustive switch statements** on enums/unions. Add `default: assertNever(value)` (import from `@/lib/utils`).

---

## Git conventions (GlideX baseline — unchanged)

| Thing | Convention | Example |
|-------|------------|---------| 
| Commit messages | Conventional Commits | `feat: add bKash payment callback`, `fix: prevent double call deduction` |
| Branch names | `type/short-description` | `feat/hmac-auth`, `fix/call-deduction-race` |
| PR titles | Same as commit format | — |
| Protected branches | `main`, `develop` | No force-push. PR required. |

### Ride-specific commit scope convention
Use these scopes to make the log readable:
- `auth` — HMAC phone auth, Firebase token flows
- `dispatch` — WebSocket server, heartbeat, H3 indexing
- `payment` — bKash, Nagad, idempotency
- `ledger` — call_ledger writes and reads
- `admin` — admin panel screens and endpoints
- `schema` — Drizzle schema and migrations
- `driver` — driver onboarding, status, document upload
- `rider` — rider flows, fare breakdown, scheduling

Examples:
```
feat(dispatch): implement heartbeat-gated call deduction window
fix(payment): prevent bKash double-activation on duplicate callback
feat(schema): add call_ledger unique constraint on ride_id+driver_id
```
