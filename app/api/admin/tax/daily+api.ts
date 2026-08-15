import { requireRole } from '@/lib/auth';
import { getDailyTaxReport } from '@/lib/tax';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    await requireRole('admin')(request);
    const url = new URL(request.url);
    const dateStr = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
    const report = await getDailyTaxReport(new Date(dateStr));
    return Response.json(report);
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/tax/daily] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
