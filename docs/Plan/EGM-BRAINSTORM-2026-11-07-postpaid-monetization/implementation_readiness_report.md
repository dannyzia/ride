**Purpose:**     Stage 9 (Implementation Readiness Test) findings — `DESIGN-POSTPAID-MONETIZATION.md`, DetailedRange 397–EOF. Three lenses: egm-implementation-readiness, egm-codebase-details, egm-style. Part of the consolidated EGM review (2026-11-07).
**Owner:**       Elephant (EGM review session, for Zia)
**Status:**      RAW FINDINGS — consolidated into `consolidated_review_report.md`
**Related:**     `DESIGN-POSTPAID-MONETIZATION.md` (target); personas `C:\Users\callz\.agents\agents\{implementation_readiness,codebase_details,style}.md`; standards pack (`implementation-readiness-standard`) NOT INSTALLED — persona-inline audit vectors applied.
**Last verified:** 2026-11-07, by Elephant (verbatim reviewer output)
**How to update:** Never edit raw findings; dispositions live in the consolidated report.

---

# Implementation Readiness Report — Stage 9

Three independent reviewer sessions on DetailedRange lines 397–649.

---

## LENS A — egm-implementation-readiness

**Verified accurate (no finding):** all named target files exist at the stated paths (items 1–33, 36–38; all five `(rider)` screens, `AdminShell.tsx`, both dues routes, admin routes, seed/live scripts, all 5+1 named `utils-server/__tests__` suites); every Verification Plan command resolves to a real `package.json` script (`lint`, `check:vacuous`, `check:i18n-orphans`, `test:concurrency`, `check:driver-dues:live`); utils-server → `../lib/*` imports are established practice, so items 4/13's shared helpers are feasible; the pinned code facts `purchase+api.ts:276-294` and `paymentEvents.ts:31/70` match disk.

### 1. Severity: Blocker
**Affected Scope:** Item 6 (`lib/paymentEvents.ts`), Item 19 (callback), §3.4 settlement flow; schema items 1–2.
**Finding & Guidance:** The plan routes `bill_id` through "`payment_events` metadata written at initiation" — but `payment_events` (`src/db/schema.ts:1048-1079`) has **no metadata column** (columns: id, user/driver/package_id, idempotency_key, provider, provider_txn_id, subscription_id, ride_id, purpose, pass_id, timestamps). Adding one is a schema change absent from the S1–S6 additive list (items 1–2), so the implementer cannot add it without violating the M-10 discipline, and cannot implement the linkage as written. Close by either (a) adding `payment_events.metadata jsonb NULL` to Item 1's column list + Item 2's generated DDL, or (b) dropping the metadata mechanism entirely and pinning the fallback as the ONLY mechanism ("resolve the driver's single open `subscription_purchase` bill under lock" — S2's partial unique index guarantees uniqueness), and aligning `settleSubscriptionBill(tx, {eventId})`'s resolution path accordingly. One of the two must be chosen in the document; today the implementer must make the design decision.

### 2. Severity: Major
**Affected Scope:** Items 3, 4, 5 — `lib/billsLedger.ts`, `lib/monetizationMode.ts`, `grantSubscriptionOnCredit`.
**Finding & Guidance:** Money-lib function signatures are named with ellipses: `grantSubscriptionOnCredit(tx, …)`, `enrollCommission(tx, …)`, `switchBackToCallPackage(tx, …)`, `endActiveEnrollment(tx, …)`, `createOpenBill(…)` return value. Only `grantSubscriptionOnCredit`'s output (`{subscriptionId, expiresAt}`) is pinned. Unspecified: what inputs the grant takes (driverId + packageId? the already-fetched package row? who sources `vehicle_type`/duration→`expires_at`?), what `createOpenBill` returns (the purchase response needs `bill: {id, amount_bdt, due_at}`, so presumably the inserted row — pin it), `enrollCommission`'s parameters (driverId, packageId — and who performs the `already_enrolled_commission` check, lib or route), whether `switchBackToCallPackage`'s internal settle-first/dust check reads via `getDriverUnpaidObligations` with the tx executor, and `ensureCommissionPackage`'s executor (module `db` vs tx). For single-writer money libs this is contract, not trivia — enumerate each signature (params + return + error type) in the items.

### 3. Severity: Major
**Affected Scope:** Item 14 — `utils-server/scheduler.ts` reconciliation job (B2).
**Finding & Guidance:** Invariant (1) keys on subscriptions "created after postpaid cutover," but no mechanism defines the cutover moment (no config key, no migration timestamp reference, nothing written at Stage-3 activation anywhere in the doc). Without a pinned marker the invariant is unimplementable and would false-alert or silently miss. Pin it: e.g., a `platform_config` key `postpaid_cutover_at` written during the Stage-3 activation runbook, read fresh by the job, with behavior when unset (job no-ops until set).

### 4. Severity: Major
**Affected Scope:** Item 22 — `app/api/admin/monetization/locked-drivers+api.ts`; §3.8 admin surface.
**Finding & Guidance:** "Aging" has no data source. T7 makes lockout DERIVED-only (no writer, no lockout rows), the `driver_unpaid_obligations` view carries no timestamps, and lockout events are info-level logs (not queryable). The implementer cannot compute "aging" without deciding what it ages from. Pin per reason: ceiling-locked → e.g., earliest open `driver_bills.created_at` / earliest unpaid commission ride `completed_at`; lapsed → subscription `expires_at`; no_product → driver `created_at` (or drop aging for that reason). Also pin the set enumerated: all dispatch-excluded drivers (no_product/lapsed/ceiling) or ceiling-locked only — §3.8's "locked drivers" is ambiguous against the pool's three exclusion reasons.

### 5. Severity: Major
**Affected Scope:** Item 17 (`GET /api/driver/dues`) — `monetization_state` precedence, condition 1 (§3.6 lines 300).
**Finding & Guidance:** `NO_PRODUCT` requires "no lapsed subscription history," which has no SQL definition: does any `subscriptions` row ever count, or only `status='expired'` rows? Do frozen-expired rows count? What ordering defines the "latest subscription" for condition 3 (`created_at`? `expires_at`?)? The NO_PRODUCT↔LAPSED boundary is exactly the kind of predicate that must be written, not derived — otherwise screen 26's choice-card vs. banner rendering diverges between implementations. Pin the exact predicates (e.g., "no row in `subscriptions` for driver" vs. "no row with status IN ('active','expired')" — pick one) and the "latest" ordering.

### 6. Severity: Major
**Affected Scope:** Item 29 (driver state store) with Items 17/26.
**Finding & Guidance:** Two coupled gaps. (a) Item 29 explicitly defers store selection "at implementation time (no new store unless none fits)" — that is a design decision handed to the implementer; the choice affects screens 24–28, the `lib/authCleanup.ts` registry, and whether subscription metadata lands in `useDriverStore`, `usePackageStore`, `useDriverStatusStore`, or a new `useMonetizationStore`. Name the store (or name the decision criteria and the preferred candidate). (b) Item 26's lapse timer needs `subscription.expires_at` while the client is in plain ACTIVE state, but Item 17's payload lists no active (non-frozen) subscription fields — only `frozen_subscription` (frozen only) and boolean warning flags. Pin the source: add `active_subscription: {id, calls_remaining, expires_at} | null` to the Item 17 payload, or name the existing endpoint/store that already supplies it.

### 7. Severity: Major
**Affected Scope:** Item 40 — `tests/meta/driver-unpaid-obligations.test.ts`.
**Finding & Guidance:** Lane mismatch: the drift-guard executes the VIEW SQL ("same fixture through three paths … must agree"), which requires a real Postgres, but `tests/meta` runs in the default jest suite with no database (the repo's real-DB lane is `tests/concurrency`, gated on `RUN_CONCURRENCY_TESTS` + `SCRATCH_DATABASE_URL`). As placed, the test cannot run where it sits. Move it to `tests/concurrency/` alongside items 41–43 (and update the Verification Plan's concurrency line to cover tests 40–43), or split it: pure-SQL-string/shape assertions in meta + behavioral agreement in the concurrency lane. Say which.

### 8. Severity: Major
**Affected Scope:** Item 32 — `scripts/seed-platform-config.js`; Item 4's `ensureCommissionPackage()`.
**Finding & Guidance:** The seed script is plain CommonJS (`require("postgres")`, raw SQL via drizzle) and cannot import the TypeScript `lib/monetizationMode.ts` helper — "seed via `ensureCommissionPackage()`" is not executable as written. Pin the mechanism: either (a) inline the idempotent insert SQL in the script (mirroring the helper's predicate and the `pg_advisory_xact_lock` pattern, with a comment binding the two as one contract), or (b) run the script under `npx tsx` with an ESM import of the lib — and update the runbook accordingly. Also pin where `ensureCommissionPackage` itself gets invoked at runtime (app boot? admin route? only seed?), which Item 4 leaves open.

### 9. Severity: Major
**Affected Scope:** Item 13 — `billing_state_invalidated` emission ("on dispatch-time lockout transitions").
**Finding & Guidance:** Dispatch is stateless per T7/§3.5, so "transitions" have no baseline: detecting locked→unlocked requires a last-known-state mechanism the doc doesn't specify (per-driver in-process map contradicts TD-11/TD-15 and restart semantics; a persisted table would violate DERIVED-only). Pin one: (a) in-memory last-state map in utils-server, documented as best-effort (lost on crash → missed hints, benign because OQ1 pull is canonical), or (b) emit on every exclusion with client-side dedup/debounce. Do not leave the transition-detection design to the implementer.

### 10. Severity: Nit
**Affected Scope:** Item 6.
**Finding & Guidance:** The line-70 extension point is mis-pinned: `createZeroAmountPaymentEvent` is the ৳0 trial creator and never issues settlements; the union that needs `'subscription_settlement'` is `PortposPaymentInitiation.purpose` (line 31), consumed by `initiatePortposPayment`. Extending the zero-amount creator's union too is harmless but the instruction should point at the interface actually used by the settlement path (`dues/pay` amount is always ≥ 1,000 paisa, never zero).

### 11. Severity: Nit
**Affected Scope:** Item 18 — settlement idempotency keys.
**Finding & Guidance:** Only the ≤64-char constraint is given; the deterministic format is not. Pin the pattern (mirroring the existing commission settlement key in `lib/paymentRepair.ts`, e.g., `subscription_settlement_<billId>` — 23 + 36 = 59 chars, fits) so environments and the replay tests (item 43) agree byte-for-byte.

### 12. Severity: Nit
**Affected Scope:** Items 11 vs 13 — kill-switch gating of the accept-time snapshot.
**Finding & Guidance:** Item 11 mandates OFF = "legacy behavior byte-for-byte," but Item 13 writes `rides.monetization_mode_snapshot` at accept with no stated kill-switch gate. Writing `'subscription'` snapshots during OFF mode is benign at completion (zero either way) but shifts the D5 NULL=pre-cutover boundary and contradicts "byte-for-byte." Pin: snapshot write executes only under `hybrid` (recommended), and note the consequence for test fixtures and the reconciliation job.

### 13. Severity: Nit
**Affected Scope:** Items 1/2/8 — view typing.
**Finding & Guidance:** Whether `driver_unpaid_obligations` is declared in Drizzle (`pgView` + inferred row type) or consumed as raw SQL with a hand-written interface is undecided; Item 8's `getDriverUnpaidObligations` return type depends on it. Pin raw-SQL + explicit interface (lighter, matches the hand-appended DDL) or `pgView` (keeps types in sync) — either is fine; pick one.

### 14. Severity: Nit
**Affected Scope:** Item 38 — suite list completeness.
**Finding & Guidance:** The 5 named suites do mock `getRevenueModel`, but `utils-server/index.ts:2890` also calls it (offer path), so offer-path suites (`sequentialDispatch`, `redispatch`, `batch2-ws-and-activation`, `b5-guards`) may mock it too. Add a closing step: `grep getRevenueModel utils-server/__tests__` before declaring item 38 done.

### 15. Severity: Nit
**Affected Scope:** Items 3/16 — 23505 mapping.
**Finding & Guidance:** The S2 partial-unique-index race maps to "typed 409" without naming the code. Since the in-tx settle-first re-check (§3.4) normally fires first, `dues_outstanding_purchase_blocked` is the natural code for the 23505 backstop — pin it so `lib/billsLedger`'s error type and the route's mapping don't diverge.

**Summary:** 1 Blocker (unlisted `payment_events.metadata` schema dependency), 8 Major (money-lib signatures; cutover marker; lockout aging source; NO_PRODUCT predicate; store selection + active-subscription payload field; item 40 DB lane; seed-script/TS-lib incompatibility; WS transition detection), 6 Nit. The stage ordering, file inventory, and Verification Plan commands are sound; every gap above is closable with one or two pinned sentences each in the affected items.

---

## LENS B — egm-codebase-details

No 🔴 Blocker (Contradicts-the-Code) findings: every pinned code reference in the audited range was checked and is accurate (details at bottom). All findings below are omissions or imprecision in the 45-item list.

### 🟡 Major Findings

**M-1. The Tests section omits the direct contract suite for both routes items 17/18 modify.**
- **Scope:** Items 17, 18 vs `tests/api/driver/commission-settlement.test.ts`.
- **Discrepancy:** This file imports the real handlers (`GET` from `@/app/api/driver/dues+api`, `POST` from `@/app/api/driver/dues/pay+api`, lines 42–43), mocks `getRevenueModel` (lines 33, 105, 149), and pins exactly what items 17/18 change: the `revenue_model` response field, `total_outstanding_bdt === commission_due_bdt` aliasing, and hybrid-gated `is_dispatch_locked` semantics (lines 113–157). Implementing item 17 ("remove the global `revenue_model` field") breaks this suite on its first run, yet the file appears nowhere in items 36–45. This falsifies the line-399 claim "every file touched by this design appears exactly once" and violates the repo's own protocol of mapping each changed file to its test file. The design's own §Alternatives even counts "seven test suites fossilizing the toggle" — the plan names seven utils-server suites but this eighth, most directly affected one is missed.

**M-2. The Tests section omits the existing suites for the purchase route and both admin routes the plan modifies.**
- **Scope:** Items 16, 20, 21 vs `tests/api/package/purchase-gate.test.ts`, `tests/api/package/vehicle-scoping.test.ts`, `tests/api/package/active-grant-code.test.ts`, `tests/api/admin/packages.test.ts` (imports `GET, POST, PUT, DELETE` from the admin packages route), `tests/api/admin/config-audit.test.ts` (imports `PATCH` from the admin config route).
- **Discrepancy:** Item 16 rewires `POST /api/package/purchase` with a settle-first view read, possession checks, and new branches; the three package-test suites drive the real handler with mocked select-queues and will hit unmocked DB reads (or pin a branch matrix that must be extended). Item 21 adds create/update validation to the admin packages route whose dedicated suite is `tests/api/admin/packages.test.ts`; item 20 changes the `max_commission_debt_bdt` setter behavior exercised by `config-audit.test.ts`. None of these five files is in the 45-item list — same line-399 completeness failure as M-1.

**M-3. A second live purchase surface is missing from the plan: `subscription-checkout`.**
- **Scope:** Item 24 (and the line-399 claim) vs `app/(main)/(rider)/subscription-checkout/index.tsx:74` and `app/(main)/(shop-owner)/index.tsx:279`.
- **Discrepancy:** The plan covers only `packages.tsx` as the purchase screen, but `subscription-checkout/index.tsx` also POSTs `/api/package/purchase` and is reachable by navigation (`active-subscription` → `subscription-plans` → `subscription-details:104` → `subscription-checkout:74`). Stage 3's response-contract change (`payment_url: null` + `activated`/`bill`/`enrollment`, new 409 codes) reaches this screen with no handling planned — a broken or unhandled purchase path on a production-navigable screen. The shop-owner screen's purchase call is a secondary instance needing at least a triage line (its plans are non-driver-rail, but the route's new gates are added ahead of the driver gate).

**M-4. Frozen-calls rendering is specified for the wallet only; the driver home calls widget and `/api/package/active` are unaddressed, contradicting the design's own CUJ 5.**
- **Scope:** Items 26, 27, and the omitted `app/api/package/active+api.ts` and `app/(main)/(rider)/d/(tabs)/_layout.tsx`.
- **Discrepancy:** CUJ 5 and §3.6 require "the calls widget shows the frozen state (never as spendable balance)." Item 27 implements this only for the wallet screen. The driver home screen fetches `/api/package/active` (`d/(tabs)/index.tsx:373`) and renders `activeSubscription.calls_remaining` with a zero-calls warning (lines 1437–1453), and `_layout.tsx:57` also consumes `calls_remaining`. `app/api/package/active+api.ts` appears nowhere in the 45 items, and item 26's scope text (banners, choice card, trip-complete line, lifecycle fetches, invalidation hook) never mentions the calls widget. As written, a frozen subscriber's paid-up calls render as spendable on the primary driver surface — the exact D2 violation CUJ 5 forbids.

**M-5. New concurrency harnesses are not registered in the concurrency gate's harness registry.**
- **Scope:** Items 41–43 (Create) vs `tests/meta/concurrency-gate.test.ts` lines 91–100.
- **Discrepancy:** The gate's `GATED_HARNESSES` array exists precisely so, per its own header, "a new sibling cannot silently become an unguarded default-suite DB connector" — RUN A asserts it covers every gated file. Adding three new DB-touching harnesses under `tests/concurrency/` (items 41–43) without adding them to this registry leaves them outside the guard's RUN A coverage — the exact drift class the meta test was built to catch. Test-infrastructure neglect; the file should be a Modify item.

**M-6. Item 32's seeding mechanism cannot work as specified: a bare-node CJS script cannot import the TS lib.**
- **Scope:** Item 32 vs `scripts/seed-platform-config.js`.
- **Discrepancy:** The plan says the script seeds the ৳0 Commission package "via `ensureCommissionPackage()`" — a function item 4 places in `lib/monetizationMode.ts` (TypeScript). `seed-platform-config.js` is a plain `require()`-based CJS file executed with bare `node` (no npm script wraps it in `tsx`; contrast `check-driver-dues-live.ts`, which is `.ts` and explicitly run via `npx tsx`). `require('../lib/monetizationMode')` from that script fails on the `.ts` extension. The plan must specify the mechanism: a TS/tsx seed runner, or the raw SQL seed inlined — the precedent (`ensureLaunchFreePackage`, `lib/launchFreeSubscription.ts:48`) is consumed only from TS callers. An unstated implementation assumption the implementer will hit as a hard failure.

### 🟢 Nit Findings

**N-1.** Item 20 mislabels the structure it narrows: the `revenue_model` value set lives in `ENUM_KEYS.revenue_model` (`app/api/admin/config+api.ts:241`); `ALLOWED_KEYS` (:191–192) is the separate key allow-list that already contains both keys. Semantics correct, identifier wrong.
**N-2.** Item 25 cites "`total_unpaid_bdt` redefinition" — the dues screen consumes `total_outstanding_bdt` (`due-amounts/index.tsx:35,390`) and §3.6 defines the new payload field as `total_unpaid_paisa`. The item's name matches neither the current nor the new contract.
**N-3.** §3.5's cite for the "commission_only shape" is off-target (feeds item 12): the offer-commits-`billed=true`-with-no-ledger shape lives at `leadBilling.ts:245–252`; lines 105–110 hold only the `commissionOnly` flag derivation. (Item 12's own cite — the five silent exits at `:129–162, 256–258` — is exact: exits at 131, 142, 155, 161, 257.)
**N-4.** The seeds-not-constants meta test is not extended: `tests/meta/platform-config-seeds-not-constants.test.ts` pins every seeded economics key's launch value verbatim against `scripts/seed-platform-config.js`; item 32 adds `revenue_model` and `max_commission_debt_bdt` seeds plus the commission package but the plan never updates this test, breaking the established one-key-one-pin pattern.
**N-5.** `check-driver-dues-live.ts`'s `GATED_MODELS = ["commission_only", "hybrid"]` (line 70) is not named by item 33. After item 20 removes `'commission_only'` from `ENUM_KEYS`, the script's existing revenue_model-mutation legs become unseedable; "update assertions to the itemized response shape" under-specifies the fix.
**N-6.** Postpaid splits platform revenue into two lanes; the admin revenue readers get no item or Non-Goal: `app/api/admin/dashboard+api.ts` / `driver-economics+api.ts` report ride-commission-only revenue; the brainstorm's intake flagged this as needing a ruling, but neither the 45 items nor Non-Goals carry it (harmless at the 0% launch default, silent afterward).
**N-7.** Item 30 lacks the concrete path: "Locale catalogs (en/bn)" should cite `i18n/locales/en/common.json` + `i18n/locales/bn/common.json` per the repo's AI-to-AI concrete-cross-reference convention.

### Verified clean (no finding)
All pinned line references are exact: `lib/paymentEvents.ts:31,70`; `lib/paymentRepair.ts:242–243`; `app/api/admin/config+api.ts:241` (current 3-value set) and `max_commission_debt_bdt` in ALLOWED_KEYS:192 with existing setter hook :363; `lib/platformConfig.ts:253–285` (type :263, `parseRevenueModel` :271–275, `getMaxCommissionDebtBdt` :283–285); `lib/commissionDues.ts:12–13` and :48–54; `utils-server/dispatch.ts:285–322` (rides-sum debt block, settled sum :302–311); `utils-server/scheduler.ts:1169–1197` (orphan sweep); `app/api/package/purchase+api.ts:276–294`, :296–338, idempotency :143–164; `callback+api.ts:198–222` (commission branch); `complete+api.ts:192–194,261` (v6 hard-zero); `lib/activateSubscription.ts:32–35` (advisory lock + expire-any-active), amount==price :21, paid stamping :85; `dues/pay+api.ts:33` (`MIN_PAYMENT_BDT`); `payment_events.idempotency_key varchar(64)` at `schema.ts:1055` (item 18's ≤64-char constraint); `dcs_payment_event_idx` at :1110; `onboarding/index.tsx:96` (raw `err.code` alert); `packages.tsx:108` (`data.activated` pattern); `AdminShell.tsx:46` (NAV table).
All Modify targets exist with the assumed structures, including `app/api/admin/packages+api.ts` (GET/POST/PUT/DELETE + `requireAdminPermission('price.write')`), all five driver screens, `maestro/tools/testid-manifest.cjs`, both scripts, and all seven named `utils-server/__tests__` files (`dispatch-commission-debt`, `leadBilling`, `dispatch-{blocklist,cooldown,min-per-km,pool-predicates,women-only}` — the latter five are exactly the suites holding `getRevenueModel` mocks; no other dispatch suite mocks it).
All Create targets are collision-free: `lib/billsLedger.ts`, `lib/monetizationMode.ts`, `app/admin/monetization.tsx`, `app/api/admin/monetization/*`, `dispatch-postpaid.test.ts`, and all five `tests/{meta,concurrency}` files do not exist; schema has no `driver_bills`/`commission_enrollments`/`frozen_at`/`monetization_mode_snapshot`/`product_type` today; migration numbering supports `<next-sequential>` (latest is 0091).
All five cited npm scripts exist: `lint`, `check:vacuous`, `check:i18n-orphans`, `test:concurrency`, `check:driver-dues:live`; `scripts/concurrency-scratch-project.mjs` exists; locale catalogs live at `i18n/locales/{en,bn}/common.json`.
`ws-contract-sync.test.ts` will not break item 15 (it pins only fixed domain lists; a new outbound `billing_state_invalidated` is safe).

---

## LENS C — egm-style (DetailedRange)

### 1. [Major] Item 42, line 623 — "Crash injection between grant and bill leaves neither".
The elliptical "leaves neither" drops its object. In a verification-critical invariant description, the reader must not have to reconstruct the referent. State the claim: crash between the grant and the bill insert must leave neither the subscription row nor the `driver_bills` row (transaction rollback), or "neither side effect persists."

### 2. [Major] Item 29, line 552 — "no new store unless none fits".
"Fits" is an undefined criterion; a fresh implementer cannot act on it deterministically. Replace with a checkable condition, e.g. "create a new store only if no registered store already holds monetization state" (and name the candidate stores considered).

### 3. [Major] Item 14, line 473 — nested parenthetical.
"(owner fix, Gate 3 — broader assertions would false-alert on pre-cutover prepaid subscriptions (A1′), ৳0 trials (D4), and bills whose subscriptions have since expired or exhausted)" is a parenthetical inside a parenthetical carrying the three exclusion cases the invariant depends on. Promote to a sentence or bullet list; buried rationale in doubly nested parens is where implementers miss scope conditions.

### 4–16. [Nit]
L399 "Single unified list"/"order … build order" echo; Item 1 "model of record" legalese; Item 2 "belt-and-braces"/"fails the migration loudly" anthropomorphism; Items 4/26 sentence sprawl (split to bullet-per-concern); Item 7 "(routing is the contract)" slogan; Item 12 "exit … exits" repetition + "invariant-test-visible" coinage; Item 9 "safe-default-legacy" invented compound; Item 19 "`verifyIPN` inviolable" grandiloquence; Items 3/4/14/36 mixed emphasis-caps vs normative-caps (SOLE/EXACT/IS vs MUST/NEVER/NO); Item 1 "where needed" vague qualifier; Item 39 "lapsed-never-converts" cryptic label; Item 35 non-specific sync instruction; L649 "*Drafted with EGM*" trailer outside register.

No hyperbole, subjective quality judgments, or unverifiable claims were found beyond the items above; counts, thresholds, and code references throughout the range are concrete and checkable.
