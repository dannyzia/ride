import { db } from '@/src/db';
import { preferences } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * GET /api/reference/preferences
 * Auth: [public]
 * Returns active ride preference definitions for display on the booking screen.
 */
export async function GET() {
  try {
    const prefs = await db.select().from(preferences).where(eq(preferences.is_active, true));
    return Response.json({
      preferences: prefs.map(p => ({
        id: p.id,
        name: p.name,
        display_label_en: p.display_label_en,
        display_label_bn: p.display_label_bn,
        icon: p.icon,
        charge_bdt: p.charge_bdt,
        affects_matching: p.affects_matching,
      })),
    });
  } catch (err) {
    logger.error('[reference/preferences] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
