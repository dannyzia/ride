// [public] bKash redirect callback — INERT STUB
// Superseded by PortPos (ADR-018). PortPos handles all payments via /api/payment/portpos/callback.
// Kept for backwards compatibility with any residual GlideX redirect URLs.

import { logger } from '@/lib/logger';

export async function GET(_request: Request) {
  logger.warn('[bkash/callback] Legacy payment callback received — use PortPos instead');
  return Response.json({ error: 'bkash_deprecated', message: 'Use PortPos instead' }, { status: 410 });
}
