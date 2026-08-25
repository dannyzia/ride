# Master Vehicle-Model Dataset Curation — MULTI-RUN PROMPT (v2)

> **Why v2:** a single-pass curation exceeded the model's output limit. The task is now split into **9 category runs + 1 mechanical assembly step**. Each run outputs one JSON file (~15–90 rows) — comfortably within limits.
>
> **Orchestrator instructions (you, not the model):** run PART B nine times, once per category, each time pasting PART A (shared rules) + the PART B run card for that category. After all nine outputs exist, perform PART C (assembly + verification) yourself or with a script — no model needed.

---

## PART A — SHARED RULES (paste into every run, unchanged)

You are the dataset curator for the Ride (Dhaka, Bangladesh) vehicle-categorization feature. This run is ONE part of a nine-part merge: you curate only the rows whose FINAL (recomputed) category is the one named in the run card below. The other eight categories are handled in separate runs — do not output them.

### Inputs (read all five in full, every run)

1. `ChatGPT Dataset.md` (~173 rows)
2. `DeepSeeks Dataset.md` (~169 rows)
3. `Gemini Dataset.md` (~245 rows, 5 parts)
4. `GLM5.3 Dataset.md` (141 rows)
5. `Kimi Dataset.md` (732 rows)

All in: `docs/FeatureList/New Feature Plan/Vehicle Categorization/`

`CANONICAL-Vehicle-Categorization-Framework-v1.md` is the product authority; the cascade below reproduces it.

### The canonical classification cascade (first match wins — apply literally)

Recompute EVERY row through this cascade. NEVER copy a source's `assigned_category`/`Category` — sources contain known errors, and seat normalization moves rows between categories (e.g., a source's `car_xl` row that normalizes to 5 seats is NOT `car_xl`).

Inputs: `body_type` (one of the 11 enum values), `cc` (band by cc_max for single variants), `passenger_seats` (BRTA registered seats INCLUDING driver, normalized per rules below).

| # | Condition | Result |
|---|-----------|--------|
| 1 | body_type = auto_rickshaw | `cng` |
| 2 | body_type ∈ {motorcycle, scooter} AND cc ≤ 110 | `bike_basic` |
| 3 | body_type ∈ {motorcycle, scooter} AND 111 ≤ cc ≤ 150 | `bike_standard` |
| 4 | body_type ∈ {motorcycle, scooter} AND cc > 150 | `bike_plus` |
| 5 | passenger_seats ≥ 6 AND body_type ∈ {van, mpv, minibus, suv_large} | `car_xl` |
| 6 | brand ∈ LUXURY_BRANDS, OR (brand, model) matches PREMIUM_ALLOWLIST | `car_premium` |
| 7 | cc > 2000 | `car_premium` |
| 8 | body_type ∈ {suv, crossover} AND cc ≥ 1001 | `car_comfort` |
| 9 | cc ≤ 1000 | `car_compact` |
| 10 | 1001 ≤ cc ≤ 1500 | `car_economy` |
| 11 | 1501 ≤ cc ≤ 2000 | `car_comfort` |
| 12 | unresolved (missing cc/seats/body) | flag `_dispute` — do not guess |

**PREMIUM_ALLOWLIST (model-level):** Toyota Premio, Toyota Allion, Toyota Camry, Toyota Crown, Toyota Harrier, Toyota Land Cruiser (5-SEAT ONLY), Toyota Prado (5-SEAT ONLY), Honda Accord.
**LUXURY_BRANDS (brand-wide):** Mercedes-Benz, BMW, Audi, Lexus, Volvo, Land Rover, Jaguar, Porsche.
Note: Prado/Land Cruiser 7-seat rows do NOT match the allowlist → rule 5 (`car_xl`).

### Output row shape (EXACT — 13 fields, JSON only, no prose)

```json
{
  "brand": "Toyota",
  "model": "Vitz 1.0",
  "year_start": 1999,
  "year_end": 2020,
  "body_type": "hatchback",
  "typical_cc_min": 996,
  "typical_cc_max": 996,
  "passenger_seats": 5,
  "has_ac": true,
  "default_vehicle_type": "car_compact",
  "_confidence": "verified",
  "_sources": ["chatgpt", "deepseek", "gemini"],
  "_dispute": null,
  "_notes": "split from Vitz 1.3"
}
```

- `year_end`: integer or `null` (still in production). NEVER "still in production", NEVER sentinels.
- `body_type`: exactly one of `motorcycle, scooter, auto_rickshaw, hatchback, sedan, crossover, suv, suv_large, mpv, van, minibus`.
- `has_ac`: `true` / `false` / `null` ("varies" → `null`).
- `passenger_seats`: normalized BRTA seats incl. driver — bikes 2, scooters 2, CNG 3, kei/micro 4, standard cars 5, vans/MPVs 7–10, minibuses up to 20. Sources disagree (some wrote 1 for bikes, 4 for CNG); YOU normalize.
- `_confidence`: `verified` (≥2 sources, recompute agrees) | `single_source` (1 source, recompute agrees) | `guessed` (source flagged uncertainty/⚠).
- `_sources`: lowercase ids from: chatgpt, deepseek, gemini, glm5.3, kimi.
- `_dispute`: `null` or a one-line description.
- `_notes`: optional one-liner.

### Normalization rules

- **Brands:** "Maruti Suzuki" → `Suzuki`; "Hero Honda" → `Hero`; keep BD-sold badge names (Proton, Runner, Walton, Roadmaster, H Power, Keeway, Lifan, Znen, Benelli, Regal Raptor…). Title-case consistently.
- **Models:** KEEP category-changing suffixes ("Vitz 1.0" vs "Vitz 1.3"; "Prado 5-seat" vs "Prado 7-seat"; "Wagon R (JDM 660cc)" vs "Wagon R (Indian)"). Collapse pure synonyms to the BD market name ("Vezel / HR-V" → `Vezel`; "Escudo / Vitara" → `Vitara`; "Fielder" → `Corolla Fielder`; "Axio" → `Corolla Axio`). ≤100 chars.
- **Body-type mapping:** "3-wheeler auto-rickshaw"/"Easy Bike" → `auto_rickshaw`; "kei hatchback"/"tall wagon" → `hatchback`; "station wagon"/"wagon/estate" → `sedan`; SUV/crossover by size (CR-V/RAV4/Creta → `suv`; Raize/Rocky/Kona/Vitara → `crossover`; Prado/LC/Fortuner/Pajero/Scorpio → `suv_large`); Noah/Voxy/Serena/Sienta/Alphard/Xpander/Ertiga/Avanza/Carens → `mpv`; HiAce/H-1/Starex/APV/NV200/Foton View → `van`; Coaster/Rosa/Civilian/Staria-11-seat → `minibus`; "Moped" → `motorcycle`.
- **Duplicates:** same (brand, model, year range) across sources → ONE row; cc = union only if variants genuinely overlapped; seats/AC = majority/most-credible; `_sources` lists all.
- **Boundary cc:** band by cc_max (Pulsar 150 @149.5 → `bike_standard`; Metro Plus @109.7 → `bike_basic`). Ranges SPANNING a boundary (Passion Pro 97–113): split into two rows if engines genuinely differed, else one row banded by cc_max + `_dispute`.

### Mandatory dispute flags (record, never silently decide)

- Sub-1001cc crossovers (Raize, Rocky, Kona 998, MG ZS 999): literal cascade → their band; add `_dispute: "sub-1001cc crossover — product may want comfort — needs Zia"`.
- EVs (cc 0/null → rule 12): assign `default_vehicle_type` by market size/body (`cng` if 3-wheeler via rule 1; Atto 3 → `car_comfort`; Leaf → `car_compact`) + `_dispute: "EV — no canonical cc; pre-decided for admin review"`. EV rows appear in whichever run their pre-decided category names.
- Source-vs-source disagreements after normalization: keep YOUR recomputed value + `_dispute`.

### Hard prohibitions

- Do NOT invent vehicles absent from all sources. Do NOT drop BD-local brands (mark `guessed`).
- Do NOT add a tenth category, EV category, or "Classic" modifiers.
- Do NOT sympathy-bump (Kimi's Axio→comfort override was REJECTED — Axio 1496cc = `car_economy`).
- Do NOT output rows for any category other than this run's. Do NOT output reasoning prose — JSON array + dispute table only.

---

## PART B — RUN CARDS (one run per card)

For each run, output TWO artifacts and nothing else:

1. `docs/FeatureList/New Feature Plan/Vehicle Categorization/master-parts/<category>.json` — a JSON array of this category's rows, sorted by brand then model.
2. `docs/FeatureList/New Feature Plan/Vehicle Categorization/master-parts/<category>.disputes.md` — a small table (brand | model | recomputed category | dispute | recommendation for Zia). If no disputes: the single line "No disputes." — plus a 3-line summary: rows output, count by `_confidence`.

### RUN 1 — `bike_basic`
Scan all five sources for two-wheelers whose RECOMPUTED category is bike_basic (body motorcycle/scooter, cc_max ≤ 110). Include boundary cases banded down (Metro Plus 109.7). Watch for sources that mis-placed ≤110cc bikes in bike_standard (Kimi's Hero Passion Pro 97–113 spans — apply the split/band rule).

### RUN 2 — `bike_standard`
Recomputed: motorcycle/scooter, 111 ≤ cc_max ≤ 150. Includes Pulsar 150 (149.5), FZS (149), Suzuki GS150. Pull in any 111–150cc bikes sources put in bike_plus.

### RUN 3 — `bike_plus`
Recomputed: motorcycle/scooter, cc_max > 150. Kimi is bike-heavy (~55 rows) — merge aggressively; performance bikes (Benelli/KTM/RE 650) that appear in only one source stay `single_source`.

### RUN 4 — `cng`
Recomputed: body auto_rickshaw (rule 1). All Bajaj RE/Maxima variants, TVS King, Piaggio Ape family, Mahindra Alfa/Treo, Atul, local brands (H Power, Mayuri, Sazisan, Runner), Easy Bike. Normalize seats to 3 (not 4). EV 3-wheelers (Treo, Easy Bike electric) → this run with the EV `_dispute`.

### RUN 5 — `car_compact`
Recomputed: cc_max ≤ 1000, non-two-wheeler, non-XL. Kei cars (Mira/Move/Tanto/Dayz/N-Box/eK/Spacia/Wagon R JDM), small hatches (Alto, Celerio, Eon, Kwid, redi-GO, i10? — NO, i10 is 1086–1197 → economy; verify each), Passo/Vitz/Boon 1.0, Belta 1.0, Raize/Rocky (sub-1001 crossovers — dispute flag), Nissan Leaf (EV dispute), Suzuki Every (kei microvan, 4 seats → compact; note). Vitz 1.3/1.5, Passo 1.3, Boon 1.3 belong to RUN 6 — keep the split rows.

### RUN 6 — `car_economy`
Recomputed: 1001 ≤ cc_max ≤ 1500, non-SUV/crossover body (or sub-1001 crossovers? no — those are RUN 5), seats < 6 or non-XL body. The big sedan/hatch run: Axio, Fielder, Grace, City, Fit, Aqua, Vitz 1.3+, Belta 1.3, Corolla 1.3/1.5, Probox, Sunny, Latio, Swift, Baleno, Dzire, i10/i20/Grand i10, Accent, Verna/Xcent/Aura, Rio, Amaze, Tiago/Tigor/Altroz, Micra/March/Note, Lancer 1.5, Mirage, Demio/Axela 1.5, Ciaz, Ignis, MG 3/5, Proton Saga, FAW V2, Changan Alsvin/Eado, Geely CK, Chevrolet Aveo/Sail/Spark(995→RUN 5), Ford Figo/Fiesta. Sienta? NO — seats normalize ≥6 + mpv → RUN 9. Rush 7-seat → RUN 9 (suv_large? verify body mapping: Rush is a ladder-frame 7-seat → `suv_large` → XL), Rush 5-seat → here? No: Rush body maps to suv/suv_large ≥1001cc → rule 8 → RUN 7. Check every SUV-body row against rule 8 before placing it here.

### RUN 7 — `car_comfort`
Recomputed: (suv/crossover ≥1001) OR (1501 ≤ cc_max ≤ 2000, any body) — and NOT premium (rules 6–7 win) and NOT XL (rule 5 wins). Creta, Seltos, Vezel, HR-V, CR-V, Tucson, Sportage, X-Trail, RAV4 (1987), Rush 5-seat, Corolla Cross, C-HR, CX-3/CX-5 ≤2000, Kicks, Venue, S-Cross, Fronx-ish crossovers, Proton X50/X70, Haval Jolion/H2/H6 ≤2000, MG HS/ZS ≥1001, Chinese SUVs (BAIC/Jetour/Chery Tiggo/DFSK), Civic 1.6/1.8, Corolla 1.6/Altis 1.8, Prius, Sylphy 1.8, Elantra, Cerato, Sonata 1999, Mazda 6, CX-5 >2000 → RUN 8. Honda Freed 5-seat? — Freed seats normalize ≥6 + mpv → RUN 9. Estima/Previa <6 seats? They're 7–8 seat MPVs → RUN 9.

### RUN 8 — `car_premium`
Recomputed: rule 6 (allowlist/luxury brand) OR rule 7 (>2000cc, not XL). Allowlist Toyotas (Premio/Allion/Camry/Crown/Harrier/LC 5-seat/Prado 5-seat) + Accord; all LUXURY_BRANDS rows (Audi/BMW/MB/Lexus/Volvo/LR/Jaguar/Porsche — any body, any cc); >2000cc others: Mark X, Santa Fe 2.2? — seats: Santa Fe normalizes 7 → RUN 9 if suv_large; check each. CX-5 2.5, Sorento (7-seat → RUN 9), Estima 3.5? (MPV ≥6 → RUN 9 — rule 5 precedes rule 7!). REMEMBER rule order: a 3000cc 8-seat Alphard is `car_xl` (rule 5), not premium. This is the largest run (~90–110 rows); if output truncates, split into 8a (allowlist + luxury-brand sedans/hatchbacks) and 8b (luxury SUVs + >2000cc non-luxury) and say so at the top of the output.

### RUN 9 — `car_xl`
Recomputed: seats ≥ 6 AND body ∈ {van, mpv, minibus, suv_large} — REGARDLESS of what any source called it. HiAce, Coaster, Noah/Voxy/Esquire, Serena, Sienta, Freed, Xpander, Ertiga/XL6, Alphard/Vellfire, Avanza, Rush 7-seat, Fortuner, Pajero 7-seat, Endeavour, Santa Fe 7-seat, Scorpio, Safari, Innova, Elgrand, Carnival/Carens, Delica, APV, Starex/H-1, Staria, Foton View, SsangYong Stavic, Prado/LC 7-seat (NOT allowlist). Pull rows sources misfiled under car_premium/car_comfort (rule 5 precedes rules 6–7). Seats normalization is decisive here: if a source says 4-seat van (NV200 5-seat cargo config), it is NOT XL → cc band run; note it.

---

## PART C — ASSEMBLY & VERIFICATION (mechanical — orchestrator/script, no model)

1. Concatenate the nine `master-parts/<category>.json` arrays into `docs/FeatureList/New Feature Plan/Vehicle Categorization/vehicle-models.master.json`. Stable order: bike_basic → bike_standard → bike_plus → cng → car_compact → car_economy → car_comfort → car_premium → car_xl; within category, brand then model.
2. Merge the nine `.disputes.md` tables into `vehicle-models.disputes.md` with a summary: total rows, rows per category, counts by `_confidence`.
3. Verify programmatically:
   - JSON parses; every object has exactly the 13 fields.
   - Dedup key `(lower(brand), lower(model), year_start, year_end)` has no duplicates.
   - All 9 categories present; `car_compact` ≥ 20 rows.
   - `default_vehicle_type` equals the file's category part for every row (rows must live in their own category's file — a mismatch means a run mis-bucketed).
   - Spot-check 10: Vitz 1.0→compact, Vitz 1.3→economy, Axio→economy, Premio→premium, Prado 7-seat→xl, Hiace→xl, Bajaj RE→cng, Pulsar 150→standard, CR-V→comfort, any BMW→premium.
4. Deliver master JSON + dispute report for **Zia's review of `_dispute` rows** before the Phase 4 importer runs (per `08a` §13).
