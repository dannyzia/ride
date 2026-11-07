**Purpose:**     Stage 6 (Comprehension Test) findings — `DESIGN-POSTPAID-MONETIZATION.md`, FeatureRange 1–396 + DetailedRange 397–EOF. Part of the consolidated EGM review (2026-11-07).
**Owner:**       Elephant (EGM review session, for Zia)
**Status:**      RAW FINDINGS — consolidated into `consolidated_review_report.md`
**Related:**     `DESIGN-POSTPAID-MONETIZATION.md` (target); reviewer persona `C:\Users\callz\.agents\agents\comprehension.md`; no document standard applies to this stage by design.
**Last verified:** 2026-11-07, by Elephant (verbatim reviewer output; paraphrase included per protocol)
**How to update:** Never edit raw findings; dispositions live in the consolidated report.

---

# Comprehension Report — Stage 6

Reviewer: egm-comprehension (fresh session, no synthesizer — paraphrase preserved).

## What this proposes

Ride currently monetizes all drivers through one global switch; this design replaces it with a per-driver choice between two products: (1) the existing call packages, converted to postpaid — calls are granted immediately at purchase, an open bill row (`driver_bills`) is created in the same transaction, and money is collected later via a unified settlement endpoint through the PortPos gateway; (2) a new ৳0, never-expiring commission package — a separate enrollment row, where each completed trip accrues a commission bill per zone/vehicle pricing. The product a driver holds IS their monetization mode. All unpaid obligations (open subscription bills plus net commission dues) are unified in one Postgres view, `driver_unpaid_obligations`, consumed by four gates: dispatch ceiling lockout, a settle-first purchase gate (no new purchase with unpaid ≥ ৳10, dust below that passes), the itemized dues screen/payment flow, and the account-deletion gate. It adds frozen-calls switch semantics (`subscriptions.frozen_at`), a ride-time mode snapshot written at offer-accept, per-driver billing classification inside the debit transaction, a config-write kill-switch rollout (schema → utils-server → API/EAS), and a 45-item implementation plan with a verification plan.

## How the existing system works, per this document

Today a single `platform_config.revenue_model` toggle applies one monetization mode to everyone: either all drivers must buy prepaid call packages (a subscription activates only after a verified PortPos payment callback, and each dispatched offer debits a lead at offer time), or the whole platform runs on per-ride commission — machinery that exists but is idle at 0% launch defaults and globally gated. Dispatch gates every driver identically by that global value, and "what does this driver owe" is fragmented across `payment_events` rows and the difference between accrued ride commissions and settlements, with each consumer (dispatch, purchase gate, dues screen, deletion gate) deriving or skipping its own version. A subscriber whose calls run out simply stops receiving offers, and the current payment machinery cannot represent a subscription that is granted before money arrives.

---

## Findings

### 1. Severity: Major
**Affected Scope:** G5 (line 49), CUJ 1, §3.6 `monetization_state` precedence, vs. `owner_dispositions_2026-11-07.md` D7 and the header claim "D1–D7 rulings (implemented verbatim)". The owner ruling D7 explicitly says "ship the **6-state** driver home banner (ACTIVE, OWING, CEILING_LOCKED, LAPSED, PURCHASE_BLOCKED, PRODUCT_FROZEN)", and `concepts_brief.md` B9 lists the same six. The design silently extends this to **seven** states by adding `NO_PRODUCT` (G5, CUJ 1, precedence item 1). The extension may be sensible, but the document presents itself as implementing the rulings verbatim and never records this divergence — a fresh reader cannot tell whether the seventh state is owner-sanctioned or an unauthorized addition.

### 2. Severity: Major
**Affected Scope:** CUJ 5 (line 100) and §3.4 T6b bullet (line 257) vs. §3.4 commission-enrollment paragraph (line 265). CUJ 5 says switch-back requires "calls remaining **and not expired**"; the T6b branch is defined only for a "frozen **USABLE**" subscription. Yet line 265 states switch-back "requires active enrollment, **usable-or-expired** subscription". These contradict each other: a reader cannot determine whether an expired frozen subscription can be unfrozen (all other text routes frozen-expired subscriptions to the fresh-grant path T2/T6c, which expires the stale row and creates a new bill).

### 3. Severity: Major
**Affected Scope:** §3.6 `monetization_state` precedence list, item 4 (line 303). `PURCHASE_BLOCKED` is "only surfaced when a purchase/switch attempt was just blocked, **or when `LAPSED` + `total_unpaid_paisa >= 1000`**". Since the list is declared "evaluated in strict priority order" and `LAPSED` (item 3) matches that exact condition first, the second disjunct is unreachable by the stated evaluation — the server can never classify a driver as `PURCHASE_BLOCKED` via it. What "just blocked" means as an input to a server-side state evaluation (a request flag? client-side display override?) is never defined, so this state's production path is unspecified.

### 4. Severity: Major
**Affected Scope:** §3.3 view SQL, `active_self_bill` CTE (lines 219–227) vs. the canonical usable predicate (lines 155, 256, §3.5 line 283). Every prose statement of the usable-subscription predicate includes `status='active'`; the view's CTE checks only `frozen_at IS NULL`, `expires_at > now()`, and the calls condition, omitting `s.status = 'active'`. A suspended (or otherwise non-active) subscription with a future expiry and calls remaining would pass the self-bill carve-out in the view while dispatch/lead billing treat it as unusable — precisely the cross-consumer drift (view vs. lib helper vs. dispatch query) the design claims to make structurally impossible and pins with the drift-guard test.

### 5. Severity: Major
**Affected Scope:** S4 (line 185, F-7/F-10), S5 (line 187, "Structural F6"), S6 (line 190, F-4), §3.3 (line 194, "Structural F1"), response shape (line 263, F-11), Callback (line 271, F-1 and F-3), §3.9 (line 342, F-10), Item 5 (line 426, F-2), §3.5 (line 283, "Codebase A3"), lines 187/383 ("MFS settlement snapshot"), and "Gate-2 correction 2" (line 431). An entire finding-ID family (F-1, F-2, F-3, F-4, F-6, F-7, F-10, F-11, "Structural F1/F6", "Codebase A3") is cited roughly ten times as load-bearing rationale, but none of these IDs is defined in this document or in any linked companion (`concepts_brief.md` references "zoom_out F2/F3" and "B3/F4" only in passing, without definitions). Likewise "MFS" is never expanded anywhere in scope, and the enumerated Gate-2 corrections are not carried anywhere a fresh reader can consult. The claims these citations support (e.g., "F-4's purpose-blind-sum corruption is structurally impossible") cannot be verified or even understood from the available artifacts.

### 6. Severity: Major
**Affected Scope:** CUJ 1 (line 76), D4-mandated `registered_drivers_no_product` counter, and the Detailed Implementation Plan's claim (line 399) that "every file touched by this design appears exactly once." The counter is mandated by CUJ 1 and the owner disposition D4, but none of the 45 implementation items creates or records it — no file, writer, or storage mechanism is assigned. The same gap applies to the "ops runbook note" promised at line 271 (queue depth/age now credit-bearing): an action item with no item and no file. Both deliverables exist only as statements.

### 7. Severity: Major
**Affected Scope:** G7 (line 51), CUJ 6 (line 106), Item 22 (line 515). The admin locked-drivers endpoint must return "aging" (and G7 promises "reason and aging"), but the design provides no mechanism to compute it: lockout/unlock events are info-level log lines (§3.8, not persisted), the view exposes no lock timestamps, `is_dispatch_locked` is recomputed transiently per read, and the view only reports current exposure. How long a driver has been locked is not derivable from anything the design specifies.

### 8. Severity: Major
**Affected Scope:** §Non-Functional Requirements (line 394) vs. §3.5 (line 288). The NFR states "No per-offer config or DB reads inside billing transactions," while §3.5's in-transaction classification explicitly performs "active enrollment (one indexed lookup inside the tx)" on every offer debit. These directly contradict; the reader cannot tell which constraint governs the implementation (and the NFR as written forbids the design's own central mechanism).

### 9. Severity: Minor
**Affected Scope:** §Alternatives Considered preamble (line 347) vs. headings A–G. The text says "all six were converged," but seven alternatives are listed. Alternative G (a `mode` column on `drivers`) comes from the brief's forbid-list, not its six weighed alternatives; the count as written is wrong.

### 10. Severity: Minor
**Affected Scope:** §3.6 `GET /api/driver/dues` (line 298) vs. Item 25 (line 532). The same dues payload field is named `total_unpaid_paisa` in one section and `total_unpaid_bdt` in the other; a fresh reader cannot tell whether these are one field or two.

### 11. Severity: Minor
**Affected Scope:** §3.9 Rollback (line 342). "settlement via `dues/pay` keeps working — it is part of the legacy surface already" is misleading for the subscription-bill leg: `subscription_settlement` purpose routing and `billsLedger.settleSubscriptionBill` are new code introduced by this design, not legacy surface. Settlement of open bills keeps working only because the rollback is a config write with no redeploy (the code remains), which is a different reason than the one given.

### 12. Severity: Minor
**Affected Scope:** The usable-subscription predicate (lines 155, 226, 256, 283). `calls_remaining = -1` (the unlimited-calls sentinel) is used in the central predicate and view SQL but is never defined anywhere in this document; its meaning ("unlimited") is only recoverable from the companion briefs. A naive reader cannot interpret the platform's core possession predicate from the design alone.

### 13. Severity: Minor
**Affected Scope:** Item 14, scheduler reconciliation invariant (line 473). The invariant keys on "no paid `driver_package` row in `payment_events`", assuming the reader already knows `payment_events` carries a `driver_package` purpose value and what "paid" means there. The document never introduces the existing purpose vocabulary it builds its correctness invariant on.

### 14. Severity: Nit
**Affected Scope:** Verification Plan (line 646). "regenerate `maestro/tools/testid-manifest.cjs`" names the generator script as if it were the generated artifact; the regenerated artifact is the testID map (the tool is run, not regenerated). As written it instructs regenerating a source file.

### 15. Severity: Nit
**Affected Scope:** §3.3 filter-pushdown note (line 248). The claimed per-dispatch cost "O(candidates × their open bills)" understates the commission leg of the view, which is per-candidate an indexed scan over that candidate's lifetime completed commission rides (bounded, but not proportional to open bills).

### 16. Severity: Nit
**Affected Scope:** CUJ 5 (line 100) and S3 (line 175) vs. line 265. "Supersede sequence" is used twice before its only in-document explanation ("the existing expire-any-active-sub behavior at `lib/activateSubscription.ts:32-35`") appears much later in §3.4; a fresh reader first meets the term undefined.
