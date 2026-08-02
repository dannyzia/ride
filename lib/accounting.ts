import { db } from '@/src/db';
import * as schema from '@/src/db/schema';
import { accountingAccounts, accountingEntries, accountingEntryLines } from '@/src/db/schema';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { calculateTax, recordTaxLedger } from './tax';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';

type Tx = PgTransaction<PostgresJsQueryResultHKT, typeof schema, any>;
type DbOrTx = typeof db | Tx;

const ACCOUNT_CODES = {
  CASH_BANK: '1001', AR_RIDERS: '1002', AR_DRIVERS: '1003',
  VAT_PAYABLE: '2001', SOURCE_TAX_PAYABLE: '2002',
  DRIVER_WALLET_LIABILITY: '2003', RIDER_WALLET_LIABILITY: '2004',
  DRIVER_PAYOUTS_PAYABLE: '2005',
  COMMISSION_INCOME: '3001', SUBSCRIPTION_INCOME: '3002', RIDE_FARE_INCOME: '3003',
  DRIVER_PAYOUT_EXPENSE: '4001', PAYMENT_GATEWAY_FEES: '4002', SOURCE_TAX_EXPENSE: '4003',
} as const;

let accountCache: Map<string, string> | null = null;

export function invalidateAccountCache(): void {
  accountCache = null;
}

async function getAccountId(code: string, client: DbOrTx = db): Promise<string> {
  if (!accountCache) {
    const all = await client.select().from(accountingAccounts);
    accountCache = new Map(all.map(a => [a.code, a.id]));
  }
  const id = accountCache.get(code);
  if (!id) throw new Error(`Account ${code} not found`);
  return id;
}

interface JournalLine { accountCode: string; debit?: number; credit?: number; description?: string; }

interface JournalEntryParams {
  referenceType: string; referenceId?: string; entryDate: Date;
  description: string; notes?: string; lines: JournalLine[];
  createdBy?: string; zoneId?: string;
}

async function createJournalEntryInTx(client: DbOrTx, params: JournalEntryParams) {
  const totalDebit = params.lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = params.lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001)
    throw new Error(`Journal unbalanced: Dr ${totalDebit} ≠ Cr ${totalCredit}`);

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const [last] = await client.select({ count: sql<number>`count(*)` })
    .from(accountingEntries).where(sql`entry_number LIKE ${`JV-${today}-%`}`);
  const entryNumber = `JV-${today}-${((last?.count || 0) + 1).toString().padStart(4, '0')}`;

  const [entry] = await client.insert(accountingEntries).values({
    entry_number: entryNumber, reference_type: params.referenceType as any, reference_id: params.referenceId,
    entry_date: params.entryDate, description: params.description, notes: params.notes,
    created_by: params.createdBy, zone_id: params.zoneId,
  }).returning();

  for (const line of params.lines) {
    const accountId = await getAccountId(line.accountCode, client);
    await client.insert(accountingEntryLines).values({
      entry_id: entry.id, account_id: accountId,
      debit_bdt: line.debit || 0, credit_bdt: line.credit || 0,
      description: line.description || params.description,
    });
  }
  return entry;
}

export async function createJournalEntry(params: JournalEntryParams) {
  return db.transaction(async (tx) => {
    return createJournalEntryInTx(tx, params);
  });
}

export async function validateAccountCodes(): Promise<void> {
  const codes = Object.values(ACCOUNT_CODES);
  const all = await db.select({ code: accountingAccounts.code }).from(accountingAccounts);
  const existing = new Set(all.map(a => a.code));
  const missing = codes.filter(c => !existing.has(c));
  if (missing.length > 0) {
    logger.error('[accounting] missing account codes at startup', { missing });
    throw new Error(`Missing account codes: ${missing.join(', ')}`);
  }
  invalidateAccountCache();
  logger.info('[accounting] account codes validated', { count: codes.length });
}

export async function recordRideCompletion(ride: {
  id: string; finalFarePaisa: number; commissionPct: number;
  driverId: string; riderId: string; zoneId?: string;
}) {
  const fare = ride.finalFarePaisa;
  const commission = Math.floor(fare * ride.commissionPct / 100);
  const driverShare = fare - commission;

  const vat = await calculateTax('vat_commission', commission);
  const sourceTax = await calculateTax('source_tax_payout', driverShare);

  return db.transaction(async (tx) => {
    if (vat.taxRateId) {
      await recordTaxLedger({
        taxRateId: vat.taxRateId, referenceType: 'ride_commission', referenceId: ride.id,
        baseAmountPaisa: commission, taxAmountPaisa: vat.taxAmountPaisa, netAmountPaisa: vat.netAmountPaisa,
        driverId: ride.driverId, riderId: ride.riderId,
      }, tx);
    }
    if (sourceTax.taxRateId) {
      await recordTaxLedger({
        taxRateId: sourceTax.taxRateId, referenceType: 'driver_payout', referenceId: ride.id,
        baseAmountPaisa: driverShare, taxAmountPaisa: sourceTax.taxAmountPaisa, netAmountPaisa: sourceTax.netAmountPaisa,
        driverId: ride.driverId,
      }, tx);
    }

    await createJournalEntryInTx(tx, {
      referenceType: 'ride', referenceId: ride.id, entryDate: new Date(),
      description: `Ride ${ride.id} — Fare ৳${fare/100}, Commission ৳${commission/100}`,
      zoneId: ride.zoneId,
      lines: [
        { accountCode: ACCOUNT_CODES.CASH_BANK, debit: fare },
        { accountCode: ACCOUNT_CODES.COMMISSION_INCOME, credit: commission - vat.taxAmountPaisa },
        { accountCode: ACCOUNT_CODES.VAT_PAYABLE, credit: vat.taxAmountPaisa },
        { accountCode: ACCOUNT_CODES.DRIVER_PAYOUTS_PAYABLE, credit: driverShare - sourceTax.taxAmountPaisa },
        { accountCode: ACCOUNT_CODES.SOURCE_TAX_PAYABLE, credit: sourceTax.taxAmountPaisa },
      ],
    });
  });
}

export async function recordDriverPayout(payout: { id: string; amountPaisa: number; }) {
  const sourceTax = await calculateTax('source_tax_payout', payout.amountPaisa);
  return db.transaction(async (tx) => {
    if (sourceTax.taxRateId) {
      await recordTaxLedger({
        taxRateId: sourceTax.taxRateId, referenceType: 'driver_payout', referenceId: payout.id,
        baseAmountPaisa: payout.amountPaisa, taxAmountPaisa: sourceTax.taxAmountPaisa, netAmountPaisa: sourceTax.netAmountPaisa,
      }, tx);
    }
    await createJournalEntryInTx(tx, {
      referenceType: 'driver_payout', referenceId: payout.id, entryDate: new Date(),
      description: `Driver payout — ৳${payout.amountPaisa/100}`,
      lines: [
        { accountCode: ACCOUNT_CODES.DRIVER_PAYOUTS_PAYABLE, debit: sourceTax.netAmountPaisa },
        { accountCode: ACCOUNT_CODES.CASH_BANK, credit: sourceTax.netAmountPaisa },
        { accountCode: ACCOUNT_CODES.SOURCE_TAX_PAYABLE, debit: sourceTax.taxAmountPaisa },
        { accountCode: ACCOUNT_CODES.CASH_BANK, credit: sourceTax.taxAmountPaisa },
      ],
    });
  });
}

export async function recordSubscriptionSale(sub: { id: string; driverId: string; amountPaisa: number; zoneId?: string; }) {
  const vat = await calculateTax('vat_subscription', sub.amountPaisa);
  return db.transaction(async (tx) => {
    if (vat.taxRateId) {
      await recordTaxLedger({
        taxRateId: vat.taxRateId, referenceType: 'subscription_sale', referenceId: sub.id,
        baseAmountPaisa: sub.amountPaisa, taxAmountPaisa: vat.taxAmountPaisa, netAmountPaisa: vat.netAmountPaisa,
        driverId: sub.driverId,
      }, tx);
    }
    await createJournalEntryInTx(tx, {
      referenceType: 'subscription', referenceId: sub.id, entryDate: new Date(),
      description: `Subscription sale — ৳${sub.amountPaisa/100}`,
      zoneId: sub.zoneId,
      lines: [
        { accountCode: ACCOUNT_CODES.CASH_BANK, debit: sub.amountPaisa },
        { accountCode: ACCOUNT_CODES.SUBSCRIPTION_INCOME, credit: sub.amountPaisa - vat.taxAmountPaisa },
        { accountCode: ACCOUNT_CODES.VAT_PAYABLE, credit: vat.taxAmountPaisa },
      ],
    });
  });
}

export async function recordWalletTopup(params: {
  userId: string; amountPaisa: number; isDriver: boolean; paymentEventId: string;
}) {
  await createJournalEntry({
    referenceType: 'wallet_topup', referenceId: params.paymentEventId, entryDate: new Date(),
    description: `Wallet top-up — ৳${params.amountPaisa/100}`,
    lines: [
      { accountCode: ACCOUNT_CODES.CASH_BANK, debit: params.amountPaisa },
      { accountCode: params.isDriver ? ACCOUNT_CODES.DRIVER_WALLET_LIABILITY : ACCOUNT_CODES.RIDER_WALLET_LIABILITY,
        credit: params.amountPaisa },
    ],
  });
}

export async function recordCancellationFee(ride: { id: string; feePaisa: number; riderId: string; zoneId?: string; }) {
  if (ride.feePaisa <= 0) return;
  await createJournalEntry({
    referenceType: 'cancellation_fee', referenceId: ride.id, entryDate: new Date(),
    description: `Cancellation fee — ৳${ride.feePaisa/100}`,
    zoneId: ride.zoneId,
    lines: [
      { accountCode: ACCOUNT_CODES.CASH_BANK, debit: ride.feePaisa },
      { accountCode: ACCOUNT_CODES.RIDE_FARE_INCOME, credit: ride.feePaisa },
    ],
  });
}

export async function recordTip(ride: { id: string; tipPaisa: number; driverId: string; zoneId?: string; }) {
  if (ride.tipPaisa <= 0) return;
  await createJournalEntry({
    referenceType: 'tip', referenceId: ride.id, entryDate: new Date(),
    description: `Tip — ৳${ride.tipPaisa/100}`,
    zoneId: ride.zoneId,
    lines: [
      { accountCode: ACCOUNT_CODES.CASH_BANK, debit: ride.tipPaisa },
      { accountCode: ACCOUNT_CODES.DRIVER_PAYOUTS_PAYABLE, credit: ride.tipPaisa },
    ],
  });
}

export async function recordRiderPassPurchase(params: {
  subscriptionId: string; amountPaisa: number; riderId: string; paymentEventId: string;
}) {
  await createJournalEntry({
    referenceType: 'rider_pass', referenceId: params.subscriptionId, entryDate: new Date(),
    description: `Rider pass purchase — ৳${params.amountPaisa/100}`,
    lines: [
      { accountCode: ACCOUNT_CODES.CASH_BANK, debit: params.amountPaisa },
      { accountCode: ACCOUNT_CODES.RIDER_WALLET_LIABILITY, credit: params.amountPaisa },
    ],
  });
}
