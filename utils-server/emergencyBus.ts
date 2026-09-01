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
