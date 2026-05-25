import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import * as admin from 'firebase-admin';
import { validateServerEnv } from '../lib/env';
import { startH3IndexRefresh, refreshH3Index, updateDriver, removeDriver } from './h3Index';
import { startCompensationWorker } from './compensationWorker';
import { startScheduler } from './scheduler';
import { scoreAndBatchDrivers, isDispatchPaused } from './dispatch';
import { recordCallDeduction } from './heartbeat';
import { db } from '../src/db';
import { users, drivers, rides, dispatchOffers, driverOnlineSessions, subscriptions, pricing } from '../src/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { logger } from '../lib/logger';
import { getH3Cell, getH3Ring } from '../lib/h3';
import { getDriversInCells } from './h3Index';
import { calculateFare } from '../lib/fareCalc';
import { VEHICLE_TYPE_VALUES } from '../lib/vehicleTypes';

validateServerEnv();

// ── Firebase Admin (lazy init) ────────────────────────────────────────────
let firebaseInitialised = false;
function initFirebaseAdmin() {
  if (!firebaseInitialised && !admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      }),
    });
    firebaseInitialised = true;
  }
}

// ── Types ──────────────────────────────────────────────────────────────────
interface WSClient {
  ws: WebSocket;
  userId?: string;
  firebaseUid?: string;
  role?: 'driver' | 'rider';
  driverId?: string;
  subscribedRideId?: string; // rider: which ride they are tracking
}

// ── Connection Maps ────────────────────────────────────────────────────────
const connectedDrivers = new Map<string, WSClient>(); // driverId → client
const connectedRiders  = new Map<string, WSClient>(); // userId → client (rider)
const allClients       = new Map<WebSocket, WSClient>();

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
  if (riderClient) { send(riderClient.ws, msg); return; }
  for (const client of connectedDrivers.values()) {
    if (client.userId === userId) { send(client.ws, msg); return; }
  }
}

function broadcastRideOffer(rideId: string, driverIds: string[], offerPayload: Record<string, unknown>) {
  for (const did of driverIds) {
    sendToDriver(did, {
      type: 'ride:offer',
      ...offerPayload,
    });
  }
}

// ── HTTP Server ────────────────────────────────────────────────────────────
const WEBSOCKET_INTERNAL_SECRET = process.env.WEBSOCKET_INTERNAL_SECRET ?? '';

const server = http.createServer(async (req, res) => {
  const writeJson = (code: number, data: Record<string, unknown>) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  if (req.url === '/health') {
    res.writeHead(200); res.end('ok');
    return;
  }

  // All internal endpoints require shared secret
  if (!WEBSOCKET_INTERNAL_SECRET) {
    writeJson(500, { error: 'server_misconfigured' });
    return;
  }
  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== WEBSOCKET_INTERNAL_SECRET) {
    writeJson(401, { error: 'unauthorized' });
    return;
  }

  if (req.url === '/internal/dispatch' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { ride_id, allow_downgrade } = JSON.parse(body);
        if (!ride_id) { writeJson(400, { error: 'missing_ride_id' }); return; }

        if (await isDispatchPaused()) {
          logger.warn('[dispatch] paused via system_config, rejecting ride', { ride_id });
          const status = allow_downgrade ? 'pending' : 'no_drivers';
          await db.update(rides).set({ status }).where(eq(rides.id, ride_id));
          writeJson(200, { ok: true, status: 'paused' });
          return;
        }

        // Fetch ride details
        const [ride] = await db.select().from(rides).where(eq(rides.id, ride_id)).limit(1);
        if (!ride) { writeJson(404, { error: 'ride_not_found' }); return; }

        await db.update(rides).set({ status: 'dispatching' }).where(eq(rides.id, ride_id));

        // Start dispatch pipeline without awaiting (async, non-blocking)
        dispatchRidePipeline(ride, !!allow_downgrade).catch(e => {
          logger.error('[index] dispatch pipeline error', { ride_id, error: e.message });
        });

        writeJson(200, { ok: true, status: 'dispatching' });
      } catch (e: any) {
        writeJson(400, { error: 'invalid_body' });
      }
    });
    return;
  }

  if (req.url === '/internal/driver/force-offline' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { driver_id, reason } = JSON.parse(body);
        if (!driver_id) { writeJson(400, { error: 'missing_driver_id' }); return; }

        const client = connectedDrivers.get(driver_id);
        if (client) {
          send(client.ws, { type: 'admin:suspended', driver_id, reason: reason ?? '' });
          client.ws.close();
          await handleDriverDisconnect(driver_id);
        }

        await db.update(drivers).set({ is_online: false }).where(eq(drivers.id, driver_id));
        writeJson(200, { ok: true });
      } catch (e: any) {
        writeJson(400, { error: 'invalid_body' });
      }
    });
    return;
  }

  if (req.url === '/internal/chat/send' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { ride_id, recipient_user_id, message } = JSON.parse(body);
        if (!ride_id || !recipient_user_id || !message) {
          writeJson(400, { error: 'missing_fields' }); return;
        }
        sendToUser(recipient_user_id, {
          type: 'chat:message',
          ride_id,
          message,
        });
        writeJson(200, { ok: true });
      } catch (e: any) {
        writeJson(400, { error: 'invalid_body' });
      }
    });
    return;
  }

  writeJson(404, { error: 'not_found' });
});

// ── WebSocket Server ───────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  const client: WSClient = { ws };
  allClients.set(ws, client);

  ws.on('message', async (raw) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: 'error', message: 'invalid_json' });
      return;
    }

    const type = msg.type as string;
    if (!type) { send(ws, { type: 'error', message: 'missing_type' }); return; }

    const parts = type.split(':');
    const domain = parts[0];
    const action = parts[1] ?? '';

    switch (domain) {
      /* ── Auth ──────────────────────────────────────────────────── */
      case 'auth': {
        if (action === 'hello') {
          const firebaseIdToken = msg.firebase_id_token as string;
          const role = msg.role as 'driver' | 'rider';
          if (!firebaseIdToken || !role) {
            send(ws, { type: 'auth:error', message: 'missing_credentials' });
            return;
          }

          try {
            initFirebaseAdmin();
            const decoded = await admin.auth().verifyIdToken(firebaseIdToken);
            const [user] = await db.select({ id: users.id, role: users.role })
              .from(users).where(eq(users.auth_uid, decoded.uid)).limit(1);
            if (!user) {
              send(ws, { type: 'auth:error', message: 'user_not_found' });
              return;
            }
            if ((role === 'driver' && user.role !== 'driver') ||
                (role === 'rider' && user.role !== 'rider')) {
              send(ws, { type: 'auth:error', message: 'role_mismatch' });
              return;
            }

            client.userId = user.id;
            client.firebaseUid = decoded.uid;
            client.role = role;

            if (role === 'driver') {
              const [driver] = await db.select({ id: drivers.id })
                .from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
              if (driver) {
                client.driverId = driver.id;
                connectedDrivers.set(driver.id, client);
              }
            } else {
              connectedRiders.set(user.id, client);
            }

            send(ws, { type: 'auth:ok', user_id: user.id, role });
            logger.info('[ws] auth:hello success', { userId: user.id, role });
          } catch (e: any) {
            send(ws, { type: 'auth:error', message: 'invalid_token' });
            logger.warn('[ws] auth:hello failed', { error: e.message });
          }
        } else if (action === 'refresh') {
          const firebaseIdToken = msg.firebase_id_token as string;
          if (!firebaseIdToken) { send(ws, { type: 'auth:error', message: 'missing_token' }); return; }
          try {
            initFirebaseAdmin();
            await admin.auth().verifyIdToken(firebaseIdToken);
            send(ws, { type: 'auth:ok', user_id: client.userId, role: client.role });
          } catch {
            send(ws, { type: 'auth:error', message: 'token_expired' });
            ws.close();
          }
        }
        break;
      }

      /* ── Heartbeat / Location ──────────────────────────────────── */
      case 'heartbeat': {
        const lat = msg.lat as number;
        const lng = msg.lng as number;
        const ts = msg.ts as string;
        if (client.role !== 'driver' || !client.driverId) {
          send(ws, { type: 'error', message: 'not_a_driver' });
          return;
        }

        // Persist every 30s (throttled via random skip — ⅔ of heartbeats skip DB)
        if (Math.random() < 0.667) break;

        const cell = getH3Cell(lat, lng);
        await db.update(drivers).set({
          last_location_lat: String(lat),
          last_location_lng: String(lng),
          last_location_at: new Date(),
          h3_cell_res9: cell,
        }).where(eq(drivers.id, client.driverId));

        // Update H3 index in-memory
        const [driverRow] = await db.select({ vehicle_type: drivers.vehicle_type })
          .from(drivers).where(eq(drivers.id, client.driverId)).limit(1);
        if (driverRow) {
          updateDriver(client.driverId, cell, driverRow.vehicle_type);
        }
        break;
      }

      case 'location': {
        if (action === 'update' && client.role === 'driver' && client.driverId) {
          // Forward to rider tracking this ride
          const rideId = msg.ride_id as string;
          if (rideId) {
            // Find rider tracking this ride
            for (const [uid, riderClient] of connectedRiders) {
              if (riderClient.subscribedRideId === rideId) {
                send(riderClient.ws, {
                  type: 'location:driver',
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
      case 'fetch': {
        if (action === 'confirm' && client.role === 'driver' && client.driverId) {
          const rideId = msg.ride_id as string;
          if (!rideId) { send(ws, { type: 'error', message: 'missing_ride_id' }); return; }

          // Record fetch confirmation timestamp
          await db.update(dispatchOffers).set({
            fetch_confirmed_at: new Date(),
          }).where(and(
            eq(dispatchOffers.ride_id, rideId),
            eq(dispatchOffers.driver_id, client.driverId),
          ));

          // Open deduction window — find active subscription
          const [sub] = await db.select({ id: subscriptions.id })
            .from(subscriptions)
            .where(and(
              eq(subscriptions.driver_id, client.driverId),
              eq(subscriptions.status, 'active'),
            ))
            .limit(1);

          if (sub) {
            recordCallDeduction({
              driverId: client.driverId,
              subscriptionId: sub.id,
              rideId,
              confirmedAt: new Date(),
            }).catch(e => logger.error('[ws] fetch:confirm deduction error', { rideId, driverId: client.driverId, error: e.message }));
          }
        }
        break;
      }

      case 'offer': {
        if (action === 'accept' && client.role === 'driver' && client.driverId) {
          const rideId = msg.ride_id as string;
          if (!rideId) { send(ws, { type: 'error', message: 'missing_ride_id' }); return; }

          await db.update(dispatchOffers).set({
            outcome: 'accepted',
            responded_at: new Date(),
          }).where(and(
            eq(dispatchOffers.ride_id, rideId),
            eq(dispatchOffers.driver_id, client.driverId),
          ));

          // Update ride to matched + immediately to driver_arriving
          const [driverRow] = await db.select({
            name: users.name,
            vehicle_type: drivers.vehicle_type,
          }).from(drivers)
            .innerJoin(users, eq(users.id, drivers.user_id))
            .where(eq(drivers.id, client.driverId))
            .limit(1);

          await db.update(rides).set({
            driver_id: client.driverId,
            status: 'matched',
            matched_at: new Date(),
          }).where(eq(rides.id, rideId));

          // Notify other drivers that offer is lost
          const offeredDrivers = await db.select({ driver_id: dispatchOffers.driver_id })
            .from(dispatchOffers)
            .where(and(
              eq(dispatchOffers.ride_id, rideId),
              eq(dispatchOffers.outcome, 'delivered'),
            ));
          for (const od of offeredDrivers) {
            if (od.driver_id !== client.driverId) {
              sendToDriver(od.driver_id, { type: 'offer:lost', ride_id: rideId, reason: 'accepted_by_other' });
            }
          }

          // Notify rider
          const [ride] = await db.select({ user_id: rides.user_id })
            .from(rides).where(eq(rides.id, rideId)).limit(1);
          if (ride) {
            sendToRider(ride.user_id, {
              type: 'ride:matched',
              ride_id: rideId,
              driver: {
                name: driverRow?.name ?? '',
                vehicle_type: driverRow?.vehicle_type ?? '',
              },
              eta_minutes: 5,
            });
          }

          send(ws, { type: 'offer:accepted', ride_id: rideId });
        } else if (action === 'reject' && client.role === 'driver' && client.driverId) {
          const rideId = msg.ride_id as string;
          const reason = msg.reason as string | undefined;

          await db.update(dispatchOffers).set({
            outcome: 'rejected',
            responded_at: new Date(),
            rejection_reason: reason ?? null,
          }).where(and(
            eq(dispatchOffers.ride_id, rideId),
            eq(dispatchOffers.driver_id, client.driverId),
          ));

          send(ws, { type: 'offer:rejected', ride_id: rideId });
        }
        break;
      }

      /* ── Ride subscription (rider tracking a ride) ─────────────── */
      case 'ride': {
        if (action === 'subscribe' && client.role === 'rider') {
          client.subscribedRideId = msg.ride_id as string;
        } else if (action === 'unsubscribe' && client.role === 'rider') {
          client.subscribedRideId = undefined;
        }
        break;
      }

      /* ── Chat ──────────────────────────────────────────────────── */
      case 'chat': {
        if (action === 'typing') {
          const rideId = msg.ride_id as string;
          const recipientUserId = msg.recipient_user_id as string;
          const isTyping = msg.is_typing as boolean;
          if (!rideId || !recipientUserId) {
            send(ws, { type: 'error', message: 'missing_chat_fields' }); return;
          }
          sendToUser(recipientUserId, {
            type: 'chat:typing',
            ride_id: rideId,
            sender_user_id: client.userId,
            is_typing: isTyping,
          });
        }
        break;
      }

      default:
        send(ws, { type: 'error', message: `unknown_type: ${type}` });
    }
  });

  ws.on('close', () => {
    handleDisconnect(client).catch(e => logger.error('[ws] cleanup error', e));
    allClients.delete(ws);
  });

  ws.on('error', (err) => {
    logger.error('[ws] connection error', err);
  });
});

// ── Disconnect Handler ─────────────────────────────────────────────────────
async function handleDisconnect(client: WSClient) {
  if (client.driverId) {
    await handleDriverDisconnect(client.driverId);
  }
  if (client.role === 'rider' && client.userId) {
    connectedRiders.delete(client.userId);
  }
  if (client.driverId) {
    connectedDrivers.delete(client.driverId);
    removeDriver(client.driverId);
  }
  logger.info('[ws] connection closed', { userId: client.userId, role: client.role });
}

async function handleDriverDisconnect(driverId: string) {
  // Close online session
  await db.update(driverOnlineSessions).set({
    went_offline_at: new Date(),
    duration_minutes: 0, // will be recomputed by scheduler or next query
  }).where(and(
    eq(driverOnlineSessions.driver_id, driverId),
    isNull(driverOnlineSessions.went_offline_at),
  ));
}

// ── Dispatch Pipeline ──────────────────────────────────────────────────────
async function dispatchRidePipeline(ride: typeof rides.$inferSelect, allowDowngrade = false) {
  const MAX_BATCHES = 3;
  const BATCH_SIZE = 5;
  const BATCH_INTERVAL_MS = 3000;

  // Pre-fetch rider name once for all batches
  const [rider] = await db.select({ name: users.name })
    .from(users).where(eq(users.id, ride.user_id)).limit(1);
  const riderFirstName = rider?.name?.split(' ')[0] ?? 'Rider';

  let batchIndex = 0;

  for (let batch = 1; batch <= MAX_BATCHES; batch++) {
    if (batch > 1) await new Promise(r => setTimeout(r, BATCH_INTERVAL_MS));

    const scored = await scoreAndBatchDrivers(
      ride.id,
      parseFloat(ride.origin_latitude?.toString() ?? '0'),
      parseFloat(ride.origin_longitude?.toString() ?? '0'),
      ride.vehicle_type,
      ride.zone_id,
      BATCH_SIZE,
    );

    if (scored.length === 0) {
      await handleNoDrivers(ride, allowDowngrade);
      return;
    }

    // Insert dispatch_offers rows and broadcast
    const now = new Date();
    for (const s of scored) {
      await db.insert(dispatchOffers).values({
        ride_id: ride.id,
        driver_id: s.driverId,
        batch_index: batchIndex++,
        sent_at: now,
        outcome: 'delivered',
      }).onConflictDoNothing();
    }

    broadcastRideOffer(ride.id, scored.map(s => s.driverId), {
      ride_id: ride.id,
      pickup: {
        lat: parseFloat(ride.origin_latitude?.toString() ?? '0'),
        lng: parseFloat(ride.origin_longitude?.toString() ?? '0'),
        address: ride.origin_address,
      },
      dropoff: {
        lat: parseFloat(ride.destination_latitude?.toString() ?? '0'),
        lng: parseFloat(ride.destination_longitude?.toString() ?? '0'),
        address: ride.destination_address,
      },
      fare_breakdown: ride.fare_breakdown,
      vehicle_type: ride.vehicle_type,
      rider_first_name: riderFirstName,
      distance_km: parseFloat(ride.distance_km?.toString() ?? '0'),
      expires_in_ms: 15000,
      expires_at: new Date(Date.now() + 15000).toISOString(),
    });

    // Fewer than batch size means no more candidates for subsequent batches
    if (scored.length < BATCH_SIZE) {
      if (batch >= MAX_BATCHES || scored.length === 0) {
        await handleNoDrivers(ride, allowDowngrade);
      }
      return;
    }
  }
}

async function handleNoDrivers(ride: typeof rides.$inferSelect, allowDowngrade = false) {
  if (allowDowngrade) {
    await db.update(rides).set({ status: 'no_drivers' }).where(eq(rides.id, ride.id));
    const cells = getH3Ring(
      parseFloat(ride.origin_latitude?.toString() ?? '0'),
      parseFloat(ride.origin_longitude?.toString() ?? '0'),
      1,
    );
    const alternatives: Array<{ vehicle_type: string; fare_breakdown: Record<string, unknown> }> = [];
    for (const vt of VEHICLE_TYPE_VALUES) {
      if (vt === ride.vehicle_type) continue;
      const candidateIds = getDriversInCells(cells, vt);
      if (!candidateIds.length) continue;
      const [pricingRow] = await db.select().from(pricing)
        .where(and(eq(pricing.vehicle_type, vt as any), eq(pricing.is_active, true)))
        .limit(1);
      if (!pricingRow) continue;
      alternatives.push({
        vehicle_type: vt,
        fare_breakdown: calculateFare(
          pricingRow,
          parseFloat(ride.distance_km?.toString() ?? '0'),
          0,
        ) as unknown as Record<string, unknown>,
      });
    }
    sendToRider(ride.user_id, {
      type: 'ride:alternatives',
      ride_id: ride.id,
      alternatives,
    });
  } else {
    await db.update(rides).set({ status: 'expired' }).where(eq(rides.id, ride.id));
    sendToRider(ride.user_id, {
      type: 'ride:expired',
      ride_id: ride.id,
      reason: 'no_drivers_available',
    });
  }
}

// ── Startup ────────────────────────────────────────────────────────────────
async function startup() {
  await refreshH3Index();
  startH3IndexRefresh();
  startCompensationWorker();
  startScheduler();

  const PORT = parseInt(process.env.UTILS_SERVER_PORT ?? '3001');
  server.listen(PORT, () => logger.info(`[ws] dispatch server listening on :${PORT}`));
}

startup().catch(e => { logger.error('[startup] fatal', e); process.exit(1); });
