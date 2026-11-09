// POST /api/fleet/packages/purchase — fleet operator buys a package postpaid.
// Thin route: identity + eligibility here, everything money-shaped in
// lib/operatorPurchase.purchaseOperatorPackage.
import { z } from "zod";
import { db } from "@/src/db";
import { packages, users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import {
  hasActiveOperatorRole,
  purchaseOperatorPackage,
  resolveOperatorIdentity,
  OperatorPurchaseError,
} from "@/lib/operatorPurchase";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

const purchaseSchema = z.object({ package_id: z.string().uuid() }).strict();

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!user) {
      return Response.json({ error: "user_not_found", message: "User not found" }, { status: 404 });
    }

    if (!(await hasActiveOperatorRole("fleet", user.id))) {
      return Response.json(
        { error: "role_not_eligible", message: "An active fleet role is required" },
        { status: 403 },
      );
    }

    const parsed = await parseJsonBody(request, purchaseSchema);
    if (!parsed.ok) return parsed.response;

    const operatorId = await resolveOperatorIdentity("fleet", user.id);
    if (!operatorId) {
      return Response.json(
        { error: "operator_not_found", message: "No fleet is associated with this account" },
        { status: 404 },
      );
    }

    const [pkg] = await db
      .select()
      .from(packages)
      .where(eq(packages.id, parsed.data.package_id))
      .limit(1);
    if (!pkg || !pkg.is_active) {
      return Response.json(
        { error: "package_not_found", message: "Package not found or inactive" },
        { status: 422 },
      );
    }

    const result = await purchaseOperatorPackage({ operatorRole: "fleet", operatorId, pkg });
    return Response.json({
      payment_url: null,
      payment_event_id: null,
      mode: "operator_package",
      activated: true,
      operator_role: result.operatorRole,
      operator_id: result.operatorId,
      package_id: result.packageId,
      grant: result.grant,
      bill: result.bill,
    });
  } catch (e: unknown) {
    if (errors.getErrorStatus(e) === 401) {
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    }
    if (e instanceof OperatorPurchaseError) {
      // Batch-2 Item 10 §3: a fleet package carrying a commission rate is a
      // VALIDATION failure (the shape is wrong), not a billing conflict — 422,
      // matching this route's package_not_found. Everything else stays 409.
      return Response.json(
        { error: e.code, message: e.message, ...e.details },
        { status: e.code === "fleet_commission_unsupported" ? 422 : 409 },
      );
    }
    logger.error("[fleet/packages/purchase] error", e);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
