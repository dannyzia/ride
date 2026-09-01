/**
 * GET /api/emergency/requests/[id] — caller, assigned driver, or admin
 * (v1 §C.6.3). patient_condition is included for these parties only —
 * never in broadcasts (F41).
 */
import { db } from "@/src/db";
import { emergencyRequests, ambulanceCertifications } from "@/src/db/schema";
import { verifySupabaseToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { logger } from "@/lib/logger";
import { eq } from "drizzle-orm";

export async function GET(request: Request, { id }: { id: string }) {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid request id" }, { status: 400 });
    }

    const supabaseUser = await verifySupabaseToken(request);
    const { data: dbUser } = await supabaseAdmin
      .from("users")
      .select("id, role")
      .eq("auth_uid", supabaseUser.id)
      .maybeSingle();
    if (!dbUser) {
      return Response.json({ error: "user_not_found", message: "No user record" }, { status: 403 });
    }

    const [req] = await db
      .select()
      .from(emergencyRequests)
      .where(eq(emergencyRequests.id, id))
      .limit(1);

    if (!req) {
      return Response.json({ error: "not_found", message: "Emergency request not found" }, { status: 404 });
    }

    let authorized = req.caller_user_id === dbUser.id || dbUser.role === "admin";
    if (!authorized && req.accepted_cert_id) {
      const [cert] = await db
        .select({ user_id: ambulanceCertifications.user_id })
        .from(ambulanceCertifications)
        .where(eq(ambulanceCertifications.id, req.accepted_cert_id))
        .limit(1);
      authorized = cert?.user_id === dbUser.id;
    }

    if (!authorized) {
      return Response.json({ error: "forbidden", message: "Not a party to this emergency" }, { status: 403 });
    }

    return Response.json({ request: req });
  } catch (err: unknown) {
    logger.error("[emergency/requests/[id] GET] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
