> **SUPERSEDED — ARCHIVED 2026-09-05.** Do not execute this plan.
> Superseded by §"Track B" of `plans/test-consolidation-and-full-coverage-plan.md`
> (full-coverage generation now runs off the gap-ledger flow defined there, and its
> "MISSING" file list is already covered elsewhere). Kept for historical context only.

# AI Test Engineer Plan — Ride

**Audience:** AI coding models (Claude Code, GPT-o3, Cursor, etc.) operating as automated test engineers.
**Constraint:** No device, no emulator, no running server required. Every test must run via `npx jest --watchAll=false` in the project root.
**Principle:** The AI test engineer writes and runs tests in a code-write → run → read-output → fix loop. All test targets are pure logic, mocked-DB integration, or HTTP-layer tests.

---

## 0. Mental Model: Three Test Tiers

```
Tier 1 — Pure logic          No mocks. Import function, call it, assert output.
                              Zero setup cost. Runs in <1 ms per test.

Tier 2 — DB-touching modules  Mock the Drizzle `db` object at the module level.
                              Real business logic runs; no Postgres required.

Tier 3 — API route handlers   Instantiate the exported handler function directly.
                              Mock auth + db. Assert Response shape and status.
```

The existing `lib/__tests__/fareCalc.test.ts` is the canonical Tier 1 example — 513 lines, zero mocks, zero setup. Every new test file should follow that same pattern within its tier.

---

## 1. Repository of What Already Exists

| File | Status | Notes |
|---|---|---|
| `lib/__tests__/fareCalc.test.ts` | DONE | 513 lines, all 8 vehicle types, intercity split-rate, floor, commission, BRTA ceiling warnings |
| `__tests__/platform-config-semver.test.ts` | DONE | Semver validation |
| `__tests__/uuid-validation.test.ts` | DONE | UUID format tests |
| `admin-test-results/admin-panel.spec.ts` | DONE | Playwright, targets deployed admin UI |
| `utils-server/__tests__/` | MISSING | Entire directory absent |
| `app/__tests__/` (API routes) | MISSING | Entire directory absent |
| `lib/__tests__/cityBoundary.test.ts` | MISSING | |
| `lib/__tests__/zone.test.ts` | MISSING | |
| `lib/__tests__/validateMinPerKm.test.ts` | MISSING | Template in `22-TEST-TEMPLATES.md` |
| `lib/__tests__/vehicleTypes.test.ts` | MISSING | |
| `lib/__tests__/routeSplit.test.ts` | MISSING | |
| `lib/__tests__/time.test.ts` | MISSING | |

---

## 2. Jest Configuration Requirement

**Before running any new test files**, verify that Jest resolves path aliases. The codebase uses `@/` aliases. The current `package.json` uses `jest-expo` preset. Confirm or add the following inside the `jest` config block in `package.json`:

```json
"jest": {
  "preset": "jest-expo",
  "moduleNameMapper": {
    "^@/(.*)$": "<rootDir>/$1"
  },
  "transformIgnorePatterns": [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)"
  ]
}
```

The `utils-server` tests need their own Jest config since that directory has a separate `package.json`. Create `utils-server/jest.config.ts`:

```ts
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../$1',
    '^../src/db$': '<rootDir>/../src/db/index.ts',
    '^../../src/db$': '<rootDir>/../src/db/index.ts',
  },
};
```

---

## 3. Mock Strategy Reference

The same mock pattern is reused across all Tier 2 and Tier 3 tests. The AI engineer must internalize this before writing any test.

### 3a. Mocking the Drizzle `db` object

```ts
// At top of any test file that imports a module which calls db.*
jest.mock('@/src/db', () => ({
  db: {
    select:      jest.fn(),
    insert:      jest.fn(),
    update:      jest.fn(),
    delete:      jest.fn(),
    transaction: jest.fn(),
    execute:     jest.fn(),
  },
}));
```

The Drizzle query builder is a **fluent chain**: `db.select().from().where().limit()`. Each method must return `this` (the chain) until the terminal call which returns a Promise. Helper to build this:

```ts
function mockSelectChain(resolveWith: any[]) {
  const chain = {
    from:    jest.fn().mockReturnThis(),
    where:   jest.fn().mockReturnThis(),
    limit:   jest.fn().mockResolvedValue(resolveWith),
    for:     jest.fn().mockReturnThis(),   // for SELECT ... FOR UPDATE
    orderBy: jest.fn().mockReturnThis(),
    offset:  jest.fn().mockReturnThis(),
  };
  return chain;
}

// Usage:
(db.select as jest.Mock).mockReturnValue(mockSelectChain([{ id: 'abc', status: 'active' }]));
```

For `db.insert().values().returning()`:

```ts
function mockInsertChain(returning: any[]) {
  return {
    values: jest.fn().mockReturnValue({
      returning:           jest.fn().mockResolvedValue(returning),
      onConflictDoNothing: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue(returning),
      }),
    }),
  };
}
(db.insert as jest.Mock).mockReturnValue(mockInsertChain([{ id: 'new-id' }]));
```

For `db.transaction(async tx => ...)`: the mock must **execute the callback** passing a tx object:

```ts
(db.transaction as jest.Mock).mockImplementation(async (cb: Function) => {
  const tx = {
    select:  jest.fn(),
    insert:  jest.fn(),
    update:  jest.fn(),
    execute: jest.fn(),
  };
  // configure tx chains per test before calling the module
  return cb(tx);
});
```

### 3b. Mocking `verifySupabaseToken` (auth)

```ts
jest.mock('@/lib/auth', () => ({
  verifySupabaseToken: jest.fn(),
  verifyAuth: jest.fn(),
}));

import { verifySupabaseToken } from '@/lib/auth';

// Per-test — authenticated:
(verifySupabaseToken as jest.Mock).mockResolvedValue({ id: 'supabase-uid-123' });
// Per-test — unauthorized:
(verifySupabaseToken as jest.Mock).mockRejectedValue(
  Object.assign(new Error('Unauthorized'), { status: 401 })
);
```

### 3c. Mocking external fetch calls

```ts
global.fetch = jest.fn();

// Per test:
(global.fetch as jest.Mock).mockResolvedValue({
  ok: true,
  json: async () => ({
    result: 'success',
    data: { invoice_id: 'inv-123', action: { url: 'https://pay.portpos.com/abc' } }
  }),
});
```

### 3d. Creating a fake `Request` object for API route handlers

```ts
function makeRequest(
  body: object,
  headers: Record<string, string> = {},
  method = 'POST'
): Request {
  return new Request('http://localhost/api/test', {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
```

---

## 4. Test Suite Assignments

### Suite T1 — `lib/__tests__/validateMinPerKm.test.ts` (Tier 1)

**Target:** `lib/validateMinPerKm.ts`
**Rationale:** Pure function. Zero setup. The function is already extractable and a template exists in `docs/Plan/22-TEST-TEMPLATES.md`. Easiest suite to write.

**Cases to cover:**

| # | Input | Expected |
|---|---|---|
| 1 | `value=0` | `valid: true` — zero always clears the minimum |
| 2 | `value` at lower bound `floor(systemRate × 0.70)` | `valid: true` |
| 3 | `value` at upper bound `ceil(systemRate × 1.50)` | `valid: true` |
| 4 | `value` between bounds | `valid: true` |
| 5 | `value` below lower bound | `valid: false`, error message contains both bounds |
| 6 | `value` above upper bound | `valid: false` |
| 7 | `systemPerKmBdt=775` (bike_basic): lower=`floor(542.5)=542`, upper=`ceil(1162.5)=1163` | Exact boundary values |
| 8 | `systemPerKmBdt=2100` (car_premium): lower=`1470`, upper=`3150` | Boundary values valid |

**File to create:** `lib/__tests__/validateMinPerKm.test.ts`
**Run command:** `npx jest --testPathPattern="validateMinPerKm" --watchAll=false`

---

### Suite T2 — `lib/__tests__/vehicleTypes.test.ts` (Tier 1)

**Target:** `lib/vehicleTypes.ts` — `checkDriverEligibility()` and `validateDriverMinKm()`
**Rationale:** Pure functions. No DB. These gate dispatch eligibility for premium vehicle types.

**Cases for `checkDriverEligibility`:**

| # | vehicleType | completed_rides | rating | Expected |
|---|---|---|---|---|
| 1 | `bike_basic` (no driver_req) | 0 | 3.0 | `eligible: true` |
| 2 | `car_premium` (needs 50 rides + 4.5 rating) | 49 | 4.8 | `eligible: true` — ride threshold not met so rating gate does not fire |
| 3 | `car_premium` | 60 | 4.3 | `eligible: false` — meets rides but rating too low |
| 4 | `car_premium` | 60 | 4.5 | `eligible: true` |
| 5 | `car_xl` (needs 25 rides + 4.3 rating) | 30 | 4.2 | `eligible: false` |
| 6 | `car_xl` | 30 | 4.3 | `eligible: true` |
| 7 | `cng` (no driver_req) | 0 | 1.0 | `eligible: true` |

**Cases for `validateDriverMinKm`:**

| # | vehicleType | zonePerKmBdt | minPerKmBdt | Expected |
|---|---|---|---|---|
| 1 | `bike_basic`, zone=775, min=775 | At system rate | `valid: true` |
| 2 | `bike_basic`, zone=775, min=542 | At lower bound `floor(775×0.7)=542` | `valid: true` |
| 3 | `bike_basic`, zone=775, min=541 | Below lower bound | `valid: false` |
| 4 | `bike_basic`, zone=775, min=1163 | At upper bound `ceil(775×1.5)=1163` | `valid: true` |
| 5 | `bike_basic`, zone=775, min=1164 | Above upper bound | `valid: false` |

**File to create:** `lib/__tests__/vehicleTypes.test.ts`
**Run command:** `npx jest --testPathPattern="vehicleTypes" --watchAll=false`

---

### Suite T3 — `lib/__tests__/time.test.ts` (Tier 1)

**Target:** `lib/time.ts` — `nextBdtMidnightUtc()`
**Rationale:** Pure function relative to `Date.now()`. Uses `jest.useFakeTimers()` to control the clock.

**Cases:**

| # | Mocked UTC time | Expected result (UTC) |
|---|---|---|
| 1 | `2025-01-15 00:00:00Z` (BDT = 06:00, Jan 15) | `2025-01-15 18:00:00Z` (midnight BDT Jan 16) |
| 2 | `2025-01-15 20:00:00Z` (BDT = 02:00, Jan 16) | `2025-01-16 18:00:00Z` (midnight BDT Jan 17) |
| 3 | `2025-01-31 20:00:00Z` (BDT = Feb 01 02:00) | `2025-02-01 18:00:00Z` (month rollover) |
| 4 | `2025-12-31 20:00:00Z` (BDT = Jan 01 02:00) | `2026-01-01 18:00:00Z` (year rollover) |
| 5 | Any time | `instanceof Date === true` |
| 6 | Any time | `result.getTime() > Date.now()` — always in the future |

**File to create:** `lib/__tests__/time.test.ts`
**Run command:** `npx jest --testPathPattern="lib/__tests__/time" --watchAll=false`

---

### Suite T4 — `lib/__tests__/cityBoundary.test.ts` (Tier 1 + Tier 2)

**Target:** `lib/cityBoundary.ts` — `isIntercity()`, `detectOriginCity()`, `clearCityBoundaryCache()`

Define this polygon fixture at the top of the file and reuse across T4 and T5:

```ts
// Approximate rectangular bounding box for Dhaka — used across T4 and T5
const DHAKA_BOX = [
  { lat: 23.65, lng: 90.33 },
  { lat: 23.65, lng: 90.50 },
  { lat: 23.90, lng: 90.50 },
  { lat: 23.90, lng: 90.33 },
];
const INSIDE_DHAKA  = { lat: 23.77, lng: 90.41 };  // Dhanmondi
const OUTSIDE_DHAKA = { lat: 24.00, lng: 90.41 };  // Gazipur
```

#### Tier 1 — `isIntercity()` (pure, no mocks)

| # | dropoff | originPolygon | Expected |
|---|---|---|---|
| 1 | `INSIDE_DHAKA` | `DHAKA_BOX` | `false` — not intercity |
| 2 | `OUTSIDE_DHAKA` | `DHAKA_BOX` | `true` — intercity |
| 3 | Empty polygon `[]` | | `false` — guard |
| 4 | 2-vertex degenerate polygon | | `false` — guard |

#### Tier 2 — `detectOriginCity()` with mocked DB

Mock: `jest.mock('@/src/db', ...)`

| # | DB returns | pickup | Expected |
|---|---|---|---|
| 1 | `[{ name: 'Dhaka', polygon: DHAKA_BOX, is_active: true }]` | `INSIDE_DHAKA` | `{ origin_city: 'Dhaka', origin_city_polygon: DHAKA_BOX }` |
| 2 | Same city | `OUTSIDE_DHAKA` | `{ origin_city: null, origin_city_polygon: null }` |
| 3 | `[]` (no active cities) | Anywhere | `{ origin_city: null, origin_city_polygon: null }` |
| 4 | Two cities, pickup inside second | Chittagong polygon | `{ origin_city: 'Chittagong', ... }` |
| 5 | Call `detectOriginCity` twice without clearing cache | `db.select` call count | `=== 1` (cache hit on second call) |
| 6 | `clearCityBoundaryCache()` then call again | `db.select` call count | `=== 2` total (cache busted) |

**File to create:** `lib/__tests__/cityBoundary.test.ts`
**Run command:** `npx jest --testPathPattern="cityBoundary" --watchAll=false`

---

### Suite T5 — `lib/__tests__/zone.test.ts` (Tier 1 + Tier 2)

**Target:** `lib/zone.ts` — `isInsideZone()`, `validatePickupZone()`

Reuses `DHAKA_BOX`, `INSIDE_DHAKA`, `OUTSIDE_DHAKA` from T4.

#### Tier 1 — `isInsideZone()` (pure, no mocks)

| # | Point | Polygon | Expected |
|---|---|---|---|
| 1 | `INSIDE_DHAKA` | `DHAKA_BOX` | `true` |
| 2 | `OUTSIDE_DHAKA` | `DHAKA_BOX` | `false` |
| 3 | Any point | Empty polygon `[]` | `false` |
| 4 | Any point | 2-vertex polygon | `false` |

#### Tier 2 — `validatePickupZone()` with mocked DB

| # | DB returns | pickup | Expected |
|---|---|---|---|
| 1 | Active zone with `DHAKA_BOX` | `INSIDE_DHAKA` | `{ valid: true, zone: { id: ... } }` |
| 2 | Active zone with `DHAKA_BOX` | `OUTSIDE_DHAKA` | `{ valid: false }` |
| 3 | `[]` (no active zone — fail-open design) | Anywhere | `{ valid: true }` |
| 4 | Call `validatePickupZone` twice without clearing cache | `db.select` call count | `=== 1` |

**File to create:** `lib/__tests__/zone.test.ts`
**Run command:** `npx jest --testPathPattern="lib/__tests__/zone" --watchAll=false`

---

### Suite T6 — `lib/__tests__/routeSplit.test.ts` (Tier 1 + external mock)

**Target:** `lib/routeSplit.ts` — Haversine fallback path via `splitRoute()`, Barikoi path with mocked `fetch`

**Key design:** `splitRouteBarikoi` is private but reachable through `splitRoute`. When `global.fetch` throws, `splitRoute` automatically falls back to `splitRouteHaversine`. The Haversine path is pure logic testable without any network.

| # | Scenario | Setup | Expected |
|---|---|---|---|
| 1 | Dropoff inside `DHAKA_BOX` — Haversine fallback | `fetch` throws, dropoff inside polygon | `{ outside_km: 0, inside_km ≈ haversineTotal }` |
| 2 | Dropoff outside `DHAKA_BOX` — Haversine fallback | `fetch` throws, dropoff outside | `outside_km > 0` and `inside_km > 0` |
| 3 | Values round to 3 decimal places | Either path | `inside_km` and `outside_km` both 3 decimals |
| 4 | Barikoi returns valid polyline | Mock `fetch` with encoded polyline body | Returns split with non-zero `inside_km` and `outside_km` |
| 5 | `BARIKOI_API_KEY` env var not set | `delete process.env.BARIKOI_API_KEY` | Falls back to Haversine — no throw from `splitRoute` |
| 6 | Barikoi returns HTTP 500 | Mock `fetch` returns `{ ok: false, status: 500 }` | Falls back to Haversine — no throw |
| 7 | Empty polygon | `originCityPolygon: []` | Returns `{ inside_km: totalKm, outside_km: 0 }` |

**File to create:** `lib/__tests__/routeSplit.test.ts`
**Run command:** `npx jest --testPathPattern="routeSplit" --watchAll=false`

---

### Suite T7 — `utils-server/__tests__/heartbeat.test.ts` (Tier 2)

**Target:** `utils-server/heartbeat.ts` — `recordCallDeduction()`

**Mock strategy:** `db.transaction()` mock must **execute the callback**, passing a fully chainable `tx` object. This is the most critical mock pattern in the entire plan — get it right before writing cases.

```ts
// Transaction mock template for T7 and T9
function makeTransactionMock(txSetup: (tx: any) => void) {
  (db.transaction as jest.Mock).mockImplementation(async (cb: Function) => {
    const tx = {
      select:  jest.fn(),
      insert:  jest.fn(),
      update:  jest.fn(),
    };
    txSetup(tx);  // caller configures chains before callback runs
    return cb(tx);
  });
}
```

**Fixtures:**

```ts
const BASE_CTX = {
  driverId:       'driver-uuid-1',
  subscriptionId: 'sub-uuid-1',
  rideId:         'ride-uuid-1',
  confirmedAt:    new Date(),
};

const ACTIVE_SUB_10 = {
  id:               'sub-uuid-1',
  driver_id:        'driver-uuid-1',
  status:           'active',
  calls_remaining:  10,
  daily_calls_used: 0,
  total_deductions: 5,
  is_unlimited:     false,
};

const PKG_DAILY_CAP_200 = { daily_cap: 200 };
```

**Cases:**

| # | Scenario | tx.select setup | Expected outcome |
|---|---|---|---|
| 1 | Normal deduction | Sub=ACTIVE_SUB_10, pkg=PKG_DAILY_CAP_200 | Returns `{ deducted: true }`, `tx.insert` called with `event_type: 'deduction'`, `delta: -1` |
| 2 | No active subscription | Sub lookup returns `[]` | Returns `{ deducted: false }`, `tx.insert` NOT called |
| 3 | Subscription status = `expired` | Sub with `status: 'expired'` | `{ deducted: false }` |
| 4 | `calls_remaining === 0` | Sub with `calls_remaining: 0` | `{ deducted: false }` |
| 5 | `daily_calls_used >= daily_cap` | `daily_calls_used: 200`, `daily_cap: 200` | `{ deducted: false }` |
| 6 | Unlimited subscription `calls_remaining === -1` | Sub with `calls_remaining: -1` | `{ deducted: true }`, `balance_after: -1` in insert payload |
| 7 | Duplicate deduction — Postgres `23505` unique violation | `tx.insert` throws `{ code: '23505' }` | Returns `{ deducted: false }` — idempotency guard, no re-throw |
| 8 | Deduction decrements `calls_remaining` by 1 | Sub with `calls_remaining: 5` | `tx.update` called with `calls_remaining: 4` |
| 9 | Deduction increments `daily_calls_used` by 1 | Sub with `daily_calls_used: 3` | `tx.update` payload has `daily_calls_used: 4` |
| 10 | Non-`23505` DB error propagates | `tx.insert` throws `{ code: '40001' }` (deadlock) | Error re-thrown, NOT swallowed |

**Invariants verified:**
- Case 7: `(ride_id, driver_id)` pair produces at most one `call_ledger` deduction row
- Case 6: unlimited subscriptions never run out of calls

**File to create:** `utils-server/__tests__/heartbeat.test.ts`
**Run command:** `cd "D:\My Projects\Current Project\Ride\utils-server" && npx jest --testPathPattern="heartbeat" --watchAll=false`

---

### Suite T8 — `utils-server/__tests__/dispatch.test.ts` (Tier 2)

**Target:** `utils-server/dispatch.ts` — `scoreAndBatchDrivers()`, `isDispatchPaused()`

**Mocks required at module level:**

```ts
jest.mock('../../src/db', () => ({ db: { select: jest.fn(), insert: jest.fn() } }));
jest.mock('../h3Index',          () => ({ getDriversInCells: jest.fn() }));
jest.mock('../../lib/h3',        () => ({ getH3Ring: jest.fn(() => ['cell1', 'cell2']) }));
jest.mock('../../lib/vehicleTypes', () => ({ checkDriverEligibility: jest.fn(() => ({ eligible: true })) }));
```

**Fixture: driver builder**

```ts
const mkDriver = (overrides: Partial<any> = {}) => ({
  id:                    'driver-1',
  last_location_lat:     '23.8103',
  last_location_lng:     '90.4125',
  rating:                '4.5',
  acceptance_rate:       '90.00',
  last_location_at:      new Date(),
  completed_rides_count: 20,
  min_per_km_bdt:        null,
  vehicle_type:          'bike_basic',
  ...overrides,
});

const PRICING_775   = [{ per_km_bdt: 775 }];
const NO_OFFERS     = [];
const RIDE_ID       = 'ride-abc-123';
const ZONE_ID       = 'zone-xyz-456';
const ORIGIN        = { lat: 23.8103, lng: 90.4125 };
```

**Cases:**

| # | Scenario | Setup | Expected |
|---|---|---|---|
| 1 | No candidates in H3 cells | `getDriversInCells` returns `[]` | Returns `[]`, `db.select` NOT called |
| 2 | Driver already offered this ride (alreadyOffered guard) | `existingOffers` contains `driver-1` | `driver-1` NOT in results |
| 3 | `min_per_km_bdt: null` — passes filter | Driver row has `min_per_km_bdt: null` | Driver in scored results |
| 4 | `min_per_km_bdt > systemRate` — filtered | `min_per_km_bdt: 1200`, system: 775 | Driver NOT in results |
| 5 | Filtered driver gets `dispatch_offers` insert with `outcome: 'filtered'` | Same as case 4 | `db.insert` called with `{ outcome: 'filtered', filtered_reason: 'min_per_km', driver_id: 'driver-1' }` |
| 6 | `min_per_km_bdt <= systemRate` — passes | `min_per_km_bdt: 650`, system: 775 | Driver in results |
| 7 | `checkDriverEligibility` returns `{ eligible: false }` | Mock returns ineligible | Driver excluded, no `db.insert` for this driver |
| 8 | `batchSize` cap respected | 10 eligible drivers, batchSize=5 | `results.length === 5` |
| 9 | Results ordered by proximity | 3 drivers at varying distances | Closest driver is first in array |
| 10 | Pricing lookup empty — system rate = 0 | `PRICING_775` mock returns `[]` | All drivers with `min_per_km_bdt != null` filtered |
| 11 | `isDispatchPaused` — key = `'true'` in DB | `systemConfig` row `{ value: 'true' }` | Returns `true` |
| 12 | `isDispatchPaused` — key absent | Config lookup returns `[]` | Returns `false` |

**Invariants verified:**
- Case 2: driver from batch N never appears in batch N+1 (alreadyOffered set)
- Cases 3+4: `min_per_km_bdt` filter is applied before scoring, not after
- Case 1: empty candidate list short-circuits before any DB reads (performance)

**File to create:** `utils-server/__tests__/dispatch.test.ts`
**Run command:** `cd "D:\My Projects\Current Project\Ride\utils-server" && npx jest --testPathPattern="dispatch" --watchAll=false`

---

### Suite T9 — `lib/__tests__/activateSubscription.test.ts` (Tier 2)

**Target:** `lib/activateSubscription.ts` — `activateSubscription()`

**Mock strategy:** This function is entirely inside `db.transaction()`. Use `makeTransactionMock` from T7. The `tx` inside the callback makes multiple sequential `select`, `insert`, and `update` calls — configure them in order using a call-count approach:

```ts
// Configure tx.select to return different values on each call
let selectCallCount = 0;
const selectReturns = [
  [BASE_EVT],      // 1st call: payment event lookup
  [BASE_PKG],      // 2nd call: package lookup
  [],              // 3rd call: creditVouchers (none)
];
tx.select.mockImplementation(() => mockSelectChain(selectReturns[selectCallCount++] ?? []));
```

**Fixtures:**

```ts
const EVT_ID = 'evt-uuid-1';

const BASE_EVT = {
  id:              EVT_ID,
  driver_id:       'driver-uuid-1',
  package_id:      'pkg-uuid-1',
  subscription_id: null,
  amount_bdt:      50000,
  status:          'initiated',
};

const BASE_PKG = {
  id:            'pkg-uuid-1',
  call_count:    100,
  duration_days: 30,
  price_bdt:     50000,
  is_trial:      false,
};

const NEW_SUB = { id: 'sub-uuid-new', calls_remaining: 100 };
```

**Cases:**

| # | Scenario | tx setup | Expected |
|---|---|---|---|
| 1 | Normal activation | Event, pkg, no vouchers | Returns `{ subscriptionId: 'sub-uuid-new' }`, `tx.insert` called twice (subscriptions + callLedger `initial_load`) |
| 2 | Already activated — idempotency | `evt.subscription_id: 'sub-already'` | Returns `{ subscriptionId: 'sub-already' }` immediately, zero new inserts |
| 3 | Event not found | tx.select returns `[]` first | Throws containing `payment_event not found` |
| 4 | No `driver_id` on event | `{ ...BASE_EVT, driver_id: null }` | Throws containing `has no driver_id` |
| 5 | No `package_id` on event | `{ ...BASE_EVT, package_id: null }` | Throws containing `has no package_id` |
| 6 | Package not found | pkg select returns `[]` | Throws containing `package not found` |
| 7 | Amount mismatch | `evt.amount_bdt: 40000`, `pkg.price_bdt: 50000` | Throws containing `amount_mismatch` |
| 8 | Unlimited package (`call_count === -1`) | `pkg.call_count: -1` | `subscriptions` insert has `calls_remaining: -1`, callLedger `delta: -1` |
| 9 | One credit voucher exists | Voucher select returns `[{ id: 'v1', calls: 10, status: 'active' }]` | Third `tx.insert` (callLedger credit), `tx.update` called for voucher → `status: 'redeemed'` |
| 10 | Two credit vouchers | `[{ calls: 5 }, { calls: 8 }]` | Two credit callLedger rows, two voucher updates |
| 11 | `paymentEvents` updated to `paid` on success | Normal activation | `tx.update` called with `{ status: 'paid', subscription_id: 'sub-uuid-new' }` |
| 12 | Unlimited package with voucher | `call_count: -1`, one voucher | Voucher redeemed, `calls_remaining` stays `-1` (unlimited — no increment) |

**Invariants verified:**
- Case 2: duplicate bKash IPN callback activates subscription exactly once
- Case 1: `initial_load` entry always written to `callLedger`
- Case 7: amount mismatch throws before any state is written

**File to create:** `lib/__tests__/activateSubscription.test.ts`
**Run command:** `npx jest --testPathPattern="activateSubscription" --watchAll=false`

---

### Suite T10 — `app/__tests__/api-package-purchase.test.ts` (Tier 3)

**Target:** `app/api/package/purchase+api.ts` — exported `POST` handler

**Mocks required:**

```ts
jest.mock('@/lib/auth',    () => ({ verifySupabaseToken: jest.fn() }));
jest.mock('@/lib/portpos', () => ({ portposClient: { createInvoice: jest.fn() }, isConfigured: jest.fn() }));
jest.mock('@/lib/logger',  () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));
jest.mock('@/src/db', () => ({ db: { select: jest.fn(), insert: jest.fn(), update: jest.fn() } }));
```

**Fixture: valid request builder**

```ts
const VALID_IDEM_KEY = '550e8400-e29b-41d4-a716-446655440000';
const VALID_PKG_ID   = '123e4567-e89b-12d3-a456-426614174000';

function makeReq(body: object = { package_id: VALID_PKG_ID, provider: 'portpos' }, extraHeaders: Record<string,string> = {}) {
  return new Request('http://localhost/api/package/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': VALID_IDEM_KEY, ...extraHeaders },
    body: JSON.stringify(body),
  });
}
```

**Cases:**

| # | Scenario | Setup | Status | Body error key |
|---|---|---|---|---|
| 1 | Missing `Idempotency-Key` | No header | 400 | `missing_idempotency_key` |
| 2 | Malformed `Idempotency-Key` (not UUID v4) | `'not-a-uuid'` | 400 | `missing_idempotency_key` |
| 3 | PortPos not configured | `isConfigured` returns `false` | 503 | `payment_not_configured` |
| 4 | Unauthorized | `verifySupabaseToken` throws 401 | 401 | `unauthorized` |
| 5 | User not found in DB | users select returns `[]` | 404 | `user_not_found` |
| 6 | Driver not found | drivers select returns `[]` | 404 | `driver_not_found` |
| 7 | Driver status = `pending` | `driver.status: 'pending'` | 403 | `driver_status_invalid` |
| 8 | Driver status = `suspended` | `driver.status: 'suspended'` | 403 | `driver_status_invalid` |
| 9 | Package not found | packages select returns `[]` | 422 | `package_not_found` |
| 10 | Package `is_active: false` | `{ is_active: false }` | 422 | `package_not_found` |
| 11 | Vehicle type mismatch | `pkg.vehicle_type: 'car_premium'`, `driver.vehicle_type: 'bike_basic'` | 403 | `vehicle_type_mismatch` |
| 12 | Active subscription exists | subscriptions select returns existing sub | 409 | `active_subscription_exists` |
| 13 | Trial package — already used | `pkg.is_trial: true`, prior trial sub found | 409 | `trial_already_used` |
| 14 | Idempotency replay — event already exists | insert returns `undefined` (conflict), existing event re-fetched | 200 | `{ payment_event_id: existing.id, payment_url: null }` |
| 15 | Happy path — invoice created | All checks pass, `createInvoice` returns `{ invoice_id: 'inv-1', payment_url: 'https://...' }` | 200 | `{ payment_url, payment_event_id }` |
| 16 | Invalid body (missing `package_id`) | Body `{}` | 400 | `invalid_body` |
| 17 | Invalid `provider` value | `provider: 'bkash'` | 400 | `invalid_body` |

**Invariants verified:**
- Case 14: two requests with same idempotency key produce exactly one `payment_events` row

**File to create:** `app/__tests__/api-package-purchase.test.ts`
**Run command:** `npx jest --testPathPattern="api-package-purchase" --watchAll=false`

---

### Suite T11 — `app/__tests__/api-ride-request.test.ts` (Tier 3)

**Target:** `app/api/ride/request+api.ts` — exported `POST` handler

**Mocks required:**

```ts
jest.mock('@/lib/auth',         () => ({ verifySupabaseToken: jest.fn() }));
jest.mock('@/lib/zone',         () => ({ validatePickupZone: jest.fn() }));
jest.mock('@/lib/cityBoundary', () => ({ detectOriginCity: jest.fn(), isIntercity: jest.fn() }));
jest.mock('@/lib/routeSplit',   () => ({ splitRoute: jest.fn() }));
jest.mock('@/lib/barikoi',      () => ({ getRouteDistance: jest.fn() }));
jest.mock('@/lib/logger',       () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));
jest.mock('@/src/db',           () => ({ db: { select: jest.fn(), insert: jest.fn(), update: jest.fn() } }));
// NOTE: do NOT mock @/lib/fareCalc — use the real calculateFare function
```

**Standard happy-path setup (used across most cases):**

```ts
function setupHappyPath() {
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: 'uid-1' });
  (validatePickupZone  as jest.Mock).mockResolvedValue({ valid: true, zone: { id: 'zone-1' } });
  (detectOriginCity    as jest.Mock).mockResolvedValue({ origin_city: null, origin_city_polygon: null });
  (isIntercity         as jest.Mock).mockReturnValue(false);
  (getRouteDistance    as jest.Mock).mockResolvedValue({ distanceKm: 5 });
  // db.select returns: [user], [], [countResult{count:0}], [activePricing], [preferences]
  // db.insert returns: [{ id: 'ride-new-id', ... }]
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
}

const ACTIVE_PRICING = {
  id: 'pricing-1', vehicle_type: 'bike_basic', zone_id: 'zone-1',
  base_fare_bdt: 2500, per_km_bdt: 775, intercity_per_km_bdt: null,
  per_min_bdt: 175, floor_length_km: '2.00', floor_min: 10,
  brta_fare_ceiling_bdt: null, platform_commission_percent: '0', is_active: true,
};

const VALID_BODY = {
  pickup_lat: 23.8103,  pickup_lng: 90.4125,  pickup_address:  'Dhanmondi, Dhaka',
  dropoff_lat: 23.7806, dropoff_lng: 90.4193, dropoff_address: 'Mohammadpur, Dhaka',
  vehicle_type: 'bike_basic',
};
```

**Cases:**

| # | Scenario | Setup delta | Status | Body key |
|---|---|---|---|---|
| 1 | Unauthorized | `verifySupabaseToken` throws 401 | 401 | `unauthorized` |
| 2 | User not found | users select `[]` | 404 | `user_not_found` |
| 3 | User role = `driver` | `user.role: 'driver'` | 403 | `forbidden` |
| 4 | Pickup outside zone | `validatePickupZone` → `{ valid: false }` | 422 | `outside_zone` |
| 5 | Active ride exists | First rides query returns existing ride | 409 | `ride_already_active` |
| 6 | Rate limited (5 rides in last hour) | Count query returns `{ count: 5 }` | 429 | `rider_rate_limited` |
| 7 | Pricing not found | pricing select `[]` | 422 | `pricing_not_found` |
| 8 | Happy path — immediate ride, 5 km | Full happy path | 200 | `{ ride_id, fare_breakdown, status: 'pending' }` |
| 9 | Fare floor applies — short trip | `getRouteDistance` returns `{ distanceKm: 1 }` | 200 | `fare_breakdown.total_bdt === 5800` (floor for bike_basic) |
| 10 | Scheduled ride — dispatch NOT called | Add `scheduled_at: '2025-12-25T10:00:00Z'` | 200 | `global.fetch` called 0 times |
| 11 | Intercity ride | `detectOriginCity` returns Dhaka polygon, `isIntercity` returns `true`, `splitRoute` returns `{ inside_km: 3, outside_km: 5 }` | 200 | `fare_breakdown.is_intercity === true` |
| 12 | Barikoi fails — Haversine fallback | `getRouteDistance` throws | 200 | Ride created, no error |
| 13 | Invalid body — missing `vehicle_type` | Body without `vehicle_type` | 400 | `validation_error` |
| 14 | Invalid `vehicle_type` value | `vehicle_type: 'helicopter'` | 400 | `validation_error` |
| 15 | Dispatch retry — first attempt fails | `global.fetch` fails twice then succeeds | 200 | Ride created; `global.fetch` called 3 times |
| 16 | Dispatch silently fails after 3 retries | `global.fetch` always returns `ok: false` | 200 | Ride still created (dispatch failure non-fatal) |

**File to create:** `app/__tests__/api-ride-request.test.ts`
**Run command:** `npx jest --testPathPattern="api-ride-request" --watchAll=false`

---

## 5. Execution Order

Execute suites strictly in this order. Each suite must reach 0 failures before the next begins.

```
T1 → T2 → T3         Pure logic (Tier 1) — no mocks, fastest, do first
      ↓
T4 → T5 → T6         Tier 1 + Tier 2 with simple DB mocks
      ↓
T7 → T8              Tier 2 — transaction mocks, most complex DB interaction
      ↓
T9                   Tier 2 — activateSubscription, most complex transaction
      ↓
T10 → T11            Tier 3 — full API handler tests
```

---

## 6. Coverage Targets

| Module | Minimum coverage |
|---|---|
| `lib/fareCalc.ts` | 95% (already met) |
| `lib/validateMinPerKm.ts` | 100% |
| `lib/vehicleTypes.ts` | 85% |
| `lib/cityBoundary.ts` | 90% |
| `lib/zone.ts` | 90% |
| `lib/time.ts` | 100% |
| `lib/routeSplit.ts` | 80% (Barikoi path is partially exercised) |
| `lib/activateSubscription.ts` | 90% |
| `utils-server/heartbeat.ts` | 90% |
| `utils-server/dispatch.ts` | 75% (`scoreAndBatchDrivers` primary path) |
| `app/api/package/purchase+api.ts` | 85% |
| `app/api/ride/request+api.ts` | 80% |

```bash
# Full coverage report
npx jest --coverage --watchAll=false --coverageReporters=text-summary
```

---

## 7. Business Invariant Verification Checklist

| Invariant | Suite | Case # |
|---|---|---|
| `(ride_id, driver_id)` pair → at most one `call_ledger` deduction row | T7 | 7 |
| Driver with `calls_remaining === 0` never deducted | T7 | 4 |
| Driver with `daily_calls_used >= daily_cap` never deducted | T7 | 5 |
| Unlimited subscription (`calls_remaining === -1`) always deducts and keeps `-1` | T7 | 6, 8 |
| Driver from batch N never offered same ride again in batch N+1 | T8 | 2 |
| Driver with `min_per_km_bdt > systemRate` filtered, `dispatch_offers` row written | T8 | 4, 5 |
| Empty H3 candidate list short-circuits before any DB read | T8 | 1 |
| Two purchase requests with same idempotency key → one `payment_events` row | T10 | 14 |
| Duplicate bKash IPN callback → subscription activated exactly once | T9 | 2 |
| Amount mismatch → throws before any DB state written | T9 | 7 |
| Dispatch failure is non-fatal — ride still created | T11 | 16 |

---

## 8. Files to Create (Complete List)

```
lib/__tests__/validateMinPerKm.test.ts          ← T1
lib/__tests__/vehicleTypes.test.ts              ← T2
lib/__tests__/time.test.ts                      ← T3
lib/__tests__/cityBoundary.test.ts              ← T4
lib/__tests__/zone.test.ts                      ← T5
lib/__tests__/routeSplit.test.ts                ← T6
utils-server/jest.config.ts                     ← required for T7 + T8
utils-server/__tests__/heartbeat.test.ts        ← T7
utils-server/__tests__/dispatch.test.ts         ← T8
lib/__tests__/activateSubscription.test.ts      ← T9
app/__tests__/api-package-purchase.test.ts      ← T10
app/__tests__/api-ride-request.test.ts          ← T11
```

Possible update: `package.json` jest config block — add `moduleNameMapper` for `@/` alias if not present.

---

## 9. What This Plan Does NOT Cover (Out of Scope)

| Item | Reason |
|---|---|
| Native app E2E (driver/rider lifecycle, chat, map) | Requires device + compiled APK. Remains manual per TESTING.md phase gates H-08/H-09 |
| Admin panel Playwright tests | Already complete in `admin-test-results/admin-panel.spec.ts` |
| Firebase Cloud Functions (`functions/src/`) | Lives on separate Linux machine. Separate test run outside this project |
| WebSocket dispatch integration | Requires running `utils-server` process + real WebSocket client |
| PortPos IPN callback (`/api/payment/portpos/callback`) | Requires live IPN + HMAC verification against real PortPos endpoint |
| `utils-server/compensationWorker.ts` | Depends on real DB state + time-based triggers |
| `utils-server/scheduler.ts` | Requires time-mocked DB integration with real schema state |

---

## 10. Final Run Commands

```bash
# All root-level suites
npx jest --watchAll=false

# utils-server suites (separate Jest instance)
cd "D:\My Projects\Current Project\Ride\utils-server" && npx jest --watchAll=false

# Full coverage report across root suites
npx jest --coverage --watchAll=false --coverageReporters=text-summary
```
