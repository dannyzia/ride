import { db } from '@/src/db';
import { promoCodes } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const createSchema = z.object({
  code:               z.string().min(1).max(30),
  title:              z.string().min(1).max(100).optional(),
  description:        z.string().optional(),
  discount_type:      z.enum(['percent', 'flat']),
  discount_value:     z.number().int().positive(),
  max_uses:           z.number().int().positive().optional().nullable(),
  max_uses_per_rider: z.number().int().positive().default(1),
  max_discount_bdt:   z.number().int().positive().optional().nullable(),
  min_spend_bdt:      z.number().int().positive().optional().nullable(),
  valid_from:         z.string().datetime(),
  expires_at:         z.string().datetime(),
});

const patchSchema = createSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export async function POST(req: Request) {
  const { dbUser } = await requireRole('admin')(req);

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'validation_error', message: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  try {
    const [promo] = await db.insert(promoCodes).values({
      code: data.code,
      title: data.title ?? null,
      description: data.description ?? null,
      discount_type: data.discount_type,
      discount_value: data.discount_value,
      max_uses: data.max_uses ?? null,
      max_uses_per_rider: data.max_uses_per_rider,
      max_discount_bdt: data.max_discount_bdt ?? null,
      min_spend_bdt: data.min_spend_bdt ?? null,
      valid_from: new Date(data.valid_from),
      expires_at: new Date(data.expires_at),
      created_by: dbUser.id,
    }).returning();

    logger.info('[admin/promos] created', { promoId: promo.id, code: promo.code, adminId: dbUser.id });
    return Response.json({ promo_id: promo.id, code: promo.code }, { status: 201 });
  } catch (err: any) {
    if (err.code === '23505') {
      return Response.json({ error: 'promo_code_exists' }, { status: 409 });
    }
    logger.error('[admin/promos] create error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  await requireRole('admin')(req);

  const url = new URL(req.url);
  const promoId = url.searchParams.get('id');
  if (!promoId) return Response.json({ error: 'missing_id' }, { status: 400 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'validation_error', message: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const updates: Record<string, unknown> = { updated_at: new Date() };

  if (data.code !== undefined) updates.code = data.code;
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.discount_type !== undefined) updates.discount_type = data.discount_type;
  if (data.discount_value !== undefined) updates.discount_value = data.discount_value;
  if (data.max_uses !== undefined) updates.max_uses = data.max_uses;
  if (data.max_uses_per_rider !== undefined) updates.max_uses_per_rider = data.max_uses_per_rider;
  if (data.max_discount_bdt !== undefined) updates.max_discount_bdt = data.max_discount_bdt;
  if (data.min_spend_bdt !== undefined) updates.min_spend_bdt = data.min_spend_bdt;
  if (data.valid_from !== undefined) updates.valid_from = new Date(data.valid_from);
  if (data.expires_at !== undefined) updates.expires_at = new Date(data.expires_at);
  if (data.is_active !== undefined) updates.is_active = data.is_active;

  if (Object.keys(updates).length <= 1) {
    return Response.json({ error: 'no_fields_to_update' }, { status: 400 });
  }

  try {
    const [promo] = await db.update(promoCodes)
      .set(updates)
      .where(eq(promoCodes.id, promoId))
      .returning();

    if (!promo) return Response.json({ error: 'promo_not_found' }, { status: 404 });

    logger.info('[admin/promos] updated', { promoId: promo.id });
    return Response.json({ promo });
  } catch (err: any) {
    if (err.code === '23505') {
      return Response.json({ error: 'promo_code_exists' }, { status: 409 });
    }
    logger.error('[admin/promos] update error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  await requireRole('admin')(req);

  const url = new URL(req.url);
  const promoId = url.searchParams.get('id');
  if (!promoId) return Response.json({ error: 'missing_id' }, { status: 400 });

  const [promo] = await db.update(promoCodes)
    .set({ deleted_at: new Date(), is_active: false, updated_at: new Date() })
    .where(eq(promoCodes.id, promoId))
    .returning();

  if (!promo) return Response.json({ error: 'promo_not_found' }, { status: 404 });

  logger.info('[admin/promos] deleted', { promoId: promo.id });
  return Response.json({ deleted: true });
}
