/**
 * lib/dpmaps/destSession.ts — Ephemeral destination session handoff.
 *
 * Stores vendor coordinates ephemerally (15 min TTL) for single-use atomic resolution.
 * Coordinates never enter core tables or dpMaps evidence ledgers.
 */

import { randomUUID } from 'crypto';

export const DEST_SESSION_PREFIX = 'dest_session:';
export const DEST_SESSION_TTL_SECONDS = 900; // 15 minutes

export interface LatLng {
  lat: number;
  lng: number;
}

// In-memory single-process cache for ephemeral session handoffs
const sessionStore = new Map<string, { coords: LatLng; expiresAt: number }>();

function cleanupExpired() {
  const now = Date.now();
  for (const [key, item] of sessionStore.entries()) {
    if (item.expiresAt <= now) {
      sessionStore.delete(key);
    }
  }
}

export function recordDestinationSession(coords: LatLng, ttlSeconds = DEST_SESSION_TTL_SECONDS): string {
  if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
    throw new Error('recordDestinationSession: non-finite coordinates refused');
  }
  cleanupExpired();
  const token = randomUUID();
  sessionStore.set(`${DEST_SESSION_PREFIX}${token}`, {
    coords,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  return token;
}

export function resolveDestinationSession(token: string): LatLng | null {
  cleanupExpired();
  const key = token.startsWith(DEST_SESSION_PREFIX) ? token : `${DEST_SESSION_PREFIX}${token}`;
  const item = sessionStore.get(key);
  if (!item) return null;
  // Atomic GETDEL semantics: remove on read
  sessionStore.delete(key);
  if (item.expiresAt <= Date.now()) return null;
  return item.coords;
}

