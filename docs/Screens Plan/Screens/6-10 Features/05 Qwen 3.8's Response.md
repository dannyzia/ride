# INDEPENDENT PLAN AUDIT — Plans 06–11 Driver App Completion

**Inputs analyzed:**
- **MASTER PLAN** → `01 06-10 Features Update.md` (Kimi v3.2 — 52 screens + 3 infra)
- **PLAN UNDER REVIEW ("Terra")** → `02 Draft Implementation Plan.md` (Pass 3, Repository-Grounded Execution Plan)
- **REPOSITORY STRUCTURE** → `list.txt`
- **Supporting baseline** → `01.5 Repository Audit`, `AGENTS.md`

---

# 1. EXECUTIVE VERDICT

## **PLAN REQUIRES REVISION**

The plan is **structurally sound and unusually well-grounded**. Its core instinct — *"complete and repair an existing system rather than rebuild from scratch"* — is correct, and its Phase-0 architecture gates (subscription boundary, payment integrity, vehicle state, H3) are genuinely high-value. This is not a naive screen-by-screen plan.

However, it **cannot proceed as-is** for three classes of reason:

1. **The audit baseline it trusts is demonstrably stale.** Multiple items the audit marks `NOT_FOUND` / `NOT_STARTED` have files that **exist** in the current repository structure (`min-rate`, `payout-method`, `ride/schedule/overlap`). Terra inherits these errors and would instruct a coding agent to *create screens that may already exist*, risking duplication/overwrite.
2. **Real Master-Plan requirements are missing** — most notably the **Payout History** and **Instant Pay** screens plus the `transactions` / `instant-pay` / `payout-history` APIs, and the **new shared-component library** (StatCard, SegmentedControl, ToggleSwitch, ConfirmationModal…).
3. **One direct spec↔repo conflict is unaddressed**: Kimi's **4 vehicle types** vs the repo's **8-value vehicle enum** (`lib/vehicleTypes.ts`), which AGENTS.md makes mandatory.

None of these require tearing up the plan. They require **targeted revision plus a source-verification pass** before any coding agent runs.

---

# 2. WHAT TERRA GOT RIGHT

Credit where due — these are strong and should be preserved:

- **Repair-over-rebuild philosophy.** Correctly treats the audit's 24 implemented / 7 defective / 8 partial screens as the baseline instead of greenfield-building 52 screens.
- **Phase-0 gates before dependent work.** P0.2 (subscription boundary), P0.3 (payment integrity), P0.4 (vehicle state), P0.5 (H3) are exactly the right architectural hold-points.
- **Payment-integrity invariant** (one transaction owner / one payment-event owner / one ledger effect / one accounting effect) directly matches AGENTS.md write-ownership rules.
- **Refusal to create a second `DriverStatusGuard`** and correct reuse of `components/auth/DriverStatusGuard.tsx` (matches structure).
- **Refusal to blindly follow Kimi's literal API paths** when a working repo endpoint exists (`vehicle-type-change` vs `vehicles/{id}/activate`; `/api/user/referral`, `/api/support/ticket`, `/api/user/emergency-contacts`).
- **Correct i18n instinct**: extend existing `i18n/` instead of creating Kimi's proposed `lib/i18n.ts` (the repo has `i18n/i18n.ts` + locales).
- **Subscription "Option A vs Option B" gate** and "no two sources of truth" constraint — this is the single highest-risk decision and Terra isolates it correctly.
- **Parallelization model** (serialize money/subscription/vehicle chains; parallelize the rest) is sensible.
- **Verification Gates A–F** and the three-way independent final audit (Claude/Gemini/Qwen) match the orchestration protocol.

---

# 3. MASTER PLAN COVERAGE

| Requirement (Kimi v3.2) | Terra coverage | Assessment |
|---|---|---|
| Plan 06 — 5 driver tabs + tab layout | Partial | Covered (R-04/R-05/P1.1) but **tab-count ambiguity** unresolved (see §6). |
| Plan 06 — DriverStatusGuard (30s poll, check-status, rejection reason) | Complete | P1.2 covers it well. |
| Plan 06 — Earnings Goal modal + storage key | Complete | R-01 + R-23. Good. |
| Plan 06 — Activity Tab trip history + `GET /driver/trips` | Complete | R-02. Correctly flags new API. |
| Plan 06 — Wallet Tab (balance/due/subscription/transactions/top-up/withdraw) | **Partial** | Contract listed, but `transactions` / `instant-pay` APIs have **no explicit build item**. |
| Plan 07 — Vehicle Management / Select Active | Complete | R-06/R-07 + `is_active` fix (R-22). |
| Plan 07 — Subscription ecosystem | Partial | Gate is right, but R-08 is a placeholder pending the Option A/B decision. |
| Plan 07 — **Vehicle type model (4 vs 8)** | **Missing** | Direct spec↔repo conflict not reconciled. |
| Plan 08 — Earnings / Breakdown / Commission / Ledger / Dues / Min Rate | Complete | Covered. |
| Plan 08 — **Payout History screen (§8.7)** | **Missing** | No R-item; no API (`payout-history`). |
| Plan 08 — **Instant Pay screen (§8.8)** | **Missing** | No R-item; no API (`instant-pay`). |
| Plan 08 — Driver Lost Items | Complete | Correctly "do not rebuild." |
| Plan 09 — Support / Emergency Contacts / Schedule / SOS | Complete | P4.1–4.4. |
| Plan 09 — **Safety hub (§9.4), Trip Issue (§9.6), Report Issue (§9.7)** | **Missing/Implicit** | No explicit unit. |
| Plan 09 — FAQ / Driver Chat / Customer Navigation | Implicit ("verify") | Not listed as verify items; acceptable but should be explicit. |
| Plan 10 — Performance / Incentives / Ratings / Referral / Profile / Hotspot | Complete | Covered. |
| Plan 10 — **Rider No-Show (§10.8)** | Implicit | Not listed; needs verify-only line item. |
| Plan 11 — Legal content centralization | Partial | Right idea, but **path mismatch** unaddressed (see §6). |
| Plan 11 — i18n persistence + driver strings | Complete | R-19/R-20. |
| **Cross-cutting — Push-notification routing (§8.1)** | **Missing** | In DoD but no actionable item. |
| **Cross-cutting — Deep linking (§8.2)** | **Missing** | In DoD but no actionable item. |
| **Cross-cutting — New component library (§9)** | **Partial** | Only existing-unwired components handled; missing components ignored. |

---

# 4. REPOSITORY-SCOPE GAPS

> FINDING 1 — **The audit baseline is stale; Terra inherits phantom "not started" items.**
> **BASIS:** `01.5 Audit` vs `list.txt`.
> **CONFIDENCE:** **CONFIRMED** (structural).
> **EVIDENCE:**
> - Audit Part 4 #8: *"No screen at `app/(main)/(rider)/min-rate/index.tsx`"* → but `list.txt` **contains** `app/(main)/(rider)/min-rate/index.tsx`.
> - Audit Part 4 #7: *"No screen at `…/payout-methods/…`"* → `list.txt` **contains** `app/(main)/(rider)/payout-method/index.tsx` (singular).
> - Audit Part 13: *"No file at `app/api/ride/schedule/overlap+api.ts`"* → but `list.txt` **contains** `app/api/ride/schedule/overlap+api.ts`.
> **WHY IT MATTERS:** Terra's R-10 ("create min-rate screen") and R-09 ("payout screen") would make a coding agent **create/overwrite screens that may already exist** — exactly the duplicate-functionality failure the audit was meant to prevent.
> **RECOMMENDED ACTION:** Before any coding, re-run the "NOT_FOUND / NOT_STARTED" detection against the live tree. Treat every audit `NOT_FOUND` as **untrusted** until source-verified.

> FINDING 2 — **Possible duplicate Home route.**
> **BASIS:** `list.txt`.
> **CONFIDENCE:** **POSSIBLE.**
> **EVIDENCE:** Both `app/(main)/(rider)/(tabs)/index.tsx` **and** `app/(main)/(rider)/home/index.tsx` exist.
> **WHY IT MATTERS:** If both resolve to a driver "home," navigation/refactors could target the wrong one.
> **RECOMMENDED ACTION:** REQUIRES SOURCE-CODE VERIFICATION — confirm which is canonical.

Areas Terra appears to have **under-weighted**: `app/api/driver/wallet/topup+api.ts` (a top-up endpoint **already exists** — relevant to Wallet "Top Up"), `app/api/driver/break/*`, and the rider-side `(customer)` legal screens that Plan 11 must also centralize.

---

# 5. MISSING DEPENDENCIES

1. **Wallet Tab ⇐ `transactions` + `instant-pay` APIs.** Terra lists the contract but has no build item for these endpoints. Without them the Wallet "transactions list" and "Withdraw" cannot function.
2. **Payout History ⇐ `GET /driver/payout-history`.** Endpoint absent from both repo and plan.
3. **Subscription UI ⇐ Option A/B decision ⇐ `subscriptions`/`packages` source-of-truth resolution.** Terra states this chain, but does not define the **data-contract delta** for each option, so downstream screens can't be specified until the decision lands.
4. **All new screens ⇐ missing shared components** (StatCard, SegmentedControl, ToggleSwitch, ConfirmationModal, ImagePickerButton). Terra sequences screens before these components exist.
5. **Notification routing ⇐ `app/_layout.tsx` handler + per-type route table.** No owner assigned.
6. **Vehicle work ⇐ `lib/vehicleTypes.ts` 8-value enum.** Terra never binds vehicle screens to the mandatory enum.
7. **Earnings Goal / Min Rate ⇐ `lib/storageKeys.ts`** — Terra does capture this (good), but only if Finding 1 shows those screens don't already persist their own keys.

---

# 6. SCOPE PROBLEMS

**Missing work (must add):**
- Payout History screen + `payout-history` API.
- Instant Pay screen + `instant-pay` API.
- Driver Transactions API (`/driver/transactions`).
- New shared components (StatCard, SegmentedControl, ToggleSwitch, ConfirmationModal, ImagePickerButton; reconcile RadioList↔`RadioGroup.tsx`, SkeletonCard↔`Skeleton.tsx`).
- Push-notification routing handler; deep-link handling (`expo-linking` is imported nowhere per audit).
- Plan 09 Safety hub, Trip Issue, Report Issue line items.
- Test strategy (see §9 / AGENTS.md Jest + Maestro).

**Unnecessary / risky work (must guard against):**
- Creating `min-rate` / `payout-method` screens if Finding 1 confirms they exist.
- Creating Kimi's literal `terms/index.tsx`, `privacy/index.tsx` new files — real screens live at `settings/terms-of-service/index.tsx` and `settings/privacy-policy/index.tsx` for **both** `(customer)` and `(rider)`. Modifying the wrong path duplicates legal content.
- Building dedicated subscription endpoints (Option B) before the gate resolves.

**Over-engineering risk:** Low. Terra is notably restrained. Do not let reviewers inflate scope.

**Under-engineering risk:** Medium — money screens lack an automated-test mandate despite AGENTS.md's transaction/invariant requirements.

**Duplicated functionality risk:** **HIGH** — driven entirely by Finding 1 (stale audit) plus the legal-path mismatch.

---

# 7. CROSS-MODULE RISKS

Areas outside the immediate feature that implementation could break (verify, don't assume):

- **Existing driver ride flow** (`find-customer`, `finish-ride`, `rider-no-show`, dispatch WS) — any `(tabs)/_layout.tsx` change (adding guard, showing tab bar) can disturb the in-ride stack.
- **Call Ledger / Missed Requests / Dues / Schedule** — Terra says "do not disturb," but Activity rebuild shares the tab container.
- **`paymentEvents` writers** — Wallet top-up/instant-pay must route through `lib/paymentEvents.ts` + callback only (AGENTS.md ownership). A new "withdraw" writer would violate the single-writer rule.
- **`call_ledger` / `subscriptions`** — subscription decision can alter ledger semantics.
- **Vehicle state** — fixing `is_active` (R-22) affects dispatch eligibility and `vehicle-type-change`.
- **Rider-side `(customer)`** — Plan 11 legal centralization touches rider Terms/Privacy too; rider flows are a regression gate.
- **Admin panel** — package/subscription changes may surface in `app/admin/packages.tsx`.
- **H3/zone** — P0.5 touches heartbeat zone stamping (Plan 05 carryover).

---

# 8. IMPLEMENTATION-SEQUENCE REVIEW

Terra's **macro sequence is sound**: `P0 gates → P1 foundation → P2/P3/P4 parallel → P5 → P6 → P7 → audits`. Classifications:

- **P0.2 Subscription decision** — PREREQUISITE (blocks all of R-08). ✅
- **P0.3 Payment integrity** — PREREQUISITE (blocks Wallet/Payout/Instant Pay). ✅
- **R-23 storageKeys / R-17 legalContent** — PREREQUISITE for their consumers. ✅
- **Activity rebuild ⇐ `GET /driver/trips`** — correctly serialized. ✅
- **Vehicle state fix ⇐ Vehicle UI** — correctly serialized. ✅

**Corrections required:**
1. **Insert a Phase -1: Source-Verification Sweep** (Finding 1) *before* P1. Re-detect all `NOT_FOUND`/`NOT_STARTED` items against the live tree.
2. **Add component-library work as PREREQUISITE** to the screens that consume StatCard/SegmentedControl/ToggleSwitch/ConfirmationModal — currently screens are sequenced before their components exist.
3. **Split Wallet** into (a) backend contract fixes (`due_bdt`, transactions API) then (b) UI — Terra gestures at this but the `transactions`/`instant-pay` API build must be an explicit predecessor.
4. **Add Payout History + Instant Pay** on the Money chain (serialized under P0.3, parallel to Commission/Payout Methods).
5. **Add a cross-cutting track** for notification routing + deep links (PARALLELIZABLE after navigation stabilizes).

---

# 9. CODING-AGENT READINESS

## BLOCKERS (must resolve before coding)
- **B1.** Are `min-rate/index.tsx`, `payout-method/index.tsx`, and `ride/schedule/overlap+api.ts` already implemented? (Finding 1.) Determines "create" vs "modify."
- **B2.** Vehicle-type reconciliation: Kimi 4 types vs repo 8-value enum. A literal agent would corrupt `vehicleTypes.ts` semantics.
- **B3.** Subscription Option A vs B decision (Terra already gates this — but it must be *decided*, not left open, before R-08).
- **B4.** Tab count: 5 tabs (Kimi W0.1 code) vs 6 tab folders present (`settings` exists in `(tabs)/`). Decide whether Settings is a tab or reached via Profile.
- **B5.** Legal screen real paths (`settings/terms-of-service`, `settings/privacy-policy`) vs Kimi's literal `terms/`/`privacy/` paths.
- **B6.** Money-unit clarity for Earnings Goal range (100–50000 taka ⇒ stored as paisa).

## DISCOVERABLE DURING IMPLEMENTATION
- Exact current props of `RadioGroup`/`Skeleton` for reuse.
- Whether `wallet/topup+api.ts` already satisfies Top Up.
- Precise `daily-stats` response superset handling.
- Existing notification handler shape in `app/_layout.tsx`.
- `personal-profile` onboarding-navigation regression (R-21) exact line.

---

# 10. SOURCE-CODE VERIFICATION CHECKLIST

Repository-aware reviewers (Gemini / Claude / Qwen Code) **must** confirm, by path:

1. `app/(main)/(rider)/min-rate/index.tsx` — exists? functional? persists via `min_per_km_bdt`? uses `MinRateSlider.tsx`?
2. `app/(main)/(rider)/payout-method/index.tsx` — exists? lists methods (GET) or only POST? bKash validation?
3. `app/api/ride/schedule/overlap+api.ts` — real handler or stub/404?
4. `app/(main)/(rider)/(tabs)/_layout.tsx` — does it register `settings` (6 tabs) or 5? is `DriverStatusGuard` wrapped? is `tabBarStyle` `display:none`?
5. `components/auth/DriverStatusGuard.tsx` — polling? check-status? rejection reason?
6. `app/api/driver/vehicles+api.ts` — confirm `is_active` hardcoded.
7. `app/api/driver/wallet+api.ts` — confirm `recent_transactions` vs `due_bdt`.
8. `app/api/driver/wallet/topup+api.ts` — does Top Up already work through `paymentEvents`?
9. `lib/vehicleTypes.ts` — confirm 8-value enum and all vehicle screens' compliance.
10. Existing component inventory: `ProgressBar`, `Badge`, `Avatar`, `CheckboxGroup`, `RadioGroup`, `Skeleton`, `StatusBadge`, `EmptyState`, `ErrorBanner`, `TransactionRow`, `SettingsRow` — importers/props.
11. Absence of `trips+api.ts`, `transactions+api.ts`, `instant-pay+api.ts`, `payout-history+api.ts`, `active-subscription+api.ts`, `subscription*+api.ts`.
12. `app/_layout.tsx` — current notification-response handling; `expo-linking` usage.
13. `(rider)/(tabs)/index.tsx` vs `(rider)/home/index.tsx` — canonical home.
14. Legal screens' actual content location in all four `(customer)`/`(rider)` Terms/Privacy files.
15. `i18n/i18n.ts` + `locales/{en,bn}/common.json` — persistence mechanism and driver-namespace gaps.

---

# 11. REQUIRED CHANGES TO TERRA'S PLAN

1. **Add Phase -1 Source-Verification Sweep** (re-detect all audit `NOT_FOUND`/`NOT_STARTED`). Convert R-09/R-10 from "create" to "create-or-modify pending verification."
2. **Add R-items** for Payout History screen, Instant Pay screen, `/driver/transactions`, `/driver/instant-pay`, `/driver/payout-history`.
3. **Add a Vehicle-Type Reconciliation decision** binding all vehicle/package work to the 8-value `vehicleTypes.ts` enum.
4. **Add a Component-Library workstream** (build missing, reuse existing) sequenced before dependent screens.
5. **Add cross-cutting work items** for push-notification routing and deep-link handling (with the Kimi §8.1/§8.2 route tables).
6. **Add Plan 09 line items** for Safety hub, Trip Issue, Report Issue; add verify-only lines for FAQ, Driver Chat, Customer Navigation, Rider No-Show.
7. **Fix legal-screen targets** to the real `settings/terms-of-service`/`privacy-policy` paths for both roles.
8. **Resolve tab-count** (5 vs 6) explicitly in P1.1/R-04.
9. **Add a test mandate** (Jest full suite at phase gates; money-transaction invariants; Maestro for key driver flows) to Gates E/F per AGENTS.md.
10. **Add a 52-screen → work-item traceability map** so a coding agent can confirm every screen is covered.

---

# 12. RECOMMENDED PLAN DIRECTION

Keep Terra's skeleton — it is the right shape. Final strategy should be:

1. **Verify current state first** (Phase -1 sweep) to replace the stale audit baseline with ground truth.
2. **Hold the Phase-0 gates**, especially the subscription Option A/B decision and payment single-writer invariant.
3. **Complete the money chain** with the missing `transactions`/`instant-pay`/`payout-history` endpoints and the Payout History + Instant Pay screens, all routed through existing `paymentEvents`/accounting infrastructure.
4. **Build/reuse the shared component layer** before the screens that depend on it.
5. **Reconcile every spec↔repo contract conflict** (vehicle types, legal paths, tab count, schedule POST/PUT, lost-items method) *as explicit decisions*, not silent drift.
6. **Wire cross-cutting concerns** (notification routing, deep links, i18n persistence, legal centralization) as first-class items.
7. **Gate every phase on automated tests**, not only typecheck/lint.

Do **not** expand into unrelated refactors; the goal remains completing Plans 06–11 against the Kimi spec.

---

# 13. FINAL ASSESSMENT

## **B. Repository-aware review first**

The plan is too good to discard and too flawed to code directly. The decisive factor is **Finding 1**: because the audit and the live tree disagree on whether `min-rate`, `payout-method`, and `schedule/overlap` already exist, sending this to a coding agent now risks **building duplicates over working code**. A focused source-verification pass (Section 10) must run first; its results feed the targeted revisions in Section 11. After that, the revised plan can proceed to implementation. This is **not** a "major replanning" — the architecture and sequencing are largely correct.

---

# 14. CONFIDENCE

## **MEDIUM**

**High confidence** in the *structural* findings: the file-existence contradictions (min-rate, payout-method, schedule/overlap), the missing screens/APIs, the vehicle-type conflict, and the legal/tab path mismatches are all directly observable by comparing `01.5`, `01`, `AGENTS.md`, and `list.txt`.

**Primary uncertainty:** I can see structure, not source. The *actual implementation state* of the screens the audit calls `NOT_FOUND` but the tree shows as present — and whether other "not started" items are already partially built — **REQUIRES SOURCE-CODE VERIFICATION**. That unknown is precisely why the next step must be a repository-aware review rather than direct implementation.