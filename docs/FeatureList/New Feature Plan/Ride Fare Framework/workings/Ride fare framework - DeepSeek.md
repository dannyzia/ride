Hard second pass — revised recommendation

After stress-testing the first-pass design, my position is unchanged on destination lucrativeness, but I would change one important part of pickup pricing:

Do not quote pickup fee using only the single nearest available driver.
Use a quantile of the nearby available driver pool as the reference distance.
This reduces re-quotes, reduces driver gaming, and better matches the actual driver who will likely end up accepting.

---

1. Pickup dead-mileage — final design

1.1 Core principle

Pickup dead-mileage is a real cost to the driver. Since the platform never pays driver incentives and does not escrow fares, the only scalable, incentive-compatible funding source is the rider fare.

Drivers should be compensated for unusually long pickups, but riders should not be punished for normal urban pickup distance.

So:

· First free_pickup_radius_km is free.
· Beyond that, charge per km.
· Cap the pickup fee twice: absolute amount and percentage of the base ride fare.
· Lock the quoted fare at request time.
· Re-quote only if actual dispatch distance is materially worse than the quote.

1.2 Reference pickup distance

At request time:

1. Find available drivers within pickup_search_radius_km of the pickup point.
2. Compute road-network pickup distance for each driver.
3. Sort by distance ascending.
4. Take the closest pickup_quote_pool_size drivers, default 5.
5. Compute the pickup_quote_quantile of their pickup distances, default 0.75.

Example:

```text
sorted pickup distances: 0.8, 1.1, 1.4, 1.9, 2.6 km
pool size = 5
quantile = 0.75

reference_pickup_km = 1.9 km
```

This means the rider is quoted a pickup fee based on a realistic driver, not the single closest driver who may decline.

Do not use straight-line distance. Use road-network distance. In Dhaka, straight-line distance badly underestimates real pickup distance.

1.3 Final fare formula

```text
fare_before_pickup =
    base_fare
    + (per_km_rate × trip_distance_km)
    + (waiting_rate_per_minute × chargeable_waiting_minutes)

chargeable_pickup_km =
    max(0, reference_pickup_km - free_pickup_radius_km)

pickup_fee_raw =
    chargeable_pickup_km × pickup_per_km_rate

pickup_fee =
    min(
        pickup_fee_raw,
        pickup_fee_cap_amount,
        pickup_fee_cap_pct × fare_before_pickup
    )

final_fare = fare_before_pickup + pickup_fee
```

1.4 Fare locking and re-quote rule

Lock the fare when the rider sees it.

After dispatch, if the actual assigned driver’s pickup distance exceeds the quoted reference distance by more than requote_if_pickup_distance_km_exceeds, then:

· Re-quote the rider with the actual pickup distance.
· Give the rider the option to accept the updated fare or cancel without penalty.

Default:

```text
requote_if_pickup_distance_km_exceeds = 1.0
```

If actual assigned driver is within 1.0 km of the quoted reference, do not re-quote. This avoids unnecessary re-quotes while still protecting drivers from large unexpected dead mileage.

Example:

```text
quoted reference_pickup_km = 1.9 km
actual assigned driver pickup = 2.6 km
difference = 0.7 km
threshold = 1.0 km

No re-quote. Driver still receives the quoted fare.
```

If actual pickup = 3.2 km:

```text
difference = 1.3 km > 1.0 km
Re-quote required.
```

1.5 Recommended Dhaka defaults

Start with these values, but all must be configurable by city and vehicle category.

```text
free_pickup_radius_km = 1.5
pickup_per_km_rate = 25 BDT/km
pickup_fee_cap_amount = 150 BDT
pickup_fee_cap_pct = 0.50

pickup_search_radius_km = 8.0
pickup_quote_pool_size = 5
pickup_quote_quantile = 0.75
requote_if_pickup_distance_km_exceeds = 1.0
max_pickup_radius_km = 10.0
```

Example calculation:

```text
base_fare = 60 BDT
per_km_rate = 25 BDT/km
trip_distance_km = 5 km
waiting = 0

fare_before_pickup = 60 + (25 × 5) = 185 BDT

reference_pickup_km = 2.5 km
free_pickup_radius_km = 1.5 km
chargeable_pickup_km = 1.0 km

pickup_fee_raw = 1.0 × 25 = 25 BDT

pickup_fee_cap_amount = 150 BDT
pickup_fee_cap_pct × fare_before_pickup = 0.50 × 185 = 92.5 BDT

pickup_fee = min(25, 150, 92.5) = 25 BDT

final_fare = 185 + 25 = 210 BDT
```

For a very short ride:

```text
base_fare = 60 BDT
trip_distance_km = 1 km

fare_before_pickup = 60 + 25 = 85 BDT

reference_pickup_km = 5 km
free_pickup_radius_km = 1.5 km
chargeable_pickup_km = 3.5 km

pickup_fee_raw = 3.5 × 25 = 87.5 BDT

pickup_fee_cap_amount = 150 BDT
pickup_fee_cap_pct × fare_before_pickup = 0.50 × 85 = 42.5 BDT

pickup_fee = min(87.5, 150, 42.5) = 42.5 BDT

final_fare = 85 + 42.5 = 127.5 BDT
```

The relative cap protects the rider from paying more in pickup than the trip itself.

---

2. Destination lucrativeness — final position

2.1 Verdict

Destination lucrativeness should never be priced into the rider fare.

It belongs exclusively in dispatch/matching logic.

2.2 Justification

Rider fairness and transparency

A rider cannot control whether their drop-off zone is hot or cold. Charging more because the drop-off is in a cold zone looks like punishing the rider for where they are going.

That is:

· hard to explain
· likely to feel arbitrary
· damaging to trust

Legal defensibility

Destination demand is a forecast, not a guaranteed cost. A hot zone can cool down by the time the driver arrives. Charging riders based on a probabilistic future demand signal creates legal and regulatory risk.

It can also look like geographic price discrimination, which regulators in Bangladesh and elsewhere may scrutinize.

Driver retention

Drivers care about where they land. The correct mechanism is to give them better information and better matching, not to charge riders.

If you charge riders extra for cold destinations, drivers may avoid those trips even more. That worsens coverage and reduces call-package value.

2.3 How to use destination lucrativeness in dispatch

Driver-facing tag

Show a positive-only tag when the drop-off zone is hot:

```text
“High demand drop-off”
```

Do not show a negative tag for cold zones. Show neutral or no label.

This reduces aggressive cold-zone avoidance.

Ride scoring

Use destination heat as a soft dispatch weight:

```text
ride_score =
    - w_pickup_distance × pickup_distance_km
    + w_fare × expected_fare
    + w_destination_heat × destination_heat_score
    + w_driver_preference × driver_preference_score
```

Normalize destination_heat_score to 0..1.

Recommended default weights:

```text
w_pickup_distance_penalty_per_km = 12
w_expected_fare = 1
w_destination_heat = 3
w_driver_preference = 2
```

w_destination_heat must be small enough that it influences ranking but does not dominate pickup distance and fare.

No platform-funded credit

Do not use platform-funded credit or cash to compensate cold-zone drops. That would violate the no-incentive policy and create a permanent platform expense with no commission revenue to fund it.

---

3. Config schema

All fields are data-driven and can be overridden by city and vehicle category.

```json
{
  "pricing": {
    "currency": "BDT",
    "fare_formula": {
      "base_fare": 60,
      "per_km_rate": 25,
      "waiting_rate_per_minute": 3,
      "free_waiting_minutes": 3
    },
    "pickup_fee": {
      "enabled": true,
      "free_pickup_radius_km": 1.5,
      "per_km_rate": 25,
      "cap_amount": 150,
      "cap_pct_of_ride_fare": 0.50,
      "pickup_search_radius_km": 8.0,
      "pickup_quote_pool_size": 5,
      "pickup_quote_quantile": 0.75,
      "distance_type": "road_network",
      "reference_distance_source": "nearby_available_driver_quantile",
      "lock_fare_at_request": true,
      "requote_if_pickup_distance_km_exceeds": 1.0,
      "max_pickup_radius_km": 10.0
    }
  },

  "dispatch": {
    "scoring": {
      "enabled": true,
      "weights": {
        "pickup_distance_penalty_per_km": 12,
        "expected_fare_weight": 1,
        "destination_heat_weight": 3,
        "driver_preference_weight": 2
      }
    },
    "destination_heat": {
      "enabled": true,
      "source": "rider_request_density",
      "zone_granularity": "grid_500m",
      "window_minutes": 15,
      "max_age_minutes": 20,
      "normalization": "percentile_0_to_1",
      "hot_threshold": 0.75,
      "cold_threshold": 0.25,
      "show_hot_tag": true,
      "show_cold_tag": false,
      "tag_text_hot": "High demand drop-off",
      "tag_text_neutral": "Normal demand drop-off"
    }
  }
}
```

Override path example:

```text
system_config.pricing.city_overrides.DAC.vehicle_categories.CAR.pickup_fee.free_pickup_radius_km
```

---

4. Driver gaming risks and guards

4.1 Pickup distance manipulation

Risk

Drivers may try to inflate pickup distance to earn higher pickup fees.

Vectors:

· Declining rides so a farther driver gets the fare.
· Driving away from the pickup area before going available.
· GPS spoofing after acceptance.
· Colluding to create false demand spikes near their preferred zones.

Guards

Vector Guard
Decline cascade Use a quantile of the nearby driver pool, not the nearest driver.
Farther driver accepted Re-quote only if actual pickup exceeds quoted reference by > threshold.
GPS spoofing Lock reference pickup distance at request time using driver-reported location before offer. Do not update fee from post-acceptance movement.
Collusion / false demand Destination heat uses only rider-side request density, not driver self-reports.
Repeated decline gaming If a driver repeatedly declines within a short window, temporarily lower their driver_preference_score.
Long pickup without compensation max_pickup_radius_km prevents dispatching drivers more than 10 km away.

4.2 Destination heat gaming

Risk

Drivers may try to make their preferred zones appear hot to attract more trip offers.

Vectors:

· Creating fake rider requests from a target zone.
· Sharing accounts to generate artificial call density.
· Avoiding cold-zone trips after seeing cold tags.

Guards

Vector Guard
Fake requests Anti-fraud: rate limiting per device/account, device fingerprinting, request cooldown.
Account sharing Anomaly detection on repeated requests from same device/account.
Cold-zone avoidance Do not show cold tags. Show only hot or neutral tags.
Heat manipulation destination_heat_score is a soft dispatch weight, not a financial payment. The benefit of gaming is small.
Artificial demand spikes Use max_age_minutes and window_minutes so stale or bursty fake requests decay quickly.

---

Final hard-second-pass verdict

1. Pickup dead-mileage: Price into rider fare, but quote from a quantile of nearby drivers, not just the nearest driver. Use a free radius, per-km fee, double cap, and re-quote threshold.
2. Destination lucrativeness: Never in the rider fare. Use only as a soft dispatch weight and positive driver-facing demand tag. No cash credits, no negative tags, no platform-funded incentives.
3. All thresholds are configurable and may vary by city and vehicle category.
4. Gaming is controlled by reference-distance locking, quantile quoting, anti-fraud on demand heat, and positive-only driver signals.