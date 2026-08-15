// POST /api/driver/verify-driver — DEPRECATED STUB
// Superseded by the new onboarding wizard (Plan 04) + admin-driven activation.
// Client usage removed; no callers remain.

import { logger } from '@/lib/logger';

export async function POST(_request: Request) {
  logger.warn('[driver/verify-driver] Deprecated endpoint hit — use /api/admin/driver/activate instead');
  return Response.json({ error: 'verify_driver_deprecated', message: 'Use the new onboarding wizard and admin activation flow' }, { status: 410 });
}
