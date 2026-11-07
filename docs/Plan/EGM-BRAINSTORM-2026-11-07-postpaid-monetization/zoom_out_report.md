**Purpose:**     Stage 5 (Initial Zoom Out Review) findings — `DESIGN-POSTPAID-MONETIZATION.md`, full file. Part of the consolidated EGM review (2026-11-07).
**Owner:**       Elephant (EGM review session, for Zia)
**Status:**      RAW FINDINGS — consolidated into `consolidated_review_report.md`
**Related:**     `DESIGN-POSTPAID-MONETIZATION.md` (target); reviewer persona `C:\Users\callz\.agents\agents\zoom_out.md`; standards pack `resources/document_standards/zoom-out-standard.md` NOT INSTALLED — persona-inline audit vectors applied.
**Last verified:** 2026-11-07, by Elephant (verbatim reviewer output)
**How to update:** Never edit raw findings; dispositions live in the consolidated report.

---

# Zoom Out Report — Stage 5 (Initial Zoom Out)

Reviewer: egm-zoom-out (fresh session). Target: `DESIGN-POSTPAID-MONETIZATION.md`, full file (649 lines), audited against the working tree.

---

## FINDING 1

1. **Severity**: Blocker
2. **Affected Scope**: §3.5 "Accept-time snapshot (M-3)" (line 290), Detailed Implementation Plan Item 13 `utils-server/index.ts` (line 468), and §3.7 transition map (T-row coverage of the accept boundary).
3. **Simplicity Rationale (missed enforcement point — the design's own hazard-hunt misses one legacy consumer)**: The design's file-by-file plan claims completeness ("every file touched by this design appears exactly once", line 399), and Item 13 lists four changes for `utils-server/index.ts` (snapshot write, revenueModel-threading retirement, per-driver `lead_cost_calls`, optional WS hint). It misses the accept-time **revenue guard** in `executeMatchFlow` at `utils-server/index.ts:2468-2482`: `SELECT … FROM call_ledger WHERE event_type='deduction' … if (!deductionRow) return "no_deduction"` — the match is hard-rejected for any driver with no deduction row, on both the manual `offer:accept` path (index.ts:1695-1698) and auto-accept (`runAutoAccept`, index.ts:2984-2990, same function). Under `hybrid`, commission drivers by design produce **no** deduction rows (§3.5 M-14 restatement, line 292), so every commission-driver accept fails and CUJ 3 (commission driver completes trips) is unachievable — G1 is violated by construction. This is exactly the class of "legacy consumer that corrupts the new mode" the document systematically exterminates elsewhere (F-1 orphan sweep, F-3 repair fallthrough at `lib/paymentRepair.ts:242-243` — verified real, F-4 blind sum — verified at `lib/commissionDues.ts:48-54`); this one is the executable form of the same old invariant the doc only restates in AGENTS.md prose (Item 34). Fix is cheap and in-scope-file: one bullet in Item 13 and one line in §3.5 specifying the per-mode guard (commission-mode acceptance proved by the live `dispatch_offers` row instead of the deduction row).

## FINDING 2

1. **Severity**: Major
2. **Affected Scope**: G5 (line 49), §3.6 `monetization_state` precedence rule 4 (line 303), Item 17 (line 490).
3. **Simplicity Rationale (state machine conflates transient UI with derivable server state)**: Precedence rule 4 defines `PURCHASE_BLOCKED` as surfaced "only when a purchase/switch attempt was just blocked, **or** when LAPSED + total_unpaid_paisa >= 1000". The first disjunct is client-side interaction memory — `GET /api/driver/dues` cannot know a purchase was "just blocked"; the server would have to either persist a transient flag (new write path, new staleness semantics) or have the client inject state into the precedence machine. Both are architectural dead-ends for a state the document otherwise defines as a pure function of possession rows + the view (rules 1-3, 5-7 are all derivable). Simpler shape consistent with the doc's own philosophy: `PURCHASE_BLOCKED` is a client-rendered banner after the typed 409 (the deep-link recovery path already exists in CUJ 7), and the standing lapsed+owing condition stays under `LAPSED` with the pay CTA. Related governance note folded in: D7 (`owner_dispositions_2026-11-07.md:77`) rules a **6-state** banner; G5 silently extends to **7 states** (adding NO_PRODUCT). D4 supports the no-product choice card, but per the repo's "rulings beat artifacts — divergence recorded in-file" protocol the 6→7 extension should be explicitly recorded, not silently absorbed.

## FINDING 3

1. **Severity**: Nit
2. **Affected Scope**: §3.4 purchase routing (lines 256-258), §3.3 view CTE `active_self_bill` (lines 219-227), §3.5 pool predicate (line 283), Item 4 (line 421).
3. **Simplicity Rationale (predicate duplication across the SQL/TS boundary)**: The "usable subscription" predicate (`status='active' AND frozen_at IS NULL AND expires_at > now() AND (calls_remaining > 0 OR calls_remaining = -1)`) is re-expressed verbatim in at least three SQL contexts (view CTE, dispatch candidate JOIN, purchase-route check) plus the TS helpers in `monetizationMode.ts`. TS helpers cannot be consumed by the SQL view/JOIN, so a shared TS function alone cannot make it single-sourced; the M-14 drift-guard test (view vs lib function vs batched query) covers the three main consumers but not the purchase-route and leadBilling re-expressions. Consider defining the predicate once in SQL (a tiny `subscription_is_usable(s)` SQL function used by both the view and the dispatch join) so the SQL side has one definition too. Low urgency — the test net catches the expensive drifts.

## FINDING 4

1. **Severity**: Nit
2. **Affected Scope**: §3.7 T8 (line 326), Item 3 (line 416: `waiveBill(tx, {billId, actorAdminId, reason})`).
3. **Simplicity Rationale (YAGNI — dead code in a money module)**: `waiveBill` ships with zero callers (admin UI deferred per Non-Goals, line 58). The ownership *rule* — "any new bill-reduction path MUST go through `lib/billsLedger`" — is already durably recorded at line 328 and in Item 34 (AGENTS.md). Implementing an unused mutation function in the receivables ledger now is speculative surface area; write it when the admin waiver surface exists. Recording the rule ≠ shipping the function.

## FINDING 5

1. **Severity**: Nit
2. **Affected Scope**: S2 (line 166: `kind varchar … (open for future kinds)`).
3. **Simplicity Rationale (speculative extensibility)**: The document itself states commission never lives in `driver_bills` (line 166, §3.3 view filter), so `kind` has exactly one live value and every consumer filters on it constant-wise. The "open for future kinds" dimension is a designed-for-tomorrow column; a second kind can be added the day a second kind exists (the enum-adjacent `NOT NULL DEFAULT` makes that migration additive anyway). Harmless today; flagging because the doc's own discipline (M-10, YAGNI posture in Alternatives C/E) is higher than this line's.

## FINDING 6

1. **Severity**: Nit
2. **Affected Scope**: Item 8 (line 441: `getDriverUnpaidObligations` added to `lib/commissionDues.ts`).
3. **Simplicity Rationale (module-boundary blurring)**: `lib/commissionDues.ts` is named and owned for commission-dues math; the unified owed-figure (subscription bills + commission + self-bill carve-out) is a platform-wide concept that four consumers will import from it. Pragmatic placement (existing importers stay), but after this change the module's real product is the view reader while its namesake function becomes a thin wrapper (`net_commission_paisa`). Either accept with a one-line role note in AGENTS.md's write-ownership section, or let the caller see this as a naming decision at implementation time — not worth churn now.

## REUSE VERIFICATION (code-search evidence, all claims checked against the working tree)

- **`lib/billsLedger.ts` reinvents nothing.** No bills/settlement writer for driver receivables exists today: `lib/deliverySettlement.ts` writes only `delivery_earnings`/`courier_remittance_dues` (COD remittance lane, correctly excluded per Non-Goals/D7 with its two-point guard pattern cited as prior art — verified `courierDebtHoldsDispatch` + `couriersOnDispatchHold`, deliverySettlement.ts:145-201), and `lib/paymentRepair.ts` exclusively owns `driver_commission_settlements` (settleCommissionDues, paymentRepair.ts:158-200). A new table-scoped single-writer module matches established repo precedent (deliverySettlement.ts header, lib/paymentEvents.ts ownership header, `lib/fleetAssignment.ts`). Correct call, not duplication.
- **`lib/monetizationMode.ts` duplicates nothing.** Greps for `monetization|frozen_at|product_type` across `lib/` and `utils-server/` return zero matches; today's possession logic is inline SQL in `dispatch.ts:227-233` (left-join on `status='active'` only) and `leadBilling.ts:116-127`. Consolidating scattered inline predicates into one module is the simplification, not a reinvention.
- **`grantSubscriptionOnCredit` correctly extends, not forks, the existing grant.** The supersede pattern it must replicate is real and in the same write-owner file (`lib/activateSubscription.ts:32-35` — advisory lock + expire-any-active). Sibling-in-same-file is the right reuse shape.
- **Kill-switch demotion (Alternative B) reuses existing plumbing** — `lib/platformConfig.ts:253-285` verified (`RevenueModel`, `parseRevenueModel` unknown→default, `getRevenueModel`, `getMaxCommissionDebtBdt`); narrowing the union plus ALLOWED_KEYS is minimal churn for a real rollback lever (G8). Not premature.
- **No premature-optimization findings.** The S5 partial covering index and view filter-pushdown replace a verified O(lifetime-rides) per-pool scan (`dispatch.ts:285-322`); the layered purchase defense (pre-check → in-tx re-check → partial unique index → advisory lock) is proportionate money-path discipline, and the alert-only reconciliation job (Item 14) is a cheap guard on a new money table, not speculative dunning (D6 explicitly defers cron dunning).
- **All cited line anchors verified accurate** (a non-trivial quality bar for this genre): `purchase+api.ts:276-294` (active-sub gate) and `:296-338` (trial path), `leadBilling.ts:105-110` commission shape and the five silent `billed=false` exits at `:129-162, :256-258` (returns at 131/142/155/161/257), `commissionDues.ts:12-13` and `:48-54`, `dispatch.ts:285-322 / :526-539 / :554-565 / :622-632`, `scheduler.ts:1169-1197` (orphan sweep), `complete+api.ts:192-194 / :261 / :430-435` (v6 hard-zero and MFS snapshot precedent), `paymentEvents.ts:31 / :70`, `dues/pay+api.ts:33` (`MIN_PAYMENT_BDT = 1_000`), `accountDelete.ts:59-69` (`checkDeleteDues`), `idempotency.ts:43` (`driverDuesPay` already in `IDEMPOTENCY_ROUTES` — Item 18's "extend" is a no-op, sub-nit, fold into implementation).

**Verdict**: One Blocker (Finding 1 — accept-time revenue guard missing from the change plan; the feature's core mode cannot complete a ride as specified), one Major (Finding 2 — `PURCHASE_BLOCKED` server-state incoherence + unrecorded 6→7-state divergence from D7), four Nits. The document is otherwise strong at altitude: context-sufficient, root-problem-focused, reuse-correct (verified against code), with alternatives genuinely weighed and line-level claims that survive audit. Fix Finding 1 and Finding 2 before implementation briefing; the Nits can ride into the implementation brief as notes.
