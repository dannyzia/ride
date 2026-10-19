// C3-5 (STAGE C3-FIX, F-05 cash handshake → receipt entry). Single builder
// shared by complete+api (driver-confirm response) and index+api (receipt)
// so the two surfaces can never disagree on change_due / amounts_match.
// All amounts are integer paisa; null = that side of the handshake missing.

export interface CashHandshake {
  rider_cash_tendered_bdt: number | null;
  driver_cash_received_bdt: number | null;
  change_due_bdt: number | null;
  amounts_match: boolean | null;
}

export function buildCashHandshake(
  tendered: number | null | undefined,
  received: number | null | undefined,
  riderPayableBdt: number | null | undefined,
): CashHandshake {
  const t = tendered ?? null;
  const r = received ?? null;
  return {
    rider_cash_tendered_bdt: t,
    driver_cash_received_bdt: r,
    change_due_bdt:
      t != null && riderPayableBdt != null ? t - Number(riderPayableBdt) : null,
    amounts_match: t != null && r != null ? t === r : null,
  };
}
