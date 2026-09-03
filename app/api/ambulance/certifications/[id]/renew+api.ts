/**
 * PATCH /api/ambulance/certifications/[id]/renew — F12 renewal semantics.
 * Owner resets their cert pair to 'pending' with fresh documents/expiry;
 * an admin re-reviews. The (user, vehicle) pair is immutable (UNIQUE).
 */
import { db } from "@/src/db";
import { ambulanceCertifications } from "@/src/db/schema";
import { verifySupabaseToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";
import { eq } from "drizzle-orm";

const renewSchema = z.object({
  service_level: z.enum(["BLS", "ALS"]),
  cert_number: z.string().max(100).optional(),
  issuing_body: z.string().max(200).optional(),
  issued_at: z.string().datetime().optional(),
  expires_at: z.string().datetime().optional(),
  document_urls: z.array(z.string().url()).max(10).optional(),
});

export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid certification id" }, { status: 400 });
    }

    const supabaseUser = await verifySupabaseToken(request);
    const { data: dbUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("auth_uid", supabaseUser.id)
      .maybeSingle();
    if (!dbUser) {
      return Response.json(
        { error: "user_not_found", message: "No user record" },
        { status: 403 },
      );
    }

    const [cert] = await db
      .select()
      .from(ambulanceCertifications)
      .where(eq(ambulanceCertifications.id, id))
      .limit(1);

    if (!cert) {
      return Response.json({ error: "not_found", message: "Certification not found" }, { status: 404 });
    }
    if (cert.user_id !== dbUser.id) {
      return Response.json(
        { error: "forbidden", message: "Only the cert holder can renew" },
        { status: 403 },
      );
    }

    const result = await parseJsonBody(request, renewSchema);
    if (!result.ok) return result.response;
    const body = result.data;

    // B4 (audit #15): the cert row is locked (FOR UPDATE) and ownership is
    // re-verified inside the tx; the UPDATE shares the transaction.
    await db.transaction(async (tx) => {
      const lockedRows = await tx
        .select()
        .from(ambulanceCertifications)
        .where(eq(ambulanceCertifications.id, id))
        .limit(1)
        .for("update");

      const locked = lockedRows[0];
      if (!locked) {
        throw Object.assign(new Error("Certification not found"), { status: 404 });
      }
      if (locked.user_id !== dbUser.id) {
        throw Object.assign(new Error("Only the cert holder can renew"), { status: 403 });
      }

      // F12: renewal invalidates the previous review — back to 'pending',
      // review fields cleared, admin re-reviews.
      await tx
        .update(ambulanceCertifications)
        .set({
          certification_status: "pending",
          service_level: body.service_level,
          cert_number: body.cert_number ?? locked.cert_number,
          issuing_body: body.issuing_body ?? locked.issuing_body,
          issued_at: body.issued_at ? new Date(body.issued_at) : locked.issued_at,
          expires_at: body.expires_at ? new Date(body.expires_at) : null,
          document_urls: body.document_urls ?? locked.document_urls,
          reviewed_by: null,
          reviewed_at: null,
          review_notes: null,
          updated_at: new Date(),
        })
        .where(eq(ambulanceCertifications.id, id));
    });

    return Response.json({ message: "Renewal submitted — pending admin review", status: "pending" });
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
    if (status === 404)
      return Response.json(
        { error: "not_found", message: "Certification not found" },
        { status: 404 },
      );
    logger.error("[ambulance/certifications/renew PATCH] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
