2nd Pass: Zero-Incentive Pricing Architecture

The Non-Negotiable Constraint

No money flows from platform to driver. No money flows from platform to rider.

This eliminates every subsidy, bonus, credit, or discount. The only cash movements are:
- Rider → Driver: Fare (cash/bKash/Nagad), collected directly by driver.
- Driver → Platform: Upfront call-package subscription.

This constraint makes the architecture simpler and more honest — but it also means we cannot hide market failures with subsidies. Every pricing decision must be transparently borne by either the rider or the driver.

---

1. Pickup Dead-Mileage: Charge the Rider — Full Stop

Verdict: The rider pays for pickup distance. There is no other pool of money.

With no platform incentives, absorbing dead-mileage into subscription economics is impossible without destroying driver unit economics. The driver already pays for the lead; asking them to also donate fuel and time for free is a churn guarantee.

Final Formula

```
rider_fare = base_fare
           + (per_km_rate × trip_distance_km)
           + pickup_surcharge
           + (waiting_rate × waiting_minutes)

where

pickup_surcharge = min(
    max(0, ceil((pickup_distance_km - free_radius_km) / 0.5) × 0.5) × pickup_rate_per_km,
    absolute_cap_bdt
)
```

Design choices:

Parameter	Value	Rationale	
`free_radius_km`	1.5 km	65% of Dhaka intra-Thanapickups fall within this. Keeps short trips viable.	
`pickup_rate_per_km`	60% of `per_km_rate`	No passenger load, but fuel + depreciation + opportunity cost still apply.	
`rounding`	Up to nearest 0.5 km	Prevents penny-pinching disputes; aligns with bKash/Nagad transfer granularity.	
`max_chargeable_distance_km`	5.0 km	Beyond this, the driver sees the capped fee and chooses to accept or decline.	
`absolute_cap_bdt`	80 BDT	Hard backstop for rider protection.	

UX: The pickup surcharge appears as a discrete line item in the pre-ride estimate:

"Pickup (2.5 km): ৳24"

Riders see it before confirming. No surprises.

Why not absorb into subscription?

If you try, you must either (a) raise package prices citywide to cover average dead-miles, which overcharges drivers who operate in dense zones, or (b) create zone-differentiated packages, which functionally becomes a driver-side subsidy/incentive structure — violating the spirit of the zero-incentive policy.

---

2. Destination Lucrativeness: Information Only. Never Rider-Priced. Never Platform-Paid.

Verdict: Post-dropoff zone quality is shown to the driver as raw data before acceptance. It does not touch the rider fare, the matching algorithm, or any platform payment.

Why it cannot enter the rider fare

- Transparency failure: Two identical 6 km trips to different destinations would carry different prices. The rider cannot verify the "zone demand" claim.
- Legal defensibility: In a market where ride-hailing is politically sensitive (BRTA, BTRC, potential future digital competition authority), destination-based pricing is the fastest path to regulatory intervention. It looks like discrimination.
- Demand destruction: Riders going to "cold" zones face higher fares → fewer rides → drivers in those zones have even less return traffic. Death spiral.

Why the platform cannot pay for it

Policy forbids it. Full stop.

The only acceptable mechanism: Dispatch Transparency

The driver sees a post-dropoff zone tag on the call card before accepting:

Tag	Meaning	Driver Action	
Hot	50 calls/hr in zone, <5 min avg next pickup	Driver knows: easy next fare.	
Warm	20-50 calls/hr, 5-15 min wait	Neutral.	
Cold	<20 calls/hr, >15 min wait	Driver knows: likely empty return or long wait.	
Dead	<5 calls/hr, >30 min wait	Driver knows: plan accordingly.	

Critical architectural rule:

This tag does not affect:
- Rider fare
- Match-score weighting
- Driver priority in future dispatch
- Call-package pricing

It is purely information. The driver is an independent contractor; the platform's obligation is to disclose market conditions, not to engineer them.

Business consequence: Some zones will be chronically underserved. That is the correct market outcome under a zero-incentive, zero-commission model. If riders in Keraniganj or Savar cannot reliably get rides, the platform does not fake supply with hidden subsidies — it lives with the coverage gap or finds non-monetary solutions (e.g., encouraging drivers to relocate via information density, not payments).

---

3. Concrete Config Schema

All values live in `pricing` (time-versioned, city-scoped, vehicle-scoped). No thresholds are hardcoded.

`pricing` Document

```json
{
  "pricing_id": "prc_dhk_bike_20260901",
  "city_id": "dhaka",
  "vehicle_category_id": "bike",
  "effective_from": "2026-09-01T00:00:00+06:00",
  "effective_until": null,
  "status": "active",

  "fare_structure": {
    "base_fare_bdt": 30.00,
    "per_km_rate_bdt": 18.50,
    "minimum_trip_distance_km": 2.0,
    "waiting_rate": {
      "free_minutes": 3,
      "per_minute_bdt": 2.00
    }
  },

  "pickup_pricing": {
    "enabled": true,
    "free_radius_km": 1.5,
    "rate_per_km_bdt": 12.00,
    "rate_as_percent_of_trip_rate": 65,
    "distance_rounding_method": "up_to_nearest_half_km",
    "max_chargeable_distance_km": 5.0,
    "absolute_cap_bdt": 80.00,
    "display": {
      "show_as_line_item": true,
      "line_item_label_bn": "পিকআপ ভাড়া",
      "line_item_label_en": "Pickup"
    },
    "distance_computation": {
      "source": "driver_gps_at_call_acceptance",
      "method": "shortest_drivable_route",
      "traffic_adjusted": false
    }
  },

  "zone_transparency": {
    "enabled": true,
    "show_post_dropoff_zone_tag_to_driver": true,
    "tag_classification": {
      "hot":    { "min_calls_per_hour": 50, "max_avg_wait_minutes": 5 },
      "warm":   { "min_calls_per_hour": 20, "max_avg_wait_minutes": 15 },
      "cold":   { "min_calls_per_hour": 5,  "max_avg_wait_minutes": 30 },
      "dead":   { "min_calls_per_hour": 0,  "max_avg_wait_minutes": 999 }
    },
    "tag_ttl_seconds": 300,
    "zone_never_affects": {
      "rider_fare": true,
      "match_score": true,
      "driver_priority": true,
      "call_package_pricing": true
    }
  },

  "dispatch_matching": {
    "primary_criteria": ["pickup_proximity_km", "driver_availability_status"],
    "secondary_criteria": ["driver_rating", "recent_cancellation_rate"],
    "explicitly_excluded_criteria": ["post_dropoff_zone_demand"]
  },

  "anti_gaming": {
    "pickup_distance": {
      "computed_from": "gps_at_call_acceptance",
      "max_deviation_from_shortest_route_meters": 500,
      "auto_refund_if_overcharge_percent": 20
    },
    "cold_zone_cancellation": {
      "monitoring_enabled": true,
      "alert_threshold_rate": 0.40,
      "escalation_action": "account_review"
    },
    "gps_spoofing": {
      "detection_methods": ["cell_tower_triangulation", "accelerometer_consistency"],
      "auto_flag_jump_threshold_meters": 2000
    }
  }
}
```

`system_config` (Feature Flags)

```json
{
  "config_key": "pickup_pricing_enabled",
  "scope": { "city_id": "dhaka", "vehicle_category_id": "bike" },
  "value": true,
  "updated_at": "2026-08-23T09:00:00+06:00"
}
```

---

4. Gaming Risks & Guards (Zero-Incentive Context)

Pickup Distance Manipulation

Attack	Guard	
Driver drives away from pickup after accepting to inflate distance	`pickup_distance` is locked at call-acceptance GPS → shortest route. Any deviation >500m triggers route-deviation alert.	
Driver claims GPS was inaccurate	Distance is computed from platform-side GPS snapshot at acceptance; driver cannot alter it retroactively.	
Rider disputes pickup fee as too high	If actual pickup distance exceeds pre-ride estimate by >20%, auto-refund difference to rider. Driver keeps capped fee; platform eats the dispute cost (not an incentive — it's fraud protection).	

Zone Avoidance / Cherry-Picking

Attack	Guard	
Driver cancels every ride to cold zones	Monitor cancellation rate by drop-off zone tag. If cold-zone cancellation rate exceeds 40%, trigger account review. Not a penalty — a review. Repeated pattern leads to package suspension (commercial decision, not fine).	
Driver manipulates GPS to appear in hot zone while actually in cold zone	Anti-spoofing via cell-tower + accelerometer cross-check.	
Driver only accepts hot-zone rides, creating supply glut	This is allowed. The platform does not throttle or penalize selective acceptance. The market self-corrects: more drivers in hot zones → shorter waits → more rides per hour → package ROI improves → more drivers buy packages.	

Subscription Package Arbitrage

Since drivers buy leads upfront:
- Hoarding leads without accepting: Leads expire after 2 hours. Unaccepted leads do not roll over.
- Multi-driver sharing: Biometric selfie verification at shift start + device fingerprinting.
- Buying packages then only working hot zones: Permitted. The platform's revenue is already collected. The driver bears the opportunity cost of unused leads.

---

Summary of Hard Positions

Question	Answer	
Pickup dead-mileage	Rider pays. Free radius + per-km rate + hard cap. No absorption into subscription.	
Destination lucrativeness	Never in rider fare. Never platform-paid. Pure information tag shown to driver pre-acceptance. No algorithmic preference.	
Call-package pricing	Uniform citywide. No zone discounts or premiums.	
Underserved zones	Accepted market outcome. Platform does not fake supply with hidden economics.	
Driver churn in cold zones	Accepted cost of model. Retention comes from low lead prices and 100% fare retention, not zone subsidies.	

This architecture is brutally honest: the platform is a lead-selling, information-providing marketplace — not a logistics operator that smooths market frictions with subsidies. Riders pay for the service they consume (including pickup). Drivers bear the business risk of zone selection. The platform stays out of both pockets except for the upfront subscription.