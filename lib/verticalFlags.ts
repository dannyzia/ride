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
 * paints. The boot fetch carries its own shorter abort window
 * (FETCH_TIMEOUT_MS), so on a dead network this bound is never the wait —
 * the fetch fail-closes first.
 */
export const RIDE_FLAG_RESOLVE_TIMEOUT_MS = 3000;

/** The boot fetch's own abort window (mirrors the heldRoles splash timeout). */
const FETCH_TIMEOUT_MS = 2500;

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

/**
 * Start (or join) the once-per-boot GET /api/app-config read. Resolves the
 * session cache; later calls in the same session rejoin the first read —
 * the flag is fetched exactly once per cold boot.
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
    const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
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
      cached = strictFlag(data);
      return cached;
    } catch (err) {
      logger.warn('[verticalFlags] app-config fetch failed — fail-closed', {
        message: err instanceof Error ? err.message : String(err),
      });
      cached = DEFAULT_RIDE_VERTICAL_ENABLED;
      return cached;
    }
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
