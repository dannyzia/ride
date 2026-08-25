# Dhaka Ride-Hail Fare Model — Vehicle Taxonomy & Cost Survey (v2)

**Purpose:** Calibrate `pickup_per_km_rate`, `trip_per_km_rate`, category multipliers, free radius, and billable caps against real Dhaka operating economics.

## Changelog from v1 (this pass)

1. **CNG price corrected: 43 → 38 BDT/m³.** 43 was an unsourced guess; 38 BDT/m³ is BERC's current officially set rate. Flag: a CNG station-owners' association is actively lobbying for a ~61% hike to ~47.50 BDT/m³ — not in effect, but close enough to warrant a sensitivity check before you lock rates for more than a few months.
2. **Fixed a real arithmetic inconsistency in Part E.** v1 paired car speeds of 12–14 km/h with daily distances of 180–200 km on an 11-hour shift — physically impossible (11h × 14km/h = 154km ceiling, even at zero idle time). Rebuilt the whole speed/hours/daily-km triangle so it's internally consistent, and made the "days worked per year" assumption explicit so Part D and Part E now agree with each other (they didn't in v1 — annual-km denominators were disconnected from the daily-km figures).
3. **Differentiated bike earnings targets by tier** instead of using one flat number for all three (v1 shortcut).
4. Downstream recompute: fixed-cost/km and driver-time-cost/km numbers changed accordingly. Maintenance and depreciation tables were checked and are unchanged — no errors found there.

**Sourcing note (unchanged):** Fuel prices are grounded in current published rates. Everything else — vehicle prices, maintenance, depreciation, driver-time, pickup distances — is not publicly tabulated anywhere in Bangladesh; there's no BRTA cost-of-operation dataset. These remain reasoned estimates to validate against real driver interviews before locking the fare card.

---

## Part 1: Vehicle Taxonomy

*(Unchanged from v1 — re-checked, no errors found.)*

### Question 1 — Corrections to the sub-category list

1. **The car tiers as originally listed misdescribe the Dhaka fleet.** Indian-market Suzuki Alto/WagonR and Tata Tiago are rare here — Bangladesh's car market runs almost entirely on used, reconditioned right-hand-drive Japanese imports. The realistic economy tier is **Toyota Vitz / Passo / Probox**, not Alto/WagonR. Corrected below.
2. **A missing tier:** 7-seat MPVs (Toyota Noah/Voxy) are an emerging "Car — XL/Family" booking category (group/airport trips). Worth adding as a fifth car tier if XL is on your roadmap — not built out here since it wasn't asked for.

Everything else — three bike tiers, single CNG tier, three-tier car split — matches Dhaka's real ride-hail fleet. I would not split CNG further; the Bajaj RE / Piaggio Ape (~175–200cc) is genuinely standardized.

### Question 2 — Standard cc to anchor the cost model

| Tier | Sub-Category | Typical Dhaka Vehicles (corrected) | Standard cc to Model | Fuel Type |
|---|---|---|---|---|
| Bike — Economy | 80–100cc | Bajaj CT100, Honda Livo, TVS Metro | **100cc** | Petrol/Octane |
| Bike — Standard | 110–125cc | Honda CB Shine, Bajaj Pulsar 125, TVS Apache RTR 125 | **125cc** | Petrol/Octane |
| Bike — Premium | 150cc+ | Bajaj Pulsar 150, Yamaha FZS-FI, Honda Hornet 2.0 | **150cc** | Petrol/Octane |
| CNG — Standard | 3-wheeler auto | Bajaj RE, Piaggio Ape | **~199cc** (Bajaj RE 198.88cc is the fleet standard) | CNG |
| Car — Economy | Micro/mini hatch | **Toyota Vitz, Toyota Passo, Toyota Probox** | **1,000cc** | Petrol/CNG (dual-fuel conversion common) |
| Car — Standard | Hatchback/sedan | Toyota Axio, Honda Fit, Suzuki Swift | **1,500cc** | Petrol/Octane (CNG-converted for a large minority) |
| Car — Premium | Mid-size sedan | Toyota Allion/Premio, Honda City, Nissan Sylphy | **1,800cc** | Petrol/Octane |

A meaningful share of standard- and even premium-tier sedans run CNG conversion, since the per-km cost gap is too large for a full-time driver to ignore. Modeled CNG as primary fuel for Car–Economy and Car–Standard below; Car–Premium modeled on octane with a CNG-converted alternative shown for comparison, since this is the single largest unresolved fuel-mix uncertainty.

---

## Part 2: Per-Sub-Category Cost Survey

### A. Fuel Cost

Octane: **145 BDT/L** (BPC retail, current). CNG: **38 BDT/m³** (BERC-set rate, current — see changelog re: pending hike proposal).

| Sub-Category | Fuel Efficiency (Dhaka gridlock) | Fuel Price | Fuel Cost/km |
|---|---|---|---|
| Bike — Economy (100cc) | 45 km/L | 145 BDT/L | **3.22 BDT/km** |
| Bike — Standard (125cc) | 42 km/L | 145 BDT/L | **3.45 BDT/km** |
| Bike — Premium (150cc) | 38 km/L | 145 BDT/L | **3.82 BDT/km** |
| CNG — Standard | 18 km/m³ | 38 BDT/m³ | **2.11 BDT/km** |
| Car — Economy (CNG dual-fuel) | 12 km/m³ | 38 BDT/m³ | **3.17 BDT/km** |
| Car — Standard (CNG dual-fuel) | 10 km/m³ | 38 BDT/m³ | **3.80 BDT/km** |
| Car — Premium (octane) | 7.5 km/L | 145 BDT/L | **19.33 BDT/km** |
| Car — Premium (if CNG-converted, alt.) | 8 km/m³ | 38 BDT/m³ | **4.75 BDT/km** |

The octane-vs-CNG assumption for premium cars still swings per-km fuel cost by ~14.6 BDT — this remains the single biggest number to nail down with driver interviews before setting the premium per-km rate.

**Cross-check on CNG auto efficiency:** manufacturer-quoted mileage for the Bajaj RE CNG is ~40–45 km/kg on the road. Converting kg→m³ (Bangladesh CNG density ≈0.72–0.75 kg/Nm³) gives ~30–34 km/m³ under favorable conditions; Dhaka gridlock typically derates that by 40–50% due to idling and stop-start use, landing around 16–20 km/m³. The 18 km/m³ used above sits inside that band — reasonably grounded, not a pure guess.

### B. Maintenance & Wear (BDT/km)

*Unchanged from v1 — re-checked, arithmetic confirmed correct.*

| Sub-Category | Routine Maintenance | Tyre Cost | Major Repair Reserve | **Total Maintenance/km** |
|---|---|---|---|---|
| Bike — Economy | 0.35 | 0.15 | 0.20 | **0.70** |
| Bike — Standard | 0.40 | 0.18 | 0.25 | **0.83** |
| Bike — Premium | 0.50 | 0.22 | 0.35 | **1.07** |
| CNG — Standard | 0.60 | 0.35 | 0.55 | **1.50** |
| Car — Economy | 1.20 | 0.60 | 1.00 | **2.80** |
| Car — Standard | 1.50 | 0.75 | 1.30 | **3.55** |
| Car — Premium | 2.00 | 1.00 | 1.80 | **4.80** |

### C. Depreciation

*Unchanged from v1 — arithmetic confirmed correct. Life-in-years now cross-checked against the corrected annual-km figures in Part D (see note below each block).*

| Sub-Category | Used Purchase Price | Useful Life | Residual Value | **Depreciation/km** | Implied years to reach useful life* |
|---|---|---|---|---|---|
| Bike — Economy | 130,000 BDT | 80,000 km | 25,000 BDT | **1.31 BDT/km** | 2.2 yrs |
| Bike — Standard | 165,000 BDT | 90,000 km | 35,000 BDT | **1.44 BDT/km** | 2.5 yrs |
| Bike — Premium | 220,000 BDT | 100,000 km | 50,000 BDT | **1.70 BDT/km** | 2.8 yrs |
| CNG — Standard | 280,000 BDT | 150,000 km | 70,000 BDT | **1.40 BDT/km** | 3.8 yrs |
| Car — Economy | 1,000,000 BDT | 250,000 km | 300,000 BDT | **2.80 BDT/km** | 6.2 yrs |
| Car — Standard | 1,500,000 BDT | 280,000 km | 450,000 BDT | **3.75 BDT/km** | 6.4 yrs |
| Car — Premium | 2,200,000 BDT | 300,000 km | 700,000 BDT | **5.00 BDT/km** | 6.7 yrs |

*\*Using Part D's corrected annual-km figures. The car "years to useful life" numbers (6.2–6.7 yrs) run a bit long for vehicles in continuous ride-hail duty — worth checking whether Dhaka drivers actually hold cars that long or turn over faster (which would raise depreciation/km). This is now flagged as a genuine open question rather than silently inconsistent.*

### D. Fixed Costs (amortized per km)

**Explicit working assumption (new in this pass):** drivers work **~300 days/year** (roughly 6 days/week, minus Eid and illness). This is now the shared link between Part D's annual-km figures and Part E's daily-km figures — in v1 these two tables weren't reconciled against each other.

| Sub-Category | Annual Insurance | Annual Reg./Fitness/Tax | Annual Lead Package | Annual km (120–150/day × 300 days) | **Fixed Cost/km** |
|---|---|---|---|---|---|
| Bike — Economy | 3,000 BDT | 2,500 BDT | 15,600 BDT (300/wk) | 36,000 km | **0.59 BDT/km** |
| Bike — Standard | 3,500 BDT | 2,500 BDT | 15,600 BDT (300/wk) | 36,000 km | **0.60 BDT/km** |
| Bike — Premium | 5,000 BDT | 2,500 BDT | 15,600 BDT (300/wk) | 36,000 km | **0.64 BDT/km** |
| CNG — Standard | 6,000 BDT | 5,000 BDT | 20,800 BDT (400/wk) | 39,000 km | **0.82 BDT/km** |
| Car — Economy | 15,000 BDT | 12,000 BDT | 31,200 BDT (600/wk) | 40,500 km | **1.44 BDT/km** |
| Car — Standard | 20,000 BDT | 15,000 BDT | 39,000 BDT (750/wk) | 43,500 km | **1.70 BDT/km** |
| Car — Premium | 28,000 BDT | 20,000 BDT | 46,800 BDT (900/wk) | 45,000 km | **2.11 BDT/km** |

Weekly lead-package figures remain placeholders scaled to category earnings power — replace with your actual planned pricing the moment it's set, since that line is entirely your own decision, not a market fact.

### E. Driver Time / Opportunity Cost — rebuilt for internal consistency

**What changed:** v1's car speeds (12/14 km/h) and daily distances (180–200 km) were mutually impossible on an 11-hour shift. Rebuilt with speeds of 13/15 km/h (still firmly gridlock, not free-flow — a small, defensible bump from 12/14, not enough alone to explain 180km) and daily distances brought down to what those speeds can actually sustain at realistic utilization (82–91% of the theoretical driving-time ceiling, leaving room for wait time between rides). Bike earnings targets are now split by tier.

| Sub-Category | Working Hrs/Day | Daily Net Earnings Target | Daily km | Speed Loaded | Speed Empty | Driving-time ceiling† | Utilization | Time Cost/hr | **Time Cost/km (loaded)** | **Time Cost/km (empty)** |
|---|---|---|---|---|---|---|---|---|---|---|
| Bike — Economy | 10 | 1,100 BDT | 120 km | 18 km/h | 20 km/h | 200 km | 60% | 110 BDT/hr | **6.11 BDT/km** | **5.50 BDT/km** |
| Bike — Standard | 10 | 1,250 BDT | 120 km | 18 km/h | 20 km/h | 200 km | 60% | 125 BDT/hr | **6.94 BDT/km** | **6.25 BDT/km** |
| Bike — Premium | 10 | 1,400 BDT | 120 km | 18 km/h | 20 km/h | 200 km | 60% | 140 BDT/hr | **7.78 BDT/km** | **7.00 BDT/km** |
| CNG — Standard | 10 | 1,800 BDT | 130 km | 14 km/h | 16 km/h | 160 km | 81% | 180 BDT/hr | **12.86 BDT/km** | **11.25 BDT/km** |
| Car — Economy | 11 | 2,200 BDT | 135 km | 13 km/h | 15 km/h | 165 km | 82% | 200.0 BDT/hr | **15.38 BDT/km** | **13.33 BDT/km** |
| Car — Standard | 11 | 2,600 BDT | 145 km | 13 km/h | 15 km/h | 165 km | 88% | 236.4 BDT/hr | **18.18 BDT/km** | **15.76 BDT/km** |
| Car — Premium | 11 | 3,200 BDT | 150 km | 13 km/h | 15 km/h | 165 km | 91% | 290.9 BDT/hr | **22.38 BDT/km** | **19.39 BDT/km** |

†Ceiling = working hours × empty (max) speed — i.e. the absolute most km a driver could cover with zero idle/waiting time. Utilization = daily km ÷ ceiling. All rows now sit below 100%, unlike v1. Car-tier utilization (82–91%) is on the high side — it implies relatively little idle time between rides, which is optimistic for a two-sided marketplace with any dispatch friction. If real driver interviews show more idle time than this, either daily-km targets need to come down further or the underlying earnings targets are unrealistic for the traffic conditions — this is worth checking early since it feeds directly into whether your locked fare formula can plausibly deliver the net income drivers need.

### F. Pickup Distance Distribution (per zone type)

*Unchanged — still the least evidence-based table in this survey and still the top validation priority.*

| Zone Type | p25 | p50 | p75 | p90 |
|---|---|---|---|---|
| Dense urban core (Gulshan, Motijheel, Old Dhaka) | 0.8 km | 1.5 km | 2.5 km | 3.8 km |
| Standard urban (Mirpur, Uttara, Mohammadpur) | 1.2 km | 2.2 km | 3.5 km | 5.0 km |
| Suburban / peripheral (Savar, Tongi, Keraniganj) | 2.0 km | 3.5 km | 5.5 km | 8.0 km |

A single global free radius will systematically underserve suburban drivers and overpay dense-core ones unless zone-differentiated — this table is what determines that trade-off, and it's pure estimate. Prioritize a real two-week dispatch-log pilot in one zone of each type before finalizing `free_radius_km` and `cap_billable_km`.

---

## Priority order for field validation (updated)

1. **Pickup distance distribution (Part F)** — sets free radius/cap directly; zero real data behind it.
2. **Car time-cost utilization (Part E, new flag)** — 82–91% utilization assumes little dispatch friction; if wrong, it changes whether your locked fare formula can deliver driver take-home targets at all.
3. **Car–Premium fuel type (Part A)** — ~14.6 BDT/km swing between octane and CNG-converted.
4. **Pending CNG price hike (38 → possible ~47.50 BDT/m³)** — a live regulatory risk, not hypothetical; worth a rate-sensitivity pass on the fare card now rather than after it lands.
5. **Car depreciation life-in-years (Part C, new flag)** — 6.2–6.7 years may be longer than real driver vehicle turnover; check against actual fleet age data if available.
