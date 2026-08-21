I've read all three documents. Now I'll verify the repository audit's most consequential claims against the actual codebase before producing the independent review of the Draft Implementation Plan, focusing on the items the plan treats as architecture gates (P0.1–P0.5) and the subscription/wallet/vehicle contract disputes, since those drive the entire execution order.# READ-ONLY REPOSITORY AUDIT — DRAFT IMPLEMENTATION PLAN (Plans 06–11)

**Audit date:** 2026-08-21
**Documents reviewed:** Master spec (`01 06-10 Features Update.md` v3.2), Repository audit (`01.5 REPOSITORY AUDIT`), Draft Implementation Plan (`02 Draft Implementation Plan.md`)
**Method:** Direct file reads against the live repository. Findings below are evidence-tagged as either **CONFIRMED** (I read the file myself) or **UNVERIFIED** (relied on the 01.5 audit without independent confirmation).

---

# 1. EXECUTIVE VERDICT

**REQUIRES REVISION**

The Draft Implementation Plan is directionally sound — its central premise ("repair an existing system, don't rebuild it") is correct and matches repository reality. However, the plan **inherits at least two factual errors from the 01.5 repository audit without re-verifying them**, both of which change the actual remaining-work scope, and it **fails to surface one business-model-level contradiction** in the master spec that no amount of careful sequencing can fix. These are not stylistic nitpicks — they cause a coding agent to do unnecessary work (padding scope/cost) in one case, and to build a feature (`Instant Pay` cash withdrawal) that may be structurally incompatible with the product's no-escrow subscription model in the other.

---

# 2. REPOSITORY REALITY

Confirmed by direct inspection:

- [`app/(main)/(rider)/_layout.tsx`](app/(main)/(rider)/_layout.tsx:1) wraps the **entire** `(rider)` stack — including `(tabs)` — in `DriverStatusGuard`. Non-active drivers cannot reach any tab today; the guard runs one level above the tabs, not inside them.
- [`app/(main)/(rider)/(tabs)/_layout.tsx`](app/(main)/(rider)/(tabs)/_layout.tsx:34) does hide the tab bar (`display: "none"`) and use `FloatingNavMenu` instead — confirmed.
- [`app/api/driver/vehicles+api.ts`](app/api/driver/vehicles+api.ts:51) does hardcode `is_active: true` for every vehicle row — confirmed, real defect.
- [`app/api/driver/wallet+api.ts`](app/api/driver/wallet+api.ts:34) returns `{ balance_bdt, recent_transactions }`, no `due_bdt` — confirmed.
- [`app/api/driver/payout-method+api.ts`](app/api/driver/payout-method+api.ts:16) **already has a working `GET` handler** returning the active bKash method — this contradicts both the 01.5 audit and the Draft Plan (see Finding 2 below).
- [`app/api/driver/wallet/topup+api.ts`](app/api/driver/wallet/topup+api.ts:16) exists, is fully wired to `initiatePortposPayment`, and follows the `paymentEvents` single-writer discipline — this endpoint is **absent from both the 01.5 audit's API table and the Draft Plan's wallet scope**.
- [`app/(main)/(rider)/(tabs)/wallet/index.tsx`](app/(main)/(rider)/(tabs)/wallet/index.tsx:106) explicitly states in-UI: *"Total earnings are credited here at ride completion and from gamification rewards. **No withdrawals are available yet.**"* This is a cancellation-compensation/gamification credit tracker, not a cash wallet.
- [`app/(main)/(rider)/(tabs)/activity/index.tsx`](app/(main)/(rider)/(tabs)/activity/index.tsx:1) is a static 3-link menu with zero data fetching — confirmed.
- [`app/api/driver/schedule+api.ts`](app/api/driver/schedule+api.ts:52) uses `PUT`, not `POST` — confirmed.
- [`app/api/driver/lost-items+api.ts`](app/api/driver/lost-items+api.ts:38) uses `PATCH` on root, not `POST /{id}/respond` — confirmed.
- No `app/api/driver/subscription/` directory exists — confirmed, subscription flow genuinely relies on `/api/package/*`.

---

# 3. CRITICAL / HIGH FINDINGS

### [HIGH] Finding 1 — P0.1's core justification is factually wrong; the driver-status gate is not broken

**Problem:**
The Draft Plan's Phase 0.1 ("Driver navigation/status gate") is framed as an urgent architecture gate that must be resolved before *any* other Plan 06–11 work begins, on the stated basis that `DriverStatusGuard` doesn't wrap the tabs and therefore "non-active drivers can access tabs without status check."

**Repository evidence:**
[`app/(main)/(rider)/_layout.tsx`](app/(main)/(rider)/_layout.tsx:1) — `DriverStatusGuard` wraps the `<Stack>` that renders `(tabs)` as one of its children. If `driver.status` is not `active`/`temporary`, the guard returns a status screen and **never renders the Stack at all**, so `(tabs)/_layout.tsx` never mounts. Access control is already enforced one level up.

**Why it matters:**
The Draft Plan treats this as a **P0 blocking gate** ahead of Activity/Wallet/Earnings-Goal work, and assigns it a dedicated model pass (GLM-5.2). Elevating a non-bug to a P0 blocker delays real P1 work and burns a model-review cycle for nothing. It also risks an agent double-wrapping the guard (harmless but wasteful) or, worse, "fixing" this by restructuring navigation in a way that isn't actually required.

**Required correction:**
Reclassify P0.1 as **cosmetic/UX-parity work** (visible 64px tab bar, wallet badge, wiring Settings into the tab bar), not a security gate. The genuinely missing pieces — 30s status polling, a dynamic rejection-reason string (today's `rejected` screen shows a static message, not `driver.rejection_reason`), and a "Check Status" action — are real gaps worth fixing, but they are UX completeness items, not access-control defects. Move this into P1 alongside Earnings Goal/Activity, not ahead of it.

---

### [HIGH] Finding 2 — Payout Methods GET endpoint already exists; R-13/R-09 as scoped will duplicate live code

**Problem:**
The Draft Plan (Phase P3.3, and unit R-13 in the inventory) instructs an agent to "Implement `GET /api/driver/payout-method`" and lists it as a dependency (`R-09 | Payout management | NEW | ... | Depends: R-13`).

**Repository evidence:**
[`app/api/driver/payout-method+api.ts`](app/api/driver/payout-method+api.ts:16-38) — the `GET` handler is fully implemented: verifies the token, resolves driver, queries `driverPayoutMethods` for the active row, returns `{ payout_method: activeMethod ?? null }`.

**Why it matters:**
This is inherited directly from the 01.5 audit (which itself claims "No GET handler" in three separate places — Part 2 table, Part 9 critical defects #3, Part 14 R-13). Both documents are wrong on this specific point. If a coding agent follows the Draft Plan literally, it will either (a) waste a turn "discovering" the endpoint exists and re-planning, or (b) write a duplicate/conflicting `GET` handler in the same file, which will fail at the module level (two exported `GET` functions can't coexist) or silently shadow the real one depending on how the agent edits the file.

**Required correction:**
Change R-13 to "**VERIFY** `GET /api/driver/payout-method` response contract against the Payout Methods screen's needs" (it already returns a single active method, not a list — confirm the screen only needs the active method, which matches the "single-active-method behavior" the Draft Plan itself says to preserve). R-09 (the screen) has no remaining backend dependency and can proceed immediately.

---

### [HIGH] Finding 3 — "Instant Pay" / wallet cash-withdrawal is architecturally incompatible with the confirmed no-escrow subscription model

**Problem:**
The master spec (§8.7–8.11) and Draft Plan (Phase 1.5, P3.3) both treat the driver wallet as a cash balance the driver can withdraw to bKash via `POST /api/driver/instant-pay`, with minimums, daily limits, and fees. The Draft Plan assigns this to GLM-5.3 as "financial state" work and lists it as a serial dependency chain (`Payment integrity → Wallet → Payout/Instant Pay → Final money audit`).

**Repository evidence:**
[`app/(main)/(rider)/(tabs)/wallet/index.tsx`](app/(main)/(rider)/(tabs)/wallet/index.tsx:106) states in the shipped UI copy that this balance is credited only "at ride completion and from gamification rewards" and that "no withdrawals are available yet." Combined with the project's confirmed business model — drivers collect fares directly from riders (cash/MFS), the platform **never holds fare escrow**, and revenue is subscription/package sales only — there is no pool of platform-held driver money to disburse via `instant-pay`. The only money genuinely flowing driver-ward through the platform today is `cancellation_credits` and gamification bonuses, both small, discretionary, non-fare amounts.

**Why it matters:**
This is the single biggest scope risk in the whole plan. If a coding agent builds `POST /api/driver/instant-pay` and a full withdrawal UI against a balance that is not real platform-held cash, either (a) the platform starts paying out real bKash transfers against a balance nobody funded correctly, which is a genuine money-losing bug, or (b) the feature ships and is functionally meaningless/misleading to drivers because the balance never grows large enough to matter. Neither the 01.5 audit nor the Draft Plan questions this; both accept Kimi's spec at face value and treat it as a build task rather than a product-definition question.

**Required correction:**
Before any Instant Pay/withdrawal work starts, this needs an explicit product decision (not a coding-agent decision): is the driver "wallet" going to become a real funded balance (which would require defining a funding source — e.g., a to-be-built commission/dues reconciliation that nets against subscription due, or a genuine bKash payout rail), or does the master spec's Instant Pay feature simply not apply to this product and should be dropped/rescoped to "cancellation-credit payout" only? This should be a P0 gate, arguably higher priority than the tab-layout question in Finding 1.

---

### [MEDIUM] Finding 4 — Wallet top-up backend already exists and is omitted from scope

**Problem:**
Draft Plan Phase 1.5 lists wallet top-up as something to "verify" alongside due/active-subscription/transactions, without flagging that a working implementation exists.

**Repository evidence:**
[`app/api/driver/wallet/topup+api.ts`](app/api/driver/wallet/topup+api.ts:16-52) is a complete PortPos-integrated top-up flow with correct `paymentEvents` ownership. Neither the 01.5 audit's Part 9 API table nor the Draft Plan's R-03/R-12 unit descriptions mention this file at all — it isn't in the "existing writers" list for `paymentEvents` either, though it correctly calls the shared `initiatePortposPayment` helper.

**Why it matters:**
This is a completeness gap in the underlying audit, not a correctness bug in the Draft Plan per se — but the Draft Plan's Wallet phase can't be scoped accurately without knowing this endpoint exists, since "Top Up" is one of the two buttons the Wallet Tab spec requires.

**Required correction:**
Add `wallet/topup+api.ts` to the Wallet phase's known-existing-backend list; the Wallet Tab's "Top Up" button can wire directly to it rather than being scoped as new/uncertain work.

---

# 4. MEDIUM / LOW FINDINGS

- **[MEDIUM]** Draft Plan P0.4 (Vehicle State Gate) correctly identifies the `is_active: true` hardcode (confirmed) but doesn't note that fixing it requires either adding a real `is_active`/`active_vehicle_id` column-level concept to `vehicles`/`drivers` or deriving "active" from `drivers.vehicle_id` — the schema decision isn't specified, only "fix `vehicles+api.ts`." An agent given this literally may patch the response shape without touching the underlying data model, producing the same bug in a different form.
- **[LOW]** The `rejected` status screen in [`components/auth/DriverStatusGuard.tsx`](components/auth/DriverStatusGuard.tsx:82) shows a static rejection message, not a dynamic reason. The Draft Plan's P1.2 unit does list "rejection reason" as required — this part is correctly scoped, just noting it as confirmed real work, unlike Finding 1's access-control claim.
- **[LOW]** Draft Plan's Phase 4.5 (Lost Items) correctly says "do not rebuild" — confirmed accurate against [`app/api/driver/lost-items+api.ts`](app/api/driver/lost-items+api.ts:38), which already implements all three response actions.

---

# 5. MISSING REQUIREMENTS

- The master spec's Driver Lost Items response actions ("I Have It" / "Not Found" / "Arrange Return") are implemented with different verb names (`confirm`/`not_found`/`return_arranged`/`photo`) than the spec's `have_it`/`not_found`/`arrange_return`. The Draft Plan doesn't call out this naming mismatch anywhere — it's cosmetic for the API contract but should be an explicit "frontend adapts to existing enum" note, or a future agent may try to add a fourth `have_it` action redundant with `confirm`.
- The Draft Plan never addresses the Kimi master spec's push-notification routing table (§8.1) or deep-link table (§8.2) as concrete implementation units — they're acknowledged only implicitly under "Phase 7 — Cross-cutting." Given `expo-linking` is imported nowhere in the repo (per 01.5 Part 8, plausible and consistent with what I've seen), this is real, unscoped work that the Draft Plan's Definition of Done (§28) lists as a completion criterion without ever assigning it a phase, model, or unit ID.

---

# 6. INCORRECT ASSUMPTIONS

1. That `DriverStatusGuard` needs to move into/wrap the tabs layout for access control to function — **false**, per Finding 1.
2. That `GET /api/driver/payout-method` must be built — **false**, per Finding 2.
3. That the driver "wallet" is a withdrawable cash balance compatible with an Instant Pay feature — **unverified/likely false**, per Finding 3, and this assumption is inherited uncritically from Kimi's spec.
4. That wallet top-up needs new backend work — **false**, per Finding 4.

---

# 7. DEPENDENCY / SEQUENCING PROBLEMS

The Draft Plan's stated sequencing (`P0 → P1 Driver Foundation → P2/P3/P4 parallel → P5 → P6 → P7`) is reasonable in shape, but two corrections are needed given the findings above:

- **P0.1 should be demoted** out of the blocking-gate tier entirely (Finding 1); nothing in P1–P7 actually depends on it being fixed first, since the guard already works. Doing so unblocks P1 (Earnings Goal, Activity rebuild) immediately without waiting on a non-issue.
- **A new P0 gate should be added ahead of P1.5/P3.3**: "Wallet funding-source decision" (Finding 3). This is a harder blocker than the plan's existing P0.2 (subscription architecture) because it determines whether Instant Pay is even in scope, and P3.3 (Payout Methods) is currently sequenced as if the answer is already "yes, it's a real cash wallet."

---

# 8. REUSE OPPORTUNITIES

- `payout-method+api.ts` GET (Finding 2) — reuse as-is for the Payout Methods screen.
- `wallet/topup+api.ts` (Finding 4) — reuse as-is for the Wallet Tab's Top Up button.
- `DriverStatusGuard`'s existing status-branch structure (`pending`/`suspended`/`rejected`/`temporary`/`active`) — already matches the master spec's five-state table exactly; only the polling/rejection-reason/check-status pieces need adding, not a rewrite.
- Existing `/api/package/*` flow (`list`, `purchase`, `active`) with working `PaymentWebView` + polling — the Draft Plan correctly recommends extending rather than replacing this (P0.2/Phase 2.3), and my spot-check confirms these are real, working endpoints worth preserving as the foundation.

---

# 9. TESTING GAPS

- No unit in the Draft Plan's Verification Gates (§26) covers whether a "fix" to Finding 1 (tabs guard) accidentally introduces a double-render or navigation flash for already-active drivers — worth an explicit regression check given the guard already sits one level up.
- Gate E ("Data integrity" — paisa/transaction/payment-event/ledger/accounting) as currently written would not have caught the Instant Pay funding-source problem (Finding 3), because it assumes the feature is legitimate and only checks internal consistency, not whether the underlying balance is real money. Add an explicit check: "does this payment-producing operation have a verified, platform-held funding source before any write occurs?"

---

# 10. REQUIRED PLAN CHANGES

1. Rewrite P0.1 as a P1-tier UX/parity task (visible tab bar, badge, Settings wiring, polling, rejection reason, check-status action) — remove the false "non-active drivers can access tabs" justification.
2. Change R-13 from "NEW — implement GET" to "VERIFY — confirm existing GET contract satisfies the Payout Methods screen"; drop it as a hard dependency blocking R-09.
3. Insert a new P0 gate: **Wallet funding-source decision** — must resolve before P1.5 (Wallet) or P3.3 (Payout/Instant Pay) proceed. Options: (a) scope Instant Pay out entirely and ship Wallet as a compensation/bonus tracker only, matching current UI copy; (b) define a real funding mechanism (e.g., derived from `cancellation_credits` + gamification rewards ledger only, explicitly excluding fare money) before building withdrawal.
4. Add `wallet/topup+api.ts` to the known-existing-backend inventory for the Wallet phase; remove it from "verify/build" scope.
5. Note the Lost Items action-name mismatch (`have_it` vs `confirm`, etc.) explicitly as "frontend must adapt to existing backend enum" so no agent adds a redundant action.

---

# 11. FINAL IMPLEMENTATION READINESS

- **Can a coding agent implement this safely now? NO** — not until items 1–3 in §10 are corrected. Proceeding on the current text risks wasted/duplicate work (Finding 2) and a genuine money-handling misstep (Finding 3).
- **What must be fixed first:** the P0.1 reframe, the R-13 correction, and — most importantly — the wallet funding-source decision, before any Instant Pay or Payout Methods work is authorized.
- **What can remain unchanged:** the overall phase shape (P0→P1→parallel P2-4→P5→P6→P7), the "repair not rebuild" philosophy, the subscription architecture gate (P0.2) as written, the model-allocation strategy, and the Lost Items/Emergency Contacts/SOS "verify, don't rebuild" framing — all of these check out against the repository.
- **What should NOT be changed:** the existing `/api/package/*` payment flow, `DriverStatusGuard`'s status-branch logic, the existing `payout-method` POST handler, and `wallet/topup+api.ts` — all confirmed working and should be extended, not replaced.

---

# 12. OPTIONAL IMPROVEMENTS

- Consider having the coding agent grep for `paymentEvents` writers as a first step in any wallet/payout unit, since `wallet/topup+api.ts` shows there are more call sites than either planning document currently tracks — the "single-writer" invariant in Phase 0.3 is only as good as the inventory backing it.
- The Draft Plan's R-numbering reuse from the 01.5 audit is good practice for traceability, but given two of those R-units (R-13, and indirectly R-09) are now known to rest on incorrect premises, it would be worth a one-line changelog in the plan itself noting the correction source, so downstream agents don't silently regress to the original (wrong) 01.5 text if they re-read it later.