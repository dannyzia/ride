**Purpose:**     Owner dispositions on the consolidated review of `DESIGN-POSTPAID-MONETIZATION.md` — ALL findings accepted (0 contested), with formal rulings on the 6 material decision points. Authoritative input for the correction cycle.
**Owner:**       Zia (verbatim ruling capture, 2026-11-07). Rulings beat artifacts on divergence.
**Status:**      ACTIVE — correction cycle authorized; design document to be promoted to IMPLEMENTATION-READY after verified closure.
**Related:**     `consolidated_review_report.md` (the findings being dispositioned); `DESIGN-POSTPAID-MONETIZATION.md` (correction target).
**Last verified:** 2026-11-07, by Elephant (capture only; content is owner-authored)
**How to update:** Never edit ruling text; new rulings go in a new dated file.

---

# ACCEPT ALL FINDINGS (0 CONTESTED) — PROCEED WITH CORRECTION CYCLE

The five-stage review is verified accurate against the codebase. All 2 Blockers, 23 Majors, and 11 Nit groups are accepted for resolution. Full formal rulings and execution specs are captured in this file.

## Rulings on the 6 Material Decision Points

### C-B2 (Bill↔Settlement Linkage): Option (b) — Single Open Bill Under Advisory Lock
**Ruling:** Do not add payment_events.metadata. S2's partial unique index driver_bills_one_open_uq guarantees at most one open subscription bill per driver.
**Resolution:** On PortPos IPN callback for purpose = 'subscription_settlement', acquire the driver advisory lock, resolve the single open bill (WHERE driver_id = event.driver_id AND status = 'open' AND kind = 'subscription_purchase'), mark it settled, and link payment_event_id = event.id.

### M-05 / M-15 / M-06 (Lifecycle Events): Coherent Descope (No New Event Store in v1)
**Ruling:** Do not introduce a transition table.
**Resolution:** Keep 6 server states (ACTIVE, OWING, CEILING_LOCKED, LAPSED, PRODUCT_FROZEN, NO_PRODUCT). Render PURCHASE_BLOCKED strictly as a client-side banner on HTTP 409. Derive admin lockout aging from existing timestamps (driver_bills.created_at, subscriptions.expires_at, drivers.created_at). Derive registered_drivers_no_product via SQL query.

### M-02 (Kill-Switch Semantics): Unified OFF-Mode Contract
**Ruling:** platform_config.revenue_model remains the single switch (subscription_only = OFF, hybrid = ON).
**Resolution:** When OFF, legacy behavior applies across all layers: dispatch pool requires active unfrozen subscription; lead debit requires call_ledger deduction; accept guard strictly requires deduction row; trip complete accrues 0% commission; package purchase routes to upfront PortPos invoice. Drivers with frozen_at subscriptions remain inactive until unfrozen or a new package is bought.

### M-04 (EAS Window Compatibility): Dual-Lane Backward Compatibility
**Ruling:** Keep deprecated aliases on dues endpoint (total_outstanding_bdt, revenue_model) so old clients polling dues do not crash.
**Resolution:** Package purchase route inspects client header (x-client-postpaid: 1). Updated clients receive 1-tap credit grants; un-updated clients fall back to legacy upfront PortPos checkout, eliminating the invisible-debt hazard.

### M-21 (WebSocket Billing State Hint): Defer to Post-Launch (YAGNI)
**Ruling:** Drop billing_state_invalidated from launch scope.
**Resolution:** Delete the event from types.ts, delete Item 15, and strip WS notification logic from Items 13 and 26. Rely on the canonical 60s client dues poll, app-foreground refresh, and trip-completion fetch.

### M-09 (Sub-৳10 Packages): Hard Admin Package Price Floor
**Ruling:** Enforce price_bdt == 0 (trial) OR price_bdt >= 10 (1,000 paisa) in admin package validation and schema constraints.
**Resolution:** Permanently prevents unpayable bills below PortPos's minimum settlement threshold without adding complex settlement exceptions.

## Dispositions on Blockers & Consolidated Majors

- **C-B1 (Accept Guard): PROPOSE FIX.** Rewrite §3.5 accept-proof per mode: if snapshot === 'commission', verify the live dispatch_offers row for (ride_id, driver_id); if 'subscription', verify the legacy call_ledger deduction row. Update Item 13 and tests 39/40.
- **C-B2 (Bill Linkage): PROPOSE FIX.** Adopt Option (b) as ruled above.
- **M-01 to M-24 & N-01 to N-11: BLANKET PROPOSE FIX (All Approved, 0 Contested).**
  - Bind mode classification durably + lock enrollment row + extend Item 14 reconciliation to audit G1 exclusivity per completed ride (M-01, M-24).
  - Add s.status = 'active' to view SQL CTE (M-03).
  - Record 6→7 state divergence from D7 explicitly (M-07).
  - Require usable subscription for unfreezing (M-08).
  - Add explicit fraud exposure bound min(max_package_price_paisa, ceiling_paisa) (40,000 paisa) (M-10).
  - Reword NFR to enumerate indexed possession lookup as the allowed exception (M-11).
  - Fully pin TS signatures for money libs (M-12) and pin cutover timestamp marker (M-13).
  - Pin SQL boundary predicates (M-14), driver store & dues payload active_subscription (M-16).
  - Add 6 missing test suites and register gated harnesses (M-17).
  - Cover secondary purchase surfaces (M-18) and driver home frozen display (M-19).
  - Inline SQL in seed script (M-20) and add citation ID glossary appendix (M-22).
  - Apply all 11 Nit packs (N-01 to N-11).

## Amendment D3-A (2026-11-07, post-review) — Unified 4-Field Package Model

Owner ruling ("this is common sense — build it"): every package carries four fields — Commission %, Subscription Amount, Number of calls (−1 = unlimited), Expiration days (−1 = unlimited until the admin retires the package). Supersedes D3's non-expiring clause and A3's pricing-only rate source, as follows:
- **A-1 Rate override**: `packages.commission_percent` (numeric(5,2) NULL). NULL → not commission-rated (call packages; commission enrollments on NULL-rate packages fall back to the zone/vehicle pricing table). > 0 → the package's own rate overrides zone/vehicle pricing for rides completed while holding it.
- **B-1 Expiring commission**: commission packages may carry `duration_days` (NULL = unlimited; > 0 = expiring enrollment). `commission_enrollments.expires_at` set from package duration at enrollment; expiry = lockout exactly like a lapsed subscriber; re-enrollment follows settle-first. Supersedes D3's "duration_days = NULL" mandate.
- **Exclusivity guard**: `commission_percent > 0 ⇒ price_bdt = 0` and no sold calls — a package bills exactly one side (G1 / mutual zeroing preserved).
- **Retirement semantics (M-3-consistent)**: retiring (soft-deleting) a package affects new enrollments/purchases only; existing holders run out their term.
- Lands pre-Stage-4 (before `hybrid` activation).

## Amendment D3-B (2026-11-07, post-review) — Package-as-Billing-Contract (supersedes the D3-A exclusivity guard)

Owner ruling: "a package determines the billing option for a driver, and for how long; the admin configures it." Example sanctioned: 1% commission + ৳50 + 70 calls + 7 days — ALL legs active on ONE package.
- The D3-A exclusivity guard (`commission_percent > 0 ⇒ price_bdt = 0`, no sold calls) is WITHDRAWN. A package may carry any combination of the four fields; the package's values ARE the driver's billing terms.
- G1 is amended: a ride bills exactly the legs the driver's held package defines — lead debit iff the package sells calls, commission accrual iff the package carries percent > 0, both for bundles. The original zero-commission/zero-bill rule is retired (admin achieves it by configuring 0 in the unwanted fields).
- Package exhaustion = EITHER leg dying (calls_remaining = 0 OR days elapsed). Exhaustion blocks the driver from offers and leaves outstanding bills payable with a clear payment CTA (existing banner states + dues deep-link); Settle-First (no new purchase with unpaid bills) is reaffirmed.
- Implementation: `dispatch_offers`/`rides` mode column widens to `'lead' | 'commission' | 'bundle'` (ALTER TYPE ADD VALUE); leadBilling classifies the billing SET; completion accrues for `commission`/`bundle`; accept proof per billing set; admin form removes the guard.
- Lands pre-Stage-4.

## What To Do Next
1. **Trigger Correction Cycle**: Apply these approved dispositions directly to DESIGN-POSTPAID-MONETIZATION.md.
2. **Audit Verification**: Verify the diff against the 2 Blockers and 23 Majors to confirm all are closed and file citations remain verified against the tree.
3. **Sign-off**: Promote the design document to IMPLEMENTATION-READY.
