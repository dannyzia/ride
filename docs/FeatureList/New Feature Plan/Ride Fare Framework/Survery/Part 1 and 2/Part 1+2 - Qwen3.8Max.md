Here is the hard second pass.

My blunt verdict: the first pass is a useful **prior**, but it is too clean, too precise, and too optimistic in several places—especially around car economics, driver time, utilization, and pickup-distance assumptions. I would **not** lock those exact numbers into production without telemetry and driver interviews. The locked fare architecture survives; many of the numbers should be treated as hypotheses, not facts.

---

# 1. Executive scorecard

| Area | First-pass quality | Hard second-pass verdict |
|---|---|---|
| Vehicle taxonomy | Good | Mostly correct, but boundaries need correction. Car Premium anchor needs clearer treatment. |
| Fuel price | Good | Fuel price assumptions are fine; fuel efficiency assumptions are fragile. |
| Fuel efficiency | Too precise | Car/CNG efficiencies are plausible but likely optimistic in peak Dhaka gridlock. |
| Maintenance | Too optimistic | CNG and car maintenance are probably understated for Dhaka road conditions and monsoon wear. |
| Depreciation | Plausible | Needs live used-vehicle listing data. Dhaka used-car prices can be distorted by import/tax regimes. |
| Fixed costs | Weak | Annual km/utilization and weekly package assumptions are too arbitrary. |
| Driver time cost | Methodologically weak | Dividing by moving speed understates time cost because it ignores unpaid waiting/idling. |
| Pickup distance distribution | Not real data | The p25/p50/p75/p90 values are assumptions, not survey data. Do not lock free radius from them. |
| Free radius / caps | Too generous | First-pass free radius and suburban cap are too generous before data. Start tighter. |
| Multipliers | Directionally okay | Bike/CNG/Car multipliers survive, but only if tested against actual per-km rates and dispatch outcomes. |

---

# 2. Biggest problems with the first pass

## Problem 1: The first pass treats assumed pickup distributions like real data

The pickup-distance table was presented as:

| Zone | p25 | p50 | p75 | p90 |
|---|---:|---:|---:|---:|
| Dense core | 0.4 | 0.8 | 1.3 | 2.0 |
| Standard urban | 0.6 | 1.1 | 1.8 | 2.8 |
| Suburban | 0.9 | 1.6 | 2.6 | 4.2 |

That is a reasonable prior, but it is not a survey. In Dhaka, actual pickup distance can vary wildly by:

- time of day,
- driver density,
- app dispatch logic,
- one-way restrictions,
- road barriers,
- whether the driver is parked or moving,
- whether the rider is inside a campus/building,
- whether the driver is on the correct side of a divided road.

**Hard-pass correction:**  
Do not set free radius or cap from those assumed percentiles. Use them only as priors. Calibrate from real dispatch telemetry.

---

## Problem 2: The first-pass free radius is probably too generous

The first pass recommended:

| Zone | First-pass free radius |
|---|---:|
| Dense core | 1.2 km |
| Standard urban | 1.6 km |
| Suburban | 2.2 km |

That targets p70–p75 based on assumed data. But if the assumed distribution is wrong, you may force drivers to absorb too much deadhead.

Driver retention is sensitive to unpaid approach distance. A driver who repeatedly gets 1.5–2.5 km unpaid pickups will feel the platform is unfair, even if the rider experience is clean.

**Hard-pass correction:**  
Start more conservatively:

| Zone | Hard-pass free radius |
|---|---:|
| Dense core | **1.0 km** |
| Standard urban | **1.5 km** |
| Suburban / peripheral | **2.0 km** |

Then increase free radius only if:

- rider cancellation due pickup fee is high,
- rider conversion drops,
- driver acceptance remains strong,
- renewal remains strong.

Do not blindly move to p70–p75 before observing driver behavior.

---

## Problem 3: The suburban billable cap was too loose

First pass:

| Zone | First-pass cap_billable_km |
|---|---:|
| Dense core | 1.0 km |
| Standard urban | 1.5 km |
| Suburban | 2.5 km |

A 2.5 km billable cap after a 2.0–2.2 km free radius means a rider could be charged for a total pickup approach of 4.5–4.7 km. That can create sticker shock, especially on short trips.

**Hard-pass correction:**

| Zone | Hard-pass cap_billable_km |
|---|---:|
| Dense core | **1.0 km** |
| Standard urban | **1.5 km** |
| Suburban / peripheral | **2.0 km** |

If you want one citywide cap:

```text
cap_billable_km = 1.5 km
```

or, if suburban supply is thin:

```text
cap_billable_km = 2.0 km
```

But I would not start with 2.5 km unless telemetry proves it is necessary and riders accept it.

---

## Problem 4: The percent backstop should be tighter for bikes

First pass recommended:

| Category | First-pass percent cap |
|---|---:|
| Bike | 12% |
| CNG | 13% |
| Car | 15% |

For bikes, 12% may still allow a pickup fee that feels too large relative to a short bike fare. Bike riders are highly price-sensitive. If a short bike trip has a BDT 70–90 fare before pickup, a 12% cap still allows BDT 8–11 pickup fee. That may be acceptable, but only if the rider clearly sees the driver distance.

**Hard-pass correction:**

| Category | Hard-pass percent cap |
|---|---:|
| Bike | **10%** |
| CNG | **12%** |
| Car | **15%** |

If you want a single simple cap:

```text
cap_pct_of_trip_fare = 12%
```

For car, keep 15% because car deadhead is expensive. For bike, protect rider conversion more aggressively.

---

## Problem 5: The time-cost model underestimates Dhaka waiting

The first pass used:

```text
driver_time_cost_per_km_loaded =
driver_time_cost_per_hour ÷ avg_loaded_speed
```

That is too clean. In Dhaka, drivers do not spend all online hours moving. They spend time:

- waiting for requests,
- idling in traffic,
- waiting at rider pickup points,
- waiting in congestion that may not be rider-caused,
- repositioning without a trip.

If you divide by loaded moving speed only, you understate the true economic cost of driver time.

### Better approach

Use one of these:

#### Option A: Online-hour allocation

```text
time_cost_per_online_km =
daily_net_target ÷ total_daily_online_km
```

Then allocate that cost across loaded km, empty km, and waiting km.

#### Option B: Moving-speed method plus unpaid waiting uplift

If you keep the moving-speed method, add an unpaid waiting uplift:

```text
adjusted_time_cost_per_km =
base_time_cost_per_km × (1 + unpaid_waiting_uplift)
```

For Dhaka, I would use an unpaid waiting uplift of:

| Category | Unpaid waiting uplift |
|---|---:|
| Bike | 20–30% |
| CNG | 20–35% |
| Car | 25–40% |

Cars are hit harder because car drivers have higher opportunity cost and more idle discomfort.

### Revised driver time cost ranges

The first-pass loaded time costs should be treated as lower bounds.

| Tier | First-pass loaded time cost | Hard-pass revised range |
|---|---:|---:|
| Bike Economy | 5.00 | **5.5–7.5** |
| Bike Standard | 5.56 | **6.0–8.5** |
| Bike Premium | 6.11 | **6.5–9.5** |
| CNG Standard | 6.67 | **7.0–10.0** |
| Car Economy | 9.38 | **11.0–16.0** |
| Car Standard | 12.50 | **15.0–22.0** |
| Car Premium | 15.63 | **19.0–28.0** |

This materially worsens car economics.

---

## Problem 6: Annual km and utilization assumptions are too optimistic

The first pass assumed:

| Tier | Annual km |
|---|---:|
| Bike Economy | 42,000 |
| Bike Standard | 45,000 |
| Bike Premium | 45,000 |
| CNG | 36,000 |
| Car Economy | 48,000 |
| Car Standard | 51,000 |
| Car Premium | 51,000 |

Those are possible for highly active drivers, but they are not safe planning averages. Many drivers will have lower utilization due to:

- part-time work,
- vehicle downtime,
- rain days,
- political/hartal-style disruptions,
- fuel shortages,
- maintenance,
- low lead volume,
- driver churn.

If annual km is lower, fixed cost per km rises.

### Hard-pass low-utilization scenario

| Tier | First-pass annual km | Hard-pass conservative annual km |
|---|---:|---:|
| Bike Economy | 42,000 | **30,000** |
| Bike Standard | 45,000 | **33,000** |
| Bike Premium | 45,000 | **33,000** |
| CNG | 36,000 | **27,000** |
| Car Economy | 48,000 | **36,000** |
| Car Standard | 51,000 | **39,000** |
| Car Premium | 51,000 | **39,000** |

This increases fixed cost per km significantly.

---

## Problem 7: Car economics are the biggest structural risk

The first-pass full economic loaded cost for cars was:

| Tier | First-pass full economic cost |
|---|---:|
| Car Economy | 28.56 |
| Car Standard | 36.40 |
| Car Premium | 44.01 |

After a hard pass, those should be treated as lower/mid-range, not conservative.

With worse utilization, waiting, maintenance, and depreciation uncertainty, car economics can deteriorate quickly.

### Hard-pass full economic loaded cost ranges

| Tier | Hard-pass full economic cost range |
|---|---:|
| Bike Economy | **BDT 11.5–16.0/km** |
| Bike Standard | **BDT 13.0–18.5/km** |
| Bike Premium | **BDT 15.0–21.5/km** |
| CNG Standard | **BDT 13.5–20.0/km** |
| Car Economy | **BDT 29–42/km** |
| Car Standard | **BDT 37–53/km** |
| Car Premium | **BDT 45–65/km** |

This does not mean fares must be this high. It means the cost floor is unforgiving. If your car per-km fare is much below the low-40s BDT/km, car retention will depend heavily on:

- high utilization,
- short pickup distances,
- low empty km,
- CNG/hybrid fuel economics,
- driver ownership,
- weekly package value perception.

If your car category is priced like a mass-market commodity, car drivers may churn.

---

## Problem 8: CNG maintenance was probably understated

First-pass CNG maintenance:

```text
CNG total maintenance = BDT 1.80/km
```

That is plausible, but possibly low for Dhaka because CNG autos face:

- rough roads,
- waterlogging,
- frequent stop-and-go,
- heavy passenger loads,
- CNG system maintenance,
- three tyres,
- frequent suspension/steering wear,
- lower-quality parts in some repair markets.

### Hard-pass CNG maintenance range

```text
CNG maintenance = BDT 1.8–2.8/km
```

If CNG autos are driven aggressively or in poor road conditions, it can go higher.

---

## Problem 9: The first-pass multipliers were validated too loosely

The first pass validated multipliers by comparing empty variable cost to full loaded economic cost. That is directionally useful, but not sufficient.

The locked multiplier applies to the loaded trip per-km rate:

```text
pickup_per_km_rate = trip_per_km_rate × category_multiplier
```

Therefore, the real question is:

> Is the pickup rate high enough to cover the cost of the driver’s approach distance, given the actual trip per-km rate?

If the trip per-km rate is too low, even a 0.90 car multiplier will undercompensate car deadhead.

### Minimum per-km rate thresholds

Using the first-pass empty variable cost estimates:

| Tier | Empty variable cost/km | Multiplier | Minimum trip per-km rate for pickup fee to cover empty cost | With 20% safety buffer |
|---|---:|---:|---:|---:|
| Bike Economy | 9.54 | 0.75 | **12.7** | **15.2** |
| Bike Standard | 10.93 | 0.75 | **14.6** | **17.5** |
| Bike Premium | 12.53 | 0.75 | **16.7** | **20.0** |
| CNG Standard | 10.55 | 0.80 | **13.2** | **15.8** |
| Car Economy | 23.91 | 0.90 | **26.6** | **31.9** |
| Car Standard | 29.37 | 0.90 | **32.6** | **39.1** |
| Car Premium | 34.65 | 0.90 | **38.5** | **46.2** |

This is important.

If your car standard per-km rate is only BDT 20–25, then even with a 0.90 multiplier, the pickup fee is not covering car deadhead variable cost. That does not automatically make the model wrong, but it means:

- free radius must be tight,
- chargeable km must be capped,
- dispatch must avoid far car pickups,
- short trips with far drivers must be suppressed,
- drivers must still perceive overall weekly value from the subscription.

### Hard-pass multiplier verdict

Keep:

```text
Bike: 0.75
CNG: 0.80
Car: 0.90
```

But do not assume these magically compensate drivers. They only work if the underlying per-km rates are high enough and dispatch quality is strong.

---

## Problem 10: Vehicle taxonomy needs a few corrections

The first-pass taxonomy was mostly correct, but I would tighten it.

### Bike Economy

First pass said 80–100cc but listed Honda Livo and TVS Metro, which are often ~110cc.

**Corrected definition:**

```text
Bike Economy = 95–110cc commuter bikes
```

Anchor cost at **100cc**, but run an **110cc sensitivity** if Livo/Metro dominate.

### Bike Standard

Include 125–135cc.

**Corrected definition:**

```text
Bike Standard = 115–135cc
```

Anchor at **125cc**.

### Bike Premium

Include 150–165cc.

**Corrected definition:**

```text
Bike Premium = 140–165cc
```

Anchor at **150cc**.

### CNG

Keep one standard category.

```text
CNG Standard = 200cc-equivalent CNG 3-wheeler
```

Do not create CNG premium.

### Car Economy

Anchor at **1000cc**, not 800cc.

```text
Car Economy = 800–1200cc micro/mini hatch, anchor 1000cc
```

If you allow CNG-converted economy cars, model them separately. Do not blend petrol and CNG economics.

### Car Standard

Anchor at **1500cc**.

```text
Car Standard = 1200–1500cc hatchback/compact sedan, anchor 1500cc
```

### Car Premium

The first pass said 1500cc mode, which is true, but that blurs the line between Car Standard and Car Premium.

For pricing and cost modeling, Car Premium should be treated as:

```text
Car Premium = 1500–1800cc mid-size sedan
Cost anchor = 1600cc-equivalent, even if many vehicles are 1500cc
```

Why? Because premium cost is not only engine size. It includes:

- heavier body,
- higher depreciation,
- higher tyre/suspension cost,
- higher rider comfort expectation,
- higher opportunity cost of driver time.

---

# 3. Revised cost ranges I would use instead of point estimates

The first pass gave too many precise point estimates. For a hard second pass, I would use ranges.

## Revised fuel cost ranges

| Tier | First-pass fuel cost | Hard-pass range |
|---|---:|---:|
| Bike Economy | 4.14 | **3.7–4.8** |
| Bike Standard | 4.83 | **4.3–5.4** |
| Bike Premium | 5.58 | **5.0–6.6** |
| CNG Standard | 2.50 | **2.3–3.1** |
| Car Economy | 13.18 | **12.1–16.1** |
| Car Standard | 15.26 | **13.8–18.1** |
| Car Premium | 17.06 | **15.3–19.3** |

The upper ends matter if traffic is bad, AC load is high, or fuel price rises.

---

## Revised maintenance ranges

| Tier | First-pass maintenance | Hard-pass range |
|---|---:|---:|
| Bike Economy | 0.90 | **0.8–1.2** |
| Bike Standard | 1.10 | **1.0–1.5** |
| Bike Premium | 1.45 | **1.3–2.0** |
| CNG Standard | 1.80 | **1.8–2.8** |
| Car Economy | 2.40 | **2.2–3.5** |
| Car Standard | 3.00 | **2.8–4.5** |
| Car Premium | 3.70 | **3.5–5.5** |

---

## Revised depreciation ranges

| Tier | First-pass depreciation | Hard-pass range |
|---|---:|---:|
| Bike Economy | 0.86 | **0.8–1.2** |
| Bike Standard | 1.13 | **1.0–1.6** |
| Bike Premium | 1.56 | **1.4–2.2** |
| CNG Standard | 1.67 | **1.4–2.2** |
| Car Economy | 2.50 | **2.2–3.8** |
| Car Standard | 4.20 | **3.8–6.0** |
| Car Premium | 5.80 | **5.0–8.0** |

These should be validated against live used-vehicle listings in Dhaka. Do not trust spec-sheet or textbook depreciation.

---

## Revised fixed-cost ranges

Because utilization is uncertain, fixed cost per km should also be a range.

| Tier | First-pass fixed cost/km | Hard-pass range |
|---|---:|---:|
| Bike Economy | 0.54 | **0.6–1.0** |
| Bike Standard | 0.63 | **0.7–1.1** |
| Bike Premium | 0.76 | **0.8–1.2** |
| CNG Standard | 0.94 | **0.9–1.5** |
| Car Economy | 1.10 | **1.1–2.2** |
| Car Standard | 1.44 | **1.4–2.8** |
| Car Premium | 1.82 | **1.8–3.5** |

The high end appears when annual km is low or the weekly package is expensive relative to driver earnings.

---

## Revised full economic loaded-cost ranges

| Tier | First-pass full cost | Hard-pass range |
|---|---:|---:|
| Bike Economy | 11.44 | **11.5–16.0** |
| Bike Standard | 13.25 | **13.0–18.5** |
| Bike Premium | 15.46 | **15.0–21.5** |
| CNG Standard | 13.58 | **13.5–20.0** |
| Car Economy | 28.56 | **29–42** |
| Car Standard | 36.40 | **37–53** |
| Car Premium | 44.01 | **45–65** |

This is the more honest cost picture.

---

# 4. Revised pickup calibration

The first-pass pickup policy was rider-friendly. The hard pass makes it more balanced between rider conversion and driver retention.

## Hard-pass recommended free radius

| Zone | First-pass free radius | Hard-pass free radius |
|---|---:|---:|
| Dense urban core | 1.2 km | **1.0 km** |
| Standard urban | 1.6 km | **1.5 km** |
| Suburban / peripheral | 2.2 km | **2.0 km** |

## Hard-pass recommended billable km cap

| Zone | First-pass cap_billable_km | Hard-pass cap_billable_km |
|---|---:|---:|
| Dense urban core | 1.0 km | **1.0 km** |
| Standard urban | 1.5 km | **1.5 km** |
| Suburban / peripheral | 2.5 km | **2.0 km** |

## Hard-pass recommended percent backstop

| Category | First-pass cap_pct | Hard-pass cap_pct |
|---|---:|---:|
| Bike | 12% | **10%** |
| CNG | 13% | **12%** |
| Car | 15% | **15%** |

If you need one platform-wide value:

```text
cap_pct_of_trip_fare = 12%
```

But category-specific is better.

---

# 5. Hard-pass launch parameters

If I had to choose launch parameters today, I would use:

```text
free_radius_km:
  dense_core: 1.0
  standard_urban: 1.5
  suburban: 2.0

cap_billable_km:
  dense_core: 1.0
  standard_urban: 1.5
  suburban: 2.0

cap_pct_of_trip_fare:
  bike: 0.10
  cng: 0.12
  car: 0.15

category_multiplier:
  bike: 0.75
  cng: 0.80
  car: 0.90
```

If the system cannot support zone-based parameters, use:

```text
free_radius_km = 1.25
cap_billable_km = 1.5
cap_pct_of_trip_fare = 0.12
```

But a single citywide value is weak for Dhaka. Zone-based is strongly preferred.

---

# 6. Dispatch guardrails needed because of the subscription model

Because leads are consumed at dispatch and your north-star is weekly renewal, dispatch quality is not a secondary feature. It is the business model.

## Guardrail 1: Do not offer far drivers for short trips

A short trip with a long pickup is dangerous.

Example:

```text
Trip distance = 3 km
Fare before pickup = BDT 120
Pickup distance = 4 km
Free radius = 1.5 km
Billable km capped = 1.5 km
Car multiplier = 0.90
Car per-km rate = BDT 30
```

Pickup fee raw:

```text
1.5 × 30 × 0.90 = BDT 40.5
```

Percent cap:

```text
15% × 120 = BDT 18
```

Final pickup fee:

```text
BDT 18
```

Rider pays BDT 18, which is fair. But the driver’s actual deadhead cost may be much higher. The platform cannot claim the driver is fully compensated.

**Rule:**  
For short trips, suppress far drivers unless acceptance probability is very high.

---

## Guardrail 2: Do not let car chargeable pickup drift too high

Car deadhead is expensive. If car per-km rates are not high, keep car chargeable pickup tight.

Suggested initial car limits:

| Zone | Car chargeable km limit |
|---|---:|
| Dense core | 1.0 km |
| Standard urban | 1.5 km |
| Suburban | 2.0 km |

If car per-km rate is below BDT 30, I would be cautious offering car drivers with more than 1.5 km chargeable pickup.

---

## Guardrail 3: Track “unpaid pickup km” per driver per week

This is a critical retention metric.

Define:

```text
unpaid_pickup_km =
total pickup approach km offered to driver
− free radius allowance across offered leads
```

If a driver’s weekly unpaid pickup km is high, renewal risk increases.

Suggested metrics:

| Metric | Why it matters |
|---|---|
| Average chargeable pickup km per completed ride | Rider fairness |
| Average unpaid pickup km per completed ride | Driver fairness |
| Average unpaid pickup km per driver per week | Retention risk |
| Acceptance rate by chargeable pickup km | Driver sensitivity |
| Rider cancellation rate by pickup fee | Rider sensitivity |
| Weekly renewal by unpaid pickup km quartile | Direct retention signal |

---

## Guardrail 4: If leads are burned on rejected offers, be extremely careful

You stated:

> A lead is consumed at dispatch, not at ride completion.

If a driver rejects a far or bad lead and the lead is still consumed, drivers may feel cheated. That is a renewal risk.

You need one of these:

1. Only offer high-probability leads.
2. Credit/refund clearly bad leads.
3. Show driver expected net value before offer.
4. Limit the number of low-value leads per driver per day.
5. Make package pricing reflect expected accepted-lead value, not raw offered leads.

If you do none of these, churn risk rises.

---

# 7. What I would change in the first-pass cost survey

## Fuel

Keep fuel prices, but replace point efficiencies with ranges.

| Tier | First-pass efficiency | Hard-pass range |
|---|---:|---:|
| Bike Economy | 35 km/L | **30–45 km/L** |
| Bike Standard | 30 km/L | **27–38 km/L** |
| Bike Premium | 26 km/L | **22–32 km/L** |
| CNG | 18 km/m³ | **16–22 km/m³** |
| Car Economy | 11 km/L | **9–12 km/L** |
| Car Standard | 9.5 km/L | **8–10 km/L** |
| Car Premium | 8.5 km/L | **7.5–9.5 km/L** |

---

## Maintenance

Increase upper bounds for CNG and cars.

| Tier | First-pass total maintenance | Hard-pass range |
|---|---:|---:|
| Bike Economy | 0.90 | **0.8–1.2** |
| Bike Standard | 1.10 | **1.0–1.5** |
| Bike Premium | 1.45 | **1.3–2.0** |
| CNG Standard | 1.80 | **1.8–2.8** |
| Car Economy | 2.40 | **2.2–3.5** |
| Car Standard | 3.00 | **2.8–4.5** |
| Car Premium | 3.70 | **3.5–5.5** |

---

## Depreciation

Replace single values with ranges and validate with actual listings.

| Tier | First-pass depreciation | Hard-pass range |
|---|---:|---:|
| Bike Economy | 0.86 | **0.8–1.2** |
| Bike Standard | 1.13 | **1.0–1.6** |
| Bike Premium | 1.56 | **1.4–2.2** |
| CNG Standard | 1.67 | **1.4–2.2** |
| Car Economy | 2.50 | **2.2–3.8** |
| Car Standard | 4.20 | **3.8–6.0** |
| Car Premium | 5.80 | **5.0–8.0** |

---

## Driver time

Add unpaid waiting uplift.

| Tier | First-pass loaded time cost | Hard-pass range |
|---|---:|---:|
| Bike Economy | 5.00 | **5.5–7.5** |
| Bike Standard | 5.56 | **6.0–8.5** |
| Bike Premium | 6.11 | **6.5–9.5** |
| CNG Standard | 6.67 | **7.0–10.0** |
| Car Economy | 9.38 | **11.0–16.0** |
| Car Standard | 12.50 | **15.0–22.0** |
| Car Premium | 15.63 | **19.0–28.0** |

---

# 8. What still survives the hard pass

Despite the criticism, several parts of the original model are still sound.

## 1. The fare formula is still correct

```text
final_fare =
base_fare
+ per_km_rate × trip_distance_km
+ waiting_rate × chargeable_waiting_minutes
+ pickup_fee
```

This is clean and explainable.

---

## 2. The pickup formula is still correct

```text
chargeable_km =
min(
  max(0, reference_pickup_km - free_radius_km),
  cap_billable_km
)

pickup_fee_raw =
chargeable_km × pickup_per_km_rate

pickup_fee =
min(
  pickup_fee_raw,
  cap_pct_of_trip_fare × fare_before_pickup
)
```

This is a good rider-protection and driver-fairness structure.

---

## 3. The category multipliers are still directionally right

```text
Bike: 0.75
CNG: 0.80
Car: 0.90
```

The principle is correct: a car driver’s deadhead minute should not be priced against bike economics.

But the multipliers only work if:

- trip per-km rates are high enough,
- dispatch distances are controlled,
- free radius is not too generous,
- short trips with far drivers are suppressed,
- drivers see enough weekly value to renew.

---

## 4. Road-network km is still the correct distance basis

Do not use straight-line distance in Dhaka. Straight-line distance will feel unfair because actual road routes can be much longer.

---

## 5. No destination-based pricing is still correct

Keep destination lucrativeness in dispatch/information logic, not in the fare formula. This preserves fare explainability.

---

# 9. What I would lock now versus wait on

## Lock now

I would lock these principles:

```text
1. Fare formula structure.
2. Pickup formula structure.
3. Road-network distance.
4. Double cap: km cap + percent-of-fare backstop.
5. Category multipliers: Bike 0.75, CNG 0.80, Car 0.90.
6. No surge.
7. No destination-based fare pricing.
8. One-sentence explainability for every charge.
```

## Do not lock yet

I would not lock these without data:

```text
1. Exact free radius.
2. Exact billable km cap.
3. Exact percent backstop.
4. Exact fuel efficiency values.
5. Exact maintenance costs.
6. Exact depreciation values.
7. Exact driver time targets.
8. Exact weekly package price.
9. Exact pickup distance distribution.
10. Exact zone boundaries.
```

These should be experiment parameters.

---

# 10. Minimum telemetry required before final calibration

Before finalizing the pickup parameters, collect at least:

## Dispatch data

For every offered lead:

```text
driver_id
category
zone
timestamp
driver_lat_lng
pickup_pin_lat_lng
road_network_pickup_km
free_radius_km
chargeable_km
pickup_fee
fare_before_pickup
accepted / rejected / timeout
rider_cancelled_after_assignment
completed / not_completed
```

## Driver data

For each driver-week:

```text
total_offered_leads
total_accepted_leads
total_completed_rides
total_pickup_km_driven
total_unpaid_pickup_km
total_chargeable_pickup_km
total_pickup_fee_collected
weekly_package_price
renewed_next_week
```

## Rider data

For each rider request:

```text
requested_category
pickup_zone
trip_distance_km
fare_before_pickup
pickup_fee
rider_cancelled_pre_dispatch
rider_cancelled_post_dispatch
completed
repeat_rider_7d
```

## Key derived metrics

| Metric | Use |
|---|---|
| Pickup distance p50/p70/p75/p90 by zone | Free radius calibration |
| Acceptance rate by chargeable pickup km | Driver sensitivity |
| Rider cancellation by pickup fee | Rider sensitivity |
| Renewal by unpaid pickup km | Driver retention risk |
| Renewal by weekly package price | Package price elasticity |
| Completed rides per driver-hour | Utilization |
| Empty km per completed km | Dispatch efficiency |

---

# 11. Final hard-pass recommendation

If I were making the final call, I would approve the architecture but reject the first-pass numbers as too polished.

Use this instead:

```text
Vehicle anchors:
  Bike Economy: 100cc, with 110cc sensitivity
  Bike Standard: 125cc
  Bike Premium: 150cc
  CNG Standard: 200cc CNG equivalent
  Car Economy: 1000cc
  Car Standard: 1500cc
  Car Premium: 1600cc-equivalent

Pickup parameters:
  free_radius_km:
    dense_core: 1.0
    standard_urban: 1.5
    suburban: 2.0

  cap_billable_km:
    dense_core: 1.0
    standard_urban: 1.5
    suburban: 2.0

  cap_pct_of_trip_fare:
    bike: 0.10
    cng: 0.12
    car: 0.15

Multipliers:
  bike: 0.75
  cng: 0.80
  car: 0.90
```

Then run a 2–4 week telemetry test.

The first pass was a good draft.  
The hard pass says: **keep the structure, distrust the precision, tighten the pickup caps, and treat car economics as the biggest retention risk.**