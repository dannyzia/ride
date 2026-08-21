import { db } from "@/src/db";
import { driverSchedule, users, drivers } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import { z } from "zod";
import * as errors from "@/lib/errors";

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

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
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

    // Server-side overlap validation: check that no two active slots on the
    // same day have overlapping time ranges. Each slot is [start, end) in
    // HH:MM format. Two slots overlap when slotA.start < slotB.end AND
    // slotA.end > slotB.start.
    const activeSlots = parsed.data.schedule.filter((s) => s.is_active !== false);
    const byDay = new Map<number, typeof activeSlots>();
    for (const slot of activeSlots) {
      const list = byDay.get(slot.day_of_week) ?? [];
      list.push(slot);
      byDay.set(slot.day_of_week, list);
    }
    for (const [day, slots] of byDay) {
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          const a = slots[i];
          const b = slots[j];
          // Overlap: a.start < b.end AND a.end > b.start
          if (a.start_time < b.end_time && a.end_time > b.start_time) {
            return Response.json(
              {
                error: 'schedule_overlap',
                message: `Time slots overlap on day ${day}: ${a.start_time}-${a.end_time} and ${b.start_time}-${b.end_time}`,
                day_of_week: day,
                slot_a: `${a.start_time}-${a.end_time}`,
                slot_b: `${b.start_time}-${b.end_time}`,
              },
              { status: 422 },
            );
          }
        }
      }
    }

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

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[driver/schedule] PUT error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
