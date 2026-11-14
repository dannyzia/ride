import { db } from '../../../src/db';
import { systemConfig } from '../../../src/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdminPermission } from '../../../lib/adminRbac';
import { logger } from '../../../lib/logger';
import { parseJsonBody } from '@/lib/parseBody';
import { adminErrorResponse } from '@/lib/adminRoute';
import { z } from 'zod';

const sosContactSchema = z.object({
  label: z.string().min(1).max(100),
  number: z.string().min(3).max(20),
});

const sosContactsArraySchema = z.array(sosContactSchema).min(1).max(10);

const patchSchema = z.object({ contacts: sosContactsArraySchema });

export async function GET(req: Request) {
  try {
    await requireAdminPermission('safety.write')(req);

    const [row] = await db.select().from(systemConfig).where(eq(systemConfig.key, 'sos_contacts')).limit(1);
    if (!row) return Response.json({ contacts: [] });

    try {
      const contacts = JSON.parse(row.value);
      return Response.json({ contacts });
    } catch {
      // Corrupt stored JSON is a data fault, not an empty list.
      logger.error('[admin/sos-contacts] stored value is not valid JSON');
      return Response.json({ error: 'invalid_stored_value', message: 'SOS contacts are corrupt' }, { status: 500 });
    }
  } catch (err: unknown) {
    return adminErrorResponse(err, '[admin/sos-contacts] GET error');
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdminPermission('safety.write')(req);

    const result = await parseJsonBody(req, patchSchema);
    if (!result.ok) return result.response;

    await db.update(systemConfig)
      .set({ value: JSON.stringify(result.data.contacts), updated_at: new Date() })
      .where(eq(systemConfig.key, 'sos_contacts'));

    logger.info('[admin/sos-contacts] updated', { count: result.data.contacts.length });

    return Response.json({ contacts: result.data.contacts });
  } catch (err: unknown) {
    return adminErrorResponse(err, '[admin/sos-contacts] PATCH error');
  }
}
