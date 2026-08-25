This model lives or dies on driver unit economics. Rider pays driver directly, driver already paid you for the lead. If dead-mileage is uncompensated, you are selling him a loss-making lead. He will cancel, multi-app, and churn. 

Hard 2nd pass - opinionated fixes:

1. Pickup dead-mileage: MUST be in rider fare. Your 1st pass was too generous to rider.

Free radius of 1.5km in Dhaka is death for driver retention. In Moghbazar at 6pm, 1.5km = 25 mins + 0.4L fuel. You cannot ask driver to eat that when he already bought the lead.

Revised principle: Small free buffer for GPS noise, then rider pays for your approach. Hard cap to protect rider, hard dispatch limit to protect driver.

Final formula - lock at accept:
Snapshot at ACCEPT event - this is critical
driver_loc = driver.location_at_accept_time  # NOT live location
pickup_distance_routed = OSRM(driver_loc, rider_pin) # km
pickup_eta_min = OSRM_eta(driver_loc, rider_pin) # min

Dhaka needs distance + time, distance alone lies
free_radius_km = config.pickup.free_radius_km # 0.6-0.8km, not 1.5
free_eta_min = config.pickup.free_eta_min # e.g. 4 min

billable_km = min( max(0, pickup_distance_routed - free_radius_km), config.pickup.max_billable_km )
billable_min = max(0, pickup_eta_min - free_eta_min - billable_km * 3) # 3 min/km reference, excess is traffic

pickup_fee = (billable_km * per_km_rate * config.pickup.rate_multiplier_km) + (billable_min * waiting_rate * config.pickup.rate_multiplier_time)

total_fare = base_fare + (per_km_rate * trip_distance_km) + (waiting_rate * trip_waiting_min) + pickup_fee
Display as: Fare 120 TK + Pickup 1.8km/7min 22 TK = 142 TK. Locked at accept. No recalculation at drop.

Capping logic - 3 levels:

free_radius_km [0.6km bike, 0.8km CNG/car] - absorbs GPS jitter. Data-driven: p30 of historical pickup distances in city/category.
max_billable_km [3.0km bike, 3.5km others] - max you can ever bill rider. p90 of pickups. If pickup is 5km, rider still only pays for 3km.
max_dispatch_km [5km bike, 6km car] - max you will ever match. If pickup_distance_routed > max_dispatch_km, do NOT dispatch. Expand search radius or show rider "No driver nearby, accept long pickup?". Requires rider explicit consent checkbox for max_dispatch - max_billable unpaid portion.

If rider cancels after driver has moved > 300m towards pickup, pickup_fee becomes cancellation fee owed to driver. Otherwise your package buyers get burned twice.

pickup.rate_multiplier_km should be 1.0, not 0.6. You were subsidizing rider at driver's expense. Empty bike still burns fuel and time. If you must discount for perception, do 0.8 minimum. Time multiplier 1.0.

2. Destination lucrativeness: HARD NO for rider fare.

Do not price it. Not as surcharge, not as discount, not as "return fee" inside city. 4 reasons under your constraints:

Fairness: Rider from Gulshan to Demra should not pay 40 TK extra because Demra is cold. He already paid distance.
Legally indefensible: BRTA tariff is distance-based. Destination-based penalty = destination discrimination. You cannot show rider verifiable proof that his destination is "cold" at 6:03pm. You CAN show a 2.3km pickup route on map.
Your no-incentive policy: If you charge rider extra for cold drop, where does money go? To driver? That's a rider-funded incentive, violates spirit. To platform? Then you're taking commission under different name, breaking 100% promise.
It doesn't work: Cold zones change in 20 mins. Today's cold is tomorrow's hot after a concert. You will price based on stale score.

Where it belongs - dispatch only, zero money:

Hotspot score is for matching priority, not pricing.
at ride request creation
drop_score = hotspot_map.get_score(drop_zone, prediction_window=20min) # 0.0 cold -> 1.0 hot

driver-facing tag - information only
tag = "High demand drop" if score > 0.7 else "Low demand - possible wait" if score < 0.3 else "Balanced"

dispatch ranking
Driver who JUST dropped in cold zone gets priority for next lead for 15 min
if driver.last_drop_score < 0.3 and now - driver.last_drop_time < 900:
    matching_boost = config.dispatch.cold_zone_queue_boost_weight # 1.5x
else:
    matching_boost = 1.0

If drop is cold, broadcast to wider radius, more drivers
broadcast_radius = base_radius + (config.dispatch.cold_zone_extra_radius_km if drop_score < 0.3 else 0)
One exception: out_of_coverage_return. If drop is OUTSIDE your Dhaka service polygon, that's not lucrativeness, that's operational. Then you CAN charge return to polygon edge:

return_fee = max(0, distance(drop, polygon_edge) ) * per_km_rate * 0.5 and show as "Out of area return allowance". Only outside polygon.

Package burn stays constant: 1 lead = 1 credit, regardless of drop score. If you make cold drops cheaper credits, that's an incentive.

3. Config schema - data-driven, versioned

Don't put this in env files. Table structure:
pricing_configs (
  city_id TEXT, -- 'dhaka'
  vehicle_category_id TEXT, -- 'bike', 'cng', 'car_ac'
  version INT,
  effective_from TIMESTAMPTZ,
  base_fare_bdt NUMERIC,
  per_km_rate_bdt NUMERIC,
  waiting_per_min_rate_bdt NUMERIC,
  pickup_config JSONB, -- {free_radius_km, free_eta_min, max_billable_km, max_dispatch_km, rate_multiplier_km, rate_multiplier_time, distance_method: 'osrm_routed', lock_at: 'accept'}
  dispatch_config JSONB, -- {cold_threshold:0.3, hot_threshold:0.7, cold_queue_boost_weight:1.5, boost_ttl_sec:900, cold_extra_radius_km:1.0}
  out_of_coverage_config JSONB, -- {enabled:true, max_return_km:10, return_multiplier:0.5}
  PRIMARY KEY (city_id, vehicle_category_id, version)
)

system_config (
  key TEXT, -- 'hotspot.score_method', 'osrm.profile'
  value JSONB
)
All thresholds loaded at runtime per city/category. No hardcoded numbers in code.

4. Gaming guards - this will be abused on day 1
| Attack | Detection | Fix |
| --- | --- | --- |
| Driver drives away after accept to inflate pickup_distance | Compare live distance vs locked distance | Lock pickup_distance_routed at accept snapshot. Never use live. Log actual_traveled_to_pickup for audit, but don't bill it. |
| Mock GPS / location spoof | FusedLocationProvider.isMock, jump > 2km in 10sec, OSRM route / haversine ratio > 2.0 | Reject accept, require high-accuracy, flag account. |
| Rider pin to reduce fee then "come 500m inside" | pin_move_after_accept > 150m or rider requests correction call | Auto-add correction distance at full rate + waiting after arrival. Show in fare. |
| Driver cancels cold drops selectively | cold_zone_cancel_rate vs hot_zone_cancel_rate | If ratio > 2.0 over last 20 rides: -30% dispatch priority for 24h. No money penalty. Progressive. |
| Driver never accepts long pickup but toggle on | Track long_pickup_accept_rate | If driver has accept_long_pickup=false, never match beyond free+max_billable. Respect preference. |
Logging mandatory: store driver_loc_at_accept, pickup_routed_polyline, eta_at_accept, actual_pickup_travel_km, drop_score_at_request for every ride. You will need it for disputes when rider says "why 22 TK pickup?"

Implementation order for Dhaka:
Ship pickup fee with small free radius + caps + lock-at-accept. This cuts cancellation 30-40% instantly.
Ship destination tags + cold queue boost, no fare impact.
Measure: driver cancellation rate by pickup distance, rider acceptance rate of pickup fee, driver retention after 7 days in low-density zones.

If you invert it - make pickup free and destination paid - you will have cheap riders and no drivers in Mirpur and Jatrabari.