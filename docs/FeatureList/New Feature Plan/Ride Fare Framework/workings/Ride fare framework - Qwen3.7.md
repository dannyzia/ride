Here is a hard 2nd pass. 

In the first pass, I made two critical errors based on the realities of Dhaka and a strict interpretation of your "no incentives" policy:
1. **Distance vs. Time:** Pricing pickup dead-mileage by *distance* in Dhaka is a death sentence for driver retention. In areas like Gulshan or Banani during rush hour, 1.5 km can take 25 minutes. Drivers will reject these rides instantly. We must price by **estimated time**.
2. **The "No Incentives" Trap:** I previously suggested discounting lead-credits for dead-zone rides. **Correction:** Discounting a lead cost is mathematically identical to a financial incentive. It reduces the driver's operational cost. Since your policy strictly forbids incentives, lead costs must be uniform. We must solve destination lucrativeness purely through dispatch logic, not pricing.

Here is the corrected, ruthless recommendation.

---

### 1. Pickup Dead-Mileage: Time-Based Upfront Pricing
You must price this into the rider fare, but you must shift from distance to **time**, and it must be calculated **pre-booking** so the rider sees an exact upfront fare.

**The Exact Formula:**
```text
est_pickup_time = routing_api_time(current_driver_location, pickup_pin)

pickup_fare = min( 
    max(0, (est_pickup_time_mins - free_time_mins)) * pickup_per_min_rate, 
    max_pickup_charge_taka 
)

total_upfront_fare = base_fare + pickup_fare + (per_km_rate * est_ride_distance_km) + est_waiting_taka
```

**Key Mechanics:**
*   **Free Time (`free_time_mins`):** Set to **5 minutes**. This accounts for the driver's immediate local movement and the rider's inherent understanding that a 5-minute wait is standard.
*   **Rate (`pickup_per_min_rate`):** Set to **1.5x the per-minute equivalent of the active ride rate**. Because the driver is navigating Dhaka traffic without a passenger, their opportunity cost and fuel burn in idle traffic are higher. 
*   **Capping (`max_pickup_charge_taka`):** Cap at **45 Taka**. If the estimated pickup time is 30 minutes, the rider only pays for the capped amount. The driver will see the capped payout and naturally reject the lead if it's not worth their time.
*   **Pre-Booking Lock:** The system calculates this *before* the rider confirms the booking. The fare is locked. If traffic worsens between booking and pickup, the platform absorbs the difference (this is the cost of doing business and providing a premium upfront pricing UX).

### 2. Destination Lucrativeness: Zero Pricing, Pure Dispatch Logic
**Do not price it. Do not discount lead costs.** Since you cannot offer financial incentives, you must offer **operational control** to the driver.

**How to handle it without incentives:**
1.  **Driver Destination Filters (The Control Lever):** Add a "Heading To" toggle in the driver app. A driver can select a specific zone (e.g., "Heading to Uttara"). The dispatch algorithm will *only* show them leads dropping off in or near Uttara. The driver accepts lower lead volume in exchange for guaranteed destination lucrativeness. This is a feature, not a financial incentive.
2.  **Return-Trip Matching Weight (The Logic Lever):** Use your live hotspot map. If a driver drops a rider in a dead zone, the dispatch algorithm heavily prioritizes assigning them their *next* lead from a nearby hot zone, effectively creating a "virtual return trip." 
3.  **Lead Expiration (The Economic Lever):** Dead-zone rides simply take longer to be accepted. The lead remains in the pool. If a driver doesn't want it, they ignore it. The platform doesn't lose money; the lead just expires or is eventually accepted by a driver who actually lives in that dead zone and is starting their shift.

### 3. Revised System Configuration Schema
Notice the removal of lead-cost multipliers to strictly comply with the "no incentives" rule, and the shift to time-based pickup metrics.

```json
{
  "pricing_config": {
    "base_fare_taka": 50.0,
    "per_km_rate_taka": 15.0,
    "waiting_rate_per_min_taka": 3.0,
    
    "pickup_dead_mileage": {
      "enabled": true,
      "free_time_mins": 5.0,
      "pickup_per_min_rate_taka": 4.5, 
      "max_pickup_charge_taka": 45.0,
      "pre_booking_estimation_enabled": true
    }
  },
  
  "lead_economics_config": {
    "base_lead_cost_credits": 1.0,
    "lead_expiration_timeout_mins": 15.0
  },

  "dispatch_config": {
    "driver_destination_filters": {
      "enabled": true,
      "max_active_filters_per_driver": 2,
      "filter_radius_km": 2.0
    },
    "return_trip_matching": {
      "enabled": true,
      "hotspot_demand_threshold": 5.0,
      "return_trip_score_multiplier": 2.5
    }
  }
}
```

### 4. Advanced Gaming & Collusion Defenses
In Pass 1, I focused on GPS spoofing. In Dhaka, the bigger risk is **physical collusion** and **meter tampering**.

**Risk 1: The "Phantom Pickup" (Rider/Driver Collusion)**
*   *The Scam:* Rider pins pickup in a high-demand zone. Driver is actually 5 km away in a dead zone. Driver accepts, drives to the hot zone just to cross the GPS boundary, and then turns around to pick up the rider. The rider pays a low pickup fee, and the driver gets a "hot zone" lead.
*   *The Guard:* **Strict Geofenced Ride Start.** The fare calculation and "ride time" *only* trigger when the driver's GPS enters a strict 50-meter radius of the *actual* pickup pin. Time and distance spent outside this geofence are entirely unpaid and do not count toward the rider's fare.

**Risk 2: Early Meter Start (Waiting Time Fraud)**
*   *The Scam:* Driver arrives at the pickup point but the rider is 3 minutes late getting downstairs. The driver taps "Start Ride" immediately to rack up waiting time or distance while the rider is still walking out.
*   *The Guard:* **Dual-Verification Start.** The driver cannot start the fare alone. The driver taps "Arrived". The ride *only* officially starts when the rider opens their app and taps "Driver is Here", OR enters a 4-digit OTP displayed on the driver's screen. 

**Risk 3: Filter Abuse (Destination Filter Gaming)**
*   *The Scam:* Driver sets "Heading To" a massive zone that covers half the city, effectively bypassing the restriction and accepting all rides while claiming they are filtering.
*   *The Guard:* **Dynamic Zone Sizing.** The "Heading To" zones in the config are not fixed city wards. They are dynamically sized hex-grids based on current traffic and density. If a driver selects a zone, the system calculates the actual drive time to the center of that hex. If the zone is too large or the drive time exceeds a threshold (e.g., 45 mins), the system rejects the filter selection.