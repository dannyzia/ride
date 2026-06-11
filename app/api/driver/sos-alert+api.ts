import { db } from "../../../src/db";
import { sosAlerts } from "../../../src/db/schema";
import { requireRole } from "../../../lib/auth";
import { logger } from "../../../lib/logger";
import { z } from "zod";

const sosSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export async function POST(request: Request) {
  try {
    const { dbUser } = await requireRole("driver")(request);

    const body = await request.json();
    const parsed = sosSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "validation_error", message: parsed.error.format() },
        { status: 400 },
      );
    }

    const { lat, lng } = parsed.data;

    await db.insert(sosAlerts).values({
      user_id: dbUser.id,
      role: "driver" as const,
      latitude: lat.toString(),
      longitude: lng.toString(),
      contacts_notified: [],
    });

    logger.info("[sos-alert] recorded", { driver_id: dbUser.id, lat, lng });

    return Response.json({ ok: true });
  } catch (err: any) {
    if (err.status === 401)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    if (err.status === 403)
      return Response.json({ error: "forbidden" }, { status: 403 });
    logger.error("[sos-alert] error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
