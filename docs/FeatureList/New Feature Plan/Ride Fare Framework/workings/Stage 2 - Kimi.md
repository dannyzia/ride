Opinion on the Stage 2 Open Decisions

Reading the locked framework, the architecture is sound. These five questions are where the model goes from "correct" to "shippable in Dhaka." Here are my concrete recommendations:

---

1. Pickup Rate: 80% of Trip Rate, Tiered by Vehicle

Recommendation: Reject the 60% default. Use 80% for bikes, 70% for CNG, 60% for cars.

The "60%" camp treats pickup as a discount service because there's no passenger weight. That logic works in cities with open roads where fuel dominates cost. Dhaka is not that city. In Dhaka gridlock, the driver's cost is overwhelmingly time and fuel burned idling in traffic, not marginal weight. A bike carrying 70kg vs. empty has negligible fuel delta. A CNG in standstill traffic burns CNG at nearly the same rate loaded or empty. 

The real cost of pickup is opportunity cost. Every minute spent crawling to a pickup is a minute not earning on a trip. Pricing pickup at 60% signals to the driver that their time is worth less before the rider enters the vehicle — which is economically absurd and psychologically corrosive in a subscription model where they've already paid for the lead.

Vehicle	Pickup Rate	Rationale	
Bike	80% of trip per-km	Weight is negligible; maneuverability is high; time is the cost	
CNG	70% of trip per-km	Moderate weight delta; higher fuel burn than bike	
Car	60% of trip per-km	Significant weight/load impact; air conditioning cost; justified discount	

This is a retention decision disguised as a pricing decision. Underprice pickup and drivers will decline anything beyond 2km, making your "free radius" the de facto service boundary.

---

2. Destination Reveal Timing: Show Heat Tag Before Accept

Recommendation: Show the drop-zone tag (hot/warm/cold/dead) on the lead card before the driver accepts.

The argument against pre-reveal is cherry-picking. The argument for it is trust. In a lead-purchase model, trust wins.

Here's why: the driver has already paid for this lead via their subscription package. If they accept blind and land in a dead zone, they don't blame the market — they blame the platform for selling them a bad lead. That destroys the core product (lead packages) faster than cherry-picking ever could.

The cherry-picking problem is real but solvable through other means:
- Coarse granularity: "Cold" is a zone-level tag, not a specific destination. A driver can't perfectly game it.
- Cancellation-rate monitoring: if a driver's cold-zone decline rate exceeds baseline + 2σ, throttle their lead feed (commercial decision, not penalty).
- The "driver asks by phone anyway" argument is decisive: hiding the tag doesn't prevent cherry-picking; it just forces drivers to call riders and ask "Where to?", which is worse UX for riders and wastes more time than a tag would.

Exception: Do NOT reveal the exact drop-off address pre-accept. Only the zone heat class. Exact address post-accept only.

---

3. Free Radius & Cap Defaults: Vehicle-Calibrated, Not Uniform

Recommendation:

Vehicle	Free Radius	Max Chargeable	Absolute Cap	Pickup Rate	
Bike	1.5 km	5.0 km	৳80	80% of trip rate	
CNG	2.0 km	6.0 km	৳120	70% of trip rate	
Car	2.0 km	6.0 km	৳150	60% of trip rate	

Rationale:
- Bike density in Dhaka is extreme. A 1.5km free radius covers 70% of pickups because there's almost always a bike within 1km. The cap is low because bike trips are short and price-sensitive.
- CNG/Car density is sparser. Riders of these vehicles implicitly accept longer waits. A 2.0km free radius acknowledges that the nearest available CNG may genuinely be 1.8km away through Dhaka's broken road network. The higher cap reflects higher trip values.
- The absolute cap is critical for rider trust. Without it, a rider ordering a car from Banani to Gulshan could theoretically pay ৳300+ in pickup if the nearest driver is in Mohammadpur. The cap makes the worst-case bounded and defensible.

One Dhaka-specific calibration: The free radius should be computed via road-network distance, not haversine. In Dhaka, a 1.5km straight-line distance can be 3.5km by road due to lakes, rail lines, and one-way chaos. Using haversine would make the free radius functionally useless. The framework already specifies road-network routing — this is where it matters most.

---

4. Lead-Debit Multiplier: Do Not Build It

Recommendation: Kill this idea permanently. It is an incentive wearing a pricing costume, and it breaks the mental model of the subscription product.

The "lead-debit multiplier" (e.g., "this lead costs ৳5 instead of ৳10 because the pickup is long") was floated by Gemini and others. The framework correctly flags it as mathematically equivalent to an incentive. I would go further: it is worse than an incentive because it is a hidden incentive.

- It turns the simple value proposition ("buy 100 leads for ৳X, keep everything you earn") into a derivatives market where every lead has a different cost basis.
- It creates accounting complexity that requires real-time reconciliation, dispute handling, and driver education.
- It opens the door to dynamic "surge" logic by another name. If you discount leads for cold-zone drops today, tomorrow someone will argue for surcharging leads for hot-zone pickups. That is a commission model with extra steps.

If driver retention in cold zones is a problem, solve it through:
1. Better information (heat tags)
2. Matching priority (cold-drop rank boost — costs nothing)
3. Package design (e.g., "Zone A Package" vs "Zone B Package" — different lead prices for different service areas, not dynamic per-lead pricing)

Dynamic per-lead pricing is a trap. Avoid.

---

5. Staged Rollout: Three-Phase Gate-Driven Launch

Recommendation: No "promotional waivers" (violates no-incentive policy). Instead, a progressive tightening of the free radius with hard quantitative gates.

Phase 1 — Shadow (Weeks 1-4)
- Compute pickup fees on every ride. Display them in the rider app as a grayed-out line item: "Pickup fee: ৳24 (waived during launch)."
- Pay drivers nothing extra for pickup. The fee is purely notional.
- Collect baseline data: quote-to-actual deviation, acceptance rates by distance, cancellation patterns.

Phase 2 — Soft Launch (Weeks 5-8)
- Activate pickup charging, but with a generous free radius: 2.5 km for all vehicles.
- This means 85% of rides still pay ৳0 pickup fee, but the infrastructure (GPS snapshot, routing, true-up logic) is under real load.
- Gate to Phase 3:
  - Quote-to-final deviation >20% on fewer than 10% of rides.
  - Rider complaints mentioning "pickup fee" < 2% of completed trips.
  - Driver acceptance rate decline < 8% relative to Phase 1 baseline.

Phase 3 — Full Enforcement (Week 9+)
- Reduce free radius to target values (1.5km bike, 2.0km CNG/car).
- Enforce caps.
- Gate to declare success:
  - Net driver churn rate does not spike >5% relative to baseline.
  - Average rider fare increase attributable to pickup fee < 8% of pre-Phase 3 average.
  - No regulatory/BRTA inquiry triggered (monitor social media and news).

Why no "platform-paid launch promotion"? Because your policy is zero incentives. A "we'll pay the pickup fee for the first month" promotion is an incentive. The progressive free-radius tightening achieves the same infrastructure validation without violating the policy boundary.

---

Summary Table

Decision	My Position	
Pickup rate	80% bike / 70% CNG / 60% car — time cost dominates in Dhaka traffic	
Destination reveal	Before accept, coarse zone tag only — trust > cherry-picking risk	
Free radius/cap	1.5km/৳80 bike; 2.0km/৳120 CNG; 2.0km/৳150 car — density-calibrated	
Lead-debit multiplier	Do not build — it's an incentive in disguise	
Rollout	3-phase gated, no promotional waivers, progressive free-radius tightening	

These five calls, combined with the locked Stage 1 architecture, give you a framework that is transparent to riders, fair to drivers, defensible to regulators, and mechanically simple enough to ship without a derivatives desk.