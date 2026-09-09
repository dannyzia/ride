---
**Purpose:**     Staleness audit of the remaining marketplace test files (48 files, ~16k lines) — vacuous assertions and mocks that no longer match production. Companion to the 2026-09-08 activation/emergency audit; same method (inventory → red-flag grep → mock-vs-production check → mutation verification).
**Owner:**       Coding model (per orchestrator dispatch); dispositions recorded 2026-09-09
**Status:**      RESOLVED — A1+A2+A3+B1+B2 fixed and committed as e43b9d9; C1 = WATCH ITEM (tracked as ISSUE-31)
**Source of truth:** the files listed below; production cited inline
**Related (concrete paths):**
  - .kilo/plans/findings/2026-09-08-activation-emergency-test-overlap.md — prior audit round (Findings 1+2 closed by 087a679 / ISSUE-30)
  - tests/api/delivery/delivery.test.ts — Finding A1 lives here
  - tests/api/delivery/food-bridge.test.ts — Findings A2/A3 live here
  - tests/api/shop/shops.test.ts — Findings B1/B2 live here
  - tests/api/admin/marketplace-admin.test.ts — Finding C1 (accepted risk) lives here
**Last verified:** 2026-09-09, coding model — dispositions applied after fix batch e43b9d9 (1934/1934 tests, 153 suites; tsc 0/0; lint 0 errors)
**How to update:** append disposition (FIXED/SKIP/RETIRE) per finding after each lands; do not delete findings.

---

# Marketplace test staleness audit — 2026-09-09

## Method

Red-flag grep across tests/api/{rental,delivery,shop,emergency,admin} + utils-server/__tests__ (48 files, ~16,000 lines): vacuous assertions (expect(true)/expect(N).toBeDefined), skip markers, shift-queue/positional mocks (mockSelectQueue/mockResolvedValueOnce chains ≥3), TODO placeholders. Per-suspect: full-file read, mock shape vs production query shape, assertion-to-production mapping. Mutation checks were run in the previous round where assertions referenced production (activation watermark); every finding below cites WHY it cannot detect drift, making mutation runs unnecessary.

## Finding A1 — MODERATE: delivery.test.ts placeholder tests assert nothing (2 tests)

**Disposition (2026-09-09): RESOLVED in e43b9d9** — placeholders deleted; real job-51 coverage lives in `utils-server/__tests__/scheduler-job51-delivery-ttl.test.ts` (tick-capture harness, PgDialect SQL-level WHERE assertions pinning `status='pending' AND deadline_at < now`, outcome `cancelled + cancel_reason='deadline_expired'`; both predicate clauses mutation-verified). The cancelled-vs-expired semantics mismatch named below is now pinned by a real test.

tests/api/delivery/delivery.test.ts
- L312 'withdraw sets status=withdrawn, clearing the partial unique slot' → expect(true).toBe(true)
- L322 'delivered/assigned requests are NOT affected by the sweep' → expect(true).toBe(true)
- Adjacent tautologies: L301 'job 51 expires pending requests past their deadline' → expect(51).toBeDefined(); guard-structure tests assert imported SCHEMA objects exist (schema imports cannot drift apart from handler behavior).

CRITICAL context: production job 51 (utils-server/scheduler.ts:2524-2545) sets status:'cancelled', cancelled_at, cancel_reason:'deadline_expired' — NOT 'expired'. The test NAME promises the sweep contract; the body asserts nothing. A semantics change (e.g. to status 'expired' per the §B.3 vocabulary) would sail through.

Fix: real job-51 test (pending row past deadline → cancelled+deadline_expired; delivered/assigned rows untouched), or delete both placeholders. ~30 min.

## Finding A2 — HIGH: food-bridge.test.ts mark-ready integration tests are pure tautologies (3 tests)

**Disposition (2026-09-09): RESOLVED in e43b9d9** — file rebuilt on the table-router mock driving the REAL mark-ready handler; 4-cell bridge matrix (food/pickup × delivery/general), bridge-null → 409 rollback, real-bridge tx insert. Note: `order-transitions.test.ts` already covered food+delivery bridge-fire and bridge-null-409; the rebuild completed the matrix in the bridge-owned file.

tests/api/delivery/food-bridge.test.ts L302/309/314 — 'bridge is called for food delivery orders' / 'bridge is NOT called for pickup orders' / 'bridge is NOT called for general category orders' — all three are expect(true).toBe(true) with contract claims in comments.

Why HIGH: the food bridge (shop order → delivery request) is a money surface (F40 fee recompute at accept). The three gate conditions (category='food' AND fulfillment='delivery') are exactly the kind of boolean logic that regresses silently; nothing would catch it.

Fix: invoke app/api/shop/orders/[id]/mark-ready+api.ts (real handler; Z2 pattern) and assert createFromShopOrder called/not-called per category/fulfillment. ~1 h.

## Finding A3 — MODERATE: food-bridge F40 test verifies test-internal arithmetic (1 test)

**Disposition (2026-09-09): RESOLVED in e43b9d9** — REAL accept-bid handler now tested: `delivery_fee_bdt = bid.quoted_fee_bdt` and `total_bdt = subtotal_bdt + fee` asserted from production writes, same-tx; parcel-originated requests never touch shop_orders.

Same file L288: 'accept-bid writes delivery_fee_bdt and recomputes total_bdt' computes subtotal+deliveryFee INSIDE the test and asserts the sum matches. Zero production reference (comment admits it: 'Integration verified by the code in accept-bid+api.ts').

Fix: fold into the A2 mark-ready/accept-bid behavioral tests (assert total_bdt = subtotal + delivery_fee_bdt from the handler response). ~15 min alongside A2.

## Finding B1 — MODERATE: shops.test.ts RFQ state-machine suite asserts a map declared INSIDE the test file (10 tests)

**Disposition (2026-09-09): RESOLVED in e43b9d9** — describe block deleted, after first verifying `rfq-actions.test.ts` covers §B.6 behaviorally through the real handlers (open→quoted, awarded-rejects-quote, 409s, zero-writes).

tests/api/shop/shops.test.ts L169-218 builds VALID_RFQ_TRANSITIONS locally, then asserts the map contains what the map says. The rfq-actions.test.ts (real handler, real transition guards) ALREADY covers §B.6 behaviorally — these 10 are decorative duplicates with zero production reference.

Fix: delete the describe block (rfq-actions.test.ts is the owner); ~10 min. Optionally keep one smoke if the team wants a doc-level mirror, but it must import the map from production if so.

## Finding B2 — LOW: shops.test.ts queue-depth fragility (accepted risk, watch item)

**Disposition (2026-09-09): RESOLVED in e43b9d9** — option (b) implemented: 4 queue-depth assertions pin `requireShopMember`'s exact select count (2 on the happy path, 1 on short-circuit paths), converting silent row-shift into loud failure.

mockSelectQueue positional selects with '[] if empty' defaults; requireShopMember (lib/marketplaceRbac.ts) currently performs supabase-from('users') + shopMembers select + shops select — aligned today. But three distinct 403 causes are indistinguishable at the queue level; production adding ONE read (e.g. a vehicle/zone check) shifts all rows silently.

Not stale TODAY. Options: (a) leave as-is + watch item; (b) assert consumed queue depth after each guard call (expect(mockSelectQueue).toHaveLength(0)) to convert silent shift into loud failure. Option (b) is ~10 min.

## Finding C1 — LOW: marketplace-admin.test.ts positional queue (accepted risk, watch item)

**Disposition (2026-09-09): WATCH ITEM — no change.** Queue is currently honest and aligned (7 documented positions vs 7 production selects, real `sla_faults` assertions). Failure mode on drift (silently empty aggregates) is worse-but-rare; revisit if the overview handler gains an 8th select.

Overview SLA-fault test documents all 7 select positions inline and the handler has exactly 7 selects — aligned today, well-documented, and the assertions (sla_faults rows) are real. Same class of risk as B2 (silent row-shift on production query addition).

Watch item only; the documentation makes drift visible in review. If the overview handler gains an 8th select, the test fails loudly ONLY if a fixture is missing (rows=[] default), so failure mode is worse-but-rare: silently empty aggregates.

## Verdict

- 0 dangerous staleness in marketplace CORE handlers (rental z2/race-condition/security-fix, delivery z2/leg-action, shop z2/rfq-actions, emergency ambulance — all table-routed or queue-aligned with real assertions).
- 16 tests across 3 files assert nothing or assert test-internal constructs (A1 ×2 + 2 tautologies, A2 ×3, A3 ×1, B1 ×10 = 17 total assertions-level; ~16 named tests).
- Suggested batch (order by value): A2+A3 (~1.25 h, money-surface), A1 (~30 min), B1 deletion (~10 min), B2 option-b (~10 min).

## Out-of-scope notes

- tests/api/driver/*, tests/api/fleet/*, tests/api/fleets/* also appeared in the shift-queue grep but are OUTSIDE the marketplace audit scope (dispatched dirs: rental/delivery/shop/emergency/admin marketplace). Flagged for a later sweep.
- fuelRecompute.test.ts self-describes as testing a stub (TODO A-6b) — utils-server, outside dispatched dirs; the header is honest about it.