# Plan 28 (v3.0) — Live Ride Sharing & Route Telematics Engine

> **Document Status:** GOLDFISH RESOLVED SPEC (2026-11-02)  
> **Replaces:** Plan 28 v1.0, v2.0, v2.1, v2.2, and v2.3  
> **Audited By Swarm:** `egm-design`, `egm-codebase-details`, `egm-implementation-readiness`, `egm-zoom-out`  
> **Audited Against:** `utils-server/index.ts`, `utils-server/trace.ts`, `utils-server/scheduler.ts`, `app/api/ride/[id]/{track,details,cancel,complete}+api.ts`, `app/(main)/(rider)/finish-ride/index.tsx`, `app/(main)/(customer)/(tabs)/history-detail/index.tsx`, `app/(main)/(customer)/emergency-sos/index.tsx`, `app/api/sos/alert+api.ts`, `src/db/schema.ts`, `tests/api/ride/track.test.ts`.

---

## 1. Problem Statement & Business Motivation

When passengers use Ride in Bangladesh, two distinct safety and audit needs arise:
1. **Real-Time Passenger Reassurance:** Riders commuting alone or at night want family members to see their trip progress live. Relying on manual text updates is error-prone and distracting while moving.
2. **Statutory Compliance & Post-Trip Forensics:** Local transportation regulations mandate a direct emergency call mechanism (999) on mobile apps. Furthermore, fare disputes (e.g. `'route_longer'`) and emergency incident reviews require an authoritative physical GPS record of the completed journey.

**The Economic & Architecture Invariant:** Ride is a lead-generation platform operating on flat driver subscription packages with 0% ride commission and zero escrow. The platform cannot absorb recurring third-party telecom costs (such as sending automated SMS on every routine trip match). Consequently, routine trip sharing must leverage free, user-initiated channels (WhatsApp and native OS share sheets), while platform-funded SMS is reserved exclusively for statutory emergency distress (SOS) events.

---

## 2. Goals vs. Non-Goals

### In-Scope Goals
* **1-Tap WhatsApp Ride Share:** A single tap on the active tracking screen generates a WhatsApp deep-link with driver identity, vehicle plate, and a public tracking link (`/track/[rideId]`) at zero gateway cost.
* **Real Live Public Tracking with P1-17 Invariant:** Public `/track/[rideId]` web screen displays live driver position and moving car marker while active, and strictly degrades to a null-coordinate terminal state upon completion or cancellation.
* **Edge Caching & Rate Limiting:** Public tracking endpoints are shielded by IP rate limits and HTTP edge caching headers (`Cache-Control: public, max-age=3, s-maxage=3, stale-while-revalidate=5`) to prevent database connection pool exhaustion from viral share links.
* **Zero-DB Hot-Path Telematics:** Driver GPS updates emitted every 5s over WebSocket are validated and buffered purely in-memory in `utils-server` with zero relational database lookups on the hot path.
* **Compact Single-Record Route Storage:** Completed trip breadcrumbs are persisted upon trip completion as a single record in `ride_routes` (`points JSONB`), reducing database row churn by 99.7% compared to individual point rows.
* **Statutory 999 SOS & Distress SMS:** Immediate native cellular dialing to national emergency (`tel:999`) on SOS tap ("DIAL FIRST"), backed by automated platform-funded distress SMS with GPS coordinates broadcast to registered emergency contacts.
* **In-App Route Display:** Authenticated riders and drivers can review the exact route polyline driven on the customer history detail screen (`history-detail/index.tsx`).

### Out-of-Scope Non-Goals
* **Automated Match-Time SMS for Routine Rides:** Rejected due to 30,000–50,000 BDT monthly telecom deficit.
* **Server-Side WhatsApp Business API:** Rejected due to Meta per-template conversation fees (~$0.03/msg).
* **Emergency Contact OTP Verification:** Emergency contacts are registered directly by the rider without forced SMS OTP verification friction.
* **GPX 1.1 Desktop GIS Export:** Dropped per YAGNI analysis; daily commuters in Bangladesh require in-app route visualization, not XML file downloads for desktop GIS software.
* **In-App VoIP / SIP Calling:** Native cellular dialer (`tel:`) remains the sole voice mechanism.

---

## 3. Alternatives Considered & Architecture Trade-offs

| Architectural Decision | Chosen Strategy | Alternative Rejected | Rationale for Rejection |
|---|---|---|---|
| **Routine Ride Sharing Channel** | Client-Side 1-Tap WhatsApp (`whatsapp://send`) | Automated Server-Side SMS on Match | Sending 2 SMS per matched trip at ~0.35 BDT/SMS creates a severe operational deficit on a 0% commission platform. WhatsApp has near 100% smartphone penetration in Bangladesh and incurs 0 BDT in gateway fees. |
| **Route Breadcrumb Storage** | Compact Single-Record JSONB (`ride_routes`) | Normalized Relational Rows (`ride_breadcrumbs`) | Normalized storage generates ~240,000 rows/day (~10.8M rows/month) at 5s sampling, creating massive autovacuum churn, B-tree index bloat, and pool starvation on the 5-connection PostgreSQL pool. Storing points as a JSONB array reduces row count to ~1,000/day. |
| **Telematics Ownership Validation** | In-Memory Active Cache in `utils-server` | Relational SQL Query on Every 5s Tick | Querying `SELECT driver_id, status FROM rides` on every 5s WebSocket frame generates 200 QPS against a 5-connection pool (`APP_POOL_SIZE = 5`), causing connection starvation and API timeouts. |
| **Live Tracking Delivery** | HTTP Polling (10s) with Edge Caching Headers | Open WebSocket for Anonymous Public | Managing public unauthenticated WebSocket connections on `utils-server` invites socket exhaustion attacks. HTTP polling with edge cache headers coalesces viewers at the CDN layer. |
| **Route Export** | In-App Polyline Visualization | GPX 1.1 XML Download (`expo-sharing`) | Over-engineering (YAGNI). No consumer ride-hailing app in the region provides GPX downloads, and commuters do not use desktop GIS tools. |

---

## 4. Architectural Invariants & Ship-Stoppers Ledger

| Issue Identified in Review | Root Cause | Forensic Resolution in v3.0 |
|---|---|---|
| **1. Missing Table RLS** | Supabase default grants expose new tables to `anon` and `authenticated`. | Migration `0088` enforces `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and `REVOKE ALL ON ride_routes FROM anon, authenticated;`. |
| **2. Hot-Path DB Query Starvation** | `location:update` queried Postgres on every 5s frame (200 QPS on 5-connection pool). | Ingest telematics against an in-memory cache in `utils-server` (`activeRideTelemetry.set(rideId, points)`). Zero SQL queries on hot path. |
| **3. Job 61 Purge Under-Sizing** | Single `LIMIT 1000` once per 24h purged <0.5% of rows under normalized storage. | With compact `ride_routes` storage, daily row creation is only ~1,000 rows/day. A single 1,000-row purge completely clears expired records. |
| **4. Scheduler `registerJob` Crash** | Called `registerJob("name", interval, fn)`; scheduler signature is strictly `(fn, ms)`. | Corrected to `registerJob(async () => { ... }, 86_400_000)` with `withJobBudget(61, 10_000, ...)`. |
| **5. Public Tracking DDOS & Pool Starvation** | `/track/[id]` had no rate limiting or edge caching headers for active trips. | Added IP rate limiter and edge headers: `Cache-Control: public, max-age=3, s-maxage=3, stale-while-revalidate=5`. |
| **6. Driver App Telematics Decoupling** | Reverse-geocoding was awaited before sending WebSocket frames. | Telematics loop emits non-blocking; reverse geocoding runs in an asynchronous background promise for UI only. |
| **7. Store Typo in Driver App** | Spec referenced `useRideStore` (non-existent). | Corrected to driver store: `useRideOfferStore.getState().activeRideId`. |
| **8. Coordinate Wire-Type Drift** | Wrapping `origin_lat/lng` in `Number()` broke existing test assertions. | Preserved string coordinates for origin/destination matching live code; only `driver_lat/lng` cast to number. |
| **9. Non-Existent Drizzle Import** | Spec attempted to import `timestamptz` from `drizzle-orm/pg-core`. | `timestamptz` is a local wrapper in `src/db/schema.ts`; import only `bigint, unique` from `drizzle-orm/pg-core`. |
| **10. Participant Guard Error Mismatch** | Guard returned `{ error: "forbidden" }` instead of repository standard. | Corrected to `{ error: "not_ride_participant", message: "You are not a participant in this ride" }` matching `details+api.ts`. |

---

## 5. System Architecture & Lifecycle Flow

```mermaid
flowchart TD
    subgraph DriverApp["Driver App (finish-ride/index.tsx)"]
        D_GPS["WatchPosition (5s tick, 2m interval)"]
        D_BG["Foreground Service Task (Persistent Notification)"]
        D_ASYNC["Async Geocode (Non-blocking promise for UI)"]
        D_WS["WS emit: location:update (lat, lng, ts, ride_id)"]
    end

    subgraph UtilsServer["utils-server (Port 3001)"]
        WS_HANDLER["location:update Handler"]
        MEM_CACHE["In-Memory Active Ride Cache (Zero SQL on hot path)"]
        BC_BUFFER["Telemetry Ingestion Queue (In-Memory per active ride)"]
        INTERNAL_RPC["POST /internal/ride/completed"]
        SIGTERM_HANDLER["SIGTERM / SIGINT Flush (3s Timeout)"]
        SCHEDULE_PURGE["Job 61: 30-day Purge (withJobBudget)"]
    end

    subgraph ExpoAPI["Expo API Routes (Port 8081)"]
        TRACK_API["GET /api/ride/:id/track (Edge Cached: max-age=3)"]
        AUTH_BC["GET /api/ride/:id/breadcrumbs (resolveRideParticipantIds)"]
        SOS_API["POST /api/sos/alert (999 Dial + Distress SMS)"]
    end

    subgraph Database["PostgreSQL (RLS FORCED + REVOKED)"]
        DB_ROUTES[("ride_routes (1 row/ride: points JSONB)")]
        DB_SOS[("sos_alerts")]
        DB_DISPUTES[("fare_disputes")]
    end

    subgraph RiderApp["Rider App"]
        R_WA["1-Tap WhatsApp Share (whatsapp://send?text=...)"]
        R_SOS["SOS Button ('DIAL FIRST' tel:999)"]
        R_HIST["history-detail/index.tsx (Route Polyline Display)"]
    end

    D_BG --> D_GPS
    D_GPS --> D_WS
    D_GPS -.-> D_ASYNC
    
    D_WS --> WS_HANDLER
    WS_HANDLER --> MEM_CACHE
    MEM_CACHE --> BC_BUFFER
    
    INTERNAL_RPC -->|Flush completed route JSONB| DB_ROUTES
    SIGTERM_HANDLER -->|Flush on shutdown| DB_ROUTES
    SCHEDULE_PURGE -->|Purge >30 days (hold if SOS/dispute)| DB_ROUTES

    R_WA -.->|Shares URL| TRACK_API
    TRACK_API -.->|Poll every 10s: Live driver marker| Database
    R_SOS -->|Immediate Cellular Call| D_BG
    R_SOS --> SOS_API
    SOS_API --> DB_SOS

    R_HIST --> AUTH_BC
    AUTH_BC --> DB_ROUTES
```

---

## 6. Database Schema & Migration (`0088`)

### 6.1 Migration File: `src/db/migrations/0088_ride_routes_and_telematics.sql`
Adheres strictly to the `--> statement-breakpoint` convention with **RLS ENABLED, FORCED, and REVOKED**:

```sql
-- Migration: 0088_ride_routes_and_telematics.sql
-- Hand-written migration. DO NOT RUN drizzle-kit generate (snapshot drift at 0043).

-- 1. Compact ride routes table (1 row per completed ride)
CREATE TABLE IF NOT EXISTS "ride_routes" (
  "ride_id" uuid PRIMARY KEY REFERENCES "rides"("id") ON DELETE CASCADE,
  "points" jsonb NOT NULL, -- Array of { lat: number, lng: number, ts: number }
  "distance_meters" numeric(10, 2),
  "duration_seconds" integer,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ride_routes_created_at_idx" 
ON "ride_routes" ("created_at");
--> statement-breakpoint

-- Standard security posture: ENABLE + FORCE RLS + REVOKE ALL from anon/authenticated
ALTER TABLE "ride_routes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "ride_routes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

REVOKE ALL ON "ride_routes" FROM anon, authenticated;
```

### 6.2 Drizzle Schema Additions (`src/db/schema.ts`)
```typescript
// New rideRoutes table (add to src/db/schema.ts):
export const rideRoutes = pgTable(
  "ride_routes",
  {
    ride_id: uuid("ride_id")
      .primaryKey()
      .references(() => rides.id, { onDelete: "cascade" }),
    points: jsonb("points").notNull(), // Array of { lat: number, lng: number, ts: number }
    distance_meters: numeric("distance_meters", { precision: 10, scale: 2 }),
    duration_seconds: integer("duration_seconds"),
    created_at: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ride_routes_created_at_idx").on(t.created_at),
  ]
);
```

---

## 7. Driver App Telematics Pipeline (`app/(main)/(rider)/finish-ride/index.tsx`)

### 7.1 Decoupling Reverse-Geocoding from Telematics
In `finish-ride/index.tsx`, `Location.reverseGeocodeAsync` was previously awaited before `sock.send()`. If geocoding failed or choked on network latency, the GPS point was never transmitted.

**Refactored Telematics Loop:**
```typescript
// Active ride ID is recovered from driver store with route param fallback
const currentRideId = useRideOfferStore.getState().activeRideId || localRideIdParam;

locationSubscription = await Location.watchPositionAsync(
  {
    accuracy: Location.Accuracy.Balanced, // Conserves battery on budget hardware
    timeInterval: 5000,                  // 5-second sampling cadence
    distanceInterval: 2,                 // 2-meter threshold
  },
  (location) => {
    const lat = location.coords.latitude;
    const lng = location.coords.longitude;
    const clientTs = location.timestamp || Date.now();
    const rideId = useRideOfferStore.getState().activeRideId || currentRideId;

    // 1. NON-BLOCKING: Emit telematics immediately over WebSocket
    const sock = wsRef.current;
    if (sock && sock.readyState === WebSocket.OPEN && rideId) {
      sock.send(
        JSON.stringify({
          type: "location:update",
          role: "driver",
          ride_id: rideId,
          lat,
          lng,
          ts: clientTs,
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

### 7.2 Ride ID Persistence & Background Location Task
1. **Ride ID Persistence:** Active ride ID is read from `useRideOfferStore.getState().activeRideId` with fallback to `AsyncStorage` (`driver_active_ride_id`). If the driver app restarts mid-trip, `ride_id` is restored immediately.
2. **Foreground Service Configuration:**
   Configure `expo-location` with Android foreground service in `app.config.js`:
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

## 8. utils-server Telematics Ingestion & Zero-DB Hot Path

### 8.1 In-Memory Active Cache in `utils-server/index.ts`
To eliminate 200 QPS against the 5-connection PostgreSQL pool, `utils-server` maintains an in-memory set of active trips:

```typescript
// Memory-local active trip registry
const activeTripCache = new Map<string, { driverId: string; status: string }>();

// Populated on ride match/start, cleared on completion/cancel
export function registerActiveTrip(rideId: string, driverId: string, status: string) {
  activeTripCache.set(rideId, { driverId, status });
}
export function unregisterActiveTrip(rideId: string) {
  activeTripCache.delete(rideId);
}
```

In the `location:update` handler:
```typescript
// Zero SQL queries on hot path
const activeTrip = activeTripCache.get(locRideId);
if (activeTrip && activeTrip.status === "in_progress") {
  // Validate timestamp within 5-minute sanity window
  const now = Date.now();
  const rawTs = Number(msg.ts) || now;
  const safeTs = Math.abs(rawTs - now) > 300_000 ? now : rawTs;

  recordBreadcrumbPoint(locRideId, {
    lat: msg.lat as number,
    lng: msg.lng as number,
    ts: safeTs,
  });
}
```

### 8.2 Ingestion Buffer & Trip Completion Flush (`utils-server/breadcrumbs.ts`)
```typescript
interface BreadcrumbPoint {
  lat: number;
  lng: number;
  ts: number;
}

const activeBreadcrumbs = new Map<string, BreadcrumbPoint[]>();

export function recordBreadcrumbPoint(rideId: string, point: BreadcrumbPoint) {
  let list = activeBreadcrumbs.get(rideId);
  if (!list) {
    list = [];
    activeBreadcrumbs.set(rideId, list);
  }
  // Cap at 1,000 points per trip (~83 minutes at 5s)
  if (list.length < 1000) {
    list.push(point);
  }
}

export async function flushAndEvictRoute(rideId: string) {
  const points = activeBreadcrumbs.get(rideId);
  activeBreadcrumbs.delete(rideId);
  unregisterActiveTrip(rideId);

  if (!points || points.length === 0) return;

  const durationSec = Math.round((points[points.length - 1].ts - points[0].ts) / 1000);

  await db.insert(rideRoutes)
    .values({
      ride_id: rideId,
      points: points as any,
      duration_seconds: durationSec,
    })
    .onConflictDoNothing();
}
```

### 8.3 Abnormal Exits & Shutdown Handling
1. **Trip Completion:** Existing `POST /internal/ride/completed` calls `await flushAndEvictRoute(ride_id);`.
2. **SIGTERM / SIGINT Shutdown:**
   In `utils-server/index.ts`, flush all active in-memory routes within a 3-second timeout:
   ```typescript
   process.on("SIGTERM", async () => {
     clearPendingDetections();
     try {
       await Promise.race([
         flushAllActiveRoutes(),
         new Promise((_, reject) => setTimeout(() => reject(new Error("Flush timeout")), 3000)),
       ]);
     } catch (err) {
       // Log to stderr; process must terminate
     }
     process.exit(0);
   });
   ```

---

## 9. Real Live Driver Tracking on Public `/track/[id]`

### 9.1 Backend API (`app/api/ride/[id]/track+api.ts`)
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
// Terminal rides have coordinates and driver info completely nulled.
const body = {
  status: ride.status,
  driver_name: isActive ? driverName : null,
  driver_rating: isActive ? driverRating : null,
  vehicle_type: isActive ? vehicleType : null,
  driver_lat: isActive ? driverLat : null,
  driver_lng: isActive ? driverLng : null,
  origin_lat: isActive ? ride.origin_latitude : null,
  origin_lng: isActive ? ride.origin_longitude : null,
  destination_lat: isActive ? ride.destination_latitude : null,
  destination_lng: isActive ? ride.destination_longitude : null,
};

// Edge caching headers: coalesces concurrent viewers without hitting Postgres
const headers = new Headers();
if (isActive) {
  headers.set("Cache-Control", "public, max-age=3, s-maxage=3, stale-while-revalidate=5");
} else {
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  headers.set("X-Robots-Tag", "noindex, nofollow");
}

return Response.json(body, { status: 200, headers });
```

### 9.2 Frontend Tracking Screen (`app/track/[rideId].tsx`)
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

---

## 10. Client-Side 1-Tap WhatsApp Ride Sharing

In `app/(main)/(customer)/ride-tracking/[ride_id].tsx`:
```tsx
// 1-Tap WhatsApp Share Button (Zero Platform SMS Cost)
const handleShareWhatsApp = async () => {
  const shareUrl = `https://ride.com.bd/track/${rideId}`;
  const message = `I am on a Ride trip with ${driverName} (${vehicleType}, Plate: ${plateNumber}). Track my ride live: ${shareUrl}`;
  const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;

  const supported = await Linking.canOpenURL(whatsappUrl);
  if (supported) {
    await Linking.openURL(whatsappUrl);
  } else {
    // Native OS Share Sheet fallback
    await Share.share({ message });
  }
};
```

---

## 11. Authenticated In-App Route Display (History Screen)

### 11.1 Route Retrieval Endpoint (`app/api/ride/[id]/breadcrumbs+api.ts`)
```typescript
const supabaseUser = await verifySupabaseToken(request);

const [user] = await db
  .select({ id: users.id, role: users.role })
  .from(users)
  .where(eq(users.auth_uid, supabaseUser.id))
  .limit(1);

if (!user) return Response.json({ error: "user_not_found" }, { status: 404 });

const [ride] = await db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
if (!ride) return Response.json({ error: "ride_not_found" }, { status: 404 });

const participantIds = await resolveRideParticipantIds(db, ride);
if (!isParticipant(participantIds, user.id) && user.role !== "admin") {
  return Response.json(
    { error: "not_ride_participant", message: "You are not a participant in this ride" },
    { status: 403 }
  );
}

const [routeRecord] = await db
  .select({ points: rideRoutes.points, duration: rideRoutes.duration_seconds })
  .from(rideRoutes)
  .where(eq(rideRoutes.ride_id, rideId))
  .limit(1);

return Response.json({
  ride_id: rideId,
  points: routeRecord?.points ?? [],
  duration_seconds: routeRecord?.duration ?? 0,
});
```

### 11.2 Route Polyline Display (`history-detail/index.tsx`)
In `app/(main)/(customer)/(tabs)/history-detail/index.tsx`:
Fetches `/api/ride/[id]/breadcrumbs` and renders the route polyline on `MapLibreGL.ShapeSource` with line styling.

---

## 12. Data Retention & Purge Job (Job 61)

Inside `startScheduler()` in `utils-server/scheduler.ts`:
```typescript
// Job 61 — Route telematics 30-day retention purge (interval: 24h)
let routesPurgeRunning = false;

registerJob(async () => {
  if (routesPurgeRunning) return;
  routesPurgeRunning = true;
  try {
    await withJobBudget(61, 10_000, async (tx) => {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Safety & Legal Hold: Never delete routes for rides with active disputes or SOS alerts
      await tx.execute(sql`
        DELETE FROM ride_routes
        WHERE created_at < ${cutoff}
          AND NOT EXISTS (SELECT 1 FROM sos_alerts sa WHERE sa.ride_id = ride_routes.ride_id)
          AND NOT EXISTS (SELECT 1 FROM fare_disputes fd WHERE fd.ride_id = ride_routes.ride_id)
        LIMIT 1000
      `);
    });
  } finally {
    routesPurgeRunning = false;
  }
}, 86_400_000);
```

---

## 13. Phased Implementation Roadmap & Verification Gates

```
Phase 1: Driver App Telematics Hardening
  ├── app/(main)/(rider)/finish-ride/index.tsx: decouple geocode, add ts, 5s cadence
  ├── Add activeRideId persistence using useRideOfferStore + AsyncStorage
  ├── Add foreground service location permission to app.config.js
  └── Gate: npx jest tests/unit/finish-ride-telematics.test.ts && npm run lint

Phase 2: Database Migration 0088 & Drizzle Schema
  ├── Hand-written 0088 SQL creating ride_routes with RLS, FORCE RLS, REVOKE ALL
  ├── Drizzle schema additions in src/db/schema.ts (export rideRoutes)
  └── Gate: npx jest tests/api/ride/routes-schema.test.ts (verifies RLS blocks anon/auth)

Phase 3: utils-server Telematics Ingestion & Flush Hooks
  ├── utils-server/breadcrumbs.ts (in-memory active queue, flushAndEvictRoute)
  ├── Hook activeRideCache into utils-server/index.ts (zero SQL on location:update)
  ├── Hook /internal/ride/completed to persist compact route JSONB
  ├── Add SIGTERM / SIGINT graceful flush with 3s timeout
  ├── Register Job 61 in scheduler.ts with safety hold on fare_disputes & sos_alerts
  └── Gate: npx jest tests/utils-server/breadcrumbs.test.ts

Phase 4: Live Driver Tracking on Public URL & WhatsApp Share
  ├── app/api/ride/[id]/track+api.ts selects driver coordinates with Cache-Control headers
  ├── app/track/[rideId].tsx renders moving car marker updating every 10s via MapLibreGL
  ├── app/(main)/(customer)/ride-tracking/[ride_id].tsx: add 1-tap WhatsApp share button
  └── Gate: npx jest tests/api/ride/track.test.ts (verifying active coords & terminal P1-17)

Phase 5: Authenticated In-App Route Display
  ├── GET /api/ride/[id]/breadcrumbs with resolveRideParticipantIds guard
  ├── Customer history-detail/index.tsx renders route polyline on map
  └── Gate: npx jest tests/api/ride/breadcrumbs.test.ts (IDOR tests: stranger 403, rider 200)
```

---

## 14. Rollback & Failure Recovery Procedures

### Database Down-Migration SQL
```sql
DROP TABLE IF EXISTS "ride_routes" CASCADE;
```

### Buffer Overflow Fail-Safe
If in-memory telemetry points exceed 1,000 for a single trip, new points are safely discarded to protect process memory.

### Fallback for WhatsApp Deep-Link
If WhatsApp is not installed on the passenger's device, `Linking.canOpenURL("whatsapp://...")` returns false, and the app automatically invokes `Share.share(...)`, opening the standard Android/iOS system share sheet.
