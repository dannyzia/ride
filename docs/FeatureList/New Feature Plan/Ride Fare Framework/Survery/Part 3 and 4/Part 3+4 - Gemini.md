Here is the strict, computationally hard second pass, adhering purely to the locked framework constraints, excluding platform lead package fees from operating costs, and forcing all cars to Octane as instructed.

### 1. Cost Input & Ownership Breakdown

**Core Structural Assumptions:**

* **Annual Kilometers Formula:** 
$$\text{Annual km} = \text{Daily km} \times \text{Working Days per Year}$$


 (Assumes 300 working days/year `[EST]`).
* **Driver Time Valuation:** Based purely on targeted daily net take-home (after fuel/maint/rental, but *before* platform subscription).
* **Gridlock Speeds `[EST]`:** Bikes: 16 km/h loaded, 18 km/h empty. Cars/CNG: 12 km/h loaded, 14 km/h empty.
* **Ownership Mechanics:** For "Joma" (Rental) tiers, the driver pays a daily fee. This fee is divided by Daily km to form the Capital Cost/km. The vehicle owner pays BRTA/Insurance, so Fixed Cost/km for the driver is zero.

| Tier | Engine / Fuel | Own/Rent | Daily Net Target `[EST]` | Daily km `[EST]` | Annual km | Joma / Depr. `[EST]` | Fixed (BRTA) `[EST]` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Bike Eco** | 100cc (Octane) | Owned | 800 BDT/day | 100 km | 30,000 | 1.00 BDT/km | 0.15 BDT/km |
| **Bike Std** | 125cc (Octane) | Owned | 800 BDT/day | 100 km | 30,000 | 1.22 BDT/km | 0.15 BDT/km |
| **Bike Prem** | 150cc (Octane) | Owned | 1,000 BDT/day | 110 km | 33,000 | 1.50 BDT/km | 0.15 BDT/km |
| **CNG Std** | 200cc (CNG) | Rental | 900 BDT/day | 120 km | 36,000 | 8.33 BDT/km* | 0.00 BDT/km |
| **Car Eco** | 1000cc (Octane) | Rental | 1,200 BDT/day | 120 km | 36,000 | 10.00 BDT/km* | 0.00 BDT/km |
| **Car Std** | 1300cc (Octane) | Rental | 1,200 BDT/day | 120 km | 36,000 | 12.50 BDT/km* | 0.00 BDT/km |
| **Car Prem** | 1500cc (Octane) | Owned | 1,500 BDT/day | 120 km | 36,000 | 10.00 BDT/km | 1.11 BDT/km |

**Derived from estimated Joma: CNG = 1000/day, Car Eco = 1200/day, Car Std = 1500/day.*

---

### 2. Operating & Base Cost Calculations

* **Fuel Locks:** Octane @ 145 BDT/L. CNG @ 43 BDT/m³.
* **Time to Pickup `[EST]`:** 8 minutes (0.133 hours). Covers navigating alleys, phone confirmations, and waiting for the rider.
* **Base Fare Formula:** `(Hourly Time Cost × 0.133) + 5.00 BDT platform overhead`.

| Tier | Fuel Econ `[EST]` | Fuel Cost | Maint `[EST]` | Total OpCost/km | Time Cost/hr | Base Fare (BDT) | Wait Rate (BDT/min) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Bike Eco** | 45 km/L | 3.22 BDT | 1.00 BDT | **5.37 BDT** | 80 BDT | **16.00** | **1.33** |
| **Bike Std** | 40 km/L | 3.63 BDT | 1.20 BDT | **6.20 BDT** | 80 BDT | **16.00** | **1.33** |
| **Bike Prem** | 30 km/L | 4.83 BDT | 1.60 BDT | **8.08 BDT** | 100 BDT | **18.00** | **1.67** |
| **CNG Std** | 25 km/m³ | 1.72 BDT | 1.70 BDT | **11.75 BDT** | 75 BDT | **15.00** | **1.25** |
| **Car Eco** | 10 km/L | 14.50 BDT | 3.50 BDT | **28.00 BDT** | 100 BDT | **18.00** | **1.67** |
| **Car Std** | 8 km/L | 18.13 BDT | 4.00 BDT | **34.63 BDT** | 100 BDT | **18.00** | **1.67** |
| **Car Prem** | 7 km/L | 20.71 BDT | 4.80 BDT | **36.62 BDT** | 125 BDT | **22.00** | **2.08** |

---

### 3. Derived Fare Component Table (The Engine Matrix)

**Formulas Applied:**

* `LoadedCost` = OpCost/km + (Time Cost/hr ÷ Loaded Speed)
* `EmptyCost` = OpCost/km + (Time Cost/hr ÷ Empty Speed)
* `Trip Rate` = LoadedCost/km

| Sub-Category | Loaded Cost/km | Empty Cost/km | Natural Multiplier | Locked Multiplier | Trip Rate (BDT/km) | Pickup Rate (BDT/km) | Free Wait (min) `[EST]` | Free Radius (km) | Cap (km) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Bike Eco** | 10.37 | 9.81 | 0.95 | 0.75 | **10.37** | **7.78** | 3.0 | 1.0 | 2.0 |
| **Bike Std** | 11.20 | 10.64 | 0.95 | 0.75 | **11.20** | **8.40** | 3.0 | 1.0 | 2.0 |
| **Bike Prem** | 14.33 | 13.64 | 0.95 | 0.75 | **14.33** | **10.75** | 3.0 | 1.0 | 2.0 |
| **CNG Std** | 18.00 | 17.11 | 0.95 | 0.80 | **18.00** | **14.40** | 5.0 | 1.2 | 2.0 |
| **Car Eco** | 36.33 | 35.14 | 0.97 | 0.90 | **36.33** | **32.70** | 5.0 | 1.4 | 2.0 |
| **Car Std** | 42.96 | 41.77 | 0.97 | 0.90 | **42.96** | **38.66** | 5.0 | 1.4 | 2.0 |
| **Car Prem** | 47.04 | 45.55 | 0.97 | 0.90 | **47.04** | **42.34** | 5.0 | 1.4 | 2.0 |

*(Cap (%) for all tiers is locked at 40%).*

---

### 4. Multiplier Validation Report

| Tier Group | Natural | Locked | Gap | Status |
| --- | --- | --- | --- | --- |
| **Bikes** | 0.95 | 0.75 | **+0.20** | FLAGGED |
| **CNG** | 0.95 | 0.80 | **+0.15** | FLAGGED |
| **Cars** | 0.97 | 0.90 | **+0.07** | FLAGGED |

**Analysis & Recommendation:** In Dhaka's crippling gridlock, an empty vehicle moves only marginally faster than a loaded one. The driver burns almost identical time (and fuel, due to idling) whether deadheading or carrying a rider, forcing the natural multiplier close to 1.0.

* **Do not override the locked multipliers.** If you price the pickup fee at 95% of the trip rate, riders will abandon the platform due to fare shock. Maintain the locked multipliers, and rely strictly on the dispatch logic to limit dispatch radiuses so drivers aren't subjected to long, under-compensated deadheads.

---

### 5. Fuel Price Sensitivity (±10 BDT)

Because the trip rate is tied directly to `loaded_cost_per_km`, a shift in fuel prices maps directly to the per-km rate based on the vehicle's fuel efficiency.

| Sub-Category | Current Trip Rate | Fuel +10 BDT/L | Fuel -10 BDT/L | Per-km Variance |
| --- | --- | --- | --- | --- |
| **Bike Eco** | 10.37 BDT | 10.59 BDT | 10.15 BDT | **±0.22 BDT** |
| **Bike Std** | 11.20 BDT | 11.45 BDT | 10.95 BDT | **±0.25 BDT** |
| **Bike Prem** | 14.33 BDT | 14.66 BDT | 14.00 BDT | **±0.33 BDT** |
| **CNG Std** | 18.00 BDT | 18.40 BDT | 17.60 BDT | **±0.40 BDT** |
| **Car Eco** | 36.33 BDT | 37.33 BDT | 35.33 BDT | **±1.00 BDT** |
| **Car Std** | 42.96 BDT | 44.21 BDT | 41.71 BDT | **±1.25 BDT** |
| **Car Prem** | 47.04 BDT | 48.47 BDT | 45.61 BDT | **±1.43 BDT** |

---

### 6. Sub-Category Grouping Recommendation

Launch with **4 Categories** to consolidate liquidity:

1. **Bike Regular (11.00 BDT/km):** Merges Eco & Std. A 0.83 BDT/km difference doesn't justify splitting demand.
2. **Bike Premium (14.33 BDT/km):** Standalone tier (150cc).
3. **CNG Auto (18.00 BDT/km):** Standalone tier.
4. **Car (40.00 BDT/km):** Merges Eco and Std (which are effectively Alto/WagonR and Axio/Fit). Given you are forcing an Octane cost model, pricing a micro-hatch at 36 BDT/km against an Axio at 43 BDT/km will simply cause drivers of smaller cars to reject rides. *(Note: Car Premium remains an edge case; consider cutting it entirely for launch to maintain pure focus).*

---

### 7. Conservative Bias Flag

**FLAG:** The derived `Trip Rate` is mathematically conservative (too high).
**Reasoning:** Step 4 sets the `trip_per_km_rate` to equal the `loaded_cost_per_km`. This ensures a driver hits 100% of their net daily earnings target purely from distance driven with a rider. It places zero forward credit on revenue generated by the `pickup_fee`.

* **Magnitude:** In Dhaka, assuming ~60% of trips incur at least 0.5 km of billable pickup fee, the driver will earn an extra 40 to 90 BDT/day. Consequently, the derived trip rates are roughly **5% to 8% higher** than the absolute mathematical floor required to retain the driver.

---

[Current commercial auto-rickshaw pricing in Bangladesh](https://www.youtube.com/watch?v=TY5rQH_lM8g)
This video provides recent market pricing and financing rates for commercial CNG auto-rickshaws, validating the capital cost assumptions required to structure the depreciation and Joma rental model.