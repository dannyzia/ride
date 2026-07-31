import { db } from '@/src/db';
import { taxRates, taxLedgers, dailyTaxSummaries } from '@/src/db/schema';
import { eq, and, between } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export type TaxCode = 'vat_commission' | 'vat_subscription' | 'source_tax_payout';

export interface TaxCalculation {
  baseAmountPaisa: number;
  taxAmountPaisa: number;
  netAmountPaisa: number;
  ratePercent: number;
  taxRateId: string | null;
}

export async function calculateTax(code: TaxCode, baseAmountPaisa: number): Promise<TaxCalculation> {
  const [rate] = await db.select().from(taxRates)
    .where(and(eq(taxRates.code, code), eq(taxRates.is_active, true))).limit(1);
  if (!rate) {
    return { baseAmountPaisa, taxAmountPaisa: 0, netAmountPaisa: baseAmountPaisa, ratePercent: 0, taxRateId: null };
  }
  const ratePercent = parseFloat(rate.rate_percent);
  const taxAmountPaisa = Math.round(baseAmountPaisa * ratePercent / 100);
  const isDeduction = code.startsWith('source_tax');
  const netAmountPaisa = isDeduction ? baseAmountPaisa - taxAmountPaisa : baseAmountPaisa;
  return { baseAmountPaisa, taxAmountPaisa, netAmountPaisa, ratePercent, taxRateId: rate.id };
}

export async function recordTaxLedger(params: {
  taxRateId: string;
  referenceType: 'ride_commission' | 'subscription_sale' | 'driver_payout';
  referenceId: string;
  baseAmountPaisa: number;
  taxAmountPaisa: number;
  netAmountPaisa: number;
  driverId?: string;
  riderId?: string;
  taxDate?: Date;
}) {
  return db.insert(taxLedgers).values({
    tax_rate_id: params.taxRateId,
    reference_type: params.referenceType,
    reference_id: params.referenceId,
    base_amount_bdt: params.baseAmountPaisa,
    tax_amount_bdt: params.taxAmountPaisa,
    net_amount_bdt: params.netAmountPaisa,
    driver_id: params.driverId || null,
    rider_id: params.riderId || null,
    tax_date: params.taxDate || new Date(),
  });
}

export async function getDailyTaxReport(date: Date) {
  const dateStr = date.toISOString().split('T')[0];
  const rows = await db.select().from(dailyTaxSummaries)
    .where(eq(dailyTaxSummaries.summary_date, dateStr)).orderBy(dailyTaxSummaries.tax_code);
  return {
    date: dateStr,
    breakdown: rows,
    totalBaseAmountBdt: rows.reduce((s, r) => s + r.total_base_amount_bdt, 0),
    totalTaxAmountBdt: rows.reduce((s, r) => s + r.total_tax_amount_bdt, 0),
  };
}

export async function getTaxReportRange(startDate: Date, endDate: Date) {
  const rows = await db.select().from(dailyTaxSummaries)
    .where(between(dailyTaxSummaries.summary_date,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]))
    .orderBy(dailyTaxSummaries.summary_date);
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
    rows,
    totalTaxAmountBdt: rows.reduce((s, r) => s + r.total_tax_amount_bdt, 0),
    totalBaseAmountBdt: rows.reduce((s, r) => s + r.total_base_amount_bdt, 0),
    transactionCount: rows.reduce((s, r) => s + r.transaction_count, 0),
  };
}
