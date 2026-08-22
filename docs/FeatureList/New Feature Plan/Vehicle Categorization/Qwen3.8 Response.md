# Dhaka Vehicle Categorization Framework — Proposal

## 0. Verdict on the Current 8 Categories

| Current value | Verdict | Reason |
|---|---|---|
| `bike_basic` / `bike_standard` / `bike_plus` | **Keep** | Clean 100/125/150+ cc split matches BD supply (Platina-class vs Shine-class vs Pulsar-class). `bike_plus` has thinner supply but earns its keep as the premium two-wheeler fare tier. |
| `cng` | **Keep** | Homogeneous three-wheeler segment; defined by body, not fuel. |
| `car_economy` | **Overloaded — split** | Today it must absorb both a 660 cc Suzuki Alto and a 1500 cc Corolla Axio. These are not the same passenger experience and Bangladesh's own tax/duty structure draws a hard line at 1000 cc. |
| `car_comfort` / `car_premium` / `car_xl` | **Keep** | Well-separated by cc and body. |

**Conclusion: the framework is missing exactly one segment — a sub-1001 cc `car_mini` tier. No category is redundant. One new enum value is required (Section 5).**

Watch-listed but **not** added (insufficient supply depth in Dhaka today): dedicated EV tier, "Black/Luxury" tier above `car_premium`.

---

## 1. Proposed Categories (9 total)

Ordered as the rider-facing fare ladder (cheapest → most expensive):

| # | Category | Target passenger use-case | Seats (incl. driver) | Engine cc | Fuel constraint | Typical BD examples |
|---|---|---|---|---|---|---|
| 1 | `bike_basic` | Solo commuter, lowest fare, traffic-beating | 2 (1 pillion) | ≤ 110 | Petrol (electric 2-wheelers provisionally here) | Bajaj Platina 100, Bajaj CT 100, TVS Metro R 110, Honda CD 110 Dream, Runner Royal (local) |
| 2 | `bike_standard` | Solo commuter wanting comfort/stability | 2 (1 pillion) | 111 – 150 | Petrol | Honda Shine 125, Bajaj Discover 125, TVS Phoenix 125, Hero Glamour 125, Bajaj Pulsar 150 |
| 3 | `bike_plus` | Longer trips, premium two-wheeler, luggage-on-back | 2 (1 pillion) | ≥ 151 | Petrol | Bajaj Pulsar 220F, TVS Apache RTR 180, Honda CB Hornet 160R, Suzuki Gixxer SF 155, Yamaha MT-15 |
| 4 | `cng` | Short urban trips, 2–3 pax, weather cover at low fare | 3 – 4 | n/a (three-wheeler) | CNG/petrol; electric three-wheelers map here if legalized | Bajaj RE 4S, TVS King, Piaggio Ape City, Mahindra Alfa, locally assembled "baby taxi" |
| 5 | `car_mini` **(NEW)** | 1–2 pax budget AC car; small luggage; AC over space | 4 | ≤ 1000 | Petrol / hybrid | Suzuki Alto (660), Suzuki Cultus 1.0, Suzuki WagonR, Daihatsu Mira e:S, Mitsubishi eK Wagon |
| 6 | `car_economy` | Everyday AC sedan, 3–4 pax, airport-lite | 4 – 5 | 1001 – 1500 | Petrol / hybrid / CNG-converted | Toyota Corolla Axio, Toyota Allion (N160), Hyundai Accent, Nissan Sunny, Suzuki Swift |
| 7 | `car_comfort` | Mid-tier family/office travel, 4 pax comfortably or compact 7-seat MPV | 5 – 7 | sedan/hatch 1501 – 2000; SUV/MPV 1001 – 2000 | Petrol / diesel / hybrid | Toyota Premio, Honda Vezel, Hyundai Elantra, Mitsubishi Xpander, Hyundai Tucson |
| 8 | `car_premium` | Corporate, VIP, long-haul comfort; flagship sedans/SUVs | 5 – 7 | ≥ 2001 (any cc for luxury-brand list) | Petrol / diesel / hybrid | Toyota Camry, Hyundai Santa Fe, Mitsubishi Pajero Sport, Toyota Fortuner, Lexus RX |
| 9 | `car_xl` | Group/airport/family events, 6+ pax with luggage | 7 – 11 (cap 12) | large-MPV ≥ 1700; vans any | Petrol / diesel / hybrid | Toyota Noah/Voxy, Hyundai H-1/Staria, Toyota Hiace, Kia Carnival, Mitsubishi Delica D:5 |

Design notes:
- **Fuel never changes class.** Fuel type is an attribute, not a categorization input (see edge cases).
- **Hybrids classify by ICE engine displacement only** (Aqua 1496 cc → `car_economy`; Prius 1797 cc → `car_comfort`).
- `car_mini` deliberately groups 660 cc kei cars with 1000 cc cars (Cultus, Picanto, 1.0 Vitz) — passenger-space equivalence, and it mirrors the BD import-duty boundary at 1000 cc.
- Body-type is a first-class input: it is what separates an Xpander (1499 cc MPV → `car_comfort`) from an Allion (1499 cc sedan → `car_economy`) without overlapping ranges.

---

## 2. Deterministic Classification Rules

**Inputs (normalized first):** `wheels`, `body_type ∈ {bike, three_wheeler, hatchback, sedan, suv, mpv, van}`, `cc` (integer, rounded; hybrid = ICE cc only), `seats` (manufacturer-certified total incl. driver; aftermarket seats ignored), `brand`, `model`, `year`.

**Rule engine = strictly ordered waterfall; first match wins. Because cc bands are a complete, disjoint partition and the waterfall is total, no input can match two categories.**

| Priority | Condition | Result |
|---|---|---|
| R1 | `wheels = 3` | `cng` |
| R2 | `wheels = 2` AND `cc ≤ 110` | `bike_basic` |
| R3 | `wheels = 2` AND `111 ≤ cc ≤ 150` | `bike_standard` |
| R4 | `wheels = 2` AND `cc ≥ 151` | `bike_plus` |
| R5 | `wheels = 4` AND `seats ≥ 8` | `car_xl` |
| R6 | `wheels = 4` AND `seats = 7` AND `body_type ∈ {mpv, van}` AND `cc ≥ 1700` | `car_xl` |
| R7 | `wheels = 4` AND `cc ≤ 1000` | `car_mini` |
| R8 | `wheels = 4` AND `1001 ≤ cc ≤ 1500` AND `body_type ∈ {sedan, hatchback}` | `car_economy` |
| R9 | `wheels = 4` AND `1001 ≤ cc ≤ 2000` AND `body_type ∈ {suv, mpv}` AND `seats ≤ 7` | `car_comfort` |
| R10 | `wheels = 4` AND `1501 ≤ cc ≤ 2000` AND `body_type ∈ {sedan, hatchback}` | `car_comfort` |
| R11 | `cc ≥ 2001` OR brand ∈ luxury list (Lexus, BMW, Mercedes, Audi, Jeep, Land Rover) | `car_premium` |
| R12 | Fallback (unresolvable specs) | Provisional `car_economy` + manual-review queue |

Supporting rules:

1. **Catalog-first:** a maintained brand+model(+year → trim) catalog resolves cc/seats/body before the waterfall runs. The waterfall is the fallback and the tie-breaker; the two must always agree because the catalog itself is populated using these same rules.
2. **7-seat separation is unambiguous:** a 7-seat SUV (Pajero Sport, 2400 cc) fails R6 (`body_type = suv`) and lands in `car_premium` via R11; a 7-seat Xpander (1499 cc) fails R6 on cc and lands in `car_comfort` via R9; a 7-seat Noah (1800 cc) hits R6. One category each, no overlap.
3. **No upward self-declaration:** drivers cannot pick a category; classification is computed. Disputes go to the review queue.
4. **Eligibility ≠ category:** vehicle-age caps (recommend: cars ≤ 15 yrs, bikes ≤ 8 yrs, CNG ≤ 12 yrs from model year) are a separate onboarding gate and never demote a vehicle's category.

---

## 3. Edge Cases

| Edge case | Treatment |
|---|---|
| **CNG-converted petrol car** | Category **unchanged**. Fuel conversion updates a `fuel_type` attribute only; class is body+cc based. A CNG-converted Allion stays `car_economy`. |
| **Locally assembled / rebadged models** (PHP-assembled Proton, Fair-Technology Hyundai, Rangs Mitsubishi, Runner bikes) | Classified by **actual specs, not assembly origin or badge**. A Proton Saga 1300 cc sedan → `car_economy`. Maintain a brand-alias table so rebadges resolve to one canonical entry. |
| **Very old vehicles (10+ yrs), no current spec sheet** | Use the **original manufacturer spec sheet for that model-year** (most BD older cars are reconditioned JDM imports — use original year, not reconditioning date). If specs are genuinely unknown: registration-certificate values as fallback; if still unresolved → R12 provisional `car_economy` + manual review. Age alone never changes category. |
| **3-seat micro cars** (e.g., 4-seater kei with 3 registered seats) | R7 applies (4-wheeler, ≤ 1000 cc) → `car_mini`. Genuine 2-seat microcars → `car_mini` + mandatory manual review flag. |
| **Extra jump seats in vans** (Hiace modified to 14 seats) | Category uses **manufacturer-certified seat count**, not aftermarket modifications. Platform promises riders the OEM seat layout. Jump seats do not upgrade category and are not advertised. `car_xl` rider-facing seat promise capped at 11. |
| **Engine swaps** | Reclassify on the registered (current) cc; requires document update + re-run of classification. |
| **Electric two/three-wheelers** | Three-wheeler → `cng` (R1 is fuel-agnostic). Two-wheeler → provisional `bike_basic` until an EV power-based rule is warranted. |
| **Boundary cc values** (e.g., 1000 cc exactly, 150 cc exactly) | Bands are inclusive as written (≤1000 is mini; 150 is `bike_standard`, 151 starts plus). cc always rounded to integer before evaluation. |

---

## 4. Enum Impact — Explicit Flag

> ⚠️ **This framework does NOT fit within the existing 8 values. It requires adding one new enum value: `car_mini` (vehicleTypeEnum: 8 → 9).**

Ripple effects to plan (product/DB scope, no code here):

| Area | Change |
|---|---|
| DB enum | Add `car_mini` to `vehicleTypeEnum` via migration; naming stays lowercase snake_case per existing convention |
| Canonical enum source | New value added to the single vehicle-types definition (`lib/vehicleTypes.ts` is the owner today) |
| Rider app | Category selector grows to 9 tiles; fare ladder insert `car_mini` between `cng` and `car_economy` |
| Fare configuration | New per-km/base/minimum fare rows for `car_mini` |
| Packages / subscriptions | `packages.vehicle_type` scoping: existing NULL (universal) packages keep working; decide whether call-package pricing differs for mini cars |
| Dispatch | Vehicle-type filter gains one value; candidate-pool construction unchanged otherwise |
| Incentives | `incentive_definitions.vehicle_type_filter` gains one possible value |
| Admin | Vehicle-model catalog, driver verification, and manual classification screens must support the new value |
| Drivers | Vehicles re-classified: current `car_economy` drivers with ≤ 1000 cc cars move to `car_mini` — **requires a one-time data migration plus driver communication** (their fare tier changes) |

**Option B considered and rejected:** keep 8 enum values and tag sub-1000 cc cars as a `car_economy` sub-class attribute. Rejected because fare config, package scoping, incentives, and dispatch all key off `vehicle_type` — a hidden subclass would create two sources of truth for the same vehicle, the exact anti-pattern the platform's architecture gates exist to prevent.

---

## 5. Summary

- **9 categories**: existing 8 + `car_mini` (sub-1001 cc).
- **Determinism guaranteed** by a total first-match waterfall over a disjoint cc partition plus body-type and seat-count gates — every valid input resolves to exactly one category.
- **Fuel (incl. CNG conversion, hybrid, future EV) is an attribute, never a category driver**; class comes from wheels → seats → body → cc.
- **One new enum value is required**, with a one-time reclassification migration for affected `car_economy` drivers.
