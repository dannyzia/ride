I read §9 against the locked Stage 1 architecture. 

My view: the five questions are the right questions, but they are not equally well-posed. I would keep all five, but I would rewrite the decision framework before sending them to the model panel.

My ranking of the five decisions

#	Stage 2 question	My view	Priority

1	Pickup rate: 60% vs ~100%	Wrong binary framing	Very High
2	Destination reveal timing	Critical product decision	Very High
3	Free-radius / cap defaults	Needs empirical calibration	High
4	Lead-debit multiplier	Dangerous; likely reject	Very High
5	Staged rollout / gates	Absolutely do this	Very High


The biggest issue is #1. I would not send "60% vs 100%" to the models as the question.


---

1. Pickup rate: 60% vs 100%

My verdict: neither should be the fundamental Stage 2 question.

The document correctly locks the mechanism as:

chargeable_km × pickup_rate, subject to the double cap. 

But asking models to choose "60% or 100%" is asking them to guess a price before establishing the actual economic variable you're trying to recover.

The real question should be:

> What fraction of incremental pickup operating cost should the rider bear, and what fraction should remain embedded in the platform/marketplace economics?



That forces the panel to examine:

fuel,

vehicle operating cost,

driver time,

deadhead opportunity cost,

rider conversion elasticity,

driver acceptance elasticity,

subscription economics,

average pickup distance,

pickup-distance distribution.


Why 100% is not automatically correct

The Stage 1 document is right that empty-km fuel isn't magically cheaper than loaded-km fuel. 

But cost recovery ≠ pricing obligation.

If the rider pays 100% of theoretical pickup cost, you have converted network inefficiency into a visible rider surcharge.

That can be economically rational and commercially stupid.

What I would ask Stage 2 to determine

Have the models calculate an optimal recovery ratio:

pickup_recovery_ratio

rather than vote between 0.60 and 1.00.

Then constrain it using:

minimum_driver_economic_acceptability
maximum_rider_price_disruption
subscription_revenue_impact
ride_completion_impact

My prior is probably closer to 60–80% than 100%, but I would not lock the number without actual Dhaka data.


---

2. Destination reveal timing

My verdict: show the destination zone before acceptance, but not the full destination.

This is the most interesting decision in §9.

The document correctly identifies the conflict:

> driver-friendly disclosure vs cherry-picking. 



I would not solve that by hiding the destination entirely.

That's because your economics are fundamentally different from a commission platform.

The driver has bought access to a lead.

You are effectively saying:

> "You spent money for this opportunity; here is almost no information about whether it makes economic sense."



That is a recipe for:

accept,

call rider,

ask destination,

cancel.


And the platform loses control of the workflow.

Better model

Before acceptance show:

Pickup: 1.8 km
Estimated trip: 8–10 km
Estimated fare: ৳380–430
Destination zone: MIRPUR
Demand after drop: LOW

But do not necessarily show:

exact destination address

before acceptance.

That gives the driver enough information to make a rational decision without giving them unlimited destination-level cherry-picking.

The key point

Hiding information does not eliminate cherry-picking.

It often moves it off-platform:

> "Where are you going?"



That is worse because the platform loses visibility into the decision.

So I strongly favor:

zone + distance + estimated fare + heat class before acceptance.

Then measure cancellation behavior.


---

3. Free radius and caps

My verdict: correct Stage 2 question, but it should be treated as an optimization problem, not a model-voting exercise.

The document already gives you the right variables:

free_radius_km
rate_per_km
cap_amount
cap_pct_of_fare

and recommends the double cap. 

That's good.

But I would add one crucial variable:

max_reference_pickup_km

because otherwise a very distant driver pool can distort the quoted reference distance.

The percentile mechanism is clever:

> closest N drivers → 75th percentile. 



I like the principle, but I'd make the Stage 2 question:

> What reference pool and percentile produce the most stable rider quote without systematically overcharging riders or under-compensating drivers?



Then test:

N = 3 / 5 / 10

P50 / P60 / P75

1.5 / 2 / 3 km free radius

fixed cap

percentage cap

double cap.


That is a proper experiment.


---

4. Lead-debit multiplier

My verdict: I would currently reject it.

This is the most dangerous decision in §9.

The document itself acknowledges the problem:

> a lead-cost discount/multiplier can simply be an incentive wearing another name. 



I agree.

Your policy is:

> the platform never pays incentives.



I'd extend that principle to:

> the platform does not manipulate the economic cost of a lead based on ride desirability.



Otherwise you end up with:

Cold ride → 0.6 lead debit
Hot ride → 1.2 lead debit

Technically nobody received cash.

Economically, however, you've created a variable reward/cost system attached to ride acceptance.

That complicates:

product explanation,

driver expectations,

subscription accounting,

abuse detection,

regulatory interpretation,

package valuation.


More importantly

It creates a very nasty optimization loop.

Drivers will learn:

> "Cold rides are cheap leads."



Then they'll deliberately seek them.

Or the opposite, depending on the multiplier.

You've turned dispatch into a marketplace for lead credits, rather than simply matching riders and drivers.

I wouldn't do that in Stage 2 unless the panel produces an exceptionally strong reason.


---

5. Staged rollout

My verdict: mandatory.

This is the strongest item in §9.

The document already proposes a dispatch-only baseline and quantitative gates before enabling pickup fees. 

I would go further.

Stage 2 should define three phases

Phase A — Observe

No pickup charge.

Collect:

pickup_distance
pickup_time
driver_acceptance
driver_cancellation
rider_cancellation
ride_completion
quote
actual_route


---

Phase B — Shadow pricing

Calculate the pickup fee internally.

Do not charge it.

Show internally:

shadow_pickup_fee

Then measure:

> What would have happened?



This gives you real distributions without risking rider conversion.


---

Phase C — Controlled live pricing

Turn it on for a controlled percentage of rides / zones / vehicle categories.

Then compare:

conversion
acceptance
cancellation
complaints
fare deviation
driver retention
package consumption

against the baseline.

That is much stronger than simply "launch and see."


---

One thing §9 is missing

There is a sixth decision I'd insert before the five.

0. What exactly is the optimization target?

Because every other decision depends on this.

Your business doesn't optimize:

> fare revenue per ride.



You don't take commission.

You optimize some combination of:

ride completion
×
driver retention
×
subscription/package renewal
×
rider retention
×
network liquidity

You need a formal objective function.

Otherwise Stage 2 models will make internally rational but mutually incompatible recommendations.


---

I would define the Stage 2 north-star metric

Something like:

net_network_value_per_ride

Conceptually:

completed_ride_value
+ expected_driver_package_renewal_value
+ expected_rider_retention_value
− support_cost
− fraud/leakage cost

You don't need to expose that formula in the app.

But the model panel needs a consistent economic objective.


---

Another missing Stage 2 question: off-platform leakage

The document correctly calls this potentially existential because it attacks your only revenue stream. 

I would elevate this from a gaming category to an explicit Stage 2 decision.

Because your actual business model has a unique vulnerability:

Platform generates lead
        ↓
Driver pays for lead
        ↓
Driver gets rider phone number
        ↓
Driver cancels platform ride
        ↓
Driver completes privately
        ↓
Platform earns ৳0

That's not a normal ride-hailing fraud problem.

That's a revenue-model attack.

Stage 2 needs to determine:

when lead debit occurs,

whether debit is refundable after cancellation,

cancellation attribution,

rider-driver repeat-pair detection,

post-cancel route matching,

suspicious offline completion detection,

anti-circumvention policy.


I would put this directly into the decision round.


---

I would rewrite §9 like this

Stage 2 — Actual decisions

0. Economic objective

Define the primary optimization function for the no-commission subscription marketplace.


1. Pickup cost recovery

Determine optimal pickup cost recovery ratio from real Dhaka operating economics.

Do not constrain the answer to 60% vs 100%.


2. Destination disclosure

Determine the optimal pre-acceptance information set:

exact destination,

destination zone,

trip distance,

fare estimate,

heat class.


Optimize for informed acceptance without enabling systematic cherry-picking.


3. Pickup fee calibration

Determine free radius, reference pool size, percentile, rate, absolute cap and percentage cap by vehicle class.


4. Lead-debit policy

Decide explicitly whether any ride-dependent lead multiplier exists.

Default recommendation: no multiplier because it risks becoming a disguised incentive.


5. Rollout methodology

Shadow pricing → controlled launch → full deployment.

Define quantitative gates.


6. Off-platform leakage

Define lead-debit timing, cancellation rules, anomaly detection and rider-driver circumvention controls.


7. Gaming

Define defenses for:

GPS manipulation,

ride-away manipulation,

pin movement,

cherry-picking,

hotspot manipulation,

phantom demand,

account sharing.




---

My hard verdict

Of the existing five:

Keep #2, #3 and #5 essentially intact.

Reframe #1.

Treat #4 as a presumptive "No" that needs a very high burden of proof to overturn.

And I would add #0 and #6, because they are more fundamental to your particular business model than the current list suggests.

The Stage 1 document is already strong on the fare architecture. The Stage 2 round should now focus much more heavily on the thing that is unique about your platform:

> You are monetizing access to demand, not the transaction itself.



That makes lead leakage, lead allocation, acceptance behavior, and package economics just as important as the fare formula.