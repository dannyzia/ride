/**
 * PATCH /api/admin/marketplace/shops/[id]/status — suspend/restore a shop.
 *
 * Auth: requireAdminPermission('marketplace.write').
 * Only active↔suspended is allowed; `closed` is terminal (409).
 */
import { db } from "@/src/db";
import { shops } from "@/src/db/schema";
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
      return Response.json({ error: "invalid_uuid", message: "Invalid shop id" }, { status: 400 });
    }

    const result = await parseJsonBody(request, statusSchema);
    if (!result.ok) return result.response;
    const body = result.data;

    const [existing] = await db
      .select({ id: shops.id, status: shops.status })
      .from(shops)
      .where(eq(shops.id, id))
      .limit(1);

    if (!existing) {
      return Response.json({ error: "not_found", message: "Shop not found" }, { status: 404 });
    }

    // Only allow active↔suspended; closed is terminal
    if (existing.status === "closed") {
      return Response.json({ error: "terminal_status", message: "Cannot change a closed shop's status" }, { status: 409 });
    }

    await db
      .update(shops)
      .set({ status: body.status, updated_at: new Date() })
      .where(eq(shops.id, id));

    logger.info("[admin/marketplace/shops] status change", { shop_id: id, from: existing.status, to: body.status });

    return Response.json({ message: `Shop ${body.status}`, previous_status: existing.status });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Admin access required" }, { status: 403 });
    logger.error("[admin/marketplace/shops PATCH] error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
