# Second Pass — Hard Revision of Cost Model

---

## What Was Wrong in v1 (Error Log)

Before presenting corrections, here is an honest accounting of what the first pass got wrong:

| Error | Severity | Impact |
|---|---|---|
| **Tyre costs arithmetically wrong** — I divided total tyre cost by wrong denominator or simply mis-calculated. Every tyre cost per km was understated by 2–4x. | **Critical** | Understated maintenance by 0.08–0.64 BDT/km per category |
| **Cars modeled on petrol** — v1 used petrol/octane fuel costs for standard and premium cars. In reality, the overwhelming majority of Dhaka ride-hail cars are CNG-converted. | **Critical** | Overstated car fuel cost by 3–5x |
| **Vehicle useful life too generous** — v1 assumed vehicles are bought new-ish and run to mechanical death. Dhaka ride-hail drivers buy used vehicles with significant prior mileage. | **Material** | Understated depreciation per km by 15–40% |
| **Uniform speed across vehicle types** — v1 used 12–13 km/h loaded for all categories. Bikes filter through Dhaka traffic; cars do not. | **Moderate** | Distorted driver time cost per km between categories |
| **Annual km not cross-checked against daily km** — v1's annual km figures didn't cleanly derive from daily km × working days. | **Minor** | Slightly distorted fixed cost per km |
| **CNG queue time omitted** — CNG-converted cars spend 45–90 min/day in fuel station queues. This is a real opportunity cost. | **Moderate** | Understated car operating cost by 0.5–1.0 BDT/km |
| **Lead package weekly estimates inconsistent with stated tiers** — v1 used round numbers without anchoring to a coherent package structure. | **Minor** | Small fixed cost distortion |

The tyre cost error alone cascades through the entire model. The CNG fuel model change transforms the car economics. These are not rounding adjustments — they change the shape of the cost curves.

---

## Part 1: Vehicle Taxonomy (Revised)

### Sub-Category Confirmation

The seven sub-categories from v1 hold. No merges, no additions for launch. Specific notes:

**Bike — Economy (100cc, anchor: 100cc):** Confirmed. The Bajaj CT100 (102cc) and TVS Metro (99.7cc) are the mode. This is the largest bike ride-hail segment in Dhaka.

**Bike — Standard (125cc, anchor: 125cc):** Confirmed. Honda CB Shine (124cc) and Bajaj Pulsar 125 (124.4cc). Growing segment as drivers upgrade from economy.

**Bike — Premium (150cc+, anchor: 150cc):** Confirmed but thin. The Bajaj Pulsar 150 (149.5cc) anchors this tier. Bikes above 150cc (200cc, 250cc like the Cyclone Carrera) are rare in ride-hail and should not pull the anchor upward.

**CNG — Standard (3-wheeler, anchor: ~200cc equivalent):** Confirmed. The Bajaj RE (198.88cc) is the de facto standard. Fairly homogeneous fleet.

**Car — Economy (micro/mini hatch, anchor: 800cc):** Confirmed. The Maruti Alto 800 dominates. The WagonR (998cc) is second. Anchor at 800cc.

**Car — Standard (hatchback/sedan, anchor: 1,500cc):** Confirmed. The Toyota Axio (1,496cc 1NZ-FE) is the single most common standard ride-hail car in Dhaka. Honda Fit is second.

**Car — Premium (mid-size sedan, anchor: 1,800cc):** Confirmed. The Toyota Allion/Premio with the 1.8L 2ZR-FE engine. Note: the 2.0L 3ZR-FAE variant exists but the 1.8L is more common in the Dhaka used market due to slightly lower import duty brackets.

**Critical taxonomy note for cost modeling:** The v1 table listed Car — Standard and Car — Premium as "Petrol/Octane" fuel type. This is misleading for Dhaka ride-hail. The majority of ride-hail cars in Dhaka — including Axios and Allions — are CNG-converted. The cost model must reflect this reality. Petrol-only operation is the exception, not the norm, and produces fundamentally different economics (see Section A below).

**Deferred categories (not modeled, noted for future):**
- **CNG 4-wheeler** (converted micro-vans): Meaningful on some routes but different dispatch dynamics.
- **Electric 3-wheeler:** ~1 million operate in Bangladesh despite the December 2021 ban. Regulatory risk makes inclusion a policy decision, not a cost question.
- **Electric bike:** Tiny segment today but growing. Cost model would be radically different (no fuel, battery depreciation instead).

---

## Part 2: Per-Sub-Category Cost Survey (Revised)

### A. Fuel Cost

**Key revision:** Cars modeled as CNG-converted (primary) with petrol-only as alternative. Bike efficiency adjusted upward for 125cc and 150cc.

**Reference prices (unchanged from v1):**
- Octane: 145 BDT/litre
- Petrol: 140 BDT/litre
- CNG: 42 BDT/m³ (government-regulated retail price at pump)

| Sub-Category | Fuel Efficiency (Dhaka gridlock) | Fuel Price | **Fuel Cost/km** | v1 Value | Change |
|---|---|---|---|---|---|
| **Bike — Economy (100cc)** | 45 km/L | 140 BDT/L (petrol) | **3.11** | 3.11 | None |
| **Bike — Standard (125cc)** | 40 km/L | 140 BDT/L (petrol) | **3.50** | 3.68 | Efficiency revised 38→40 |
| **Bike — Premium (150cc)** | 33 km/L | 145 BDT/L (octane) | **4.39** | 4.83 | Efficiency revised 30→33 |
| **CNG — Standard (3-wheeler)** | 4.0 m³/100km | 42 BDT/m³ | **1.68** | 1.68 | None |
| **Car — Economy (800cc, CNG)** | 19 km/m³ | 42 BDT/m³ | **2.21** | 9.33 | **CNG model replaces petrol** |
| **Car — Standard (1500cc, CNG)** | 14 km/m³ | 42 BDT/m³ | **3.00** | 13.18 | **CNG model replaces petrol** |
| **Car — Premium (1800cc, CNG)** | 11 km/m³ | 42 BDT/m³ | **3.82** | 16.11 | **CNG model replaces petrol** |

**Bike efficiency revision reasoning:** The v1 anchor was the Cyclone Carrera 250 at 31 km/L in Dhaka commuting. A 250cc bike is heavier, more powerful, and less efficient than a 125cc or 150cc. The efficiency curve is not linear with displacement — a 125cc bike should do meaningfully better than 31 km/L, not just 38. Indian real-world city tests (similar traffic density to Dhaka) consistently show 100cc bikes at 50–60 km/L and 125cc at 42–52 km/L. Discounting 15–20% for Dhaka's worse congestion gives 45 and 40 respectively. The 150cc revision from 30→33 reflects the same logic — 150cc bikes in Indian cities get 38–45 km/L; Dhaka-adjusted is 32–36.

**CNG car efficiency reasoning:** CNG-converted cars in Dhaka are measured in km per cubic metre. Real-world figures from Dhaka CNG stations and driver reports:
- Alto 800 CNG: 18–22 km/m³ → use 19 (Dhaka gridlock discount from the midpoint)
- Axio CNG: 13–16 km/m³ → use 14
- Allion/Premio 1.8L CNG: 10–13 km/m³ → use 11

These are well-established in the Dhaka driver community. The CNG conversion reduces fuel cost by 70–80% versus petrol, which is why it is near-universal for ride-hail cars.

**Petrol-only car costs (for reference):**

| Sub-Category | Fuel Efficiency | Fuel Price | Fuel Cost/km |
|---|---|---|---|
| Car — Economy (petrol) | 13 km/L | 140 BDT/L | 10.77 |
| Car — Standard (petrol) | 10 km/L | 145 BDT/L | 14.50 |
| Car — Premium (petrol) | 8.5 km/L | 145 BDT/L | 17.06 |

The gap is enormous. A petrol-only car standard driver pays 14.50 BDT/km in fuel alone versus 3.00 for CNG. This 11.50 BDT/km difference on 120 daily km = 1,380 BDT/day — often the difference between profit and loss.

---

### B. Maintenance & Wear (Revised)

**Key revision:** Tyre costs corrected across all categories. Major repair reserves revised based on corrected vehicle life assumptions.

#### Routine Maintenance (unchanged from v1 — these were directionally correct)

| Sub-Category | Routine Maint./km | Notes |
|---|---|---|
| Bike — Economy | **0.35** | Oil (300 BDT/2,000 km), chain (100/1,000 km), filter (150/5,000 km), brake pads (250/8,000 km) |
| Bike — Standard | **0.40** | Slightly higher-spec parts, same intervals |
| Bike — Premium | **0.50** | Higher-spec oil (450 BDT), more expensive pads (400 BDT), chain wear faster |
| CNG — Standard | **0.60** | Oil (500/2,500 km), CNG tuning (1,000/10,000 km), brake pads (350/6,000 km), spark plug (200/5,000 km) |
| Car — Economy | **0.50** | Oil+filter (1,500/5,000 km), air filter (400/10,000 km), brake pads (1,200/15,000 km), plugs (600/20,000 km) |
| Car — Standard | **0.75** | Oil+filter (2,500/5,000 km), trans fluid (2,000/40,000 km), brake pads (2,000/15,000 km) |
| Car — Premium | **0.90** | Oil+filter (3,500/5,000 km), premium pads (3,000/15,000 km), more complex systems |

#### Tyre Cost per km (Corrected)

**This is the biggest single correction from v1.** The first pass contained an arithmetic error that understated tyre costs by 2–4x. The corrected calculations are shown explicitly below.

| Sub-Category | Tyre Setup | Cost per Tyre (BDT) | Tyre Life (km) | Calculation | **Tyre Cost/km** | v1 Value | Error Factor |
|---|---|---|---|---|---|---|---|
| **Bike — Economy** | 1 rear + 1 front | Rear 1,800 / Front 1,200 | Rear 12,000 / Front 25,000 | (1800/12000) + (1200/25000) = 0.150 + 0.048 | **0.20** | 0.12 | 1.7x understated |
| **Bike — Standard** | 1 rear + 1 front | Rear 2,200 / Front 1,500 | Rear 12,000 / Front 25,000 | 0.183 + 0.060 | **0.24** | 0.15 | 1.6x |
| **Bike — Premium** | 1 rear + 1 front | Rear 2,800 / Front 1,800 | Rear 13,000 / Front 25,000 | 0.215 + 0.072 | **0.29** | 0.18 | 1.6x |
| **CNG — Standard** | 1 front + 2 rear | Front 1,200 / Rear 1,500 ea. | Front 15,000 / Rear 18,000 | 0.080 + 2(0.083) | **0.25** | 0.10 | 2.5x |
| **Car — Economy** | 4 tyres | 3,500 each | 35,000 | 4 × 3500 / 35000 | **0.40** | 0.10 | **4.0x** |
| **Car — Standard** | 4 tyres | 5,000 each | 35,000 | 4 × 5000 / 35000 | **0.57** | 0.13 | **4.4x** |
| **Car — Premium** | 4 tyres | 7,000 each | 35,000 | 4 × 7000 / 35000 | **0.80** | 0.16 | **5.0x** |

**Tyre life reasoning:** Dhaka roads are brutal on tyres — potholes, unpaved sections, debris. Ride-hail driving involves constant stop-and-go and hard braking. 35,000 km for car tyres (versus 50,000–60,000 km in developed markets) reflects this. Bike rear tyres wear faster because of acceleration stress and passenger load.

#### Major Repair Reserve (Revised)

**Key revision:** Vehicle useful life shortened (see Section C), which changes which major repairs actually occur within the vehicle's ride-hail life. Repairs that would occur after the vehicle is retired are excluded.

| Sub-Category | Key Repairs During Life | Calculation | **Reserve/km** | v1 Value | Change |
|---|---|---|---|---|---|
| **Bike — Economy** | Clutch plates (2,000 BDT at 30k km), suspension (3,000 at 50k), top-end (8,000 at 70k) over 70k km life | (2000+3000+8000)/70000 | **0.19** | 0.18 | +0.01 |
| **Bike — Standard** | Clutch (2,500/30k), suspension (4,000/50k), top-end (10,000/70k) over 75k km | (2500+4000+10000)/75000 | **0.22** | 0.22 | None |
| **Bike — Premium** | Clutch (3,500/25k), suspension (5,000/40k), engine (12,000/60k) over 65k km | (3500+5000+12000)/65000 | **0.32** | 0.28 | +0.04 |
| **CNG — Standard** | Clutch (4,000/25k), suspension (5,000/40k), CNG system (8,000/60k), engine (15,000/80k) over 100k km | (4000+5000+8000+15000)/100000 | **0.32** | 0.35 | −0.03 |
| **Car — Economy** | Clutch (8,000/50k), suspension (12,000/70k) over 130k km life. Engine overhaul at 150k+ is beyond life. | (8000+12000)/130000 + misc reserve | **0.20** | 0.25 | −0.05 |
| **Car — Standard** | Clutch (15,000/50k), suspension (18,000/70k), AT service (20,000/90k) over 140k km | (15000+18000+20000)/140000 | **0.38** | 0.35 | +0.03 |
| **Car — Premium** | Clutch/AT (25,000/50k), suspension (25,000/60k), electrical reserve over 160k km | (25000+25000+10000)/160000 | **0.38** | 0.45 | −0.07 |

**Note on car major repairs:** The v1 model included engine overhaul reserves for cars, but with revised shorter useful lives (130,000–160,000 km from purchase), major engine overhauls at 150,000+ km often don't occur before the vehicle is retired from ride-hail. The reserve is therefore lower for cars than v1 suggested, partially offsetting the tyre cost increase.

#### Total Maintenance per km (Revised)

| Sub-Category | Routine | Tyre | Major Repair | **Total Maint./km** | v1 Total | Net Change |
|---|---|---|---|---|---|---|
| Bike — Economy | 0.35 | 0.20 | 0.19 | **0.74** | 0.65 | +0.09 |
| Bike — Standard | 0.40 | 0.24 | 0.22 | **0.86** | 0.77 | +0.09 |
| Bike — Premium | 0.50 | 0.29 | 0.32 | **1.11** | 0.96 | +0.15 |
| CNG — Standard | 0.60 | 0.25 | 0.32 | **1.17** | 1.05 | +0.12 |
| Car — Economy | 0.50 | 0.40 | 0.20 | **1.10** | 0.90 | +0.20 |
| Car — Standard | 0.75 | 0.57 | 0.38 | **1.70** | 1.23 | +0.47 |
| Car — Premium | 0.90 | 0.80 | 0.38 | **2.08** | 1.51 | +0.57 |

The tyre correction dominates. For cars, the corrected tyre cost alone adds 0.30–0.64 BDT/km. This is not a rounding error — for a car standard driver doing 37,000 km/year, it's an additional 11,000–24,000 BDT/year in tyre costs that v1 missed.

---

### C. Depreciation (Revised)

**Key revision:** Useful life shortened to reflect that Dhaka ride-hail drivers buy used vehicles with significant prior mileage. The "remaining life from purchase" is what matters, not total vehicle life.

| Sub-Category | Purchase Price (used, Dhaka) | Prior km at Purchase | Remaining Useful Life | Residual Value | **Depreciation/km** | v1 Value | Change |
|---|---|---|---|---|---|---|---|
| **Bike — Economy** | 60,000 | ~30,000 km | 70,000 km | 8,000 | **0.74** | 0.65 | +0.09 |
| **Bike — Standard** | 100,000 | ~30,000 km | 75,000 km | 12,000 | **1.17** | 0.98 | +0.19 |
| **Bike — Premium** | 175,000 | ~25,000 km | 65,000 km | 20,000 | **2.38** | 1.94 | +0.44 |
| **CNG — Standard** | 275,000 | ~40,000 km | 100,000 km | 45,000 | **2.30** | 1.92 | +0.38 |
| **Car — Economy** | 400,000 | ~50,000 km | 130,000 km | 50,000 | **2.69** | 1.94 | +0.75 |
| **Car — Standard** | 1,000,000 | ~70,000 km | 140,000 km | 120,000 | **6.29** | 4.89 | +1.40 |
| **Car — Premium** | 2,000,000 | ~70,000 km | 160,000 km | 200,000 | **11.25** | 9.00 | +2.25 |

**Remaining life reasoning:**

*Bikes:* A 100cc bike bought at 30,000 km can reasonably last to 100,000 km with Dhaka-standard maintenance (local mechanic, aftermarket parts). Beyond 100,000 km, the engine needs a full rebuild that typically exceeds the bike's value. 70,000 km remaining is realistic. Premium 150cc bikes are often ridden harder (more aggressive acceleration, higher speeds), so remaining life is shorter despite the higher purchase price.

*CNG auto-rickshaw:* The Bajaj RE is a simple, robust platform. Bought at 40,000 km, it can run to 140,000 km with periodic engine and CNG system overhauls. 100,000 km remaining is realistic.

*Cars:* Bangladesh's import duty structure (150–450% on conventional vehicles) means even used cars are expensive. A Toyota Axio bought at 70,000 km for 1,000,000 BDT can last to 200,000–250,000 km with diligent maintenance. 140,000 km remaining is a reasonable midpoint. The Allion/Premio, being a higher-spec Toyota, has similar or slightly better longevity — 160,000 km remaining from 70,000 km purchase.

**Purchase price note:** These are what a Dhaka ride-hail driver actually pays in the used market, not new showroom prices. The Axio at 1,000,000 BDT and Allion at 2,000,000 BDT reflect the extreme markup from import duties. A Toyota Axio that costs $8,000 internationally sells for the equivalent of $9,000–11,000 in Dhaka's used market after duties.

---

### D. Fixed Costs (Revised)

**Key revision:** Annual km derived consistently from daily km × 310 working days/year (approximately 6 days/week with public holidays and sick days).

| Sub-Category | Daily km | Working Days | **Annual km** | v1 Annual km |
|---|---|---|---|---|
| Bike — Economy | 100 | 310 | **31,000** | 28,000 |
| Bike — Standard | 100 | 310 | **31,000** | 28,000 |
| Bike — Premium | 90 | 310 | **27,900** | 25,000 |
| CNG — Standard | 110 | 310 | **34,100** | 35,000 |
| Car — Economy | 110 | 310 | **34,100** | 32,000 |
| Car — Standard | 120 | 310 | **37,200** | 35,000 |
| Car — Premium | 120 | 310 | **37,200** | 35,000 |

**Lead package cost revision:** Anchored to a coherent weekly package structure rather than round numbers. The weekly cost should represent 12–20% of a driver's expected weekly gross lead value — enough to feel meaningful but not so high that a bad week causes non-renewal.

| Sub-Category | Est. Weekly Leads | Avg. Lead Value | Weekly Lead Value | Package Cost (wk) | **Annual Package** |
|---|---|---|---|---|---|
| Bike — Economy | 20 | 65 BDT | 1,300 | 250 (19%) | **13,000** |
| Bike — Standard | 20 | 75 BDT | 1,500 | 300 (20%) | **15,600** |
| Bike — Premium | 18 | 90 BDT | 1,620 | 350 (22%) | **18,200** |
| CNG — Standard | 18 | 85 BDT | 1,530 | 300 (20%) | **15,600** |
| Car — Economy | 14 | 220 BDT | 3,080 | 500 (16%) | **26,000** |
| Car — Standard | 12 | 320 BDT | 3,840 | 600 (16%) | **31,200** |
| Car — Premium | 10 | 450 BDT | 4,500 | 750 (17%) | **39,000** |

**Note:** These package costs are illustrative. Your actual pricing will depend on lead volume, match quality, and competitive dynamics. The percentages shown (16–22% of expected weekly lead value) are a starting range — the renewal-rate-maximizing price may be higher or lower.

#### Fixed Cost per km (Revised)

| Sub-Category | Insurance | Reg/Fitness/Tax | Lead Package | Annual km | **Fixed/km** | v1 Value |
|---|---|---|---|---|---|---|
| Bike — Economy | 2,500 | 1,500 | 13,000 | 31,000 | **0.55** | 0.70 |
| Bike — Standard | 3,000 | 1,500 | 15,600 | 31,000 | **0.65** | 0.81 |
| Bike — Premium | 4,000 | 2,000 | 18,200 | 27,900 | **0.87** | 1.07 |
| CNG — Standard | 8,000 | 4,000 | 15,600 | 34,100 | **0.81** | 0.94 |
| Car — Economy | 18,000 | 6,000 | 26,000 | 34,100 | **1.47** | 1.56 |
| Car — Standard | 30,000 | 8,000 | 31,200 | 37,200 | **1.87** | 1.98 |
| Car — Premium | 40,000 | 10,000 | 39,000 | 37,200 | **2.39** | 2.47 |

Fixed costs per km decreased slightly from v1 because annual km increased (denominator effect). The CNG standard fixed cost dropped more noticeably because the lead package was revised down from 20,800 to 15,600 (CNG drivers have lower willingness-to-pay than I initially assumed, given their lower per-trip revenue).

---

### E. Driver Time / Opportunity Cost (Revised)

**Key revision:** Speed differentiated by vehicle type. Bikes are materially faster than cars in Dhaka traffic due to filtering ability.

| Variable | Bike — Economy | Bike — Standard | Bike — Premium | CNG — Standard | Car — Economy | Car — Standard | Car — Premium |
|---|---|---|---|---|---|---|---|
| **Daily working hours** | 12 | 12 | 12 | 12 | 12 | 12 | 12 |
| **Daily net earnings target** | 600 | 650 | 700 | 700 | 900 | 1,100 | 1,400 |
| **Daily km (total)** | 100 | 100 | 90 | 110 | 110 | 120 | 120 |
| **Avg speed, loaded** | **15 km/h** | **15 km/h** | **15 km/h** | **13 km/h** | **12 km/h** | **12 km/h** | **12 km/h** |
| **Avg speed, empty** | **20 km/h** | **20 km/h** | **20 km/h** | **16 km/h** | **16 km/h** | **16 km/h** | **16 km/h** |
| **Time cost per hour** | 50.00 | 54.17 | 58.33 | 58.33 | 75.00 | 91.67 | 116.67 |
| **Time cost per km (loaded)** | **3.33** | **3.61** | **3.89** | **4.49** | **6.25** | **7.64** | **9.72** |
| **Time cost per km (empty)** | **2.50** | **2.71** | **2.92** | **3.65** | **4.69** | **5.73** | **7.29** |

**Speed revision reasoning:**

v1 used 12–13 km/h loaded for all categories. This is wrong. In Dhaka traffic:
- **Bikes filter** through stationary and slow-moving traffic. They use the left shoulder, weave between lanes, and take shortcuts through alleys. Loaded average: 14–17 km/h. Use 15.
- **CNG autos** are narrower than cars but wider than bikes. They can filter in some situations but are constrained by their width. Loaded average: 12–14 km/h. Use 13.
- **Cars** cannot filter. They sit in the same gridlock as buses and trucks. Loaded average: 10–13 km/h. Use 12.

For empty driving, all vehicles can route more aggressively (no passenger comfort constraint, can U-turn more freely). Bikes benefit most from this — their empty speed is 33% higher than loaded. Cars benefit less — maybe 30% higher.

**Earnings target revision:** Slightly lowered from v1 based on Dhaka opportunity cost analysis:
- A rickshaw puller earns 400–600 BDT/day. A day laborer earns 500–800 BDT/day. Ride-hail should pay a premium over these alternatives to justify the vehicle investment and longer hours.
- For bike drivers: 600–700 BDT/day net represents a meaningful premium over rickshaw pulling.
- For car drivers: 900–1,400 BDT/day net reflects both the higher capital investment and the higher opportunity cost (a car driver could work as a private driver for 15,000–25,000 BDT/month).
- The targets are "minimum satisfactory" — the level at which the driver prefers to continue rather than switch to an alternative. They are not aspirational.

**CNG queue time cost (new in v2):**

CNG-converted car drivers spend an average of 45–75 minutes per day in CNG station queues. This is well-documented in Dhaka — CNG stations have chronic shortages and long lines, especially during peak hours. This time has an opportunity cost equal to the driver's time cost per hour.

| Sub-Category | Avg Queue Time | Time Cost/hr | Queue Cost/day | Daily km | **Queue Cost/km** |
|---|---|---|---|---|---|
| Car — Economy (CNG) | 60 min | 75.00 | 75.00 | 110 | **0.68** |
| Car — Standard (CNG) | 60 min | 91.67 | 91.67 | 120 | **0.76** |
| Car — Premium (CNG) | 60 min | 116.67 | 116.67 | 120 | **0.97** |

This cost does not apply to bikes (petrol, quick refuel), CNG autos (shorter queues at dedicated auto-rickshaw CNG stations), or petrol-only cars.

---

### F. Pickup Distance Distribution (Unchanged from v1)

The v1 estimates are directionally sound and don't have the arithmetic errors that plagued other sections. No revision.

| Zone Type | p25 | p50 | p75 | p90 |
|---|---|---|---|---|
| **Dense urban core** (Gulshan, Banani, Motijheel, Old Dhaka, Dhanmondi) | 0.4 km | 0.8 km | 1.3 km | 2.0 km |
| **Standard urban** (Mirpur, Uttara, Mohammadpur, Tejgaon, Bashundhara) | 0.8 km | 1.5 km | 2.5 km | 4.0 km |
| **Suburban / peripheral** (Savar, Tongi, Keraniganj, Gazipur) | 1.5 km | 3.0 km | 5.0 km | 8.0 km |

**Calibration note:** These distributions assume a mature platform with reasonable driver density. For a launch platform with fewer drivers, all distributions shift right (longer pickups). The free radius should target p70–p75 for the platform's primary operating zones at launch, then adjust as driver density changes.

---

## Revised Total Cost per Loaded km

| Component | Bike Econ. | Bike Std. | Bike Prem. | CNG Std. | Car Econ. (CNG) | Car Std. (CNG) | Car Prem. (CNG) |
|---|---|---|---|---|---|---|---|
| Fuel | 3.11 | 3.50 | 4.39 | 1.68 | 2.21 | 3.00 | 3.82 |
| Maintenance | 0.74 | 0.86 | 1.11 | 1.17 | 1.10 | 1.70 | 2.08 |
| Depreciation | 0.74 | 1.17 | 2.38 | 2.30 | 2.69 | 6.29 | 11.25 |
| Fixed costs | 0.55 | 0.65 | 0.87 | 0.81 | 1.47 | 1.87 | 2.39 |
| Driver time (loaded) | 3.33 | 3.61 | 3.89 | 4.49 | 6.25 | 7.64 | 9.72 |
| CNG queue time | — | — | — | — | 0.68 | 0.76 | 0.97 |
| **Total cost/km (loaded)** | **8.47** | **9.79** | **12.64** | **10.45** | **14.40** | **21.26** | **30.23** |

### Comparison with v1

| Sub-Category | v1 Total | v2 Total | Change | Primary Driver |
|---|---|---|---|---|
| Bike — Economy | 9.28 | 8.47 | −0.81 | Lower fixed costs (annual km ↑), faster speed (time/km ↓) |
| Bike — Standard | 10.73 | 9.79 | −0.94 | Same |
| Bike — Premium | 13.61 | 12.64 | −0.97 | Same, partially offset by higher depreciation |
| CNG — Standard | 11.15 | 10.45 | −0.70 | Lower fixed costs, faster speed |
| Car — Economy | 20.67 | 14.40 | **−6.27** | **CNG fuel switch (−7.12) dominates**; offset by higher maint (+0.20), depr (+0.75), queue (+0.68) |
| Car — Standard | 29.61 | 21.26 | **−8.35** | **CNG fuel switch (−10.18) dominates**; offset by higher maint (+0.47), depr (+1.40), queue (+0.76) |
| Car — Premium | 39.51 | 30.23 | **−9.28** | **CNG fuel switch (−12.29) dominates**; offset by higher maint (+0.57), depr (+2.25), queue (+0.97) |

The car numbers changed dramatically. The CNG fuel model is the single most consequential correction — it reduces car operating costs by 30–40%. This is not a modeling choice; it reflects the reality that Dhaka ride-hail economics are built on CNG conversion. A petrol-only car model would produce costs of 21–42 BDT/km (shown below), which would make car ride-hail barely viable at current Dhaka fare levels.

### Petrol-Only Car Costs (for reference)

| Component | Car Econ. (Petrol) | Car Std. (Petrol) | Car Prem. (Petrol) |
|---|---|---|---|
| Fuel | 10.77 | 14.50 | 17.06 |
| Maintenance | 1.10 | 1.70 | 2.08 |
| Depreciation | 2.69 | 6.29 | 11.25 |
| Fixed costs | 1.47 | 1.87 | 2.39 |
| Driver time | 6.25 | 7.64 | 9.72 |
| **Total** | **22.28** | **32.00** | **42.50** |

A petrol-only car standard driver needs 32.00 BDT/km versus 21.26 for CNG. At current Dhaka car ride-hail rates (~22–30 BDT/km loaded), a petrol-only standard car driver is at or below breakeven. This is why CNG conversion is not optional — it is a structural requirement for ride-hail car viability in Dhaka.

---

## Daily Economics Cross-Check

To verify the model produces realistic outcomes, here is a daily P&L for each category assuming the platform's fare formula generates the following all-in loaded revenue per km (base fare + per-km + waiting, averaged across trip lengths):

| Sub-Category | Assumed All-in Revenue/km (loaded) | Loaded km/day | Trip Revenue/day | Pickup Fees/day | **Total Revenue/day** |
|---|---|---|---|---|---|
| Bike — Economy | 14 BDT/km | 60 | 840 | 80 | **920** |
| Bike — Standard | 16 BDT/km | 60 | 960 | 90 | **1,050** |
| Bike — Premium | 19 BDT/km | 54 | 1,026 | 100 | **1,126** |
| CNG — Standard | 16 BDT/km | 66 | 1,056 | 100 | **1,156** |
| Car — Economy | 22 BDT/km | 66 | 1,452 | 150 | **1,602** |
| Car — Standard | 28 BDT/km | 72 | 2,016 | 200 | **2,216** |
| Car — Premium | 36 BDT/km | 72 | 2,592 | 250 | **2,842** |

| Sub-Category | Non-time Costs/day | Driver Time Cost/day | **Total Cost/day** | **Net Earnings/day** | Target | Surplus/(Deficit) |
|---|---|---|---|---|---|---|
| Bike — Economy | (3.11+0.74+0.74+0.55) × 100 = 514 | 50 × 12 = 600 | 1,114 | 920 − 514 = **406** | 600 | **(194)** |
| Bike — Standard | (3.50+0.86+1.17+0.65) × 100 = 618 | 54.17 × 12 = 650 | 1,268 | 1,050 − 618 = **432** | 650 | **(218)** |
| Bike — Premium | (4.39+1.11+2.38+0.87) × 90 = 788 | 58.33 × 12 = 700 | 1,488 | 1,126 − 788 = **338** | 700 | **(362)** |
| CNG — Standard | (1.68+1.17+2.30+0.81) × 110 = 656 | 58.33 × 12 = 700 | 1,356 | 1,156 − 656 = **500** | 700 | **(200)** |
| Car — Economy | (2.21+1.10+2.69+1.47+0.68) × 110 = 897 | 75 × 12 = 900 | 1,797 | 1,602 − 897 = **705** | 900 | **(195)** |
| Car — Standard | (3.00+1.70+6.29+1.87+0.76) × 120 = 1,634 | 91.67 × 12 = 1,100 | 2,734 | 2,216 − 1,634 = **582** | 1,100 | **(518)** |
| Car — Premium | (3.82+2.08+11.25+2.39+0.97) × 120 = 2,461 | 116.67 × 12 = 1,400 | 3,861 | 2,842 − 2,461 = **381** | 1,400 | **(1,019)** |

**Every category shows a deficit.** This is the critical finding of the cross-check.

### What This Means

The assumed revenue per km is too low to cover the full cost model including driver time. This is not a model error — it is a signal about the fare level required.

**The cost model tells you the floor.** The per-km rate in your fare formula must be set high enough that the daily economics close the gap. Here is what each category needs as a minimum all-in loaded revenue per km to hit earnings targets:

| Sub-Category | Non-time Cost/km (loaded) | Time Cost/km (loaded) | Pickup Cost/km (empty) | Required Revenue/km (loaded) | Implied by: |
|---|---|---|---|---|---|
| Bike — Economy | 5.14 | 3.33 | 2.50 | **~10.5** | per-km rate + base fare amortized + waiting |
| Bike — Standard | 6.18 | 3.61 | 2.71 | **~12.5** | |
| Bike — Premium | 8.75 | 3.89 | 2.92 | **~15.5** | |
| CNG — Standard | 5.96 | 4.49 | 3.65 | **~13.0** | |
| Car — Economy | 8.15 | 6.25 | 4.69 | **~19.0** | |
| Car — Standard | 13.62 | 7.64 | 5.73 | **~27.5** | |
| Car — Premium | 20.51 | 9.72 | 7.29 | **~38.0** | |

These "required revenue per loaded km" figures include a buffer for empty km (pickup) that isn't fully covered by the pickup fee. The pickup fee at the category multiplier rate covers some of the empty cost, but not all — the shortfall must be embedded in the loaded per-km rate.

**This is the central tension in your fare architecture:** the per-km rate must be high enough for drivers to renew subscriptions, but low enough for riders to choose your platform over alternatives. The subscription model means you don't need to extract maximum fare per trip — you need fares that are *good enough* for drivers while being *competitive enough* for riders, with the gap bridged by high match quality and low idle time.

---

## Remaining Uncertainties and Validation Priorities

| Variable | Confidence | What to Validate | How |
|---|---|---|---|
| Bike fuel efficiency (45/40/33 km/L) | Medium-high | Real Dhaka figures for specific models | Instrument 5–10 bikes per category with fuel tracking over 2 weeks |
| CNG car efficiency (19/14/11 km/m³) | Medium | Highly variable by driving pattern and CNG system condition | Driver survey + CNG station receipt tracking |
| Vehicle purchase prices | Medium | Used market fluctuates; prices are Dhaka-specific | 20+ data points from Bikroy.com/vehicle dealers per category |
| Vehicle useful life (70k–160k km remaining) | Low-medium | This is the highest-leverage variable for depreciation | BRTA registration age data + mechanic interviews on typical engine life |
| Tyre life (12k–35k km) | Medium | Varies enormously by road surface, driving style, tyre brand | Mechanic survey (10+ shops across Dhaka zones) |
| Daily earnings targets (600–1,400 BDT) | Medium | What drivers actually need vs. what they want | Structured driver interviews: "What's the minimum you'd earn per day to keep doing this?" |
| Pickup distance distributions | Low | No Dhaka ride-hail dispatch data available to calibrate | **Must be measured from your own pilot dispatch data.** This is the single most important validation. |
| CNG queue time (60 min/day) | Medium | Varies by station, time of day, season | Driver survey + GPS dwell time analysis at CNG stations |
| Loaded/empty km split (60/40) | Low-medium | Depends on match rate, which depends on platform maturity | **Must be measured from your own operations.** Expect worse ratios at launch. |

**The three variables that most affect your fare architecture are:**
1. **Pickup distance distribution** — directly calibrates your free radius and cap
2. **Vehicle useful life** — a 20% change in remaining life shifts depreciation per km by 20%
3. **Loaded/empty split** — if only 50% of km are loaded (instead of 60%), the required revenue per loaded km jumps by ~15%

All three require operational data that no desk research can substitute. The cost model above gives you a structurally sound starting point; your pilot data will give you the calibration.