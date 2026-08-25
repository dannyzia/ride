Let’s tear down the first approach. I gave you a standard ride-hailing playbook, but it has a fatal flaw for the Dhaka market: charging the rider for the driver’s pickup distance is a conversion killer.
If a user in Lalmatia requests a ride and sees a 40 BDT "driver travel fee" tacked on before they even get in the car, they will immediately switch to Pathao or inDrive. Riders expect to pay for their journey, point A to point B.
Since you have a strict zero-cash-incentive policy, your platform only has one currency to manipulate: The Lead (Call Package).
Here is the hard 2nd pass. We keep the rider fare purely distance/time-based, and we solve both problems entirely through a Dynamic Lead Pricing Engine.
The Paradigm Shift: The "Lead" is a Dynamic Currency
Instead of every ride costing the driver exactly 1.0 lead, the platform dynamically prices the cost of the lead based on the undesirability of the trip. You aren't paying the driver an incentive; you are discounting your software fee.
1. Pickup Dead-Mileage: The Lead Rebate
Recommendation: The rider pays standard fare. The driver is compensated for a long pickup via a discounted lead cost.
If a driver is 3 km away, they won't accept a standard fare if it costs them a full lead. But if you make that lead free (0.0 cost) or discounted (0.5 cost), the math flips. The driver evaluates: "Long pickup, but I keep 100% of the cash and it doesn't cost me a package credit. I'll take it."
 * Rule: For every X km beyond the standard pickup radius, reduce the lead cost.
 * Voluntary Rider Bump: If a rider is in a massive hurry and no one is accepting the ping, allow a UI toggle: "Priority Match: Add 50 BDT to Base Fare." This goes 100% to the driver and immediately expands the matching radius.
2. Destination Lucrativeness: Hot/Cold Zone Modifiers
Recommendation: Destination heat belongs exclusively in the platform's lead-pricing logic. Never dynamically charge the rider based on the heatmap.
If a driver drops a rider off right here in Purbachal (a notoriously cold zone for return trips), they face dead miles going back to the city. If they accept a trip to a cold zone, you discount the lead. If they accept a highly lucrative trip (e.g., Gulshan to Airport during peak hours), you charge a premium lead cost.
 * Cold Drop-off: Costs the driver 0.2 to 0.5 leads.
 * Neutral Drop-off: Costs 1.0 leads.
 * Hot to Hot Drop-off: Costs 1.2 to 1.5 leads (premium lead).
The Only Exception (Static Surcharge):
You still need a static, geofenced Out-of-Bounds Surcharge priced directly into the rider fare for extreme dead zones (e.g., deep Savar or Keraniganj). This isn't dynamic surge pricing; it's a transparent, flat "Return Toll" that locals already negotiate manually as khaali gari ferot.
3. The lead_yield_engine Config Schema
This configuration should live in your database as a JSON column or a dedicated table suite, easily cacheable in Redis for rapid dispatch evaluation.
{
  "pricing_config": {
    "city_id": "BD-DAC",
    "vehicle_class": "MOTO",
    
    "rider_fare_rules": {
      "base_fare": 40.00,
      "per_km_rate": 12.00,
      "waiting_rate_per_min": 2.00,
      "priority_match_bump_amount": 50.00,
      "out_of_bounds_geofences": [
        {
          "zone_id": "PURBACHAL_EXT",
          "flat_surcharge": 100.00
        }
      ]
    },
    
    "driver_lead_pricing_rules": {
      "base_lead_cost": 1.0,
      
      "pickup_modifiers": {
        "free_radius_km": 1.5,
        "lead_discount_per_extra_km": 0.2,
        "min_lead_cost_floor": 0.0
      },
      
      "destination_modifiers": {
        "cold_zone_dropoff_multiplier": 0.5,
        "hot_zone_dropoff_multiplier": 1.5,
        "neutral_zone_dropoff_multiplier": 1.0
      }
    }
  }
}

The Live Calculation at Dispatch:
Final_Lead_Cost = (Base_Lead_Cost - Pickup_Discount) * Destination_Multiplier
4. Hard Guardrails Against Gaming
When leads are dynamically priced, malicious drivers will try to "farm" cheap leads while maximizing cash fares.
Risk 1: The "Fake Cold Zone" Drop-off
 * The Exploit: A driver and rider agree to manually enter a cold zone (like Bosila) as the destination to get the discounted 0.5 lead cost, but the driver actually drops the rider off in Dhanmondi (Hot Zone) for the cash.
 * The Guardrail: The backend must evaluate the GPS coordinates at the moment the driver swipes "Complete Ride." If the actual drop-off coordinate is > 1km from the requested cold-zone destination, the system retroactively recalculates and deducts the full 1.0 (or 1.5) lead cost from the driver's wallet.
Risk 2: GPS Spoofing for Pickup Discounts
 * The Exploit: Drivers use mock location apps to place themselves 4 km away from a rider to trigger a 0.0 lead cost, then immediately "teleport" to the actual pickup spot.
 * The Guardrail: Implement strict telemetry checks. If the Time-to-Pickup is physically impossible based on routing APIs (e.g., covering 4 km of Dhaka traffic in 45 seconds), flag the account, charge the maximum lead cost, and shadowban the device from receiving requests for 30 minutes.
Risk 3: Cherry-Picking Paralysis
 * The Exploit: Drivers ignore all 1.5-cost leads, waiting exclusively for 0.0-cost leads.
 * The Guardrail: Do not show the exact lead cost on the ping card. Show a generalized visual tag: "🔥 Premium Route" or "❄️ Low Cost Lead." If they let 3 consecutive pings expire, bump them to the back of the dispatch queue for 10 minutes.
The first implementation had four critical production flaws:
 * It wasn't double-entry: A single table with signed amounts is just an audit log. True double-entry mandates moving value between two explicit system accounts (e.g., DRIVER_AVAILABLE \rightarrow DRIVER_HELD \rightarrow PLATFORM_REVENUE).
 * Immediate deduction creates ledger churn: Deducting on acceptance and refunding on cancellation creates massive database noise given Dhaka's high cancellation rates before pickup.
 * Ignored Package Expiration (FIFO): Leads are rarely homogenous; drivers buy timed packages (e.g., "50 leads valid for 7 days"). You must consume leads from the oldest active lot first.
 * No Idempotency Protection: Over unreliable 4G/5G connections in Dhaka, driver app retries will cause double deductions if network packets duplicate.
Here is the hardened, production-ready ledger architecture using a Reserve \rightarrow Settle (Auth/Capture) pattern with lot-based FIFO tracking.
1. Database Schema (Double-Entry + Lead Lots)
-- Enums for state machine and accounting
CREATE TYPE lead_lot_status AS ENUM ('ACTIVE', 'EXPIRED', 'EXHAUSTED');
CREATE TYPE hold_status AS ENUM ('PENDING', 'SETTLED', 'RELEASED', 'ADJUSTED');
CREATE TYPE account_type AS ENUM ('DRIVER_UNRESERVED', 'DRIVER_RESERVED', 'SYSTEM_REVENUE', 'SYSTEM_EXPIRATION');

-- 1. Lead Packages (Lots) - Handles FIFO and Expiration
CREATE TABLE lead_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL,
    initial_leads DECIMAL(10,4) NOT NULL CHECK (initial_leads > 0),
    remaining_leads DECIMAL(10,4) NOT NULL CHECK (remaining_leads >= 0),
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    status lead_lot_status NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT chk_remaining_le_initial CHECK (remaining_leads <= initial_leads)
);
CREATE INDEX idx_lots_fifo ON lead_lots (driver_id, expires_at ASC) WHERE status = 'ACTIVE';

-- 2. Holds Table (Auth-Capture State Machine for Active Rides)
CREATE TABLE lead_holds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_id UUID NOT NULL UNIQUE,
    driver_id UUID NOT NULL,
    held_amount DECIMAL(10,4) NOT NULL CHECK (held_amount > 0),
    status hold_status NOT NULL DEFAULT 'PENDING',
    idempotency_key VARCHAR(128) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Double-Entry Immutable Ledger
CREATE TABLE double_entry_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tx_group_id UUID NOT NULL, -- Groups debit/credit entries together
    ride_id UUID,
    from_account_type account_type NOT NULL,
    from_account_id UUID, -- NULL for system accounts, driver_id for driver accounts
    to_account_type account_type NOT NULL,
    to_account_id UUID,
    amount DECIMAL(10,4) NOT NULL CHECK (amount > 0),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ledger_driver_history ON double_entry_ledger (from_account_id, created_at DESC);

2. The Transaction Engine
Step A: Reserve / Hold on Ride Acceptance (Idempotent)
When a ride is accepted, do not burn the lead to revenue yet. Place a temporary hold on the driver’s balance, pulling from the oldest active package (FIFO).
CREATE OR REPLACE FUNCTION reserve_ride_lead(
    p_driver_id UUID,
    p_ride_id UUID,
    p_estimated_lead_cost DECIMAL(10,4),
    p_idempotency_key VARCHAR(128)
) RETURNS BOOLEAN AS $$
DECLARE
    v_lot RECORD;
    v_needed DECIMAL(10,4) := p_estimated_lead_cost;
    v_deduct DECIMAL(10,4);
    v_tx_group UUID := gen_random_uuid();
BEGIN
    -- Idempotency Guard: Return true if this exact request already succeeded
    IF EXISTS (SELECT 1 FROM lead_holds WHERE idempotency_key = p_idempotency_key) THEN
        RETURN TRUE;
    END IF;

    -- Create Hold Record
    INSERT INTO lead_holds (ride_id, driver_id, held_amount, idempotency_key)
    VALUES (p_ride_id, p_driver_id, p_estimated_lead_cost, p_idempotency_key);

    -- Loop through active lots in FIFO order (oldest expiration first)
    FOR v_lot IN 
        SELECT id, remaining_leads 
        FROM lead_lots 
        WHERE driver_id = p_driver_id 
          AND status = 'ACTIVE' 
          AND expires_at > NOW() 
        ORDER BY expires_at ASC 
        FOR UPDATE
    LOOP
        IF v_needed <= 0 THEN
            EXIT;
        END IF;

        v_deduct := LEAST(v_lot.remaining_leads, v_needed);

        UPDATE lead_lots 
        SET remaining_leads = remaining_leads - v_deduct,
            status = CASE WHEN (remaining_leads - v_deduct) = 0 THEN 'EXHAUSTED'::lead_lot_status ELSE 'ACTIVE'::lead_lot_status END
        WHERE id = v_lot.id;

        v_needed := v_needed - v_deduct;
    END LOOP;

    -- Insufficient active leads to cover the hold
    IF v_needed > 0 THEN
        RAISE EXCEPTION 'INSUFFICIENT_LEADS: Missing % leads', v_needed;
    END IF;

    -- Record Double-Entry: UNRESERVED -> RESERVED
    INSERT INTO double_entry_ledger (tx_group_id, ride_id, from_account_type, from_account_id, to_account_type, to_account_id, amount)
    VALUES (v_tx_group, p_ride_id, 'DRIVER_UNRESERVED', p_driver_id, 'DRIVER_RESERVED', p_driver_id, p_estimated_lead_cost);

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

Step B: Settle or Adjust at Drop-off (Anti-Gaming Execution)
When the ride finishes, convert the hold to revenue. If the driver dropped off in a different zone than claimed (e.g., gaming a cold zone), adjust the deduction dynamically.
CREATE OR REPLACE FUNCTION settle_ride_lead(
    p_ride_id UUID,
    p_actual_lead_cost DECIMAL(10,4)
) RETURNS BOOLEAN AS $$
DECLARE
    v_hold RECORD;
    v_tx_group UUID := gen_random_uuid();
    v_delta DECIMAL(10,4);
BEGIN
    SELECT * INTO v_hold FROM lead_holds WHERE ride_id = p_ride_id FOR UPDATE;

    IF v_hold.status != 'PENDING' THEN
        RAISE EXCEPTION 'INVALID_HOLD_STATE: Hold is %', v_hold.status;
    END IF;

    IF p_actual_lead_cost = v_hold.held_amount THEN
        -- Standard Flow: Convert Hold to Revenue
        UPDATE lead_holds SET status = 'SETTLED', updated_at = NOW() WHERE id = v_hold.id;

        INSERT INTO double_entry_ledger (tx_group_id, ride_id, from_account_type, from_account_id, to_account_type, to_account_id, amount)
        VALUES (v_tx_group, p_ride_id, 'DRIVER_RESERVED', v_hold.driver_id, 'SYSTEM_REVENUE', NULL, v_hold.held_amount);

    ELSIF p_actual_lead_cost > v_hold.held_amount THEN
        -- Retroactive Adjustment: Driver owes MORE (e.g., Fake Cold Zone Gaming)
        v_delta := p_actual_lead_cost - v_hold.held_amount;
        
        UPDATE lead_holds SET status = 'ADJUSTED', updated_at = NOW() WHERE id = v_hold.id;

        -- 1. Settle original held amount to revenue
        INSERT INTO double_entry_ledger (tx_group_id, ride_id, from_account_type, from_account_id, to_account_type, to_account_id, amount)
        VALUES (v_tx_group, p_ride_id, 'DRIVER_RESERVED', v_hold.driver_id, 'SYSTEM_REVENUE', NULL, v_hold.held_amount);

        -- 2. Pull delta directly from UNRESERVED (Can push driver into overdraft)
        INSERT INTO double_entry_ledger (tx_group_id, ride_id, from_account_type, from_account_id, to_account_type, to_account_id, amount, metadata)
        VALUES (v_tx_group, p_ride_id, 'DRIVER_UNRESERVED', v_hold.driver_id, 'SYSTEM_REVENUE', NULL, v_delta, '{"reason": "LOCATION_GAMING_PENALTY"}'::jsonb);

    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

3. Failure Recoveries & Edge Cases
| Scenario | System Behavior |
|---|---|
| Rider Cancels mid-trip | Execute release_ride_lead(): Instantly transitions hold status to RELEASED and moves held leads from DRIVER_RESERVED back to DRIVER_UNRESERVED. The lot expiration timestamp remains original. |
| Network Retries (Flaky Connection) | The idempotency_key (hash of ride_id + driver_id + action) on the lead_holds table guarantees duplicate RPC calls exit cleanly without double-reserving. |
| Negative Lead Balance (Debts) | If a retroactive penalty exceeds available unreserved leads, DRIVER_UNRESERVED drops below zero. The platform blocks new ride offers until the driver buys a package that clears the deficit. |
| Package Expiration During Ride | Expiration is checked only at reservation time. If a lead is held at 2:59 PM from a package expiring at 3:00 PM, the hold remains valid for settlement at 3:30 PM. |

