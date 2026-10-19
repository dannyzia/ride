import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { users, drivers, rides, rideExtraCharges, supportTickets } from '@/src/db/schema';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { sendNotification } from '@/lib/notify';
import { notifyWs } from '@/lib/wsNotify';
import { z } from 'zod';
import * as errors from '@/lib/errors';

const chargeSchema = z.object({
  type: z.enum(['toll', 'parking']),
  amount_bdt: z.number().int().positive().max(50000),
  description: z.string().max(500).optional(),
});

// C4-7: extra charges may only be proposed on ACTIVE rides (a driver with a
// live ride). Terminal or pre-match rides reject — post-completion money
// moves through the completion fold (the fare truth), not new charges.
const ACTIVE_CHARGE_STATUSES = ['matched', 'driver_arriving', 'driver_arrived', 'in_progress'] as const;

// C4-7: post-completion approvals land here — the completion-time fold
// already fixed the fare, so the approval is recorded as a reconciliation
// note (visible in the admin tickets tooling) instead of moving money.
const TERMINAL_RIDE_STATUSES = ['completed', 'cancelled', 'expired'] as const;

export async function GET(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });
    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);

    const [ride] = await db.select({ user_id: rides.user_id, driver_id: rides.driver_id })
      .from(rides).where(eq(rides.id, id)).limit(1);
    if (!ride) return Response.json({ error: 'not_found', message: 'Resource not found' }, { status: 404 });
    const isRider = ride.user_id === dbUser.id;
    const isDriver = driver && ride.driver_id === driver.id;
    if (!isRider && !isDriver) {
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    }

    const charges = await db.select().from(rideExtraCharges)
      .where(eq(rideExtraCharges.ride_id, id))
      .orderBy(desc(rideExtraCharges.created_at));
    return Response.json({ charges });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[extra-charge] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });
    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const [ride] = await db.select({ id: rides.id, driver_id: rides.driver_id, user_id: rides.user_id, status: rides.status })
      .from(rides).where(eq(rides.id, id)).limit(1);
    if (!ride) return Response.json({ error: 'not_found', message: 'Resource not found' }, { status: 404 });
    if (ride.driver_id !== driver.id) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });

    // C4-7: active rides only.
    if (!(ACTIVE_CHARGE_STATUSES as readonly string[]).includes(ride.status)) {
      return Response.json(
        { error: 'invalid_status', message: `Extra charges can only be proposed on an active ride (current status: ${ride.status})` },
        { status: 409 },
      );
    }

    const parsed = await parseJsonBody(request, chargeSchema);
    if (!parsed.ok) return parsed.response;

    // Double-submit guard: an identical PENDING proposal (same ride, type,
    // amount, note) 409s instead of minting a second charge the rider could
    // approve twice into the fare. A genuinely second charge (different
    // amount — or a distinguishing note, e.g. "2nd toll") still passes.
    const [pendingDupe] = await db
      .select({ id: rideExtraCharges.id })
      .from(rideExtraCharges)
      .where(
        and(
          eq(rideExtraCharges.ride_id, id),
          eq(rideExtraCharges.type, parsed.data.type),
          eq(rideExtraCharges.amount_bdt, parsed.data.amount_bdt),
          eq(rideExtraCharges.status, 'pending'),
          parsed.data.description == null
            ? isNull(rideExtraCharges.description)
            : eq(rideExtraCharges.description, parsed.data.description),
        ),
      )
      .limit(1);
    if (pendingDupe) {
      return Response.json(
        { error: 'duplicate_pending_charge', message: 'An identical charge is already awaiting approval' },
        { status: 409 },
      );
    }

    const [inserted] = await db.insert(rideExtraCharges).values({
      ride_id: id,
      type: parsed.data.type,
      amount_bdt: parsed.data.amount_bdt,
      description: parsed.data.description,
      submitted_by_driver: true,
    }).returning({ id: rideExtraCharges.id });

    // C4-3: the rider must discover the proposal without polling — push +
    // WS, fire-and-forget (a notification failure must never fail the
    // committed charge).
    {
      const label = parsed.data.type === 'toll' ? 'Toll' : 'Parking';
      sendNotification(
        ride.user_id,
        'ride:extra_charge_proposed',
        `${label} charge needs your approval`,
        `Your driver added a ${label.toLowerCase()} charge of ৳${(parsed.data.amount_bdt / 100).toFixed(0)}. Approve or dispute it in your active ride.`,
        { ride_id: id, charge_id: inserted?.id ?? '' },
        { priority: 'high' },
      ).catch(() => {});
      notifyWs([{
        event: 'ride:extra_charge_proposed',
        to: [{ kind: 'user', user_id: ride.user_id }],
        payload: {
          ride_id: id,
          charge_id: inserted?.id ?? null,
          type: parsed.data.type,
          amount_bdt: parsed.data.amount_bdt,
        },
      }]);
    }

    return Response.json({ success: true });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[extra-charge] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

const approveSchema = z.object({
  charge_id: z.string().uuid(),
  action: z.enum(['approve', 'dispute']),
});

export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    const uuidId = z.string().uuid().safeParse(id);
    if (!uuidId.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

    const supabaseUser = await verifySupabaseToken(request);

    const parsed = await parseJsonBody(request, approveSchema);
    if (!parsed.ok) return parsed.response;

    // C4-4: resolve the USERS row from auth_uid (house pattern) — the ticket
    // insert below must carry users.id, never the Supabase auth UUID.
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [charge] = await db.select().from(rideExtraCharges).where(eq(rideExtraCharges.id, parsed.data.charge_id)).limit(1);
    if (!charge || charge.ride_id !== id) return Response.json({ error: 'not_found', message: 'Resource not found' }, { status: 404 });
    if (charge.status !== 'pending') return Response.json({ error: 'already_resolved', message: 'Ticket already resolved' }, { status: 409 });

    const [ride] = await db.select({ user_id: rides.user_id, driver_id: rides.driver_id, status: rides.status }).from(rides).where(eq(rides.id, id)).limit(1);
    if (!ride || ride.user_id !== user.id) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });

    const newStatus = parsed.data.action === 'approve' ? 'approved' : 'disputed';
    // C4-7: a post-completion approval cannot move the fare (the
    // completion-time fold is the truth) — record a reconciliation note.
    const reconciliationNoted = parsed.data.action === 'approve'
      && (TERMINAL_RIDE_STATUSES as readonly string[]).includes(ride.status);

    // C4-4: the disputed flip and the ticket insert commit or roll back
    // together — ONE tx. The conditional UPDATE is the exactly-once guard
    // (a concurrent resolver wins; the loser 409s and writes nothing), so a
    // crash can no longer leave a flipped charge without its ticket.
    let guard: Response | null = null;
    let ticketId: string | null = null;
    await db.transaction(async (tx) => {
      const [claimed] = await tx.update(rideExtraCharges)
        .set({ status: newStatus, resolved_at: new Date() })
        .where(and(eq(rideExtraCharges.id, parsed.data.charge_id), eq(rideExtraCharges.status, 'pending')))
        .returning({ id: rideExtraCharges.id });
      if (!claimed) {
        guard = Response.json({ error: 'already_resolved', message: 'Ticket already resolved' }, { status: 409 });
        return;
      }

      if (newStatus === 'disputed') {
        const [ticket] = await tx.insert(supportTickets).values({
          user_id: user.id,
          ride_id: id,
          category: 'fare_dispute',
          subject: `Disputed ${charge.type} charge: ৳${(charge.amount_bdt / 100).toFixed(0)}`,
          description: `Charge ID: ${charge.id}\nType: ${charge.type}\nAmount: ${charge.amount_bdt}\nDescription: ${charge.description ?? ''}`,
          priority: 'medium',
        }).returning({ id: supportTickets.id });
        ticketId = ticket?.id ?? null;
      } else if (reconciliationNoted) {
        const [ticket] = await tx.insert(supportTickets).values({
          user_id: user.id,
          ride_id: id,
          category: 'fare_reconciliation',
          subject: `Post-completion approval: ${charge.type} charge ৳${(charge.amount_bdt / 100).toFixed(0)}`,
          description: `Charge ID: ${charge.id}\nType: ${charge.type}\nAmount: ${charge.amount_bdt}\nRide already ${ride.status} — completion fold is the fare truth; settle on reconciliation.`,
          priority: 'low',
        }).returning({ id: supportTickets.id });
        ticketId = ticket?.id ?? null;
      }
    });
    if (guard) return guard;

    logger.info('[extra-charge] resolved', { charge_id: charge.id, status: newStatus, reconciliation_noted: reconciliationNoted });

    // The driver proposed; the rider just resolved — close the loop AFTER
    // the commit, fire-and-forget (mirrors the C4-3 propose→rider fan-out
    // and the F-05 cash-note→driver fan-out). Retries 409 on the claim
    // above before reaching this point, so the driver is notified exactly
    // once per resolution.
    if (ride.driver_id) {
      const [driverUser] = await db
        .select({ user_id: drivers.user_id })
        .from(drivers)
        .where(eq(drivers.id, ride.driver_id))
        .limit(1);
      if (driverUser) {
        const approved = newStatus === 'approved';
        const label = charge.type === 'toll' ? 'Toll' : 'Parking';
        const amountTaka = `\u09F3${(charge.amount_bdt / 100).toFixed(0)}`;
        sendNotification(
          driverUser.user_id,
          'ride:extra_charge_resolved',
          approved ? 'Charge approved' : 'Charge disputed',
          approved
            ? `The rider approved your ${label.toLowerCase()} charge of ${amountTaka}. It will be added to the fare.`
            : `The rider disputed your ${label.toLowerCase()} charge of ${amountTaka}. Support will review.`,
          { ride_id: id, charge_id: charge.id, decision: newStatus },
          { priority: 'high' },
        ).catch(() => {});
        notifyWs([{
          event: 'ride:extra_charge_resolved',
          to: [{ kind: 'user', user_id: driverUser.user_id }],
          payload: { ride_id: id, charge_id: charge.id, decision: newStatus },
        }]);
      }
    }
    return Response.json({ success: true, status: newStatus, ...(reconciliationNoted ? { reconciliation_noted: true, ticket_id: ticketId } : {}) });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[extra-charge] PATCH error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
