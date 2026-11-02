# Plan 28 (v3.3) — Live Ride Sharing & Route Telematics Engine

> **Document Status:** GOLDFISH RESOLVED SPEC (v3.3 — 2026-11-02)  
> **Replaces:** Plan 28 v1.0, v2.0, v2.1, v2.2, v2.3, v3.0, v3.1, and v3.2  
> **Audited By Swarm & Codebase Review:** `egm-design`, `egm-codebase-details`, `egm-implementation-readiness`, `egm-zoom-out`  
> **Audited Against (Live Disk):** `utils-server/index.ts`, `utils-server/trace.ts`, `utils-server/scheduler.ts`, `utils-server/activeTrips.ts`, `utils-server/breadcrumbs.ts`, `app/api/ride/[id]/{track,details,cancel,complete,start}+api.ts`, `app/(main)/(rider)/finish-ride/index.tsx`, `app/(main)/(customer)/(tabs)/history-detail/index.tsx`, `app/(main)/(customer)/ride-tracking/[ride_id].tsx`, `app/track/[rideId].tsx`, `src/db/schema.ts`, `lib/auth.ts`, `lib/rideParticipants.ts`, `tests/api/ride/track.test.ts`.

---

## 1. Problem Statement & Business Motivation

When passengers use Ride in Bangladesh, two distinct safety and audit needs arise:
1. **Real-Time Passenger Reassurance:** Riders commuting alone or at night want family members to see their trip progress live. Relying on manual text updates is error-prone and distracting while moving.
2. **Statutory Compliance & Post-Trip Forensics:** Local transportation regulations mandate a direct emergency call mechanism (999) on mobile apps. Furthermore, fare disputes (e.g. `'route_longer'`) and emergency incident reviews require an authoritative physical GPS record of the completed journey.

**The Economic & Architecture Invariant:** Ride is a lead-generation platform operating on flat driver subscription packages with 0% ride commission and zero escrow. The platform cannot absorb recurring third-party telecom costs (such as sending automated SMS on every routine trip match). Consequently, routine trip sharing leverages free, user-initiated channels (WhatsApp and native OS share sheets), while platform-funded SMS is reserved exclusively for statutory emergency distress (SOS) events and the existing night-ride safety protocol (`checkNightRideProtocol` in `lib/safety.ts`).

---

## 2. Goals vs. Non-Goals

### In-Scope Goals
* **1-Tap WhatsApp Ride Share:** A single tap on the active tracking screen invokes `whatsapp://send?text=...` with automatic fallback to native OS share sheet (`Share.share`), sharing a public tracking link (`/track/[rideId]`) at zero gateway cost.
* **Dedicated Mobile-Web Live Status & Safety Card:** Public `/track/[rideId]` web screen renders a clean, high-utility status card accessible on any mobile browser (Chrome/Safari) showing driver identity, vehicle plate, trip status pill, live GPS signal freshness ("Updated 4s ago"), and an emergency 1-tap 999 police button.
* **P1-17 Invariant Strictly Preserved:** Terminal rides (completed, cancelled, expired, no_drivers) strictly degrade to a status-only state with coordinates and driver details completely nulled, preventing eternal tracking of residential locations.
* **Zero-DB Hot-Path Telematics:** Driver GPS updates emitted every 5s over WebSocket are validated and buffered purely in-memory in `utils-server` with zero relational database lookups on the hot path. Corridor coordinates are cached to eliminate SQL queries in route deviation detection.
* **Lifecycle Cache Synchronization:** Active trip cache is updated on all state transitions (`POST /internal/ride/started`, `WS ride:start`, `POST /internal/ride/driver-arrived`, `POST /internal/ride/completed`, `POST /internal/ride/cancelled`).
* **Decimated Buffer & Crash-Safe JSONB Concatenation:** Telematics buffer decimates at 1,000 points to absorb 160+ minute Dhaka trips without dropping recent coordinates. Restarts append via PostgreSQL JSONB concatenation (`COALESCE(points, '[]') || new_points`).
* **Foreground-Only Driver GPS Capture:** Driver app telematics runs as a foreground loop with `Location.Accuracy.High` (5–10m resolution) while the trip screen is mounted on the vehicle dashboard.
* **In-App Route Display:** Authenticated riders and drivers can review the exact route polyline driven on the customer history detail screen (`history-detail/index.tsx`) via MapLibreGL.

### Out-of-Scope Non-Goals
* **Native Map on Public Web Track:** Rejected because `@maplibre/maplibre-react-native` stubs to `null` on web builds (`utils/maplibreLoader.web.ts`). Scoped to a responsive Live Status Card.
* **Headless Background GPS Service via `expo-task-manager`:** Rejected to keep native runtime lean. Telematics capture is explicitly scoped to foreground operation during active trips.
* **Automated Match-Time SMS for Routine Rides:** Rejected due to 30,000–50,000 BDT monthly telecom deficit.
* **Post-Trip Email Documentation (Receipts & Invoices):** Decoupled to a dedicated transactional receipt plan per YAGNI and architectural separation of concerns (avoids mixing transactional email/SMTP queues into the real-time telematics engine; see `concepts_brief.md` Pillar 2).
* **GPX 1.1 Desktop GIS Export:** Dropped per YAGNI analysis.

---

## 3. Alternatives Considered & Architecture Trade-offs

| Architectural Decision | Chosen Strategy | Alternative Rejected | Rationale for Rejection |
|---|---|---|---|
| **Public Tracking Presentation** | Mobile-Web Live Status & Safety Card with GPS Freshness | Web Map Canvas (Leaflet / MapLibre Web JS) | Native MapLibre stubs to `null` on web (`utils/maplibreLoader.web.ts`). Adding a separate web-only mapping bundle adds ~400KB of JS dependencies for users opening a quick link from WhatsApp. A status card with signal freshness and 999 calling delivers 100% of the reassurance with zero bundle bloat. |
| **Driver Telematics Scope** | High-Accuracy Foreground Loop (`Location.Accuracy.High`) | Headless Background Service (`expo-task-manager`) | Adding `expo-task-manager` requires a native rebuild, introduces background thread battery drain, and isolates GPS collection from the active WebSocket session. Bangladeshi drivers keep their phone mounted on the dashboard with the active trip screen in foreground. |
| **Buffer Overflow Protection** | Decimate Buffer by 2x at 1,000 Points | Drop-Newest Points (`if len < 1000`) | Dropping newest points freezes the live car marker and destination arrival during long trips (>83 min in Dhaka traffic), falsely triggering "Signal Delayed". Decimating retains the full journey while staying within memory budgets. |
| **Data Recovery Across Restarts** | PostgreSQL JSONB Concatenation (`points || new_points`) | Overwrite Entire Array (`onConflictDoUpdate`) | If a server restarts mid-trip and writes a partial route on SIGTERM, overwriting points upon trip completion discards the first half of the journey. Concatenation safely stitches segments together. |
| **Routine Ride Sharing Channel** | Client-Side 1-Tap WhatsApp (`whatsapp://send`) | Automated Server-Side SMS on Match | Sending 2 SMS per matched trip at ~0.35 BDT/SMS creates a severe operational deficit on a 0% commission platform. WhatsApp has near 100% smartphone penetration in Bangladesh and incurs 0 BDT in gateway fees. |
| **Route Breadcrumb Storage** | Compact Single-Record JSONB (`ride_routes`) | Normalized Relational Rows (`ride_breadcrumbs`) | Normalized storage generates ~240,000 rows/day (~10.8M rows/month) at 5s sampling, creating massive autovacuum churn, B-tree index bloat, and pool starvation on the 5-connection PostgreSQL pool. Storing points as a JSONB array reduces row count to ~1,000/day. |

---

## 4. Architectural Invariants & Ship-Stoppers Ledger (v3.3)

| Issue Identified in Audit | Root Cause | Forensic Resolution in v3.3 |
|---|---|---|
| **1. `isActive` Status Set Drift** | §9.1 listed non-existent status `driver_assigned`, omitting `matched` and `driver_arriving`. Broke dispatching tests in `track.test.ts`. | Corrected to exact `rideStatusEnum` members: `ACTIVE_STATUSES = new Set(['matched', 'driver_arriving', 'driver_arrived', 'in_progress'])`. For `dispatching`, return coords with null driver fields. |
| **2. Breadcrumbs Ingestion Gate Never Opened** | Cache was initialized on match; nothing updated status to `in_progress` on ride start. `location:update` checked `status === "in_progress"`, discarding all points. | Wired `updateActiveTripStatus(ride_id, "in_progress")` into `POST /internal/ride/started` and `WS ride:start`. Wired `driver_arrived`, `cancelled`, and `completed` status updates. |
| **3. Circular Import & Module Separation** | `activeTripCache` lived in `utils-server/index.ts`, creating circular imports with `breadcrumbs.ts`. | Moved active trip cache to dedicated module `utils-server/activeTrips.ts`. Both `index.ts` and `breadcrumbs.ts` import from it cleanly. |
| **4. Route Truncation Overwrite on Restart** | `onConflictDoUpdate` replaced existing points with post-restart buffer, discarding points recorded before restart. | Updated `flushAndEvictRoute` to append points using PostgreSQL JSONB concatenation: `points = COALESCE(points, '[]'::jsonb) || excluded.points`. |
| **5. 1,000-Point Buffer Freezing** | Cap dropped newest points after 83 min, freezing car marker and triggering "Signal Delayed" in Dhaka traffic. | When buffer reaches 1,000 points, decimate by half (keep every 2nd point) to double capacity to 166+ minutes without losing live updates. |
| **6. Non-Existent Imports in `breadcrumbs+api.ts`** | Hallucinated `@/lib/authMiddleware` and `@/lib/rideGuard`. | Switched to real repository modules: `verifySupabaseToken` from `@/lib/auth`, `resolveRideParticipantIds` & `isParticipant` from `@/lib/rideParticipants`, `import * as errors from '@/lib/errors'`. |
| **7. Live Coords Auth Bypass & Inconsistency** | Used ad-hoc header check (`x-internal-secret`) that failed open if undefined. | Nested under existing centralized `/internal/*` middleware in `utils-server/index.ts` using standard `Authorization: Bearer <WEBSOCKET_INTERNAL_SECRET>` (fails closed). |
| **8. Public Data Exposure vs UI Minimization** | Returned raw coordinates and street addresses on public UUID link without displaying them. | Returned location freshness (`driver_location_age_seconds`) and driver identity. Removed raw street addresses from public response. |
| **9. WhatsApp Scheme Detection Failure** | Android 11+ and iOS block `canOpenURL` without manifest `<queries>` entries. | Wrapped `Linking.openURL("whatsapp://...")` directly in `try/catch` with automatic fallback to `Share.share`. |
| **10. Dispute Hold Overbreadth** | Checking specific dispute statuses risks enum drift. | Changed purge safety check to `WHERE NOT EXISTS (SELECT 1 FROM fare_disputes fd WHERE fd.ride_id = ride_routes.ride_id AND fd.status <> 'resolved')`. |
| **11. Route Deviation Gating** | Deviation check ran on all location updates, including pre-pickup. | Gated `detectRouteDeviation` strictly to `activeTrip.status === "in_progress"`. |
| **12. Scratch DB Role Compatibility** | Plain `postgres:16` containers in CI do not have `anon` or `authenticated` roles. | Migration `0088` wraps revocation in `DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ... END IF; END $$;`. |

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
        ACTIVE_TRIPS["activeTrips.ts (Isolated In-Memory Cache)"]
        BC_BUFFER["breadcrumbs.ts (Decimating Ring Buffer)"]
        INT_AUTH["Centralized Internal Auth (Bearer Token, Fails Closed)"]
        INT_COORDS["GET /internal/ride/:id/live-coords"]
        INT_STARTED["POST /internal/ride/started -> updateActiveTripStatus"]
        INT_COMPLETED["POST /internal/ride/completed -> JSONB Concat Flush"]
        INT_CANCELLED["POST /internal/ride/cancelled -> Evict Active Memory"]
        SCHEDULE_PURGE["Job 61: 30-day Purge (Bounded Subquery, status <> 'resolved')"]
    end

    subgraph ExpoAPI["Expo API Routes (Port 8081)"]
        TRACK_API["GET /api/ride/:id/track (Bearer Authed RPC + Edge Cached)"]
        AUTH_BC["GET /api/ride/:id/breadcrumbs (lib/auth + lib/rideParticipants)"]
        SOS_API["POST /api/sos/alert (999 Dial + Distress SMS)"]
    end

    subgraph Database["PostgreSQL (RLS FORCED + DEFENSIVE REVOKE)"]
        DB_ROUTES[("ride_routes (1 row/ride: points JSONB)")]
        DB_DISPUTES[("fare_disputes")]
    end

    subgraph RiderApp["Rider App / Mobile Web"]
        R_WA["1-Tap WhatsApp Share (openURL with Share fallback)"]
        R_WEB["Public /track/[rideId] (Live Status & Safety Card)"]
        R_HIST["history-detail/index.tsx (MapLibre LineString Display)"]
    end

    D_FG --> D_GPS
    D_GPS --> D_WS
    D_GPS -.-> D_ASYNC
    
    D_WS --> WS_HANDLER
    WS_HANDLER --> ACTIVE_TRIPS
    ACTIVE_TRIPS --> BC_BUFFER
    
    INT_AUTH --> INT_COORDS
    INT_COORDS --> BC_BUFFER
    TRACK_API -->|Bearer Token Fetch| INT_COORDS
    TRACK_API -.->|Poll every 10s: Freshness & status| R_WEB

    INT_STARTED --> ACTIVE_TRIPS
    INT_COMPLETED -->|Flush JSONB with COALESCE Concat| DB_ROUTES
    INT_CANCELLED --> ACTIVE_TRIPS
    INT_CANCELLED --> BC_BUFFER
    SCHEDULE_PURGE -->|Purge >30 days (hold if dispute <> 'resolved')| DB_ROUTES

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

### 7.1 Decoupled, High-Accuracy Foreground Telematics
In `finish-ride/index.tsx`, the telematics loop operates strictly in the foreground while the active trip is on screen. Accuracy is maintained at `Location.Accuracy.High` (5–10m resolution) to ensure sharp corridor deviation detection. Active ride ID is read from `activeRideIdRef.current` (already hooked to `useRideOfferStore`).

```typescript
// In app/(main)/(rider)/finish-ride/index.tsx:
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
    const rideId = activeRideIdRef.current;

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

## 8. utils-server Telematics Architecture

### 8.1 Active Trip Cache Module (`utils-server/activeTrips.ts`)
To completely eliminate circular imports, active trip state lives in its own dedicated module:

```typescript
// utils-server/activeTrips.ts
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

export function updateActiveTripStatus(rideId: string, status: string) {
  const trip = activeTripCache.get(rideId);
  if (trip) {
    trip.status = status;
  }
}

export function getActiveTrip(rideId: string): ActiveTripInfo | undefined {
  return activeTripCache.get(rideId);
}

export function unregisterActiveTrip(rideId: string) {
  activeTripCache.delete(rideId);
}
```

### 8.2 Ingestion Buffer & Concatenation Flush (`utils-server/breadcrumbs.ts`)
```typescript
// utils-server/breadcrumbs.ts
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { rideRoutes } from "../src/db/schema";
import { haversineKm } from "../lib/fareCalc";
import { unregisterActiveTrip } from "./activeTrips";

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

  // Decimation Protection: Decimate to half at 1,000 points (~83 min)
  // Keeps every 2nd point, doubling capacity to 166+ minutes without freezing
  if (list.length >= 1000) {
    list = list.filter((_, idx) => idx % 2 === 0);
    activeBreadcrumbs.set(rideId, list);
  }

  list.push(point);
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

  let distanceMeters = 0;
  for (let i = 1; i < points.length; i++) {
    distanceMeters += haversineKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng) * 1000;
  }
  distanceMeters = Math.round(distanceMeters);

  // Crash-Safe JSONB Concatenation: Never overwrites points recorded before a restart
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
        points: sql`COALESCE(${rideRoutes.points}, '[]'::jsonb) || ${JSON.stringify(points)}::jsonb`,
        duration_seconds: sql`GREATEST(COALESCE(${rideRoutes.duration_seconds}, 0), ${durationSec})`,
        distance_meters: sql`COALESCE(${rideRoutes.distance_meters}, 0) + ${distanceMeters}`,
      },
    });

  evictActiveRoute(rideId);
}

export async function flushAllActiveRoutes() {
  const rideIds = Array.from(activeBreadcrumbs.keys());
  for (const id of rideIds) {
    await flushAndEvictRoute(id);
  }
}
```

### 8.3 Ingestion & Lifecycle Integration in `utils-server/index.ts`

#### Startup Hydration
```typescript
// In startup() in utils-server/index.ts:
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

#### Lifecycle State Synchronization
```typescript
// 1. In POST /internal/ride/started AND WS case "ride:start":
updateActiveTripStatus(ride_id, "in_progress");

// 2. In POST /internal/ride/driver-arrived AND WS case "ride:arrived":
updateActiveTripStatus(ride_id, "driver_arrived");

// 3. In POST /internal/ride/completed:
await flushAndEvictRoute(ride_id);

// 4. In POST /internal/ride/cancelled:
evictActiveRoute(ride_id);
```

#### Hot-Path `location:update`
```typescript
// In ws message handler:
let activeTrip = getActiveTrip(locRideId);

// Self-healing DB check on cache miss
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

// Strict ownership check
if (!activeTrip || activeTrip.driverId !== client.driverId) {
  send(ws, { type: "error", message: "not_your_ride" });
  break;
}

// Record points & check deviation strictly for in_progress trips
if (activeTrip.status === "in_progress") {
  const safeTs = parsePointTs(msg.ts);
  recordBreadcrumbPoint(locRideId, {
    lat: msg.lat as number,
    lng: msg.lng as number,
    ts: safeTs,
  });

  detectRouteDeviation(
    locRideId,
    msg.lat as number,
    msg.lng as number,
    activeTrip.originLat,
    activeTrip.originLng,
    activeTrip.destLat,
    activeTrip.destLng,
  ).catch(() => {});
}
```

#### Centralized Internal Live Coords Route
Inherits standard `Bearer` authorization (fails closed if `!WEBSOCKET_INTERNAL_SECRET`):
```typescript
if (req.method === "GET" && req.url?.startsWith("/internal/ride/") && req.url.endsWith("/live-coords")) {
  const rideId = req.url.split("/")[3];
  const lastPt = getLastPoint(rideId);
  writeJson(200, lastPt ? { lat: lastPt.lat, lng: lastPt.lng, ts: lastPt.ts } : null);
  return;
}
```

---

## 9. Real Live Public Tracking & Safety Screen

### 9.1 Backend API (`app/api/ride/[id]/track+api.ts`)
```typescript
// app/api/ride/[id]/track+api.ts
const TERMINAL_STATUSES = new Set(["completed", "cancelled", "expired", "no_drivers"]);
const ACTIVE_STATUSES = new Set(["matched", "driver_arriving", "driver_arrived", "in_progress"]);

const isTerminal = TERMINAL_STATUSES.has(ride.status);
const isActive = ACTIVE_STATUSES.has(ride.status);
const isDispatching = ride.status === "dispatching";

let driverLat: number | null = null;
let driverLng: number | null = null;
let locationUpdatedAt: number | null = null;
let locationAgeSeconds: number | null = null;
let driverName: string | null = null;
let driverRating: string | null = null;
let vehicleType: string | null = null;

if (ride.driver_id && isActive) {
  // Query utils-server using standard Bearer authentication
  try {
    const wsInternalUrl = process.env.INTERNAL_WEBSOCKET_URL || "http://127.0.0.1:3001";
    const coordRes = await fetch(`${wsInternalUrl}/internal/ride/${ride.id}/live-coords`, {
      headers: { Authorization: `Bearer ${process.env.WEBSOCKET_INTERNAL_SECRET || ""}` },
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
    // Fallback to database
  }

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
// Dispatching rides expose route coords but null driver info.
const body = {
  status: ride.status,
  driver_name: isActive ? driverName : null,
  driver_rating: isActive ? driverRating : null,
  vehicle_type: isActive ? vehicleType : null,
  driver_lat: isActive ? driverLat : null,
  driver_lng: isActive ? driverLng : null,
  driver_location_updated_at: isActive ? locationUpdatedAt : null,
  driver_location_age_seconds: isActive ? locationAgeSeconds : null,
  origin_lat: (isActive || isDispatching) ? ride.origin_latitude : null,
  origin_lng: (isActive || isDispatching) ? ride.origin_longitude : null,
  destination_lat: (isActive || isDispatching) ? ride.destination_latitude : null,
  destination_lng: (isActive || isDispatching) ? ride.destination_longitude : null,
};

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
Complete, robust mobile-web status card with full error, loading, and terminal handling:

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
  pending: { label: "Searching for nearby driver", color: colors.primary, icon: "radio" },
  dispatching: { label: "Contacting drivers", color: colors.primary, icon: "radio" },
  scheduled: { label: "Scheduled trip", color: colors.primary, icon: "calendar" },
  matched: { label: "Driver on the way", color: colors.primary, icon: "car" },
  driver_arriving: { label: "Driver arriving", color: colors.primary, icon: "car-sport" },
  driver_arrived: { label: "Driver arrived at pickup", color: colors.amber, icon: "location" },
  in_progress: { label: "Trip in progress", color: colors.goSuccess, icon: "navigate" },
  completed: { label: "Trip completed", color: colors.gray500, icon: "checkmark-circle" },
  cancelled: { label: "Trip cancelled", color: colors.goDanger, icon: "close-circle" },
  expired: { label: "Trip expired", color: colors.gray500, icon: "time" },
  no_drivers: { label: "No drivers available", color: colors.goDanger, icon: "alert-circle" },
};

const TERMINAL_STATUSES = new Set(["completed", "cancelled", "expired", "no_drivers"]);

export default function PublicTrackPage() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
        if (res.ok) {
          const resData = await res.json();
          setData(resData);
          setError("");
          if (TERMINAL_STATUSES.has(resData.status)) {
            if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
          }
        } else {
          setError("Ride not found or no longer trackable");
          if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        }
      } catch {
        setError("Connecting to live tracking...");
      }
    };
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 10_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [rideId]);

  if (error && !data) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center p-6" style={{ backgroundColor: bg }}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.goDanger} />
        <Text className="mt-4 text-center font-JakartaBold text-lg" style={{ color: textPrimary }}>{error}</Text>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center p-6" style={{ backgroundColor: bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="mt-4 font-Jakarta text-sm" style={{ color: textSecondary }}>Loading trip details...</Text>
      </SafeAreaView>
    );
  }

  const cfg = STATUS_CONFIG[data.status] ?? { label: data.status, color: colors.primary, icon: "radio" };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <View className="p-4 border-b flex-row justify-between items-center" style={{ borderColor }}>
        <Text className="text-xl font-JakartaBold" style={{ color: textPrimary }}>Ride Safety Tracking</Text>
        <TouchableOpacity onPress={() => setTheme(isDark ? "light" : "dark")}>
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
        </TouchableOpacity>
      </View>

      <View className="p-6 flex-1 justify-between">
        <View>
          {/* Status Badge */}
          <View className="flex-row items-center p-4 rounded-xl mb-4" style={{ backgroundColor: cfg.color + "1A" }}>
            <Ionicons name={cfg.icon} size={28} color={cfg.color} />
            <Text className="ml-3 font-JakartaBold text-lg" style={{ color: cfg.color }}>{cfg.label}</Text>
          </View>

          {/* GPS Signal Freshness */}
          {data.driver_location_age_seconds != null && (
            <View className="flex-row items-center mb-6 px-1">
              <View className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: data.driver_location_age_seconds <= 15 ? colors.goSuccess : colors.amber }} />
              <Text className="text-xs font-Jakarta" style={{ color: textSecondary }}>
                {data.driver_location_age_seconds <= 15
                  ? `Live GPS Signal (Updated ${data.driver_location_age_seconds}s ago)`
                  : `Signal Delayed (${data.driver_location_age_seconds}s ago)`}
              </Text>
            </View>
          )}

          {/* Driver Profile */}
          {data.driver_name && (
            <View className="p-4 rounded-xl mb-4 border" style={{ backgroundColor: surfaceBg, borderColor }}>
              <Text className="text-xs uppercase font-JakartaBold mb-1" style={{ color: textSecondary }}>Driver & Vehicle</Text>
              <Text className="text-lg font-JakartaBold" style={{ color: textPrimary }}>{data.driver_name}</Text>
              <Text className="text-sm font-Jakarta" style={{ color: textSecondary }}>
                {data.vehicle_type} {data.driver_rating ? `• ★ ${parseFloat(data.driver_rating).toFixed(1)}` : ""}
              </Text>
            </View>
          )}
        </View>

        {/* 1-Tap 999 Police Button */}
        <TouchableOpacity
          onPress={() => Linking.openURL("tel:999")}
          className="p-4 rounded-xl flex-row justify-center items-center"
          style={{ backgroundColor: colors.goDanger }}
        >
          <Ionicons name="call" size={20} color="#fff" />
          <Text className="text-white font-JakartaBold text-base ml-2">Call 999 Police (Emergency)</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
```

---

## 10. Client-Side 1-Tap WhatsApp Ride Sharing

In `app/(main)/(customer)/ride-tracking/[ride_id].tsx`:
Calls `Linking.openURL("whatsapp://...")` directly with automatic `Share.share` fallback:

```tsx
const handleShare = async () => {
  const baseUrl = process.env.EXPO_PUBLIC_SERVER_URL || process.env.EXPO_PUBLIC_API_URL || "https://ride.com.bd";
  const shareUrl = `${baseUrl}/track/${ride_id}`;
  const dName = driver?.full_name ?? "Driver";
  const vType = driver?.vehicle_type ?? "vehicle";
  const message = `I am on a Ride trip with ${dName} (${vType}). Track my ride live: ${shareUrl}`;
  const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;

  try {
    await Linking.openURL(whatsappUrl);
  } catch {
    await Share.share({ message });
  }
};
```

---

## 11. Authenticated In-App Route Display (History Screen)

### 11.1 Route Retrieval Endpoint (`app/api/ride/[id]/breadcrumbs+api.ts`)
Conforms to live codebase modules (`lib/auth.ts`, `lib/rideParticipants.ts`, and `import * as errors from '@/lib/errors'`):

```typescript
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { rides, users, rideRoutes } from "@/src/db/schema";
import { verifySupabaseToken } from "@/lib/auth";
import { resolveRideParticipantIds, isParticipant } from "@/lib/rideParticipants";
import * as errors from "@/lib/errors";

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

      // Status <> 'resolved' ensures safety against enum changes
      await tx.execute(sql`
        DELETE FROM ride_routes
        WHERE ride_id IN (
          SELECT ride_id FROM ride_routes
          WHERE created_at < ${cutoff}
            AND NOT EXISTS (SELECT 1 FROM sos_alerts sa WHERE sa.ride_id = ride_routes.ride_id)
            AND NOT EXISTS (
              SELECT 1 FROM fare_disputes fd 
              WHERE fd.ride_id = ride_routes.ride_id 
                AND fd.status <> 'resolved'
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
  ├── Verify activeRideId read from activeRideIdRef.current
  └── Gate: npx jest tests/unit/finish-ride-telematics.test.ts && npm run lint

Phase 2: Database Migration 0088 & Drizzle Schema
  ├── Defensive 0088 SQL with DO $$ BEGIN IF EXISTS ... REVOKE ... END $$;
  ├── Drizzle schema additions in src/db/schema.ts (export rideRoutes)
  └── Gate: npx jest tests/api/ride/routes-schema.test.ts

Phase 3: utils-server Telematics Ingestion & Flush Hooks
  ├── utils-server/activeTrips.ts (isolated cache module, zero circular imports)
  ├── utils-server/breadcrumbs.ts (decimating buffer at 1,000 points, flush with JSONB concat)
  ├── Hook lifecycle state transitions into index.ts (started, arrived, completed, cancelled)
  ├── Expose GET /internal/ride/:id/live-coords under centralized Bearer auth
  ├── Register Job 61 in scheduler.ts with bounded subquery (fd.status <> 'resolved')
  └── Gate: npx jest utils-server/__tests__/breadcrumbs.test.ts

Phase 4: Live Mobile-Web Status Card & WhatsApp Share
  ├── app/api/ride/[id]/track+api.ts returns driver fields, freshness timestamps, and handles dispatching
  ├── app/track/[rideId].tsx: Live Status & Safety Card with freshness indicator and 999 dialing
  ├── Update tests/api/ride/track.test.ts assertions for freshness fields and dispatching status
  ├── app/(main)/(customer)/ride-tracking/[ride_id].tsx: 1-tap WhatsApp share button (openURL + fallback)
  └── Gate: npx jest tests/api/ride/track.test.ts

Phase 5: Authenticated In-App Route Display
  ├── GET /api/ride/[id]/breadcrumbs with lib/auth, lib/rideParticipants, and import * as errors
  ├── Customer history-detail/index.tsx renders route polyline on MapLibre map with bounding camera
  └── Gate: npx jest tests/api/ride/breadcrumbs.test.ts (IDOR tests: stranger 403, rider 200)
```

---

## 14. Rollback & Failure Recovery Procedures

### Database Down-Migration SQL
```sql
DROP TABLE IF EXISTS "ride_routes" CASCADE;
```

### Buffer Decimation Fail-Safe
If in-memory telemetry points reach 1,000 for a single trip, the buffer decimates by half, preserving the entire trajectory while bounding memory.
