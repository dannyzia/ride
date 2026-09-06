import "dotenv/config";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { validateUtilsServerEnv } from "../lib/env";
import {
  startH3IndexRefresh,
  refreshH3Index,
  updateDriver,
  removeDriver,
  getDriversInCells,
  getIndexedDriverCount,
} from "./h3Index";
import { startCompensationWorker } from "./compensationWorker";
import { startScheduler } from "./scheduler";
import { runRedispatchTrigger } from "./redispatch";
import {
  buildCandidateList,
  isDispatchPaused,
  updateDriverAcceptanceRate,
  DISPATCH_RING_K,
} from "./dispatch";
import { debitLeadForOfferTx } from "./leadBilling";
import {
  runSequentialChain,
  awaitOfferSettlement,
  resolvePendingOffer,
  resolvePendingOfferForDriver,
  abortChain,
} from "./dispatchChain";
import { recordColdDrop } from "./coldDrop";
import { estimateEtaMinutes } from "./eta";
import { db } from "../src/db";
import {
  users,
  drivers,
  rides,
  dispatchOffers,
  driverOnlineSessions,
  callLedger,
  pricing,
  rideStops,
  zones,
  fraudFlags,
  driverSessions,
  shopMembers,
} from "../src/db/schema";
import { eq, and, inArray, isNull, sql, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getPlan05Int } from "../lib/platformConfig";
import { getZoneForLocation } from "../lib/zone";
import { getH3Cell, getH3Ring } from "../lib/h3";
import { calculateFare, haversineKm } from "../lib/fareCalc";
import { VEHICLE_TYPE_VALUES, PICKUP_CATEGORY, type VehicleTypeEnum } from "../lib/vehicleTypes";
import {
  getFareFrameworkConfig,
  parseConfigNumber,
  parseConfigBool,
} from "../lib/fareFrameworkConfig";
import {
  computeFeeKm,
  pickupFeePaisa,
  ratePerKmPaisa,
  applyBackstop,
} from "../lib/pickupFee";
import { detectRouteDeviation } from "../lib/safety";
import { sendNotification } from "../lib/notify";
import { getFirmRouteKm } from "./barikoiRoute";
import { computeFirmQuote } from "./firmQuote";
import {
  recordDriverPoint,
  registerRideTrace,
  finalizeRideTrace,
  unregisterRideTrace,
  getDriverPointsInWindow,
  getLastDriverPoint,
  parsePointTs,
  DRIVER_FIX_STALE_MS,
  type TracePoint,
} from "./trace";
import { decodePolyline } from "./polyline";
import {
  computeOverlap,
  pointsInDetectionWindow,
  MIN_QUALIFYING_POINTS,
  DETECTION_WINDOW_MS,
} from "./offPlatform";
import type { SosAlertPayload } from "./types";

validateUtilsServerEnv();

// ── Single-Instance Guard ──────────────────────────────────────────────────
const INSTANCE_COUNT = parseInt(process.env.INSTANCE_COUNT ?? "1");
if (INSTANCE_COUNT !== 1) {
  logger.error(
    "[startup] INSTANCE_COUNT must be 1. In-process maps prevent multi-replica operation. See TD-11.",
  );
  process.exit(1);
}

// ── Supabase Admin Client ─────────────────────────────────────────────────
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

// ── Types ──────────────────────────────────────────────────────────────────
interface WSClient {
  ws: WebSocket;
  userId?: string;
  supabaseUid?: string;
  role?: "driver" | "rider" | "admin";
  driverId?: string;
  subscribedRideId?: string; // rider: which ride they are tracking
  lastSeen?: number; // epoch ms of last heartbeat (for stale-connection cleanup)
  driverSessionId?: string; // PATCH 4: driver session tracking for utilization
}

// ── Connection Maps ────────────────────────────────────────────────────────
const connectedDrivers = new Map<string, WSClient>(); // driverId → client
const connectedRiders = new Map<string, WSClient>(); // userId → client (rider)
const connectedAdmins = new Map<string, WSClient>(); // userId → client (admin)
const allClients = new Map<WebSocket, WSClient>();

// ── Offer Locks (double-deduction prevention) ─────────────────────────────
// Key: `${rideId}:${driverId}`, Value: epoch ms when the lock was acquired.
// Cleaned up on accept/decline (immediate), setTimeout (TTL), and periodic sweep.
const offerLocks = new Map<string, number>();
const OFFER_LOCK_TTL_MS = 10_000;
const OFFER_LOCK_SWEEP_MS = 30_000; // periodic sweep threshold
const STALE_DRIVER_TIMEOUT_MS = 90_000;
const CLEANUP_INTERVAL_MS = 60_000;

// ── Zone Hysteresis (3-beat) ──────────────────────────────────────────────
// Drivers at zone borders flicker between zones on consecutive heartbeats.
// Track consecutive beats in the same pending zone; only commit to DB after 3.
const ZONE_HYSTERESIS_BEATS = 3;
const zoneHysteresis = new Map<string, { pending: string | null; beats: number }>();

// ── DB Persist Throttle (30s per driver) ───────────────────────────────────
const lastPersist = new Map<string, number>();
function getLastPersist(driverId: string): number {
  return lastPersist.get(driverId) ?? 0;
}
function setLastPersist(driverId: string, ts: number): void {
  lastPersist.set(driverId, ts);
}

// ── Phase G: off-platform completion detection scheduler ──────────────────
// On a proximity driver-cancel, detection runs at cancel + 30 min against
// the driver's in-memory GPS ring buffer (TD-15: buffer lost on crash →
// detection is best-effort by design). Timers are tracked for shutdown
// cleanup; one detection per ride (Map key = rideId).
interface PendingDetection {
  driverId: string;
  scheduledAtMs: number;
  timer: NodeJS.Timeout;
}
const pendingDetections = new Map<string, PendingDetection>();

function scheduleOffPlatformDetection(rideId: string, driverId: string): void {
  if (pendingDetections.has(rideId)) return; // single-instance TD-15 guard
  const scheduledAtMs = Date.now();
  const timer = setTimeout(() => {
    pendingDetections.delete(rideId);
    runOffPlatformDetection(rideId, driverId, scheduledAtMs).catch((e) =>
      logger.error("[offPlatform] detection run failed", {
        ride_id: rideId,
        driverId,
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }, DETECTION_WINDOW_MS);
  pendingDetections.set(rideId, { driverId, scheduledAtMs, timer });
  logger.info("[offPlatform] detection scheduled (T+30min)", {
    ride_id: rideId,
    driverId,
  });
}

/**
 * Phase G detection at T+30min: overlap = share of the driver's ring-buffer
 * points recorded in [cancel+5min, cancel+30min] that are > 300 m from the
 * pickup pin AND within 150 m of the ride's route_polyline corridor.
 * overlap ≥ offplatform_trace_overlap_pct AND ≥ 5 qualifying points →
 * fraud_flags(off_platform_completion) — no unique index exists, so an
 * existing non-resolved flag for the same driver+ride+type suppresses the
 * insert (idempotency by check).
 */
async function runOffPlatformDetection(
  rideId: string,
  driverId: string,
  cancelAtMs: number,
): Promise<void> {
  const [ride] = await db
    .select({
      origin_latitude: rides.origin_latitude,
      origin_longitude: rides.origin_longitude,
      route_polyline: rides.route_polyline,
    })
    .from(rides)
    .where(eq(rides.id, rideId))
    .limit(1);
  if (!ride?.route_polyline) return; // no corridor reference — nothing to match

  const legs = decodePolyline(ride.route_polyline);
  if (legs.length < 2) return;

  const windowPoints = pointsInDetectionWindow(
    getDriverPointsInWindow(driverId, 0, Number.MAX_SAFE_INTEGER),
    cancelAtMs,
  );
  if (windowPoints.length === 0) return; // buffer lost (restart) or driver offline

  const pickup = {
    lat: parseFloat(ride.origin_latitude?.toString() ?? ""),
    lng: parseFloat(ride.origin_longitude?.toString() ?? ""),
  };
  if (!Number.isFinite(pickup.lat) || !Number.isFinite(pickup.lng)) return;

  const overlap = computeOverlap(windowPoints, pickup, legs);
  if (overlap.qualifying < MIN_QUALIFYING_POINTS) return;

  const cfg = await getFareFrameworkConfig(["offplatform_trace_overlap_pct"]);
  const thresholdPct = parseConfigNumber(cfg.offplatform_trace_overlap_pct, 60);
  if (overlap.overlapPct < thresholdPct) return;

  // Idempotency: skip when a non-resolved flag already exists for this
  // driver + ride + type (fraud_flags has no unique index to delegate to).
  const [existing] = await db
    .select({ id: fraudFlags.id })
    .from(fraudFlags)
    .where(
      and(
        eq(fraudFlags.driver_id, driverId),
        eq(fraudFlags.ride_id, rideId),
        eq(fraudFlags.flag_type, "off_platform_completion"),
        inArray(fraudFlags.status, ["open", "warned", "escalated", "blocked"]),
      ),
    )
    .limit(1);
  if (existing) return;

  await db.insert(fraudFlags).values({
    driver_id: driverId,
    flag_type: "off_platform_completion",
    ride_id: rideId,
    evidence: {
      overlap_pct: overlap.overlapPct,
      threshold_pct: thresholdPct,
      qualifying_points: overlap.qualifying,
      matched_points: overlap.matched,
      sample_points: windowPoints.slice(0, 20),
      window: {
        start: new Date(cancelAtMs + 5 * 60_000).toISOString(),
        end: new Date(cancelAtMs + DETECTION_WINDOW_MS).toISOString(),
      },
    },
  });
  logger.warn("[offPlatform] off_platform_completion flag raised", {
    ride_id: rideId,
    driverId,
    overlapPct: overlap.overlapPct,
    qualifying: overlap.qualifying,
  });
}

// ── Phase F quote state 3: trace finalize at ride:start ───────────────────
/**
 * realized_km = Σ haversine over accepted consecutive trace segments;
 * confidence = acceptedSegments / totalSegments. Persisted on the ride row;
 * the completion step (root package) decides whether to charge. No-op when
 * the ride was never registered for tracing (measurement off / already done).
 */
async function finalizeAndPersistPickupTrace(rideId: string): Promise<void> {
  const result = finalizeRideTrace(rideId);
  if (!result) return;
  await db
    .update(rides)
    .set({
      pickup_realized_km: result.realizedKm.toFixed(3),
      pickup_realized_confidence: result.confidence.toFixed(3),
    })
    .where(eq(rides.id, rideId));
  logger.info("[pickupTrace] realized distance persisted", {
    ride_id: rideId,
    realized_km: result.realizedKm.toFixed(3),
    confidence: result.confidence.toFixed(3),
  });
}

// ── Helper ─────────────────────────────────────────────────────────────────
function send(ws: WebSocket, msg: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function sendToDriver(driverId: string, msg: Record<string, unknown>) {
  const client = connectedDrivers.get(driverId);
  if (client) send(client.ws, msg);
}

function sendToRider(userId: string, msg: Record<string, unknown>) {
  const client = connectedRiders.get(userId);
  if (client) send(client.ws, msg);
}

export function sendToUser(userId: string, msg: Record<string, unknown>) {
  const riderClient = connectedRiders.get(userId);
  if (riderClient) {
    send(riderClient.ws, msg);
    return;
  }
  for (const client of connectedDrivers.values()) {
    if (client.userId === userId) {
      send(client.ws, msg);
      return;
    }
  }
}

// Emergency chain emits through the bus so utils-server-free consumers
// (Expo REST routes) never pull this WS server module into their bundle.
import { setEmergencyEmitter } from "./emergencyBus";
setEmergencyEmitter(sendToUser);

// ── HTTP Server ────────────────────────────────────────────────────────────
const WEBSOCKET_INTERNAL_SECRET = process.env.WEBSOCKET_INTERNAL_SECRET ?? "";

const START_TIME = Date.now();

const server = http.createServer(async (req, res) => {
  const writeJson = (code: number, data: Record<string, unknown>) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };

  if (req.url === "/health") {
    const uptimeSeconds = Math.floor((Date.now() - START_TIME) / 1000);

    // Quick database health check (non-blocking for the main health response)
    let dbStatus = "unknown";
    let dbError: string | undefined;

    // Check only if we can do so quickly (avoid blocking)
    const checkDb = async () => {
      try {
        await db.select().from(users).limit(1);
        dbStatus = "ok";
      } catch (e: any) {
        dbStatus = "error";
        dbError = e.message;
      }
    };

    // Fire DB check in background, don't await it
    checkDb().catch(() => {});

    return writeJson(200, {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "ride-ws",
      version: process.env.npm_package_version || "1.0.0",
      uptime_seconds: uptimeSeconds,
      env: process.env.NODE_ENV || "production",
      websocket: {
        connected_clients: allClients.size,
        connected_drivers: connectedDrivers.size,
        connected_riders: connectedRiders.size,
        connected_admins: connectedAdmins.size,
      },
      database: {
        status: dbStatus,
        error: dbError,
      },
      h3_index: {
        drivers_indexed: getIndexedDriverCount(),
      },
    });
  }

  // All internal endpoints require shared secret
  if (!WEBSOCKET_INTERNAL_SECRET) {
    writeJson(500, { error: "server_misconfigured" });
    return;
  }
  const authHeader = req.headers["authorization"] ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (token !== WEBSOCKET_INTERNAL_SECRET) {
    writeJson(401, { error: "unauthorized" });
    return;
  }

  if (req.url === "/internal/ws/notify" && req.method === "POST") {
    // Z2: marketplace per-state-change notifications from the API process.
    // Body: { events: [{ event, to: [{ kind, user_id?, fleet_id? }], payload }] }
    // kind: 'user' (rental bidder + courier registries) | 'fleet' (active
    // fleet_members) | 'couriers' (all connected couriers) | 'shop_staff'
    // (active shop_members). Every send is best-effort.
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const { events } = JSON.parse(body) as {
          events?: Array<{
            event: string;
            to?: Array<{ kind: string; user_id?: string; fleet_id?: string; shop_id?: string }>;
            payload?: Record<string, unknown>;
          }>;
        };
        if (!Array.isArray(events)) {
          writeJson(400, { error: "missing_events" });
          return;
        }
        const { sendToBidder, sendToFleetMembers } = await import("./rentalHandler");
        const { sendToCourier, broadcastToCouriers } = await import("./deliveryHandler");
        let sent = 0;
        for (const e of events) {
          if (!e?.event) continue;
          for (const to of e.to ?? []) {
            try {
              if (to.kind === "user" && to.user_id) {
                sendToBidder(to.user_id, e.event, e.payload ?? {});
                sendToCourier(to.user_id, e.event, e.payload ?? {});
                sent += 1;
              } else if (to.kind === "fleet" && to.fleet_id) {
                await sendToFleetMembers(to.fleet_id, e.event, e.payload ?? {});
                sent += 1;
              } else if (to.kind === "couriers") {
                broadcastToCouriers(e.event, e.payload ?? {});
                sent += 1;
              } else if (to.kind === "shop_staff" && to.shop_id) {
                const members = await db
                  .select({ user_id: shopMembers.user_id })
                  .from(shopMembers)
                  .where(
                    and(eq(shopMembers.shop_id, to.shop_id), eq(shopMembers.status, "active")),
                  );
                for (const { user_id } of members) {
                  sendToBidder(user_id, e.event, e.payload ?? {});
                }
                sent += 1;
              }
            } catch (toErr: unknown) {
              logger.warn("[ws/notify] recipient send failed", {
                event: e.event,
                to,
                error: toErr instanceof Error ? toErr.message : String(toErr),
              });
            }
          }
        }
        writeJson(200, { ok: true, sent });
      } catch {
        writeJson(400, { error: "invalid_body" });
      }
    });
    return;
  }

  if (req.url === "/internal/dispatch" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const { ride_id, allow_downgrade } = JSON.parse(body);
        if (!ride_id) {
          writeJson(400, { error: "missing_ride_id" });
          return;
        }

        logger.info('[dispatch] received dispatch request', { ride_id, allow_downgrade });

        if (await isDispatchPaused()) {
          logger.warn("[dispatch] paused via system_config, rejecting ride", {
            ride_id,
          });
          const status = allow_downgrade ? "pending" : "no_drivers";
          await db.update(rides).set({ status }).where(eq(rides.id, ride_id));
          writeJson(200, { ok: true, status: "paused" });
          return;
        }

        // Fetch ride details
        const [ride] = await db
          .select()
          .from(rides)
          .where(eq(rides.id, ride_id))
          .limit(1);
        if (!ride) {
          writeJson(404, { error: "ride_not_found" });
          return;
        }

        await db
          .update(rides)
          .set({ status: "dispatching" })
          .where(eq(rides.id, ride_id));

        // Start dispatch pipeline without awaiting (async, non-blocking)
        dispatchRidePipeline(ride, !!allow_downgrade).catch((e) => {
          logger.error("[index] dispatch pipeline error", {
            ride_id,
            error: e.message,
          });
        });

        writeJson(200, { ok: true, status: "dispatching" });
      } catch {
        writeJson(400, { error: "invalid_body" });
      }
    });
    return;
  }

  if (req.url === "/internal/driver/force-offline" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const { driver_id, reason } = JSON.parse(body);
        if (!driver_id) {
          writeJson(400, { error: "missing_driver_id" });
          return;
        }

        const client = connectedDrivers.get(driver_id);
        if (client) {
          send(client.ws, {
            type: "admin:suspended",
            driver_id,
            reason: reason ?? "",
          });
          client.ws.close();
          await handleDriverDisconnect(driver_id);
        }

        await db
          .update(drivers)
          .set({ is_online: false })
          .where(eq(drivers.id, driver_id));
        writeJson(200, { ok: true });
      } catch {
        writeJson(400, { error: "invalid_body" });
      }
    });
    return;
  }

  if (req.url === "/internal/chat/send" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const { ride_id, recipient_user_id, message } = JSON.parse(body);
        if (!ride_id || !recipient_user_id || !message) {
          writeJson(400, { error: "missing_fields" });
          return;
        }
        sendToUser(recipient_user_id, {
          type: "chat:message",
          ride_id,
          message,
        });
        writeJson(200, { ok: true });
      } catch {
        writeJson(400, { error: "invalid_body" });
      }
    });
    return;
  }

  if (req.url === "/internal/sos/alert" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const { alert } = JSON.parse(body) as { alert?: SosAlertPayload };
        if (!alert || !alert.id) {
          writeJson(400, { error: "missing_alert" });
          return;
        }
        // Broadcast-only (F-15): utils-server never writes sos_alerts — the
        // Expo API route owns that insert; here we only fan out to admins.
        let delivered = 0;
        for (const adminClient of connectedAdmins.values()) {
          if (adminClient.ws.readyState === WebSocket.OPEN) {
            send(adminClient.ws, { type: "admin:sos", alert });
            delivered++;
          }
        }
        writeJson(200, { ok: true, delivered });
      } catch {
        writeJson(400, { error: "invalid_body" });
      }
    });
    return;
  }

  if (req.url === "/internal/ride/driver-arrived" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const { ride_id, rider_user_id, arrived_at } = JSON.parse(body);
        if (!ride_id || !rider_user_id) {
          writeJson(400, { error: "missing_fields" });
          return;
        }
        sendToRider(rider_user_id, {
          type: "ride:arrived",
          ride_id,
          arrived_at: arrived_at ?? new Date().toISOString(),
        });
        writeJson(200, { ok: true });
      } catch {
        writeJson(400, { error: "invalid_body" });
      }
    });
    return;
  }

  if (req.url === "/internal/ride/completed" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const {
          ride_id,
          rider_user_id,
          total_bdt,
          driver_net_bdt,
          ride_time_min,
          fare_breakdown,
        } = JSON.parse(body);
        if (!ride_id || !rider_user_id) {
          writeJson(400, { error: "missing_fields" });
          return;
        }
        sendToRider(rider_user_id, {
          type: "ride:completed",
          ride_id,
          total_bdt,
          driver_net_bdt,
          ride_time_min,
          fare_breakdown,
        });

        // Phase D Lever 2: refresh the cold-drop cache when a ride completes
        // with a cold drop (the dispatch pool's boost/affinity lookups then
        // hit the cache instead of the DB-miss rebuild path).
        try {
          const [completedRide] = await db
            .select({
              driver_id: rides.driver_id,
              drop_zone_id: rides.drop_zone_id,
              drop_zone_heat: rides.drop_zone_heat,
              completed_at: rides.completed_at,
            })
            .from(rides)
            .where(eq(rides.id, ride_id))
            .limit(1);
          if (
            completedRide?.driver_id &&
            completedRide.completed_at &&
            completedRide.drop_zone_heat === "cold"
          ) {
            recordColdDrop(
              completedRide.driver_id,
              new Date(completedRide.completed_at),
              completedRide.drop_zone_id,
            );
          }
        } catch (e: any) {
          logger.warn("[internal] cold-drop cache refresh failed", {
            ride_id,
            error: e.message,
          });
        }

        // PATCH 4: increment driver_session trips_completed + billed_minutes
        // for utilization denominator (billed_minutes / online_minutes).
        // Hardened: match ONLY the LATEST open session (orderBy desc, limit 1)
        // to prevent stale open rows from accumulating phantom increments.
        try {
          const billedMin = Number(ride_time_min ?? 0);
          const [rideDriver] = await db
            .select({ driver_id: rides.driver_id })
            .from(rides)
            .where(eq(rides.id, ride_id))
            .limit(1);
          if (rideDriver?.driver_id) {
            const [latestSession] = await db
              .select({ id: driverSessions.id })
              .from(driverSessions)
              .where(
                and(
                  eq(driverSessions.driver_id, rideDriver.driver_id),
                  isNull(driverSessions.session_end),
                ),
              )
              .orderBy(desc(driverSessions.session_start))
              .limit(1);
            if (latestSession?.id) {
              await db
                .update(driverSessions)
                .set({
                  trips_completed: sql`${driverSessions.trips_completed} + 1`,
                  billed_minutes: sql`${driverSessions.billed_minutes} + ${billedMin}`,
                })
                .where(eq(driverSessions.id, latestSession.id));
            }
          }
        } catch (e: any) {
          logger.warn("[internal] driver_session increment failed", {
            ride_id,
            error: e.message,
          });
        }

        writeJson(200, { ok: true });
      } catch {
        writeJson(400, { error: "invalid_body" });
      }
    });
    return;
  }

  if (req.url === "/internal/ride/cancelled" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const { ride_id, driver_id, cancelled_by, within_200m, redispatch, rider_user_id } =
          JSON.parse(body) as {
            ride_id?: string;
            driver_id?: string;
            cancelled_by?: string;
            within_200m?: boolean;
            redispatch?: boolean;
            rider_user_id?: string;
          };
        // CG-2: driver_id is OPTIONAL — pre-match cancels (sequential chain
        // in flight, ride.driver_id still null) must also reach utils-server
        // so the chain stops billing further candidates.
        if (!ride_id) {
          writeJson(400, { error: "missing_fields" });
          return;
        }
        if (driver_id) {
          sendToDriver(driver_id, {
            type: "ride:cancelled",
            ride_id,
            cancelled_by: cancelled_by === "driver" ? "driver" : cancelled_by === "system" ? "system" : "rider",
          });
        }
        // ALWAYS: abort any in-memory chain for this ride — resolve the
        // pending offer as cancelled, clear its TTL timer, stop offering
        // further candidates. Already-billed leads stay billed (ruling 8 —
        // every offer is billed regardless of outcome; no refunds).
        const pending = abortChain(ride_id);
        if (pending) {
          sendToDriver(pending.driverId, {
            type: "offer:lost",
            ride_id,
            reason: "cancelled",
          });
        }
        // Phase F quote state 3: cancel drops the accept→start trace
        // without persisting a realized distance.
        unregisterRideTrace(ride_id);

        // Phase G: proximity driver-cancel → off-platform completion
        // detection at cancel + 30 min. `within_200m` is an optional body
        // field set by the root cancel route; when absent we fall back to
        // the ride row's driver_cancel_within_200m stamp (set inside the
        // root cancellation transaction per the Phase G plan).
        if (driver_id) {
          try {
            let proximity: boolean | undefined =
              typeof within_200m === "boolean" ? within_200m : undefined;
            if (proximity === undefined) {
              const [stampRow] = await db
                .select({ stamp: rides.driver_cancel_within_200m })
                .from(rides)
                .where(eq(rides.id, ride_id))
                .limit(1);
              proximity = stampRow?.stamp === true;
            }
            if (proximity) {
              scheduleOffPlatformDetection(ride_id, driver_id);
            }
          } catch (e: unknown) {
            logger.warn("[offPlatform] proximity stamp lookup failed", {
              ride_id,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // R3.3: auto-redispatch (design docs/Plan/redispatch-r3-3-design.md §2/§9).
        // Fire-and-forget — must never fail the cancel response. The trigger
        // notifies the rider (WS ride:status), waits auto_redispatch_delay_ms,
        // re-checks the ride is still 'dispatching' (rider may have cancelled
        // during the delay, §5), then starts a NEW dispatch pipeline for the
        // same ride_id; buildCandidateList's cumulative dispatch_offers
        // exclusion keeps previously-billed drivers out of the fresh pool (§3).
        if (redispatch === true) {
          const delayMs = await getPlan05Int("auto_redispatch_delay_ms", 15000);
          runRedispatchTrigger(ride_id, rider_user_id ?? null, {
            getRide: async (id) => {
              const [row] = await db.select().from(rides).where(eq(rides.id, id)).limit(1);
              return row ?? null;
            },
            dispatchPipeline: (ride) => dispatchRidePipeline(ride, false),
            notifyRider: (userId, msg) => sendToRider(userId, msg),
            delayMs,
          }).catch((e: unknown) =>
            logger.error("[redispatch] auto-redispatch failed", {
              ride_id,
              error: e instanceof Error ? e.message : String(e),
            }),
          );
        }
        writeJson(200, { ok: true });
      } catch {
        writeJson(400, { error: "invalid_body" });
      }
    });
    return;
  }

  if (req.url === "/internal/ride/started" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const { ride_id } = JSON.parse(body);
        if (!ride_id) {
          writeJson(400, { error: "missing_fields" });
          return;
        }
        // Phase F quote state 3: ride start closes the accept→start trace
        // window — persist realized km + confidence. The root
        // app/api/ride/[id]/start+api.ts route fires this fire-and-forget
        // (same convention as /internal/ride/completed); the WS ride:start
        // handler finalizes in-process when the driver starts over WS.
        try {
          await finalizeAndPersistPickupTrace(ride_id);
        } catch (e: unknown) {
          logger.error("[pickupTrace] finalize on /internal/ride/started failed", {
            ride_id,
            error: e instanceof Error ? e.message : String(e),
          });
        }
        writeJson(200, { ok: true });
      } catch {
        writeJson(400, { error: "invalid_body" });
      }
    });
    return;
  }

  writeJson(404, { error: "not_found" });
});

// ── WebSocket Server ───────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

wss.on("connection", (ws: WebSocket) => {
  const client: WSClient = { ws };
  allClients.set(ws, client);

  ws.on("message", async (raw) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: "error", message: "invalid_json" });
      return;
    }

    const type = msg.type as string;
    if (!type) {
      send(ws, { type: "error", message: "missing_type" });
      return;
    }

    const parts = type.split(":");
    const domain = parts[0];
    const action = parts[1] ?? "";

    if (domain !== "auth" && !client.userId) {
      send(ws, { type: "error", message: "not_authenticated" });
      return;
    }

    switch (domain) {
      /* ── Auth ──────────────────────────────────────────────────── */
      case "auth": {
        if (action === "hello") {
          const supabaseAccessToken = msg.access_token as string;
          const role = msg.role as "driver" | "rider" | "admin";
          if (!supabaseAccessToken || !role) {
            send(ws, { type: "auth:error", message: "missing_credentials" });
            return;
          }

          try {
            const {
              data: { user: supabaseUser },
              error,
            } = await supabaseAdmin.auth.getUser(supabaseAccessToken);
            if (error || !supabaseUser) {
              send(ws, { type: "auth:error", message: "invalid_token" });
              return;
            }

            const [user] = await db
              .select({ id: users.id, role: users.role })
              .from(users)
              .where(eq(users.auth_uid, supabaseUser.id))
              .limit(1);
            if (!user) {
              send(ws, { type: "auth:error", message: "user_not_found" });
              return;
            }
            if (
              (role === "driver" && user.role !== "driver") ||
              (role === "rider" && user.role !== "rider") ||
              (role === "admin" && user.role !== "admin")
            ) {
              send(ws, { type: "auth:error", message: "role_mismatch" });
              return;
            }

            client.userId = user.id;
            client.supabaseUid = supabaseUser.id;
            client.role = role;

            if (role === "driver") {
              const [driver] = await db
                .select({
                  id: drivers.id,
                  status: drivers.status,
                  h3_cell_res9: drivers.h3_cell_res9,
                  vehicle_type: drivers.vehicle_type,
                  last_location_lat: drivers.last_location_lat,
                  last_location_lng: drivers.last_location_lng,
                })
                .from(drivers)
                .where(eq(drivers.user_id, user.id))
                .limit(1);
              if (driver) {
                // BUG-R2 FIX: Reject non-active drivers on WS reconnect too
                if (driver.status !== 'active') {
                  send(ws, { type: "auth:error", message: "account_not_approved" });
                  logger.warn("[ws] driver auth rejected — not active", {
                    userId: user.id,
                    driverId: driver.id,
                    status: driver.status,
                  });
                  return;
                }
                client.driverId = driver.id;

                // One driver, one live socket. On reconnect, close the
                // previous socket (if any) so the orphan can't keep sending
                // heartbeats / answering offers as a second identity.
                const prevDriver = connectedDrivers.get(driver.id);
                if (prevDriver && prevDriver.ws !== ws) {
                  logger.info("[ws] closing previous socket on reconnect", {
                    driverId: driver.id,
                  });
                  prevDriver.ws.close();
                }
                connectedDrivers.set(driver.id, client);

                // PATCH 4: track driver session for utilization denominator
                try {
                  await db.insert(driverSessions).values({
                    driver_id: driver.id,
                    session_start: new Date(),
                  }).returning({ id: driverSessions.id }).then((rows) => {
                    client.driverSessionId = rows[0]?.id;
                  });
                } catch (e) {
                  logger.warn('[ws] driver_sessions insert failed', { driverId: driver.id, error: String(e) });
                }

                // Re-online driver on WS reconnect.
                await db.update(drivers)
                  .set({ is_online: true, updated_at: new Date() })
                  .where(eq(drivers.id, driver.id));

                // BUG FIX: Index driver immediately — don't wait for first heartbeat.
                // If h3_cell_res9 is NULL, compute from last known GPS coordinates.
                let cell = driver.h3_cell_res9;
                if (!cell && driver.last_location_lat != null && driver.last_location_lng != null) {
                  cell = getH3Cell(
                    Number(driver.last_location_lat),
                    Number(driver.last_location_lng),
                  );
                  // Persist the computed cell so refreshH3Index finds it too
                  await db.update(drivers)
                    .set({ h3_cell_res9: cell })
                    .where(eq(drivers.id, driver.id));
                }
                if (cell) {
                  updateDriver(driver.id, cell, driver.vehicle_type);
                }
                logger.info("[ws] driver indexed on auth", {
                  driverId: driver.id,
                  cell,
                  hasGps: driver.last_location_lat != null,
                });
              }
            } else if (role === "rider") {
              const prevRider = connectedRiders.get(user.id);
              if (prevRider && prevRider.ws !== ws) {
                prevRider.ws.close();
              }
              connectedRiders.set(user.id, client);
            } else {
              // Admin dashboard socket (F-15): receive-only SOS broadcasts.
              // No driver lookup, no H3 indexing, no online flag — admins are
              // never dispatchable. One admin, one live socket, same as riders.
              const prevAdmin = connectedAdmins.get(user.id);
              if (prevAdmin && prevAdmin.ws !== ws) {
                prevAdmin.ws.close();
              }
              connectedAdmins.set(user.id, client);
            }

            send(ws, { type: "auth:ok", user_id: user.id, role });
            logger.info("[ws] auth:hello success", { userId: user.id, role });
          } catch (e: any) {
            send(ws, { type: "auth:error", message: "invalid_token" });
            logger.warn("[ws] auth:hello failed", { error: e.message });
          }
        } else if (action === "refresh") {
          const supabaseAccessToken = msg.access_token as string;
          if (!supabaseAccessToken) {
            send(ws, { type: "auth:error", message: "missing_token" });
            return;
          }
          try {
            const {
              data: { user },
              error,
            } = await supabaseAdmin.auth.getUser(supabaseAccessToken);
            if (error || !user) {
              send(ws, { type: "auth:error", message: "token_expired" });
              ws.close();
              return;
            }
            send(ws, {
              type: "auth:ok",
              user_id: client.userId,
              role: client.role,
            });
          } catch {
            send(ws, { type: "auth:error", message: "token_expired" });
            ws.close();
          }
        }
        break;
      }

      /* ── Heartbeat / Location ──────────────────────────────────── */
      case "heartbeat": {
        const lat = msg.lat as number;
        const lng = msg.lng as number;
        if (client.role !== "driver" || !client.driverId) {
          send(ws, { type: "error", message: "not_a_driver" });
          return;
        }

        // Phase F/G: every driver GPS point feeds the 30-min ring buffer
        // (Phase G detection + live last-known position for the firm-quote
        // driver fix) and any active accept→start trace. Runs BEFORE the
        // 30s DB-persist throttle — recording must not be skipped.
        recordDriverPoint(client.driverId, lat, lng, parsePointTs(msg.ts));

        const cell = getH3Cell(lat, lng);
        logger.info('[ws] heartbeat', { driverId: client.driverId, lat, lng, cell });

        // Always update in-memory H3 index for accurate dispatch scoring
        const [driverRow] = await db
          .select({ vehicle_type: drivers.vehicle_type, zone_id: drivers.zone_id })
          .from(drivers)
          .where(eq(drivers.id, client.driverId))
          .limit(1);
        if (driverRow) {
          updateDriver(client.driverId, cell, driverRow.vehicle_type);
        }

        // Persist to DB every 30s (throttled in h3Index.ts)
        const now = Date.now();
        client.lastSeen = now; // refresh staleness tracker on every heartbeat
        const lastPersist = getLastPersist(client.driverId);
        if (now - lastPersist < 30_000) break;
        setLastPersist(client.driverId, now);

        // Z-4 + hysteresis: Resolve driver zone from heartbeat coordinates.
        // Uses getZoneForLocation which respects zone_multi_active_enabled:
        // - When multi-active: finds the smallest containing zone
        // - When single-active: falls back to getActiveZone()
        // Returns null zone_id when outside all zones or none configured.
        // 3-beat hysteresis: zone only changes after 3 consecutive heartbeats
        // resolve to the same zone, preventing border flicker.
        let resolvedZoneId: string | null = null;
        try {
          const zoneResult = await getZoneForLocation(lat, lng);
          resolvedZoneId = zoneResult.zone?.id ?? null;
        } catch (e: unknown) {
          logger.error('[ws] zone resolution failed for driver heartbeat', e);
        }

        // Fetch current DB zone for hysteresis comparison
        const currentZoneId: string | null = driverRow?.zone_id ?? null;

        // Outside all zones → immediately set null (no hysteresis needed)
        let finalZoneId = currentZoneId;
        if (resolvedZoneId === null) {
          if (currentZoneId !== null) {
            logger.info('[ws] driver left all zones — clearing zone_id', {
              driverId: client.driverId,
              prevZone: currentZoneId,
            });
            finalZoneId = null;
          }
          zoneHysteresis.delete(client.driverId);
        } else if (resolvedZoneId === currentZoneId) {
          // Same zone as DB — no change, clear hysteresis state
          zoneHysteresis.delete(client.driverId);
        } else {
          // Different zone from DB — apply hysteresis
          const hyst = zoneHysteresis.get(client.driverId);
          if (hyst && hyst.pending === resolvedZoneId) {
            // Same pending zone as last beat — increment
            hyst.beats += 1;
            if (hyst.beats >= ZONE_HYSTERESIS_BEATS) {
              logger.info('[ws] zone hysteresis threshold reached — updating', {
                driverId: client.driverId,
                from: currentZoneId,
                to: resolvedZoneId,
                beats: hyst.beats,
              });
              finalZoneId = resolvedZoneId;
              zoneHysteresis.delete(client.driverId);
            }
          } else {
            // New or different pending zone — reset counter
            zoneHysteresis.set(client.driverId, {
              pending: resolvedZoneId,
              beats: 1,
            });
          }
        }

        await db
          .update(drivers)
          .set({
            last_location_lat: String(lat),
            last_location_lng: String(lng),
            last_location_at: new Date(),
            h3_cell_res9: cell,
            zone_id: finalZoneId,
          })
          .where(eq(drivers.id, client.driverId));
        break;
      }

      case "location": {
        if (
          action === "update" &&
          client.role === "driver" &&
          client.driverId
        ) {
          // Phase F/G: ring buffer + active accept→start trace (same feed
          // as heartbeats — a driver has at most one traced ride).
          recordDriverPoint(
            client.driverId,
            msg.lat as number,
            msg.lng as number,
            parsePointTs(msg.ts),
          );

          // Forward to rider tracking this ride
          const rideId = msg.ride_id as string;
          if (rideId) {
            // Find rider tracking this ride
            for (const [, riderClient] of connectedRiders) {
              if (riderClient.subscribedRideId === rideId) {
                send(riderClient.ws, {
                  type: "location:driver",
                  ride_id: rideId,
                  lat: msg.lat,
                  lng: msg.lng,
                  ts: msg.ts,
                  eta_minutes: msg.eta_minutes ?? null,
                });
              }
            }
            // Detect route deviation (non-blocking). T-2: the deviation is
            // measured against the pickup→dropoff corridor (origin + dest),
            // and lib/safety dedupes to once per ride per cooldown window.
            try {
              const [ride] = await db
                .select({
                  origin_latitude: rides.origin_latitude,
                  origin_longitude: rides.origin_longitude,
                  destination_latitude: rides.destination_latitude,
                  destination_longitude: rides.destination_longitude,
                })
                .from(rides)
                .where(eq(rides.id, rideId))
                .limit(1);
              if (
                ride?.origin_latitude != null &&
                ride?.origin_longitude != null &&
                ride?.destination_latitude != null &&
                ride?.destination_longitude != null
              ) {
                await detectRouteDeviation(
                  rideId,
                  msg.lat as number,
                  msg.lng as number,
                  Number(ride.origin_latitude),
                  Number(ride.origin_longitude),
                  Number(ride.destination_latitude),
                  Number(ride.destination_longitude),
                );
              }
            } catch { /* non-blocking */ }
          }
        }
        break;
      }

      /* ── Driver ride response ──────────────────────────────────── */
      case "fetch": {
        if (
          action === "confirm" &&
          client.role === "driver" &&
          client.driverId
        ) {
          const rideId = msg.ride_id as string;
          if (!rideId) {
            send(ws, { type: "error", message: "missing_ride_id" });
            return;
          }

          // ── Offer lock: prevent duplicate deductions ──────────────
          const lockKey = `${rideId}:${client.driverId}`;
          if (offerLocks.has(lockKey)) {
            logger.debug("[ws] fetch:confirm duplicate dropped", {
              rideId,
              driverId: client.driverId,
              lockKey,
            });
            break;
          }
          offerLocks.set(lockKey, Date.now());
          logger.debug("[ws] offer lock set", { lockKey });

          // Auto-release after TTL
          setTimeout(() => {
            if (offerLocks.delete(lockKey)) {
              logger.debug("[ws] offer lock expired", { lockKey });
            }
          }, OFFER_LOCK_TTL_MS);

          // M-A: verify the offer exists and is still deliverable, WITHOUT
          // stamping outcome='accepted' — that stamp belongs to the real
          // accept (or 'rejected'/'expired' terminal states).
          const [offer] = await db
            .select({ id: dispatchOffers.id })
            .from(dispatchOffers)
            .where(
              and(
                eq(dispatchOffers.ride_id, rideId),
                eq(dispatchOffers.driver_id, client.driverId),
                eq(dispatchOffers.outcome, "delivered"),
              ),
            )
            .limit(1);
          if (!offer) {
            send(ws, { type: "fetch:error", ride_id: rideId, reason: "offer_expired" });
            return;
          }

          // Phase D / ruling 8: fetch:confirm is a TELEMETRY ACK ONLY.
          // Billing happened at offer time in leadBilling.ts — this handler
          // must not touch subscriptions or call_ledger at all. The only
          // state change is the fetch_confirmed_at stamp (card-seen
          // analytics).
          await db
            .update(dispatchOffers)
            .set({ fetch_confirmed_at: new Date() })
            .where(
              and(
                eq(dispatchOffers.ride_id, rideId),
                eq(dispatchOffers.driver_id, client.driverId),
                eq(dispatchOffers.outcome, "delivered"),
              ),
            );

          offerLocks.delete(lockKey);
          logger.debug("[ws] offer lock released", { lockKey });
          send(ws, { type: "fetch:confirmed", ride_id: rideId });
        }
        break;
      }

      case "offer": {
        if (
          action === "accept" &&
          client.role === "driver" &&
          client.driverId
        ) {
          const rideId = msg.ride_id as string;
          if (!rideId) {
            send(ws, { type: "error", message: "missing_ride_id" });
            return;
          }

          // Release the offer lock immediately — the driver has committed to accepting.
          offerLocks.delete(`${rideId}:${client.driverId}`);

          // Shared match flow (offer:accept + pipeline auto-accept). Returns
          // 'matched' | 'race_lost' | 'no_deduction'; handles the atomic
          // match guard, offer stamping, rider/driver notifications.
          const result = await executeMatchFlow(rideId, client.driverId, (m) => send(ws, m));

          if (result === "no_deduction") {
            // Revenue guard: never match a ride for a driver who was never
            // billed (every offered driver has a deduction row from offer
            // time in leadBilling.ts — ruling: debit-on-offer).
            send(ws, { type: "offer:rejected", ride_id: rideId, reason: "no_deduction" });
            return;
          }

          // Resolve the sequential chain's pending offer. 'accepted' stops
          // the chain as matched; 'accepted_elsewhere' (race lost) stops it
          // as inactive — the ride is no longer dispatching. Race losers
          // keep their lead billed (ruling 8 — AC-7 refunds are deleted).
          resolvePendingOffer(
            rideId,
            client.driverId,
            result === "matched" ? "accepted" : "accepted_elsewhere",
          );
        } else if (
          action === "reject" &&
          client.role === "driver" &&
          client.driverId
        ) {
          const rideId = msg.ride_id as string;
          const reason = msg.reason as string | undefined;

          // Release the offer lock — the driver has declined the offer.
          offerLocks.delete(`${rideId}:${client.driverId}`);

          // W-3: only flip the row if it is still in-flight ('delivered'). A
          // queued/duplicate reject arriving after the accept path stamped
          // outcome='accepted' must not overwrite the terminal state — that
          // corrupted acceptance analytics and the acceptance-rate feed.
          await db
            .update(dispatchOffers)
            .set({
              outcome: "rejected",
              responded_at: new Date(),
              rejection_reason: reason ?? null,
            })
            .where(
              and(
                eq(dispatchOffers.ride_id, rideId),
                eq(dispatchOffers.driver_id, client.driverId),
                eq(dispatchOffers.outcome, "delivered"),
              ),
            );

          send(ws, { type: "offer:rejected", ride_id: rideId });

          // Sequential chain: the declined offer is settled — the pipeline
          // moves on to the next candidate. The lead stays billed.
          resolvePendingOffer(rideId, client.driverId, "rejected");

          // Background acceptance rate update
          updateDriverAcceptanceRate(client.driverId).catch((e) =>
            logger.error("[ws] update acceptance rate failed", {
              driverId: client.driverId,
              error: e.message,
            }),
          );
        }
        break;
      }

      /* ── Ride subscription (rider tracking a ride) ─────────────── */
      case "ride": {
        if (action === "subscribe" && client.role === "rider") {
          client.subscribedRideId = msg.ride_id as string;
        } else if (action === "unsubscribe" && client.role === "rider") {
          client.subscribedRideId = undefined;
        } else if (
          action === "arrived" &&
          client.role === "driver" &&
          client.driverId
        ) {
          // Driver reached the pickup -> mark driver_arrived, notify rider
          const rideId = msg.ride_id as string;
          if (!rideId) {
            send(ws, { type: "error", message: "missing_ride_id" });
            break;
          }

          const [ride] = await db.select({ driver_id: rides.driver_id, status: rides.status })
            .from(rides).where(eq(rides.id, rideId)).limit(1);
          if (!ride || ride.driver_id !== client.driverId) {
            send(ws, { type: "error", message: "not_your_ride" });
            break;
          }

          const [updatedRide] = await db
            .update(rides)
            .set({ status: "driver_arrived", arrived_at: new Date() })
            .where(and(eq(rides.id, rideId), inArray(rides.status, ['matched', 'driver_arriving'])))
            .returning({ id: rides.id, user_id: rides.user_id });
          if (!updatedRide) {
            send(ws, { type: "error", message: "invalid_state_transition" });
            break;
          }
          sendToRider(updatedRide.user_id, {
            type: "ride:status",
            ride_id: rideId,
            status: "driver_arrived",
          });
          // Push notification (plan §B13 broadcast matrix) — fire-and-forget;
          // an Expo push failure must never fail the WS transition.
          sendNotification(
            updatedRide.user_id,
            "driver:arrived",
            "Your driver has arrived",
            "Meet your driver at the pickup point.",
            { ride_id: rideId },
          ).catch((e: unknown) =>
            logger.error("[ws] driver_arrived push failed", {
              ride_id: rideId,
              error: e instanceof Error ? e.message : String(e),
            }),
          );
          send(ws, { type: "ride:arrived", ride_id: rideId });
        } else if (
          action === "start" &&
          client.role === "driver" &&
          client.driverId
        ) {
          // Driver entered the ride-start PIN -> verify, then start the ride
          const rideId = msg.ride_id as string;
          const pin = (msg.pin as string)?.trim();
          if (!rideId) {
            send(ws, { type: "error", message: "missing_ride_id" });
            break;
          }
          const [startRide] = await db
            .select({
              start_pin: rides.start_pin,
              status: rides.status,
              user_id: rides.user_id,
              driver_id: rides.driver_id,
            })
            .from(rides)
            .where(eq(rides.id, rideId))
            .limit(1);
          if (!startRide) {
            send(ws, { type: "error", message: "ride_not_found" });
            break;
          }
          if (startRide.driver_id !== client.driverId) {
            send(ws, { type: "error", message: "not_your_ride" });
            break;
          }
          if (!startRide.start_pin || startRide.start_pin !== pin) {
            send(ws, {
              type: "ride:start_failed",
              ride_id: rideId,
              error: "invalid_pin",
            });
            break;
          }
          const [updatedRide] = await db
            .update(rides)
            .set({ status: "in_progress", started_at: new Date() })
            .where(and(eq(rides.id, rideId), inArray(rides.status, ['matched', 'driver_arriving', 'driver_arrived'])))
            .returning({ id: rides.id });
          if (!updatedRide) {
            send(ws, { type: "error", message: "invalid_state_transition" });
            break;
          }
          // Phase F quote state 3: ride start closes the accept→start trace
          // window — persist realized km + confidence (fire-and-forget; the
          // completion step reads them minutes later).
          finalizeAndPersistPickupTrace(rideId).catch((e) =>
            logger.error("[pickupTrace] finalize on WS ride:start failed", {
              ride_id: rideId,
              error: e instanceof Error ? e.message : String(e),
            }),
          );
          sendToRider(startRide.user_id, {
            type: "ride:status",
            ride_id: rideId,
            status: "in_progress",
          });
          send(ws, { type: "ride:started", ride_id: rideId });
        }
        // NOTE: there is deliberately NO WS "complete" action. Completing a
        // ride must go through POST /api/ride/[id]/complete, which settles
        // the fare, wallets, ledger, and accounting in one place. The old
        // legacy ride:complete WS handler flipped status with no settlement
        // and was removed (pass 20). finish-ride calls the HTTP endpoint.
        break;
      }

      /* ── Chat ──────────────────────────────────────────────────── */
      case "chat": {
        if (action === "typing") {
          const rideId = msg.ride_id as string;
          const recipientUserId = msg.recipient_user_id as string;
          const isTyping = msg.is_typing as boolean;
          const senderUserId = client.userId;
          if (!rideId || !recipientUserId) {
            send(ws, { type: "error", message: "missing_chat_fields" });
            return;
          }
          if (!senderUserId) {
            send(ws, { type: "error", message: "not_authenticated" });
            return;
          }
          // S-1: never forward typing to an arbitrary user ID. The recipient
          // must be the OTHER party of the ride and the sender a participant
          // — otherwise this endpoint is a live-user oracle / spam vector.
          const [ride] = await db
            .select({ user_id: rides.user_id, driver_id: rides.driver_id })
            .from(rides)
            .where(eq(rides.id, rideId))
            .limit(1);
          if (!ride) {
            send(ws, { type: "error", message: "ride_not_found" });
            return;
          }
          // The ride stores the driver's drivers.id; resolve it to their
          // users.id so both participants are compared in the same ID space.
          const [driverUser] = ride.driver_id
            ? await db
                .select({ user_id: drivers.user_id })
                .from(drivers)
                .where(eq(drivers.id, ride.driver_id))
                .limit(1)
            : [];
          const participants = new Set<string>([ride.user_id]);
          if (driverUser?.user_id) participants.add(driverUser.user_id);
          if (
            !participants.has(senderUserId) ||
            !participants.has(recipientUserId) ||
            recipientUserId === senderUserId
          ) {
            send(ws, { type: "error", message: "not_ride_participant" });
            return;
          }
          sendToUser(recipientUserId, {
            type: "chat:typing",
            ride_id: rideId,
            sender_user_id: senderUserId,
            is_typing: isTyping,
          });
        }
        break;
      }

      /* ── Rental marketplace ──────────────────────────────────── */
      case "rental": {
        try {
          const { handleRentalMessage } = await import("./rentalHandler");
          await handleRentalMessage(
            ws,
            `${domain}:${action}`,
            msg.payload as Record<string, unknown> ?? {},
            (target, event, payload) => send(target, { type: event, ...(payload as Record<string, unknown>) }),
            { userId: client.userId },
          );
        } catch (err) {
          logger.error("[ws] rental handler error", err);
          send(ws, { type: "error", message: "rental_handler_error" });
        }
        break;
      }

      /* ── Shop marketplace ─────────────────────────────────────── */
      case "shop": {
        try {
          const { handleShopMessage } = await import("./shopHandler");
          handleShopMessage(
            ws,
            `${domain}:${action}`,
            msg.payload as Record<string, unknown> ?? {},
            (target, event, payload) => send(target, { type: event, ...(payload as Record<string, unknown>) }),
          );
        } catch (err) {
          logger.error("[ws] shop handler error", err);
          send(ws, { type: "error", message: "shop_handler_error" });
        }
        break;
      }

      case "delivery": {
        try {
          const { handleDeliveryMessage } = await import("./deliveryHandler");
          handleDeliveryMessage(
            ws,
            `${domain}:${action}`,
            msg.payload as Record<string, unknown> ?? {},
            (target, event, payload) => send(target, { type: event, ...(payload as Record<string, unknown>) }),
            { userId: client.userId },
          );
        } catch (err) {
          logger.error("[ws] delivery handler error", err);
          send(ws, { type: "error", message: "delivery_handler_error" });
        }
        break;
      }

      /* ── Emergency ambulance (Phase 6) ────────────────────────── */
      case "emergency": {
        try {
          const { handleEmergencyMessage } = await import("./emergencyHandler");
          handleEmergencyMessage(
            ws,
            `${domain}:${action}`,
            msg.payload as Record<string, unknown> ?? {},
            (target, event, payload) => send(target, { type: event, ...(payload as Record<string, unknown>) }),
            { userId: client.userId },
          );
        } catch (err) {
          logger.error("[ws] emergency handler error", err);
          send(ws, { type: "error", message: "emergency_handler_error" });
        }
        break;
      }

      default:
        send(ws, { type: "error", message: `unknown_type: ${type}` });
    }
  });

  ws.on("close", () => {
    handleDisconnect(client).catch((e) =>
      logger.error("[ws] cleanup error", e),
    );
    allClients.delete(ws);
  });

  ws.on("error", (err) => {
    logger.error("[ws] connection error", err);
  });
});

// ── Disconnect Handler ─────────────────────────────────────────────────────
async function handleDisconnect(client: WSClient) {
  if (client.driverId) {
    // BUG FIX: Only tear down if THIS socket is still the registered one.
    // A newer reconnect will have replaced the map entry — don't wipe it.
    if (connectedDrivers.get(client.driverId) === client) {
      await handleDriverDisconnect(client.driverId);
      connectedDrivers.delete(client.driverId);
    }
  }
  if (client.role === "rider" && client.userId) {
    // Same guard for riders
    if (connectedRiders.get(client.userId) === client) {
      connectedRiders.delete(client.userId);
      // Cancel orphaned dispatching rides on rider disconnect, but only
      // if the ride has been in dispatching status for >5 seconds to avoid
      // racing with a driver accept that lands between the query and the
      // dispatch pipeline status update.
      const cancelled = await db
        .update(rides)
        .set({ status: "cancelled", cancelled_by: "system" })
        .where(
          and(
            eq(rides.user_id, client.userId),
            eq(rides.status, "dispatching"),
            sql`${rides.updated_at} < now() - interval '5 seconds'`,
          ),
        )
        .returning({ id: rides.id });
      // Abort any in-memory chains for the cancelled rides — don't wait for
      // the between-offers status re-check to catch it.
      for (const c of cancelled) {
        abortChain(c.id);
      }
    }
  }
  if (client.role === "admin" && client.userId) {
    // Same guard for admins (F-15): only tear down if THIS socket is still
    // the registered one — a newer reconnect must not be wiped.
    if (connectedAdmins.get(client.userId) === client) {
      connectedAdmins.delete(client.userId);
    }
  }
  logger.info("[ws] connection closed", {
    userId: client.userId,
    role: client.role,
  });
}

async function handleDriverDisconnect(driverId: string) {
  // Sequential chain: a disconnecting driver's outstanding offer resolves
  // immediately as 'disconnected' (treated like expiry — no dead TTL wait on
  // a gone driver; the lead stays billed, pipeline offers the next driver).
  resolvePendingOfferForDriver(driverId, "disconnected");

  // Clean up zone hysteresis state
  zoneHysteresis.delete(driverId);

  // Close online session
  await db
    .update(driverOnlineSessions)
    .set({
      went_offline_at: new Date(),
      duration_minutes: 0, // will be recomputed by scheduler or next query
    })
    .where(
      and(
        eq(driverOnlineSessions.driver_id, driverId),
        isNull(driverOnlineSessions.went_offline_at),
      ),
    );

  // PATCH 4: close driver_sessions row for utilization denominator
  const client = connectedDrivers.get(driverId);
  if (client?.driverSessionId) {
    const sessionRow = await db
      .select({ session_start: driverSessions.session_start })
      .from(driverSessions)
      .where(eq(driverSessions.id, client.driverSessionId))
      .limit(1);
    const onlineMs = sessionRow[0]
      ? Date.now() - new Date(sessionRow[0].session_start).getTime()
      : 0;
    await db
      .update(driverSessions)
      .set({
        session_end: new Date(),
        online_minutes: Math.round(onlineMs / 60_000),
      })
      .where(eq(driverSessions.id, client.driverSessionId));
  }

  // M1: Mark driver offline to prevent ghost entries in candidate pool.
  // BUG FIX: Only flip is_online if no live connection exists (reconnect race).
  if (!connectedDrivers.has(driverId)) {
    await db
      .update(drivers)
      .set({ is_online: false, updated_at: new Date() })
      .where(eq(drivers.id, driverId));
  }
}

// ── Pickup Distance / ETA Helpers ──────────────────────────────────────────

async function computePickupMetrics(
  driverLat: number | null,
  driverLng: number | null,
  pickupLat: number,
  pickupLng: number,
  vehicleType: string,
): Promise<{ distanceKm: number; etaMinutes: number }> {
  if (driverLat == null || driverLng == null) {
    return { distanceKm: 0, etaMinutes: 0 };
  }
  const dist = haversineKm(driverLat, driverLng, pickupLat, pickupLng);
  const eta = await estimateEtaMinutes(dist, vehicleType);
  return { distanceKm: dist, etaMinutes: eta };
}

// ── Phase F quote state 2: firm pickup quote at accept ─────────────────────
interface FirmQuoteRideInfo {
  user_id: string;
  origin_latitude: unknown;
  origin_longitude: unknown;
  vehicle_type: string;
  zone_id: string | null;
  fare_breakdown: unknown;
  pickup_fee_high_bdt: number | null;
}

interface FirmQuoteOutcome {
  result: ReturnType<typeof computeFirmQuote>;
  feeEnabled: boolean;
  /** Teleport-filter threshold snapshot for trace registration. */
  maxSegmentSpeedKmh: number;
  driverFix: TracePoint | null;
}

/**
 * Gather everything the firm quote needs (config, live driver fix, zone
 * rate, road-network route) and decide via the pure computeFirmQuote.
 * Returns null when the measurement layer is off (ruling 16 — the fee flag
 * alone never gates this) or the pickup pin is unusable. Failures inside
 * degrade to low-confidence figures rather than aborting the match.
 */
async function computeFirmPickupQuoteAtAccept(
  ride: FirmQuoteRideInfo,
  driverId: string,
  dbDriverFix: { lat: number | null; lng: number | null; at: number | null },
): Promise<FirmQuoteOutcome | null> {
  const cfg = await getFareFrameworkConfig([
    "pickup_measurement_enabled",
    "pickup_fee_enabled",
    "pickup_free_radius_km_bike", "pickup_free_radius_km_cng", "pickup_free_radius_km_car",
    "pickup_cap_billable_km_bike", "pickup_cap_billable_km_cng", "pickup_cap_billable_km_car",
    "pickup_cap_pct_of_fare",
    "pickup_trace_max_segment_speed_kmh",
  ]);
  const measurementEnabled = parseConfigBool(cfg.pickup_measurement_enabled);
  const feeEnabled = parseConfigBool(cfg.pickup_fee_enabled);
  if (!measurementEnabled) return null; // both flags off → skip entirely

  const pickupLat = parseFloat(ride.origin_latitude?.toString() ?? "");
  const pickupLng = parseFloat(ride.origin_longitude?.toString() ?? "");
  if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) {
    return null; // unusable pickup pin — no quote, no trace anchor
  }

  const category = PICKUP_CATEGORY[ride.vehicle_type as VehicleTypeEnum] ?? "car";
  const freeRadiusKm = parseConfigNumber(cfg[`pickup_free_radius_km_${category}`], 0);
  const capBillableKm = parseConfigNumber(cfg[`pickup_cap_billable_km_${category}`], 2.0);
  const capPct = parseConfigNumber(cfg.pickup_cap_pct_of_fare, 40);
  const maxSegmentSpeedKmh = parseConfigNumber(cfg.pickup_trace_max_segment_speed_kmh, 80);

  // Driver fix (ruling 11): utils-server's live last-known position from the
  // GPS ring buffer; fallback to drivers.last_location_* (updated on the
  // 30 s-throttled heartbeat persist) with its own staleness timestamp.
  let driverFix: TracePoint | null = getLastDriverPoint(driverId);
  if (!driverFix && dbDriverFix.lat != null && dbDriverFix.lng != null) {
    driverFix = {
      lat: dbDriverFix.lat,
      lng: dbDriverFix.lng,
      // Unknown/missing timestamp → 0 → treated as stale → low confidence.
      at: dbDriverFix.at ?? 0,
    };
  }

  // Road-network route call — only when the fix is fresh (a stale fix makes
  // the route origin meaningless; low-confidence path handles it).
  const fixFresh = driverFix != null && Date.now() - driverFix.at <= DRIVER_FIX_STALE_MS;
  let routeKm: number | null = null;
  if (fixFresh && driverFix) {
    const route = await getFirmRouteKm(driverFix.lat, driverFix.lng, pickupLat, pickupLng);
    routeKm = route?.distanceKm ?? null;
  }

  // Zone per-km rate (same lookup as the dispatch pipeline + request route;
  // rides.zone_id is NOT NULL). Missing row → rate 0 → fee 0 (mirrors the
  // offer-card estimate path — a dispatched ride always has pricing).
  let zonePerKmPaisa = 0;
  if (ride.zone_id != null) {
    const [zonePricingRow] = await db
      .select({ per_km_bdt: pricing.per_km_bdt })
      .from(pricing)
      .where(and(
        eq(pricing.vehicle_type, ride.vehicle_type as any), // Drizzle enum cast (AGENTS.md)
        eq(pricing.zone_id, ride.zone_id),
        eq(pricing.is_active, true),
      ))
      .limit(1);
    zonePerKmPaisa = zonePricingRow?.per_km_bdt ?? 0;
  }

  // Request-time trip fare (ruling 18 backstop basis) — the stored
  // fare_breakdown snapshot, NOT recomputed.
  const tripFareAtRequestPaisa = Number(
    (ride.fare_breakdown as Record<string, unknown> | null)?.total_bdt ?? 0,
  );

  const result = computeFirmQuote({
    measurementEnabled: true,
    feeEnabled,
    driverFix,
    nowMs: Date.now(),
    pickupLat,
    pickupLng,
    quotedHighPaisa: ride.pickup_fee_high_bdt ?? null,
    freeRadiusKm,
    capBillableKm,
    ratePerKmPaisa: ratePerKmPaisa(zonePerKmPaisa, category),
    capPct,
    tripFareAtRequestPaisa,
    routeKm,
  });

  return { result, feeEnabled, maxSegmentSpeedKmh, driverFix };
}

// ── Match flow (shared by offer:accept handler and pipeline auto-accept) ──
// Atomic match WHERE status='dispatching' → stamp offer 'accepted' → notify
// rider (PIN + driver info + exact dropoff reveal) and driver (offer:accepted
// + dropoff reveal). Returns 'matched' on success, 'race_lost' when another
// path matched first (driver gets offer:lost; lead stays billed — ruling 8),
// 'no_deduction' when the driver was never billed (revenue guard).
async function executeMatchFlow(
  rideId: string,
  driverId: string,
  sendToDriverSocket: (msg: Record<string, unknown>) => void,
): Promise<"matched" | "race_lost" | "no_deduction"> {
  const [driverRow] = await db
    .select({
      name: users.name,
      phone: users.phone,
      rating: drivers.rating,
      vehicle_type: drivers.vehicle_type,
      last_location_lat: drivers.last_location_lat,
      last_location_lng: drivers.last_location_lng,
      last_location_at: drivers.last_location_at,
    })
    .from(drivers)
    .innerJoin(users, eq(users.id, drivers.user_id))
    .where(eq(drivers.id, driverId))
    .limit(1);

  // Generate a 4-digit ride-start PIN (rider reads aloud, driver enters it)
  const startPin = String(crypto.randomInt(1000, 10000));

  // Revenue guard: never match a ride for a driver who was never billed.
  // Under debit-on-offer every offered driver has a call_ledger deduction
  // row from offer time (leadBilling.ts); a client that sends offer:accept
  // directly with no billing history would otherwise match for free.
  const [deductionRow] = await db.select({ id: callLedger.id })
    .from(callLedger)
    .where(and(
      eq(callLedger.ride_id, rideId),
      eq(callLedger.driver_id, driverId),
      eq(callLedger.event_type, 'deduction'),
    ))
    .limit(1);
  if (!deductionRow) {
    return "no_deduction";
  }

  // Fetch the ride row BEFORE the match commit — the firm pickup quote
  // (Phase F quote state 2) computes here and persists in the SAME update
  // as the match (single-row write: a lost race persists nothing).
  const [ride] = await db
    .select({
      user_id: rides.user_id,
      origin_latitude: rides.origin_latitude,
      origin_longitude: rides.origin_longitude,
      destination_address: rides.destination_address,
      destination_latitude: rides.destination_latitude,
      destination_longitude: rides.destination_longitude,
      vehicle_type: rides.vehicle_type,
      zone_id: rides.zone_id,
      fare_breakdown: rides.fare_breakdown,
      pickup_fee_high_bdt: rides.pickup_fee_high_bdt,
    })
    .from(rides)
    .where(eq(rides.id, rideId))
    .limit(1);

  // Phase F quote state 2 — firm at accept, BEFORE the match commit.
  // Ruling 16: with the fee off (Stage 0) the figures are still computed
  // and persisted (internal, no rider-facing number); the completion step
  // decides whether to charge. A computation failure degrades to skipping
  // the firm figures — it must never block the match itself.
  let firm: FirmQuoteOutcome | null = null;
  if (ride) {
    try {
      firm = await computeFirmPickupQuoteAtAccept(ride, driverId, {
        lat: driverRow?.last_location_lat != null ? Number(driverRow.last_location_lat) : null,
        lng: driverRow?.last_location_lng != null ? Number(driverRow.last_location_lng) : null,
        at: driverRow?.last_location_at != null
          ? new Date(driverRow.last_location_at).getTime()
          : null,
      });
    } catch (e: unknown) {
      logger.warn("[firmQuote] computation failed — matching without firm figures", {
        ride_id: rideId,
        driverId,
        error: e instanceof Error ? e.message : String(e),
      });
      firm = null;
    }
  }

  // Atomic match guard: the WHERE clause on status='dispatching' ensures
  // that only the first driver to accept wins. If two paths accept
  // concurrently, the second UPDATE affects zero rows → 'race_lost'.
  // Defense-in-depth: the partial unique indexes on dispatch_offers
  // (ride_id, driver_id) and call_ledger (ride_id, driver_id) WHERE
  // event_type='deduction' make any re-entry exactly-once.
  const [updatedRide] = await db
    .update(rides)
    .set({
      driver_id: driverId,
      status: "matched",
      matched_at: new Date(),
      start_pin: startPin,
      // Firm pickup figures persist atomically with the match commit
      // (same update — transactionally clean single-row write).
      ...(firm && !firm.result.skipped
        ? {
            pickup_fee_state: "firm" as const,
            pickup_fee_firm_bdt: firm.result.firmFeePaisa,
            pickup_firm_km: firm.result.firmKm.toFixed(3),
            pickup_accept_lat:
              firm.result.acceptLat != null ? firm.result.acceptLat.toFixed(7) : null,
            pickup_accept_lng:
              firm.result.acceptLng != null ? firm.result.acceptLng.toFixed(7) : null,
          }
        : {}),
    })
    .where(and(eq(rides.id, rideId), eq(rides.status, "dispatching")))
    .returning({ id: rides.id });
  if (!updatedRide) {
    // Race lost: the ride was matched by another path. The losing driver's
    // lead STAYS BILLED (ruling 8 — every offer is billed regardless of
    // outcome; AC-7 refunds are deleted). No refund rows, no 'refunded'
    // stamp — the offer row is flipped to 'expired' by the chain's
    // onSettled / the stale-offer sweep.
    sendToDriverSocket({ type: "offer:lost", ride_id: rideId, reason: "accepted_elsewhere" });
    return "race_lost";
  }

  // Mark this driver's offer as accepted (only after ride is successfully matched)
  await db
    .update(dispatchOffers)
    .set({
      outcome: "accepted",
      responded_at: new Date(),
    })
    .where(
      and(
        eq(dispatchOffers.ride_id, rideId),
        eq(dispatchOffers.driver_id, driverId),
      ),
    );

  // Close any other still-delivered offers for this ride (leftovers from a
  // crashed pre-Phase-D broadcast or a stale chain) — sequential chains have
  // exactly one outstanding offer, so this is normally empty.
  const offeredDrivers = await db
    .select({ driver_id: dispatchOffers.driver_id })
    .from(dispatchOffers)
    .where(
      and(
        eq(dispatchOffers.ride_id, rideId),
        eq(dispatchOffers.outcome, "delivered"),
      ),
    );
  for (const od of offeredDrivers) {
    if (od.driver_id !== driverId) {
      sendToDriver(od.driver_id, {
        type: "offer:lost",
        ride_id: rideId,
        reason: "accepted_elsewhere",
      });
    }
  }

  // Phase F quote state 3: register the accept→start trace at match commit
  // (measurement mode — `firm` non-null implies measurement on). Seed with
  // the accept-time driver fix only when fresh; a stale anchor would poison
  // the first segment's teleport filter.
  if (firm) {
    const seed =
      firm.driverFix && Date.now() - firm.driverFix.at <= DRIVER_FIX_STALE_MS
        ? firm.driverFix
        : undefined;
    registerRideTrace(rideId, driverId, firm.maxSegmentSpeedKmh, seed);
  }

  // Notify rider — includes the EXACT dropoff reveal (post-accept only,
  // Stage 2 destination-reveal rule).
  if (ride) {
    if (driverRow?.last_location_lat != null) {
      const dLat = Number(driverRow.last_location_lat);
      const dLng = Number(driverRow.last_location_lng ?? 0);
      const pLat = parseFloat(ride.origin_latitude?.toString() ?? "0");
      const pLng = parseFloat(ride.origin_longitude?.toString() ?? "0");
      const dist = haversineKm(dLat, dLng, pLat, pLng);
      const etaMin = await estimateEtaMinutes(dist, driverRow.vehicle_type);
      await db.update(rides).set({ eta_minutes: etaMin }).where(eq(rides.id, rideId));
    }
    const dropoffReveal = {
      address: ride.destination_address,
      lat: parseFloat(ride.destination_latitude?.toString() ?? "0"),
      lng: parseFloat(ride.destination_longitude?.toString() ?? "0"),
    };
    // Firm fee reaches the rider ONLY when the charge flag is on (ruling 16
    // — Stage 0 measurement is internal). Integer paisa.
    const includeFirmFee = !!(firm && !firm.result.skipped && firm.feeEnabled);
    // Tell the rider a driver was found, with the PIN (to read aloud)
    // and the driver info. The rider app listens for "ride:status".
    sendToRider(ride.user_id, {
      type: "ride:status",
      ride_id: rideId,
      status: "matched",
      pin: startPin,
      dropoff: dropoffReveal,
      ...(includeFirmFee ? { pickup_fee_firm_bdt: firm!.result.firmFeePaisa } : {}),
      ride: {
        driver: {
          name: driverRow?.name ?? "",
          phone: driverRow?.phone ?? "",
          rating: driverRow?.rating != null ? parseFloat(driverRow.rating) : null,
          vehicle_type: driverRow?.vehicle_type ?? "",
        },
      },
    });

    // Push notification to rider (in case app is backgrounded). Uses
    // the shared lib/notify module so dedupe, the notifications audit
    // row, and dead-token pruning stay in one place (audit U-2). The firm
    // fee rides the existing data payload only when the fee is enabled.
    sendNotification(
      ride.user_id,
      "ride:matched",
      "Driver Found",
      `${driverRow?.name ?? "Your driver"} is on the way!`,
      includeFirmFee
        ? { ride_id: rideId, pickup_fee_firm_bdt: String(firm!.result.firmFeePaisa) }
        : { ride_id: rideId },
    );

    // Confirm acceptance to the driver — with the exact dropoff reveal
    // (post-accept only). The PIN is NOT sent here — the driver must get it
    // verbally from the rider; the server verifies the driver's entry
    // against rides.start_pin on "ride:start".
    sendToDriverSocket({ type: "offer:accepted", ride_id: rideId, dropoff: dropoffReveal });
  }

  // Background acceptance rate update
  updateDriverAcceptanceRate(driverId).catch((e) =>
    logger.error("[ws] update acceptance rate failed", {
      driverId,
      error: e.message,
    }),
  );

  return "matched";
}

// ── Dispatch Pipeline (sequential chain — Phase D, debit-on-offer) ─────────
async function dispatchRidePipeline(
  ride: typeof rides.$inferSelect,
  allowDowngrade = false,
) {

  // Pre-fetch rider name, rating and phone once for all batches (phone feeds
  // the driver's Call button — H-A).
  const [rider] = await db
    .select({ name: users.name, rating: users.rating, phone: users.phone })
    .from(users)
    .where(eq(users.id, ride.user_id))
    .limit(1);
  const riderFirstName = rider?.name?.split(" ")[0] ?? "Rider";
  const riderRating = rider?.rating != null ? Number(rider.rating) : null;
  const isScheduled = ride.scheduled_at != null;

  const pickupLat = parseFloat(ride.origin_latitude?.toString() ?? "");
  const pickupLng = parseFloat(ride.origin_longitude?.toString() ?? "");

  // Abort if origin coordinates are missing/invalid — dispatching to (0,0)
  // would search the Atlantic Ocean for drivers.
  if (isNaN(pickupLat) || isNaN(pickupLng) || (pickupLat === 0 && pickupLng === 0)) {
    logger.error('[dispatch] ride has invalid origin coordinates, aborting pipeline', {
      ride_id: ride.id,
      origin_latitude: ride.origin_latitude,
      origin_longitude: ride.origin_longitude,
    });
    await db.update(rides).set({ status: 'expired' }).where(eq(rides.id, ride.id));
    sendToRider(ride.user_id, {
      type: 'ride:expired',
      ride_id: ride.id,
      reason: 'invalid_pickup_coordinates',
    });
    return;
  }

  const ridePrefIds = (ride.preference_ids as string[]) ?? [];
  const destLat = parseFloat(ride.destination_latitude ?? '0');
  const destLng = parseFloat(ride.destination_longitude ?? '0');
  let candidates = await buildCandidateList(
    ride.id,
    pickupLat,
    pickupLng,
    destLat,
    destLng,
    ride.vehicle_type,
    ride.zone_id,
    ridePrefIds,
  );

  // ── Retry logic: if zero candidates, wait and retry once ─────────────
  // Handles the race where the driver's first heartbeat location update
  // hasn't reached the in-memory H3 index yet (e.g., driver just toggled
  // online and the heartbeat interval hasn't fired yet).
  if (candidates.length === 0) {
    logger.debug('[dispatch] zero candidates, retrying after 1.5s delay', { ride_id: ride.id });
    await new Promise((r) => setTimeout(r, 1500));
    candidates = await buildCandidateList(
      ride.id,
      pickupLat,
      pickupLng,
      destLat,
      destLng,
      ride.vehicle_type,
      ride.zone_id,
      ridePrefIds,
    );
  }

  if (candidates.length === 0) {
    await handleNoDrivers(ride, allowDowngrade);
    return;
  }

  // ── Offer TTL + pickup-fee config (fresh read; platform_config) ──────
  const frameworkCfg = await getFareFrameworkConfig([
    'dispatch_offer_ttl_seconds',
    'pickup_fee_enabled',
    'pickup_free_radius_km_bike', 'pickup_free_radius_km_cng', 'pickup_free_radius_km_car',
    'pickup_cap_billable_km_bike', 'pickup_cap_billable_km_cng', 'pickup_cap_billable_km_car',
  ]);
  const ttlMs = parseConfigNumber(frameworkCfg.dispatch_offer_ttl_seconds, 15) * 1000;
  const pickupFeeEnabled = parseConfigBool(frameworkCfg.pickup_fee_enabled);

  const pickupCategory = PICKUP_CATEGORY[ride.vehicle_type as VehicleTypeEnum] ?? 'car';
  const freeRadiusKm = parseConfigNumber(frameworkCfg[`pickup_free_radius_km_${pickupCategory}`], 0);
  const capBillableKm = parseConfigNumber(frameworkCfg[`pickup_cap_billable_km_${pickupCategory}`], 2.0);

  // Zone per-km rate for this ride's vehicle type (pickup fee estimate basis).
  const [zonePricingRow] = await db
    .select({ per_km_bdt: pricing.per_km_bdt })
    .from(pricing)
    .where(and(
      eq(pricing.vehicle_type, ride.vehicle_type as any),
      eq(pricing.zone_id, ride.zone_id),
      eq(pricing.is_active, true),
    ))
    .limit(1);
  const zonePerKmPaisa = zonePricingRow?.per_km_bdt ?? 0;

  // ── Drop ZONE (never the exact address) + heat tag for the offer card ──
  // Lever 1: pre-accept the driver sees only the drop zone + coarse heat tag
  // (ruling: exact destination reveal is post-accept only).
  const dropZoneId = ride.drop_zone_id ?? null;
  const dropZoneHeatRaw = ride.drop_zone_heat;
  const dropZoneHeatTag: 'hot' | 'neutral' | 'cold' =
    dropZoneHeatRaw === 'hot' || dropZoneHeatRaw === 'cold'
      ? dropZoneHeatRaw
      : dropZoneId ? 'neutral' : 'cold'; // outside all zones = coldest (ruling 13)
  let dropZoneName: string | null = null;
  if (dropZoneId) {
    const [zoneRow] = await db
      .select({ name: zones.name })
      .from(zones)
      .where(eq(zones.id, dropZoneId))
      .limit(1);
    dropZoneName = zoneRow?.name ?? null;
  }

  // Fetch stop addresses once per ride
  const stopRows = await db
    .select({ address: rideStops.address, stop_order: rideStops.stop_order })
    .from(rideStops)
    .where(eq(rideStops.ride_id, ride.id));
  const stopList = stopRows.map((s) => ({ address: s.address, stop_order: s.stop_order }));

  const result = await runSequentialChain(
    ride.id,
    candidates.map((c) => ({
      driverId: c.driverId,
      auto_accept_eligible: c.auto_accept_eligible,
    })),
    {
      isDriverConnected: (driverId) => {
        const client = connectedDrivers.get(driverId);
        return !!client && client.ws.readyState === WebSocket.OPEN;
      },

      // Between offers: re-check ride status from DB — rider cancel, system
      // expire, or a match by another path aborts the chain.
      isRideDispatching: async () => {
        const [row] = await db
          .select({ status: rides.status })
          .from(rides)
          .where(eq(rides.id, ride.id))
          .limit(1);
        return row?.status === 'dispatching';
      },

      // Offer-time debit — one transaction per offer (offer row + deduction
      // commit or roll back together). leadBilling.ts is the sole writer.
      debitLead: (driverId, chainIndex) =>
        debitLeadForOfferTx({ rideId: ride.id, driverId, chainIndex }),

      emitLeadBilled: (driverId, balanceAfter) => {
        sendToDriver(driverId, {
          type: 'lead:billed',
          ride_id: ride.id,
          balance_after_calls: balanceAfter,
        });
      },

      // Auto-accept: same match flow as offer:accept. The driver was already
      // billed the 1 lead above (they consumed an offer).
      runAutoAccept: async (driverId) => {
        const client = connectedDrivers.get(driverId);
        if (!client) return false;
        const matchResult = await executeMatchFlow(ride.id, driverId, (m) => send(client.ws, m));
        return matchResult === 'matched';
      },

      sendOffer: async (driverId, _chainIndex, balanceAfter) => {
        // Per-driver pickup metrics
        const [locRow] = await db
          .select({
            last_location_lat: drivers.last_location_lat,
            last_location_lng: drivers.last_location_lng,
          })
          .from(drivers)
          .where(eq(drivers.id, driverId))
          .limit(1);
        const dLat = locRow?.last_location_lat != null ? Number(locRow.last_location_lat) : null;
        const dLng = locRow?.last_location_lng != null ? Number(locRow.last_location_lng) : null;
        const { distanceKm: pDist, etaMinutes: pEta } = await computePickupMetrics(
          dLat,
          dLng,
          pickupLat,
          pickupLng,
          ride.vehicle_type,
        );

        // This driver's own pickup compensation estimate — haversine × 1.4,
        // no route call (ruling 5). 0 when the fee is disabled or the
        // category radius is unset. Integer paisa.
        let pickupFeeEstimatePaisa = 0;
        if (pickupFeeEnabled && freeRadiusKm > 0 && dLat != null && dLng != null) {
          const estKm = haversineKm(dLat, dLng, pickupLat, pickupLng) * 1.4;
          pickupFeeEstimatePaisa = pickupFeePaisa(
            computeFeeKm(estKm, freeRadiusKm),
            ratePerKmPaisa(zonePerKmPaisa, pickupCategory),
            capBillableKm,
          );
        }

        // Register the settlement promise BEFORE the WS send so a driver
        // response racing the send can never arrive unregistered (the TTL
        // timer starts here; resolved by offer:accept/offer:reject handlers,
        // expiry, cancel, or driver socket close).
        const settlement = awaitOfferSettlement(ride.id, driverId, ttlMs, () => {
          sendToDriver(driverId, { type: "offer:lost", ride_id: ride.id, reason: "expired" });
        });

        sendToDriver(driverId, {
          type: "ride:offer",
          ride_id: ride.id,
          pickup: {
            lat: pickupLat,
            lng: pickupLng,
            address: ride.origin_address,
          },
          // Drop ZONE + heat tag only — exact destination is revealed AFTER
          // accept (offer:accepted / ride:status matched carry `dropoff`).
          dropoff_zone: {
            zone_id: dropZoneId,
            zone_name: dropZoneName,
            heat_tag: dropZoneHeatTag,
          },
          fare_breakdown: ride.fare_breakdown,
          // M-B: 06-API.md §ride:offer — driver_fare_bdt is the amount the
          // driver will earn (fare_breakdown.total_bdt + preference surcharge;
          // the upfront tip rides separately in upfront_tip_bdt and is shown as
          // an additive badge). The offer card MUST display this, not the raw
          // fare_breakdown.total_bdt.
          driver_fare_bdt:
            Number((ride.fare_breakdown as Record<string, unknown> | null)?.total_bdt ?? 0) +
            Number(ride.preference_surcharge_bdt ?? 0),
          vehicle_type: ride.vehicle_type,
          rider_id: ride.user_id,
          rider_phone: rider?.phone ?? "",
          rider_first_name: riderFirstName,
          rider_rating: riderRating,
          distance_km: parseFloat(ride.distance_km?.toString() ?? "0"),
          pickup_distance_km: Math.round(pDist * 10) / 10,
          pickup_eta_minutes: pEta,
          is_scheduled: isScheduled,
          preference_ids: ridePrefIds,
          secondary_rider_name: ride.secondary_rider_name,
          secondary_rider_phone: ride.secondary_rider_phone,
          upfront_tip_bdt: ride.upfront_tip_bdt ?? 0,
          stops: stopList,
          // Lead economics (§6): this offer costs 1 call, debited at send.
          lead_cost_calls: 1,
          balance_after_calls: balanceAfter,
          pickup_fee_estimate_bdt: pickupFeeEstimatePaisa,
          expires_in_ms: ttlMs,
          expires_at: new Date(Date.now() + ttlMs).toISOString(),
        });

        return settlement;
      },

      // Stamp terminal offer outcomes for the chain-owned terminal states
      // (W-3 guarded: only flip rows still 'delivered'). 'accepted' and
      // 'rejected' are stamped by their WS handlers — no-op here.
      onSettled: async (driverId, outcome) => {
        if (outcome === "accepted" || outcome === "rejected") return;
        await db
          .update(dispatchOffers)
          .set({ outcome: "expired", responded_at: new Date() })
          .where(
            and(
              eq(dispatchOffers.ride_id, ride.id),
              eq(dispatchOffers.driver_id, driverId),
              eq(dispatchOffers.outcome, "delivered"),
            ),
          );
      },

      // Pool exhausted → existing no-drivers / alternatives flow. All other
      // end reasons (matched / aborted / inactive) need no action here.
      onChainEnd: async (reason) => {
        if (reason === "exhausted") {
          await handleNoDrivers(ride, allowDowngrade);
        }
      },
    },
  );

  logger.info('[dispatch] sequential chain finished', {
    ride_id: ride.id,
    result,
    candidates: candidates.length,
  });
}

async function handleNoDrivers(
  ride: typeof rides.$inferSelect,
  allowDowngrade = false,
) {
  if (allowDowngrade) {
    await db
      .update(rides)
      .set({ status: "no_drivers" })
      .where(eq(rides.id, ride.id));
    const cells = getH3Ring(
      parseFloat(ride.origin_latitude?.toString() ?? "0"),
      parseFloat(ride.origin_longitude?.toString() ?? "0"),
      DISPATCH_RING_K,
    );
    const alternatives: {
      vehicle_type: string;
      available_drivers: number;
      fare_breakdown: Record<string, unknown>;
    }[] = [];
    for (const vt of VEHICLE_TYPE_VALUES) {
      if (vt === ride.vehicle_type) continue;
      const candidateIds = getDriversInCells(cells, vt);
      if (!candidateIds.length) continue;
      const [pricingRow] = await db
        .select()
        .from(pricing)
        .where(
          and(eq(pricing.vehicle_type, vt as any), eq(pricing.is_active, true)),
        )
        .limit(1);
      if (!pricingRow) continue;
      // available_drivers feeds the client's AlternativesSheet (X-2a) — the
      // sheet renders "N drivers nearby" per alternative.
      alternatives.push({
        vehicle_type: vt,
        available_drivers: candidateIds.length,
        fare_breakdown: calculateFare(
          {
            base_fare_bdt: pricingRow.base_fare_bdt,
            per_km_bdt: pricingRow.per_km_bdt,
            intercity_per_km_bdt: pricingRow.intercity_per_km_bdt ?? 0,
            per_min_bdt: pricingRow.per_min_bdt,
            floor_length_km: Number(pricingRow.floor_length_km ?? 0),
            floor_min: pricingRow.floor_min ?? 0,
            brta_fare_ceiling_bdt: pricingRow.brta_fare_ceiling_bdt,
            platform_commission_percent: Number(
              pricingRow.platform_commission_percent ?? 0,
            ),
          },
          parseFloat(ride.distance_km?.toString() ?? "0"),
          0,
          undefined,
          0,
          null,
          false,
        ) as unknown as Record<string, unknown>,
      });
    }
    sendToRider(ride.user_id, {
      type: "ride:alternatives",
      ride_id: ride.id,
      alternatives,
    });
  } else {
    await db
      .update(rides)
      .set({ status: "expired" })
      .where(eq(rides.id, ride.id));
    sendToRider(ride.user_id, {
      type: "ride:expired",
      ride_id: ride.id,
      reason: "no_drivers_available",
    });
  }
}

// ── Startup ────────────────────────────────────────────────────────────────
async function startup() {
  await refreshH3Index();
  startH3IndexRefresh();
  startCompensationWorker();
  startScheduler();

  // RECOVERY: re-dispatch rides stuck in 'dispatching' for >60s.
  //
  // Known bounded blast radius on restart:
  //   - In-memory sequential chains are lost. Any offer that was active at
  //     the moment of restart will time out naturally (TTL expiry).
  //   - The unique index on dispatch_offers(ride_id, driver_id) + the
  //     onConflictDoNothing in leadBilling.ts prevent double-billing when
  //     a restarted instance re-dispatches a ride that was already offered.
  //   - Scheduler job 20 (stale-offer sweep) flips delivered→expired after
  //     dispatch_offer_ttl_seconds + 5s, so orphaned offers are cleaned up
  //     within one TTL cycle.
  //   - Drivers with active-but-orphaned offers are not billed again:
  //     buildCandidateList's chain-exclusion clause skips drivers who
  //     already have a dispatch_offers row for this ride.
  //
  // Rides in 'dispatching' state for >60s are re-entered into a fresh
  // pipeline. Unique indexes guarantee idempotent deduplication.
  try {
    const stuckRides = await db
      .select()
      .from(rides)
      .where(
        and(
          eq(rides.status, "dispatching"),
          sql`updated_at < now() - interval '60 seconds'`,
        ),
      );
    for (const stuck of stuckRides) {
      logger.info("[startup] recovering stuck dispatching ride", {
        ride_id: stuck.id,
      });
      dispatchRidePipeline(stuck).catch((e) => {
        logger.error("[startup] recovery dispatch failed", {
          ride_id: stuck.id,
          error: e.message,
        });
      });
    }
  } catch (e: any) {
    logger.error("[startup] recovery query failed", { error: e.message });
  }

  // Periodic cleanup: expired offer locks + stale driver connections
  setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of offerLocks) {
      if (now - ts > OFFER_LOCK_SWEEP_MS) {
        offerLocks.delete(key);
      }
    }
    for (const [driverId, client] of connectedDrivers) {
      if (client.lastSeen && now - client.lastSeen > STALE_DRIVER_TIMEOUT_MS) {
        // BUG-R3 FIX: Full cleanup — remove from H3 index + mark offline in DB
        connectedDrivers.delete(driverId);
        removeDriver(driverId);
        // BUG-FIX: never swallow disconnect cleanup — a failure here leaves the
        // driver marked online in the DB (ghost in future pools). Log + retry once.
        handleDriverDisconnect(driverId).catch((e) => {
          logger.error("[ws] stale driver disconnect cleanup failed — retrying", {
            driverId,
            error: e.message,
          });
          setTimeout(() => {
            handleDriverDisconnect(driverId).catch((retryErr) => {
              logger.error("[ws] stale driver disconnect cleanup retry failed", {
                driverId,
                error: retryErr.message,
              });
            });
          }, 2000);
        });
        logger.info("[ws] stale driver evicted", { driverId });
      }
    }
  }, CLEANUP_INTERVAL_MS);

  const PORT = parseInt(process.env.UTILS_SERVER_PORT ?? "3001");
  server.listen(PORT, "0.0.0.0", () =>
    logger.info(`[ws] dispatch server listening on 0.0.0.0:${PORT}`),
  );
}

// ── Global Error Handlers ──────────────────────────────────────────────
// Prevent postgres.js or other async errors from crashing the process.
process.on("unhandledRejection", (reason: unknown) => {
  logger.error("[process] unhandled rejection — keeping server alive", reason);
});

process.on("uncaughtException", (err: Error) => {
  logger.error("[process] uncaught exception — keeping server alive", err);
});

// Shutdown cleanup: clear every pending Phase G detection timer so a
// restart never fires a stale detection (TD-15 — in-memory state does not
// survive anyway; detection is best-effort by design).
function clearPendingDetections(): void {
  for (const { timer } of pendingDetections.values()) {
    clearTimeout(timer);
  }
  pendingDetections.clear();
}
process.on("SIGTERM", () => {
  clearPendingDetections();
  process.exit(0);
});
process.on("SIGINT", () => {
  clearPendingDetections();
  process.exit(0);
});

startup().catch((e) => {
  logger.error("[startup] fatal", e);
  process.exit(1);
});