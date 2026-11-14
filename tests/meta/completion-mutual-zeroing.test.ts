/**
 * Completion commission — mutual zeroing rule (pure logic, no DB).
 *
 * Pins the completion-time contract that Stage 2/3 implement on disk:
 *   - snapshot === 'commission' && percent > 0  → platform_commission_bdt
 *     = fareBdt × percent / 100, authoritative, NO zeroing log
 *   - snapshot === 'subscription' && commission_percent_snapshot === null →
 *     accrual = 0, zeroing log written (subscription side zeroes commission — mutual zeroing)
 *   - snapshot === 'subscription' && commission_percent_snapshot non-null →
 *     accrual = fareBdt × snapshot_percent / 100 (bundle ride, D3-B-r2)
 *   - snapshot === NULL (legacy / pre-cutover)    → accrual = 0, zeroing log
 *     written (grandfathered — D5, never accrues commission)
 *   - snapshot === 'commission' && percent === 0  → accrual = 0, zeroing log
 *     written (commissionable basis but zero rate — still zeroed)
 *
 * The snapshot is taken at accept (rides.monetization_mode_snapshot, Item 13)
 * and never changes mid-ride — a mid-ride product switch cannot alter it.
 * Percent source: COALESCE(commission_percent_snapshot,
 * pricing_row.platform_commission_percent) — the ride-snapped rate overrides
 * the pinned pricing row rate; a NULL snapshot percent falls back to pricing.
 * Converse (M-24): a subscription snapshot carries a deduction-pair
 * expectation for the Item 14 reconciliation job; a commission snapshot
 * carries an accrual-or-zero%-basis.
 */
function computeCompletionCommission({
  fareBdt,
  percent,
  snapshot,
  commissionPercentSnapshot,
}: {
  fareBdt: number;   // integer paisa
  percent: number;   // numeric(5,2) rate_percent from pricing row
  snapshot: 'subscription' | 'commission' | null;
  commissionPercentSnapshot: number | null;
}): { platformCommissionBdt: number; zeroingLog: boolean } {
  const hasCommissionLeg = snapshot === 'commission' || commissionPercentSnapshot != null;
  if (!hasCommissionLeg) {
    return { platformCommissionBdt: 0, zeroingLog: true };
  }
  const accrualPct = commissionPercentSnapshot ?? percent;
  if (accrualPct <= 0) {
    return { platformCommissionBdt: 0, zeroingLog: true };
  }
  return { platformCommissionBdt: Math.round(fareBdt * (accrualPct / 100)), zeroingLog: false };
}

describe("completion commission — mutual zeroing", () => {
  const cases: Array<{
    label: string;
    fareBdt: number;
    percent: number;
    snapshot: 'subscription' | 'commission' | null;
    commissionPercentSnapshot: number | null;
    wantCommission: number;
    wantZeroingLog: boolean;
  }> = [
    {
      label: 'commissionable completion accrues the rated share',
      fareBdt: 100_000, percent: 5.00, snapshot: 'commission', commissionPercentSnapshot: null,
      wantCommission: 5_000, wantZeroingLog: false,
    },
    {
      label: 'subscription completion accrues nothing and is zeroed',
      fareBdt: 100_000, percent: 5.00, snapshot: 'subscription', commissionPercentSnapshot: null,
      wantCommission: 0, wantZeroingLog: true,
    },
    {
      label: 'legacy NULL-snapshot ride accrues nothing (grandfathered)',
      fareBdt: 100_000, percent: 5.00, snapshot: null, commissionPercentSnapshot: null,
      wantCommission: 0, wantZeroingLog: true,
    },
    {
      label: '0% commission basis accrues nothing and is zeroed',
      fareBdt: 100_000, percent: 0.00, snapshot: 'commission', commissionPercentSnapshot: null,
      wantCommission: 0, wantZeroingLog: true,
    },
    {
      label: 'fractional paisa rounds to the nearest paisa',
      fareBdt: 133, percent: 3.33, snapshot: 'commission', commissionPercentSnapshot: null,
      wantCommission: 4, wantZeroingLog: false,
    },
    {
      label: 'zero fare accrues nothing even when commissionable',
      fareBdt: 0, percent: 20.00, snapshot: 'commission', commissionPercentSnapshot: null,
      wantCommission: 0, wantZeroingLog: false,
    },
    {
      label: 'D3-B-r2 bundle ride: subscription snapshot + commission percent → accrual at snapped rate',
      fareBdt: 100_000, percent: 5.00, snapshot: 'subscription', commissionPercentSnapshot: 2.50,
      wantCommission: 2_500, wantZeroingLog: false,
    },
    {
      label: 'D3-B-r2 bundle ride: snapped percent overrides pinned pricing row percent',
      fareBdt: 200_000, percent: 10.00, snapshot: 'subscription', commissionPercentSnapshot: 1.00,
      wantCommission: 2_000, wantZeroingLog: false,
    },
    {
      label: 'D3-B-r2 subscription with NULL percent snapshot → zero accrual (pure sub)',
      fareBdt: 100_000, percent: 5.00, snapshot: 'subscription', commissionPercentSnapshot: null,
      wantCommission: 0, wantZeroingLog: true,
    },
    {
      label: 'D3-B-r2 commission ride with NULL snapshot percent → falls back to pricing row percent',
      fareBdt: 100_000, percent: 7.50, snapshot: 'commission', commissionPercentSnapshot: null,
      wantCommission: 7_500, wantZeroingLog: false,
    },
  ];

  test.each(cases)("$label", ({ fareBdt, percent, snapshot, commissionPercentSnapshot, wantCommission, wantZeroingLog }) => {
    const got = computeCompletionCommission({ fareBdt, percent, snapshot, commissionPercentSnapshot });
    expect(got.platformCommissionBdt).toBe(wantCommission);
    expect(got.zeroingLog).toBe(wantZeroingLog);
  });

  test("mid-ride switch cannot alter an accept-time snapshot", () => {
    // The snapshot is immutable once stamped at accept (Item 13): a driver
    // who switches products mid-ride completes under the ORIGINAL snapshot.
    const accepted = computeCompletionCommission({ fareBdt: 100_000, percent: 5.00, snapshot: 'commission', commissionPercentSnapshot: null });
    const switched = computeCompletionCommission({ fareBdt: 100_000, percent: 0.00, snapshot: 'commission', commissionPercentSnapshot: null });
    expect(switched.platformCommissionBdt).toBe(0);
    expect(switched.zeroingLog).toBe(true);
    // ...but had the accept snapshot been 'subscription', the same 20% rate
    // at completion would still yield zero — the rate alone never overrides
    // the snapshot.
    const subRate = computeCompletionCommission({ fareBdt: 100_000, percent: 20.00, snapshot: 'subscription', commissionPercentSnapshot: null });
    expect(subRate.platformCommissionBdt).toBe(0);
    expect(subRate.zeroingLog).toBe(true);
    expect(accepted.platformCommissionBdt).toBe(5_000);
    expect(accepted.zeroingLog).toBe(false);
  });
});
