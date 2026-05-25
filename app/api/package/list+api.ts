import { db } from '@/src/db';
import { packages } from '@/src/db/schema';
import { eq, asc } from 'drizzle-orm';
import { verifyFirebaseIdToken } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const decoded = await verifyFirebaseIdToken(request);

    const pkgList = await db
      .select({
        id: packages.id,
        name: packages.name,
        call_count: packages.call_count,
        duration_days: packages.duration_days,
        price_bdt: packages.price_bdt,
        daily_cap: packages.daily_cap,
        is_trial: packages.is_trial,
      })
      .from(packages)
      .where(eq(packages.is_active, true))
      .orderBy(asc(packages.price_bdt));

    return Response.json({ packages: pkgList });
  } catch (e: any) {
    if (e.status === 401) {
      return Response.json({ error: 'unauthorized', message: 'Invalid or missing token' }, { status: 401 });
    }
    logger.error('[package/list] error', e);
    return Response.json({ error: 'internal_error', message: 'Failed to fetch packages' }, { status: 500 });
  }
}
