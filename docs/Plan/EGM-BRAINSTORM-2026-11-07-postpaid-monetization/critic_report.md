**Purpose:**     Stage 7 (Critic Review) findings — `DESIGN-POSTPAID-MONETIZATION.md`, FeatureRange 1–396. Three lenses: egm-design, egm-structural, egm-style. Part of the consolidated EGM review (2026-11-07).
**Owner:**       Elephant (EGM review session, for Zia)
**Status:**      RAW FINDINGS — consolidated into `consolidated_review_report.md`
**Related:**     `DESIGN-POSTPAID-MONETIZATION.md` (target); personas `C:\Users\callz\.agents\agents\{design_critic,structural,style}.md`; standards pack (`feature-spec-standard`) NOT INSTALLED — persona-inline audit vectors applied.
**Last verified:** 2026-11-07, by Elephant (verbatim reviewer output)
**How to update:** Never edit raw findings; dispositions live in the consolidated report.

---

# Critic Report — Stage 7

Three independent reviewer sessions on FeatureRange lines 1–396.

---

## LENS A — egm-design (Design Critic)

### Finding 1 — Settlement bill routing depends on a column that does not exist
- **Severity:** Major
- **Affected Scope:** §3.4 Settlement (line 269); §3.2 S1–S6 (lines 157–190) omit the required change; verified `src/db/schema.ts:1048-1079`.
- **Discrepancy & Rationale:** The unified settlement flow states "The target `bill_id` is carried in the `payment_events` metadata written at initiation." `payment_events` has no `metadata` column (columns are id, user_id, driver_id, package_id, idempotency_key, provider, provider_txn_id, amount_bdt, status, initiated_at, confirmed_at, subscription_id, ride_id, purpose varchar(40), pass_id, created_at, updated_at). No S1–S6 schema change adds one, and `payment_events` rows are writable only through `lib/paymentEvents.ts` (AGENTS.md write ownership), whose `initiatePortposPayment` params carry no metadata. As written, the load-bearing bill↔event link is unimplementable: either an unstated additive column plus a write-owner change is required, or the parenthetical fallback ("the driver's single open bill is resolved under lock when absent") must be promoted to the primary mechanism. The document presents the broken option first and the workable one as an aside.

### Finding 2 — Sub-৳10 open bills create an unrecoverable purchase deadlock that contradicts D1
- **Severity:** Major
- **Affected Scope:** §3.3 view semantics (lines 246–249), §3.2 S2 unique index (lines 172–173), §3.4 T2 step 2 (line 260) and settlement minimum (line 269); verified `app/api/driver/dues/pay+api.ts:33,115-117`; ruling D1 in `owner_dispositions_2026-11-07.md:39-40`.
- **Discrepancy & Rationale:** Package validation caps price at `ceiling − 1,000` (line 249) but sets no minimum. A call package priced 1–999 paisa is admin-creatable, and its purchase creates an open bill below the ৳10 settlement minimum. That bill then: (a) permanently occupies the single open-bill slot — `driver_bills_one_open_uq` turns every future purchase into a 23505→409 (lines 172, 260); (b) can never be paid, because `MIN_PAYMENT_BDT = 1,000` rejects any settlement below ৳10; (c) has no self-service or launch-scope admin recovery, since `waiveBill` UI is explicitly deferred (line 326). D1 rules dust "stays in `driver_unpaid_obligations` to roll into the next payable settlement >= 1,000 paisa" — an open bill cannot roll (fixed amount, blocks the slot instead). The design's own cross-mode dust paragraph (line 273, "this never traps a driver") only analyzes commission dust and silently assumes obligations are settleable. Fix is one line of validation: minimum call-package price ≥ 1,000 paisa (symmetric to the ceiling floor it already specifies), or a full-bill exception to the settlement minimum.

### Finding 3 — Kill-switch rollback is not state-safe for frozen subscriptions and active enrollments, and §3.5/§3.9 contradict each other
- **Severity:** Major
- **Affected Scope:** §3.5 kill-switch definition (line 279) and per-row classification (line 288); §3.9 rollback (line 342); D2 (`owner_dispositions_2026-11-07.md:45-52`); CUJ 5 (lines 96–100); verified `utils-server/dispatch.ts:227-233,558`.
- **Discrepancy & Rationale:** §3.9 claims `revenue_model='subscription_only'` restores "legacy behavior everywhere, exactly today's code paths" and enumerates state safety only for bills, granted calls, and settlements. It ignores drivers who switched products during hybrid: they hold `frozen_at` subscriptions plus active enrollments. Under legacy pool semantics (join on `status='active'` only, plus the calls filter at dispatch.ts:558), a frozen holder re-enters the subscriber pool and their frozen paid-up calls become spendable and debit-eligible again — directly contradicting D2 ("`frozen_at IS NOT NULL` as inactive for call-package possession/debiting") and CUJ 5 ("never as spendable balance"). Conversely, if §3.5's per-row classification is read as unconditional (it is written without kill-switch qualification), then commission-only holders keep receiving zero-debit offers under `subscription_only`, which is *not* "exactly today's code paths" (legacy skips drivers with no active subscription at leadBilling step 1). The document must specify which semantics the kill-switch selects; each reading violates either D2 or the byte-for-byte legacy claim, and the rollback safety list must cover frozen/enrolled possession state.

### Finding 4 — Accept-time snapshot vs offer-time classification leaves a G1 window
- **Severity:** Major
- **Affected Scope:** §3.5 "Accept-time snapshot (M-3)" (line 290) vs in-transaction classification (line 288); G1 (line 45).
- **Discrepancy & Rationale:** G1 asserts "for any completed ride, exactly one of {lead debit, commission accrual} exists. No driver is ever double-billed for the same ride." The mechanism classifies billing mode at offer time but stamps `rides.monetization_mode_snapshot` at accept time from *re-derived live possession*. A commission driver who receives a zero-debit offer and buys a call package (T6c — plausible, a few seconds of app taps) before accepting gets: no lead debit (commission path) + snapshot `'subscription'` at accept + commission zeroed at completion → a free, unbilled ride. The symmetric direction (subscriber debited, settles ৳400 and freezes before accept) yields double charging, though it is implausibly fast. Stamping the snapshot in the same transaction as the offer-time classification (or carrying the offer's classification onto the accept stamp) closes the window; the design neither closes it nor acknowledges it.

### Finding 5 — Enrollment lookup inside the billing transaction is not locked
- **Severity:** Major
- **Affected Scope:** §3.5 "In-transaction classification" (line 288); G1 (line 45); §3.4 T6/T6b writers (lines 257, 261).
- **Discrepancy & Rationale:** Classification reads the active enrollment via "one indexed lookup inside the tx" with no `FOR UPDATE`, while `switchBackToCallPackage`/`endActiveEnrollment` commit under the separate `purchase_bill_` advisory lock. A product switch landing between the classification read and commit produces an offer that is neither lead-debited nor commission-billable (accept snapshot flips to subscription; completion zeroes) — a revenue leak violating G1. The reverse direction is already serialized (freeze must UPDATE the subscriptions row the debit tx holds FOR UPDATE), so only the commission→subscriber direction leaks; locking the enrollment row in the classification transaction fixes it at negligible cost. The design claims this construction is "the fix for B5's silent double-billing" but reintroduces a narrower version of the same class.

### Finding 6 — Canonical view SQL diverges from its own usable-predicate definition
- **Severity:** Major
- **Affected Scope:** §3.3 `active_self_bill` CTE (lines 219–227) vs the usable predicate at lines 155, 256, 283.
- **Discrepancy & Rationale:** The CTE checks `frozen_at IS NULL`, `expires_at > now()`, and calls, but omits `s.status = 'active'` — the first term of the usable predicate the design defines in three other places and makes a structural invariant (M-14 drift-guard; the whole point of the view being "THE one owed-figure"). No current writer produces `status='expired'` with calls remaining and future `expires_at`, so the divergence is latent, but the design's own thesis is that predicate drift is the corruption class to eliminate; the spec's printed SQL is itself drifted. Add `s.status = 'active'`.

### Finding 7 — D3's mandated fraud-exposure documentation is missing
- **Severity:** Major
- **Affected Scope:** §3.4 gate list (line 254) is the only fraud mention in the audited range; ruling D3, `owner_dispositions_2026-11-07.md:54-57`.
- **Discrepancy & Rationale:** D3 requires the design doc to "document expected maximum fraud exposure per account as `min(max_package_price_paisa, ceiling_paisa)` (40,000 paisa / ৳400)". The document (lines 1–396) never states this bound anywhere — the fraud gate is mentioned, the quantified exposure figure is not. The document header (line 7) claims dispositions are "implemented verbatim"; this is a concrete, checkable ruling deliverable that is absent.

### Finding 8 — Removing `revenue_model` from GET /api/driver/dues breaks un-updated clients during the EAS propagation window
- **Severity:** Major
- **Affected Scope:** §3.6 dues endpoint (line 298); §3.9 Stage 3 (line 341); OQ1 (line 65); verified `app/api/driver/dues+api.ts:58,62`.
- **Discrepancy & Rationale:** The design removes the `revenue_model` response field and redefines `total_outstanding_bdt` from commission-only to the true total. OQ1 makes this endpoint the canonical driver-state source polled every 60 seconds. API deploys are immediate; EAS/OTA client updates propagate over days to weeks (store review for new binaries). Old builds in the wild hit the new API: a removed field and silently redefined semantics violate the design's own additive-response principle (F-11, line 263) for exactly the rollout window §3.9 claims to protect. Keep the field as a deprecated stub until client rollout completes, or gate removal on a client-version floor.

### Finding 9 — `commission_enrollments` column list omits `created_at`/`updated_at`
- **Severity:** Nit
- **Affected Scope:** §3.2 S3 (lines 177–183).
- **Discrepancy & Rationale:** AGENTS.md mandates "All tables: uuid PKs, created_at/updated_at timestamptz." S3 lists only `started_at`/`ended_at`. Likely drafting brevity, but this document is the implementation source; the migration author will follow S3 as printed.

### Finding 10 — PURCHASE_BLOCKED precedence clause is dead text
- **Severity:** Nit
- **Affected Scope:** §3.6 state precedence (lines 299–306).
- **Discrepancy & Rationale:** The list declares strict priority order (LAPSED = 3 before PURCHASE_BLOCKED = 4), yet PURCHASE_BLOCKED's condition includes "or when LAPSED + `total_unpaid_paisa >= 1000`" — a state priority 3 always claims first. Either the ordering or the clause is wrong; as printed, one of the two cannot execute, and a client implementing the list literally will diverge from the server's `monetization_state`.

### Finding 11 — Stage 2 legacy-equivalence assumes, but never checks, the live config value
- **Severity:** Nit
- **Affected Scope:** §3.9 Stage 2 (line 340); verified `lib/platformConfig.ts:263-275`, `app/api/admin/config+api.ts:241`.
- **Discrepancy & Rationale:** The construction-guaranteed degradation argument presupposes `revenue_model='subscription_only'` is the production value at Stage 2 deploy. Nothing in the rollout requires verifying or resetting it. If the live value were `commission_only` (valid today), the narrowed `parseRevenueModel` silently re-defaults it to `subscription_only`, stranding any commission_only drivers with no diagnostic. A one-line Stage 1/2 preflight assertion closes it.

### Finding 12 — T6b response contract unspecified
- **Severity:** Nit
- **Affected Scope:** §3.4 branch list (line 257) and additive response (line 263).
- **Discrepancy & Rationale:** The response shape enumerates grant paths (`bill`) and T6 (`enrollment`) but not T6b (unfreeze + enrollment end, no bill, no grant), even though the driver's client must render the confirmation and refresh state for that branch too.

### Finding 13 — Trial path placement in the new gate order is ambiguous
- **Severity:** Nit
- **Affected Scope:** §3.4 gate order (line 254) vs "Trial (D4) … unchanged" (line 267); verified `lib/activateSubscription.ts:32-35`.
- **Discrepancy & Rationale:** "Unchanged" does not state where the trial branch sits relative to settle-first and the product-type routing. This matters: `activateSubscription` expires *any* active subscription in-tx, including frozen ones, and knows nothing of open bills. Only if the trial branch runs after the settle-first re-check and inside the call-package routing (usable-subscription 409, frozen T6b branch) can it never destroy an open bill or a frozen state. The design should say so explicitly.

### Finding 14 — T7 wording contradicts the possession model it asserts
- **Severity:** Nit
- **Affected Scope:** §3.7 T7 (line 325).
- **Discrepancy & Rationale:** "no writer mutates possession on lapse" is followed by "(scheduler expiry flip unchanged)" — but the flip sets `subscriptions.status='expired'`, which under the design's own possession-defines-mode rule is a possession mutation. The intended meaning (no writer touches `driver_bills`/`commission_enrollments` on lapse) should be stated precisely, since M-13's single-writer map is load-bearing.

### Finding 15 — `bill_id` ownership validation unstated
- **Severity:** Nit
- **Affected Scope:** §3.4 unified settlement (line 269).
- **Discrepancy & Rationale:** The design never states that the optional `bill_id` must be scope-checked to the authenticated driver before initiating settlement. Server-derived amount and the single-open-bill constraint limit the blast radius, but a cross-driver `bill_id` would otherwise let a caller attempt settlement routing against another driver's receivable; one sentence in the spec prevents the omission.

### Finding 16 — AGENTS.md write-ownership sync is not scheduled
- **Severity:** Nit
- **Affected Scope:** §3.7 T3b (line 319), T2 (line 317).
- **Discrepancy & Rationale:** T3b makes `lib/billsLedger` a new writer of `payment_events` status transitions and sole owner of `driver_bills`; AGENTS.md's write-ownership section is the authoritative ledger of such owners and (per its own rule) must be updated in the same change. The design defines the M-13 map internally but never schedules the AGENTS.md/CLAUDE.md sync its own program requires.

### Standard-compliance note (audit vector 1)
The document covers goals, non-goals, CUJs, architecture, alternatives, NFRs, and rollback thoroughly, but defines no success metrics (e.g., receivables aging targets, postpaid adoption, lockout-event baselines) against which G7's observability or the launch itself would be judged. Everything else in the compliance vector (risk treatment via Alternatives + rollback, cost shape via the ceiling/headroom invariants) is present.

### Verified-accurate claims (no finding)
All pinned line citations check out — purchase gate `purchase+api.ts:276-294` and trial path `:296-338`; `activateSubscription.ts:32-35` expire-any-active; orphan sweep `scheduler.ts:1169-1197` (callback_pending + `subscription_id IS NULL` — postpaid purchases create no events, so the sweep cannot see bills); `paymentRepair.ts:242-243` fallthrough; purpose unions `paymentEvents.ts:31,70` with `subscription_settlement` (23 chars) fitting varchar(40); commission branch `callback+api.ts:198-222`; rides-sum gate `dispatch.ts:291-322`; silent `billed=false` exits `leadBilling.ts:129-162,256-258`; zero-config-query rule `leadBilling.ts:44-53`; keep-in-step comment `commissionDues.ts:12-13`; `MIN_PAYMENT_BDT=1,000`; MFS snapshot precedent `complete+api.ts:430-435`; v6 hard-coded zero `complete+api.ts:192-194,261`; `packages_code_live_uq` `schema.ts:528,559`; `subs_one_active_per_driver` `schema.ts:658`; today's pool join checks only `status='active'`. The view's filter-pushdown claim is sound for non-MATERIALIZED single-reference CTEs, the dust/ceiling floor arithmetic (৳400 max package + ৳100 buffer vs ৳500 ceiling) is internally consistent, and grant-before-bill ordering in one transaction satisfies both the `subscription_id`/`due_at` dependency and AGENTS.md's transactional-money rule.

---

## LENS B — egm-structural (Layout Validator)

### Finding 1 — ASCII diagram: Postgres box bottom border is 2 columns short (Major)
Affected Scope: §3.1 code block, lines 125–131.
Discrepancy: Measured glyph columns — top border L125 has `┌`@22 and `┐`@103; side rails L126–130 carry `│`@103; the bottom border L131 ends `┘`@101. The bottom-right corner jogs 2 columns left of the right rail, so the "source of truth" box renders trapezoidal. Box-drawing integrity violation; add 2 `─` before `┘` on L131.

### Finding 2 — ASCII diagram: label-row pipes misaligned with connector rails (Minor)
Affected Scope: §3.1 code block, line 133.
Discrepancy: Rails above/below sit at columns 30/49/68/89 (verified on L132 and box-top `┴` on L134). The label row's decorative pipes sit at 30/50/69/91 — "dispatch ceiling" +1, "completion" +1, "dues/config" +2 off-rail, and padding is inconsistent (first label flush to `│`, others space-padded). Rails visibly break at this row; normalize each label so its trailing `│` lands on 49/68/89.

### Finding 3 — Alternatives count contradicts section inventory (Major)
Affected Scope: §Alternatives Considered intro, line 347.
Discrepancy: Prose claims "all six were converged during the Goldfish review," but the section enumerates SEVEN alternatives (A–G, L349–389). A naive reader cannot tell which seven belong to the weighed set or whether one was added post-review; the declared count and the actual section set must agree (e.g., "all seven" or "six weighed in the brief plus Alternative G added here").

### Finding 4 — Header block "byte-identical" claim is false as written (Minor)
Affected Scope: AI-reader header, Related entry line 9.
Discrepancy: `design_draft.md` is annotated "(byte-identical content at finalization)". Measured: MD5s differ; a diff shows the bodies ARE identical, but the two header blocks deliberately diverge (draft-stage "draft in progress / final write pending" wording vs finalized "THE formal design document / READY FOR REVIEW" wording, plus Related-line phrasing). The claim is strictly false and unexplained; reword to "body content identical; header metadata finalized" so a hash-checking verifier isn't contradicted.

### Finding 5 — Unnumbered parent over numbered children (Nit)
Affected Scope: Line 114 (`## Technical Plan (Architecture)`) vs children 3.1–3.9.
Discrepancy: The H2 establishes no "Section 3" anywhere, yet children are numbered 3.1–3.9 and prose cites "(3.4)" and "§3.9" — a naive H2-count would number Technical Plan 7th. Internally consistent (all references resolve, see below) but externally ambiguous; add an explicit anchor such as "(Section 3)" to the heading.

### Finding 6 — Duplicate T6 specification inside §3.4 (Nit)
Affected Scope: Lines 261 and 265.
Discrepancy: The branch bullet "Commission Package target (T6)" and the following standalone paragraph "**Purchase — commission enrollment (৳0)**" both specify the same transition (enrollment insert, freeze of usable subscription, no bill, price 0, `enrollCommission` as sole writer). Parallel duplicate definitions invite drift; the paragraph should reference the bullet (or vice versa).

### Verified clean (no findings)
Hierarchy: H1 → H2 → H3 strictly nested throughout range; no skipped levels; CUJ 1–7 symmetric Given/When/Then; 3.1–3.9 sequential; Alternatives lettered A–G and NFR bullets unnumbered — no numbering collision with the §3.x scheme. §3.x reference resolution: every numeric mention in range resolves — (3.4) at L296, L297, L307 and §3.9 at L395 match actual headings; no orphan §3.1–3.3/3.5–3.8 references exist. Label refs (S1–S6, T1–T8/T3b/T6b/T6c, D1–D7, G1–G8, OQ1/2, M-10/M-13/M-14, decisions 3–6, Gate 2/3) are all defined in-range. Link compliance: all four Related sibling files exist on disk; `concepts_brief.md §Alternatives Weighed` resolves (L109 of that file); all 12 cited code paths exist in the repo. Fences: ```text (124–153) and ```sql (196–242) both correctly opened/closed; no stray or unclosed fences. SQL block balanced. Table: §3.7 (L314–327) — 3-column header/separator, all 12 data rows well-formed, no broken borders. Diagram remainder verified programmatically: rails L132 ↔ `▲/┬` L131 ↔ box-top `┴` L134 all aligned at 30/49/68/89; side boxes' corners/sides aligned L134–142; PortPos box corners aligned L143–148; `►`@73 flush with box edge `│`@74; both `▼` sinks (L142@89, L150@87) on-rail. Header block: all 7 convention fields present; Status fields consistent between header (L3) and title block (L18); G5's "seven states" matches the 7-item precedence list in §3.6 and the state set used across CUJs.

---

## LENS C — egm-style (Technical Copy Editor)

### Finding 1 — Emphatic ALL-CAPS words in prose (Major)
Affected Scope: throughout; e.g., L1 ("THE formal design document"), L30 ("holds IS their monetization mode"), L47 ("the SAME authoritative number"), L120 ("the ONLY definition"), L130 ("THE one owed-figure"), L155 ("Postpaid NARROWS this gate"), L187 ("Written ONCE"), L190 ("NEVER into"), L259 ("does NOT touch"), L265 ("is NOT invoked"), L269 ("the ONLY settlement initiator"), L271 ("The branch NEVER reaches"), L275 ("is DELETED"), L288 ("by THEIR rows"), L290 ("Completion NEVER re-derives"), L292 ("SUBSCRIPTION-mode"/"COMMISSION-mode").
Style Rationale: Capitalized words are emphatic intensifiers, not information. A professional engineering document states the constraint once in normative language ("must", "is the sole writer") rather than shouting. The caps mode names at L292 also contradict lowercase usage of the same terms elsewhere (e.g., L334), so emphasis doubles as inconsistency.

### Finding 2 — Unverifiable business-effect claims (Major)
Affected Scope: Overview, L32.
Style Rationale: "the platform stops losing drivers who cannot pay upfront" and "serves both payment preferences at once" are predicted market outcomes stated as fact. They are not measurable from the design and cannot be verified. Restrict this paragraph to structural claims the design actually guarantees (one receivables figure, one enforcement path) and label driver-acquisition effect as an expected outcome or hypothesis, or delete it.

### Finding 3 — Duplicated normative content (Major)
Affected Scope: §3.4, L261 vs L265 (commission-enrollment purchase path described twice: freeze, no bill, `409 already_enrolled_commission`); §3.1 L155 vs §3.4 L254–260 (narrowed purchase gate and grant-before-bill ordering re-specified); OQ2, L66 (second sentence "Both the post-purchase Pay Now CTA and the Dues screen Pay CTA hit the exact same backend settlement route" restates the resolution given in the first sentence); Overview L23 ("One mode applies to everyone at once" restates the prior sentence).
Style Rationale: Redundant restatements of the same specification create drift risk when one copy is later amended. Define each rule once at its owning section and cross-reference (`§3.4`) elsewhere. "Exact same" is additionally a redundant intensifier pair — "the same" suffices.

### Finding 4 — Colloquial metaphors in a normative spec (Major)
Affected Scope: L27 ("money follows later"), L30 ("runs dry", "land in one unpaid-obligations figure"), L100 ("keeps ticking"), L155/258 ("never stranded", "calls hit 0"), L187 ("falls out of the NULL"), L190 ("from day one"), L273 ("never traps a driver"), L342 ("legacy commission math cannot eat them", "let run down naturally", "support-hostile"), L352 ("doom-loop them"), L358 ("fossilizing the toggle").
Style Rationale: Metaphors and idioms are imprecise under translation and under audit; each has a dry equivalent ("payment is deferred", "calls exhausted", "remains payable", "cannot misattribute", "rejected as harmful to driver retention"). Replace them with literal phrasing.

### Finding 5 — Repeated stock phrase "structurally impossible" (Nit)
Affected Scope: L173, L190, L194 ("structural impossibility of drift"), L271, L334.
Style Rationale: Five occurrences of the same rhetorical formula read as a tic. State the mechanism once (the unique index or the snapshot gate) at first use; thereafter "prevented by `driver_bills_payment_event_uq`" is shorter and more precise than the slogan.

### Finding 6 — Subjective qualifiers on technical claims (Nit)
Affected Scope: L39 ("naively reused"), L47 ("a drift-guard test proving"), L271 ("verifyIPN unchanged and inviolable"), L298 ("redefined to the true total"), L370 ("makes the … promise dishonest"), L387 ("Trivially queryable mode").
Style Rationale: "Naively" and "trivially" editorialize; "proving" overclaims what a test does (tests verify, not prove); "inviolable" is grandiloquent for "must not be modified"; "true total" is rhetorical — "canonical total" matches the doc's own vocabulary; "dishonest" is a moral judgment of UX copy — state the contradiction ("contradicts the onboarding copy that switching is possible") instead.

### Finding 7 — Filler intensifiers (Nit)
Affected Scope: L36 ("exists in full"), L37 ("simply stops receiving offers"), L39 ("would actively corrupt"), L66 ("exact same").
Style Rationale: These adverbs add emphasis, not meaning; each sentence is unchanged or stronger without them.

### Finding 8 — Undefined coined jargon (Nit)
Affected Scope: L50 ("Zero-disruption migration"), L254 ("fast-fail UX"), L271 ("credit-bearing"), L283 ("expired-row pool-slot burn"), L342/395 ("construction-guaranteed legacy degradation"), L347 ("all six were converged during the Goldfish review").
Style Rationale: These coinages are decodable only with context some carry via defect IDs, but a fresh reader must guess. Either define at first use or substitute plain terms: "no behavior change on release day", "early-failure pre-check", "settlement-backed", "pool slots consumed by expired rows", "degradation guaranteed by the schema state itself", "resolved". "Converged" is also a verb misuse — alternatives were "resolved" or "rejected".

### Finding 9 — Overlong sentences carrying enumerations (Nit)
Affected Scope: L41 (~80 words), L155 (~110 words), L254 (~150 words).
Style Rationale: Each packs a multi-item decision list into one sentence. These are list-shaped content; converting to bullets (as done elsewhere, e.g., L256–261) improves scanability and reduces parse errors by downstream readers.

### Finding 10 — Terminology and numeral inconsistency (Nit)
Affected Scope: "one-tap" (L49) vs "1-tap" (L76) vs "one tap" (L66); "day-zero" (L41, L48) vs "day 1" (L258) vs "from day one" (L190); "owed-figure" (L47, L130) vs "unpaid-obligations figure" (L30); caps vs lowercase mode names (L292 vs L334).
Style Rationale: The same concept spelled several ways forces readers to confirm identity each time. Pick one form per term and apply it.

### Finding 11 — Verbatim repetition of the usable-subscription predicate (Nit)
Affected Scope: L155, L256, L283, and SQL L224–227 all inline the identical expression (`status='active' AND frozen_at IS NULL AND expires_at > now() AND (calls_remaining > 0 OR calls_remaining = -1)`).
Style Rationale: Four verbatim copies of a load-bearing predicate invite partial edits. Name it once (e.g., "the usable-subscription predicate, defined in §3.5") and reference it; the SQL copy may stay as the authoritative definition.

### Summary
No Blocker-level style defects. Four Major findings (caps emphasis, unverifiable business claims, duplicated normative content, colloquial register) should be corrected before approval; the remaining Nits are consistency and precision cleanups that do not change meaning.
