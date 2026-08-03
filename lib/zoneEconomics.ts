import { db } from "../src/db";
import { accountingEntries, accountingEntryLines, accountingAccounts, zones } from "../src/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "./logger";

export interface ZonePnL {
  zoneId: string;
  zoneName: string;
  periodStart: Date;
  periodEnd: Date;
  totalRevenueBdt: number;
  totalSubsidyBdt: number;
  totalCommissionBdt: number;
  totalDriverPayoutBdt: number;
  netPlatformIncomeBdt: number;
  rideCount: number;
  entryCount: number;
}

export async function getZonePnL(
  zoneId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<ZonePnL | null> {
  try {
    const [zone] = await db
      .select({ name: zones.name })
      .from(zones)
      .where(eq(zones.id, zoneId));

    if (!zone) return null;

    const [entryAgg] = await db
      .select({
        entryCount: sql<number>`COUNT(*)`,
        totalDebits: sql<number>`COALESCE(SUM(${accountingEntryLines.debit_bdt}), 0)`,
        totalCredits: sql<number>`COALESCE(SUM(${accountingEntryLines.credit_bdt}), 0)`,
      })
      .from(accountingEntryLines)
      .innerJoin(accountingEntries, eq(accountingEntryLines.entry_id, accountingEntries.id))
      .where(
        and(
          eq(accountingEntries.zone_id, zoneId),
          sql`${accountingEntries.entry_date} >= ${periodStart}`,
          sql`${accountingEntries.entry_date} < ${periodEnd}`,
        ),
      )
      .limit(1);

    const [incomeRow] = await db
      .select({
        totalRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${accountingAccounts.type} = 'income' THEN ${accountingEntryLines.credit_bdt} - ${accountingEntryLines.debit_bdt} ELSE 0 END), 0)`,
        totalSubsidy: sql<number>`COALESCE(SUM(CASE WHEN ${accountingEntries.subsidy_category} IS NOT NULL THEN ${accountingEntryLines.credit_bdt} - ${accountingEntryLines.debit_bdt} ELSE 0 END), 0)`,
      })
      .from(accountingEntryLines)
      .innerJoin(accountingEntries, eq(accountingEntryLines.entry_id, accountingEntries.id))
      .innerJoin(accountingAccounts, eq(accountingEntryLines.account_id, accountingAccounts.id))
      .where(
        and(
          eq(accountingEntries.zone_id, zoneId),
          sql`${accountingEntries.entry_date} >= ${periodStart}`,
          sql`${accountingEntries.entry_date} < ${periodEnd}`,
        ),
      )
      .limit(1);

    const totalRevenue = Number(incomeRow?.totalRevenue ?? 0);
    const totalSubsidy = Number(incomeRow?.totalSubsidy ?? 0);
    const netPlatformIncome = totalRevenue - totalSubsidy;

    const [commissionRow] = await db
      .select({
        totalCommission: sql<number>`COALESCE(SUM(${accountingEntryLines.credit_bdt}), 0)`,
      })
      .from(accountingEntryLines)
      .innerJoin(accountingEntries, eq(accountingEntryLines.entry_id, accountingEntries.id))
      .innerJoin(accountingAccounts, eq(accountingEntryLines.account_id, accountingAccounts.id))
      .where(
        and(
          eq(accountingEntries.zone_id, zoneId),
          sql`${accountingEntries.entry_date} >= ${periodStart}`,
          sql`${accountingEntries.entry_date} < ${periodEnd}`,
          eq(accountingAccounts.code, "3001"),
        ),
      )
      .limit(1);

    const [payoutRow] = await db
      .select({
        totalPayout: sql<number>`COALESCE(SUM(${accountingEntryLines.debit_bdt}), 0)`,
      })
      .from(accountingEntryLines)
      .innerJoin(accountingEntries, eq(accountingEntryLines.entry_id, accountingEntries.id))
      .innerJoin(accountingAccounts, eq(accountingEntryLines.account_id, accountingAccounts.id))
      .where(
        and(
          eq(accountingEntries.zone_id, zoneId),
          sql`${accountingEntries.entry_date} >= ${periodStart}`,
          sql`${accountingEntries.entry_date} < ${periodEnd}`,
          eq(accountingAccounts.code, "4001"),
        ),
      )
      .limit(1);

    const [rideCountRow] = await db
      .select({
        rideCount: sql<number>`COUNT(DISTINCT ${accountingEntries.reference_id})`,
      })
      .from(accountingEntries)
      .where(
        and(
          eq(accountingEntries.zone_id, zoneId),
          sql`${accountingEntries.entry_date} >= ${periodStart}`,
          sql`${accountingEntries.entry_date} < ${periodEnd}`,
          eq(accountingEntries.reference_type, "ride" as any),
        ),
      )
      .limit(1);

    return {
      zoneId,
      zoneName: zone.name,
      periodStart,
      periodEnd,
      totalRevenueBdt: totalRevenue,
      totalSubsidyBdt: totalSubsidy,
      totalCommissionBdt: Number(commissionRow?.totalCommission ?? 0),
      totalDriverPayoutBdt: Number(payoutRow?.totalPayout ?? 0),
      netPlatformIncomeBdt: netPlatformIncome,
      rideCount: Number(rideCountRow?.rideCount ?? 0),
      entryCount: Number(entryAgg?.entryCount ?? 0),
    };
  } catch (e) {
    logger.error("[zoneEconomics] getZonePnL failed", e);
    return null;
  }
}
