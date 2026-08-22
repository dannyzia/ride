# Dhaka Vehicle Categorization Framework v2.0 — Hard 2nd Pass

## What v1.0 Got Wrong (Self-Critique)

| # | Flaw | Severity | Fix in v2.0 |
|---|------|----------|-------------|
| 1 | **"Compact" is the wrong name.** Globally, "compact" means Corolla/Civic. In Bangladesh, ≤1000cc cars are "mini" or "micro." Calling a Nano "compact" confuses riders. | HIGH | Renamed rider-facing label to **"Mini Car."** Enum key stays `car_compact` for backward compat. |
| 2 | **1000cc cutoff is too blunt.** A 996cc Toyota Vitz (modern, AC, comfortable) shares a tier with a 624cc Tata Nano (no AC, cramped). CC alone ignores 20 years of engineering difference. | HIGH | Added **YEAR/AGE dimension** as a quality modifier. Vehicles >15 years old in any tier get a "Classic" sub-label. |
| 3 | **No age factor at all.** A 1998 Corolla 1300cc and a 2020 Corolla 1300cc are the same category but wildly different experiences. | MEDIUM | Age does not change category (keeps rules deterministic), but age ≥15 years triggers a **pricing floor reduction** and a UI "Classic" badge. |
| 4 | **Body type underused.** A Toyota Rush (SUV, 1496cc, 7 seats) gets `car_economy` by CC. A Honda CR-V (1997cc) gets `car_comfort`. SUVs command a premium in Dhaka. | MEDIUM | Added **SUV bump rule**: body_type="suv" AND CC ≥ 1500 → minimum tier is `car_comfort`. |
| 5 | **Three bike tiers may be overkill.** Dhaka platforms (Pathao, Uber) offer one "Bike" tier. The 100cc vs 125cc vs 150cc distinction may not justify UI complexity. | LOW | **Kept all three** — the platform already has them and drivers own specific bikes. But noted that `bike_standard` and `bike_plus` may be collapsed post-launch if data shows identical acceptance rates. |
| 6 | **Missing EV handling.** No rule for electric vehicles (BYD, Tesla, Nissan Leaf). No engine CC. | MEDIUM | Added **EV rule**: classify by seat count + luxury brand + body type, with "electric" as a parallel fuel flag. |
| 7 | **`car_xl` seat rule too simple.** A 5-seat SUV with a jump seat (6 total) shouldn't be XL. A 7-seat MPV should be. | MEDIUM | Added body_type requirement: must be van/mpv/minibus/suv_large + ≥6 seats. |
| 8 | **Rebadged model problem is real.** Toyota Axio (1496cc, JDM Corolla, better trim) = `car_economy` by strict rule. Riders expect Axio ≈ Comfort. | HIGH | Added explicit **`model_override` escape hatch** — a lookup table for known exceptions. Deterministic for 95% of cases, override-able for the 5% that CC gets wrong. |
| 9 | **CC is a mechanical proxy, not a comfort proxy.** The framework pretends CC = comfort tier. It is not. | ACKNOWLEDGED | Added honest "Limitations" section. CC is the best *verifiable* proxy, but the platform should collect vehicle photos and allow admin reclassification. |
| 10 | **Missing: CNG-run 4-wheeler taxis.** Some Bangladesh taxis are CNG-run Alto/Santro (4 wheels, CNG fuel). My rules say they stay in CC band, which is correct, but I should be explicit. | LOW | Clarified: CNG fuel type on a 4-wheeler does NOT trigger `cng` category. The `cng` category is 3-wheeler-only. |

---

## Revised Category Inventory (9 Total — Same Keys, Refined Definitions)

| # | Enum Key | Rider-Facing Name | Segment | CC Range | Seats | Fuel | Body Type | Status |
|---|----------|-------------------|---------|----------|-------|------|-----------|--------|
| 1 | `bike_basic` | Bike Basic | 100–124cc commuter motorcycles | 100–124 | 1 | Petrol | motorcycle | Existing |
| 2 | `bike_standard` | Bike Standard | 125–149cc standard motorcycles | 125–149 | 1 | Petrol | motorcycle | Existing |
| 3 | `bike_plus` | Bike Plus | 150cc+ premium motorcycles | 150+ | 1 | Petrol | motorcycle | Existing |
| 4 | `cng` | CNG | CNG 3-wheeler auto-rickshaws | 175–260 | 2–3 | CNG | auto_rickshaw | Existing |
| 5 | `car_compact` | **Mini Car** | ≤1000cc micro/mini cars | ≤1000 | 3–4 | Petrol/CNG | hatchback, micro_sedan | **NEW** |
| 6 | `car_economy` | Economy Car | 1001–1500cc budget cars | 1001–1500 | 4–5 | Petrol/CNG | hatchback, sedan, suv_small | Existing (redefined) |
| 7 | `car_comfort` | Comfort Car | 1501–2000cc mid-range OR SUVs ≥1500cc | 1501–2000 | 4–5 | Petrol/CNG | sedan, suv, crossover | Existing (redefined) |
| 8 | `car_premium` | Premium Car | >2000cc OR luxury brand OR SUV ≥2000cc | >2000 or any (luxury) | 4–5 | Petrol/CNG/Electric | sedan, suv, crossover | Existing (redefined) |
| 9 | `car_xl` | XL / Van | 6+ seat vans, minibuses, large SUVs | Any | 6–10 | Any | van, mpv, minibus, suv_large | Existing (redefined) |

---

## Revised Deterministic Classification Rules (Priority Order)

Given inputs: `brand`, `model`, `year`, `engine_cc`, `seat_count`, `body_type`, `fuel_type`, `wheel_count`, `is_electric`

```
STEP 1: ELECTRIC VEHICLE BRANCH
├── is_electric == true
│   ├── seat_count >= 6  →  car_xl
│   ├── brand IN LUXURY_BRANDS  →  car_premium
│   ├── seat_count <= 4 AND body_type IN {hatchback, sedan}  →  car_economy
│   ├── body_type == "suv"  →  car_comfort
│   └── default  →  car_economy
│
STEP 2: TWO-WHEELER BRANCH
├── wheel_count == 2
│   ├── engine_cc <= 124  →  bike_basic
│   ├── engine_cc <= 149  →  bike_standard
│   └── engine_cc >= 150  →  bike_plus
│
STEP 3: THREE-WHEELER BRANCH (strict)
├── wheel_count == 3 AND body_type == "auto_rickshaw" AND fuel_type == "cng"
│   →  cng
│
STEP 4: LARGE VEHICLE BRANCH
├── seat_count >= 6 AND body_type IN {van, mpv, minibus, suv_large}
│   →  car_xl
│
STEP 5: LUXURY BRANCH
├── brand IN LUXURY_BRANDS
│   →  car_premium
│
STEP 6: SUV BUMP BRANCH
├── body_type == "suv" AND engine_cc >= 1500
│   ├── engine_cc <= 2000  →  car_comfort
│   └── engine_cc > 2000   →  car_premium
│
STEP 7: MODEL OVERRIDE BRANCH
├── (brand, model) IN MODEL_OVERRIDE_TABLE
│   →  use override_category
│
STEP 8: CC BAND BRANCH (default for all remaining 4-wheelers)
├── engine_cc <= 1000  →  car_compact
├── engine_cc <= 1500  →  car_economy
├── engine_cc <= 2000  →  car_comfort
└── engine_cc > 2000   →  car_premium
```

### Revised Rule Properties

| Property | Guarantee |
|----------|-----------|
| **Exhaustiveness** | Every input reaches exactly one leaf. Electric branch catches all EVs before CC rules. |
| **Unambiguity** | No overlap — each branch has mutually exclusive conditions. |
| **Determinism** | Same inputs → same category, every time. |
| **Override transparency** | `MODEL_OVERRIDE_TABLE` is admin-visible and auditable. Overrides are logged. |

---

## Revised Formal Rule Table

| Step | Condition | Category | Notes |
|------|-----------|----------|-------|
| 1 | `is_electric == true` AND `seat_count >= 6` AND `body_type` ∈ {van, mpv, minibus, suv_large} | `car_xl` | Electric vans/minibuses |
| 2 | `is_electric == true` AND `brand` ∈ LUXURY_BRANDS | `car_premium` | Tesla, BMW iX, etc. |
| 3 | `is_electric == true` AND `body_type == "suv"` | `car_comfort` | BYD Atto 3, etc. |
| 4 | `is_electric == true` AND `body_type` ∈ {hatchback, sedan} | `car_economy` | Nissan Leaf, BYD Dolphin |
| 5 | `wheel_count == 2` AND `engine_cc <= 124` | `bike_basic` | — |
| 6 | `wheel_count == 2` AND `engine_cc <= 149` | `bike_standard` | — |
| 7 | `wheel_count == 2` AND `engine_cc >= 150` | `bike_plus` | — |
| 8 | `wheel_count == 3` AND `body_type == "auto_rickshaw"` AND `fuel_type == "cng"` | `cng` | 3-wheeler ONLY |
| 9 | `seat_count >= 6` AND `body_type` ∈ {van, mpv, minibus, suv_large} | `car_xl` | Body type required |
| 10 | `brand` ∈ LUXURY_BRANDS | `car_premium` | Any CC, any body type |
| 11 | `body_type == "suv"` AND `engine_cc >= 1500` AND `engine_cc <= 2000` | `car_comfort` | SUV bump rule |
| 12 | `body_type == "suv"` AND `engine_cc > 2000` | `car_premium` | Large SUV bump |
| 13 | `(brand, model)` ∈ MODEL_OVERRIDE_TABLE | `override_category` | Admin-configurable exceptions |
| 14 | `engine_cc <= 1000` | `car_compact` | Mini/micro cars |
| 15 | `engine_cc <= 1500` | `car_economy` | Budget cars |
| 16 | `engine_cc <= 2000` | `car_comfort` | Mid-range cars |
| 17 | `engine_cc > 2000` | `car_premium` | Large/displacement cars |

---

## Revised Edge Case Handling

### 5.1 CNG-Converted Petrol Cars (unchanged — was correct)

| Scenario | Rule |
|----------|------|
| Toyota Corolla 1598cc + CNG kit | `car_comfort` (by CC, CNG irrelevant) |
| Honda Civic 1799cc + CNG kit | `car_comfort` |
| CNG-run 4-wheeler taxi (e.g., CNG Alto) | Classify by CC. A 796cc CNG Alto = `car_compact`. The `cng` enum is 3-wheeler-only. |

### 5.2 Locally-Assembled / Rebadged Models (revised)

| Scenario | v1.0 Rule | v2.0 Rule | Rationale |
|----------|-----------|-----------|-----------|
| Toyota Axio (1496cc, JDM, better trim) | `car_economy` | `car_economy` by default, **but** add to `MODEL_OVERRIDE_TABLE` → `car_comfort` | CC fails here. Override table is the honest fix. |
| Honda Grace (1497cc, rebadged City) | `car_economy` | `car_economy` | Correct. Same as City. |
| Toyota Belta (1497cc, rebadged Vitz sedan) | `car_economy` | `car_economy` | Correct. |
| Cherry QQ rebadged as local brand | Use factory CC | Use factory CC + `MODEL_OVERRIDE_TABLE` for known aliases | |

**MODEL_OVERRIDE_TABLE (Seed Data):**

| Brand | Model | Override Category | Reason |
|-------|-------|-------------------|--------|
| Toyota | Axio | `car_comfort` | JDM trim, rider expectation |
| Toyota | Allion | `car_premium` | 1496cc-1797cc variants, premium trim |
| Toyota | Premio | `car_premium` | Premium sedan regardless of CC variant |
| Honda | Grace | `car_economy` | Same as City, no override needed |
| Toyota | Rush | `car_comfort` | SUV body type triggers bump anyway |
| Mitsubishi | Pajero Mini | `car_compact` | 660cc kei car, but SUV body — override keeps it mini |

### 5.3 Very Old Vehicles (revised — added age quality signal)

| Scenario | Category | UI Badge | Pricing Impact |
|----------|----------|----------|----------------|
| 1998 Corolla 1300cc | `car_economy` | "Classic" | Base fare reduced 10% (platform policy) |
| 2005 Maruti 800 796cc | `car_compact` | "Classic" | Base fare reduced 10% |
| 2020 Toyota Vitz 996cc | `car_compact` | None | Standard pricing |
| 1985 Toyota Crown 2000cc | `car_premium` | "Classic" | Base fare reduced 10% |

**Rule:** Age ≥ 15 years does NOT change category. It adds a **"Classic"** UI badge and triggers a platform-configurable pricing floor reduction. This keeps the rules deterministic while signaling quality to riders.

### 5.4 Non-Standard Seat Modifications (unchanged — was correct)

| Scenario | Rule |
|----------|------|
| Tata Nano, rear seat removed | `car_compact` (factory 4 seats) |
| Toyota HiAce, 12 seats installed | `car_xl` (factory 10 seats) |
| Van, seats removed for cargo | Not eligible for passenger rides |
| 3-seat micro car (factory) | `car_compact` if CC ≤ 1000 |

### 5.5 Electric Vehicles (NEW)

| Scenario | Classification | Notes |
|----------|----------------|-------|
| Tesla Model 3 (electric, 5 seats, sedan) | `car_premium` | Luxury brand rule |
| BYD Dolphin (electric, 5 seats, hatchback) | `car_economy` | EV hatchback default |
| BYD Atto 3 (electric, 5 seats, SUV) | `car_comfort` | EV SUV → comfort minimum |
| BMW iX (electric, 5 seats, SUV) | `car_premium` | Luxury brand rule |
| Nissan Leaf (electric, 5 seats, hatchback) | `car_economy` | EV hatchback default |
| Toyota HiAce EV (electric, 10 seats, van) | `car_xl` | Seat + body type rule |
| Electric auto-rickshaw (3 wheels, CNG replacement) | `cng` | Same rider experience, same category |

### 5.6 SUVs and Crossovers (NEW)

| Vehicle | CC | Body Type | v1.0 Category | v2.0 Category | Reason |
|---------|-----|-----------|---------------|---------------|--------|
| Toyota Rush | 1496 | suv | `car_economy` | `car_comfort` | SUV bump: ≥1500cc → minimum comfort |
| Honda CR-V | 1997 | suv | `car_comfort` | `car_comfort` | No change, already correct |
| Toyota RAV4 | 2487 | suv | `car_premium` | `car_premium` | >2000cc rule |
| Suzuki Vitara | 1586 | suv | `car_comfort` | `car_comfort` | SUV bump |
| Mitsubishi Pajero Mini | 660 | suv | `car_compact` | `car_compact` | Override table keeps it mini |
| Hyundai Creta | 1497 | suv | `car_economy` | `car_comfort` | SUV bump |

### 5.7 Missing / Incomplete Data (revised)

| Missing Field | Fallback | If Still Missing |
|---------------|----------|------------------|
| `engine_cc` | BRTA registration document | HOLD for manual review |
| `seat_count` | Factory spec from model DB | HOLD |
| `body_type` | Infer from model name + image | HOLD |
| `year` | Registration year | HOLD |
| `fuel_type` | Default: petrol (cars/bikes), cng (3-wheelers) | — |
| `is_electric` | Default: false | — |
| `wheel_count` | Infer from body_type (motorcycle=2, auto_rickshaw=3, else=4) | — |

---

## Revised Category Detail Specifications

### car_compact — "Mini Car" (revised)

| Attribute | Specification |
|-----------|--------------|
| **Target Use-Case** | 1–3 passengers, short trips, ultra-budget enclosed car, minimal luggage. The step up from CNG for riders who want a roof. |
| **Seat Count** | 3–4 passengers (factory) |
| **Engine CC Range** | ≤1000cc |
| **Fuel Type** | Petrol or CNG-converted |
| **Body Type** | Hatchback or micro-sedan |
| **Age Quality Signal** | ≥15 years → "Classic" badge + reduced pricing floor |
| **Example Models** | Tata Nano (624cc), Maruti 800 (796cc), Cherry QQ (812cc), Toyota Pixis (996cc), Suzuki Alto 800 (796cc), Toyota Vitz 1.0 (996cc) |
| **Typical Fare Position** | Budget-Car tier (between CNG and Economy) |

**Honest Note:** A 996cc Toyota Vitz (modern, with AC) and a 624cc Tata Nano (no AC, cramped) share this tier. The `MODEL_OVERRIDE_TABLE` can bump a modern Vitz to `car_economy` if the platform chooses. Without the override, both are Mini Car — which is technically correct by CC but experientially imperfect.

### car_economy — "Economy Car" (revised)

| Attribute | Specification |
|-----------|--------------|
| **Target Use-Case** | 1–4 passengers, daily commute, basic AC (may be weak in old cars), standard luggage |
| **Seat Count** | 4–5 passengers |
| **Engine CC Range** | 1001–1500cc |
| **Fuel Type** | Petrol or CNG-converted |
| **Body Type** | Hatchback, sedan, or small SUV (but SUV ≥1500cc gets bumped to Comfort) |
| **Age Quality Signal** | ≥15 years → "Classic" badge |
| **Example Models** | Toyota bB (1296cc), Suzuki Swift (1197cc), Mitsubishi Mirage (1193cc), Nissan March (1198cc), Toyota Probox (1296cc), Honda City (1497cc), Toyota Corolla XLi (1398cc), Toyota Axio (1496cc — if not overridden) |
| **Typical Fare Position** | Mid-Low tier |

### car_comfort — "Comfort Car" (revised)

| Attribute | Specification |
|-----------|--------------|
| **Target Use-Case** | 1–4 passengers, business/comfort rides, reliable AC, smooth suspension |
| **Seat Count** | 4–5 passengers |
| **Engine CC Range** | 1501–2000cc OR SUV ≥1500cc |
| **Fuel Type** | Petrol or CNG-converted |
| **Body Type** | Sedan, crossover, or SUV |
| **Age Quality Signal** | ≥15 years → "Classic" badge |
| **Example Models** | Toyota Corolla GLi (1598cc), Honda Civic (1597–1799cc), Toyota Belta (1497cc), Toyota Fielder (1496cc), Mitsubishi Lancer (1597cc), Toyota Rush (1496cc — SUV bump), Hyundai Creta (1497cc — SUV bump), Toyota Axio (1496cc — override) |
| **Typical Fare Position** | Mid tier |

### car_premium — "Premium Car" (revised)

| Attribute | Specification |
|-----------|--------------|
| **Target Use-Case** | 1–4 passengers, executive/business rides, premium AC, leather seats, superior comfort |
| **Seat Count** | 4–5 passengers |
| **Engine CC Range** | >2000cc OR any (luxury brand) OR SUV >2000cc |
| **Fuel Type** | Petrol, CNG-converted, or Electric |
| **Body Type** | Sedan, SUV, or crossover |
| **Age Quality Signal** | ≥15 years → "Classic" badge (even premium cars age) |
| **Luxury Brands** | BMW, Mercedes-Benz, Audi, Lexus, Jaguar, Volvo, Land Rover, Porsche, Tesla, Mini |
| **Example Models** | Toyota Premio (1797cc), Toyota Allion (1797cc), Honda Accord (1997–2356cc), Toyota Camry (2487cc+), BMW 3-Series (1998cc+), Mercedes C-Class (1991cc+), Lexus ES (2487cc+), Tesla Model 3, Toyota RAV4 (2487cc), BMW iX |
| **Typical Fare Position** | High tier |

---

## Age / Quality Modifier (NEW)

Age does NOT change the enum category. It adds a parallel **quality tier** that affects pricing and UI.

| Vehicle Age | Quality Label | Pricing Impact | UI Badge |
|-------------|---------------|----------------|----------|
| < 5 years | "New" | +0% | None |
| 5–9 years | "Good" | +0% | None |
| 10–14 years | "Mature" | +0% | None |
| ≥ 15 years | "Classic" | -10% pricing floor (configurable) | "Classic" pill badge on vehicle card |

**Why:** A 1998 Corolla in `car_economy` is not the same as a 2020 Corolla in `car_economy`. Riders should know. Drivers of old cars should not be penalized by category demotion (which hurts their long-term profile), but the platform can adjust pricing expectations.

---

## Enum Impact Assessment (Revised)

| Question | Answer |
|----------|--------|
| **New enum values?** | **YES — `car_compact`** (same as v1.0) |
| **Existing enums changed?** | NO |
| **New DB columns needed?** | YES — `vehicles.year` (if not exists), `vehicles.is_electric` (boolean, default false), `vehicles.body_type` (if not exists) |
| **New table needed?** | YES — `vehicle_model_overrides` (brand, model, override_category, reason, created_by, created_at) |
| **Pricing tier updates?** | YES — new row for `car_compact` + "Classic" modifier logic |
| **Dispatch logic impact?** | Minimal — add `car_compact` to type filter |
| **Rider app impact?** | YES — "Mini Car" card in Services Hub + vehicle selection |
| **Driver app impact?** | YES — Add Vehicle gets "Mini Car" option |
| **Admin panel impact?** | YES — Vehicle Models CRUD + new Override Table screen |
| **Backward compatibility?** | Full. Historical rides unaffected. Existing vehicles stay in their category. |

---

## Summary Comparison: v1.0 vs v2.0

| Aspect | v1.0 | v2.0 |
|--------|------|------|
| Name | "Compact Car" | **"Mini Car"** |
| Cutoff | ≤1000cc | ≤1000cc (same) |
| Year/age | Ignored | **"Classic" badge + pricing modifier** |
| SUVs | Classified by CC only | **SUV bump rule** (≥1500cc → min Comfort) |
| EVs | Not addressed | **Full EV branch** |
| Rebadged models | "Use CC" | **CC + `MODEL_OVERRIDE_TABLE`** |
| `car_xl` | ≥6 seats | **≥6 seats + van/mpv/minibus/suv_large body** |
| Determinism | 100% | **95% deterministic + 5% auditable overrides** |
| Honesty | CC = comfort | **CC = best verifiable proxy, acknowledged limitations** |

---

## Quick Reference: Input → Category (v2.0)

| Brand | Model | Year | CC | Seats | Body | Fuel | Electric | → Category | Quality |
|-------|-------|------|-----|-------|------|------|----------|-----------|---------|
| Hero | Splendor | 2022 | 97 | 1 | motorcycle | petrol | false | `bike_basic` | New |
| Honda | Shine | 2023 | 124 | 1 | motorcycle | petrol | false | `bike_standard` | New |
| Bajaj | Pulsar NS160 | 2023 | 160 | 1 | motorcycle | petrol | false | `bike_plus` | New |
| TVS | King | 2022 | 200 | 3 | auto_rickshaw | cng | false | `cng` | New |
| Tata | Nano | 2015 | 624 | 4 | hatchback | petrol | false | `car_compact` | New |
| Maruti | 800 | 2005 | 796 | 4 | hatchback | petrol | false | `car_compact` | Classic |
| Toyota | Vitz | 2020 | 996 | 5 | hatchback | petrol | false | `car_compact` | New |
| Toyota | bB | 2018 | 1296 | 5 | hatchback | petrol | false | `car_economy` | New |
| Honda | City | 2020 | 1497 | 5 | sedan | petrol | false | `car_economy` | New |
| Toyota | Axio | 2019 | 1496 | 5 | sedan | petrol | false | `car_comfort` | New |
| Toyota | Corolla GLi | 2019 | 1598 | 5 | sedan | cng_conv | false | `car_comfort` | New |
| Toyota | Rush | 2021 | 1496 | 7 | suv | petrol | false | `car_comfort` | New |
| Honda | Civic | 2020 | 1799 | 5 | sedan | cng_conv | false | `car_comfort` | New |
| Toyota | Premio | 2021 | 1797 | 5 | sedan | petrol | false | `car_premium` | New |
| BMW | 320i | 2022 | 1998 | 5 | sedan | petrol | false | `car_premium` | New |
| Mercedes | C200 | 2021 | 1991 | 5 | sedan | petrol | false | `car_premium` | New |
| Toyota | HiAce | 2020 | 2982 | 10 | van | diesel | false | `car_xl` | New |
| Toyota | Noah | 2019 | 1987 | 7 | mpv | petrol | false | `car_xl` | New |
| Tesla | Model 3 | 2023 | — | 5 | sedan | electric | true | `car_premium` | New |
| BYD | Dolphin | 2023 | — | 5 | hatchback | electric | true | `car_economy` | New |
| BYD | Atto 3 | 2023 | — | 5 | suv | electric | true | `car_comfort` | New |
| Honda | CR-V | 2022 | 1997 | 5 | suv | petrol | false | `car_comfort` | New |
| Hyundai | Creta | 2022 | 1497 | 5 | suv | petrol | false | `car_comfort` | New |
| Toyota | Corolla | 1998 | 1300 | 5 | sedan | petrol | false | `car_economy` | Classic |
