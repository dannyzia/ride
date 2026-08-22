## Recommendation summary

The current 8 categories are **not fully sufficient** for Dhaka. The main gap is the **sub-1001cc car segment**: Dhaka has a large number of 660cc kei cars and 1.0L hatchbacks that do not fit well in `car_economy`. This framework keeps the existing categories but adds **`car_compact`** as a new enum value.

It also tightens two important definitions:

- **`cng`** is reserved for purpose-built three-wheeler auto-rickshaws, not CNG-converted petrol cars.
- **`car_xl`** is capacity-first: any passenger car/SUV/MPV/van with **6+ certified seats** is `car_xl`.

---

## Proposed category table

| Category | Target passenger use-case | Certified seat count incl. driver | Engine cc range | Fuel type constraints | Typical Bangladesh examples |
|---|---|---|---|---|---|
| `bike_basic` | Solo passenger, shortest low-cost trips | 2 | ≤125 cc | Petrol only | Hero HF 100, Honda CB Shine 125, Bajaj Discover 125, TVS Metro 100, Yamaha Saluto 125 |
| `bike_standard` | Solo passenger, daily commute, better torque | 2 | 126–150 cc | Petrol only | Honda CB Unicorn 150, Bajaj Pulsar 150, Yamaha FZS FI 149, Suzuki Gixxer 150, TVS Apache RTR 150 |
| `bike_plus` | Solo passenger, premium/sport/executive bike | 2 | >150 cc | Petrol only | Yamaha R15 155, Suzuki Gixxer SF 155, Honda CB Hornet 160, KTM Duke 200, Royal Enfield Classic 350 |
| `cng` | 2–3 passengers, low-cost covered point-to-point | 3–4 | 100–200 cc typical; body-type primary | CNG/LPG purpose-built auto-rickshaw only | Bajaj RE, TVS King, Piaggio Ape |
| `car_compact` | 2–3 passengers, short city trips, narrow roads, low-cost car | 4–5 | <1001 cc | Petrol, hybrid, or CNG-converted petrol | Toyota Vitz 1.0, Toyota Passo 1.0, Suzuki Alto 660, Nissan March 1.0, Honda N-Box 660 |
| `car_economy` | 3–4 passengers, standard everyday car | 4–5 | 1001–1500 cc | Petrol, diesel, hybrid, or CNG-converted petrol | Toyota Corolla Axio 1.5, Toyota Probox/Succeed 1.5, Nissan Sunny 1.5, Honda City 1.5, Suzuki Ciaz 1.5 |
| `car_comfort` | 3–4 passengers, better ride, longer/business trips | 4–5 | 1501–2000 cc | Petrol, diesel, hybrid, or CNG-converted petrol | Toyota Premio 1.8, Toyota Allion 1.8, Honda Civic 1.8, Nissan Sylphy 1.8, Subaru Impreza 1.6 |
| `car_premium` | 3–4 passengers, VIP/corporate/high-end | 4–5 | >2000 cc, or premium brand/model override | Petrol, diesel, hybrid | Toyota Camry 2.5, Honda Accord 2.4, Mercedes-Benz C200 2.0, BMW 320i 2.0, Audi A4 2.0 |
| `car_xl` | Families, airport, group travel; 5–10 passengers | 6+ | Any cc; capacity-first | Petrol, diesel, hybrid, or CNG-converted petrol | Toyota Noah 2.0, Toyota Voxy 2.0, Honda Stepwgn 1.5 turbo, Nissan Serena 2.0, Toyota HiAce 2.7 |

---

## Deterministic classification rules

### Inputs

Each vehicle must have:

- `brand`
- `model`
- `model_year`
- `engine_cc`
- `registered_seat_count`
- `body_type`
- `fuel_type`

`registered_seat_count` means the certified/registered total seat count including driver. Physical modifications are not used unless the registration is updated.

### Normalization

- Canonicalize brand/model to OEM names. Locally assembled or rebadged vehicles follow the original OEM model.
- For CNG-converted petrol cars, `engine_cc` is the **original petrol engine cc**, not the CNG displacement.
- `body_type` is normalized into: `motorcycle`, `auto_rickshaw`, or `passenger_car`.

### First-match-wins rules

1. **Reject non-passenger vehicles**  
   If `body_type` is not one of `motorcycle`, `auto_rickshaw`, `hatchback`, `sedan`, `suv`, `mpv`, or `van`, reject the vehicle.

2. **Two-wheelers**  
   If `body_type` is `motorcycle`:
   - `engine_cc ≤ 125` → `bike_basic`
   - `126 ≤ engine_cc ≤ 150` → `bike_standard`
   - `engine_cc > 150` → `bike_plus`

3. **CNG auto-rickshaws**  
   If `body_type` is `auto_rickshaw` → `cng`.  
   This is based on body type, not fuel type. A petrol/CNG-converted sedan is **not** `cng`.

4. **Passenger cars/SUVs/MPVs/vans**  
   If `body_type` is `hatchback`, `sedan`, `suv`, `mpv`, or `van`:
   - **Capacity first:** if `registered_seat_count ≥ 6` → `car_xl`
   - **Premium override:** if `brand` is in `PREMIUM_BRANDS` or `model` is in `PREMIUM_MODELS` → `car_premium`
   - **Engine cc bands:**
     - `engine_cc < 1001` → `car_compact`
     - `1001 ≤ engine_cc ≤ 1500` → `car_economy`
     - `1501 ≤ engine_cc ≤ 2000` → `car_comfort`
     - `engine_cc > 2000` → `car_premium`

5. **Missing engine cc for cars**  
   If `engine_cc` is missing for a car and the car is not otherwise recoverable from registration/import documents, **reject onboarding**. Do not guess.

### Premium override lists

These are config-managed closed lists. If a premium model has 6+ registered seats, rule 4 capacity-first still makes it `car_xl`.

- `PREMIUM_BRANDS` example: Mercedes-Benz, BMW, Audi, Lexus, Volvo, Land Rover, Jaguar, Porsche.
- `PREMIUM_MODELS` example: Toyota Crown, Toyota Harrier, Toyota Land Cruiser 5-seat, Toyota Prado 5-seat, Nissan Skyline, Nissan Fuga, Honda Legend, Mitsubishi Pajero 5-seat.

---

## Edge-case policy

### CNG-converted petrol cars

A CNG-converted petrol car stays in its original car category based on original engine cc.

Examples:

- Toyota Corolla 1.5 petrol converted to CNG → `car_economy`
- Suzuki Alto 660 petrol converted to CNG → `car_compact`

CNG conversion does **not** move a car into `cng`.

### Locally assembled / rebadged models

Use the original OEM model and registered specification. Local badges or assembly names do not change the category.

Example: a locally assembled “PHP Toyota Corolla” is treated as a Toyota Corolla and classified by its actual registered engine cc and seat count.

### Very old vehicles

For vehicles 10+ years old, use the vehicle’s own registration/import documents, not the current production spec sheet. A 1998 Toyota Corolla 1.6 is still `car_comfort` if it has a registered 1600cc engine.

If the old vehicle’s engine cc or seat count cannot be verified, block onboarding rather than guessing.

### Non-standard seat modifications

Classification uses the **registered certified seat count**, not physical modifications.

- Extra jump seats in a van: if the registered seat count is still below 6, the vehicle is **not** `car_xl`.
- If the registered seat count is 6+ but physical seats were reduced, the vehicle still classifies as `car_xl`; the platform may require re-inspection.
- A 3-seat micro car with a car body and engine <1001 cc would classify as `car_compact`, not as a bike or CNG.

---

## Enum change flag

**This framework requires adding one new `vehicle_type` enum value: `car_compact`.**

The other categories fit within the existing enum set, but their definitions should be tightened as described.

Optional future additions, not required now:

- `ev` for pure electric vehicles
- `car_premium_xl` if the platform later wants to separate premium 6+ seat SUVs from standard family vans

Under the current framework, pure electric vehicles are out of scope.
