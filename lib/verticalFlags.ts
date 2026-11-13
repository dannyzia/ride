/**
 * Client-side ride-vertical flag resolver (DESIGN-NODE-LAUNCH.md Component A).
 *
 * One module, one client read path: the flag is fetched once per cold boot
 * (GET /api/app-config) and cached for the session — there is no
 * last-known-value cache, so a failed boot read keeps the session
 * ride-hidden until the next successful cold start (accepted consequence,
 * recorded in the design). The authenticated boot path instead consumes the
 * additive `flags` field on POST /api/auth/verify-token
 * (applyVerifyTokenFlags); both sources read the same platform_config row.
 *
 * Fail-closed invariant (single unchanging client behavior): fetch failure,
 * timeout, or unconfigured environment ⇒ ride_vertical_enabled = false
 * (ride hidden). Staging stays ride-visible because stage 1 seeds
 * platform_config.ride_vertical_enabled = true — the fail-closed constant
 * only bites on genuine fetch failure.
 */
import { API_URL } from '@/lib/config';
import { logger } from '@/lib/logger';

/** Fail-closed default — ride hidden until proven visible. */
export const DEFAULT_RIDE_VERTICAL_ENABLED = false;

/**
 * Bounded consume window for the splash routing path: the no-session branch
 * awaits the boot fetch up to this long before routing (fail-closed if still
 * unresolved), so the flag is always resolved before the login screen first
 * paints. G3 coherence rule: this bound MUST exceed the boot fetch's total
 * window (FETCH_TIMEOUT_MS + RETRY_TIMEOUT_MS = 7500) or the splash would
 * fail-closed on every healthy-but-slow device — the exact defect the
 * device walk found (consume 3000 < device path ~4000 ⇒ hidden despite the
 * flag being true).
 */
export const RIDE_FLAG_RESOLVE_TIMEOUT_MS = 8000;

/**
 * First-attempt abort window for the boot fetch (G3 fix, ISSUE-111): the
 * device path (adb-reverse → Metro → DB) measured >2.5s while the same
 * endpoint answered 0.7s from the host and auth calls on the same base URL
 * succeeded on-device — the 2500ms budget, not the fail-closed logic, was
 * wrong. Ordered range 5000-8000ms; 5000 covers the measured device path
 * with margin.
 */
export const FETCH_TIMEOUT_MS = 5000;

/**
 * One bounded retry after a failed first attempt (transient blips answer
 * fast; a healthy slow path completes attempt 1). Exactly ONE retry —
 * never more — so the total fetch window stays bounded at 7500ms.
 */
export const RETRY_TIMEOUT_MS = 2500;

interface VerticalFlagFetchOptions {
  /** Test seam — overrides API_URL (empty string exercises the unconfigured-env path). */
  baseUrl?: string;
  /** Test seam — overrides the fetch abort window. */
  timeoutMs?: number;
}

interface AppConfigResponse {
  flags?: { ride_vertical_enabled?: unknown };
}

let pending: Promise<boolean> | null = null;
let cached: boolean | null = null;

function strictFlag(payload: unknown): boolean {
  // Strict shape: only a literal true resolves visible; anything else
  // (missing field, wrong type, malformed envelope) fail-closes.
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as AppConfigResponse).flags?.ride_vertical_enabled === true
  );
}

type AttemptResult = { ok: true; value: boolean } | { ok: false };

/**
 * One bounded GET /api/app-config attempt. Distinguishes a SUCCESSFUL read
 * (value may legitimately be false — no retry warranted) from a FAILED
 * attempt (network error / timeout / non-OK / unparseable — retryable).
 * Never throws; fail-closed lives in the caller.
 */
async function attemptFetch(baseUrl: string, timeoutMs: number): Promise<AttemptResult> {
  const controller = new AbortController();
  let raceTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await Promise.race([
        fetch(`${baseUrl}/api/app-config`, { signal: controller.signal }),
        new Promise<never>((_, reject) => {
          raceTimer = setTimeout(() => reject(new Error('app-config timeout')), timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(abortTimer);
      if (raceTimer !== undefined) clearTimeout(raceTimer);
    }
    if (!res.ok) {
      throw new Error(`app-config responded ${res.status}`);
    }
    const data: unknown = await res.json();
    return { ok: true, value: strictFlag(data) };
  } catch (err) {
    logger.warn('[verticalFlags] app-config attempt failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false };
  }
}

/**
 * Start (or join) the once-per-boot GET /api/app-config read. Resolves the
 * session cache; later calls in the same session rejoin the first read —
 * the flag is fetched exactly once per cold boot. A FAILED first attempt is
 * retried exactly once (RETRY_TIMEOUT_MS); a successful read is never
 * retried (an explicit false is a value, not a failure). Both attempts
 * failing ⇒ fail-closed default (ISSUE-111: fail-closed semantics unchanged).
 */
export function fetchRideVerticalFlag(options: VerticalFlagFetchOptions = {}): Promise<boolean> {
  if (pending) return pending;
  pending = (async () => {
    const baseUrl = options.baseUrl ?? API_URL;
    if (!baseUrl) {
      // Unconfigured environment — fail-closed without touching the network.
      cached = DEFAULT_RIDE_VERTICAL_ENABLED;
      return cached;
    }
    // Test seam: when timeoutMs is injected it drives BOTH windows (keeps
    // the suite fast); production uses FETCH then RETRY.
    const firstWindow = options.timeoutMs ?? FETCH_TIMEOUT_MS;
    const retryWindow = options.timeoutMs ?? RETRY_TIMEOUT_MS;
    let attempt = await attemptFetch(baseUrl, firstWindow);
    if (!attempt.ok) {
      logger.warn('[verticalFlags] retrying app-config read once');
      attempt = await attemptFetch(baseUrl, retryWindow);
    }
    cached = attempt.ok ? attempt.value : DEFAULT_RIDE_VERTICAL_ENABLED;
    return cached;
  })();
  return pending;
}

/**
 * Consume the additive `flags` field from the POST /api/auth/verify-token
 * response (authenticated boot path). Fills the session cache only while it
 * is still unresolved — the unconditional mount fetch remains the
 * authoritative boot read; both sources read the same row.
 */
export function applyVerifyTokenFlags(flags: unknown): void {
  if (cached !== null) return;
  const value = (
    typeof flags === 'object' && flags !== null ? (flags as AppConfigResponse['flags']) : undefined
  )?.ride_vertical_enabled;
  if (value === true || value === false) cached = value;
}

/**
 * Current session value — fail-closed while unresolved.
 */
export function getRideVerticalEnabled(): boolean {
  return cached ?? DEFAULT_RIDE_VERTICAL_ENABLED;
}

/**
 * Await the boot fetch up to `timeoutMs` (bounded); fail-closed if still
 * unresolved when the window closes. Never starts a network call — it only
 * consumes what the splash's mount fetch already started.
 */
export async function waitForRideVerticalFlag(timeoutMs: number): Promise<boolean> {
  if (cached !== null) return cached;
  if (pending) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      pending.then(() => 'resolved' as const),
      new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), timeoutMs);
      }),
    ]);
    if (timer !== undefined) clearTimeout(timer);
    if (outcome === 'timeout') {
      logger.warn('[verticalFlags] flag unresolved after bounded wait — fail-closed');
    }
  }
  return getRideVerticalEnabled();
}

/** Test-only: reset the per-session cache between scenarios. */
export function resetVerticalFlagCacheForTests(): void {
  pending = null;
  cached = null;
}
