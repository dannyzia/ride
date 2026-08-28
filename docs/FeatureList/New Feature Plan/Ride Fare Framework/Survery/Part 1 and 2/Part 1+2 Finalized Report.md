# Finalized Part 1 & 2 Report — Lead Package Excluded from Fixed Cost

## Part 1: Vehicle Taxonomy — LOCKED

| Sub-Category | Anchor cc | Fuel | Status |
|---|---|---|---|
| Bike — Economy | **100cc** | Petrol | 7/7 agree |
| Bike — Standard | **125cc** | Petrol | 6/7 agree |
| Bike — Premium | **150cc** | Petrol | 7/7 agree |
| CNG — Standard | **~200cc equiv.** (Bajaj RE) | CNG | 7/7 agree, cc irrelevant to costing |
| Car — Economy | **1000cc (WagonR-class)** | Fork — see below | 4/7 say 1000cc now dominant, 3/7 say 800cc (Alto) |
| Car — Standard | **1500cc** | Fork — see below | 6/7 agree |
| Car — Premium | **1500cc** (not 1800cc) | Fork — see below | 5/7, cite import-duty cliff — overrides your original 1800cc example |

**Two genuine open items, not resolvable by more model opinions:** Car Economy 800 vs 1000cc, and the car fuel type below. Both need a driver survey, not another LLM pass.

---

## Part 2: Cost Survey — Finalized, Fixed Cost Corrected

### A. Fuel Cost (BDT/km)

| Sub-Category | Efficiency | Price | Fuel Cost/km | Confidence |
|---|---|---|---|---|
| Bike Economy | 45 km/L | 145 BDT/L | **3.22** | High |
| Bike Standard | 40 km/L | 145 BDT/L | **3.63** | High |
| Bike Premium | 33 km/L | 145 BDT/L | **4.39** | High |
| CNG Standard | 20 km/m³ | 40 BDT/m³ | **2.00** | Medium — price band is 38–43, treat as sensitivity var |
| Car Economy | **fork** | — | **2.67 (CNG) / 12.08 (petrol)** | **Unresolved — 4.5x swing** |
| Car Standard | **fork** | — | **3.33 (CNG) / 14.50 (petrol)** | **Unresolved** |
| Car Premium | **fork** | — | **4.00 (CNG) / 18.13 (petrol)** | **Unresolved** |

**This is your single biggest open number.** Mimo, GLM, Gemini, glm5.3 all say CNG/LPG conversion is the operating reality for Dhaka ride-hail cars; Claude and Kimi model petrol as baseline with CNG as a footnote. It's not a modeling-style disagreement — it's a factual question about your actual driver fleet. Costs the model output nothing to answer wrong; costs your fare accuracy everything. **Needs a driver survey question, this week, before Part 3 runs.**

### B. Maintenance & Wear (BDT/km) — converged, usable as-is

| Sub-Category | Total Maint./km |
|---|---|
| Bike Economy | 0.70 |
| Bike Standard | 0.85 |
| Bike Premium | 1.10 |
| CNG Standard | 1.50 |
| Car Economy | 2.50 |
| Car Standard | 3.50 |
| Car Premium | 4.50 |

Mimo's arithmetic correction (tyre costs were under-calculated 2–5x across almost every other model's first pass) is folded in here. Trust this table.

### C. Depreciation (BDT/km) — wide fork, band only

| Sub-Category | Depreciation/km (band) |
|---|---|
| Bike Economy | 0.7 – 1.3 |
| Bike Standard | 0.9 – 1.5 |
| Bike Premium | 1.3 – 2.4 |
| CNG Standard | 1.4 – 2.5 |
| Car Economy | 2.7 – 3.7 |
| Car Standard | 3.8 – 6.8 |
| Car Premium | **3.7 – 11.0 (largest single spread in the whole survey)** |

Car Premium purchase price ranged 1.3M–3.0M BDT across models — that's not a modeling difference, it's people guessing at a real market price. Pull 15–20 real Bikroy.com listings per tier before locking this.

### D. Fixed Cost (BDT/km) — **CORRECTED: lead package removed**

| Sub-Category | Insurance + BRTA/yr | Annual km | **Fixed Cost/km** |
|---|---|---|---|
| Bike Economy | ~4,500 | 32,000 | **0.14** |
| Bike Standard | ~5,000 | 32,000 | **0.16** |
| Bike Premium | ~6,000 | 28,000 | **0.21** |
| CNG Standard | ~10,000 | 38,000 | **0.26** |
| Car Economy | ~22,000 | 38,000 | **0.58** |
| Car Standard | ~33,000 | 40,000 | **0.83** |
| Car Premium | ~43,000 | 40,000 | **1.08** |

Compare to the original models' numbers with lead package baked in (0.59–3.13 BDT/km) — **this line dropped by roughly 50–75% across every category.** That reduction flows straight through to trip_per_km_rate in Part 3, and it's the correction that matters most: it decouples what you charge drivers for leads from what riders pay for the trip, which is the fix you asked for.

### E. Driver Time / Opportunity Cost — genuinely unresolved, not an LLM problem

Loaded speed ranged **6–18 km/h** and daily earnings targets ranged **600–3,200 BDT/day** across the 7 models, with no convergence. This isn't disagreement to argue out — it's the one component that has to come from your own dispatch/GPS data or direct driver interviews. No further model pass fixes it. Flag as **top field-validation priority**, above even fuel type.

### F. Pickup Distance Distribution — already correctly deferred

Every model independently flagged this as unmeasured guesswork, and your own locked framework (Stage 1, §"Free-radius / cap defaults") already schedules a Stage 0 dispatch-only period specifically to harvest this from real telemetry instead of estimates. Don't spend more effort on it via LLM — it's already on the right track in your architecture.

---

## Bottom line

**Locked and usable now:** taxonomy (minus Car Economy cc fork), maintenance table.
**Corrected and usable now:** fixed cost/km, with lead package removed.
**Blocked on your input, not more prompting:** car fuel type (survey question), Car Economy cc (fleet count), vehicle purchase prices (Bikroy pull), driver time/speed (your own telemetry).

Part 3 can run today using the corrected fixed-cost table and a stated assumption for the fuel-type fork (recommend defaulting to CNG-converted as primary, since 4/7 independent models and Bangladesh's fuel economics both point that way) — but the resulting trip_per_km_rate should be labeled provisional until the two blocked items are closed.