## Hard 2nd Pass — Revised Fare Derivation Workbook

### Key corrections applied in this pass

1. **Locked fuel price applied with no exceptions:**  
   - Octane **145 BDT/L** for **all bike tiers and all car tiers**, including Car Economy.  
   - CNG **43 BDT/m³** for **CNG-Standard 3-wheeler only**.  
   - No CNG-converted car model is used.

2. **Fixed cost does not include lead package** — platform lead package is revenue, not a driver operating cost input.

3. **Car Standard anchor = 1300cc**; **Car Premium anchor = 1500cc** — per Bangladesh import-duty cliff, not spec-sheet ideal.

4. **Cross-check enforced:**  
   `annual_km = daily_km × working_days_per_year`  
   with `working_days_per_year = 300`.

5. **CNG Standard modeled as daily rental / “joma”** — rental fee substitutes depreciation.  
   Rental fee: **700 BDT/day** `[EST]`; daily km: **140**.

6. **Car Premium used purchase price increased** to reflect actual 1500cc reconditioned Allion/Premio market: **2,200,000 BDT**.

7. **Bike Standard anchor retained at 125cc** per the original locked taxonomy. If your actual ride-hail bike fleet is predominantly 110cc, shift fuel cost/km down by roughly **0.10–0.15 BDT/km**.

---

## 1. Completed Data Tables

### A. Fuel Cost

| Sub-Category | City Efficiency | Fuel Price | Fuel Cost/km |
|---|---:|---:|---:|
| Bike Economy 100cc | 42 km/L `[EST]` | 145 BDT/L | **3.45** |
| Bike Standard 125cc | 40 km/L `[EST]` | 145 BDT/L | **3.63** |
| Bike Premium 150cc | 32 km/L `[EST]` | 145 BDT/L | **4.53** |
| CNG Standard 200cc equiv | 20 km/m³ `[EST]` | 43 BDT/m³ | **2.15** |
| Car Economy 1000cc | 10 km/L `[EST]` | 145 BDT/L | **14.50** |
| Car Standard 1300cc | 9 km/L `[EST]` | 145 BDT/L | **16.11** |
| Car Premium 1500cc | 8.5 km/L `[EST]` | 145 BDT/L | **17.06** |

---

### B. Maintenance & Wear

| Sub-Category | Routine BDT/km | Tyre BDT/km | Major Repair BDT/km | Total BDT/km |
|---|---:|---:|---:|---:|
| Bike Economy | 0.60 | 0.20 | 0.30 | **1.10** |
| Bike Standard | 0.70 | 0.25 | 0.35 | **1.30** |
| Bike Premium | 0.85 | 0.40 | 0.50 | **1.75** |
| CNG Standard | 1.50 | 0.30 | 0.70 | **2.50** |
| Car Economy | 1.80 | 0.40 | 1.20 | **3.40** |
| Car Standard | 2.00 | 0.55 | 1.50 | **4.05** |
| Car Premium | 2.80 | 0.80 | 2.00 | **5.60** |

---

### C. Ownership, Depreciation / Rental

| Sub-Category | Ownership | Acquisition / Rental | Useful Life | Residual | Dep / Rental per km |
|---|---:|---:|---:|---:|---:|
| Bike Economy | Owned | 80,000 BDT | 120,000 km | 5,000 BDT | **0.63** |
| Bike Standard | Owned | 120,000 BDT | 150,000 km | 8,000 BDT | **0.75** |
| Bike Premium | Owned | 200,000 BDT | 150,000 km | 15,000 BDT | **1.23** |
| CNG Standard | Daily rental | 700 BDT/day `[EST]` | 140 km/day | — | **5.00** |
| Car Economy | Owned | 800,000 BDT | 200,000 km | 60,000 BDT | **3.70** |
| Car Standard | Owned | 1,200,000 BDT | 250,000 km | 120,000 BDT | **4.32** |
| Car Premium | Owned | 2,200,000 BDT | 250,000 km | 200,000 BDT | **8.00** |

> For CNG daily rental, `rental_per_km = 700 / 140 = 5.00`.  
> If the rental fee includes routine maintenance, then CNG maintenance per km would be lower; here we keep maintenance separate as a conservative assumption.

---

### D. Fixed Costs — Lead Package Excluded

**Cross-check equation for every row:**

```
annual_km = daily_km × 300
```

| Sub-Category | Daily km | Working days | Annual km | Insurance BDT/yr | Reg/Fitness/Tax BDT/yr | Fixed Cost/km |
|---|---:|---:|---:|---:|---:|---:|
| Bike Economy | 120 | 300 | 36,000 | 2,000 | 1,500 | **0.10** |
| Bike Standard | 120 | 300 | 36,000 | 2,500 | 2,000 | **0.13** |
| Bike Premium | 120 | 300 | 36,000 | 3,000 | 2,500 | **0.15** |
| CNG Standard | 140 | 300 | 42,000 | 4,500 | 3,000 | **0.18** |
| Car Economy | 150 | 300 | 45,000 | 12,000 | 8,000 | **0.44** |
| Car Standard | 150 | 300 | 45,000 | 18,000 | 10,000 | **0.62** |
| Car Premium | 150 | 300 | 45,000 | 25,000 | 12,000 | **0.82** |

---

### E. Driver Time / Opportunity Cost

| Sub-Category | Daily km | Hours/day | Net Target BDT/day | Loaded km/h | Empty km/h | Time BDT/hr | Time/km Loaded | Time/km Empty |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Bike Economy | 120 | 10 | 700 | 14 | 16 | 70 | **5.00** | **4.38** |
| Bike Standard | 120 | 10 | 800 | 14 | 16 | 80 | **5.71** | **5.00** |
| Bike Premium | 120 | 10 | 900 | 14 | 16 | 90 | **6.43** | **5.63** |
| CNG Standard | 140 | 10 | 1,300 | 12 | 13 | 130 | **10.83** | **10.00** |
| Car Economy | 150 | 10 | 1,500 | 11 | 12 | 150 | **13.64** | **12.50** |
| Car Standard | 150 | 10 | 1,800 | 11 | 12 | 180 | **16.36** | **15.00** |
| Car Premium | 150 | 10 | 2,200 | 11 | 12 | 220 | **20.00** | **18.33** |

---

### F. Pickup Distance Distribution

| Zone Type | p25 | p50 | p75 | p90 | Free Radius Target |
|---|---:|---:|---:|---:|---:|
| Dense urban core | 0.5 | 0.9 | 1.5 | 2.5 | **1.5–1.8 km** |
| Standard urban | 0.8 | 1.4 | 2.2 | 3.5 | **2.2–2.5 km** |
| Suburban / peripheral | 1.2 | 2.0 | 3.5 | 5.5 | **3.5 km** |

**Launch free radius by category `[EST]`:**

| Sub-Category | Free Radius km |
|---|---:|
| All Bike tiers | **1.5** |
| CNG Standard | **2.0** |
| All Car tiers | **2.5** |

---

## 2. Derived Fare Component Table

**Formula chain:**

```
operating_cost_per_km = fuel + maintenance + depreciation/rental + fixed
loaded_cost_per_km   = operating_cost_per_km + time_cost_per_km_loaded
empty_cost_per_km    = operating_cost_per_km + time_cost_per_km_empty

trip_per_km_rate     = loaded_cost_per_km
natural_multiplier   = empty_cost_per_km / loaded_cost_per_km
locked_pickup_rate   = trip_per_km_rate × locked_multiplier
```

| Sub-Category | OpCost/km | LoadedCost/km | EmptyCost/km | Natural Mult | Locked Mult | Trip Rate BDT/km | Pickup Rate BDT/km | Base Fare BDT | Wait Rate BDT/min | Free Wait min | Free Radius km | Cap km | Cap % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Bike Economy 100cc | 5.28 | 10.28 | 9.66 | 0.940 | 0.75 | **10.28** | **7.71** | **15.83** | **1.17** | 3 | 1.5 | 2.0 | 40% |
| Bike Standard 125cc | 5.81 | 11.52 | 10.81 | 0.938 | 0.75 | **11.52** | **8.64** | **16.67** | **1.33** | 3 | 1.5 | 2.0 | 40% |
| Bike Premium 150cc | 7.66 | 14.09 | 13.29 | 0.943 | 0.75 | **14.09** | **10.57** | **17.50** | **1.50** | 3 | 1.5 | 2.0 | 40% |
| CNG Standard 200cc | 9.83 | 20.66 | 19.83 | 0.960 | 0.80 | **20.66** | **16.53** | **27.33** | **2.17** | 3 | 2.0 | 2.0 | 40% |
| Car Economy 1000cc | 22.04 | 35.68 | 34.54 | 0.968 | 0.90 | **35.68** | **32.11** | **30.00** | **2.50** | 5 | 2.5 | 2.0 | 40% |
| Car Standard 1300cc | 25.10 | 41.46 | 40.10 | 0.967 | 0.90 | **41.46** | **37.31** | **34.00** | **3.00** | 5 | 2.5 | 2.0 | 40% |
| Car Premium 1500cc | 31.48 | 51.48 | 49.81 | 0.968 | 0.90 | **51.48** | **46.33** | **39.33** | **3.67** | 5 | 2.5 | 2.0 | 40% |

---

## 3. Multiplier Validation Report

| Sub-Category | Natural Mult | Locked Mult | Gap | Natural Pickup Rate | Locked Pickup Rate | Flag |
|---|---:|---:|---:|---:|---:|---|
| Bike Economy | 0.940 | 0.75 | **-0.19** | 9.66 | 7.71 | ❗ Gap > 0.05 |
| Bike Standard | 0.938 | 0.75 | **-0.19** | 10.81 | 8.64 | ❗ Gap > 0.05 |
| Bike Premium | 0.943 | 0.75 | **-0.19** | 13.29 | 10.57 | ❗ Gap > 0.05 |
| CNG Standard | 0.960 | 0.80 | **-0.16** | 19.83 | 16.53 | ❗ Gap > 0.05 |
| Car Economy | 0.968 | 0.90 | **-0.07** | 34.54 | 32.11 | ❗ Gap > 0.05 |
| Car Standard | 0.967 | 0.90 | **-0.07** | 40.10 | 37.31 | ❗ Gap > 0.05 |
| Car Premium | 0.968 | 0.90 | **-0.07** | 49.81 | 46.33 | ❗ Gap > 0.05 |

### Interpretation

The locked pickup multipliers are lower than the natural deadhead-cost ratio for every category. That is acceptable **only if** the pickup fee is understood as partial deadhead compensation, not full reimbursement.

- **Bikes** are the most under-compensated relative to natural cost: locked 0.75 vs natural 0.94.
- **CNG** gap is 0.16.
- **Cars** gap is 0.07 — closest to natural.

### Recommendation

Do **not** override the locked multipliers before launch. The locked design intentionally prices pickup minutes against category earnings, not full cost. Instead:

1. Monitor long-pickup acceptance rates and driver complaints by category.
2. If bike or CNG retention suffers specifically on long-pickup trips, introduce sub-category pickup overrides only after Stage 0 telemetry.
3. A non-rate adjustment that can help: increase free radius for bikes from 1.5 to 1.8 km or CNG from 2.0 to 2.3 km before touching multipliers.

---

## 4. Sensitivity Table — Fuel Price ±10 BDT

| Sub-Category | Current Trip Rate | Trip Rate at +10 BDT | Trip Rate at -10 BDT | Change per km |
|---|---:|---:|---:|---:|
| Bike Economy | 10.28 | 10.52 | 10.04 | 0.24 |
| Bike Standard | 11.52 | 11.77 | 11.27 | 0.25 |
| Bike Premium | 14.09 | 14.40 | 13.78 | 0.31 |
| CNG Standard | 20.66 | 21.16 | 20.16 | 0.50 |
| Car Economy | 35.68 | 36.68 | 34.68 | 1.00 |
| Car Standard | 41.46 | 42.57 | 40.35 | 1.11 |
| Car Premium | 51.48 | 52.66 | 50.30 | 1.18 |

**Sensitivity driver:**  
`fuel_delta = 10 ÷ city_efficiency`  
For CNG, units are BDT/m³; for all others, BDT/L.

**Implication:**  
Car fares are roughly **4× more sensitive** to octane price movements than bike fares. If fuel prices move more than ±10 BDT, the engine should recompute trip rates automatically using the formula chain above.

---

## 5. Recommendation on Grouping

Derived trip rates:

| Category | Trip Rate BDT/km |
|---|---:|
| Bike Economy | 10.28 |
| Bike Standard | 11.52 |
| Bike Premium | 14.09 |
| CNG Standard | 20.66 |
| Car Economy | 35.68 |
| Car Standard | 41.46 |
| Car Premium | 51.48 |

### Recommendation: Launch with 6 fare tiers, not 7

| Launch Tier | Composition | Reason |
|---|---|---|
| **Bike** | Merge Bike Economy + Bike Standard | Gap only 1.24 BDT/km (~11%). Riders will not perceive a meaningful price/quality difference. Use one merged Bike rate. |
| **Bike Premium** | Keep separate | Gap vs merged Bike is ~2.6–3.8 BDT/km; meaningful for riders who want better bike quality. |
| **CNG Standard** | Keep separate | Unique vehicle type and cost structure. |
| **Car Economy** | Keep separate | Entry car option; gap vs CNG and Car Standard is large. |
| **Car Standard** | Keep separate | Gap vs Car Economy is ~5.8 BDT/km. |
| **Car Premium** | Keep separate | Gap vs Car Standard is ~10.0 BDT/km. |

- **Do not merge Car Economy and Car Standard** — gap too large.
- **Do not merge Car Standard and Car Premium** — gap too large.
- **Do not merge Bike Premium into Bike** — meaningful product difference remains.

If you want even simpler rider UX later, a **3-tier launch** would be: Bike, CNG, Car — but this would require averaging within cars and bikes, which may distort driver economics. The 6-tier structure is the recommended balance.

---

## 6. Conservative Bias Flag

The trip per-km rate is deliberately set equal to `loaded_cost_per_km`, which includes the **full daily net earnings target**. The pickup fee is additional revenue, but the derivation does **not** credit it against the driver’s target.

### Estimated conservative bias

Assumptions:  
- Average trip length: **5 km** `[EST]`
- Average chargeable pickup km: **bikes 0.3 km, CNG 0.5 km, cars 0.5 km** `[EST]`

| Sub-Category | Avg Pickup Fee/Trip | Reduction in Trip Rate if Credited | Current Trip Rate | Bias |
|---|---:|---:|---:|---:|
| Bike Economy | 2.31 BDT | 0.46 BDT/km | 10.28 | **~4.5%** |
| Bike Standard | 2.59 BDT | 0.52 BDT/km | 11.52 | **~4.5%** |
| Bike Premium | 3.17 BDT | 0.63 BDT/km | 14.09 | **~4.5%** |
| CNG Standard | 8.27 BDT | 1.65 BDT/km | 20.66 | **~8.0%** |
| Car Economy | 16.06 BDT | 3.21 BDT/km | 35.68 | **~9.0%** |
| Car Standard | 18.66 BDT | 3.73 BDT/km | 41.46 | **~9.0%** |
| Car Premium | 23.17 BDT | 4.63 BDT/km | 51.48 | **~9.0%** |

### How to use this

The current trip rates are **conservative by roughly 4–9%**. This is a safe launch bias — it errs toward driver earnings.

After Stage 0 data exists, the engine should recompute:

```
adjusted_trip_rate = loaded_cost_per_km - (avg_pickup_fee_per_trip / avg_trip_km)
```

This removes the conservative bias without underpaying drivers.

---

## 7. Explicit Answers to Questions

### Question 3 — Average accept-to-pickup time in Dhaka

**Answer:**  
`[EST]` **5 minutes for bikes, 8 minutes for CNG and cars.**  
This includes app interaction, route identification, and finding the rider in dense traffic or narrow lanes. It does not include the actual pickup distance driving time, which is priced separately through the pickup fee.

### Question 4 — Reasonable free waiting grace period

**Answer:**  
`[EST]` **3 minutes for bikes and CNG, 5 minutes for cars.**  
Riders in Dhaka often need to walk from inside a building or market to the pickup point, and cars may wait longer in congested pickup zones. After this grace period, the waiting rate should charge per minute.

---

## Final Note

All derived values are modeling anchors. Replace `[EST]` values with live dispatch telemetry and driver surveys as soon as Stage 0 data is available. The formula chain is designed so that any input change — fuel price, time cost, annual km — can be recomputed automatically without changing the locked fare architecture.