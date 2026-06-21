/**
 * In-memory verified-phone store.
 *
 * Security gate: verify-otp marks a phone as verified; register and
 * reset-password CONSUME the verification (one-time use). Phones expire
 * after 5 minutes to limit the window for replay.
 *
 * Safe under INSTANCE_COUNT=1 (single-process). If the server restarts
 * all pending verifications are lost — users must re-verify, which is
 * the correct security posture.
 *
 * The store is kept on globalThis so it survives Expo API route module
 * re-evaluations during Hot Module Replacement in development.
 */

const TTL_MS = 5 * 60 * 1000;

interface VerifiedEntry {
  phone: string;
  expiresAt: number;
}

// Persist across HMR module re-evaluations by anchoring to globalThis.
const STORE_KEY = "__ride_verifiedPhones__";
if (!(globalThis as any)[STORE_KEY]) {
  (globalThis as any)[STORE_KEY] = new Map<string, VerifiedEntry>();
}
const store: Map<string, VerifiedEntry> = (globalThis as any)[STORE_KEY];

function cleanup(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}

export function markVerified(phone: string): void {
  store.set(phone, { phone, expiresAt: Date.now() + TTL_MS });
}

export function isVerified(phone: string): boolean {
  cleanup();
  const entry = store.get(phone);
  return !!entry && entry.expiresAt > Date.now();
}

export function consumeVerification(phone: string): boolean {
  cleanup();
  const entry = store.get(phone);
  if (!entry || entry.expiresAt <= Date.now()) return false;
  store.delete(phone);
  return true;
}
