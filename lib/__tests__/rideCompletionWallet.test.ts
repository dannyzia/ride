/**
 * Completion-wallet contract (audit H-2): docs/Plan/06-API.md steps 9–10
 * allow ONLY platform-subsidy receivables to credit the driver wallet at
 * ride completion. The cash fare (driver_net) must NEVER land there — the
 * driver collects it in cash (L13), and wallet balance is withdrawable
 * top-up money. A regression here means the first payout epic pays every
 * fare twice.
 */
import {
  computeCompletionWalletReceivable,
  type CompletionSubsidySnapshot,
} from "../rideCompletionWallet";

function ride(overrides: Partial<CompletionSubsidySnapshot>): CompletionSubsidySnapshot {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    promo_code_id: null,
    platform_subsidy_bdt: null,
    ...overrides,
  };
}

describe("computeCompletionWalletReceivable (06-API steps 9–10)", () => {
  it("credits promo_receivable when a promo subsidized part of the fare", () => {
    expect(
      computeCompletionWalletReceivable(
        ride({ promo_code_id: "22222222-2222-2222-2222-222222222222", platform_subsidy_bdt: 5000 }),
      ),
    ).toEqual({
      transaction_type: "promo_receivable",
      amount_bdt: 5000,
      reference_id: "11111111-1111-1111-1111-111111111111",
    });
  });

  it("credits nothing for an ordinary cash ride (no promo)", () => {
    expect(computeCompletionWalletReceivable(ride({ platform_subsidy_bdt: 0 }))).toBeNull();
  });

  it("credits nothing when the promo subsidy is zero", () => {
    expect(
      computeCompletionWalletReceivable(ride({ promo_code_id: "22222222-2222-2222-2222-222222222222", platform_subsidy_bdt: 0 })),
    ).toBeNull();
  });

  it("credits nothing when the subsidy snapshot is null", () => {
    expect(
      computeCompletionWalletReceivable(ride({ promo_code_id: "22222222-2222-2222-2222-222222222222" })),
    ).toBeNull();
  });

  it("never exposes a cash-fare credit path: subsidy without promo code is not receivable", () => {
    // Defensive: a stray platform_subsidy_bdt without its promo_code_id
    // snapshot is a data integrity anomaly, not a payable subsidy.
    expect(computeCompletionWalletReceivable(ride({ platform_subsidy_bdt: 7500 }))).toBeNull();
  });
});
