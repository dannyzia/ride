import { db } from '@/src/db';
import { accountingEntryLines, accountingEntries, accountingAccounts } from '@/src/db/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
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
    const start = url.searchParams.get('start');
    const end = url.searchParams.get('end');
    const format = url.searchParams.get('format') || 'json';

    const conditions = [];
    if (start) conditions.push(gte(accountingEntries.entry_date, new Date(start)));
    if (end) conditions.push(lte(accountingEntries.entry_date, new Date(end)));

    const rows = await db.execute(sql`
      SELECT e.entry_number, e.entry_date, e.reference_type, e.description,
        a.code as account_code, a.name as account_name,
        l.debit_bdt, l.credit_bdt
      FROM accounting_entries e
      JOIN accounting_entry_lines l ON l.entry_id = e.id
      JOIN accounting_accounts a ON a.id = l.account_id
      ${conditions.length > 0 ? sql`WHERE ${and(...conditions)}` : sql``}
      ORDER BY e.entry_date, e.entry_number
    `);

    const data = rows as any as any[];

    if (format === 'csv') {
      const header = 'Entry Number,Date,Reference Type,Description,Account Code,Account Name,Debit (BDT),Credit (BDT)\n';
      const csv = header + data.map(r =>
        `${r.entry_number},${r.entry_date},${r.reference_type},${r.description},${r.account_code},${r.account_name},${(Number(r.debit_bdt) / 100).toFixed(2)},${(Number(r.credit_bdt) / 100).toFixed(2)}`
      ).join('\n');
      return new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="journal-export.csv"' } });
    }

    return Response.json({ rows: data });
  } catch (err: any) {
    if (err.status === 401 || err.status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[accounting/export] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
