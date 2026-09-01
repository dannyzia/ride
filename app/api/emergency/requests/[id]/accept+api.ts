/**
 * POST /api/emergency/requests/[id]/accept — certified driver accepts
 * (§C.6 + §B.0 + §B.7). requireAmbulanceCertified gate, then the chain's
 * first-accept-wins conditional UPDATE. Losers of the race get 409.
 */
import { db } from "@/src/db";
import { emergencyRequests } from "@/src/db/schema";
import { requireAmbulanceCertified } from "@/lib/marketplaceRbac";
import { acceptEmergencyRequest } from "@/utils-server/emergencyChain";
import { logger } from "@/lib/logger";
import { eq } from "drizzle-orm";

export async function POST(request: Request, { id }: { id: string }) {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid request id" }, { status: 400 });
    }

    const [req] = await db
      .select({ service_level: emergencyRequests.service_level, status: emergencyRequests.status })
      .from(emergencyRequests)
      .where(eq(emergencyRequests.id, id))
      .limit(1);

    if (!req) {
      return Response.json({ error: "not_found", message: "Emergency request not found" }, { status: 404 });
    }
    if (!req.service_level) {
      return Response.json({ error: "service_level_missing", message: "Request has no service level" }, { status: 409 });
    }

    // §E.3: verified, unexpired cert whose level covers the request (BLS ⊂ ALS)
    const auth = await requireAmbulanceCertified(req.service_level as "BLS" | "ALS")(request);
    const updated = await acceptEmergencyRequest(id, auth.cert.id, auth.dbUser.id);

    return Response.json({ request: updated, message: "Emergency assigned" }, { status: 200 });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 409)
      return Response.json({ error: "conflict", message: e.message ?? "conflict" }, { status: 409 });
    if (e.status === 403)
      return Response.json({ error: e.message || "forbidden", message: e.message ?? "Not authorized" }, { status: 403 });
    if (e.status === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (e.status === 404)
      return Response.json({ error: "not_found", message: e.message ?? "Not found" }, { status: 404 });
    logger.error("[emergency/accept POST] error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
