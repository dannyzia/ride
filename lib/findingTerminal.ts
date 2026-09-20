/**
 * findingTerminal.ts — how the rider's "finding a driver" wait is allowed to
 * end, given the evidence the screen actually has.
 *
 * Why this exists (device evidence 2026-09-20):
 *
 * finding-driver is purely event-driven — it reads the session socket from
 * useWSStore and subscribes. It decided "no live socket" from `!ws`, which is
 * blind to a socket that is PRESENT but not delivering: with `ws` truthy the
 * 30s guard could not fire, and the 120s guard then asserted "No drivers
 * available" — reporting a dispatch-connectivity failure as a supply problem.
 * Observed: the server's /health read `connected_clients: 2,
 * connected_riders: 0` while this screen claimed no drivers were available.
 *
 * The rule, in precedence order:
 *
 * 1. A dead channel settles it. While the rider's socket is not live, the
 *    server has no way to tell us anything — including "no drivers" — so the
 *    honest outcome is the connection state. This deliberately OVERRIDES the
 *    poll: the nearby-drivers count is itself produced by the same backend, and
 *    when the dispatch layer is wedged the count reads 0 because nothing is
 *    answering, not because nobody is out there (device-observed:
 *    `connected_riders: 0` together with `drivers_indexed: 0`). Reporting "no
 *    drivers" from that pairing is the exact misreport this module exists to
 *    prevent.
 *
 * 2. Only over a live channel may the poll earn a supply claim — and then only
 *    when it independently reported an empty pool. A non-zero count means
 *    drivers exist, so silence is not a supply problem; `null` means the HTTP
 *    channel never answered, so nothing is proven either way.
 *
 * Socket liveness is deliberately NOT decided here — it depends on WebSocket
 * handshake state and lives with the socket in lib/riderSocket.ts
 * (`isRiderSocketReady`).
 */
export type TerminalFindingState = 'no_drivers' | 'ws_timeout';

export interface TerminalFindingEvidence {
  /** Whether the dispatch channel is live, per isRiderSocketReady(). */
  socketLive: boolean;
  /**
   * The most recent successful `/api/ride/nearby-drivers` count, or `null` when
   * no poll has succeeded (or the poll is erroring).
   */
  lastNearbyCount: number | null;
}

/** Resolve the terminal state of the wait from the evidence the screen holds. */
export function resolveTerminalFindingState({
  socketLive,
  lastNearbyCount,
}: TerminalFindingEvidence): TerminalFindingState {
  if (!socketLive) return 'ws_timeout';
  return lastNearbyCount === 0 ? 'no_drivers' : 'ws_timeout';
}
