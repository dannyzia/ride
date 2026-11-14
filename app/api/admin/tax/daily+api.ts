import { adminErrorResponse } from '@/lib/adminRoute';
import { requireAdminPermission } from '@/lib/adminRbac';
import { getDailyTaxReport } from '@/lib/tax';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

export async function GET(request: Request) {
  try {
    await requireAdminPermission('admin.read')(request);
    const url = new URL(request.url);
    const dateStr = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
    const report = await getDailyTaxReport(new Date(dateStr));
    return Response.json(report);
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    return adminErrorResponse(err, '[admin/tax/daily] GET error');
  }
}
