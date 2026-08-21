/**
 * Canonical completion-wallet contract (docs/Plan/06-API.md, POST
 * /api/ride/:id/complete, steps 9–10): the ONLY driver-wallet receivables at
 * ride completion are platform-funded subsidies — never the cash fare
 * itself. The rider pays the driver in cash (L13); crediting `driver_net`
 * here would conflate topped-up, withdrawable money with fares the platform
 * never received and would pay out twice on the first withdrawal.
 *
 * Step 9 (promo receivable): when a promo was applied and the platform
 * subsidized part of the fare, the subsidy is owed to the driver — the
 * driver collected only the discounted cash amount.
 *
 * Step 10 (referral receivable) has no completion-time trigger in this
 * schema: `rides` carries no referral columns; referral rewards are settled
 * by POST /api/user/referral per campaign rules instead. The receivable
 * snapshot fields below are the only ride columns this contract reads.
 */

export interface CompletionSubsidySnapshot {
  id: string;
  promo_code_id: string | null;
  platform_subsidy_bdt: number | null;
}

export interface CompletionWalletReceivable {
  transaction_type: "promo_receivable";
  amount_bdt: number;
  reference_id: string;
}

/**
 * Step 9: the promo subsidy becomes a driver-wallet receivable only when a
 * promo code was applied to the ride AND the platform actually subsidized a
 * positive amount. Everything else — including the full cash fare — must NOT
 * touch the driver wallet at completion.
 */
export function computeCompletionWalletReceivable(
  ride: CompletionSubsidySnapshot,
): CompletionWalletReceivable | null {
  if (!ride.promo_code_id) return null;
  const subsidy = ride.platform_subsidy_bdt ?? 0;
  if (subsidy <= 0) return null;
  return {
    transaction_type: "promo_receivable",
    amount_bdt: subsidy,
    reference_id: ride.id,
  };
}
