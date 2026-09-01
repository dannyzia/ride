/**
 * POST /api/delivery/requests/[id]/accept-bid — customer accepts a courier's bid (§B.0 tx).
 * Creates a delivery_leg in the same transaction.
 * §B.7 exclusivity + F37 common lock: checks rental + delivery commitments
 * before allowing the accept, serializing on the drivers or users row.
 */
import { verifySupabaseToken } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { db } from '@/src/db';
import {
  deliveryRequests,
  deliveryBids,
  deliveryLegs,
  awardedBidAssignments,
  rentalRequests,
  shopOrders,
  drivers,
  couriers,
  users,
  emergencyRequests,
  ambulanceCertifications,
} from '@/src/db/schema';
import { eq, and, sql, isNull, inArray, notInArray } from 'drizzle-orm';
import { parseJsonBody } from '@/lib/parseBody';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const acceptSchema = z.object({
  bid_id: z.string().uuid(),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    // Validate UUID
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: 'invalid_uuid' }, { status: 400 });
    }

    // Auth — must be the request owner
    const supabaseUser = await verifySupabaseToken(request);
    const { data: dbUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_uid', supabaseUser.id)
      .maybeSingle();
    if (!dbUser) {
      return Response.json({ error: 'user_not_found' }, { status: 403 });
    }

    const parsed = await parseJsonBody(request, acceptSchema);
    if (!parsed.ok) return parsed.response;
    const { bid_id } = parsed.data;

    // §B.0 Atomic transition: lock request → exclusivity check → conditional update → insert leg
    const result = await db.transaction(async (tx) => {
      // Lock the request row
      const [req] = await tx
        .select()
        .from(deliveryRequests)
        .where(eq(deliveryRequests.id, id))
        .for('update');

      if (!req) throw Object.assign(new Error('Not found'), { status: 404 });
      if (req.created_by_user_id !== dbUser.id) {
        throw Object.assign(new Error('Forbidden'), { status: 403 });
      }
      if (req.status !== 'pending') {
        throw Object.assign(new Error('Request is not accepting bids'), { status: 409, message: 'not_pending' });
      }

      // Verify the bid exists, is active, and belongs to this request
      const [bid] = await tx
        .select()
        .from(deliveryBids)
        .where(and(eq(deliveryBids.id, bid_id), eq(deliveryBids.request_id, id)))
        .limit(1);

      if (!bid) throw Object.assign(new Error('Bid not found'), { status: 404 });
      if (bid.status !== 'active') {
        throw Object.assign(new Error('Bid is no longer active'), { status: 409 });
      }

      // ── §B.7 Exclusivity + F37 Common Lock ──
      // Determine courier type to pick the right serialization point.
      const [courierRow] = await tx
        .select()
        .from(couriers)
        .where(and(
          eq(couriers.user_id, bid.courier_user_id),
          eq(couriers.status, 'active'),
        ))
        .limit(1);

      if (!courierRow) {
        throw Object.assign(new Error('Courier not active'), { status: 409, message: 'courier_not_active' });
      }

      if (courierRow.courier_type === 'parcel') {
        // Parcel courier: FOR UPDATE on drivers row (F37 common serialization point)
        const [driverRow] = await tx
          .select()
          .from(drivers)
          .where(eq(drivers.user_id, bid.courier_user_id))
          .for('update');

        if (!driverRow) {
          throw Object.assign(new Error('Driver not found'), { status: 409, message: 'driver_required_for_parcel' });
        }

        // Check B.7: no active rental assignment — join rental_requests and filter
        // by parent status IN ('awarded','confirmed'). A completed rental's assignment
        // stays fulfilled with released_at IS NULL forever (only cancels release it),
        // so we must exclude terminal parent states to avoid permanent lockout.
        const activeRentalStatuses = ['awarded', 'confirmed'] as const;
        const [activeRental] = await tx
          .select({ id: awardedBidAssignments.id })
          .from(awardedBidAssignments)
          .innerJoin(
            rentalRequests,
            eq(awardedBidAssignments.request_id, rentalRequests.id),
          )
          .where(and(
            eq(awardedBidAssignments.assigned_driver_user_id, bid.courier_user_id),
            isNull(awardedBidAssignments.released_at),
            inArray(rentalRequests.status, activeRentalStatuses),
          ))
          .limit(1);

        if (activeRental) {
          throw Object.assign(new Error('Driver already committed to a rental'), { status: 409, message: 'driver_already_committed' });
        }

        // §B.7 carry-in (Phase 6): no ACTIVE emergency commitment for the
        // parcel-courier driver (accepted an emergency that is not terminal).
        const [activeEmergency] = await tx
          .select({ id: emergencyRequests.id })
          .from(emergencyRequests)
          .innerJoin(
            ambulanceCertifications,
            eq(emergencyRequests.accepted_cert_id, ambulanceCertifications.id),
          )
          .where(and(
            eq(ambulanceCertifications.user_id, bid.courier_user_id),
            notInArray(emergencyRequests.status, ['completed', 'cancelled', 'failed']),
          ))
          .limit(1);

        if (activeEmergency) {
          throw Object.assign(new Error('Driver already committed to an emergency'), { status: 409, message: 'driver_already_committed' });
        }
      } else {
        // Food hero: FOR UPDATE on users row as common serialization point
        await tx
          .select()
          .from(users)
          .where(eq(users.id, bid.courier_user_id))
          .for('update');
      }

      // Check B.7: no active delivery leg (any type — parcel or food)
      const [activeLeg] = await tx
        .select({ id: deliveryLegs.id })
        .from(deliveryLegs)
        .where(and(
          eq(deliveryLegs.courier_user_id, bid.courier_user_id),
          sql`${deliveryLegs.leg_state} IN ('pending', 'assigned', 'picked_up', 'in_transit')`,
        ))
        .limit(1);

      if (activeLeg) {
        throw Object.assign(new Error('Courier already has an active delivery'), { status: 409, message: 'courier_already_committed' });
      }

      // ── Accept: request → assigned, bid → won, all other active bids → lost ──
      const [updated] = await tx
        .update(deliveryRequests)
        .set({
          status: 'assigned',
          accepted_bid_id: bid_id,
          quoted_fee_bdt: bid.quoted_fee_bdt,
          accepted_at: new Date(),
        })
        .where(and(eq(deliveryRequests.id, id), eq(deliveryRequests.status, 'pending')))
        .returning({ id: deliveryRequests.id });

      if (!updated) {
        throw Object.assign(new Error('Concurrent transition'), { status: 409, message: 'concurrent_transition' });
      }

      // Mark winning bid
      await tx.update(deliveryBids)
        .set({ status: 'won', settled_at: new Date() })
        .where(eq(deliveryBids.id, bid_id));

      // Mark all other active bids as lost
      await tx.update(deliveryBids)
        .set({ status: 'lost', settled_at: new Date() })
        .where(and(
          eq(deliveryBids.request_id, id),
          eq(deliveryBids.status, 'active'),
          sql`${deliveryBids.id} != ${bid_id}`,
        ));

      // Create delivery leg
      const [leg] = await tx
        .insert(deliveryLegs)
        .values({
          request_id: id,
          courier_user_id: bid.courier_user_id,
          leg_state: 'assigned',
        })
        .returning();

      // F40: if this is a food delivery order (has source_shop_order_id),
      // write delivery_fee_bdt and recompute total_bdt in the same tx.
      if (req.source_shop_order_id) {
        const [shopOrder] = await tx
          .select()
          .from(shopOrders)
          .where(eq(shopOrders.id, req.source_shop_order_id))
          .limit(1);

        if (shopOrder) {
          const newTotal = shopOrder.subtotal_bdt + bid.quoted_fee_bdt;
          await tx.update(shopOrders)
            .set({
              delivery_fee_bdt: bid.quoted_fee_bdt,
              total_bdt: newTotal,
              updated_at: new Date(),
            })
            .where(eq(shopOrders.id, req.source_shop_order_id));
        }
      }

      return { request: updated, bid, leg };
    });

    logger.info('Delivery bid accepted', { requestId: id, bidId: bid_id, courierId: result.bid.courier_user_id });

    return Response.json({
      delivery: result.request,
      bid: result.bid,
      leg: result.leg,
    });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) {
      return Response.json({ error: err.message || 'error' }, { status: err.status });
    }
    logger.error('Delivery accept-bid failed', error);
    return Response.json({ error: 'server_error', message: 'Failed to accept bid' }, { status: 500 });
  }
}
