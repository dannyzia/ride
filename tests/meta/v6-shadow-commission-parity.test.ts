/**
 * v6 shadow commission parity (pure logic, no DB).
 *
 * Pins the parity contract between the v2 legacy commission figure and the
 * v6 authoritative `platform_commission_bdt` for a commission-holder with a
 * positive rate while Stage 1 is live:
 *   - snapshot === 'commission' && percent > 0  → v6 authoritative =
 *     platform_commission_bdt = round(fareBdt × percent / 100) > 0 and
 *     EQUALS the v2 figure (same math, same rounding — shadow parity)
 *   - snapshot === 'subscription'               → v6 authoritative = 0 —
 *     parity deliberately broken: the v2 figure may be nonzero but it is
 *     not authoritative under subscription mode
 *   - snapshot === NULL                         → v6 authoritative = 0
 *
 * "Stage 1 on" means revenue_model is live (seeded 'subscription_only' at
 * Stage 1; the kill switch is not flipped to 'hybrid' until the Stage 3
 * activation runbook) — parity here concerns the figure's authority, not the
 * kill switch.
 */
function v2Commission(fareBdt: number, percent: number): number {
  return Math.round(fareBdt * (percent / 100));
}

function v6AuthoritativeCommission({
  fareBdt,
  percent,
  snapshot,
}: {
  fareBdt: number;
  percent: number;
  snapshot: 'subscription' | 'commission' | null;
}): number {
  if (snapshot === 'commission' && percent > 0) {
    return v2Commission(fareBdt, percent);
  }
  return 0;
}

describe("v6 shadow commission parity", () => {
  const cases: Array<{
    label: string;
    fareBdt: number;
    percent: number;
    snapshot: 'subscription' | 'commission' | null;
    wantV6: number;
    wantParity: boolean;
  }> = [
    {
      label: 'commission-holder, positive rate: v6 equals v2 and is authoritative',
      fareBdt: 250_000, percent: 7.50, snapshot: 'commission',
      wantV6: 18_750, wantParity: true,
    },
    {
      label: 'commission-holder, 0% rate: v6 authoritative zero, parity with v2',
      fareBdt: 250_000, percent: 0.00, snapshot: 'commission',
      wantV6: 0, wantParity: true,
    },
    {
      label: 'subscription-holder: v6 authoritative zero even if v2 would be nonzero',
      fareBdt: 250_000, percent: 7.50, snapshot: 'subscription',
      wantV6: 0, wantParity: false,
    },
    {
      label: 'legacy NULL snapshot: v6 authoritative zero',
      fareBdt: 250_000, percent: 7.50, snapshot: null,
      wantV6: 0, wantParity: false,
    },
  ];

  test.each(cases)("$label", ({ fareBdt, percent, snapshot, wantV6, wantParity }) => {
    const v2 = v2Commission(fareBdt, percent);
    const v6 = v6AuthoritativeCommission({ fareBdt, percent, snapshot });

    expect(v6).toBe(wantV6);
    expect(v6 === v2).toBe(wantParity);
  });

  test("parity holds across a sweep of fares and rates for commission snapshots", () => {
    const fares = [0, 100, 1_000, 100_000, 500_000];
    const rates = [0, 1.25, 5.0, 10.0, 25.0];
    let checked = 0;
    for (const fare of fares) {
      for (const rate of rates) {
        const v6 = v6AuthoritativeCommission({ fareBdt: fare, percent: rate, snapshot: 'commission' });
        expect(v6).toBe(v2Commission(fare, rate));
        expect(v6 > 0).toBe(rate > 0 && fare > 0);
        checked += 1;
      }
    }
    expect(checked).toBe(fares.length * rates.length);
  });
});
