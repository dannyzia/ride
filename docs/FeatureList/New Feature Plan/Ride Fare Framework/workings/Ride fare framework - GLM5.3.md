Here it is — the second pass as a single standalone document. Every revision already integrated, no diffs, no references to earlier versions. This is the spec I'd hand to engineering.

---

# Pickup & Destination Economics — Design v2 (Dhaka)

## Positions

1. **Pickup dead-mileage → rider-paid.** Two-knob capped charge, billed on realized path with bounded asymmetric true-up. Absorption is impossible: the platform has zero fare margin and a no-incentive policy; there is nothing to absorb *with*.
2. **Destination lucrativeness → never rider-facing.** Four driver-side levers, in strict order of load-bearing: heat tag on the lead card → the pickup charge itself → dispatch rank boost with decay → debit multiplier. The informational lever dominates the pricing lever.
3. **Cancellation compensation = the credit was never debited.** Debit-on-completion is the designed mechanism, not an accident. The platform has no rider payment rail, so rider fees are reputational, never monetary.
4. **Platform money never touches the fare path.** Every mechanism self-funds on the rider side (fares, add-ons) or the driver side (lead credits), or is non-monetary (matching priority, information).

---

## 1. Pickup charge

### Formula

```
pickup_km     = map-matched road distance, driver position at ACCEPT → actual ride-start GPS
billable_km   = max(0, pickup_km − free_radius_km)
pickup_charge = round_to_step( min(rate_per_km × billable_km, charge_cap_bdt) )
```

**Exactly two pricing knobs plus a cap:** `free_radius_km`, `rate_per_km_bdt`, `charge_cap_bdt`. No minimum charge (charging ৳10 for a 1.6 km pickup is worse optics than charging ৳3). No separate `max_billable_km` — it's derived: `cap / rate`.

**Rate = trip per-km rate.** Driver cost per empty km ≈ per loaded km (bikes especially); sub-trip-rate pricing fails to move far drivers; supra-trip-rate pricing is a rider-fairness and regulatory hazard.

**Seeds (calibration placeholders, per city × category):**

| Category | free_radius_km | cap | implied max billable |
|---|---|---|---|
| Bike | 1.5 | ৳25 | ~1.9 km |
| CNG | 1.5 | ৳30 | ~2.1 km |
| Car | 2.0 | ৳40 | ~2.4 km |

**Calibration rule:** free radius at **p70–p75 of realized pickup distances**, targeting 25–30% of rides carrying a charge. Hysteresis against config thrash: max ±0.25 km per adjustment, two consecutive monthly reviews required before moving, alert on incidence drift beyond ±8pp from design target.

### Quote timeline (three states)

1. **Request:** trip fare estimate + pickup shown as a cap-scoped range — *"pickup fee: ৳0–25 depending on driver distance."*
2. **Accept:** firm pickup line item from the routed estimate accept→pin. Rider sees the final total immediately.
3. **Post-ride true-up, asymmetric:** downward free (rider moved toward driver → pays less); upward bounded at **firm × 1.25**. Worst-case surprise ≈ ৳6. If GPS trace confidence < 0.7 (urban-canyon drift — Old Dhaka, Mohakhali), bill the firm quote with no true-up.

Realized-path billing is the anti-dispute core: the rider moved? The path went to where the rider actually is. No recompute triggers, no "rider not at pin" pricing logic — that flag is a dispute annotation only.

### The compensation cliff, stated honestly

With free 1.5 km and cap ৳25 at ৳13/km, marginal compensation beyond ~3.4 km of pickup is partial — a 6 km pickup pays the driver ৳25 for ৳78 of motion. This is not a bug. It's why the **ETA gate is the primary dispatch constraint**, why radius relaxation in low supply must always pair with an honest lead card (distance + ETA + charge before accept), and why the driver's informed right to decline is a feature of the system, not a leak in it.

---

## 2. Cancellation

### The rail problem, accepted

Riders pay drivers directly (cash/bKash/Nagad). The platform has no instrument to collect a rider cancellation fee against, and policy forbids platform-funded driver compensation. Therefore:

**Rider cancels after accept:**
- Driver compensation = lead credit was never debited (debit-on-completion) + next-cycle reassignment dispatch boost. Both policy-clean: non-collection of a price is not an incentive grant; matching priority is not money.
- Rider enforcement = reputational: 180s free window, then strikes. Strikes decay over 30 days; each strike multiplies match priority by 0.85; 3 strikes in 30 days → payment instrument required to request rides.

**Driver cancels after accept:** 5-min cooldown + ranking strike; repeat → package gating.

**Driver no-show:** credit never debited (automatic) + ranking strike.

**Off-platform completion (cancel, then ride offline to dodge the debit):** phone-number masking, rider-driver pairing anomaly detection, GPS trace forensics — a cancelled driver's trace matching the cancelled request's route is near-proof. Repeat offenders → package gating. This is the existential leak for a lead-sales revenue model; it gets a named owner and a weekly anomaly review.

---

## 3. Destination lucrativeness

### Why never in the fare (compressed to its strongest forms)

- **Regressive:** it surcharges exactly the riders going to low-demand periphery and discounts Gulshan→Banani. You'd charge the worst-served riders the most.
- **Unverifiable:** the rider cannot observe, influence, or audit the driver's next opportunity. A charge on something invisible is a dispute factory.
- **Regulatory:** the transparent `base + km + waiting` formula is your strongest asset under BRTA fare-display rules. A zone coefficient breaks its auditability and will be reported as surge pricing the first rainy evening outskirts fares jump.
- **Doesn't fix it:** the surcharge pays one driver once. The next driver stranded in the cold zone gets nothing.

### The four levers

**Lever 1 — Heat tag on the lead card. Before accept, every lead shows: pickup distance, ETA, pickup charge, drop zone + heat tag (🟢/🟡/🔴), estimated fare, credit cost.** "Trip shesh kore kothay porbo" is the driver's biggest anxiety; this answers it for free. Highest retention impact per taka of anything in this document.

**Lever 2 — The pickup charge itself.** Cold-origin zones have thin supply → longer matched pickups → the rider-paid charge rises mechanically → far drivers accept. The pickup fee *is* the repositioning monetization. The two original problems solve each other here.

**Lever 3 — Cold-drop rank boost.** Driver dropped in a cold zone gets dispatch ranking ×1.5, decaying over 15 minutes, never exceeding the ETA gate. No exclusive "first look" windows — an exclusive window can assign a farther driver, harming the rider to help the driver.

**Lever 4 — Debit multiplier (SKU fairness, minor).**

```
debit_credits = base_credit × max(min_multiplier, f(pickup_km) × g(drop_zone_heat))
f: 1.0 ≤2km · 0.75 ≤3.5km · 0.5 beyond
g: 1.0 heat≥0.50 · 0.75 ≥0.25 · 0.5 below
debited only on ride completion
```

Honest label: financially small (~৳2.50 at ৳5/credit on a cold lead, vs. ৳40–80 of real idle cost). Its actual function is perceived package fairness — drivers don't feel cheated paying full credit price for leads the system *knows* are weak. The cross-subsidy (hot-corridor drivers fund cold-corridor discounts through base credit price) is explicit and acceptable because the subsidizing cohort is the one that never churns — confirmed by monitoring package repurchase split by cohort.

**Policy line:** discounting the price of your own SKU is revenue recognition, not an incentive. Banned: granted credits, cash, fare discounts. Fallback if policy disagrees: levers 1–3 only, accepting cold-lead under-consumption.

### Heat v2

- **Metric:** `post_drop_earnings_60min` per zone × hour-of-week, trailing 6 weeks, **percentile-ranked to [0,1] within city**. This correctly scores HSIA hot — a 30–60 min queue reads "cold" on time-to-next-fare, yet the guaranteed long fare makes it one of Dhaka's most prized drops.
- **Live component:** EWMA (α=0.3, 30-min window) of requests per active driver, also percentile-ranked. Both components normalized *before* blending — they're incommensurable units.
- **Blend:** 0.4 baseline / 0.6 live. Update every 60s.
- **Sparse-cell fallback (<30 samples):** zone×hour → zone → city×hour.
- **Queue-managed zones (HSIA):** config-pinned hot override. Belt-and-suspenders on top of the earnings metric.

### Destination disclosure

Lead card shows drop **zone + trip km + heat tag**; exact address only after accept. Zone answers the driver's real question; full pre-accept address amplifies short-trip refusal. Leak acknowledged: drivers ask by phone anyway — zone-level disclosure satisfies most, decline budgets handle the rest.

---

## 4. Config schema (publishable)

```jsonc
// pricing_config — scope: city × vehicle_category, versioned, append-only history
{
  "config_type": "pricing_config",
  "scope": { "city_id": "dhaka", "vehicle_category_id": "bike" },
  "version": 15,
  "effective_from": "2025-06-01T00:00:00+06:00",

  "fare": {
    "base_fare_bdt": 30,
    "per_km_rate_bdt": 13,
    "waiting_rate_per_min_bdt": 1.5,
    "free_waiting_minutes": 3,
    "min_fare_bdt": 40,
    "distance_rounding_km": 0.1,
    "currency_rounding_step_bdt": 5
  },
  "pickup_charge": {
    "enabled": true,
    "free_radius_km": 1.5,
    "rate_per_km_bdt": 13,
    "charge_cap_bdt": 25,
    "bill_on": "realized_path_bounded_trueup",
    "request_time_display": "cap_scoped_range",
    "max_upward_trueup_multiplier": 1.25,
    "trace_confidence_min": 0.7
  },
  "cancellation": {
    "rider_free_window_sec": 180,
    "rider_fee_collection": "instrument_only",
    "driver_cancel_cooldown_min": 5,
    "driver_no_show": { "lead_credit_debited": false, "ranking_strike": true }
  },
  "rider_cancel_enforcement": {
    "strikes_rolling_days": 30,
    "priority_decay_per_strike": 0.85,
    "instrument_required_after_strikes": 3
  },
  "regulatory": {
    "component_maxima": {                    // hard validators — components only
      "per_km_rate_bdt_max": 15,
      "base_fare_bdt_max": 60
    },
    "effective_per_km_monitor": {            // soft monitor, NEVER a publish blocker
      "trip_length_km": 2.0,                 // p10 trip length
      "threshold_multiplier": 1.0
    },
    "validate_on_publish": true
  }
}
```

```jsonc
// dispatch_config — scope: city
{
  "config_type": "dispatch_config",
  "scope": { "city_id": "dhaka" },

  "hotspot": {
    "zone_layer": "dhaka_ward_500m_grid",
    "update_interval_sec": 60,
    "heat_metric": "post_drop_earnings_60min",
    "baseline": { "trailing_weeks": 6, "percentile_rank_within": "city" },
    "live": { "window_min": 30, "ewma_alpha": 0.3,
              "metric": "requests_per_active_driver", "percentile_rank_within": "city" },
    "blend_weights": { "baseline": 0.4, "live": 0.6 },
    "min_samples_per_cell": 30,
    "fallback_hierarchy": ["zone_hour", "zone", "city_hour"],
    "queue_managed_zones": ["hsia"]
  },
  "pickup_dispatch": {
    "max_dispatch_eta_min": 20,              // primary gate
    "max_dispatch_radius_km": 6.0,           // secondary gate
    "relax_radius_in_low_supply": true,
    "arrival_confirmation_radius_m": 75
  },
  "lead_debit": {
    "debit_on": "ride_completed",
    "long_pickup_tiers": [
      { "pickup_km_lte": 2.0, "multiplier": 1.0 },
      { "pickup_km_lte": 3.5, "multiplier": 0.75 },
      { "pickup_km_gt":  3.5, "multiplier": 0.5 }
    ],
    "drop_zone_heat_tiers": [
      { "heat_gte": 0.50, "multiplier": 1.0 },
      { "heat_gte": 0.25, "multiplier": 0.75 },
      { "heat_lt":  0.25, "multiplier": 0.5 }
    ],
    "combine": "multiply",
    "min_debit_multiplier": 0.25
  },
  "matching": {
    "cold_drop_rank_boost": 1.5,
    "boost_decay_min": 15,
    "rider_cancel_reassignment_boost": true,
    "decline_budget_per_hour": 6,
    "decline_budget_min_leads_seen_per_hour": 5,
    "decline_cooldown_min": 10
  },
  "lead_card": {
    "destination_disclosure": "zone_and_trip_km",
    "fields": ["pickup_km", "pickup_eta_min", "pickup_charge_bdt",
               "drop_zone", "drop_zone_heat_tag", "est_fare_bdt", "debit_credits"]
  }
}
```

Note the validator discipline: `component_maxima` hard-blocks publish; the effective-per-km check is a soft monitor only — any 2 km trip with any add-on trips any per-km cap, so a hard validator there would block every config ever published.

---

## 5. Gaming matrix

| Vector | Guard | Penalty currency |
|---|---|---|
| Rider pins near, then relocates | Realized-path billing from accept-position to actual ride-start — inherent | n/a (correctly billed) |
| GPS-spoof proximity to win dispatch | Realized-path billing removes the gain; impossible-speed detection (>130 km/h jumps); promised-vs-actual ETA tracking | Ranking only, never cash |
| Rider cancels after driver drove | Reassignment boost + never-debited credit; rider strikes → priority decay → instrument requirement | Priority / access |
| Accept cheap lead, then no-show | Debit only on completion — no-show costs the driver nothing financially, so repeat no-shows are behavioral | Cooldown → package gating |
| Decline-spam (cherry-pick hot leads) | Decline budget with min-leads-seen floor (quiet-hour drivers aren't punished for low volume) + cooldown + ranking weight | Cooldown / ranking |
| Early "Arrived" tap (inflates waiting clock) | Arrival requires GPS within 75m of pin | Ranking |
| Realized-path inflation (overshoot, tap start, return) | Charge cap bounds the exploit to trivial value; route-deviation monitoring | Ranking |
| Zone-heat manipulation | Heat computed from rider-side signals only; drivers can't inject rider requests; percentile + baseline blend damps transients | n/a |
| Off-platform completion | Masking, pairing-anomaly detection, trace forensics (cancelled driver's trace matching cancelled route ≈ proof) | Package gating |
| Queue-zone abuse | HSIA override is config-pinned, not computed — no driver-controllable input | n/a |

---

## 6. Rollout and monitoring

**Staged:**
- **Stage 0 (wk 0–4):** dispatch-only — ETA gates, heat tags, arrival radius. No pricing change. Collect baselines.
- **Stage 1:** pickup charge live at p75 radius (~25% incidence), quote timeline on. **Gates to proceed:** pickup-line complaints <5 per 1,000 charged rides; p95 |final − accept quote| / quote <10%; periphery accept-rate stable.
- **Stage 2:** tighten radius toward p70; rider-cancel enforcement + reassignment boost.
- **Stage 3:** debit multipliers — only after drivers trust the credit system.

**Monitors:**
- Pickup-charge incidence vs. design target (±8pp) · cap-binding rate on charged rides (<10%)
- p95 quote-to-final deviation (<10%)
- Median post-drop time-to-next-fare by zone × hour — *the* problem-2 KPI
- Cold-lead accept latency and decline rates by zone
- Package repurchase rate, split by cold-corridor vs. hot-corridor cohort (early churn warning)
- Effective per-km on p10 trip length vs. BRTA cap (soft)
- Off-platform anomaly counts: repeat pairings, cancel-then-trace-match

---

## 7. The one comms item

The driver's trip sheet shows the pickup charge as a **separate line marked 100% driver's**. This is the single strongest defense against the fatal misread — that the platform is finally taking a cut — and it costs nothing.

---

## Open decisions (yours, not mine)

1. Policy ruling: debit multiplier = SKU pricing (my position) or incentive (fallback: levers 1–3 only).
2. BRTA written opinion: do add-on fees count toward the per-km cap? Contingency if yes — fold the pickup charge into the distance term.
3. Real realized pickup-distance percentiles to replace the seed values.
4. Rollout go/no-go.

That's the complete v2. If you want the next layer down, the highest-leverage artifacts are the quote-state machine as pseudo-code (request → accept → true-up with all edge cases) or the driver-facing Bangla copy for the lead card and trip sheet.