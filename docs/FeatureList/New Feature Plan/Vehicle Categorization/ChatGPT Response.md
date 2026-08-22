Based on the current Ride design, I would **extend the existing 8 categories rather than replace them**. The main structural problem is that `car_economy` is currently doing too much work: a tiny 660–1000cc city car and a 1300–1500cc conventional sedan are materially different passenger products.

The existing product architecture already treats the vehicle type as a fixed enum and currently exposes the eight vehicle types in the vehicle-type-change flow.  The current Add Vehicle UI likewise presents only Bike, CNG, Car and Car XL as broad input types, while the backend ultimately uses the more granular vehicle-type enum. 

## Recommended Dhaka vehicle taxonomy

**Recommendation: 9 categories. Add `car_compact`.**

| Category / `vehicle_type` | Passenger positioning / use case                                                             |             Seats* |                                              Engine cc | Fuel constraints                                  | Typical Bangladesh examples                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------- | -----------------: | -----------------------------------------------------: | ------------------------------------------------- | --------------------------------------------------------------------------------- |
| **bike_basic**            | Lowest-cost solo/one-passenger urban trips; maximum availability                             |        1 passenger |                                                      — | Petrol / CNG / electric motorcycle allowed        | Hero Splendor, Bajaj Platina, TVS Metro, Honda Dream                              |
| **bike_standard**         | Mainstream motorcycle ride; balance of comfort, performance and price                        |        1 passenger |                                                      — | Petrol / electric                                 | Honda CB Shine, Bajaj Discover, TVS Apache 160, Yamaha SZ-R                       |
| **bike_plus**             | Higher-performance / newer motorcycle; longer urban trips and passengers willing to pay more |        1 passenger |                                                      — | Petrol / electric                                 | Yamaha FZ, Yamaha MT-15, Honda CB Hornet, Suzuki Gixxer                           |
| **cng**                   | Dedicated Dhaka CNG auto-rickshaw product; cheapest multi-passenger 3-wheeler                | **2–3 passengers** |                                      100–250cc typical | **Factory CNG / approved CNG auto-rickshaw only** | Bajaj RE, Piaggio Ape, TVS King                                                   |
| **car_compact** **NEW**   | Ultra-budget enclosed car; short urban trips; small footprint and low operating cost         |     2–4 passengers |                                            **≤1000cc** | Petrol / CNG-converted petrol / hybrid / EV       | Suzuki Alto, Daihatsu Mira, Suzuki Wagon R 660/1000, Toyota Vitz/Yaris 1000-class |
| **car_economy**           | Standard affordable private car; default car category for ordinary Dhaka trips               |     4–5 passengers |                                        **1001–1500cc** | Petrol / CNG-converted petrol / hybrid / diesel   | Toyota Corolla 1.3/1.5, Toyota Axio 1.5, Honda City 1.5, Nissan Sunny             |
| **car_comfort**           | Better cabin, space, ride quality and/or newer mainstream car; business/premium-economy use  |     4–5 passengers |                                        **1501–2000cc** | Petrol / CNG-converted petrol / hybrid / diesel   | Toyota Premio 1.8, Toyota Allion 1.8, Honda Civic 1.8, Toyota Corolla 1.8         |
| **car_premium**           | Executive/luxury experience; higher-quality interior, refinement and brand positioning       |     4–5 passengers | **>2000cc OR registered premium-model classification** | No blanket fuel restriction                       | Toyota Camry, Mercedes-Benz C-Class, BMW 3 Series, Toyota Harrier                 |
| **car_xl**                | Families/groups requiring materially more passenger capacity                                 | **6–9 passengers** |                                                    Any | Petrol / CNG-converted petrol / hybrid / diesel   | Toyota Noah, Toyota Hiace, Toyota Sienta, Honda Stepwgn, Mitsubishi Xpander       |

*For ride matching, **passenger capacity** should be used, not the manufacturer's nominal total seating capacity. Driver seat is excluded.

### Why I would add `car_compact`

I would **not** simply put sub-1001cc vehicles into `car_economy`.

A 660–1000cc Alto/Mira/Wagon R is fundamentally different from a Corolla/Axio/City:

* substantially smaller cabin;
* lower luggage capacity;
* lower highway performance;
* lower operating cost;
* different passenger expectations;
* different fare economics.

It is therefore a legitimate **product category**, not merely a technical classification.

This also gives Ride a useful future pricing structure:

**Bike Basic → Bike Standard → Bike Plus → CNG → Compact → Economy → Comfort → Premium → XL**

The categories become much easier for a passenger to understand.

---

# Deterministic classification rules

The important point is that **engine displacement alone should not determine every category**.

The vehicle registry should contain a canonical classification for every recognized brand/model/generation, with the algorithm applying rules in a fixed order.

### Rule 0 — Normalize the vehicle identity

Before classification:

`brand + model + year` → canonical vehicle model record.

Normalize:

* spelling variations;
* local-market names;
* generation/facelift;
* rebadged vehicles;
* locally assembled versions;
* imported versions.

The classification engine should never depend on the driver's free-text description of the vehicle.

---

## Rule 1 — Determine vehicle family

Use `body_type` + canonical model record.

| Condition                                                   | Result                      |
| ----------------------------------------------------------- | --------------------------- |
| Motorcycle/scooter                                          | Bike family                 |
| Approved 3-wheel CNG auto-rickshaw                          | `cng`                       |
| Passenger car, hatchback, sedan, wagon, crossover, SUV, MPV | Car family                  |
| Commercial/passenger van                                    | Car/XL family if approved   |
| Anything else                                               | Manual vehicle verification |

This prevents a **CNG-converted car** from accidentally becoming `cng`.

---

## Rule 2 — Bikes

Within motorcycle family:

| Rule             | Category        |
| ---------------- | --------------- |
| Engine ≤125cc    | `bike_basic`    |
| Engine 126–160cc | `bike_standard` |
| Engine >160cc    | `bike_plus`     |

If the platform wants to avoid engine-based pricing for bikes later, the same model registry can override this using model class. But the above is deterministic and has no overlap.

---

## Rule 3 — CNG

A vehicle is `cng` **only if all are true**:

1. `body_type = auto_rickshaw`;
2. it is an approved passenger three-wheeler;
3. it is registered/approved for CNG operation.

Therefore:

> Toyota Corolla + petrol + aftermarket CNG kit ≠ `cng`.

It remains a **car category**.

This distinction is important because the current product already treats CNG as a distinct vehicle type in its vehicle selection and vehicle management model. 

---

# Rule 4 — Cars: XL first

For passenger cars/vans:

### `car_xl`

Assign `car_xl` when:

**usable passenger seats ≥6**

AND the vehicle is an approved passenger MPV/SUV/van/wagon body type.

This must happen **before engine-based car classification**.

For example:

* Toyota Noah 2000cc → `car_xl`
* Toyota Sienta 1500cc → `car_xl`
* Mitsubishi Xpander 1500cc → `car_xl`

They must **not** fall into Economy merely because they have a 1500cc engine.

---

# Rule 5 — Compact

For non-XL passenger cars:

**Engine ≤1000cc → `car_compact`**

Examples:

* Alto 660 → Compact
* Mira 660 → Compact
* Wagon R 660 → Compact
* 1000cc small hatchback → Compact

This is the key new tier.

---

# Rule 6 — Economy

For non-XL cars:

**1001–1500cc → `car_economy`**

Examples:

* Corolla 1.3 → Economy
* Axio 1.5 → Economy
* Honda City 1.5 → Economy

---

# Rule 7 — Comfort

For non-XL cars:

**1501–2000cc → `car_comfort`**

Examples:

* Premio 1.8 → Comfort
* Allion 1.8 → Comfort
* Civic 1.8 → Comfort

However, there is an important exception.

---

# Rule 8 — Premium requires a model-level classification

Do **not** define Premium simply as:

> `engine_cc > 2000`

That would produce bad results.

For example, a large-engine mainstream vehicle does not automatically provide a premium passenger experience.

Instead:

### Premium if:

`canonical_model.class = premium`

**OR**

`engine_cc > 2000 AND canonical_model is not classified as economy/comfort/XL`

The model registry should explicitly identify premium vehicles.

This allows:

* Toyota Camry → Premium
* Mercedes C-Class → Premium
* BMW 3 Series → Premium

while preventing an arbitrary 2000+cc utility vehicle from becoming Premium.

---

# Final classification precedence

The actual deterministic decision tree should therefore be:

| Priority | Condition                                                         | Result                                   |
| -------: | ----------------------------------------------------------------- | ---------------------------------------- |
|        1 | Approved motorcycle                                               | Determine Bike Basic/Standard/Plus by cc |
|        2 | Approved CNG auto-rickshaw                                        | `cng`                                    |
|        3 | Passenger vehicle with ≥6 usable seats and approved XL body class | `car_xl`                                 |
|        4 | Canonical model explicitly classified Premium                     | `car_premium`                            |
|        5 | Car ≤1000cc                                                       | `car_compact`                            |
|        6 | Car 1001–1500cc                                                   | `car_economy`                            |
|        7 | Car 1501–2000cc                                                   | `car_comfort`                            |
|        8 | Car >2000cc not otherwise classified                              | `car_premium`                            |
|        9 | No rule matches / insufficient authoritative data                 | **Admin verification required**          |

That ordering eliminates overlap.

---

# Edge cases

## 1. CNG-converted petrol cars

This needs to be explicit in the data model.

### Example

**Toyota Corolla 1.5 petrol + aftermarket CNG kit**

→ `car_economy`

**Toyota Premio 1.8 petrol + CNG kit**

→ `car_comfort`

**Never → `cng`**

`cng` describes the **vehicle class**, not merely its current fuel.

Otherwise you would incorrectly classify thousands of Bangladeshi passenger cars as CNG auto-rickshaws.

---

## 2. Locally assembled / rebadged vehicles

Use the **canonical vehicle model**, not the assembly location.

For example:

> Locally assembled Toyota model = same classification as the corresponding Toyota model.

The registry should contain:

| Field             | Purpose                   |
| ----------------- | ------------------------- |
| `canonical_brand` | Normalized manufacturer   |
| `canonical_model` | Normalized model          |
| `generation`      | Generation/facelift       |
| `market_variant`  | Bangladesh/import variant |
| `assembly_origin` | Local/imported            |
| `classification`  | Final product category    |

Assembly origin should **not independently change passenger category**.

---

## 3. Very old vehicles

Do **not** reject a 10–20-year-old vehicle merely because its specification isn't found in a current catalogue.

Use the vehicle's actual verified attributes:

* model;
* manufacturing year;
* engine cc;
* body type;
* seating capacity.

For example:

> 2008 Toyota Corolla 1.5, 5 seats → `car_economy`

It does not become unclassifiable just because Toyota no longer sells that exact generation.

However, **vehicle category and vehicle eligibility are separate decisions**.

A 2008 Corolla can be classified as Economy while separately failing Ride's age/fitness/roadworthiness eligibility rules.

That separation is important.

---

## 4. Non-standard seat modifications

Do **not** allow drivers to self-declare seating capacity.

Use the **legally approved seating capacity** from the vehicle registration/documentation.

### Example: microcar modified to three passenger seats

If the registration says 4 occupants including driver:

→ passenger capacity = 3.

It can remain `car_compact`.

If somebody physically adds/removes seats but the modification is not legally approved:

→ ignore the modification for classification and send the vehicle to verification.

### Extra jump seats in a van

Same principle.

A van with factory/legally approved 7 passenger seats:

→ `car_xl`.

A 5-seat vehicle with two homemade jump seats:

→ still treated as 5-seat for classification.

This prevents drivers from manipulating category eligibility by physically adding seats.

---

# One important architectural change

I would **not make the enum itself the source of truth for vehicle classification**.

Instead, distinguish:

### Vehicle specification

```text
brand
model
generation
manufacturing_year
engine_cc
fuel_type
body_type
approved_seat_count
```

from:

### Ride category

```text
vehicle_type
```

The category is **derived from the specification + classification registry**.

This is especially important because the current system already has a vehicle-type enum used by the vehicle-type-change endpoint, and that endpoint validates `new_vehicle_type` against `lib/vehicleTypes.ts`. 

---

# Required enum change

## Yes — add one new enum value

Current:

```text
bike_basic
bike_standard
bike_plus
cng
car_economy
car_comfort
car_premium
car_xl
```

Recommended:

```text
bike_basic
bike_standard
bike_plus
cng
car_compact       ← NEW
car_economy
car_comfort
car_premium
car_xl
```

So the platform moves from **8 → 9 passenger-facing vehicle categories**.

The existing Plan 05 specification explicitly refers to the "8 enum values from `lib/vehicleTypes.ts`."  Therefore, adding `car_compact` is a **schema/application enum change**, not something that can be achieved merely by changing labels in the UI.

### I would not add additional categories right now

In particular, I would **not** add:

* `car_micro`
* `car_standard`
* `car_luxury`
* `car_suv`
* `car_mp v`
* `cng_plus`
* `bike_scooter`

at this stage.

Those introduce complexity without creating sufficiently distinct passenger products in Dhaka.

The **9-category model is a better launch taxonomy**: compact creates the one meaningful missing car tier, while XL remains capacity-based and Premium remains model/classification-based rather than being distorted by engine size.
