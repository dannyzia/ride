import crypto from 'crypto';
import { db } from '@/src/db';
import { idempotencyKeys } from '@/src/db/schema';
import { and, eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * Platform-wide Idempotency-Key convention (decision
 * 01M23628A1566SK1D5XXV1NT5G — binding semantics, ISSUE-37 vehicle).
 *
 * Storage is DB-backed, never in-memory (TD-15: in-memory state dies on
 * restart; INSTANCE_COUNT=1 is today's fact, not a design assumption).
 * The (route, key) pair is the barrier: a duplicate claim NEVER re-executes
 * the handler body — it returns the stored original outcome.
 *
 * EXEMPT ROUTES (per the decision, documented here as the in-code record):
 *   - POST /api/sos/alert — SOS insert is unconditional by R3.1
 *     frequency-as-intensity design (every trigger creates a new alert;
 *     suppressing a repeat would defeat the intensity signal).
 *   - Internal scheduler endpoints (/internal/*) — server-to-server,
 *     not client-retryable, already serialized by scheduler ownership.
 *   - PortPos payment callbacks (/api/payment/portpos/callback) — already
 *     verifyIPN-guarded with the in-tx paid-status transition guard; they
 *     are provider-driven, not client-retryable.
 *
 * Interim per-surface deterministic keys (cancel_fee_${rideId},
 * payment_events.idempotency_key, leadBilling 23505 barriers) remain
 * AUTHORITATIVE for routes not yet wired through this helper; the
 * convention supersedes them only as each route wires in.
 */

/** Key contract: client-generated opaque string, uuid recommended, <= 255 chars. */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

/**
 * Canonical route ids for the (route, key) barrier. Exactly one entry per
 * wired route — extending this map is part of wiring a new route.
 */
export const IDEMPOTENCY_ROUTES = {
  riderWalletTopup: '/api/rider/wallet/topup',
  driverWalletTopup: '/api/driver/wallet/topup',
  riderPasses: '/api/rider/passes',
  packagePurchase: '/api/package/purchase',
} as const;

/** Extracts and validates the Idempotency-Key header. null = absent/invalid. */
export function extractIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get(IDEMPOTENCY_KEY_HEADER);
  if (!raw) return null;
  const key = raw.trim();
  if (key.length === 0 || key.length > IDEMPOTENCY_KEY_MAX_LENGTH) return null;
  return key;
}

/** sha256 hex of "METHOD body" — detects key reuse on a different payload. */
export function sha256Fingerprint(method: string, body: string): string {
  return crypto.createHash('sha256').update(`${method} ${body}`).digest('hex');
}

export type IdempotencyOutcome =
  | { kind: 'execute' }
  | { kind: 'replay'; response: Response }
  | { kind: 'conflict'; response: Response };

export interface BeginClaimParams {
  /** Canonical route id for the barrier — e.g. '/api/rider/wallet/topup'. */
  route: string;
  /** Validated Idempotency-Key header value (see extractIdempotencyKey). */
  key: string;
  /** App-level users.id of the authenticated caller (barrier co-scope). */
  userId?: string | null;
  /** sha256 hex of method + canonical body — detects key reuse on a different payload. */
  requestFingerprint?: string | null;
}

/**
 * Phase 1 of the two-phase claim. Inserts the in-flight marker row (null
 * response_status) protected by the (route, key) unique barrier.
 *
 *   - fresh insert        → { kind: 'execute' } — caller runs the handler body
 *   - existing COMPLETED  → { kind: 'replay', response } — original outcome
 *   - existing IN-FLIGHT  → { kind: 'conflict', response } — 409 to the racer
 *   - 23505 on insert     → the concurrent race loser re-reads and resolves
 *                           to replay/conflict exactly as above
 *
 * The user_id co-scope means user A cannot read user B's stored outcome —
 * a stolen key returns 409, never another user's response.
 */
export async function beginIdempotencyClaim(params: BeginClaimParams): Promise<IdempotencyOutcome> {
  const conflictResponse = (): Response =>
    Response.json(
      {
        error: 'idempotency_key_in_progress',
        message: 'An identical request with this Idempotency-Key is still in progress; retry shortly.',
      },
      { status: 409, headers: { 'Idempotency-Key': params.key } },
    );

  const resolveExisting = (
    existing: { user_id: string | null; response_status: number | null; response_body: unknown },
  ): IdempotencyOutcome => {
    if (params.userId && existing.user_id && existing.user_id !== params.userId) {
      return { kind: 'conflict', response: conflictResponse() };
    }
    if (existing.response_status !== null) {
      const body = (existing.response_body ?? {}) as Record<string, unknown>;
      return {
        kind: 'replay',
        response: Response.json(body, {
          status: existing.response_status,
          headers: { 'Idempotency-Replayed': 'true', 'Idempotency-Key': params.key },
        }),
      };
    }
    return { kind: 'conflict', response: conflictResponse() };
  };

  try {
    await db.insert(idempotencyKeys).values({
      route: params.route,
      key: params.key,
      user_id: params.userId ?? null,
      request_fingerprint: params.requestFingerprint ?? null,
      response_status: null,
      response_body: null,
    });
    return { kind: 'execute' };
  } catch (e: unknown) {
    // 23505: a concurrent claim won the (route, key) barrier — read and
    // resolve against the winner's row (the house barrier pattern).
    if ((e as { code?: string }).code === '23505') {
      const [existing] = await db
        .select({
          user_id: idempotencyKeys.user_id,
          response_status: idempotencyKeys.response_status,
          response_body: idempotencyKeys.response_body,
        })
        .from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.route, params.route), eq(idempotencyKeys.key, params.key)))
        .limit(1);
      if (existing) return resolveExisting(existing);
      logger.warn('[idempotency] 23505 without a readable winner row', {
        route: params.route,
        key: params.key,
      });
      return { kind: 'conflict', response: conflictResponse() };
    }
    // 22001 (value too long): defensive — header length was pre-validated.
    throw e;
  }
}

/**
 * Phase 2: store the executing handler's outcome on the claim row. Must be
 * called on EVERY terminal path of an executed claim (success and typed
 * failure alike) so a client retry of a failed request replays the failure
 * instead of re-entering a half-executed flow. Crashes leave the marker
 * in-flight: the client's retry gets 409 and must use a fresh key — the
 * safe default, since the original attempt's side effects are unknown.
 */
export async function storeIdempotencyOutcome(
  params: { route: string; key: string },
  response: Response,
): Promise<void> {
  let body: unknown = null;
  try {
    body = await response.clone().json();
  } catch {
    body = null; // non-JSON body — store the status only
  }
  try {
    await db
      .update(idempotencyKeys)
      .set({ response_status: response.status, response_body: body, updated_at: new Date() })
      .where(and(eq(idempotencyKeys.route, params.route), eq(idempotencyKeys.key, params.key)));
  } catch (e: unknown) {
    // Outcome persistence must never mask the handler's real response.
    logger.error('[idempotency] failed to store outcome', { route: params.route, key: params.key, error: e });
  }
}

/**
 * Convenience wrapper: begin the claim; on 'replay'/'conflict' return the
 * response; on 'execute' run `handler`, store the outcome, and return it.
 * Use directly when the route needs no extra claim metadata.
 */
export async function withIdempotency(
  params: BeginClaimParams,
  handler: () => Promise<Response>,
): Promise<Response> {
  const claim = await beginIdempotencyClaim(params);
  if (claim.kind === 'execute') {
    const response = await handler();
    await storeIdempotencyOutcome({ route: params.route, key: params.key }, response);
    return response;
  }
  return claim.response;
}
