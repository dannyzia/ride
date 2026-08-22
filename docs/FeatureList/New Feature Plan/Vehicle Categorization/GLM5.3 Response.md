# Vehicle Categorization Framework — Dhaka (Revised)

## 1. Verdict on the current 8 categories

| Question | Answer | Rationale |
|---|---|---|
| Redundant? | No | All 8 map to real Dhaka demand/price tiers |
| Missing? | **Yes — a sub-1001cc "car_compact" tier** | Kei cars (660cc) and small cars (≤1000cc) are a large, growing reconditioned-import pool (Alto, Mira, N-Box, Wagon R), carry lower annual BRTA tax, and justify a fare point between CNG and car_economy |
| Bike tiers? | Keep 3, but make thresholds explicit by cc | Prevents driver misclassification disputes |
| car_xl? | Keep single tier, cap at 15 registered seats | Splitting van/microbus adds supply fragmentation without fare benefit today |

**Result: 8 → 9 categories.** Passenger-facing names are unchanged except one addition, minimizing re-education cost.

## 2. Proposed category table

| Category (enum) | Target use-case | Seats (incl. driver) | Engine cc | Fuel constraints | Typical BD models |
|---|---|---|---|---|---|
| bike_basic | Cheapest solo hops, short trips | 2 | 50–110 | Petrol only | TVS Metro Plus, Hero Splendor Plus, Bajaj Discover 100, Runner (local 100–110cc), Honda Dream 110 |
| bike_standard | Daily commute default, pillion comfort | 2 | 111–160 | Petrol only | Honda CB Shine 125, Hero Glamour 125, Bajaj Pulsar 150, Yamaha FZS-FI v3, Suzuki Gixxer 155 |
| bike_plus | Leisure/longer rides, premium two-wheel feel | 2 | ≥161 | Petrol only | Bajaj Pulsar N160/NS200, TVS Apache RTR 200, KTM Duke 200/250, Royal Enfield Classic 350 |
| cng | Budget 3-wheeler trips, monsoon alternative to bike | 3 | ~200–230 (auto-rickshaw) | CNG only | Bajaj RE, TVS King; Bajaj Qute (quadricycle) mapped here by allowlist — see edge cases |
| **car_compact (NEW)** | Cheapest enclosed 4-wheel ride; solo/pairs, short city trips | 2–4 | ≤1000 | Petrol; CNG conversions permitted | Suzuki Alto 660/800, Daihatsu Mira 660, Honda N-Box, Toyota Pixis, Suzuki Wagon R 660/1000, Maruti 800 (legacy) |
| car_economy | Standard sedan/hatch workhorse tier | 4–5 | 1001–1800 | Petrol / hybrid / CNG (dual-fuel) | Toyota Axio 1500/1800, Aqua 1500, Prius 1800, Fielder 1500/1800, Honda City/Grace 1500, Proton Saga 1332 |
| car_comfort | Business travel, AC-assured, newer vehicles; crossovers | 4–5 | 1801–2000 (see SUV rule R5) | Petrol / hybrid; CNG allowed | Toyota Camry 2000, Honda Accord 2000, Toyota Harrier 2000, Toyota Corolla Cross 1800, Honda Vezel 1500, Toyota Rush 1500 |
| car_premium | Weddings, corporate, airport VIP | 4–5 | ≥2001, or luxury-brand allowlist | Petrol/hybrid **only** — no CNG conversions | Toyota Camry 2500, Crown 2500, Mark X 2500, Lexus ES 300h, BMW 3 Series |
| car_xl | Groups 5–8, family outings, extra luggage | 7–15 | 1500–3500 | Petrol/hybrid/CNG/diesel | Toyota Noah/Voxy/Esquire, Nissan Serena, Honda Stepwgn, Toyota Hiace (10–13), Mitsubishi Pajero Sport 7-seat, Proton X70 |

Price ladder (ascending): bike_basic → bike_standard → bike_plus → cng → **car_compact** → car_economy → car_comfort → car_premium; car_xl priced separately (per-seat/vehicle-flat).

## 3. Deterministic classification rules

**Pre-processing (data hygiene, before any rule fires):**
- P1: Normalize brand via alias map (locally assembled/rebadged brands → canonical: "Proton (PHP)", "Hyundai (Fair Group)", "Mitsubishi (Runner/Pragati)" etc.).
- P2: Use **BRTA-registered** cc, seat count, and model year — never physical inspection values. Model spec sheets are a convenience only; rules never depend on them.
- P3: body_type must be one of: motorcycle, scooter, auto_rickshaw, quadricycle, sedan, hatchback, wagon, suv/crossover, mpv, van/minibus. Pickup/body-type not on list → reject.

**Decision cascade — first matching rule wins (guarantees no overlap):**

1. **R1:** body_type = auto_rickshaw → **cng**. body_type = quadricycle (allowlist: Bajaj Qute) → **cng** (policy call; revisit after pilot).
2. **R2:** body_type = motorcycle/scooter → cc ≤110 → **bike_basic**; 111–160 → **bike_standard**; ≥161 → **bike_plus**.
3. **R3:** registered seats ≥7 → **car_xl** (7–15). Seats >15 → reject (bus class, out of scope).
4. **R4:** car AND (cc ≥2001 OR brand in luxury allowlist {Lexus, BMW, Mercedes-Benz, Audi, Volvo, Porsche}) → **car_premium** *candidate*, subject to gates in §G.
5. **R5:** body_type = suv/crossover AND cc ≥1500 → **car_comfort**.
6. **R6:** battery-electric car, non-luxury brand → **car_comfort** (no cc exists; deterministic default).
7. **R7:** cc ≤1000 → **car_compact** (explicitly includes registered 3-seat micro cars; a 3-seat car with cc >1000 → manual review).
8. **R8:** cc 1001–1800 → **car_economy**.
9. **R9:** cc 1801–2000 → **car_comfort**.
10. **R10:** Anything unmatched (e.g., missing cc) → manual review queue; assignment only after ops completes the record.

**Post-assignment gates (§G) — applied to R4 result, in order:**
- **Fuel gate:** premium candidate with primary fuel = CNG → demote to **car_comfort**.
- **Age gate:** car_premium requires model year ≥ (current year − 10); car_comfort ≤15 yrs; car_economy/car_compact/car_xl ≤20 yrs; bikes ≤15 yrs; auto-rickshaws ≤15 yrs. Demotion is one step at a time (premium→comfort→economy; stops at the cc-consistent floor). Vehicles older than the economy/compact/XL 20-yr cap → **reject**.

Bands are disjoint (≤1000 | 1001–1800 | 1801–2000 | ≥2001; bikes 50–110 | 111–160 | ≥161), seat rules fire before cc rules, and the cascade is ordered — the same input can never match two categories.

## 4. Edge cases

- **CNG-converted petrol cars:** Classified by base vehicle cc/seats (category unchanged) with a `fuel=CNG` tag — allowed in compact/economy/comfort/XL. Exception: a premium-band vehicle converted to CNG is demoted to car_comfort (R4 fuel gate). Hybrid+CNG records are internally inconsistent → manual review.
- **Locally assembled / rebadged models:** Solved by P1 alias map; then classified purely by cc/seats/body like any car (e.g., Proton Saga 1332 → car_economy; Proton X70 7-seat → car_xl).
- **Old vehicles (10+ yrs, no matching spec sheet):** Rules never need a spec sheet — registered cc/seats/year suffice. A 2007 Axio → car_economy; a 2011 Camry 2500 → demoted to car_comfort; a 1998 Corolla → rejected (20-yr cap).
- **Non-standard seat modifications:** Registered count always wins. Extra unregistered jump seats in vans are ignored for classification (flagged for compliance if photographed). A van stripped below its registered seat count → manual review (likely fraud/safety issue). Registered 3-seat kei car → car_compact via R7.
- **Electric 3-wheelers ("easy bikes"):** Not legal for app-based passenger service inside Dhaka metro — out of scope; do not onboard under cng.

## 5. Platform/system change flags

- **New enum value required: `car_compact`.** This is the only schema change to vehicle_type.
- **New metadata fields recommended (non-breaking):** `body_type` (required, per P3), `fuel_primary` (petrol/diesel/CNG/hybrid/EV), `registered_seats`, `brand_alias_id`.
- **New reference data:** luxury-brand allowlist, quadricycle allowlist, brand alias map, and a manual-review queue with reason codes.
- All 8 existing categories and their enum values remain valid; no migrations needed for existing fleets except re-validation against the R-cascade at next driver document renewal.

**Rollout note:** shadow-run the new cascade against the current fleet for 4 weeks; expect the main shifts to be kei cars moving from car_economy → car_compact, and >2000cc sedans without CNG moving into a properly-gated car_premium.
