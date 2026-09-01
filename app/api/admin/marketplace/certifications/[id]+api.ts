/**
 * PATCH /api/admin/marketplace/certifications/[id] — admin review of an
 * ambulance certification (§C.6). Verifies or revokes with review notes.
 * requireAdminPermission('marketplace.write').
 */
import { db } from "@/src/db";
import { ambulanceCertifications } from "@/src/db/schema";
import { requireAdminPermission } from "@/lib/adminRbac";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";
import { eq } from "drizzle-orm";

const reviewSchema = z.object({
  status: z.enum(["verified", "revoked"]),
  review_notes: z.string().max(1000).optional(),
});

export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    const { dbUser: adminUser } = await requireAdminPermission("marketplace.write")(request);

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid certification id" }, { status: 400 });
    }

    const result = await parseJsonBody(request, reviewSchema);
    if (!result.ok) return result.response;
    const body = result.data;

    const [cert] = await db
      .select({ id: ambulanceCertifications.id })
      .from(ambulanceCertifications)
      .where(eq(ambulanceCertifications.id, id))
      .limit(1);

    if (!cert) {
      return Response.json({ error: "not_found", message: "Certification not found" }, { status: 404 });
    }

    await db
      .update(ambulanceCertifications)
      .set({
        certification_status: body.status,
        reviewed_by: adminUser.id,
        reviewed_at: new Date(),
        review_notes: body.review_notes ?? null,
        updated_at: new Date(),
      })
      .where(eq(ambulanceCertifications.id, id));

    return Response.json({ message: `Certification ${body.status}` });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json(
        { error: "forbidden", message: (err as Error).message ?? "Not authorized" },
        { status: 403 },
      );
    logger.error("[admin/certifications PATCH] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
