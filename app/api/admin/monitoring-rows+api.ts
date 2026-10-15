/**
 * GET /api/admin/monitoring-rows — §7 A5 read-only ops counts.
 *
 * The six rows the S7 order names, each a COUNT with no writes:
 *   pending_shop_verifications   shops.verification_status = 'pending'
 *   pending_fleet_verifications  fleets.verification_status = 'pending'
 *   pending_vehicle_type_changes vehicle_type_changes.status = 'pending'
 *   active_shops                 shops.status = 'active'
 *   delivery_legs_today          deliveries created since 00:00 Asia/Dhaka
 *   couriers_online              couriers.status='active' AND is_online
 *
 * The courier predicate is deliberately the SAME one the dispatch pool uses
 * (lib/deliveryDispatch.ts) — a monitoring row that counts differently from the
 * pool it describes is worse than no row.
 *
 * Auth: requireAdminPermission('admin.read') — all four admin roles (§7 A2).
 * "Today" is the Asia/Dhaka calendar day via lib/time.ts, never the host tz.
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import { shops, fleets, couriers, vehicleTypeChanges, deliveries } from '@/src/db/schema';
import { requireAdminPermission } from '@/lib/adminRbac';
import { prevBdtMidnightUtc } from '@/lib/time';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

const COUNT = sql<number>`count(*)::int`;

export async function GET(request: Request) {
  try {
    await requireAdminPermission('admin.read')(request);

    const dayStart = prevBdtMidnightUtc();

    const [shopVerif, fleetVerif, typeChanges, shopsActive, legsToday, couriersOnline] =
      await Promise.all([
        db.select({ n: COUNT }).from(shops).where(eq(shops.verification_status, 'pending')),
        db.select({ n: COUNT }).from(fleets).where(eq(fleets.verification_status, 'pending')),
        db
          .select({ n: COUNT })
          .from(vehicleTypeChanges)
          .where(eq(vehicleTypeChanges.status, 'pending')),
        db.select({ n: COUNT }).from(shops).where(eq(shops.status, 'active')),
        db.select({ n: COUNT }).from(deliveries).where(gte(deliveries.created_at, dayStart)),
        db
          .select({ n: COUNT })
          .from(couriers)
          .where(and(eq(couriers.status, 'active'), eq(couriers.is_online, true))),
      ]);

    const n = (rows: { n: number }[]): number => Number(rows[0]?.n ?? 0);

    return Response.json({
      rows: [
        {
          key: 'pending_shop_verifications',
          label: 'Pending shop verifications',
          value: n(shopVerif),
          href: '/admin/verification',
        },
        {
          key: 'pending_fleet_verifications',
          label: 'Pending fleet verifications',
          value: n(fleetVerif),
          href: '/admin/verification',
        },
        {
          key: 'pending_vehicle_type_changes',
          label: 'Pending vehicle-type changes',
          value: n(typeChanges),
          href: '/admin/vehicle-type-changes',
        },
        {
          key: 'active_shops',
          label: 'Active shops',
          value: n(shopsActive),
          href: '/admin/marketplace/shops',
        },
        {
          key: 'delivery_legs_today',
          label: 'Delivery legs today',
          value: n(legsToday),
          href: '/admin/marketplace/delivery',
        },
        {
          key: 'couriers_online',
          label: 'Delivery men online',
          value: n(couriersOnline),
          href: '/admin/marketplace/couriers',
        },
      ],
      day_start_utc: dayStart.toISOString(),
      generated_at: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403)
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/monitoring-rows] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
