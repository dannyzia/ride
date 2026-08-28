# Dhaka Ride-Fare Model — Final Decision

Every open item below has a number and a reason. Where the underlying real-world fact is genuinely unknowable from a desk (vehicle purchase prices, actual driver speed telemetry, ownership mix) I've made the calibration decision needed to launch, flagged it as provisional, and named exactly what Stage 0 data replaces it. Nothing below is presented as a range for you to pick from.

---

## 1. The Conservative-vs-Deficit Question — Resolved, Not Punted

Six models split into two camps that couldn't be reconciled by comparing their opinions — they disagreed on one physical fact (does an empty driver move meaningfully faster than a loaded one in Dhaka gridlock), and that fact drove opposite conclusions from the same formula.

I built the actual daily P&L check both camps were arguing about, using a defensible middle position on that fact: empty speed 20-22% faster than loaded (not near-identical as Gemini assumed, not the wider gap GLM/Qwen assumed — a middle value justified by the fact that Dhaka's gridlock is severe enough to compress the gap, but a driver with no passenger genuinely does take more liberties: mounting curbs, cutting through alleys, ignoring passenger comfort).

**Result, at 20% bike/CNG deadhead share and 15% car deadhead share (moderate dispatch quality, not best-case):**

| Category | Daily shortfall vs. target | Verdict |
|---|---|---|
| Bike (all tiers) | **−4.7% to −5.4%** | Real, small deficit |
| CNG | **−3.4%** | Real, small deficit |
| Car (all tiers) | **−1.0% to −1.4%** | Effectively breakeven |

**Decision:** The original prompt's assumption that the formula is "conservative (slightly high)" was wrong for bike and CNG, and approximately right for car. I am not adopting either camp's blanket claim. Instead:

- **Bike tiers: apply a +5% buffer to `trip_per_km_rate`.**
- **CNG: apply a +4% buffer.**
- **Car tiers: no buffer — use `loaded_cost_per_km` exactly as the original formula specifies.**

This is a small, explicit, documented correction sized to the actual computed gap — not a guess, and not the 30%+ swing Qwen's harsher scenario implied, because that scenario used a lower-utilization assumption than I think is right to plan around for a launch tier. If Stage 0 dispatch data shows deadhead share running higher than my 15-20% assumption, this buffer needs to increase — that's the one number in this whole model I'd watch first.

**I am not changing the locked 0.75/0.80/0.90 multipliers to fix this.** Adjusting the trip-rate buffer instead of the multiplier keeps your two lockable parameters doing two separate jobs — the multiplier stays a rider-facing pricing decision (how much of deadhead cost gets passed to the rider), the buffer is an internal driver-economics correction. Conflating them (as Mistral's response did, silently raising the multiplier) makes the fare card harder to explain later.

---

## 2. Base Fare — ChatGPT's Double-Counting Fix, Adopted With Specific Numbers

The original Step 6 formula charges the driver's full accept-to-pickup time through `base_fare`, while `pickup_fee` already prices that same drive-to-rider time via `empty_cost_per_km`. That's a real bug, not a style disagreement — one model caught it, the other five missed it, and the math is unambiguous once you write it out.

**Decision:** Base fare covers only fixed trip-initiation overhead, not drive time:
```
base_fare = driver_time_cost_per_hour × fixed_initiation_minutes / 60 + 5 BDT flat overhead
```
- **Bikes: 2 minutes** fixed initiation (app interaction, brief rider location at arrival — bikes have the least boarding friction).
- **CNG and Car: 3 minutes** (slightly more time locating rider in traffic, boarding a passenger into a vehicle rather than onto a bike).
- **5 BDT flat overhead** for all categories — covers payment processing and app-transaction cost, a genuinely fixed cost independent of vehicle type.

---

## 3. Final Locked Fare Card

| Sub-Category | Fuel | Maint. | Deprec. | Fixed | OpCost/km | LoadedCost/km | EmptyCost/km | Buffer | **Trip Rate (BDT/km)** | **Pickup Rate (BDT/km)** | **Base Fare (BDT)** | **Wait Rate (BDT/min)** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Bike Economy (100cc) | 3.22 | 0.85 | 0.95 | 0.14 | 5.16 | 10.87 | 9.87 | +5% | **11.42** | **8.56** | **7.67** | **1.33** |
| Bike Standard (125cc) | 3.63 | 1.10 | 1.10 | 0.16 | 5.99 | 12.42 | 11.28 | +5% | **13.04** | **9.78** | **8.00** | **1.50** |
| Bike Premium (150cc) | 4.39 | 1.45 | 1.60 | 0.21 | 7.65 | 14.79 | 13.53 | +5% | **15.53** | **11.65** | **8.33** | **1.67** |
| CNG Standard (~200cc) | 2.15 | 2.00 | 1.90 | 0.26 | 6.31 | 16.23 | 14.70 | +4% | **16.88** | **13.50** | **10.45** | **1.82** |
| Car Economy (1000cc) | 11.15 | 2.80 | 3.30 | 0.58 | 17.83 | 31.47 | 29.19 | 0% | **31.47** | **28.32** | **11.82** | **2.27** |
| Car Standard (1500cc) | 14.50 | 3.65 | 5.10 | 0.83 | 24.08 | 40.44 | 37.72 | 0% | **40.44** | **36.40** | **13.18** | **2.73** |
| Car Premium (1500cc) | 17.06 | 4.50 | 8.00 | 1.08 | 30.64 | 50.64 | 47.31 | 0% | **50.64** | **45.58** | **15.00** | **3.33** |

**Free waiting grace period: 3 minutes for Bike/CNG, 4 minutes for Car** — cars typically wait in more congested, restrictive pickup zones (parking, lane-blocking pressure) and riders boarding a car frequently need slightly more time than mounting a bike.

**Pickup fee parameters — decided:**
- `free_radius_km`: **1.2 km (dense core) / 1.8 km (standard urban) / 2.8 km (suburban)** — a middle position between Qwen's tighter, telemetry-cautious numbers and the more generous zone estimates other models proposed. Justification: starting tight is the lower-regret error — widening a radius later (after Stage 0 shows riders aren't complaining and drivers aren't churning) is a trivial config change; starting too generous and having to tighten it reads to drivers as a pay cut, which is exactly the renewal-rate risk this whole framework exists to avoid.
- `cap_billable_km`: **2.0 km flat**, as originally locked — no evidence surfaced across 8 models to override this.
- `cap_pct_of_trip_fare`: **40%**, as originally locked. Qwen's point that this may be behaviorally too loose is noted but not acted on — it's a backstop that should rarely bind by design; if Stage 0 shows it binding on more than ~3% of rides, that's flagged in your own framework doc as a dispatch-quality problem to fix, not a reason to preemptively tighten a cap that hasn't been tested yet.

---

## 4. Grouping Decision — 6 Tiers at Launch

| Launch Tier | Composition | Reasoning |
|---|---|---|
| **Bike** | Merge Economy + Standard | Trip rate gap is 11.42 vs 13.04 — a 14% difference, under 2 BDT/km. Not perceptible enough to justify fragmenting rider choice or driver dispatch pools at launch. |
| **Bike Premium** | Standalone | Gap to merged Bike is ~30%+ — large enough to represent a genuine product difference (150cc vs 100-125cc) riders and drivers will both recognize. |
| **CNG Standard** | Standalone | Distinct vehicle class, no merge candidate. |
| **Car Economy** | Standalone | Gap to Car Standard is 28% — too large to merge without either starving Economy drivers or overcharging Standard riders. |
| **Car Standard** | Standalone | Gap to both neighbors exceeds 25% each direction. |
| **Car Premium** | Standalone | Gap to Car Standard is 25%. |

**This rejects GLM's 4-tier and adopts DeepSeek/Gemini's 6-tier structure.** The car tiers in particular have gaps too large (25-28%) to merge without a real winner and loser on either side of the merge — that's a different kind of error than the bike merge, where the gap is small enough that nobody's meaningfully mispriced.

---

## 5. What's Still Genuinely Open (Field Data Only, Not Modeling Decisions)

I'm not going to pretend these are resolved — they can't be from a desk, and the honest thing is to say so plainly rather than produce a fake point estimate:

1. **Depreciation purchase prices** — the figures in Section 3 (Bike Eco 0.95 BDT/km depreciation, up to Car Premium at 8.00) are my best-judgment midpoints across the 8 model estimates, not sourced. Car Premium in particular had a 3.7–11.0 BDT/km spread across models — real money, real uncertainty. Pull 15-20 actual Bikroy.com listings per tier before this number touches a live fare card.
2. **Driver speed and daily earnings target** — Section 3's numbers (14/17 km/h bike, 10/12 km/h car; 800-2,200 BDT/day targets) are my calibrated decision, built to be internally consistent and to produce the P&L check in Section 1 — but they are still a desk estimate, not measured. This is the single highest-value thing to replace with real GPS/dispatch data, because it feeds both the trip rate and the buffer decision in Section 1.
3. **Ownership model (own vs. rental/"joma")** — I deliberately modeled every category as owned, not rental, for this baseline. Reasoning: a rental "joma" fee is a market-clearing price that itself reflects what drivers can afford to pay, which is downstream of the fare you're trying to set — using it as a cost input risks circularity. Owned-depreciation gives a cleaner, if slightly lower, cost floor. If most of your actual CNG/car fleet turns out to be rented, real driver take-home will be tighter than this card implies, and that's a segmentation/support question (does the platform need a different arrangement for renters?), not a reason to change the base fare formula.

None of these three are "run another model round" problems. They're a spreadsheet pull, a driver interview, and a Stage 0 telemetry read — in that order of ease.

---

## 6. One-Line Summary

Launch with the 6-tier table in Section 3, a 5%/4% trip-rate buffer on bike/CNG only (not car, not the multiplier), the corrected base-fare formula, and the free-radius/cap values above — then watch two numbers out of Stage 0 harder than anything else: **actual deadhead share by category** (tests whether the buffer size in Section 1 is right) and **actual empty-vs-loaded speed ratio** (tests whether my 20-22% speed-gap assumption was too conservative or too aggressive). Everything else in this model is secondary to those two.
