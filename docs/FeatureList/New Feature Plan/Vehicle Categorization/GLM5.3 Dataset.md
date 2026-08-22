# Dhaka Ride-Hailing Vehicle Reference Dataset — v2 (hard second pass)

**141 rows** (up from 84) · all 9 categories · car_compact now 24 rows

**Second-pass scope:** the country-of-origin blinders are off. This pass adds genuine Dhaka-street supply the first pass missed: **Bangladeshi brands** (Runner, Walton legacy, Roadmaster), **scooters**, **Indian MPVs/vans** (Ertiga, APV), **Korean entrants** (Hyundai Creta/Elantra/Santa Fe, Kia Seltos/Sportage), **Chinese EV** (BYD Atto 3), **Malaysian legacy** (Proton), **Toyota XL staples v1 inexplicably missed** (Fortuner, Innova, Coaster, Odyssey, Serena, Esquire, Prius α), **JDM gaps** (Axela, Demio, Note e-Power, Wingroad, Ist, Succeed, Boon, Roomy, Dayz, N-Box, eK, Spacia, Rocky, HR-V, RVR, Outlander, Teana), plus **Boxer 150, GS150, Hayate, Hunk, Passion Pro, Apache 200, NS200** and a **Civic split**.

**Corrections found on re-audit (v1 errors, now fixed):**
- **Noah/Voxy/Esquire cc was wrong**: hybrid = 1797cc (2ZR-FXE), petrol = 1986cc (3ZR-FE). There is no 1998cc unit. Corrected in all three rows.
- **Civic 1.5T was mis-bucketed**: 1498cc → car_economy by cc, not comfort. Now split: 1.5T row (economy) vs 1.8/e:HEV row (comfort).
- **Prius is 1797cc**, not 1798.
- **C-HR includes 1.2T (1196cc)** units — category holds at comfort only via the SUV floor rule, which is now the stated rule for that row.
- **Passo/Boon/Belta 1.3L variants** now flagged → car_economy.
- Tucson cc band widened to 1598–1999; locally-assembled Corolla cc band widened to 1497–1798.

All v1 conventions retained: seats = registered incl. driver; car_xl "any engine size" read as overriding engine-based categories; 5-seat vs ≥6-seat splits honored for LC/Prado; rules applied literally even where local platform intuition differs.

| Brand | Model | Year start | Year end | Body type | cc min | cc max | Seats | AC | Category | Rule applied | Uncertainty flags / notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Bajaj | CT100 | 2004 | still in production | motorcycle | 99 | 102 | 1 | false | bike_basic | cc band ≤110cc | cc varies 99–102 by variant — verify |
| Bajaj | Platina 100 | 2007 | still in production | motorcycle | 102 | 102 | 1 | false | bike_basic | cc band ≤110cc | — |
| Hero | Passion Pro | 2006 | still in production | motorcycle | 97 | 113 | 1 | false | bike_basic | cc band ≤110cc | ⚠ spans band: older 97cc → bike_basic, newer 113cc → bike_standard — verify per unit |
| Hero | Splendor Plus | 2004 | still in production | motorcycle | 97 | 97 | 1 | false | bike_basic | cc band ≤110cc | — |
| Honda | Dio | 2012 | still in production | scooter | 110 | 110 | 1 | false | bike_basic | cc band ≤110cc | scooter — minor share of moto fleet; included for completeness |
| Honda | Dream 110 | 2014 | still in production | motorcycle | 109 | 109 | 1 | false | bike_basic | cc band ≤110cc | — |
| Honda | Livo | 2015 | still in production | motorcycle | 109 | 109 | 1 | false | bike_basic | cc band ≤110cc | — |
| Mahindra | Centuro | 2014 | 2018 | motorcycle | 107 | 107 | 1 | false | bike_basic | cc band ≤110cc | legacy; Mahindra 2W exited BD; few units remain; low confidence on BD years |
| Roadmaster | Velocity | 2014 | still in production | motorcycle | 100 | 100 | 1 | false | bike_basic | cc band ≤110cc | ⚠ BD brand (Pran-RFL); model name and cc unverified — flag hard; small fleet share |
| TVS | Metro Plus | 2010 | still in production | motorcycle | 110 | 110 | 1 | false | bike_basic | cc band ≤110cc | cc ≈109.7 — sits on the 110cc boundary — verify per unit |
| Walton | Fusion 110RX | 2012 | 2016 | motorcycle | 110 | 110 | 1 | false | bike_basic | cc band ≤110cc | legacy; Walton exited motorcycles; residual units rare |
| Yamaha | Ray ZR | 2016 | still in production | scooter | 110 | 110 | 1 | false | bike_basic | cc band ≤110cc | scooter — minor share |
| Bajaj | Boxer BM150 | 2013 | still in production | motorcycle | 145 | 145 | 1 | false | bike_standard | cc band 111–150cc | very common BD workhorse; 144.8cc — added in 2nd pass |
| Bajaj | Discover 125 | 2011 | still in production | motorcycle | 124 | 125 | 1 | false | bike_standard | cc band 111–150cc | — |
| Bajaj | Pulsar 150 | 2001 | still in production | motorcycle | 149 | 150 | 1 | false | bike_standard | cc band 111–150cc | 149.5cc — just under boundary |
| Hero | Glamour | 2005 | still in production | motorcycle | 124 | 125 | 1 | false | bike_standard | cc band 111–150cc | — |
| Hero | Hunk | 2007 | still in production | motorcycle | 149 | 149 | 1 | false | bike_standard | cc band 111–150cc | 149.2cc; 160R variant (~163cc) → bike_plus — verify per unit |
| Honda | CB Shine | 2006 | still in production | motorcycle | 124 | 125 | 1 | false | bike_standard | cc band 111–150cc | — |
| Honda | CB Unicorn 150 | 2005 | 2020 | motorcycle | 149 | 149 | 1 | false | bike_standard | cc band 111–150cc | discontinued; year range approximate |
| Runner | Galaxis | 2013 | still in production | motorcycle | 110 | 125 | 1 | false | bike_standard | cc band 111–150cc | ⚠ Runner is BD's largest local moto brand; cc uncertain 110–125 and may straddle bike_basic — verify per unit |
| Runner | KnightRider | 2014 | still in production | motorcycle | 150 | 150 | 1 | false | bike_standard | cc band 111–150cc | ⚠ cc approximate (~150) — verify |
| Runner | Turbo 135 | 2012 | still in production | motorcycle | 134 | 135 | 1 | false | bike_standard | cc band 111–150cc | ⚠ cc approximate — verify |
| Suzuki | GS150 | 2010 | 2019 | motorcycle | 149 | 149 | 1 | false | bike_standard | cc band 111–150cc | discontinued in BD; 149.5cc; modest residual fleet |
| Suzuki | Hayate | 2011 | 2018 | motorcycle | 113 | 113 | 1 | false | bike_standard | cc band 111–150cc | modest supply; discontinued |
| Yamaha | FZS V2 | 2014 | still in production | motorcycle | 149 | 149 | 1 | false | bike_standard | cc band 111–150cc | 149.3cc — top of band; verify per unit |
| Yamaha | Saluto | 2015 | 2020 | motorcycle | 125 | 125 | 1 | false | bike_standard | cc band 111–150cc | modest supply |
| Bajaj | Pulsar NS160 | 2017 | still in production | motorcycle | 160 | 160 | 1 | false | bike_plus | cc band >150cc | — |
| Bajaj | Pulsar NS200 | 2012 | still in production | motorcycle | 199 | 199 | 1 | false | bike_plus | cc band >150cc | modest supply; added in 2nd pass |
| Bajaj | Pulsar 180 | 2003 | still in production | motorcycle | 178 | 179 | 1 | false | bike_plus | cc band >150cc | — |
| Bajaj | Pulsar 220F | 2009 | still in production | motorcycle | 220 | 220 | 1 | false | bike_plus | cc band >150cc | — |
| Honda | CB Hornet 160R | 2015 | 2022 | motorcycle | 163 | 163 | 1 | false | bike_plus | cc band >150cc | — |
| Suzuki | Gixxer (incl. SF) | 2014 | still in production | motorcycle | 155 | 155 | 1 | false | bike_plus | cc band >150cc | — |
| TVS | Apache RTR 160 | 2007 | still in production | motorcycle | 160 | 160 | 1 | false | bike_plus | cc band >150cc | 159.7cc |
| TVS | Apache RTR 180 | 2009 | still in production | motorcycle | 177 | 177 | 1 | false | bike_plus | cc band >150cc | — |
| TVS | Apache RTR 200 | 2016 | still in production | motorcycle | 198 | 198 | 1 | false | bike_plus | cc band >150cc | 197.75cc; modest supply; added in 2nd pass |
| Bajaj | RE (CNG) | 2005 | still in production | 3-wheeler auto-rickshaw | 205 | 216 | 2–3 | false | cng | 3-wheeler body rule | dominant BD CNG fleet; cc ≈205–216 by unit; certified capacity 2–3 by unit |
| TVS | King (CNG) | 2008 | still in production | 3-wheeler auto-rickshaw | 200 | 200 | 2–3 | false | cng | 3-wheeler body rule | cc ≈199.7 — verify; secondary to Bajaj RE in supply |
| BYD | Atto 3 | 2023 | still in production | crossover (BEV) | 0 | 0 | 5 | true | car_compact | cc band ≤1000cc (EV = 0cc) | ⚠ RULE GAP: EV crossover — SUV floor needs ≥1001cc; literal reading → compact. New Chinese entrant; rare on platforms; flag for policy |
| Daihatsu | Boon | 2004 | 2022 | hatchback | 996 | 996 | 5 | true | car_compact | cc band ≤1000cc | Passo twin; modest supply; 1.3L units (~1298cc) → car_economy — verify |
| Daihatsu | Mira | 2010 | 2020 | hatchback (kei) | 658 | 658 | 4 | true | car_compact | cc band ≤1000cc | — |
| Daihatsu | Mira ES | 2013 | 2020 | hatchback (kei) | 658 | 658 | 4 | true | car_compact | cc band ≤1000cc | — |
| Daihatsu | Move | 2010 | still in production | hatchback (kei) | 658 | 658 | 4 | true | car_compact | cc band ≤1000cc | — |
| Daihatsu | Rocky | 2019 | still in production | crossover | 996 | 996 | 5 | true | car_compact | cc band ≤1000cc | ⚠ RULE GAP: 996cc crossover — same gap as Raize; growing supply; added in 2nd pass |
| Daihatsu | Tanto | 2010 | still in production | hatchback (kei) | 658 | 658 | 4 | true | car_compact | cc band ≤1000cc | — |
| Honda | N-Box | 2012 | still in production | hatchback (kei) | 658 | 658 | 4 | true | car_compact | cc band ≤1000cc | growing kei import; modest — added in 2nd pass |
| Mitsubishi | eK Wagon/Space | 2013 | still in production | hatchback (kei) | 658 | 658 | 4 | true | car_compact | cc band ≤1000cc | modest supply; added in 2nd pass |
| Nissan | Dayz | 2013 | still in production | hatchback (kei) | 658 | 658 | 4 | true | car_compact | cc band ≤1000cc | added in 2nd pass (v1 had wrongly omitted); modest supply |
| Nissan | Leaf | 2011 | 2022 | hatchback (BEV) | 0 | 0 | 5 | true | car_compact | cc band ≤1000cc (EV = 0cc) | ⚠ RULE GAP: EV has no engine cc; small real fleet |
| Suzuki | Alto 800 | 2012 | still in production | hatchback | 796 | 796 | 5 | varies | car_compact | cc band ≤1000cc | AC by trim |
| Suzuki | Alto K10 | 2010 | still in production | hatchback | 998 | 998 | 5 | varies | car_compact | cc band ≤1000cc | AC by trim; BD arrival of current K10 later than global — years approximate |
| Suzuki | Celerio | 2014 | still in production | hatchback | 998 | 998 | 5 | varies | car_compact | cc band ≤1000cc | modest supply; AC by trim |
| Suzuki | Cultus (new gen) | 2018 | still in production | hatchback | 998 | 998 | 5 | varies | car_compact | cc band ≤1000cc | AC by trim |
| Suzuki | Every | 2011 | still in production | microvan (kei) | 658 | 658 | 4 | true | car_compact | cc band ≤1000cc | ⚠ EDGE CASE: van body but 4 seats → fails car_xl; grouped by engine — flag for review |
| Suzuki | Spacia | 2013 | still in production | hatchback (kei) | 658 | 658 | 4 | true | car_compact | cc band ≤1000cc | modest supply; added in 2nd pass |
| Suzuki | Wagon R (Indian) | 2010 | still in production | hatchback | 998 | 998 | 5 | varies | car_compact | cc band ≤1000cc | AC by trim; distinct from JDM 660cc model below |
| Suzuki | Wagon R (JDM) | 2007 | still in production | hatchback (kei) | 658 | 658 | 4 | true | car_compact | cc band ≤1000cc | — |
| Toyota | Belta | 2005 | 2012 | sedan | 996 | 996 | 5 | true | car_compact | cc band ≤1000cc | ⚠ EDGE CASE: rule 5 says "car/hatchback"; 996cc sedan grouped by engine; 1.3L units (1296cc) → car_economy |
| Toyota | Passo | 2004 | 2022 | hatchback | 996 | 996 | 5 | true | car_compact | cc band ≤1000cc | 1.3L units (~1296–1329cc) → car_economy — 2nd-pass fix (v1 missed this variant) |
| Toyota | Raize | 2019 | still in production | crossover | 996 | 996 | 5 | true | car_compact | cc band ≤1000cc | ⚠ RULE GAP: 996cc crossover; SUV floor starts at 1001cc; growing supply |
| Toyota | Roomy / Tank | 2016 | still in production | hatchback (tall) | 996 | 996 | 5 | true | car_compact | cc band ≤1000cc | modest supply; added in 2nd pass |
| Toyota | Vitz (1.0L) | 2010 | 2019 | hatchback | 996 | 996 | 5 | true | car_compact | cc band ≤1000cc | 1.3/1.5 grades listed under car_economy |
| Honda | City | 2009 | still in production | sedan | 1497 | 1497 | 5 | true | car_economy | cc band 1001–1500cc, non-SUV | — |
| Honda | Civic (1.5T) | 2016 | still in production | sedan | 1498 | 1498 | 5 | true | car_economy | cc band 1001–1500cc | ⚠ 2nd-pass correction: v1 bucketed all Civics as comfort; 1.5T is 1498cc → economy by cc; 1.8/e:HEV listed separately |
| Honda | Fit | 2007 | 2020 | hatchback | 1496 | 1496 | 5 | true | car_economy | cc band 1001–1500cc | — |
| Honda | Fit Shuttle | 2011 | 2015 | station wagon | 1496 | 1496 | 5 | true | car_economy | cc band 1001–1500cc, non-SUV | wagon treated as non-SUV car per rule 6 |
| Honda | Grace | 2014 | 2020 | sedan | 1496 | 1496 | 5 | true | car_economy | cc band 1001–1500cc | year range approximate |
| Honda | Shuttle | 2015 | 2022 | station wagon (hybrid) | 1496 | 1496 | 5 | true | car_economy | cc band 1001–1500cc | newer-generation Shuttle; modest supply; added in 2nd pass |
| Mazda | Axela (1.5) | 2013 | still in production | hatchback | 1496 | 1496 | 5 | true | car_economy | cc band 1001–1500cc | modest supply; 2.0/hybrid grades → car_comfort (separate row); added in 2nd pass |
| Mazda | Demio | 2007 | still in production | hatchback | 1298 | 1496 | 5 | true | car_economy | cc band 1001–1500cc | modest supply; added in 2nd pass |
| Mitsubishi | Attrage | 2013 | still in production | sedan | 1199 | 1199 | 5 | true | car_economy | cc band 1001–1500cc | — |
| Nissan | Note (incl. e-Power) | 2012 | still in production | hatchback | 1198 | 1498 | 5 | true | car_economy | cc band 1001–1500cc | e-Power units 1198cc; older 1.5 units 1498cc; both ≤1500 → economy; growing e-Power supply; added in 2nd pass |
| Nissan | Sunny | 2013 | 2019 | sedan | 1498 | 1498 | 5 | true | car_economy | cc band 1001–1500cc | BD sales years approximate; added in 2nd pass |
| Nissan | Wingroad | 2005 | 2018 | station wagon | 1497 | 1798 | 5 | true | car_economy | cc band 1001–1500cc | 1.8 units (1798cc) → car_comfort — verify per unit; modest supply; added in 2nd pass |
| Proton | Saga | 1992 | 2015 | sedan | 1295 | 1582 | 5 | true | car_economy | cc band 1001–1500cc | legacy Malaysian import; 1.6 units (1582cc) → car_comfort; cc varies widely by generation; declining fleet |
| Suzuki | Dzire | 2017 | still in production | sedan | 1197 | 1197 | 5 | true | car_economy | cc band 1001–1500cc | — |
| Suzuki | Swift | 2011 | still in production | hatchback | 1197 | 1197 | 5 | true | car_economy | cc band 1001–1500cc | — |
| Toyota | Aqua | 2011 | still in production | hatchback (hybrid) | 1496 | 1496 | 5 | true | car_economy | cc band 1001–1500cc | — |
| Toyota | Corolla (locally assembled) | 2003 | 2016 | sedan | 1497 | 1798 | 5 | true | car_economy | cc band 1001–1500cc | ⚠ cc band uncertain; 1.8 units → car_comfort — verify per unit; local assembly ended mid-2010s |
| Toyota | Corolla (older E100/E110) | 1991 | 2007 | sedan | 1332 | 1497 | 5 | varies | car_economy | cc band 1001–1500cc | legacy; many CNG-converted taxi/fleet units still running; AC often non-functional; added in 2nd pass |
| Toyota | Corolla Axio | 2012 | 2022 | sedan | 1496 | 1496 | 5 | true | car_economy | cc band 1001–1500cc | 1.8 hybrid grades (1798cc) → car_comfort — verify per unit |
| Toyota | Corolla Fielder | 2012 | 2022 | station wagon | 1496 | 1496 | 5 | true | car_economy | cc band 1001–1500cc, non-SUV | wagon = non-SUV per rule 6; 1.8 hybrid grades → car_comfort |
| Toyota | Ist | 2002 | 2016 | hatchback | 1298 | 1497 | 5 | true | car_economy | cc band 1001–1500cc | modest legacy JDM supply; added in 2nd pass |
| Toyota | Probox | 2002 | 2020 | station wagon | 1296 | 1496 | 5 | true | car_economy | cc band 1001–1500cc, non-SUV | — |
| Toyota | Succeed | 2002 | 2020 | station wagon | 1296 | 1496 | 5 | true | car_economy | cc band 1001–1500cc | Probox twin; modest supply; added in 2nd pass |
| Toyota | Vitz (1.3/1.5L) | 2010 | 2019 | hatchback | 1296 | 1496 | 5 | true | car_economy | cc band 1001–1500cc | cc varies by grade; no category risk |
| Toyota | Yaris (sedan) | 2018 | still in production | sedan | 1496 | 1496 | 5 | true | car_economy | cc band 1001–1500cc | BD launch year approximate; modest supply; added in 2nd pass |
| Honda | Civic (1.8 / e:HEV) | 2012 | still in production | sedan | 1799 | 1993 | 5 | true | car_comfort | cc band 1501–2000cc | 1.5T split out to car_economy in 2nd pass |
| Honda | CR-V | 2017 | still in production | SUV/crossover | 1498 | 1498 | 5 | true | car_comfort | SUV floor rule | 2.4L recon units (2404cc) → car_premium — verify per unit |
| Honda | HR-V | 2015 | 2022 | SUV/crossover | 1496 | 1496 | 5 | true | car_comfort | SUV floor rule | modest supply; added in 2nd pass |
| Honda | Vezel | 2013 | still in production | SUV/crossover | 1496 | 1496 | 5 | true | car_comfort | SUV floor rule (cc alone would be car_economy) | — |
| Hyundai | Creta | 2022 | still in production | SUV/crossover | 1497 | 1591 | 5 | true | car_comfort | SUV floor rule | new locally assembled entrant; supply growing; rare on platforms yet; added in 2nd pass |
| Hyundai | Elantra | 2011 | still in production | sedan | 1591 | 1999 | 5 | true | car_comfort | cc band 1501–2000cc | new BD entrant; early years import-only; added in 2nd pass |
| Hyundai | Tucson | 2016 | still in production | SUV/crossover | 1598 | 1999 | 5 | true | car_comfort | cc band 1501–2000cc (SUV) | legacy 2.4 units (2359cc) → car_premium — verify; cc band widened in 2nd pass |
| Kia | Seltos | 2022 | still in production | SUV/crossover | 1497 | 1497 | 5 | true | car_comfort | SUV floor rule | new entrant; mostly private — rare on platforms; added in 2nd pass |
| Kia | Sportage | 2022 | still in production | SUV/crossover | 1999 | 1999 | 5 | true | car_comfort | cc band 1501–2000cc (SUV) | new entrant; mostly private — rare on platforms; added in 2nd pass |
| Mazda | Axela (2.0 / hybrid) | 2013 | still in production | hatchback | 1997 | 1998 | 5 | true | car_comfort | cc band 1501–2000cc | modest supply; added in 2nd pass |
| Mitsubishi | Lancer EX (1.6) | 2007 | 2017 | sedan | 1590 | 1590 | 5 | true | car_comfort | cc band 1501–2000cc | formerly locally assembled; older units |
| Mitsubishi | RVR | 2010 | 2022 | SUV/crossover | 1798 | 1798 | 5 | true | car_comfort | cc band 1501–2000cc (SUV) | modest supply; added in 2nd pass |
| Nissan | X-Trail | 2014 | 2022 | SUV/crossover | 1997 | 1997 | 5 | true | car_comfort | cc band 1501–2000cc (SUV) | 2.5L units (2488cc) → car_premium — verify per unit |
| Proton | Persona | 2008 | 2015 | sedan | 1597 | 1597 | 5 | true | car_comfort | cc band 1501–2000cc | legacy Malaysian import; declining; added in 2nd pass |
| Toyota | C-HR | 2016 | 2022 | SUV/crossover | 1196 | 1797 | 5 | true | car_comfort | SUV floor rule | ⚠ includes 1.2T units (1196cc — economy cc but SUV body → floor rule) and 1.8 hybrid (1797cc); 2nd-pass cc fix |
| Toyota | Corolla (new, 1.8L GL/Grande) | 2014 | 2022 | sedan | 1798 | 1798 | 5 | true | car_comfort | cc band 1501–2000cc | — |
| Toyota | Corolla Cross | 2021 | still in production | SUV/crossover | 1798 | 1798 | 5 | true | car_comfort | cc band 1501–2000cc (SUV) | — |
| Toyota | Prius | 2009 | 2022 | sedan/liftback | 1797 | 1797 | 5 | true | car_comfort | cc band 1501–2000cc | cc corrected 2nd pass (1797, not 1798) |
| Toyota | Rush | 2018 | 2022 | SUV (compact, 7-seat) | 1495 | 1495 | 7 | true | car_comfort | SUV floor rule (cc alone would be car_economy) | ⚠ 7 seats but compact SUV ≠ van/MPV/minibus/large SUV → car_xl does NOT apply; flagged for review |
| Honda | Accord | 2013 | 2022 | sedan | 1498 | 2354 | 5 | true | car_premium | premium allowlist (Honda Accord) | 1.5T units (1498cc) would be economy — allowlist overrides |
| Mercedes-Benz | C-Class | 2014 | 2022 | sedan | 1595 | 1991 | 5 | true | car_premium | premium allowlist (any Mercedes-Benz) | rare on platforms; E-Class also runs (rare) — same allowlist |
| Mitsubishi | Outlander | 2007 | 2022 | SUV | 2360 | 2360 | 5 | true | car_premium | cc band >2000cc | modest supply; 7-seat units → car_xl — verify; added in 2nd pass |
| Mitsubishi | Pajero (5-seat) | 2000 | 2019 | large SUV | 2835 | 3200 | 5 | true | car_premium | cc band >2000cc | 7-seat units → car_xl — verify per unit |
| Nissan | Teana | 2008 | 2016 | sedan | 1998 | 2488 | 5 | true | car_premium | cc band >2000cc | rare; 2.0L units (1998cc) → car_comfort — verify per unit; added in 2nd pass |
| Toyota | Allion | 2007 | 2021 | sedan | 1496 | 1798 | 5 | true | car_premium | premium allowlist (Toyota Allion) | 1.5L units (1496cc) would be economy — allowlist overrides |
| Toyota | Camry | 2011 | still in production | sedan | 1998 | 2494 | 5 | true | car_premium | premium allowlist (Toyota Camry) | 2.0L units (1998cc) would be comfort — allowlist overrides |
| Toyota | Crown | 2008 | 2018 | sedan | 1998 | 2499 | 5 | true | car_premium | premium allowlist (Toyota Crown) | engine varies widely by grade; sub-2000cc hybrid units would be comfort — allowlist overrides |
| Toyota | Harrier | 2013 | still in production | SUV/crossover | 1998 | 2493 | 5 | true | car_premium | premium allowlist (Toyota Harrier) | 2.0T units (1998cc) would be comfort — allowlist overrides |
| Toyota | Land Cruiser (5-seat) | 1998 | 2021 | large SUV | 4461 | 4663 | 5 | true | car_premium | premium allowlist (Land Cruiser, 5-seat) | 8-seat units → car_xl (listed separately) |
| Toyota | Mark X | 2009 | 2019 | sedan | 2499 | 2499 | 5 | true | car_premium | cc band >2000cc | — |
| Toyota | Premio | 2007 | 2021 | sedan | 1496 | 1798 | 5 | true | car_premium | premium allowlist (Toyota Premio) | 1.5L units (1496cc) would be economy — allowlist overrides |
| Toyota | Prado (5-seat) | 2002 | still in production | large SUV | 2693 | 2982 | 5 | true | car_premium | premium allowlist (Prado, 5-seat) | 7-seat units → car_xl (listed separately) |
| Honda | Odyssey | 2004 | 2018 | MPV | 1997 | 3471 | 7–8 | true | car_xl | car_xl rule (≥6 seats + MPV, any engine) | modest supply; cc varies widely by generation (2.0 e:HEV to 3.5 V6); added in 2nd pass |
| Hyundai | Santa Fe | 2012 | still in production | SUV (7-seat) | 2199 | 2497 | 7 | true | car_xl | car_xl rule (≥6 seats + large SUV, any engine) | added in 2nd pass |
| Hyundai | Starex / H-1 | 2012 | still in production | van/MPV | 2359 | 2497 | 9–11 | true | car_xl | car_xl rule (≥6 seats + van/MPV, any engine) | cc approximate |
| Mitsubishi | Pajero Sport | 2018 | still in production | SUV (7-seat) | 2442 | 2972 | 7 | true | car_xl | car_xl rule (≥6 seats + large SUV, any engine) | locally assembled in BD; cc approximate — verify; added in 2nd pass |
| Nissan | Caravan / Urvan | 2005 | still in production | van (commuter) | 1998 | 2488 | 10–12 | varies | car_xl | car_xl rule (≥6 seats + van, any engine) | cc and seat config vary widely by unit — verify |
| Nissan | Serena | 2006 | 2022 | MPV | 1997 | 1998 | 7–8 | true | car_xl | car_xl rule (≥6 seats + MPV, any engine) | modest supply; mostly 2.0 (incl. hybrid); added in 2nd pass |
| Suzuki | APV | 2004 | 2019 | van/MPV | 1493 | 1586 | 7–8 | varies | car_xl | car_xl rule (≥6 seats + van/MPV, any engine) | commercial fleet use; AC varies; added in 2nd pass |
| Suzuki | Ertiga | 2018 | still in production | MPV | 1373 | 1462 | 7 | true | car_xl | car_xl rule (≥6 seats + MPV, any engine) | added in 2nd pass — real supply gap closed; older 1.4 units (1373cc) if any |
| Toyota | Alphard | 2012 | still in production | MPV | 2493 | 3456 | 7 | true | car_xl | car_xl rule (≥6 seats + MPV — any engine) | Vellfire twin: identical classification |
| Toyota | Avanza | 2012 | still in production | MPV | 1296 | 1496 | 7 | true | car_xl | car_xl rule (≥6 seats + MPV, any engine) | — |
| Toyota | Coaster | 2000 | still in production | minibus | 2694 | 2982 | 20–28 | varies | car_xl | car_xl rule (≥6 seats + minibus, any engine) | charter/day-hire market — rarely dispatched on app platforms; cc and seat count vary; added in 2nd pass |
| Toyota | Estima | 2006 | 2019 | MPV | 2362 | 3456 | 7–8 | true | car_xl | car_xl rule (≥6 seats + MPV — overrides >2000cc) | — |
| Toyota | Esquire | 2014 | 2021 | MPV | 1797 | 1986 | 7–8 | true | car_xl | car_xl rule (≥6 seats + MPV, any engine) | Noah/Voxy sibling; modest supply; cc corrected 2nd pass |
| Toyota | Fortuner | 2005 | still in production | large SUV (7-seat) | 2494 | 2982 | 7 | true | car_xl | car_xl rule (≥6 seats + large SUV — any engine) | added in 2nd pass — genuinely common; 5-seat units rare, would be car_premium |
| Toyota | Freed | 2010 | still in production | MPV | 1496 | 1496 | 6–7 | true | car_xl | car_xl rule (≥6 seats + MPV, any engine) | some 5-seat grades may exist → car_economy if verified — flag |
| Toyota | Hiace | 2004 | still in production | van/minibus | 2446 | 2982 | 10–13 | varies | car_xl | car_xl rule (≥6 seats + van — any engine) | BD units mostly petrol; seat count 10–13 by body/grade; AC often front-only |
| Toyota | Innova | 2005 | still in production | MPV | 1998 | 2694 | 7–8 | true | car_xl | car_xl rule (≥6 seats + MPV, any engine) | added in 2nd pass — common in travel/XL use |
| Toyota | Land Cruiser (8-seat) | 2007 | 2021 | large SUV | 4461 | 4608 | 8 | true | car_xl | car_xl rule (≥6 seats + large SUV — overrides premium allowlist) | 5-seat LC → car_premium (listed separately) |
| Toyota | Noah | 2014 | still in production | MPV | 1797 | 1986 | 7–8 | true | car_xl | car_xl rule (≥6 seats + MPV, any engine) | cc corrected 2nd pass (hybrid 1797 / petrol 1986; v1 wrongly listed up to 1998) |
| Toyota | Prius α (Alpha) | 2011 | 2021 | MPV | 1797 | 1797 | 7 | true | car_xl | car_xl rule (≥6 seats + MPV, any engine) | modest supply; added in 2nd pass |
| Toyota | Prado (7-seat) | 2002 | still in production | large SUV | 2693 | 2982 | 7–8 | true | car_xl | car_xl rule (≥6 seats + large SUV — overrides premium allowlist) | 5-seat Prado → car_premium (listed separately) |
| Toyota | Sienta | 2015 | 2022 | MPV | 1496 | 1497 | 6–7 | true | car_xl | car_xl rule (≥6 seats + MPV, any engine) | some 5-seat grades may exist → car_economy if verified — flag; cc refined 2nd pass |
| Toyota | Voxy | 2014 | still in production | MPV | 1797 | 1986 | 7–8 | true | car_xl | car_xl rule (≥6 seats + MPV, any engine) | cc corrected 2nd pass |

---

## Post-table notes (2nd pass)

**Country-of-origin coverage now in the table:** Japan (recon JDM — majority of rows), India (Suzuki/Maruti cars, Bajaj/TVS/Hero/Honda bikes), **Bangladesh** (Runner, Walton legacy, Roadmaster, plus locally assembled Corolla/Lancer legacy, Pajero Sport, Creta), **South Korea** (Hyundai ×5, Kia ×2), **China** (BYD Atto 3), **Malaysia** (Proton ×2), Germany (Mercedes C-Class).

**Three-wheelers — market reality check:** Dhaka's legal CNG fleet is essentially **Bajaj RE + TVS King only**. No other 3W brand has meaningful supply. Vehicles that run on Dhaka streets but are deliberately **excluded**: easy bikes (4-wheel EVs), legunas, Mishuk EVs, battery rickshaws, human haulers — they operate off-platform and often outside city legality, and the current rule set has no category that would house them (cng is 3-wheeler only). Flagging rather than forcing them in.

**Fuel conversions:** a large share of economy sedans (Corolla, Probox, older fleet) run on CNG/LPG conversions. Per the rules, fuel type never changes category — only the 3-wheeler body does.

**Premium allowlist brands with zero-to-trace supply** (BMW, Audi, Lexus, Volvo, Land Rover, Jaguar, Porsche; also MB E-Class): classify car_premium on sight per the allowlist — not rowed individually.

**Pickups excluded** (Hilux, D-Max, Navara): no category fits a goods/pickup tier; flag for platform policy if ever opened.

**Watchlist — seen on Dhaka streets, not rowed due to unverifiable trims or brand-new/rare status** (classify by the same rules once verified): Haval H6, Hyundai Venue, Kia Picanto/Carnival, BYD Dolphin/Seal, MG, Chevrolet (defunct PHP-era Spark/Enjoy/Cruze), Datsun go/go+, Nissan Micra, Mitsubishi Mirage/Eclipse Cross, Subaru Forester, Toyota Agya/Wigo/Granvia/Vellfire/Elgrand/Blade/Auris/Runx/Funcargo/Spacio/Pixis, Suzuki Fronx/Solio/SX4, Honda Airwave/BR-V, Mazda Premacy/CX-5/CX-8, Nissan Elgrand/AD/Bluebird, Daihatsu Thor/Sonio, plus Chinese bikes (Lifan, Dayun, Keeway, Znen) and newer Indian bikes (Pulsar 125/N160/Avenger, TVS Radeon, Honda SP125/X-Blade, Hero Xtreme 160R).

**Highest per-unit verification risk:** Runner/Walton/Roadmaster cc (all flagged), boundary bikes (Metro Plus 109.7, Pulsar 150 149.5, FZS 149.3, Hunk 149.2/163, Passion Pro 97–113, Galaxis 110–125), Vitz/Axio/Fielder/Wingroad/Corolla-local grade splits straddling the 1500cc line, CR-V/X-Trail/Outlander/Tucson premium-crossing grades, Pajero/LC/Prado seat configs, Sienta/Freed possible 5-seat grades, Creta/Seltos/Sportage/Atto 3 exact BD trim data.

**Structural rule gaps (unchanged, all real Dhaka supply):** EVs (Leaf, Atto 3), 996cc crossovers (Raize, Rocky), the 996cc Belta sedan, the 4-seat Every kei van, and the 7-seat Rush that escapes car_xl on a body-type technicality. All forced into car_compact/comfort by the letter of the rules — recommend policy decisions before launch.
