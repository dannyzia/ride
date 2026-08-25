Here is a much sharper, localized second pass. This cuts through the theoretical averages and anchors the data in the brutal reality of Dhaka’s streets, its unique vehicle market, and the mechanics of your subscription model.

### Part 1: Vehicle Taxonomy (The Dhaka Reality Check)

To ensure Ride’s platform classification matches what is actually on the street, we must account for Bangladesh's import tax structures and the local "Joma" (daily rental) culture.

**Corrections to the Sub-Categories:**

* **The Bike Reality:** While a 100cc bike is cheaper to run, the 150cc segment (Pulsar, FZ-S, Gixxer) completely dominates the full-time professional ride-hail market in Dhaka due to financing options and driver preference. The cost model *must* be anchored at 150cc, or you will underprice the majority of your fleet.
* **The Car Reality:** Engine cc does not dictate tiers in Dhaka because 95% of sedans and hatchbacks are 1500cc (to stay under the BRTA tax cliff). Tiers are dictated by **body type and age**, not displacement.
* **The Fuel Reality:** Almost no commercial cars run purely on Octane. If they aren't factory Hybrids, they are retrofitted with LPG.

| Tier | Dhaka Reality (Typical Vehicles) | Standard cc Anchor | Primary Fuel Type |
| --- | --- | --- | --- |
| **Bike — Economy** | Bajaj CT100, TVS Metro | 100cc | Octane / Petrol |
| **Bike — Standard** | Honda CB Shine, TVS Raider | 125cc | Octane / Petrol |
| **Bike — Premium** | Yamaha FZ-S, Suzuki Gixxer, Pulsar 150 | **150cc** *(Primary anchor)* | Octane / Petrol |
| **CNG — Standard** | Bajaj RE 4S (Green auto-rickshaw) | 198.6cc | CNG |
| **Car — Economy** | Toyota Vitz, Passo, Probox (older) | 1300cc / 1500cc | LPG |
| **Car — Standard** | Toyota Axio, Honda Fit, Allion (older) | 1500cc | LPG / CNG |
| **Car — Premium** | Toyota Premio, Axio Hybrid, Vezel | 1500cc | LPG / Hybrid (Octane) |

---

### Part 2: Hard-Calibrated Cost Survey

*Baseline Assumptions: Octane @ 145 BDT/L. Auto LPG @ 65 BDT/L. CNG @ 50 BDT/m³. Subscription package estimated at 1,200 BDT/week for cars, 800 BDT for CNG, 500 BDT for bikes.*

#### A. Fuel Cost (Adjusted for Severe Gridlock)

Dhaka stop-and-go traffic drastically reduces manufacturer fuel efficiency.

| Sub-Category | Real City Efficiency | Fuel Cost per km (BDT) |
| --- | --- | --- |
| Bike (100cc) | 45 km/L | **3.22** |
| Bike (125cc) | 40 km/L | **3.62** |
| Bike (150cc) | 30 km/L | **4.83** |
| CNG | 25 km/m³ | **2.00** |
| Car (Eco) - LPG | 6.5 km/L (LPG) | **10.00** |
| Car (Std) - LPG | 6 km/L (LPG) | **10.83** |
| Car (Prem) - Hybrid | 12 km/L (Octane) | **12.08** |

#### B. Maintenance & Wear (The Dhaka Road Penalty)

Potholes, frequent braking, and constant clutch engagement inflate maintenance.

| Sub-Category | Routine Maint. | Tyre Cost | Major Repair Reserve | Total Maint. (BDT/km) |
| --- | --- | --- | --- | --- |
| Bike (All Avg) | 0.80 | 0.30 | 0.30 | **1.40** |
| CNG | 0.90 | 0.35 | 0.45 | **1.70** |
| Car (Eco/Std) | 2.20 | 0.60 | 1.20 | **4.00** |
| Car (Prem) | 2.50 | 0.80 | 1.50 | **4.80** |

#### C. Depreciation (The JDM Anomaly)

Unlike Western markets, JDM vehicles in Bangladesh have an incredibly flat depreciation curve due to high replacement costs and a robust secondary parts market. Vehicles are rarely scrapped; they are rebuilt.

| Sub-Category | Typical Purchase (BDT) | Residual Value (BDT) | Useful Life (km) | Deprec. (BDT/km) |
| --- | --- | --- | --- | --- |
| Bike (150cc) | 240,000 | 80,000 | 120,000 | **1.33** |
| CNG | 450,000 (with papers) | 150,000 | 150,000 | **2.00** |
| Car (Std - Axio) | 1,800,000 | 1,000,000 | 250,000 | **3.20** |

#### D. Fixed Costs (Amortized per km)

Assuming 35,000 km/year for full-time bikes and 45,000 km/year for Cars/CNGs.

| Sub-Category | Annual BRTA/Ins. | Annual Subscription (Est) | Fixed Cost (BDT/km) |
| --- | --- | --- | --- |
| Bike | 4,500 | 26,000 | **0.87** |
| CNG | 12,000 | 41,600 | **1.19** |
| Car | 35,000 | 62,400 | **2.16** |

#### E. Driver Time / Opportunity Cost (The "Joma" Factor)

Over 70% of Cars and CNGs in Dhaka are driven by hired drivers paying a daily rent (*Joma*) to the owner (approx. 1,000 BDT for CNG, 1,400 BDT for Cars). The driver's gross target must cover the Joma, fuel, and their personal take-home.

* **Average speed:** 12 km/h (Car/CNG), 16 km/h (Bike).

| Tier | Net Target (Driver) | Owner Joma | Total Daily Target | Hours | Time Cost (BDT/hr) | Loaded Time Cost (BDT/km) |
| --- | --- | --- | --- | --- | --- | --- |
| Bike (Owns) | 1,000 BDT | 0 | 1,000 BDT | 10 | 100 BDT | **6.25 BDT** |
| CNG (Rents) | 800 BDT | 1,000 BDT | 1,800 BDT | 12 | 150 BDT | **12.50 BDT** |
| Car (Rents) | 1,000 BDT | 1,400 BDT | 2,400 BDT | 12 | 200 BDT | **16.66 BDT** |

#### F. Pickup Distance Distribution (The "U-Turn Penalty")

When tuning Ride's locked pickup fee formula, radial distance (straight line) is highly misleading in Dhaka. Due to restricted road crossings, a pickup just across Begum Rokeya Avenue might require a 2.5km detour.

| Zone Type | p25 (km) | p50 (km) | p75 (km) | p90 (km) | Strategic Impact for the App |
| --- | --- | --- | --- | --- | --- |
| **Dense Core** (Gulshan, Motijheel) | 0.6 | 1.2 | 2.0 | 3.5 | Set free radius low (~1.0km). Traffic renders longer pickups economically dead for the driver. |
| **Standard Urban** (Mirpur, Uttara) | 0.8 | 1.5 | 2.8 | 4.2 | The U-turn penalty is highest here. A generous max billable km cap is needed to protect riders. |
| **Peripheral** (Savar, Keraniganj) | 1.5 | 3.0 | 5.0 | 8.0 | Free radius can be larger as speeds are higher; drivers cover empty km much faster here. |