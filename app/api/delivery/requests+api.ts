/**
 * POST /api/delivery/requests — create a delivery request (customer-facing).
 * GET  /api/delivery/requests — list own delivery requests.
 */
import { verifySupabaseToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { db } from '@/src/db';
import { deliveryRequests } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { parseJsonBody } from '@/lib/parseBody';
import { isVerticalEnabled } from '@/lib/platformConfig';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const createSchema = z.object({
  pickup_address: z.string().min(1),
  pickup_lat: z.number(),
  pickup_lng: z.number(),
  dropoff_address: z.string().min(1),
  dropoff_lat: z.number(),
  dropoff_lng: z.number(),
  package_description: z.string().optional(),
  package_weight_kg: z.number().int().positive().optional(),
  required_vehicle_type: z.enum(['bike', 'cng', 'car', 'van', 'truck']).optional(),
  declared_fee_bdt: z.number().int().positive().optional(),
  bidding_window_seconds: z.number().int().min(60).max(3600).default(600),
});

export async function POST(request: Request) {
  try {
    if (!(await isVerticalEnabled('marketplace_delivery_enabled'))) {
      return Response.json({ error: 'feature_disabled', message: 'Delivery marketplace is not enabled' }, { status: 404 });
    }

    const supabaseUser = await verifySupabaseToken(request);
    const { data: dbUser } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('auth_uid', supabaseUser.id)
      .maybeSingle();
    if (!dbUser) {
      return Response.json({ error: 'user_not_found' }, { status: 403 });
    }

    const parsed = await parseJsonBody(request, createSchema);
    if (!parsed.ok) return parsed.response;
    const data = parsed.data;

    const now = new Date();
    const deadlineAt = new Date(now.getTime() + (data.bidding_window_seconds ?? 600) * 1000);

    const [delivery] = await db
      .insert(deliveryRequests)
      .values({
        created_by_user_id: dbUser.id,
        pickup_address: data.pickup_address,
        pickup_lat: String(data.pickup_lat),
        pickup_lng: String(data.pickup_lng),
        dropoff_address: data.dropoff_address,
        dropoff_lat: String(data.dropoff_lat),
        dropoff_lng: String(data.dropoff_lng),
        package_description: data.package_description,
        package_weight_kg: data.package_weight_kg,
        required_vehicle_type: data.required_vehicle_type ?? null,
        declared_fee_bdt: data.declared_fee_bdt ?? null,
        deadline_at: deadlineAt,
      })
      .returning();

    logger.info('Delivery request created', { id: delivery.id, userId: dbUser.id });

    return Response.json({ delivery }, { status: 201 });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) {
      return Response.json({ error: err.message || 'error' }, { status: err.status });
    }
    logger.error('Delivery request creation failed', error);
    return Response.json({ error: 'server_error', message: 'Failed to create delivery request' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const { data: dbUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_uid', supabaseUser.id)
      .maybeSingle();
    if (!dbUser) {
      return Response.json({ error: 'user_not_found' }, { status: 403 });
    }

    const requests = await db
      .select()
      .from(deliveryRequests)
      .where(eq(deliveryRequests.created_by_user_id, dbUser.id))
      .orderBy(desc(deliveryRequests.created_at))
      .limit(50);

    return Response.json({ deliveries: requests });
  } catch (error: unknown) {
    logger.error('Failed to list delivery requests', error);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
