The first pass provided standard ride-hailing defaults, but it contained several critical assumptions that will break when tested against Dhaka’s ground realities—specifically traffic deadlocks, natural geographical barriers, and driver behavior under a zero-commission model.
Here is the deep, stress-tested re-evaluation of the Stage 2 open decisions.
1. Pickup Rate: The Dhaka Time-vs-Distance Trap
The Flaw in the 1st Pass
Recommending an 80%–100% per-km pickup rate assumes distance is the primary cost driver. In Dhaka, a 1.2 km pickup in Gulshan or Old Dhaka at 5:30 PM can easily take 22 minutes. A pure distance rate pays the driver almost nothing for that time, while a 4 km pickup on a clear 3:00 AM Purbachal Expressway trip over-charges the rider for an easy 4-minute drive.
The Recommendation
Pickup pricing must be a Hybrid Distance + Heavy-Traffic Time Floor, gated by a strict Rider Safety Cap.
 * Distance Component (P_{km}): Set at 70% of loaded trip rate.
 * Traffic Delay Floor (P_{min}): Triggers only when pickup speed drops below 8 km/h (gridlock). Pays the driver for wasted fuel and time during extreme jams.
 * The Guardrail: F_{pickup} is locked at acceptance based on live traffic routing predictions. The rider is never billed for live driver dawdling post-accept.
2. Destination Disclosure: Macro-Direction over Exact Address
The Flaw in the 1st Pass
Recommending full pre-accept destination address visibility will cause a systemic liquidity collapse in cold zones. Platforms like inDrive can show full destinations because riders can bid higher fares for bad locations. On a fixed-formula platform without surge, showing exact destination addresses pre-accept means drivers will reject 100% of trips to Mirpur 12, Old Dhaka, or Keraniganj.
The Recommendation
Do not reveal the exact drop-off pin pre-accept. Reveal a Macro-Zone Direction & Heat Tag Card.
┌────────────────────────────────────────────────────────┐
│  PULL REQUEST: Moto (1.1 km pickup)                    │
│                                                        │
│  Pickup: Dhanmondi 27                                  │
│  Destination: [North-West] Mirpur Area ❄️ (Cold Zone)  │
│  Est. Fare: ৳210 (100% Cash to You)                    │
└────────────────────────────────────────────────────────┘

 * Why this works: It answers the driver’s core question ("Am I heading into gridlock or towards my home area?") without giving them the pinpoint detail needed to cherry-pick down to the exact street block.
 * Post-Accept Unlock: The exact navigation pin unlocks immediately after the driver taps "Accept." If the driver cancels after seeing the exact pin, it costs them 1.0 "Decline Credit" from their hourly budget.
3. Free Radius & Bottleneck Detour Ratios
The Flaw in the 1st Pass
A uniform free radius (e.g., 1.5 km for cars) completely breaks down around Dhaka’s natural barriers: flyovers, U-turn loops, railway tracks, and lakes (e.g., Hatirjheel, Dhanmondi Lake). A driver standing 400 meters away across Hatirjheel might need to drive 3.8 km to reach the rider.
       [Driver Location]
             │
~~~~ HATIRJHEEL LAKE ~~~~~ (400m Euclidean distance)
             │
       [Rider Location]
             ▲
             └─ Actual Road Route: 3.8 km via Rampura U-Turn

The Recommendation
Incorporate a Routing Detour Ratio (RDR) into the free-radius calculation.
 * If \text{RDR} \le 2.0: Standard Category Free Radius applies.
 * If \text{RDR} > 2.0 (indicating a major flyover/lake detour barrier): Reduce the Free Radius by 50%.
Calibrated Category Defaults
| Parameter | Bike (Moto) | CNG (Three-Wheeler) | Car (Sedan/SUV) |
|---|---|---|---|
| Standard Free Radius (R_{free}) | 1.0 km | 1.2 km | 1.5 km |
| High Detour Free Radius (\text{RDR} > 2.0) | 0.5 km | 0.6 km | 0.75 km |
| Absolute Cap (F_{cap}) | ৳25 | ৳40 | ৳75 |
| Percentage Cap | 20% of base fare | 25% of base fare | 30% of base fare |
4. Re-Evaluating Lead Pricing: Product Tiering vs. Cash Incentive
Tearing Down the Stage 1 Consensus
The Stage 1 panel concluded that discounting lead costs for cold zones is an "incentive in disguise." This is an economic misconception.
In a wholesale business model, a lead to Gulshan at 5:00 PM is a high-value asset. A lead to a dead-end street in Bosila at 10:00 PM is a low-value asset. Charging the driver the exact same price (1.0 lead) for two vastly different asset values is not "neutrality"—it is overcharging for low-quality leads.
┌────────────────────────────────────────────────────────────────────────┐
│                        LEAD ASSET VALUATION                            │
├───────────────────────────────────┬────────────────────────────────────┤
│ Gulshan Drop-Off (Hot Zone)       │ Bosila Drop-Off (Cold Zone)        │
│ High likelihood of immediate fare │ Low likelihood of return fare      │
│ Market Value of Lead: HIGH        │ Market Value of Lead: LOW          │
│ Full Lead Price (1.0) = FAIR      │ Full Lead Price (1.0) = OVERCHARGE │
└───────────────────────────────────┴────────────────────────────────────┘

The Recommendation
Tier the wholesale price of the lead based on asset quality. This keeps the platform strictly zero-cash-incentive (you are never giving money to drivers) while maintaining network liquidity.
 * Standard Lead: 1.0 credit.
 * Cold-Zone Drop Lead: 0.5 credit (reflects the lower yield of the destination).
 * Deep Remote Drop Lead: 0.25 credit.
5. Staged Rollout & Operational Firewalls
Rollout Gates & Monsoon Protocols
Phase 1: Silent Baseline ──► Phase 2: Shadow Pricing ──► Phase 3: Bike Pilot ──► Phase 4: Full Network
  (Data collection only)     ("Waived Fee" in app)      (Low-risk validation)     (Cars & CNGs)

Gate 1: Routing Engine Accuracy Validation
 * Threshold: Map-predicted pickup distance vs. actual driven distance must have an error margin of < 12\% across 10,000 test pings.
Gate 2: The Off-Platform Completion Anomaly Detector
Because drivers keep 100% of the cash, their primary hack is accepting a ride, calling the rider, agreeing on the fare, asking the rider to cancel on-app, and driving them off-platform to save the lead.
[Driver Accepts Ride] ──► [Driver Calls Rider] ──► [Rider Cancels: "Driver asked to cancel"]
                                                             │
                                                             ▼
                                                [GPS Trace Match Check]
                                                             │
                                        ┌────────────────────┴────────────────────┐
                                        ▼                                         ▼
                             Trace matches destination                 Trace diverges/stops
                             [PENALTY: Deduct 2.0 leads]                [CLEARED: Normal cancel]

 * The Automated Guardrail: If a ride is cancelled post-accept, run a background process comparing the driver's next 20 minutes of GPS telemetry against the cancelled ride's route vector. If spatial overlap is > 80\%, flag the event as an Off-Platform Leak, auto-deduct 2.0 leads as a penalty, and issue an account warning.
Gate 3: Waterlogging / Extreme Weather Override
 * During severe weather or waterlogging (e.g., severe flooding in Mirpur or Dhanmondi), standard routing algorithms break down.
 * The Override: The platform must support a manual or sensor-triggered "Monsoon Mode" per geofence. This automatically disables pickup distance surcharges, expands the free radius, and converts cold zones to flat-rate standard leads to prevent artificial fee gouging when traffic is stalled city-wide.
