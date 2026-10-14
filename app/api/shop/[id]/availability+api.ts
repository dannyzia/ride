/**
 * PATCH /api/shop/[id]/availability — S3 R5/F-16.
 *
 * OWNER/MANAGER only. Sets the shop's open/closed flag and busy mode.
 * - closed (is_open=false): the SERVER rejects new orders (order-creation
 *   routes read is_open — R5 says the enforcement is server-side, not UI).
 * - busy (F-16): THROTTLES, never closes — the flag does not block orders;
 *   the customer checkout surfaces it as a slower-promise warning.
 * Emits shop:availability to the shop's staff sockets after the write.
 */
import { db } from "@/src/db";
import { shops } from "@/src/db/schema";
import { requireShopMember } from "@/lib/marketplaceRbac";
import { parseJsonBody } from "@/lib/parseBody";
import { notifyWs } from "@/lib/wsNotify";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";

const availabilitySchema = z
  .object({
    is_open: z.boolean().optional(),
    busy: z.boolean().optional(),
  })
  .refine((d) => d.is_open !== undefined || d.busy !== undefined, {
    message: "at least one flag required",
  });

export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    // B7/L1: UUID guard before any DB access
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid shop id" }, { status: 400 });
    }

    const result = await parseJsonBody(request, availabilitySchema);
    if (!result.ok) return result.response;

    await requireShopMember(id, ["OWNER", "MANAGER"])(request);

    const [updated] = await db
      .update(shops)
      .set({
        ...(result.data.is_open !== undefined ? { is_open: result.data.is_open } : {}),
        ...(result.data.busy !== undefined ? { busy: result.data.busy } : {}),
        updated_at: new Date(),
      })
      .where(and(eq(shops.id, id), isNull(shops.deleted_at)))
      .returning({ is_open: shops.is_open, busy: shops.busy });

    if (!updated) {
      return Response.json(
        { error: "not_found", message: "Shop not found" },
        { status: 404 },
      );
    }

    notifyWs([
      {
        event: "shop:availability",
        to: [{ kind: "shop_staff", shop_id: id }],
        payload: { shop_id: id, is_open: updated.is_open, busy: updated.busy },
      },
    ]);

    return Response.json({
      message: "Availability updated",
      is_open: updated.is_open,
      busy: updated.busy,
    });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json(
        { error: "forbidden", message: "Only the owner or manager can change availability" },
        { status: 403 },
      );
    logger.error("[shop/availability PATCH] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
