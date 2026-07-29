import { db } from "@/src/db";
import { driverPayoutMethods, drivers, driverWalletTransactions, users } from "@/src/db/schema";
import { eq, and } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { calculateTax, recordTaxLedger } from '@/lib/tax';
import { recordDriverPayout } from '@/lib/accounting';

const instantPaySchema = z.object({
  amount_bdt: z.number().int().positive(),
  method_id: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: "user_not_found" }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id })
      .from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
    if (!driver) return Response.json({ error: "driver_not_found" }, { status: 404 });

    const parsed = await parseJsonBody(request, instantPaySchema);
    if (!parsed.ok) return parsed.response;

    const { amount_bdt, method_id } = parsed.data;

    const [method] = await db.select()
      .from(driverPayoutMethods)
      .where(and(eq(driverPayoutMethods.id, method_id), eq(driverPayoutMethods.driver_id, driver.id), eq(driverPayoutMethods.is_active, true)))
      .limit(1);
    if (!method) return Response.json({ error: "payout_method_not_found" }, { status: 404 });

    await db.transaction(async (tx) => {
      const [d] = await tx.select({ bal: drivers.driver_wallet_balance_bdt })
        .from(drivers).where(eq(drivers.id, driver.id))
        .for("update");

      const currentBalance = d?.bal ?? 0;
      if (currentBalance < amount_bdt) {
        throw Object.assign(new Error("insufficient_balance"), { status: 422 });
      }

      const newBalance = currentBalance - amount_bdt;

      await tx.insert(driverWalletTransactions).values({
        driver_id: driver.id,
        transaction_type: "payout",
        amount_bdt: -amount_bdt,
        balance_after: newBalance,
      });

      await tx.update(drivers)
        .set({ driver_wallet_balance_bdt: newBalance, updated_at: new Date() })
        .where(eq(drivers.id, driver.id));
    });

    // ── Accounting entry (non-blocking) ──────────────────────────────────
    try {
      const payoutRefId = crypto.randomUUID();
      const tax = await calculateTax('source_tax_instant_pay', amount_bdt);
      if (tax.taxRateId) {
        await recordTaxLedger({
          taxRateId: tax.taxRateId, referenceType: 'driver_instant_pay', referenceId: payoutRefId,
          baseAmountPaisa: amount_bdt, taxAmountPaisa: tax.taxAmountPaisa,
          netAmountPaisa: tax.netAmountPaisa, driverId: driver.id,
        });
      }
      await recordDriverPayout({ id: payoutRefId, amountPaisa: amount_bdt });
    } catch (e) { logger.warn('[accounting] payout entry failed', e); }

    return Response.json({ success: true, amount_bdt, method_id }, { status: 200 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (err.status === 422) return Response.json({ error: "insufficient_balance" }, { status: 422 });
    logger.error("[driver/instant-pay] error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
