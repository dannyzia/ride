import { db } from '@/src/db';
import { driverPayoutMethods, drivers, users } from '@/src/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import * as errors from '@/lib/errors';

// R2.2: Support bKash, Nagad, and bank accounts
export const METHOD_TYPES = ['bkash', 'nagad', 'bank'] as const;

export const createSchema = z.object({
  method_type: z.enum(METHOD_TYPES),
  account_number: z.string().min(8).max(20),
  account_name: z.string().min(1).max(100).optional(),
  bank_name: z.string().max(100).optional(),
  branch_name: z.string().max(100).optional(),
});

export const updateSchema = z.object({
  account_number: z.string().min(8).max(20).optional(),
  account_name: z.string().min(1).max(100).optional(),
  bank_name: z.string().max(100).optional(),
  branch_name: z.string().max(100).optional(),
});

/** Mask account number: 017****5678 */
export function maskAccount(num: string): string {
  if (num.length <= 4) return num;
  const visible = num.slice(-4);
  const masked = '*'.repeat(Math.max(0, num.length - 4));
  return masked + visible;
}

/** Resolve driver ID from auth token. */
async function resolveDriver(request: Request) {
  const supabaseUser = await verifySupabaseToken(request);
  const [user] = await db.select({ id: users.id, name: users.name })
    .from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
  if (!user) return null;
  const [driver] = await db.select({ id: drivers.id })
    .from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
  if (!driver) return null;
  return { user, driver };
}

export async function GET(request: Request) {
  try {
    const ctx = await resolveDriver(request);
    if (!ctx) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    // R2.2: Return ALL active methods, masked
    const methods = await db.select()
      .from(driverPayoutMethods)
      .where(and(
        eq(driverPayoutMethods.driver_id, ctx.driver.id),
        eq(driverPayoutMethods.is_active, true),
      ))
      .orderBy(desc(driverPayoutMethods.is_default), desc(driverPayoutMethods.created_at));

    const masked = methods.map((m) => ({
      ...m,
      account_number_masked: maskAccount(m.account_number),
    }));

    return Response.json({ payout_methods: masked });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/payout-method] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await resolveDriver(request);
    if (!ctx) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, createSchema);
    if (!parsed.ok) return parsed.response;

    const { method_type, account_number, account_name, bank_name, branch_name } = parsed.data;

    // Validate phone format for bKash/Nagad
    if ((method_type === 'bkash' || method_type === 'nagad') && !/^01\d{9}$/.test(account_number)) {
      return Response.json({ error: 'invalid_account', message: 'Invalid phone number format' }, { status: 400 });
    }

    // Check for duplicate account number
    const [existing] = await db.select({ id: driverPayoutMethods.id })
      .from(driverPayoutMethods)
      .where(and(
        eq(driverPayoutMethods.driver_id, ctx.driver.id),
        eq(driverPayoutMethods.account_number, account_number),
        eq(driverPayoutMethods.is_active, true),
      ))
      .limit(1);
    if (existing) {
      return Response.json({ error: 'duplicate_account', message: 'This account is already added' }, { status: 409 });
    }

    // Make first method the default
    const [existingCount] = await db.select({ count: sql<number>`count(*)` })
      .from(driverPayoutMethods)
      .where(and(
        eq(driverPayoutMethods.driver_id, ctx.driver.id),
        eq(driverPayoutMethods.is_active, true),
      ));
    const isFirst = Number(existingCount?.count ?? 0) === 0;

    const [row] = await db.insert(driverPayoutMethods).values({
      driver_id: ctx.driver.id,
      method_type,
      account_number,
      account_name: account_name ?? ctx.user.name,
      bank_name: bank_name ?? null,
      branch_name: branch_name ?? null,
      is_default: isFirst,
      is_active: true,
    }).returning();

    logger.info('[driver/payout-method] created', { driverId: ctx.driver.id, method_type });

    return Response.json({ payout_method: { ...row, account_number_masked: maskAccount(row.account_number) } }, { status: 201 });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/payout-method] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await resolveDriver(request);
    if (!ctx) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, updateSchema);
    if (!parsed.ok) return parsed.response;

    const url = new URL(request.url);
    const methodId = url.searchParams.get('id');
    if (!methodId) return Response.json({ error: 'missing_id', message: 'Method ID is required' }, { status: 400 });

    // Verify ownership
    const [existing] = await db.select()
      .from(driverPayoutMethods)
      .where(and(
        eq(driverPayoutMethods.id, methodId),
        eq(driverPayoutMethods.driver_id, ctx.driver.id),
        eq(driverPayoutMethods.is_active, true),
      ))
      .limit(1);
    if (!existing) return Response.json({ error: 'not_found', message: 'Payout method not found' }, { status: 404 });

    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (parsed.data.account_number !== undefined) updates.account_number = parsed.data.account_number;
    if (parsed.data.account_name !== undefined) updates.account_name = parsed.data.account_name;
    if (parsed.data.bank_name !== undefined) updates.bank_name = parsed.data.bank_name;
    if (parsed.data.branch_name !== undefined) updates.branch_name = parsed.data.branch_name;

    const [updated] = await db.update(driverPayoutMethods)
      .set(updates)
      .where(eq(driverPayoutMethods.id, methodId))
      .returning();

    return Response.json({ payout_method: { ...updated, account_number_masked: maskAccount(updated.account_number) } });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/payout-method] PATCH error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await resolveDriver(request);
    if (!ctx) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const url = new URL(request.url);
    const methodId = url.searchParams.get('id');
    if (!methodId) return Response.json({ error: 'missing_id', message: 'Method ID is required' }, { status: 400 });

    const [existing] = await db.select()
      .from(driverPayoutMethods)
      .where(and(
        eq(driverPayoutMethods.id, methodId),
        eq(driverPayoutMethods.driver_id, ctx.driver.id),
        eq(driverPayoutMethods.is_active, true),
      ))
      .limit(1);
    if (!existing) return Response.json({ error: 'not_found', message: 'Payout method not found' }, { status: 404 });

    await db.transaction(async (tx) => {
      // Soft-delete the method
      await tx.update(driverPayoutMethods)
        .set({ is_active: false, updated_at: new Date() })
        .where(eq(driverPayoutMethods.id, methodId));

      // If deleted was default, promote the newest remaining method
      if (existing.is_default) {
        const [next] = await tx.select({ id: driverPayoutMethods.id })
          .from(driverPayoutMethods)
          .where(and(
            eq(driverPayoutMethods.driver_id, ctx.driver.id),
            eq(driverPayoutMethods.is_active, true),
          ))
          .orderBy(desc(driverPayoutMethods.created_at))
          .limit(1);
        if (next) {
          await tx.update(driverPayoutMethods)
            .set({ is_default: true, updated_at: new Date() })
            .where(eq(driverPayoutMethods.id, next.id));
        }
      }
    });

    logger.info('[driver/payout-method] deleted', { driverId: ctx.driver.id, methodId });
    return Response.json({ ok: true });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/payout-method] DELETE error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
