Not redundant, but not complete either — two real segments are missing at the edges of the car range, and one of your eight names is a trap waiting to misfire the first time an ordinary sedan gets a CNG conversion. Assessment, table, and rules below.

## 1. Is the 8-category set sufficient?

**Bikes (3 tiers) — defensible, but re-anchor the boundaries.** Motorcycle-taxis carry most of Dhaka's ride volume, so a 3-way split makes sense. But the tiers should track real regulatory brackets rather than generic labels: Bangladesh has long capped imported motorcycles at 165cc, and since October 2023 has separately allowed locally-manufactured motorcycles to register at up to 375cc. That two-track regime means a small segment now legally exists above where bike_plus currently tops out — worth knowing even if you don't build for it on day one.

**cng (1 tier) — fine operationally, risky by name.** The fleet itself is homogeneous enough not to need splitting: one import, the Bajaj RE, supplies roughly nine in ten of these three-wheelers, and only started being built domestically — with Runner Automobiles — in 2023. The real problem is that "CNG" here actually means *three-wheeler auto-rickshaw*, not *runs on natural gas* — and a huge share of ordinary sedans in Dhaka also run on CNG. Anyone who classifies by fuel type instead of body type will misroute a sedan into the auto-rickshaw pool (edge case 1).

**Cars (4 tiers) — genuinely incomplete.** Two segments fall outside the current boundaries:
- A sub-1000cc compact tier: Suzuki's 660cc Alto and the discontinued-but-still-common Hyundai Eon anchor a real, budget-distinct segment below whatever counts as car_economy today.
- A 9+ seat van tier: a Toyota Noah or Voxy seats 7–8, while a Hiace is built for 11–16 — different price points and different trip types (family outing vs. group charter), currently forced into the same car_xl bucket.

**Verdict:** keep the skeleton, add 2 categories, fix 1 naming ambiguity. Worth naming the trade-off honestly: more categories improve price/segment accuracy but split driver supply into thinner pools, which hurts match speed outside central Dhaka — car_van especially will have low supply and may need scheduled/pre-book matching rather than instant hailing at launch.

## 2. Proposed categories

Ten total — the original eight (mostly unchanged) plus two new tiers, one at each end of the car range.

| Category | Target use-case | Seats* | Engine cc | Fuel constraints | Example models in BD |
|---|---|---|---|---|---|
| bike_basic | Cheapest, shortest hops; solo commuters beating traffic | 2 | ≤100cc | Petrol only | Honda Livo, TVS Sport, Bajaj CT100, Walton Ranger |
| bike_standard | Everyday commuting; the most common bike-taxi spec | 2 | 101–125cc | Petrol only | Honda CB Shine, Bajaj Discover 125, Yamaha Saluto, Walton Fusion 125 |
| bike_plus | Faired/sport commuters; riders paying extra for power & comfort | 2 | 126–165cc | Petrol only | Yamaha FZS-Fi, Honda CB Hornet 160R, Bajaj Pulsar 150, TVS Apache RTR 160 |
| cng | Small groups (2–3), weatherproofed, cheaper than a car | 4 | ~150–250cc (descriptive only) | CNG required | Bajaj RE, TVS King Deluxe, locally-assembled Bajaj–Runner autos |
| **car_compact** *(new)* | Cheapest 4-wheeler option; budget solo/pair trips | 4–5 | ≤999cc | — | Suzuki Alto, Suzuki WagonR, Hyundai Eon, Nissan Dayz / Mitsubishi eK Wagon |
| car_economy | Default city car; highest-volume car-hailing pick | 5 | 1000–1499cc† | — | Toyota Axio, Toyota Vitz/Yaris, Honda Fit, Nissan Sunny |
| car_comfort | Larger, better-trimmed sedan or crossover | 5 | 1500–1999cc† | — | Toyota Premio/Allion, Honda Civic, Hyundai Creta, Honda Vezel |
| car_premium | Business/chauffeur-grade; luxury badge | 4–5 | ≥2000cc, or luxury marque regardless of cc† | — | Toyota Camry, Toyota Land Cruiser Prado, BMW 5-Series, Mercedes E-Class |
| car_xl | Families/small groups with luggage | 6–8 | Not decisive (typ. 1500–1800cc) | — | Toyota Noah/Voxy, Toyota Sienta, Mitsubishi Xpander |
| **car_van** *(new)* | Group charter, events, airport transfers | 9–16 | Not decisive (typ. 2000–3000cc) | — | Toyota Hiace, Nissan Urvan, Hyundai H-1/Starex |

*Seats = total certified capacity including the driver, matching BD registration-certificate convention.
†Fallback only — see §3. The real key for these three tiers is a brand+model lookup, not raw cc.

## 3. Deterministic classification rules

**Ground truth.** Every rule below reads from the vehicle's BRTA registration/fitness-certificate fields — body type, certified seats, certified engine cc — captured once at onboarding, never from a "current" spec-sheet lookup. That matters because roughly three-quarters of cars sold in Bangladesh are secondhand reconditioned imports rather than new, so there's frequently no current listing to check against anyway.

**Why brand+model has to outrank raw cc.** This builds on the pattern you described — brand+model+year as the anchor, cc/seats/body_type filling in — but makes the order explicit, because Toyota's Axio and Premio are both commonly sold with the same 1.5-litre, 1496cc engine, yet sit in visibly different price and trim tiers in Dhaka. A pure-cc formula would wrongly merge them. So:
- **Primary — Model-Tier Map:** a maintained lookup of brand + model + generation → category, seeded with common Dhaka nameplates. This is what gets Axio vs. Premio right.
- **Fallback — cc bracket:** used only when a brand+model isn't in the map yet (new arrival, rare import, discontinued nameplate). This also quietly handles old vehicles — no special-casing needed, they just take the same fallback path as any unmapped model.

**Precedence cascade** (evaluate top to bottom, stop at first match):
1. `body_type = three-wheeler` → **cng**. Nothing else in the fleet has 3 wheels, so this step alone is unambiguous; cc and seats are descriptive only here.
2. `body_type = motorcycle or scooter` → bracket by *certified* engine cc, not the marketing-name number (a bike sold as "110" may certify at 107cc — use the registered figure): ≤100cc → **bike_basic** · 101–125cc → **bike_standard** · 126–165cc → **bike_plus**. Above 165cc can currently only be registered legally if it's a locally-manufactured model under the 2023 rule change — route these to manual review unless you add a bike_prime tier (§5).
3. `body_type = car / SUV / MPV / van / microbus` → check certified seats first: ≥9 → **car_van** · 6–8 → **car_xl** · ≤5 → continue to step 4.
4. For ≤5-seat vehicles, look up brand+model+generation in the Model-Tier Map: match → assign the mapped tier; no match → apply the cc fallback on certified engine cc (≤999→car_compact · 1000–1499→car_economy · 1500–1999→car_comfort · ≥2000→car_premium) and flag the vehicle for a one-time ops review to add it to the map.

**Where manufacturing year fits.** Year is part of the Model-Tier Map's *key*, not a standalone rule — the same nameplate can span generations with different specs (an early-2000s Corolla vs. a 2019 Corolla Axio-generation car), so map rows should read as brand+model+**generation**, not brand+model alone. Year is deliberately *not* used as an age cutoff inside this logic — vehicles need a BRTA ride-sharing enlistment certificate on top of ordinary registration and fitness certification, and that eligibility gate is a separate system from which category a vehicle falls into (edge case 3).

**Conflict rule.** If certified seats or cc ever disagree with what's typical for that nameplate, the certificate wins — treat the mismatch as a signal to add a new map row, not a reason to override documented data.

**Known simplification.** Seat-count precedence (step 3) means a rare 7-seat luxury SUV lands in car_xl, not car_premium. Given how few of those actually enter ride-hailing service, that's an acceptable trade-off for launch; split out a car_xl_premium later only if supply justifies it.

## 4. Edge cases

**1. CNG-converted petrol cars.** Classification uses body type + seats + brand/model/cc of the base vehicle, full stop. A dual-fuel Toyota Axio — extremely common in Dhaka's private and rental fleet — stays car_economy; it never becomes cng, because that category name encodes a body type, not a fuel system, despite the overlapping word. Record fuel_type as its own attribute (petrol / CNG-dual / LPG-dual / diesel / hybrid / electric) for reporting, never as a classification input outside step 1. Flag this to engineering explicitly: any rule that keys off fuel type instead of body type will misroute a large share of the ordinary sedan fleet into the auto-rickshaw category.

**2. Locally-assembled/rebadged models.** Local assembly changes the supply chain and price, not the segment: Hyundai's Creta, once imported from Indonesia, is now assembled locally in Gazipur, and Mitsubishi's Xpander is now assembled by Rancon rather than imported fully built — both stay in whatever tier their nameplate already maps to. This isn't new ground either: state-run Pragati Industries was already locally assembling the Mitsubishi Pajero Sport back in 2011. Rebadged twins (a different-badge version of the same donor platform) should be added as aliases pointing at the donor's row, not researched independently. Exception: a local trim that's a genuinely distinct, separately-named spec (e.g., a stripped LPG-only "Eco" trim below the standard import) can get its own row if you want to price it differently.

**3. Very old (10+ year) vehicles.** Because classification reads the registration certificate rather than a live spec database, age never breaks anything by itself — a 1998 Corolla or a discontinued Corona just falls through to the same cc-bracket fallback as any unmapped model. Keep two systems separate: whether a vehicle is *allowed onto the platform at all* is an age/fitness-eligibility gate under BRTA's enlistment regime; *which category it lands in* once admitted is this framework. Don't merge an age cutoff into the categorization rules themselves.

**4. Non-standard seat modifications.** Always use the certified seat count from the registration/fitness certificate — never a driver's self-report or an informal modification. Unauthorized jump seats added to a van don't count for classification (and should be flagged as a separate safety issue at onboarding, since BRTA doesn't recognize them either). A genuinely certified non-standard count — say, a Hiace registered with fewer seats than its usual configuration — is classified by that certified number even though it doesn't match the model's typical spec.

**5. Unregistered electric three-wheelers ("easy bikes"), bonus.** Dhaka has a large and growing population of battery-powered rickshaws, but most operate without BRTA registration and sit in a legal gray zone where they can be impounded. Recommend excluding them from cng — and from the platform generally — until they have a clear registration/insurance path, rather than folding "any three-wheeler" in by default.

## 5. Enum impact

**This framework needs 2 new `vehicle_type` values: `car_compact` and `car_van`.** Everything else — bike_basic/standard/plus, cng, car_economy/comfort/premium, car_xl — fits inside the existing 8, though two need internal-logic changes without a new enum value: cng should key off three-wheeler body type rather than fuel type, and car_xl's upper bound should tighten to 8 seats now that car_van exists above it.

A third, optional value — `bike_prime`, for the >165cc locally-manufactured motorcycle segment that only became legal in October 2023 — can be deferred; current supply is too thin to need its own matching pool yet.

Happy to turn the precedence cascade into a visual decision tree, or draft seed rows for the Model-Tier Map covering your top 40–50 Dhaka nameplates, if either would help.
