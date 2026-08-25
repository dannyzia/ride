# Master Dataset RE-MERGE Prompt (fix pass for master-parts)

> **Context:** the nine `master-parts/*.json` files (1,194 rows) normalized fields and banded categories correctly, but the cross-source MERGE never happened (~30% duplicates, 94% wrongly `single_source`), `_dispute` was never populated, and several rule-5 moves are pending. This prompt fixes exactly that. It does NOT re-read the five source datasets.
>
> **Orchestrator:** run PART B once per file (9 runs, parallel-safe). Input for each run = the existing `master-parts/<category>.json`. Output OVERWRITES that file. Then PART C assembly as before.

---

## PART A — SHARED RULES (paste into every run)

You are repairing one category file of the Ride master vehicle dataset. Input: the current JSON array (rows are per-source passthroughs — the same real vehicle appears as multiple rows). Your job: merge duplicates, fix the listed defects, annotate disputes. Do NOT invent new vehicles. Do NOT re-read the original five source datasets — everything you need is in the input file.

### Merge procedure

1. Cluster rows by REAL vehicle: same brand (after casing fix) + same underlying model (ignore spacing/punctuation/parenthetical style: "Wagon R (JDM)" ≡ "WagonR (JDM)"; "Vitz 1.0" ≡ "Vitz (1.0L)"; "Hiace" ≡ "HiAce"; em-dash ≡ hyphen ≡ plain) + overlapping or identical year ranges. Engine-variant rows that change category (Vitz 1.0 vs 1.3, Prado 5-seat vs 7-seat) stay SEPARATE — never merge across a category-changing difference.
2. Each cluster → ONE row:
   - `brand`/`model`: pick the canonical name (casing-fixed brand; the cleanest model string — prefer "Vitz 1.0" over "Vitz (1.0L)", "Hiace" over "HiAce", "Prado 5-seat" style with plain hyphen).
   - `year_start` = min of cluster; `year_end` = max, where a still-in-production (null) member exists → null.
   - `typical_cc_min/max` = min/max of cluster.
   - `passenger_seats` / `has_ac` = majority across cluster; genuine conflict → majority + `_dispute` note.
   - `_sources` = union of member sources; `_confidence`: ≥2 distinct sources AND recomputable category agrees → `verified`; 1 source → `single_source`; any member was flagged guessed/⚠ in its source → `guessed`.

### Mandatory fixes (apply in every run)

- **Brand casing map:** `Bmw`→`BMW`, `Mercedes-benz`→`Mercedes-Benz`, `Byd`→`BYD`, `Tvs`→`TVS`, `Ktm`→`KTM`, `Mg`→`MG`, `Faw`→`FAW`, `Sym`→`SYM`. `Maruti`→`Suzuki` (all Maruti-brand rows merge into their Suzuki twins; keep distinguishing model suffixes like "Wagon R (Indian)").
- **Seats:** ALL motorcycle/scooter rows → `passenger_seats: 2`. ALL auto_rickshaw rows → `3`. (Cars keep per-cluster majority of 4/5.)
- **Recompute category** for every merged row with the canonical cascade (body_type, cc band by cc_max, seats; premium allowlist: Toyota Premio/Allion/Camry/Crown/Harrier/LC-5-seat/Prado-5-seat + Honda Accord; luxury brands: Mercedes-Benz/BMW/Audi/Lexus/Volvo/Land Rover/Jaguar/Porsche). **If the recomputed category ≠ this file's category, REMOVE the row from this file and list it in the run's dispute report under "MOVED OUT"** (the orchestrator will route it to the correct file's re-run or fix-up list). Rules recap: seats ≥6 + van/mpv/minibus/suv_large → car_xl (BEFORE premium rules); cc>2000 or allowlist → car_premium; suv/crossover ≥1001 → car_comfort; ≤1000 car → car_compact; 1001–1500 → car_economy; 1501–2000 → car_comfort; auto_rickshaw → cng; bike bands 110/150.
- **Dispute annotation (do not leave _dispute empty where mandated):**
  - sub-1001cc crossovers (Raize, Rocky, Kona 998 base, MG ZS 999 base): keep literal-cascade category, `_dispute: "sub-1001cc crossover — product may want comfort — needs Zia"`.
  - EV / cc-null rows: keep/placed category, `_dispute: "EV — no canonical cc; pre-decided for admin review"`.
  - seat/AC majority conflicts, boundary straddles: one-line `_dispute`.

### Output

1. OVERWRITE `master-parts/<category>.json` — merged array, sorted brand→model, same 13-field shape. `year_end` null for still-in-production. No `body_type: null` (see premium notes for coupe/pickup handling).
2. OVERWRITE `master-parts/<category>.disputes.md` — tables: "Disputes" (rows with `_dispute` + recommendation), "MOVED OUT" (rows removed because recompute sent them elsewhere: brand, model, correct category), "Summary" (rows out, verified/single_source/guessed counts, merge count).

---

## PART B — RUN CARDS

- **RUN bike_basic** (55→~33): merge Metro/Metro Plus/Metro 100 family (keep ONE "Metro Plus" row unless true variants differ in cc — 100 vs 110cc variants may stay split as "Metro 100"/"Metro Plus"), CT100, Platina, Splendor, HF Deluxe clusters. All seats → 2. Hero Passion Pro straddle (97–113cc): if present, split into "Passion Pro (97cc)" basic + note, or band by cc_max per majority — record either choice in disputes.
- **RUN bike_standard** (80→~52): merge FZ/FZS family into per-cc rows ("FZS 150" one row — collapse V2/V3/V2.0 naming into year range), CB Shine, Discover, Saluto, Hayate, Pulsar 125/150 (each ONE row), Glamour, Unicorn, GSX, Knight Rider, SP125, Turbo/135. Fix `Tvs`/`Ktm` casing. Remove Passion Pro/Galaxis straddlers to disputes if banded elsewhere.
- **RUN bike_plus** (91→~68): collapse Gixxer family to "Gixxer 155" + "Gixxer SF" (or one "Gixxer (incl. SF)" if cc identical — one row suffices), Hornet 160R ×5→1, RTR 160/180/200 each →1, R15 family →1 ("YZF R15"), Pulsar 180/220F/NS160/NS200/Dominar each →1, Duke 200/250/390 each →1.
- **RUN cng** (41→~23): collapse TVS King ×9 → ONE "King" row (or King + King Duramax if cc truly differs), Bajaj RE ×8 → ONE "RE" row (+distinct true variants only if cc differs materially), Ape family → "Ape" + true variants, Alfa family → "Alfa". ALL seats → 3. Treo + Easy Bike + Green Tiger: EV dispute notes on all three; Treo/Easy Bike keep cc null (do NOT fabricate cc — remove Green Tiger's fabricated 200cc → null + guessed).
- **RUN car_compact** (124→~80): merge Mira ×5→1, Move ×4→1, Tanto ×3→1, N-Box ×2→1, N-WGN ×2→1, eK-Wagon family →1 (+ eK Space if distinct), Dayz family →1, Alto family → canonical set {Alto 800, Alto K10, Alto (JDM kei)} — collapse naming variants into these three, Wagon R family → {Wagon R (JDM), Wagon R (Indian)}, Celerio ×4→1, Pixis Epoch ×3→1, Passo ×4→1, Vitz 1.0 ×5→1, Boon, redi-GO, Kwid ×2→1, Nano ×2→1, Moco ×2→1, Spark, Maruti→Suzuki merges (Maruti 800 stays "Suzuki 800"? — no: use "Alto (800cc Indian)" merge target or keep "Suzuki 800" as canonical row named "Maruti 800"→"Suzuki 800" with note; pick one, record in disputes). Rocky + Raize: sub-1001 dispute notes. Suzuki Every: keep, note. Perodua/Subaru/Mazda kei singles: keep as-is.
- **RUN car_economy** (182→~112): merge Fit/Jazz ×9 → "Fit 1.3" + "Fit 1.5" (or one row with 1317–1498 range if you judge trims equivalent — one is preferred), Sunny/Latio ×8 → "Sunny" + "Latio" (Tiida merges into Latio note), Swift ×6 (incl Maruti) → "Swift", Vitz/Yaris → "Vitz 1.3" + "Vitz 1.5"(if present) + "Yaris" if truly distinct market model, Probox/Succeed → "Probox" + "Succeed", Axio family ×5 → "Corolla Axio", Fielder ×4 → "Corolla Fielder", City ×5→1, Aqua ×3→1, Corolla old-gen ×4 → "Corolla 1.3"/"Corolla 1.5", i10/i20/Grand i10/Accent/Verna each →1, Dzire ×4→1, Note ×3→1, Mirage ×3→1, Demio ×3→1, Vios ×3→1, Belta ×3→1, Tigor ×3→1, Verisa ×2→1 (same source twice — pure dup), Ist ×2→1. Check "Sienta (1.5L)" and "Freed" rows if present: seats ≥6 + mpv → MOVE OUT to car_xl.
- **RUN car_comfort** (178→~118): merge Vezel/HR-V ×7 → "Vezel" (+ "HR-V 1.8" only if cc truly 1799 distinct band — else one row), C-HR ×6→1, Corolla 1.6/1.8/Altis family → "Corolla Altis" + "Corolla 1.6" as needed, Tucson ×6→1, Creta ×5→1, Sportage ×5→1, Rush ×4 → split: 5-seat rows stay "Rush" (crossover/suv) — 7-seat rows MOVE OUT to car_xl, X-Trail ×4→1, CR-V ×3→1, Prius ×3→1, Civic ×3→1, Corolla Cross ×3→1, Seltos ×4→1, ASX/RVR ×4→1, EcoSport/Jolion/H6/S-Cross/X50/Kona/Elantra ×2 each→1. **MOVE OUT all 7-seat rows** (Creta 7-seat, Tucson 7-seat, Oshan X7, Glory 580, Haval H5/H9, Jetour X70/X90 7-seat, Tiggo 8, Crossroad, Gloster, Aruz, XL7) → car_xl list. Kona 998 / MG ZS 999 / Raize: sub-1001 dispute notes (Kona base 998 — if merged row spans 998–1999, split into "Kona 1.0" (compact, MOVED OUT to car_compact + dispute) and "Kona 1.6" comfort). Fix `Bmw`/`Mercedes-benz`/`Mg`/`Byd`/`Dfsk` casing.
- **RUN car_premium** (311→~230): largest — if output truncates, split output into car_premium.json (sedans/hatch) + note, and a `car_premium.part2.json` (SUVs) — orchestrator concatenates. Merge: Premio ×5→1, Allion ×5→1, Crown ×5→1, Camry ×4→1, Harrier ×4→1, Mark X ×5→1, Land Cruiser 5-seat ×4-spellings→1 ("Land Cruiser 5-seat"), Prado 5-seat ×4→1 ("Prado 5-seat"), Pajero family ×7 → "Pajero" + "Pajero Sport", Santa Fe ×4 → 5-seat row stays (if ≥6 seats → MOVE OUT car_xl), Sorento ×3 → same rule, Fortuner ×3 → MOVE OUT (all 7-seat) to car_xl, Accord ×5→1, RX ×4→1, ES ×3→1, 3/5 Series ×3→1 each, E-Class ×3→1, CX-5 ×3 → ≤2000cc stays, >2000cc stays premium by rule 7 (both fine — merge to one row if same band), MU-X ×3→ car_xl if 7-seat (MOVE OUT), D-Max/L200/Triton/Navara/Ranger/Colorado/Hilux/Tacoma/Tundra (pickups): NO body_type exists in the enum and pickups are not Dhaka ride-hailing passenger vehicles → REMOVE entirely + list under "REMOVED (pickups — not passenger ride-hailing; confirm Zia)". Coupes/convertibles/sports (911, 718, TT, R8, F-Type, RC, LC, Z4, GT-R, 2/4/6/8 Series where coupe): map `body_type: "sedan"` (enum convention for non-SUV cars) + `_notes: "coupe mapped to sedan"`. EVs (e-tron, I-Pace, Taycan, C40): keep, add EV dispute note. **Mitsubishi i (658cc kei): MOVE OUT to car_compact.** Vellfire/Carnival/Innova/Alphard rows here: ≥6 seats → MOVE OUT to car_xl. Fix `Bmw`/`Mercedes-benz` casing everywhere.
- **RUN car_xl** (132→~82): merge Hiace ×8 → "Hiace" + "Hiace Commuter"(14-seat) if distinct, Alphard family → "Alphard" + "Vellfire", Noah ×3→1, Voxy ×3→1, Serena ×4→1, Sienta ×4→1, Starex/H-1 family ×5→1 ("Grand Starex"), Carnival ×4→1, Ertiga ×4→1, Odyssey ×4→1, Freed ×3→1, Innova ×3→1, Esquire/Delica/APV/Xpander/Elgrand ×2 each→1. Unify "Step WGN"/"Stepwgn", "Hiace/HiAce" → "Hiace". Add rows coming IN from other runs only if listed in your input file (the orchestrator merges MOVED-OUT lists afterwards — do not fabricate). `Prius α` → "Prius Alpha" (ASCII).
- **RUN finalize-unresolved**: resolve `unresolved.disputes.md` per §13 rules and DELETE that file: Tesla Model X (7-seat, suv_large) → add to car_xl with EV dispute; BYD Atto 3 → car_comfort with EV dispute; Nissan Leaf → car_compact with EV dispute. Output: three JSON row objects in a `master-parts/unresolved-resolved.json` + updated dispute lines; the orchestrator appends them.

---

## PART C — ASSEMBLY (orchestrator, after all runs + collecting MOVED-OUT lists)

1. Apply MOVED-OUT routing: each run's dispute file lists rows to move; append them to the target category file (re-verified shape).
2. Concatenate in canonical order into `vehicle-models.master.json`; merge dispute tables into `vehicle-models.disputes.md` (Disputes / Moved / Removed / Summary: total rows, per-category counts, confidence counts).
3. Programmatic checks: parses; 13 fields every row; no `body_type: null`; dedup key `(lower(brand), lower(model), year_start, year_end)` unique; bikes all seats=2; cng all seats=3; xl all seats ≥6 with van/mpv/minibus/suv_large; `default_vehicle_type` === file category; car_compact ≥ 20; spot-check 10 (Vitz 1.0→compact, Vitz 1.3→economy, Axio→economy, Premio→premium, Prado 7-seat→xl, Hiace→xl, Bajaj RE→cng, Pulsar 150→standard, CR-V→comfort, any BMW→premium).
4. Expected total after merge: ~800–850 rows. Deliver to Zia with the dispute report.
