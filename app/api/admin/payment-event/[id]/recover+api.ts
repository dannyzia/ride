// POST /api/admin/payment-event/[id]/recover
// F15-API-05. Manually activate subscription for stuck paid payment.
import { db } from "@/src/db";
import { paymentEvents } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { activateSubscription } from "@/lib/activateSubscription";
import { logger } from "@/lib/logger";
import { z } from "zod";

interface Params {
  params: { id: string };
}

const idSchema = z.string().uuid();

export async function POST(request: Request, { params }: Params) {
  try {
    const { supabaseUser: admin } = await requireRole("admin")(request);
    const { id } = params;

    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) {
      return Response.json(
        { error: "invalid_uuid", message: "id must be a valid UUID" },
        { status: 400 },
      );
    }
    const paymentEventId = parsedId.data;

    const [event] = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.id, paymentEventId))
      .limit(1);
    if (!event)
      return Response.json(
        { error: "payment_event_not_found" },
        { status: 404 },
      );

    if (event.status !== "paid") {
      return Response.json(
        {
          error: "invalid_status",
          message: `Payment status is ${event.status}, expected 'paid'`,
        },
        { status: 422 },
      );
    }

    if (event.subscription_id) {
      return Response.json({
        payment_event_id: paymentEventId,
        subscription_id: event.subscription_id,
        already_activated: true,
      });
    }

    const { subscriptionId } = await activateSubscription(paymentEventId);

    logger.info("[admin/payment-event/recover] recovered", {
      paymentEventId,
      subscriptionId,
      adminId: admin.id,
    });

    return Response.json({
      payment_event_id: paymentEventId,
      subscription_id: subscriptionId,
      recovered: true,
    });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden" }, { status: 403 });
    logger.error("[admin/payment-event/recover] error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
