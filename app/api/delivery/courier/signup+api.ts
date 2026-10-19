/**
 * POST /api/delivery/courier/signup — RETIRED (C7-2).
 *
 * The auto-active self-signup bypassed the admin verification queue: it
 * created status='active' rows whose verification_status stayed 'pending',
 * and every consumer checked status only. Onboarding is the
 * register-delivery-man wizard (POST /api/user/roles), which creates a
 * PENDING courier the admin queue activates (S2 §2e/§7).
 */
import { logger } from '@/lib/logger';

export async function POST(_request: Request) {
  logger.warn('[delivery/courier/signup] Retired self-signup received — use the register-delivery-man onboarding wizard instead');
  return Response.json(
    { error: 'courier_signup_retired', message: 'Courier self-signup is retired; onboard via the register-delivery-man wizard instead' },
    { status: 410 },
  );
}
