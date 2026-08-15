import { db } from "@/src/db";
import { driverSchedule, users, drivers } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import { z } from "zod";

const slotSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  is_active: z.boolean().optional(),
});

const putSchema = z.object({
  schedule: z.array(slotSchema).max(21),
});

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id })
      .from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const rows = await db.select({
      day_of_week: driverSchedule.day_of_week,
      start_time: driverSchedule.start_time,
      end_time: driverSchedule.end_time,
      is_active: driverSchedule.is_active,
    })
      .from(driverSchedule)
      .where(eq(driverSchedule.driver_id, driver.id))
      .orderBy(driverSchedule.day_of_week);

    return Response.json({ schedule: rows }, { status: 200 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[driver/schedule] GET error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id })
      .from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, putSchema);
    if (!parsed.ok) return parsed.response;

    await db.transaction(async (tx) => {
      await tx.delete(driverSchedule)
        .where(eq(driverSchedule.driver_id, driver.id));

      if (parsed.data.schedule.length > 0) {
        await tx.insert(driverSchedule).values(
          parsed.data.schedule.map((slot) => ({
            driver_id: driver.id,
            day_of_week: slot.day_of_week,
            start_time: slot.start_time,
            end_time: slot.end_time,
            is_active: slot.is_active ?? true,
          })),
        );
      }
    });

    return Response.json({ success: true }, { status: 200 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[driver/schedule] PUT error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
