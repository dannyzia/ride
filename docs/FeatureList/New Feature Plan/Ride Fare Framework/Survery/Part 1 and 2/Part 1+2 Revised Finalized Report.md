Here is the complete revised report. It supersedes the previous "Finalized" version and implements every fix from the review: maintenance re-derived, fixed cost reconciled, tallies replaced with verifiable sourcing, the category≠cc rule locked, the time-cost default supplied, the joma structure added, and a Part 3 handoff section included.

---

# Part 1 & 2 — Consolidated Report (v3, Revised)

**Supersedes:** "Finalized Part 1 & 2 Report." This version corrects four defects found in review: (1) the maintenance table sat at or below the minimum of all visible model estimates; (2) fixed-cost annual-km figures were unreconciled with the driver-time section; (3) vote tallies did not match the transcript and are replaced with named-model consensus; (4) "Part 3 can run today" lacked a time-cost default, which is now supplied.

**Status labels:** LOCKED (use as-is) · PROVISIONAL (use with stated default, revisit on field data) · DEFERRED (out of scope, recorded) · BLOCKED (no further modeling helps; needs field data).

**Sourcing note:** Consensus labels cite the five models visible in the transcript (ChatGPT, Claude, DeepSeek, Gemini, GLM 5.3 — GLM's Part 2 tables are truncated). Mimo and Kimi contributed to the prior consolidation but their passes are not shown; where the prior report attributed a position to them it is marked **[unverified]**. Numeric tallies are removed — they could not be reconciled against the transcript (e.g., "7/7 agree" on 100cc Bike Economy vs. ChatGPT's 110cc anchor; "3/7 say 800cc" for Car Economy vs. zero visible models saying 800).

---

## Part 1: Vehicle Taxonomy

| Sub-Category | Anchor cc | Fuel | Status | Basis |
|---|---|---|---|---|
| Bike — Economy | **100cc** | Octane | LOCKED | Visible consensus (ChatGPT's 110cc is adjacent, not a real disagreement) |
| Bike — Standard | **125cc** | Octane | LOCKED | 4 of 5 visible models; DeepSeek dissents at 110cc — economically immaterial (~5% fuel difference) |
| Bike — Premium | **150cc** | Octane | LOCKED | Unanimous among visible models |
| CNG — Standard | **~199cc** (Bajaj RE 198.88) | CNG | LOCKED | Unanimous. cc is descriptive only — costing runs on km/m³ |
| Car — Economy | **1000cc** | fork → 2A | **PROVISIONAL 1000cc** | Visible fork is 1000 (Claude, DeepSeek, GLM: WagonR/Vitz 1.0) vs 1300 (ChatGPT, Gemini: Vitz/Probox 1.3). No visible model supports 800cc. Resolve by fleet count, not more modeling |
| Car — Standard | **1500cc** | fork → 2A | LOCKED (anchor) | Visible consensus |
| Car — Premium | **1500cc** | fork → 2A | LOCKED | Visible models split 1800 (ChatGPT, Claude, DeepSeek) vs 1500 (Gemini, GLM). Locked at 1500 on the import-duty cliff: over-1500cc imports face punitive tax, so the working premium fleet is 1500cc. The tier is defined by model year, condition, and AC — not displacement |
| Car — XL | 1900cc blended (hybrid/ICE) | Hybrid/ICE | **DEFERRED** | Not costed at this stage. Recorded so the anchor decision (Noah/Voxy spans 1.8L hybrid and 2.0L petrol) is not re-litigated later |

### Locked architectural rule: category ≠ cc

Vehicle class is assigned by **body type, age, comfort, and capacity**; engine displacement is a **cost-model parameter only**. No rule of the form `if cc ≥ X → Premium` may exist anywhere in the system. This rule is now load-bearing: Standard and Premium both anchor at 1500cc, so any cc-based eligibility logic would collapse the two tiers into one.

### Consequence for costing

With Standard and Premium sharing 1500cc, the fuel gap between the car tiers narrows to an efficiency assumption (and disappears entirely if Premium skews hybrid). The real tier separation is carried by **depreciation and maintenance** — which makes the fuel-mode survey (2A) and the Bikroy price pull (2C) the two inputs that actually differentiate the tiers.

---

## Part 2: Cost Survey

### A. Fuel Cost — bikes and CNG locked; cars are a four-way fork

Basis: octane **145 BDT/L** (verified, unchanged through Aug 2026; DeepSeek's 132 is the regular-petrol price — models standardize on octane). CNG **40 BDT/m³** (BERC-set band 38–43; a station-owners' proposal to ~47.50 is pending — treat as stress case). DeepSeek's 75 and GLM's 85 BDT/m³ are unsourced projections, rejected in favor of the verified BERC rate. **Fuel price is a live configuration variable, not a hard-coded parameter.**

| Sub-Category | Efficiency | Price | Fuel cost/km | Status |
|---|---|---|---|---|
| Bike Economy | 45 km/L | 145 | **3.22** | LOCKED |
| Bike Standard | 40 km/L | 145 | **3.63** | LOCKED |
| Bike Premium | 33 km/L | 145 | **4.39** | LOCKED (visible range 30–38 km/L) |
| CNG Standard | 20 km/m³ | 40 | **2.00** | LOCKED value; price sensitivity 38–43 (visible efficiency range 18–25); 2.38 at the 47.50 stress price |

**Cars — the single biggest open number in the survey.** The previous report framed this as a two-way fork (CNG vs petrol). It is at least three-way, arguably four:

| Mode | Economy | Standard | Premium | Basis |
|---|---|---|---|---|
| CNG-converted | 2.67 | 3.33 | 4.00 | 15/12/10 km/m³ @ 40 |
| LPG-converted | ~10.00 | ~10.83 | — | Gemini: 6.5/6 km/L @ 65 BDT/L. Conversion fuel matters — CNG and LPG differ ~3× |
| Hybrid (octane) | — | ~10–11 | 12.08 | Gemini premium figure; hybrids are duty-favored and their share is rising |
| Petrol/octane only | 12.08 | 14.50 | 18.13 | 12/10/8 km/L @ 145 |

- **Part 3 default: CNG-converted** for all car tiers, labeled provisional. Rationale: the localized models treat conversion as the operating reality of the working fleet, and per-km fuel economics leave a full-time driver little choice.
- **State the pricing logic out loud:** defaulting to CNG prices the fare card to the cheapest operating mode. Legitimate modal-vehicle strategy — but it squeezes petrol/hybrid holdouts and induces conversion. It is a strategy choice, not just a data default.
- **Survey question (this week):** per-tier mix across {CNG, LPG, hybrid, petrol}. The swing between default and worst case is ~9–14 BDT/km — larger than maintenance and depreciation combined.

### B. Maintenance & Wear — REVISED (previous table sat below the visible range)

The previous "converged" values were at or below the minimum of every visible model for cars, and the stated rationale (tyre-cost correction) would push values **up**, not down. Re-derived at the median of the four visible complete tables:

| Sub-Category | Recommended (BDT/km) | Visible range | Status |
|---|---|---|---|
| Bike Economy | **1.15** | 0.70–1.40 | PROVISIONAL |
| Bike Standard | **1.35** | 0.83–1.40 | PROVISIONAL |
| Bike Premium | **1.60** | 1.07–1.75 | PROVISIONAL |
| CNG Standard | **2.10** | 1.50–3.50 | PROVISIONAL |
| Car Economy | **3.45** | 2.80–4.00 | PROVISIONAL |
| Car Standard | **4.00** | 3.55–4.25 | PROVISIONAL |
| Car Premium | **5.00** | 4.80–5.60 | PROVISIONAL |

Notes: (1) If Mimo's claimed 2–5× tyre correction is real **[unverified]**, bias toward the upper band — never down. (2) Model as an **expected reserve**, not a smooth daily cost; the distribution is lumpy. Store with confidence bands.

### C. Depreciation — bands retained, provisional midpoints added

| Sub-Category | Band (BDT/km) | Provisional midpoint | Status |
|---|---|---|---|
| Bike Economy | 0.7–1.3 | 1.0 | PROVISIONAL |
| Bike Standard | 0.9–1.5 | 1.2 | PROVISIONAL |
| Bike Premium | 1.3–2.4 | 1.9 | PROVISIONAL |
| CNG Standard | 1.4–2.5 | 2.0 | PROVISIONAL |
| Car Economy | 2.7–3.7 | 3.2 | PROVISIONAL |
| Car Standard | 3.8–6.8 | 5.3 | PROVISIONAL |
| Car Premium | 3.7–11.0 | 7.4 | PROVISIONAL — widest spread in the survey; purchase-price guesses ranged 1.3M–3.0M BDT |

Locked method rules:
- Compute on **remaining economic life**, not generic lifetime km: `remaining_km = expected_total_life_km − km_at_acquisition`. Prevents the fare engine from subsidizing old vehicles.
- **Bikroy pull:** 15–20 listings per tier; discount asking prices ~5–10% for transaction estimates.

**Ownership structure (new — previously missing).** A large share of Dhaka car/CNG drivers rent (joma): Gemini estimates >70%, at ~1,000 BDT/day (CNG) and ~1,400 BDT/day (car) **[single-source estimate]**. For renters, joma **replaces** depreciation + insurance/BRTA in the cost stack:

| | Owner-operator capital + fixed /km | Renter joma /km (indicative) |
|---|---|---|
| CNG | 2.0 + 0.26 = 2.26 | 1,000 ÷ 130 ≈ **7.7** |
| Car Standard | 5.3 + 0.76 = 6.06 | 1,400 ÷ 145 ≈ **9.7** |

If the rental share is anywhere near 70%, fares calibrated purely on owner-operator depreciation underprice capital by **~3.5–5.5 BDT/km**. Part 3 must run both scenarios; the survey must measure the split.

### D. Fixed Cost — REVISED (annual km reconciled; lead package excluded)

The lead package is **excluded from the fare cost stack** — correct, and kept. Rationale (locked): the subscription is the platform's own strategic variable; baking it into vehicle operating costs reverse-engineers fares around an arbitrary price and creates circularity. To the driver it is a weekly fixed cost — it simply does not belong in fare-setting cost/km. It re-enters economics in the **driver renewal P&L** (below). The original survey spec asked for this line; it is recorded here as deliberately relocated, not dropped.

Correction: the previous annual-km figures (32,000 bikes / 28,000 premium bikes / 38–40,000 cars) matched no visible source and were inconsistent with Part E's daily km. Annual km is now reconciled to the provisional Part E daily km × 300 working days:

| Sub-Category | Insurance + BRTA/yr | Annual km (reconciled) | Fixed cost/km |
|---|---|---|---|
| Bike Economy | ~4,500 | 36,000 | **0.13** |
| Bike Standard | ~5,000 | 36,000 | **0.14** |
| Bike Premium | ~6,000 | 36,000 | **0.17** |
| CNG Standard | ~10,000 | 39,000 | **0.26** |
| Car Economy | ~22,000 | 40,500 | **0.54** |
| Car Standard | ~33,000 | 43,500 | **0.76** |
| Car Premium | ~43,000 | 45,000 | **0.96** |

### E. Driver Time / Opportunity Cost — provisional base now supplied (was missing)

Time cost is the **largest single component** of loaded cost/km in every category. The previous report correctly refused to average the 7-model spread (targets 600–3,200 BDT/day; speeds 6–18 km/h) but left Part 3 with no input. Supplied now.

**Locked definition:** daily target = take-home after vehicle operating costs (fuel, maintenance, depreciation, insurance/BRTA), **before** the weekly subscription.

**Provisional base** — Claude's rebuilt set, chosen because it is the only visible set whose speed/hours/daily-km triangle closes (DeepSeek's car rows imply 150 km/day against a ~120 km physical ceiling; Claude's set passes by construction):

| Sub-Category | Hrs/day | Target/day | Daily km | Loaded/empty km/h | BDT/hr | Time/km loaded | Time/km empty |
|---|---|---|---|---|---|---|---|
| Bike Economy | 10 | 1,100 | 120 | 18 / 20 | 110 | **6.11** | **5.50** |
| Bike Standard | 10 | 1,250 | 120 | 18 / 20 | 125 | **6.94** | **6.25** |
| Bike Premium | 10 | 1,400 | 120 | 18 / 20 | 140 | **7.78** | **7.00** |
| CNG Standard | 10 | 1,800 | 130 | 14 / 16 | 180 | **12.86** | **11.25** |
| Car Economy | 11 | 2,200 | 135 | 13 / 15 | 200 | **15.38** | **13.33** |
| Car Standard | 11 | 2,600 | 145 | 13 / 15 | 236 | **18.18** | **15.76** |
| Car Premium | 11 | 3,200 | 150 | 13 / 15 | 291 | **22.38** | **19.39** |

Caveats, all field-resolvable:
1. **Definitional ambiguity:** some source models quote targets *including* the subscription (DeepSeek explicitly does). If Claude's do too, this base is conservative-high — it biases toward driver protection and against rider price-competitiveness. The survey must pin the definition.
2. **Utilization:** implied car utilization (82–91% of the driving-time ceiling) assumes little dispatch friction. Optimistic — check against telemetry early.
3. **Stress floor:** DeepSeek's set (targets 700–2,200; cars 11–12 km/h) is the rider-price sensitivity case. Run both in Part 3.

### E+ (new): Implied gross daily revenue requirement

What the fare card must deliver per driver-day, owner-operator scenario (target + vehicle costs × daily km), using the tables above:

| Sub-Category | Vehicle cost/km | Gross requirement/day |
|---|---|---|
| Bike Economy | 5.50 | **1,760** |
| Bike Standard | 6.32 | **2,010** |
| Bike Premium | 8.06 | **2,370** |
| CNG Standard | 6.36 | **2,630** |
| Car Economy (CNG / petrol) | 9.86 / 19.27 | **3,530 / 4,800** |
| Car Standard (CNG / petrol) | 13.39 / 24.56 | **4,540 / 6,160** |
| Car Premium (CNG / petrol) | 17.36 / 31.49 | **5,800 / 7,920** |

Two uses:
1. The fuel fork swings car requirements by **~1,300–2,100 BDT/day (~35%)** — the concrete cost of not running the fuel survey.
2. Cross-check: an independent renter-structure estimate (Gemini: joma 1,400 + LPG fuel + renter net 1,000) lands at ~4,550/day for a standard car — matching the owner-operator CNG figure (~4,540) almost exactly. Two different ownership structures converging on the same gross requirement is genuine (if partial) validation of the car-economics envelope. Caveat: the convergence is fuel-mode-dependent — under CNG fuel the renter requirement drops to ~3,460. The two scenarios bracket reality; the fuel survey decides where inside the bracket you sit.

### F. Pickup Distance Distribution — DEFERRED (correctly), with priors recorded

Unchanged conclusion: unmeasured; must come from Stage-0 dispatch telemetry, per zone type, on **road-network paths** (Dhaka's U-turn penalty makes radial distance meaningless). Priors to seed the simulation — not data:

- Visible-model percentile ranges: dense-core p50 ≈ 0.7–1.5 km; standard-urban p50 ≈ 0.9–2.2 km; peripheral p50 ≈ 1.2–3.5 km. Wide, low confidence.
- DeepSeek's suggested calibration: free radius 1.5–1.8 / 2.2–2.5 / ~3.5 km by zone; billable cap 4 / 6 / 8–9 km; % backstop 20–25%.

One structural point that must shape the Stage-0 design: the pickup distribution is **endogenous to supply density and dispatch behavior** (sequential offers, acceptance rates, timeouts) — it is not a fixed property of Dhaka's geography. Calibrate the free radius to the *realized* distribution at launch supply levels and expect it to shift as the network grows. This argues for zone-differentiated radii from day one rather than a single global value.

---

## Where the subscription lives: the driver renewal P&L

Removing the lead package from the fare stack is only half the correction. It re-enters here:

```
Weekly driver P&L:
  fare_revenue_week
− vehicle_operating_costs_week     (fuel + maintenance + depreciation + fixed — Part 2)
− subscription_week
= take_home_week                   → must be ≥ target/day × days worked
```

Renewal — the north-star metric — is economically rational only when the inequality holds. Two linked metrics carry lead quality into this equation and must be instrumented from day one:

- **loaded_km ÷ total_km** and **loaded_minutes ÷ online_minutes** (utilization)
- Because a lead is consumed at **dispatch**, not completion, every poor sequential offer costs the driver money even when the ride dies. Match quality is load-bearing for renewal in a way it never is under a commission model.

---

## Part 3 handoff

**Ready to use:** revised maintenance (B) · revised fixed cost (D) · depreciation midpoints (C) · bike/CNG fuel (A) · CNG-default car fuel with petrol/LPG/hybrid sensitivities (A) · time-cost base (E) · gross revenue requirements (E+).

**Required checks in Part 3:**

**1. Multiplier coverage test — distribution-aware.** Pointwise version for illustration (marginal empty cost ÷ multiplier, CNG-default fuel):

| Category | Marginal empty cost/km | Multiplier | Required loaded rate |
|---|---|---|---|
| Bike Standard | 12.43 | 0.75 | **16.6** |
| CNG | 17.35 | 0.80 | **21.7** |
| Car Standard | 28.39 (petrol: 39.56) | 0.90 | **31.5** (petrol: 44.0) |

If the planned loaded per-km rate is below these, the pickup fee undercompensates deadhead. Caveat: the pointwise test **overstates** the requirement — free-radius km are by design uncompensated. The real test integrates expected pickup compensation against expected deadhead cost over the zone distance distribution, net of the free radius.

**2. Two-layer pickup calibration.** Rider-facing formula stays distance-based (transparent, one honest sentence). Internal validation runs in **minutes**: `pickup_minutes × driver_value_per_minute`. A 1.5 km / 4-minute pickup and a 1.5 km / 14-minute pickup are economically different trips; the km proxy must be checked against the minute reality.

**3. Scenario matrix:** fuel mode × ownership (owner-op / joma) × time-cost (base / stress floor). The bracket, not any single run, is the answer until field data closes the forks.

All Part 3 outputs (trip_per_km_rate, base_fare, waiting_rate, free radius, caps, multipliers) are **provisional** until the field list below closes.

---

## Field validation list (priority order)

1. **Car fuel-mode mix per tier** (CNG / LPG / hybrid / petrol) — up to ~4.5× fuel swing; ~35% swing in gross revenue requirement. Gates everything.
2. **Driver time, speed, utilization** — own telemetry, Stage-0. Largest cost component; also resolves the target-definition ambiguity (before/after subscription).
3. **Ownership vs rental split + joma rates** by class — swings capital cost ~3.5–5.5 BDT/km on cars/CNG.
4. **Car Economy fleet composition** (1000 vs 1300 share) — plate count or driver survey.
5. **Purchase prices** — 15–20 Bikroy listings per tier, ask −5–10%.
6. **CNG price watch** — BERC decision on the ~47.50 proposal; fuel price stays a live config variable regardless.

---

## Bottom line

- **LOCKED:** taxonomy (all rows except Car Economy cc, provisional at 1000cc) · category ≠ cc rule · bike and CNG fuel costs · lead package excluded from the fare stack.
- **CORRECTED this pass:** maintenance — re-derived at visible medians; do **not** use the previous 2.50/3.50/4.50 car values · fixed cost — annual km reconciled; per-km now 0.13–0.96.
- **PROVISIONAL for Part 3:** CNG-default car fuel · depreciation midpoints · time-cost base (Claude set) with DeepSeek as stress floor · owner-op and joma run as scenarios.
- **BLOCKED on field data, not more prompting:** fuel mix · time/speed telemetry · joma split · Car Economy cc · Bikroy prices · CNG price decision.

Part 3 can run today on the provisional stack above — with the scenario matrix rather than a single point estimate, and every output labeled provisional until field items 1–3 close.

---

Save this as your replacement for "Part 1+2 Finalized Report.md." If you want, I can draft the exact driver-survey question set for field items 1–5 next, since those are now the critical path.