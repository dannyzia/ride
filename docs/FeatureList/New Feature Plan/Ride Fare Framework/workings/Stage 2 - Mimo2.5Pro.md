# Stage 2 Open Decisions — Complete Second Pass

My opinionated take on all five questions from Section 9, plus the supporting mechanics, edge cases, and additions I believe the Stage 2 round needs to resolve.

---

## Decision 1: Pickup Rate — 60% or ~100% of Trip Per-Km Rate?

**Position: Start at 60%. Tag it as a launch-phase rate with a scheduled 90-day review. Let data decide the permanent number.**

The two camps are answering different questions. The 60% camp answers "what feels fair to the rider right now?" The ~100% camp (Meta AI, GLM) answers "what accurately reflects the driver's real cost?" A liter of CNG doesn't care whether there's a passenger in the back seat — empty-km fuel cost is roughly equal to loaded-km cost. The ~100% camp has the stronger economic argument.

But at launch, rider adoption is fragile. A pickup surcharge that feels aggressive will spike the cancellation-after-seeing-surcharge metric. Starting at 60% gives room to absorb that shock. Then run the A/B test: 60% vs. 80% vs. 100%, with package renewal rate and rider cancellation rate as competing guardrails. The data resolves the argument that speculation cannot.

The discipline: don't let 60% calcify into a permanent entitlement. Tag it in the config as `launch_phase_rate` with a scheduled review date.

---

## Decision 2: Destination Reveal Timing — Before Accept or After Accept?

**Position: Show the heat tag before accept. Coarse granularity only (hot / neutral / cold). This is the higher-risk choice, but the alternative is worse in practice.**

The "after accept" position is clean in theory: if the driver doesn't know the destination is cold, they can't cherry-pick. But the document itself acknowledges the fatal flaw — "drivers already ask by phone anyway." In Dhaka's market, drivers call riders before accepting. This is cultural and widespread. If your system hides the destination but the driver calls and asks anyway, you've achieved nothing except:

- Punishing honest drivers who accept blind and get stuck in dead zones.
- Rewarding drivers who cherry-pick via phone while maintaining a clean acceptance rate in your system.
- Creating a perverse incentive to develop off-platform information networks.

Showing the heat tag before accept gives you something powerful: **structured, trackable cherry-picking**. If the driver can see "cold" in the app and decline, you *know* they declined because of the heat tag. You can measure it. You can build the zone-specific acceptance tracking the anti-gaming framework already describes. You can apply cooloff and deprioritization against *visible, recorded* behavior rather than trying to detect invisible phone-call cherry-picking you can never prove.

The existing tools — consecutive-decline cooloff, acceptance-rate thresholds, allocation deprioritization — work *better* when declines are visible in the system rather than happening off-platform.

One guardrail: the heat tag must be coarse. A driver seeing "cold — estimated 12 min to next fare" has too much information for cherry-picking optimization. A driver seeing a simple "cold" tag gets enough to manage anxiety without enough to build a precise filtering strategy.

---

## Decision 3: Exact Free-Radius / Cap Defaults Per Vehicle Category

**Position: Launch with a single conservative default across all categories. Fork based on data after 60 days.**

Without real Dhaka pickup-distance data, any per-category defaults are fiction. Here's the launch plan:

**Phase 1 (launch) — single default for all categories:**

| Parameter | Value | Rationale |
|---|---|---|
| `free_radius_km` | 2.0 | Covers most core-area pickups in Dhaka's density. |
| `cap_amount_bdt` | ৳75 | High enough to not bind in normal conditions, low enough to prevent rider shock. |
| `cap_pct_of_fare` | 40% | The %-cap binds on short rides; the absolute cap binds on long rides. Together they prevent disproportionate surcharges across all fare levels. |

**Phase 2 (after 60 days of data) — fork by vehicle category.** Hypotheses, not recommendations:

- **Bikes:** Smaller free radius (1.0–1.5 km) because bikes navigate narrow lanes and reach pickups cars can't. Lower absolute cap because bike fares are lower.
- **CNG auto-rickshaws:** Standard defaults probably hold. CNGs cluster at stands, so pickup distances are bimodal — very short or very long.
- **Cars:** Possibly larger free radius (2.5–3.0 km) because cars serve longer trips where the surcharge is a smaller fraction of total fare.

These are hypotheses. The data should drive the fork. The config schema should support per-category overrides from day one, even if you only populate one set of values initially.

---

## Decision 4: Lead-Debit Multiplier — Build It or Not?

**Position: Don't build it. Kimi and Qwen are right — it's an incentive wearing a costume.**

The no-incentive policy isn't a technical constraint; it's a product identity constraint. The platform's value proposition to drivers is: "We don't play games with your money. You buy leads, you keep fares."

The moment you start discounting leads for cold zones, you've introduced a mechanism where the platform is implicitly paying drivers to accept undesirable rides. The discount comes from somewhere — either the platform's revenue (direct incentive) or from other drivers' lead costs (cross-subsidization, which is a hidden incentive). Kimi's argument that "discounting what a driver pays for a lead is mathematically an incentive, wearing a different costume" is the correct framing.

The three dispatch-layer levers (heat tags, ranking boost, pre-matching) are sufficient. If a driver gets a cold-zone ride, they see the heat tag, they get a ranking boost for their next lead, and the system pre-matches a return ride. The driver's experience is: "I took a cold-zone ride, and the system immediately surfaced a good return lead." That's a positive experience without any money moving.

If, after 6 months of operating with the three dispatch levers, cold-zone acceptance rates are still unacceptably low, *then* revisit this as a deliberate policy decision. Don't smuggle it in as a default.

---

## Decision 5: Staged Rollout Plan

**Position: Three distinct stages with quantitative gates between each. Shadow mode is non-negotiable.**

**Stage A: Dispatch Baseline (Weeks 1–4)**

Launch with the full dispatch engine — heat tags, ranking boost for cold-zone drops, pre-matching. No pickup fee. All rides have zero pickup surcharge.

Purpose: establish baseline metrics for rider wait time, driver acceptance rate, package renewal rate, and average driver idle time. You need these numbers to measure the pickup fee's impact against.

Gate: at least 1,000 completed rides and 100 package purchases. Don't move to Stage B on thin data.

**Stage B: Pickup Fee — Shadow Mode (Weeks 5–6)**

The pricing engine calculates the pickup fee for every ride and logs it, but does NOT charge the rider. The rider sees ৳0.

Purpose: you now know, for every ride that happened, what the pickup fee *would have been*. Analyze the distribution. How often does it hit the cap? What's the average as a % of fare? How would it have affected quote-to-final deviation?

Gate: confirm that <10% of rides would have triggered the high-surcharge warning (৳50+). If more than 10% would have, your free radius is too small — increase it before going live.

**Stage C: Pickup Fee — Live, Soft Launch (Weeks 7–10)**

Enable the pickup fee for real, but with conservative parameters: free radius 10% larger than target, cap 10% lower than target. Err on the side of under-charging.

Monitor: rider cancellation rate after seeing surcharge, quote-to-final deviation, package renewal rate, driver complaint volume.

Gate: cancellation-after-surcharge <10%, quote-to-final deviation <15%, no statistically significant drop in package renewal rate vs. Stage A baseline.

**Stage D: Full Parameters (Week 11+)**

Tighten to target free radius and cap values based on Stage C data. Begin A/B testing rate adjustments (the 60% vs. 100% question from Decision 1).

---

## The Three-State Quote Lifecycle: Implementation Details

The document's three-state lifecycle (request → accept → post-ride true-up) is the most important UX mechanism. It determines how riders experience the pickup fee. But the document leaves several implementation ambiguities unresolved.

### State 1: Request — The Range

When the rider enters their pickup and destination, the system doesn't yet know which driver will accept. It computes a pickup fee range based on the nearby driver pool.

1. Find the closest N available drivers (default pool of 5).
2. For each, compute road-network distance from their current GPS to the pickup pin.
3. Sort distances ascending. Take the 75th percentile.
4. Apply the formula: `max(0, p75_distance − free_radius) × pickup_per_km_rate`.
5. Lower bound of the range is ৳0 (best case: a driver is within the free radius).
6. Upper bound is the computed value, capped by `cap_amount` and `cap_pct_of_fare`.

Why the 75th percentile: quoting off the nearest driver breaks the moment that driver declines — the rider gets re-quoted at a higher amount. Quoting off the 75th percentile means the quote is conservative enough to hold in most cases, even if the nearest driver declines and the system assigns the 2nd or 3rd closest. The rider occasionally overpays slightly (when the actual driver is closer than the 75th percentile), but the true-up corrects this downward. The asymmetry is intentional: the range is biased high, the true-up corrects low. The rider's mental model becomes "the price usually goes down, never up."

What the rider sees:

```
Pickup fee: ৳0 – ৳25
(Depends on which driver accepts. Final amount confirmed before ride starts.)
```

### State 2: Accept — The Firm Quote

When a specific driver accepts, the system computes the exact pickup fee from that driver's GPS snapshot to the pickup pin.

**Critical rule: if the firm quote exceeds the upper bound of the original range, cap the firm quote at the original range upper bound.** The rider was promised "৳0–25." They should never see "৳32." The platform absorbs the difference. This only triggers when the driver pool thins between request and accept, which should be rare given the 30-second acceptance window.

What the rider sees:

```
Driver: Rafiq, 4.2★ — Arriving in ~7 min

Base fare            ৳40
Distance (4.8 km)    ৳120
Waiting (est.)       ৳12
Pickup fee           ৳18  ← firm, will not increase
─────────────────────────
Estimated total      ৳190

Pickup fee is final. It may decrease if you move closer to the driver.
```

The "will not increase" label is the rider's guarantee. It must appear every time.

### State 3: Post-Ride — The True-Up

After the ride completes, the system compares the firm quote distance to the actual pickup distance and adjusts the fee.

**What "actual pickup distance" means:** road-network distance from the driver's GPS at the moment of "rider picked up" confirmation to the pickup pin. This captures the actual shortest distance at ride start, regardless of the route the driver took.

**The ceiling rule: the firm quote is a hard maximum. The rider never pays more than the firm quote for the pickup fee.** The only scenario where the post-ride distance exceeds the firm quote is if the platform's measurement at acceptance was wrong — GPS inaccuracy or routing engine underestimation. That's a platform error. Charging the rider more because the platform measured wrong is indefensible. It creates disputes, erodes trust, and generates support tickets that cost more to handle than the revenue is worth.

The document's 1.25× upward true-up cap is a compromise that solves a problem that doesn't need to exist. Make the firm quote a hard ceiling. If the platform underestimated, the platform eats it. Clean, explainable, dispute-proof.

### The Cash Payment Problem

The true-up assumes the platform can adjust the rider's payment after the ride. This works for bKash and Nagad. But cash is the dominant payment method in Dhaka, and cash transactions are irreversible once completed.

**Different true-up rules by payment method:**

**bKash / Nagad:** Full three-state lifecycle applies. Downward true-up is an automatic refund to the rider's wallet within 24 hours. Upward true-up (if ever implemented) requires pre-authorization at ride request time.

**Cash:** The firm quote at acceptance is the **final** pickup fee. No post-ride true-up in either direction. The range at request stage still applies (rider sees ৳0–25), but once a driver accepts and the firm quote is locked, that's the number. No adjustment.

This sacrifices accuracy for simplicity. The firm quote is based on the 75th percentile driver distance — it's already a conservative estimate. In most cases, the cash rider slightly overpays (because the actual driver is often closer than the 75th percentile). This overpayment is small (a few taka) and is the cost of cash's irreversibility.

**For launch, prioritize the cash rider experience.** Most Dhaka ride-hailing riders pay cash. Make the cash flow simple and final. The digital true-up is a precision improvement for later, once the platform has established trust and digital payment adoption has grown.

---

## Dispatch Mechanics: Ranking Boost Decay and Interactions

The document describes a temporary ranking multiplier for drivers who just dropped in a cold zone, decaying over ~15 minutes. The implementation needs more precision.

### Decay Shape

**Recommendation: exponential decay with a half-life of 7 minutes.**

```
boost(t) = base_boost × 0.5^(t / 7)
```

After 7 minutes, the boost is half its initial value. After 14 minutes, it's a quarter. After 21 minutes, it's effectively gone. This matches the intuition that a driver in a cold zone gradually moves toward warmer areas, and their disadvantage fades proportionally.

Linear decay creates a cliff at minute 15 where priority suddenly drops to zero. A step function creates the same cliff at a fixed point. Exponential decay is smoother and more realistic.

### Stacking Rule

Only the most recent cold drop triggers a boost. Multiple cold drops do not stack multipliers. If a driver does three consecutive cold-zone rides, they don't get 1.5 × 1.5 × 1.5 = 3.375× boost. That would distort the dispatch system.

### Interaction with Acceptance Rate

The cold-drop boost should apply *after* the acceptance-rate filter. If a driver is below the 70% acceptance threshold, they get fewer priority leads regardless of their cold-drop status. The boost rewards drivers who play by the rules (accepting rides, including cold-zone ones). It should not rescue cherry-pickers.

---

## Heat Score: Blending Methodology

The document recommends blending a trailing baseline with a live EWMA of request density, weighted 40/60. This is the right approach, but the implementation needs precision.

### Why Pure Call-Density Fails

The airport example from the document: pure call-density scoring labels the airport as cold because requests per hour are low (flights arrive in bursts). But the airport is one of Dhaka's most valuable drop zones — high fares, managed queue, guaranteed eventual ride. A driver who drops at the airport isn't stuck; they're in a queue.

### The Blended Score

```
heat_score = (0.40 × trailing_score) + (0.60 × live_score)
```

**Trailing score:** For each zone, compute the median earnings of drivers in the 60 minutes following a drop-off in that zone, over the past 7 days. Percentile-rank across all zones. This captures "when drivers end up here, how much do they typically earn next?"

**Live score:** EWMA of request density in the zone over the past 15 minutes, normalized against the zone's historical average for that time-of-day and day-of-week. This captures "is this zone hot right now, relative to its normal pattern?"

**Why time-of-day normalization matters:** A zone with 5 requests/hour at 3 AM is hot (most zones have zero). The same zone with 5 requests/hour at 8 AM is cold (peak hour should have 20+). Raw density without time-of-day context misclassifies both.

```
live_normalized = current_ewma / avg_same_hour_same_day_past_4_weeks
```

A zone is "hot" when it's busier than it normally is at this time, regardless of absolute numbers.

**Cold-start behavior:** If there's insufficient live history (< 30 minutes of data), use the trailing score alone. This prevents a new zone from getting a misleading score based on a few data points.

---

## Gaming: Force-Ranked by Severity

The document lists five gaming categories. They are not equally dangerous.

### Priority 1: Off-Platform Completion (Existential Threat)

Driver accepts a lead, calls the rider, cancels on-platform, completes the ride off-app for the full fare. The driver keeps 100% of the fare AND avoids paying for the lead. The platform loses its only revenue line. Nobody complains. The ride shows as cancelled.

This is the only gaming vector that can kill the business. GLM was right to name it, and the document is right that it needs a named owner. But "trace-matching cancelled rides against GPS traces" is detection, not prevention. Prevention requires structural changes:

- **Cancellation friction.** After a driver cancels, impose a 5-minute cooldown before they can accept the next lead. Serial cancellation-and-reaccept becomes economically painful.
- **Rider feedback loop.** After a driver-initiated cancellation, send the rider a brief survey: "Did you still complete this trip?" If yes, flag for investigation.
- **Cancellation rate as package eligibility.** If a driver's cancellation rate exceeds 15%, they cannot purchase their next package until reviewed. Off-platform completion directly threatens the driver's ability to earn.
- **GPS trace matching** as the backstop detection layer, not the primary one.

### Priority 2: Pickup-Distance Manipulation

The framework's core defense — platform-computed road-network distance, snapshot at acceptance — is strong. But three sub-vectors need different treatments:

- **GPS spoof** is the highest-risk sub-vector. Cheap GPS spoofing apps are widely available on Android, which dominates Dhaka's phone market. Stage 2 should specify: does the platform use hardware-level GNSS only, or accept software-injected locations? This is an engineering decision with major gaming implications.
- **Drive-away-after-accept** is mitigated by the snapshot design, but Stage 2 should confirm: can a driver dispute the snapshot? Every dispute mechanism is a potential gaming vector.
- **Teleport jumps** are mostly a symptom of poor GPS hardware in low-end phones. The 500m jump threshold might be too aggressive for cheap phones in Dhaka's high-rise corridors. Stage 2 needs calibration against real device-quality data.

### Priority 3: Cherry-Picking / Decline Spam

The framework has good tools (cooloff, acceptance-rate tracking, deprioritization). The unresolved question is the interaction with Decision 2. If heat tags are shown before accept (my recommendation), cherry-picking becomes visible and measurable, making the existing tools effective. If heat tags are hidden, cherry-picking migrates to phone calls and becomes invisible, making the tools nearly useless.

### Priority 4: Heat-Score Manipulation

Fake rider requests to inflate a zone's demand score. Expensive to execute at scale — needs fake accounts with verified bKash/Nagad. The H3 hex granularity helps: you'd need to flood a specific hex. Mitigation is mostly about rider-account quality: verified phone numbers, payment method on file, request-rate limiting per account. The document doesn't discuss rider-side account quality at all — this is a gap.

### Priority 5: Rider-Side Pin Gaming

Moving the pin post-accept to inflate or deflate the pickup fee. The three-state lifecycle handles this structurally. The one sub-vector worth flagging: a rider moving the pin *closer* after accept to reduce the fee, then staying at the original location. The driver arrives at the pin, can't find the rider, gets directed to the real location. Stage 2 should specify: the true-up should use the actual rider-confirmed pickup location (driver marks "rider picked up" with a GPS stamp), not just the pin.

---

## Driver Economics: Does the Model Actually Work?

The document focuses on mechanism design but doesn't model what a driver's actual week looks like. The package renewal rate — the single most important metric — depends on whether drivers feel the economics work.

### Realistic Week for a Dhaka Sedan Driver

| Parameter | Value |
|---|---|
| Working hours/day | 10 |
| Working days/week | 6 |
| Fuel cost/km | ৳5.5 |
| Average ride distance | 5 km |
| Average pickup distance | 3.5 km |
| Average fare/ride | ৳165 |
| Average pickup surcharge | ৳22.5 |
| Rides/day | 8 |
| Package cost | ৳2,500/month (Standard 50-lead) |

```
Weekly gross revenue:    8 × 6 × (৳165 + ৳22.5)           = ৳9,000
Weekly fuel cost:        8 × 6 × 8.5 km × ৳5.5             = ৳2,244
Weekly package cost:     ৳2,500 / 4.33                       = ৳577
Weekly other costs:      maintenance, data, etc.             = ৳400
─────────────────────────────────────────────────────────────────────
Net weekly earnings:                                            ৳5,779
Net monthly earnings:   ৳5,779 × 4.33                        = ৳25,023
Effective hourly rate:  ৳5,779 / 60 hours                    = ৳96/hour
```

৳25,000/month net is competitive for a full-time Dhaka sedan driver (typical Uber/Pathao driver earns ৳20,000–30,000 gross before fuel). The key question is whether this holds under realistic conditions.

### Package ROI

```
Revenue from 50 leads:     50 × ৳187.50                     = ৳9,375
Fuel for 50 leads:         50 × 8.5 km × ৳5.5               = ৳2,337
Net from 50 leads:                                            ৳7,038
ROI:                        ৳7,038 / ৳2,500                  = 2.82×
```

At 80% acceptance (40 of 50 leads convert): ROI = 2.25×. Still strong. Below 70% acceptance: ROI = 1.97×. Below 2× ROI, drivers start questioning whether the package is worth it.

**Monitoring threshold:** if average ROI across all drivers drops below 2.0, something is structurally wrong — either the package is too expensive, the leads are too low-quality, or the pickup surcharge isn't compensating enough dead-mileage.

### The Lead Volume Gap

The model assumes 8 rides/day, but the Standard package provides 50 leads/month (~1.9/working day). At 8 rides/day × 26 working days = 208 rides/month. The package covers 50/208 = 24% of rides. The other 76% come from somewhere the document doesn't clarify.

**Critical Stage 2 question:** Is every ride a "lead" that deducts from the package, or are there also rides that don't deduct (e.g., rides requested in the driver's immediate vicinity, repeat riders, or overflow leads)? If every ride is a lead, the Standard package only supports ~2 rides/day, and drivers need the Unlimited tier or multiple packages. If there are also non-package rides, the economics change significantly. This must be specified.

---

## What the Document Misses Entirely

### 1. Rider Communication Strategy

The entire framework assumes riders understand and accept the pickup fee. But this is a new concept for Dhaka riders accustomed to a single fare with no line items. Stage 2 needs a rider communication strategy: in-app tooltips, first-ride walkthroughs, a FAQ section. "Why am I paying for the driver to come to me?" is a question every rider will ask on their first ride. The answer needs to be ready, consistent, and honest.

### 2. Driver Education on the Dispatch Layer

The dispatch levers (heat tags, ranking boost, pre-matching) only improve retention if drivers understand them. A driver who gets a ranking boost after a cold-zone drop but doesn't know why they're getting more leads experiences randomness, not benefit. Stage 2 should specify how these mechanics are communicated: in-app notifications ("You've been prioritized for your next lead because you completed a ride in a low-demand zone"), package purchase screens, driver onboarding materials.

### 3. Failure Mode Handling

The document doesn't discuss what happens when components fail. For a pricing system that charges real money, this is not optional.

**Routing API down:** Fall back to haversine distance with a 1.4× correction factor (Dhaka's road network is ~40% longer than straight-line). Show the rider: "Pickup fee is an estimate. Final amount confirmed after ride." Post-ride true-up corrects using actual road-network distance once the API recovers.

**Heat score data stale:** Each score carries a `last_updated_at` timestamp. If older than 10 minutes, dispatch engine falls back to trailing baseline only. Driver app shows "demand data updating" instead of a potentially stale heat tag.

**Driver GPS unavailable at acceptance:** Use the driver's last known high-confidence position (within 60 seconds, accuracy <50m). If none exists, quote from the 75th percentile of the nearby driver pool and lock it as the firm quote. True-up corrects post-ride.

### 4. The Airport and Other Special Zones

The airport is structurally unique: fixed pickup location, long queue times, high fares, ৳0 pickup fee (driver is already there). The dispatch system needs special handling — a driver who just dropped at the airport shouldn't get a "cold zone" ranking boost just because time-to-next-fare is long. The driver chose to queue. Stage 2 should define zone-class overrides where standard dispatch mechanics don't apply.

### 5. Off-Platform Completion Prevention Protocol

The document names this risk but only proposes detection (GPS trace matching). Stage 2 needs a full protocol: structural prevention (cancellation friction, cooldown, package eligibility), detection (trace matching, rider survey), and response (escalation tiers, account action matrix). This protects the only revenue line.

### 6. The No-Incentive Policy Boundary Document

A clear, explicit definition of what counts as an incentive and what doesn't, with examples drawn from the framework's own mechanisms. The document notes that "discounting what a driver pays for a lead is mathematically an incentive" but doesn't produce the formal boundary. As the platform scales and new team members join, this boundary document prevents scope creep and internal disagreement.

---

## What I'd Add to the Stage 2 Brief

The five questions from Section 9 are necessary but not sufficient. I'd add:

**6. Off-platform completion prevention protocol.** Not just detection — prevention. What structural mechanisms make this attack uneconomical?

**7. Rider communication strategy.** How is the pickup fee explained, in what words, at what point in the UX flow, for first-time vs. returning riders?

**8. Cash vs. digital true-up rules.** The three-state lifecycle cannot work identically for both payment methods. Specify the divergence.

**9. Lead volume model.** How many rides per month does a driver actually get? Are all rides leads? What's the relationship between package size and daily ride volume?

**10. Zone-class override list.** Which zones (airport, university campuses, industrial areas) need custom dispatch rules that override standard heat-score and ranking-boost mechanics?

**11. Failure mode specifications.** What happens when the routing API is down, heat score data is stale, or driver GPS is unavailable? Each needs a concrete fallback with config fields.

**12. Rider-demand elasticity estimation.** What's the expected impact of the pickup fee on ride request volume in a market with cheap substitutes (rickshaws, off-app CNGs)?

---

## Summary of All Positions

| Decision | Position | Confidence |
|---|---|---|
| Pickup rate | Start at 60%, schedule 90-day review, let data decide | High |
| Destination reveal | Show heat tag before accept (coarse: hot/neutral/cold) | High |
| Free radius / cap defaults | Single conservative default at launch, fork by vehicle after 60 days | High |
| Lead-debit multiplier | Don't build it. It's an incentive. Revisit in 6 months only if dispatch levers fail. | Very high |
| Staged rollout | Three stages with quantitative gates; shadow mode is non-negotiable | Very high |
| True-up for cash | Firm quote is final. No post-ride adjustment. | High |
| True-up ceiling | Firm quote is a hard maximum. No upward adjustment ever. | Very high |
| Ranking boost decay | Exponential, half-life 7 minutes, no stacking | High |
| Heat score blending | 40% trailing / 60% live, time-of-day normalized | High |
| Gaming priority | Off-platform completion is #1, not #4 | Very high |

The framework from the first round is architecturally sound. The second round needs to make it implementation-ready by resolving the ambiguities above, producing a specification that an engineering team can build without guessing.