/**
 * POST /api/ambulance/certifications — driver submits a certification
 * (§C.6). Vehicle must belong to one of the submitter's fleets
 * (vehicles.fleet_id membership — F28: fleets carry no status column).
 * Row is created 'pending'; admin review promotes to verified/revoked.
 */
import { db } from "@/src/db";
import { ambulanceCertifications, vehicles } from "@/src/db/schema";
import { verifySupabaseToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";

const createSchema = z.object({
  vehicle_id: z.string().uuid(),
  service_level: z.enum(["BLS", "ALS"]),
  cert_number: z.string().max(100).optional(),
  issuing_body: z.string().max(200).optional(),
  issued_at: z.string().datetime().optional(),
  expires_at: z.string().datetime().optional(),
  document_urls: z.array(z.string().url()).max(10).optional(),
});

export async function POST(request: Request) {
  try {
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

    const result = await parseJsonBody(request, createSchema);
    if (!result.ok) return result.response;
    const body = result.data;

    // F28: vehicle must belong to a fleet the user is an ACTIVE member of
    const { data: memberships } = await supabaseAdmin
      .from("fleet_members")
      .select("fleet_id")
      .eq("user_id", dbUser.id)
      .eq("status", "active")
      .is("removed_at", null);

    const memberFleetIds = (memberships ?? []).map(
      (m: { fleet_id: string }) => m.fleet_id,
    );
    if (memberFleetIds.length === 0) {
      return Response.json(
        { error: "fleet_member_required", message: "Active fleet membership required" },
        { status: 403 },
      );
    }

    const [vehicle] = await db
      .select({ id: vehicles.id, fleet_id: vehicles.fleet_id })
      .from(vehicles)
      .where(
        and(
          eq(vehicles.id, body.vehicle_id),
          inArray(vehicles.fleet_id, memberFleetIds),
        ),
      )
      .limit(1);

    if (!vehicle) {
      return Response.json(
        { error: "vehicle_not_found", message: "Vehicle not in one of your fleets" },
        { status: 404 },
      );
    }

    const [cert] = await db
      .insert(ambulanceCertifications)
      .values({
        user_id: dbUser.id,
        vehicle_id: body.vehicle_id,
        certification_status: "pending",
        service_level: body.service_level,
        cert_number: body.cert_number ?? null,
        issuing_body: body.issuing_body ?? null,
        issued_at: body.issued_at ? new Date(body.issued_at) : null,
        expires_at: body.expires_at ? new Date(body.expires_at) : null,
        document_urls: body.document_urls ?? [],
      })
      .returning({ id: ambulanceCertifications.id });

    return Response.json(
      { certification_id: cert.id, status: "pending", message: "Certification submitted for review" },
      { status: 201 },
    );
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    logger.error("[ambulance/certifications POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
