# Ride Fare Framework — Stage 1 (Locked Top-Level)

Synthesized from 10 independent model responses (ChatGPT, DeepSeek, Gemini, GLM, Kimi, Mimo, Minimax, Mistral, Meta AI, Qwen). This is the **top-level architecture lock** — mechanism choices and formula shape. Field-level tuning, exact default numbers, and a few explicitly-flagged forks are deferred to Stage 2 (nitty-gritty round).

---

## 1. The Two Verdicts

| Problem | Verdict | Confidence |
|---|---|---|
| **Pickup dead-mileage** | Price it into the **rider fare** as a capped, transparent line item | 8/10 models agree; strongest reasoning wins |
| **Destination lucrativeness** | **Never** touches rider fare, ever. Dispatch/information layer only | 10/10 unanimous — this is the one thing nobody disputed |

### Why pickup ≠ destination, architecturally

Pickup dead-mileage is a cost the *rider caused* (their pickup point) and can *see* (a route on a map — verifiable, explainable, BRTA-defensible). Destination lucrativeness is a *forecast about the driver's future*, invisible and unverifiable to the rider, and legally indistinguishable from geographic price discrimination against whoever lives in an underserved area. One is billable; the other structurally is not. Treating them the same way was the mistake in the first-pass drafts from several models.

---

## 2. Rider Fare Formula (final shape)

```
final_fare = base_fare
           + (per_km_rate × trip_distance_km)
           + (waiting_rate × chargeable_waiting_minutes)
           + pickup_fee
```

No destination term. No live hotspot multiplier. No "demand" coefficient anywhere in this formula, permanently — this is the line GLM and ChatGPT both independently called "the hill to die on," and it's correct: the moment fare depends on a probabilistic future-demand signal the rider can't audit, you've built a surge-pricing engine you can't defend to BRTA or to a rider asking "why did an identical trip cost more today."

---

## 3. Pickup Fee — Mechanism

**Structure:** free radius → per-km rate → double cap (absolute BDT + % of trip fare, take the lower).

```
chargeable_km = max(0, reference_pickup_km − free_radius_km)
pickup_fee_raw = chargeable_km × pickup_per_km_rate
pickup_fee = min(pickup_fee_raw, cap_amount_bdt, cap_pct_of_trip_fare × fare_before_pickup)
```

Four sub-decisions, each pulled from the strongest individual proposal:

**a. Reference distance = a quantile of the nearby driver pool, not the single nearest driver.**
(DeepSeek's contribution.) Take the closest N available drivers (default pool of 5), sort by routed distance, quote off the 75th percentile. Quoting off the single nearest driver breaks the moment that driver declines — the rider gets re-quoted, which is worse UX than a slightly conservative quote that mostly holds.

**b. Three-state quote lifecycle, not a single lock-and-forget number.**
(GLM's contribution — this is the cleanest resolution to a real tension other models argued about.)
1. **Request:** rider sees a capped *range* ("pickup fee: ৳0–25").
2. **Accept:** rider sees a *firm* line item, computed from the routed path, driver position at accept → pickup pin.
3. **Post-ride true-up:** bounded and asymmetric. If the realized path is *shorter* (rider moved toward driver), the rider pays less, automatically. If *longer*, true-up is capped at 1.25× the firm quote — never open-ended. This kills the two competing failure modes other drafts hit: locking fully at accept lets a driver dawdle and still get paid the same (Minimax's objection), while recomputing fully at arrival breaks the rider's upfront price certainty. Bounded asymmetric true-up gets both.

**c. Distance is always platform-computed via routing engine, never self-reported, never live-tracked mid-trip.**
Snapshot the driver's GPS at the moment they accept (or at dispatch offer, per city calibration). Compute shortest **road-network** distance (not haversine — Dhaka's grid makes straight-line distance badly wrong). This single design choice, which appeared in nearly every draft independently, is what makes the pickup-distance gaming vectors (drive-away-to-inflate, GPS spoof) tractable at all.

**d. Rate is a fraction of the trip per-km rate, not equal to it — flagged as an open calibration question.**
Majority position: ~60% of trip rate (driver isn't carrying a passenger yet). Minority, well-argued position (Meta AI, GLM): should be closer to 100%, because empty-km fuel and time cost the driver roughly the same as loaded-km cost, and discounting it is effectively subsidizing the rider at the driver's expense. **This is a Stage 2 question — send both positions back to the models with real Dhaka fuel-cost data if you have it.**

---

## 4. Destination Lucrativeness — Mechanism

Zero pricing involvement. Three dispatch-layer levers, in order of how much they actually move the needle:

**Lever 1 — Information.** Every lead the driver sees, pre- or post-accept (see open question below), carries a drop-zone heat tag: hot / neutral / cold. This is cheap, instant, and — per GLM and Meta AI, independently — the single highest-retention-impact item in the whole framework, because "where will I end up" is reportedly drivers' single biggest anxiety on a subscription model where they've already paid for the lead.

**Lever 2 — Dispatch rank boost for drivers just dropped in a cold zone.** A driver whose last drop-off was a cold zone gets a temporary ranking multiplier (decaying over ~15 minutes) for their next lead assignment. This is a matching-priority change, not a payment — it costs the platform nothing and doesn't touch the no-incentive boundary.

**Lever 3 — Return-lead pre-matching.** When a driver accepts a ride into a known cold zone, the dispatch engine proactively starts surfacing leads near that drop zone before the driver even asks. Smarter sequencing of leads the driver already paid for — not new spend.

**Explicitly deferred to Phase 2, not Stage 1:** any lead-cost discount/multiplier tied to pickup distance or drop heat (GLM's "debit multiplier," Gemini's "dynamic lead pricing," ChatGPT's "lead rebate"). Kimi and Qwen make the sharpest version of the counter-argument: **discounting what a driver pays for a lead is mathematically an incentive**, wearing a different costume. Given your architecture already treats incentive-adjacent mechanics as something requiring an explicit product decision (see the Driver PR Campaign's net-zero-cost design), this should not be smuggled into the fare/dispatch framework as a default — it's a separate policy call for you to make deliberately, not something 3 of 10 models should back into by consensus-of-one-mechanism.

**Heat score itself should not be simple live call-density.**
GLM's approach is the most defensible: blend a trailing baseline (post-drop earnings in the following 60 minutes, percentile-ranked) with a live EWMA of request density, weighted roughly 40/60 baseline/live. This correctly classifies a queue-managed zone like the airport as "hot" even though time-to-next-fare looks bad — pure call-density scoring gets this wrong and would mislabel one of Dhaka's most valuable drops as cold.

---

## 5. Two Edge Cases That Are NOT "Destination Lucrativeness" (Don't Conflate Them)

**a. Out-of-coverage return.** If a drop-off is genuinely outside your defined Dhaka service polygon, that's an *operational* cost, not a demand forecast — a flat, published, distance-based return allowance to the polygon edge is defensible in a way a live-demand surcharge never is. (Meta AI's contribution — the only model to separate this from the demand question.)

**b. Structurally remote destinations.** Pre-declared, published zone classes (e.g., "Zone C — Remote": Savar industrial belt, Mawa) can carry a static, published remote-zone fee, because the trip itself is a different product, not because drivers happen to dislike it today. This must never be computed from the live hotspot score — it's a fixed geofence lookup. (ChatGPT's contribution.) Treat as optional, Phase 2.

---

## 6. What's Explicitly Out of Stage 1

- Time-based (vs. distance-based) pickup pricing — several models (Mistral, Meta AI, Qwen) argue Dhaka traffic makes time matter more than distance. Real point, adds real complexity. Ship distance-based v1, revisit with data.
- Zone-aware free radius (dense/standard/suburban presets) — Minimax's nuance is good but is a v2 tuning refinement, not a Stage 1 architecture decision.
- Any lead-cost/debit multiplier tied to pickup or heat — see §4.
- Driver-side destination filters ("heading to Uttara" toggle) — Qwen's genuinely novel idea, worth prototyping later, not core to the fare mechanism.
- Round-trip / hourly product — real gap Minimax flagged, unrelated to this framework, separate product decision.

---

## 7. Config Schema — Shape Only (fields TBD in Stage 2)

```
pricing_config      scope: city × vehicle_category, versioned
  fare: { base_fare, per_km_rate, waiting_rate, free_waiting_minutes }
  pickup_fee: { enabled, free_radius_km, rate_per_km, cap_amount, cap_pct_of_fare,
                reference_pool_size, reference_quantile, distance_type: road_network,
                max_upward_trueup_multiplier }

dispatch_config     scope: city
  hotspot: { zone_granularity, baseline_window, live_window, blend_weights, thresholds }
  matching: { cold_drop_rank_boost, boost_decay_minutes, decline_budget_per_hour }
  lead_card: { destination_disclosure_timing, fields_shown }
```

---

## 8. Gaming — Categories to Close in Stage 2 (don't skip this list)

1. Pickup-distance manipulation (drive-away-after-accept, GPS spoof, teleport jumps)
2. Cherry-picking / decline-spam on cold-zone leads
3. Heat-score manipulation (fake rider requests, account sharing to inflate a zone's demand)
4. **Off-platform completion** — driver cancels on-platform then completes the ride off-app to dodge the lead debit entirely. GLM was the only model to name this, and it's arguably the sharpest risk in the whole document for a lead-sales revenue model: it's a direct attack on your only revenue line. Needs a named owner and regular anomaly review (trace-matching a cancelled ride's route against a cancelled driver's subsequent GPS trace).
5. Rider-side pin gaming (moving pin post-accept to inflate/deflate fee)

---

## 9. Open Decisions for the Stage 2 (Nitty-Gritty) Round

Send this back to the models with the locked framework above as context:

1. Pickup rate: 60% of trip per-km rate, or closer to 100%? (§3d)
2. Destination reveal timing: show drop-zone heat tag **before** accept (driver-friendly, but risks cherry-picking) or **after** accept (kills cherry-picking, but drivers already ask by phone anyway)?
3. Exact free-radius / cap defaults per vehicle category (bike / CNG / car), calibrated against real Dhaka pickup-distance data once you have it.
4. Whether the lead-debit multiplier (§4, deferred) gets built at all, and if so, under what explicit policy label (not "incentive").
5. Staged rollout plan: dispatch-only baseline period before pickup-fee goes live, with quantitative gates (e.g., complaint rate, quote-to-final deviation) before tightening.

---

## 10. Ranking of Source Models (depth / width / completeness / lateral thinking)

| Rank | Model | Score /100 | One-line why |
|---|---|---|---|
| 1 | GLM 5.3 | 96 | Most complete: 3-state quote lifecycle, bounded true-up, sophisticated blended heat metric, staged rollout with quantitative gates, and the only one to catch off-platform-completion as an existential revenue leak |
| 2 | DeepSeek | 88 | Quantile-based reference distance is the sharpest single original mechanism in the set; thorough re-quote logic and gaming table |
| 3 | Mimo 2.5 Pro | 87 | Most exhaustive document — full schema, UX mockups, numeric ROI modeling, H3 grid, edge cases — high completeness, lower on novel mechanism design |
| 4 | Meta AI | 85 | Bluntest and most Dhaka-concrete (fuel/time examples by neighborhood); out-of-coverage-return-fee is a genuinely useful edge-case catch nobody else made |
| 5 | Minimax 3 | 84 | Sharp self-critique; caught that pickup fee going 100% to driver compresses platform revenue per lead — nobody else raised this; zone-aware free radius is a good nuance |
| 6 | Gemini | 82 | Most radical reframe (lead as dynamic currency) with genuinely production-grade ledger engineering, but drifts off-topic into ledger implementation and its core mechanism conflicts with the no-incentive argument other models make well |
| 7 | Qwen | 79 | Best single novel product idea (driver "heading to" destination filter); good phantom-pickup collusion catch; thinner on schema and rollout |
| 8 | Kimi | 78 | Cleanest, most principled "brutal honesty" stance and the sharpest version of the lead-discount-is-an-incentive argument; less mechanistic sophistication than the top tier |
| 9 | Mistral | 75 | Solid and complete but formula is clunkier (separate distance/time caps) and less original than the leaders |
| 10 | ChatGPT | 74 | Genuinely interesting strategic reframe ("access to demand is the real currency") and the remote-zone-fee idea is good, but its core recommendation — no rider pickup fee by default — is the weakest position in the set against the retention counter-argument |

---

**Next step:** send §9's five open questions, with this document attached as locked context, back to the model panel for the nitty-gritty round.
