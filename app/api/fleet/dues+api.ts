// GET  /api/fleet/dues — the fleet operator's statement (Batch-2 Item 7).
// POST /api/fleet/dues — start a full-bill PortPos settlement of that bill.
//
// Same core as the shop/delivery routes (lib/operatorSettlement).
import { z } from "zod";
import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { isConfigured } from "@/lib/portpos";
import { getPlan05Bool } from "@/lib/platformConfig";
import { hasActiveOperatorRole, resolveOperatorIdentity } from "@/lib/operatorPurchase";
import {
  getOperatorStatement,
  initiateOperatorSettlement,
  OperatorSettlementError,
} from "@/lib/operatorSettlement";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

const settlementSchema = z
  .object({ bill_kind: z.enum(["subscription_purchase", "usage"]).optional() })
  .strict();

async function resolveFleet(request: Request): Promise<
  | { ok: true; operatorId: string; user: { id: string; name: string | null; email: string | null; phone: string | null } }
  | { ok: false; response: Response }
> {
  const supabaseUser = await verifySupabaseToken(request);

  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
    .from(users)
    .where(eq(users.auth_uid, supabaseUser.id))
    .limit(1);
  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "user_not_found", message: "User not found" }, { status: 404 }),
    };
  }

  if (!(await hasActiveOperatorRole("fleet", user.id))) {
    return {
      ok: false,
      response: Response.json(
        { error: "role_not_eligible", message: "An active fleet role is required" },
        { status: 403 },
      ),
    };
  }

  const operatorId = await resolveOperatorIdentity("fleet", user.id);
  if (!operatorId) {
    return {
      ok: false,
      response: Response.json(
        { error: "operator_not_found", message: "No fleet is associated with this account" },
        { status: 404 },
      ),
    };
  }

  return { ok: true, operatorId, user };
}

export async function GET(request: Request) {
  try {
    const resolved = await resolveFleet(request);
    if (!resolved.ok) return resolved.response;

    return Response.json(await getOperatorStatement("fleet", resolved.operatorId));
  } catch (e: unknown) {
    if (errors.getErrorStatus(e) === 401) {
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    }
    logger.error("[fleet/dues] statement error", e);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!isConfigured()) {
      return Response.json(
        { error: "payment_not_configured", message: "PortPos payment gateway is not configured" },
        { status: 503 },
      );
    }

    const resolved = await resolveFleet(request);
    if (!resolved.ok) return resolved.response;

    // D9-2: money-movement master switch (mirrors every other PortPos route).
    if (!(await getPlan05Bool("payments_enabled"))) {
      return Response.json(
        { error: "payments_not_enabled", message: "Payments launch later — dues settlement is not live yet" },
        { status: 409 },
      );
    }

    // Optional target kind: the package purchase bill or the aggregated
    // usage/commission receivable (Batch-2 Item 8). Omitted → whichever is
    // outstanding, so commission dues are payable even when no package bill
    // exists (the two slots are settled one at a time).
    const parsed = await parseJsonBody(request, settlementSchema);
    if (!parsed.ok) return parsed.response;

    const settlement = await initiateOperatorSettlement({
      billKind: parsed.data.bill_kind,
      operatorRole: "fleet",
      operatorId: resolved.operatorId,
      userId: resolved.user.id,
      customer: {
        name: resolved.user.name,
        email: resolved.user.email,
        phone: resolved.user.phone,
      },
      serverUrl: process.env.EXPO_PUBLIC_SERVER_URL ?? "",
    });

    return Response.json({
      payment_url: settlement.payment_url,
      payment_event_id: settlement.payment_event_id,
      amount_bdt: settlement.amountBdt,
      purpose: "subscription_settlement",
      bill_id: settlement.billId,
      bill_kind: settlement.bill_kind,
      bill_ids: settlement.bill_ids,
    });
  } catch (e: unknown) {
    if (errors.getErrorStatus(e) === 401) {
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    }
    if (e instanceof OperatorSettlementError) {
      return Response.json({ error: e.code, message: e.message }, { status: e.status });
    }
    logger.error("[fleet/dues] settlement error", e);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
