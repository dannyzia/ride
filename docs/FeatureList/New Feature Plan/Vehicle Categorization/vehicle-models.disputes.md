# Vehicle Models — Disputes & Reference

> **Auto-generated from master-parts/*.json.** Re-run after dataset edits.

## Per-Category Row Counts

| Category | Rows | Disputes |
|----------|------|----------|
| bike_basic | 39 | 0 |
| bike_standard | 66 | 2 |
| bike_plus | 75 | 0 |
| cng | 24 | 2 |
| car_compact | 88 | 5 |
| car_economy | 155 | 15 |
| car_comfort | 132 | 26 |
| car_premium | 213 | 31 |
| car_xl | 156 | 27 |
| **Total** | **948** | **108** |

Confidence: 167 verified / 781 single_source / 0 guessed.

## Moved to car_xl (Rule 5: seats >= 6 + suv_large -> car_xl)

### From car_comfort (15 rows)
Oshan X7, Tiggo 8, Glory 580, Haval H5, Haval H9, Crossroad, Creta, Tucson, Jetour X70, Jetour X90, Gloster, Aruz, XL7, Rush (7-seat)

### From car_premium (48 rows)
All luxury 7-seat SUVs: BMW X5(7-seat)/X7, Mercedes GLE(7-seat)/GLS, Audi Q7/Q8, Lexus GX/LX, Range Rover(7-seat)/Defender(7-seat)/Discovery(7-seat), Toyota Land Cruiser(7-seat)/Prado(7-seat)/Fortuner(7-seat), Hyundai Santa Fe(7-seat)/Sorento(7-seat), etc.

## Removed

### Pickups (Zia-approved)
Ford Ranger, Chevrolet Colorado, Mitsubishi L200/Triton, Nissan Navara/Frontier, Toyota Hilux, Toyota Tacoma, Toyota Tundra, Isuzu D-Max (1.9L/2.5L/3.0L), Isuzu D-Max (2.5L/3.0L)

### 7-seat-only luxury from car_premium (no real 5-seat config)
BMW X7, Audi Q7, Mercedes-Benz GLS -> moved to car_xl

### Duplicates removed
Land Rover Discovery 5-seat (duplicate of Discovery)

## Active Disputes

- **bike_standard**: Hero Passion Pro — cc range 97-113 spans basic/standard boundary — banded by cc_max
- **bike_standard**: Roadmaster Velocity — source cc conflict 100 vs 150 — banded by cc_max
- **cng**: Easy Bike Standard — EV — no canonical cc; pre-decided for admin review
- **cng**: Mahindra Treo — EV — no canonical cc; pre-decided for admin review
- **car_compact**: Daihatsu Rocky — sub-1001cc crossover — product may want comfort — needs Zia
- **car_compact**: Nissan Leaf — EV — no canonical cc; pre-decided for admin review
- **car_compact**: Toyota Raize — sub-1001cc crossover — product may want comfort — needs Zia
- **car_compact**: Hyundai Kona 1.0 — sub-1001cc crossover — car_compact by cc band
- **car_compact**: MG ZS 1.0 — sub-1001cc crossover — car_compact by cc band
- **car_economy**: Chery QQ — cc range 812–1083 spans category boundary — banded by cc_max
- **car_economy**: Chevrolet Spark (4-seat) — cc range 995–1206 spans category boundary — banded by cc_max
- **car_economy**: Daihatsu Boon (4-seat) — cc range 998–1296 spans category boundary — banded by cc_max
- **car_economy**: Daihatsu Sirion (1.0L/1.3L) — cc range 998–1296 spans category boundary — banded by cc_max
- **car_economy**: FAW X-PV — cc range 998–1298 spans category boundary — banded by cc_max
- **car_economy**: Geely LC — cc range 998–1342 spans category boundary — banded by cc_max
- **car_economy**: Geely Panda — cc range 998–1342 spans category boundary — banded by cc_max
- **car_economy**: Haima 1 — cc range 998–1299 spans category boundary — banded by cc_max
- **car_economy**: Kia Morning — cc range 998–1248 spans category boundary — banded by cc_max
- **car_economy**: Kia Picanto (1.0L/1.2L) — cc range 998–1248 spans category boundary — banded by cc_max
- **car_economy**: Nissan March/Micra (1.0L/1.2L) — cc range 998–1198 spans category boundary — banded by cc_max
- **car_economy**: Perodua Myvi — cc range 998–1496 spans category boundary — banded by cc_max
- **car_economy**: Toyota Belta — cc range 996–1496 spans category boundary — banded by cc_max
- **car_economy**: Toyota iQ — cc range 996–1329 spans category boundary — banded by cc_max
- **car_economy**: Mitsubishi Mirage — cc range 999–1193 spans category boundary — banded by cc_max
- **car_comfort**: Chery Tiggo 7 Pro — cc range 1498–1598 spans category boundary — banded by cc_max
- **car_comfort**: DFSK Glory 580 (1.5L/1.8L) — cc range 1498–1798 spans category boundary — banded by cc_max
- **car_comfort**: Ford Kuga (1.5L/2.0L) — cc range 1499–1999 spans category boundary — banded by cc_max
- **car_comfort**: Haval H6 — cc range 1497–1998 spans category boundary — banded by cc_max
- **car_comfort**: Haval H6 (1.5L/2.0L) — cc range 1497–1967 spans category boundary — banded by cc_max
- **car_comfort**: Hyundai Creta — cc range 1353–1591 spans category boundary — banded by cc_max
- **car_comfort**: Kia Seltos — cc range 1353–1591 spans category boundary — banded by cc_max
- **car_comfort**: Mazda Axela/Mazda3 (1.5L/2.0L) — cc range 1498–1998 spans category boundary — banded by cc_max
- **car_comfort**: Mazda CX-3 — cc range 1496–1998 spans category boundary — banded by cc_max
- **car_comfort**: Mazda CX-3 (1.5L/2.0L) — cc range 1498–1998 spans category boundary — banded by cc_max
- **car_comfort**: Mazda CX-3 / CX-30 — cc range 1496–1998 spans category boundary — banded by cc_max
- **car_comfort**: MG ZS 1.5 — cc range spans category boundary — split by cc band
- **car_comfort**: Nissan Juke (1.5L/1.6L) — cc range 1498–1618 spans category boundary — banded by cc_max
- **car_comfort**: Nissan NV200 — cc range 1498–1597 spans category boundary — banded by cc_max
- **car_comfort**: Nissan Qashqai — cc range 1197–1997 spans category boundary — banded by cc_max
- **car_comfort**: Nissan Wingroad — cc range 1497–1798 spans category boundary — banded by cc_max
- **car_comfort**: Omoda C5 (1.5L/1.6L) — cc range 1498–1598 spans category boundary — banded by cc_max
- **car_comfort**: Proton Saga — cc range 1295–1582 spans category boundary — banded by cc_max
- **car_comfort**: Proton Satria Neo — cc range 1332–1597 spans category boundary — banded by cc_max
- **car_comfort**: Ssangyong Korando (1.5L/1.6L) — cc range 1497–1597 spans category boundary — banded by cc_max
- **car_comfort**: Suzuki S-Cross — cc range 1373–1586 spans category boundary — banded by cc_max
- **car_comfort**: Toyota C-HR — cc range 1196–1797 spans category boundary — banded by cc_max
- **car_comfort**: Toyota C-HR 1.2/1.8 — cc range 1196–1798 spans category boundary — banded by cc_max
- **car_comfort**: Toyota Corolla (locally assembled) — cc range 1497–1798 spans category boundary — banded by cc_max
- **car_comfort**: BYD Atto 3 — EV crossover — car_comfort per Zia 2026-08-23
- **car_comfort**: MG HS — cc range 1498–1995 spans category boundary — banded by cc_max
- **car_premium**: Audi e-tron — EV — no canonical cc; pre-decided for admin review
- **car_premium**: BYD S6 (2.0L/2.4L) — cc range 1991–2378 spans category boundary — banded by cc_max
- **car_premium**: Ford Escape (2.0L/2.3L/2.5L) — cc range 1999–2488 spans category boundary — banded by cc_max
- **car_premium**: Honda CR-V (2.0L/2.4L) — cc range 1997–2356 spans category boundary — banded by cc_max
- **car_premium**: Hyundai Santa Fe (2.0L/2.2L/2.4L/2.7L) — cc range 1998–2656 spans category boundary — banded by cc_max
- **car_premium**: Hyundai Sonata (2.0L/2.4L/2.5L) — cc range 1998–2497 spans category boundary — banded by cc_max
- **car_premium**: Infiniti Q50 — cc range 1991–3799 spans category boundary — banded by cc_max
- **car_premium**: Isuzu MU-X (1.9L/2.5L/3.0L) — cc range 1898–2999 spans category boundary — banded by cc_max
- **car_premium**: Jaguar I-Pace — EV — no canonical cc; pre-decided for admin review
- **car_premium**: Kia K5/Optima (2.0L/2.4L) — cc range 1999–2359 spans category boundary — banded by cc_max
- **car_premium**: Kia Sorento (2.0L/2.2L/2.4L) — cc range 1998–2359 spans category boundary — banded by cc_max
- **car_premium**: Mazda Atenza/Mazda6 (2.0L/2.5L) — cc range 1998–2488 spans category boundary — banded by cc_max
- **car_premium**: Mazda CX-5 — cc range 1997–2488 spans category boundary — banded by cc_max
- **car_premium**: Mazda CX-5 (2.0L/2.5L) — cc range 1998–2488 spans category boundary — banded by cc_max
- **car_premium**: Mitsubishi Outlander (2.0L/2.4L) — cc range 1998–2360 spans category boundary — banded by cc_max
- **car_premium**: Nissan Cefiro (2.0L/2.5L/3.5L) — cc range 1995–3498 spans category boundary — banded by cc_max
- **car_premium**: Nissan Rogue/X-Trail (2.0L/2.5L) — cc range 1997–2488 spans category boundary — banded by cc_max
- **car_premium**: Nissan Teana — cc range 1998–2488 spans category boundary — banded by cc_max
- **car_premium**: Nissan Teana (2.0L/2.5L/3.5L) — cc range 1997–3498 spans category boundary — banded by cc_max
- **car_premium**: Nissan X-Trail (2.0L/2.5L) — cc range 1997–2488 spans category boundary — banded by cc_max
- **car_premium**: Porsche Taycan — EV — no canonical cc; pre-decided for admin review
- **car_premium**: Ssangyong Actyon (2.0L/2.3L) — cc range 1998–2295 spans category boundary — banded by cc_max
- **car_premium**: Ssangyong Kyron (2.0L/2.7L/3.2L) — cc range 1998–3199 spans category boundary — banded by cc_max
- **car_premium**: Ssangyong Rexton (2.0L/2.2L/2.7L/3.2L) — cc range 1998–3199 spans category boundary — banded by cc_max
- **car_premium**: Subaru Exiga (2.0L/2.5L) — cc range 1994–2498 spans category boundary — banded by cc_max
- **car_premium**: Subaru Forester (2.0L/2.5L) — cc range 1994–2498 spans category boundary — banded by cc_max
- **car_premium**: Subaru Legacy (2.0L/2.5L) — cc range 1994–2498 spans category boundary — banded by cc_max
- **car_premium**: Suzuki Grand Vitara (1.6L/2.0L/2.4L) — cc range 1586–2393 spans category boundary — banded by cc_max
- **car_premium**: Toyota RAV4 (2.0L/2.4L/2.5L) — cc range 1998–2494 spans category boundary — banded by cc_max
- **car_premium**: Volvo C40 — EV — no canonical cc; pre-decided for admin review
- **car_premium**: Volvo XC90 — 5-seat premium row; 7-seat configs may belong in car_xl via suv_large — product review
- **car_xl**: BYD M6 (7-seat) — cc range 1991–2378 spans category boundary — banded by cc_max
- **car_xl**: Ford Endeavour 2.0/3.2 — cc range 1996–3198 spans category boundary — banded by cc_max
- **car_xl**: Ford Transit — cc range 1995–3496 spans category boundary — banded by cc_max
- **car_xl**: Honda Odyssey — cc range 1997–3569 spans category boundary — banded by cc_max
- **car_xl**: Honda Stepwgn — cc range 1496–1997 spans category boundary — banded by cc_max
- **car_xl**: Hyundai Grand Starex — cc range 1997-2497 spans category boundary — banded by cc_max
- **car_xl**: Hyundai Staria — cc range 1998–2199 spans category boundary — banded by cc_max
- **car_xl**: Mitsubishi Delica — cc range 1997–2998 spans category boundary — banded by cc_max
- **car_xl**: Mitsubishi Delica D:5 — cc range 1998–2359 spans category boundary — banded by cc_max
- **car_xl**: Nissan Caravan / Urvan — cc range 1998-2488 spans category boundary — banded by cc_max
- **car_xl**: Ssangyong Rodius/Stavic — cc range 1998–3199 spans category boundary — banded by cc_max
- **car_xl**: Subaru Exiga (7-seat) — cc range 1994–2498 spans category boundary — banded by cc_max
- **car_xl**: Suzuki APV — cc range 1493–1590 spans category boundary — banded by cc_max
- **car_xl**: Suzuki Every — kei microvan 657cc in XL via seats rule — product review; 4-seat variant in car_compact
- **car_xl**: Tesla Model X — EV — no canonical cc; pre-decided for admin review
- **car_xl**: Toyota Estima/Previa — cc range 1998–2362 spans category boundary — banded by cc_max
- **car_xl**: Toyota Innova Crysta — cc range 1998–2694 spans category boundary — banded by cc_max
- **car_xl**: DFSK Glory 580 (7-seat) — cc range 1498–1798 spans category boundary — banded by cc_max
- **car_xl**: Tata Sumo — cc range 1948–2956 spans category boundary — banded by cc_max
- **car_xl**: Tata Safari — cc range 1956–2179 spans category boundary — banded by cc_max
- **car_xl**: Ssangyong Rexton (7-seat) — cc range 1998–3199 spans category boundary — banded by cc_max
- **car_xl**: Nissan X-Trail (7-seat) — cc range 1997–2488 spans category boundary — banded by cc_max
- **car_xl**: Isuzu MU-X (7-seat) — cc range 1898–2999 spans category boundary — banded by cc_max
- **car_xl**: Ford Everest (7-seat) — cc range 1998–3198 spans category boundary — banded by cc_max
- **car_xl**: Cadillac XT6 (7-seat) — cc range 1998–3649 spans category boundary — banded by cc_max
- **car_xl**: Toyota Innova — cc range 1998–2694 spans category boundary — banded by cc_max
- **car_xl**: BMW X7 — 7-seat only; provenance reset by auditor — fabricated source list removed

**Total disputes:** 108
