# Ride Fare Framework — Stage 1 (Locked Top-Level)

Synthesized from 10 independent model responses (ChatGPT, DeepSeek, Gemini, GLM, Kimi, Mimo, Minimax, Mistral, Meta AI, Qwen). This is the **top-level architecture lock** — mechanism choices and formula shape. Field-level tuning, exact default numbers, and a few explicitly-flagged forks are deferred to Stage 2 (nitty-gritty round).

### The objective function (added post-Stage 3, answers a gap ChatGPT flagged in Stage 2)

The platform is not in the business of maximizing leads sold. It's in the business of attracting enough riders and drivers that drivers keep buying packages, week over week. **The north-star metric is weekly package renewal rate**, driven by network growth and match quality — not gross lead volume per ride. Every major decision already locked in this document (no debit multiplier, no destination-based pricing, no incentive games, information over cash) derives from this, whether or not it was stated explicitly at the time. It's stated explicitly now because it resolves downstream questions (see §6 below) without needing new mechanism design.

### The fairness principle (governs every charge in this document)

Neither party should feel cheated — rider or driver. This isn't just a values statement; it's a concrete filter every pricing decision in this document has to pass: **can this specific charge be explained honestly, in one sentence, to the person paying it, in a way that's actually caused by something they did or something they can see?** The pickup fee passes ("the driver had to travel further to reach you" — true, visible, caused by the rider's own pickup point). Anything priced off a forecast about what happens to the driver *after* the trip — a destination-heat surcharge, a "likely wait time" charge — fails this test regardless of how it's labeled, because there's no honest one-sentence explanation that doesn't amount to "you're being charged extra for where you're going," which reads as a penalty, not a fee.

**Consequence for anything genuinely unusual for this market** (the pickup fee itself qualifies — Dhaka riders are used to one flat number): it needs an in-app, first-time explanation before it's just dropped into a receipt as an unexplained line item. This elevates what was previously listed as a Stage 2 gap ("rider communication strategy," noted by Mimo) from a nice-to-have to a required v1 deliverable, not something deferred to later polish.

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

Zero pricing involvement. Four dispatch-layer levers — one proactive (before a ride exists), three reactive (after a drop-off) — in order of when they act:

**Lever 0 — Proactive idle-driver positioning.** Idle drivers (no active ride, idle past a threshold) see a live map layer suggesting nearby zones worth waiting in, powered by the same blended heat score used for Lever 1's drop-zone tag, but computed **relative to current idle-driver density in each zone**, not absolute heat. This is what keeps it from backfiring: ranking purely by absolute heat would pull every idle driver toward the single hottest zone, oversaturating it while emptying zones that were merely warm — the opposite of the platform's actual goal, which is maximizing total successful matches citywide, not concentrating supply in one place. As drivers respond to the signal and idle-density in a zone rises, that zone's relative score adjusts down for the next driver, redirecting them elsewhere automatically. **Strictly suggestive — never mandatory, no penalty for ignoring, no lead-priority tied to compliance.** A driver who is contractually required to be physically located in a specific zone to receive leads is drifting toward an employment relationship rather than an independent-contractor one; this stays a map suggestion, not a rule.

**Lever 1 — Information.** Every lead the driver sees, pre- or post-accept (see open question below), carries a drop-zone heat tag: hot / neutral / cold. This is cheap, instant, and — per GLM and Meta AI, independently — the single highest-retention-impact item in the whole framework, because "where will I end up" is reportedly drivers' single biggest anxiety on a subscription model where they've already paid for the lead.

**Lever 2 — Dispatch rank boost for drivers just dropped in a cold zone.** A driver whose last drop-off was a cold zone gets a temporary ranking multiplier (decaying over ~15 minutes) for their next lead assignment. This is a matching-priority change, not a payment — it costs the platform nothing and doesn't touch the no-incentive boundary.

**Lever 3 — Return-lead pre-matching.** When a driver accepts a ride into a known cold zone, the dispatch engine proactively starts surfacing leads near that drop zone before the driver even asks. Smarter sequencing of leads the driver already paid for — not new spend.

**Why Lever 0 doesn't undermine Levers 2 and 3:** those two exist to keep cold zones from losing coverage entirely once a driver lands there. Lever 0, if built naively (absolute heat, no supply-awareness), would work against that by draining idle supply away from cold zones before a ride even happens. The relative-density design is what keeps the two halves of this mechanism pointed the same direction instead of fighting each other.

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

---

## Stage 2 Lock — Nitty-Gritty Round

Resolved from a 9-model round (ChatGPT, DeepSeek, Gemini, GLM, Kimi, Mimo, Minimax, Mistral, Qwen) against §9's five open questions. Four of five converged; the pickup-rate number itself was left open pending real Dhaka cost data (later resolved in Stage 3, tiered by vehicle).

### Destination reveal timing — locked

**Zone-level heat tag before accept. Exact address only after accept.** 8/9 models converged on this shape (Mistral was the lone dissent, arguing for zone name only with no heat classification pre-accept).

Reasoning that settled it: hiding the destination entirely doesn't stop cherry-picking in Dhaka — it just moves it off-platform, since drivers already call riders to ask "kothay jaben?" before accepting. A driver who accepts blind and lands in a dead zone blames the platform for selling a bad lead, which damages trust in the core product (lead packages) faster than visible cherry-picking ever would. Structured, on-platform declines are also trackable and manageable (decline-rate monitoring, cooldowns); off-platform phone-call cherry-picking is invisible and unmanageable.

Lead card shows: pickup km, ETA, pickup fee, drop **zone** + heat tag (hot/neutral/cold — coarse, not a numeric score), trip km, estimated fare, lead cost. Exact address unlocks only after accept.

### Lead-debit multiplier — locked, rejected

**Do not build it.** 7/9 models against; DeepSeek and Gemini were the dissenting minority arguing for differentiated lead pricing as "product tiering" rather than an incentive.

The heat tag (already locked above) makes this moot rather than merely policy-blocked: the multiplier's function was compensating drivers for cold leads they took *unknowingly* — an ex-post rebate for ignorance. Once the pre-accept heat tag exists, the driver chooses the cold lead with eyes open and prices the risk into their accept decision themselves. Ex-ante information does the multiplier's job with zero policy ambiguity and zero cost. Rebating a driver for an informed choice is a straight incentive with a different label, and this architecture already has one hard rule against exactly that.

**Revisit trigger, written down so deferral isn't silent death:** revisit if cold-tag median accept latency exceeds 2× hot-tag, or a cold-corridor driver cohort's 90-day package repurchase rate lags a hot-corridor cohort by more than 15 percentage points, sustained over 8 weeks. If it's ever built, it gets built as *conditional lead pricing* with a hard budget cap — never framed as a rebate or incentive internally, in code, or in any driver-facing copy.

### Free-radius / cap defaults — process locked, numbers deferred

No synthetic numbers get shipped. You don't have real Dhaka pickup-distance data yet, so the rollout sequence is designed to produce it before the numbers get set.

- **Stage 0 (dispatch-only, no pricing change)** harvests realized pickup-distance distributions per vehicle category, per zone class.
- Free radius gets set at **p70–p75 of that distribution per category**, targeting a 25–30% charge-incidence rate.
- **Hysteresis on future adjustment:** ±0.25km max per review cycle, two consecutive monthly reviews required before moving the radius again — prevents the radius drifting week to week and reading to riders as stealth surge pricing.
- **Cap expressed in km, not BDT.** `cap_billable_km: 2.0` per category, so `fee = rate × min(billable_km, cap_billable_km)`. "You never pay for more than 2km of pickup" is a sentence a rider, a driver, and a regulator can all hold in their head — and it auto-tracks any future rate change instead of the BDT cap silently decaying into irrelevance as rates move.
- **The %-of-fare cap stays as a backstop only, not a second active cap** — set to bind rarely (≈40%), catching only the short-trip/long-pickup edge case where a fee approaching a third of the fare would otherwise generate screenshots and complaints. If it starts binding on more than ~3% of charged rides, that's a dispatch-quality problem (why is the nearest driver 4km away for a 1.5km trip), not a pricing problem — fix the match, don't compress the driver's pay.

### Off-platform completion — protocol locked

This got elevated from a gaming-category line item to a full protocol, because it's the one risk that's a direct attack on the platform's only revenue line, not a normal ride-hailing fraud problem.

- **Structural prevention, not just detection:** cancellation cooldown (a driver who cancels after being within 200m of the pickup pin can't accept another lead for a set window — makes serial cancel-and-reaccept economically painful), cancellation rate gating package eligibility (above a threshold, the driver can't purchase their next package until reviewed).
- **Detection:** GPS trace matching — if a driver cancels a ride and their subsequent GPS trace overlaps the cancelled ride's route by a high margin within a short window post-cancellation, flag as high-suspicion offline completion.
- **Response ladder:** warning + lead-price surcharge on first offense, escalating to suspension and eventually permanent ban on repeat offenses.
- **Rider-side signal:** a brief post-cancellation survey ("did you still complete this trip?") as a cheap secondary detection channel.

### Staged rollout — shape locked, gate numbers to be set from Stage 0 data

Consensus shape across the panel: **shadow → dispatch-only baseline → controlled pricing → full deployment**, with quantitative go/no-go gates between every stage, not a calendar-based rollout.

- **Stage 0 — Shadow/dispatch-only.** Heat tags, dispatch rank boost, and return-lead pre-matching go live. No pricing change. This stage exists partly to generate the free-radius calibration data above. Exit gate: heat-model validation — backtest the blended heat score against realized post-drop 60-minute earnings on held-out weeks; only ship tags once the correlation is meaningfully positive.
- **Stage 1 — Pickup fee live**, radius set at the calibrated p75. Gates to proceed: complaint rate under a fixed threshold per 1,000 charged rides, quote-to-final deviation within a fixed band, periphery accept-rate holding within a few points of the Stage 0 baseline, cap-binding rate staying low, driver retention at or above Stage 0 baseline. Auto-rollback triggers defined in advance, not decided in the moment.
- **Stage 2 — Tighten** radius toward the p70 target; add rider-side cancellation enforcement (reputational only — there's no rider payment rail to enforce against directly).
- **Stage 3 — Steady state.** Nothing new ships by default; the out-of-coverage return allowance and remote-zone fee (§5) only get built here if the data from live operation actually shows they're needed — they're operational products, not demand pricing, and were correctly scoped as Phase 2 from the start.

**Meta-note carried over from the round itself:** most of §9's five questions weren't actually questions more model opinions could settle — two were data questions (Stage 0 will answer them) and three were product/policy calls where a tenth opinion added little. That's why this round closed cleanly instead of generating another split.

---

## Stage 3 Lock — True-Up Mechanism & Pickup Rate Tiering

Resolved after a three-model adversarial round (GLM, DeepSeek, Mimo) on the two hardest open forks from Stage 2. Both are now locked.

### Pickup rate — final, tiered by vehicle

```
rate_multiplier_by_category: { bike: 0.75, cng: 0.80, car: 0.90 }
```

Car gets the *highest* fraction of trip per-km rate, bike the lowest — confirms Minimax/Mistral's direction, overturns Kimi's inverse tiering. Reasoning: category-specific opportunity cost (a car driver's deadhead minute is priced against car earnings, not bike earnings — they can't arbitrage between categories mid-shift), and Dhaka car deadhead km cost roughly 2.7× bike deadhead km.

**Display rule:** publish absolute ৳/km per category to drivers. Never expose the multiplier itself — "car gets 90%, bike gets 75%" invites a fairness complaint about the wrong thing; the real story (car pickup costs ~2× more per km than bike pickup) is what's true and defensible.

### True-up — final mechanism

Two distinct problems, two distinct fixes. Don't solve them with the same lever.

**Problem A — acute per-ride gaming (dawdling to inflate the fee).** Small stakes, self-limiting: at locked rates, route-inflation nets a bike driver ~৳0.35/km and *loses* money for CNG (-৳4/km) and car (-৳12/km). Fix is a monitor, not a formula change:

- **True-up formula stays as originally locked in §3b**: downward uncapped (rider-favorable, correct because it reflects real distance actually driven), upward capped at 1.25× firm quote.
- **Dawdle guard, layered on top, not baked into payout:** dual trigger — rolling-30-pickup median >1.15× **or** p90 >1.35×, both zone-relative (+0.10 margin). Median alone misses a driver who spikes once in thirty rides; the p90 leg catches that.
- **Suspension escalation:** flag at 30 charged pickups or 14 days (whichever first) → doubling window on repeat offense → package review on third.
- **Rejected: DeepSeek's decoupled time-weighted supplement** (rider hard-locked at firm quote, driver gets a separate ETA-based supplement paid by the platform). Correct diagnosis — Dhaka gridlock makes *time*, not distance, the real dawdling lever — wrong prescription. It turns the platform into a payer of variable driver compensation the rider never sees, which is a new subsidy mechanism this architecture doesn't have and shouldn't add; it also needs live-ETA refresh every 2 minutes per active pickup for a problem worth pennies per ride under the locked economics.
- **Rejected: Mimo's symmetric 0.80–1.15 band with a downward floor.** The floor is the flaw — if a driver is assigned a shorter pickup than quoted, paying them 80% of the quote anyway is compensation for deadhead they didn't drive. That's a windfall, and it reopens gaming from the other direction.

**Problem B — systemic routing-engine underestimation in poorly-mapped zones (Old Dhaka, monsoon lowlands, incomplete map data).** This is Mimo's real catch, and it's a genuinely different problem — no true-up band fixes it, including Mimo's own proposed fix (a 1.15× cap protects *less* against a 5km-actual-vs-3km-quoted underestimate than the original 1.25× did). Fixed separately:

- **Automatic, fast-cycle zone recalibration.** If a zone's rolling deviation between quoted and actual pickup distance exceeds ~20% over N rides, auto-flag for radius/rate review within days — not the "4 weeks + ops approval" gate Mimo originally proposed and then correctly self-criticized as too slow to matter before experienced drivers have already learned to avoid the zone.
- **Never show route-confidence flags to drivers pre-accept.** Mimo's own mid-pass correction is right: a driver who sees "low confidence" declines more, not less — a transparency mechanism that quietly makes the service-quality problem worse. Instead, widen the *rider-facing* quoted range in low-confidence zones, and route the real fix into map-data prioritization for those zones.

**Protected invariant — write it into config, not just into behavior:**
```
low_confidence_never_bills_above_firm_quote: true
```
No exploit exists today because low-confidence GPS traces already can't trigger an upward true-up. The exploit opens the moment a future refactor changes the fallback logic without knowing this constraint exists. Pin it now, with a comment, so it survives personnel turnover.

### Supporting config additions from this round

```jsonc
"pickup_fee": {
  "rate_multiplier_by_category": { "bike": 0.75, "cng": 0.80, "car": 0.90 },
  "display_basis": "absolute_bdt_per_km",
  "trueup": {
    "realized_anchor": "driver_trace_accept_to_trip_start",
    "origin_point": { "confidence_min": 0.7, "fallback": "last_high_confidence_fix_pre_accept" },
    "protected_invariant": "low_confidence_never_bills_above_firm_quote",
    "upward_cap_multiplier": 1.25
  },
  "dawdle_guard": {
    "rolling_charged_pickups": 30,
    "triggers": [ { "stat": "median", "threshold": 1.15 }, { "stat": "p90", "threshold": 1.35 } ],
    "zone_relative_margin": 0.10,
    "suspension": { "window_pickups": 30, "or_days": 14, "escalation_windows": [1, 2, 4], "third_offense": "package_review" }
  },
  "pin_edit": { "tolerance_m": 250, "max_forced_requotes": 2, "beyond_max": "cancel_only", "requote_resets_free_cancel_window": true },
  "zone_recalibration": { "trigger_deviation_pct": 20, "min_sample_rides": "N (define at Stage 0)", "review_sla_days": 5 }
}
```

### Still open

- Zone-recalibration sample-size threshold (N) needs real Stage 0 data before it can be set — don't guess it.

---

## 6. Lead Economics — Confirmed Rules & Resolved Questions

Facts confirmed directly by Zia, not derived by the model panel. Locking them here since they correct assumptions several Stage 2 models made.

**A lead is consumed at dispatch, not at completion.** A ride call sent to a driver debits one lead whether the driver accepts or rejects it. Sales outcome is not the lead provider's concern — the lead is the call itself.

**Dispatch is sequential, not parallel/broadcast.** One driver is offered a ride at a time, with a response window, before the offer moves to the next candidate. This means:
- One completed ride typically consumes 1 lead. It only climbs above 1 when the first driver(s) offered decline or time out — each recipient in that decline chain is billed regardless of outcome.
- DeepSeek's "reference pool of 5 nearby drivers, 75th percentile" mechanism (§3a) is confirmed as a **passive distance lookup used only to calculate the rider's quote range** — it is not a 5-driver paid broadcast. Stated explicitly here so it never gets conflated with a paid dispatch during implementation.

**Packages are weekly**, not monthly (corrects Mimo's Stage 2 ROI model, which assumed "50 leads/month"). This is a better-designed cadence than what any model assumed — a full-time driver's realistic weekly call volume (~40–60 leads, accounting for decline chains) maps far more sensibly onto a weekly package than it would onto an inflated monthly tier, and weekly renewal gives a fast feedback loop for everything else in this framework.

### The decline-chain incentive problem — resolved, not engineered around

Earlier open question: since every driver in a decline chain gets billed, a badly-matched ride (declined 4 times before acceptance) earns the platform 5 leads instead of 1 for the same completed trip — a structural incentive for the platform to benefit from its own dispatch performing worse.

**Resolved by the objective function in the header, not by a new mechanism.** Under gross-lead-revenue optimization this would be a real problem. Under renewal-rate optimization it's self-correcting: every driver who burns a lead on a decline-chain rejection had a worse week, and with weekly packages that shows up in the very next renewal decision — roughly seven days later, not in some 90-day trailing average. Bad matching punishes itself before it can be exploited.

**Locked: instrument-only.** No cap on billable chain length, no queue-position discounting. The queue-position-discount option considered earlier is explicitly rejected — it's the same mechanism as the debit multiplier already killed in Stage 2 (conditional lead pricing based on observed lead quality), and rejecting it there but allowing it here would be inconsistent for no defensible reason.

**What to track instead:** lead-to-completion ratio per driver cohort, watched as a leading indicator of renewal risk — not as a revenue-optimization dial. A rising ratio (more leads burned per completed ride) predicts a renewal drop before it happens; that's the actionable signal, not the ratio itself.

### New addition: first-week driver protection

Weekly renewal makes a new driver's first week high-stakes in a way it wouldn't be under monthly packages. A driver with no ranking history yet is structurally more likely to sit at the back of decline chains under standard sequential dispatch, burn leads on rides that go to someone else first, have a rough first week on the numbers, and not buy week two — wasting the acquisition spend at the exact moment it was just made.

**Locked:** new drivers get priority placement (not last-in-sequence) in dispatch for their first N leads or first 7 days, whichever comes first. This is separate from, and stacks with, the earned cold-zone rank boost already locked in §4 — one is an onboarding protection, the other is an ongoing retention mechanic.

```jsonc
"lead_dispatch": {
  "billing_model": "per_offer_sequential",   // debits on offer, not on accept/complete
  "package_cadence": "weekly",
  "new_driver_protection": { "priority_window_leads": "N (to be set)", "priority_window_days": 7 },
  "monitors": { "lead_to_completion_ratio_by_cohort": true, "renewal_rate_by_cohort": "weekly" }
}
```

### Still open

- New-driver priority-window size (N leads) — a calibration value, set from early cohort data once the mechanism ships, not guessed now.
