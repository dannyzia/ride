# Dhaka Ride-Hailing Pricing Architecture — Second Pass

---

## Executive Summary: Three Core Decisions

| Problem | Decision | One-Line Reason |
|---|---|---|
| Pickup dead-mileage | **Charge the rider** with a free radius and hard cap | It's a real per-ride cost that varies ride-by-ride; hiding it in subscription economics flattens the signal and misprices the product |
| Destination lucrativeness | **Never in the fare.** Use it only in dispatch matching | Charging riders more for living in low-demand zones is discriminatory, legally indefensible in Bangladesh, and violates the no-incentive policy by implication |
| Revenue model coherence | Pickup surcharge **enables** call-package viability | Without it, drivers in high-pickup-distance zones conclude packages aren't worth buying, and the sole revenue engine stalls |

---

## 1. Pickup Dead-Mileage

### The Formula

```
Total Fare = base_fare
           + (per_km_rate × ride_distance_km)
           + (waiting_rate × waiting_minutes)
           + pickup_surcharge
```

Where:

```
raw_pickup_km         = platform_shortest_road_distance(driver_gps_at_acceptance → pickup_pin)
chargeable_pickup_km  = max(0, raw_pickup_km − free_radius_km)
chargeable_pickup_km  = min(chargeable_pickup_km, max_chargeable_pickup_km)
pickup_surcharge      = chargeable_pickup_km × pickup_per_km_rate
```

### Concrete Parameters (Dhaka, Sedan)

| Parameter | Value | Why |
|---|---|---|
| `free_radius_km` | 2.0 | In Dhaka's density, 2 km road distance covers most reasonable pickups in core areas. This is the driver's cost of being in the market — equivalent to a shop paying rent. |
| `pickup_per_km_rate` | ৳15 (60% of ride rate of ৳25/km) | Lower than ride rate because the driver isn't yet providing the full service. Compensates fuel + time, not the ride experience. |
| `max_chargeable_pickup_km` | 5.0 | Beyond this (7 km total), the dispatch system should have found a closer driver. If it couldn't, that's a dispatch failure — the platform absorbs it, not the rider. |

### Why the Rider, Not the Call Package

Absorbing dead-mileage into call-package pricing collapses in practice:

- **Packages are zone-agnostic leads.** A driver in Gulshan and a driver in Mirpur buy the same product. If you bake average dead-mileage into the package price, you overcharge the Gulshan driver (short pickups) and undercharge the Mirpur driver (long pickups). You'd need per-zone package pricing, which fragments the product.
- **It hides a real cost.** Dead-mileage varies ride-by-ride. Bundling it into a subscription flattens the signal. Drivers should see the real economics of each ride.
- **It creates adverse selection.** Drivers in dense areas get the same package for less effective cost, attracting supply to areas that already have enough.

The rider is consuming a real service: "come to me." Pricing it transparently is fair, and it gives riders an incentive to choose sensible pickup points.

### Pickup Distance Calculation (Anti-Gaming)

**Always use platform-calculated shortest road distance at the moment of ride acceptance. Never use actual driven distance.**

1. Snapshot the driver's GPS location at `ride_accepted_at`.
2. Calculate shortest road distance from that snapshot to the pickup pin via routing API.
3. Store as `calculated_pickup_distance_km`. This value is **immutable** once set.
4. The driver can take any route they want — it doesn't change the charge.

This single decision eliminates route-inflation gaming entirely.

### What the Rider Sees

**Normal case (within free radius):**
```
Estimated Fare: ৳135
  Base fare            ৳40
  Distance (5.2 km)    ৳130
  Waiting (est.)       ৳15
  Pickup surcharge     ৳0  (within 2 km free radius)
```

**With surcharge:**
```
Estimated Fare: ৳195
  Base fare            ৳40
  Distance (4.8 km)    ৳120
  Waiting (est.)       ৳12
  Pickup (1.5 km)      ৳23  ← (3.5 − 2.0) × 15

  Tip: Walk to Mirpur Road (~400m) to reduce surcharge to ৳0
  [ Adjust Pickup Location ]   [ Request Ride ]
```

**High surcharge warning:**
```
⚠ Few drivers nearby
  Pickup surcharge: ৳65 (5.0 km beyond free radius)

  Nearby pickup with lower surcharge:
  📍 Jatrabari Bus Stand (1.2 km away) → surcharge ৳15

  [ Use Suggested Location ]   [ Request from Current Location ]
```

The surcharge is always shown **before** the rider confirms, with a full breakdown and actionable suggestions.

---

## 2. Destination Lucrativeness

### The Decision: Dispatch Layer Only

Destination attractiveness is a **matching optimization variable**, not a pricing variable. It must never touch the rider fare.

### Why Not in the Fare

**Rider fairness.** A garment worker in Ashulia needs to get home every evening. She can't choose her destination. Charging her more because her neighborhood has low return-demand punishes her for where she lives. In Dhaka, dead zones correlate with lower-income peripheral areas. This is a reputational and regulatory landmine.

**Legal defensibility.** Bangladesh's ride-sharing guidelines emphasize fare transparency and non-discrimination. Destination-based premiums are difficult to justify to regulators. Even if technically permissible today, they invite scrutiny a young platform cannot afford.

**Transparency problem.** There is no framing of "your fare is higher because drivers don't like going where you're going" that doesn't sound adversarial.

**The no-incentive policy.** Normally, platforms offset destination premiums by paying drivers more for dead-zone rides. Your policy prohibits this. You'd be charging riders more with no offsetting benefit — pure extraction.

### What to Do Instead: Four Dispatch Mechanisms

**Mechanism 1: Ride Scoring Weight**

Every ride gets a `destination_score` (0–100) based on the drop-off zone's real-time call density. The dispatch engine uses this as one input when assigning rides:

```
ride_priority = 0.40 × pickup_proximity
              + 0.20 × destination_score
              + 0.25 × driver_idle_time
              + 0.15 × driver_acceptance_rate
```

A dead-zone ride scores lower on `destination_score` but can still win if the driver is nearby or has been idle long enough. This naturally spreads dead-zone rides across the driver pool.

**Mechanism 2: Pre-Matching / Return-Ride Batching**

When a driver accepts a ride heading to a low-demand zone, immediately start looking for a return ride from that zone:

```
if destination_score < dead_zone_threshold:
    trigger_pre_match(driver_id, destination_zone, eta_to_destination)
```

This costs nothing extra — it's smarter sequencing of existing leads. The driver's call package already covers leads; you're just offering them at a better time.

**Mechanism 3: Destination Zone Transparency (Post-Acceptance)**

Show the driver the destination zone's demand level **after acceptance** (not before — that enables cherry-picking):

```
Ride to Mirpur-10. Demand in that zone: Moderate.
Estimated wait for next ride: ~8 minutes.
```

This is informational, not an incentive. It helps drivers plan (grab lunch, reposition).

**Mechanism 4: Natural Package Mix**

A driver buying a 50-lead package gets a natural mix of destinations over time. The platform doesn't discount cold-zone leads (that's an indirect incentive). The value proposition is: "50 qualified ride leads in your operating area." The destination mix is an operational detail.

### The Boundary Rule

> If a mechanism puts platform money into a driver's pocket or takes extra money from a rider's pocket specifically because of destination desirability, it's prohibited. If it changes the order or timing of existing lead offers, it's dispatch optimization and it's allowed.

---

## 3. Complete Config Schema

One consolidated schema. All thresholds are data-driven, city-scoped, vehicle-category-scoped. Nothing hardcoded.

```jsonc
{
  "meta": {
    "city": "dhaka",
    "vehicle_category": "sedan",
    "currency": "BDT",
    "schema_version": "2.0",
    "last_updated": "2026-08-23"
  },

  // ─── FARE PRICING ───────────────────────────────────────────
  "pricing": {
    "fare": {
      "base_fare": 40.0,
      "per_km_rate": 25.0,
      "per_minute_waiting_rate": 2.0,
      "minimum_fare": 60.0,
      "fare_rounding": "nearest_5"
    },

    "pickup_surcharge": {
      "enabled": true,
      "free_radius_km": 2.0,
      "pickup_per_km_rate": 15.0,
      "max_chargeable_pickup_km": 5.0,
      "distance_calculation": "shortest_road_at_acceptance",
      "rider_visibility": "breakdown_shown_before_confirm",
      "high_surcharge_warning_bdt": 50.0,
      "suggest_alternative_pickup": true,
      "alternative_pickup_search_radius_km": 1.5,
      "pickup_to_ride_ratio_warning": 0.6
    },

    "cancellation": {
      "rider_cancellation_fee_bdt": 30.0,
      "driver_must_have_traveled_km": 1.0,
      "grace_period_seconds": 60,
      "auto_cancel_after_minutes": 20,
      "rider_can_cancel_free_after_minutes": 15,
      "payment_method": "pre_authorized_wallet"
    }
  },

  // ─── DESTINATION SCORING ────────────────────────────────────
  "destination_scoring": {
    "enabled": true,
    "priced_into_fare": false,
    "zone_definition": "h3_resolution_8",
    "scoring_window_minutes": 15,
    "score_update_interval_seconds": 120,
    "score_range": [0, 100],
    "score_components": {
      "request_rate_weight": 0.35,
      "driver_wait_time_weight": 0.35,
      "demand_supply_ratio_weight": 0.30
    },
    "normalization": {
      "max_requests_per_hour": 20,
      "max_wait_minutes": 30,
      "max_demand_supply_ratio": 3.0
    },
    "dead_zone_threshold": 25,
    "hot_zone_threshold": 75,
    "cold_start_default_score": 50,
    "minimum_data_points_for_scoring": 5,
    "show_demand_to_driver": true,
    "show_timing": "after_acceptance",
    "zone_level_only_until_arrival": true
  },

  // ─── DISPATCH ───────────────────────────────────────────────
  "dispatch": {
    "scoring_weights": {
      "pickup_proximity": 0.40,
      "destination_score": 0.20,
      "driver_idle_time": 0.25,
      "driver_acceptance_rate": 0.15
    },
    "pre_matching": {
      "enabled": true,
      "trigger_condition": "destination_score_below_dead_zone_threshold",
      "lookahead_minutes": 10,
      "max_pre_match_radius_km": 3.0
    },
    "acceptance_policy": {
      "acceptance_window_seconds": 30,
      "min_acceptance_rate_for_priority_leads": 0.70,
      "max_consecutive_declines_before_cooloff": 3,
      "cooloff_period_seconds": 180
    }
  },

  // ─── CALL PACKAGES ──────────────────────────────────────────
  "call_packages": {
    "tiers": [
      { "name": "Starter",   "leads": 20,  "price_bdt": 1200, "validity_days": 30 },
      { "name": "Standard",  "leads": 50,  "price_bdt": 2500, "validity_days": 30 },
      { "name": "Premium",   "leads": 100, "price_bdt": 4200, "validity_days": 30 },
      { "name": "Unlimited", "leads": null, "price_bdt": 7500, "validity_days": 30,
        "eligibility": "invitation_only",
        "min_acceptance_rate": 0.85,
        "min_rating": 4.5 }
    ],
    "lead_guarantee_minimum_fare_bdt": 80.0,
    "lead_guarantee_excludes": ["pickup_surcharge", "waiting_charges"],
    "unused_lead_rollover": true,
    "zone_based_packages_enabled": false,
    "zone_based_packages_note": "Enable after 6 months of data"
  },

  // ─── ANTI-GAMING ────────────────────────────────────────────
  "anti_gaming": {
    "pickup_distance": {
      "calculation_method": "platform_routing_api_snapshot_at_acceptance",
      "gps_accuracy_threshold_meters": 50,
      "teleportation_detection_jump_meters": 500,
      "flag_if_driver_movement_after_acceptance_exceeds_km": 1.5,
      "anomaly_detection_enabled": true
    },
    "destination_cherry_picking": {
      "destination_revealed_at": "post_acceptance",
      "track_zone_specific_acceptance_rate": true,
      "flag_threshold_zone_decline_rate": 0.50
    },
    "collusion_detection": {
      "flag_repeated_driver_rider_pairs_within_hours": 24,
      "flag_pair_count_threshold": 4,
      "flag_short_ride_with_high_pickup_surcharge": true,
      "short_ride_threshold_km": 0.5
    }
  },

  // ─── MONITORING ─────────────────────────────────────────────
  "monitoring": {
    "pickup_surcharge_metrics": [
      "avg_pickup_surcharge_bdt_per_ride",
      "pct_rides_with_zero_surcharge",
      "pct_rides_hitting_max_cap",
      "rider_cancellation_rate_after_seeing_surcharge",
      "pickup_location_adjustment_rate"
    ],
    "destination_metrics": [
      "dead_zone_count",
      "hot_zone_count",
      "pre_match_success_rate",
      "avg_driver_wait_after_dropoff_by_zone"
    ],
    "business_health_metrics": [
      "package_renewal_rate",
      "avg_package_roi_multiplier",
      "avg_driver_hourly_earnings_bdt",
      "driver_churn_rate_monthly"
    ],
    "alert_thresholds": {
      "avg_surcharge_above_bdt": 40,
      "zero_surcharge_pct_below": 0.40,
      "cancellation_after_surcharge_above_pct": 0.15,
      "package_renewal_rate_below_pct": 0.60,
      "package_roi_below": 1.5,
      "driver_hourly_earnings_below_bdt": 150
    }
  },

  // ─── EXPERIMENTATION ────────────────────────────────────────
  "experimentation": {
    "enabled": true,
    "traffic_split_method": "driver_id_hash_mod",
    "min_sample_size_per_variant": 500,
    "min_experiment_duration_days": 14,
    "primary_metric": "package_renewal_rate",
    "guardrail_metrics": [
      "rider_cancellation_rate",
      "avg_rider_wait_time",
      "driver_hourly_earnings"
    ],
    "guardrail_thresholds": {
      "rider_cancellation_rate_increase_pct": 5,
      "avg_rider_wait_time_increase_pct": 10,
      "driver_hourly_earnings_decrease_pct": 10
    }
  }
}
```

---

## 4. Gaming Risks and Mitigations

### Risk 1: Pickup Distance Inflation

**Attack.** Driver accepts ride, then drives *away* from pickup before heading there, hoping the system uses actual driven distance.

**Mitigation.** `distance_calculation: "shortest_road_at_acceptance"`. The distance is computed once at acceptance from the driver's GPS snapshot to the pickup pin via the platform's routing API. It is immutable. The driver's actual route is irrelevant. Log the calculation for audit.

**Secondary.** GPS accuracy check. If accuracy is >50m uncertainty or location is anomalous (middle of a river), use the last confirmed high-confidence position.

### Risk 2: Destination Cherry-Picking

**Attack.** Drivers learn which zones are dead and decline rides heading there.

**Mitigation (layered):**

1. **Information asymmetry.** Destination is revealed only *after* acceptance. Before acceptance, the driver sees pickup location, estimated distance, and estimated fare — not the drop-off zone. This is the strongest single defense.
2. **Zone-specific acceptance tracking.** If a driver's acceptance rate for a specific zone drops below 50%, flag for review.
3. **Allocation deprioritization.** Drivers below 70% overall acceptance rate get fewer priority leads in their next package cycle. The package still has the same number of leads, but they come slower.
4. **Cooloff.** After 3 consecutive declines, 180-second pause on new ride offers. Breaks the rapid-fire cherry-picking pattern.

### Risk 3: GPS Spoofing

**Attack.** Driver fakes GPS to appear closer to pickup clusters, reducing surcharge.

**Mitigation.**

- Require GPS accuracy <50m.
- Cross-reference with cell tower triangulation where available.
- Flag GPS jumps >500m in a single update (teleportation detection).
- Track historical patterns — consistently impossibly precise locations in dense urban areas are flagged.

### Risk 4: Short Ride + High Pickup Surcharge Fraud

**Attack.** Driver with a fake rider account requests rides from far away, inflating the pickup surcharge, then "completes" a near-zero-distance ride. Since the driver keeps 100% of fare + surcharge, this extracts money from the rider account (which may be stolen or colluding).

**Mitigation.**

- Flag rides where `ride_distance_km < 0.5` AND `pickup_surcharge > 0`.
- Require riders to have verified bKash/Nagad accounts.
- Track completion patterns — a driver with an unusual ratio of high-surcharge/short-ride completions gets flagged.

### Risk 5: Driver-Rider Collusion on Pickup Distance

**Attack.** Rider places pin far from driver intentionally to inflate surcharge, then reimburses driver off-platform.

**Mitigation.** This is actually a non-issue in your model. The surcharge goes from rider to driver — it's a zero-sum transfer between them. The platform doesn't lose money. The only loser is the rider, who is voluntarily participating. No platform intervention needed.

### Risk 6: Strategic Zone Positioning

**Attack.** Drivers cluster in high-demand zones to avoid dead-mileage.

**Reality.** This is rational behavior, not gaming. The free radius handles the pickup cost. The dispatch system naturally balances — if too many drivers cluster in Gulshan, competition increases (fewer leads per driver), while underserved areas become more attractive. Don't fight this; let the economics self-regulate.

---

## 5. Call-Package Economics

### Why Pickup Surcharge Enables the Revenue Model

Without the surcharge, a driver's effective revenue per lead:

```
fare − fuel(pickup_distance + ride_distance)
```

A 5 km pickup to a 3 km ride: ৳115 fare − ৳50 fuel = ৳65 net. Over 50 leads: ৳3,250. Package costs ৳2,500. ROI: 1.3x. Barely worth it.

With the surcharge:

```
fare + pickup_surcharge − fuel(pickup_distance + ride_distance)
```

Same ride adds ৳45 surcharge. Net: ৳110. Over 50 leads: ৳5,500. ROI: 2.2x. Now the driver renews.

**The pickup surcharge doesn't just compensate dead-mileage — it makes the call-package value proposition viable.** Without it, drivers in pickup-heavy zones conclude packages aren't worth buying, and the sole revenue engine stalls.

### Package Design

| Tier | Leads | Price | Per-Lead | Target |
|---|---|---|---|---|
| Starter | 20 | ৳1,200 | ৳60 | New drivers, trial |
| Standard | 50 | ৳2,500 | ৳50 | Regular full-time |
| Premium | 100 | ৳4,200 | ৳42 | High-volume |
| Unlimited | ∞ | ৳7,500 | — | Top-tier, invitation only |

Volume discounts reward commitment and lock in supply. The unlimited tier requires >85% acceptance rate and >4.5 rating — it's a retention tool for best drivers.

### The No-Incentive Policy Boundary

| Mechanism | Incentive? | Allowed? |
|---|---|---|
| Pickup surcharge (rider → driver) | No — fare component | Yes |
| Platform paying driver bonus for dead-zone rides | Yes | **No** |
| Platform giving rider discount for off-peak | Yes | **No** |
| Lead allocation priority based on acceptance rate | No — operational sequencing | Yes |
| Zone-based call-package pricing | No — product pricing | Yes (defer 6 months) |
| Platform crediting driver wallet for ride milestones | Yes | **No** |
| Pre-matching return rides from dead zones | No — dispatch optimization | Yes |

---

## 6. Edge Cases

### Driver Already at Pickup Point

Pickup surcharge is ৳0 (within free radius). Correct — no dead-mileage was incurred. The system naturally rewards drivers positioned in high-demand areas.

### No Drivers Within Reasonable Range

Rider in Keraniganj sees ৳75 surcharge on a ৳100 ride. The surcharge is doing its job — signaling low supply. The system suggests a nearby pickup point (main road, landmark) where a driver is closer. If the rider still requests, the surcharge stands. The `max_chargeable_pickup_km` cap ensures the rider never pays for dispatch failures beyond 5 km chargeable.

### Driver Takes Forever to Arrive

The surcharge compensates distance, not time. Driver delay is a service quality issue handled by the acceptance policy and rating system. If the driver is >15 minutes late, the rider can cancel without fee. The surcharge remains based on the distance snapshot at acceptance.

### Ride Cancelled After Driver En Route

Require riders to have a verified bKash/Nagad account with a small pre-authorization hold (৳50). If the rider cancels after the driver has traveled >1 km toward pickup, a flat ৳30 cancellation fee is charged. Deliberately simple — precision here creates disputes.

### Very Short Ride with Disproportionate Surcharge

A 1 km ride with a 3 km chargeable pickup: ৳65 fare + ৳45 surcharge = ৳110. The surcharge is 41% of total. The system warns the rider before confirmation and suggests a closer pickup point. The surcharge reflects real cost; don't suppress it.

### Multi-Stop Ride Ending in Dead Zone

No change needed. Pickup surcharge covers getting to the ride start. Multi-stop distance is captured in ride distance. Destination lucrativeness is handled by dispatch. The driver accepted knowing the destination (post-acceptance reveal), and the system pre-matches a return lead.

---

## 7. Destination Scoring Pipeline

### Data Flow

```
Ride Requests ──→ Zone Aggregator ──→ Density Store (Redis)
(15-min windows)    (per H3 hex)       (time-series)

Completed Rides ──→ Fulfillment Rate ──→ Density Store
                    Calculator

                         ┌──────────────────────────────┐
Density Store ──────────→│  Destination Score Engine     │
                         │                               │
                         │  score = 0.35 × request_rate  │
                         │        + 0.35 × wait_inverse  │
                         │        + 0.30 × ds_ratio      │
                         │                               │
                         │  Output: 0-100 per zone       │
                         └──────────┬────────────────────┘
                                    │
                                    ▼
                         ┌──────────────────────────────┐
                         │  Dispatch Scoring Engine      │
                         │  (consumes destination_score  │
                         │   as one of four inputs)      │
                         └──────────────────────────────┘
```

### Zone Definition

H3 hexagonal grid at resolution 8 (~0.74 km² per hex). Small enough to distinguish Gulshan from Banani, large enough for meaningful sample sizes. Custom polygon overrides for special zones (airport, university campuses) where pickup rules differ.

### Score Calculation Logic

```python
def destination_score(zone, window=15):
    request_rate = requests_per_hour(zone, window)       # 0-20+ calls/hr
    avg_wait = avg_driver_wait_for_next_ride(zone, window) # 0-30 min
    ds_ratio = request_rate / max(active_drivers(zone), 1) # 0-3+

    request_component = min(request_rate / 20.0, 1.0)
    wait_component    = max(0, 1.0 - avg_wait / 30.0)
    ds_component      = min(ds_ratio / 3.0, 1.0)

    return round((0.35*request_component + 0.35*wait_component
                 + 0.30*ds_component) * 100, 1)
```

Cold-start zones with insufficient data get the default score of 50 (neutral), not zero.

---

## 8. Parameter Tuning

### Launch Values and Tuning Signals

| Parameter | Launch | Tune Up If | Tune Down If |
|---|---|---|---|
| `free_radius_km` | 2.0 | >60% rides have zero surcharge | <30% rides have zero surcharge |
| `pickup_per_km_rate` | ৳15 | Package renewal <60% | Rider cancellation after surcharge >15% |
| `max_chargeable_pickup_km` | 5.0 | Don't increase — fix dispatch instead | >5% rides hit cap |
| `dead_zone_threshold` | 25 | Pre-match success <30% | Too many zones classified dead |
| Scoring weights | 0.40/0.20/0.25/0.15 | A/B test in pairs over 2-week windows | Never test pricing and dispatch weights simultaneously |

### The Single Most Important Metric

**`package_renewal_rate`.** If drivers keep buying packages, the economics work. If they stop, nothing else matters. Track weekly, segmented by zone, package tier, and pickup surcharge exposure. If drivers with high average surcharges are churning, the `pickup_per_km_rate` needs to increase.

---

## 9. System Interaction Map

```
RIDER REQUESTS RIDE
        │
        ▼
┌─────────────────────────────────────────┐
│  PRICING ENGINE                         │
│                                         │
│  1. Calculate ride fare                 │
│  2. Snapshot driver GPS at acceptance   │
│  3. Compute pickup distance (immutable) │
│  4. Apply free radius + cap             │
│  5. Show breakdown to rider pre-confirm │
│  6. Suggest closer pickup if surcharge  │
│     is high                             │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  DISPATCH ENGINE                        │
│                                         │
│  1. Score each available driver:        │
│     proximity(0.40) + destination(0.20) │
│     + idle(0.25) + acceptance(0.15)     │
│  2. Assign to best-scoring driver       │
│  3. If destination is dead zone →       │
│     trigger pre-match for return ride   │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  RIDE COMPLETION                        │
│                                         │
│  1. Rider pays driver directly          │
│     (cash/bKash/Nagad)                  │
│     = fare + pickup surcharge           │
│  2. Platform generates itemized receipt │
│  3. Update zone metrics                 │
│  4. Update driver stats                 │
│  5. Log for anti-gaming analysis        │
└─────────────────────────────────────────┘
```

**The fare is deterministic and transparent** (rider-facing). **The dispatch is intelligent and adaptive** (driver-facing). **The revenue model is decoupled from both** (platform-facing via call packages). Each layer tunes independently without breaking the others.