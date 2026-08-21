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
import {
  scoreAndBatchDrivers,
  isDispatchPaused,
  updateDriverAcceptanceRate,
  DISPATCH_RING_K,
} from "./dispatch";
import { recordCallDeduction, recordCallRefund } from "./heartbeat";
import { estimateEtaMinutes } from "./eta";
import { db } from "../src/db";
import {
  users,
  drivers,
  rides,
  dispatchOffers,
  driverOnlineSessions,
  subscriptions,
  callLedger,
  pricing,
  rideStops,
} from "../src/db/schema";
import { eq, and, inArray, isNull, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getZoneForLocation } from "../lib/zone";
import { getH3Cell, getH3Ring } from "../lib/h3";
import { calculateFare, haversineKm } from "../lib/fareCalc";
import { VEHICLE_TYPE_VALUES } from "../lib/vehicleTypes";
import { detectRouteDeviation } from "../lib/safety";
import { sendNotification } from "../lib/notify";
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

function sendToUser(userId: string, msg: Record<string, unknown>) {
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
        const { ride_id, driver_id, cancelled_by } = JSON.parse(body);
        if (!ride_id || !driver_id) {
          writeJson(400, { error: "missing_fields" });
          return;
        }
        sendToDriver(driver_id, {
          type: "ride:cancelled",
          ride_id,
          cancelled_by: cancelled_by === "driver" ? "driver" : cancelled_by === "system" ? "system" : "rider",
        });
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
          // accept (or 'rejected'/'refunded' for the other terminal states).
          // Stamping it here meant a confirm-then-ignore was counted as an
          // acceptance in acceptance-rate analytics. The in-memory offer lock
          // (above) plus the call_ledger partial unique index on
          // (ride_id, driver_id) WHERE event_type='deduction' still prevent
          // duplicate deductions.
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

          // Open deduction window — find active subscription
          const [sub] = await db
            .select({ id: subscriptions.id })
            .from(subscriptions)
            .where(
              and(
                eq(subscriptions.driver_id, client.driverId),
                eq(subscriptions.status, "active"),
              ),
            )
            .limit(1);

          const releaseLock = () => {
            offerLocks.delete(lockKey);
            logger.debug("[ws] offer lock released", { lockKey });
          };

          if (sub) {
            const result = await recordCallDeduction({
              driverId: client.driverId,
              subscriptionId: sub.id,
              rideId,
              confirmedAt: new Date(),
            });
            releaseLock();
            if (!result.deducted) {
              send(ws, { type: "fetch:error", ride_id: rideId, reason: "deduction_failed" });
              return;
            }
            send(ws, { type: "fetch:confirmed", ride_id: rideId });
          } else {
            releaseLock();
            send(ws, { type: "fetch:error", ride_id: rideId, reason: "no_subscription" });
          }
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

          // Update ride to matched + immediately to driver_arriving
          const [driverRow] = await db
            .select({
              name: users.name,
              phone: users.phone,
              rating: drivers.rating,
              vehicle_type: drivers.vehicle_type,
              last_location_lat: drivers.last_location_lat,
              last_location_lng: drivers.last_location_lng,
            })
            .from(drivers)
            .innerJoin(users, eq(users.id, drivers.user_id))
            .where(eq(drivers.id, client.driverId))
            .limit(1);

          // Generate a 4-digit ride-start PIN (rider reads aloud, driver enters it)
          const startPin = String(crypto.randomInt(1000, 10000));

          // Revenue guard: never match a ride for a driver who never confirmed
          // (and therefore never had a call deducted). A client that sends
          // offer:accept directly would otherwise match with zero deduction —
          // a revenue leak. The deduction row is kept even after a refund, so
          // this passes for the race-loser's retry too (the match guard below
          // rejects it and the refund is idempotent).

          // Atomic match guard: the WHERE clause on status='dispatching' ensures
          // that only the first driver to accept wins. If two drivers accept
          // concurrently, the second UPDATE affects zero rows and .returning()
          // yields undefined → the driver receives "already_assigned".
          // This is the primary double-deduction / double-match prevention.
          // Defense-in-depth: call_ledger has a partial unique index
          // (ride_id, driver_id) WHERE event_type='deduction' that rejects
          // any duplicate deduction INSERT at the DB layer.
          const [deductionRow] = await db.select({ id: callLedger.id })
            .from(callLedger)
            .where(and(
              eq(callLedger.ride_id, rideId),
              eq(callLedger.driver_id, client.driverId),
              eq(callLedger.event_type, 'deduction'),
            ))
            .limit(1);
          if (!deductionRow) {
            send(ws, { type: "offer:rejected", ride_id: rideId, reason: "no_deduction" });
            return;
          }

          const [updatedRide] = await db
            .update(rides)
            .set({
              driver_id: client.driverId,
              status: "matched",
              matched_at: new Date(),
              start_pin: startPin,
            })
            .where(and(eq(rides.id, rideId), eq(rides.status, "dispatching")))
            .returning({ id: rides.id });
          if (!updatedRide) {
            // Refund the losing driver's call deduction. The deduction happens
            // at fetch:confirm (before offer:accept), so a concurrent acceptor
            // that wins the race leaves this driver out of pocket otherwise.
            // call_ledger is append-only (K-2): the deduction row is KEPT and
            // a `refund` row (delta=+1) is appended inside recordCallRefund's
            // transaction — never db.delete. The restore is guarded against
            // the unlimited sentinel (-1 stays -1; `-1 + 1 = 0` would bench an
            // unlimited driver as exhausted). Idempotent: a repeat accept after
            // a refund is a no-op.
            try {
              const [deductionRow] = await db.select({ id: callLedger.id, subscription_id: callLedger.subscription_id })
                .from(callLedger)
                .where(and(
                  eq(callLedger.ride_id, rideId),
                  eq(callLedger.driver_id, client.driverId),
                  eq(callLedger.event_type, 'deduction'),
                )).limit(1);
              if (deductionRow) {
                const { refunded } = await recordCallRefund({
                  driverId: client.driverId,
                  subscriptionId: deductionRow.subscription_id,
                  rideId,
                });
                if (refunded) {
                  // AC-7: mark the offer refunded so it never counts as an
                  // acceptance in acceptance-rate analytics.
                  await db.update(dispatchOffers)
                    .set({ outcome: 'refunded', responded_at: new Date() })
                    .where(and(
                      eq(dispatchOffers.ride_id, rideId),
                      eq(dispatchOffers.driver_id, client.driverId),
                    ));
                }
                logger.info('[ws] refunded losing driver deduction', { rideId, driverId: client.driverId, refunded });
              }
            } catch (e: any) {
              logger.error('[ws] refund failed for losing driver', { rideId, driverId: client.driverId, error: e.message });
            }
            send(ws, { type: "offer:rejected", ride_id: rideId, reason: "already_assigned" });
            return;
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
                eq(dispatchOffers.driver_id, client.driverId),
              ),
            );

          // Notify other drivers that offer is lost
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
            if (od.driver_id !== client.driverId) {
              sendToDriver(od.driver_id, {
                type: "offer:lost",
                ride_id: rideId,
                reason: "accepted_by_other",
              });
            }
          }

          // Notify rider
          const [ride] = await db
            .select({
              user_id: rides.user_id,
              origin_latitude: rides.origin_latitude,
              origin_longitude: rides.origin_longitude,
            })
            .from(rides)
            .where(eq(rides.id, rideId))
            .limit(1);
          if (ride) {
            if (driverRow?.last_location_lat != null) {
              const dLat = Number(driverRow.last_location_lat);
              const dLng = Number(driverRow.last_location_lng);
              const pLat = parseFloat(ride.origin_latitude?.toString() ?? "0");
              const pLng = parseFloat(ride.origin_longitude?.toString() ?? "0");
              const dist = haversineKm(dLat, dLng, pLat, pLng);
              const etaMin = await estimateEtaMinutes(dist, driverRow.vehicle_type);
              await db.update(rides).set({ eta_minutes: etaMin }).where(eq(rides.id, rideId));
            }
            // Tell the rider a driver was found, with the PIN (to read aloud)
            // and the driver info. The rider app listens for "ride:status".
            sendToRider(ride.user_id, {
              type: "ride:status",
              ride_id: rideId,
              status: "matched",
              pin: startPin,
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
            // row, and dead-token pruning stay in one place (audit U-2).
            sendNotification(
              ride.user_id,
              "ride:matched",
              "Driver Found",
              `${driverRow?.name ?? "Your driver"} is on the way!`,
              { ride_id: rideId },
            );
          }

          // Confirm acceptance to the driver. The PIN is NOT sent here — the
          // driver must get it verbally from the rider; the server verifies the
          // driver's entry against rides.start_pin on "ride:start".
          send(ws, { type: "offer:accepted", ride_id: rideId });

          // Background acceptance rate update
          updateDriverAcceptanceRate(client.driverId).catch((e) =>
            logger.error("[ws] update acceptance rate failed", {
              driverId: client.driverId,
              error: e.message,
            }),
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
      await db
        .update(rides)
        .set({ status: "cancelled", cancelled_by: "system" })
        .where(
          and(
            eq(rides.user_id, client.userId),
            eq(rides.status, "dispatching"),
            sql`${rides.updated_at} < now() - interval '5 seconds'`,
          ),
        );
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

// ── Dispatch Pipeline ──────────────────────────────────────────────────────
async function dispatchRidePipeline(
  ride: typeof rides.$inferSelect,
  allowDowngrade = false,
) {
  const MAX_BATCHES = 3;
  const BATCH_SIZE = 5;
  const BATCH_INTERVAL_MS = 3000;

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

  let batchIndex = 0;

  for (let batch = 1; batch <= MAX_BATCHES; batch++) {
    if (batch > 1) await new Promise((r) => setTimeout(r, BATCH_INTERVAL_MS));

    const ridePrefIds = (ride.preference_ids as string[]) ?? [];
    const destLat = parseFloat(ride.destination_latitude ?? '0');
    const destLng = parseFloat(ride.destination_longitude ?? '0');
    let scored = await scoreAndBatchDrivers(
      ride.id,
      pickupLat,
      pickupLng,
      destLat,
      destLng,
      ride.vehicle_type,
      ride.zone_id,
      BATCH_SIZE,
      ridePrefIds,
    );

    // ── Retry logic for batch 1: if zero candidates, wait and retry once ──
    // Handles the race where the driver's first heartbeat location update
    // hasn't reached the in-memory H3 index yet (e.g., driver just toggled
    // online and the heartbeat interval hasn't fired yet).
    if (batch === 1 && scored.length === 0) {
      logger.debug('[dispatch] zero candidates on first batch, retrying after 1.5s delay', { ride_id: ride.id });
      await new Promise((r) => setTimeout(r, 1500));
      scored = await scoreAndBatchDrivers(
        ride.id,
        pickupLat,
        pickupLng,
        destLat,
        destLng,
        ride.vehicle_type,
        ride.zone_id,
        BATCH_SIZE,
        ridePrefIds,
      );
    }

    // Check if auto-accept already matched the ride inside scoreAndBatchDrivers.
    // Auto-accept returns [] and sets the ride to 'matched' + start_pin; this
    // path notifies the rider (sendToRider lives here, not in dispatch.ts) and
    // exits before inserting more dispatch_offers for an already-matched ride.
    const [currentRide] = await db.select({
      status: rides.status, driver_id: rides.driver_id, start_pin: rides.start_pin, user_id: rides.user_id,
    }).from(rides).where(eq(rides.id, ride.id)).limit(1);
    if (currentRide?.status === 'matched' && currentRide.driver_id) {
      const [driverRow] = await db.select({
        name: users.name, phone: users.phone, rating: drivers.rating, vehicle_type: drivers.vehicle_type,
      }).from(drivers).innerJoin(users, eq(users.id, drivers.user_id))
        .where(eq(drivers.id, currentRide.driver_id)).limit(1);
      sendToRider(currentRide.user_id, {
        type: "ride:status", ride_id: ride.id, status: "matched",
        pin: currentRide.start_pin,
        ride: { driver: { name: driverRow?.name ?? "", phone: driverRow?.phone ?? "",
          rating: driverRow?.rating != null ? parseFloat(driverRow.rating) : null,
          vehicle_type: driverRow?.vehicle_type ?? "" } },
      });
      return;
    }

    if (scored.length === 0) {
      if (batch < MAX_BATCHES) continue; // Try next batch — a driver may come online
      await handleNoDrivers(ride, allowDowngrade);
      return;
    }

    // Insert dispatch_offers rows
    const now = new Date();
    for (const s of scored) {
      await db
        .insert(dispatchOffers)
        .values({
          ride_id: ride.id,
          driver_id: s.driverId,
          batch_index: batchIndex++,
          sent_at: now,
          outcome: "delivered",
        })
        .onConflictDoNothing();
    }

    // Fetch driver locations for pickup distance / ETA computation
    const scoredDriverIds = scored.map((s) => s.driverId);
    const driverLocRows = await db
      .select({
        id: drivers.id,
        last_location_lat: drivers.last_location_lat,
        last_location_lng: drivers.last_location_lng,
      })
      .from(drivers)
      .where(inArray(drivers.id, scoredDriverIds));
    const locMap = new Map(driverLocRows.map((d) => [d.id, d]));

    // Fetch stop addresses once per ride (avoid N+1 in driver loop)
    const stopRows = await db
      .select({ address: rideStops.address, stop_order: rideStops.stop_order })
      .from(rideStops)
      .where(eq(rideStops.ride_id, ride.id));
    const stopList = stopRows.map((s) => ({ address: s.address, stop_order: s.stop_order }));

    // Broadcast individualized offers (each driver gets their own pickup distance/ETA)
    for (const s of scored) {
      const loc = locMap.get(s.driverId);
      const dLat =
        loc?.last_location_lat != null ? Number(loc.last_location_lat) : null;
      const dLng =
        loc?.last_location_lng != null ? Number(loc.last_location_lng) : null;
      const { distanceKm: pDist, etaMinutes: pEta } = await computePickupMetrics(
        dLat,
        dLng,
        pickupLat,
        pickupLng,
        ride.vehicle_type,
      );

      sendToDriver(s.driverId, {
        type: "ride:offer",
        ride_id: ride.id,
        pickup: {
          lat: pickupLat,
          lng: pickupLng,
          address: ride.origin_address,
        },
        dropoff: {
          lat: parseFloat(ride.destination_latitude?.toString() ?? "0"),
          lng: parseFloat(ride.destination_longitude?.toString() ?? "0"),
          address: ride.destination_address,
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
        expires_in_ms: 15000,
        expires_at: new Date(Date.now() + 15000).toISOString(),
      });
    }

    // Fewer than batch size means no more candidates for subsequent batches
    if (scored.length < BATCH_SIZE) {
      if (batch >= MAX_BATCHES || scored.length === 0) {
        await handleNoDrivers(ride, allowDowngrade);
      }
      return;
    }
  }
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

  // Recovery: re-dispatch rides stuck in 'dispatching' for >60s
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

startup().catch((e) => {
  logger.error("[startup] fatal", e);
  process.exit(1);
});
