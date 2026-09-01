/**
 * POST /api/emergency/requests/[id]/cancel — caller or assigned driver
 * cancels a non-terminal emergency (§B.5).
 */
import { parseJsonBody } from "@/lib/parseBody";
import { verifySupabaseToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { cancelEmergencyRequest } from "@/utils-server/emergencyChain";
import { logger } from "@/lib/logger";
import { z } from "zod";

const cancelSchema = z.object({
  reason: z.string().max(500).optional(),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid request id" }, { status: 400 });
    }

    const supabaseUser = await verifySupabaseToken(request);
    const { data: dbUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("auth_uid", supabaseUser.id)
      .maybeSingle();
    if (!dbUser) {
      return Response.json({ error: "user_not_found", message: "No user record" }, { status: 403 });
    }

    const result = await parseJsonBody(request, cancelSchema);
    const body = result.ok ? result.data : {};

    const updated = await cancelEmergencyRequest(id, dbUser.id, body.reason);

    return Response.json({ request: updated, message: "Emergency cancelled" });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 409)
      return Response.json({ error: "invalid_transition", message: e.message ?? "conflict" }, { status: 409 });
    if (e.status === 403)
      return Response.json({ error: "forbidden", message: e.message ?? "Not authorized" }, { status: 403 });
    if (e.status === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (e.status === 404)
      return Response.json({ error: "not_found", message: e.message ?? "Not found" }, { status: 404 });
    logger.error("[emergency/cancel POST] error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
