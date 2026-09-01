/**
 * GET /api/ambulance/certifications/me — the caller's own certification
 * rows, newest first (§C.6).
 */
import { db } from "@/src/db";
import { ambulanceCertifications } from "@/src/db/schema";
import { verifySupabaseToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { logger } from "@/lib/logger";
import { eq, desc } from "drizzle-orm";

export async function GET(request: Request) {
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

    const rows = await db
      .select()
      .from(ambulanceCertifications)
      .where(eq(ambulanceCertifications.user_id, dbUser.id))
      .orderBy(desc(ambulanceCertifications.created_at));

    return Response.json({ certifications: rows });
  } catch (err: unknown) {
    logger.error("[ambulance/certifications/me GET] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
