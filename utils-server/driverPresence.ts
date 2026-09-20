/**
 * Driver presence grace — the decision layer behind the drift between
 * `drivers.is_online` and a live driver socket.
 *
 * A phone that sleeps, is backgrounded, or loses signal drops its WebSocket
 * without the driver choosing to stop working. Treating that as going offline
 * (closing the online session AND clearing the flag) made a returning driver
 * silently fall out of dispatch until they tapped "Go online" again — measured
 * on-device 2026-09-20: a 45s background cycle left `drivers_indexed` at 0.
 *
 * So the online fact is held for a bounded grace window and only the driver's
 * own decision (going offline), an admin suspension, or an expired window closes
 * it. This module holds that policy as pure functions over a registry, so it can
 * be tested without the WebSocket server, the DB, or timers; `index.ts` owns the
 * DB writes and the socket map and calls in here.
 */

/** How long a lost socket holds online state before it is treated as offline. */
export const DRIVER_DISCONNECT_GRACE_MS = 90_000;

/** A socket loss awaiting either a reconnect (cancelled) or its deadline. */
export interface PendingDisconnect<T = unknown> {
  deadline: number;
  /** The socket that dropped, kept for the utilization row closed on expiry. */
  client?: T;
}

export type DisconnectDisposition =
  /** No live socket and not a decision: hold online state, start the grace. */
  | "hold"
  /** Already inside an unexpired grace window: nothing to do. */
  | "ignore"
  /** Close the session and the flag (the one close path). */
  | "close";

export interface DisconnectDecision {
  /** True for an admin suspension or a user decision — never graced. */
  immediate: boolean;
  /** Whether this driver already holds a pending (unexpired) grace entry. */
  hasPending: boolean;
  /** Deadline of that entry, when one exists. */
  pendingDeadline?: number;
  now: number;
}

/**
 * Decide what a disconnect means for a driver's online state.
 *
 * `hold` covers the transient case (a socket loss that is not a decision).
 * `ignore` covers a repeat notification inside a window that is still open.
 * `close` covers the deliberate cases plus an expired window.
 */
export function decideDisconnect({
  immediate,
  hasPending,
  pendingDeadline,
  now,
}: DisconnectDecision): DisconnectDisposition {
  // A decision is never held: an admin suspension closes online state at once.
  if (immediate) return "close";
  if (!hasPending) return "hold";
  // A window that has run out is the one non-deliberate way to close.
  return pendingDeadline !== undefined && now >= pendingDeadline ? "close" : "ignore";
}

/** Start (or restart) the grace window for a driver whose socket dropped. */
export function noteDisconnect<T>(
  registry: Map<string, PendingDisconnect<T>>,
  driverId: string,
  client: T | undefined,
  now: number,
): void {
  registry.set(driverId, {
    deadline: now + DRIVER_DISCONNECT_GRACE_MS,
    client,
  });
}

/**
 * A socket registered for this driver. Returns true when it cancelled a live
 * grace window (the reconnect-within-grace case the driver should not see).
 */
export function noteReconnect<T>(
  registry: Map<string, PendingDisconnect<T>>,
  driverId: string,
): boolean {
  return registry.delete(driverId);
}

/**
 * Grace entries that have run out and must now close, as `[driverId, entry]`.
 *
 * Both kinds of entry leave the registry here: an expired one because it is
 * being closed, and one whose driver is live again because its socket
 * re-attached (the caller checks liveness before closing, so a reconnect racing
 * this sweep can never be closed by it).
 */
export function dueForClose<T>(
  registry: Map<string, PendingDisconnect<T>>,
  now: number,
  isLive: (driverId: string) => boolean,
): Array<[string, PendingDisconnect<T>]> {
  const due: Array<[string, PendingDisconnect<T>]> = [];
  for (const [driverId, entry] of registry) {
    if (now < entry.deadline) continue;
    registry.delete(driverId);
    if (isLive(driverId)) continue;
    due.push([driverId, entry]);
  }
  return due;
}
