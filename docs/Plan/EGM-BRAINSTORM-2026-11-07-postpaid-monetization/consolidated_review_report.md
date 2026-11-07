**Purpose:**     Consolidated review report — cross-stage synthesis of the five-stage EGM review of `DESIGN-POSTPAID-MONETIZATION.md`. The actionable deliverable of the review loop: every raw finding deduplicated, prioritized, and traceable to its source. Feed dispositions from here into the correction cycle.
**Owner:**       Elephant (EGM review session, for Zia)
**Status:**      DISPOSITIONED — ALL findings ACCEPTED (0 contested) by owner on 2026-11-07; corrections applied to `DESIGN-POSTPAID-MONETIZATION.md`; document promoted to IMPLEMENTATION-READY. Rulings: `owner_dispositions_review_2026-11-07.md`. Closure summary: C-B1 §3.5/Item 13/39-40 rewrite; C-B2 option b (resolve-under-lock, no metadata column); M-01/M-24 durable mode binding (S7 `dispatch_offers.monetization_mode`) + locked enrollment read + Item 14 G1 ride-grain audit; M-02 unified OFF-mode contract; M-03 view SQL fixed; M-04 dual-lane purchase + deprecated dues stubs; M-05/06/07 coherent descope (6 server states + client 409 banner, divergence recorded); M-08 usable-only unfreeze; M-09 price floor; M-10 fraud bound in-doc; M-11 NFR exception enumerated; M-12 signatures pinned; M-13 `postpaid_cutover_at`; M-14 SQL predicates pinned; M-15 per-reason aging; M-16 new dedicated store + `active_subscription` payload; M-17 Items 46-47 (6 suites + 2 meta tests); M-18 Item 24 subscription-checkout; M-19 Items 26/27/48 home+route frozen rendering; M-20 inline seed SQL; M-21 Item 15 removed (WS hint deferred); M-22 Appendix A legend; M-23 success metrics; N-01..N-11 applied (incl. waiveBill removed per Z5-F4, ASCII repaired, alternatives count fixed, style normalization on flagged spots).
**Source of truth:** The four stage reports in this folder are the verbatim raw record; this file is the deduplicated, prioritized synthesis.
**Related (concrete paths):**
  - `DESIGN-POSTPAID-MONETIZATION.md` — the audited target (649 lines, unchanged since drafting)
  - `zoom_out_report.md` (Stage 5), `comprehension_report.md` (Stage 6), `critic_report.md` (Stage 7, 3 lenses), `intermediate_zoom_out_report.md` (Stage 8), `implementation_readiness_report.md` (Stage 9, 3 lenses)
**Last verified:** 2026-11-07, by Elephant
**How to update:** Elephant records dispositions (PROPOSE FIX / CONTEST / ACCEPT) against each consolidated ID; raw reports are never edited.

---

# Consolidated Review Report

**Target:** `docs/Plan/EGM-BRAINSTORM-2026-11-07-postpaid-monetization/DESIGN-POSTPAID-MONETIZATION.md` (lines 1–649)
**Review mode:** Consolidated (uninterrupted full flow) — Stages 5 → 6 → 7 → 8 → 9

## Reviewer Status

| Stage | Reviewer(s) | Status |
| --- | --- | --- |
| 5 Initial Zoom Out | egm-zoom-out | completed |
| 6 Comprehension Test | egm-comprehension | completed |
| 7 Critic Review | egm-design, egm-structural, egm-style | completed (3 sessions) |
| 8 Intermediate Zoom Out | egm-zoom-out | completed |
| 9 Implementation Readiness | egm-implementation-readiness, egm-codebase-details, egm-style | completed (3 sessions) |

**Methodology disclosures:** (1) The document was NOT revised between stages, so Stage 8 audited the same text and confirmed every earlier finding still live (it also closed one Stage-7 finding as already-scheduled — see traceability). (2) The EGM standards pack (`zoom-out-standard`, `feature-spec-standard`, `implementation-readiness-standard`) is NOT installed in this environment; every stage ran on the personas' inline REVIEW audit vectors, and each stage report records this. (3) `docs/harnesses.md` is absent; direct dispatch from the Elephant was used, as the consolidated flow itself prescribes. (4) Nine fresh reviewer sessions total; no retries were required.

**What survived audit (recorded for balance):** every pinned code citation in the design was independently verified accurate by at least one lens (and most by three), including all file paths, line anchors, the view arithmetic (৳400 + ৳100 vs ৳500), filter-pushdown soundness, grant-before-bill transactional ordering, and the Create-target collision sweep (migration numbering supports `<next-sequential>`; latest migration is 0091). The falsified-claims count is zero; the findings below are omissions, contradictions, and under-specifications.

---

## 🔴 BLOCKERS (2)

### C-B1 — Commission-mode rides can never be accepted: the legacy accept-time revenue guard is missing from the change plan
* **Consolidates:** Z5-F1 (Blocker); Z8-B-1 (architectural escalation, verified in code); comprehension/Critic context.
* **Affected Scope:** §3.5 L290 (accept-time snapshot), Item 13 `utils-server/index.ts` (L465–468), §3.7 transition map, M-14 restatement (L292), tests 39/40.
* **Finding:** `executeMatchFlow` (`utils-server/index.ts:2468-2482`) hard-rejects any accept whose driver has no `call_ledger` deduction row (`if (!deductionRow) return "no_deduction"`), on both the manual accept path (index.ts:1695-1698) and auto-accept (`runAutoAccept`, :2984-2990). Under `hybrid`, commission drivers by design produce no deduction rows — so every commission-driver accept fails, CUJ 3 is unachievable, and G1 is violated by construction. This is the same "legacy consumer corrupts the new mode" class the design exterminates elsewhere (orphan sweep, repair fallthrough, blind sum) — its one executable instance was missed. Stage 8 confirmed the guard verbatim in the working tree and ruled the fix architectural: a §3.5 sub-section rewrite defining accept-proof per mode (commission-mode acceptance proved by the live `dispatch_offers` row instead of a deduction row), rippling into Item 13, the M-14 restatement, and invariant tests 39/40.
* **Disposition needed:** PROPOSE FIX — rewrite §3.5 accept-proof per mode + Item 13 bullet + test 39/40 assertions.

### C-B2 — The bill↔settlement linkage routes through `payment_events.metadata`: a column that does not exist and is absent from the additive schema plan
* **Consolidates:** CR-A1 (Major); IR-A1 (Blocker); Z8-D-6 re-verification (column list confirmed, `schema.ts:1051-1071`).
* **Affected Scope:** §3.4 Settlement (L269); §3.2 S1–S6 (L157–190); Item 1, Item 2, Item 6.
* **Finding:** `payment_events` has no `metadata` column, no S-item adds one, and the write-owner (`lib/paymentEvents.ts`) carries no metadata parameter — the specified linkage is unimplementable as printed, and fixing it requires a design decision, not an edit: **(a)** add `payment_events.metadata jsonb NULL` to Item 1/Item 2 plus the write-owner change, or **(b)** promote the fallback to the ONLY mechanism ("resolve the driver's single open `subscription_purchase` bill under lock" — guaranteed unique by `driver_bills_one_open_uq`) and delete the metadata wording. Option (b) is the smaller-diff path and matches the S2 uniqueness guarantee; option (a) is more explicit but adds a schema column to a high-risk table.
* **Disposition needed:** OWNER DECISION — pick (a) or (b); the document must carry exactly one.

---

## 🟡 MAJORS (23)

### M-01 — G1 exclusivity: offer-time classification and accept-time snapshot are not durably bound; the enrollment read is unlocked
* **Consolidates:** CR-A4, CR-A5; Z8-B-3 (root-cause generalization); feeds C-M-NEW (see M-24 context in traceability).
* **Affected Scope:** §3.5 L288–290; G1 (L45); Items 12/13.
* **Finding:** A commission driver who receives a zero-debit offer and buys a call package (T6c) before accepting gets a free unbilled ride (snapshot flips to `subscription` at accept); the reverse direction double-charges. Additionally the enrollment lookup inside the debit tx has no `FOR UPDATE`, so a switch landing between read and commit yields an offer neither debited nor accruable. Stage 8's root fix: bind the mode ONCE durably inside the classification transaction (stamp the snapshot there, or carry the offer's classification onto the accept stamp) and lock the enrollment row.

### M-02 — Kill-switch semantics are internally contradictory at the mechanism level, and rollback is not state-safe for frozen/enrolled drivers
* **Consolidates:** CR-A3; Z8-B-2 + D-3 (verified consumers at `dispatch.ts:183-185`, `leadBilling.ts:60,105`, `index.ts:2890,2970,2976,3078`).
* **Affected Scope:** §3.5 L279–290; §3.9 L342; Items 11/12/13.
* **Finding:** Item 12 retires the `revenueModel` parameter; Item 13 keeps it for the OFF-mode legacy path — mutually exclusive, and both are asserted. The parameter has live consumers beyond per-driver debit (auto-accept early-return, `lead_cost_calls`, leadBilling's commissionOnly gate). Separately, §3.9's rollback ignores drivers holding `frozen_at` subscriptions + active enrollments: legacy pool semantics would make their frozen paid-up calls spendable again, violating D2/CUJ 5. Resolution: enumerate every kill-switch-gated layer (pool predicate, per-row classification, auto-accept gate, payload derivation, accept snapshot write — IR-A12), pick ONE OFF-mode story, and extend the rollback safety list to possession state.

### M-03 — The view's `active_self_bill` CTE omits `status = 'active'` — the printed SQL drifts from the canonical usable predicate it exists to enforce
* **Consolidates:** Cmp-F4; CR-A6 (independent double-discovery).
* **Affected Scope:** §3.3 L219–227.
* **Finding:** The CTE checks `frozen_at IS NULL AND expires_at > now() AND calls`, but not `s.status='active'` — the first term of the predicate defined at L155/L256/L283. Latent today, but it is precisely the drift class the design claims to make structurally impossible. One-line fix to the printed SQL.

### M-04 — Client-compatibility during the EAS propagation window is unhandled (dues field removal AND the purchase checkout removal)
* **Consolidates:** CR-A8; Z8-B-4 + D-1 (the purchase-side consequence no other stage caught).
* **Affected Scope:** §3.6 L298; §3.9 Stage 3 L341; §3.4 L259–263; Items 16/17/24.
* **Finding:** API changes deploy immediately; client updates take days-to-weeks. (a) Removing `revenue_model` and redefining `total_outstanding_bdt` breaks old builds polling the canonical endpoint — violating the design's own additive-response principle (F-11) in exactly the window §3.9 protects. (b) Bigger: the rewritten purchase route removes invoice initiation for ALL callers — an old client tapping "Buy ৳400" gets granted calls plus an open bill with no checkout and no dues itemization to reveal it (invisible debt; money-safe but support-hostile, contradicting G6/G8). Resolution: client-version floor or config-gated legacy path; deprecated stubs for removed/redefined fields; an explicit old-client purchase policy in Stage 3.

### M-05 — No persisted lifecycle events: lockout "aging", `registered_drivers_no_product`, and server-side PURCHASE_BLOCKED are all underivable
* **Consolidates:** Cmp-F6, Cmp-F7; Z5-F2 (partial); Z8-B-5 (shared-root generalization).
* **Affected Scope:** G5/G7 (L49, L51); CUJ 1; §3.8 L332; §3.6 L303; Item 22.
* **Finding:** Lockouts are info-level logs, switches are row mutations without history, blocks are request-scoped 409s — so none of the three D4/D7-mandated deliverables can be computed. Resolution (owner decision): accept one minimal persisted transition store (single-writer at the three enforcement points §3.8 names) OR descope aging + counter + the second PURCHASE_BLOCKED disjunct as log-only observability, coherently. Per-symptom patches are the dead-end.

### M-06 — PURCHASE_BLOCKED precedence rule 4 is dead text, and its server input is unspecified
* **Consolidates:** Cmp-F3; Z5-F2; CR-A10.
* **Affected Scope:** §3.6 L303.
* **Finding:** "Just blocked" is client interaction memory the endpoint cannot know; the `LAPSED + unpaid ≥ 1000` disjunct is unreachable because LAPSED (priority 3) matches first. Recommended resolution (zoom-out): PURCHASE_BLOCKED becomes a client-rendered banner after the typed 409; the standing lapsed+owing condition stays under LAPSED with the pay CTA. Simplifies to 6 server states + 1 client state.

### M-07 — The 6→7 state divergence from D7 is silently absorbed instead of recorded
* **Consolidates:** Cmp-F1; Z5-F2 (governance half).
* **Affected Scope:** G5 L49; header claim L7; D7 (`owner_dispositions_2026-11-07.md:77`).
* **Finding:** D7 rules a 6-state banner; the design ships 7 (adds NO_PRODUCT, supported by D4's choice card). Per the repo protocol ("rulings beat artifacts — divergence recorded in-file"), the extension must be recorded explicitly in the document, not silently absorbed.

### M-08 — CUJ 5 / T6b say switch-back requires a USABLE frozen subscription; §3.4's enrollment paragraph says "usable-or-expired"
* **Consolidates:** Cmp-F2.
* **Affected Scope:** CUJ 5 L100; §3.4 L257 vs L265.
* **Finding:** Direct contradiction on whether an expired frozen subscription can be unfrozen. Per D2's mechanics (and the T2/T6c routing everywhere else), pin: unfreeze requires usable (`expires_at > now() AND calls_remaining > 0`); expired frozen rows route to the fresh-grant path.

### M-09 — Sub-৳10 priced call packages create an unrecoverable open-bill deadlock
* **Consolidates:** CR-A2.
* **Affected Scope:** §3.3 L249 (price cap only, no floor); S2 index L172; §3.4 L260, L269; `dues/pay+api.ts:33,115-117`.
* **Finding:** A 1–999 paisa package is admin-creatable; its purchase opens a bill that (a) permanently occupies the one-open-bill slot, (b) can never be settled (below `MIN_PAYMENT_BDT`), (c) has no waiver UI in launch scope. Fix: minimum call-package price ≥ 1,000 paisa (symmetric to the D1 ceiling floor), or a full-bill exception to the settlement minimum.

### M-10 — D3's mandated fraud-exposure figure is absent from the document
* **Consolidates:** CR-A7.
* **Affected Scope:** §3.4 L254 (only fraud mention); D3 (`owner_dispositions_2026-11-07.md:54-57`).
* **Finding:** D3 requires documenting expected maximum fraud exposure per account as `min(max_package_price_paisa, ceiling_paisa)` (40,000 paisa / ৳400). The bound appears nowhere. Add it where the fraud gate is specified.

### M-11 — The NFR forbids the design's own central mechanism
* **Consolidates:** Cmp-F8; Z8-D-6 (settle wording together with M-01).
* **Affected Scope:** NFR L394 vs §3.5 L288.
* **Finding:** "No per-offer config or DB reads inside billing transactions" contradicts the classification tx's indexed enrollment lookup. Reword: "no per-offer CONFIG reads; the classification transaction's single indexed possession lookup is the enumerated exception" — after M-01 decides the transaction shape.

### M-12 — Money-lib function signatures are ellipses; contract details are left to the implementer
* **Consolidates:** IR-A2.
* **Affected Scope:** Items 3, 4, 5.
* **Finding:** Params/returns/error types unpinned for `enrollCommission`, `switchBackToCallPackage`, `endActiveEnrollment`, `createOpenBill` (return), `ensureCommissionPackage` (executor), and the grant's inputs. Enumerate each signature — for single-writer money libs this is contract, not trivia.

### M-13 — The reconciliation invariant's "postpaid cutover" has no pinned marker
* **Consolidates:** IR-A3.
* **Affected Scope:** Item 14.
* **Finding:** No config key/timestamp defines the cutover moment, so invariant (1) is unimplementable. Pin: `platform_config` key `postpaid_cutover_at`, written during Stage-3 activation; job no-ops until set.

### M-14 — NO_PRODUCT/LAPSED boundary predicates and "latest subscription" ordering are undefined SQL
* **Consolidates:** IR-A5.
* **Affected Scope:** Item 17 / §3.6 precedence items 1 and 3.
* **Finding:** "No lapsed subscription history" and "latest subscription is expired" have no SQL definition (which rows count? frozen-expired? ordering key?). Pin exact predicates or screens 26/17 will diverge.

### M-15 — Admin "aging" has no derivable source, and the enumerated driver set is ambiguous
* **Consolidates:** Cmp-F7; IR-A4; depends on M-05's substrate decision.
* **Affected Scope:** Item 22; G7; §3.8.
* **Finding:** With derived-only lockout there is no lock timestamp to age from, and "locked drivers" is ambiguous against the pool's three exclusion reasons. Pin per-reason aging sources (e.g., ceiling → earliest open bill `created_at`; lapsed → `expires_at`; no_product → driver `created_at` or drop) and the enumerated set.

### M-16 — Driver state store selection is deferred to the implementer, and the dues payload lacks the active-subscription fields the lapse timer needs
* **Consolidates:** IR-A6.
* **Affected Scope:** Item 29 with Items 17/26.
* **Finding:** (a) "no new store unless none fits" hands a design decision to the implementer (affects screens 24–28 + `lib/authCleanup.ts` registry). (b) Item 26's lapse timer needs `expires_at` in ACTIVE state but Item 17's payload has no non-frozen subscription fields. Pin the store (or decision criteria + preferred candidate) and add `active_subscription: {id, calls_remaining, expires_at} | null` to the payload.

### M-17 — Test-plan completeness failures: six existing suites omitted, one test misplaced, the concurrency gate registry unextended, and the seeds meta test unupdated
* **Consolidates:** IR-B-M1, IR-B-M2, IR-B-M5; IR-A7; IR-B-N4.
* **Affected Scope:** Items 36–45 vs `tests/api/driver/commission-settlement.test.ts`, `tests/api/package/{purchase-gate,vehicle-scoping,active-grant-code}.test.ts`, `tests/api/admin/{packages,config-audit}.test.ts`, `tests/meta/concurrency-gate.test.ts` (`GATED_HARNESSES`), `tests/meta/platform-config-seeds-not-constants.test.ts`.
* **Finding:** Implementing items 16/17/18/20/21 breaks six existing suites absent from the plan (falsifying the L399 "every file appears exactly once" claim); Item 40's view-SQL test sits in the DB-less `tests/meta` lane; new concurrency harnesses (41–43) are unregistered in `GATED_HARNESSES`; Item 32's new seeds break the seeds-not-constants pin. Add/extend the six suites as Modify items, move or split Item 40, register the harnesses, extend the meta test.

### M-18 — Second live purchase surface `subscription-checkout` (and the shop-owner screen) is unhandled
* **Consolidates:** IR-B-M3.
* **Affected Scope:** Item 24 vs `app/(main)/(rider)/subscription-checkout/index.tsx:74`, `app/(main)/(shop-owner)/index.tsx:279`.
* **Finding:** `subscription-checkout` POSTs the purchase route and is production-navigable; Stage 3's response-contract change reaches it with no handling. Add a screen-handling item; triage the shop-owner call.

### M-19 — Frozen-calls rendering is wallet-only; the driver home calls widget and `/api/package/active+api.ts` are unaddressed — a D2 violation on the primary surface
* **Consolidates:** IR-B-M4.
* **Affected Scope:** Items 26/27 vs `d/(tabs)/index.tsx:373,1437-1453`, `d/(tabs)/_layout.tsx:57`, `app/api/package/active+api.ts`.
* **Finding:** CUJ 5 requires frozen calls to never render as spendable; only Item 27 (wallet) implements it. The home screen fetches and renders `calls_remaining` from a route absent from the 45 items. Extend Items 26/27 and add the `package/active` route item.

### M-20 — The seed script (bare-node CJS) cannot import the TS lib; `ensureCommissionPackage`'s runtime invocation point is unpinned
* **Consolidates:** IR-A8; IR-B-M6.
* **Affected Scope:** Item 32 + Item 4; `scripts/seed-platform-config.js`, `lib/monetizationMode.ts`.
* **Finding:** `require('../lib/monetizationMode')` from a CJS script fails on `.ts`. Pin: inline SQL in the script (mirroring the helper as one documented contract) or a tsx runner; and pin where `ensureCommissionPackage()` is invoked at runtime (seed only / boot / admin).

### M-21 — WS `billing_state_invalidated` transition-detection mechanism is unspecified; the recommended resolution is to defer the hint entirely
* **Consolidates:** IR-A9; Z8-D-5 (YAGNI recommendation).
* **Affected Scope:** OQ1 L65; Items 13/15/26.
* **Finding:** Dispatch is stateless (T7) — detecting lockout transitions needs a baseline mechanism that either contradicts TD-11/TD-15 or violates DERIVED-only, to deliver what the canonical 60s poll already delivers. Pin: defer the hint to post-launch (recommended; deletes Items 13/15 WS portions and the `types.ts` event) or specify in-memory best-effort emission.

### M-22 — The load-bearing citation-ID family (B2–B8, M-x, F-1–F-11, Structural F1/F6, Codebase A1/A3, MFS, Gate-2 corrections) is undefined for a fresh implementer
* **Consolidates:** Cmp-F5; Z8-B-6.
* **Affected Scope:** ~15 citation families across L41–L395.
* **Finding:** The document calls itself "the only carrier into implementation" while its rationale resolves against artifacts a fresh implementer cannot consult (some IDs defined nowhere). Add an in-doc citation legend (appendix: one line of meaning + source path per ID) or inline the ~10 load-bearing claims.

### M-23 — No success metrics are defined for launch or for G7's observability
* **Consolidates:** CR-A compliance note.
* **Affected Scope:** Goals/NFR.
* **Finding:** No measurable launch criteria (receivables aging targets, postpaid adoption, lockout-event baselines). Add metrics or record the gap as an accepted trade-off.

### M-24 — G1 has no ride-grain enforcement or reconciliation anywhere: a ride falling through the M-01 windows leaves zero drift signal
* **Consolidates:** Z8-(c) (new architectural weakness named by neither earlier stage); depends on M-01's fix.
* **Affected Scope:** G1 L45; Item 14; Item 40; §3.8 L334.
* **Finding:** Item 14 audits subscription↔bill pairing; Item 40 audits the owed-figure across read paths; the §3.4 invariant test covers only one direction. Nothing asserts that a completed post-cutover ride with `snapshot='subscription'` actually produced a deduction pair, or that a `'commission'` ride accrued (or had a 0% basis). Extend Item 14's job (or add a completion-time assertion) to carry G1 per completed ride — converting it from AGENTS.md prose into an auditable invariant.

---

## 🟢 NITS (consolidated; 11 groups)

### N-01 — Documentation precision pack (merge into the correction pass)
Consolidates: Cmp-F9/F10/F11/F12/F13/F16; CR-B-F3/F4/F5; CR-A-F9/F12/F13/F14; Z5-F6.
Items: "all six" → seven alternatives (L347); `total_unpaid_bdt` → the actual screen field is `total_outstanding_bdt`, the new payload field is `total_unpaid_paisa` (Item 25); rollback "legacy surface" wording for the subscription-bill leg (L342 — new code kept working because rollback is a config write, not because it is legacy); define the −1 unlimited sentinel in-doc; introduce the `payment_events` purpose vocabulary before the Item 14 invariant uses it; first-use ordering for "supersede sequence"; S3 add `created_at`/`updated_at` (AGENTS.md table rule); T6b response contract missing (L263); trial-branch placement in the new gate order made explicit (must run after settle-first re-check, inside call-package routing — `activateSubscription` expires any active sub incl. frozen); T7 wording precision (the scheduler expiry flip IS a possession mutation; the invariant is that no writer touches `driver_bills`/`commission_enrollments` on lapse); `bill_id` ownership scope-check sentence; "byte-identical" header claim → "body content identical; header metadata finalized"; "(Section 3)" anchor on the Technical Plan heading; `ENUM_KEYS.revenue_model` not ALLOWED_KEYS (Item 20); `leadBilling.ts:245-252` is the correct cite for the commission shape (not :105-110) (Item 12); Item 30 locale paths concretized to `i18n/locales/{en,bn}/common.json`; Item 6 extension point is `PortposPaymentInitiation.purpose` (:31), not :70; "extend IDEMPOTENCY_ROUTES" is a no-op (`driverDuesPay` already registered).

### N-02 — ASCII diagram repairs
Consolidates: CR-B-F1, CR-B-F2.
Bottom border 2 columns short (L131: add 2 `─` before `┘`); label-row pipes off-rail at columns 50/69/91 vs rails 49/68/89 (L133).

### N-03 — Kill-switch Stage-2 preflight
Consolidates: CR-A11; Z8-(a)3 residue.
Add a one-line Stage 1/2 preflight assertion that the live `revenue_model` value is `subscription_only` before deploying (the narrowed parser silently re-defaults `commission_only`).

### N-04 — balanceScore 0.5 false precision
Consolidates: Z8-D-4.
Either define the subscriber score scale (making 0.5 meaningful) or rank within mode cohorts; admit it is a tunable otherwise.

### N-05 — Defer the WS hint (overlaps M-21)
Consolidates: Z8-D-5.
If M-21 resolves to "defer", delete the `types.ts` event (Item 15), the Item 13 emission, and the Item 26 hook.

### N-06 — Stranded dust is a dead pay target on the dues screen
Consolidates: Z8-D-2.
Suppress commission dues below the settlement floor from the pay path and/or display, or let dust piggyback on a bill settlement — otherwise the itemized UI renders a pay control that always fails the minimum (Copy Truth violation).

### N-07 — Idempotency-key format + 23505 code pins
Consolidates: IR-A11, IR-A15.
Pin the deterministic settlement key pattern (e.g., `subscription_settlement_<billId>` — fits varchar(64)) and the 23505 → `dues_outstanding_purchase_blocked` mapping so lib error type and route mapping agree.

### N-08 — View typing + snapshot kill-switch gate + grep-completeness step
Consolidates: IR-A13, IR-A12, IR-A14.
Pin pgView-vs-raw-SQL typing for Item 8's return; gate the accept-time snapshot write on `hybrid` (OFF mode writes nothing, preserving the D5 NULL boundary); add `grep getRevenueModel utils-server/__tests__` as Item 38's closing step (offer-path suites may mock it too).

### N-09 — Admin revenue readers two-lane note
Consolidates: IR-B-N6.
`app/api/admin/dashboard+api.ts` / `driver-economics+api.ts` report commission-only platform revenue; postpaid splits revenue into two lanes. Add a ruling item (extend the readers) or a Non-Goal line.

### N-10 — DetailedRange style pack (merge into the correction pass)
Consolidates: IR-C-1..16.
Item 42 "leaves neither" → name both rows; Item 29 "fits" → checkable criterion; Item 14 nested-parenthetical → bullet list; plus the 13 minor register items (echoes, legalese, anthropomorphisms, slogans, caps discipline, vague qualifiers, cryptic labels, provenance trailer).

### N-11 — FeatureRange style pack (merge into the correction pass)
Consolidates: CR-C-F1..F11.
ALL-CAPS emphasis → normative keywords only; unverifiable business-effect claims → label as expected outcome or delete; duplicated normative content (T6 double-spec, gate re-spec, OQ2 second sentence) → single-owner + cross-reference; colloquial metaphors → literal phrasing; "structurally impossible" tic; subjective qualifiers; filler intensifiers; coined jargon (zero-disruption, fast-fail UX, credit-bearing, pool-slot burn, construction-guaranteed); overlong enumeration sentences → bullets; terminology/numeral consistency; usable-predicate named once with the SQL as authoritative copy.

---

## Traceability Matrix (raw finding → consolidated item)

| Consolidated | Raw findings |
| --- | --- |
| C-B1 | Z5-F1; Z8-B-1 (+ Z8-(a) re-verification) |
| C-B2 | CR-A1; IR-A1; Z8-D-6 |
| M-01 | CR-A4; CR-A5; Z8-B-3 |
| M-02 | CR-A3; Z8-B-2; Z8-D-3 |
| M-03 | Cmp-F4; CR-A6 |
| M-04 | CR-A8; Z8-B-4; Z8-D-1 |
| M-05 | Cmp-F6; Cmp-F7; Z5-F2 (aging/counter halves); Z8-B-5 |
| M-06 | Cmp-F3; Z5-F2 (state half); CR-A10 |
| M-07 | Cmp-F1; Z5-F2 (governance half) |
| M-08 | Cmp-F2 |
| M-09 | CR-A2 |
| M-10 | CR-A7 |
| M-11 | Cmp-F8; Z8-D-6 |
| M-12 | IR-A2 |
| M-13 | IR-A3 |
| M-14 | IR-A5 |
| M-15 | Cmp-F7; IR-A4 |
| M-16 | IR-A6 |
| M-17 | IR-B-M1; IR-B-M2; IR-B-M5; IR-A7; IR-B-N4 |
| M-18 | IR-B-M3 |
| M-19 | IR-B-M4 |
| M-20 | IR-A8; IR-B-M6 |
| M-21 | IR-A9; Z8-D-5 |
| M-22 | Cmp-F5; Z8-B-6 |
| M-23 | CR-A compliance note |
| M-24 | Z8-(c) |
| N-01 | Cmp-F9, F10, F11, F12, F13, F16; CR-A-F9, F12, F13, F14; CR-B-F3, F4, F5; Z5 reuse-note (IDEMPOTENCY_ROUTES); IR-B-N1, N2, N3, N5, N7; IR-A10 |
| N-02 | CR-B-F1; CR-B-F2 |
| N-03 | CR-A11; Z8-(a)3 |
| N-04 | Z8-D-4 |
| N-05 | Z8-D-5 |
| N-06 | Z8-D-2 |
| N-07 | IR-A11; IR-A15 |
| N-08 | IR-A13; IR-A12; IR-A14 |
| N-09 | IR-B-N6 |
| N-10 | IR-C-1..16 |
| N-11 | CR-C-F1..F11 |
| Closed by the document itself | CR-A16 (write-ownership sync) — Z8-(a)1 verified Items 34/35 already schedule it |
| Partially mitigated in-doc | Z5-F3/CR-C-F11 (TS-side predicate single-sourced; SQL-side nit stands as N-01 adjacent) |

**Raw finding totals:** Stage 5: 6 · Stage 6: 16 · Stage 7: 33 (design 16 + structural 6 + style 11) · Stage 8: 15 · Stage 9: 38 (readiness 15 + codebase 13 + style 16) = **108 raw findings → 2 Blockers + 23 Majors + 11 Nit groups**, plus 1 finding closed as already-scheduled and 2 recorded as partially mitigated.

## Decision points for the owner (extracted from the above)

1. **C-B2**: bill↔event linkage — add `payment_events.metadata jsonb` (option a) or resolve-single-open-bill-under-lock as the only mechanism (option b, recommended by two lenses for smaller diff).
2. **M-05 / M-15 / M-06**: persisted transition store vs coherent descope of aging + no-product counter + PURCHASE_BLOCKED server state.
3. **M-02**: the ONE kill-switch OFF-mode story, with the gated-layer list.
4. **M-04**: client-compatibility policy (version floor vs config-gated legacy path) + old-client purchase policy for Stage 3.
5. **M-21**: defer the WS hint (recommended) or pin its detection mechanism.
6. **M-09**: minimum package price floor vs full-bill settlement exception.
