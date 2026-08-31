/**
 * POST /api/delivery/courier/signup — auto-active self-signup (§A.3, ruling 5).
 * Any authenticated user can sign up as parcel or food courier.
 * Dual capabilities allowed: one parcel + one food row per account (ruling 11).
 */
import { verifySupabaseToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { db } from '@/src/db';
import { couriers } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody } from '@/lib/parseBody';
import { isVerticalEnabled } from '@/lib/platformConfig';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const signupSchema = z.object({
  courier_type: z.enum(['parcel', 'food']),
});

export async function POST(request: Request) {
  try {
    // Feature flag gate
    if (!(await isVerticalEnabled('marketplace_delivery_enabled'))) {
      return Response.json({ error: 'feature_disabled', message: 'Delivery marketplace is not enabled' }, { status: 404 });
    }

    // Auth
    const supabaseUser = await verifySupabaseToken(request);
    const { data: dbUser } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('auth_uid', supabaseUser.id)
      .maybeSingle();
    if (!dbUser) {
      return Response.json({ error: 'user_not_found' }, { status: 403 });
    }

    // Parse body
    const parsed = await parseJsonBody(request, signupSchema);
    if (!parsed.ok) return parsed.response;
    const { courier_type } = parsed.data;

    // Check if already signed up for this type
    const existing = await db
      .select()
      .from(couriers)
      .where(and(eq(couriers.user_id, dbUser.id), eq(couriers.courier_type, courier_type)))
      .limit(1);

    if (existing.length > 0) {
      // Already signed up — return existing (idempotent)
      return Response.json({
        courier: existing[0],
        message: 'Already registered as ' + courier_type + ' courier',
      });
    }

    // For parcel couriers: must also be an active driver with a vehicle
    if (courier_type === 'parcel') {
      const { data: driver } = await supabaseAdmin
        .from('drivers')
        .select('id, vehicle_type, status')
        .eq('user_id', dbUser.id)
        .eq('status', 'active')
        .maybeSingle();
      if (!driver) {
        return Response.json(
          { error: 'driver_required_for_parcel', message: 'Parcel couriers must have an active driver account with a vehicle' },
          { status: 403 },
        );
      }
    }

    // Create courier row — auto-active (ruling 5)
    const [courier] = await db
      .insert(couriers)
      .values({
        user_id: dbUser.id,
        courier_type,
        status: 'active',
      })
      .returning();

    logger.info('Courier signup', { userId: dbUser.id, courierType: courier_type });

    return Response.json({ courier }, { status: 201 });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) {
      return Response.json({ error: err.message || 'error' }, { status: err.status });
    }
    logger.error('Courier signup failed', error);
    return Response.json({ error: 'server_error', message: 'Signup failed' }, { status: 500 });
  }
}
