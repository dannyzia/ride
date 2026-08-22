# Vehicle Categorization Framework — CANONICAL v1.0

**Status:** DECIDED — ready to drive Part 3 (codebase readiness) and dataset generation.
**Source:** Synthesized from 9 independent AI responses (ChatGPT, Claude, DeepSeek, Gemini, GLM 5.3, Kimi, Meta, Perplexity, Qwen 3.8) to Prompt A, reconciled with Zia.
**Decision date:** 2026-08-22

---

## 1. Final decision

**9 categories total — the existing 8 plus one new tier, `car_compact`, for cars under 1000cc.**

All 9 AI responses independently flagged the same gap: `car_economy` was being asked to cover both a 660–1000cc kei car (Suzuki Alto, Daihatsu Mira, WagonR) and a 1300–1500cc sedan (Corolla Axio, Honda City) — two different products, two different price points.

A second question was raised (splitting `car_xl` into a 7-seat-van tier and a 9+-seat-van/minibus tier). **Rejected** — Zia confirmed 9+ seat vans (Hiace, Coaster, Rosa, Urvan) are rarely seen in ride-sharing supply. No driver pool to justify the split. Revisit only if that changes.

---

## 2. The 9 categories

| # | `vehicle_type` | Passenger use-case | Registered seats | Engine cc | Body type | Fuel | BD examples |
|---|---|---|---|---|---|---|---|
| 1 | `bike_basic` | Cheapest solo hop | 1 passenger | ≤110cc | motorcycle | Petrol | Bajaj Platina, TVS Metro, Hero Splendor |
| 2 | `bike_standard` | Everyday commute | 1 passenger | 111–150cc | motorcycle | Petrol | Honda CB Shine, Bajaj Discover 125, Hero Glamour |
| 3 | `bike_plus` | Premium/faster bike | 1 passenger | >150cc | motorcycle | Petrol | Yamaha FZS, Bajaj Pulsar 150+, TVS Apache |
| 4 | `cng` | 3-wheeler, cheap covered ride | 2–3 passengers | n/a | **auto_rickshaw only** | CNG (factory) | Bajaj RE, TVS King, Piaggio Ape |
| 5 | **`car_compact`** *(NEW)* | Ultra-budget enclosed car | 3–4 | **≤1000cc** | hatchback/micro-sedan | Petrol, CNG-converted OK | Suzuki Alto, Daihatsu Mira, WagonR 660/1000 |
| 6 | `car_economy` | Standard city car | 4–5 | 1001–1500cc | hatchback/sedan (non-SUV) | Petrol/CNG-converted/hybrid | Toyota Axio, Honda City, Nissan Sunny |
| 7 | `car_comfort` | Bigger/better car, or any SUV | 4–5 | 1501–2000cc, **or any SUV/crossover ≥1001cc** | sedan/crossover/SUV | Petrol/CNG-converted/hybrid | Premio/Allion (via premium list, see below — excluded here), Honda Civic, Hyundai Creta |
| 8 | `car_premium` | Executive/luxury | 4–5 | >2000cc, **or on premium allowlist** (any cc) | sedan/SUV | No blanket restriction | Toyota Camry, Premio, Allion, Crown, Harrier; BMW/Mercedes/Audi/Lexus/Volvo/Land Rover/Jaguar/Porsche (any model) |
| 9 | `car_xl` | Family/group, van or big SUV | ≥6 | any | van/MPV/minibus/large SUV | Any | Toyota Noah/Voxy, Mitsubishi Xpander, Toyota Hiace |

**Why `car_premium` isn't purely cc-based:** Toyota Premio and Allion run 1.5–1.8L engines — well inside "comfort" range by cc alone — but are positioned and priced as premium vehicles in the Dhaka market. Every model that flagged this used the same fix: a brand/model allowlist that overrides the cc band. Same logic for luxury brands regardless of displacement.

**Why `car_comfort` has an SUV floor:** a small-engine SUV/crossover (Toyota Rush 1496cc, Hyundai Creta 1497cc) reads as "economy" by cc alone, but SUV body commands a real price premium in Dhaka. Any SUV/crossover body type is floored at `car_comfort` regardless of cc, up to the point it crosses into premium territory (either by cc >2000 or by being on the premium allowlist).

---

## 3. Deterministic classification rules (first match wins)

Evaluate top to bottom. Stop at the first rule that matches — this guarantees no vehicle can land in two categories.

| Priority | Condition | Result |
|---|---|---|
| 1 | `body_type = auto_rickshaw` | `cng` |
| 2 | `body_type = motorcycle/scooter` AND `cc ≤ 110` | `bike_basic` |
| 3 | `body_type = motorcycle/scooter` AND `111 ≤ cc ≤ 150` | `bike_standard` |
| 4 | `body_type = motorcycle/scooter` AND `cc > 150` | `bike_plus` |
| 5 | `registered_seats ≥ 6` AND `body_type ∈ {van, mpv, minibus, suv_large}` | `car_xl` |
| 6 | `(brand, model) ∈ PREMIUM_ALLOWLIST` OR `brand ∈ LUXURY_BRANDS` | `car_premium` |
| 7 | `cc > 2000` (car, not already resolved above) | `car_premium` |
| 8 | `body_type ∈ {suv, crossover}` AND `cc ≥ 1001` | `car_comfort` *(SUV floor)* |
| 9 | `cc ≤ 1000` | `car_compact` |
| 10 | `1001 ≤ cc ≤ 1500` | `car_economy` |
| 11 | `1501 ≤ cc ≤ 2000` | `car_comfort` |
| 12 | Anything unresolved (missing cc/seats/body_type) | **Manual admin review** — do not guess |

**Ground truth for every input:** BRTA-registered/certified engine cc, seat count, and body type — never a driver's self-report, never a "current production" spec sheet lookup (most Dhaka vehicles are reconditioned imports with no current listing to check against anyway). This matches the platform's existing brand+model lookup approach — see [`docs/Plan/05-DATA-MODEL.md:173`](docs/Plan/05-DATA-MODEL.md:173) — with the cc/body/seat rules above as the fallback when a brand+model isn't yet in the registry.

**PREMIUM_ALLOWLIST (starting set, admin-editable):** Toyota Premio, Toyota Allion, Toyota Camry, Toyota Crown, Toyota Harrier, Toyota Land Cruiser (5-seat), Toyota Prado (5-seat), Honda Accord.
**LUXURY_BRANDS (starting set, admin-editable):** Mercedes-Benz, BMW, Audi, Lexus, Volvo, Land Rover, Jaguar, Porsche.

---

## 4. Edge cases

- **CNG-converted petrol cars.** Rule 1 checks *body type*, not fuel. A CNG-converted Toyota Axio never becomes `cng` — it stays `car_economy` based on its original engine cc. `cng` describes the vehicle class (3-wheeler auto-rickshaw), not the fuel. `fuel_type` should be tracked as a separate attribute for reporting, never as a classification input beyond the body-type check.
- **Locally assembled / rebadged models.** Classify by the donor/canonical model's actual spec (engine cc, seats, body type), not by local badge or assembly location. Maintain a brand-alias table so rebadged/locally-assembled vehicles (Proton via PHP, Mitsubishi via Rancon/Pragati, Hyundai via Fair Group, etc.) resolve to their real spec.
- **Very old vehicles (10+ years), no current spec sheet.** Use the vehicle's actual BRTA-registered cc/seats/body type. Category never changes because of age — a 1998 Corolla 1.5 classifies exactly like a 2020 Corolla 1.5. Whether an old vehicle is *allowed onto the platform at all* is a separate age/fitness-eligibility gate, not part of this categorization logic.
- **Non-standard seat modifications.** Always use the BRTA-registered/certified seat count. Unauthorized jump seats added to a van don't count toward `car_xl` eligibility. A registered 3-seat microcar with cc ≤1000 is `car_compact`, not treated as anything else.
- **Missing or unverifiable data.** Route to manual admin review (rule 12). Don't guess. This matches the platform's existing behavior of creating an inactive draft `vehicle_models` row pending admin approval when a driver submits an unrecognized brand/model — see [`app/api/driver/vehicles+api.ts:142`](app/api/driver/vehicles+api.ts:142).

**Deferred, not part of this framework:** vehicle-age display badges / age-based pricing adjustments, dedicated EV category, splitting `car_xl` into van tiers. None of these had majority support across the 9 responses or clear Dhaka supply data behind them yet. Revisit later if data justifies it.

---

## 5. Enum / schema impact

**One new enum value required: `car_compact`.** Everything else fits inside the existing 8 `vehicle_type` values — but two get their internal *definitions* tightened even though the enum value itself doesn't change:
- `cng` must be gated on `body_type = auto_rickshaw`, not on fuel type.
- `car_xl` must be gated on seat count + body type, checked *before* any cc-based rule, so a big-engine 7-seat van doesn't get misrouted by cc alone.

**Fields this framework depends on that need verifying against the real schema (feeds directly into Part 3's status-check prompt):**
- `body_type` — needed for the `cng` gate, the `car_xl` gate, and the SUV floor rule. Not currently a documented column on `vehicles` or `vehicle_models`.
- A premium allowlist / luxury brand list as admin-editable reference data (not currently in the schema).
- Registered/certified seat count is already captured (`passenger_seats`), but confirm it reflects BRTA-certified figures, not self-reported ones.

---

## 6. Prompt B — REVISED (Dataset Generation)

Send this to the same models used for Prompt A (or a fresh set), independently, then merge results.

```
You are compiling a reference dataset mapping vehicle Brand + Model + Year range to a ride-hailing vehicle category for the Dhaka, Bangladesh market, where the typical fleet skews toward Japanese and Indian imports, reconditioned Japanese vehicles, and locally common CNG conversions.

Use exactly these 9 categories. Do not invent new ones, do not omit any, do not merge any:

1. bike_basic — motorcycle/scooter, engine ≤110cc
2. bike_standard — motorcycle/scooter, engine 111–150cc
3. bike_plus — motorcycle/scooter, engine >150cc
4. cng — 3-wheeler auto-rickshaw ONLY. Never a car, regardless of fuel type.
5. car_compact — car/hatchback, engine ≤1000cc
6. car_economy — car/hatchback/sedan (non-SUV body), engine 1001–1500cc
7. car_comfort — sedan/crossover, engine 1501–2000cc; OR any SUV/crossover body with engine ≥1001cc (apply this SUV floor rule even if cc alone would suggest car_economy)
8. car_premium — engine >2000cc; OR the following brands/models regardless of cc: Toyota Premio, Toyota Allion, Toyota Camry, Toyota Crown, Toyota Harrier, Toyota Land Cruiser (5-seat), Toyota Prado (5-seat), Honda Accord, and any Mercedes-Benz, BMW, Audi, Lexus, Volvo, Land Rover, Jaguar, or Porsche model
9. car_xl — registered seats ≥6 AND body type is van/MPV/minibus/large SUV, any engine size

Produce at least 80 rows covering the most common vehicles actually seen on Dhaka roads and used for ride-hailing (Uber/Pathao/Obhai/inDrive), spread across all 9 categories. Prioritize real supply — vehicles you have genuine confidence are common in Dhaka — over rare or speculative entries.

Give car_compact extra attention: this is the newest, thinnest-documented category, so include at least 10 rows here, since it's the segment the platform most needs accurate Bangladesh-market data on.

For each row, provide: brand, model, year_start, year_end (or "still in production"), body_type, typical_engine_cc_min, typical_engine_cc_max, typical_passenger_seats (registered/certified figure, not marketing spec), typical_has_ac (true/false/varies), assigned category (using the 9 categories above and the rules given — apply the SUV floor rule and the premium allowlist exactly as specified), and a one-line justification naming which rule you applied (e.g. "SUV floor rule", "premium allowlist", "cc band").

Flag any row where you are guessing at cc, seats, or body type rather than citing known trim data — don't hide uncertainty.

Output as a single markdown table, sorted by category, then brand.
```

---

## 7. Next steps

1. Run revised Prompt B against 2+ models independently, save results the same way Prompt A's were saved (this folder).
2. Merge: keep rows both models agree on; flag disagreements for manual spot-check; drop guessed rows unless independently verifiable.
3. Feed the final merged dataset into Prompt D (the change prompt) once Prompt C's codebase status-check report comes back — see [`plans/vehicle-categorization-plan.md`](plans/vehicle-categorization-plan.md) §4 for both prompts.
4. Prompt C should now explicitly check for the two open schema questions in §5 above: does `body_type` exist anywhere in the schema, and is there any existing premium/luxury brand reference table.
