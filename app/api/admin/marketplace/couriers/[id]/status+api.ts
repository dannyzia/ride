/**
 * PATCH /api/admin/marketplace/couriers/[id]/status — suspend/restore a courier.
 *
 * Auth: requireAdminPermission('marketplace.write').
 */
import { db } from "@/src/db";
import { couriers } from "@/src/db/schema";
import { requireAdminPermission } from "@/lib/adminRbac";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";
import { eq } from "drizzle-orm";

const statusSchema = z.object({
  status: z.enum(["active", "suspended"]),
});

export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    await requireAdminPermission("marketplace.write")(request);

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid courier id" }, { status: 400 });
    }

    const result = await parseJsonBody(request, statusSchema);
    if (!result.ok) return result.response;
    const body = result.data;

    const [existing] = await db
      .select({ id: couriers.id, status: couriers.status })
      .from(couriers)
      .where(eq(couriers.id, id))
      .limit(1);

    if (!existing) {
      return Response.json({ error: "not_found", message: "Courier not found" }, { status: 404 });
    }

    await db
      .update(couriers)
      .set({ status: body.status, updated_at: new Date() })
      .where(eq(couriers.id, id));

    logger.info("[admin/marketplace/couriers PATCH]", { courier_id: id, from: existing.status, to: body.status });

    return Response.json({ message: `Courier ${body.status}`, previous_status: existing.status });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Admin access required" }, { status: 403 });
    logger.error("[admin/marketplace/couriers PATCH] error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
