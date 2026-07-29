import { db } from '@/src/db';
import { accountingEntries, accountingEntryLines } from '@/src/db/schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';

const API_KEY = process.env.ACCOUNTING_API_KEY;

async function auth(req: Request) {
  const key = req.headers.get('x-accounting-api-key');
  if (key === API_KEY) return;
  await requireRole('admin')(req);
}

export async function GET(request: Request) {
  try {
    await auth(request);
    const url = new URL(request.url);
    const start = url.searchParams.get('start');
    const end = url.searchParams.get('end');
    const refType = url.searchParams.get('reference_type');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    const conditions = [];
    if (start) conditions.push(gte(accountingEntries.entry_date, new Date(start)));
    if (end) conditions.push(lte(accountingEntries.entry_date, new Date(end)));
    if (refType) conditions.push(eq(accountingEntries.reference_type, refType as any));

    const rows = await db.select()
      .from(accountingEntries)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(accountingEntries.entry_date))
      .limit(limit).offset(offset);

    const entriesWithLines = await Promise.all(rows.map(async (entry) => {
      const lines = await db.select().from(accountingEntryLines).where(eq(accountingEntryLines.entry_id, entry.id));
      return { ...entry, lines };
    }));

    return Response.json({ entries: entriesWithLines, limit, offset });
  } catch (err: any) {
    if (err.status === 401 || err.status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[accounting/entries] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
