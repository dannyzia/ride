**Purpose:**     Scoped delta review of Amendment D3-B (bundle packages) — four lenses, findings consolidated WITH the D3-B-r2 resolutions already applied to the design document (owner pattern: accept-all; all four lenses converged on the same resolutions, so no open decision remains).
**Owner:**       Elephant (EGM review session, for Zia)
**Status:**      DISPOSITIONED — corrections applied (D3-B-r2); document remains IMPLEMENTATION-READY for the delta only after the coding model implements it
**Related:**     `DESIGN-POSTPAID-MONETIZATION.md` (target); `owner_dispositions_review_2026-11-07.md` (D3-A/D3-B rulings); `consolidated_review_report.md` (prior full review)
**Last verified:** 2026-11-07, by Elephant
**How to update:** Elephant only; raw findings summarized below (full text in session record).

---

# Consolidated Delta Review — Amendment D3-B (r2)

**Reviewer status:** 4 lenses completed (design-critic, comprehension, implementation-readiness, zoom-out). **Raw totals:** 3 Blockers, 12 Majors, ~10 Nits. **All accepted; corrections applied as D3-B-r2.**

## The verdict all four lenses converged on

D3-B as I first integrated it was not implementable: (1) it never said which possession table holds a bundle, and both lanes were structurally broken (the enrollment lane has no calls counter and writes no bill; the subscription lane's classification hard-codes `'lead'`, so the commission leg never accrues — G1 inverted); (2) I introduced an enum vocabulary (`'lead'`, `'bundle'` as ALTER VALUE) that the on-disk enum and already-landed Stage 1–3b code contradict — the landed code writes `'subscription'`/`'commission'`; (3) the owed-figure view counts only `snapshot='commission'` rides, so bundle accruals would be invisible to all four G3 consumers — silent uncollectable receivables; (4) the amendment was never propagated into the 48-item plan (Items 1/2/12/13/14/23/26/39/44/46 all pre-amendment), and the landed-code reality (Stages 1–3b implemented, D3-A-era exclusivity validators live at `packages+api.ts:43-57`) makes this a delta against landed code, not greenfield.

## D3-B-r2 resolutions (applied to the document)

- **R1 Bundle possession (closes Blocker 1):** a bundle is `product_type='call_package'` carrying `commission_percent > 0` — subscription lane (T2 grant + bill; calls storage exists; the bill has a `subscription_id`). `product_type='commission'` remains the percent-only rail: `price_bdt = 0`, no calls leg; `commission_enrollments` stays as-is plus `expires_at`. The two-table split still earns its complexity (zoom-out: a ৳0 grant through the subscription lane would occupy the open-bill slot with a ৳0 bill).
- **R2 Vocabulary (closes Blocker 2):** `monetization_mode` stays two-valued — `'subscription' | 'commission'`. No `'lead'`, no `'bundle'` enum value. A bundle ride stamps `'subscription'` (it holds a usable subscription) with a non-null percent snapshot; the billing SET is derived from facts: percent snapshot non-null → commission leg billed; deduction row present → lead leg billed. Prose purge: every `'lead'`/`'bundle'` mention replaced.
- **R3 Percent snapshot semantics (closes zoom-out F4/F5):** `rides.commission_percent_snapshot` stores ONLY the package override (NULL = no override). Completion percent = `COALESCE(snapshot, pinned pricing-row percent via rides.pricing_id)` — reusing the existing immutable pricing pin instead of re-stamping pricing at accept. Binding honors M-01 for both legs: classification stamps `dispatch_offers.commission_percent` (new nullable column, S10) from the package; accept copies it to the ride.
- **R4 Admin form (closes readiness F5):** no exclusivity guard; universal validations only (M-09 floor, D1 ceiling); `commission_percent ∈ (0, 100]` when set; trials carry no percent; commission products: `price_bdt = 0`, `call_count` NULL/0; call products: `call_count` ∈ {−1, 0, ≥ 1} (0 = pure-bill package, allowed — admin's choice); duration ∈ {NULL, ≥ 1}. Full error-code matrix enumerated. The LANDED D3-A-era exclusivity validators (`app/api/admin/packages+api.ts:43-57`) are explicitly slated for removal — the code on disk currently rejects the owner's own example.
- **R5 Expiry/re-enrollment (closes critic F4 + comprehension F7):** enrollment expiry is derived-only (`expires_at <= now()` → excluded from pool; nothing flips status); `enrollCommission` auto-ends expired enrollments (`status='ended'`) instead of 409ing — settle-first then applies; the LAPSED state predicate extends to expired-dated enrollments.
- **R6 balanceScore (closes critic F5):** bundle drivers score calls-based (`min(calls/5, 1.0)` — they hold a real balance); only percent-only enrollment drivers pin `0.5`.
- **R7 OFF-mode bundles (closes critic F9):** under rollback, subscription-lane bundle holders keep the lead leg (calls spendable per their subscription) minus commission accrual until expiry; the commission-leg loss during rollback is documented, not value-stranded (calls remain usable).
- **R8 Plan propagation (closes readiness F3/F8, critic F3):** Items 1/2 (0093 explicit), 12, 13, 14, 21, 23, 26, 39, 44, 46 amended in place or via the binding integration addendum in §5; §3.9's "no enum widened" sentence corrected (0093 widens `monetization_mode` — rollback-safe because OFF writes never produce bundle percent); Overview/CUJ bridge note added; stale anchors flagged for refresh against landed code.

## Consolidated findings → resolution traceability

| Consolidated | Raw findings (lens.F#) | Resolution |
| --- | --- | --- |
| Blocker 1 bundle possession | DC-F1; Cmp-F3; IR-F1 | R1 |
| Blocker 2 enum vocabulary | DC-F2; Cmp-F1; IR-F2 | R2 |
| Blocker 3 view blindness | DC-F2; Cmp-F2 | R2 + R3 (accrual condition + view filter admit override-rides; drift-guard covers) |
| Major classification never derives bundle for subscription-held | IR-F4 | R1 + R2 (leg-derived classification) |
| Major Item 14/39/44 audit + test blindness | DC-F3; IR-F7; IR-F8; Cmp-F9 | R8 |
| Major Item 21 matrix/validation-vs-landed-code | IR-F5; DC-F7 | R4 |
| Major plan/migration drift (0093 uncreated, Item 1 omissions, F-10 sentence) | IR-F3 | R8 |
| Major re-enrollment deadlock | DC-F4 | R5 |
| Major state machine gap (expired enrollment matches no state) | Cmp-F7 | R5 |
| Major balanceScore | DC-F5 | R6 |
| Major OFF-mode bundle stranding | DC-F9 | R7 |
| Major Overview/CUJs stale two-product framing | Cmp-F4 | R8 (bridge note) |
| Major percent snapshot vs existing pricing pin | ZO-F4 | R3 |
| Major accept percent re-derivation violates M-01 | ZO-F5 | R3 (persist percent on the offer at classification) |
| Nit 'bundle' enum redundant | ZO-F6 | R2 (not added — facts, not labels) |
| Nit S3/S5 superseded sentences standing | DC-N11 | E-edits in place |
| Nit Item 21/S8-S9 duplicated form spec | ZO-F7 | S8/S9 carries schema facts only; form spec in Item 21 |
| Nit getDriverMonetizationMode stale + unconsumed | ZO-F8 | dropped from launch scope |
| Nit receipt predicate hides bundle commission | IR-F9 | R8 (condition = commission leg present) |
| Nit stale line anchors / greenfield framing | IR-F10; DC-N10 | R8 (anchors flagged; landed-vs-pending note) |
| Nit accept percent source join unpinned | IR-F11 | R3 (resolution table pinned) |

## Root-cause note for the record

The first D3-B integration failed for the same reason the design doc's own B7 finding warns about: prose was rewritten in one section while the facts consumers (enum, view, plan items, landed code) were not propagated. The r2 discipline: vocabulary from the disk (R2), possession from the lanes (R1), percent from the existing pin (R3), and every plan item touched by the semantics amended in place or via the binding addendum.
