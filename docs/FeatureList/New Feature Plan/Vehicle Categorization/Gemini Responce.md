The current fixed 8-category structure is highly recognizable but slightly misaligned with Dhaka’s actual vehicle ecosystem.

### 1. Market Evaluation: The Current 8 Categories

* **Redundant:** The three-tier bike system (`bike_basic`, `bike_standard`, `bike_plus`) is overly fragmented for Dhaka. Most two-wheeler passengers prioritize immediate availability in traffic over engine displacement, making the lowest tier virtually indistinguishable from the middle tier in utility.
* **Missing Segment:** A massive portion of Dhaka’s four-wheeler fleet consists of sub-1000cc compact hatchbacks. Lumping an 800cc vehicle into `car_economy` alongside a 1300cc/1500cc sedan creates passenger expectation mismatches and prevents the platform from offering a highly competitive, rock-bottom car fare to compete with three-wheelers.
* **Conclusion:** The framework requires an enum modification to stay at 8 categories. We must **deprecate `bike_basic**` (folding its logic into standard) and **add `car_lite**` (for sub-1000cc vehicles).

---

### 2. Proposed Framework

Requires modifying platform enum values: `- bike_basic`, `+ car_lite`. Total categories remain 8.

| Category Name | Target Passenger Use-Case | Pax Seats | Engine CC Range | Fuel Constraints | Example Models in BD |
| --- | --- | --- | --- | --- | --- |
| **`bike_standard`** | Solo commuter, budget-conscious | 1 | < 150cc | None | Bajaj Platina, TVS Metro, Hero Splendor |
| **`bike_plus`** | Solo commuter, comfort/speed | 1 | ≥ 150cc | None | Yamaha FZ-S, Suzuki Gixxer, TVS Apache |
| **`cng`** | 1-2 pax, short distance, airy | 2-3 | N/A | CNG/LPG/Electric | Bajaj RE, Piaggio Ape, Atul |
| **`car_lite`** *(New)* | 1-3 pax, tight alleys, lowest fare | 3-4 | < 1000cc | None | Suzuki Alto, Daihatsu Mira, Maruti WagonR |
| **`car_economy`** | 1-4 pax, everyday utility | 4 | 1000 – 1349cc | None | Toyota Vitz, Toyota Probox, Nissan Sunny |
| **`car_comfort`** | 1-4 pax, reliable sedan, good A/C | 4 | 1350 – 1500cc | None | Toyota Axio, Toyota Fielder, Honda Grace |
| **`car_premium`** | 1-4 pax, corporate/status, luxury | 4 | > 1500cc* | Strict Petrol/Hybrid* | Toyota Premio, Toyota Allion, Honda Civic |
| **`car_xl`** | 5-7 pax, group outings, airport | 6-8 | > 1400cc | None | Toyota Noah, Toyota HiAce, Mitsubishi Xpander |

**Premium models in Bangladesh (like the Premio and Allion) are technically 1496cc. They require a model-specific override flag to be placed in Premium rather than Comfort.*

---

---

### 3. Deterministic Classification Rules

The assignment engine evaluates the following rules sequentially (top-to-bottom). The first condition met locks the category, ensuring no overlaps.

**Variables Used:**

* `age` = Current Year - `manufacturing_year`
* `premium_flag` = Boolean (True if `model` is in a pre-defined luxury list: Premio, Allion, Civic, Vezel, Harrier, Prado, CR-V, etc.)

**The Logic Sequence:**

1. **Two-Wheelers:** If `body_type` is motorcycle or scooter:
* If engine ≥ 150cc $\rightarrow$ **`bike_plus`**
* Else $\rightarrow$ **`bike_standard`**


2. **Three-Wheelers:** If `body_type` is three_wheeler OR `model` is Auto Rickshaw $\rightarrow$ **`cng`**
3. **High Capacity (XL):** If `seat_count` ≥ 6 OR `body_type` is microbus/van $\rightarrow$ **`car_xl`**
4. **Premium Cars:** If `premium_flag` is True OR engine > 1500cc:
* If `age` > 10 years $\rightarrow$ **`car_comfort`** *(Downgrade due to age)*
* Else $\rightarrow$ **`car_premium`**


5. **Micro / Lite Cars:** If engine < 1000cc AND `body_type` is hatchback $\rightarrow$ **`car_lite`**
6. **Comfort Cars:** If engine is between 1350cc and 1500cc:
* If `age` > 12 years $\rightarrow$ **`car_economy`** *(Downgrade due to age)*
* Else $\rightarrow$ **`car_comfort`**


7. **Economy Cars:** If engine is between 1000cc and 1349cc $\rightarrow$ **`car_economy`**
8. **Fallback:** Anything remaining $\rightarrow$ **`car_economy`**

---

### 4. Edge Cases & Market Reality

* **CNG-Converted Petrol Cars:** Widespread in Dhaka. The framework is strictly fuel-agnostic for tier assignment to keep classification deterministic. However, platform policy should dictate that if a `car_premium` has a massive 60L+ CNG cylinder occupying >50% of the trunk, it loses its airport-run utility. This relies on driver declaration or rider complaints to manually downgrade to `car_comfort`.
* **Locally Assembled / Rebadged:** Vehicles from brands like Pragoti, PHP, or Walton do not need special rules. They fall predictably into `car_economy` or `car_xl` based purely on their CC and passenger seat count.
* **Very Old Vehicles (10+ Years):** Handled inherently by the age depreciation logic (e.g., a 15-year-old Toyota Premio automatically downgrades from Premium to Comfort). Any vehicle older than 20 years should bypass categorization entirely and trigger a hard platform ban for safety and emissions standards.
* **Non-Standard Seat Modifications:**
* *Microcars:* 3-seat microcars (where a seat was removed for luggage) are assigned to `car_lite` due to their sub-1000cc engines.
* *Vans:* Adding extra jump seats to a Toyota Noah (e.g., claiming 9 seats) does not upgrade the category beyond `car_xl` because the rule evaluates `seat_count ≥ 6`.



---

See how the classification logic branches dynamically:

See D:\My Projects\Current Project\Ride\docs\FeatureList\New Feature Plan\Vehicle Categorization\Dhaka Vehicle Classification by Gemini.png

or


graph TD
    Start([Vehicle Specs Input]) --> Type{Vehicle Type?}

    %% Two-Wheelers
    Type -->|Motorcycle / Scooter| BikeCC{Engine CC?}
    BikeCC -->|>= 150cc| BikePlus[bike_plus]
    BikeCC -->|< 150cc| BikeStd[bike_standard]

    %% Three-Wheelers
    Type -->|Three Wheeler / Auto Rickshaw| CNG[cng]

    %% Four+ Wheelers
    Type -->|4+ Wheels| Seats{Seats >= 6 <br/> or Van/Microbus?}
    Seats -->|Yes| CarXL[car_xl]
    
    %% Passenger Cars
    Seats -->|No| PremiumCheck{Premium Model Flag <br/> OR CC > 1500?}
    
    PremiumCheck -->|Yes| PremiumAgeCheck{Age > 10 Years?}
    PremiumAgeCheck -->|Yes| ComfFallback1[car_comfort]
    PremiumAgeCheck -->|No| CarPremium[car_premium]

    PremiumCheck -->|No| LiteCheck{CC < 1000 <br/> AND Hatchback?}
    LiteCheck -->|Yes| CarLite[car_lite]

    LiteCheck -->|No| ComfortCheck{CC 1350 - 1500?}
    ComfortCheck -->|Yes| ComfortAgeCheck{Age > 12 Years?}
    ComfortAgeCheck -->|Yes| EcoFallback1[car_economy]
    ComfortAgeCheck -->|No| CarComfort[car_comfort]

    ComfortCheck -->|No| EcoFallback2[car_economy]

    %% Styling to highlight the final categories
    classDef category fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#000;
    class BikePlus,BikeStd,CNG,CarXL,ComfFallback1,CarPremium,CarLite,EcoFallback1,CarComfort,EcoFallback2 category;
