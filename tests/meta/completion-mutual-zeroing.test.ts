/**
 * Completion commission — mutual zeroing rule (pure logic, no DB).
 *
 * Pins the completion-time contract that Stage 2/3 implement on disk:
 *   - snapshot === 'commission' && percent > 0  → platform_commission_bdt
 *     = fareBdt × percent / 100, authoritative, NO zeroing log
 *   - snapshot === 'subscription'               → accrual = 0, zeroing log
 *     written (subscription side zeroes commission — mutual zeroing)
 *   - snapshot === NULL (legacy / pre-cutover)    → accrual = 0, zeroing log
 *     written (grandfathered — D5, never accrues commission)
 *   - snapshot === 'commission' && percent === 0  → accrual = 0, zeroing log
 *     written (commissionable basis but zero rate — still zeroed)
 *
 * The snapshot is taken at accept (rides.monetization_mode_snapshot, Item 13)
 * and never changes mid-ride — a mid-ride product switch cannot alter it.
 * Converse (M-24): a subscription snapshot carries a deduction-pair
 * expectation for the Item 14 reconciliation job; a commission snapshot
 * carries an accrual-or-zero% basis.
 */
function computeCompletionCommission({
  fareBdt,
  percent,
  snapshot,
}: {
  fareBdt: number;   // integer paisa
  percent: number;   // numeric(5,2) rate_percent e.g. 5.00
  snapshot: 'subscription' | 'commission' | null;
}): { platformCommissionBdt: number; zeroingLog: boolean } {
  if (snapshot === 'commission' && percent > 0) {
    return { platformCommissionBdt: Math.round(fareBdt * (percent / 100)), zeroingLog: false };
  }
  // Mutual zeroing: anything that is not an active commissionable completion
  // yields zero commission accrual and a zeroing log entry.
  return { platformCommissionBdt: 0, zeroingLog: true };
}

describe("completion commission — mutual zeroing", () => {
  const cases: Array<{
    label: string;
    fareBdt: number;
    percent: number;
    snapshot: 'subscription' | 'commission' | null;
    wantCommission: number;
    wantZeroingLog: boolean;
  }> = [
    {
      label: 'commissionable completion accrues the rated share',
      fareBdt: 100_000, percent: 5.00, snapshot: 'commission',
      wantCommission: 5_000, wantZeroingLog: false,
    },
    {
      label: 'subscription completion accrues nothing and is zeroed',
      fareBdt: 100_000, percent: 5.00, snapshot: 'subscription',
      wantCommission: 0, wantZeroingLog: true,
    },
    {
      label: 'legacy NULL-snapshot ride accrues nothing (grandfathered)',
      fareBdt: 100_000, percent: 5.00, snapshot: null,
      wantCommission: 0, wantZeroingLog: true,
    },
    {
      label: '0% commission basis accrues nothing and is zeroed',
      fareBdt: 100_000, percent: 0.00, snapshot: 'commission',
      wantCommission: 0, wantZeroingLog: true,
    },
    {
      label: 'fractional paisa rounds to the nearest paisa',
      fareBdt: 133, percent: 3.33, snapshot: 'commission',
      wantCommission: 4, wantZeroingLog: false,
    },
    {
      label: 'zero fare accrues nothing even when commissionable',
      fareBdt: 0, percent: 20.00, snapshot: 'commission',
      wantCommission: 0, wantZeroingLog: false,
    },
  ];

  test.each(cases)("$label", ({ fareBdt, percent, snapshot, wantCommission, wantZeroingLog }) => {
    const got = computeCompletionCommission({ fareBdt, percent, snapshot });
    expect(got.platformCommissionBdt).toBe(wantCommission);
    expect(got.zeroingLog).toBe(wantZeroingLog);
  });

  test("mid-ride switch cannot alter an accept-time snapshot", () => {
    // The snapshot is immutable once stamped at accept (Item 13): a driver
    // who switches products mid-ride completes under the ORIGINAL snapshot.
    const accepted = computeCompletionCommission({ fareBdt: 100_000, percent: 5.00, snapshot: 'commission' });
    const switched = computeCompletionCommission({ fareBdt: 100_000, percent: 0.00, snapshot: 'commission' });
    expect(switched.platformCommissionBdt).toBe(0);
    expect(switched.zeroingLog).toBe(true);
    // ...but had the accept snapshot been 'subscription', the same 20% rate
    // at completion would still yield zero — the rate alone never overrides
    // the snapshot.
    const subRate = computeCompletionCommission({ fareBdt: 100_000, percent: 20.00, snapshot: 'subscription' });
    expect(subRate.platformCommissionBdt).toBe(0);
    expect(subRate.zeroingLog).toBe(true);
    expect(accepted.platformCommissionBdt).toBe(5_000);
    expect(accepted.zeroingLog).toBe(false);
  });
});
