# Plan 28 (v3.1) — Live Ride Sharing & Route Telematics Engine

> **Document Status:** GOLDFISH ROUND 2 RESOLVED SPEC (2026-11-02)  
> **Replaces:** Plan 28 v1.0, v2.0, v2.1, v2.2, v2.3, and v3.0  
> **Audited By Swarm:** `egm-design`, `egm-codebase-details`, `egm-implementation-readiness`, `egm-zoom-out`  
> **Audited Against:** `utils-server/index.ts`, `utils-server/trace.ts`, `utils-server/scheduler.ts`, `app/api/ride/[id]/{track,details,cancel,complete}+api.ts`, `app/(main)/(rider)/finish-ride/index.tsx`, `app/(main)/(customer)/(tabs)/history-detail/index.tsx`, `app/(main)/(customer)/ride-tracking/[ride_id].tsx`, `app/(main)/(customer)/emergency-sos/index.tsx`, `app/api/sos/alert+api.ts`, `src/db/schema.ts`, `tests/api/ride/track.test.ts`.

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
* **Real Live Public Tracking with P1-17 Invariant:** Public `/track/[rideId]` web screen displays live driver position and moving car marker while active (sourced via `utils-server` in-memory telematics), and strictly degrades to a null-coordinate terminal state upon completion or cancellation.
* **Edge Caching Protection:** Public tracking endpoints are shielded by HTTP edge caching headers (`Cache-Control: public, max-age=3, s-maxage=3, stale-while-revalidate=5`) to coalesce concurrent viewers at CDN/proxy edges to ~0.3 QPS, eliminating database connection pool exhaustion from viral share links.
* **Zero-DB Hot-Path Telematics:** Driver GPS updates emitted every 5s over WebSocket are validated and buffered purely in-memory in `utils-server` with zero relational database lookups on the hot path. Corridor coordinates are cached to eliminate SQL queries in route deviation detection.
* **Compact Single-Record Route Storage:** Completed trip breadcrumbs are persisted upon trip completion as a single record in `ride_routes` (`points JSONB`), reducing database row churn by 99.7% compared to individual point rows.
* **Statutory 999 SOS & Distress SMS:** Immediate native cellular dialing to national emergency (`tel:999`) on SOS tap ("DIAL FIRST"), backed by automated platform-funded distress SMS with GPS coordinates broadcast to registered emergency contacts.
* **In-App Route Display:** Authenticated riders and drivers can review the exact route polyline driven on the customer history detail screen (`history-detail/index.tsx`) via MapLibre.

### Out-of-Scope Non-Goals
* **Automated Match-Time SMS for Routine Rides:** Rejected due to 30,000–50,000 BDT monthly telecom deficit.
* **Post-Trip Email Documentation (Receipts & Invoices):** Decoupled to a dedicated transactional receipt plan per YAGNI and architectural separation of concerns (avoids mixing transactional email/SMTP queues into the real-time telematics engine; see `concepts_brief.md` Pillar 2).
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
| **Live Coords Sourcing** | Internal `utils-server` RPC (`/internal/ride/:id/live-coords`) | PostgreSQL `drivers.last_location_*` | To preserve zero-DB hot-path performance, driver coordinates are not written to Postgres on every tick. Exposing an internal endpoint from `utils-server` memory delivers real-time car motion without database write churn. |
| **Route Export** | In-App Polyline Visualization | GPX 1.1 XML Download (`expo-sharing`) | Over-engineering (YAGNI). No consumer ride-hailing app in the region provides GPX downloads, and commuters do not use desktop GIS tools. |

---

## 4. Architectural Invariants & Ship-Stoppers Ledger

| Issue Identified in Review | Root Cause | Forensic Resolution in v3.1 |
|---|---|---|
| **1. Invalid PostgreSQL `LIMIT` on `DELETE`** | PostgreSQL does not support `LIMIT` directly on `DELETE` statements (throws syntax error). | Job 61 rewritten to use bounded subquery idiom: `WHERE ride_id IN (SELECT ride_id FROM ride_routes WHERE created_at < ${cutoff} ... LIMIT 1000)`. |
| **2. Active Dispute Hold Overbreadth** | Bare `NOT EXISTS (SELECT 1 FROM fare_disputes)` locked routes forever even after dispute resolution. | Restricted hold to active dispute statuses: `WHERE fd.status IN ('open', 'under_review', 'escalated')`. |
| **3. Hot-Path DB Query Starvation & Route Deviation Leak** | `location:update` checked driver ownership and corridor coordinates against Postgres on every 5s ping. | Cached `{ driverId, status, originLat, originLng, destLat, destLng }` in `activeTripCache`. Verified `activeTrip.driverId === client.driverId` in memory and passed cached coordinates to `detectRouteDeviation`. Zero SQL on hot path. |
| **4. Server Restart Cache Amnesia** | `activeTripCache` started empty on process restart, dropping telematics for in-flight trips. | Added `startup()` hydration query in `utils-server/index.ts` for ongoing trips (`matched`, `driver_arriving`, `driver_arrived`, `in_progress`), plus self-healing read-through DB check on cache miss. |
| **5. Public Tracking Telematics Disconnect** | `utils-server` kept breadcrumbs in memory without DB writes; public `/track` queried DB, showing frozen car. | `utils-server` exposes internal endpoint `GET /internal/ride/:id/live-coords` (protected by secret) returning latest in-memory coordinate with DB fallback. |
| **6. Header Logic & `track.test.ts` Drift** | Setting `X-Robots-Tag` on `!isActive` broke test assertion for scheduled rides (line 147). Omitted `Pragma: no-cache` (line 117). Exact `toEqual` broke on `driver_lat/lng`. | Explicitly distinguished `isTerminal` from `isActive`. Only terminal rides set `no-store`, `Pragma: no-cache`, `X-Robots-Tag`. Scheduled rides receive standard headers. Test updated for `driver_lat/lng`. |
| **7. Shutdown Conflict Overwrite** | `SIGTERM` shutdown flusher inserted partial routes with `onConflictDoNothing()`, blocking completed trip writes. | Changed `flushAndEvictRoute` to use `.onConflictDoUpdate({ target: rideRoutes.ride_id, set: { points: ..., duration_seconds: ..., distance_meters: ... } })`. |
| **8. Omission of Cancellation Cache Eviction** | Cancelled rides leaked breadcrumbs in memory indefinitely and were flushed on shutdown. | Hooked `activeBreadcrumbs.delete(ride_id)` and `unregisterActiveTrip(ride_id)` into `req.url === "/internal/ride/cancelled"` in `utils-server/index.ts`. |
| **9. Driver App Scope & Parameter Typos** | `localRideIdParam` was undeclared in `finish-ride/index.tsx`. WhatsApp snippet referenced undefined variables. | Declared `const { ride_id: localRideIdParam } = useLocalSearchParams<{ ride_id?: string }>()`. Accessed driver object via `driver?.full_name`, `driver?.vehicle_type`, etc. |
| **10. Missing MapLibre JSX in `history-detail`** | Spec omitted JSX; coordinate order (`[lng, lat]` vs `{ lat, lng }`) and bounds camera were unspecified. | Provided complete MapLibre JSX with `useBarikoiMapStyle`, GeoJSON `LineString`, and camera bounds. |
| **11. Missing UUID Validation & Errors in `breadcrumbs+api.ts`** | Spec omitted route parameters `{ id }`, UUID validation, and `@/lib/errors` mapping. | Added `z.string().uuid()` validation and full error handling conforming to `details+api.ts`. |
| **12. Scheduler Promise Safety** | Job 61 rethrown non-timeout errors without a `catch` block, risking unhandled promise rejection. | Wrapped job execution in `try { ... } catch (e) { logger.error(...); } finally { routesPurgeRunning = false; }`. |

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
        MEM_CACHE["activeTripCache (driverId, corridor coords, status)"]
        BC_BUFFER["activeBreadcrumbs (In-memory ring buffer)"]
        INT_COORDS["GET /internal/ride/:id/live-coords (Secret protected)"]
        INT_COMPLETED["POST /internal/ride/completed (onConflictDoUpdate)"]
        INT_CANCELLED["POST /internal/ride/cancelled (Evict memory)"]
        SIGTERM_HANDLER["SIGTERM / SIGINT Flush (3s Timeout)"]
        SCHEDULE_PURGE["Job 61: 30-day Purge (Bounded Subquery)"]
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
        R_HIST["history-detail/index.tsx (MapLibre LineString Display)"]
    end

    D_BG --> D_GPS
    D_GPS --> D_WS
    D_GPS -.-> D_ASYNC
    
    D_WS --> WS_HANDLER
    WS_HANDLER --> MEM_CACHE
    MEM_CACHE --> BC_BUFFER
    
    INT_COORDS --> BC_BUFFER
    TRACK_API -->|Fetch live coords| INT_COORDS
    TRACK_API -.->|Poll every 10s: Live driver marker| RiderApp

    INT_COMPLETED -->|Flush completed route JSONB| DB_ROUTES
    INT_CANCELLED -->|Evict active memory| BC_BUFFER
    SIGTERM_HANDLER -->|Flush on shutdown| DB_ROUTES
    SCHEDULE_PURGE -->|Purge >30 days (hold if SOS/active dispute)| DB_ROUTES

    R_WA -.->|Shares URL| TRACK_API
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
Add `rideRoutes` to `src/db/schema.ts` (using existing Drizzle imports `uuid, jsonb, numeric, integer, index` already present at the top of the file):

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
import { useLocalSearchParams } from "expo-router";

// In component:
const { ride_id: localRideIdParam } = useLocalSearchParams<{ ride_id?: string }>();
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
To eliminate 200 QPS against the 5-connection PostgreSQL pool, `utils-server` maintains an in-memory cache of active trips including driver ownership and corridor coordinates:

```typescript
export interface ActiveTripInfo {
  driverId: string;
  status: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
}

const activeTripCache = new Map<string, ActiveTripInfo>();

export function registerActiveTrip(rideId: string, trip: ActiveTripInfo) {
  activeTripCache.set(rideId, trip);
}

export function unregisterActiveTrip(rideId: string) {
  activeTripCache.delete(rideId);
}
```

#### Startup Hydration (Reboot Recovery)
In `startup()` in `utils-server/index.ts`:
```typescript
// Hydrate active trips on server startup (reboot recovery)
const ongoingRides = await db
  .select({
    id: rides.id,
    driver_id: rides.driver_id,
    status: rides.status,
    origin_latitude: rides.origin_latitude,
    origin_longitude: rides.origin_longitude,
    destination_latitude: rides.destination_latitude,
    destination_longitude: rides.destination_longitude,
  })
  .from(rides)
  .where(inArray(rides.status, ["matched", "driver_arriving", "driver_arrived", "in_progress"]));

for (const r of ongoingRides) {
  if (r.driver_id) {
    registerActiveTrip(r.id, {
      driverId: r.driver_id,
      status: r.status,
      originLat: Number(r.origin_latitude) || 0,
      originLng: Number(r.origin_longitude) || 0,
      destLat: Number(r.destination_latitude) || 0,
      destLng: Number(r.destination_longitude) || 0,
    });
  }
}
```

#### Hot-Path `location:update` Handling
Replaces lines 1442–1444 and lines 1494–1503 in `utils-server/index.ts`:
```typescript
import { parsePointTs } from "./trace";

// 1. In-memory ownership & status check (Zero SQL)
let activeTrip = activeTripCache.get(locRideId);

// Lazy read-through DB check on cache miss (self-healing)
if (!activeTrip) {
  const [dbRide] = await db
    .select({
      driver_id: rides.driver_id,
      status: rides.status,
      origin_latitude: rides.origin_latitude,
      origin_longitude: rides.origin_longitude,
      destination_latitude: rides.destination_latitude,
      destination_longitude: rides.destination_longitude,
    })
    .from(rides)
    .where(eq(rides.id, locRideId))
    .limit(1);

  if (dbRide && dbRide.driver_id) {
    activeTrip = {
      driverId: dbRide.driver_id,
      status: dbRide.status,
      originLat: Number(dbRide.origin_latitude) || 0,
      originLng: Number(dbRide.origin_longitude) || 0,
      destLat: Number(dbRide.destination_latitude) || 0,
      destLng: Number(dbRide.destination_longitude) || 0,
    };
    registerActiveTrip(locRideId, activeTrip);
  }
}

// Security: Reject if not owned by this connected driver
if (!activeTrip || activeTrip.driverId !== client.driverId) {
  send(ws, { type: "error", message: "not_your_ride" });
  break;
}

// 2. Ingest telematics for in-progress rides
if (activeTrip.status === "in_progress") {
  const safeTs = parsePointTs(msg.ts);
  recordBreadcrumbPoint(locRideId, {
    lat: msg.lat as number,
    lng: msg.lng as number,
    ts: safeTs,
  });
}

// 3. Detect route deviation using cached corridor coordinates (Zero SQL)
detectRouteDeviation(
  locRideId,
  msg.lat as number,
  msg.lng as number,
  activeTrip.originLat,
  activeTrip.originLng,
  activeTrip.destLat,
  activeTrip.destLng,
).catch(() => {});
```

### 8.2 Ingestion Buffer & Trip Completion Flush (`utils-server/breadcrumbs.ts`)
```typescript
import { haversineKm } from "../lib/fareCalc";

export interface BreadcrumbPoint {
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

export function getLastPoint(rideId: string): BreadcrumbPoint | null {
  const list = activeBreadcrumbs.get(rideId);
  return list && list.length > 0 ? list[list.length - 1] : null;
}

export function evictActiveRoute(rideId: string) {
  activeBreadcrumbs.delete(rideId);
  unregisterActiveTrip(rideId);
}

export async function flushAndEvictRoute(rideId: string) {
  const points = activeBreadcrumbs.get(rideId);
  if (!points || points.length === 0) {
    evictActiveRoute(rideId);
    return;
  }

  const durationSec = Math.round((points[points.length - 1].ts - points[0].ts) / 1000);

  // Compute cumulative traversed distance for route dispute forensics
  let distanceMeters = 0;
  for (let i = 1; i < points.length; i++) {
    distanceMeters += haversineKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng) * 1000;
  }
  distanceMeters = Math.round(distanceMeters);

  // OnConflictDoUpdate: Ensures completed ride overwrites any partial SIGTERM checkpoint
  await db
    .insert(rideRoutes)
    .values({
      ride_id: rideId,
      points: points as any,
      duration_seconds: durationSec,
      distance_meters: distanceMeters.toString(),
    })
    .onConflictDoUpdate({
      target: rideRoutes.ride_id,
      set: {
        points: points as any,
        duration_seconds: durationSec,
        distance_meters: distanceMeters.toString(),
      },
    });

  // Safe eviction only after successful DB commit
  evictActiveRoute(rideId);
}

export async function flushAllActiveRoutes() {
  const rideIds = Array.from(activeBreadcrumbs.keys());
  for (const id of rideIds) {
    await flushAndEvictRoute(id);
  }
}
```

### 8.3 Internal HTTP Endpoints & Lifecycle Hooks in `utils-server/index.ts`
1. **Live Coordinates Query (`GET /internal/ride/:id/live-coords`):**
   ```typescript
   if (req.method === "GET" && req.url?.startsWith("/internal/ride/") && req.url.endsWith("/live-coords")) {
     const secret = req.headers["x-internal-secret"];
     if (secret !== process.env.WEBSOCKET_INTERNAL_SECRET) {
       res.writeHead(401).end(JSON.stringify({ error: "unauthorized" }));
       return;
     }
     const rideId = req.url.split("/")[3];
     const lastPt = getLastPoint(rideId);
     res.writeHead(200, { "Content-Type": "application/json" });
     res.end(JSON.stringify(lastPt ? { lat: lastPt.lat, lng: lastPt.lng, ts: lastPt.ts } : null));
     return;
   }
   ```
2. **Trip Completion Flush:** `POST /internal/ride/completed` calls `await flushAndEvictRoute(ride_id);`.
3. **Trip Cancellation Eviction:** `POST /internal/ride/cancelled` calls `evictActiveRoute(ride_id);`.
4. **SIGTERM / SIGINT Shutdown:**
   ```typescript
   process.on("SIGTERM", async () => {
     clearPendingDetections();
     try {
       await Promise.race([
         flushAllActiveRoutes(),
         new Promise((_, reject) => setTimeout(() => reject(new Error("Flush timeout")), 3000)),
       ]);
     } catch (err) {
       // Log to stderr; process terminates cleanly
     }
     process.exit(0);
   });
   ```

---

## 9. Real Live Driver Tracking on Public `/track/[id]`

### 9.1 Backend API (`app/api/ride/[id]/track+api.ts`)
```typescript
// app/api/ride/[id]/track+api.ts
const isTerminal = new Set(["completed", "cancelled", "expired", "no_drivers"]).has(ride.status);
const isActive = new Set(["driver_assigned", "driver_arrived", "in_progress"]).has(ride.status);

let driverLat: number | null = null;
let driverLng: number | null = null;

if (ride.driver_id && isActive) {
  // 1. Query utils-server for real-time in-memory telematics
  try {
    const wsInternalUrl = process.env.INTERNAL_WEBSOCKET_URL || "http://127.0.0.1:3001";
    const coordRes = await fetch(`${wsInternalUrl}/internal/ride/${ride.id}/live-coords`, {
      headers: { "x-internal-secret": process.env.WEBSOCKET_INTERNAL_SECRET || "" },
      signal: AbortSignal.timeout(500), // Fast 500ms fallback
    });
    if (coordRes.ok) {
      const livePt = await coordRes.json();
      if (livePt?.lat && livePt?.lng) {
        driverLat = Number(livePt.lat);
        driverLng = Number(livePt.lng);
      }
    }
  } catch {
    // Fallback to database coordinates if utils-server is unreachable
  }

  // 2. Fetch driver profile & fallback coordinates from PostgreSQL
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
    if (driverLat === null && drv.last_location_lat) driverLat = Number(drv.last_location_lat);
    if (driverLng === null && drv.last_location_lng) driverLng = Number(drv.last_location_lng);
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
} else if (isTerminal) {
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("X-Robots-Tag", "noindex, nofollow");
}
// Scheduled rides receive standard response without X-Robots-Tag (satisfies track.test.ts line 147)

return Response.json(body, { status: 200, headers });
```

### 9.2 Frontend Tracking Screen (`app/track/[rideId].tsx`)
Update `interface TrackData` to include:
```typescript
interface TrackData {
  status: string;
  driver_name: string | null;
  driver_rating: string | null;
  vehicle_type: string | null;
  driver_lat: number | null;
  driver_lng: number | null;
  origin_lat: string | null;
  origin_lng: string | null;
  destination_lat: string | null;
  destination_lng: string | null;
}
```
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
const handleShare = async () => {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL || "https://ride.com.bd";
  const shareUrl = `${baseUrl}/track/${ride_id}`;
  const dName = driver?.full_name ?? "Driver";
  const vType = driver?.vehicle_type ?? "vehicle";
  const plate = driver?.vehicle_plate ? `, Plate: ${driver.vehicle_plate}` : "";
  const message = `I am on a Ride trip with ${dName} (${vType}${plate}). Track my ride live: ${shareUrl}`;
  const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;

  try {
    const supported = await Linking.canOpenURL(whatsappUrl);
    if (supported) {
      await Linking.openURL(whatsappUrl);
    } else {
      // Native OS Share Sheet fallback
      await Share.share({ message });
    }
  } catch {
    await Share.share({ message });
  }
};
```

---

## 11. Authenticated In-App Route Display (History Screen)

### 11.1 Route Retrieval Endpoint (`app/api/ride/[id]/breadcrumbs+api.ts`)
Conforms strictly to the pattern established in `app/api/ride/[id]/details+api.ts`:

```typescript
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { rides, users, rideRoutes } from "@/src/db/schema";
import { verifySupabaseToken } from "@/lib/authMiddleware";
import { resolveRideParticipantIds, isParticipant } from "@/lib/rideGuard";
import { errors } from "@/lib/errors";

export async function GET(request: Request, { id }: { id: string }) {
  try {
    // 1. UUID Validation
    if (!z.string().uuid().safeParse(id).success) {
      return Response.json(
        { error: "invalid_uuid", message: "Invalid ride ID" },
        { status: 400 }
      );
    }
    const rideId = id;

    // 2. Authentication
    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);

    if (!user) {
      return Response.json({ error: "user_not_found" }, { status: 404 });
    }

    // 3. Ride Lookup
    const [ride] = await db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
    if (!ride) {
      return Response.json({ error: "ride_not_found" }, { status: 404 });
    }

    // 4. Authorization: Rider, Driver, or Admin
    const participantIds = await resolveRideParticipantIds(db, ride);
    if (!isParticipant(participantIds, user.id) && user.role !== "admin") {
      return Response.json(
        { error: "not_ride_participant", message: "You are not a participant in this ride" },
        { status: 403 }
      );
    }

    // 5. Fetch Route
    const [routeRecord] = await db
      .select({
        points: rideRoutes.points,
        duration: rideRoutes.duration_seconds,
        distance_meters: rideRoutes.distance_meters,
      })
      .from(rideRoutes)
      .where(eq(rideRoutes.ride_id, rideId))
      .limit(1);

    return Response.json({
      ride_id: rideId,
      points: routeRecord?.points ?? [],
      duration_seconds: routeRecord?.duration ?? 0,
      distance_meters: routeRecord?.distance_meters ? Number(routeRecord.distance_meters) : null,
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) {
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 }
      );
    }
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
```

### 11.2 Route Polyline Display (`history-detail/index.tsx`)
In `app/(main)/(customer)/(tabs)/history-detail/index.tsx`:

```tsx
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import MapLibreGL from "@/utils/maplibreLoader";
import { useBarikoiMapStyle } from "@/utils/mapUtils";

// Fetch points in component:
const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);

useEffect(() => {
  if (!id) return;
  fetch(`${API_URL}/api/ride/${id}/breadcrumbs`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.points && data.points.length > 1) {
        // Invert { lat, lng } to GeoJSON [lng, lat]
        setRouteCoords(data.points.map((p: { lat: number; lng: number }) => [p.lng, p.lat]));
      }
    })
    .catch(() => {});
}, [id]);

// Render Map:
{routeCoords.length > 1 && MapLibreGL && (
  <View style={{ height: 200, borderRadius: 12, overflow: "hidden", marginVertical: 12 }}>
    <MapLibreGL.MapView style={{ flex: 1 }} mapStyle={useBarikoiMapStyle()}>
      <MapLibreGL.Camera
        bounds={{
          ne: [Math.max(...routeCoords.map((c) => c[0])), Math.max(...routeCoords.map((c) => c[1]))],
          sw: [Math.min(...routeCoords.map((c) => c[0])), Math.min(...routeCoords.map((c) => c[1]))],
          paddingLeft: 24, paddingRight: 24, paddingTop: 24, paddingBottom: 24,
        }}
        animationDuration={0}
      />
      <MapLibreGL.ShapeSource
        id="historyRouteSource"
        shape={{
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: routeCoords,
          },
          properties: {},
        }}
      >
        <MapLibreGL.LineLayer
          id="historyRouteLine"
          style={{
            lineColor: colors.primary,
            lineWidth: 4,
            lineCap: "round",
            lineJoin: "round",
          }}
        />
      </MapLibreGL.ShapeSource>
    </MapLibreGL.MapView>
  </View>
)}
```

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
        WHERE ride_id IN (
          SELECT ride_id FROM ride_routes
          WHERE created_at < ${cutoff}
            AND NOT EXISTS (SELECT 1 FROM sos_alerts sa WHERE sa.ride_id = ride_routes.ride_id)
            AND NOT EXISTS (
              SELECT 1 FROM fare_disputes fd 
              WHERE fd.ride_id = ride_routes.ride_id 
                AND fd.status IN ('open', 'under_review', 'escalated')
            )
          LIMIT 1000
        )
      `);
    });
  } catch (e) {
    logger.error("[scheduler] job 61 route purge error", e);
  } finally {
    routesPurgeRunning = false;
  }
}, 86_400_000);
```

---

## 13. Phased Implementation Roadmap & Verification Gates

```
Phase 1: Driver App Telematics Hardening
  ├── app/(main)/(rider)/finish-ride/index.tsx: decouple geocode, add ts, 5s cadence, declare localRideIdParam
  ├── Add activeRideId persistence using useRideOfferStore + AsyncStorage
  ├── Add foreground service location permission to app.config.js
  └── Gate: npx jest tests/unit/finish-ride-telematics.test.ts && npm run lint

Phase 2: Database Migration 0088 & Drizzle Schema
  ├── Hand-written 0088 SQL creating ride_routes with RLS, FORCE RLS, REVOKE ALL
  ├── Drizzle schema additions in src/db/schema.ts (export rideRoutes using existing imports)
  └── Gate: npx jest tests/api/ride/routes-schema.test.ts (verifies RLS blocks anon/auth)

Phase 3: utils-server Telematics Ingestion & Flush Hooks
  ├── utils-server/breadcrumbs.ts (in-memory active queue, flushAndEvictRoute with onConflictDoUpdate)
  ├── Hook activeTripCache into utils-server/index.ts (ownership check, cached corridor coords, startup hydration)
  ├── Expose GET /internal/ride/:id/live-coords (x-internal-secret protected)
  ├── Hook /internal/ride/completed to persist compact route JSONB
  ├── Hook /internal/ride/cancelled to evict in-memory breadcrumbs
  ├── Add SIGTERM / SIGINT graceful flush with 3s timeout
  ├── Register Job 61 in scheduler.ts with bounded subquery and safety hold on active disputes & sos_alerts
  └── Gate: npx jest tests/utils-server/breadcrumbs.test.ts

Phase 4: Live Driver Tracking on Public URL & WhatsApp Share
  ├── app/api/ride/[id]/track+api.ts fetches live coords from utils-server with fallback to drivers table
  ├── Headers differentiate isActive (max-age=3) from isTerminal (no-store, Pragma: no-cache, X-Robots-Tag)
  ├── Update tests/api/ride/track.test.ts fixture & assertions to cover driver_lat and driver_lng
  ├── app/track/[rideId].tsx renders moving car marker updating every 10s via MapLibreGL
  ├── app/(main)/(customer)/ride-tracking/[ride_id].tsx: 1-tap WhatsApp share button
  └── Gate: npx jest tests/api/ride/track.test.ts (verifying active coords & terminal P1-17)

Phase 5: Authenticated In-App Route Display
  ├── GET /api/ride/[id]/breadcrumbs with z.uuid() validation and resolveRideParticipantIds guard
  ├── Customer history-detail/index.tsx renders route polyline on MapLibre map with bounding camera
  └── Gate: npx jest tests/api/ride/breadcrumbs.test.ts (IDOR tests: stranger 403, rider 200)
```

---

## 14. Rollback & Failure Recovery Procedures

### Database Down-Migration SQL
```sql
DROP TABLE IF EXISTS "ride_routes" CASCADE;
```

### Buffer Overflow Fail-Safe
If in-memory telemetry points exceed 1,000 for a single trip (~83 minutes at 5s sampling), new points are safely discarded to protect process memory.

### Fallback for WhatsApp Deep-Link
If WhatsApp is not installed on the passenger's device, `Linking.canOpenURL("whatsapp://...")` returns false, and the app automatically invokes `Share.share(...)`, opening the standard Android/iOS system share sheet.
