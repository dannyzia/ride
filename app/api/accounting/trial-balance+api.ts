import { db } from '@/src/db';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

const API_KEY = process.env.ACCOUNTING_API_KEY;

async function auth(req: Request) {
  const key = req.headers.get('x-accounting-api-key');
  if (key === API_KEY) return;
  const { requireRole } = await import('@/lib/auth');
  await requireRole('admin')(req);
}

export async function GET(request: Request) {
  try {
    await auth(request);

    const rows = await db.execute(sql`
      SELECT a.code, a.name, a.type,
        COALESCE(SUM(l.debit_bdt), 0) as total_dr,
        COALESCE(SUM(l.credit_bdt), 0) as total_cr
      FROM accounting_accounts a
      LEFT JOIN accounting_entry_lines l ON l.account_id = a.id
      GROUP BY a.code, a.name, a.type
      ORDER BY a.code
    `);

    const data = rows as any as { code: string; name: string; type: string; total_dr: number; total_cr: number }[];
    const totalDr = data.reduce((s, r) => s + Number(r.total_dr), 0);
    const totalCr = data.reduce((s, r) => s + Number(r.total_cr), 0);

    return Response.json({
      accounts: data,
      total_dr_bdt: totalDr,
      total_cr_bdt: totalCr,
      total_dr_taka: totalDr / 100,
      total_cr_taka: totalCr / 100,
      is_balanced: Math.abs(totalDr - totalCr) < 1,
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401 || errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[accounting/trial-balance] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
