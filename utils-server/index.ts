import "dotenv/config";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
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
} from "./dispatch";
import { recordCallDeduction } from "./heartbeat";
import { db } from "../src/db";
import {
  users,
  drivers,
  rides,
  dispatchOffers,
  driverOnlineSessions,
  subscriptions,
  pricing,
} from "../src/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getH3Cell, getH3Ring } from "../lib/h3";
import { calculateFare, haversineKm } from "../lib/fareCalc";
import { VEHICLE_TYPE_VALUES } from "../lib/vehicleTypes";

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
  role?: "driver" | "rider";
  driverId?: string;
  subscribedRideId?: string; // rider: which ride they are tracking
}

// ── Connection Maps ────────────────────────────────────────────────────────
const connectedDrivers = new Map<string, WSClient>(); // driverId → client
const connectedRiders = new Map<string, WSClient>(); // userId → client (rider)
const allClients = new Map<WebSocket, WSClient>();

// ── Offer Locks (double-deduction prevention) ─────────────────────────────
const offerLocks = new Map<string, true>();
const OFFER_LOCK_TTL_MS = 10_000;

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
          type: "driver_arrived",
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
          type: "ride_completed",
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
          const role = msg.role as "driver" | "rider";
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
              (role === "rider" && user.role !== "rider")
            ) {
              send(ws, { type: "auth:error", message: "role_mismatch" });
              return;
            }

            client.userId = user.id;
            client.supabaseUid = supabaseUser.id;
            client.role = role;

            if (role === "driver") {
              const [driver] = await db
                .select({ id: drivers.id })
                .from(drivers)
                .where(eq(drivers.user_id, user.id))
                .limit(1);
              if (driver) {
                client.driverId = driver.id;
                connectedDrivers.set(driver.id, client);
              }
            } else {
              connectedRiders.set(user.id, client);
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

        // Always update in-memory H3 index for accurate dispatch scoring
        const [driverRow] = await db
          .select({ vehicle_type: drivers.vehicle_type })
          .from(drivers)
          .where(eq(drivers.id, client.driverId))
          .limit(1);
        if (driverRow) {
          updateDriver(client.driverId, cell, driverRow.vehicle_type);
        }

        // Persist to DB every 30s (throttled in h3Index.ts)
        const now = Date.now();
        const lastPersist = getLastPersist(client.driverId);
        if (now - lastPersist < 30_000) break;
        setLastPersist(client.driverId, now);

        await db
          .update(drivers)
          .set({
            last_location_lat: String(lat),
            last_location_lng: String(lng),
            last_location_at: new Date(),
            h3_cell_res9: cell,
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
                });
              }
            }
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
          offerLocks.set(lockKey, true);
          logger.debug("[ws] offer lock set", { lockKey });

          // Auto-release after TTL
          setTimeout(() => {
            if (offerLocks.delete(lockKey)) {
              logger.debug("[ws] offer lock expired", { lockKey });
            }
          }, OFFER_LOCK_TTL_MS);

          // Record fetch confirmation timestamp
          await db
            .update(dispatchOffers)
            .set({
              fetch_confirmed_at: new Date(),
            })
            .where(
              and(
                eq(dispatchOffers.ride_id, rideId),
                eq(dispatchOffers.driver_id, client.driverId),
              ),
            );

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
            recordCallDeduction({
              driverId: client.driverId,
              subscriptionId: sub.id,
              rideId,
              confirmedAt: new Date(),
            })
              .then(() =>
                send(ws, { type: "fetch:confirmed", ride_id: rideId }),
              )
              .catch((e) => {
                logger.error("[ws] fetch:confirm deduction error", {
                  rideId,
                  driverId: client.driverId,
                  error: e.message,
                });
                send(ws, {
                  type: "fetch:error",
                  ride_id: rideId,
                  error: "deduction_failed",
                });
              })
              .finally(releaseLock);
          } else {
            releaseLock();
            send(ws, { type: "fetch:confirmed", ride_id: rideId });
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

          // Update ride to matched + immediately to driver_arriving
          const [driverRow] = await db
            .select({
              name: users.name,
              vehicle_type: drivers.vehicle_type,
            })
            .from(drivers)
            .innerJoin(users, eq(users.id, drivers.user_id))
            .where(eq(drivers.id, client.driverId))
            .limit(1);

          await db
            .update(rides)
            .set({
              driver_id: client.driverId,
              status: "matched",
              matched_at: new Date(),
            })
            .where(eq(rides.id, rideId));

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
            .select({ user_id: rides.user_id })
            .from(rides)
            .where(eq(rides.id, rideId))
            .limit(1);
          if (ride) {
            sendToRider(ride.user_id, {
              type: "ride:matched",
              ride_id: rideId,
              driver: {
                name: driverRow?.name ?? "",
                vehicle_type: driverRow?.vehicle_type ?? "",
              },
              eta_minutes: 5,
            });
          }

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
        }
        break;
      }

      /* ── Chat ──────────────────────────────────────────────────── */
      case "chat": {
        if (action === "typing") {
          const rideId = msg.ride_id as string;
          const recipientUserId = msg.recipient_user_id as string;
          const isTyping = msg.is_typing as boolean;
          if (!rideId || !recipientUserId) {
            send(ws, { type: "error", message: "missing_chat_fields" });
            return;
          }
          sendToUser(recipientUserId, {
            type: "chat:typing",
            ride_id: rideId,
            sender_user_id: client.userId,
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
    await handleDriverDisconnect(client.driverId);
  }
  if (client.role === "rider" && client.userId) {
    connectedRiders.delete(client.userId);
  }
  if (client.driverId) {
    connectedDrivers.delete(client.driverId);
    // Don't remove from H3 index on disconnect — periodic refresh handles cleanup
  }
  logger.info("[ws] connection closed", {
    userId: client.userId,
    role: client.role,
  });
}

async function handleDriverDisconnect(driverId: string) {
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
}

// ── Pickup Distance / ETA Helpers ──────────────────────────────────────────

/** Average speed in km/h for ETA estimation in Dhaka city. */
const DHAKA_AVG_SPEED_KMH = 20;

function computePickupMetrics(
  driverLat: number | null,
  driverLng: number | null,
  pickupLat: number,
  pickupLng: number,
): { distanceKm: number; etaMinutes: number } {
  if (driverLat == null || driverLng == null) {
    return { distanceKm: 0, etaMinutes: 0 };
  }
  const dist = haversineKm(driverLat, driverLng, pickupLat, pickupLng);
  const eta = Math.round((dist / DHAKA_AVG_SPEED_KMH) * 60);
  return { distanceKm: dist, etaMinutes: Math.max(1, eta) };
}

// ── Dispatch Pipeline ──────────────────────────────────────────────────────
async function dispatchRidePipeline(
  ride: typeof rides.$inferSelect,
  allowDowngrade = false,
) {
  const MAX_BATCHES = 3;
  const BATCH_SIZE = 5;
  const BATCH_INTERVAL_MS = 3000;

  // Pre-fetch rider name and rating once for all batches
  const [rider] = await db
    .select({ name: users.name, rating: users.rating })
    .from(users)
    .where(eq(users.id, ride.user_id))
    .limit(1);
  const riderFirstName = rider?.name?.split(" ")[0] ?? "Rider";
  const riderRating = rider?.rating != null ? Number(rider.rating) : null;
  const isScheduled = ride.scheduled_at != null;

  const pickupLat = parseFloat(ride.origin_latitude?.toString() ?? "0");
  const pickupLng = parseFloat(ride.origin_longitude?.toString() ?? "0");

  let batchIndex = 0;

  for (let batch = 1; batch <= MAX_BATCHES; batch++) {
    if (batch > 1) await new Promise((r) => setTimeout(r, BATCH_INTERVAL_MS));

    const ridePrefIds = (ride.preference_ids as string[]) ?? [];
    const scored = await scoreAndBatchDrivers(
      ride.id,
      pickupLat,
      pickupLng,
      ride.vehicle_type,
      ride.zone_id,
      BATCH_SIZE,
      ridePrefIds,
    );

    if (scored.length === 0) {
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
      .where(sql`${drivers.id} IN ${scoredDriverIds}`);
    const locMap = new Map(driverLocRows.map((d) => [d.id, d]));

    // Broadcast individualized offers (each driver gets their own pickup distance/ETA)
    for (const s of scored) {
      const loc = locMap.get(s.driverId);
      const dLat =
        loc?.last_location_lat != null ? Number(loc.last_location_lat) : null;
      const dLng =
        loc?.last_location_lng != null ? Number(loc.last_location_lng) : null;
      const { distanceKm: pDist, etaMinutes: pEta } = computePickupMetrics(
        dLat,
        dLng,
        pickupLat,
        pickupLng,
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
        vehicle_type: ride.vehicle_type,
        rider_first_name: riderFirstName,
        rider_rating: riderRating,
        distance_km: parseFloat(ride.distance_km?.toString() ?? "0"),
        pickup_distance_km: Math.round(pDist * 10) / 10,
        pickup_eta_minutes: pEta,
        is_scheduled: isScheduled,
        preference_ids: ridePrefIds,
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
      1,
    );
    const alternatives: {
      vehicle_type: string;
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
      alternatives.push({
        vehicle_type: vt,
        fare_breakdown: calculateFare(
          pricingRow,
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

  const PORT = parseInt(process.env.UTILS_SERVER_PORT ?? "3001");
  server.listen(PORT, () =>
    logger.info(`[ws] dispatch server listening on :${PORT}`),
  );
}

startup().catch((e) => {
  logger.error("[startup] fatal", e);
  process.exit(1);
});
