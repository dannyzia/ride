OK, going back over my own draft with a hammer. Several things I'd tighten, drop, or just got wrong.

## What I was too soft on

### 1. Free radius should be 1.0km, not 1.5km

In dense Dhaka, 1.5km haversine is huge. In Puran Dhaka or Motijheel, 1.5km covers maybe 80% of all pickups — meaning the fee almost never triggers and drivers get compensated for almost nothing. The whole mechanism dies from generosity.

But in suburbs (Uttara, Bashundhara, Mirpur DOHS, Badda), 1.5km is genuinely a long pickup and 1.0km feels stingy.

So: **zone-aware free radius**, data-driven, with two presets:

| Zone class | `free_radius_km` | Reasoning |
|---|---|---|
| `dense` (Puran Dhaka, Motijheel, Old Airport, parts of Dhanmondi) | 0.8 | Short blocks; the mechanism is meant to trigger often |
| `standard` (most of Dhaka) | 1.2 | Default |
| `suburban` (Uttara, Bashundhara, Mirpur DOHS, Badda, Aftabnagar) | 2.0 | Spread-out; longer pickups are normal |

Zone classification lives in a `zones` table keyed by polygon, not a freeform string. Default to `standard` for unmapped areas.

### 2. Locked-at-accept is wrong — make pickup fare conditional on arrival

I said "lock at acceptance, don't recompute." That was lazy. Two problems:

- **Driver has no skin in the game to actually arrive fast.** A driver who accepts a 4km pickup and takes 25 minutes to arrive because they finished their chai still gets the 40 BDT pickup fee. That's broken.
- **GPS spoofing at accept.** Driver sets their GPS to the rider's pin at accept, then drives 4km in reality. Haversine at accept says 0.3km; we pay 0 pickup fee. Fraud.

The fix: **pickup fare is computed at arrival, not at accept.** Concretely:

```
billable_pickup_km_at_arrival = haversine(
    pickup_point,
    driver_location_at_arrival_confirmed
)

# anti-spoofing: take the smallest reasonable number
billable_pickup_km = min(
    haversine_at_accept,
    haversine_at_arrival,
    polyline_distance_at_arrival * 1.15   # 15% slack vs straight line
)
```

If the driver cancels between accept and arrival, **they get zero pickup fare and the lead is consumed.** They don't get to re-sell the same lead. This kills the spoof-at-accept-and-cancel game and makes "long pickup → slow driver" self-correcting.

Show the rider a **range** in the quote: "Pickup fee: 25–50 BDT" — finalized when the driver arrives. Riders tolerate a range; they don't tolerate surprise at drop-off.

### 3. I introduced a "premium lead" tier that I should kill

In my first pass I floated selling "premium" call packages (short-pickup leads only) at a higher price. Retracting this. Reasons:

- It creates a two-tier driver class, which causes retention problems at the bottom and entitlement problems at the top.
- It's mostly marketing. There's no objective filter for "premium" — every lead is a real rider who needs a ride. The shorter-pickup label is mostly the rider's pin accuracy and the driver's location, both of which are noise.
- Simplicity wins in the early stage. Sell one product: "X leads per day/week." The pickup fee handles compensation; you don't need a second product.

What I do still want: **honest lead-quality signals** the driver sees for free — ETA, pickup distance, destination zone heat. Information, not tiered products.

---

## What I missed

### 4. Call package pricing has a tension I didn't address

The pickup fee goes to the driver, not the platform. So the platform's revenue per lead is unchanged, but the **driver's earnings per lead go up**. Drivers will rationally prefer smaller packages (fewer leads × more pickup-fee income = same total). This compresses platform revenue.

The answer is **per-lead pricing in the package, not flat package pricing.** Example:

| Package | Leads/day | Price (BDT) | Per-lead | Comment |
|---|---|---|---|---|
| Starter | 20 | 350 | 17.50 | Highest per-lead; for part-time drivers |
| Standard | 50 | 750 | 15.00 | Default |
| Pro | 100 | 1,300 | 13.00 | Heavy users get volume discount |
| Elite | 200 | 2,400 | 12.00 | Bulk-only; subject to platform review |

This is standard SaaS unit-economics, and it lets you recapture some of the pickup-fee surplus without making drivers feel cheated. Critically: the **per-lead price is constant per package tier** — the platform doesn't get clever with "this lead costs you 13, that one costs 17." Same as Uber's "no surge" posture but in package form.

Add to schema:

```yaml
call_packages:
  starter:    { leads: 20,  price_bdt: 350,   per_lead_bdt: 17.50 }
  standard:   { leads: 50,  price_bdt: 750,   per_lead_bdt: 15.00 }
  pro:        { leads: 100, price_bdt: 1300,  per_lead_bdt: 13.00 }
  elite:      { leads: 200, price_bdt: 2400,  per_lead_bdt: 12.00, requires_approval: true }
```

### 5. Round-trip and multi-stop rides

Dhaka has a strong "go-and-back" pattern: rider books a car to Gulistan, waits an hour, comes back. Currently the formula breaks here — the return leg is a fresh ride with fresh dead mileage both ways.

Two options I didn't address:

**Option A: round-trip as a single product.** Rider pays a single fare computed as `2× ride_distance`, capped waiting for the in-between period. `waiting_rate` meters after a generous grace (e.g., 60 min). Driver's incentive: no dead-mileage between outbound and return. The platform sells this as a "round-trip fare" line item.

**Option B: just let the rider book two rides.** But then the second ride has its own pickup fee from Gulistan back, which drivers won't love.

I'd ship **Option A as a "Hourly / Round-trip" product** in v2, not v1. For v1, do nothing and let riders book two one-way trips. Note this in the spec as a known gap.

Multi-stop within a single ride: the formula already handles this (per-km + waiting). No new logic needed. Just make sure `waiting_minutes` aggregates across all stops, not just the pickup wait.

### 6. Wait-time gaming

I covered pickup gaming but not wait-time gaming, which is a bigger hole. Driver claims the rider took 12 minutes to walk down, when it was 4. Defense:

- **App-side timer** is the source of truth, not driver claim. The rider's app starts the ride; the rider's app stops the ride. Driver-side timer is for display only.
- The driver pressing "rider arrived" before the rider is actually at the car: capped at 5 minutes of free waiting post-arrival, then waiting_rate kicks in regardless. Drivers learn to wait until the rider is in the car before starting.

### 7. A real anti-fraud signal list

Pulling my gaming defenses into a single concrete checklist the anti-fraud service runs nightly:

| Signal | Threshold | Action |
|---|---|---|
| GPS speed > 120 km/h in 60s before accept | any | Flag for review |
| Pickup distance > 2× fleet median for that pickup zone, this hour | 3+ events/week | Flag |
| `pickup_fare / ride_fare` ratio > 0.6 | 5+ rides/week | Flag (suggests cherry-picking) |
| Driver's billable pickup km distribution > 3σ above fleet | any week | Manual review |
| Driver cancellation rate post-accept > 25% | any week | Strike |
| Rider pin moved > 500m between booking and pickup | 3+ events | Rider-side flag (could be rider gaming) |
| Repeated same-driver-same-rider pickups | 4+/month | Collusion flag |
| Time gap accept→arrive > 30 min for <5km pickup | any | Refund pickup fee |

Make these thresholds `pricing.integrity.*` so they're tunable, not buried in code.

---

## Schema changes from v1

```yaml
pricing:
  vehicle_categories:
    car:    { base_fare: 60, per_km_rate: 22, waiting_rate: 2, free_waiting_min: 3, minimum_fare: 80 }
    bike:   { base_fare: 30, per_km_rate: 12, waiting_rate: 1, free_waiting_min: 2, minimum_fare: 40 }
    cng:    { base_fare: 40, per_km_rate: 15, waiting_rate: 1, free_waiting_min: 2, minimum_fare: 50 }

  pickup:
    pickup_fare_basis: "min(haversine_accept, haversine_arrival, polyline_arrival*1.15)"
    per_pickup_km_rate_ratio: 0.4
    pickup_fare_cap: 50
    min_pickup_distance_for_charge: 0.3
    paid_on_driver_cancel: false           # explicit
    driver_cancel_forfeits_lead: true
    max_pickup_distance_km: 12             # leads beyond this not surfaced

  pickup_zones:                            # polygon-keyed, default standard
    dense:     { free_radius_km: 0.8 }
    standard:  { free_radius_km: 1.2 }
    suburban:  { free_radius_km: 2.0 }

  destination:
    zone_window_min: 15
    hot_zone_min_calls_per_hour: 5
    cold_zone_max_calls_per_hour: 0.5
    cold_zone_driver_priority_boost: 1.5
    hot_zone_driver_priority_boost: 1.0
    forbid_in_fare: true                   # lint-enforced; do not import from fare service

  cities:
    dhaka: { ... overrides ... }

  integrity:                                # anti-fraud thresholds, all tunable
    max_gps_speed_kmh: 120
    pickup_distance_zone_outlier_ratio: 2.0
    pickup_fare_to_ride_fare_max_ratio: 0.6
    pickup_distance_sigma_threshold: 3.0
    max_post_accept_cancel_rate: 0.25
    pin_movement_flag_meters: 500
    collusion_pair_threshold_per_month: 4
    max_accept_to_arrive_min_short_pickup: 30

call_packages:                             # moved out of pricing for clarity
  starter:  { leads_per_day: 20,  price_bdt: 350,  per_lead_bdt: 17.50 }
  standard: { leads_per_day: 50,  price_bdt: 750,  per_lead_bdt: 15.00 }
  pro:      { leads_per_day: 100, price_bdt: 1300, per_lead_bdt: 13.00 }
  elite:    { leads_per_day: 200, price_bdt: 2400, per_lead_bdt: 12.00, requires_approval: true }
```

---

## Things I want to flag for you to decide

1. **`pickup_fare_cap` per vehicle category.** I'm currently using 50 BDT flat. Bikes and CNGs probably want 25–30 BDT. Car can stay at 50. I left it flat for v1; per-category override is a 2-line change.

2. **Should the platform show "no drivers nearby" past `max_pickup_distance_km`, or show the lead with the high pickup fee and let drivers decide?** I'm leaning "show with disclosure" because a hard cut-off feels like the platform is gatekeeping the rider's options. But you may want the cut-off for a different reason — protecting drivers from bait leads.

3. **Round-trip product: v1 or v2?** I'd say v2, but if your competitor launches it first you'll be playing catch-up in the corporate-booking segment.

4. **Pin-accuracy issue from the rider side.** Riders in Dhaka save pins to apartment compounds, not exact building entrances. Drivers always walk an extra 100–300m. Either bake this into the free radius (raise to 1.5km again) or have riders confirm pin by tapping a map dot at booking time. The latter is a real product improvement.

5. **The "minimum_fare" cap.** I have `minimum_fare: 80` for cars. With pickup + ride + waiting, a 0.8km ride could compute to 35 BDT. Rider pays 80. Is 80 the right floor? For bikes, 40 might be too low (covers gas, barely). Worth a sensitivity check.

Want me to take a third pass focused on the dispatch/matching algorithm — specifically how the cold-zone priority boost actually computes and what the driver-facing hotspot map should look like? That's the operational half of the same problem and I deliberately kept it thin here.