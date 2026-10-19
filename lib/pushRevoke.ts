/**
 * pushRevoke.ts — D2-1 revoke-on-logout (STAGE D2-FIX).
 *
 * Best-effort client helper: on sign-out (and every teardown funneled
 * through authCleanup), hit the server logout route with the dying session's
 * token so the server drops this account's device push-token rows BEFORE
 * the token dies. A shared device that user B then signs into can never
 * receive user A's pushes (no rows → fetchTokensByUser finds no tokens).
 *
 * Never throws; never blocks the sign-out flow. A null/missing token is a
 * silent no-op (the server cannot attribute the revoke without it).
 */
import { API_URL } from '@/lib/config';
import { logger } from '@/lib/logger';

export async function revokePushTokenOnSignOut(accessToken: string | null | undefined): Promise<void> {
  if (!accessToken) return;
  try {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    logger.warn('[pushRevoke] logout revoke failed (non-blocking)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
