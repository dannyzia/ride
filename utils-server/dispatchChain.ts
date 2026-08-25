/**
 * Sequential dispatch chain — in-memory per-ride state machine (Phase D).
 *
 * One outstanding offer per ride at any time. The chain loop is
 * dependency-injected so the mechanics (single outstanding offer, TTL,
 * settlement routing, abort) are unit-testable without importing index.ts
 * (which starts a real server at import time and cannot run under jest).
 *
 * index.ts owns the deps: socket registry checks, DB status re-checks,
 * leadBilling debit, WS emissions, and the auto-accept/match flow.
 *
 * TD-15: in-memory state is acceptable — on crash the chains vanish and the
 * startup stuck-ride sweep re-runs the pipeline (unique indexes dedupe).
 */

export interface ChainCandidate {
  driverId: string;
  auto_accept_eligible: boolean;
}

/** How the outstanding offer settled (or the chain terminated). */
export type OfferOutcome =
  | 'accepted' // this driver accepted; handler stamped outcome='accepted'
  | 'rejected' // this driver declined; handler stamped outcome='rejected'
  | 'expired' // TTL fired (driver sent offer:lost expired)
  | 'cancelled' // ride cancelled mid-offer (driver sent offer:lost cancelled)
  | 'accepted_elsewhere' // ride matched by another driver/handler
  | 'disconnected'; // driver socket closed mid-offer — resolve as expired, lead stays billed

export type ChainEndReason =
  | 'matched' // chain stopped on a successful match (accept or auto-accept)
  | 'exhausted' // pool exhausted → caller runs the no-drivers flow
  | 'aborted' // rider cancel / chain abort
  | 'inactive' // ride no longer 'dispatching' (matched elsewhere, cancelled, expired)
  | 'duplicate'; // a live chain already exists — single-pipeline-per-ride backstop

interface PendingOffer {
  driverId: string;
  timer: NodeJS.Timeout;
  resolve: (outcome: OfferOutcome) => void;
}

interface ChainState {
  rideId: string;
  candidates: ChainCandidate[];
  /** Next candidate index to examine. */
  cursor: number;
  /** Driver ids already taken from the candidate list (never offered twice). */
  taken: Set<string>;
  /** Number of successful debits (== delivered offer rows) — used as batch_index. */
  offersSent: number;
  pendingOffer: PendingOffer | null;
  aborted: boolean;
}

const chains = new Map<string, ChainState>();

export function registerChain(
  rideId: string,
  candidates: ChainCandidate[],
): boolean {
  if (chains.has(rideId)) return false;
  chains.set(rideId, {
    rideId,
    candidates,
    cursor: 0,
    taken: new Set(),
    offersSent: 0,
    pendingOffer: null,
    aborted: false,
  });
  return true;
}

export function getChain(rideId: string): { aborted: boolean; cursor: number; offersSent: number } | undefined {
  const state = chains.get(rideId);
  if (!state) return undefined;
  return { aborted: state.aborted, cursor: state.cursor, offersSent: state.offersSent };
}

export function hasPendingOffer(rideId: string): boolean {
  return chains.get(rideId)?.pendingOffer != null;
}

export function pendingOfferDriverId(rideId: string): string | null {
  return chains.get(rideId)?.pendingOffer?.driverId ?? null;
}

function clearPending(state: ChainState): void {
  if (state.pendingOffer) {
    clearTimeout(state.pendingOffer.timer);
    state.pendingOffer = null;
  }
}

/**
 * Resolve the chain's outstanding offer (accept/reject handler, cancel
 * notify, or socket close). Returns true when a matching pending offer was
 * found and resolved; false is a no-op (no chain, no pending offer, driver
 * mismatch, or already settled — the promise resolves only once).
 */
export function resolvePendingOffer(
  rideId: string,
  driverId: string,
  outcome: OfferOutcome,
): boolean {
  const state = chains.get(rideId);
  const pending = state?.pendingOffer;
  if (!state || !pending || pending.driverId !== driverId) return false;
  clearPending(state);
  pending.resolve(outcome);
  return true;
}

/**
 * Resolve every outstanding offer held by a driver (socket close — no dead
 * 15s wait on a gone driver; the lead stays billed per the
 * outcome-independent rule). Returns true if any offer was resolved.
 */
export function resolvePendingOfferForDriver(
  driverId: string,
  outcome: OfferOutcome,
): boolean {
  let resolved = false;
  for (const state of chains.values()) {
    if (state.pendingOffer?.driverId === driverId) {
      resolvePendingOffer(state.rideId, driverId, outcome);
      resolved = true;
    }
  }
  return resolved;
}

/**
 * Abort a ride's chain (rider cancel / internal notify). Marks the chain
 * aborted (the loop stops before offering further candidates) and resolves
 * any outstanding offer as 'cancelled'. Returns the driverId of the pending
 * offer so the caller can send them `offer:lost { reason: 'cancelled' }`.
 * Already-billed leads stay billed — no refunds (ruling 8).
 */
export function abortChain(rideId: string): { driverId: string } | null {
  const state = chains.get(rideId);
  if (!state) return null;
  state.aborted = true;
  const pending = state.pendingOffer;
  if (pending) {
    clearPending(state);
    pending.resolve('cancelled');
    return { driverId: pending.driverId };
  }
  return null;
}

/**
 * Create the settlement promise for one outstanding offer: resolved by
 * exactly ONE of the offer:accept handler, offer:reject handler, the TTL
 * timer (fires onExpire first so the caller can send `offer:lost expired`),
 * or a driver socket close. Guards the single-outstanding-offer invariant.
 */
export function awaitOfferSettlement(
  rideId: string,
  driverId: string,
  ttlMs: number,
  onExpire: () => void,
): Promise<OfferOutcome> {
  return new Promise<OfferOutcome>((resolve) => {
    const state = chains.get(rideId);
    if (!state) {
      resolve('expired');
      return;
    }
    if (state.pendingOffer) {
      // Defensive: should be unreachable (the loop awaits each settlement
      // before the next send). Resolve the stale offer as expired so the new
      // one can proceed — invariant: never two outstanding offers.
      const stale = state.pendingOffer;
      clearPending(state);
      stale.resolve('expired');
    }
    const timer = setTimeout(() => {
      const pending = chains.get(rideId)?.pendingOffer;
      if (pending && pending.driverId === driverId) {
        chains.get(rideId)!.pendingOffer = null;
        onExpire();
        resolve('expired');
      }
    }, ttlMs);
    state.pendingOffer = { driverId, timer, resolve };
  });
}

export interface RunChainDeps {
  /** True when the driver has a live open socket (connected registry). */
  isDriverConnected(driverId: string): boolean;
  /** DB re-check between offers: false aborts the chain (cancel/match/expire). */
  isRideDispatching(): Promise<boolean>;
  /** Offer-time debit (leadBilling). billed=false → skip candidate, no offer. */
  debitLead(
    driverId: string,
    chainIndex: number,
  ): Promise<{ billed: boolean; balanceAfter: number | null }>;
  /** Emit `lead:billed` to the driver right after a successful debit. */
  emitLeadBilled(driverId: string, balanceAfter: number): void;
  /**
   * Auto-accept match flow. Returns true when the ride was matched to this
   * driver (chain stops); false on race loss (next status check ends chain).
   */
  runAutoAccept(driverId: string): Promise<boolean>;
  /** Send ride:offer and return the settlement outcome (TTL/handlers/close). */
  sendOffer(
    driverId: string,
    chainIndex: number,
    balanceAfter: number,
  ): Promise<OfferOutcome>;
  /** Post-settlement hook — stamps terminal offer outcomes in DB. */
  onSettled(driverId: string, outcome: OfferOutcome): Promise<void> | void;
  /** Chain end hook — 'exhausted' runs the no-drivers flow, others no-op. */
  onChainEnd(reason: ChainEndReason): Promise<void> | void;
}

/**
 * Run the sequential chain for one ride: take next candidate → connectivity
 * check → ride-status re-check → debit → lead:billed → auto-accept or
 * offer+await settlement → repeat. Runs to pool exhaustion — NO cap on
 * chain length (locked, §6). Exactly one outstanding offer per ride at any
 * time (structural: the loop awaits each settlement before the next offer).
 */
export async function runSequentialChain(
  rideId: string,
  candidates: ChainCandidate[],
  deps: RunChainDeps,
): Promise<ChainEndReason> {
  if (!registerChain(rideId, candidates)) {
    // Single-pipeline-per-ride backstop: a live chain already exists for
    // this ride (double /internal/dispatch, or recovery racing a live chain).
    return 'duplicate';
  }
  const state = chains.get(rideId)!;

  try {
    for (;;) {
      if (state.aborted) {
        return await finish(deps, 'aborted');
      }

      const candidate = nextCandidate(state);
      if (!candidate) {
        return await finish(deps, 'exhausted');
      }

      if (!deps.isDriverConnected(candidate.driverId)) continue;

      // Between offers: re-check ride status from DB. Rider cancel, system
      // expire, or a match by another path aborts the chain (the pending
      // offer, if any, was already resolved by its terminal event).
      if (!(await deps.isRideDispatching())) {
        return await finish(deps, 'inactive');
      }

      // Offer-time debit. chainIndex = ordinal of the delivered offer row
      // (gapless 0..n; skipped candidates consume no index).
      const chainIndex = state.offersSent;
      let debit: { billed: boolean; balanceAfter: number | null };
      try {
        debit = await deps.debitLead(candidate.driverId, chainIndex);
      } catch (e) {
        // A billing failure must never kill the whole chain — treat like a
        // skip; the next candidate proceeds.
        debit = { billed: false, balanceAfter: null };
        void e;
      }
      if (!debit.billed || debit.balanceAfter == null) continue;
      state.offersSent += 1;

      deps.emitLeadBilled(candidate.driverId, debit.balanceAfter);

      if (candidate.auto_accept_eligible) {
        const matched = await deps.runAutoAccept(candidate.driverId);
        if (matched) {
          return await finish(deps, 'matched');
        }
        // Race lost — the ride is no longer dispatching; the next loop's
        // status check ends the chain as 'inactive'.
        continue;
      }

      const outcome = await deps.sendOffer(candidate.driverId, chainIndex, debit.balanceAfter);
      await deps.onSettled(candidate.driverId, outcome);

      if (outcome === 'accepted') {
        return await finish(deps, 'matched');
      }
      if (outcome === 'accepted_elsewhere') {
        return await finish(deps, 'inactive');
      }
      if (outcome === 'cancelled') {
        return await finish(deps, 'aborted');
      }
      // rejected / expired / disconnected → next candidate
    }
  } finally {
    // Never leave a registered chain or a live TTL timer behind.
    const pending = state.pendingOffer;
    clearPending(state);
    if (pending) pending.resolve('expired');
    chains.delete(rideId);
  }
}

/** Take the next not-yet-taken candidate; dedupes repeated driver ids. */
function nextCandidate(state: ChainState): ChainCandidate | null {
  while (state.cursor < state.candidates.length) {
    const candidate = state.candidates[state.cursor];
    state.cursor += 1;
    if (state.taken.has(candidate.driverId)) continue; // no driver offered twice
    state.taken.add(candidate.driverId);
    return candidate;
  }
  return null;
}

async function finish(deps: RunChainDeps, reason: ChainEndReason): Promise<ChainEndReason> {
  await deps.onChainEnd(reason);
  return reason;
}
