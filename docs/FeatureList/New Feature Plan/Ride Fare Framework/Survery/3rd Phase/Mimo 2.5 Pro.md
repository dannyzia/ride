# Hard Second Pass — Revised Estimates

I went back through every answer and applied the rule I should have followed more strictly the first time: **if I don't actually know, say "unknown."** A lot of my first-pass answers were dressed-up guesses given false structure by neat-looking tables. Here's what survives scrutiny and what doesn't.

---

## Section A — Vehicle Running Facts

**A1. 100–125cc motorcycle, ~3 years old, Dhaka traffic (km/L)**
- Revised: **42** · Range: 30–50 · Confidence: **medium**
- Change: Widened range. Dhaka's congestion is extreme — sustained sub-10 km/h average speeds mean more idling fuel waste than a typical "city" figure would suggest. The 30 floor accounts for very poorly maintained units and peak-hour gridlock. Basis: general knowledge of this motorcycle class in South Asian cities.

**A2. 150cc motorcycle, ~3 years old, Dhaka traffic (km/L)**
- Revised: **35** · Range: 26–42 · Confidence: **medium**
- Change: Lowered point estimate and widened range from first pass. 150cc bikes are meaningfully thirstier in stop-start conditions due to higher kerb weight and displacement. Basis: general knowledge.

**A3. CNG auto-rickshaw (Bajaj RE class), ~4.5 years old, Dhaka traffic (km/m³)**
- Revised: **unknown** · Working range if pressed: 14–25 km/m³ · Confidence: **low**
- Change: **Downgraded from a point estimate to unknown.** I do not have reliable data on the Bajaj RE's real-world CNG consumption in Dhaka conditions. My first-pass figure of 22 was a guess anchored to loosely recalled Indian figures, converted from kg to m³ with assumed density. That chain of assumptions is too long. The search results do not provide this data (citation:2) discusses auto rickshaws generally but gives no fuel efficiency figures.

**A4. 1000cc hatchback, ~6 years old, AC on, Dhaka traffic (km/L)**
- Revised: **11** · Range: 7–15 · Confidence: **low**
- Change: Lowered point estimate slightly, widened range. Six-year-old kei-class or small hatchbacks (Alto, Mira, Passo) in Dhaka's worst traffic with AC running will be at the low end of their city efficiency range. Basis: general automotive knowledge. No Dhaka-specific data found.

**A5. 1500cc sedan, ~6 years old, AC on, Dhaka traffic (km/L)**
- Revised: **8** · Range: 5–11 · Confidence: **low**
- Change: Lowered from 9. Older 1.5L sedans (Allion, Premio, Axio) in Dhaka traffic are heavier and less efficient than my first pass suggested. The floor of 5 accounts for badly congested peak hours. Basis: general knowledge.

**A6. 1500cc premium sedan, ~6 years old, AC on, Dhaka traffic (km/L)**
- Revised: **7** · Range: 4–10 · Confidence: **low**
- Change: Lowered from 8. Premium sedans tend to be heavier, with more equipment drawing power. Basis: reasoning only.

**A7. Hybrid microbus (Noah/Voxy class), ~6 years old, Dhaka traffic (km/L)**
- Revised: **11** · Range: 7–14 · Confidence: **low**
- Change: Lowered from 12. The hybrid system helps in stop-start traffic, but the vehicle is large and heavy, and a 6-year-old hybrid battery will have degraded. Basis: reasoning from general knowledge of Toyota hybrid systems. No Dhaka-specific data.

**A8. Routine maintenance cost (BDT per month)**

| Vehicle type | Revised est. | Range | Confidence | Notes |
|---|---|---|---|---|
| 100–125cc motorcycle | 3,000 | 2,000–5,000 | low | Chain, tyres, oil, filters. Cheap parts available locally. |
| 150cc motorcycle | 3,500 | 2,500–6,000 | low | Slightly more expensive consumables than 100-125cc. |
| CNG auto-rickshaw | unknown | 3,000–8,000 | very low | Three-wheeler maintenance is a different skillset; I lack data. |
| 1000cc hatchback | unknown | 4,000–10,000 | very low | Imported used-car parts pricing is opaque. |
| 1500cc sedan | unknown | 6,000–15,000 | very low | Same issue. |
| 1500cc premium sedan | unknown | 8,000–18,000 | very low | Same issue. |
| Hybrid microbus | unknown | 8,000–20,000 | very low | Hybrid battery replacement risk makes this especially uncertain. |

- Change: **Downgraded most car/microbus entries to "unknown."** My first-pass numbers were fabricated precision on a topic I have no real data for. Monthly maintenance cost depends heavily on parts sourcing (OEM vs. aftermarket vs. Chinese imports), driver skill, and how you amortize major repairs. I should not have given point estimates.

---

## Section B — The Driver's Working Day

**B1. Typical working hours per day (full-time)**

| Vehicle type | Revised est. | Range | Confidence |
|---|---|---|---|
| Motorcycle | 12 | 10–14 | low |
| CNG auto-rickshaw | 12 | 10–14 | low |
| 1000cc hatchback | 11 | 9–13 | low |
| 1500cc sedan | 11 | 9–13 | low |
| 1500cc premium sedan | 10 | 8–12 | low |
| Hybrid microbus | 10 | 8–12 | low |

- Change: Downgraded motorcycle confidence from medium to low. Citation:5 confirms motorcycle ride-share drivers work long hours in Dhaka, but doesn't give a specific number. The general gig-economy research I referenced in the first pass (59–77 hrs/week) is from other markets and may not transfer cleanly.

**B2. Typical paying trips per day**
- Revised: **unknown for all vehicle types.**
- Change: **Full downgrade to unknown.** My first-pass estimates were derived by dividing working hours by estimated trip duration — which violates the instruction to not calculate/derive. I do not have direct data on trips per day from the search results or from reliable knowledge.

**B3. Typical distance of one paying trip**
- Revised: **unknown for all vehicle types.**
- Change: **Full downgrade to unknown.** Same issue — I was reasoning from general patterns, not stating known facts.

**B4. Typical duration of one paying trip**
- Revised: **unknown for all vehicle types.**
- Change: **Full downgrade to unknown.** Same reasoning issue.

**B5. Share of daily km: passenger on board vs. empty**
- Revised: **unknown for all vehicle types.**
- Change: **Full downgrade to unknown.** I have no data on this. The deadhead ratio is a critical operating metric that requires trip-level GPS data to calculate. I should not have guessed.

**B6. Typical distance from accepting request to reaching passenger**
- Revised: **unknown for all vehicle types.**
- Change: **Full downgrade to unknown.** No data.

**B7. Typical time from accepting request to reaching passenger**
- Revised: **unknown for all vehicle types.**
- Change: **Full downgrade to unknown.** No data.

**Honest assessment of Section B:** I should not have filled in every cell in the first pass. The search results tell us almost nothing about driver working patterns in Dhaka. The only relevant signal is citation:5, which confirms motorcycle ride-sharing drivers exist and work long enough to spend "hours in fuel lines" — but that's about fuel queues, not working hours per se.

---

## Section C — Driver Income and Vehicle Rental

**C1. Typical daily take-home after fuel and vehicle payments (BDT)**

| Vehicle type | Revised est. | Range | Confidence | Basis |
|---|---|---|---|---|
| Motorcycle | 800 | 400–1,200 | **low-medium** | citation:6 implies current earnings are below driver demands; citation:5 confirms financial pressure |
| All others | unknown | — | — | No data |

- Change: **Downgraded all non-motorcycle entries to unknown.** My first-pass estimates for CNG, car, and microbus drivers were fabricated. The search results only provide evidence about motorcycle ride-share drivers. Citation:6 reports that Uber and Pathao drivers in Dhaka are demanding a minimum fare of BDT 300 and BDT 35/km because "increasing fuel prices, vehicle maintenance expenses, and unchanged ride fares have created significant financial pressure" and "many also report difficulties in repaying vehicle loans and managing household expenses." This tells us earnings are under pressure but doesn't give a specific daily take-home figure even for motorcycles.
- For motorcycles specifically: I'm keeping a point estimate of 800 because it's consistent with the general picture from citation:6 (drivers are struggling) and citation:5 (a driver turned to ride-sharing after losing business savings), but the confidence is low-medium, not medium as I originally stated.

**C2. Minimum daily take-home before switching to other work (BDT)**
- Revised: **unknown for all vehicle types.**
- Change: **Full downgrade to unknown.** My first-pass estimates were reasoning about reservation wages, which requires knowledge of outside options and opportunity costs that I don't have for Dhaka specifically. The search results don't address this.

**C3. Typical vehicle rental payment**
- Revised: **unknown for all vehicle types.**
- Change: **Full downgrade to unknown.** No data in search results. My first-pass numbers were pure speculation.

**C4. Share of drivers who rent rather than own**
- Revised: **unknown for all vehicle types.**
- Change: **Full downgrade to unknown.** No data.

---

## Section D — Market Reference

**D1. Current pump price of octane in Bangladesh (BDT/litre)**
- Revised: **unknown.**
- Change: **Downgraded to unknown.** My first-pass estimate of 135 was a guess. I have no search result giving the current 2026 price. The fuel market has been disrupted (citation:5 references supply disruptions linked to the war in Iran), so historical prices are unreliable anchors.

**D2. Current pump price of petrol in Bangladesh (BDT/litre)**
- Revised: **unknown.**
- Change: Same as D1.

**D3. Current CNG price at Dhaka stations (BDT per cubic metre)**
- Revised: **unknown** · Historical reference: Tk 30/m³ as of a past government hike (citation:8).
- Change: **Downgraded to unknown for current price.** Citation:8 reports CNG was raised to Tk 30 per cubic metre from Tk 25 during a government fuel price hike, but this article appears to be from 2011 based on context (mentions "yesterday" government action, references to that era's policy environment). I cannot extrapolate from a 2011 regulated price to 2026. The search results confirm fuel prices have been rising due to the Iran conflict (citation:5), but don't give a current CNG price.

**D4. Used purchase price, ~3-year-old 125cc motorcycle (BDT)**
- Revised: **unknown** · Working range if pressed: 70,000–1,40,000 · Confidence: **low**
- Change: Lowered confidence. No search result provides used motorcycle pricing for Dhaka. My first-pass estimate was reasoning only.

**D5. Used purchase price, ~4.5-year-old Bajaj RE CNG auto-rickshaw (BDT)**
- Revised: **unknown.**
- Change: **Full downgrade.** No data whatsoever in search results. My first-pass figure was a guess.

**D6. Used purchase price, ~6-year-old Toyota Axio (BDT)**
- Revised: **unknown** · Working range if pressed: 15,00,000–25,00,000 · Confidence: **low**
- Change: In my first pass, I cited a "market price guide showing Toyota Axio (2014–2018 models) at ৳15–21 Lakh" — **that source is not in the current search results.** I should not have cited it. Removing that reference. The estimate is now based purely on general knowledge of Bangladesh's used car market, which is low confidence.

**D7. What a rider typically pays for a 5 km trip**

| Mode | Revised est. (BDT) | Range (BDT) | Confidence |
|---|---|---|---|
| Bike | unknown | 50–100 | low |
| CNG auto | unknown | 70–130 | low |
| Car | unknown | 100–180 | low |

- Change: **Downgraded all to "unknown" with ranges only.** Citation:6 tells us drivers are demanding BDT 300 minimum fare and BDT 35/km, which implies current fares are significantly below that — but it doesn't tell us what current fares actually are. I cannot reverse-engineer a 5 km fare from a protest demand without knowing the current fare structure (base fare, per-km rate, minimum fare, surge, platform commission), which I don't. My first-pass point estimates were guesses.

---

## Summary of Changes

| Section | First pass: items with a point estimate | Second pass: items with a point estimate | Items downgraded to "unknown" |
|---|---|---|---|
| A (Vehicle facts) | 15 | 10 | 5 (A3, A8 for 5 vehicle types) |
| B (Working day) | 42 | 6 (B1 only) | 36 |
| C (Income/rental) | 28 | 1 (C1 motorcycle only) | 27 |
| D (Market ref) | 10 | 0 | 10 |
| **Total** | **95** | **17** | **78** |

**The first pass had 95 point estimates. The second pass has 17.** That's a more honest reflection of what I actually know versus what I was pattern-completing to fill a table.

The search results provided for this second pass are thin on Dhaka ride-hailing specifics. The most useful citations are:
- **(citation:6)** — confirms driver protest demands (BDT 300 min fare, BDT 35/km) and financial pressure from fuel costs and stagnant fares
- **(citation:5)** — confirms motorcycle ride-sharing exists in Dhaka and fuel supply disruptions from the Iran conflict are affecting operations
- **(citation:8)** — historical CNG price reference (Tk 30/m³, appears to be from 2011)
- **(citation:2)** — general auto rickshaw background, confirms Bajaj as major manufacturer

If you have access to Dhaka-specific data sources (platform fare calculators, driver surveys, BSTI fuel price bulletins, used vehicle listing sites like Bikroy.com), I can produce much tighter estimates with actual anchoring.