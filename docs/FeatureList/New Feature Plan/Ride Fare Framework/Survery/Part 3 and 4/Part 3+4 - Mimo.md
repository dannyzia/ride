# Parts 3 & 4: Fare Derivation, Output, and Validation

---

## 0. Locked Input Acknowledgements

The following inputs changed from v2 and are applied throughout:

| Input | v2 Value | Locked Value | Impact |
|---|---|---|---|
| Car Economy anchor | 800cc (Alto) | **1000cc (WagonR)** | Higher fuel cost, higher purchase price, higher maintenance |
| Car Standard anchor | 1500cc (Axio) | **1300cc (Honda City/Swift)** | Lower fuel cost, lower depreciation than Axio |
| Car Premium anchor | 1800cc (Allion) | **1500cc (Allion 1.5L)** | Same engine as Axio; premium = age/trim/AC, not cc |
| Car fuel model | CNG-converted primary | **Petrol/octane only** | Massive cost increase for all car tiers |
| Octane price | 145 BDT/L (bikes), varied for cars | **145 BDT/L for ALL bikes and ALL cars** | Uniform |
| CNG price | 42 BDT/m³ | **43 BDT/m³** (CNG-Standard only) | Minor |
| Fixed cost definition | Included lead package | **Excludes lead package** | Lower fixed cost/km; lead package is platform revenue, not driver operating cost |
| Earnings target timing | Ambiguous | **Before subscription deduction** | Fare must cover costs before platform takes its cut |

---

## 1. CRITICAL STRUCTURAL FINDING: The User's Trip-Rate Formula Is Insufficient

Before presenting derived numbers, I must flag a structural error in the Step 4 formula as written. This is not a rounding issue — it produces rates that are **1.7x to 2.2x too low** across every sub-category.

### The Problem

The provided formula:

```
trip_per_km_rate = loaded_cost_per_km
                 = operating_cost_per_km + driver_time_cost_per_km_loaded
```

Where `driver_time_cost_per_km_loaded = time_cost_per_hour / loaded_speed`.

This computes the **marginal cost per km of loaded driving** — the cost the driver incurs during the specific moment the vehicle has a passenger. It does **not** amortize the driver's full daily costs over loaded km.

The driver incurs costs during three types of time:
1. **Loaded driving** — operating cost + time cost (captured by the formula)
2. **Empty driving (deadhead)** — operating cost + time cost (**not captured**)
3. **Idle waiting** — time cost only (**not captured**)

And the driver only earns trip revenue during loaded km. So the trip rate must be high enough that revenue from loaded km covers **all** daily costs (loaded, empty, and idle), minus whatever the pickup fee contributes.

### Proof by Example — Bike Economy

Using the user's formula:

```
operating_cost_per_km = 4.83
driver_time_cost_per_km_loaded = 50.00 / 15 = 3.33
trip_rate = 4.83 + 3.33 = 8.16 BDT/km
```

Daily revenue at this rate: `8.16 × 60 loaded km = 489.60 BDT`

Daily total cost:
```
Operating: 4.83 × 100 total km = 483.00
Time:      50.00 × 12 hours    = 600.00
Total:                           1,083.00
```

**Daily deficit: 1,083 − 490 = −593 BDT.** The driver loses 593 BDT/day. No one would renew a subscription at this rate.

The formula misses:
- Operating cost on 40 empty km: `4.83 × 40 = 193 BDT`
- Time cost of 2 hours empty driving: `50 × 2 = 100 BDT`
- Time cost of ~6 hours idle waiting: `50 × 6 = 300 BDT`

Total missed costs: **593 BDT** — exactly the deficit.

### The Corrected Formula

The trip rate must amortize the driver's **full daily cost** over loaded km:

```
trip_per_km_rate = (operating_cost_per_km × daily_total_km
                  + driver_time_cost_per_hour × daily_hours)
                  ÷ daily_loaded_km
```

Equivalently, using utilization:

```
utilization_rate = daily_loaded_km / daily_total_km

trip_per_km_rate = operating_cost_per_km / utilization_rate
                 + driver_time_cost_per_hour × daily_hours / daily_loaded_km
```

The first term amortizes operating costs over loaded km only (since empty km don't generate trip revenue). The second term amortizes the driver's total time cost (including idle hours) over loaded km.

### Magnitude of the Error

| Sub-Category | User's Formula | Corrected Formula | Ratio |
|---|---|---|---|
| Bike Economy | 8.16 | 18.05 | 2.21x |
| Bike Standard | 9.42 | 20.52 | 2.18x |
| Bike Premium | 11.99 | 26.46 | 2.21x |
| CNG Standard | 14.99 | 28.11 | 1.88x |
| Car Economy | 22.87 | 37.89 | 1.66x |
| Car Standard | 26.91 | 43.66 | 1.62x |
| Car Premium | 35.45 | 57.53 | 1.62x |

The error is larger for bikes (2.2x) than cars (1.6x) because bikes have lower utilization (more idle time per loaded km) and lower operating costs relative to time costs.

### Recommendation

**Use the corrected formula.** The user's formula as written would produce fares that are economically non-viable for every vehicle type. I suspect the intent was the corrected formula (total daily cost amortized over loaded km), but the written definition computed only the marginal loaded cost. All derived values below use the corrected formula. The user's formula values are shown in a reference column for transparency.

---

## 2. Completed Data Tables

### Ownership Assumptions

| Sub-Category | Ownership | Rationale |
|---|---|---|
| Bike Economy | **OWNED** | Majority of 100cc ride-hail drivers own their bikes (60,000 BDT is achievable via savings/micro-loan) |
| Bike Standard | **OWNED** | Same logic; 100,000 BDT is accessible |
| Bike Premium | **OWNED** | 150cc bikes are more likely owned; renters prefer cheaper bikes |
| CNG Standard | **RENTED** | Majority of CNG auto drivers rent from fleet owners; daily joma is the standard arrangement |
| Car Economy | **OWNED** | Mixed market, but owner-drivers are common at this price point |
| Car Standard | **OWNED** | Mixed; modeled as owned for fare-floor purposes |
| Car Premium | **OWNED** | Owner-drivers or long-term lease; modeled as owned |

For CNG Standard (rented), depreciation and fixed costs are replaced by the daily rental fee. Insurance, registration, major repairs, and tyres are the owner's responsibility.

### A. Fuel Cost

| Sub-Category | cc | Fuel Efficiency (Dhaka city) | Fuel Price | **Fuel Cost/km** | Source |
|---|---|---|---|---|---|
| Bike Economy | 100 | 45 km/L [EST] | 145 BDT/L (octane) | **3.22** | Indian real-world city tests for 100cc (50-60 km/L) discounted 15-20% for Dhaka gridlock |
| Bike Standard | 125 | 40 km/L [EST] | 145 BDT/L | **3.63** | Same methodology; 125cc city tests (42-52 km/L), Dhaka-adjusted |
| Bike Premium | 150 | 33 km/L [EST] | 145 BDT/L | **4.39** | Anchored to real-world Dhaka test of 250cc bike at 31 km/L; 150cc should be slightly better |
| CNG Standard | 200 | 4.0 m³/100km [EST] | 43 BDT/m³ | **1.72** | Bajaj RE CNG consumption; Dhaka driver reports |
| Car Economy | 1000 | 13 km/L [EST] | 145 BDT/L (octane) | **11.15** | WagonR K10B engine; Indian city 16-18 km/L, Dhaka-adjusted |
| Car Standard | 1300 | 12 km/L [EST] | 145 BDT/L | **12.08** | Honda City 1.3L / Swift; Indian city 14-16 km/L, Dhaka-adjusted |
| Car Premium | 1500 | 9.5 km/L [EST] | 145 BDT/L | **15.26** | Allion 1.5L (1NZ-FE); heavier body than Axio; Dhaka city 9-10.5 km/L |

**Note on car fuel model:** All cars are modeled on petrol/octane as locked. In reality, the majority of Dhaka ride-hail cars are CNG-converted, which would reduce car fuel costs by 70-80%. The petrol-only model produces significantly higher car fares (see Section 8 for implications).

### B. Maintenance & Wear

| Sub-Category | Routine (BDT/km) | Tyre (BDT/km) | Major Repair (BDT/km) | **Total Maint./km** |
|---|---|---|---|---|
| Bike Economy | 0.35 | 0.20 | 0.19 | **0.74** |
| Bike Standard | 0.40 | 0.24 | 0.22 | **0.86** |
| Bike Premium | 0.50 | 0.29 | 0.32 | **1.11** |
| CNG Standard | 0.60 | 0.25 [owner pays] | 0.32 [owner pays] | **0.60** (driver pays routine only) |
| Car Economy | 0.50 | 0.34 | 0.18 | **1.02** |
| Car Standard | 0.60 | 0.46 | 0.30 | **1.36** |
| Car Premium | 0.70 | 0.69 | 0.25 | **1.64** |

**CNG Standard note:** Under the standard rental arrangement, the driver pays routine maintenance (oil, spark plugs, CNG tuning) but the vehicle owner pays tyres and major repairs. Only the driver's portion (0.60) is included in the driver's operating cost.

**Tyre calculations (corrected from v1):**

| Sub-Category | Tyre Setup | Cost/Tyre | Life (km) | Calculation | **Cost/km** |
|---|---|---|---|---|---|
| Bike Economy | 1R + 1F | 1,800 / 1,200 | 12,000 / 25,000 | (1800/12000)+(1200/25000) | **0.20** |
| Bike Standard | 1R + 1F | 2,200 / 1,500 | 12,000 / 25,000 | (2200/12000)+(1500/25000) | **0.24** |
| Bike Premium | 1R + 1F | 2,800 / 1,800 | 13,000 / 25,000 | (2800/13000)+(1800/25000) | **0.29** |
| CNG Standard | 1F + 2R | 1,200 / 1,500 ea. | 15,000 / 18,000 | (1200/15000)+2(1500/18000) | **0.25** [owner pays] |
| Car Economy | 4 tyres | 3,500 ea. | 35,000 | 4×3500/35000 | **0.40** |
| Car Standard | 4 tyres | 4,000 ea. | 35,000 | 4×4000/35000 | **0.46** |
| Car Premium | 4 tyres | 6,000 ea. | 35,000 | 4×6000/35000 | **0.69** |

### C. Depreciation / Rental

| Sub-Category | Ownership | Purchase Price (BDT) | Prior km at Purchase | Remaining Life (km) | Residual (BDT) | **Deprec. or Rental/km** |
|---|---|---|---|---|---|---|
| Bike Economy | OWNED | 60,000 [EST] | 30,000 | 70,000 | 8,000 | **0.74** |
| Bike Standard | OWNED | 100,000 [EST] | 30,000 | 75,000 | 12,000 | **1.17** |
| Bike Premium | OWNED | 175,000 [EST] | 25,000 | 65,000 | 20,000 | **2.38** |
| CNG Standard | **RENTED** | **900 BDT/day** [EST] | N/A | N/A | N/A | **8.18** (900÷110 daily km) |
| Car Economy | OWNED | 600,000 [EST] | 50,000 | 140,000 | 60,000 | **3.86** |
| Car Standard | OWNED | 800,000 [EST] | 60,000 | 140,000 | 100,000 | **5.00** |
| Car Premium | OWNED | 1,400,000 [EST] | 50,000 | 160,000 | 160,000 | **7.75** |

**CNG Standard rental note:** The 900 BDT/day joma is the Dhaka market rate for a Bajaj RE CNG auto. This replaces depreciation, insurance, registration, major repairs, and tyres in the driver's cost structure. The driver pays: rental + fuel + routine maintenance only.

**Car purchase prices:** Reflect the Dhaka used market after import duties of 150-450%. A WagonR that costs ~$5,000 internationally sells for ~$5,500 (600,000 BDT) in Dhaka's used market. A Honda City 1.3L at ~$7,000 international becomes ~$7,300 (800,000 BDT). A Toyota Allion 1.5L at ~$9,000 international becomes ~$12,700 (1,400,000 BDT) due to higher duty on newer vehicles.

### D. Fixed Costs (insurance + BRTA only; NO lead package)

Annual km = daily km × 310 working days/year (shown as equation):

| Sub-Category | Daily km | × Working days | = Annual km | Insurance | Reg/Fitness/Tax | **Fixed/km** |
|---|---|---|---|---|---|---|
| Bike Economy | 100 | × 310 | = **31,000** | 2,500 | 1,500 | **0.13** |
| Bike Standard | 100 | × 310 | = **31,000** | 3,000 | 1,500 | **0.15** |
| Bike Premium | 90 | × 310 | = **27,900** | 4,000 | 2,000 | **0.22** |
| CNG Standard | 110 | × 310 | = **34,100** | 0 [owner] | 0 [owner] | **0.00** |
| Car Economy | 110 | × 310 | = **34,100** | 15,000 | 5,000 | **0.59** |
| Car Standard | 120 | × 310 | = **37,200** | 22,000 | 7,000 | **0.78** |
| Car Premium | 120 | × 310 | = **37,200** | 32,000 | 8,000 | **1.08** |

### E. Driver Time / Opportunity Cost

| Variable | Bike Econ. | Bike Std. | Bike Prem. | CNG Std. | Car Econ. | Car Std. | Car Prem. |
|---|---|---|---|---|---|---|---|
| Daily working hours | 12 | 12 | 12 | 12 | 12 | 12 | 12 |
| Daily net earnings target (BDT) [EST] | 600 | 650 | 700 | 700 | 900 | 1,100 | 1,400 |
| Daily total km | 100 | 100 | 90 | 110 | 110 | 120 | 120 |
| Daily loaded km | 60 | 60 | 54 | 66 | 72 | 78 | 78 |
| Daily empty km | 40 | 40 | 36 | 44 | 38 | 42 | 42 |
| Utilization rate | 60% | 60% | 60% | 60% | 65% | 65% | 65% |
| Avg speed, loaded (km/h) [EST] | 15 | 15 | 15 | 13 | 12 | 12 | 12 |
| Avg speed, empty (km/h) [EST] | 20 | 20 | 20 | 16 | 16 | 16 | 16 |
| **Time cost per hour** | **50.00** | **54.17** | **58.33** | **58.33** | **75.00** | **91.67** | **116.67** |
| Time cost per km (loaded) | 3.33 | 3.61 | 3.89 | 4.49 | 6.25 | 7.64 | 9.72 |
| Time cost per km (empty) | 2.50 | 2.71 | 2.92 | 3.65 | 4.69 | 5.73 | 7.29 |

**Earnings target derivation [EST]:** Benchmarked against Dhaka alternatives — rickshaw pullers earn 400-600 BDT/day, day laborers 500-800, private drivers 15,000-25,000/month. Ride-hail targets represent the minimum take-home (before subscription deduction) at which the driver prefers to continue rather than switch.

**Speed derivation [EST]:** Bikes filter through traffic (15 km/h loaded); CNG autos are wider but still nimble (13 km/h); cars sit in gridlock (12 km/h). Empty driving is faster for all types due to route flexibility.

### F. Pickup Distance Distribution (unchanged from v2)

| Zone Type | p25 | p50 | p75 | p90 |
|---|---|---|---|---|
| Dense urban core | 0.4 km | 0.8 km | 1.3 km | 2.0 km |
| Standard urban | 0.8 km | 1.5 km | 2.5 km | 4.0 km |
| Suburban/peripheral | 1.5 km | 3.0 km | 5.0 km | 8.0 km |

---

## 3. Derived Fare Components — Step by Step

### Step 1: Operating Cost Per Km

**Formula chain (for owned vehicles):**
```
fuel_cost_per_km        = fuel_price_BDT_per_L ÷ fuel_efficiency_km_per_L
maintenance_cost_per_km = routine_per_km + tyre_per_km + major_repair_per_km
depreciation_per_km     = (purchase_price − residual) ÷ remaining_life_km
fixed_cost_per_km       = (annual_insurance + annual_BRTA) ÷ annual_km
operating_cost_per_km   = fuel + maintenance + depreciation + fixed
```

**Formula chain (for CNG Standard — rented):**
```
fuel_cost_per_km        = CNG_consumption_m³_per_km × CNG_price_per_m³
daily_rental_per_km     = daily_joma_BDT ÷ daily_total_km
operating_cost_per_km   = fuel + routine_maintenance + daily_rental
```

| Sub-Category | Fuel | Maint. | Depr./Rental | Fixed | **OpCost/km** |
|---|---|---|---|---|---|
| Bike Economy | 3.22 | 0.74 | 0.74 | 0.13 | **4.83** |
| Bike Standard | 3.63 | 0.86 | 1.17 | 0.15 | **5.81** |
| Bike Premium | 4.39 | 1.11 | 2.38 | 0.22 | **8.10** |
| CNG Standard | 1.72 | 0.60 | 8.18 | 0.00 | **10.50** |
| Car Economy | 11.15 | 1.02 | 3.86 | 0.59 | **16.62** |
| Car Standard | 12.08 | 1.36 | 5.00 | 0.78 | **19.22** |
| Car Premium | 15.26 | 1.64 | 7.75 | 1.08 | **25.73** |

### Step 2: Loaded Trip Cost Per Km (User's Formula — Reference Only)

```
loaded_cost_per_km = operating_cost_per_km + (time_cost_per_hour ÷ loaded_speed)
```

| Sub-Category | OpCost/km | Time/km (loaded) | **LoadedCost/km** |
|---|---|---|---|
| Bike Economy | 4.83 | 3.33 | **8.16** |
| Bike Standard | 5.81 | 3.61 | **9.42** |
| Bike Premium | 8.10 | 3.89 | **11.99** |
| CNG Standard | 10.50 | 4.49 | **14.99** |
| Car Economy | 16.62 | 6.25 | **22.87** |
| Car Standard | 19.22 | 7.64 | **26.86** |
| Car Premium | 25.73 | 9.72 | **35.45** |

**These values are NOT used for fare derivation.** They are shown for transparency against the user's original formula. See Section 1 for why they are insufficient.

### Step 3: Empty (Deadhead) Cost Per Km

```
empty_cost_per_km = operating_cost_per_km + (time_cost_per_hour ÷ empty_speed)
```

| Sub-Category | OpCost/km | Time/km (empty) | **EmptyCost/km** |
|---|---|---|---|
| Bike Economy | 4.83 | 2.50 | **7.33** |
| Bike Standard | 5.81 | 2.71 | **8.52** |
| Bike Premium | 8.10 | 2.92 | **11.02** |
| CNG Standard | 10.50 | 3.65 | **14.15** |
| Car Economy | 16.62 | 4.69 | **21.31** |
| Car Standard | 19.22 | 5.73 | **24.95** |
| Car Premium | 25.73 | 7.29 | **33.02** |

### Step 4: Trip Per-Km Rate (Corrected Formula)

```
trip_per_km_rate = (operating_cost_per_km × daily_total_km
                  + time_cost_per_hour × daily_hours)
                  ÷ daily_loaded_km
```

**Equivalently:**
```
trip_per_km_rate = operating_cost_per_km ÷ utilization_rate
                 + time_cost_per_hour × daily_hours ÷ daily_loaded_km
```

| Sub-Category | OpCost × Total km | Time/hr × Hours | Total Daily Cost | ÷ Loaded km | **Trip Rate** |
|---|---|---|---|---|---|
| Bike Economy | 4.83 × 100 = 483 | 50.00 × 12 = 600 | 1,083 | ÷ 60 | **18.05** |
| Bike Standard | 5.81 × 100 = 581 | 54.17 × 12 = 650 | 1,231 | ÷ 60 | **20.52** |
| Bike Premium | 8.10 × 90 = 729 | 58.33 × 12 = 700 | 1,429 | ÷ 54 | **26.46** |
| CNG Standard | 10.50 × 110 = 1,155 | 58.33 × 12 = 700 | 1,855 | ÷ 66 | **28.11** |
| Car Economy | 16.62 × 110 = 1,828 | 75.00 × 12 = 900 | 2,728 | ÷ 72 | **37.89** |
| Car Standard | 19.22 × 120 = 2,306 | 91.67 × 12 = 1,100 | 3,406 | ÷ 78 | **43.67** |
| Car Premium | 25.73 × 120 = 3,088 | 116.67 × 12 = 1,400 | 4,488 | ÷ 78 | **57.53** |

**Conservative bias note (from user's framework):** The user's note stated this formula would be "conservative (slightly high)" because it doesn't credit pickup-fee revenue. With the corrected formula, the conservative bias from ignoring pickup fees is small (1-3% — see Section 8). However, the corrected formula is conservative in a different sense: it assumes the driver's **full** daily time cost (including 5-6 idle hours) must be covered by loaded km revenue alone. If the platform achieves higher utilization than assumed (e.g., 70% vs 60%), the required rate drops materially.

### Step 5: Pickup Rate — Natural Multiplier vs. Locked Multiplier

**Natural multiplier** (ratio of empty-km marginal cost to loaded-km marginal cost):
```
natural_multiplier = empty_cost_per_km ÷ loaded_cost_per_km
                   = (OpCost + time/hr÷empty_speed) ÷ (OpCost + time/hr÷loaded_speed)
```

This is independent of the trip-rate formula — it measures the relative cost of one km of deadhead vs. one km of loaded driving.

| Sub-Category | EmptyCost/km | LoadedCost/km (marginal) | **Natural Multiplier** | **Locked Multiplier** | **Gap** | **Direction** |
|---|---|---|---|---|---|---|
| Bike Economy | 7.33 | 8.16 | **0.898** | 0.75 | +0.148 | Natural >> Locked |
| Bike Standard | 8.52 | 9.42 | **0.904** | 0.75 | +0.154 | Natural >> Locked |
| Bike Premium | 11.02 | 11.99 | **0.919** | 0.75 | +0.169 | Natural >> Locked |
| CNG Standard | 14.15 | 14.99 | **0.944** | 0.80 | +0.144 | Natural >> Locked |
| Car Economy | 21.31 | 22.87 | **0.932** | 0.90 | +0.032 | Natural > Locked |
| Car Standard | 24.95 | 26.86 | **0.929** | 0.90 | +0.029 | Natural > Locked |
| Car Premium | 33.02 | 35.45 | **0.931** | 0.90 | +0.031 | Natural > Locked |

**Pickup rates using corrected trip rates:**

| Sub-Category | Trip Rate | × Locked Mult. | **Locked Pickup Rate** | × Natural Mult. | **Natural Pickup Rate** | Driver Subsidy/km |
|---|---|---|---|---|---|---|
| Bike Economy | 18.05 | × 0.75 | **13.54** | × 0.898 | 16.21 | 2.67 |
| Bike Standard | 20.52 | × 0.75 | **15.39** | × 0.904 | 18.55 | 3.16 |
| Bike Premium | 26.46 | × 0.75 | **19.85** | × 0.919 | 24.32 | 4.47 |
| CNG Standard | 28.11 | × 0.80 | **22.49** | × 0.944 | 26.53 | 4.04 |
| Car Economy | 37.89 | × 0.90 | **34.10** | × 0.932 | 35.31 | 1.21 |
| Car Standard | 43.67 | × 0.90 | **39.30** | × 0.929 | 40.57 | 1.27 |
| Car Premium | 57.53 | × 0.90 | **51.78** | × 0.931 | 53.56 | 1.78 |

### Step 6: Base Fare

```
base_fare = (time_cost_per_hour × accept_to_board_minutes ÷ 60) + fixed_overhead
```

**Question 3 answer:** Average time from ride accept to trip start in Dhaka (non-driving portion only — after driver arrives at pickup):

| Component | Time [EST] |
|---|---|
| App interaction (accept, view details) | 30 seconds |
| Calling/locating rider | 1-2 minutes |
| Rider boarding | 1-2 minutes |
| **Total** | **3-5 minutes → use 4 minutes** |

This excludes driving time to pickup (covered by the pickup fee). Dhaka's address system is informal, buildings lack clear numbering, and riders often need phone guidance to find the driver — 4 minutes is realistic.

Fixed per-trip overhead: 1.00 BDT [EST] (app/transaction cost).

| Sub-Category | Time/hr | × 4/60 | + 1.00 | **Base Fare (BDT)** |
|---|---|---|---|---|
| Bike Economy | 50.00 | 3.33 | + 1.00 | **4.33** |
| Bike Standard | 54.17 | 3.61 | + 1.00 | **4.61** |
| Bike Premium | 58.33 | 3.89 | + 1.00 | **4.89** |
| CNG Standard | 58.33 | 3.89 | + 1.00 | **4.89** |
| Car Economy | 75.00 | 5.00 | + 1.00 | **6.00** |
| Car Standard | 91.67 | 6.11 | + 1.00 | **7.11** |
| Car Premium | 116.67 | 7.78 | + 1.00 | **8.78** |

### Step 7: Waiting Rate

```
waiting_rate_per_min = time_cost_per_hour ÷ 60
```

| Sub-Category | Time/hr | **Wait Rate (BDT/min)** |
|---|---|---|
| Bike Economy | 50.00 | **0.83** |
| Bike Standard | 54.17 | **0.90** |
| Bike Premium | 58.33 | **0.97** |
| CNG Standard | 58.33 | **0.97** |
| Car Economy | 75.00 | **1.25** |
| Car Standard | 91.67 | **1.53** |
| Car Premium | 116.67 | **1.94** |

### Step 8: Free Waiting Time

**Question 4 answer:** Grace period before waiting charges kick in.

| Vehicle Type | Free Wait [EST] | Rationale |
|---|---|---|
| Bike | **3 minutes** | Riders expect quick pickup; bikes can't wait without blocking traffic; 3 min covers ~75% of rider boarding |
| CNG Auto | **3 minutes** | Similar dynamics to bikes; CNG autos block more space |
| Car | **5 minutes** | Riders need time to come down from apartments, cross streets, find the car in dense areas; 5 min covers ~75% |

### Step 9: Pickup Fee Parameters

```
free_radius_km    = 1.5 km [EST] — standard urban p70-p75; zone-dependent
                    (dense urban: ~1.2 km; standard urban: ~1.5-2.0 km; suburban: ~4.0 km)
cap_billable_km   = 2.0 km (locked)
cap_pct_of_fare   = 40% (locked)
```

**Validation against pickup distributions:**
- Dense urban p90 = 2.0 km → cap at 2.0 km binds at p90 (reasonable)
- Standard urban p90 = 4.0 km → cap at 2.0 km binds well below p90 (driver absorbs pickups > 3.5 km)
- Suburban p90 = 8.0 km → cap binds early; suburban long-pickup costs fall heavily on driver

**Note:** The free radius is a platform-level parameter, not per-category. The 1.5 km default should be adjusted by zone at dispatch time once pilot data exists.

---

## 4. Output Table — Derived Fare Components (Part 4, Item 2)

| Sub-Category | OpCost/km | Trip Rate (user formula) | **Trip Rate (corrected)** | Natural Mult. | Locked Mult. | **Pickup Rate** | **Base Fare** | **Wait Rate** | **Free Wait** | Free Radius | Cap km | Cap % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Bike Economy (100cc) | 4.83 | 8.16 | **18.05** | 0.898 | 0.75 | **13.54** | **4.33** | **0.83**/min | 3 min | 1.5 km | 2.0 | 40% |
| Bike Standard (125cc) | 5.81 | 9.42 | **20.52** | 0.904 | 0.75 | **15.39** | **4.61** | **0.90**/min | 3 min | 1.5 km | 2.0 | 40% |
| Bike Premium (150cc) | 8.10 | 11.99 | **26.46** | 0.919 | 0.75 | **19.85** | **4.89** | **0.97**/min | 3 min | 1.5 km | 2.0 | 40% |
| CNG Standard (200cc) | 10.50 | 14.99 | **28.11** | 0.944 | 0.80 | **22.49** | **4.89** | **0.97**/min | 3 min | 1.5 km | 2.0 | 40% |
| Car Economy (1000cc) | 16.62 | 22.87 | **37.89** | 0.932 | 0.90 | **34.10** | **6.00** | **1.25**/min | 5 min | 1.5 km | 2.0 | 40% |
| Car Standard (1300cc) | 19.22 | 26.86 | **43.67** | 0.929 | 0.90 | **39.30** | **7.11** | **1.53**/min | 5 min | 1.5 km | 2.0 | 40% |
| Car Premium (1500cc) | 25.73 | 35.45 | **57.53** | 0.931 | 0.90 | **51.78** | **8.78** | **1.94**/min | 5 min | 1.5 km | 2.0 | 40% |

**Example fare computation — Bike Economy, 8 km trip, 2 min waiting, 2.5 km pickup:**

```
fare_before_pickup = base_fare + (trip_rate × km) + (wait_rate × chargeable_wait)
                   = 4.33 + (18.05 × 8) + (0.83 × max(0, 2 − 3))
                   = 4.33 + 144.40 + 0.00
                   = 148.73

chargeable_pickup_km = min(max(0, 2.5 − 1.5), 2.0) = min(1.0, 2.0) = 1.0
pickup_fee_raw = 1.0 × 13.54 = 13.54
pickup_fee_cap  = 0.40 × 148.73 = 59.49
pickup_fee = min(13.54, 59.49) = 13.54

final_fare = 148.73 + 13.54 = 162.27 BDT
```

Rider pays 162.27 BDT. Driver receives 162.27 BDT (0% commission). Driver's all-in cost for this trip (loaded portion): 18.05 × 8 = 144.40 BDT. Net contribution to daily earnings: 162.27 − 144.40 = 17.87 BDT (plus the pickup km cost is partially offset by the 13.54 pickup fee).

---

## 5. Multiplier Validation Report (Part 4, Item 3)

### Summary

| Sub-Category | Natural Mult. | Locked Mult. | Gap | Exceeds ±0.05? | Flag |
|---|---|---|---|---|---|
| Bike Economy | 0.898 | 0.75 | **+0.148** | **YES** | **RED** |
| Bike Standard | 0.904 | 0.75 | **+0.154** | **YES** | **RED** |
| Bike Premium | 0.919 | 0.75 | **+0.169** | **YES** | **RED** |
| CNG Standard | 0.944 | 0.80 | **+0.144** | **YES** | **RED** |
| Car Economy | 0.932 | 0.90 | +0.032 | No | GREEN |
| Car Standard | 0.929 | 0.90 | +0.029 | No | GREEN |
| Car Premium | 0.931 | 0.90 | +0.031 | No | GREEN |

### Analysis

**Car tiers (GREEN):** The locked multiplier of 0.90 is within ±0.05 of the natural multiplier (~0.93) across all three car sub-categories. The pickup fee nearly covers the true deadhead cost. Drivers absorb only a 3% subsidy on pickup km. **No override needed.**

**Bike tiers (RED):** The locked multiplier of 0.75 is 0.15-0.17 below the natural multiplier (~0.90). This means the pickup fee charges only 75% of the trip rate per pickup km, but the actual deadhead cost is ~90% of the loaded cost per km. **The driver subsidizes ~15-18% of every pickup km.**

**CNG Standard (RED):** The locked multiplier of 0.80 is 0.14 below the natural 0.94. **The driver subsidizes ~14% of every pickup km.**

### Why the Gap Exists

The natural multiplier is high (0.89-0.94) because operating costs (fuel, maintenance, depreciation) are the **same** per km whether loaded or empty. The only difference between loaded and empty cost is the time component, which changes with speed. For bikes, the speed difference is significant (15 vs 20 km/h = 25% faster when empty), but operating costs dominate the cost structure enough to pull the ratio well above 0.75.

In formula terms:
```
natural_mult = (OpCost + Time/hr ÷ empty_speed) ÷ (OpCost + Time/hr ÷ loaded_speed)
```

When OpCost is low relative to time cost (bikes), the ratio is driven by the speed ratio (loaded_speed/empty_speed = 15/20 = 0.75) but pulled upward by the OpCost constant. When OpCost is high relative to time cost (cars), the constant dominates and the ratio approaches 1.0.

### Recommendation

**Do not change the locked multipliers for launch.** Here is the reasoning:

1. **The gap is a deliberate rider subsidy, not an error.** The locked multipliers make pickups cheaper for riders, which increases demand and lead consumption. For a subscription platform optimizing for driver retention via lead volume, this is strategically sound — more rider demand means more leads per subscription.

2. **The subsidy is bounded.** The pickup fee has a double cap (km cap + % of fare backstop). Even with the lower multiplier, the maximum pickup fee is constrained. The driver's exposure is limited.

3. **The subsidy is small per trip.** For a typical bike pickup of 2 km (1 km beyond free radius), the driver subsidy is: 1.0 km × (16.21 − 13.54) = 2.67 BDT. Over 8 trips/day with 30% generating a pickup fee: 8 × 0.30 × 2.67 = 6.41 BDT/day. Against a 600 BDT daily target, this is ~1%. Tolerable.

4. **Sub-category overrides would add complexity without proportional benefit.** The natural multiplier varies from 0.898 (Bike Economy) to 0.944 (CNG Standard) — a range of 0.046 within the "problem" tiers. A single locked multiplier per tier (0.75 for bikes, 0.80 for CNG) is simpler for riders to understand.

**However, flag for post-launch monitoring:** If bike driver renewal rates lag car renewal rates, the pickup fee multiplier is a candidate lever. Increasing bike multiplier from 0.75 to 0.85 would reduce the driver subsidy from ~15% to ~5% of pickup km, at the cost of slightly higher pickup fees for bike riders.

---
# Parts 3 & 4: Fare Derivation, Output, and Validation (Continued)

---

## 6. Sensitivity Table (continued)

### Trip Per-Km Rate Sensitivity to Fuel Price (Corrected Formula)

**Methodology:** When fuel price changes by Δ BDT/L, the change in trip rate is:

```
Δ_trip_rate = (Δ / fuel_efficiency) × (daily_total_km / daily_loaded_km)
            = (Δ / fuel_efficiency) / utilization_rate
```

| Sub-Category | Fuel Eff. | Util. | Rate @ 135 BDT/L | **Rate @ 145 BDT/L (base)** | Rate @ 155 BDT/L | Δ per ±10 | Δ % |
|---|---|---|---|---|---|---|---|
| Bike Economy | 45 km/L | 60% | 17.68 | **18.05** | 18.42 | ±0.37 | ±2.0% |
| Bike Standard | 40 km/L | 60% | 20.08 | **20.52** | 20.95 | ±0.43 | ±2.1% |
| Bike Premium | 33 km/L | 60% | 25.95 | **26.46** | 26.97 | ±0.51 | ±1.9% |
| CNG Standard | 4.0 m³/100km | 60% | N/A | **28.11** | N/A | N/A | N/A |
| Car Economy | 13 km/L | 65% | 36.70 | **37.89** | 39.07 | ±1.18 | ±3.1% |
| Car Standard | 12 km/L | 65% | 42.39 | **43.67** | 44.94 | ±1.28 | ±2.9% |
| Car Premium | 9.5 km/L | 65% | 55.92 | **57.53** | 59.14 | ±1.61 | ±2.8% |

**CNG Standard sensitivity (separate):**

| Δ CNG Price | Rate @ 38 BDT/m³ | **Rate @ 43 BDT/m³ (base)** | Rate @ 48 BDT/m³ | Δ per ±5 | Δ % |
|---|---|---|---|---|---|
| CNG Standard | 27.55 | **28.11** | 28.66 | ±0.56 | ±2.0% |

### Interpretation

**Bikes are relatively fuel-insensitive.** A ±10 BDT/L change (±7% of current price) shifts the trip rate by only ±2%. This is because fuel is only 17-19% of the bike's total cost per km. The driver's time cost dominates.

**Cars are more fuel-sensitive but still modest.** A ±10 BDT/L change shifts the trip rate by ±2.8-3.1%. Fuel is 30-43% of car operating cost (petrol model), so the sensitivity is higher but still bounded. A 10 BDT/L increase adds 1.18-1.61 BDT/km to the trip rate — meaningful but not catastrophic.

**CNG Standard is the most fuel-insensitive.** CNG is only 16% of operating cost (the daily rental dominates). A ±5 BDT/m³ change shifts the rate by only ±2.0%.

**Practical implication:** The fare formula does not need a fuel-price adjustment mechanism built into the engine. Fuel price changes of ±10 BDT/L shift rates by 2-3%, which is within normal fare rounding. The platform can manually adjust per-km rates quarterly when fuel prices change materially (±20+ BDT/L), without needing real-time fuel indexing.

---

## 7. Recommendation on Grouping (Part 4, Item 5)

### Rate Spread Analysis

| Tier | Sub-Category | Trip Rate | Spread from Tier Min | Merge Candidate? |
|---|---|---|---|---|
| **Bike** | Economy | 18.05 | — | — |
| | Standard | 20.52 | +14% | Merge with Economy? |
| | Premium | 26.46 | +47% | No — too far |
| **CNG** | Standard | 28.11 | — | Single sub-category |
| **Car** | Economy | 37.89 | — | — |
| | Standard | 43.67 | +15% | Merge with Economy? |
| | Premium | 57.53 | +52% | No — too far |

### Recommendation: Launch with 5 Pricing Tiers, Not 7

| Launch Tier | Sub-Categories Merged | Trip Rate | Rationale |
|---|---|---|---|
| **Bike** | Economy + Standard | **19.00 BDT/km** (blended) | 14% spread is within fare rounding. Riders don't distinguish 100cc from 125cc. A single "Bike" tier simplifies the rider experience. Use the weighted average (slightly above Economy, slightly below Standard). |
| **Bike Premium** | Premium only | **26.50 BDT/km** | 47% above Bike tier is too large to merge. Premium bikes (150cc+) are visibly different — riders can see and feel the difference. Separate tier justified. |
| **CNG Auto** | Standard only | **28.00 BDT/km** | Single sub-category. No merge needed. |
| **Car** | Economy + Standard | **40.50 BDT/km** (blended) | 15% spread is within fare rounding. A WagonR and a Honda City are both "cars" to most riders. The comfort difference is real but modest. |
| **Car Premium** | Premium only | **57.50 BDT/km** | 52% above Car tier. The Allion/Premio is a visibly different vehicle. Riders booking "premium" expect and will pay for this. |

**Blended rate methodology:** Weighted by expected trip volume. If Bike Economy generates 60% of bike trips and Bike Standard generates 40%, the blended rate is: 0.60 × 18.05 + 0.40 × 20.52 = 19.03 ≈ 19.00 BDT/km.

**What this means for the rider:**
- Rider opens the app, sees 5 vehicle types: Bike, Bike Premium, CNG Auto, Car, Car Premium
- Each has a single per-km rate, base fare, and pickup rate
- Simple, transparent, explainable

**What this means for the driver:**
- Drivers within a merged tier (e.g., Bike Economy and Bike Standard) earn the same per-km rate
- Bike Economy drivers earn slightly more than their cost floor (19.00 vs 18.05)
- Bike Standard drivers earn slightly less than their cost floor (19.00 vs 20.52)
- This is acceptable if Bike Standard drivers get slightly more leads (higher demand at the lower price point) or if the difference is small enough that it falls within normal daily variance

**Risk:** Bike Standard drivers may feel underpaid relative to Bike Economy drivers (same rate, higher cost). Monitor renewal rates by sub-category within merged tiers. If Bike Standard renewal lags, split back to 7 tiers.

---

## 8. Conservative Bias Flag (Part 4, Item 6)

### The Bias Source

The corrected trip-rate formula covers the driver's **full** daily cost (operating + time) from loaded-km revenue alone. It does not credit the pickup fee, which also contributes to the driver's daily revenue. This means the trip rate is slightly higher than strictly necessary.

### Estimating the Bias

To quantify, I need to estimate daily pickup-fee revenue per sub-category.

**Assumptions:**
- Average trips per day: Bike 8, CNG 8, Car 6
- Fraction of trips with pickup fee (pickup beyond free radius): 30% [EST]
- Average chargeable pickup km (when fee triggers): 1.0 km [EST] (mean of the distribution beyond free radius)
- Pickup rate per category: from derived table

| Sub-Category | Trips/day | % with fee | Avg chg. km | Pickup Rate | **Daily Pickup Revenue** | Daily Total Cost | **Bias %** |
|---|---|---|---|---|---|---|---|
| Bike (merged) | 8 | 30% | 1.0 | 14.47 | **34.73** | 1,157 | **3.0%** |
| Bike Premium | 7 | 30% | 1.0 | 19.85 | **41.69** | 1,429 | **2.9%** |
| CNG Auto | 8 | 30% | 1.0 | 22.49 | **53.98** | 1,855 | **2.9%** |
| Car (merged) | 6 | 30% | 1.0 | 36.70 | **66.06** | 3,067 | **2.2%** |
| Car Premium | 5 | 30% | 1.0 | 51.78 | **77.67** | 4,488 | **1.7%** |

**Interpretation:** The conservative bias is **1.7-3.0%** across all categories. This is small. It means the trip rate could theoretically be reduced by 1.7-3.0% if pickup-fee revenue were credited, and the driver would still hit their daily earnings target.

### Per-Sub-Category Bias Flags

| Sub-Category | Trip Rate (corrected) | Rate if Pickup Credited | **Bias** | **Flag** |
|---|---|---|---|---|
| Bike (merged) | 19.00 | 18.43 | **3.0%** | Negligible. Safe to use 19.00. |
| Bike Premium | 26.46 | 25.70 | **2.9%** | Negligible. Safe to use 26.50. |
| CNG Auto | 28.11 | 27.30 | **2.9%** | Negligible. Safe to use 28.00. |
| Car (merged) | 40.50 | 39.62 | **2.2%** | Negligible. Safe to use 40.50. |
| Car Premium | 57.53 | 56.56 | **1.7%** | Negligible. Safe to use 57.50. |

**Conclusion:** The conservative bias from ignoring pickup-fee revenue is **negligible (under 3%)** for all categories. This is because:
1. Most pickups (70%) fall within the free radius and generate zero pickup fee
2. The pickup fee per km is lower than the trip rate (multiplier < 1.0)
3. The pickup fee is capped at 40% of fare, which rarely binds on normal trips

**No adjustment needed.** The corrected trip rates are safe to use as-is. The pickup-fee revenue provides a small buffer that helps the driver on days with longer-than-average pickups, without meaningfully inflating the trip rate.

---

## 9. CNG Standard Rental Cross-Check

The CNG Standard driver's daily economics under the rental model:

```
Daily rental:           900 BDT
Daily fuel:             1.72 × 110 = 189 BDT
Daily routine maint:    0.60 × 110 = 66 BDT
Daily total cost:       1,255 BDT

Daily time cost:        58.33 × 12 = 700 BDT
Daily total cost + time: 1,955 BDT

Daily loaded km:        66
Trip rate:              28.11 BDT/km
Daily trip revenue:     28.11 × 66 = 1,855 BDT

Daily pickup revenue:   ~54 BDT (from Section 8)
Daily total revenue:    1,909 BDT

Daily net (before subscription): 1,909 − 1,255 = 654 BDT
Daily target:           700 BDT
Gap:                    −46 BDT (6.6% shortfall)
```

**The CNG Standard driver falls 46 BDT/day short of the 700 BDT target.** This is because the daily rental (900 BDT) is a large fixed cost that doesn't scale with utilization. The driver needs either:
- 2 more trips per day (higher utilization), or
- A slightly higher trip rate (~29.00 instead of 28.11), or
- A lower daily rental (negotiate with fleet owner)

**Recommendation:** For launch, set the CNG Auto trip rate at **29.00 BDT/km** instead of 28.00. This closes the gap (29.00 × 66 = 1,914 + 54 pickup = 1,968; net = 1,968 − 1,255 = 713 BDT, above target). The 3% uplift over the cost-floor rate is small and ensures CNG drivers can sustain renewals.

---

## 10. Final Derived Fare Component Table (Part 4, Item 2 — Corrected)

| Sub-Category | OpCost/km | Trip Rate (user) | **Trip Rate (final)** | Natural Mult. | Locked Mult. | **Pickup Rate** | **Base Fare** | **Wait Rate** | **Free Wait** | Free Radius | Cap km | Cap % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Bike** (100-125cc) | 5.24 | 8.68 | **19.00** | 0.900 | 0.75 | **14.25** | **4.45** | **0.86**/min | 3 min | 1.5 km | 2.0 | 40% |
| **Bike Premium** (150cc) | 8.10 | 11.99 | **26.50** | 0.919 | 0.75 | **19.88** | **4.89** | **0.97**/min | 3 min | 1.5 km | 2.0 | 40% |
| **CNG Auto** (200cc) | 10.50 | 14.99 | **29.00** | 0.944 | 0.80 | **23.20** | **4.89** | **0.97**/min | 3 min | 1.5 km | 2.0 | 40% |
| **Car** (1000-1300cc) | 17.73 | 24.58 | **40.50** | 0.931 | 0.90 | **36.45** | **6.47** | **1.37**/min | 5 min | 1.5 km | 2.0 | 40% |
| **Car Premium** (1500cc) | 25.73 | 35.45 | **57.50** | 0.931 | 0.90 | **51.75** | **8.78** | **1.94**/min | 5 min | 1.5 km | 2.0 | 40% |

**Blended values for merged tiers:**
- Bike: OpCost = 0.60×4.83 + 0.40×5.81 = 5.22; Trip Rate = 19.00 (set, not derived from blend)
- Car: OpCost = 0.55×16.62 + 0.45×19.22 = 17.79; Trip Rate = 40.50 (set, not derived from blend)
- Base fares and wait rates for merged tiers use the same weighted-average methodology

---

## 11. Example Fare Computations

### Scenario A: Short hop — Bike, 3 km trip, 1 min wait, 1.0 km pickup

```
fare_before_pickup = 4.45 + (19.00 × 3) + (0.86 × max(0, 1 − 3))
                   = 4.45 + 57.00 + 0.00
                   = 61.45

chargeable_pickup = min(max(0, 1.0 − 1.5), 2.0) = 0.00
pickup_fee = 0.00

final_fare = 61.45 BDT
```

Rider pays 61 BDT. No pickup fee (within free radius). Explainable: "You paid for 3 km of riding plus a small base charge."

### Scenario B: Medium trip — Car, 10 km trip, 3 min wait, 2.5 km pickup

```
fare_before_pickup = 6.47 + (40.50 × 10) + (1.37 × max(0, 3 − 5))
                   = 6.47 + 405.00 + 0.00
                   = 411.47

chargeable_pickup = min(max(0, 2.5 − 1.5), 2.0) = min(1.0, 2.0) = 1.0
pickup_fee_raw = 1.0 × 36.45 = 36.45
pickup_fee_cap  = 0.40 × 411.47 = 164.59
pickup_fee = min(36.45, 164.59) = 36.45

final_fare = 411.47 + 36.45 = 447.92 BDT
```

Rider pays 448 BDT. Explainable: "You paid for 10 km of car ride, plus the driver drove 1 km beyond the free pickup zone to reach you."

### Scenario C: Long pickup, short trip — Bike, 2 km trip, 0 min wait, 3.0 km pickup

```
fare_before_pickup = 4.45 + (19.00 × 2) + 0.00
                   = 42.45

chargeable_pickup = min(max(0, 3.0 − 1.5), 2.0) = min(1.5, 2.0) = 1.5
pickup_fee_raw = 1.5 × 14.25 = 21.38
pickup_fee_cap  = 0.40 × 42.45 = 16.98
pickup_fee = min(21.38, 16.98) = 16.98

final_fare = 42.45 + 16.98 = 59.43 BDT
```

**The 40% cap binds.** The raw pickup fee (21.38) exceeds 40% of the trip fare (16.98). The rider pays 59 BDT instead of what would have been 64 BDT uncapped. The driver absorbs 4.40 BDT of pickup cost. This is the edge case the cap is designed to protect — short trips with long pickups.

Explainable to rider: "You paid for 2 km of riding, plus a pickup charge because the driver came 1.5 km beyond the free zone — capped so it doesn't dominate your fare."

Explainable to driver: "Your pickup fee was capped at 40% of the trip fare. On short trips with long pickups, the cap protects riders from disproportionate charges."

### Scenario D: Premium car, long trip — Car Premium, 20 km trip, 8 min wait, 1.8 km pickup

```
fare_before_pickup = 8.78 + (57.50 × 20) + (1.94 × max(0, 8 − 5))
                   = 8.78 + 1,150.00 + 5.82
                   = 1,164.60

chargeable_pickup = min(max(0, 1.8 − 1.5), 2.0) = min(0.3, 2.0) = 0.3
pickup_fee_raw = 0.3 × 51.75 = 15.53
pickup_fee_cap  = 0.40 × 1,164.60 = 465.84
pickup_fee = min(15.53, 465.84) = 15.53

final_fare = 1,164.60 + 15.53 = 1,180.13 BDT
```

Rider pays 1,180 BDT for a 20 km premium car ride with 3 minutes of chargeable waiting and a modest pickup beyond the free zone. The pickup fee is small relative to the trip fare. Explainable: "You paid for 20 km of premium car, 3 minutes of waiting beyond the grace period, and a small pickup charge."

---

## 12. Complete Input Traceability

Every derived number traces back to an input. Here is the full chain for the **Bike** (merged) tier as a worked example:

```
INPUTS:
  fuel_price          = 145 BDT/L [LOCKED]
  fuel_efficiency     = 42.5 km/L [EST: blended 45×0.6 + 40×0.4]
  routine_maint       = 0.37 BDT/km [EST: blended 0.35×0.6 + 0.40×0.4]
  tyre_cost           = 0.22 BDT/km [EST: blended 0.20×0.6 + 0.24×0.4]
  major_repair        = 0.20 BDT/km [EST: blended 0.19×0.6 + 0.22×0.4]
  purchase_price      = 76,000 BDT [EST: blended 60k×0.6 + 100k×0.4]
  prior_km            = 30,000 km [EST]
  remaining_life      = 72,500 km [EST: blended 70k×0.6 + 75k×0.4]
  residual            = 9,600 BDT [EST: blended 8k×0.6 + 12k×0.4]
  insurance           = 2,700 BDT/yr [EST: blended]
  BRTA_reg            = 1,500 BDT/yr [EST]
  daily_km            = 100 km [EST]
  working_days        = 310 [EST]
  daily_loaded_km     = 60 km [EST]
  daily_hours         = 12 hrs [EST]
  daily_earnings_tgt  = 620 BDT [EST: blended 600×0.6 + 650×0.4]
  loaded_speed        = 15 km/h [EST]
  empty_speed         = 20 km/h [EST]
  accept_to_board     = 4 min [EST]
  free_wait           = 3 min [EST]
  free_radius         = 1.5 km [EST]
  cap_billable_km     = 2.0 km [LOCKED]
  cap_pct_of_fare     = 40% [LOCKED]
  locked_multiplier   = 0.75 [LOCKED]

DERIVATIONS:
  fuel_cost/km        = 145 / 42.5 = 3.41
  maint_cost/km       = 0.37 + 0.22 + 0.20 = 0.79
  depreciation/km     = (76,000 − 9,600) / 72,500 = 0.92
  annual_km           = 100 × 310 = 31,000
  fixed_cost/km       = (2,700 + 1,500) / 31,000 = 0.14
  operating_cost/km   = 3.41 + 0.79 + 0.92 + 0.14 = 5.26
  time_cost/hr        = 620 / 12 = 51.67
  utilization          = 60 / 100 = 0.60
  trip_rate           = (5.26 × 100 + 51.67 × 12) / 60
                      = (526 + 620) / 60
                      = 1,146 / 60
                      = 19.10 → round to 19.00
  natural_multiplier  = (5.26 + 51.67/20) / (5.26 + 51.67/15)
                      = (5.26 + 2.58) / (5.26 + 3.44)
                      = 7.84 / 8.70
                      = 0.901
  pickup_rate         = 19.00 × 0.75 = 14.25
  base_fare           = 51.67 × (4/60) + 1.00 = 3.44 + 1.00 = 4.44 → 4.45
  wait_rate           = 51.67 / 60 = 0.86
```

---

## 13. Summary of All Corrections from v2

| Item | v2 Value | Final Value | Reason |
|---|---|---|---|
| Car Economy anchor | 800cc | **1000cc** | Locked input (WagonR-class) |
| Car Standard anchor | 1500cc | **1300cc** | Locked input (City/Swift-class) |
| Car Premium anchor | 1800cc | **1500cc** | Locked input (Allion 1.5L) |
| Car fuel model | CNG-converted primary | **Petrol/octane only** | Locked input |
| Octane price (cars) | 145 BDT/L | **145 BDT/L** | Locked (unchanged, but now explicitly uniform) |
| CNG price | 42 BDT/m³ | **43 BDT/m³** | Locked input |
| Fixed cost definition | Included lead package | **Excludes lead package** | Locked correction |
| Trip rate formula | Loaded marginal cost only | **Total daily cost ÷ loaded km** | Structural correction (Section 1) |
| Number of pricing tiers | 7 sub-categories | **5 launch tiers** | Recommendation (Section 7) |
| CNG Auto trip rate | 28.11 | **29.00** | Rental model cross-check (Section 9) |
| Bike fuel efficiency (125cc) | 40 km/L | **42.5 km/L** (blended) | Blended with Economy for merged tier |
| Car fuel efficiency (1300cc) | 12 km/L | **12 km/L** | Unchanged |
| Car fuel efficiency (1500cc) | 9.5 km/L | **9.5 km/L** | Unchanged |

---

## 14. Open Items Requiring Operational Data

| Variable | Current Estimate | Impact if Wrong | Validation Method |
|---|---|---|---|
| **Pickup distance distribution** | p70-p75 ≈ 1.5 km (standard urban) | Directly sets free radius; ±0.5 km shifts pickup fee revenue by ±30% | Measure from pilot dispatch GPS data |
| **Utilization rate** | 60% bikes, 65% cars | ±5% shifts trip rate by ±8% | Measure from driver app telemetry |
| **Daily earnings target** | 600-1,400 BDT | ±20% shifts trip rate by ±10-15% | Structured driver interviews: "minimum to keep doing this" |
| **Vehicle purchase prices** | 60k-1.4M BDT | ±20% shifts depreciation/km by ±20% | Bikroy.com scraping + dealer surveys |
| **CNG daily rental** | 900 BDT/day | ±100 BDT shifts CNG trip rate by ±3 BDT/km | CNG driver interviews at 10+ stations |
| **Fuel efficiency** | 9.5-45 km/L | ±15% shifts trip rate by ±2-5% | Instrument 5 vehicles per category, 2-week fuel tracking |
| **Loaded/empty split** | 60/40 (bikes), 65/35 (cars) | ±5% shifts trip rate by ±5-8% | Driver app telemetry after launch |

**The three highest-leverage variables for fare accuracy are:**
1. Utilization rate (directly divides into trip rate)
2. Daily earnings target (directly multiplies into trip rate)
3. Pickup distance distribution (sets the free radius, which determines pickup fee revenue)

All three require operational data from your platform. The estimates above give you a structurally sound starting point; your Stage 0 dispatch-only baseline will calibrate them.

# v4: Hard Second Pass — Fare Derivation

---

## Error Log (v3 → v4)

| # | Error | Severity | What Happened | Impact |
|---|---|---|---|---|
| 1 | **Trip rate formula computes marginal cost, not amortized cost** | **CRITICAL** | `time/hr ÷ loaded_speed` captures time cost of loaded-driving minutes only. Bike Economy: captures 4 hrs of time cost (200 BDT) out of 12 hrs (600 BDT). Missing 8 hrs of empty + idle time. | Rates 1.6–2.2× too low across all categories |
| 2 | **Multiplier validation compared wrong quantities** | **MATERIAL** | Compared natural multiplier (marginal-cost ratio) to locked multiplier. But trip rate is amortized total cost, not marginal loaded cost. Apples-to-oranges. | Incorrectly flagged all bike/CNG multipliers as "RED" |
| 3 | **CNG Standard P&L arithmetic** | **MATERIAL** | Stated daily operating cost as 1,255. Correct sum: 900 + 189 + 66 = **1,155**. Off by 100. | Incorrectly concluded CNG driver was 46 BDT/day below target; recommended unnecessary rate bump to 29.00 |
| 4 | **"Driver subsidy" framing inverted** | **MODERATE** | Said drivers subsidize pickup km by 15–18%. Pickup rate (13.54) actually exceeds marginal empty cost (7.33) by 85%. Drivers **profit** from pickup km. | Backwards conclusion about who bears pickup cost |
| 5 | **Conservative bias underestimated** | **MODERATE** | Estimated 1.7–3.0% using rough pickup revenue. Distribution-based estimate: 3–9%. | Understated safety margin |

---

## Locked Input Discrepancies (Flagged)

| Discrepancy | Block 1 Value | Block 2 Value | Resolution |
|---|---|---|---|
| Car Economy fuel price | 140 BDT/L (petrol) | 145 BDT/L (octane, "no exceptions") | **Use 145.** Block 2 is later, more explicit, says "no exceptions." |
| CNG price | 40 BDT/m³ (general locked inputs) | 43 BDT/m³ (locked fuel prices) | **Use 43.** Fuel prices section is more specific. |

All values below use: **Octane 145 BDT/L** for all bikes and all cars. **CNG 43 BDT/m³** for CNG-Standard only.

---

## Corrected Cost Tables (All 7 Sub-Categories)

### A. Fuel Cost

| Sub-Category | cc | Efficiency (Dhaka city) | Price | **Fuel/km** |
|---|---|---|---|---|
| Bike Economy | 100 | 45 km/L [EST] | 145 BDT/L | **3.22** |
| Bike Standard | 125 | 40 km/L [EST] | 145 BDT/L | **3.63** |
| Bike Premium | 150 | 33 km/L [EST] | 145 BDT/L | **4.39** |
| CNG Standard | 200 | 4.0 m³/100km [EST] | 43 BDT/m³ | **1.72** |
| Car Economy | 1000 | 13 km/L [EST] | 145 BDT/L | **11.15** |
| Car Standard | 1300 | 12 km/L [EST] | 145 BDT/L | **12.08** |
| Car Premium | 1500 | 9.5 km/L [EST] | 145 BDT/L | **15.26** |

### B. Maintenance & Wear

| Sub-Category | Routine | Tyre | Major Repair | **Total Maint./km** |
|---|---|---|---|---|
| Bike Economy | 0.35 | 0.20 | 0.19 | **0.74** |
| Bike Standard | 0.40 | 0.24 | 0.22 | **0.86** |
| Bike Premium | 0.50 | 0.29 | 0.32 | **1.11** |
| CNG Standard | 0.60 | 0.25 [owner] | 0.32 [owner] | **0.60** (driver pays routine only) |
| Car Economy | 0.50 | 0.40 | 0.18 | **1.08** |
| Car Standard | 0.60 | 0.46 | 0.30 | **1.36** |
| Car Premium | 0.70 | 0.69 | 0.25 | **1.64** |

### C. Depreciation / Rental

| Sub-Category | Ownership | Purchase/Rate | Remaining Life | Residual | **Depr./Rental per km** |
|---|---|---|---|---|---|
| Bike Economy | OWNED | 60,000 [EST] | 70,000 km | 8,000 | **0.74** |
| Bike Standard | OWNED | 100,000 [EST] | 75,000 km | 12,000 | **1.17** |
| Bike Premium | OWNED | 175,000 [EST] | 65,000 km | 20,000 | **2.38** |
| CNG Standard | **RENTED** | **900 BDT/day** [EST] | N/A | N/A | **8.18** (900 ÷ 110) |
| Car Economy | OWNED | 600,000 [EST] | 140,000 km | 60,000 | **3.86** |
| Car Standard | OWNED | 800,000 [EST] | 140,000 km | 100,000 | **5.00** |
| Car Premium | OWNED | 1,400,000 [EST] | 160,000 km | 160,000 | **7.75** |

### D. Fixed Costs (insurance + BRTA only; NO lead package)

| Sub-Category | Daily km | × 310 days | = Annual km | Insurance | BRTA | **Fixed/km** |
|---|---|---|---|---|---|---|
| Bike Economy | 100 | × 310 | = 31,000 | 2,500 | 1,500 | **0.13** |
| Bike Standard | 100 | × 310 | = 31,000 | 3,000 | 1,500 | **0.15** |
| Bike Premium | 90 | × 310 | = 27,900 | 4,000 | 2,000 | **0.22** |
| CNG Standard | 110 | × 310 | = 34,100 | 0 [owner] | 0 [owner] | **0.00** |
| Car Economy | 110 | × 310 | = 34,100 | 15,000 | 5,000 | **0.59** |
| Car Standard | 120 | × 310 | = 37,200 | 22,000 | 7,000 | **0.78** |
| Car Premium | 120 | × 310 | = 37,200 | 32,000 | 8,000 | **1.07** |

### E. Driver Time / Opportunity Cost

| Variable | Bike Econ. | Bike Std. | Bike Prem. | CNG Std. | Car Econ. | Car Std. | Car Prem. |
|---|---|---|---|---|---|---|---|
| Daily hours | 12 | 12 | 12 | 12 | 12 | 12 | 12 |
| Earnings target [EST] | 600 | 650 | 700 | 700 | 900 | 1,100 | 1,400 |
| Daily total km | 100 | 100 | 90 | 110 | 110 | 120 | 120 |
| Daily loaded km | 60 | 60 | 54 | 66 | 72 | 78 | 78 |
| Utilization | 60% | 60% | 60% | 60% | 65% | 65% | 65% |
| Loaded speed [EST] | 15 | 15 | 15 | 13 | 12 | 12 | 12 |
| Empty speed [EST] | 20 | 20 | 20 | 16 | 16 | 16 | 16 |
| **Time cost/hr** | **50.00** | **54.17** | **58.33** | **58.33** | **75.00** | **91.67** | **116.67** |
| Time/km (loaded) | 3.33 | 3.61 | 3.89 | 4.49 | 6.25 | 7.64 | 9.72 |
| Time/km (empty) | 2.50 | 2.71 | 2.92 | 3.65 | 4.69 | 5.73 | 7.29 |

---

## Corrected Fare Derivation

### Step 1: Operating Cost Per Km

```
operating_cost = fuel + maintenance + depreciation + fixed
```

| Sub-Category | Fuel | Maint. | Depr./Rental | Fixed | **OpCost/km** |
|---|---|---|---|---|---|
| Bike Economy | 3.22 | 0.74 | 0.74 | 0.13 | **4.83** |
| Bike Standard | 3.63 | 0.86 | 1.17 | 0.15 | **5.81** |
| Bike Premium | 4.39 | 1.11 | 2.38 | 0.22 | **8.10** |
| CNG Standard | 1.72 | 0.60 | 8.18 | 0.00 | **10.50** |
| Car Economy | 11.15 | 1.08 | 3.86 | 0.59 | **16.68** |
| Car Standard | 12.08 | 1.36 | 5.00 | 0.78 | **19.22** |
| Car Premium | 15.26 | 1.64 | 7.75 | 1.07 | **25.72** |

### Step 2 & 4: Trip Per-Km Rate — Formula Correction

**The user's formula and the corrected formula, side by side:**

```
USER'S FORMULA:
  trip_rate = operating_cost + (time_cost_per_hour ÷ loaded_speed)
  [computes marginal cost per loaded km]

CORRECTED FORMULA:
  trip_rate = (operating_cost × daily_total_km + time_cost_per_hour × daily_hours)
            ÷ daily_loaded_km
  [amortizes full daily cost over loaded km]
```

**Why they differ — worked example (Bike Economy):**

```
USER'S:
  time component = 50.00 ÷ 15 = 3.33 BDT/km
  This captures time cost of 4.0 loaded hours (60 km ÷ 15 km/h).
  Time cost captured: 3.33 × 60 = 200 BDT
  Missing: 400 BDT (8 hours of empty driving + idle waiting)

CORRECTED:
  time component = (50.00 × 12) ÷ 60 = 10.00 BDT/km
  This amortizes all 12 hours of time cost over 60 loaded km.
  Time cost captured: 10.00 × 60 = 600 BDT ✓
```

| Sub-Category | OpCost | User's Rate | **Corrected Rate** | Ratio |
|---|---|---|---|---|
| Bike Economy | 4.83 | 8.16 | **18.05** | 2.21× |
| Bike Standard | 5.81 | 9.42 | **20.52** | 2.18× |
| Bike Premium | 8.10 | 11.99 | **26.46** | 2.21× |
| CNG Standard | 10.50 | 14.99 | **28.11** | 1.88× |
| Car Economy | 16.68 | 22.93 | **37.95** | 1.66× |
| Car Standard | 19.22 | 26.86 | **43.67** | 1.63× |
| Car Premium | 25.72 | 35.44 | **57.52** | 1.62× |

**The user's formula is not "slightly conservative" — it is 1.6–2.2× too low.** At the user's formula rate, Bike Economy drivers would lose 566 BDT/day. No one would renew a subscription.

**Corrected formula derivation (Bike Economy):**
```
trip_rate = (4.83 × 100 + 50.00 × 12) ÷ 60
          = (483 + 600) ÷ 60
          = 1,083 ÷ 60
          = 18.05
```

### Step 3: Empty (Deadhead) Cost Per Km

```
empty_cost = operating_cost + (time_cost_per_hour ÷ empty_speed)
```

| Sub-Category | OpCost | Time/km (empty) | **EmptyCost/km** |
|---|---|---|---|
| Bike Economy | 4.83 | 2.50 | **7.33** |
| Bike Standard | 5.81 | 2.71 | **8.52** |
| Bike Premium | 8.10 | 2.92 | **11.02** |
| CNG Standard | 10.50 | 3.65 | **14.15** |
| Car Economy | 16.68 | 4.69 | **21.37** |
| Car Standard | 19.22 | 5.73 | **24.95** |
| Car Premium | 25.72 | 7.29 | **33.01** |

### Step 5: Pickup Rate — Corrected Validation

**The user's comparison (natural multiplier vs locked multiplier):**

```
natural_multiplier = empty_cost_marginal ÷ loaded_cost_marginal
```

| Sub-Category | EmptyCost | LoadedCost (marginal) | **Natural Mult.** | **Locked Mult.** | Gap |
|---|---|---|---|---|---|
| Bike Economy | 7.33 | 8.16 | **0.898** | 0.75 | +0.148 |
| Bike Standard | 8.52 | 9.42 | **0.904** | 0.75 | +0.154 |
| Bike Premium | 11.02 | 11.99 | **0.919** | 0.75 | +0.169 |
| CNG Standard | 14.15 | 14.99 | **0.944** | 0.80 | +0.144 |
| Car Economy | 21.37 | 22.93 | **0.932** | 0.90 | +0.032 |
| Car Standard | 24.95 | 26.86 | **0.929** | 0.90 | +0.029 |
| Car Premium | 33.01 | 35.44 | **0.931** | 0.90 | +0.031 |

**Why this comparison is misleading:** The natural multiplier is a ratio of two marginal costs. But the locked multiplier is applied to the **trip rate**, which is the amortized total cost per loaded km — 2.2× higher than the marginal loaded cost (for bikes). Comparing the natural multiplier to the locked multiplier mixes two different cost concepts.

**The correct validation: does the pickup rate cover the marginal empty cost?**

```
pickup_rate = trip_rate × locked_multiplier
marginal_empty_cost = operating_cost + time/hr ÷ empty_speed
Check: pickup_rate ≥ marginal_empty_cost?
```

| Sub-Category | Trip Rate | × Locked | **Pickup Rate** | Marginal Empty Cost | **Surplus** | **Surplus %** |
|---|---|---|---|---|---|---|
| Bike Economy | 18.05 | × 0.75 | **13.54** | 7.33 | +6.21 | **+85%** |
| Bike Standard | 20.52 | × 0.75 | **15.39** | 8.52 | +6.87 | **+81%** |
| Bike Premium | 26.46 | × 0.75 | **19.85** | 11.02 | +8.83 | **+80%** |
| CNG Standard | 28.11 | × 0.80 | **22.49** | 14.15 | +8.34 | **+59%** |
| Car Economy | 37.95 | × 0.90 | **34.16** | 21.37 | +12.79 | **+60%** |
| Car Standard | 43.67 | × 0.90 | **39.30** | 24.95 | +14.35 | **+58%** |
| Car Premium | 57.52 | × 0.90 | **51.77** | 33.01 | +18.76 | **+57%** |

**Every category passes.** The pickup rate exceeds the marginal empty cost by 57–85%. Drivers **profit** from every pickup km — they do not subsidize it.

**Why the surplus exists:** The trip rate amortizes the full 12-hour daily time cost over loaded km only. So the trip rate is much higher than the marginal loaded cost. When the locked multiplier is applied to this high trip rate, the resulting pickup rate far exceeds the marginal empty cost. The driver is compensated for idle time through the trip rate, and then also paid for pickup km through the pickup fee. This is not double-counting — it's the natural result of a fare structure where loaded km must carry the full daily cost.

### Step 6: Base Fare

```
base_fare = (time_cost_per_hour × accept_to_board_min ÷ 60) + 1.00 BDT overhead
```

Accept-to-board time: **4 minutes** [EST] (app interaction + calling rider + boarding; excludes driving to pickup).

| Sub-Category | Time/hr | × 4/60 | + 1.00 | **Base Fare** |
|---|---|---|---|---|
| Bike Economy | 50.00 | 3.33 | + 1.00 | **4.33** |
| Bike Standard | 54.17 | 3.61 | + 1.00 | **4.61** |
| Bike Premium | 58.33 | 3.89 | + 1.00 | **4.89** |
| CNG Standard | 58.33 | 3.89 | + 1.00 | **4.89** |
| Car Economy | 75.00 | 5.00 | + 1.00 | **6.00** |
| Car Standard | 91.67 | 6.11 | + 1.00 | **7.11** |
| Car Premium | 116.67 | 7.78 | + 1.00 | **8.78** |

### Step 7: Waiting Rate

```
waiting_rate = time_cost_per_hour ÷ 60
```

| Sub-Category | Time/hr | **Wait Rate (BDT/min)** |
|---|---|---|
| Bike Economy | 50.00 | **0.83** |
| Bike Standard | 54.17 | **0.90** |
| Bike Premium | 58.33 | **0.97** |
| CNG Standard | 58.33 | **0.97** |
| Car Economy | 75.00 | **1.25** |
| Car Standard | 91.67 | **1.53** |
| Car Premium | 116.67 | **1.94** |

### Step 8: Free Waiting Time

| Vehicle Type | **Free Wait** | Rationale |
|---|---|---|
| Bike | **3 min** | Riders expect quick pickup; bikes block traffic if stationary |
| CNG Auto | **3 min** | Same dynamics; autos block more space |
| Car | **5 min** | Riders need time to come down from apartments, cross streets, locate car |

### Step 9: Pickup Fee Parameters

```
free_radius_km  = 1.5 km [EST] — standard urban p70–p75
cap_billable_km = 2.0 km [LOCKED]
cap_pct_of_fare = 40% [LOCKED]
```

---

## Final Output Table — 5 Launch Tiers

### Tier Merging

| Launch Tier | Sub-Categories | Blended Trip Rate | Blending Weights |
|---|---|---|---|
| **Bike** | Economy + Standard | **19.00** | 60/40 (Economy/Standard) |
| **Bike Premium** | Premium only | **26.50** | — |
| **CNG Auto** | Standard only | **28.00** | — |
| **Car** | Economy + Standard | **40.50** | 55/45 (Economy/Standard) |
| **Car Premium** | Premium only | **57.50** | — |

### Derived Fare Components

| Component | Bike (100–125cc) | Bike Premium (150cc) | CNG Auto (200cc) | Car (1000–1300cc) | Car Premium (1500cc) |
|---|---|---|---|---|---|
| **OpCost/km** | 5.24 | 8.10 | 10.50 | 17.79 | 25.72 |
| **Trip Rate (user formula)** | 8.68 | 11.99 | 14.99 | 24.62 | 35.44 |
| **Trip Rate (corrected)** | **19.00** | **26.50** | **28.00** | **40.50** | **57.50** |
| **Natural Multiplier** | 0.900 | 0.919 | 0.944 | 0.931 | 0.931 |
| **Locked Multiplier** | 0.75 | 0.75 | 0.80 | 0.90 | 0.90 |
| **Pickup Rate** | **14.25** | **19.88** | **22.40** | **36.45** | **51.75** |
| **Base Fare** | **4.45** | **4.89** | **4.89** | **6.47** | **8.78** |
| **Wait Rate** | **0.86**/min | **0.97**/min | **0.97**/min | **1.37**/min | **1.94**/min |
| **Free Wait** | 3 min | 3 min | 3 min | 5 min | 5 min |
| **Free Radius** | 1.5 km | 1.5 km | 1.5 km | 1.5 km | 1.5 km |
| **Cap (km)** | 2.0 | 2.0 | 2.0 | 2.0 | 2.0 |
| **Cap (%)** | 40% | 40% | 40% | 40% | 40% |

---

## Multiplier Validation Report (Corrected)

### Framing

The user's framework compares the natural multiplier to the locked multiplier. I present that comparison as requested, then provide the corrected interpretation.

| Tier | Natural Mult. | Locked Mult. | Gap | \|Gap\| > 0.05? | Pickup Rate | Marginal Empty Cost | Pickup ≥ Empty Cost? |
|---|---|---|---|---|---|---|---|
| Bike | 0.900 | 0.75 | +0.150 | **YES** | 14.25 | 7.84 | **YES (+82%)** |
| Bike Premium | 0.919 | 0.75 | +0.169 | **YES** | 19.88 | 11.02 | **YES (+80%)** |
| CNG Auto | 0.944 | 0.80 | +0.144 | **YES** | 22.40 | 14.15 | **YES (+58%)** |
| Car | 0.931 | 0.90 | +0.031 | No | 36.45 | 21.37 | **YES (+71%)** |
| Car Premium | 0.931 | 0.90 | +0.031 | No | 51.75 | 33.01 | **YES (+57%)** |

### Interpretation

**The gap between natural and locked multipliers does NOT mean drivers are shortchanged.** It means the pickup rate is set lower than the natural multiplier would produce — but both rates far exceed the marginal cost of empty driving.

For Bike: the natural multiplier (0.90) would produce a pickup rate of 17.10. The locked multiplier (0.75) produces 14.25. Both exceed the marginal empty cost (7.84). The difference (2.85 BDT/km) is a **rider subsidy** — pickups are cheaper for riders, increasing demand and lead consumption.

**The correct validation question is:** "Does the pickup rate cover the marginal empty cost?" Not: "Does the locked multiplier match the natural multiplier?"

**Answer: Yes, for all tiers, by a margin of 57–82%.** No override needed.

### Recommendation

**Keep all locked multipliers as-is for launch.** The multipliers are structurally sound — they produce pickup rates that generously compensate drivers for deadhead km. The gap between natural and locked multipliers is a deliberate demand-side lever (cheaper pickups → more rides → more leads consumed → higher subscription renewal).

**Post-launch monitoring:** If bike driver renewal rates lag car renewal rates, consider increasing the bike multiplier from 0.75 to 0.85. This would narrow the gap from 0.15 to 0.05, increasing the pickup rate from 14.25 to 16.15 (+1.90 BDT/km). The rider-side cost increase is modest (a 2 km pickup goes from 14.25 to 16.15 — a 13% increase on the pickup fee only).

---

## Sensitivity Table

**Formula:** `Δ_trip_rate = (Δ_fuel_price ÷ fuel_efficiency) ÷ utilization_rate`

| Tier | Fuel Eff. | Util. | Rate @ 135 BDT/L | **Rate @ 145 (base)** | Rate @ 155 | Δ per ±10 | Δ % |
|---|---|---|---|---|---|---|---|
| Bike | 42.5 km/L | 60% | 18.62 | **19.00** | 19.39 | ±0.39 | ±2.0% |
| Bike Premium | 33 km/L | 60% | 25.99 | **26.50** | 27.01 | ±0.51 | ±1.9% |
| CNG Auto | 4.0 m³/100km | 60% | N/A | **28.00** | N/A | N/A | N/A |
| Car | 12.5 km/L | 65% | 39.27 | **40.50** | 41.73 | ±1.23 | ±3.0% |
| Car Premium | 9.5 km/L | 65% | 55.89 | **57.50** | 59.11 | ±1.61 | ±2.8% |

**CNG sensitivity (separate):**

| Δ CNG Price | Rate @ 38 BDT/m³ | **Rate @ 43 (base)** | Rate @ 48 | Δ per ±5 | Δ % |
|---|---|---|---|---|---|
| CNG Auto | 27.45 | **28.00** | 28.55 | ±0.55 | ±2.0% |

**Interpretation:** Fuel price changes of ±10 BDT/L shift trip rates by only 2–3%. The fare formula does not need real-time fuel indexing. Manual quarterly adjustment is sufficient for ±20+ BDT/L changes.

---

## Grouping Recommendation

### Rate Spread Analysis

| Tier Pair | Rate 1 | Rate 2 | Spread | Merge? |
|---|---|---|---|---|
| Bike Economy / Standard | 18.05 | 20.52 | 14% | Yes — with caveat |
| Car Economy / Standard | 37.95 | 43.67 | 15% | Yes — with caveat |

### Merge Impact

**Bike at 19.00 BDT/km:**

| Sub-Category | Cost Floor | Rate | Surplus/(Deficit) | % |
|---|---|---|---|---|
| Bike Economy | 18.05 | 19.00 | +0.95 | +5.3% |
| Bike Standard | 20.52 | 19.00 | −1.52 | −7.4% |

**Car at 40.50 BDT/km:**

| Sub-Category | Cost Floor | Rate | Surplus/(Deficit) | % |
|---|---|---|---|---|
| Car Economy | 37.95 | 40.50 | +2.55 | +6.7% |
| Car Standard | 43.67 | 40.50 | −3.17 | −7.2% |

**The Standard sub-categories in both merged tiers are 7% below their cost floor.** Over a day, this is −91 BDT for Bike Standard and −247 BDT for Car Standard. Over a week: −637 and −1,730 BDT respectively.

### Recommendation

**Launch with 5 tiers, but set merged rates slightly above midpoint to protect Standard drivers:**

| Tier | Midpoint | **Recommended Rate** | Bike/Car Econ. Surplus | Bike/Car Std. Deficit |
|---|---|---|---|---|
| Bike | 19.29 | **19.50** | +8.0% | −5.0% |
| Car | 40.81 | **41.50** | +9.4% | −5.0% |

At these rates, Standard drivers are 5% below cost floor — within the conservative bias of the formula (which overestimates the true cost by 5–8% due to uncredited pickup revenue). Net effect: Standard drivers are approximately at breakeven after pickup revenue is credited.

**Alternative: launch with 7 tiers.** If the 5% deficit for Standard drivers is unacceptable, keep all 7 sub-categories separate. The rider experience is slightly more complex (7 vehicle types instead of 5), but each driver pays exactly their cost-floor rate.

**My recommendation: launch with 5 tiers at the recommended rates (19.50 / 26.50 / 28.00 / 41.50 / 57.50), monitor renewal rates by sub-category, and split back to 7 if Standard driver renewal lags by >5 percentage points versus Economy.**

---

## Conservative Bias Flag

### Source of Bias

The corrected trip rate formula covers the driver's full daily cost from loaded-km revenue alone. It does not credit pickup-fee revenue, which is additional income. This makes the trip rate higher than strictly necessary.

### Pickup Revenue Estimation

**Assumptions (standard urban zone):**
- Pickup distance distribution: p50 = 1.5 km, p75 = 2.5 km, p90 = 4.0 km
- Free radius: 1.5 km
- Average chargeable km per pickup (for pickups beyond free radius): ~0.55 km [EST]
- Fraction of pickups beyond free radius: ~50% [EST]
- Average chargeable km per trip (all trips): 0.50 × 0 + 0.50 × 0.55 = 0.275 km [EST]

Wait — let me use a more careful distribution-based estimate:

| Pickup Distance Range | % of Pickups | Chargeable km | Weighted Chargeable |
|---|---|---|---|
| 0–1.5 km (within free radius) | 50% | 0 | 0 |
| 1.5–2.5 km | 25% | avg 0.5 | 0.125 |
| 2.5–3.5 km | 15% | avg 1.5 | 0.225 |
| 3.5+ km | 10% | capped 2.0 | 0.200 |
| **Average per trip** | | | **0.55 km** |

| Tier | Trips/day | Avg chg. km/trip | Daily chg. km | Pickup Rate | **Daily Pickup Rev.** |
|---|---|---|---|---|---|
| Bike | 8 | 0.55 | 4.4 | 14.63 | **64.37** |
| Bike Premium | 7 | 0.55 | 3.85 | 19.88 | **76.54** |
| CNG Auto | 8 | 0.55 | 4.4 | 22.40 | **98.56** |
| Car | 6 | 0.55 | 3.3 | 37.35 | **123.26** |
| Car Premium | 5 | 0.55 | 2.75 | 51.75 | **142.31** |

### Bias Calculation

```
bias_pct = daily_pickup_revenue ÷ daily_total_cost × 100
```

| Tier | Daily Total Cost | Daily Pickup Rev. | **Conservative Bias** |
|---|---|---|---|
| Bike | 1,144 | 64 | **5.6%** |
| Bike Premium | 1,429 | 77 | **5.4%** |
| CNG Auto | 1,855 | 99 | **5.3%** |
| Car | 3,125 | 123 | **3.9%** |
| Car Premium | 4,487 | 142 | **3.2%** |

### Interpretation

The trip rate is **3–6% higher** than the rate that would produce exact breakeven after pickup revenue is credited. This means:

- **Bike drivers** earn ~5.6% above their daily target (before subscription deduction). At 19.50 BDT/km, daily take-home is ~680 BDT vs. target of 620 BDT. Surplus: ~60 BDT/day.
- **Car drivers** earn ~3.9% above target. At 41.50 BDT/km, daily take-home is ~1,140 BDT vs. target of 990 BDT. Surplus: ~150 BDT/day.

**This is a safe starting bias.** It errs on the side of the driver earning enough, which supports subscription renewal. Once Stage 0 dispatch data calibrates the actual pickup distance distribution, the trip rate can be refined downward by 3–6% if desired.

**No adjustment recommended for launch.** The bias is small, the direction is correct (driver-favorable), and the pickup distance estimate is uncertain. Refine after pilot data.

---

## Daily P&L Cross-Check (All Tiers)

| Component | Bike | Bike Prem. | CNG Auto | Car | Car Prem. |
|---|---|---|---|---|---|
| Trip rate | 19.50 | 26.50 | 28.00 | 41.50 | 57.50 |
| Loaded km/day | 60 | 54 | 66 | 78 | 78 |
| **Trip revenue** | **1,170** | **1,431** | **1,848** | **3,237** | **4,485** |
| Pickup rate | 14.63 | 19.88 | 22.40 | 37.35 | 51.75 |
| Chg. pickup km/day | 4.4 | 3.85 | 4.4 | 3.3 | 2.75 |
| **Pickup revenue** | **64** | **77** | **99** | **123** | **142** |
| **Total revenue** | **1,234** | **1,508** | **1,947** | **3,360** | **4,627** |
| OpCost × total km | 524 | 729 | 1,155 | 2,135 | 3,086 |
| **Take-home** | **710** | **779** | **792** | **1,225** | **1,541** |
| Target | 620 | 700 | 700 | 990 | 1,400 |
| **Surplus** | **+90 (+15%)** | **+79 (+11%)** | **+92 (+13%)** | **+235 (+24%)** | **+141 (+10%)** |

**All tiers show healthy surplus above earnings target (before subscription deduction).** The surplus ranges from 10–24%, with cars showing the largest surplus in absolute terms.

**Note on Car surplus:** The car surplus of 235 BDT/day (24%) is partly because the petrol-only fuel model produces high trip rates. In reality, most Dhaka ride-hail cars are CNG-converted, which would reduce operating costs and allow lower trip rates. The petrol-only model is conservative for cars — it ensures viability even for the minority of petrol-only car drivers.

---

## Example Fare Computations (Verified)

### A. Short hop — Bike, 3 km, 1 min wait, 1.0 km pickup

```
fare_before_pickup = 4.45 + (19.50 × 3) + (0.86 × max(0, 1 − 3))
                   = 4.45 + 58.50 + 0.00 = 62.95

chargeable_pickup = min(max(0, 1.0 − 1.5), 2.0) = 0.00
pickup_fee = 0.00

final_fare = 62.95 BDT
```

Explainable: "You paid for 3 km of bike ride plus a small base charge."

### B. Medium trip — Car, 10 km, 3 min wait, 2.5 km pickup

```
fare_before_pickup = 6.47 + (41.50 × 10) + (1.37 × max(0, 3 − 5))
                   = 6.47 + 415.00 + 0.00 = 421.47

chargeable_pickup = min(max(0, 2.5 − 1.5), 2.0) = 1.0
pickup_fee_raw = 1.0 × 37.35 = 37.35
pickup_fee_cap  = 0.40 × 421.47 = 168.59
pickup_fee = min(37.35, 168.59) = 37.35

final_fare = 421.47 + 37.35 = 458.82 BDT
```

Explainable: "You paid for 10 km of car ride, plus the driver drove 1 km beyond the free pickup zone to reach you."

### C. Cap binds — Bike, 2 km trip, 0 min wait, 3.0 km pickup

```
fare_before_pickup = 4.45 + (19.50 × 2) + 0.00 = 43.45

chargeable_pickup = min(max(0, 3.0 − 1.5), 2.0) = 1.5
pickup_fee_raw = 1.5 × 14.63 = 21.95
pickup_fee_cap  = 0.40 × 43.45 = 17.38
pickup_fee = min(21.95, 17.38) = 17.38   ← cap binds

final_fare = 43.45 + 17.38 = 60.83 BDT
```

The 40% cap binds. Rider pays 61 BDT instead of 65 BDT uncapped. Driver absorbs 4.57 BDT of pickup cost. This is the edge case the cap protects — short trips with long pickups.

### D. Premium long trip — Car Premium, 20 km, 8 min wait, 1.8 km pickup

```
fare_before_pickup = 8.78 + (57.50 × 20) + (1.94 × max(0, 8 − 5))
                   = 8.78 + 1,150.00 + 5.82 = 1,164.60

chargeable_pickup = min(max(0, 1.8 − 1.5), 2.0) = 0.3
pickup_fee_raw = 0.3 × 51.75 = 15.53
pickup_fee_cap  = 0.40 × 1,164.60 = 465.84
pickup_fee = min(15.53, 465.84) = 15.53

final_fare = 1,164.60 + 15.53 = 1,180.13 BDT
```

---

## Complete Input Traceability — Bike Tier (Worked Example)

```
LOCKED INPUTS:
  fuel_price              = 145 BDT/L
  cap_billable_km         = 2.0 km
  cap_pct_of_fare         = 40%
  locked_multiplier       = 0.75
  lead_package            = [NOT INCLUDED — platform revenue decision]
  ownership               = OWNED

ESTIMATED INPUTS [EST]:
  fuel_efficiency         = 42.5 km/L (blended 45×0.6 + 40×0.4)
  routine_maint           = 0.37 BDT/km (blended 0.35×0.6 + 0.40×0.4)
  tyre_cost               = 0.22 BDT/km (blended 0.20×0.6 + 0.24×0.4)
  major_repair            = 0.20 BDT/km (blended 0.19×0.6 + 0.22×0.4)
  purchase_price          = 76,000 BDT (blended 60k×0.6 + 100k×0.4)
  remaining_life          = 72,500 km (blended 70k×0.6 + 75k×0.4)
  residual                = 9,600 BDT (blended 8k×0.6 + 12k×0.4)
  insurance               = 2,700 BDT/yr (blended)
  BRTA_reg                = 1,500 BDT/yr
  daily_km                = 100 km
  working_days            = 310
  daily_loaded_km         = 60 km
  daily_hours             = 12 hrs
  daily_earnings_target   = 620 BDT (blended 600×0.6 + 650×0.4)
  loaded_speed            = 15 km/h
  empty_speed             = 20 km/h
  accept_to_board         = 4 min
  free_wait               = 3 min
  free_radius             = 1.5 km

DERIVATIONS:
  fuel/km                 = 145 ÷ 42.5 = 3.41
  maint/km                = 0.37 + 0.22 + 0.20 = 0.79
  depreciation/km         = (76,000 − 9,600) ÷ 72,500 = 0.92
  annual_km               = 100 × 310 = 31,000  ← cross-check ✓
  fixed/km                = (2,700 + 1,500) ÷ 31,000 = 0.14
  operating_cost/km       = 3.41 + 0.79 + 0.92 + 0.14 = 5.26
  time_cost/hr            = 620 ÷ 12 = 51.67
  utilization             = 60 ÷ 100 = 0.60

  trip_rate               = (5.26 × 100 + 51.67 × 12) ÷ 60
                          = (526 + 620) ÷ 60
                          = 1,146 ÷ 60
                          = 19.10 → round to 19.50 (upward for Standard protection)

  natural_multiplier      = (5.26 + 51.67÷20) ÷ (5.26 + 51.67÷15)
                          = (5.26 + 2.58) ÷ (5.26 + 3.44)
                          = 7.84 ÷ 8.70
                          = 0.901

  pickup_rate             = 19.50 × 0.75 = 14.63
  base_fare               = 51.67 × (4÷60) + 1.00 = 3.44 + 1.00 = 4.44 → 4.45
  wait_rate               = 51.67 ÷ 60 = 0.86

  marginal_empty_cost     = 5.26 + 51.67÷20 = 7.84
  pickup_rate ≥ empty?    = 14.63 ≥ 7.84 → YES (+87%)
```

---

## Summary of All v3 → v4 Corrections

| Item | v3 | v4 | Why |
|---|---|---|---|
| Trip rate formula | User's formula (marginal cost) | **Corrected (amortized total cost)** | User's formula produces rates 1.6–2.2× too low |
| Bike trip rate | 19.00 | **19.50** | Upward adjustment to protect Bike Standard drivers in merged tier |
| Car trip rate | 40.50 | **41.50** | Same rationale for Car Standard drivers |
| CNG trip rate | 29.00 (adjusted up from 28.11) | **28.00** (rounded from 28.11) | v3 adjustment was based on arithmetic error; 28.11 is correct |
| Multiplier validation | Flagged bike/CNG as "RED" | **All tiers PASS** | Correct comparison is pickup rate vs marginal empty cost, not natural vs locked multiplier |
| Driver subsidy framing | "Drivers subsidize pickup km by 15–18%" | **Drivers profit from pickup km by 57–85%** | Pickup rate exceeds marginal empty cost for all tiers |
| Conservative bias | 1.7–3.0% | **3.2–5.6%** | Distribution-based pickup revenue estimate is higher |
| CNG daily operating cost | 1,255 BDT | **1,155 BDT** | Arithmetic correction (900+189+66) |
| CNG driver status | 46 BDT/day below target | **92 BDT/day above target** | Flows from arithmetic correction |
| Car Economy fuel price | 140 BDT/L | **145 BDT/L** | Locked input discrepancy resolved (Block 2 overrides Block 1) |
| CNG price | 42 BDT/m³ | **43 BDT/m³** | Locked input (fuel prices section) |