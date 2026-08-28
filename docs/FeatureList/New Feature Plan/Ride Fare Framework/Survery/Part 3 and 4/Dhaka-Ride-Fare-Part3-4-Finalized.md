# Dhaka Ride-Fare Framework — Part 3 & 4 Finalized Report

*Synthesized from 9 submitted responses, reducing to 7 genuinely distinct passes: ChatGPT, Kimi (byte-identical to Mimo), GLM 5.3, Mistral, DeepSeek, Gemini (corrected — independently distinct from DeepSeek), Qwen3.8Max.*

**Data hygiene flag, still relevant:** Mimo's file is byte-for-byte identical to Kimi's — a genuine duplicate, not two models converging. Worth re-running Mimo if its independent input matters to you. The earlier DeepSeek/Gemini duplicate is now resolved with Gemini's real response, which turns out to be one of the most important inputs in the set — it directly contradicts the Qwen/GLM finding below.

---

## The Central Unresolved Question: Is the Formula Conservative, or Does It Underpay?

This is a genuine **three-way split among the models**, not a converged finding.

### Camp 1 — "It underpays" (Qwen3.8Max, GLM 5.3)

`trip_per_km_rate = loaded_cost_per_km` only pays the driver for *loaded* kilometres. The driver's daily earnings target has to be hit across *all* driven km — loaded plus empty/deadhead plus idle waiting. At the locked pickup multipliers (0.75/0.80/0.90), the pickup fee doesn't fully cover empty-km cost, so the driver falls short once real deadhead share is factored in.

- **GLM's worked example** (Bike Economy, 20% deadhead share): driver comes up **~41 BDT short per day** (~3-5% of target).
- **Qwen's stress test**: trip rates would need to rise **~29–39%** to close the gap under a harsher utilization scenario.

### Camp 2 — "It's conservative, as originally assumed" (Gemini, DeepSeek)

Both explicitly re-affirm the original prompt's framing: since the pickup fee is real additional revenue not credited against the daily target in this derivation, the trip rate is *higher than the mathematical floor* required.

- **Gemini's estimate:** assuming ~60% of trips incur ≥0.5 km billable pickup, drivers earn an **extra 40–90 BDT/day** beyond what the formula assumes — trip rates run **~5–8% higher** than the true floor. The mirror image of Qwen/GLM's conclusion.
- DeepSeek reached a similar 4.5–9% "conservative" figure by the same logic.

### Why the two camps disagree — this is the actual crux, not model noise

The disagreement traces to one input: **how much a deadheading (empty) km actually costs relative to a loaded km in Dhaka gridlock.**

Gemini modeled loaded and empty speeds as nearly identical (16 vs 18 km/h bikes, 12 vs 14 km/h cars) — reasoning that in true gridlock, an empty vehicle moves only marginally faster than a loaded one. This pushes Gemini's **natural multiplier up to 0.95–0.97**, meaning deadhead is *almost as expensive as loaded driving* in its model — which means the locked multiplier (0.75/0.80/0.90) actually leaves the driver *undercharged on the pickup fee itself but overcompensated in the trip rate*, netting out conservative overall.

GLM and Qwen used a bigger loaded/empty speed gap, producing a lower natural multiplier and a real shortfall.

**This is not resolvable by more model opinions — it's an empirical Dhaka traffic question.** Does an empty driver actually move meaningfully faster than a loaded one, or is gridlock uniform enough that speed barely changes between the two? Your Stage 0 dispatch telemetry answers this directly: compare GPS speed on accept→pickup legs vs. pickup→dropoff legs, by category. Until then, **do not lock a "conservative bias %" in either direction** — the two most rigorous responses in this set reach opposite conclusions from the same formula, driven entirely by one unmeasured speed assumption.

**Recommendation:** Flag this as the top Stage 0 validation priority, above even pickup-distance distribution. It determines whether your launch trip rate needs a safety margin or has slack to spare — and right now nobody actually knows which.

---

## Second Structural Finding: ChatGPT Caught a Double-Counting Bug in Your Base Fare Formula

Nobody else caught this. Your locked Step 6:
```
base_fare = driver_time_cost_per_hour × avg_accept_to_pickup_minutes / 60 + fixed_per_trip_overhead
```

If `avg_accept_to_pickup_minutes` includes the driver's actual drive time to reach the rider, **you're paying the driver twice for the same minutes** — once through `pickup_fee` (which already prices driving to the rider via `empty_cost_per_km`), and again through `base_fare`.

**Fix, adopted:** narrow `base_fare` to cover only the fixed overhead *not* already priced by the pickup fee — app interaction, accepting the offer, locating the rider after physical arrival — and explicitly exclude drive-to-pickup time.

```
base_fare = driver_time_cost_per_hour × fixed_trip_initiation_minutes / 60 + fixed_per_trip_overhead
```

This is why ChatGPT's Base Fare figures (Tk 10–20) and Gemini's (Tk 15–22, using 8 min but a lower per-minute allocation) come in lower than models that kept the full accept-to-pickup time baked in (Tk 20–47). **Recompute base fare for every category using ~2–3 minutes of fixed initiation time**, not full accept-to-pickup time.

---

## Consolidated Data Tables (range across 7 distinct responses, corrections applied)

Genuine spread exists from different but individually reasonable choices on: car anchor cc (1000/1300 vs 1000/1500), CNG ownership model (owned vs. rental/"joma"), and driver speed/earnings inputs (unresolved from Part 1/2).

| Sub-Category | Fuel Cost/km | Maintenance/km | Depreciation or Rental/km | Fixed Cost/km | Time Cost/km (loaded) |
|---|---|---|---|---|---|
| Bike Economy | 3.0–3.5 | 0.85–1.15 | 0.63–1.00 | 0–0.17 | 5.0–9.1 |
| Bike Standard | 3.5–3.7 | 1.10–1.30 | 0.75–1.22 | 0–0.20 | 5.7–9.1 |
| Bike Premium | 4.1–4.8 | 1.45–1.75 | 1.23–1.75 | 0–0.21 | 6.4–10.0 |
| CNG Standard | 1.3–2.15 | 1.10–2.50 | **2.0–12.2 (owned vs. rental — see below)** | 0–0.26 | 10.8–15.6 |
| Car Economy | 9.1–14.5 | 2.5–3.6 | 3.5–10.0* | 0–1.21 | 13.6–25.0 |
| Car Standard | 10.4–18.1 | 3.5–4.6 | 4.3–12.5* | 0–1.50 | 16.4–33.3 |
| Car Premium | 11.2–20.7 | 4.5–5.6 | 8.0–11.0 | 0.82–2.11 | 20.0–41.7 |

*Car Economy/Standard ranges now include Gemini's "Joma" (daily rental) figures, which run meaningfully higher than the owned-depreciation figures from other models — same real fork as CNG, just also showing up in the car tiers for the first time.

**Two ownership forks, not one.** Previously flagged only for CNG — Gemini's response shows the same owned-vs-rental question also applies to Car Economy and Car Standard (it models both as "Joma" rentals, only Car Premium as owned). This widens the real-world question beyond CNG: **what share of your car drivers own vs. rent, by tier?** Needs the same driver survey question, extended to cover cars.

---

## Derived Trip Rates — Range Across All 7 Models

| Sub-Category | Trip Rate Range (BDT/km) | Spread Driver |
|---|---|---|
| Bike Economy | 10.3 – 16.4 | speed/earnings-target assumption |
| Bike Standard | 11.2 – 18.5 | same |
| Bike Premium | 14.1 – 21.0 | same |
| CNG Standard | 16.8 – 30.6 | ownership model (owned vs. rental) dominates |
| Car Economy | 35.7 – 43.9 | speed assumption + ownership model |
| Car Standard | 41.5 – 59.1 | speed + car anchor cc + ownership model |
| Car Premium | 47.0 – 69.5 | speed + ownership/rental |

**Read this as a floor, not a target** — per the Camp 1/Camp 2 split above, the true rate could sit anywhere from ~5% below this range (if Gemini's slack view holds) to ~35% above it (if Qwen's deficit view holds). This is exactly why the empty-speed question needs to be measured before final numbers are locked.

---

## Multiplier Validation — Converged on Direction, Split on Magnitude

All 6 models that computed a natural multiplier agree on **direction** (natural > locked for every category), but disagree sharply on **magnitude** because of the same loaded/empty speed assumption driving the Camp 1/2 split above:

| Category | Locked Multiplier | Natural Multiplier (range across models) | Gap |
|---|---|---|---|
| Bike | 0.75 | 0.82 – 0.95 | 0.07–0.20 |
| CNG | 0.80 | 0.85 – 0.96 | 0.05–0.16 |
| Car | 0.90 | 0.90 – 0.97 | 0.00–0.07 (smallest gap of the three, consistently) |

Gemini's high-end natural multipliers (0.95 bikes, 0.95 CNG, 0.97 cars) come from the same "gridlock erases the loaded/empty speed gap" assumption discussed above — worth reading together with the deficit debate, not as a separate finding.

**Consistent framing across models:** the 0.75/0.80 multipliers are not cost-derived, they're **an intentional rider-facing discount**. That's a legitimate business choice — but it should be documented internally as a deliberate subsidy, not described as "validated by the cost survey." It wasn't.

**One dissent:** Mistral's second pass unilaterally raised the bike/CNG multipliers to 0.85/0.87 to close the gap. Don't adopt this without deciding it yourself — changing a locked parameter is your call, not something to accept because one model proposed it.

**Gemini's specific recommendation, worth weighing:** don't close this gap by raising the multiplier — do it by tightening dispatch radius instead, so drivers simply aren't offered the longest, most under-compensated deadheads in the first place. That's a dispatch-layer fix rather than a pricing-layer fix, and it doesn't touch the locked multiplier at all.

---

## Sensitivity to Fuel Price (±10 BDT/L)

Consistent across every model: **car trip rates move roughly 4x more per BDT of fuel-price change than bike trip rates** in absolute terms (car ~0.7–1.4 BDT/km shift vs bike ~0.2–0.3 BDT/km shift per 10 BDT). No disagreement here — confirmed, no action needed beyond building the auto-recompute the framework already calls for.

---

## Grouping Recommendation — Split Opinion, Recommend Waiting

| Model | Recommendation |
|---|---|
| DeepSeek | Merge Bike Economy + Standard only → 6 tiers |
| Gemini | Merge Bike Economy + Standard **and** merge Car Economy + Standard → 4 tiers total; explicitly suggests cutting Car Premium from launch entirely |
| GLM 5.3 | Merge bikes further → 4 tiers total |
| Kimi/Mimo | No explicit merge given |
| Qwen | **Do not merge anything yet** — premature before the deficit/conservative question above is resolved |

Two independent models (Gemini, GLM) now converge on **4 tiers as a plausible launch structure**, which is worth taking more seriously than a single opinion — but **adopt Qwen's caution on timing regardless**. Merging tiers based on today's numbers risks locking in groupings based on rates that could shift 5-35% once the empty-speed question is resolved with real data. Revisit grouping after Stage 0, using the 4-tier structure as a working hypothesis rather than a decision.

---

## Open Items Before This Can Be Locked

1. **Empty-vs-loaded speed differential in real Dhaka gridlock** (new, highest priority) — this single unmeasured input is why Camp 1 and Camp 2 disagree on whether the fare is under- or over-priced. Resolve via Stage 0 GPS telemetry: compare accept→pickup speed against pickup→dropoff speed, by category.
2. **Base fare formula correction** — adopt ChatGPT's narrowed definition; recompute for all categories using ~2–3 min fixed initiation time, not full accept-to-pickup time.
3. **Ownership model — now extends beyond CNG to cars** — Gemini's response shows Car Economy/Standard also have a real owned-vs-rental fork, not just CNG. Extend the driver survey question to cover all rentable tiers.
4. **Depreciation and driver-speed inputs** (carried over from Part 1/2) — still blocked on real Bikroy.com listings and dispatch/GPS telemetry.
5. **Bike/CNG multiplier gap** — decide explicitly whether 0.75/0.80 stays as an intentional rider subsidy, or gets revisited. A policy call for you, not a research question.
6. **Duplicate file** — Mimo still needs a proper independent re-run if its input matters to you.
