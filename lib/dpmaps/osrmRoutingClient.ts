/**
 * lib/dpmaps/osrmRoutingClient.ts — dpMaps OSRM client with circuit breaker.
 *
 * Contracts:
 * - 300 ms SLA timeout (configurable).
 * - 3-strike circuit breaker (CLOSED → OPEN after 3 consecutive 5xx/timeouts → HALF_OPEN after probe window).
 * - Clean-room invariant: never sends or accepts vendor coordinates or IDs.
 */

import { logger } from '@/lib/logger';

export type VehicleType = 'car' | 'bike' | 'cng';
export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export const REQUEST_TIMEOUT_MS = 300;
export const BREAKER_STRIKES = 3;
export const BREAKER_RESET_MS = 30_000;

export interface OsrmRouteResult {
  distance_meters: number;
  duration_seconds: number;
  polyline: string | null;
  provider: 'osrm';
  latency_ms: number;
}

export type RouteFetcher = (url: string, timeoutMs: number) => Promise<{ status: number; body: any }>;

const defaultFetcher: RouteFetcher = async (url, timeoutMs) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  } finally {
    clearTimeout(t);
  }
};

export class OsrmCircuitOpenError extends Error {
  constructor(public vehicle: VehicleType) {
    super(`OSRM circuit OPEN for ${vehicle}: fast-fail, fallback to secondary`);
    this.name = 'OsrmCircuitOpenError';
  }
}

export class OsrmRoutingClient {
  private failures = 0;
  private state: BreakerState = 'CLOSED';
  private openedAt = 0;

  constructor(
    private readonly vehicle: VehicleType,
    private readonly baseUrl: string,
    private readonly timeoutMs: number = REQUEST_TIMEOUT_MS,
    private readonly fetcher: RouteFetcher = defaultFetcher,
    private readonly now: () => number = Date.now,
  ) {}

  get breakerState(): BreakerState {
    if (this.state === 'OPEN' && this.now() - this.openedAt >= BREAKER_RESET_MS) {
      this.state = 'HALF_OPEN';
    }
    return this.state;
  }

  get consecutiveFailures(): number {
    return this.failures;
  }

  private recordSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private recordFailure(): void {
    this.failures += 1;
    if (this.failures >= BREAKER_STRIKES) {
      this.state = 'OPEN';
      this.openedAt = this.now();
      logger.warn('[dpmaps/osrm] Circuit breaker OPENED', {
        vehicle: this.vehicle,
        failures: this.failures,
      });
    }
  }

  async route(
    origin: { lat: number; lng: number },
    dest: { lat: number; lng: number },
  ): Promise<OsrmRouteResult | null> {
    if (this.breakerState === 'OPEN') {
      throw new OsrmCircuitOpenError(this.vehicle);
    }

    // OSRM expects coordinates in lng,lat order
    const url = `${this.baseUrl.replace(/\/+$/, '')}/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=full&geometries=polyline`;
    const start = this.now();

    try {
      const res = await this.fetcher(url, this.timeoutMs);
      const latencyMs = this.now() - start;

      if (res.status >= 500) {
        this.recordFailure();
        return null;
      }
      if (res.status !== 200 || res.body?.code !== 'Ok' || !res.body?.routes?.length) {
        return null;
      }

      this.recordSuccess();
      const primaryRoute = res.body.routes[0];
      return {
        distance_meters: Math.round(primaryRoute.distance ?? 0),
        duration_seconds: Math.round(primaryRoute.duration ?? 0),
        polyline: typeof primaryRoute.geometry === 'string' ? primaryRoute.geometry : null,
        provider: 'osrm',
        latency_ms: latencyMs,
      };
    } catch (err: unknown) {
      this.recordFailure();
      return null;
    }
  }
}

