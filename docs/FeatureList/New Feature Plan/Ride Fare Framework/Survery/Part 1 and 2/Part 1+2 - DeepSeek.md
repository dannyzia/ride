## Hard 2nd Pass — Revised Dhaka Cost Model

This pass tightens the previous numbers and flags where the model is fragile. Key changes:

- Anchors adjusted to match actual Dhaka fleet medians, not spec-sheet ideals.
- Fuel efficiency and speeds made more conservative for Dhaka gridlock.
- Owner-operator depreciation separated from rental-driver economics.
- Weekly lead package values are still placeholders — treat as the biggest unknown.
- Multiplier validation now ties directly to required loaded per-km rates.

---

## Part 1 — Revised Vehicle Taxonomy

### Question 1 — Confirmation and corrections

The three-tier structure is broadly right. Do not add new sub-categories for launch.

Corrections from first pass:

| Tier | Sub-Category | Typical Dhaka Vehicles | Anchor cc | Fuel Type |
|---|---|---|---|---|
| Bike — Economy | 100cc | Bajaj CT100, TVS Metro, Hero Splendor 100 | **100cc** | Petrol |
| Bike — Standard | 110cc | Honda Livo 110, Bajaj Discover 110, TVS Sport 110 | **110cc** | Petrol |
| Bike — Premium | 150cc | Bajaj Pulsar 150, Yamaha FZS 149, TVS Apache RTR 160 | **150cc** | Octane / Petrol |
| CNG — Standard | 3-wheeler auto | Bajaj RE, Piaggio Ape | **~200cc equivalent** | CNG |
| Car — Economy | Micro/mini hatch | WagonR 1.0, Toyota Vitz 1.0, Alto 800 | **1000cc** | Petrol |
| Car — Standard | Sedan/compact | Toyota Axio/Fielder 1.5, Honda Grace 1.5 | **1500cc** | Octane |
| Car — Premium | Mid-size sedan | Toyota Allion/Premio 1.8, Honda Civic 1.8 | **1800cc** | Octane |

### Question 2 — Anchor decision rationale

- **Bike Standard moved to 110cc**, not 125cc. In Dhaka ride-hail, the 110cc segment is the volume median. 125cc bikes exist but are less common as full-time ride-hail vehicles.
- **Car Economy anchored at 1000cc**, not 800cc. Alto 800s are present, but WagonR 1.0 and Vitz 1.0 dominate the working fleet.
- **Car Premium anchored at 1800cc** even though many Allion/Premio units are 1.5L. The 1.8L anchor prevents the premium tier from collapsing into standard economics.

---

## Part 2 — Revised Per-Sub-Category Cost Survey

All values are mid-2026 Dhaka estimates. Treat as modeling anchors, not final rates.

### A. Fuel Cost

| Sub-Category | City Efficiency | Fuel Price | Fuel Cost/km |
|---|---:|---:|---:|
| Bike — Economy 100cc | 42 km/L (38–45) | 132 BDT/L | **3.14** |
| Bike — Standard 110cc | 40 km/L (35–42) | 132 BDT/L | **3.30** |
| Bike — Premium 150cc | 32 km/L (28–35) | 145 BDT/L | **4.53** |
| CNG — Standard | 20 km/m³ (18–23) | 75 BDT/m³ | **3.75** |
| Car — Economy 1000cc | 10 km/L (9–12) | 132 BDT/L | **13.20** |
| Car — Standard 1500cc | 8.5 km/L (8–10) | 145 BDT/L | **17.06** |
| Car — Premium 1800cc | 7.5 km/L (7–8.5) | 145 BDT/L | **19.33** |

> Real Dhaka city efficiency is materially lower than highway spec. Use these ranges for sensitivity tests.

---

### B. Maintenance & Wear

| Sub-Category | Routine | Tyre | Major Repair | Total |
|---|---:|---:|---:|---:|
| Bike — Economy | 0.60 | 0.20 | 0.30 | **1.10** |
| Bike — Standard | 0.70 | 0.25 | 0.35 | **1.30** |
| Bike — Premium | 0.85 | 0.40 | 0.50 | **1.75** |
| CNG — Standard | 1.50 | 0.30 | 0.70 | **2.50** |
| Car — Economy | 1.80 | 0.40 | 1.20 | **3.40** |
| Car — Standard | 2.00 | 0.55 | 1.50 | **4.05** |
| Car — Premium | 2.80 | 0.80 | 2.00 | **5.60** |

> CNG autos have shorter service intervals due to Dhaka dust and continuous running.

---

### C. Depreciation — Owner-Operator Model Only

| Sub-Category | Used Purchase BDT | Useful Life km | Residual BDT | Dep/km |
|---|---:|---:|---:|---:|
| Bike — Economy | 80,000 | 120,000 | 5,000 | **0.63** |
| Bike — Standard | 120,000 | 150,000 | 8,000 | **0.75** |
| Bike — Premium | 200,000 | 150,000 | 15,000 | **1.23** |
| CNG — Standard | 400,000 | 250,000 | 50,000 | **1.40** |
| Car — Economy | 800,000 | 200,000 | 60,000 | **3.70** |
| Car — Standard | 1,500,000 | 250,000 | 200,000 | **5.20** |
| Car — Premium | 3,000,000 | 250,000 | 400,000 | **10.40** |

> **Critical caveat:** Many Dhaka ride-hail drivers rent vehicles. For rental drivers, replace depreciation with the daily/weekly rental fee. The platform should survey the actual ownership/rental split before locking depreciation into cost logic.

---

### D. Fixed Costs

| Sub-Category | Insurance BDT/yr | Reg/Fitness/Tax BDT/yr | Weekly Lead Package* BDT | Annual km | Fixed/km |
|---|---:|---:|---:|---:|---:|
| Bike — Economy | 2,000 | 1,500 | 500 | 36,000 | **0.82** |
| Bike — Standard | 2,500 | 2,000 | 600 | 36,000 | **0.99** |
| Bike — Premium | 3,000 | 2,500 | 700 | 36,000 | **1.16** |
| CNG — Standard | 4,500 | 3,000 | 900 | 42,000 | **1.29** |
| Car — Economy | 12,000 | 8,000 | 1,200 | 45,000 | **1.83** |
| Car — Standard | 18,000 | 10,000 | 1,500 | 45,000 | **2.36** |
| Car — Premium | 25,000 | 12,000 | 2,000 | 45,000 | **3.13** |

> **Weekly lead package values are placeholders.** Replace with actual package prices. This is the most important missing input — the platform’s entire revenue model depends on it.

---

### E. Driver Time / Opportunity Cost

| Sub-Category | Daily km | Hours/day | Net Target BDT/day | Loaded km/h | Empty km/h | Time BDT/hr | Time/km Loaded | Time/km Empty |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Bike — Economy | 120 | 10 | 700 | 14 | 16 | 70 | **5.00** | **4.38** |
| Bike — Standard | 120 | 10 | 800 | 14 | 16 | 80 | **5.71** | **5.00** |
| Bike — Premium | 120 | 10 | 900 | 14 | 16 | 90 | **6.43** | **5.63** |
| CNG — Standard | 140 | 10 | 1,300 | 12 | 13 | 130 | **10.83** | **10.00** |
| Car — Economy | 150 | 10 | 1,500 | 11 | 12 | 150 | **13.64** | **12.50** |
| Car — Standard | 150 | 10 | 1,800 | 11 | 12 | 180 | **16.36** | **15.00** |
| Car — Premium | 150 | 10 | 2,200 | 11 | 12 | 220 | **20.00** | **18.33** |

> Net target is what the driver needs to take home after all operating costs, including package fees.

---

### F. Pickup Distance Distribution

| Zone Type | p25 | p50 | p75 | p90 | Suggested Free Radius | Suggested Max Billable km |
|---|---:|---:|---:|---:|---:|---:|
| Dense urban core — Gulshan, Motijheel, Old Dhaka | 0.5 | 0.9 | 1.5 | 2.5 | **1.5–1.8 km** | **4 km** |
| Standard urban — Mirpur, Uttara, Mohammadpur | 0.8 | 1.4 | 2.2 | 3.5 | **2.2–2.5 km** | **6 km** |
| Suburban / peripheral — Savar, Tongi, Keraniganj | 1.2 | 2.0 | 3.5 | 5.5 | **3.5 km** | **8–9 km** |

**Global calibration if only one free radius is allowed:** set free radius at **2.2–2.5 km** and cap billable km at **6 km**. The percentage-of-fare backstop should be **20–25%** of `fare_before_pickup`.

---

## Derived Cost Reference and Multiplier Validation

| Sub-Category | Operating Cost/km | Loaded Cost/km | Empty Cost/km | Empty / Loaded |
|---|---:|---:|---:|---:|
| Bike — Economy | 5.69 | 10.69 | 10.07 | 0.94 |
| Bike — Standard | 6.34 | 12.05 | 11.34 | 0.94 |
| Bike — Premium | 8.67 | 15.10 | 14.30 | 0.95 |
| CNG — Standard | 8.94 | 19.77 | 18.94 | 0.96 |
| Car — Economy | 22.13 | 35.77 | 34.63 | 0.97 |
| Car — Standard | 28.67 | 45.03 | 43.67 | 0.97 |
| Car — Premium | 38.46 | 58.46 | 56.79 | 0.97 |

Operating cost = fuel + maintenance + depreciation + fixed cost.  
Loaded cost = operating cost + loaded time cost.  
Empty cost = operating cost + empty time cost.

### What this means for your locked multipliers

Your multipliers are not cost ratios. They are applied to the loaded trip per-km rate. To validate them, use:

> **Required loaded per-km rate = empty cost per km ÷ multiplier**

Using fully loaded empty cost:

| Category | Empty Cost/km | Locked Multiplier | Required Loaded Rate |
|---|---:|---:|---:|
| Bike — Standard | 11.34 | 0.75 | **15.12 BDT/km** |
| CNG — Standard | 18.94 | 0.80 | **23.68 BDT/km** |
| Car — Standard | 43.67 | 0.90 | **48.52 BDT/km** |

If your actual loaded per-km rates are above these values, the multipliers are acceptable.  
If they are below, the pickup fee will undercompensate drivers and damage retention.

Using marginal empty cost instead of fully loaded empty cost gives lower required rates:

| Category | Marginal Empty Cost/km | Required Loaded Rate |
|---|---:|---:|
| Bike — Standard | 10.35 | **13.80 BDT/km** |
| CNG — Standard | 17.65 | **22.06 BDT/km** |
| Car — Standard | 41.31 | **45.90 BDT/km** |

Marginal empty cost = fuel + maintenance + depreciation + empty time cost. This may be the better validation benchmark because fixed costs do not scale with pickup distance.

---

## Top Data Gaps to Close Before Locking

1. **Actual weekly lead package pricing** — this is the single largest unknown.
2. **Actual loaded per-km rates** by sub-category — needed to validate multipliers.
3. **Real pickup distance telemetry** from your own dispatch logs, not external estimates.
4. **Driver ownership vs rental mix** — changes depreciation vs rental fee.
5. **Current fuel prices and annual km** from a 200-driver survey.