/**
 * Workshop services CRUD — S3 (§3) + S4 (F-13).
 *
 * GET is PUBLIC (the F-13 customer lane browses the service price list —
 * same posture as the public products read in /api/shop/[id]; S3 originally
 * gated it OWNER/MANAGER — recorded as an S4 divergence). POST/PATCH/DELETE
 * stay OWNER/MANAGER. GET lists live services (not soft-deleted), POST
 * creates, PATCH updates (availability via deleted_at is NOT covered here —
 * use DELETE), DELETE soft-deletes per the repo no-hard-deletes rule
 * (deleted_at shipped with 0067).
 */
import { db } from "@/src/db";
import { workshopServices, shops } from "@/src/db/schema";
import { requireShopMember } from "@/lib/marketplaceRbac";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";

export async function GET(request: Request, { id }: { id: string }) {
  try {
    // B7/L1: UUID guard before any DB access
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid shop id" }, { status: 400 });
    }

    // Public read: 404 for a missing/deleted shop (mirror of /api/shop/[id]).
    const [shopRow] = await db
      .select({ id: shops.id })
      .from(shops)
      .where(and(eq(shops.id, id), isNull(shops.deleted_at)))
      .limit(1);
    if (!shopRow) {
      return Response.json({ error: "shop_not_found", message: "Shop not found" }, { status: 404 });
    }

    const services = await db
      .select()
      .from(workshopServices)
      .where(
        and(
          eq(workshopServices.shop_id, id),
          isNull(workshopServices.deleted_at),
        ),
      )
      .orderBy(workshopServices.created_at);

    return Response.json({ services });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json(
        { error: "forbidden", message: "Not authorized" },
        { status: 403 },
      );
    logger.error("[shop/workshop/services GET] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

const serviceSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  price_bdt: z.number().int().min(0),
  duration_minutes: z.number().int().min(5).max(1440),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    // B7/L1: UUID guard before any DB access
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid shop id" }, { status: 400 });
    }

    await requireShopMember(id, ["OWNER", "MANAGER"])(request);

    const result = await parseJsonBody(request, serviceSchema);
    if (!result.ok) return result.response;

    const [service] = await db
      .insert(workshopServices)
      .values({
        shop_id: id,
        name: result.data.name,
        description: result.data.description,
        price_bdt: result.data.price_bdt,
        duration_minutes: result.data.duration_minutes,
      })
      .returning({ id: workshopServices.id });

    return Response.json(
      { service_id: service.id, message: "Service created" },
      { status: 201 },
    );
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json(
        { error: "forbidden", message: "Not authorized" },
        { status: 403 },
      );
    logger.error("[shop/workshop/services POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

const serviceUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  price_bdt: z.number().int().min(0).optional(),
  duration_minutes: z.number().int().min(5).max(1440).optional(),
});

export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    // B7/L1: UUID guard before any DB access
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid shop id" }, { status: 400 });
    }

    await requireShopMember(id, ["OWNER", "MANAGER"])(request);

    const result = await parseJsonBody(request, serviceUpdateSchema);
    if (!result.ok) return result.response;

    const { id: serviceId, ...updates } = result.data;

    const updated = await db
      .update(workshopServices)
      .set({ ...updates, updated_at: new Date() })
      .where(
        and(
          eq(workshopServices.id, serviceId),
          eq(workshopServices.shop_id, id),
          isNull(workshopServices.deleted_at),
        ),
      )
      .returning({ id: workshopServices.id });

    if (updated.length === 0) {
      return Response.json(
        { error: "not_found", message: "Service not found" },
        { status: 404 },
      );
    }

    return Response.json({ message: "Service updated" });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json(
        { error: "forbidden", message: "Not authorized" },
        { status: 403 },
      );
    logger.error("[shop/workshop/services PATCH] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { id }: { id: string }) {
  try {
    // B7/L1: UUID guard before any DB access
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid shop id" }, { status: 400 });
    }

    await requireShopMember(id, ["OWNER", "MANAGER"])(request);

    const url = new URL(request.url);
    const serviceId = url.searchParams.get("id");
    if (!serviceId) {
      return Response.json(
        { error: "invalid_param", message: "Service id required" },
        { status: 400 },
      );
    }

    const updated = await db
      .update(workshopServices)
      .set({ deleted_at: new Date(), updated_at: new Date() })
      .where(
        and(
          eq(workshopServices.id, serviceId),
          eq(workshopServices.shop_id, id),
          isNull(workshopServices.deleted_at),
        ),
      )
      .returning({ id: workshopServices.id });

    if (updated.length === 0) {
      return Response.json(
        { error: "not_found", message: "Service not found" },
        { status: 404 },
      );
    }

    return Response.json({ message: "Service deleted" });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json(
        { error: "forbidden", message: "Not authorized" },
        { status: 403 },
      );
    logger.error("[shop/workshop/services DELETE] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
