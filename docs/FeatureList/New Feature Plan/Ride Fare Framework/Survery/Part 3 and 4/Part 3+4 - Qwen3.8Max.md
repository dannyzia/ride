# Hard second pass — verdict

The previous derivation is **arithmetically consistent but economically incomplete**. It follows the formula chain correctly, but it fails the most important test: **does the derived fare card let a driver hit the daily net earnings target after accounting for real Dhaka utilization?**

My hard-pass conclusion:

> **Do not lock the derived fare card yet.**  
> The biggest problem is not a single input. It is that `trip_per_km_rate = loaded_cost_per_km` treats loaded kilometres as if they pay for the whole driver day. In reality, drivers also drive empty, wait idle, handle offers, get rejected leads, and spend time on pickups inside the free radius. The previous model does not reconcile the fare components against a full daily driver P&L.

The architecture is still sound. The formula chain is still usable. But the numbers need to be re-derived through a **daily revenue-versus-cost model**, not just a per-km loaded-cost model.

---

# 1. Scorecard

| Component | Previous output | Hard-pass verdict |
|---|---|---|
| Formula chain | Clean | Structurally okay, but incomplete |
| Fuel inputs | Reasonable | Acceptable, but car efficiency needs field validation |
| Maintenance inputs | Reasonable | Joma maintenance split needs validation |
| Depreciation/Joma substitution | Conceptually correct | Joma rent is the highest-risk input |
| Fixed cost treatment | Correct after lead-package exclusion | Minor issue; fixed costs are small |
| Driver time model | Too simplistic | Fails to account for idle/empty/unpaid offer-handling time |
| Trip rate derivation | Too simplistic | Fails daily P&L sanity check |
| Multiplier validation | Misleading | Natural multiplier ≈ 0.96 is an artifact of the trip-rate definition |
| Conservative bias flag | Wrong direction | The model is more likely under-recovering, not over-recovering |
| Pickup caps | Too loose | 40% cap is too high for rider trust |
| Free radius | Too blunt | Needs zone-based calibration, not one value per category |
| Grouping recommendation | Premature | Do not merge Bike Economy/Standard before demand elasticity and corrected rates |
| Subscription affordability | Under-addressed | Pre-package target is not enough for renewal |

---

# 2. The core structural failure: no daily driver P&L reconciliation

The previous derivation used:

```text
loaded_cost_per_km = operating_cost_per_km + driver_time_cost_per_km_loaded
trip_per_km_rate = loaded_cost_per_km
```

That is only valid if:

1. almost all driver time is loaded time;
2. empty km are negligible;
3. idle waiting is negligible;
4. base fare, waiting revenue, and pickup fees are not needed to cover the missing time;
5. daily km is effectively loaded km.

But your own survey definition says:

```text
daily_km = loaded + empty combined
```

So the trip rate cannot simply be loaded cost per loaded km and also claim to cover the driver’s full daily target.

The correct daily constraint is:

```text
daily_gross_revenue
= trips × base_fare
+ loaded_km × trip_rate
+ chargeable_waiting_minutes × waiting_rate
+ pickup_fee_revenue

daily_operating_cost
= total_daily_km × operating_cost_per_km

driver_net_before_subscription
= daily_gross_revenue − daily_operating_cost
```

The fare system should satisfy:

```text
driver_net_before_subscription ≥ daily_net_target
```

The previous derivation never ran this test.

---

# 3. Illustrative daily P&L stress test

This is not a final recalibration. It is a sanity check using moderate, not pessimistic, assumptions.

Assumptions for the stress test:

| Variable | Bikes | CNG | Cars |
|---|---:|---:|---:|
| Loaded ratio | 70% | 65% | 70% |
| Average trip distance | 6 km | 5 km | 10 km |
| Chargeable waiting | 1 min/trip | 1 min/trip | 1 min/trip |
| Rides with pickup fee | 30% | 30% | 30% |
| Average chargeable pickup when triggered | 0.8 km | 0.8 km | 0.8 km |

Using the previously derived fare card:

| Sub-category | Est. gross/day | Est. operating cost/day | Net before package | Target | Gap |
|---|---:|---:|---:|---:|---:|
| Bike Economy | ~1,285 | ~857 | **~428** | 800 | **−372** |
| Bike Standard | ~1,565 | ~1,094 | **~472** | 900 | **−428** |
| Bike Premium | ~1,816 | ~1,331 | **~486** | 1,000 | **−514** |
| CNG Standard | ~1,501 | ~1,076 | **~425** | 900 | **−475** |
| Car Economy | ~3,341 | ~2,946 | **~395** | 1,300 | **−905** |
| Car Standard | ~5,090 | ~4,639 | **~451** | 1,800 | **−1,349** |
| Car Premium | ~6,327 | ~5,850 | **~477** | 2,200 | **−1,723** |

All amounts are BDT/day and rounded.

### Interpretation

Under moderate utilization, the previously derived rates do **not** hit the daily net earnings target. The shortfall is severe for cars because Joma rent and octane fuel dominate operating cost.

If actual utilization is much higher — for example, 85–90% loaded ratio — the gap shrinks. But planning around best-case utilization is dangerous. A retention-first platform should survive at p25 or p30 utilization, not only at peak density.

---

# 4. The previous “conservative bias” flag is likely wrong

The previous output said the trip rate was ~2–4% conservative because pickup-fee revenue was not credited.

That conclusion is too narrow.

The real issue is not whether pickup revenue offsets a small percentage of the trip rate. The issue is whether the whole fare package covers:

- empty driving cost;
- idle waiting;
- free-radius pickup cost;
- rejected-lead handling time;
- fixed daily costs;
- driver earnings target.

When tested as a daily P&L, the previous fare card is more likely **under-recovering**, not over-recovering.

The correct bias flag should be:

> The previous trip rates are likely too low to hit driver earnings targets under realistic Dhaka utilization, unless base fare, waiting revenue, pickup revenue, loaded ratio, or driver targets are materially different from the assumptions above.

---

# 5. Corrected derivation approach

The platform engine should not use:

```text
trip_rate = loaded_cost_per_km
```

as the final rule.

It should use a daily revenue constraint.

A practical corrected formula, ignoring caps for a moment, is:

```text
trip_rate =
(
  operating_cost_per_km × total_daily_km
  + daily_net_target
  − trips × base_fare
  − expected_waiting_revenue
)
÷
(
  loaded_km
  + trips × p_pickup_fee × avg_chargeable_pickup_km × locked_multiplier
)
```

The denominator includes pickup-fee revenue because pickup fee is itself a function of trip rate:

```text
pickup_rate = trip_rate × locked_multiplier
```

So pickup revenue partially reduces the required trip rate.

If the percent-of-fare cap frequently binds, the engine must use expected capped pickup revenue instead of the linear approximation.

---

# 6. Illustrative corrected trip rates

Using the same moderate utilization scenario, and crediting base, waiting, and uncapped pickup revenue, the trip rates would need to be roughly:

| Sub-category | Previous trip rate | Corrected rate needed | Increase |
|---|---:|---:|---:|
| Bike Economy | 10.57 | ~14.3 | +35% |
| Bike Standard | 12.29 | ~16.3 | +32% |
| Bike Premium | 14.42 | ~19.2 | +33% |
| CNG Standard | 14.97 | ~20.8 | +39% |
| Car Economy | 26.54 | ~34.5 | +30% |
| Car Standard | 38.54 | ~49.6 | +29% |
| Car Premium | 48.16 | ~62.3 | +29% |

These are **not recommended launch fares**. They are a warning.

They show that if the current cost assumptions and daily net targets are correct, the original fare card is materially too low.

If the market cannot bear those corrected rates, then one or more of the following must change:

1. lower daily net earnings targets;
2. higher utilization through dispatch density;
3. lower Joma rents;
4. lower vehicle operating costs;
5. higher base fare;
6. higher waiting revenue;
7. higher pickup revenue;
8. lower weekly subscription price;
9. different category positioning;
10. different product mix.

You cannot keep all assumptions fixed and assume the original fare card works.

---

# 7. The multiplier validation was misleading

The previous multiplier validation said:

```text
natural multiplier = empty_cost_per_km ÷ loaded_cost_per_km ≈ 0.96
```

That is mathematically true under the previous definition, but it is not the right validation.

The reason the natural multiplier is ~0.96 is that operating cost is identical for loaded and empty driving, and operating cost dominates the loaded cost. The only difference is the small speed differential between loaded and empty movement.

But if the trip rate is corrected to cover the full daily P&L, the natural multiplier changes.

Using the illustrative corrected rates above:

| Sub-category | Corrected trip rate | Empty cost/km | Effective natural multiplier | Locked multiplier |
|---|---:|---:|---:|---:|
| Bike Economy | ~14.3 | 10.12 | ~0.71 | 0.75 |
| Bike Standard | ~16.3 | 11.79 | ~0.72 | 0.75 |
| Bike Premium | ~19.2 | 13.87 | ~0.72 | 0.75 |
| CNG Standard | ~20.8 | 14.59 | ~0.70 | 0.80 |
| Car Economy | ~34.5 | 25.63 | ~0.74 | 0.90 |
| Car Standard | ~49.6 | 37.29 | ~0.75 | 0.90 |
| Car Premium | ~62.3 | 46.64 | ~0.75 | 0.90 |

This changes the interpretation.

If trip rates are raised to cover daily economics, the locked multipliers may actually be **above** the marginal deadhead-cost ratio, especially for CNG and cars.

That does not automatically mean the locked multipliers are wrong. It means the pickup fee has to be defined as a policy choice:

- Is it strict deadhead cost recovery?
- Is it a driver-retention subsidy for visible approach distance?
- Is it a rider-visible fairness charge capped tightly?
- Is it a mix of all three?

The previous output treated the multiplier as a cost-validation issue. It is actually a **distributional policy lever**.

### Hard-pass recommendation on multipliers

Do not validate the locked multipliers against the simplistic `empty_cost ÷ loaded_cost` ratio.

Instead, validate them inside the daily P&L model:

```text
Given base fare, waiting rate, free radius, caps, dispatch distances, and expected utilization,
does the locked multiplier produce:
  1. enough driver net before subscription?
  2. acceptable rider pickup-fee exposure?
  3. acceptable short-trip fare distortion?
```

Until that test is run, the locked multipliers should remain **provisional**, not validated.

---

# 8. The 40% pickup cap is too loose

The previous output kept:

```text
cap_pct_of_trip_fare = 40%
```

The stress test showed a Car Standard example:

```text
3 km trip
3.5 km pickup
fare before pickup ≈ BDT 146.61
pickup fee capped at 40% ≈ BDT 58.65
final fare ≈ BDT 205.26
```

The pickup fee is then about:

```text
58.65 ÷ 205.26 ≈ 29% of final fare
```

That may be mathematically bounded, but it fails the rider-trust test.

The honest sentence:

> “You pay for the extra distance the driver had to come to you, capped at a fair share of the fare.”

still sounds weak if the “fair share” is 40% of the pre-pickup fare and nearly one-third of the final fare.

### Hard-pass recommendation

Use a much tighter cap for launch:

```text
cap_pct_of_trip_fare = 15%
```

or, if you want to be more rider-protective:

```text
cap_pct_of_trip_fare = 12%
```

If driver compensation is still needed for far pickups, solve it through dispatch suppression, not by letting the rider see a huge pickup fee.

A far pickup on a short trip should usually be a dispatch failure, not a fare outcome.

---

# 9. Free radius is too blunt in the previous model

The previous output used:

| Category | Free radius |
|---|---:|
| Bikes | 1.2 km |
| CNG | 1.5 km |
| Cars | 1.5 km |

That is too coarse.

Dhaka pickup distances vary dramatically by zone:

- Gulshan/Banani/Motijheel/Dhanmondi core: short distances but one-way/road-network complications.
- Mirpur/Uttara/Mohammadpur: moderate distances.
- Savar/Tongi/Keraniganj/periphery: longer distances and thinner supply.

A single category-level free radius will either:

- overcharge riders in dense areas; or
- undercompensate drivers in peripheral areas; or
- both.

### Hard-pass recommendation

Use zone-based free radius at launch:

| Zone type | Free radius starting point |
|---|---:|
| Dense core | 1.0 km |
| Standard urban | 1.4–1.5 km |
| Suburban/peripheral | 1.8–2.0 km |

Then calibrate using Stage 0 dispatch telemetry.

Also consider zone-specific billable caps:

| Zone type | cap_billable_km starting point |
|---|---:|
| Dense core | 1.0 km |
| Standard urban | 1.5 km |
| Suburban/peripheral | 2.0 km |

If the system cannot support zone-based parameters, use:

```text
free_radius_km = 1.25
cap_billable_km = 1.5
cap_pct_of_trip_fare = 0.15
```

But that is a weak compromise.

---

# 10. Joma rent is the most dangerous input

The previous model substituted Joma rent for depreciation in CNG, Car Standard, and Car Premium.

That concept is correct, but the rent values are critical.

Previous assumptions:

| Category | Joma rent/day |
|---|---:|
| CNG Standard | BDT 650 |
| Car Standard | BDT 1,800 |
| Car Premium | BDT 2,500 |

These numbers dominate the cost structure.

For CNG Standard, Joma rent was ~36% of loaded cost.

For Car Standard, Joma rent was ~27% of loaded cost.

For Car Premium, Joma rent was ~31% of loaded cost.

If actual rents are even BDT 150–300/day different, the fare card changes materially.

### Hard-pass recommendation

Before launch, interview at least:

- 20 CNG drivers;
- 20 Car Standard drivers;
- 15 Car Premium drivers.

Ask:

```text
What is the actual daily Joma rent?
Does the rent include insurance, BRTA, major repairs, tyres?
Who pays for tyres?
Who pays for engine overhaul?
Is there a weekly/monthly deposit?
Are there off-day rent rules?
```

Do not lock car or CNG fares before this is done.

---

# 11. Ownership assumptions need explicit sensitivity

The previous model assumed:

| Category | Ownership model |
|---|---|
| Bike Economy | Owner |
| Bike Standard | Owner |
| Bike Premium | Owner |
| CNG Standard | Joma |
| Car Economy | Owner |
| Car Standard | Joma |
| Car Premium | Joma |

This may be directionally right, but it is not safe to lock without validation.

If Car Economy is actually often Joma-operated, its trip rate rises significantly.

If Car Standard has a meaningful owner-driver segment, its trip rate may fall significantly.

### Hard-pass recommendation

Run the fare engine in two modes per category:

```text
Mode A: owner-operated
Mode B: Joma-operated
```

Then decide whether the retail fare tier should be:

1. priced to owner-driver economics;
2. priced to Joma-driver economics;
3. priced to a weighted blend;
4. split into separate sub-tiers if the gap is too large.

For retention, pricing to the higher-cost segment is safer if that segment is supply-critical.

---

# 12. Depreciation versus cash cost needs separation

For owner-operated vehicles, depreciation is a long-term reserve, not a daily cash payment.

For retention, drivers often feel cash economics first:

```text
cash_cost_per_km = fuel + maintenance + fixed cash costs
```

For Joma drivers, Joma rent is cash.

The previous model mixed full economic cost and cash cost without separating them.

### Hard-pass recommendation

Produce two fare floors:

| Floor | Definition | Use |
|---|---|---|
| Cash break-even floor | Fuel + maintenance + fixed cash costs + Joma rent if applicable | Minimum fare needed for driver to feel the day is worthwhile |
| Full economic floor | Cash floor + depreciation/reserve + target earnings | Fare needed for long-term sustainability |

If market fares cannot reach the full economic floor, launch may still be viable short-term, but vehicle replacement and churn risk must be monitored.

---

# 13. Base fare derivation needs refinement

Previous base fare formula:

```text
base_fare =
(driver_time_cost_per_hour × avg_accept_to_pickup_minutes ÷ 60)
+ fixed_per_trip_overhead
```

This is not wrong, but it can overlap with pickup-fee economics.

The base fare should primarily cover:

1. trip acceptance overhead;
2. app/communication overhead;
3. the unpaid portion of driver approach inside the free radius;
4. short-trip initiation cost.

It should not accidentally double-pay for far pickups that are already compensated by the pickup fee.

A cleaner formulation is:

```text
base_time_component =
(free_radius_km ÷ empty_speed_km_h × 60)
+ app_overhead_minutes
```

Then:

```text
base_fare =
(driver_time_cost_per_hour × base_time_component ÷ 60)
+ fixed_per_trip_overhead
```

This ties base fare to the free-radius promise rather than to an average accept-to-pickup time that may include chargeable distance.

---

# 14. Waiting rate needs a precise definition

The previous output did not fully define what counts as chargeable waiting.

This matters.

There are three possible meanings:

### Option A: Rider-caused pickup waiting only

Waiting starts after driver arrives and rider is late.

Pros:

- easy to explain;
- rider-caused;
- low complaint risk.

Cons:

- does not compensate traffic delay;
- driver bears congestion risk.

### Option B: All stopped time during trip

Waiting includes traffic stops, signals, congestion.

Pros:

- better driver compensation;
- economically rational in Dhaka.

Cons:

- rider may feel charged for traffic;
- requires clear disclosure and trust.

### Option C: Hybrid

Charge waiting only for:

- rider-caused delay after free waiting period;
- extended stopped time at rider request;
- waiting during trip only after a threshold, e.g., speed below 5 km/h for more than X minutes.

### Hard-pass recommendation

For launch, use **Option A** for simplicity and rider trust:

```text
Waiting charge applies only after driver arrives and rider is late,
after the free waiting grace period.
```

But if you use Option A, then the per-km rate must include a congestion buffer because drivers are not compensated for traffic time.

If you do not add that buffer, driver retention will suffer during peak congestion.

---

# 15. Free waiting time is probably okay, but should be tested

Previous recommendation:

| Category | Free wait |
|---|---:|
| Bikes | 3 min |
| CNG | 3 min |
| Cars | 4 min |

This is reasonable.

But Dhaka pickup friction can be high:

- gated buildings;
- narrow lanes;
- wrong side of road;
- rider inside campus;
- rider calling from a different location;
- security checks at offices.

### Hard-pass recommendation

Launch with:

```text
Bike: 3 min
CNG: 3 min
Car: 4 min
```

But monitor:

```text
waiting_fee_complaint_rate
driver_wait_time_distribution
rider_cancel_after_wait_fee_display
```

If complaints concentrate in specific geographies or building types, consider geofence-specific free waiting, e.g., malls, hospitals, campuses, airports.

---

# 16. Grouping recommendation was premature

The previous output recommended merging Bike Economy and Bike Standard into one “Bike” tier.

I would slow down on that.

The original gap was:

```text
Bike Economy: 10.57
Bike Standard: 12.29
Gap: ~16%
```

After correcting for daily P&L under the illustrative scenario:

```text
Bike Economy: ~14.3
Bike Standard: ~16.3
Gap: ~14%
```

That is still meaningful.

For price-sensitive Dhaka riders, a 14–16% difference in the cheapest motorized tier can affect conversion.

For drivers, merging at the Standard rate may benefit Economy drivers, but it may also:

- raise the entry price for the most price-sensitive riders;
- reduce demand;
- reduce lead volume;
- hurt renewal if drivers see fewer offers.

### Hard-pass recommendation

Do not merge Bike Economy and Bike Standard purely for simplicity.

Use this rule:

| Condition | Recommendation |
|---|---|
| Economy supply is small and operationally indistinguishable from Standard | Merge |
| Economy supply is large and rider price sensitivity is high | Keep separate |
| Corrected rate gap <10% | Merge candidate |
| Corrected rate gap >15% | Keep separate unless UX research says riders do not care |

At launch, I would keep all sub-categories in the pricing engine, but the rider-facing tier structure can be simplified only after Stage 0 demand testing.

---

# 17. Subscription affordability is still not fully solved

The locked correction says:

> Driver daily net earnings target is before subscription deduction. The platform does not guarantee target net of subscription.

That is a valid business rule, but it creates a retention risk.

If the fare system only gets the driver to the pre-package target, then the subscription pushes the driver below the target.

Example:

```text
Driver target before package: BDT 900/day
Weekly package: BDT 450/week = BDT 64/day
Driver after package: BDT 836/day
```

If BDT 900 was the true minimum acceptable take-home, then the package makes the job unacceptable.

### Hard-pass recommendation

Define two thresholds:

```text
minimum_acceptable_income_before_package
= household/occupational minimum
+ daily package cost
+ buffer
```

Or define:

```text
daily_target_before_package
= driver_required_after_package_income
+ expected_daily_package_cost
```

Otherwise, the fare model may appear to hit the target while drivers still churn.

Since your north-star is weekly package renewal, post-package economics matter even if the fare formula itself excludes the package.

---

# 18. Lead consumption at dispatch needs an economic cost

You stated:

> A lead is consumed at dispatch, not at ride completion.

The fare derivation ignores the cost of bad leads.

Bad leads include:

- far pickup;
- low fare;
- rider likely to cancel;
- destination the driver dislikes;
- pickup in congested area;
- offer made after the driver has already committed elsewhere;
- repeated sequential offers that the driver must review and reject.

Even if a lead is “free” to the rider, it costs driver attention and time.

### Hard-pass recommendation

Add a dispatch-quality metric:

```text
driver_offer_cost_per_day =
time_spent_reviewing_offers × driver_time_cost_per_hour
```

And monitor:

```text
accepted_leads ÷ offered_leads
rejected_far_pickup_leads
rejected_short_fare_leads
time_to_accept
weekly_renewal_by_acceptance_rate
```

If dispatch consumes many leads without producing good matches, the subscription will feel like a tax, not a service.

---

# 19. No surge means peak congestion must be handled elsewhere

The locked model bans surge pricing.

That is fine, but Dhaka peak-hour economics still need to work.

If per-km rates are based on blended average speed, but peak-hour speed is much lower, drivers may lose money during the most demanding periods.

You have only a few non-surge levers:

1. higher base fare;
2. waiting charge, if defined to include congestion;
3. dispatch restrictions during low-speed periods;
4. pickup-distance control;
5. lead-quality prioritization;
6. weekly package value, not fare surge.

### Hard-pass recommendation

If waiting is rider-caused only, then add a peak-congestion buffer to trip rates.

Alternatively, define waiting to include slow-moving/stopped trip time above a threshold, but disclose it clearly:

> “When the vehicle is stopped or moving very slowly, a time charge applies so the driver is paid for the time spent in traffic.”

If riders reject that, then trip rates must be higher to compensate.

---

# 20. What survives the hard pass

Not everything is broken. The following remain valid:

1. **The overall fare formula is sound.**

   ```text
   final_fare = base_fare + per_km_rate × trip_distance_km
              + waiting_rate × chargeable_waiting_minutes
              + pickup_fee
   ```

2. **The pickup-fee structure is sound.**

   Free radius → chargeable km → per-km rate → double cap is a good explainable architecture.

3. **Excluding the lead package from fare derivation is correct.**

   The platform subscription should not be baked into the fare formula as an operating cost.

4. **Using road-network km is correct.**

   Straight-line distance would be unfair in Dhaka.

5. **Using category multipliers is directionally correct.**

   A car driver’s deadhead time should not be priced like a bike driver’s deadhead time.

6. **The double cap is necessary.**

   Without the percent backstop, short trips with far pickups become rider-hostile.

---

# 21. Recommended changes before locking

## Must-do before locking fares

1. **Build a daily P&L simulator.**

   Inputs:

   ```text
   total_daily_km
   loaded_km
   empty_km
   trips_per_day
   avg_trip_distance
   idle_wait_minutes
   rider_caused_wait_minutes
   pickup_distance_distribution
   acceptance_rate
   base_fare
   trip_rate
   waiting_rate
   free_radius
   cap_billable_km
   cap_pct_of_trip_fare
   locked_multiplier
   operating_cost_per_km
   daily_net_target
   ```

   Output:

   ```text
   driver_net_before_subscription
   driver_net_after_subscription
   pickup_fee_as_pct_of_final_fare
   short_trip_fare_distortion
   category-level renewal risk
   ```

2. **Validate Joma rents.**

   Highest priority field validation.

3. **Validate loaded ratio and trips/day.**

   The fare card is extremely sensitive to utilization.

4. **Validate daily net earnings targets.**

   If targets are too high, fares must rise or churn will rise.

5. **Reduce the percent cap.**

   Use 12–15%, not 40%.

6. **Make free radius zone-based.**

   Do not use one category-level value for all Dhaka.

7. **Re-run multiplier validation after correcting trip rates.**

   Do not treat the original 0.96 natural multiplier as validation.

8. **Separate cash break-even from full economic cost.**

   Drivers renew based on cash first, long-term cost second.

---

# 22. Hard-pass launch posture

If I had to make a launch recommendation right now, it would be:

```text
Do not lock the previous fare card.

Use it only as a lower-bound cost reference.

Re-solve fares using a daily P&L constraint.

Use tighter pickup caps.

Use zone-based free radius.

Keep multipliers provisional until Stage 0 dispatch data validates them.
```

The architecture is strong. The derivation needs one major upgrade:

> Move from “per-km loaded cost pricing” to “daily driver economics pricing.”