import { db } from '@/src/db';
import { accountingAccounts } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';

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
    const url = new URL(request.url);
    const type = url.searchParams.get('type');

    const conditions = [];
    if (type) conditions.push(eq(accountingAccounts.type, type as any));

    const accounts = await db.select()
      .from(accountingAccounts)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const totalBalance = accounts.reduce((s, a) => s + a.current_balance_bdt, 0);

    return Response.json({ accounts, total_balance_bdt: totalBalance, total_balance_taka: totalBalance / 100 });
  } catch (err: any) {
    if (err.status === 401 || err.status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[accounting/balance] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
