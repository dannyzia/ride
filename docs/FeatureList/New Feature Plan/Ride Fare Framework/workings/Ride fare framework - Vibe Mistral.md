# Hard 2nd Pass: Dhaka Ride‑Hailing Pricing & Incentives

---

## 🔥 Core Judgment (Unchanged, but Sharpened)

| Problem | Decision | Rationale |
|---------|----------|-----------|
| **Pickup dead‑mileage** | **Price into rider fare** | Drivers incur a real, measurable cost; riders must cover it. Platform takes no cut, so rider→driver is the only clean path. |
| **Destination lucrativeness** | **Never price into rider fare** | Pricing post‑ride opportunity into the fare is legally indefensible and unfair to riders. Use dispatch/matching instead. |
| **Revenue model** | **No change** | Platform earns only from call packages; fares are 100 % rider→driver. |

---

---

## 1️⃣ Pickup Dead‑Mileage: Production‑Grade Formula

### The Problem with the 1st Pass
- Used **distance only**, but in Dhaka, **time** often dominates cost (traffic).
- Free radius and caps were not **mutually consistent** (km cap vs. BDT cap).
- Did not specify **how/when driver location is locked**.

---

### Revised Formula (Dhaka‑Optimized)

Let
- `d_pickup` = **road‑network distance** (km) from driver’s **GPS lock at offer time** to pickup point.
- `t_pickup` = **road‑network time** (minutes) for the same path.
- `r_free_dist` = `dead_mileage_free_radius_km` (config, e.g., `1.0` km).
- `r_free_time` = `dead_mileage_free_time_min` (config, e.g., `5` min).
- `r_dist` = `dead_mileage_rate_per_km` (config, e.g., `15` BDT/km).
- `r_time` = `dead_mileage_time_rate_per_min` (config, e.g., `0.5` BDT/min).
- `f_max` = `dead_mileage_max_fee` (config, e.g., `100` BDT).

Then
```
# Distance component
chargeable_dist = max(0, d_pickup – r_free_dist)
fee_dist = chargeable_dist × r_dist

# Time component (for Dhaka traffic)
chargeable_time = max(0, t_pickup – r_free_time)
fee_time = chargeable_time × r_time

# Total dead-mileage fee (capped)
dead_mileage_fee = min(f_max, fee_dist + fee_time)
```

**Total rider fare:**
```
base_fare
+ per_km_rate × ride_distance_km
+ waiting_rate × waiting_minutes
+ dead_mileage_fee
```

### Why This Works for Dhaka
| Feature | Benefit |
|---------|---------|
| **Distance + time** | Captures both fuel and time costs in congested Dhaka. |
| **Free radius (distance) + free time** | Avoids nickel‑and‑diming for short/quick pickups. |
| **Single monetary cap (`f_max`)** | Simple for riders to understand; prevents sticker shock. |
| **Location locked at offer time** | Prevents gaming (drivers can’t move to inflate distance). |

### Edge Cases Handled
| Scenario | Rule |
|----------|------|
| Driver moves after offer | Use **offer‑time location**; if driver moves >200 m before acceptance, auto‑cancel. |
| GPS drift | Tolerance of ±50 m; use median of last 3 pings at offer time. |
| No road data | Fall back to Haversine distance with a 1.3× correction factor (Dhaka average detour). |
| Ride canceled before pickup | `dead_mileage_fee` is **not charged** (driver didn’t incur cost). |

---

---

## 2️⃣ Destination Lucrativeness: Why It **Must** Stay Out of Rider Fare

### The 1st Pass Was Right, but the Justification Was Weak
Pricing destination lucrativeness into the rider fare fails **three non‑negotiable tests**:

| Test | Outcome | Risk |
|------|---------|------|
| **Rider fairness** | ❌ Fails | Rider pays for driver’s *future* opportunity, not their own service. |
| **Legal defensibility** | ❌ Fails | Hard to justify different prices for identical distance/time based on destination. Regulators in BD may treat this as unfair discrimination. |
| **Platform revenue** | ❌ Irrelevant | Platform earns from call packages, not fares. No need to extract more from riders. |

### What to Do Instead (No Incentives, Per Policy)
| Lever | Implementation | Driver Benefit |
|-------|----------------|----------------|
| **Information** | Show **destination score (0–100)** on ride card. | Drivers can make informed choices. |
| **Matching weight** | Boost score for rides ending in **hot zones** for drivers currently in **cold zones**. | Balances supply; improves driver earnings. |
| **No rider price change** | Destination score **never** affects fare. | Preserves fairness and legality. |

### Concrete Matching Logic
```
ride_score =
  w_proximity × (1 / pickup_distance)
+ w_acceptance × driver_acceptance_rate
+ w_destination × destination_lucrativeness_score
+ w_balance × (1 – current_zone_supply_ratio)
```
- `w_destination` is configurable (e.g., `0.2`).
- **No rider sees or pays for this.**

---

---

## 3️⃣ Configuration Schema: Production‑Ready

### Principles
1. **All thresholds are data‑driven** (never hardcoded).
2. **Keyed by `(city, vehicle_category)`** (e.g., `Dhaka/sedan`, `Dhaka/bike`).
3. **Versioned** (audit trail for changes).
4. **Validated** (e.g., `dead_mileage_rate_per_km ≤ per_km_rate`).

---

### A. `pricing_config` (or `pricing` in JSON)
| Field | Type | Example | Validation |
|-------|------|---------|------------|
| `city` | string | `"Dhaka"` | Required |
| `vehicle_category` | string | `"sedan"` | Required |
| `base_fare` | decimal | `50.00` | ≥ 0 |
| `per_km_rate` | decimal | `20.00` | ≥ 0 |
| `waiting_rate_per_min` | decimal | `1.00` | ≥ 0 |
| `dead_mileage_free_radius_km` | decimal | `1.0` | ≥ 0 |
| `dead_mileage_free_time_min` | decimal | `5.0` | ≥ 0 |
| `dead_mileage_rate_per_km` | decimal | `15.00` | ≥ 0, ≤ `per_km_rate` |
| `dead_mileage_time_rate_per_min` | decimal | `0.50` | ≥ 0 |
| `dead_mileage_max_fee` | decimal | `100.00` | ≥ 0 |

**JSON Path:**
```json
{
  "pricing": {
    "Dhaka": {
      "sedan": {
        "base_fare": 50,
        "per_km_rate": 20,
        "waiting_rate_per_min": 1,
        "dead_mileage": {
          "free_radius_km": 1.0,
          "free_time_min": 5.0,
          "rate_per_km": 15,
          "time_rate_per_min": 0.5,
          "max_fee": 100
        }
      }
    }
  }
}
```

---

### B. `dispatch_config` (or `dispatch` in JSON)
| Field | Type | Example | Validation |
|-------|------|---------|------------|
| `city` | string | `"Dhaka"` | Required |
| `vehicle_category` | string | `"sedan"` | Required |
| `destination_lucrativeness_enabled` | boolean | `true` | - |
| `hotspot_call_density_threshold` | decimal | `0.5` | ≥ 0 |
| `destination_score_weight` | decimal | `0.2` | 0–1 |
| `max_rejection_rate` | decimal | `0.20` | 0–1 |
| `rejection_rate_window_hours` | integer | `24` | ≥ 1 |
| `driver_movement_threshold_m` | integer | `200` | ≥ 0 |

**JSON Path:**
```json
{
  "dispatch": {
    "Dhaka": {
      "sedan": {
        "destination_lucrativeness": {
          "enabled": true,
          "hotspot_threshold": 0.5,
          "score_weight": 0.2
        },
        "rejection_policy": {
          "max_rejection_rate": 0.2,
          "window_hours": 24,
          "driver_movement_threshold_m": 200
        }
      }
    }
  }
}
```

---

---

## 4️⃣ Anti‑Gaming: Dhaka‑Specific Defenses

### 🚨 Risk 1: Inflating Pickup Distance
**Attack:** Driver moves away after ride offer to increase `d_pickup`.

**Defenses:**
1. **Lock location at offer time**: Use GPS ping timestamped at ride offer.
2. **Movement threshold**: If driver moves > `driver_movement_threshold_m` (200 m) before acceptance, **auto‑cancel** the ride.
3. **GPS drift tolerance**: ±50 m (use median of last 3 pings).
4. **Road‑network distance**: Use OSRM (not straight‑line) to prevent "zig‑zag" gaming.

**Edge Case:** Driver is moving when offer arrives.
- Use **first GPS ping after offer** (within 5 sec) as locked location.

---

### 🚨 Risk 2: Cherry‑Picking Hot Destinations
**Attack:** Drivers reject rides ending in cold zones.

**Defenses:**
1. **No destination filtering**: Drivers cannot filter by destination score; they only see it as info.
2. **Matching boost**: Rides to hot zones get a **score boost** for drivers in cold zones.
3. **Rejection penalty**:
   - Calculate rejection rate over rolling `window_hours`.
   - If rate > `max_rejection_rate`, **throttle leads by 50 %** for 1 hour.
   - **Not a payment** (per policy), so allowed.

---

### 🚨 Risk 3: Hotspot Map Manipulation
**Attack:** Drivers create fake rider accounts to inflate call density in a zone.

**Defenses:**
1. **Rider verification**: Require **phone OTP** for all rider accounts.
2. **Request filtering**:
   - Exclude requests from unverified accounts.
   - Exclude requests canceled within **10 seconds** (likely fake).
3. **Anomaly detection**:
   - Flag accounts with >10 requests/hour.
   - Flag zones with sudden density spikes (e.g., 5× normal).
4. **Decaying average**: Use a **5‑minute half‑life** for hotspot calculations to dampen spikes.

---
### 🚨 Risk 4: Collusive Driver Rings
**Attack:** Drivers share leads or rotate acceptances to game the system.

**Defenses:**
1. **Randomized matching**: Add **random jitter** (±10 %) to ride scores to break ties.
2. **Behavioral monitoring**:
   - Track acceptance patterns per driver cohort.
   - Flag drivers with **identical acceptance/rejection sequences**.
3. **Rate limiting**: Limit leads to **1 per driver per 30 seconds** in high‑demand zones.

---

---

## 5️⃣ Legal & UX: Making It Defensible and Usable

### Legal (Bangladesh Context)
| Requirement | Compliance |
|-------------|------------|
| **Transparency** | All fare components (including dead‑mileage) are shown in **pre‑ride estimate** and **post‑ride receipt**. |
| **Non‑discrimination** | Same fare for same `d_pickup`, `ride_distance`, `waiting_time` regardless of rider identity. |
| **Reasonableness** | Dead‑mileage fee is **cost‑based** (driver’s actual cost to reach pickup). |
| **No hidden fees** | Dead‑mileage is a **separate line item** in the fare breakdown. |

### Rider UX
- **Pre‑ride estimate**:
  ```
  Base fare: 50 BDT
  Distance: 20 BDT/km × 5 km = 100 BDT
  Waiting: 1 BDT/min × 0 min = 0 BDT
  Pickup fee: 15 BDT/km × (2.5 km – 1 km) = 22.5 BDT
  Estimated total: 172.5 BDT
  ```
- **Explanation**: "Pickup fee covers the driver’s cost to reach you."

### Driver UX
- **Ride card**:
  ```
  Pickup: 2.5 km (22.5 BDT fee)
  Destination: Mirpur (Score: 85/100 – Hot!)
  Estimated time to pickup: 8 min
  ```
- **No surprises**: All fees and scores are visible **before acceptance**.

---

---
---
## 🎯 Final Checklist (Ship This)

| Item | Action |
|------|--------|
| ✅ **Pickup dead‑mileage** | Add `dead_mileage_fee` to fare with **distance + time**, free radius/time, and monetary cap. |
| ✅ **Destination lucrativeness** | Show score to drivers; use in matching; **never in fare**. |
| ✅ **Config** | Store all thresholds in `pricing_config` and `dispatch_config` keyed by `(city, vehicle_category)`. |
| ✅ **Anti‑gaming** | Lock location at offer time; enforce movement threshold; penalize high rejection rates. |
| ✅ **Legal/UX** | Disclose all fees upfront; ensure non‑discriminatory pricing. |

**Result**: Riders pay fairly for the service they receive, drivers are compensated for all costs, and the platform earns from call packages—**with zero incentives, zero escrow, and zero gaming loopholes**.