Second pass done — I re-verified every first-pass claim against the text (including steelmanning the spec against each) and went deeper on the state machines. Net result: **all 7 first-pass blockers survive scrutiny, two of my points need correction, and I found one new hard blocker that I missed entirely — it's the worst defect in the document.**

---

## NEW BLOCKER (P1): Runner-up promotion cannot execute — the spec's own recovery mechanism is impossible

Every fleet-fault mitigation (Objections #3–#7: SLA timeout, force-withdraw, clock freeze, reoffer semantics) terminates in "promote the next-lowest bid." Three independent contradictions make that unimplementable as written:

1. **There is no active bid to promote.** §B.1 (`collecting → awarded`) commands "other active bids → `lost`" at award time, and §B.2's `active → lost` trigger is "another bid wins," with `lost` marked **terminal — "no transitions out."** The SLA-timeout row then says "promote the next-lowest **active** bid." By that point, zero active bids exist. Same for the force-withdraw promotion path.
2. **The timed-out winner cannot be demoted.** §B.2 defines `won` as terminal with no exits — except the one bespoke `won → withdrawn (force=true)` transition added for the fleet-withdraw path. The SLA-timeout path got no such transition, so the expired winner stays `won` forever while the promoted bid also flips to `won`: **two live winners on one request.**
3. **The promotion write-set is unspecified.** The row doesn't say to update `rental_requests.awarded_bid_id` (it would still point at the dead bid → split brain), whether `awarded_at` resets (§A.2.3 computes `assignment_deadline_at = awarded_at + 15min` — from the *stale* award time), or what happens to the customer clock.

Fix sketch: at award, non-winning bids go to a **non-terminal** state (`runner_up`), settled to `lost` only at final settlement (confirmed/completed/cancelled/no_bidders); add `won → lost` on SLA timeout; specify the full atomic write set (bid statuses, `awarded_bid_id`, fresh `assignment_deadline_at`, clock handling) in one transaction.

This is provable from Sections A–B alone — no truncated section can fix it, because C contracts behavior that B defines.

---

## Corrections to my first pass (where I was wrong or imprecise)

- **The "up to 75 min" ceiling is wrong.** Each SLA timeout consumes another runner-up with another fresh 15-min window, so total elapsed time is `N × 15 + 60` for N bids. Worse: the spec **never says the confirmation clock resets on promotion** — under the stored-column implementation, a promotion at T+15 leaves the customer deadline at T+60, so the fleet's second pick window collides with the customer's expiring clock. Fold this into the B2 consolidation.
- **`delivery_bids` hard UNIQUE — framing correction.** The Zia partial-unique ruling was rental-scoped; calling the delivery constraint a "contradiction" overstates it. It's a consistency recommendation: same typo→withdraw→re-bid failure mode, same fix.
- **Truncation hedge, made precise.** Provable from A–B regardless of C–I: **B1, B2, P1, B3, B5, H1, H5.** Could be addressed in C–I and I can't rule either way: **B4, B6, B7, H2, H3, H4, H6.** But note the doc's own structure — B defines behavior, C contracts it — so B-level contradictions stand even if C exists.
- **B6, strengthened:** Objection #9 says "the schema is updated" — but the only schema change it describes is `delivery_fee_bdt` nullability. No join column exists in A.1.4 or A.3.1. The handler being "updated" has nothing to join on.
- **`plans/` directory:** softening — `list.txt` may be a partial tree; verify rather than assume the source-of-truth link is broken.

---

## New findings (pass 2)

**High — cross-vertical driver/vehicle contention (extends B5, which was too narrow).** A driver hard-linked in a tracking bid, or picked into an assignment, can simultaneously be receiving ride-hailing dispatch offers — `dispatch.ts` joins nothing about rental state *by design* (plan §0.1), and the emergency chain broadcasts to certified drivers with no availability check. The isolation rules forbid rental writing driver status and forbid touching `dispatch.ts`, so **there is no sanctioned mechanism preventing the same human being double-committed across products** — including ambulance-emergency vs. an in-progress ride. This needs a plan-level ruling: accept-and-warn, a read-side availability API, or explicit out-of-scope. It cannot be left implicit.

**High — silent price substitution.** On promotion, the customer who accepted bid A at price X becomes bound to bid B at price Y (likely > X). The spec mandates *labeling*, not consent. The nominal consent point (the 60-min confirm) doesn't save it: declining by non-confirmation is booked as `customer_overslept` — **customer fault** — and burns the full window. Combined with H1 (deadline auto-award), a passive customer can be auto-bound to a price they never saw. Escalate to a locked decision: re-accept prompt on price change, or a penalty-free decline on reoffer.

**Mediums (one line each):**
- `tracking_required` has **no setter** — customer toggle? category default (ambulance)? `platform_config`? The whole fork's entry point is unspecified.
- `shop_rfq_status` enum exists (§A.0.8) but **Section B never defines its state machine** — the only new enum with no transition table.
- `negotiated_terms` has **no attributed writer** in the §A.6 matrix — orphaned column.
- **Sealed-bid privacy is unenforced anywhere visible**: bidders must see their own bid (withdraw flow) — the bid-list surface must filter by fleet or the seal leaks. Likely C-section material; must be explicit.
- **WS dispatcher seam**: plan §4's "thin top-level dispatcher, no changes to existing ride-handler files" hand-waves that *some* existing socket entry point must be modified to delegate. Name the file; the isolation claim currently has a hole.
- **Money units, elevated from nit**: every `*_bdt` column stores paisa per AGENTS.md — six-plus tables of columns whose names contradict their units. Rename to `*_paisa` or annotate per column; this is a systematic data-corruption generator for a coding agent.
- **Conditional NOT NULLs are comments, not DDL**: "NOT NULL when parent.tracking_required=true" is unenforceable as a column constraint. Spec must pick: trigger, or in-transaction validation in the submit handler (I'd pick the latter, stated explicitly).
- **Dead-fleet edge in the zone filter**: a fleet whose zones are *all* `is_active=false` has rows (so isn't "global") but matches no active cell → silently receives nothing. Either treat all-inactive as global or block deactivating the last zone.
- §B.4's cancel row self-contradicts: "any non-terminal" → cancelled, trigger text says "before pickup" — an `in_transit` cancellation is allowed by the From, forbidden by the trigger.
- `expired` is **unreachable per the transition table** — no row produces it; it's defined only in prose inside the `awarded → cancelled` row, contradicting that same row. (H5 sharpened.)
- `requires_paramedic=true` + `requested_vehicle_type=ambulance_basic` is a valid insert — no cross-field validation tying paramedic to ALS.
- **Emergency chain has no geo-targeting** (`fleet_service_zones` is rental-only) — a Dhaka emergency alarms every certified driver nationally, and no TTL/cert-expiry sweep exists mid-job (H3 extended).
- No rate limiting / broadcast amplification guard on request creation — a customer can spawn RFQs that fan out to every fleet socket.
- The §A.2.1 addendum says "add the following **nullable** columns" then defines `reoffer_count integer NOT NULL` — drift artifact; schema belongs in the column block, not addenda.

---

## First-pass findings — all held under re-examination

B1 (hard UNIQUE vs. "NEW row" — confirmed, partial unique is the fix), B2 (three clock specifications — confirmed; the lazy formula both collapses to `COALESCE(assigned_at, awarded_at)+60` *and* fails to freeze), B3 (no job-time model — sharpened: the entire clock machinery is broadcast-relative, which is incoherent for a category named "ambulance_*scheduled*" and unquoteable for multi-day car rental), B4 (concurrency — hedged above), B5 (subsumed by the cross-vertical High), B6, B7, H1 (plus price substitution), H2–H7, and the mediums (slug partial-unique, stock CAS, H3 k-ring/representation, `category` phantom value, soft-deadline-at-draft NULLability, validator must be trigger-keyed given there are already two distinct `awarded → broadcasting` and two `awarded → cancelled` semantics).

---

## Revised fix order

1. **One consolidated state-machine regeneration**: P1 (bid lifecycle + promotion write-set) + B2 (clock, including promotion reset) + H5 (`expired`). Stop patching — these are the same subsystem and the patch-style is what created the contradictions (§A.0.3 still contains the deleted 5-min mechanic).
2. Schema pass: B1 partial unique, B3 time model decision, conditional-NOT-NULL enforcement, `category` enum, money naming.
3. Concurrency spec (B4/B5) **plus the cross-vertical contention ruling** — the latter is plan-level, not spec-level.
4. B7 single transition module + matrix rewrite; B6 food join + `total_bdt` invariant; H3 emergency TTL + targeting; H1 + price-substitution ruling; H4 subscription decision.
5. Medium sweep.

**Verdict against the doc's own bar** ("precise enough for a coding agent to implement without re-deciding architecture"): it fails. An agent hitting P1 or B2 must either invent behavior or produce something that crashes at runtime — both are re-decisions, one just deferred to production.

Standing offer: send Section C onward and I'll run the same two-pass treatment on the endpoint contracts, WS auth, and the D/F/I sections — several open flags (sealed-bid filtering, concurrency, food bridge, subscription flow) live or die there.