import { db } from "../src/db";
import {
  users,
  riderSubscriptions,
  riderPasses,
} from "../src/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getStagedPromo } from "@/lib/promoCache";
import { getIntroDiscount, type DiscountOption } from "./introIncentive";

export type { DiscountOption };

export interface DiscountParams {
  riderId: string;
  totalRides: number;
  surgedTotalBdt: number;
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
    params.surgedTotalBdt,
    params.zoneId,
  );
  if (intro) options.push(intro);

  const promo = await getPromoOption(params.riderId, params.surgedTotalBdt);
  if (promo) options.push(promo);

  const pass = await getPassOption(params.riderId, params.surgedTotalBdt);
  if (pass) options.push(pass);

  const wallet = await getWalletOption(params.riderId, params.surgedTotalBdt);
  if (wallet) options.push(wallet);

  return options;
}

async function getPromoOption(
  riderId: string,
  surgedTotalBdt: number,
): Promise<DiscountOption | null> {
  const staged = getStagedPromo(riderId);
  if (!staged) return null;

  let discountBdt: number;
  if (staged.discountType === "percent") {
    discountBdt = Math.round((surgedTotalBdt * staged.discountValue) / 100);
  } else {
    discountBdt = Math.round(staged.discountValue);
  }

  if (staged.maxDiscountBdt != null && discountBdt > staged.maxDiscountBdt) {
    discountBdt = staged.maxDiscountBdt;
  }
  discountBdt = Math.min(discountBdt, surgedTotalBdt);

  if (staged.minSpendBdt != null && surgedTotalBdt < staged.minSpendBdt) {
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
  surgedTotalBdt: number,
): Promise<DiscountOption | null> {
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
    (surgedTotalBdt * pass.discount_percent) / 100,
  );

  return {
    type: "pass",
    percent: pass.discount_percent,
    amount_bdt: Math.min(discountBdt, surgedTotalBdt),
    description: `${pass.name} pass`,
  };
}

async function getWalletOption(
  riderId: string,
  surgedTotalBdt: number,
): Promise<DiscountOption | null> {
  const [rider] = await db
    .select({ wallet_balance_bdt: users.rider_wallet_balance_bdt })
    .from(users)
    .where(eq(users.id, riderId))
    .limit(1);
  if (!rider || rider.wallet_balance_bdt <= 0) return null;

  const maxRedemption = Math.round(
    (surgedTotalBdt * WALLET_REDEMPTION_MAX_PERCENT) / 100,
  );
  const redeemable = Math.min(
    rider.wallet_balance_bdt,
    maxRedemption,
    surgedTotalBdt,
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
  surgedTotalBdt: number,
  option: DiscountOption,
): number {
  const discounted = surgedTotalBdt - option.amount_bdt;
  return Math.max(0, discounted);
}
