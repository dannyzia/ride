OK, I read it. Section 9 is the right set of questions — the Stage 1 lock is solid (especially §3a reference-quantile, §3b three-state lifecycle, §3c platform-computed road distance — those three together resolve most of what I got wrong in my own pass). Let me give you hard opinions on each of the five.

## Point 1 — Pickup rate: 60% or 100% of trip per-km rate?

**Land at 75%.** Not 60, not 100.

The 100% camp is right that fuel, time, and vehicle wear don't care whether the seat is occupied. But the moment a rider's quote shows a pickup fee equal to a same-length trip fare, they'll reject the booking — the quote reads as if you're charging them twice for the same distance. That breaks conversion, and you don't get to learn whether the mechanism actually helps drivers.

The 60% camp is right that "no passenger yet" has a moral/economic weight — but 60% is artificially low and drivers will correctly read it as "the platform lowballed me and kept the difference," which is exactly the kind of distrust your no-commission model is supposed to avoid.

75% is the honest middle:
- Covers fuel fully (in Dhaka traffic, 4km burns ~35–40 BDT for a car, 25–30 for a CNG, 15–20 for a bike)
- Covers most of vehicle wear and depreciation
- Leaves a small rider-visible subsidy to the empty leg (~25%) that signals fairness without insulting drivers

Concrete defaults per category, all calibrated against current Dhaka fuel costs:

| Category | `pickup_per_km_rate_ratio` | Why |
|---|---|---|
| Bike | 0.70 | Bikes burn ~6 BDT/km; even at 0.7 × 12 = 8.4 BDT/km, the driver nets ~2.4 BDT/km after fuel. Tight but covers position. |
| CNG | 0.75 | CNG burns ~7–8 BDT/km; at 0.75 × 15 = 11.25 BDT/km, ~3–4 BDT/km margin. Workable. |
| Car | 0.80 | Cars burn ~10–12 BDT/km; at 0.80 × 22 = 17.6 BDT/km, ~6–7 BDT/km margin. Drivers will feel this. |

Treat 0.75 as the **v1 baseline**, not a permanent answer. Move up to 0.80–0.85 once you have 60 days of realized pickup-distance data and can show drivers the numbers. They'll trust a future bump if it comes with evidence.

## Point 2 — Heat tag: before or after accept?

**Before accept. But remove the driver's ability to filter on it.**

The synthesis frames this as "driver-friendly vs. anti-cherry-picking" but that's a false binary. You can show the information and structurally prevent filtering:

- **Driver UI**: every lead card shows `Drop zone: Hemayetpur (cold) — likely next fare in ~22 min`. Honest, transparent, builds trust.
- **Dispatch algorithm**: ranks incoming leads on **proximity, ETA, and the cold-drop boost** — never on driver's stated zone preference. The cold-zone boost means a driver who accepts a cold-zone drop gets matched to the next lead faster than a driver in Gulshan who skipped, which removes the *incentive* to skip without removing the *information*.
- **No "heading to X" filter UI** (Qwen's idea, deferred correctly). The moment that ships, your cold zones die in a week.

What this concedes: drivers will still call riders and ask "where are you going" off-platform. You can't stop that. What you can stop is the platform's matching algorithm *enabling* it. Phone cherry-picking exists on every platform globally; it's a chronic background noise, not an addressable leak. Focus on the algorithm.

The one thing I'd add: **show the heat tag's confidence interval, not just the point estimate.** "Drop zone: Uttara (warm, ±4 min)" is more honest and trains drivers that the platform's prediction has uncertainty. This is anti-fragility against heat-score gaming (a driver can't selectively trust only the high-confidence cold tags).

## Point 3 — Per-category defaults

| Category | `free_radius_km` | `pickup_fare_cap_bdt` | Rationale |
|---|---|---|---|
| Bike | 0.7 | 20 | Bike trips typically 50–100 BDT. Cap at 20 = ~20–25% of trip. Free radius small because bikes are dense in Dhaka. |
| CNG | 1.0 | 30 | CNG trips 80–200 BDT. Cap at 30 = 15–35% of trip. Free radius medium; CNG drivers complain most about pickup distance. |
| Car | 1.5 | 50 | Car trips 150–500 BDT. Cap at 50 = 10–30% of trip. Free radius generous because car drivers are most selective. |

These free radii target the bottom 30–40% of pickups being free (mechanism triggers often enough to matter, not so often it becomes background noise).

Caveat: **these are starting guesses, not numbers to ship and forget.** Run a 30-day shadow pricing pass before going live — log what `free_radius_km` would have triggered at each value from 0.5 to 2.5, in 0.1km steps — and pick the value that puts trigger rate in 40–60% of pickups per category. If you can't run shadow pricing first, ship the values above, instrument hard, and re-tune at 30 days.

## Point 4 — Lead-debit multiplier: build it?

**No. Kill it. Use the dispatch boost instead.**

The synthesis is right that "discounting what a driver pays for a lead is mathematically an incentive" — and you set the no-incentive rule deliberately. Anything that varies the lead cost by destination heat, pickup distance, or driver history is an incentive wearing a different label, and the moment it ships, your "no platform incentives" promise is a lie that BRTA or a competitor can quote back at you.

The dispatch boost (Lever 2 in §4) is **the exact same economic signal, paid in a non-monetary currency: lead rank.** A driver in a cold zone doesn't pay less per lead — they get matched faster. The driver's expected hourly income rises; the platform's per-lead revenue is unchanged; no money changes hands. That's structurally clean.

The one **refund** I'd permit (and I'd be careful framing it as refund, not discount):
- Driver accepts a lead, drives 6km to pickup, rider cancels → driver gets **full lead credit** restored (lead was sold, service not delivered). This is contract law, not incentive.
- Driver accepts, rider no-shows past 5 min → driver gets 50% lead credit. Partial service.
- These should be the **only** cases where a driver's effective per-lead cost drops.

Frame it as a refund policy, audit it quarterly, and never let "refund" become "discount" in any internal doc or schema. If you see a field like `cold_zone_lead_multiplier` ever show up in a PR, reject it.

## Point 5 — Staged rollout

I'd reverse the order the synthesis hints at. **Dispatch boost first, pickup fee second.** Reasons:

- Dispatch boost is a free win for drivers. They notice immediately, they talk about it, retention lifts before any pricing change.
- When pickup fee lands, drivers are already in a "platform is improving" mindset, not a "platform is changing my economics" mindset.
- Mixing both at once means you can't tell which one is causing complaints, churn, or quote-rejection.

Concrete sequence:

| Phase | Duration | What ships | Gate to next phase |
|---|---|---|---|
| **0 — Shadow** | 2 weeks | Pricing service computes pickup fee but doesn't charge. Drivers see nothing. Log every quote, every trigger, every cap-hit. | 30+ days of data, no PII issues |
| **1 — Dispatch boost live, full city** | 2 weeks | Cold-zone priority boost + heat tag on all lead cards. **No pricing change.** | Driver NPS up vs. baseline; no matching latency regression |
| **2 — Pickup fee, car only, Dhanmondi zone** | 3 weeks | Pickup fee live for car, dense zone. Cap at 5,000 paid rides/day. | Quote-to-final deviation < 15%; rider complaint rate < 0.5%; driver acceptance rate > 80% on post-fee leads |
| **3 — Pickup fee, all categories, Dhanmondi → 3 more zones** | 4 weeks | Roll out CNG + bike in Dhanmondi, then car to Gulshan/Banani/Mirpur. | Same gates + free-radius trigger rate 40–60% per category |
| **4 — Citywide** | ongoing | All zones, all categories. | Continuous monitoring; re-tune per-category defaults at 60 and 120 days |

The 5,000-rides/day cap in Phase 2 isn't about infra — it's a deliberately small blast radius. If something goes wrong, you can rollback in hours, not weeks. Don't skip it.

---

## Two things the synthesis got right that I want to credit

1. **§3b three-state lifecycle beats my arrival-based version.** I argued in my second pass for "compute at arrival, no lock." The synthesis's "request → accept → bounded asymmetric true-up" is the right answer. Upward true-up is capped at 1.25× (kills rider's risk), downward true-up is unlimited (kills driver's incentive to dawdle). My arrival-only version was too rigid in the other direction. The 1.25× number is the right cap; I wouldn't go higher.

2. **§8 point 4 — off-platform completion — is the sharpest risk in the document.** For a lead-sales revenue model, this is your only revenue line and it's attackable. I'd add: the off-platform detection should compare the cancelled driver's subsequent GPS trace against the cancelled ride's pickup → drop route. A driver who goes to the cancelled pickup and then on the cancelled route within 30 minutes is almost certainly completing off-platform. Flag → review → strike → ban. The first detection run you do will likely surface a non-trivial number of repeat offenders; the platform's revenue line is more fragile than it looks.

---

## One thing I'd push back on

The synthesis defers "zone-aware free radius" to v2 in §6, calling it a tuning refinement, not Stage 1 architecture. I disagree — it's not architecture, but **the absence of zone-aware free radius in v1 will produce a measurable 2–3× difference in trigger rate between Dhanmondi and Bashundhara pickups, which will make v1 look broken in the suburbs.** Either ship with the three presets (dense/standard/suburban) from day one, or be ready to add them in week 3, not week 13.

If the constraint is that you don't have zone polygons ready at launch, then ship with one global default per category, but instrument `pickup_zone_id` on every ride so you can analyze and re-tune per zone from week 1. The data work is cheap; the bad rider UX from "Bashundhara pickups always charge" is not.

Want me to draft the actual pricing service code (Python, with the schema as Pydantic + the three-state lifecycle + the bounded true-up), or write the SQL migration for the `pricing_config` and `call_packages` tables? Or do you want to push on the dispatch-matching algorithm next, which the synthesis kept thin?