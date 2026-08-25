import { db } from "../src/db";
import {
  users,
  riderSubscriptions,
  riderPasses,
} from "../src/db/schema";
import { eq, and, sql, asc } from "drizzle-orm";
import { getStagedPromo } from "@/lib/promoCache";
import { getIntroDiscount, type DiscountOption } from "./introIncentive";

export type { DiscountOption };

export interface DiscountParams {
  riderId: string;
  totalRides: number;
  fareTotalBdt: number;
  zoneId: string;
}

const WALLET_REDEMPTION_MAX_PERCENT = 50;

export async function getAvailableDiscounts(
  params: DiscountParams,
): Promise<DiscountOption[]> {
  const options: DiscountOption[] = [];
  const nextRideNumber = params.totalRides + 1;

  const intro = await getIntroDiscount(
    params.riderId,
    nextRideNumber,
    params.fareTotalBdt,
    params.zoneId,
  );
  if (intro) options.push(intro);

  const promo = await getPromoOption(params.riderId, params.fareTotalBdt);
  if (promo) options.push(promo);

  const pass = await getPassOption(params.riderId, params.fareTotalBdt);
  if (pass) options.push(pass);

  const wallet = await getWalletOption(params.riderId, params.fareTotalBdt);
  if (wallet) options.push(wallet);

  return options;
}

async function getPromoOption(
  riderId: string,
  fareTotalBdt: number,
): Promise<DiscountOption | null> {
  const staged = getStagedPromo(riderId);
  if (!staged) return null;

  let discountBdt: number;
  if (staged.discountType === "percent") {
    discountBdt = Math.round((fareTotalBdt * staged.discountValue) / 100);
  } else {
    discountBdt = Math.round(staged.discountValue);
  }

  if (staged.maxDiscountBdt != null && discountBdt > staged.maxDiscountBdt) {
    discountBdt = staged.maxDiscountBdt;
  }
  discountBdt = Math.min(discountBdt, fareTotalBdt);

  if (staged.minSpendBdt != null && fareTotalBdt < staged.minSpendBdt) {
    return null;
  }

  return {
    type: "promo",
    percent:
      staged.discountType === "percent" ? staged.discountValue : undefined,
    amount_bdt: discountBdt,
    description: "Promo code",
  };
}

async function getPassOption(
  riderId: string,
  fareTotalBdt: number,
): Promise<DiscountOption | null> {
  // W-2: pick deterministically — the EARLIEST-expiring active pass supplies
  // the discount (burn the quota closest to expiry first). An un-ordered
  // limit(1) over two stacked passes was arbitrary, and completion needs the
  // same sub the request picked to burn its quota.
  const [sub] = await db
    .select()
    .from(riderSubscriptions)
    .where(
      and(
        eq(riderSubscriptions.rider_id, riderId),
        eq(riderSubscriptions.status, "active"),
        sql`${riderSubscriptions.valid_until} > now()`,
      ),
    )
    .orderBy(asc(riderSubscriptions.valid_until))
    .limit(1);
  if (!sub) return null;

  const [pass] = await db
    .select()
    .from(riderPasses)
    .where(eq(riderPasses.id, sub.pass_id))
    .limit(1);
  if (!pass) return null;

  if (pass.max_rides != null && sub.rides_used >= pass.max_rides) return null;

  const discountBdt = Math.round(
    (fareTotalBdt * pass.discount_percent) / 100,
  );

  return {
    type: "pass",
    percent: pass.discount_percent,
    amount_bdt: Math.min(discountBdt, fareTotalBdt),
    description: `${pass.name} pass`,
    subscription_id: sub.id,
  };
}

async function getWalletOption(
  riderId: string,
  fareTotalBdt: number,
): Promise<DiscountOption | null> {
  const [rider] = await db
    .select({ wallet_balance_bdt: users.rider_wallet_balance_bdt })
    .from(users)
    .where(eq(users.id, riderId))
    .limit(1);
  if (!rider || rider.wallet_balance_bdt <= 0) return null;

  const maxRedemption = Math.round(
    (fareTotalBdt * WALLET_REDEMPTION_MAX_PERCENT) / 100,
  );
  const redeemable = Math.min(
    rider.wallet_balance_bdt,
    maxRedemption,
    fareTotalBdt,
  );
  if (redeemable <= 0) return null;

  return {
    type: "wallet",
    amount_bdt: redeemable,
    description: `Wallet ৳${(rider.wallet_balance_bdt / 100).toFixed(
      0,
    )} (max ৳${(maxRedemption / 100).toFixed(0)})`,
  };
}

export function applySelectedDiscount(
  fareTotalBdt: number,
  option: DiscountOption,
): number {
  const discounted = fareTotalBdt - option.amount_bdt;
  return Math.max(0, discounted);
}
