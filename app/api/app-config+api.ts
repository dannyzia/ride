// [public]
import { isRideVerticalEnabled } from '@/lib/platformConfig';
import { logger } from '@/lib/logger';

/**
 * GET /api/app-config — public boot flags (DESIGN-NODE-LAUNCH.md Component A).
 *
 * The unauthenticated read path for the ride-hide flag: the login screen is
 * the first screen, so no session exists yet. Returns exactly one boolean in
 * a flags envelope — no parameters, no user data. platform_config is never
 * cached (AGENTS.md): a fresh read per request via the fail-closed
 * isVerticalEnabled helper (missing key and DB error both read as ride
 * hidden). The flip itself is owner-only via PATCH /api/admin/config.
 */
export async function GET() {
  try {
    const ride_vertical_enabled = await isRideVerticalEnabled();
    return Response.json({ flags: { ride_vertical_enabled } });
  } catch (err) {
    // isRideVerticalEnabled already fail-closes internally; this guard keeps
    // the response contract (ride hidden) even if the wrapper itself throws.
    logger.error('[app-config] error', err);
    return Response.json({ flags: { ride_vertical_enabled: false } });
  }
}
