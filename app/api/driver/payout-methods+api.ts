import { db } from "@/src/db";
import { driverPayoutMethods, drivers, users } from "@/src/db/schema";
import { eq, and } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import { z } from "zod";

const payoutMethodSchema = z.object({
  method_type: z.string().min(1).max(20),
  account_number: z.string().min(1).max(50),
  account_name: z.string().max(100).optional(),
  bank_name: z.string().max(100).optional(),
  branch_name: z.string().max(100).optional(),
});

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: "user_not_found" }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
    if (!driver) return Response.json({ error: "driver_not_found" }, { status: 404 });

    const methods = await db.select()
      .from(driverPayoutMethods)
      .where(and(eq(driverPayoutMethods.driver_id, driver.id), eq(driverPayoutMethods.is_active, true)))
      .orderBy(driverPayoutMethods.created_at);

    return Response.json({ methods }, { status: 200 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: "unauthorized" }, { status: 401 });
    logger.error("[driver/payout-methods] GET error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: "user_not_found" }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
    if (!driver) return Response.json({ error: "driver_not_found" }, { status: 404 });

    const parsed = await parseJsonBody(request, payoutMethodSchema);
    if (!parsed.ok) return parsed.response;

    const { method_type, account_number, account_name, bank_name, branch_name } = parsed.data;

    await db.insert(driverPayoutMethods).values({
      driver_id: driver.id,
      method_type,
      account_number,
      account_name: account_name ?? null,
      bank_name: bank_name ?? null,
      branch_name: branch_name ?? null,
    });

    return Response.json({ success: true }, { status: 201 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: "unauthorized" }, { status: 401 });
    logger.error("[driver/payout-methods] POST error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: "user_not_found" }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
    if (!driver) return Response.json({ error: "driver_not_found" }, { status: 404 });

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "invalid_uuid" }, { status: 400 });
    if (!z.string().uuid().safeParse(id).success) return Response.json({ error: "invalid_uuid" }, { status: 400 });

    await db.update(driverPayoutMethods)
      .set({ is_active: false, updated_at: new Date() })
      .where(and(eq(driverPayoutMethods.id, id), eq(driverPayoutMethods.driver_id, driver.id)));

    return Response.json({ success: true }, { status: 200 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: "unauthorized" }, { status: 401 });
    logger.error("[driver/payout-methods] DELETE error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
