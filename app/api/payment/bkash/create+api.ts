// bKash payment create — INERT STUB
// Superseded by PortPos (ADR-018). PortPos handles all payments via /api/payment/portpos/callback.
// Kept for backwards compatibility with any residual GlideX calls.

import { logger } from '@/lib/logger';

export async function POST(_request: Request) {
  logger.warn('[bkash/create] Legacy payment create received — use PortPos instead');
  return Response.json({ error: 'bkash_deprecated', message: 'Use PortPos instead' }, { status: 410 });
}
