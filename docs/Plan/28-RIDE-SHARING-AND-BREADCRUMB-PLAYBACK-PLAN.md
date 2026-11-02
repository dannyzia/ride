# Plan 28 (v3.2) — Live Ride Sharing & Route Telematics Engine

> **Document Status:** GOLDFISH RESOLVED SPEC (v3.2 — 2026-11-02)  
> **Replaces:** Plan 28 v1.0, v2.0, v2.1, v2.2, v2.3, v3.0, and v3.1  
> **Audited By Swarm:** `egm-design`, `egm-codebase-details`, `egm-implementation-readiness`, `egm-zoom-out`  
> **Audited Against:** `utils-server/index.ts`, `utils-server/trace.ts`, `utils-server/scheduler.ts`, `app/api/ride/[id]/{track,details,cancel,complete}+api.ts`, `app/(main)/(rider)/finish-ride/index.tsx`, `app/(main)/(customer)/(tabs)/history-detail/index.tsx`, `app/(main)/(customer)/ride-tracking/[ride_id].tsx`, `app/track/[rideId].tsx`, `src/db/schema.ts`, `tests/api/ride/track.test.ts`.

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
* **Dedicated Mobile-Web Live Status & Safety Card:** Public `/track/[rideId]` web screen renders a clean, high-utility status card accessible on any mobile browser (Chrome/Safari) showing driver identity, vehicle plate, pickup/destination, trip status pill, live GPS signal freshness ("Updated 4s ago"), and an emergency 1-tap 999 police button.
* **P1-17 Invariant Strictly Preserved:** Terminal rides (completed, cancelled, expired, no_drivers) strictly degrade to a status-only state with coordinates and driver details completely nulled, preventing eternal tracking of residential locations.
* **Edge Caching Protection:** Public tracking endpoints are shielded by HTTP edge caching headers (`Cache-Control: public, max-age=3, s-maxage=3, stale-while-revalidate=5`) to coalesce concurrent viewers at CDN/proxy edges to ~0.3 QPS, eliminating database connection pool exhaustion from viral share links.
* **Zero-DB Hot-Path Telematics:** Driver GPS updates emitted every 5s over WebSocket are validated and buffered purely in-memory in `utils-server` with zero relational database lookups on the hot path. Corridor coordinates are cached to eliminate SQL queries in route deviation detection.
* **Compact Single-Record Route Storage:** Completed trip breadcrumbs are persisted upon trip completion as a single record in `ride_routes` (`points JSONB`), reducing database row churn by 99.7% compared to individual point rows.
* **Foreground-Only Driver GPS Capture:** Driver app telematics runs as a foreground loop with `Location.Accuracy.High` (5–10m resolution) while the trip screen is mounted on the vehicle dashboard.
* **In-App Route Display:** Authenticated riders and drivers can review the exact route polyline driven on the customer history detail screen (`history-detail/index.tsx`) via MapLibreGL.

### Out-of-Scope Non-Goals
* **Native Map on Public Web Track:** Rejected because `@maplibre/maplibre-react-native` stubs to `null` on web builds (`utils/maplibreLoader.web.ts`). Scoped to a responsive Live Status Card.
* **Headless Background GPS Service via `expo-task-manager`:** Rejected to keep native runtime lean. Telematics capture is explicitly scoped to foreground operation during active trips.
* **Automated Match-Time SMS for Routine Rides:** Rejected due to 30,000–50,000 BDT monthly telecom deficit.
* **Post-Trip Email Documentation (Receipts & Invoices):** Decoupled to a dedicated transactional receipt plan per YAGNI and architectural separation of concerns (avoids mixing transactional email/SMTP queues into the real-time telematics engine; see `concepts_brief.md` Pillar 2).
* **Server-Side WhatsApp Business API:** Rejected due to Meta per-template conversation fees (~$0.03/msg).
* **Emergency Contact OTP Verification:** Emergency contacts are registered directly by the rider without forced SMS OTP verification friction.
* **GPX 1.1 Desktop GIS Export:** Dropped per YAGNI analysis.

---

## 3. Alternatives Considered & Architecture Trade-offs

| Architectural Decision | Chosen Strategy | Alternative Rejected | Rationale for Rejection |
|---|---|---|---|
| **Public Tracking Presentation** | Mobile-Web Live Status & Safety Card with GPS Freshness | Web Map Canvas (Leaflet / MapLibre Web JS) | Native MapLibre stubs to `null` on web (`utils/maplibreLoader.web.ts`). Adding a separate web-only mapping bundle adds ~400KB of JS dependencies for users opening a quick link from WhatsApp. A status card with signal freshness and 999 calling delivers 100% of the reassurance with zero bundle bloat. |
| **Driver Telematics Scope** | High-Accuracy Foreground Loop (`Location.Accuracy.High`) | Headless Background Service (`expo-task-manager`) | Adding `expo-task-manager` requires a native rebuild, introduces background thread battery drain, and isolates GPS collection from the active WebSocket session. Bangladeshi drivers keep their phone mounted on the dashboard with the active trip screen in foreground. |
| **Routine Ride Sharing Channel** | Client-Side 1-Tap WhatsApp (`whatsapp://send`) | Automated Server-Side SMS on Match | Sending 2 SMS per matched trip at ~0.35 BDT/SMS creates a severe operational deficit on a 0% commission platform. WhatsApp has near 100% smartphone penetration in Bangladesh and incurs 0 BDT in gateway fees. |
| **Route Breadcrumb Storage** | Compact Single-Record JSONB (`ride_routes`) | Normalized Relational Rows (`ride_breadcrumbs`) | Normalized storage generates ~240,000 rows/day (~10.8M rows/month) at 5s sampling, creating massive autovacuum churn, B-tree index bloat, and pool starvation on the 5-connection PostgreSQL pool. Storing points as a JSONB array reduces row count to ~1,000/day. |
| **Telematics Ownership Validation** | In-Memory Active Cache in `utils-server` | Relational SQL Query on Every 5s Tick | Querying `SELECT driver_id, status FROM rides` on every 5s WebSocket frame generates 200 QPS against a 5-connection pool (`APP_POOL_SIZE = 5`), causing connection starvation and API timeouts. |
| **Live Coords Sourcing** | Internal `utils-server` RPC (`/internal/ride/:id/live-coords`) | PostgreSQL `drivers.last_location_*` | To preserve zero-DB hot-path performance, driver coordinates are not written to Postgres on every tick. Exposing an internal endpoint from `utils-server` memory delivers real-time car motion without database write churn. |

---

## 4. Architectural Invariants & Ship-Stoppers Ledger

| Issue Identified in Review | Root Cause | Forensic Resolution in v3.2 |
|---|---|---|
| **1. Public Web Map Broken on Web** | `maplibreLoader.web.ts` exports `null`, causing `/track` on web browsers to render a gray box with text `"Map View"`. | Rescoped `app/track/[rideId].tsx` to a dedicated **Live Status & Safety Card** featuring driver identity, vehicle plate, live status pill, GPS signal freshness indicator, and a 1-tap 999 emergency call button. |
| **2. Stale GPS Telemetry & Blindness** | Without a freshness timestamp, a stalled driver GPS signal would appear live or freeze without user feedback. | Backend API `/api/ride/[id]/track` returns `driver_location_updated_at` (epoch ms) and `driver_location_age_seconds`. UI displays real-time signal status ("Live Signal: Updated 4s ago" vs "Signal Delayed"). |
| **3. Driver GPS Background Fallacy & Accuracy Drop** | `watchPositionAsync` does not run in background; setting `accuracy: Balanced` dropped precision to ~100m, degrading route deviation detection. | Explicitly scoped telematics as **foreground-only** (dashboard phone mount). Restored `accuracy: Location.Accuracy.High` (5–10m resolution) for crisp corridor deviation detection. |
| **4. CI Scratch DB Role Error in Migration 0088** | Plain `postgres:16` containers in CI do not have `anon` or `authenticated` roles, failing bare `REVOKE`. | Migration `0088` wraps revocation in `DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ... END IF; END $$;`. |
| **5. Invalid PostgreSQL `LIMIT` on `DELETE`** | PostgreSQL does not support `LIMIT` directly on `DELETE` statements (throws syntax error). | Job 61 rewritten to use bounded subquery idiom: `WHERE ride_id IN (SELECT ride_id FROM ride_routes WHERE created_at < ${cutoff} ... LIMIT 1000)`. |
| **6. Active Dispute Hold Overbreadth** | Bare `NOT EXISTS (SELECT 1 FROM fare_disputes)` locked routes forever even after dispute resolution. | Restricted hold to active dispute statuses: `WHERE fd.status IN ('open', 'under_review', 'escalated')`. |
| **7. Hot-Path DB Query Starvation & Route Deviation Leak** | `location:update` checked driver ownership and corridor coordinates against Postgres on every 5s ping. | Cached `{ driverId, status, originLat, originLng, destLat, destLng }` in `activeTripCache`. Verified `activeTrip.driverId === client.driverId` in memory and passed cached coordinates to `detectRouteDeviation`. Zero SQL on hot path. |
| **8. Server Restart Cache Amnesia** | `activeTripCache` started empty on process restart, dropping telematics for in-flight trips. | Added `startup()` hydration query in `utils-server/index.ts` for ongoing trips (`matched`, `driver_arriving`, `driver_arrived`, `in_progress`), plus self-healing read-through DB check on cache miss. |
| **9. Header Logic & `track.test.ts` Drift** | Setting `X-Robots-Tag` on `!isActive` broke test assertion for scheduled rides (line 147). Omitted `Pragma: no-cache` (line 117). Exact `toEqual` broke on `driver_lat/lng`. | Explicitly distinguished `isTerminal` from `isActive`. Only terminal rides set `no-store`, `Pragma: no-cache`, `X-Robots-Tag`. Scheduled rides receive standard headers. Test updated for `driver_lat/lng` and freshness fields. |
| **10. Shutdown Conflict Overwrite** | `SIGTERM` shutdown flusher inserted partial routes with `onConflictDoNothing()`, blocking completed trip writes. | Changed `flushAndEvictRoute` to use `.onConflictDoUpdate({ target: rideRoutes.ride_id, set: { points: ..., duration_seconds: ..., distance_meters: ... } })`. |
| **11. Omission of Cancellation Cache Eviction** | Cancelled rides leaked breadcrumbs in memory indefinitely and were flushed on shutdown. | Hooked `activeBreadcrumbs.delete(ride_id)` and `unregisterActiveTrip(ride_id)` into `req.url === "/internal/ride/cancelled"` in `utils-server/index.ts`. |
| **12. Missing MapLibre JSX in `history-detail`** | Spec omitted JSX; coordinate order (`[lng, lat]` vs `{ lat, lng }`) and bounds camera were unspecified. | Provided complete MapLibre JSX with `useBarikoiMapStyle`, GeoJSON `LineString`, and camera bounds. |

---

## 5. System Architecture & Lifecycle Flow

```mermaid
flowchart TD
    subgraph DriverApp["Driver App (finish-ride/index.tsx)"]
        D_GPS["WatchPosition (High Accuracy, 5s tick, 2m interval)"]
        D_FG["Foreground Dashboard Mount (Screen Active During Trip)"]
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

    subgraph RiderApp["Rider App / Mobile Web"]
        R_WA["1-Tap WhatsApp Share (whatsapp://send?text=...)"]
        R_WEB["Public /track/[rideId] (Live Status & Safety Card)"]
        R_HIST["history-detail/index.tsx (MapLibre LineString Display)"]
    end

    D_FG --> D_GPS
    D_GPS --> D_WS
    D_GPS -.-> D_ASYNC
    
    D_WS --> WS_HANDLER
    WS_HANDLER --> MEM_CACHE
    MEM_CACHE --> BC_BUFFER
    
    INT_COORDS --> BC_BUFFER
    TRACK_API -->|Fetch live coords + age| INT_COORDS
    TRACK_API -.->|Poll every 10s: Freshness & status| R_WEB

    INT_COMPLETED -->|Flush completed route JSONB| DB_ROUTES
    INT_CANCELLED -->|Evict active memory| BC_BUFFER
    SIGTERM_HANDLER -->|Flush on shutdown| DB_ROUTES
    SCHEDULE_PURGE -->|Purge >30 days (hold if SOS/active dispute)| DB_ROUTES

    R_WA -.->|Shares URL| R_WEB
    R_HIST --> AUTH_BC
    AUTH_BC --> DB_ROUTES
```

---

## 6. Database Schema & Migration (`0088`)

### 6.1 Migration File: `src/db/migrations/0088_ride_routes_and_telematics.sql`
Adheres strictly to the `--> statement-breakpoint` convention with **RLS ENABLED, FORCED, and DEFENSIVELY REVOKED**:

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

-- Standard security posture: ENABLE + FORCE RLS
ALTER TABLE "ride_routes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

ALTER TABLE "ride_routes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Defensive revocation: succeeds in Supabase prod/staging AND plain CI postgres:16
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "ride_routes" FROM anon, authenticated;
  END IF;
END $$;
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

### 7.1 Decoupled, High-Accuracy Telematics Loop
In `finish-ride/index.tsx`, the telematics loop operates strictly in the foreground while the active trip is on screen. Accuracy is maintained at `Location.Accuracy.High` (5–10m resolution) to ensure sharp corridor deviation detection.

```typescript
import { useLocalSearchParams } from "expo-router";

// In component:
const { ride_id: localRideIdParam } = useLocalSearchParams<{ ride_id?: string }>();
const currentRideId = useRideOfferStore.getState().activeRideId || localRideIdParam;

locationSubscription = await Location.watchPositionAsync(
  {
    accuracy: Location.Accuracy.High, // High accuracy (5-10m) for crisp deviation checks
    timeInterval: 5000,               // 5-second sampling cadence
    distanceInterval: 2,              // 2-meter movement filter
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

---

## 8. utils-server Telematics Ingestion & Zero-DB Hot Path

### 8.1 In-Memory Active Cache in `utils-server/index.ts`
`utils-server` maintains an in-memory cache of active trips including driver ownership and corridor coordinates:

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

### 8.3 Internal HTTP Endpoints in `utils-server/index.ts`
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

---

## 9. Real Live Public Tracking & Safety Screen

### 9.1 Backend API (`app/api/ride/[id]/track+api.ts`)
```typescript
// app/api/ride/[id]/track+api.ts
const isTerminal = new Set(["completed", "cancelled", "expired", "no_drivers"]).has(ride.status);
const isActive = new Set(["driver_assigned", "driver_arrived", "in_progress"]).has(ride.status);

let driverLat: number | null = null;
let driverLng: number | null = null;
let locationUpdatedAt: number | null = null;
let locationAgeSeconds: number | null = null;

if (ride.driver_id && isActive) {
  // 1. Query utils-server for real-time in-memory telematics
  try {
    const wsInternalUrl = process.env.INTERNAL_WEBSOCKET_URL || "http://127.0.0.1:3001";
    const coordRes = await fetch(`${wsInternalUrl}/internal/ride/${ride.id}/live-coords`, {
      headers: { "x-internal-secret": process.env.WEBSOCKET_INTERNAL_SECRET || "" },
      signal: AbortSignal.timeout(500),
    });
    if (coordRes.ok) {
      const livePt = await coordRes.json();
      if (livePt?.lat && livePt?.lng) {
        driverLat = Number(livePt.lat);
        driverLng = Number(livePt.lng);
        locationUpdatedAt = Number(livePt.ts);
        locationAgeSeconds = Math.max(0, Math.round((Date.now() - locationUpdatedAt) / 1000));
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
  driver_location_updated_at: isActive ? locationUpdatedAt : null,
  driver_location_age_seconds: isActive ? locationAgeSeconds : null,
  origin_lat: isActive ? ride.origin_latitude : null,
  origin_lng: isActive ? ride.origin_longitude : null,
  origin_address: isActive ? ride.origin_address : null,
  destination_lat: isActive ? ride.destination_latitude : null,
  destination_lng: isActive ? ride.destination_longitude : null,
  destination_address: isActive ? ride.destination_address : null,
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

return Response.json(body, { status: 200, headers });
```

### 9.2 Frontend Live Status & Safety Card (`app/track/[rideId].tsx`)
Replaces the broken web MapLibre stub with a responsive, high-reassurance **Live Status & Safety Card**:

```tsx
import { useState, useEffect, useRef } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity, StatusBar, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { API_URL } from "@/lib/config";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  matched: { label: "Driver on the way", color: colors.primary, icon: "car" },
  driver_arriving: { label: "Driver arriving", color: colors.primary, icon: "car-sport" },
  driver_arrived: { label: "Driver arrived at pickup", color: colors.amber, icon: "location" },
  in_progress: { label: "Trip in progress", color: colors.goSuccess, icon: "navigate" },
  completed: { label: "Trip completed", color: colors.gray500, icon: "checkmark-circle" },
  cancelled: { label: "Trip cancelled", color: colors.goDanger, icon: "close-circle" },
};

export default function PublicTrackPage() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const isDark = useIsDark();
  const { setTheme } = useAppearance();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  useEffect(() => {
    if (!rideId) return;
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_URL}/api/ride/${rideId}/track`);
        if (res.ok) setData(await res.json());
        else setError("Ride not found or expired");
      } catch {
        setError("Connecting to live tracking...");
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 10_000);
    return () => clearInterval(interval);
  }, [rideId]);

  const cfg = STATUS_CONFIG[data?.status] ?? { label: data?.status ?? "Active", color: colors.primary, icon: "radio" };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <View className="p-4 border-b flex-row justify-between items-center" style={{ borderColor }}>
        <Text className="text-xl font-JakartaBold" style={{ color: textPrimary }}>Ride Live Safety Status</Text>
        <TouchableOpacity onPress={() => setTheme(isDark ? "light" : "dark")}>
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
        </TouchableOpacity>
      </View>

      {data && (
        <View className="p-6 flex-1 justify-between">
          <View>
            {/* Status Badge */}
            <View className="flex-row items-center p-3 rounded-xl mb-4" style={{ backgroundColor: cfg.color + "1A" }}>
              <Ionicons name={cfg.icon} size={24} color={cfg.color} />
              <Text className="ml-3 font-JakartaBold text-lg" style={{ color: cfg.color }}>{cfg.label}</Text>
            </View>

            {/* Signal Freshness Indicator */}
            {data.driver_location_age_seconds != null && (
              <View className="flex-row items-center mb-6">
                <View className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: data.driver_location_age_seconds <= 15 ? colors.goSuccess : colors.amber }} />
                <Text className="text-xs font-Jakarta" style={{ color: textSecondary }}>
                  {data.driver_location_age_seconds <= 15
                    ? `Live GPS Signal (Updated ${data.driver_location_age_seconds}s ago)`
                    : `Signal Delayed (${data.driver_location_age_seconds}s ago)`}
                </Text>
              </View>
            )}

            {/* Driver & Vehicle Details */}
            {data.driver_name && (
              <View className="p-4 rounded-xl mb-4 border" style={{ backgroundColor: surfaceBg, borderColor }}>
                <Text className="text-xs uppercase font-JakartaBold mb-1" style={{ color: textSecondary }}>Driver & Vehicle</Text>
                <Text className="text-lg font-JakartaBold" style={{ color: textPrimary }}>{data.driver_name}</Text>
                <Text className="text-sm font-Jakarta" style={{ color: textSecondary }}>
                  {data.vehicle_type} {data.driver_rating ? `• ★ ${parseFloat(data.driver_rating).toFixed(1)}` : ""}
                </Text>
              </View>
            )}

            {/* Route Details */}
            <View className="p-4 rounded-xl border" style={{ backgroundColor: surfaceBg, borderColor }}>
              <Text className="text-xs uppercase font-JakartaBold mb-2" style={{ color: textSecondary }}>Journey</Text>
              {data.origin_address && <Text className="text-sm font-Jakarta mb-2" style={{ color: textPrimary }}>📍 {data.origin_address}</Text>}
              {data.destination_address && <Text className="text-sm font-Jakarta" style={{ color: textPrimary }}>🏁 {data.destination_address}</Text>}
            </View>
          </View>

          {/* Emergency 999 Police Dialer */}
          <TouchableOpacity
            onPress={() => Linking.openURL("tel:999")}
            className="p-4 rounded-xl flex-row justify-center items-center"
            style={{ backgroundColor: colors.goDanger }}
          >
            <Ionicons name="call" size={20} color="#fff" />
            <Text className="text-white font-JakartaBold text-base ml-2">Call 999 Police (Emergency)</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
```

---

## 10. Client-Side 1-Tap WhatsApp Ride Sharing

In `app/(main)/(customer)/ride-tracking/[ride_id].tsx`:
```tsx
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
    if (!z.string().uuid().safeParse(id).success) {
      return Response.json({ error: "invalid_uuid", message: "Invalid ride ID" }, { status: 400 });
    }
    const rideId = id;
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id, role: users.role })
      .from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: "user_not_found" }, { status: 404 });

    const [ride] = await db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
    if (!ride) return Response.json({ error: "ride_not_found" }, { status: 404 });

    const participantIds = await resolveRideParticipantIds(db, ride);
    if (!isParticipant(participantIds, user.id) && user.role !== "admin") {
      return Response.json({ error: "not_ride_participant", message: "You are not a participant in this ride" }, { status: 403 });
    }

    const [routeRecord] = await db.select({
      points: rideRoutes.points,
      duration: rideRoutes.duration_seconds,
      distance_meters: rideRoutes.distance_meters,
    }).from(rideRoutes).where(eq(rideRoutes.ride_id, rideId)).limit(1);

    return Response.json({
      ride_id: rideId,
      points: routeRecord?.points ?? [],
      duration_seconds: routeRecord?.duration ?? 0,
      distance_meters: routeRecord?.distance_meters ? Number(routeRecord.distance_meters) : null,
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) {
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    }
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
```

### 11.2 Route Polyline Display (`history-detail/index.tsx`)
```tsx
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import MapLibreGL from "@/utils/maplibreLoader";
import { useBarikoiMapStyle } from "@/utils/mapUtils";

const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);

useEffect(() => {
  if (!id) return;
  fetch(`${API_URL}/api/ride/${id}/breadcrumbs`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.points && data.points.length > 1) {
        setRouteCoords(data.points.map((p: { lat: number; lng: number }) => [p.lng, p.lat]));
      }
    })
    .catch(() => {});
}, [id]);

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
          geometry: { type: "LineString", coordinates: routeCoords },
          properties: {},
        }}
      >
        <MapLibreGL.LineLayer
          id="historyRouteLine"
          style={{ lineColor: colors.primary, lineWidth: 4, lineCap: "round", lineJoin: "round" }}
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
let routesPurgeRunning = false;

registerJob(async () => {
  if (routesPurgeRunning) return;
  routesPurgeRunning = true;
  try {
    await withJobBudget(61, 10_000, async (tx) => {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

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
  ├── app/(main)/(rider)/finish-ride/index.tsx: decouple geocode, add ts, 5s cadence, Location.Accuracy.High
  ├── Add activeRideId persistence using useRideOfferStore + localRideIdParam
  └── Gate: npx jest tests/unit/finish-ride-telematics.test.ts && npm run lint

Phase 2: Database Migration 0088 & Drizzle Schema
  ├── Defensive 0088 SQL with DO $$ BEGIN IF EXISTS ... REVOKE ... END $$;
  ├── Drizzle schema additions in src/db/schema.ts (export rideRoutes)
  └── Gate: npx jest tests/api/ride/routes-schema.test.ts

Phase 3: utils-server Telematics Ingestion & Flush Hooks
  ├── utils-server/breadcrumbs.ts (in-memory active queue, flushAndEvictRoute with onConflictDoUpdate)
  ├── Hook activeTripCache into utils-server/index.ts (ownership check, cached corridor coords, startup hydration)
  ├── Expose GET /internal/ride/:id/live-coords (x-internal-secret protected)
  ├── Hook /internal/ride/completed to persist compact route JSONB
  ├── Hook /internal/ride/cancelled to evict in-memory breadcrumbs
  ├── Register Job 61 in scheduler.ts with bounded subquery and safety hold
  └── Gate: npx jest tests/utils-server/breadcrumbs.test.ts

Phase 4: Live Mobile-Web Status Card & WhatsApp Share
  ├── app/api/ride/[id]/track+api.ts returns driver_lat/lng and location freshness timestamps
  ├── app/track/[rideId].tsx: clean Live Status & Safety Card with signal freshness and 1-tap 999 button
  ├── Update tests/api/ride/track.test.ts assertions to cover freshness fields
  ├── app/(main)/(customer)/ride-tracking/[ride_id].tsx: 1-tap WhatsApp share button
  └── Gate: npx jest tests/api/ride/track.test.ts

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
