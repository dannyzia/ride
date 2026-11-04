/**
 * wsRecipientHarness.ts — Behavioral Test Harness for WebSocket Recipient Routing.
 *
 * Implements Theme 13 (stale-recipient WS events) audit instrumentation for ISSUE-41.
 * Provides per-connection send recording, lifecycle simulation (connect, reconnect, disconnect),
 * and deterministic assertion primitives to verify that events are strictly routed to the
 * authorized counterparty and that stale/terminated sockets receive zero leaked data.
 */

export const WS_READY_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

export interface SentMessageRecord {
  ts: number;
  raw: string;
  parsed: Record<string, unknown>;
}

export class MockWebSocket {
  public readonly id: string;
  public readyState: number = WS_READY_STATE.OPEN;
  public readonly sent: SentMessageRecord[] = [];
  private readonly listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();

  constructor(id: string) {
    this.id = id;
  }

  public on(event: string, fn: (...args: unknown[]) => void): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(fn);
    return this;
  }

  public removeListener(event: string, fn: (...args: unknown[]) => void): this {
    this.listeners.get(event)?.delete(fn);
    return this;
  }

  public emit(event: string, ...args: unknown[]): boolean {
    const fns = this.listeners.get(event);
    if (!fns || fns.size === 0) return false;
    for (const fn of Array.from(fns)) {
      fn(...args);
    }
    return true;
  }

  public send(data: string): void {
    if (this.readyState !== WS_READY_STATE.OPEN) {
      // Discard or drop message on non-open socket, matching ws standard behavior
      return;
    }
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(data);
    } catch {
      parsed = { _raw: data };
    }
    this.sent.push({
      ts: Date.now(),
      raw: data,
      parsed,
    });
  }

  public close(): void {
    if (this.readyState === WS_READY_STATE.CLOSED || this.readyState === WS_READY_STATE.CLOSING) {
      return;
    }
    this.readyState = WS_READY_STATE.CLOSING;
    this.readyState = WS_READY_STATE.CLOSED;
    this.emit("close");
  }
}

export interface WSClient {
  ws: MockWebSocket;
  userId?: string;
  driverId?: string;
  role?: "driver" | "rider" | "admin" | "shop";
  vehicleType?: string;
  lastSeen?: number;
  driverSessionId?: string;
}

export interface SosAlertRoutingInput {
  id: string;
  role: "rider" | "driver";
  user_id: string;
  ride_id?: string | null;
  latitude: string;
  longitude: string;
}

export interface RideLookupResult {
  user_id: string;
  driver_id: string | null;
}

export class WsRecipientHarness {
  public readonly connectedDrivers = new Map<string, WSClient>();
  public readonly connectedRiders = new Map<string, WSClient>();
  public readonly connectedAdmins = new Map<string, WSClient>();
  public readonly allClients = new Map<MockWebSocket, WSClient>();

  // ── Connection Lifecycle ──────────────────────────────────────────────────

  public connectDriver(driverId: string, userId: string, ws: MockWebSocket, vehicleType = "cng"): WSClient {
    // One driver, one live socket: close previous socket on reconnect (index.ts:1169)
    const prevDriver = this.connectedDrivers.get(driverId);
    if (prevDriver && prevDriver.ws !== ws) {
      prevDriver.ws.close();
    }

    const client: WSClient = {
      ws,
      userId,
      driverId,
      role: "driver",
      vehicleType,
      lastSeen: Date.now(),
    };
    this.connectedDrivers.set(driverId, client);
    this.allClients.set(ws, client);

    ws.on("close", () => {
      this.handleDisconnect(client);
    });

    return client;
  }

  public connectRider(userId: string, ws: MockWebSocket): WSClient {
    // One rider, one live socket: close previous socket on reconnect (index.ts:1287)
    const prevRider = this.connectedRiders.get(userId);
    if (prevRider && prevRider.ws !== ws) {
      prevRider.ws.close();
    }

    const client: WSClient = {
      ws,
      userId,
      role: "rider",
      lastSeen: Date.now(),
    };
    this.connectedRiders.set(userId, client);
    this.allClients.set(ws, client);

    ws.on("close", () => {
      this.handleDisconnect(client);
    });

    return client;
  }

  public connectAdmin(userId: string, ws: MockWebSocket): WSClient {
    // One admin, one live socket: close previous socket on reconnect (index.ts:1296)
    const prevAdmin = this.connectedAdmins.get(userId);
    if (prevAdmin && prevAdmin.ws !== ws) {
      prevAdmin.ws.close();
    }

    const client: WSClient = {
      ws,
      userId,
      role: "admin",
      lastSeen: Date.now(),
    };
    this.connectedAdmins.set(userId, client);
    this.allClients.set(ws, client);

    ws.on("close", () => {
      this.handleDisconnect(client);
    });

    return client;
  }

  public handleDisconnect(client: WSClient): void {
    if (client.role === "driver" && client.driverId) {
      if (this.connectedDrivers.get(client.driverId) === client) {
        this.connectedDrivers.delete(client.driverId);
      }
    }
    if (client.role === "rider" && client.userId) {
      if (this.connectedRiders.get(client.userId) === client) {
        this.connectedRiders.delete(client.userId);
      }
    }
    if (client.role === "admin" && client.userId) {
      if (this.connectedAdmins.get(client.userId) === client) {
        this.connectedAdmins.delete(client.userId);
      }
    }
    this.allClients.delete(client.ws);
  }

  // ── Dispatch & Routing Primitives (Mirroring utils-server/index.ts) ────────

  public send(ws: MockWebSocket, msg: Record<string, unknown>): void {
    if (ws.readyState === WS_READY_STATE.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  public sendToDriver(driverId: string, msg: Record<string, unknown>): boolean {
    const client = this.connectedDrivers.get(driverId);
    if (client) {
      this.send(client.ws, msg);
      return true;
    }
    return false;
  }

  public sendToRider(userId: string, msg: Record<string, unknown>): boolean {
    const client = this.connectedRiders.get(userId);
    if (client) {
      this.send(client.ws, msg);
      return true;
    }
    return false;
  }

  public sendToUser(userId: string, msg: Record<string, unknown>): boolean {
    const riderClient = this.connectedRiders.get(userId);
    if (riderClient) {
      this.send(riderClient.ws, msg);
      return true;
    }
    for (const client of this.connectedDrivers.values()) {
      if (client.userId === userId) {
        this.send(client.ws, msg);
        return true;
      }
    }
    return false;
  }

  public broadcastToAdmins(msg: Record<string, unknown>): number {
    let count = 0;
    for (const adminClient of this.connectedAdmins.values()) {
      if (adminClient.ws.readyState === WS_READY_STATE.OPEN) {
        this.send(adminClient.ws, msg);
        count++;
      }
    }
    return count;
  }

  // ── Domain Event Emits ────────────────────────────────────────────────────

  public routeSosAlert(
    alert: SosAlertRoutingInput,
    rideLookup?: (rideId: string) => Promise<RideLookupResult | null> | RideLookupResult | null,
  ): { adminDelivered: number; counterpartyDelivered: boolean } {
    // 1. Fan out to all connected admins
    const adminDelivered = this.broadcastToAdmins({ type: "admin:sos", alert });

    // 2. Counterparty delivery (C3-7)
    let counterpartyDelivered = false;
    if (alert.ride_id && rideLookup) {
      const ride = typeof rideLookup === "function" ? rideLookup(alert.ride_id) : null;
      const resolvedRide = ride instanceof Promise ? null : ride; // Sync support in test harness
      if (resolvedRide) {
        if (alert.role === "rider" && resolvedRide.driver_id) {
          this.sendToDriver(resolvedRide.driver_id, {
            type: "sos:counterparty",
            alert_id: alert.id,
            ride_id: alert.ride_id,
            from_role: "rider",
            lat: alert.latitude,
            lng: alert.longitude,
          });
          counterpartyDelivered = true;
        } else if (alert.role === "driver") {
          this.sendToRider(resolvedRide.user_id, {
            type: "sos:counterparty",
            alert_id: alert.id,
            ride_id: alert.ride_id,
            from_role: "driver",
            lat: alert.latitude,
            lng: alert.longitude,
          });
          counterpartyDelivered = true;
        }
      }
    }

    return { adminDelivered, counterpartyDelivered };
  }

  public routeChatMessage(rideId: string, recipientUserId: string, message: Record<string, unknown>): boolean {
    return this.sendToUser(recipientUserId, {
      type: "chat:message",
      ride_id: rideId,
      message,
    });
  }

  public routeDriverArrived(rideId: string, riderUserId: string, arrivedAt?: string): boolean {
    return this.sendToRider(riderUserId, {
      type: "ride:arrived",
      ride_id: rideId,
      arrived_at: arrivedAt ?? new Date().toISOString(),
    });
  }

  public routeRideCompleted(rideId: string, riderUserId: string, payload: Record<string, unknown>): boolean {
    return this.sendToRider(riderUserId, {
      type: "ride:completed",
      ride_id: rideId,
      ...payload,
    });
  }

  public routeRideCancelled(driverId: string, rideId: string, cancelledBy: "driver" | "rider" | "system"): boolean {
    return this.sendToDriver(driverId, {
      type: "ride:cancelled",
      ride_id: rideId,
      cancelled_by: cancelledBy,
    });
  }

  // ── Verification & Assertion Helpers ──────────────────────────────────────

  public getMessages(ws: MockWebSocket): Record<string, unknown>[] {
    return ws.sent.map((s) => s.parsed);
  }

  public getMessagesByType(ws: MockWebSocket, type: string): Record<string, unknown>[] {
    return this.getMessages(ws).filter((m) => m.type === type);
  }

  public assertZeroMessages(ws: MockWebSocket): void {
    if (ws.sent.length !== 0) {
      throw new Error(`Expected socket ${ws.id} to receive 0 messages, but received ${ws.sent.length}: ${JSON.stringify(this.getMessages(ws))}`);
    }
  }

  public assertReceived(ws: MockWebSocket, expectedType: string, partial?: Record<string, unknown>): Record<string, unknown> {
    const msgs = this.getMessagesByType(ws, expectedType);
    if (msgs.length === 0) {
      throw new Error(`Expected socket ${ws.id} to receive event '${expectedType}', but received: ${JSON.stringify(this.getMessages(ws))}`);
    }
    const match = msgs[0];
    if (partial) {
      for (const [k, v] of Object.entries(partial)) {
        if (JSON.stringify(match[k]) !== JSON.stringify(v)) {
          throw new Error(`Socket ${ws.id} event '${expectedType}' property mismatch for '${k}': expected ${JSON.stringify(v)}, got ${JSON.stringify(match[k])}`);
        }
      }
    }
    return match;
  }

  public assertExclusiveDelivery(
    recipientWs: MockWebSocket,
    quarantinedSockets: MockWebSocket[],
    expectedType: string,
  ): void {
    this.assertReceived(recipientWs, expectedType);
    for (const q of quarantinedSockets) {
      const leaked = this.getMessagesByType(q, expectedType);
      if (leaked.length > 0) {
        throw new Error(`Data leak detected: socket ${q.id} received '${expectedType}' intended only for ${recipientWs.id}`);
      }
    }
  }
}
