## Block 1: Context (System Prompt)

Paste this once as the system prompt or context. It doesn't change between queries.

---

I am building a ride-hailing platform for Dhaka, Bangladesh. We have locked our top-level fare architecture. We are strictly optimizing for driver and rider retention via weekly subscription packages, not maximizing gross lead volume or taking a commission on fares.

**Locked Fare Formula:**
`final_fare = base_fare + (per_km_rate × trip_distance_km) + (waiting_rate × chargeable_waiting_minutes) + pickup_fee`

**Locked Pickup Fee Structure:**
Free radius → per-km rate → double cap (km cap + % of fare backstop, take the lower).
Distance is road-network km.
`chargeable_km = min(max(0, reference_pickup_km - free_radius_km), cap_billable_km)`
`pickup_fee_raw = chargeable_km × pickup_per_km_rate`
`pickup_fee = min(pickup_fee_raw, cap_pct_of_trip_fare × fare_before_pickup)`
Pickup rate = trip_per_km_rate × category_multiplier.

**Locked Multiplier Tiers (to be validated by this survey):**
Bike: 0.75, CNG: 0.80, Car: 0.90 — applied to the loaded trip per-km rate. These reflect category-specific opportunity cost and the principle that a car driver's deadhead minute is priced against car earnings, not bike earnings.

**Key Business Model Facts:**
- The platform earns revenue from weekly lead subscription packages purchased by drivers, not from fare commissions.
- A lead is consumed at dispatch (when a ride is offered to a driver), not at ride completion.
- Dispatch is sequential — one driver offered at a time.
- The north-star metric is weekly package renewal rate, driven by network growth and match quality.
- Neither rider nor driver should feel cheated — every charge must be explainable in one honest sentence tied to something the payer caused or can see.
- No surge pricing. No destination-based pricing in the fare. Destination lucrativeness is handled via dispatch/information layer only.

## Part 3: Derivation Formula

Using the survey data above, derive the fare components as follows. Show the formula chain so the platform engine can recompute fares whenever an input changes (e.g., fuel price goes up).

### Step 1: Total Operating Cost Per Km

```
operating_cost_per_km = fuel_cost_per_km
                      + maintenance_cost_per_km
                      + depreciation_per_km
                      + fixed_cost_per_km   # includes lead package amortization
```

### Step 2: Loaded Trip Cost Per Km

```
loaded_cost_per_km = operating_cost_per_km
                   + driver_time_cost_per_km_loaded
```

### Step 3: Empty (Deadhead) Cost Per Km

```
empty_cost_per_km = operating_cost_per_km
                  + driver_time_cost_per_km_empty
```

### Step 4: Trip Per-Km Rate

The platform uses a subscription model for leads and takes 0% commission from the fare. The fare must cover the driver's loaded cost, which already includes lead package amortization and the driver's target take-home pay (from Part 2E).

```
trip_per_km_rate = loaded_cost_per_km
```

*Note: The driver's total revenue per ride is `trip_fare + pickup_fee`. The pickup fee partially offsets the daily earnings target — it is not zero revenue. If this derivation sets the trip per-km rate to independently cover the full daily net earnings target, the resulting rate will be conservative (slightly high). This is a safe starting bias — it errs on the side of the driver earning enough. Flag it explicitly in your output so it can be refined once pickup-fee revenue data exists from Stage 0 (the dispatch-only baseline period).*

*If you believe a separate buffer is required beyond loaded cost for market competitiveness or demand elasticity reasons, add it here, but justify it explicitly and separately from the cost derivation.*

### Step 5: Pickup Rate (Derived, Then Compared to Locked Multiplier)

```
derived_pickup_rate = trip_per_km_rate × (empty_cost_per_km / loaded_cost_per_km)
locked_pickup_rate  = trip_per_km_rate × locked_category_multiplier
```

Compare the **derived natural multiplier** (`empty_cost_per_km / loaded_cost_per_km`) against the locked multiplier (0.75 / 0.80 / 0.90) for each sub-category. If they diverge significantly, flag it — this is the validation check.

### Step 6: Base Fare

The base fare should cover the fixed cost of trip initiation — the time and overhead of accepting, navigating to pickup, and starting the trip that isn't captured in per-km charges.

```
base_fare = (driver_time_cost_per_hour × avg_accept_to_pickup_minutes / 60)
          + fixed_per_trip_overhead
```

**Question 3:** What is a realistic average time from ride accept to trip start in Dhaka (including app interaction, finding the rider, etc.)?

### Step 7: Waiting Rate

```
waiting_rate_per_min = driver_time_cost_per_hour / 60
```

### Step 8: Free Waiting Time

**Question 4:** What is a reasonable grace period before waiting charges kick in, given Dhaka norms? Consider that riders in Dhaka may need time to reach the pickup point in dense traffic on foot.

### Step 9: Pickup Fee Parameters

```
free_radius_km = calibrated from pickup distance distribution (target p70–p75 per sub-category)
cap_billable_km = 2.0 km (baseline — validate against p90 of pickup distribution)
cap_pct_of_fare = 40% (baseline — validate against short-trip/long-pickup edge case frequency)
```

---

## Part 4: Output Required

1. **Completed data tables** for all sub-categories with Dhaka-specific values (estimated where survey data isn't available, clearly marked).

2. **Derived fare component table** — one row per sub-category:

| Sub-Category | OpCost/km | LoadedCost/km | EmptyCost/km | Natural Multiplier | Locked Multiplier | Trip Rate (BDT/km) | Pickup Rate (BDT/km) | Base Fare (BDT) | Wait Rate (BDT/min) | Free Wait (min) | Free Radius (km) | Cap (km) | Cap (%) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Bike Economy (100cc) | ? | ? | ? | ? | 0.75 | ? | ? | ? | ? | ? | ? | 2.0 | 40% |
| Bike Standard (125cc) | ? | ? | ? | ? | 0.75 | ? | ? | ? | ? | ? | ? | 2.0 | 40% |
| Bike Premium (150cc) | ? | ? | ? | ? | 0.75 | ? | ? | ? | ? | ? | ? | 2.0 | 40% |
| CNG Standard (200cc) | ? | ? | ? | ? | 0.80 | ? | ? | ? | ? | ? | ? | 2.0 | 40% |
| Car Economy (1000cc) | ? | ? | ? | ? | 0.90 | ? | ? | ? | ? | ? | ? | 2.0 | 40% |
| Car Standard (1300cc) | ? | ? | ? | ? | 0.90 | ? | ? | ? | ? | ? | ? | 2.0 | 40% |
| Car Premium (1500cc) | ? | ? | ? | ? | 0.90 | ? | ? | ? | ? | ? | ? | 2.0 | 40% |

3. **Multiplier validation report** — for each sub-category, compare the natural multiplier (derived from empty vs. loaded cost ratio) against the locked multiplier. Flag any sub-category where the gap exceeds ±0.05, with a recommendation on whether the locked tier needs a sub-category override or whether the gap is acceptable.

4. **Sensitivity table** — show how the trip per-km rate shifts if fuel price moves ±10 BDT/litre from current, so we understand fuel-price sensitivity per sub-category.

5. **Recommendation on grouping** — given the derived numbers, advise whether the platform should actually launch with 7 distinct sub-categories or whether some should be merged into a single pricing tier (e.g., if Bike Economy and Bike Standard produce nearly identical rates, merge them into one "Bike" tier for rider simplicity).

6. **Conservative bias flag** — for each sub-category, explicitly note whether the trip per-km rate is likely conservative (slightly high) because it covers the full daily earnings target without crediting pickup-fee revenue. Estimate the magnitude of this bias if possible (e.g., "trip rate is ~8–12% higher than it would be if pickup-fee revenue were credited").

---

**Constraints:**
- All values must be Dhaka-specific, not generic South Asian averages.
- Do not introduce dynamic surge variables or destination-based pricing.
- Show your work — every derived number must trace back to an input with a stated source or estimate.
- Where you are estimating rather than citing data, mark it clearly as `[EST]` with your reasoning.

---

LOCKED INPUTS (do not re-derive, use as given):
- Car Economy anchor: 1000cc (WagonR-class)
- Car Premium anchor: 1500cc (Bangladesh import-duty cliff — premium is age/trim/AC, not cc)
- CNG price: 40 BDT/m³ (state units explicitly; flag if your source differs)
- Weekly lead package: [INSERT YOUR ACTUAL NUMBER — do not estimate]
- Car fuel model: compute CNG-converted as PRIMARY case for Car Economy/Standard/Premium;
  show petrol-only as a labeled reference case, not the main output
- Explicit cross-check required: annual_km (Part D) MUST equal daily_km (Part E) × working_days_per_year,
  shown as the equation, not independently assumed
- State ownership assumption per category (owned vs. daily-rental/"Joma") and if rental,
  substitute rental fee for depreciation in that row 

CORRECTION TO LOCKED FRAMEWORK:
Fixed Cost/km (Part 2D, and Step 1's operating_cost_per_km) must NOT include the weekly
lead package price. The lead package is the platform's own revenue decision, set
independently of driver operating costs, and is deducted from the driver's net margin
AFTER the fare is paid — not baked into the fare formula.

Fixed Cost/km = (annual insurance + annual BRTA reg/fitness/tax) ÷ annual_km
[drop "Annual Lead Package Cost" as an input to any fare-derivation step]

Driver's daily net earnings target (Part 2E) is the take-home the driver needs from
DRIVING ONLY — before any subscription fee is deducted. It is not the platform's job to
guarantee this target net of platform fees; it's the fare's job to make the trip
economically worthwhile before the platform takes its own cut, whatever that cut is.

LOCKED: All car fuel cost is calculated on PETROL/OCTANE pricing, not CNG-converted.
Do not model or offer a CNG-converted alternative for Car Economy/Standard/Premium.
CNG — Standard (3-wheeler auto category) is unaffected — it remains CNG-fueled.

LOCKED FUEL PRICES:
- Petrol/Octane: 145 BDT/L (Car Standard, Car Premium, all Bike tiers)
- Petrol: 140 BDT/L (Car Economy)
- CNG: 43 BDT/m³ (CNG-Standard 3-wheeler auto only)
- All car tiers (Economy/Standard/Premium) use PETROL fuel cost — no CNG-converted alternative modeled.

LOCKED FUEL PRICES:
- Octane: 145 BDT/L — applies to ALL bike tiers and ALL car tiers, no exceptions.
- CNG: 43 BDT/m³ — CNG-Standard 3-wheeler auto only.
- All car tiers use PETROL/OCTANE fuel cost — no CNG-converted alternative modeled.

