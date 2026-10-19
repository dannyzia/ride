import { and, eq, inArray, sql, sum } from "drizzle-orm";
import { db } from "@/src/db";
import {
  courierRemittanceDues,
  drivers,
  riderAddresses,
  rides,
  shopLedger,
  shops,
  users,
} from "@/src/db/schema";

/** DB tx handle type (same shape leadBilling uses). */
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type DuesKind = "driver_commission" | "courier_remittance" | "shop_settlement";

export interface DuesFailure {
  kind: DuesKind;
  amount_bdt: number;
}

/**
 * C2-4 (STAGE C2-FIX) — phone tombstone.
 *
 * `users.phone` is varchar(20) NOT NULL UNIQUE, so the tombstone must fit 20
 * chars AND stay unique per account: `deleted:` (8) + the first 12 hex chars
 * of the row id (dashes stripped). The order's literal `deleted: + id` cannot
 * fit a 36-char uuid into varchar(20); the 12-hex suffix (48 bits) keeps the
 * prefix the order names while staying unique and idempotent (same row →
 * same tombstone, so a second delete never hits the 23505 class).
 */
export function tombstonePhone(id: string): string {
  return `deleted:${id.replace(/-/g, "").slice(0, 12)}`;
}

/**
 * DUES-ZERO precondition: driver commission dues, courier COD remittance and
 * owned-shop settlement balances must ALL be zero before the account can be
 * deleted. Returns the first outstanding due, or null when deletion may
 * proceed. Runs inside the caller's transaction.
 */
export async function checkDeleteDues(tx: DbTx, userId: string): Promise<DuesFailure | null> {
  const [driver] = await tx
    .select({ id: drivers.id })
    .from(drivers)
    .where(eq(drivers.user_id, userId))
    .limit(1);
  if (driver) {
    const [row] = await tx
      .select({ total: sql<number>`COALESCE(SUM(${rides.platform_commission_bdt}), 0)` })
      .from(rides)
      .where(and(eq(rides.driver_id, driver.id), eq(rides.status, "completed")));
    if (Number(row?.total ?? 0) > 0) {
      return { kind: "driver_commission", amount_bdt: Number(row?.total ?? 0) };
    }
  }

  const [remit] = await tx
    .select({ total: sql<number>`COALESCE(SUM(${courierRemittanceDues.amount_bdt}), 0)` })
    .from(courierRemittanceDues)
    .where(
      and(
        eq(courierRemittanceDues.delivery_man_user_id, userId),
        eq(courierRemittanceDues.status, "pending"),
      ),
    );
  if (Number(remit?.total ?? 0) > 0) {
    return { kind: "courier_remittance", amount_bdt: Number(remit?.total ?? 0) };
  }

  const owned = await tx
    .select({ id: shops.id })
    .from(shops)
    .where(eq(shops.owner_user_id, userId));
  if (owned.length > 0) {
    const [bal] = await tx
      .select({ balance: sum(shopLedger.amount_bdt) })
      .from(shopLedger)
      .where(
        inArray(
          shopLedger.shop_id,
          owned.map((s) => s.id),
        ),
      );
    if (Number(bal?.balance ?? 0) !== 0) {
      return { kind: "shop_settlement", amount_bdt: Number(bal?.balance ?? 0) };
    }
  }

  return null;
}

/**
 * PII scrub + tombstone + deleted_at inside the caller's transaction. Also
 * scrubs the address PII the delete-data flow owned (rider_addresses +
 * ride endpoints), so the two surfaces share one writer.
 */
export async function scrubAccountTx(tx: DbTx, userId: string): Promise<{ phone: string }> {
  const phone = tombstonePhone(userId);
  const now = new Date();
  await tx
    .update(users)
    .set({
      name: "[deleted]",
      phone,
      email: null,
      profile_image_url: null,
      device_id: null,
      sos_contact: null,
      notification_prefs: null,
      security_settings: null,
      linked_accounts: null,
      data_controls: null,
      suspension_reason: null,
      deleted_at: now,
      updated_at: now,
    })
    .where(eq(users.id, userId));
  await tx
    .update(riderAddresses)
    .set({ address: "[deleted]", details: null, deleted_at: now, updated_at: now })
    .where(eq(riderAddresses.user_id, userId));
  await tx
    .update(rides)
    .set({ origin_address: "[deleted]", destination_address: "[deleted]" })
    .where(eq(rides.user_id, userId));
  return { phone };
}
