A hard second pass changes one major assumption:

I would no longer charge pickup dead-mileage as a fare component by default.

The reason is not rider fairness. The reason is marketplace liquidity and conversion.


---

The fundamental question

What business are you actually in?

Most ride-hailing operators think:

> We are selling transportation.



You are not.

You are selling:

> Driver access to ride opportunities.



That distinction matters because your revenue comes from call packages, not rides.


---

The hidden danger of pickup pricing

Suppose a rider sees:

Trip Fare:      ৳180
Pickup Fee:      ৳35
Total:          ৳215

The rider doesn't think:

> The driver traveled 3.5km.



The rider thinks:

> Why am I paying extra?



This hurts conversion.

And in Bangladesh, conversion is everything.


---

What the rider actually wants

The rider only cares about:

1. Final price


2. ETA


3. Driver quality



The rider does not care how the driver got there.


---

Uber's lesson

The biggest reason Uber-type systems don't expose pickup distance fees separately is not because they can't.

It's because:

> Marketplace conversion is usually worth more than pricing purity.




---

Therefore my revised recommendation

Option A (preferred)

Build pickup economics into dispatch, not fare.

Formula

Driver profitability score:

net_ride_value =
estimated_fare
-
pickup_cost

Where:

pickup_cost =
pickup_distance
× driver_operating_cost_per_km

The ride goes first to drivers where:

net_ride_value

is highest.


---

Example

Ride:

Fare = ৳300

Driver A:

Pickup = 0.8 km
Cost = ৳12
Net = ৳288

Driver B:

Pickup = 4 km
Cost = ৳60
Net = ৳240

Driver A gets the offer first.

No rider surcharge required.


---

Why this works for your model

You don't earn from the ride.

Therefore:

completed ride
>
higher fare

almost always.

Every completed ride increases:

driver package renewal probability

driver retention

network liquidity


You don't need to maximize fare.

You need to maximize completed rides.


---

What should happen when no nearby driver exists?

This is where I would introduce pickup pricing.

Not as the default.

As an exception.


---

Standard mode

No pickup fee.

pickup_fee = 0

within normal dispatch radius.


---

Scarcity mode

If nearest available driver exceeds threshold:

pickup_distance > 4 km

then:

extended_pickup_fee

becomes available.

Example:

No nearby driver found.

A driver 5.8 km away is available.

Additional pickup charge: ৳25

Accept?

Now the rider is consciously choosing.

Huge difference psychologically.


---

This is similar to airline baggage pricing

People accept:

> "Extra charge because this is outside normal service."



They dislike:

> "Random hidden fee attached to every trip."




---

Now let's discuss destination lucrativeness more aggressively

My first answer said:

> Never price it.



I'm still 95% there.

But there is one exception.


---

Exception: pre-declared remote zones

Suppose:

Dhaka → Mawa
Dhaka → Gazipur outskirts
Dhaka → Savar industrial area at midnight

These are not merely low-demand destinations.

They are structurally different trips.


---

In those cases

I would not use hotspot scoring.

I would use:

remote_zone_pricing

A fixed, published configuration.

Example:

Zone Class A
Normal

Zone Class B
Peripheral

Zone Class C
Remote

Then:

remote_zone_fee

can legally and transparently exist.


---

Why?

Because:

> The ride itself is different.



Not because:

> Drivers don't like the destination.



That distinction matters enormously.


---

Never tie fare to live hotspot score

This is the hill I would die on.

Never do:

fare =
base
× hotspot_multiplier

Why?

Because it becomes impossible to explain.

Imagine:

Today: ৳300
Tomorrow: ৳380

Same trip.

Rider asks:

> Why?



Answer:

> Because our algorithm predicts low future demand.



That sounds absurd.


---

It also creates regulatory risk

If BRTA ever audits pricing logic:

Which is easier to defend?

Model A

Base Fare
Distance
Time
Remote Zone Fee

Simple.


---

Model B

Destination Attractiveness Score
Demand Decay Factor
Future Ride Probability
Network Balancing Multiplier

Good luck explaining that.


---

Driver gaming analysis (hard pass)

This is where I think your biggest future problem lies.

Not pickup distance.

Not cold zones.


---

The real exploit

Your call package model creates a unique attack vector.

Drivers paid for ride leads.

Therefore they will optimize for:

Expected profit per consumed lead

not:

Total earnings


---

Example

Driver buys:

50 call package

Every accepted ride consumes one lead.

Now driver wants:

Highest ROI per lead.

He starts rejecting:

short trips

congested trips

cold zones

low fare rides


Only accepting premium rides.


---

This can destroy marketplace balance

Because unlike Uber:

You cannot use incentive money.

You already ruled that out.


---

Therefore

Your real dispatch variable becomes:

Lead Efficiency Score

not hotspot score.


---

I would create

driver_offer_quality_score

based on:

acceptance rate
completion rate
cancellation rate
response speed
package utilization


---

Then allocate premium rides preferentially

Drivers who behave well receive:

better ride inventory

not money.


---

This is extremely important

Since incentives are banned.

Your only currency becomes:

> Access to demand.



Not cash.


---

In fact

Access to demand is probably more powerful than incentives.

Because it costs you nothing.


---

Revised schema

I would separate into 4 domains.

{
  "pricing": {},
  "dispatch": {},
  "lead_economics": {},
  "demand_intelligence": {}
}


---

pricing

{
  "pickup_fee_enabled": true,
  "pickup_fee_mode": "scarcity_only",
  "free_pickup_radius_km": 4.0,
  "pickup_fee_rate_per_km": 10,
  "pickup_fee_cap": 40,
  "remote_zone_fee_enabled": true
}


---

dispatch

{
  "max_dispatch_radius_km": 6,
  "dispatch_radius_expansion_enabled": true,
  "destination_attractiveness_weight": 0.20,
  "pickup_distance_weight": 0.40,
  "driver_quality_weight": 0.25,
  "acceptance_probability_weight": 0.15
}


---

demand_intelligence

{
  "hotspot_window_minutes": 15,
  "hotspot_decay_factor": 0.7,
  "hot_threshold": 80,
  "cold_threshold": 30
}


---

lead_economics

{
  "driver_quality_scoring_enabled": true,
  "premium_lead_access_enabled": true,
  "completion_weight": 0.40,
  "acceptance_weight": 0.25,
  "cancellation_weight": 0.25,
  "response_time_weight": 0.10
}


---

My final second-pass conclusion

I would modify the first recommendation as follows:

Pickup distance

Do not charge it by default.

Charge it only when:

nearest eligible driver
>
normal service radius

In other words:

pickup pricing should be an exception mechanism, not a core fare component.


---

Destination attractiveness

Never use live hotspot data in pricing.

Ever.

Use it solely for:

dispatch ranking

lead allocation

driver information

network balancing



---

Remote destinations

Allow:

remote_zone_fee

based on predefined geographic zones.

Not hotspot scores.


---

Biggest strategic insight

Your most valuable lever is not fare pricing.

It is:

> Who gets access to the next lead.



Because in a no-commission, no-incentive marketplace, lead allocation becomes the platform's real currency.