/**
 * emergencyBus — decouples the emergency chain from the WS server singleton.
 *
 * utils-server/index.ts registers the real sendToUser at startup;
 * utils-server-free consumers (Expo REST routes importing emergencyChain)
 * keep a no-op emitter — they notify via lib/notify instead. This keeps
 * utils-server/index.ts (http + WebSocketServer) OUT of the Expo API bundle.
 */
export type EmergencyEmit = (userId: string, msg: Record<string, unknown>) => void;

let emit: EmergencyEmit = () => {};

export function setEmergencyEmitter(fn: EmergencyEmit): void {
  emit = fn;
}

export function emergencySendToUser(userId: string, msg: Record<string, unknown>): void {
  emit(userId, msg);
}

/**
 * S5/F-19 live-location relay index — driverUserId → active emergency.
 * Rebuilt every 2s by the scheduler from EMERGENCY_ACTIVE_STATES rows (tiny,
 * indexed); the WS location handler reads it O(1) with NO per-update DB cost.
 * Entries vanish within one tick of a terminal transition.
 */
export interface ActiveEmergencyEntry {
  requestId: string;
  callerUserId: string;
}

let activeByDriver = new Map<string, ActiveEmergencyEntry>();

export function setActiveEmergencies(next: Map<string, ActiveEmergencyEntry>): void {
  activeByDriver = next;
}

export function getActiveEmergencyForDriver(
  driverUserId: string,
): ActiveEmergencyEntry | undefined {
  return activeByDriver.get(driverUserId);
}
