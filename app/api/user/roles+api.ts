/**
 * GET  /api/user/roles — the roles this account HOLDS, each with its
 *                        verification state + reject reason (R6).
 * POST /api/user/roles — add a role to an EXISTING account (R9: role
 *                        expansion, never a second account).
 *
 * The GET payload is what the post-OTP "Login as [Role]" chooser renders
 * (OWNER-DECISION #9): a single-role account still gets the list, and the
 * screen only shows the chooser when it holds MORE than one role — the server
 * never hides a role the account actually has.
 *
 * Auth: verifySupabaseToken + a users row (any role — this is account-scoped,
 * not admin-scoped).
 */
import { db } from '@/src/db';
import { shopMembers, shopTypes } from '@/src/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { verifySupabaseToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';
import { ADDABLE_ROLES, LAUNCH_ROLES, addRoleRecord, heldRoles } from '@/lib/launchRoles';

const addSchema = z
  .object({
    role: z.enum(ADDABLE_ROLES),
    shop: z
      .object({
        shop_name: z.string().min(2).max(150),
        shop_type_id: z.string().uuid(),
        address_line: z.string().min(3).max(500),
        license_url: z.string().url().max(500),
        food_safety_cert_url: z.string().url().max(500).optional(),
      })
      .optional(),
    fleet: z
      .object({
        fleet_name: z.string().min(2).max(150),
        business_name: z.string().min(2).max(150).optional(),
        trade_license_number: z.string().min(1).max(100).optional(),
        trade_license_url: z.string().url().max(500),
        tax_doc_url: z.string().url().max(500).optional(),
      })
      .optional(),
    delivery: z
      .object({
        nid_url: z.string().url().max(500),
        license_url: z.string().url().max(500),
        vehicle_note: z.string().max(300).optional(),
      })
      .optional(),
  })
  .strict();

/** Resolve the caller's users row from the Supabase token. */
async function callerUserId(request: Request): Promise<string> {
  const supabaseUser = await verifySupabaseToken(request);
  const { data: dbUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('auth_uid', supabaseUser.id)
    .maybeSingle();
  if (!dbUser) {
    throw Object.assign(new Error('user_not_found'), { status: 404 });
  }
  return dbUser.id;
}

export async function GET(request: Request) {
  try {
    const userId = await callerUserId(request);
    const roles = await heldRoles(userId);
    // Staff lane (Flow 15): invited staff hold no user_roles row — surface
    // a synthetic chooser entry when an active shop_members row exists.
    // Shaped like a HeldRole at the JSON level; never written to user_roles.
    const [staffRow] = await db
      .select({ id: shopMembers.id })
      .from(shopMembers)
      .where(and(eq(shopMembers.user_id, userId), isNull(shopMembers.removed_at)))
      .limit(1);
    const entries: unknown[] = [...roles];
    if (staffRow) {
      entries.push({
        role: 'shop_staff',
        status: 'active',
        reason: null,
        is_primary: false,
        submitted_at: null,
        resubmit_count: 0,
        reject: null,
      });
    }
    return Response.json({ roles: entries, launch_roles: LAUNCH_ROLES });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403)
      return Response.json({ error: 'forbidden', message: 'Not authorized' }, { status: 403 });
    if (status === 404)
      return Response.json({ error: 'user_not_found', message: 'No account for this login' }, { status: 404 });
    logger.error('[user/roles] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await callerUserId(request);

    const result = await parseJsonBody(request, addSchema);
    if (!result.ok) return result.response;
    const { role, shop, fleet, delivery } = result.data;

    // NOTE (§2): Driver is NOT in ADDABLE_ROLES — its gate is the existing
    // driver onboarding wizard (documents → admin verify), so the Zod enum
    // rejects it here and the client routes the user to that flow instead.
    if (role === 'shop_owner' && !shop)
      return Response.json({ error: 'shop_fields_required', message: 'Shop details are required' }, { status: 400 });
    if (role === 'fleet_owner' && !fleet)
      return Response.json({ error: 'fleet_fields_required', message: 'Fleet details are required' }, { status: 400 });
    if (role === 'delivery_man' && !delivery)
      return Response.json(
        { error: 'delivery_fields_required', message: 'Identity documents are required' },
        { status: 400 },
      );

    if (shop) {
      const [shopType] = await db
        .select({ id: shopTypes.id })
        .from(shopTypes)
        .where(and(eq(shopTypes.id, shop.shop_type_id), eq(shopTypes.active, true)))
        .limit(1);
      if (!shopType)
        return Response.json(
          { error: 'invalid_shop_type', message: 'Unknown or inactive shop category' },
          { status: 400 },
        );
    }

    const created = await db.transaction(async (tx) =>
      addRoleRecord(tx, { userId, role, payload: { shop, fleet, delivery } }),
    );

    logger.info('[user/roles] role added', { user_id: userId, role, status: created.status });
    return Response.json({ role, status: created.status, roles: await heldRoles(userId) }, { status: 201 });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403)
      return Response.json({ error: 'forbidden', message: 'Not authorized' }, { status: 403 });
    if (status === 404)
      return Response.json({ error: 'user_not_found', message: 'No account for this login' }, { status: 404 });
    if (status === 409)
      return Response.json({ error: 'role_already_held', message: 'This account already holds that role' }, { status: 409 });
    logger.error('[user/roles] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
