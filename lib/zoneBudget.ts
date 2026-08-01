import { db } from "@/src/db";
import * as schema from "@/src/db/schema";
import { zoneBudgets, zoneBudgetLogs } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { logger } from "@/lib/logger";
import { nextBdtMidnightUtc } from "@/lib/time";

type Tx = PgTransaction<PostgresJsQueryResultHKT, typeof schema, any>;

interface BudgetCheckResult {
  hasBudget: boolean;
  spentTodayBdt: number;
  budgetBdt: number;
  isPaused: boolean;
}

export async function checkBudget(zoneId: string): Promise<BudgetCheckResult> {
  const [budget] = await db
    .select({
      daily_budget_bdt: zoneBudgets.daily_budget_bdt,
      spent_today_bdt: zoneBudgets.spent_today_bdt,
      is_paused: zoneBudgets.is_paused,
      reset_at: zoneBudgets.reset_at,
      auto_pause_threshold_pct: zoneBudgets.auto_pause_threshold_pct,
    })
    .from(zoneBudgets)
    .where(eq(zoneBudgets.zone_id, zoneId));

  if (!budget) {
    return { hasBudget: true, spentTodayBdt: 0, budgetBdt: 0, isPaused: false };
  }

  const now = new Date();
  let spentTodayBdt = Number(budget.spent_today_bdt ?? 0);
  if (budget.reset_at && now.getTime() >= budget.reset_at.getTime()) {
    spentTodayBdt = 0;
  }

  const budgetBdt = Number(budget.daily_budget_bdt ?? 0);
  if (budgetBdt === 0) {
    return { hasBudget: true, spentTodayBdt: 0, budgetBdt: 0, isPaused: false };
  }

  return {
    hasBudget: spentTodayBdt < budgetBdt,
    spentTodayBdt,
    budgetBdt,
    isPaused: Boolean(budget.is_paused),
  };
}

export async function spendZoneBudget(
  tx: Tx,
  zoneId: string,
  amountBdt: number,
  rideId: string,
): Promise<void> {
  if (amountBdt <= 0) return;

  const [budget] = await tx
    .select({
      id: zoneBudgets.id,
      zone_id: zoneBudgets.zone_id,
      daily_budget_bdt: zoneBudgets.daily_budget_bdt,
      spent_today_bdt: zoneBudgets.spent_today_bdt,
      is_paused: zoneBudgets.is_paused,
      reset_at: zoneBudgets.reset_at,
      auto_pause_threshold_pct: zoneBudgets.auto_pause_threshold_pct,
    })
    .from(zoneBudgets)
    .where(eq(zoneBudgets.zone_id, zoneId))
    .for("update")
    .limit(1);

  if (!budget) return;

  const now = new Date();
  let spentToday = Number(budget.spent_today_bdt ?? 0);

  if (budget.reset_at && now.getTime() >= budget.reset_at.getTime()) {
    spentToday = 0;
    await tx
      .update(zoneBudgets)
      .set({
        spent_today_bdt: 0,
        is_paused: false,
        reset_at: nextBdtMidnightUtc(),
        updated_at: now,
      })
      .where(eq(zoneBudgets.id, budget.id));
    budget.is_paused = false;
    budget.spent_today_bdt = 0;
  } else {
    spentToday = Number(budget.spent_today_bdt ?? 0);
  }

  if (Boolean(budget.is_paused)) {
    logger.warn("[zoneBudget] zone budget is paused", { zoneId, rideId });
    return;
  }

  const budgetBdt = Number(budget.daily_budget_bdt ?? 0);
  if (budgetBdt === 0) return;

  const remaining = budgetBdt - spentToday;
  if (remaining <= 0) {
    logger.warn("[zoneBudget] zone budget exhausted", { zoneId, rideId, budgetBdt, spentToday });
    return;
  }

  const amountToSpend = Math.min(amountBdt, remaining);
  const balanceBefore = spentToday;
  const balanceAfter = spentToday + amountToSpend;

  await tx
    .update(zoneBudgets)
    .set({
      spent_today_bdt: balanceAfter,
      is_paused: balanceAfter >= budgetBdt * (budget.auto_pause_threshold_pct / 100),
      updated_at: now,
    })
    .where(eq(zoneBudgets.id, budget.id));

  await tx.insert(zoneBudgetLogs).values({
    zone_budget_id: budget.id,
    zone_id: zoneId,
    amount_bdt: amountToSpend,
    balance_before_bdt: balanceBefore,
    balance_after_bdt: balanceAfter,
    event: "spend",
    reference_id: rideId,
    reason: "rider_discount_platform_subsidy",
  });

  logger.info("[zoneBudget] budget spent", {
    zoneId,
    rideId,
    amountSpent: amountToSpend,
    balanceBefore,
    balanceAfter,
    budgetBdt,
  });
}

export async function resetAllBudgets(): Promise<void> {
  const now = nextBdtMidnightUtc();
  try {
    let count = 0;
    await db.transaction(async (tx) => {
      const budgets = await tx
        .select({
          id: zoneBudgets.id,
          zone_id: zoneBudgets.zone_id,
          daily_budget_bdt: zoneBudgets.daily_budget_bdt,
          spent_today_bdt: zoneBudgets.spent_today_bdt,
        })
        .from(zoneBudgets);

      count = budgets.length;

      for (const b of budgets) {
        const spent = Number(b.spent_today_bdt ?? 0);
        await tx
          .update(zoneBudgets)
          .set({
            spent_today_bdt: 0,
            is_paused: false,
            reset_at: now,
            updated_at: now,
          })
          .where(eq(zoneBudgets.id, b.id));

        await tx.insert(zoneBudgetLogs).values({
          zone_budget_id: b.id,
          zone_id: b.zone_id,
          amount_bdt: 0,
          balance_before_bdt: spent,
          balance_after_bdt: 0,
          event: "reset",
          reason: "daily_reset",
        });
      }
    });
    logger.info("[zoneBudget] daily reset complete", { count });
  } catch (e) {
    logger.error("[zoneBudget] resetAllBudgets failed", e);
  }
}
