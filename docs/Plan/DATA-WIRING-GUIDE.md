# Data Wiring Guide v2 — COMPLETE

> **Purpose**: Every screen in the app must display real data from the database.
> Zero hardcoding. If an API doesn't exist, CREATE IT. If a DB table doesn't
> exist, CREATE THE MIGRATION. This guide covers ALL remaining work.
>
> **Status of W1-W3 (already done):** 12 screens wired to existing APIs ✅.
> This document covers the REMAINING 20 screens that still have hardcoded data.

---

## Table of Contents

1. [Verification: W1-W3 Done](#1-verification-w1-w3-done)
2. [Remaining Work Overview](#2-remaining-work-overview)
3. [Tier 1: New API Reading Existing Tables (12 screens)](#3-tier-1)
4. [Tier 2: New Table + API + Screen (5 screens)](#4-tier-2)
5. [Tier 3: New Feature Development (3 screens)](#5-tier-3)
6. [API Endpoint Specs](#6-api-endpoint-specs)
7. [Migration Specs](#7-migration-specs)
8. [Screen Wiring Details](#8-screen-wiring-details)
9. [Batch Plan](#9-batch-plan)

---

## 1. Verification: W1-W3 Done

Confirmed working (agent's claim verified):

| Screen | API | Status |
|--------|-----|--------|
| `(tabs)/activity/index.tsx` | `fetchActiveRide()` on mount | ✅ |
| `(tabs)/activity-completed/index.tsx` | `fetchRideHistory()` → `/api/ride/get-all` | ✅ |
| `(tabs)/activity-scheduled/index.tsx` | `fetchRideHistory()` | ✅ |
| `ride-details-completed/[id]` | `GET /api/ride/{id}` | ✅ |
| `ride-details-scheduled/[id]` | `GET /api/ride/{id}` | ✅ |
| `subscription-plans/index.tsx` | `GET /api/package/list` | ✅ |
| `subscription-details/index.tsx` | `GET /api/package/list` | ✅ |
| `subscription-checkout/index.tsx` | route param data | ✅ |
| `active-subscription/index.tsx` | `useDriverFlowStore.activeSubscription` | ✅ |
| `subscription-renewal/index.tsx` | `useDriverFlowStore.activeSubscription` | ✅ |
| `apply-promos/index.tsx` | `GET /api/promo/list` | ✅ |
| `earnings/index.tsx` | `GET /api/driver/calculate-price` | ✅ (but Tips/Promos still ৳0 — see Tier 1) |

Store fixes confirmed:
- `useDriverFlowStore.ts` — relative URLs fixed to `${API_URL}` ✅
- `useDriverFlowStore.ts` — auth headers added ✅
- `useRiderStore.ts` — `fetchRideHistory` added ✅
- `Transaction.amount` → `amount_bdt` ✅
- `verify-driver+api.ts` — `console.error` → `logger.error` (verify this was done)

---

## 2. Remaining Work Overview

20 screens still have hardcoded data. They fall into 3 tiers:

### Tier 1: New API Reading Existing Tables — 12 screens, NO migration needed

The DB already has the data. We just need to create API endpoints that query it,
then wire the screens.

| # | Screen | What's Hardcoded | New API Needed | Source Table(s) |
|---|--------|-----------------|----------------|-----------------|
| 1 | `earnings/index.tsx` (leftover) | Tips ৳0, Promos ৳0 | Extend `calculate-price` to return breakdown | `rides` (promo_code_id, promo_discount_bdt) |
| 2 | `earnings-breakdown/index.tsx` | 8 fake trips | `GET /api/driver/earnings/breakdown` | `rides` WHERE status='completed' |
| 3 | `performance-stats/index.tsx` | 6 fake stats | `GET /api/driver/performance` | `drivers` + `dispatch_offers` + `rides` + `driver_online_sessions` |
| 4 | `commission-statement/index.tsx` | Fake totals + trips | `GET /api/driver/commission-statement` | `rides.platform_commission_bdt` + `pricing` |
| 5 | `due-amounts/index.tsx` | Fake dues | `GET /api/driver/dues` | `subscriptions` + `rides.platform_commission_bdt` |
| 6 | `settings/notifications/index.tsx` (driver) | 4 hardcoded toggles | `GET/PATCH /api/user/notification-prefs` | `users.notification_prefs` (jsonb) |
| 7 | `(tabs)/settings/notifications/index.tsx` (rider) | 5 hardcoded toggles | Same endpoint | `users.notification_prefs` |
| 8 | `(tabs)/settings/data-analytics/index.tsx` | 2 hardcoded toggles | `GET/PATCH /api/user/data-controls` | `users.data_controls` (jsonb) |
| 9 | `(tabs)/settings/linked-accounts/index.tsx` | 2 fake accounts | `GET/PATCH /api/user/linked-accounts` | `users.linked_accounts` (jsonb) |
| 10 | `(tabs)/profile/index.tsx` (rider) | Clerk-shim fields | `GET /api/user/me` | `users` table |
| 11 | `(tabs)/settings/contact-support/index.tsx` | Fake setTimeout submit + hardcoded phone | `POST /api/support/ticket` | new `support_tickets` table (Tier 2) |
| 12 | `report-issue/index.tsx` (driver) | No submit on Continue | `POST /api/support/ticket` | same |

### Tier 2: New Table + Migration + API + Screen — 5 screens

Need a new DB table, then an API, then wire the screen.

| # | Screen | What's Missing | New Table | New API |
|---|--------|---------------|-----------|---------|
| 13 | `(tabs)/settings/faq/index.tsx` (rider) | 8 hardcoded Q&As | `faqs` table | `GET /api/faqs?role=rider` |
| 14 | `faq/index.tsx` (driver) | 6 hardcoded Q&As | same table | `GET /api/faqs?role=driver` |
| 15 | `(tabs)/settings/contact-support/index.tsx` + `report-issue/index.tsx` | No persistence | `support_tickets` table | `POST /api/support/ticket` |
| 16 | `emergency-contacts/index.tsx` (driver) + `(tabs)/settings/emergency-contacts/index.tsx` (rider) | Local-only contacts | `user_emergency_contacts` table | `GET/POST/DELETE /api/user/emergency-contacts` |
| 17 | `settings/account-security/index.tsx` (driver) | Fake delete | uses `users.deleted_at` (soft delete) | `DELETE /api/user/account` |
| 18 | `schedule/index.tsx` (driver) | No persistence | `driver_schedules` table | `GET/PUT /api/driver/schedule` |

### Tier 3: Feature Development — 3 screens (require significant backend work)

These are genuinely new features, not just data wiring.

| # | Screen | What's Missing | Effort |
|---|--------|---------------|--------|
| 19 | `hotspot-map/index.tsx` | Surge pricing is unimplemented in DB. No demand heatmap, no surge multipliers. | Major — requires H3 aggregation of live ride requests + surge calculation engine. Defer to post-launch. |
| 20 | `break-mode/index.tsx` | No break-state tracking. | Medium — add `drivers.on_break` boolean + break-start/break-end timestamps. |
| 21 | `(tabs)/settings/add-payment/index.tsx` | PortPos card tokenization not integrated. | Major — requires PortPos tokenization API integration + PCI compliance review. |

---

## 3. Tier 1 — New APIs Reading Existing Tables

### 3.1 `GET /api/driver/earnings/breakdown` (Screen #2)

**File**: `app/api/driver/earnings/breakdown+api.ts`
**Auth**: `requireRole('driver')`
**Query params**: `?range=today|week|month` (default: week)

**Response**:
```ts
{
  range: "week",
  period_start: string,     // ISO, start of current Dhaka week
  period_end: string,       // ISO
  total_earnings_bdt: number,    // SUM(driver_fare_bdt) in paisa
  total_trips: number,
  trips: Array<{
    ride_id: string;
    completed_at: string;        // ISO
    fare_bdt: number;            // fare_breakdown.total_bdt (paisa)
    driver_fare_bdt: number;     // what driver earned (paisa)
    distance_km: number;         // parseFloat
    origin_address: string;
    destination_address: string;
  }>
}
```

**Query** (Drizzle):
```ts
// Get driver_id from auth_uid
// SELECT FROM rides WHERE driver_id = ? AND status = 'completed'
//   AND completed_at >= period_start AND completed_at < period_end
//   ORDER BY completed_at DESC LIMIT 200
```

### 3.2 `GET /api/driver/performance` (Screen #3)

**File**: `app/api/driver/performance+api.ts`
**Auth**: `requireRole('driver')`
**Query params**: `?range=week|month` (default: week)

**Response**:
```ts
{
  acceptance_rate: number,        // drivers.acceptance_rate * 100 (e.g. 92.5)
  cancellation_rate: number,      // (cancelled_by_driver / total_assigned) * 100
  rating: number,                 // parseFloat(drivers.rating)
  trips_this_week: number,        // COUNT rides status=completed this week
  trips_this_month: number,       // COUNT rides status=completed this month
  online_hours: number,           // SUM(duration_minutes) / 60 from driver_online_sessions this week
}
```

**Query**:
```ts
// acceptance_rate: drivers.acceptance_rate (already cached column)
// rating: drivers.rating
// cancellation_rate: COUNT rides WHERE driver_id=? AND status='cancelled' AND cancelled_by='driver'
//   / COUNT rides WHERE driver_id=? AND status IN ('completed','cancelled')
// trips_this_week: COUNT rides WHERE driver_id=? AND status='completed' AND completed_at >= weekStart
// online_hours: SUM(duration_minutes) FROM driver_online_sessions WHERE driver_id=? AND went_online_at >= weekStart
```

### 3.3 `GET /api/driver/commission-statement` (Screen #4)

**File**: `app/api/driver/commission-statement+api.ts`
**Auth**: `requireRole('driver')`
**Query params**: `?week=YYYY-MM-DD` (default: current week)

**Response**:
```ts
{
  week_start: string,
  week_end: string,
  total_earnings_bdt: number,         // SUM(fare_breakdown->>total_bdt) paisa
  commission_rate_percent: number,    // from pricing.platform_commission_percent for driver's vehicle_type
  commission_charged_bdt: number,     // SUM(rides.platform_commission_bdt)
  driver_net_bdt: number,             // total_earnings - commission_charged
  trips: Array<{
    ride_id: string;
    completed_at: string;
    total_fare_bdt: number;           // fare_breakdown.total_bdt
    commission_bdt: number;           // rides.platform_commission_bdt
    driver_net_bdt: number;           // total_fare - commission
  }>
}
```

**Note**: Settlement status ("Paid"/"Unpaid") — see Tier 3 note. For now, always return `status: "unsettled"`.

### 3.4 `GET /api/driver/dues` (Screen #5)

**File**: `app/api/driver/dues+api.ts`
**Auth**: `requireRole('driver')`

**Response**:
```ts
{
  subscription: {
    package_name: string | null,
    expires_at: string | null,
    calls_remaining: number,
    status: string,           // active/expired
  } | null,
  commission_due_bdt: number,   // SUM(platform_commission_bdt) WHERE settled = false (see note)
  total_outstanding_bdt: number,
}
```

**Note**: Commission settlement tracking doesn't exist yet. For now, commission_due = SUM of all `platform_commission_bdt` for completed rides where no matching `payment_events` settlement exists. This is approximate — a proper settlement system is Tier 3.

### 3.5 `GET/PATCH /api/user/notification-prefs` (Screens #6, #7)

**File**: `app/api/user/notification-prefs+api.ts`
**Auth**: `verifySupabaseToken`

**GET Response**:
```ts
{
  notification_prefs: {
    ride_updates: boolean,       // default true
    promo_offers: boolean,       // default true
    service_alerts: boolean,     // default true
    email_notifications: boolean,// default false
    sms_notifications: boolean,  // default true
  }
}
```

**PATCH Body** (partial update):
```ts
{ ride_updates?: boolean, promo_offers?: boolean, ... }
```

**Query**: Read/write `users.notification_prefs` jsonb column. If null, return defaults.

### 3.6 `GET/PATCH /api/user/data-controls` (Screen #8)

**File**: `app/api/user/data-controls+api.ts`
**Auth**: `verifySupabaseToken`

**GET Response**:
```ts
{
  data_controls: {
    share_usage_data: boolean,   // default true
    personalized_ads: boolean,   // default false
  }
}
```

**PATCH Body**: `{ share_usage_data?: boolean, personalized_ads?: boolean }`

**Query**: Read/write `users.data_controls` jsonb column.

### 3.7 `GET/PATCH /api/user/linked-accounts` (Screen #9)

**File**: `app/api/user/linked-accounts+api.ts`
**Auth**: `verifySupabaseToken`

**GET Response**:
```ts
{
  linked_accounts: Array<{
    provider: string,       // "google" | "facebook" | "bkash" | etc
    label: string,          // display name
    connected: boolean,
    connected_at: string | null,
  }>
}
```

**PATCH Body** (connect/disconnect):
```ts
{ provider: string, action: "connect" | "disconnect" }
```

**Query**: Read/write `users.linked_accounts` jsonb. For now, return empty array (no social auth integrated yet). The screen should show "No linked accounts" and the connect buttons should be disabled with a "Coming soon" label.

### 3.8 `GET /api/user/me` (Screen #10 — rider profile)

**File**: `app/api/user/me+api.ts`
**Auth**: `verifySupabaseToken`

**Response**:
```ts
{
  user: {
    id: string,
    name: string,
    email: string | null,
    phone: string,
    role: string,
    profile_image_url: string | null,
    rating: number | null,      // parseFloat
    rating_count: number,
    created_at: string,
  }
}
```

**Query**: `SELECT FROM users WHERE auth_uid = ?` — single row.

### 3.9 Extend `GET /api/driver/calculate-price` (Screen #1 — earnings leftover)

**Current response**: `{ totalEarnings: number }` (taka)

**Extended response**:
```ts
{
  totalEarnings: number,        // taka (keep existing for backward compat)
  total_earnings_bdt: number,   // paisa (new — for consistency)
  tips_bdt: number,             // paisa — SUM of tips (0 until tips feature exists)
  promos_bdt: number,           // paisa — SUM(promo_discount_bdt) for today's completed rides
  trip_count: number,           // completed rides today
}
```

**Query addition**: Also SELECT `COUNT(*)` and `SUM(promo_discount_bdt)` from today's completed rides.

---

## 4. Tier 2 — New Table + Migration + API

### 4.1 `faqs` table (Screens #13, #14)

**Migration** (`src/db/schema.ts` addition):
```ts
export const faqs = pgTable('faqs', {
  id: uuid('id').primaryKey().defaultRandom(),
  role: userRoleEnum('role').notNull(),     // 'rider' | 'driver'
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  category: varchar('category', { length: 50 }),
  sort_order: integer('sort_order').default(0),
  is_active: boolean('is_active').default(true),
  created_at: timestamptz('created_at').notNull().defaultNow(),
  updated_at: timestamptz('updated_at').notNull().defaultNow(),
});
```

**Seed**: Insert ~8 rider FAQs + ~6 driver FAQs (the currently hardcoded content becomes seed data).

**API**: `app/api/faqs+api.ts`
- `GET /api/faqs?role=rider|driver` — PUBLIC
- Response: `{ faqs: [{ id, question, answer, category }] }`

### 4.2 `support_tickets` table (Screens #11, #12, #15)

**Migration**:
```ts
export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id),
  ride_id: uuid('ride_id').references(() => rides.id),  // nullable — not all issues are ride-specific
  category: varchar('category', { length: 50 }).notNull(),
  subject: varchar('subject', { length: 200 }),
  description: text('description').notNull(),
  status: varchar('status', { length: 20 }).default('open'),  // open/in_progress/resolved/closed
  priority: varchar('priority', { length: 10 }).default('normal'),
  created_at: timestamptz('created_at').notNull().defaultNow(),
  updated_at: timestamptz('updated_at').notNull().defaultNow(),
});
```

**API**: `app/api/support/ticket+api.ts`
- `POST /api/support/ticket` — AUTH
- Body: `{ category, subject?, description, ride_id? }`
- Response: `{ ticket_id, status: "open" }`

### 4.3 `user_emergency_contacts` table (Screen #16)

**Migration**:
```ts
export const userEmergencyContacts = pgTable('user_emergency_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id),
  name: varchar('name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),
  relationship: varchar('relationship', { length: 50 }),
  created_at: timestamptz('created_at').notNull().defaultNow(),
  updated_at: timestamptz('updated_at').notNull().defaultNow(),
});
```

**API**: `app/api/user/emergency-contacts+api.ts`
- `GET /api/user/emergency-contacts` → `{ contacts: [{ id, name, phone, relationship }] }`
- `POST /api/user/emergency-contacts` → body: `{ name, phone, relationship? }` → `{ contact: {...} }`
- `DELETE /api/user/emergency-contacts` → query: `?id=UUID` → `{ success: true }`

### 4.4 Soft-delete account (Screen #17)

**No new table needed** — add `deleted_at` column to `users` if not present (check schema — it may already exist).

**API**: `app/api/user/account+api.ts`
- `DELETE /api/user/account` — AUTH
- Body: `{ reason?: string }`
- Action: `UPDATE users SET deleted_at = NOW(), status = 'deleted' WHERE id = ?`
- Response: `{ success: true }`
- Also: invalidate Supabase session, sign out.

### 4.5 `driver_schedule` table (Screen #18)

**Migration**:
```ts
export const driverSchedule = pgTable('driver_schedule', {
  id: uuid('id').primaryKey().defaultRandom(),
  driver_id: uuid('driver_id').notNull().references(() => drivers.id),
  day_of_week: integer('day_of_week').notNull(),  // 0=Sun ... 6=Sat
  start_time: varchar('start_time', { length: 5 }).notNull(),  // "09:00"
  end_time: varchar('end_time', { length: 5 }).notNull(),      // "21:00"
  is_active: boolean('is_active').default(true),
  created_at: timestamptz('created_at').notNull().defaultNow(),
  updated_at: timestamptz('updated_at').notNull().defaultNow(),
});
```

**API**: `app/api/driver/schedule+api.ts`
- `GET /api/driver/schedule` → `{ schedule: [{ day_of_week, start_time, end_time, is_active }] }`
- `PUT /api/driver/schedule` → body: `{ schedule: [{ day_of_week, start_time, end_time, is_active }] }` → `{ success: true }`

---

## 5. Tier 3 — Feature Development

These require significant backend work beyond data wiring.

### 5.1 Hotspot Map (#19)

Surge pricing is not implemented. This screen needs:
- H3 cell aggregation of recent ride requests per area
- Surge multiplier calculation (demand vs supply)
- `GET /api/driver/hotspots` endpoint

**Recommendation**: Remove this screen from navigation until the surge feature is built. Show a "Coming soon" placeholder OR remove the navigation entry. Do NOT leave fake data on screen.

### 5.2 Break Mode (#20)

Minimal implementation:
- Add `drivers.on_break` boolean + `drivers.break_started_at` timestamptz to schema
- `POST /api/driver/break/start` → sets `on_break=true, break_started_at=NOW()`
- `POST /api/driver/break/end` → sets `on_break=false, break_started_at=null`
- Screen reads `useDriverFlowStore.driver.on_break` and computes elapsed time

### 5.3 Add Payment Method (#21)

Card tokenization requires PortPos integration beyond what exists.
**Recommendation**: The screen should redirect to PortPos hosted checkout (like package purchase does) rather than capturing card details in-app. Wire the "Add Card" button to open PortPos checkout URL. No card data stored locally.

---

## 5b. Critical Missing APIs (discovered post-W9 audit)

These were missed in the original guide. They are REQUIRED for the app to be
fully functional — without them, ratings are silently discarded, tips vanish,
and the ride history tabs are all identical.

### 5b.1 Rating API — `POST /api/ride/{id}/rate`

**Why needed**: `rate-driver/index.tsx` and `rate-rider/index.tsx` both POST to
endpoints that DO NOT EXIST. The rating is silently lost.

**Schema**: `rides.rider_rating` (smallint) and `rides.driver_rating` (smallint)
ALREADY EXIST. No migration needed. Aggregate columns `drivers.rating`,
`drivers.rating_count`, `drivers.rating_sum` and `users.rating`,
`users.rating_count`, `users.rating_sum` also exist.

**Files to create**:
- `app/api/ride/[id]/rate+api.ts` — handles both rider→driver and driver→rider

**Auth**: `verifySupabaseToken` + verify caller is participant of the ride

**Request body**:
```ts
{
  rating: number,          // 1-5
  feedback?: string,       // optional text feedback
  role: "rider" | "driver" // who is submitting (determines which column to write)
}
```

**Logic**:
1. Verify ride exists and `status = 'completed'`
2. Verify caller is `rides.user_id` (if role=rider) or `rides.driver_id` (if role=driver)
3. Prevent double-rating (check if column already non-null)
4. `UPDATE rides SET rider_rating = ? (or driver_rating = ?) WHERE id = ?`
5. Update aggregates: `UPDATE drivers SET rating_sum = rating_sum + ?, rating_count = rating_count + 1, rating = rating_sum / rating_count WHERE id = ?` (or `users` table for rider)
6. Return `{ success: true }`

**Response**: `{ success: true }`
**Errors**: `404 ride_not_found` | `403 not_participant` | `409 already_rated` | `422 ride_not_completed`

**Screens to wire**:
- `app/(main)/(customer)/rate-driver/index.tsx` — change fetch URL to `/api/ride/${activeRide?.id}/rate`, body `{ rating, feedback, role: "rider" }`
- `app/(main)/(rider)/rate-rider/index.tsx` — same pattern, `role: "driver"`, ride ID from `activeOffer?.ride_id`

### 5b.2 Tip API + Schema — `POST /api/ride/{id}/tip`

**Why needed**: `add-tip/index.tsx` computes a tip then just navigates away.
The tip is discarded. No `tip_bdt` column exists.

**Migration** (add to W4 migration or separate):
```sql
ALTER TABLE rides ADD COLUMN tip_bdt INTEGER DEFAULT 0;
```

Also add to `src/db/schema.ts`:
```ts
tip_bdt: integer('tip_bdt').default(0),
```

**File to create**: `app/api/ride/[id]/tip+api.ts`

**Auth**: `verifySupabaseToken` + verify caller is the rider (`rides.user_id`)

**Request body**:
```ts
{ amount_bdt: number }  // integer paisa (e.g. 2000 = ৳20)
```

**Logic**:
1. Verify ride exists and `status = 'completed'`
2. Verify caller is `rides.user_id`
3. Prevent double-tipping (check if `tip_bdt > 0`)
4. `UPDATE rides SET tip_bdt = ? WHERE id = ?`
5. Return `{ success: true, tip_bdt: amount }`

**Response**: `{ success: true, tip_bdt: number }`
**Errors**: `404 ride_not_found` | `403 not_rider` | `409 already_tipped` | `422 invalid_amount`

**Screen to wire**:
- `app/(main)/(customer)/add-tip/index.tsx` — `handleAddTip` should POST to `/api/ride/${activeRide?.id}/tip` with `{ amount_bdt: finalAmount * 100 }` (convert BDT input to paisa), THEN navigate

**Also**: extend `GET /api/driver/calculate-price` to `SUM(tip_bdt)` for today's earnings, and `GET /api/driver/earnings/breakdown` to include `tip_bdt` per trip.

### 5b.3 Fix `GET /api/ride/get-all` to return status

**Why needed**: The endpoint returns ride data WITHOUT `status`, `scheduled_at`,
`completed_at`, or `vehicle_type`. This means `fetchRideHistory` cannot filter
rides into completed vs scheduled vs cancelled. All three tabs show identical data.

**The columns ALREADY EXIST** in the `rides` table. The query just doesn't SELECT them.

**File to modify**: `app/api/ride/get-all+api.ts`

**Change**: Add these columns to the SELECT query:
```ts
// Current query selects: ride_id, origin_address, destination_address,
//   origin_latitude, origin_longitude, destination_latitude, destination_longitude,
//   fare_breakdown, driver_id, user_id, created_at, driver

// ADD to the SELECT:
status: rides.status,
scheduled_at: rides.scheduled_at,
completed_at: rides.completed_at,
vehicle_type: rides.vehicle_type,
cancel_reason: rides.cancel_reason,
cancelled_by: rides.cancelled_by,
```

**Updated response shape**:
```ts
{
  data: Array<{
    ride_id: string;
    origin_address: string;
    destination_address: string;
    origin_latitude: string;
    origin_longitude: string;
    destination_latitude: string;
    destination_longitude: string;
    fare_breakdown: object;
    driver_id: string | null;
    user_id: string;
    created_at: string;
    status: string;              // NEW
    scheduled_at: string | null; // NEW
    completed_at: string | null; // NEW
    vehicle_type: string;        // NEW
    cancel_reason: string | null;// NEW
    cancelled_by: string | null; // NEW
    driver: { driver_id, full_name, profile_image_url, rating } | null;
  }>
}
```

**Also modify**: `store/useRiderStore.ts` `fetchRideHistory` to properly split:
```ts
fetchRideHistory: async (token: string) => {
  // ... fetch ...
  const { data } = await res.json();
  const completed = (data ?? [])
    .filter((r: any) => r.status === "completed")
    .map((r: any) => ({
      id: r.ride_id,
      vehicle_type: r.vehicle_type,
      date: r.completed_at ?? r.created_at,
      pickup_address: r.origin_address,
      destination_address: r.destination_address,
      fare_bdt: r.fare_breakdown?.total_bdt ?? 0,
    }));
  const scheduled = (data ?? [])
    .filter((r: any) => r.status === "pending" && r.scheduled_at)
    .map((r: any) => ({
      id: r.ride_id,
      vehicle_type: r.vehicle_type,
      date: r.scheduled_at,
      pickup_address: r.origin_address,
      destination_address: r.destination_address,
      fare_bdt: r.fare_breakdown?.total_bdt ?? 0,
    }));
  set({ completedRides: completed, scheduledRides: scheduled });
},
```

---

## 6. API Endpoint Specs Summary

### New endpoints to CREATE (Tier 1 — no migration):

| Method | Path | File | Auth |
|--------|------|------|------|
| GET | `/api/driver/earnings/breakdown` | `app/api/driver/earnings/breakdown+api.ts` | driver |
| GET | `/api/driver/performance` | `app/api/driver/performance+api.ts` | driver |
| GET | `/api/driver/commission-statement` | `app/api/driver/commission-statement+api.ts` | driver |
| GET | `/api/driver/dues` | `app/api/driver/dues+api.ts` | driver |
| GET/PATCH | `/api/user/notification-prefs` | `app/api/user/notification-prefs+api.ts` | any |
| GET/PATCH | `/api/user/data-controls` | `app/api/user/data-controls+api.ts` | any |
| GET/PATCH | `/api/user/linked-accounts` | `app/api/user/linked-accounts+api.ts` | any |
| GET | `/api/user/me` | `app/api/user/me+api.ts` | any |
| GET | `/api/faqs` | `app/api/faqs+api.ts` | PUBLIC |

### New endpoints to CREATE (Tier 2 — with migration):

| Method | Path | File | Auth |
|--------|------|------|------|
| POST | `/api/support/ticket` | `app/api/support/ticket+api.ts` | any |
| GET/POST/DELETE | `/api/user/emergency-contacts` | `app/api/user/emergency-contacts+api.ts` | any |
| DELETE | `/api/user/account` | `app/api/user/account+api.ts` | any |
| GET/PUT | `/api/driver/schedule` | `app/api/driver/schedule+api.ts` | driver |

### Existing endpoint to EXTEND:

| Method | Path | Change |
|--------|------|--------|
| GET | `/api/driver/calculate-price` | Add `total_earnings_bdt`, `tips_bdt`, `promos_bdt`, `trip_count` to response |

---

## 7. Migration Specs

### Migration 1: `faqs` table
```sql
CREATE TABLE faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role VARCHAR(10) NOT NULL CHECK (role IN ('rider', 'driver')),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(50),
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Migration 2: `support_tickets` table
```sql
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  ride_id UUID REFERENCES rides(id),
  category VARCHAR(50) NOT NULL,
  subject VARCHAR(200),
  description TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'open',
  priority VARCHAR(10) DEFAULT 'normal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Migration 3: `user_emergency_contacts` table
```sql
CREATE TABLE user_emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  relationship VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Migration 4: `driver_schedule` table
```sql
CREATE TABLE driver_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time VARCHAR(5) NOT NULL,
  end_time VARCHAR(5) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Migration 5: Break mode columns (Tier 3)
```sql
ALTER TABLE drivers ADD COLUMN on_break BOOLEAN DEFAULT false;
ALTER TABLE drivers ADD COLUMN break_started_at TIMESTAMPTZ;
```

Run with: `npx drizzle-kit generate` then `npx drizzle-kit push`.

---

## 8. Screen Wiring Details

For each screen, the pattern is the same as the Before/After example in v1:
1. `useState` for data, loading, error
2. `useEffect` → `supabase.auth.getSession()` → `fetch()` → parse → `setState`
3. Three-way render: loading / error+retry / data or empty

### Specific notes per screen:

**earnings/index.tsx** — extend the existing fetch to read `tips_bdt` and `promos_bdt` from the extended `calculate-price` response. Replace lines 60/64 `৳0` with real values.

**earnings-breakdown/index.tsx** — replace `trips` array with `GET /api/driver/earnings/breakdown`. Each trip row shows `fare_bdt / 100`, `completed_at` formatted as date, `distance_km`.

**performance-stats/index.tsx** — replace `stats` array with `GET /api/driver/performance`. Note: `online_hours` comes back as a number (e.g. 28.5), display as "28.5h".

**commission-statement/index.tsx** — replace all hardcoded values with `GET /api/driver/commission-statement`. Commission rate from response. Week label computed from `week_start`/`week_end`.

**due-amounts/index.tsx** — replace hardcoded values with `GET /api/driver/dues`. Subscription info from response. Commission due from response.

**notification settings (both rider & driver)** — `GET /api/user/notification-prefs` on mount → populate toggles. `PATCH` on toggle change (debounced). Initial state: loading spinner until fetch completes.

**data-analytics** — same pattern with `/api/user/data-controls`.

**linked-accounts** — `GET /api/user/linked-accounts`. Show empty state if no accounts. Connect buttons show "Coming soon" (no social auth yet).

**rider profile** — replace Clerk-shim with `GET /api/user/me`. Remove `useSession()` calls. Read `name`, `email`, `phone`, `profile_image_url`, `rating` from response.

**contact-support (rider)** — replace fake setTimeout with `POST /api/support/ticket`. Use `EXPO_PUBLIC_SUPPORT_PHONE` env var for phone display (NOT hardcoded).

**report-issue (driver)** — "Continue" button calls `POST /api/support/ticket` with selected category.

**FAQ (both)** — `GET /api/faqs?role=rider|driver`. Replace hardcoded arrays.

**emergency-contacts (both)** — `GET /api/user/emergency-contacts`. Add calls `POST`. Delete calls `DELETE ?id=`.

**account-security** — "Delete Account" calls `DELETE /api/user/account` with confirmation. 2FA: read `users.security_settings` jsonb, show "Not configured" (no 2FA feature exists yet).

**schedule (driver)** — `GET /api/driver/schedule` on mount. "Save" calls `PUT /api/driver/schedule`.

**break-mode** — Tier 3: read `useDriverFlowStore.driver.on_break` and `break_started_at`. Start/end buttons call new endpoints.

**hotspot-map** — Tier 3: remove from navigation or show "Feature coming soon" screen. Do NOT show fake surge data.

**add-payment** — Tier 3: redirect to PortPos hosted checkout. No local card capture.

---

## 9. Batch Plan

### Batch W4: Schema migrations + seeds
1. Add `faqs`, `support_tickets`, `user_emergency_contacts`, `driver_schedule` tables to `src/db/schema.ts`
2. Add break-mode columns to `drivers` table
3. Run `npx drizzle-kit generate` + `npx drizzle-kit push`
4. Create seed script for FAQs (the currently hardcoded content becomes seed data)
5. Run seed

**STOP GATE**: `npx drizzle-kit push` succeeds, tables exist in DB.

### Batch W5: Tier 1 API endpoints (9 new files)
Create all Tier 1 API routes:
1. `app/api/driver/earnings/breakdown+api.ts`
2. `app/api/driver/performance+api.ts`
3. `app/api/driver/commission-statement+api.ts`
4. `app/api/driver/dues+api.ts`
5. `app/api/user/notification-prefs+api.ts`
6. `app/api/user/data-controls+api.ts`
7. `app/api/user/linked-accounts+api.ts`
8. `app/api/user/me+api.ts`
9. `app/api/faqs+api.ts`
10. Extend `app/api/driver/calculate-price+api.ts`

**STOP GATE**: `npx tsc --noEmit` = 0. Test each endpoint with curl.

### Batch W6: Tier 2 API endpoints (4 new files)
1. `app/api/support/ticket+api.ts`
2. `app/api/user/emergency-contacts+api.ts`
3. `app/api/user/account+api.ts`
4. `app/api/driver/schedule+api.ts`

**STOP GATE**: `npx tsc --noEmit` = 0.

### Batch W7: Wire Tier 1 screens (12 screens)
Wire each screen to its new API following the Before/After pattern.

**STOP GATE**: `npx tsc --noEmit` = 0. No hardcoded data values remain.

### Batch W8: Wire Tier 2 screens (6 screens)
Wire FAQ, contact-support, report-issue, emergency-contacts, account-security, schedule.

**STOP GATE**: `npx tsc --noEmit` = 0.

### Batch W9: Tier 3 minimal implementations (3 screens)
1. Break-mode: add `POST /api/driver/break/start` + `/end` endpoints, wire screen
2. Hotspot-map: replace with "Coming soon" screen, remove fake data
3. Add-payment: redirect to PortPos hosted checkout

**STOP GATE**: `npx tsc --noEmit` = 0.

### Batch W10: Critical missing APIs (Section 5b)

**Migration first** (if not already in W4):
1. `ALTER TABLE rides ADD COLUMN tip_bdt INTEGER DEFAULT 0;`
2. Add `tip_bdt` to schema.ts
3. `npx drizzle-kit generate` + `npx drizzle-kit push`

**New API files**:
1. `app/api/ride/[id]/rate+api.ts` — POST rating (writes rider_rating or driver_rating + updates aggregates)
2. `app/api/ride/[id]/tip+api.ts` — POST tip (writes tip_bdt)

**Modify existing**:
3. `app/api/ride/get-all+api.ts` — add `status`, `scheduled_at`, `completed_at`, `vehicle_type`, `cancel_reason`, `cancelled_by` to SELECT
4. `store/useRiderStore.ts` `fetchRideHistory` — split into completed/scheduled by status
5. `app/api/driver/calculate-price+api.ts` — add `tips_bdt` = `SUM(tip_bdt)` to response
6. `app/api/driver/earnings/breakdown+api.ts` — include `tip_bdt` per trip

**Wire screens**:
7. `app/(main)/(customer)/rate-driver/index.tsx` — POST to `/api/ride/${activeRide?.id}/rate` with `{ rating, feedback, role: "rider" }`
8. `app/(main)/(rider)/rate-rider/index.tsx` — POST to `/api/ride/${activeRideId}/rate` with `{ rating, feedback, role: "driver" }`
9. `app/(main)/(customer)/add-tip/index.tsx` — POST to `/api/ride/${activeRide?.id}/tip` with `{ amount_bdt: finalAmount * 100 }` before navigating

**STOP GATE**: `npx tsc --noEmit` = 0. Verify:
- Rate-driver screen POST succeeds (check DB: rides.rider_rating populated)
- Rate-rider screen POST succeeds (check DB: rides.driver_rating populated)
- Add-tip screen POST succeeds (check DB: rides.tip_bdt populated)
- Activity tabs show DIFFERENT data (completed vs scheduled actually filtered)

### Final verification
```bash
# Must return 0
npx tsc --noEmit

# Must return nothing — no hardcoded data remains
grep -rn "const [A-Z_].*= \[" app/(main) --include="*.tsx" | grep -v node_modules
# (except acceptable UI config: PRESET_TIPS, REASONS, LABELS, DAYS, THEMES, ISSUE_CATEGORIES)

# Must return nothing
grep -rn "console\.\(log\|warn\|error\)" app/ lib/ --include="*.ts" --include="*.tsx"
```

---

### Batch W11: ETA Module (from plans/eta-implementation-prompt.md)

**Source spec**: `plans/eta-implementation-prompt.md` (read before starting)

This batch replaces the naive flat-speed ETA formula with a time-of-day +
vehicle-group-aware calculation. **No screen changes needed** — the estimate
API and WebSocket offer message already carry `eta_minutes` / `pickup_eta_minutes`
which screens already display.

**CRITICAL FIX to the original prompt**: The prompt says to import from
`@/utils-server/eta` in `app/api/ride/estimate+api.ts`. This **will fail tsc**
because `tsconfig.json` excludes `utils-server/`. Split the module:

- `lib/eta.ts` — pure functions only (no DB imports at module level):
  - `DEFAULT_SPEED_TABLE`, `EtaSpeedTable`, `TimeBucket`, `VehicleGroup` types
  - `vehicleGroup(vehicleType: string): VehicleGroup`
  - `timeBucket(date: Date): TimeBucket`
  - `etaSpeedKmh(vehicleType: string, bucket: TimeBucket, table: EtaSpeedTable): number`
  - Importable from both app-side and utils-server-side.

- `utils-server/eta.ts` — `estimateEtaMinutes()` with DB cache:
  - Imports pure functions from `../lib/eta`
  - Has the `system_config` TTL cache for the speed table
  - Imports `db`, `systemConfig`, `eq` inside the function body only
  - Used by `utils-server/index.ts` only.

- `app/api/ride/estimate+api.ts` — imports pure functions from `@/lib/eta`:
  - Looks up `system_config` key `eta_speed_kmh` directly (or uses a shared
    helper in `lib/eta.ts` that accepts a loader function).
  - Does NOT import from `@/utils-server/eta`.

**Files to create/modify**:

| Action | File | What |
|--------|------|------|
| CREATE | `lib/eta.ts` | Pure ETA functions (types, speed table, time bucket, speed lookup) |
| CREATE | `utils-server/eta.ts` | `estimateEtaMinutes()` with DB cache (imports from `../lib/eta`) |
| MODIFY | `src/db/seed.ts` | Add `eta_speed_kmh` seed block (idempotent, same pattern as `dispatch_scoring_weights`) |
| MODIFY | `utils-server/index.ts` | Replace `computePickupMetrics` with async version + write `eta_minutes` to `rides` at match time |
| MODIFY | `app/api/ride/estimate+api.ts` | Replace both `Math.max(2, Math.ceil(totalDistanceKm / 0.5))` lines with real ETA using `lib/eta.ts` |

**Speed table** (stored in `system_config` key `eta_speed_kmh`):
```
bike_* : peak=15, offpeak=22, night=28
cng    : peak=12, offpeak=18, night=22
car_*  : peak=10, offpeak=16, night=20
```

**Time buckets** (Asia/Dhaka, UTC+6):
- peak: 07:00-10:00, 17:00-21:00
- offpeak: 10:00-17:00, 21:00-23:00
- night: 23:00-07:00

**STOP GATE**: `npx tsc --noEmit` = 0 (both root and utils-server tsconfigs).
Verify: `timeBucket(new Date('2025-01-01T08:00:00+06:00'))` returns `'peak'`.

---

## 10. Post-W10 Honest Status — 31 Screens Still Broken

A thorough audit (cross-referencing every `fetch()` call in every screen against
actual API route files on disk) revealed that **31 screens call non-existent
endpoints** and **4 more have partial wiring issues**. These were missed by the
original guide.

This is NOT new feature development. Every screen below has a corresponding DB
table that already exists. The backend CRUD endpoints were simply never written.

### 10.1 Driver Wallet & Payouts — 7 screens, all 404

| Screen | Broken Endpoint | DB Source |
|--------|----------------|-----------|
| `(tabs)/wallet/index.tsx` | `GET /api/driver/wallet` | `drivers.driver_wallet_balance_bdt` + `driver_wallet_transactions` |
| `instant-pay/index.tsx` | `GET /api/driver/wallet` + `POST /api/driver/instant-pay` | same |
| `payout-methods/index.tsx` | `GET /api/driver/payout-methods` | **NEEDS TABLE** |
| `payout-history/index.tsx` | `GET /api/driver/payout-history` | `driver_wallet_transactions` |
| `add-payout-method/index.tsx` | `POST /api/driver/payout-methods` | **NEEDS TABLE** |
| `wallet-topup/index.tsx` | `POST /api/driver/wallet/topup` | N/A |
| `(tabs)/wallet/index.tsx` | Hardcoded `235000` balance | — |

### 10.2 Driver Profile, Vehicles, Documents, Ratings — 8 screens

| Screen | Broken Endpoint | Fix |
|--------|----------------|-----|
| `(tabs)/profile/index.tsx` | `GET /api/driver/profile` | Rewire to existing `/api/driver/me` |
| `edit-profile/index.tsx` | `PATCH /api/driver/profile` | Extend existing `PATCH /api/driver/me` |
| `personal-profile/index.tsx` | `PATCH /api/driver/profile` | Same |
| `vehicle-management/index.tsx` | `GET /api/driver/vehicles` | Create — `vehicles` table exists |
| `add-vehicle/index.tsx` | `POST /api/driver/vehicles` | Create — `vehicles` table exists |
| `documents/index.tsx` | `GET /api/driver/documents` | Add GET to existing POST-only file |
| `ratings/index.tsx` | `GET /api/driver/ratings` | Create — `rides.driver_rating` exists |
| `select-active-vehicle.tsx` | No API call (local only) | Wire to existing `/api/driver/vehicle-type-change` |

### 10.3 Rider Addresses, Profile & Account — 7 screens

| Screen | Broken Endpoint | DB Source |
|--------|----------------|-----------|
| `saved-addresses/[id].tsx` | `GET+DELETE /api/rider/addresses/{id}` | `rider_addresses` ✅ |
| `saved-addresses/add-address/index.tsx` | `POST /api/rider/addresses` | `rider_addresses` ✅ |
| `personal-info/index.tsx` | `PATCH /api/rider/profile` | `users` ✅ |
| `profile/edit.tsx` | `PATCH /api/rider/profile` | `users` ✅ |
| `delete-account/index.tsx` | `DELETE /api/account/delete` | Rewire to `/api/user/account` (exists from W6) |
| `delete-data/index.tsx` | `POST /api/account/delete-data` | New GDPR endpoint |
| `request-data/index.tsx` | `POST /api/account/request-data` | New GDPR endpoint |

### 10.4 Rider Wallet & Top-Up — 4 screens

| Screen | Broken Endpoint | Fix |
|--------|----------------|-----|
| `top-up-method/index.tsx` | `POST /api/rider/topup` | Create — `users.rider_wallet_balance_bdt` exists |
| `activity/top-up/index.tsx` | Reads empty store | Add `fetchWallet` to store |
| `activity-canceled/index.tsx` | `GET /api/rider/rides/canceled` | Rewire to `get-all` filtered by status=cancelled |
| `driver-history/*.tsx` | `GET /api/driver/rides` | **Misplaced** — customer screen calling driver API |

### 10.5 Referral — 2 screens (both show fake data)

| Screen | Broken Endpoint | Fake Data | DB Source |
|--------|----------------|-----------|-----------|
| `(rider)/referral/index.tsx` | `GET /api/driver/referral-code` | "৳800 earned" | `referral_codes` + `referrals` ✅ |
| `(tabs)/referral/index.tsx` | `GET /api/rider/referral` | "RIDE-ABC123" | same |

### 10.6 Support Rewiring — 2 screens (wrong endpoint path)

| Screen | Calls | Should Call |
|--------|-------|-------------|
| `contact-support/index.tsx` (driver) | `POST /api/support/contact` | `POST /api/support/ticket` (exists from W6) |
| `trip-issue/index.tsx` | `POST /api/trip/report-issue` | `POST /api/support/ticket` (exists from W6) |

### 10.7 Broken/Misconceived Screens — 3 screens

| Screen | Problem | Action |
|--------|---------|--------|
| `settings/change-password/index.tsx` | Phone OTP auth has NO passwords | **Remove** or repurpose as security info |
| `insurance/index.tsx` | No insurance system exists | Make static info screen |
| `earnings/index.tsx` | `calculate-price` returns wrong shape | Fix response parsing or switch endpoint |

### 10.8 Partial Wiring Issues — 4 screens

| Screen | Issue |
|--------|-------|
| `earnings/index.tsx` | Reads `tips_bdt`/`promos_bdt` from `calculate-price` — fields don't exist in response |
| `payment-methods/index.tsx` | Reads `useRiderStore.paymentMethods` — never populated by any fetch |
| `activity/top-up/index.tsx` | Reads `useRiderStore.walletBalance` — never populated |
| `select-active-vehicle.tsx` | Only writes local store, never calls server |

---

## 11. Batches W12-W16 — Fixing the 31 Broken Screens

### Batch W12: Driver Profile + Vehicles + Documents + Ratings

**New API endpoints (6 files)**:

| Method | Path | File | Source Table |
|--------|------|------|-------------|
| PATCH | `/api/driver/me` | Extend existing `app/api/driver/me+api.ts` | `users` + `drivers` |
| GET | `/api/driver/vehicles` | `app/api/driver/vehicles+api.ts` | `vehicles` |
| POST | `/api/driver/vehicles` | same file | `vehicles` |
| GET | `/api/driver/documents` | Add GET to existing `app/api/driver/documents+api.ts` | `documents` |
| GET | `/api/driver/ratings` | `app/api/driver/ratings+api.ts` | `rides` WHERE driver_rating IS NOT NULL |

**PATCH /api/driver/me extended body**:
```ts
{
  name?: string,              // writes to users.name
  phone?: string,             // writes to users.phone (validate Bangladesh format)
  profile_image_url?: string, // writes to users.profile_image_url
  min_per_km_bdt?: number,    // existing — keep working
}
```

**GET /api/driver/vehicles response**:
```ts
{
  vehicles: [{
    id, vehicle_type, manufacturer, model, manufacturing_year,
    registration_number, registration_date, has_ac, passenger_seats,
    fitness_expires_at, tax_token_expires_at
  }]
}
```

**GET /api/driver/documents response**:
```ts
{
  documents: [{
    id, doc_type, storage_url, status, reviewed_at, rejection_reason,
    face_match_score, face_match_status
  }]
}
```

**GET /api/driver/ratings response**:
```ts
{
  average_rating: number,       // parseFloat(drivers.rating)
  rating_count: number,         // drivers.rating_count
  recent: [{
    ride_id, rating, created_at // from rides WHERE driver_id=? AND driver_rating IS NOT NULL ORDER BY completed_at DESC LIMIT 20
  }]
}
```

**Screens to rewire (8)**:
1. `(tabs)/profile/index.tsx` — change fetch URL from `/api/driver/profile` to `/api/driver/me`
2. `edit-profile/index.tsx` — change PATCH URL to `/api/driver/me`, send `{ name, phone, profile_image_url }`
3. `personal-profile/index.tsx` — same
4. `vehicle-management/index.tsx` — calls `/api/driver/vehicles`
5. `add-vehicle/index.tsx` — POSTs to `/api/driver/vehicles`
6. `documents/index.tsx` — calls GET `/api/driver/documents`
7. `ratings/index.tsx` — calls `/api/driver/ratings`
8. `select-active-vehicle.tsx` — add `POST /api/driver/vehicle-type-change` call on confirm

---

### Batch W13: Rider Addresses + Profile + Account

**New API endpoints (5 files)**:

| Method | Path | File | Source Table |
|--------|------|------|-------------|
| GET | `/api/rider/addresses` | `app/api/rider/addresses+api.ts` | `rider_addresses` |
| POST | `/api/rider/addresses` | same file | `rider_addresses` |
| DELETE | `/api/rider/addresses` | same file (query `?id=`) | `rider_addresses` |
| PATCH | `/api/user/me` | Extend existing `app/api/user/me+api.ts` | `users` |
| POST | `/api/user/delete-data` | `app/api/user/delete-data+api.ts` | GDPR — nullify PII columns |
| POST | `/api/user/request-data` | `app/api/user/request-data+api.ts` | GDPR — return user data as JSON |

**GET /api/rider/addresses response**:
```ts
{
  addresses: [{
    id, label, address, details, lat, lng, is_favorite, created_at
  }]
}
```

**POST /api/rider/addresses body**:
```ts
{ label: string, address: string, details?: string, lat: number, lng: number, is_favorite?: boolean }
```

**DELETE /api/rider/addresses**: query param `?id=UUID` → soft delete (set `deleted_at`)

**PATCH /api/user/me body** (same as driver):
```ts
{ name?: string, phone?: string, profile_image_url?: string }
```

**POST /api/user/delete-data**: Sets `users.name = '[deleted]'`, `users.email = null`, `users.profile_image_url = null`, `users.phone = '[deleted]'`. Keeps row for audit.

**POST /api/user/request-data**: Returns all user data (profile, rides, wallet transactions, etc.) as JSON download.

**Screens to rewire (7)**:
1. `saved-addresses/[id].tsx` — GET + DELETE `/api/rider/addresses`
2. `saved-addresses/add-address/index.tsx` — POST `/api/rider/addresses`
3. `personal-info/index.tsx` — PATCH `/api/user/me`
4. `profile/edit.tsx` — PATCH `/api/user/me`
5. `delete-account/index.tsx` — change URL from `/api/account/delete` to `/api/user/account`
6. `delete-data/index.tsx` — POST `/api/user/delete-data`
7. `request-data/index.tsx` — POST `/api/user/request-data`

---

### Batch W14: Driver Wallet & Payouts

**Migration (1 new table)**:

```sql
CREATE TABLE driver_payout_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id),
  method_type VARCHAR(20) NOT NULL,        -- 'bkash' | 'nagad' | 'rocket' | 'bank'
  account_number VARCHAR(50) NOT NULL,     -- phone number or bank account
  account_name VARCHAR(100),               -- account holder name
  bank_name VARCHAR(100),                  -- if bank
  branch_name VARCHAR(100),                -- if bank
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Add to `src/db/schema.ts`:
```ts
export const driverPayoutMethods = pgTable('driver_payout_methods', {
  id: uuid('id').primaryKey().defaultRandom(),
  driver_id: uuid('driver_id').notNull().references(() => drivers.id),
  method_type: varchar('method_type', { length: 20 }).notNull(),
  account_number: varchar('account_number', { length: 50 }).notNull(),
  account_name: varchar('account_name', { length: 100 }),
  bank_name: varchar('bank_name', { length: 100 }),
  branch_name: varchar('branch_name', { length: 100 }),
  is_default: boolean('is_default').default(false),
  is_active: boolean('is_active').default(true),
  created_at: timestamptz('created_at').notNull().defaultNow(),
  updated_at: timestamptz('updated_at').notNull().defaultNow(),
});
```

**New API endpoints (7 files)**:

| Method | Path | File | Response |
|--------|------|------|----------|
| GET | `/api/driver/wallet` | `app/api/driver/wallet+api.ts` | `{ balance_bdt: number, recent_transactions: WalletTxn[] }` |
| GET | `/api/driver/payout-methods` | `app/api/driver/payout-methods+api.ts` | `{ methods: PayoutMethod[] }` |
| POST | `/api/driver/payout-methods` | same file | `{ method: PayoutMethod }` |
| DELETE | `/api/driver/payout-methods` | same file (query `?id=`) | `{ success: true }` |
| GET | `/api/driver/payout-history` | `app/api/driver/payout-history+api.ts` | `{ payouts: WalletTxn[] }` |
| POST | `/api/driver/instant-pay` | `app/api/driver/instant-pay+api.ts` | `{ success: true, amount_bdt, method }` |
| POST | `/api/driver/wallet/topup` | `app/api/driver/wallet/topup+api.ts` | `{ payment_url, payment_event_id }` (PortPos) |

**GET /api/driver/wallet response**:
```ts
{
  balance_bdt: number,            // drivers.driver_wallet_balance_bdt (paisa)
  recent_transactions: Array<{
    id, transaction_type, amount_bdt, balance_after, created_at
  }>  // last 20 from driver_wallet_transactions
}
```

**POST /api/driver/instant-pay body**:
```ts
{ amount_bdt: number, method_id: string }
```
**Logic**: Insert `driver_wallet_transactions` row (type='payout', negative amount), decrement `drivers.driver_wallet_balance_bdt`. In a transaction.

**Screens to rewire (7)**:
1. `(tabs)/wallet/index.tsx` — remove hardcoded `235000`, fetch `/api/driver/wallet`
2. `instant-pay/index.tsx` — fetch wallet + POST instant-pay
3. `payout-methods/index.tsx` — GET `/api/driver/payout-methods`
4. `payout-history/index.tsx` — GET `/api/driver/payout-history`
5. `add-payout-method/index.tsx` — POST `/api/driver/payout-methods`
6. `wallet-topup/index.tsx` — POST `/api/driver/wallet/topup`

---

### Batch W15: Rider Wallet + Referral + Support Rewiring

**New API endpoints (3 files)**:

| Method | Path | File | Response |
|--------|------|------|----------|
| GET | `/api/rider/wallet` | `app/api/rider/wallet+api.ts` | `{ balance_bdt, recent_transactions }` |
| POST | `/api/rider/wallet/topup` | `app/api/rider/wallet/topup+api.ts` | `{ payment_url, payment_event_id }` (PortPos) |
| GET | `/api/user/referral` | `app/api/user/referral+api.ts` | `{ code, total_referrals, total_reward_bdt, recent }` |

**GET /api/user/referral response**:
```ts
{
  code: string,                        // from referral_codes WHERE user_id = ?
  campaign: { name, referrer_reward_percent, referee_reward_percent } | null,
  stats: {
    total_referrals: number,           // COUNT from referrals WHERE referrer_id = ?
    successful: number,                // WHERE status = 'rewarded'
    total_reward_bdt: number,          // SUM of referral_receivable wallet txns
  },
  recent: Array<{ referee_phone, status, created_at, rewarded_at }>
}
```

**Screens to rewire (6)**:
1. `(rider)/referral/index.tsx` — GET `/api/user/referral`
2. `(tabs)/referral/index.tsx` — same
3. `contact-support/index.tsx` (driver) — change URL from `/api/support/contact` to `/api/support/ticket`
4. `trip-issue/index.tsx` — change URL from `/api/trip/report-issue` to `/api/support/ticket`
5. `activity-canceled/index.tsx` — rewire to `get-all` filtered by status=cancelled
6. `top-up-method/index.tsx` — POST `/api/rider/wallet/topup`

---

### Batch W16: Cleanup

1. **Remove `settings/change-password/index.tsx`** — phone OTP auth has no passwords. Remove from navigation or repurpose as "Security & Login Method" info screen showing "You sign in with phone number + OTP".
2. **`insurance/index.tsx`** — make static info screen (no API). Show partner insurance info text.
3. **`earnings/index.tsx`** — fix to read correct fields from `calculate-price` response (use `total_earnings_bdt` not `totalEarnings`, or switch to `/api/driver/earnings/breakdown`).
4. **Remove or rewire `driver-history/*.tsx`** — these are customer screens calling driver endpoints. Either remove them or rewire to `/api/ride/get-all`.

---

## 12. Complete Batch Summary

| Batch | What | New Tables | New APIs | Screens Wired |
|-------|------|:----------:|:--------:|:-------------:|
| W4 | Migrations + seeds (DONE) | 4 | 0 | 0 |
| W5 | Tier 1 APIs (DONE) | 0 | 9 | 0 |
| W6 | Tier 2 APIs (DONE) | 0 | 4 | 0 |
| W7 | Wire Tier 1 screens (DONE) | 0 | 0 | 12 |
| W8 | Wire Tier 2 screens (DONE) | 0 | 0 | 6 |
| W9 | Tier 3 minimal (DONE) | 0 | 2 | 3 |
| W10 | Rating + Tip + get-all fix | 0 | 2 | 3 |
| **W11** | ETA module (time-of-day aware) | 0 | 0 | 0 (backend-only) |
| **W12** | Driver profile/vehicles/docs/ratings | 0 | 6 | 8 |
| **W13** | Rider addresses/profile/account | 0 | 5 | 7 |
| **W14** | Driver wallet/payouts | **1** | 7 | 7 |
| **W15** | Rider wallet/referral/support rewire | 0 | 3 | 6 |
| **W16** | Cleanup (remove/fix broken screens) | 0 | 0 | 4 |
| **TOTAL** | | **5** | **38** | **56** |

After W16: **zero broken screens, zero hardcoded data, zero non-existent endpoint calls.**

### Screens that remain intentionally limited (NOT fixable via wiring):

| Screen | Limitation | Why |
|--------|-----------|-----|
| `hotspot-map` | "Coming soon" | Surge pricing engine is a new feature (user is building this) |
| `inbox/notifications` | Empty | Notification system is a new feature (user is building this) |
| `commission-statement` "Pay" button | Read-only | Commission settlement system needs design |
| `add-payment` | PortPos redirect | Card tokenization needs PCI compliance |

---

## Acceptable Static Config (NOT hardcoding)

These are UI configuration constants, NOT business data. They are acceptable
as hardcoded app-level constants.

### ✅ Safe to hardcode (UI labels, UX choices)

| Config | Where Used | Why Safe |
|--------|-----------|----------|
| `PRESET_TIPS_BDT = [0, 20, 50, 100]` | add-tip screen | Tip amount presets are a UX decision, not a pricing rule. |
| `REASONS = [...]` | cancel-reason screen | Static cancellation categories. Could become admin-configurable later if support team needs changes without app update. |
| `LABELS = ["Home", "Work", ...]` | add-address screen | UI label shortcuts. Users can type custom labels anyway. |
| `DAYS = ["Mon", "Tue", ...]` | schedule screen | Days of the week never change. |
| `THEMES = ["Light", "Dark", "System"]` | appearance screen | UI display options. |
| `ISSUE_CATEGORIES = [...]` | trip-issue screen | Static issue categories. Same as cancel reasons — could become admin-configurable later. |
| `RATING_LABELS = ["Terrible", "Bad", "OK", "Good", "Excellent"]` | rating screen | UX labels for 5-star system. Don't affect business logic. |
| `SCHEDULE_OFFSETS = ["Now", "+15m", "+30m", "+45m", "+60m"]` | schedule-ride picker | UI convenience labels. The actual offset is a UX decision. |
| Vehicle type display names | vehicle selectors | Derived from `lib/vehicleTypes.ts`. The 8 types are defined in the enum. |
| `VEHICLE_TYPE_OPTIONS` filter chips | call-ledger screen | Filter UI for the ledger. Static enum values. |

### 🚨 Must NOT be hardcoded (business rules — read from DB/API)

| Config | Why It's Business Data | Source |
|--------|----------------------|--------|
| `MIN_TOP_UP_BDT` / `MAX_TOP_UP_BDT` | Wallet top-up limits are business policies | `system_config` or dedicated config |
| `MIN_PAYOUT_BDT` | Driver payout minimum is a business rule | `system_config` |
| Fare floor | Minimum fare is a pricing rule | `pricing` table |
| Referral reward amounts | Campaign/business rule | `referral_campaigns` table |
| Commission rate | Business rule per zone+vehicle | `pricing.platform_commission_percent` |
| SOS emergency number | Already in `system_config` as `sos_contacts` — NOT hardcoded ✅ | `system_config` |
| Max concurrent rides | Rate-limiting rule | `system_config` or env var |
| Call deduction window | Dispatch engine constant | `utils-server/dispatch.ts` |

### 🟡 Yellow flag — safe for MVP, migrate later if needed

| Config | When to Migrate |
|--------|----------------|
| `REASONS` (cancel reasons) | When support team requests adding/removing without app update |
| `ISSUE_CATEGORIES` (trip issue) | Same trigger |
| `PRESET_TIPS_BDT` | When business team wants to change based on market research |
| Payment method display names | When adding new payment method without app update |
