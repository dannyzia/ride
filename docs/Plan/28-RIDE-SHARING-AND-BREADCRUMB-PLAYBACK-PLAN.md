# Plan 28 (v2.3) — Live Ride Sharing & In-Progress Breadcrumb Engine

> **Document Status:** FORENSIC RE-ARCHITECTED SPEC (2026-11-02)  
> **Replaces:** Plan 28 v1.0, v2.0, v2.1, and v2.2  
> **Audited Against:** `utils-server/index.ts`, `utils-server/trace.ts`, `utils-server/scheduler.ts`, `app/api/ride/[id]/{track,details,cancel,complete}+api.ts`, `app/(main)/(rider)/finish-ride/index.tsx`, `app/(main)/(customer)/(tabs)/history-detail/index.tsx`, `app/api/user/emergency-contacts+api.ts`, `lib/{dprelay,ridePinSms,rideParticipants}.ts`, `src/db/schema.ts`, `src/db/migrations/0083_customer_complaints.sql`, `tests/api/ride/track.test.ts`.

---

## 1. Architectural Invariants & Ship-Stoppers Ledger

| Problem in Prior Drafts | Root Cause in Live Code | Forensic Fix in v2.3 |
|---|---|---|
| **1. Missing Table RLS** | Supabase default privileges re-grant new tables to `anon` and `authenticated`. Third-party phone numbers and GPS coordinates were completely exposed. | Migration `0088` adds `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and `REVOKE ALL ON ride_breadcrumbs, ride_share_dispatches FROM anon, authenticated;` mirroring `0083_customer_complaints.sql`. |
| **2. Driver App Telematics Flaws** | `app/(main)/(rider)/finish-ride/index.tsx` awaits reverse-geocoding before send, sends no `ts`, fires only every 10s/5m, and has no background permission. | Phase 1 dedicated driver app pass: decouple geocode into non-blocking background async task, add `ts: Date.now()`, configure 5s watch, declare foreground service location permission. |
| **3. Driver Store Reference** | Prior draft referenced `useRideStore.getState().rideId` (rider store, which is null on driver app). | Corrected to driver store: `useRideOfferStore.getState().activeRideId`, with fallback to route params and `AsyncStorage` (`driver_active_ride_id`). |
| **4. Cancel Hook Dead End** | `CANCELLABLE_STATUSES` in `cancel+api.ts` excludes `in_progress`. In-progress rides cannot cancel via that route; crashes, SIGTERM, and pool freezes lost breadcrumbs. | Lazy buffer init from `location:update` status, SIGTERM graceful flush in `utils-server` with 3s timeout, and 15-minute idle-TTL eviction for abandoned rides. |
| **5. Participant Guard False 403s** | Comparing Supabase `auth.uid` against `users.id` rejects legitimate drivers (`rides.driver_id` is a `drivers.id`). | Adopt canonical pattern from `details+api.ts`: resolve `users` by `auth_uid`, then resolve `drivers.id -> users.id` via `resolveRideParticipantIds()`. |
| **6. Phone Normalization Bug** | `lib/dprelay.ts` blindly prefixed `+880` to all numbers, turning US numbers (e.g. `14155551234`) into valid BD numbers. | Strict E.164 parsing in `lib/phoneUtils.ts`: only local BD numbers (`01[3-9]...`) receive `+880`. Valid international numbers with `+` are preserved as-is. Unprefixed non-BD digits are rejected. |
| **7. Auto-Share Deadlock** | No endpoint wrote `is_verified` or `auto_share_enabled`. Contacts API had no `PATCH`. | Add `PATCH` to `emergency-contacts+api.ts`, implement 4-digit OTP verification flow via `sendOtp`/`verifyOtp`, and extend `GET` projection to return `auto_share_enabled` and `is_verified`. |
| **8. Schema Column Mismatch** | Prior draft selected `drivers.last_latitude`, `drivers.last_longitude` which do not exist in `schema.ts`. | Corrected to live column names: `drivers.last_location_lat`, `drivers.last_location_lng`. |
| **9. Job 61 Table Mismatch** | Prior draft joined `customer_complaints` on `order_id` (shop orders). | Corrected to `fare_disputes` on `ride_id` (`fd.ride_id = rb.ride_id`) and `sos_alerts` (`sa.ride_id = rb.ride_id`), ensuring forensic dispute evidence is retained. |
| **10. "Live Tracking" Static Illusion** | Public `/track/[id]` never queried or returned driver coordinates; map only showed pickup pin. | `track+api.ts` selects `drivers.last_location_lat`, `drivers.last_location_lng` while active. Public page renders moving car annotation via `<MapLibreGL.PointAnnotation>` updated via 10s poll. P1-17 intact on terminal. |
| **11. Test Gate Assertion** | Prior draft claimed `track.test.ts` passes unaltered, but strict `.toEqual(...)` fails when new fields are returned. | Phase 4 updates the active ride assertion in `tests/api/ride/track.test.ts` to expect `driver_lat` and `driver_lng` while verifying terminal degradation tests remain green. |
| **12. Replay Screen File Path** | Prior draft referenced nonexistent path `app/(main)/(customer)/ride-history/[id].tsx`. | Corrected to actual customer history detail screen: `app/(main)/(customer)/(tabs)/history-detail/index.tsx`. |
| **13. Migration Snapshot Drift** | Drizzle snapshots stopped at `0043`; running `drizzle-kit generate` emits broken diffs against months-old snapshots. | Hand-written SQL migration gate (`0088`) with `--> statement-breakpoint` validated against real Postgres. |
| **14. Scheduler Concurrency & Budget** | Interval-based scheduler needed budget limits and overlap guards. | Numbered **Job 61**, run with `withJobBudget(61, 10_000, ...)` and a concurrency flag `breadcrumbsPurgeRunning` in `startScheduler()`. |

---

## 2. System Architecture & Lifecycle Flow

```mermaid
flowchart TD
    subgraph DriverApp["Driver App (finish-ride/index.tsx)"]
        D_GPS["WatchPosition (5s cadence, 2m interval)"]
        D_BG["Foreground Service Location (Persistent Notification)"]
        D_STORE["useRideOfferStore (activeRideId) + AsyncStorage"]
        D_ASYNC["Async Geocode (Non-blocking background promise)"]
        D_WS["WS emit: location:update (lat, lng, ts, ride_id)"]
    end

    subgraph UtilsServer["utils-server (Port 3001)"]
        WS_HANDLER["location:update Handler"]
        OWNERSHIP_SQL["Ownership Select: SELECT driver_id, status FROM rides"]
        LAZY_INIT["Lazy Buffer Init (if in_progress & absent)"]
        BC_BUFFER["utils-server/breadcrumbs.ts (Capped at 720 pts/ride)"]
        SIGTERM_HANDLER["SIGTERM / SIGINT Graceful Flush (3s Timeout)"]
        INTERNAL_RPC["POST /internal/ride/completed"]
        SCHEDULE_PURGE["Job 61: 30-day Purge (Holds for SOS & Fare Disputes)"]
    end

    subgraph ExpoAPI["Expo API Routes (Port 8081)"]
        CONTACT_PATCH["PATCH /api/user/emergency-contacts (Toggle & OTP)"]
        CONTACT_GET["GET /api/user/emergency-contacts (Projects auto_share_enabled)"]
        MATCH_SMS["lib/rideShareSms.ts (executeMatchFlow Hook)"]
        TRACK_API["GET /api/ride/:id/track (Returns driver_lat while active)"]
        AUTH_BC["GET /api/ride/:id/breadcrumbs (resolveRideParticipantIds)"]
        AUTH_GPX["GET /api/ride/:id/export/gpx (XML Escaped GPX 1.1)"]
    end

    subgraph Database["PostgreSQL (RLS FORCED + REVOKED)"]
        DB_BC[("ride_breadcrumbs (UNIQUE ride_id, recorded_at)")]
        DB_DISPATCH[("ride_share_dispatches (90-day retention)")]
    end

    D_STORE --> D_GPS
    D_GPS --> D_WS
    D_BG --> D_GPS
    D_GPS -.-> D_ASYNC
    
    D_WS --> WS_HANDLER
    WS_HANDLER --> OWNERSHIP_SQL
    OWNERSHIP_SQL --> LAZY_INIT
    LAZY_INIT --> BC_BUFFER
    
    SIGTERM_HANDLER -->|Flush on shutdown| DB_BC
    INTERNAL_RPC -->|Flush on ride completion| DB_BC
    BC_BUFFER -->|Every 30s flush (<= 500 rows)| DB_BC
    SCHEDULE_PURGE -->|Purge >30 days (hold if SOS/dispute)| DB_BC

    CONTACT_PATCH --> MATCH_SMS
    CONTACT_GET --> MATCH_SMS
    MATCH_SMS --> DB_DISPATCH

    TRACK_API -.->|Poll every 10s: Live driver pin| DriverApp
    AUTH_BC --> DB_BC
    AUTH_GPX --> DB_BC
```

---

## 3. Database Schema & Migration (`0088`)

### 3.1 Migration File: `src/db/migrations/0088_ride_auto_share_and_breadcrumbs.sql`
Adheres strictly to the `--> statement-breakpoint` convention with **RLS ENABLED, FORCED, and REVOKED**:

```sql
-- Migration: 0088_ride_auto_share_and_breadcrumbs.sql
-- Hand-written migration. DO NOT RUN drizzle-kit generate (snapshot drift at 0043).

-- 1. Rider auto-share safety preference
ALTER TABLE "users" 
ADD COLUMN IF NOT EXISTS "auto_share_rides_enabled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- 2. Emergency contact auto-share toggle and verification status
ALTER TABLE "user_emergency_contacts"
ADD COLUMN IF NOT EXISTS "auto_share_enabled" boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "is_verified" boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "verification_otp" varchar(6),
ADD COLUMN IF NOT EXISTS "verification_expires_at" timestamptz;
--> statement-breakpoint

-- 3. In-progress breadcrumbs table with UNIQUE idempotency barrier
CREATE TABLE IF NOT EXISTS "ride_breadcrumbs" (
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "ride_id" uuid NOT NULL REFERENCES "rides"("id") ON DELETE CASCADE,
  "latitude" numeric(10, 7) NOT NULL,
  "longitude" numeric(10, 7) NOT NULL,
  "recorded_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ride_breadcrumbs_ride_seq_uniq" UNIQUE ("ride_id", "recorded_at")
);
--> statement-breakpoint

-- Note: Redundant sequence index omitted; UNIQUE constraint automatically creates underlying b-tree index.
CREATE INDEX IF NOT EXISTS "ride_breadcrumbs_recorded_at_idx" 
ON "ride_breadcrumbs" ("recorded_at");
--> statement-breakpoint

-- Standard security posture: ENABLE + FORCE RLS + REVOKE ALL from anon/authenticated
ALTER TABLE "ride_breadcrumbs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "ride_breadcrumbs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

REVOKE ALL ON "ride_breadcrumbs" FROM anon, authenticated;
--> statement-breakpoint

-- 4. Audit ledger for auto-shared SMS dispatches
CREATE TABLE IF NOT EXISTS "ride_share_dispatches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ride_id" uuid NOT NULL REFERENCES "rides"("id") ON DELETE CASCADE,
  "recipient_phone" varchar(20) NOT NULL,
  "recipient_name" varchar(100),
  "dispatch_status" varchar(20) NOT NULL, -- 'sent' | 'failed' | 'rate_limited' | 'redispatch_updated'
  "sent_at" timestamptz NOT NULL DEFAULT now(),
  "error_message" text
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ride_share_dispatches_ride_idx" 
ON "ride_share_dispatches" ("ride_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ride_share_dispatches_sent_at_idx" 
ON "ride_share_dispatches" ("sent_at");
--> statement-breakpoint

ALTER TABLE "ride_share_dispatches" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "ride_share_dispatches" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

REVOKE ALL ON "ride_share_dispatches" FROM anon, authenticated;
```

### 3.2 Drizzle Schema Additions (`src/db/schema.ts`)
```typescript
// Imports from drizzle-orm/pg-core: bigint, unique, boolean, varchar, timestamptz, numeric, text, uuid, index, pgTable

// users table addition:
auto_share_rides_enabled: boolean("auto_share_rides_enabled").notNull().default(false),

// userEmergencyContacts additions:
auto_share_enabled: boolean("auto_share_enabled").notNull().default(false),
is_verified: boolean("is_verified").notNull().default(false),
verification_otp: varchar("verification_otp", { length: 6 }),
verification_expires_at: timestamptz("verification_expires_at"),

// New rideBreadcrumbs table:
export const rideBreadcrumbs = pgTable(
  "ride_breadcrumbs",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    ride_id: uuid("ride_id")
      .notNull()
      .references(() => rides.id, { onDelete: "cascade" }),
    latitude: numeric("latitude", { precision: 10, scale: 7 }).notNull(),
    longitude: numeric("longitude", { precision: 10, scale: 7 }).notNull(),
    recorded_at: timestamptz("recorded_at").notNull(),
    created_at: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ride_breadcrumbs_recorded_at_idx").on(t.recorded_at),
    unique("ride_breadcrumbs_ride_seq_uniq").on(t.ride_id, t.recorded_at),
  ]
);

// New rideShareDispatches table:
export const rideShareDispatches = pgTable(
  "ride_share_dispatches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ride_id: uuid("ride_id")
      .notNull()
      .references(() => rides.id, { onDelete: "cascade" }),
    recipient_phone: varchar("recipient_phone", { length: 20 }).notNull(),
    recipient_name: varchar("recipient_name", { length: 100 }),
    dispatch_status: varchar("dispatch_status", { length: 20 }).notNull(),
    sent_at: timestamptz("sent_at").notNull().defaultNow(),
    error_message: text("error_message"),
  },
  (t) => [
    index("ride_share_dispatches_ride_idx").on(t.ride_id),
    index("ride_share_dispatches_sent_at_idx").on(t.sent_at),
  ]
);
```

---

## 4. Driver App Telematics Pipeline (`app/(main)/(rider)/finish-ride/index.tsx`)

### 4.1 Decoupling Reverse-Geocoding from Telematics
In `finish-ride/index.tsx`, `Location.reverseGeocodeAsync` was previously awaited before `sock.send()`. If geocoding failed or choked on network latency, the GPS point was never transmitted.

**Refactored Telematics Loop:**
```typescript
// Active ride ID is recovered from driver store with fallback
const rideId = useRideOfferStore.getState().activeRideId || localRideIdParam;

locationSubscription = await Location.watchPositionAsync(
  {
    accuracy: Location.Accuracy.Balanced, // Saves battery on budget devices
    timeInterval: 5000,                  // Consistent 5-second tick
    distanceInterval: 2,                 // Minimum 2 meters
  },
  (location) => {
    const lat = location.coords.latitude;
    const lng = location.coords.longitude;
    const clientTs = location.timestamp || Date.now();
    const currentRideId = useRideOfferStore.getState().activeRideId || activeRideIdRef.current;

    // 1. NON-BLOCKING: Emit telematics immediately over WebSocket
    const sock = wsRef.current;
    if (sock && sock.readyState === WebSocket.OPEN && currentRideId) {
      sock.send(
        JSON.stringify({
          type: "location:update",
          role: "driver",
          ride_id: currentRideId,
          lat,
          lng,
          ts: clientTs, // Explicit client GPS timestamp
        })
      );
    }

    // 2. ASYNC: Background reverse-geocoding for UI display only (never blocks socket)
    if (
      lastLocationRef.current &&
      calculateDistance(lastLocationRef.current, location) >= 20
    ) {
      Location.reverseGeocodeAsync({ latitude: lat, longitude: lng })
        .then((addr) => {
          lastAddressRef.current = addr[0]?.formattedAddress ?? "";
          setDriverLocation({ latitude: lat, longitude: lng, address: lastAddressRef.current });
        })
        .catch(() => {}); // Failure swallowed; UI keeps last address
      lastLocationRef.current = location;
    }
  }
);
```

### 4.2 Ride ID Persistence & Background Location
1. **Driver Ride ID Recovery:** The active ride ID is read from `useRideOfferStore.getState().activeRideId` with fallback to route parameter `useLocalSearchParams<{ ride_id: string }>()` and AsyncStorage (`driver_active_ride_id`). If the driver app restarts mid-trip, `ride_id` is restored immediately.
2. **Foreground Service Notification:**
   In `app.config.js`, configure `expo-location` with foreground service capability so Android does not kill the watcher when the driver switches to Google Maps:
   ```javascript
   [
     "expo-location",
     {
       locationAlwaysAndWhenInUsePermission: "Ride needs your location to navigate and track passenger rides.",
       isAndroidForegroundServiceEnabled: true
     }
   ]
   ```

---

## 5. Telematics Buffer & Ingestion (`utils-server/breadcrumbs.ts`)

### 5.1 Zero-Query Lazy Initialization in `utils-server/index.ts`
In `utils-server/index.ts` lines 1442–1444, `location:update` already executes an ownership query:
```typescript
const [locRide] = await db.select({ driver_id: rides.driver_id, status: rides.status })
  .from(rides).where(eq(rides.id, locRideId)).limit(1);
```
By selecting `status: rides.status` in the **exact same query**, we learn whether the ride is `in_progress` with **zero extra database lookups**.

```typescript
// utils-server/index.ts location:update branch
if (locRide && locRide.status === "in_progress") {
  recordBreadcrumbPoint(locRideId, {
    lat: msg.lat as number,
    lng: msg.lng as number,
    ts: parsePointTs(msg.ts),
  });
}
```

### 5.2 Bounded Ring Buffer & Idle Eviction (`utils-server/breadcrumbs.ts`)
* **Per-Ride Cap:** Maximum **720 points** (~1 hour at 5s). When the cap is reached, points are flushed to DB and the buffer shifts.
* **Global Cap:** Maximum **100,000 points** in memory across all active trips (~6 MB RAM).
* **Idle TTL Eviction:** If an abandoned ride receives no points for **15 minutes**, its buffer is automatically flushed and evicted from memory, preventing memory leaks.
* **Chunked Batch Flusher:**
  * Runs every 30 seconds.
  * Writes in chunks of **$\le 500$ rows** using:
    `INSERT INTO ride_breadcrumbs (ride_id, latitude, longitude, recorded_at) VALUES (...) ON CONFLICT (ride_id, recorded_at) DO NOTHING`
  * Idempotency guarantee: retried inserts never create duplicate rows.

### 5.3 Abnormal Exits & Shutdown Handling
1. **Ride Completion:** Existing `POST /internal/ride/completed` calls `await flushAndEvictBreadcrumbs(ride_id);`.
2. **SIGTERM / SIGINT Shutdown:**
   In `utils-server/index.ts`, wrap breadcrumbs flush in a 3-second timeout race to prevent slow DB connections from hanging container shutdowns:
   ```typescript
   process.on("SIGTERM", async () => {
     clearPendingDetections();
     try {
       await Promise.race([
         flushAllBreadcrumbBuffers(),
         new Promise((_, reject) => setTimeout(() => reject(new Error("Flush timeout")), 3000)),
       ]);
     } catch (err) {
       // Log to stderr; process must terminate
     }
     process.exit(0);
   });
   ```

---

## 6. Real Live Driver Tracking on Public `/track/[id]`

### 6.1 Backend API (`app/api/ride/[id]/track+api.ts`)
Update `track+api.ts` to left-join `drivers` using actual schema columns (`last_location_lat`, `last_location_lng`):

```typescript
// app/api/ride/[id]/track+api.ts
let driverLat: number | null = null;
let driverLng: number | null = null;

if (ride.driver_id && isActive) {
  const [drv] = await db.select({
    name: users.name,
    rating: drivers.rating,
    vehicle_type: drivers.vehicle_type,
    last_location_lat: drivers.last_location_lat,
    last_location_lng: drivers.last_location_lng,
  }).from(drivers)
    .leftJoin(users, eq(users.id, drivers.user_id))
    .where(eq(drivers.id, ride.driver_id))
    .limit(1);

  if (drv) {
    driverName = drv.name;
    driverRating = drv.rating;
    vehicleType = drv.vehicle_type;
    driverLat = drv.last_location_lat ? Number(drv.last_location_lat) : null;
    driverLng = drv.last_location_lng ? Number(drv.last_location_lng) : null;
  }
}

// Invariant P1-17 Strictly Preserved:
// If status is terminal (completed/cancelled), all coordinates and driver info are NULL.
const body = {
  status: ride.status,
  driver_name: isActive ? driverName : null,
  driver_rating: isActive ? driverRating : null,
  vehicle_type: isActive ? vehicleType : null,
  driver_lat: isActive ? driverLat : null,
  driver_lng: isActive ? driverLng : null,
  origin_lat: isActive ? Number(ride.origin_latitude) : null,
  origin_lng: isActive ? Number(ride.origin_longitude) : null,
  destination_lat: isActive ? Number(ride.destination_latitude) : null,
  destination_lng: isActive ? Number(ride.destination_longitude) : null,
};
```

### 6.2 Frontend Tracking Screen (`app/track/[rideId].tsx`)
Render the dynamic driver car marker using `MapLibreGL.PointAnnotation`:
```tsx
{MapLibreGL && data.driver_lat != null && data.driver_lng != null && (
  <MapLibreGL.PointAnnotation
    id="driver-location"
    coordinate={[data.driver_lng, data.driver_lat]}
  >
    <View style={styles.carMarker}>
      <Ionicons name="car" size={24} color={colors.primary} />
    </View>
  </MapLibreGL.PointAnnotation>
)}
```
As the public web screen polls every 10s (`setInterval`), the car icon moves smoothly across the map.

---

## 7. Phone Normalization & Contact Verification Engine

### 7.1 Strict E.164 Phone Normalization (`lib/phoneUtils.ts`)
Replaces flawed prefixing logic with strict E.164 parsing:

```typescript
// lib/phoneUtils.ts (Shared between server and client)
export function parseAndNormalizePhone(rawPhone: string): { e164: string; isBd: boolean } | null {
  const clean = rawPhone.replace(/[\s-()]/g, "");

  // 1. Bangladeshi national format (e.g. 01711223344 -> +8801711223344)
  if (/^01[3-9]\d{8}$/.test(clean)) {
    return { e164: `+880${clean.slice(1)}`, isBd: true };
  }

  // 2. Bangladeshi international format with or without '+' (e.g. 8801711223344)
  if (/^(?:\+?880)1[3-9]\d{8}$/.test(clean)) {
    return { e164: clean.startsWith("+") ? clean : `+${clean}`, isBd: true };
  }

  // 3. Foreign international format (must explicitly begin with '+')
  if (/^\+[1-9]\d{7,14}$/.test(clean)) {
    return { e164: clean, isBd: false };
  }

  // Rejects ambiguous numbers entered without country code (e.g. 14155551234)
  return null;
}
```

### 7.2 Emergency Contacts API (`app/api/user/emergency-contacts+api.ts`)
1. **Extend `GET` projection:**
   Add `auto_share_enabled: userEmergencyContacts.auto_share_enabled` and `is_verified: userEmergencyContacts.is_verified` to the existing `SELECT` block so the client UI can render contact status.
2. **Add `PATCH` method:**
   * **Payload:** `{ contact_id: string, auto_share_enabled?: boolean, action?: 'send_otp' | 'verify_otp', otp?: string }`
   * **OTP Verification Flow:**
     1. Setting `auto_share_enabled: true` generates a 4-digit OTP using `crypto.randomInt(1000, 9999).toString()`.
     2. Dispatches OTP via `sendOtp(phone, otp)` from `lib/dprelay.ts`.
     3. Saves `verification_otp` and `verification_expires_at` (10-minute expiry).
     4. Verifying OTP flips `is_verified: true` and activates auto-sharing for that contact.

### 7.3 Auto-Share Match SMS Dispatch Rules (`lib/rideShareSms.ts`)
Triggered in `executeMatchFlow` ([`utils-server/index.ts` line 2632](file:///d:/My%20Projects/Current%20Project/Ride/utils-server/index.ts#L2632)):
1. **Scheduled Ride Check:** If `ride.scheduled_at != null` and scheduled start is $> 30$ mins away, skip dispatch (SMS triggers when ride moves to `driver_arriving`).
2. **Booked For Someone Else:** If `ride.is_booked_for_someone_else` is true, do NOT alert the booker's emergency contacts (alerts only passenger's verified contacts if present).
3. **Redispatch Deduplication:** If `ride_share_dispatches` already contains a `'sent'` record for `(ride_id, recipient_phone)`, do NOT send duplicate alert; send brief vehicle update only if plate changed.
4. **Rate Limit:** Maximum 2 contacts per trip; maximum 6 auto-share SMS per rider per 24 hours.

---

## 8. Authenticated In-App Replay & GPX Export

### 8.1 Authorization Guard (Copied from `details+api.ts`)
```typescript
// app/api/ride/[id]/breadcrumbs+api.ts & export/gpx+api.ts
const supabaseUser = await verifySupabaseToken(request);

const [user] = await db
  .select({ id: users.id, role: users.role })
  .from(users)
  .where(eq(users.auth_uid, supabaseUser.id))
  .limit(1);

if (!user) return Response.json({ error: "user_not_found" }, { status: 404 });

const [ride] = await db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
if (!ride) return Response.json({ error: "ride_not_found" }, { status: 404 });

// Canonical resolution: resolves drivers.id -> users.id to prevent false 403s on drivers
const participantIds = await resolveRideParticipantIds(db, ride);
if (!isParticipant(participantIds, user.id) && user.role !== "admin") {
  return Response.json({ error: "forbidden", message: "Access denied" }, { status: 403 });
}
```

### 8.2 In-App Scrubber UI & GPX Export (Customer App)
In `app/(main)/(customer)/(tabs)/history-detail/index.tsx`:
1. **Interactive Route Scrubber:**
   * Slider controls position of passenger pin along the breadcrumbs array.
   * Displays local clock time and speed at each point.
2. **Export GPX Button:**
   * Fetches `/api/ride/[id]/export/gpx` with Bearer token.
   * Uses `FileSystem.writeAsStringAsync` to save `ride_[id].gpx` in device cache.
   * Calls `Sharing.shareAsync` to open file in Google Earth or GPX Viewer.

---

## 9. Data Retention & Purge Job (Job 61)

### 9.1 Scheduler Configuration (`utils-server/scheduler.ts`)
Register **Job 61** inside `startScheduler()` using `registerJob` and `withJobBudget`:
```typescript
// Job 61 — Breadcrumbs 30-day retention purge (interval: 24h)
let breadcrumbsPurgeRunning = false;

registerJob("job_61_breadcrumbs_retention_purge", 24 * 60 * 60 * 1000, async () => {
  if (breadcrumbsPurgeRunning) return;
  breadcrumbsPurgeRunning = true;
  try {
    await withJobBudget(61, 10_000, async (tx) => {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Safety & Legal Hold: Never delete breadcrumbs for rides with active fare disputes or SOS alerts
      await tx.execute(sql`
        DELETE FROM ride_breadcrumbs
        WHERE id IN (
          SELECT rb.id FROM ride_breadcrumbs rb
          LEFT JOIN sos_alerts sa ON sa.ride_id = rb.ride_id
          LEFT JOIN fare_disputes fd ON fd.ride_id = rb.ride_id
          WHERE rb.recorded_at < ${cutoff}
            AND sa.id IS NULL
            AND fd.id IS NULL
          LIMIT 1000
        )
      `);

      // Purge dispatch audit logs older than 90 days
      const auditCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      await tx.execute(sql`
        DELETE FROM ride_share_dispatches WHERE sent_at < ${auditCutoff} LIMIT 1000
      `);
    });
  } finally {
    breadcrumbsPurgeRunning = false;
  }
});
```
* **Storage Footprint:** With indexes, storage stabilizes at **$\approx 1.5 - 2\text{ GB}$** per 1,000 daily trips.

---

## 10. Phased Implementation Roadmap & Verification Gates

```
Phase 1: Driver App Telematics Hardening
  ├── app/(main)/(rider)/finish-ride/index.tsx: decouple geocode, add ts, 5s cadence
  ├── Add activeRideId persistence using useRideOfferStore + AsyncStorage
  ├── Add foreground service location permission to app.config.js
  └── Gate: Driver emulates movement; WS frames verify { lat, lng, ts, ride_id }

Phase 2: Database Migration 0088 & Drizzle Schema
  ├── Hand-written 0088 SQL with RLS, FORCE RLS, REVOKE ALL, and UNIQUE constraint
  ├── Drizzle schema additions in src/db/schema.ts (bigint, unique imported)
  └── Gate: Migration pushes to scratch DB cleanly; test asserting anon role 403 on SELECT

Phase 3: utils-server Telematics Ingestion & Flush Hooks
  ├── utils-server/breadcrumbs.ts (bounded 720 pts/ride, chunked <= 500 rows)
  ├── Hook into ownership select in utils-server/index.ts (lazy init from status)
  ├── Hook /internal/ride/completed and /internal/ride/cancelled
  ├── Add SIGTERM / SIGINT graceful flush with 3s timeout
  ├── Register Job 61 in scheduler.ts with safety hold on fare_disputes & sos_alerts
  └── Gate: Unit test verifying flush on complete, chunking <= 500, and SIGTERM flush

Phase 4: Live Driver Tracking on Public URL
  ├── app/api/ride/[id]/track+api.ts selects driver_location_lat/lng while active
  ├── app/track/[rideId].tsx renders moving car marker updating every 10s via MapLibreGL
  ├── Update tests/api/ride/track.test.ts active assertion to expect driver coordinates
  └── Gate: tests/api/ride/track.test.ts passes (asserting coordinates active, nulled terminal)

Phase 5: Auto-Share Engine & Contact Verification
  ├── lib/phoneUtils.ts strict E.164 parsing
  ├── Update GET and add PATCH to /api/user/emergency-contacts
  ├── lib/rideShareSms.ts with redispatch dedupe and rate limiting
  ├── Hook into executeMatchFlow next to sendMatchPinSms
  └── Gate: OTP verification tests; rate limit unit tests; redispatch dedupe assertions

Phase 6: Authenticated In-App Route Replay & GPX Export
  ├── GET /api/ride/[id]/breadcrumbs with resolveRideParticipantIds guard
  ├── GET /api/ride/[id]/export/gpx with XML escaping
  ├── Customer history-detail/index.tsx scrubber UI and GPX file share button
  └── Gate: IDOR tests (stranger 403, driver 200, rider 200, admin 200)
```
