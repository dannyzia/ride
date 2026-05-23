import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { validateServerEnv } from '../lib/env';
import { startH3IndexRefresh, refreshH3Index } from './h3Index';
import { startCompensationWorker } from './compensationWorker';
import { startScheduler } from './scheduler';
import { scoreAndBatchDrivers } from './dispatch';
import { logger } from '../lib/logger';

validateServerEnv();

interface WSClient {
  ws: WebSocket;
  userId?: string;
  role?: 'customer' | 'driver';
  driverId?: string;
}

const clients = new Map<WebSocket, WSClient>();
const driverSessions = new Map<string, WebSocket>(); // driverId → ws

const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200); res.end('ok'); }
  else { res.writeHead(404); res.end(); }
});

const wss = new WebSocketServer({ server });

function send(ws: WebSocket, msg: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

wss.on('connection', (ws: WebSocket) => {
  const client: WSClient = { ws };
  clients.set(ws, client);
  logger.info('[ws] new connection');

  ws.on('message', (raw) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(raw.toString()); } catch {
      send(ws, { type: 'error', message: 'invalid_json' });
      return;
    }

    const type = msg.type as string;
    if (!type) { send(ws, { type: 'error', message: 'missing_type' }); return; }

    switch (type) {
      /* ── Registration ── */
      case 'register': {
        client.userId = msg.userId as string;
        client.role = msg.role as 'customer' | 'driver';
        client.driverId = msg.driverId as string;
        if (client.driverId) driverSessions.set(client.driverId, ws);
        send(ws, { type: 'registered', userId: client.userId });
        break;
      }

      /* ── Driver → Server ── */
      case 'riderLocationUpdate': {
        const driverId = msg.driverId as string;
        const driverWs = driverSessions.get(driverId);
        if (driverWs && driverWs !== ws) break; // stale session

        // Broadcast location to customers tracking this driver
        for (const c of clients.values()) {
          if (c.role === 'customer' && c.ws !== ws) {
            send(c.ws, {
              type: 'riderLocationUpdated',
              driverId,
              latitude: msg.latitude,
              longitude: msg.longitude,
              address: msg.address,
            });
          }
        }
        break;
      }

      case 'onDuty': {
        logger.info('[ws] driver on duty', { driverId: client.driverId });
        break;
      }

      case 'offDuty': {
        logger.info('[ws] driver off duty', { driverId: client.driverId });
        break;
      }

      /* ── Customer → Server ── */
      case 'rideOffer': {
        const rideDetails = msg.rideDetails as Record<string, any> || {};
        const { id: rideId, rider_id: driverId, fare } = rideDetails;

        if (driverId) {
          // Direct offer to specific driver
          const driverWs = driverSessions.get(driverId);
          if (driverWs) {
            send(driverWs, {
              type: 'rideOffer',
              rideDetails,
            });
          }
          send(ws, { type: 'rideOfferSent', id: rideId });
        } else {
          // Dispatch to nearby drivers (server-side dispatch)
          const originLat = rideDetails.pickupDetails?.pickupLatitude;
          const originLng = rideDetails.pickupDetails?.pickupLongitude;
          const vehicleType = rideDetails.vehicleType || 'car_economy';

          scoreAndBatchDrivers(rideId || 'unknown', originLat, originLng, vehicleType, '00000000-0000-0000-0000-000000000000', 5)
            .then((drivers) => {
              let offered = 0;
              for (const d of drivers) {
                const driverWs = driverSessions.get(d.driverId);
                if (driverWs) {
                  send(driverWs, {
                    type: 'rideOffer',
                    rideDetails: { ...rideDetails, id: rideId },
                  });
                  offered++;
                }
              }
              send(ws, { type: 'rideOfferSent', id: rideId, offeredDrivers: offered });
              if (offered === 0) send(ws, { type: 'rideOfferRejected', id: rideId });
            })
            .catch((err) => {
              logger.error('[ws] dispatch error', err);
              send(ws, { type: 'rideOfferRejected', id: rideId });
            });
        }
        break;
      }

      /* ── Driver response to ride offer ── */
      case 'acceptRideOffer': {
        const acptRideId = msg.id as string;
        const acptDriverId = msg.driverId as string;
        // Find the customer who made this offer and notify them
        for (const c of clients.values()) {
          if (c.role === 'customer' && c.ws !== ws) {
            send(c.ws, { type: 'rideofferAccepted', id: acptRideId, driverId: acptDriverId });
          }
        }
        break;
      }

      case 'rejectRideOffer': {
        const rejRideId = msg.id as string;
        const rejDriverId = msg.driverId as string;
        for (const c of clients.values()) {
          if (c.role === 'customer' && c.ws !== ws) {
            send(c.ws, { type: 'rideOfferRejected', id: rejRideId, driverId: rejDriverId });
          }
        }
        break;
      }

      /* ── Driver ride lifecycle ── */
      case 'driverReached': {
        const drRideId = msg.id as string;
        for (const c of clients.values()) {
          if (c.role === 'customer' && c.ws !== ws) {
            send(c.ws, { type: 'driverReached', id: drRideId });
          }
        }
        break;
      }

      case 'rideBegins': {
        const rbRideId = msg.id as string;
        for (const c of clients.values()) {
          if (c.role === 'customer' && c.ws !== ws) {
            send(c.ws, { type: 'rideBegins', id: rbRideId });
          }
        }
        break;
      }

      case 'rideEnded': {
        const reRideId = msg.id as string;
        for (const c of clients.values()) {
          if (c.role === 'customer' && c.ws !== ws) {
            send(c.ws, { type: 'rideEnded', id: reRideId });
          }
        }
        break;
      }

      /* ── Customer messages to forward to driver ── */
      case 'providingOTP': {
        const otpRideId = msg.id as string;
        const otpDriverId = msg.driver_id as string;
        const driverWs = driverSessions.get(otpDriverId);
        if (driverWs) {
          send(driverWs, {
            type: 'otpProvided',
            id: otpRideId,
            otp: msg.otp,
          });
        }
        break;
      }

      case 'reachedDestinationVerified': {
        const rdvRideId = msg.id as string;
        const rdvDriverId = msg.rider_id as string;
        const driverWs = driverSessions.get(rdvDriverId);
        if (driverWs) {
          send(driverWs, { type: 'destinationVerified', id: rdvRideId });
        }
        break;
      }

      case 'noConfirmationAlert': {
        const ncaRideId = msg.id as string;
        const ncaDriverId = msg.rider_id as string;
        const driverWs = driverSessions.get(ncaDriverId);
        if (driverWs) {
          send(driverWs, { type: 'noConfirmationAlert', id: ncaRideId });
        }
        break;
      }

      default:
        send(ws, { type: 'error', message: `unknown_type: ${type}` });
    }
  });

  ws.on('close', () => {
    const c = clients.get(ws);
    if (c?.driverId) driverSessions.delete(c.driverId);
    clients.delete(ws);
    logger.info('[ws] connection closed');
  });

  ws.on('error', (err) => {
    logger.error('[ws] connection error', err);
  });
});

async function startup() {
  await refreshH3Index();
  startH3IndexRefresh();
  startCompensationWorker();
  startScheduler();

  const PORT = parseInt(process.env.UTILS_SERVER_PORT ?? '3001');
  server.listen(PORT, () => logger.info(`[ws] dispatch server listening on :${PORT}`));
}

startup().catch(e => { logger.error('[startup] fatal', e); process.exit(1); });
