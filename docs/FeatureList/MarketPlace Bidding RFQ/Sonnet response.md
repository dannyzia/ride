# Hard 2nd Pass

Went line-by-line cross-referencing A/B/C sections against each other instead of reading them in isolation. Found real, confirmed contradictions — not stylistic nits.

## Confirmed spec defects (not opinions — these are internal contradictions)

**1. The 5-min extension mechanic is dead but still documented as live — confirmed by 3-way comparison.**
- Objection #4: "5-min extension mechanic is REMOVED."
- §B.1 (`awarded→confirmed` and `awarded→cancelled` rows): clean frozen-clock model, no extension, matches #4.
- §A.0.3 `confirmed` state description: still describes the old mechanic verbatim — "extends the customer's window by 5 min once (one extension, total max 65 min)."

Two of three sections agree; one is stale. §A.0.3 is the bug. An agent implementing off A.0.3 alone ships the wrong mechanic. This needs a one-line fix before Phase 3.

**2. `rental_requests.category` includes a value the schema explicitly forbids using.**
`category text` comment lists `'ambulance_emergency'` as a legal value. But §A.5.2 and the plan (§2, §3) are unambiguous: ambulance-emergency is a **separate table** (`emergency_requests`), **separate chain**, **never touches `rental_requests`/bidding**. That enum value is either dead and misleading, or it's a trapdoor an agent could wire up and accidentally violate the "own chain, no reuse" rule the rest of the document insists on twice. Delete the value from the comment or explain why it's there.

**3. Missing `service_level` on `rental_requests` for `ambulance_scheduled`.**
`emergency_requests` correctly has `service_level CHECK (BLS/ALS)`. The scheduled-ambulance path (which reuses `rental_requests`) has `patient_condition` and `requires_paramedic` but **no BLS/ALS field**. A scheduled ambulance RFQ can't specify service level at all — bidders would be quoting blind on the one thing that actually determines vehicle class and price for this category. Real functional gap, not cosmetic.

**4. Same bug pattern fixed in one table, left broken in its sibling.**
`rental_bids` got a partial unique index (`UNIQUE (request_id, fleet_id) WHERE status='active'`) specifically so a withdrawn bid doesn't block resubmission — called out explicitly as a Zia critique fix. `delivery_bids` has a plain `UNIQUE (request_id, courier_user_id)` with no such exclusion. A courier who withdraws a delivery bid to fix a typo is now permanently locked out of that request. Same mechanism, same bug class, only patched in one of two places — someone reviewed rental and stopped before delivery.

**5. Dead cross-reference.** §B.1's `awarded→cancelled` row says "see Objection #6" for a claim about an `expired` state gated on `tracking_required=true` being a "soft gate." Objection #6 is entirely about `reoffer_count` being dead code — it says nothing about this. Either the reference is wrong or the described behavior was cut from Objection #6 in a prior edit and the citation wasn't updated.

## New substantive finding: there is no payment rail, anywhere, for any vertical

Traced every `*_bdt` column and every reference to `PortPos`/`initiatePortposPayment`. Result: **zero in-app payment collection exists for shops, rentals, or deliveries.** Explicit confirmations in the spec itself:
- Rental: *"No fare calc, no commission, no escrow... the API does not transact it."*
- Shop order refunds: *"the actual money never touched the platform... no money-handling code touches it."*
- `package_value_bdt` on parcels: *"declared value, not transacted."*

This isn't "no commission" (a business-model choice, fine). This is **no way to collect money from the customer at all** — for a vertical (Shops) that is literally selling physical products. Every transaction across all four verticals is implicitly cash-on-delivery / off-platform settlement, and this is never stated as a deliberate policy anywhere in the plan or spec — it's an emergent property nobody named. Consequences nobody addressed:
- No dispute mechanism for "I paid cash, driver/shop says I didn't."
- No no-show cost recovery (a customer who cancels after a fleet already assigned a driver leaves the fleet stranded with a wasted trip and zero platform recourse).
- Shop RFQ services with a `quoted_price_bdt` that customer "accepts" — accepting what, exactly, if no money moves? This needs a rating/reputation-based trust layer at minimum, and it's absent.

Say explicitly whether this is intentional (cash-based Dhaka market reality, COD is normal here) or an oversight. If intentional, it needs to be a named decision with a mitigation plan (ratings, dispute logging, maybe the `negotiated_terms` field repurposed as a lightweight agreement record), not a silent gap discovered by cross-referencing money columns.

## Silent auto-commit on the customer's behalf

`collecting → awarded` via scheduler: if the customer never taps "Accept" and the soft deadline passes, the system **auto-selects the lowest bid and starts the whole award/assignment/confirm pipeline** without the customer doing anything. That's not "no forced wait" (fine framing for early accept) — it's the platform entering the customer into a transaction with a stranger they never explicitly chose. Combined with the no-payment-rail point above, a distracted customer can end up "confirmed" into a rental they didn't pick, with a driver en route, based on inaction. This needs either explicit opt-in at RFQ creation ("auto-accept lowest bid if I don't respond") or the fallback should be `no_bidders`-style expiry, not silent auto-award.

## UI/UX — sharpened

Adding to the earlier proposal, driven by the two findings above:

**Trust signal is now a first-class UI requirement, not a nice-to-have.** Since there's no escrow, every screen showing a bid/quote must carry visible fleet/courier rating + completed-job count right next to the price — not on a drill-in profile. Price alone, with no trust signal, is what you'd show if the platform were backing the transaction. It isn't, so the UI has to compensate for what the backend doesn't.

**Auto-award must be visible, not silent.** The bidding-window countdown ring needs an explicit sub-label state change at the deadline: not just "time's up" but "if you don't choose, we'll book the lowest bid for you" — shown *before* the deadline hits, as a persistent line under the countdown, not a surprise after the fact. This is a genuine consent-pattern fix the backend logic forces onto the UI.

**Cash-settlement must be stated on the confirm screen**, plainly: "This booking is paid directly to the driver/fleet — not through the app." One line, before the slide-to-confirm, every time. Burying this in T&Cs while the flow reads exactly like a booked-and-paid transaction is a dark pattern by omission.

**Dual-countdown (15-min assignment SLA / 60-min confirm) redesign, revised:** given the clock-freeze mechanic, don't show both bars simultaneously as if racing — show *one* bar that changes label and color as it moves through phases: "Fleet assigning driver…" (amber, indeterminate) → the moment `assigned_at` fires, it snaps into a determinate 60-min countdown (green→amber→red) labeled "Confirm your booking." One continuous visual object telling one story, matching the actual frozen-clock backend model instead of implying two competing race conditions that don't actually exist.