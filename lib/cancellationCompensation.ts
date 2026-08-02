import { db } from '@/src/db';
import {
  drivers,
  driverWalletTransactions,
  cancellationCredits,
} from '@/src/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

const CREDIT_EXPIRY_DAYS = 30;

export async function createCancellationCredit(
  params: {
    originalDriverId: string;
    cancellationRideId: string;
    amountBdt: number;
  },
): Promise<string> {
  const expiresAt = new Date(Date.now() + CREDIT_EXPIRY_DAYS * 86400_000);

  const creditId = await db.transaction(async (tx) => {
    const [credit] = await tx
      .insert(cancellationCredits)
      .values({
        original_driver_id: params.originalDriverId,
        cancellation_ride_id: params.cancellationRideId,
        amount_bdt: params.amountBdt,
        status: 'pending',
        expires_at: expiresAt,
      })
      .returning();

    if (!credit) throw new Error('cancellation_credit_insert_failed');

    // Atomic increment — avoids read-modify-write race
    await tx
      .update(drivers)
      .set({
        driver_wallet_balance_bdt: sql`${drivers.driver_wallet_balance_bdt} + ${params.amountBdt}`,
        updated_at: new Date(),
      })
      .where(eq(drivers.id, params.originalDriverId));

    await tx.insert(driverWalletTransactions).values({
      driver_id: params.originalDriverId,
      transaction_type: 'cancellation_compensation',
      amount_bdt: params.amountBdt,
      reference_id: credit.id,
      balance_after: sql`(SELECT driver_wallet_balance_bdt FROM drivers WHERE id = ${params.originalDriverId})`,
    });

    logger.info('[cancellation-compensation] credit created', {
      originalDriverId: params.originalDriverId,
      cancellationRideId: params.cancellationRideId,
      amountBdt: params.amountBdt,
      creditId: credit.id,
    });

    return credit.id;
  });

  return creditId;
}

export async function expireCancellationCredits(): Promise<number> {
  const now = new Date();

  return await db.transaction(async (tx) => {
    const expired = await tx
      .select({
        id: cancellationCredits.id,
        amount_bdt: cancellationCredits.amount_bdt,
        original_driver_id: cancellationCredits.original_driver_id,
      })
      .from(cancellationCredits)
      .where(
        and(
          eq(cancellationCredits.status, 'pending'),
          sql`${cancellationCredits.expires_at} < ${now}`,
        ),
      )
      .for('update');

    for (const row of expired) {
      // SELECT FOR UPDATE on driver row before wallet adjustment
      await tx
        .select({ balance: drivers.driver_wallet_balance_bdt })
        .from(drivers)
        .where(eq(drivers.id, row.original_driver_id))
        .for('update');

      await tx
        .update(drivers)
        .set({
          driver_wallet_balance_bdt: sql`${drivers.driver_wallet_balance_bdt} - ${row.amount_bdt}`,
          updated_at: new Date(),
        })
        .where(eq(drivers.id, row.original_driver_id));

      await tx.insert(driverWalletTransactions).values({
        driver_id: row.original_driver_id,
        transaction_type: 'adjustment',
        amount_bdt: -row.amount_bdt,
        reference_id: row.id,
        balance_after: sql`(SELECT driver_wallet_balance_bdt FROM drivers WHERE id = ${row.original_driver_id})`,
      });

      logger.info('[cancellation-compensation] credit expired and reversed', {
        creditId: row.id,
        amountBdt: row.amount_bdt,
        driverId: row.original_driver_id,
      });
    }

    // Update all expired rows in a single atomic statement
    await tx
      .update(cancellationCredits)
      .set({ status: 'expired' })
      .where(
        and(
          eq(cancellationCredits.status, 'pending'),
          sql`${cancellationCredits.expires_at} < ${now}`,
        ),
      );

    if (expired.length > 0) {
      logger.info('[cancellation-compensation] expired credits', {
        count: expired.length,
      });
    }

    return expired.length;
  });
}
