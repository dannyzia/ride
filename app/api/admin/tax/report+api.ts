import { db } from '@/src/db';
import { taxLedgers } from '@/src/db/schema';
import { inArray } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/adminRbac';
import { parseJsonBody } from '@/lib/parseBody';
import { getTaxReportRange } from '@/lib/tax';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import * as errors from '@/lib/errors';

const markSchema = z.object({
  transaction_ids: z.array(z.string().uuid()),
});

export async function GET(request: Request) {
  try {
    await requireAdminPermission('finance.write')(request);
    const url = new URL(request.url);
    const start = url.searchParams.get('start');
    const end = url.searchParams.get('end');
    const format = url.searchParams.get('format');

    if (!start || !end) return Response.json({ error: 'start and end params required', message: 'Start and end parameters required' }, { status: 400 });

    const report = await getTaxReportRange(new Date(start), new Date(end));

    if (format === 'csv') {
      const csvHeader = 'Date,Tax Code,Transaction Count,Base Amount (BDT),Tax Amount (BDT)\n';
      const csvRows = report.rows.map(r =>
        `${r.summary_date},${r.tax_code},${r.transaction_count},${(r.total_base_amount_bdt / 100).toFixed(2)},${(r.total_tax_amount_bdt / 100).toFixed(2)}`
      ).join('\n');
      const csv = csvHeader + csvRows;
      return new Response(csv, {
        status: 200,
        headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="tax-report-${start}-${end}.csv"` },
      });
    }

    return Response.json(report);
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/tax/report] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminPermission('finance.write')(request);
    const parsed = await parseJsonBody(request, markSchema);
    if (!parsed.ok) return parsed.response;
    await db.update(taxLedgers)
      .set({ is_reported: true, reported_at: new Date() })
      .where(inArray(taxLedgers.id, parsed.data.transaction_ids));
    return Response.json({ success: true });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/tax/report] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
