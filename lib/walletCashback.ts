import { db } from "@/src/db";
import * as schema from "@/src/db/schema";
import { users, riderWalletTransactions, systemConfig, riderFeeDeductions } from "@/src/db/schema";
import { eq, and, sql, asc } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { logger } from "@/lib/logger";

type Tx = PgTransaction<PostgresJsQueryResultHKT, typeof schema, any>;

interface CashbackConfig {
  cashback_percent: number;
  cashback_monthly_cap_bdt: number;
  cashback_expiry_days: number;
}

const DEFAULT_CONFIG: CashbackConfig = {
  cashback_percent: 5,
  cashback_monthly_cap_bdt: 50000,
  cashback_expiry_days: 90,
};

let cachedConfig: CashbackConfig | null = null;
let cachedAt: number = 0;
const CACHE_TTL_MS = 60_000;

async function getConfig(): Promise<CashbackConfig> {
  const now = Date.now();
  if (cachedConfig && now - cachedAt < CACHE_TTL_MS) {
    return cachedConfig;
  }
  cachedConfig = { ...DEFAULT_CONFIG };
  try {
    const rows = await db
      .select({ key: systemConfig.key, value: systemConfig.value })
      .from(systemConfig)
      .where(
        and(
          eq(systemConfig.key, "cashback_percent"),
        ),
      );
    const percentRow = rows.find((r) => r.key === "cashback_percent");
    if (percentRow) cachedConfig.cashback_percent = parseInt(percentRow.value, 10) || 5;

    const capRows = await db
      .select({ key: systemConfig.key, value: systemConfig.value })
      .from(systemConfig)
      .where(eq(systemConfig.key, "cashback_monthly_cap_bdt"));
    const capRow = capRows.find((r) => r.key === "cashback_monthly_cap_bdt");
    if (capRow) cachedConfig.cashback_monthly_cap_bdt = parseInt(capRow.value, 10) || 50000;

    const expiryRows = await db
      .select({ key: systemConfig.key, value: systemConfig.value })
      .from(systemConfig)
      .where(eq(systemConfig.key, "cashback_expiry_days"));
    const expiryRow = expiryRows.find((r) => r.key === "cashback_expiry_days");
    if (expiryRow) cachedConfig.cashback_expiry_days = parseInt(expiryRow.value, 10) || 90;
  } catch (e) {
    logger.warn("[walletCashback] failed to load config, using defaults", e);
  }
  cachedAt = now;
  return cachedConfig;
}

export function clearConfigCache() {
  cachedConfig = null;
  cachedAt = 0;
}

export async function earnCashback(
  tx: Tx,
  rideId: string,
  riderId: string,
  discountedFareBdt: number,
): Promise<number> {
  const config = await getConfig();
  const cashbackBdt = Math.round((discountedFareBdt * config.cashback_percent) / 100);
  if (cashbackBdt <= 0) return 0;

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const endOfMonth = new Date(startOfMonth);
  endOfMonth.setUTCMonth(endOfMonth.getUTCMonth() + 1);

  const [{ earned }] = await tx
    .select({
      earned: sql<number>`COALESCE(SUM(${riderWalletTransactions.amount_bdt}), 0)`,
    })
    .from(riderWalletTransactions)
    .where(
      and(
        eq(riderWalletTransactions.rider_id, riderId),
        sql`${riderWalletTransactions.transaction_type} = 'cashback_earn'`,
        sql`${riderWalletTransactions.created_at} >= ${startOfMonth}`,
        sql`${riderWalletTransactions.created_at} < ${endOfMonth}`,
      ),
    );

  const alreadyEarned = Number(earned ?? 0);
  const remainingCap = config.cashback_monthly_cap_bdt - alreadyEarned;
  const finalCashback = Math.max(0, Math.min(cashbackBdt, remainingCap));
  if (finalCashback <= 0) {
    logger.info("[walletCashback] cashback skipped (monthly cap reached)", {
      rideId,
      riderId,
      alreadyEarned,
      cap: config.cashback_monthly_cap_bdt,
    });
    return 0;
  }

  // ── Deduct from pending rider fee deductions (oldest first) ───────────
  const now = new Date();
  const pendingDeductions = await tx
    .select({
      id: riderFeeDeductions.id,
      remaining_amount_bdt: riderFeeDeductions.remaining_amount_bdt,
    })
    .from(riderFeeDeductions)
    .where(
      and(
        eq(riderFeeDeductions.rider_id, riderId),
        sql`${riderFeeDeductions.status} IN ('pending', 'partially_collected')`,
        sql`${riderFeeDeductions.expires_at} > ${now}`,
      ),
    )
    .orderBy(asc(riderFeeDeductions.created_at));

  let cashbackRemaining = finalCashback;

  for (const deduction of pendingDeductions) {
    if (cashbackRemaining <= 0) break;
    const deductionAmount = Math.min(cashbackRemaining, deduction.remaining_amount_bdt);
    cashbackRemaining -= deductionAmount;

    const newRemaining = deduction.remaining_amount_bdt - deductionAmount;
    const newStatus = newRemaining === 0 ? 'collected' : 'partially_collected';

    await tx
      .update(riderFeeDeductions)
      .set({
        remaining_amount_bdt: newRemaining,
        status: newStatus as any,
        updated_at: new Date(),
      })
      .where(eq(riderFeeDeductions.id, deduction.id));

    logger.info("[walletCashback] cashback applied to cancellation fee", {
      deductionId: deduction.id,
      rideId,
      deductionAmount,
      newRemaining,
    });
  }

  if (cashbackRemaining < finalCashback) {
    logger.info("[walletCashback] cashback partially consumed by fee deductions", {
      riderId,
      deducted: finalCashback - cashbackRemaining,
      remaining: cashbackRemaining,
    });
  }

  // Only credit remaining cashback to wallet
  const creditAmount = cashbackRemaining;
  if (creditAmount <= 0) {
    logger.info("[walletCashback] all cashback consumed by fee deductions", { riderId, rideId });
    return finalCashback;
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.cashback_expiry_days);

  await tx
    .update(users)
    .set({
      rider_wallet_balance_bdt: sql`${users.rider_wallet_balance_bdt} + ${creditAmount}`,
    })
    .where(eq(users.id, riderId));

  await tx.insert(riderWalletTransactions).values({
    rider_id: riderId,
    transaction_type: "cashback_earn",
    amount_bdt: creditAmount,
    reference_id: rideId,
    balance_after: sql`(SELECT rider_wallet_balance_bdt FROM users WHERE id = ${riderId})`,
    expires_at: expiresAt,
  });

  logger.info("[walletCashback] cashback earned", {
    rideId,
    riderId,
    cashbackBdt: creditAmount,
    deductedFromFees: finalCashback - creditAmount,
  });

  return finalCashback;
}

// TODO: This function is currently dead code — wallet redemption is debited at
// completion time (complete+api.ts), not at request time. Cancellation only
// applies to pre-completion rides where no debit has occurred. If wallet
// redemption moves to request time in the future, this should be called from
// cancel+api.ts and refactored to insert a new reversal row rather than
// mutating existing ledger entries (bad audit practice).
export async function reverseRedemption(
  tx: Tx,
  rideId: string,
): Promise<void> {
  const [{ redeemed }] = await tx
    .select({
      redeemed: sql<number>`COALESCE(SUM(${riderWalletTransactions.amount_bdt}), 0)`,
    })
    .from(riderWalletTransactions)
    .where(
      and(
        eq(riderWalletTransactions.reference_id, rideId),
        sql`${riderWalletTransactions.transaction_type} = 'cashback_redeem'`,
      ),
    );

  const totalRedeemed = Number(redeemed ?? 0);
  if (totalRedeemed === 0) return;

  const [txn] = await tx
    .select({ rider_id: riderWalletTransactions.rider_id })
    .from(riderWalletTransactions)
    .where(
      and(
        eq(riderWalletTransactions.reference_id, rideId),
        sql`${riderWalletTransactions.transaction_type} = 'cashback_redeem'`,
      ),
    )
    .limit(1);

  if (!txn) return;

  await tx
    .update(users)
    .set({
      rider_wallet_balance_bdt: sql`${users.rider_wallet_balance_bdt} - (${totalRedeemed})`,
    })
    .where(eq(users.id, txn.rider_id));

  await tx
    .update(riderWalletTransactions)
    .set({
      amount_bdt: sql`${riderWalletTransactions.amount_bdt} * -1`,
      transaction_type: "cashback_redeem",
    })
    .where(
      and(
        eq(riderWalletTransactions.reference_id, rideId),
        sql`${riderWalletTransactions.transaction_type} = 'cashback_redeem'`,
      ),
    );

  logger.info("[walletCashback] wallet redemption reversed", {
    rideId,
    amountReversed: totalRedeemed,
    riderId: txn.rider_id,
  });
}

export async function expireCredits(): Promise<void> {
  const expiredAt = new Date();
  try {
    const result = await db.transaction(async (tx) => {
      const expired = await tx
        .select({
          id: riderWalletTransactions.id,
          rider_id: riderWalletTransactions.rider_id,
          amount_bdt: riderWalletTransactions.amount_bdt,
        })
        .from(riderWalletTransactions)
        .where(
          and(
            sql`${riderWalletTransactions.transaction_type} = 'cashback_earn'`,
            sql`${riderWalletTransactions.expires_at} <= ${expiredAt}`,
          ),
        );

      for (const row of expired) {
        await tx
          .update(users)
          .set({
            rider_wallet_balance_bdt: sql`${users.rider_wallet_balance_bdt} - ${row.amount_bdt}`,
          })
          .where(eq(users.id, row.rider_id));

        await tx.insert(riderWalletTransactions).values({
          rider_id: row.rider_id,
          transaction_type: "cashback_expire",
          amount_bdt: -row.amount_bdt,
          reference_id: row.id,
          balance_after: sql`(SELECT rider_wallet_balance_bdt FROM users WHERE id = ${row.rider_id})`,
        });
      }

      return expired.length;
    });

    if (result > 0) {
      logger.info("[walletCashback] expired cashback credits", { count: result });
    }
  } catch (e) {
    logger.error("[walletCashback] expireCredits failed", e);
  }
}

export async function expireRiderFeeDeductions(): Promise<number> {
  const now = new Date();
  try {
    const result = await db.transaction(async (tx) => {
      const pending = await tx
        .select({
          id: riderFeeDeductions.id,
          rider_id: riderFeeDeductions.rider_id,
          remaining_amount_bdt: riderFeeDeductions.remaining_amount_bdt,
        })
        .from(riderFeeDeductions)
        .where(
          and(
            sql`${riderFeeDeductions.status} IN ('pending', 'partially_collected')`,
            sql`${riderFeeDeductions.expires_at} <= ${now}`,
          ),
        )
        .for('update');

      for (const row of pending) {
        await tx
          .update(riderFeeDeductions)
          .set({
            status: 'expired' as any,
            remaining_amount_bdt: 0,
            updated_at: new Date(),
          })
          .where(eq(riderFeeDeductions.id, row.id));

        logger.info("[walletCashback] rider fee deduction expired, amount forgiven", {
          deductionId: row.id,
          riderId: row.rider_id,
          forgivenAmount: row.remaining_amount_bdt,
        });
      }

      return pending.length;
    });

    if (result > 0) {
      logger.info("[walletCashback] expired rider fee deductions", { count: result });
    }
    return result;
  } catch (e) {
    logger.error("[walletCashback] expireRiderFeeDeductions failed", e);
    return 0;
  }
}
