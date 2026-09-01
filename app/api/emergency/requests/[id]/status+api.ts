/**
 * POST /api/emergency/requests/[id]/status — assigned driver transitions
 * (§B.5): assigned → en_route_pickup → arrived → en_route_dropoff →
 * completed. 'failed' is SYSTEM-only (TTL sweep).
 */
import { parseJsonBody } from "@/lib/parseBody";
import { verifySupabaseToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { transitionEmergencyRequest } from "@/utils-server/emergencyChain";
import { logger } from "@/lib/logger";
import { z } from "zod";

const statusSchema = z.object({
  status: z.enum(["en_route_pickup", "arrived", "en_route_dropoff", "completed"]),
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

    const result = await parseJsonBody(request, statusSchema);
    if (!result.ok) return result.response;

    const updated = await transitionEmergencyRequest(id, dbUser.id, result.data.status);

    return Response.json({ request: updated });
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
    logger.error("[emergency/status POST] error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
