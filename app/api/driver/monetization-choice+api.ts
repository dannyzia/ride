// [auth-required] POST /api/driver/monetization-choice
// Item 24 / Item 28: Driver onboarding monetization choice (call_package vs commission)
import { z } from "zod";
import { db } from "@/src/db";
import { drivers, users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { getRevenueModel } from "@/lib/platformConfig";
import {
  ensureCommissionPackage,
  enrollCommission,
  endActiveEnrollment,
  AlreadyEnrolledCommissionError,
} from "@/lib/monetizationMode";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

const choiceSchema = z
  .object({
    product_type: z.enum(["call_package", "commission"]),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!user) return Response.json({ error: "user_not_found", message: "User not found" }, { status: 404 });

    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);
    if (!driver) return Response.json({ error: "driver_not_found", message: "Driver not found" }, { status: 404 });

    const parsed = await parseJsonBody(request, choiceSchema);
    if (!parsed.ok) return parsed.response;
    const { product_type } = parsed.data;

    const revenueModel = await getRevenueModel();
    // In subscription_only (OFF mode), drivers only hold call packages.
    if (revenueModel !== "hybrid") {
      return Response.json({ ok: true, choice: "call_package", note: "revenue_model_not_hybrid" });
    }

    if (product_type === "commission") {
      await db.transaction(async (tx) => {
        const pkgId = await ensureCommissionPackage(tx);
        try {
          await enrollCommission(tx, { driverId: driver.id, packageId: pkgId });
        } catch (err) {
          if (!(err instanceof AlreadyEnrolledCommissionError)) throw err;
        }
      });
    } else {
      await db.transaction(async (tx) => {
        await endActiveEnrollment(tx, { driverId: driver.id });
      });
    }

    return Response.json({ ok: true, choice: product_type });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    logger.error("[driver/monetization-choice] error", err);
    return Response.json({ error: "internal_error", message: "Failed to record monetization choice" }, { status: 500 });
  }
}

