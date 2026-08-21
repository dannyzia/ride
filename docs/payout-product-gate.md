# P0-B — Instant Pay / Payout History Product Gate

**Status:** BLOCKED on Product decisions. Implementation intentionally absent.
**Date verified:** 2026-08-22
**Related plan:** `docs/Screens Plan/Screens/6-10 Features/07 FINAL IMPLEMENTATION PLAN — Plans 06-11.md` § P0-B, § 2A (Plan 08 rows).

## 1. Gate rule

No withdrawal, Instant Pay, cash-out, or payout-history **write** capability may exist in
UI or API until Product supplies every decision in §3. Top-up, dues, active-package, and
payout-method *settings* are explicitly **not** gated and remain implemented.

## 2. Verification evidence (2026-08-22 source sweep)

| Check | Result |
|---|---|
| Withdraw / Instant Pay / Cash Out buttons, links, or stubs in `app/` or `components/` | **None.** Only match is the wallet-screen informational note "Withdrawals are not yet available." |
| API routes writing to a payout/withdrawal table | **None.** `app/api/driver/payout-method+api.ts` only stores payout-method *settings* (bKash number) — GET/POST of a settings row, no money movement. `app/api/ride/[id]/complete+api.ts` line 278 mentions "payout" in an explanatory comment only (why cash fares are not credited to the wallet). |
| Dead `payout` label in wallet screen | **Removed.** `TXN_TYPE_LABELS.payout` deleted from `app/(main)/(rider)/(tabs)/wallet/index.tsx`; a `// P0-B: Instant Pay disabled – product gate pending.` comment now marks the gate. |
| Store/state for withdrawals | **None** (`store/` grep clean). |
| Schema remnants | The `payout` value in the `driver_wallet_transactions.transaction_type` enum and the `driver_payout`/`driver_instant_pay` tax-code enums in `src/db/schema.ts` are **forward-compatible DB definitions only** — no code path writes those values. Kept intentionally; documented here. |

## 3. Missing Product decisions (the gate)

1. **Funding source** — which balance is payable: only gamification/cancellation credits, only platform-funded promo subsidies, or the full wallet (which today is credited with promo receivables and is *not* funded by cash fares — see the completion-flow accounting comment in `app/api/ride/[id]/complete+api.ts`).
2. **Payout provider/rail** — PortPos disbursement, bKash merchant payout, Nagad, or manual batch settlement.
3. **Fees, limits, tax** — per-payout fee, minimum/maximum amount, daily/weekly caps, source-tax withholding (schema already anticipates `source_tax_payout` / `source_tax_instant_pay` tax codes), and VAT treatment.
4. **Idempotency, reversal, failure, dispute** — duplicate-request behavior, provider timeout reconciliation (compensation-queue pattern exists for payments and should be mirrored), clawback on disputed rides, and accounting entries (which `accounting_entries` accounts a payout posts to).
5. **Payout history semantics** — whether history shows only completed payouts or includes pending/failed; retention; per-transaction tax breakdown.

## 4. Required implementation path once approved (summary)

1. New write endpoint (e.g. `POST /api/driver/payout`) using `parseJsonBody` + Zod + `requireRole('driver')`, transactional wallet debit + payout row + accounting entries, idempotency key, and a compensation-queue entry on provider timeout — mirroring `lib/paymentEvents.ts` / `lib/paymentRepair.ts` patterns.
2. Provider client in `lib/` (like `lib/portpos.ts`), server-side secrets only.
3. Wallet-screen Withdraw control + payout-history read API + screens.
4. Update this document to RESOLVED and remove the wallet-screen gate comment.

Until then, any PR introducing a withdrawal write path, a `payout` transaction label, or an
Instant Pay button must be rejected by review with reference to this gate.
