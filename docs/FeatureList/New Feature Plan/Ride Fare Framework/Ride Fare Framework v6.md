# Dhaka Trip Fare Framework — v6.4 (Merged Final, Audit-Integrated)

**Objective:** maximize weekly package renewal rate via network growth and match quality.

**Provenance (2026-08-28 — read first):** This file was deleted from the working tree (it was untracked — never committed to git) and reconstructed verbatim by the orchestrator from the last verified read (v6.3 + REV-3, 2026-08-26), with REV-4 owner rulings applied during reconstruction (→ v6.4). If any edits existed between v6.3 and the deletion, they are lost. **Commit this file immediately after review.**

**Principles (locked):** every charge explainable in one sentence to the payer, tied to something they caused or can see · no dynamic surge · no live hotspot multiplier · no dynamic per-trip destination estimates · road-network km · GPS snapshot at accept · 0% commission · subscription (lead packages) is the only platform revenue · lead consumed at dispatch (offer), not at completion · sequential dispatch · fuel price = live config with auto-recompute.

---

## 1. Fare Formula

```
final_fare = base_fare
           + km_rate × trip_km
           + time_rate × trip_minutes × night_mult
           + waiting_rate × max(0, wait_min − grace_min) × night_mult
           + pickup_fee
           + zone_fee

base_fare = base_km × km_rate + initiation_minutes × time_rate × night_mult
```

| Component | Definition | Pays for |
|---|---|---|
| **base_fare** | `base_km × km_rate + initiation_minutes × time_rate` (night_mult applies to the initiation term) | trip start + driver's initiation time (~4 min: accept, find rider, board) |
| **km_rate** | fuel + driver-paid maintenance + joma/km (parking removed REV-4 — owner-borne, recovered inside joma; prevents double-count) | vehicle cash cost |
| **time_rate** | daily_target ÷ expected_billed_minutes | driver earnings — traffic paid per actual minute |
| **waiting** | rider-caused delay, after grace | rider's own delay |
| **pickup_fee** | see §2 | driver's approach to rider |
| **zone_fee** | published flat per zone × tier, monthly schedule | cold-zone stranding — driver keeps 100% |
| **night_mult** | published fixed schedule; multiplies every `time_rate` term — trip minutes, the initiation term inside base_fare, and waiting. Never km_rate, zone_fee, or pickup distance | night supply |

**Term definitions:**
- **base_km** = flag-fall expressed as minimum billable distance. A 0-km trip costs `base_fare`; a 3-km trip costs `base_fare + 3 × km_rate`. The floor is the base — no separate minimum-distance charge stacks on top.
- **trip_minutes** = all minutes from trip start to trip end. Traffic and rider-requested stops are billed at `time_rate` — the meter runs. *Waiting* is pre-trip rider-caused delay only, after grace.
- **grace_min** (free wait, REV-4): bike 1 / CNG 1 / car 2 min per category — owner ruling, replaces the prior 3/3/4 consensus. Stage 0 monitors waiting-complaint rate.
- **Rate derivation differs by class** (same display formula): **bike/CNG** rates stack bottom-up from cost components (fuel + maint + joma/km). **Car** rates cannot stack joma into km_rate (owner takes 50% of revenue) — the fare is back-solved from the daily target (§5 "Car joma construction"), then decomposed into `km_rate` + `time_rate` for display.

**Two-layer pricing:** Floor = formula with surveyed costs (sanity = minimum fare). Launch price = market-minus-X per tier, never below floor. Indicative: bikes market−10/−15 · CNG market−10 · cars at/near market. Commission headroom (~20–25% of incumbent fares) = subscription budget, 3–4× package coverage.

---

## 2. Pickup Fee

```
pickup_km    = routed road-network km, accept → pickup
pickup_min   = routed_minutes_accept_to_pickup
billable_km  = min( max(0, pickup_km − free_radius_km), cap_billable_km )
billable_min = max(0, pickup_min − free_pickup_min)
pickup_fee   = min( billable_km × km_rate + billable_min × time_rate,
                    cap_pct × fare_before_pickup )

fare_before_pickup = base_fare + km_rate × trip_km
                   + time_rate × trip_minutes + waiting
// night_mult applied exactly as in §1; zone_fee excluded — destination
// charge, not a charge the approach caused
```

- **REV-3 (2026-08-26, owner decision — final): zone-based free radius deleted.** Free allowances are flat per vehicle category. The time component self-adjusts for traffic — a dense-zone pickup is short distance + many billable minutes, a peripheral pickup is long distance + few — so zone density classification is unnecessary. Bill what's measured; don't pre-label zones. The free time allowance also unifies the grammar: distance and time are free up to an allowance, then billed at normal rates — same shape as the trip's waiting grace.
- **Cap order is deliberate: cap km first, compute the fee, then apply the % backstop.** The km cap limits the distance component only; the time component is never dropped and has no dedicated cap beyond its free allowance — a driver who crawls through traffic inside the cap radius is still paid for approach time.
- **Rate basis:** 1.0× (full km_rate + time_rate). No category multiplier — supersedes the earlier tiered 0.75/0.80/0.90 bike/CNG/car multiplier. Dropped because that split was a modeled estimate, not surveyed data, and because km_rate/time_rate are already category-specific, so a second multiplier was double-adjusting for the same cost difference. Flat 1.0× is simpler and more driver-protective.
- **Free allowances (provisional, REV-4 — supersedes REV-3's 1.0/1.2/1.5 km + 3/4/5 min):** bike 1.0 km / 5 min · CNG 1.5 km / 5 min · car 2.0 km / 10 min. Stage-0 calibration target: 25–30% of rides pay any pickup fee. Hysteresis: ±0.25 km / ±1 min max per monthly review, two consecutive reviews required.
- **Cap:** `cap_billable_km: 2.0` (km, not BDT — auto-tracks rate changes). `% backstop: ~25–30%` (calibrated Stage 0; was 40% at old 0.75× rate — tighter at 1.0×).
- **The % backstop is load-bearing at 1.0×, not a rare edge-case guard.** Full rate + time billing enlarges the fee: a 2-km/10-min bike pickup ≈ 44 BDT vs ~19 on the old 0.75× distance-only basis. Every binding is a direct cut to driver compensation, so the binding rate acts as a live price control. **Highest-priority Stage-0 calibration** — measure the binding rate carefully; expect the final value to land tighter than 25%.
- **Reference distance:** 75th percentile of nearest 5 available drivers (passive lookup for quote, not paid broadcast).
- **3-state quote lifecycle:** Request → rider sees capped range. Accept → firm line item from routed path. Post-ride true-up → downward uncapped (rider-favorable), upward capped at 1.25× firm quote.
- **Dawdle guard (two dimensions):**

```
triggers: [
  { dimension: "distance", stat: "median", threshold: 1.15 },
  { dimension: "distance", stat: "p90",    threshold: 1.35 },
  { dimension: "time",     stat: "median", threshold: 1.20 },
  { dimension: "time",     stat: "p90",    threshold: 1.40 } ],
zone_relative_margin: 0.10,
escalation: flag → doubling window → package review
```

- **Protected invariant:** `low_confidence_never_bills_above_firm_quote: true`
- **Pin edit:** tolerance 250m, max 2 requotes, beyond = cancel-only.

---

## 3. Zone Fee (Cold-Zone Compensation)

- **Principle justification (amends the "destination never touches rider fare" language in the header principles):** passes the one-honest-sentence test because the *rider* chose the destination — the fee is caused by where they asked to go, not a forecast about the driver's future. This is architecturally different from a live demand surcharge, which prices a forecast the rider can't see or verify: the zone-fee schedule is published, flat, and reviewed monthly, so a rider can look it up before booking — same category as an airport toll or a bridge fee, not a hotspot multiplier.
- Engine tracks: median driver recovery time per zone (dropoff → next accepted dispatch or exit move).
- Threshold: recovery > ~30 min → cold zone. Time-banded later (e.g., industrial zones cold at night only).
- Published monthly schedule: flat fee per zone × tier. E.g., indicative: bike +25 / CNG +40 / car +60 BDT.
- Driver receives 100%. Cash to driver — not lead discount.
- **Derivation:** `zone_fee ≈ recovery_time_min × time_rate × coverage_factor` (coverage_factor 0.5–0.66), rounded to the published flat number. The indicative flats above correspond to ~10–18 min of priced recovery at ~0.55 coverage — consistent with the exit threshold below.
- Sized to ~50–66% of expected stranding cost (30–60 min wait ≈ 50–190 BDT driver opportunity cost).
- **Entry/exit with hysteresis:** enters at median recovery > ~30 min; auto-retires at median recovery < ~20 min. The 10-min band prevents border-zone flapping on the monthly schedule.
- First-time rider: in-app explanation before fee appears in receipt.
- Out-of-coverage return (beyond service polygon): separate flat distance-based allowance, distinct from zone fee.

---

## 4. Dispatch Layer (Complements Zone Fee)

| Lever | What | When |
|---|---|---|
| **0 — Idle positioning** | Suggestive map layer of zones worth waiting in, ranked by relative idle-driver density (not absolute heat). No penalty for ignoring. | Before any ride |
| **1 — Heat tag** | Drop-zone tag (hot/neutral/cold) shown before accept. Exact address after accept. | At dispatch |
| **2 — Cold-drop rank boost** | Temporary ranking multiplier, decaying ~15 min, for driver just dropped in cold zone. | After dropoff |
| **3 — Return-lead pre-matching** | Proactively surface leads near drop zone before driver asks. | After dropoff, pre-request |

Heat score: blend trailing baseline (60-min post-drop earnings, percentile-ranked) with live EWMA request density, weighted ~40/60 baseline/live. Classifies airport as "hot" despite long fare-wait.

Lever 0–3 **reduce** the wait that the zone fee **prices**. Both serve cold zones; neither replaces the other.

---

## 5. Per-Tier Cost Inputs

| Parameter | Bike Eco | Bike Std | Bike Prem | CNG | Car Eco | Car Std | Car Prem | Car XL |
|---|---|---|---|---|---|---|---|---|
| Vehicle | 100cc | 125cc | 150cc | ~200cc auto | 1000cc | 1500cc | 1500cc | Noah/Voxy |
| Fuel type | Petrol (REV-4) | Petrol (REV-4) | Petrol (REV-4) | CNG | Octane (REV-4) | Octane (REV-4) | Octane/Hybrid | Hybrid/Petrol |
| Fuel eff [EST] | 45 km/L | 40 | 33 | 20 km/m³ | 12 km/L | 10 | 8 | 12–14 |
| Fuel price | 140 | 140 | 140 | 43 | 145 | 145 | 145 | 145 |
| Fuel/km | 3.11 | 3.50 | 4.24 | 2.15 | 12.08 | 14.50 | 18.13 | 10.4–12.1 |
| Maint total/km [EST] | 1.15 | 1.35 | 1.60 | 2.10 | 3.45 | 4.00 | 5.00 | 4.50 |
| Driver-paid maint/km (≈½) | 0.55 | 0.65 | 0.80 | 1.05 | 1.75 | 2.00 | 2.50 | 2.25 |
| **Joma** | **8,000/mo** [REV-4] | **10,000/mo** [REV-4] | **12,000/mo** [REV-4] | **800/day** | **50% net** | **50% net** | **50% net** | **50% net** [REV-4] |
| ~~Parking/km [EST]~~ | *deleted REV-4 — owner-borne, recovered inside joma* | — | — | — | — | — | — | — |
| Target/day [EST] | 1,000–1,200 | 1,000–1,200 | 1,100–1,300 | 1,100–1,400 | 1,100–1,400 | 1,100–1,400 | 1,200–1,500 | 1,200–1,500 |
| Online hrs [EST] | 10–11 | 10–11 | 10–11 | 10–11 | 10–12 | 10–12 | 10–12 | 10–12 |
| Daily km (total) [EST] | 100 | 110 | 110 | 130 | 120 | 130 | 140 | 120 |
| Trips/day [EST] | 12 | 12 | 12 | 10 | 7 | 7 | 6–7 | 5–6 |
| Billed min/day [EST] | 220–260 | 220–260 | 200–240 | 200–240 | 190–220 | 190–220 | 170–200 | 140–180 |

**Billed min/day** = trips × (avg trip min + pickup min) + chargeable wait — a derivation, not a survey input. It is the **#1 Stage-0 calibration lever**: `time_rate = daily_target ÷ billed_minutes`, so billed-minute error propagates directly into every billed minute of every fare. Indicative: bike ≈ 1,100 ÷ 240 ≈ 4.6/min; car ≈ 1,250 ÷ 200 ≈ 6.3/min.

**Joma (REV-4):** bike tiers are monthly figures — 8,000 / 10,000 / 12,000 BDT/month ≈ 275 / 345 / 415 per day at 26 operating days — replacing the earlier flat ~300/day anchor. Rising bike joma remains the early-warning metric for owner-capture of the 0%-commission dividend.

**† Car fuel basis (CLOSED by REV-4 owner ruling):** cars run octane at 145 BDT/L. The prior CNG-conv open item is resolved — §11 entry closed. Historical note: earlier revisions carried petrol-basis math (145 ÷ km/L) with CNG-conv (~3.3–4.3 BDT/km) as an open amendment.

**Ownership:** no driver owns. Owner covers BRTA + major maintenance + tyres + parking (REV-4). Driver covers minor maintenance (~½ total — an approximation, not a rule; the minor/major boundary varies per tier, survey validates).

**50/50-for-all = stress overlay only.** Answers "what fare survives if owners take half of everything?" Cars survive. CNG +40%. Bikes: nothing market-viable — bike-driver protection must come from supply structure (owner-operator recruitment, financing-to-ownership), not from fares.

**Car joma construction:** owner takes 50% of (fare − fuel). Fare level solved so driver's half ≥ target: `required_gross ≈ 2 × (target + driver_costs) + fuel`. Expressed in same km_rate + time_rate lines; split stays internal.

---

## 6. Rider Experience & Bill Disclosure

**Rider-stage flow (what the rider sees at each stage):**

| Stage | Rider sees |
|---|---|
| **Request** | Estimated fare range — non-binding, labeled as an estimate — plus traffic warning ("traffic is heavy now, trip may take ## mins and cost more"). No binding time estimate at quote. |
| **Accept** | Pickup fee firms from the routed path; the capped range shown at request collapses to a firm line item. |
| **During trip** | Meter running: km + minutes accumulating live. |
| **Post-trip** | Total fare with expandable detail: km, time, waiting, pickup, zone fee as separate lines. |

Fares computed post-trip (metered — culturally native to Dhaka CNG experience). Driver bill: same post-trip detail, line-item identical to the rider receipt.

---

## 7. Lead Economics

- **Billing:** per-offer (lead consumed at dispatch, not at completion). Sequential dispatch (one driver at a time).
- **Packages:** weekly. No carry-forward. Size matched to deliverable dispatch volume: **set at p50 of realized leads/week per active driver, measured weekly, adjusted quarterly** (don't sell 50-call packages into a network delivering 25 — that's the #1 churn risk).
- **New-driver protection:** priority dispatch placement for first 10 leads (REV-4 kickoff value) or 7 days, whichever first. Stacks with cold-zone rank boost.
- **Decline-chain:** instrument-only. Lead-to-completion ratio per cohort = renewal-risk indicator. No cap on billable chain length. No queue-position discounting (rejected — same mechanism as the killed debit multiplier).
- **Off-platform completion protocol:** cancellation cooldown (can't accept new lead within 200m of cancelled pickup for set window) · cancellation-rate gating on package eligibility · GPS trace matching post-cancellation · rider post-cancellation survey · response ladder: warning → lead-price surcharge → suspension → ban.

---

## 8. Gaming Vectors

| Vector | Defense |
|---|---|
| Pickup-distance inflation (drive-away-after-accept, GPS spoof) | GPS snapshot at accept, road-network routing |
| Pickup-time inflation (dawdling) | dawdle guard: distance + time deviation triggers |
| Cherry-picking (decline-spam on cold leads) | decline-rate monitoring, cooldowns |
| Off-platform completion (cancel-then-ride-off-app) | full protocol §7 |
| Heat-score manipulation (fake rider requests) | anomaly detection |
| Pin gaming (rider moves pin post-accept) | 250m tolerance, max 2 requotes, cancel-only beyond |

---

## 9. Config Schema

```jsonc
pricing_config (scope: city × vehicle_category, versioned) {
  fare: { base_km, initiation_minutes, km_rate, time_rate, waiting_rate,
          grace_min,   // REV-4: bike 1 · CNG 1 · car 2 (was 3/3/4 consensus);
                       // Stage 0 monitors waiting-complaint rate
          minimum_fare, night_mult, night_schedule }
  km_rate_components: { fuel_price (live_config; REV-4: bike petrol 140 ·
          CNG 43 · car octane 145), fuel_efficiency,
          driver_maint_per_km, joma_type, joma_value,
          // REV-4: parking_per_km DELETED — owner-borne, recovered inside joma
        }
  joma: { bike: { 8000, 10000, 12000 },   // BDT/month tiers (REV-4)
          cng: 800, car: "50%_of_net",
          stress_overlay: "50_50_all" }
  pickup_fee: {
    rate_basis: "trip_rate",    // 1.0×, no multiplier
    free_allowance: { radius_km: { bike: 1.0, cng: 1.5, car: 2.0 },   // REV-4
                       pickup_min: { bike: 5, cng: 5, car: 10 },       // REV-4
                       calibration: "charge_incidence_25_30pct_stage0",
                       hysteresis: { km: 0.25, min: 1 } },
    caps: { billable_km: 2.0, pct_of_fare: "calibrate_25_30_stage0" },
    reference: { pool_size: 5, quantile: 0.75, type: "passive_lookup" },
    trueup: { downward: "uncapped", upward_cap: 1.25,
              anchor: "driver_trace_accept_to_trip_start",
              origin_confidence_min: 0.7 },
    dawdle_guard: {
      triggers: [
        { dim: "distance", stat: "median", thresh: 1.15 },
        { dim: "distance", stat: "p90",    thresh: 1.35 },
        { dim: "time", stat: "median", thresh: 1.20 },
        { dim: "time", stat: "p90",    thresh: 1.40 } ],
      zone_relative_margin: 0.10,
      escalation: [ "flag", "double_window", "package_review" ] },
    protected_invariant: "low_confidence_never_bills_above_firm_quote",
    pin_edit: { tolerance_m: 250, max_requotes: 2, beyond: "cancel_only" }
  }
  zone_fee: {
    engine_metric: "median_recovery_time_per_zone",
    entry_threshold_min: 30, exit_threshold_min: 20,   // hysteresis band
    derivation: "recovery_min × time_rate × coverage_factor(0.5–0.66)",
    schedule_cadence: "monthly",
    driver_paid_pct: 100, sizing: "50_66_pct_of_stranding_cost",
    auto_retire: true, rider_first_time_explanation: true
  }
}
dispatch_config (scope: city) {
  hotspot: { zone_granularity, baseline_window: "60min",
             live_window: "EWMA", blend: { baseline: 0.40, live: 0.60 },
             classification: "hot_neutral_cold" }
  matching: { cold_drop_rank_boost, boost_decay_min: 15,
              new_driver_priority: { leads: 10, days: 7 } }   // REV-4 kickoff
  lead_card: { pre_accept: [ "pickup_km", "eta", "pickup_fee_range",
              "drop_zone_heat_tag", "trip_km", "est_fare", "lead_cost" ],
              post_accept_unlock: "exact_address" }
  monitors: { lead_to_completion_ratio_by_cohort: true,
              renewal_rate_by_cohort: "weekly",
              joma_tracking: "quarterly" }
}
```

---

## 10. Staged Rollout

| Stage | Scope | Exit gate |
|---|---|---|
| **0 — Shadow** | Heat tags, dispatch levers live. No pricing change = **no fare-component changes; subscription/package sales are active from Stage 0** (they are the platform's revenue from launch). Harvest: pickup distance + time distributions per category per zone, backstop binding rate. | Heat-model validation (backtest vs realized 60-min post-drop earnings). |
| **1 — Pricing live** | Time billing live (base formula). Pickup fee live at calibrated radius. Zone fee live after zone classification validates. | Complaint rate < threshold/1k charged rides · quote-to-final deviation within band · periphery accept-rate within points of Stage 0 · backstop binding rate within calibrated band (§2 — load-bearing control) · driver retention ≥ Stage 0 baseline. Auto-rollback triggers defined in advance. |
| **2 — Tighten** | Free allowances toward the 25–30% charge-incidence target. Rider-side cancellation enforcement (reputational). Zone-fee schedule published from Stage 1 data. | — |
| **3 — Steady state** | Night multiplier after survey. Out-of-coverage return allowance + remote-zone fee only if live data shows needed. | — |

---

## 11. Open Items

| Item | Type | Resolves via |
|---|---|---|
| Billed-minute share (utilization) | Field data | Stage 0 telemetry |
| Daily targets | Survey | Driver interviews (switching threshold vs incumbent take-home) |
| Pickup distance + time distributions | Field data | Stage 0 telemetry |
| Free allowances (km + min) / cap defaults per category | Calibration | Stage 0 charge-incidence 25–30% + hysteresis (REV-4 provisional values ship) |
| %-of-fare backstop (25–30%) — **load-bearing at 1.0×; highest-priority calibration** | Calibration | Stage 0 cap-binding rate |
| ~~Car primary fuel: CNG-conv vs petrol~~ | **CLOSED (REV-4)** | Owner ruling: cars octane 145 |
| Road-closure / legitimate-detour handling — true-up 1.25× upward cap may not cover flood/blockage detours | Ops | Road-closure reporting mechanism in driver app + ops runbook |
| Zone fee schedule (zones + amounts) | Calibration | Stage 0 recovery-time data |
| Night multiplier + schedule | Survey | Driver + rider round |
| New-driver priority window (N leads) | Calibration | Early cohort data (kickoff N=10, REV-4) |
| Zone-recalibration sample-size threshold (N) | Calibration | Stage 0 data |
| ~~Bike joma (385/450 validation)~~ | **SET (REV-4): 8,000/10,000/12,000 BDT/month** | Owner ruling |
| ~~Car joma mix (50% vs fixed vs min)~~ | **SET (REV-4): 50% net** | Owner ruling |
| ~~Premium-bike joma~~ | **SET (REV-4): 12,000 BDT/month** | Owner ruling |
| Fuel efficiency per tier | Survey | Instrument 5 vehicles/category, 2-week tracking |
| Maintenance split (minor/major boundary) | Survey | Mechanic + driver interviews |
| ~~Parking cost~~ | **CLOSED (REV-4)** | Owner-borne, recovered inside joma |
| Car XL joma ~~+ positioning~~ | **joma SET (REV-4): 50/50**; positioning still survey | XL driver interviews |
| Grouping (5–8 rider-facing tiers) — bike Eco+Std merge UNDECIDED (REV-4) | Stage 0 | Demand-elasticity test decides |
| Trip-length mix per tier | Field data | Stage 0 telemetry |

---

*Supersedes: Stage 1 (locked top-level), Stage 2 (nitty-gritty), Stage 3 (true-up + pickup rate), v5 (cost-and-pricing layer). All prior model-ranking and reasoning prose is historical context, not part of this document.*

*Rev v6.1 (2026-08-26) — 13-issue audit integrated, no principle changes: base-fare time component · pickup-fee cap restructured (cap-km-first, time never dropped) · car rate derivation made explicit · car fuel basis corrected to petrol math with CNG-conv as open item · backstop flagged load-bearing · night_mult / fare_before_pickup / trip_minutes / base_km defined · rider-stage flow added · zone-fee derivation + exit hysteresis · billed-min/day row · Stage-0 subscription clarification · package-sizing rule · detour open item · joma/maintenance confidence flags.*

*Rev v6.2 (2026-08-26) — two principle-level amendments made explicit in-line rather than left implicit: (1) §3 zone_fee justified against the header's "destination never touches rider fare" language — rider-choice/published-schedule reasoning, distinct from a live demand surcharge. (2) §2 pickup-fee rate basis: tiered 0.75/0.80/0.90 category multiplier formally superseded by flat 1.0×, with reasoning recorded (was a modeled estimate, double-adjusted against already-category-specific km_rate/time_rate).*

*Rev v6.3 (2026-08-26) — REV-3: pickup-fee zone-based free radius replaced by flat per-category free allowances (km + min: bike 1.0/3 · CNG 1.2/4 · car 1.5/5, provisional). Zone density classification (dense/standard/peripheral) deleted — the time component self-adjusts for traffic. Formula, §9 config schema, Stage-2 target, and §11 calibration row updated. Cap 2.0 km, % backstop, dawdle guard, true-up, and zone fee (§3, different mechanism) untouched.*

*Rev v6.4 (2026-08-28) — REV-4 owner config rulings applied (document reconstructed from verified v6.3 state after untracked-file deletion — see Provenance): free allowances 1.0/1.5/2.0 km + 5/5/10 min (supersedes REV-3 values; still provisional, Stage-0 calibrates to 25–30% incidence) · grace 1/1/2 per category (replaces 3/3/4 consensus; Stage 0 monitors waiting-complaint rate) · bike joma 8k/10k/12k BDT/month · parking removed from km_rate (owner-borne, inside joma) · fuel basis: bikes petrol 140 / CNG 43 / cars octane 145 — car fuel fork CLOSED · car XL 50/50 · bike Eco+Std merge undecided (Stage-0 demand test) · new_driver_priority_leads = 10. RBAC (plan-owned): Owner/Admin/Ops Manager/Moderator, server-side enforced.*
