# Rider Growth, Loyalty & Geo-Fenced Marketplace Engine

## Revised Planning Specification — Bangladesh Ride-Hailing Platform

**Status:** Strategic / Planning Specification
**Market:** Bangladesh only
**Initial Strategy:** Hyper-local residential growth
**Primary Acquisition Mechanism:** Customer incentive, not advertising
**Initial Promotional Budget:** Up to BDT 10,000/day
**Initial Driver Commission:** 0% during launch period, subject to final economics
**Initial Promotional Horizon:** 100 days

---

# 1. Strategic Objective

Build a ride-hailing marketplace that can acquire riders and drivers with very limited conventional advertising by concentrating demand and supply geographically and using incentives to create habitual usage.

The intended growth loop is:

> **Residential community**
>
> ↓
>
> **Concentrated riders**
>
> ↓
>
> **Concentrated drivers**
>
> ↓
>
> **Fast and reliable rides**
>
> ↓
>
> **Repeated usage**
>
> ↓
>
> **Wallet + streak + behavioral rewards**
>
> ↓
>
> **Community referrals**
>
> ↓
>
> **Corporate / recurring demand**
>
> ↓
>
> **Lower dependence on subsidy**
>
> ↓
>
> **Positive zone economics**
>
> ↓
>
> **Expansion into adjacent communities**

The objective is **not** to become the cheapest ride-hailing platform.

The objective is to become the **default mobility platform within increasingly large clusters of residential communities**.

---

# 2. Five Core Business Engines

The planning model must design the platform around five interconnected systems.

## Engine 1 — Geo-Fenced Marketplace

Controls:

* geographic zones,
* demand concentration,
* supply concentration,
* zone campaigns,
* budgets,
* expansion,
* zone economics.

## Engine 2 — Rider Growth & Retention

Controls:

* introductory incentives,
* Ride Wallet,
* streaks,
* behavior rewards,
* community referrals,
* loyalty.

## Engine 3 — Driver Growth & Retention

Controls:

* driver acquisition,
* 0% commission launch,
* driver rewards,
* driver streaks,
* utilization,
* commission transition,
* retention.

## Engine 4 — Economics, Risk & Competition

Controls:

* subsidy ceilings,
* reward stacking,
* attribution,
* cohort economics,
* fraud,
* abuse,
* competitor response,
* contribution margin.

## Engine 5 — Bangladesh Operations

Controls:

* regulatory requirements,
* payment behavior,
* vehicle eligibility,
* traffic,
* weather,
* Ramadan,
* holidays,
* local operational constraints.

These engines must share a common data and analytics layer.

---

# 3. Geo-Fenced Growth Zones

## 3.1 Principle

The platform must **not permanently define its launch geography by city, district, thana, or famous commercial location**.

Instead, it operates through configurable:

> **Geo-Fenced Growth Zones**

A Growth Zone is a geographic marketplace unit within which the platform can independently control:

* rider incentives,
* driver incentives,
* commission,
* loyalty campaigns,
* community campaigns,
* corporate programs,
* commuter-pass eligibility,
* service availability,
* budget,
* pricing rules,
* performance targets.

The geographic boundary must be editable without a software release.

---

# 4. Admin Geo-Fence Management

The admin must be able to:

* create a zone,
* draw polygons,
* create circles/radii,
* use predefined geographic boundaries,
* import GeoJSON,
* edit boundaries,
* resize zones,
* split zones,
* merge zones,
* duplicate zones,
* activate zones,
* pause zones,
* deactivate zones,
* assign budgets,
* assign campaigns,
* assign incentive rules.

Every change must be versioned.

---

# 5. Zone Lifecycle

A zone should progress through:

**Candidate → Pilot → Active → Growth → Mature → Expansion**

or:

**Candidate → Pilot → Paused → Closed**

Graduation must be based on measurable performance rather than management opinion.

---

# 6. Residential-First Zone Selection

The initial strategy should prioritize **places where people live**.

The planning model should identify residential clusters with potential for repeated mobility.

Evaluate:

* residential density,
* population,
* household density,
* apartment/community concentration,
* expected ride frequency,
* two-way demand,
* local trip generation,
* employment connectivity,
* school/university connectivity,
* shopping/service connectivity,
* public-transport connectivity,
* expected driver availability,
* average trip distance,
* peak/off-peak balance.

The objective is:

> **High repeat demand + sufficient supply + high ride density + short ETA.**

Do not optimize for city-wide coverage.

---

# 7. Zone Scoring

The planning model must produce an explicit scoring methodology.

It should include:

* weighted scoring,
* minimum thresholds,
* data sources,
* confidence levels,
* missing-data treatment.

Illustrative structure:

| Factor                            | Example Weight |
| --------------------------------- | -------------: |
| Residential density               |         25–30% |
| Two-way demand potential          |         20–25% |
| Rider frequency potential         |         15–20% |
| Driver availability               |         15–20% |
| Employment/education connectivity |          5–10% |
| Local trip density                |          5–10% |
| Operational feasibility           |          5–10% |

**These weights are hypotheses, not final values.**

The planning model must validate and adjust them using Bangladesh data.

---

# 8. Required Zone Data

The planning model should identify practical Bangladesh data sources for:

* population,
* residential density,
* road network,
* traffic,
* commuting,
* existing ride-hailing activity,
* mobile/digital mobility signals where legally available,
* public transport,
* employment concentration,
* educational institutions,
* residential developments,
* driver supply.

Each input must have:

* source,
* update frequency,
* geographic resolution,
* reliability rating.

---

# 9. Marketplace Liquidity

The central geographic KPI is **liquidity**, not user count.

A zone must be evaluated on:

* average pickup ETA,
* acceptance rate,
* cancellation rate,
* rider demand,
* driver availability,
* rides/driver/day,
* rides/rider/month,
* supply/demand ratio,
* completed rides,
* idle driver time.

A successful zone should create enough demand for drivers while maintaining sufficient supply for riders.

---

# 10. Zone-Level Economics

Every zone must have its own P&L.

### Revenue

minus:

* rider subsidies,
* driver incentives,
* payment costs,
* refunds,
* customer support allocation,
* promotional expenditure,

equals:

> **Zone Contribution**

The system must show contribution by:

* day,
* week,
* month,
* rider cohort,
* campaign,
* driver cohort.

---

# 11. BDT 10,000/Day Liquidity Budget

The BDT 10,000/day budget should be treated primarily as a:

> **Marketplace Liquidity Budget**

not an advertising budget.

Conventional advertising should remain minimal.

The principal customer-acquisition mechanism is the **value delivered directly to riders**.

Budget should be allocated where incremental spending produces the greatest improvement in:

* completed rides,
* rider retention,
* driver utilization,
* ETA,
* zone liquidity,
* organic repeat rides.

---

# 12. Budget Governance

Budget allocation must have explicit rules.

The planning model must define:

* daily/weekly reallocation frequency,
* minimum viable zone budget,
* maximum zone allocation,
* CAC ceiling,
* subsidy/ride ceiling,
* automatic pause triggers,
* reallocation triggers.

Example rule:

> If a zone's CAC exceeds the approved ceiling for seven consecutive days, reduce its allocation by X%.

Example:

> If a zone achieves retention and liquidity targets while another zone fails, reallocate a defined percentage of budget toward the stronger zone.

These values must be experimentally determined.

---

# 13. Rider Introductory Incentive

An aggressive introductory benefit may be used during the first 100 days.

A candidate structure:

> **25% rider discount**

The exact subsidy must be constrained by:

* maximum discount per ride,
* maximum daily subsidy,
* maximum rider subsidy,
* zone,
* cohort,
* campaign,
* total subsidy ceiling.

The purpose is:

> **Acquire → create habit → reduce subsidy.**

It is not intended to become the permanent fare model.

---

# 14. Diminishing Introductory Benefits

The platform should test diminishing benefits.

Illustrative model:

| Rider stage       |                Example benefit |
| ----------------- | -----------------------------: |
| First ride        |                            50% |
| Second ride       |                            35% |
| Third ride        |                            25% |
| Fourth ride       |                            15% |
| Established rider | Normal fare + loyalty benefits |

Alternative structures must be tested.

The planning model should optimize for:

> **Lowest subsidy required to create durable repeat behavior.**

---

# 15. Ride Wallet / Ride Rewards

Create a stored-value loyalty mechanism.

Working concept:

> Rider earns approximately 5% of eligible fare as future ride value.

Example:

BDT 300 ride

→ BDT 15 earned.

The rider accumulates the value.

The exact product name should be researched.

Potential directions:

* Ride Wallet
* RideBank
* Ride Rewards
* Ride Credit
* Ride Reserve
* RideBack
* RideSave

The final name must be tested for Bangladesh comprehension and legal/accounting implications.

---

# 16. Wallet Redemption

The rider chooses when to redeem accumulated value.

Example:

> Fare: BDT 320
> Wallet balance: BDT 185
> Redeem: BDT 100
> Rider pays: BDT 220

The wallet must support:

* earning limits,
* balance limits,
* redemption limits,
* expiry,
* eligibility,
* fraud controls.

The rider must clearly see:

> **Earned → Available → Redeemed → Remaining**

---

# 17. Cash and Digital Payment

Payment strategy must explicitly account for Bangladesh's mixed cash/digital environment.

The planning model must determine:

* whether wallet rewards can be earned on cash rides,
* whether wallet redemption is available on cash rides,
* whether digital payment receives additional rewards,
* whether cash riders are disadvantaged,
* settlement implications,
* refund treatment.

Do **not** make the system digital-only during initial acquisition if that materially restricts the target market.

Digital payment can instead receive behavioral incentives.

---

# 18. Ride Streak

Streak operates independently from the Ride Wallet.

Possible streaks:

### Daily

Ride on consecutive days.

### Weekly

Complete a minimum number of rides every week.

### Commuter

Complete weekday rides within defined commuting periods.

### Campaign

Complete X rides within Y days.

---

# 19. Streak Rewards

Possible rewards:

* wallet bonus,
* additional discount,
* Streak Shield,
* commuter-pass credit,
* priority matching,
* loyalty status,
* referral multiplier.

Rewards should increase with meaningful achievements.

A limited:

> **Streak Shield**

may protect an established streak from one missed qualifying period.

---

# 20. Behavior-Based Rewards

Reward behaviors that improve marketplace economics.

Examples:

| Behavior              | Strategic purpose       |
| --------------------- | ----------------------- |
| Frequent riding       | Higher LTV              |
| Morning commuting     | Recurring demand        |
| Evening commuting     | Demand balancing        |
| Off-peak riding       | Driver utilization      |
| Digital payment       | Operational efficiency  |
| Low cancellation      | Marketplace reliability |
| New-zone usage        | Expansion               |
| Consistent weekly use | Habit                   |

Every reward must have a measurable business reason.

---

# 21. Community Referral

Do not depend only on:

> Invite friend → receive BDT X.

Instead build **community-based referral**.

Possible communities:

* apartment complex,
* residential neighborhood,
* housing society,
* office,
* university,
* friend group,
* professional group.

The objective is:

> **Everyone benefits when the community grows.**

---

# 22. Community Challenges

Example:

> 10 qualifying members → 5% benefit

> 25 members → 7%

> 50 members → 10%

Or:

> Community completes 1,000 rides this month → community reward.

The exact mechanism must be tested.

The reward should create:

> **collective incentive rather than individual referral farming.**

---

# 23. Community Verification

The planning model must define how communities are verified.

For residential communities, possible methods include:

* geofence-based qualification,
* user self-declaration,
* property/community verification,
* building-management partnership,
* address verification.

The system must prevent fake community creation.

---

# 24. Corporate Program

Corporate acquisition should begin **before rider launch**, in parallel with residential preparation.

Target:

> **3–5 anchor employers as an initial commercial objective.**

This is a target, not an absolute launch dependency.

Corporate onboarding should ideally begin:

> **60–90 days before launch.**

---

# 25. Corporate Benefit

Candidate model:

> Starting benefit: **10%**

Employees receive the benefit through the corporate program.

The company should receive a performance-based benefit.

Illustrative structure:

| Monthly completed rides | Next-month benefit |
| ----------------------: | -----------------: |
|                    <100 |                 2% |
|                 100–299 |                 5% |
|                 300–499 |                 7% |
|                    500+ |                10% |

Alternative:

> Hit target → retain 10%.

> Miss target → fall to 2%.

Actual thresholds must be determined through unit economics.

---

# 26. Corporate Dashboard

Company administrators should see:

* rides,
* spending,
* active employees,
* current benefit,
* current ride target,
* progress toward target,
* next month's benefit,
* department/location usage.

Example:

> **312 / 500 rides completed**
>
> **188 more rides to retain 10% next month**

---

# 27. Corporate Abuse Controls

The planning model must define:

* employee verification,
* personal vs business ride rules,
* geographic restrictions,
* spending limits,
* suspicious usage detection,
* account sharing controls,
* company administrator controls.

---

# 28. Commuter Pass

The Commuter Pass should exist in the architecture but **must not be launched merely because the product is ready**.

Launch only after sufficient post-subsidy behavioral data exists.

Minimum conceptual criterion:

> **Demonstrated organic repeat demand after Day 100.**

The pass should be priced from observed:

* ride frequency,
* fare,
* route,
* peak usage,
* price elasticity,
* retention.

Possible structures:

### Discount cap

10% off up to BDT X/month.

### Ride allowance

20 eligible rides/month.

### Time restriction

Weekday commuting.

### Zone restriction

Defined commuting area.

### Hybrid

Discount + monthly cap.

---

# 29. Driver Strategy

Driver strategy is a first-class marketplace engine, not an implication of rider growth.

---

# 30. Driver Acquisition — Days 1–100

Candidate launch proposition:

> **0% commission for the first 100 days**

The objective is to rapidly establish sufficient supply inside selected Growth Zones.

However, 0% commission must be monitored against:

* driver utilization,
* driver earnings,
* rider demand,
* subsidy burden,
* retention.

Do not recruit unlimited drivers.

Recruit enough supply to achieve target liquidity.

---

# 31. Driver Utilization

Each zone should have explicit driver targets.

Measure:

* active drivers,
* rides/driver/day,
* online hours,
* utilization,
* earnings/hour,
* acceptance rate,
* cancellation rate,
* peak availability.

A zone with too many drivers can be economically unhealthy even if riders are happy.

---

# 32. Driver Commission Transition

The platform must determine what happens after Day 100.

Potential mechanisms:

### Model A — Direct transition

0% → normal commission.

### Model B — Earned credits

Drivers earn credits through valuable behavior that offset future commission.

### Model C — Hybrid

Lower commission + earned credits + performance incentives.

The planning model must compare these economically and psychologically.

Do **not** assume the "commission saved" balance automatically becomes a financial liability.

---

# 33. Driver Credit Concept

If commission credits are used, define:

* how credits are earned,
* credit value,
* maximum balance,
* expiry,
* eligibility,
* application order,
* interaction with incentives,
* post-Day-100 treatment.

A driver dashboard could display:

> **BDT 8,400 earned benefits**
>
> **Equivalent to approximately X commission-free rides**

The planning model must determine whether this is preferable to direct commission reduction.

---

# 34. Driver Streak & Loyalty

Mirror rider gamification where economically useful.

Examples:

* peak-hour availability,
* minimum completed rides,
* low cancellation,
* high acceptance,
* zone coverage,
* consistent weekly activity.

Rewards may include:

* commission reduction,
* credits,
* priority matching,
* access to high-demand zones,
* bonus periods.

Do not reward behavior that encourages unsafe driving or excessive working hours.

---

# 35. Rider–Driver Marketplace Balance

The primary operational objective is:

> **Demand/supply equilibrium.**

Track:

* rider requests,
* available drivers,
* request/driver ratio,
* ETA,
* acceptance,
* cancellation,
* driver idle time.

Driver acquisition must be triggered by **actual demand**, not vanity registration numbers.

---

# 36. Reward Stacking

All benefits must use a centralized reward engine.

The system must explicitly define:

* benefit eligibility,
* stacking order,
* maximum percentage subsidy,
* maximum monetary subsidy,
* campaign priority,
* expiry,
* exclusions.

The hard ceiling should be a **percentage and monetary cap**, not merely an informal rule.

Example:

> Maximum platform-funded benefit = 40% of eligible fare, subject to BDT X maximum.

---

# 37. Stacking Example

Illustrative:

Fare:

> BDT 400

Benefits:

* Corporate = 10%
* Wallet = 5%
* Streak = 10%
* Behavior = 10%

Nominal total:

> 35%

If the maximum is 40%:

→ all may apply.

If nominal total is 50%:

→ centralized rules determine which benefits are reduced.

The rider receipt must show:

> Base fare: BDT 400
> Corporate benefit: -BDT 40
> Wallet: -BDT 20
> Streak benefit: -BDT 40
> Behavior benefit: -BDT 60
> **Total benefit: BDT 160**
> **Payable: BDT 240**

No hidden discount calculations.

---

# 38. Cross-Zone Attribution

Explicit accounting rules are required.

## Rider ownership

For CAC and retention, assign the rider to:

> **Home/Acquisition Zone**

with versioned attribution.

## Trip attribution

A trip starting in Zone A and ending in Zone B should record:

* origin zone,
* destination zone,
* acquisition zone,
* campaign zone,
* revenue attribution,
* subsidy attribution.

The default financial rule should be defined consistently rather than decided case-by-case.

## Driver attribution

Driver incentives should normally be attributed to:

> **The zone where the qualifying behavior occurred.**

## Campaign attribution

The campaign that generated the benefit should bear the subsidy unless an explicit zone-sharing rule exists.

The planning model must produce a complete accounting policy.

---

# 39. Cohort Economics

Analyze performance by:

> **Zone × Cohort × Acquisition Channel**

Examples:

* residential acquisition,
* community referral,
* corporate,
* organic,
* paid acquisition,
* promotional acquisition.

Measure:

* CAC,
* rides,
* retention,
* subsidy,
* contribution,
* organic repeat rides,
* LTV.

A rider who takes five subsidized rides and disappears is fundamentally different from a rider who becomes a 12-rides/month customer.

---

# 40. Fraud & Abuse Prevention

The planning model must explicitly design detection for:

### Rider/driver collusion

Artificial subsidized rides.

### Synthetic streak farming

Short/fake rides solely to preserve streaks.

### Referral rings

Multiple accounts generating reciprocal benefits.

### Wallet arbitrage

Multiple accounts or payment identities harvesting credits.

### Community fraud

Fake residential/community membership.

### Corporate abuse

Personal rides disguised as corporate usage.

### Driver gaming

Artificial cancellations, acceptance manipulation, location manipulation or coordinated activity.

The system should combine:

* account/device signals,
* payment signals,
* GPS patterns,
* ride patterns,
* timing,
* network relationships,
* anomaly detection,
* manual review.

---

# 41. Competitive Response

The platform must have a formal competitor-response playbook.

If an incumbent introduces aggressive discounts inside a Growth Zone:

> **Do not automatically match them.**

First measure:

* rider churn,
* driver churn,
* ETA,
* completed rides,
* repeat rate,
* organic rides,
* contribution margin.

If metrics remain within tolerance:

> **Do nothing.**

If material deterioration occurs:

> Deploy targeted intervention.

Possible responses:

* targeted rider incentive,
* driver supply incentive,
* community campaign,
* corporate acquisition,
* loyalty acceleration.

Avoid blanket price wars unless strategically justified.

---

# 42. Bangladesh Operational Model

The planning model must account for:

* BRTA requirements,
* vehicle/category restrictions,
* licensing,
* insurance,
* driver documentation,
* local traffic restrictions,
* residential staging constraints,
* monsoon effects,
* Ramadan patterns,
* Eid/holiday demand,
* school/university cycles,
* public holidays,
* political disruption/hartal risk where applicable,
* airport/rail/bus-terminal effects where relevant.

These factors must be incorporated into zone selection and forecasting.

---

# 43. Residential Staging

Residential density alone is insufficient.

The planning model must verify:

> **Can drivers actually wait, enter, exit and pick up riders efficiently?**

Evaluate:

* road width,
* parking/staging availability,
* gated-community restrictions,
* traffic congestion,
* security restrictions,
* pickup points.

A dense residential area with terrible pickup logistics may be a poor Growth Zone.

---

# 44. Home Zone

The platform may infer a rider's primary residential zone from repeated pickup behavior.

Alternative:

> Allow the rider to self-select a community.

The planning model must define:

* inference method,
* minimum observations,
* retention period,
* update frequency,
* opt-out,
* data minimization,
* privacy controls.

Home Zone data should be used only where necessary for legitimate product functionality and analytics.

---

# 45. Experimentation Governance

Geographic and incentive experiments must have formal rules.

For every experiment define:

* hypothesis,
* control,
* treatment,
* minimum sample,
* duration,
* success metric,
* guardrails,
* budget,
* stop condition.

Candidate decision gates:

> Day 30 → early signal

> Day 60 → economic signal

> Day 90 → decision

The planning model must determine appropriate statistical power and sample size rather than blindly using fixed durations.

---

# 46. Automatic Experiment Guardrails

Example:

> If CAC exceeds 2× approved baseline, automatically pause the variant.

Other guardrails:

* subsidy/ride,
* cancellation,
* ETA,
* driver utilization,
* rider retention,
* contribution margin.

No experiment should be allowed to consume unlimited budget merely because it has not formally ended.

---

# 47. Day-100 Transition

The 100-day period is not a success merely because the platform has acquired many riders.

At Day 100:

> Reduce or remove the acquisition subsidy.

Then observe behavior.

The critical question:

> **Do riders continue to ride at economically sustainable pricing?**

---

# 48. Organic Ride Rate

The principal post-subsidy metric should be:

> **Organic Repeat Ride Rate**

Definition:

> Percentage of rides completed without an active acquisition subsidy after the introductory period.

The planning model should establish a target threshold.

An illustrative hypothesis might be:

> Zone graduates if organic ride rate exceeds 60% at 30 days post-subsidy.

**60% is not a predetermined truth; the planning model must establish an appropriate threshold from cohort economics.**

---

# 49. Zone Failure Rules

If a zone fails the Day-100 test, possible responses:

### Option 1

Reduce subsidy further.

### Option 2

Shrink the geofence to the strongest residential cluster.

### Option 3

Change the incentive mechanism.

### Option 4

Increase driver concentration.

### Option 5

Merge with an adjacent successful zone.

### Option 6

Pause the zone.

### Option 7

Close the zone.

The system must not continue subsidizing a structurally weak zone indefinitely.

---

# 50. Driver Day-100 Transition

Evaluate simultaneously:

* driver retention,
* utilization,
* earnings/hour,
* rides/day,
* acceptance,
* cancellation,
* commission sensitivity.

A rider-side success with driver-side collapse is not a successful marketplace.

---

# 51. Corporate Timing

Corporate acquisition should run **in parallel** with residential launch preparation.

Suggested timeline:

### T−90

Begin corporate pipeline.

### T−60

Corporate pilots / negotiations.

### T−30

First anchor accounts.

### Day 1

Corporate + residential demand begin operating together where ready.

### Day 30–100

Corporate ride-volume growth.

### Day 100+

Corporate demand helps cushion the reduction in rider acquisition subsidy.

---

# 52. Commuter Pass Timing

Do not launch simply because the feature is technically complete.

Launch only when:

* organic retention is demonstrated,
* rider frequency is known,
* commuting patterns are understood,
* price elasticity is measurable,
* pass economics are modelled.

The pass should solve an observed customer behavior.

---

# 53. Core KPI Framework

## Rider

* CAC
* first → second ride conversion
* 7/30/60/100-day retention
* rides/rider/month
* average fare
* subsidy/ride
* LTV
* organic repeat rate

## Driver

* acquisition cost
* active drivers
* rides/driver/day
* utilization
* earnings/hour
* acceptance
* cancellation
* retention
* post-Day-100 retention

## Marketplace

* ETA
* acceptance rate
* cancellation rate
* completed rides
* supply/demand ratio
* ride density
* driver idle time

## Loyalty

* wallet earning
* wallet redemption
* streak participation
* streak completion
* behavior reward participation
* referral conversion
* community participation
* corporate rides
* commuter-pass conversion

## Economics

* CAC
* subsidy/ride
* contribution/ride
* zone contribution
* cohort contribution
* LTV/CAC
* organic ride percentage.

---

# 54. Most Important Business Metric

The platform must not optimize for:

> Downloads.

Nor:

> Registered drivers.

Nor:

> Total rides during the subsidy period.

The most important metric is:

> **Sustainable organic repeat rides per active rider at acceptable contribution margin.**

This combines:

* demand,
* retention,
* price acceptance,
* marketplace quality,
* subsidy independence.

---

# 55. Ultimate Test

The business succeeds only if:

### Before subsidy reduction

Users ride because the platform is attractive.

### After subsidy reduction

Users continue riding because:

* the platform is reliable,
* drivers are available,
* habits have formed,
* wallet value exists,
* streaks matter,
* communities participate,
* corporate programs provide recurring demand,
* the platform has become their default mobility option.

If users disappear when discounts disappear:

> **The platform purchased rides; it did not create a sustainable marketplace.**

---

# 56. 100-Day Strategic Sequence

## Pre-Launch: T−90 to T−1

* Identify candidate residential zones.
* Score zones.
* Establish driver acquisition pipeline.
* Begin corporate acquisition.
* Configure geofences.
* Establish payment infrastructure.
* Establish fraud controls.
* Define incentive economics.
* Recruit initial driver supply.
* Secure 3–5 corporate anchor targets where possible.

## Phase 1 — Days 1–30

Primary objective:

> **Liquidity**

Launch:

* strong rider acquisition incentive,
* 0% driver commission,
* basic Wallet,
* basic Streak.

Concentrate supply and demand.

## Phase 2 — Days 31–60

Primary objective:

> **Habit**

Introduce:

* behavior rewards,
* improved streaks,
* community referrals,
* corporate programs.

## Phase 3 — Days 61–100

Primary objective:

> **Retention**

Measure:

* repeat usage,
* organic behavior,
* driver retention,
* zone economics,
* subsidy dependence.

Prepare the subsidy transition.

## Phase 4 — Day 100+

Primary objective:

> **Economic validation**

Reduce acquisition subsidy.

Measure:

* organic repeat rides,
* rider retention,
* driver retention,
* contribution margin.

Then:

> Expand successful zones.

> Fix or shrink marginal zones.

> Close structurally weak zones.

Only after sufficient evidence:

> Launch Commuter Pass.

---

# 57. Capital Allocation Principle

The platform should treat every BDT spent as an experiment in creating:

> **Permanent marketplace liquidity.**

BDT 10,000 spent to generate temporary rides is bad spending.

BDT 10,000 that:

* acquires habitual riders,
* attracts productive drivers,
* creates community referrals,
* generates corporate demand,
* improves zone liquidity,

is productive investment.

---

# 58. Final Strategic Architecture

The complete model is:

> **RESIDENTIAL COMMUNITY**
>
> ↓
>
> **GEO-FENCED GROWTH ZONE**
>
> ↓
>
> **CONCENTRATED RIDER ACQUISITION**
>
> *
>
> **CONCENTRATED DRIVER ACQUISITION**
>
> ↓
>
> **MARKETPLACE LIQUIDITY**
>
> ↓
>
> **FAST / RELIABLE RIDES**
>
> ↓
>
> **RIDER WALLET + STREAK + BEHAVIOR**
>
> ↓
>
> **COMMUNITY REFERRALS**
>
> *
>
> **CORPORATE DEMAND**
>
> ↓
>
> **HIGHER RIDE FREQUENCY**
>
> ↓
>
> **LOWER CAC + LOWER SUBSIDY DEPENDENCE**
>
> ↓
>
> **POSITIVE COHORT / ZONE ECONOMICS**
>
> ↓
>
> **REDUCE SUBSIDIES**
>
> ↓
>
> **VALIDATE ORGANIC RETENTION**
>
> ↓
>
> **EXPAND GEO-FENCE**
>
> ↓
>
> **REPEAT**

---

# 59. Planning Model Deliverables

The planning model must now produce implementation-grade specifications for:

### Geography

1. Candidate-zone discovery.
2. Zone scoring.
3. Data sources.
4. Geo-fence engine.
5. Zone lifecycle.
6. Zone economics.
7. Zone expansion/rollback.

### Rider

8. Acquisition incentives.
9. Ride Wallet.
10. Streak engine.
11. Behavior rewards.
12. Community referrals.
13. Loyalty architecture.

### Driver

14. Driver acquisition.
15. 0% commission launch.
16. Driver rewards/credits.
17. Driver streaks.
18. Driver utilization.
19. Commission transition.
20. Driver retention.

### Corporate

21. Corporate acquisition.
22. Corporate onboarding.
23. Corporate benefit engine.
24. Corporate dashboard.
25. Corporate fraud controls.

### Subscription

26. Commuter Pass.
27. Pass pricing methodology.
28. Pass launch criteria.

### Economics

29. Reward stacking.
30. Subsidy ceilings.
31. Cross-zone attribution.
32. Cohort economics.
33. Zone P&L.
34. LTV/CAC.
35. Day-100 transition.

### Risk

36. Fraud detection.
37. Rider-driver collusion.
38. Wallet abuse.
39. Referral abuse.
40. Community abuse.
41. Corporate abuse.
42. Competitive response.

### Bangladesh

43. BRTA/regulatory requirements.
44. Vehicle eligibility.
45. Cash/digital payment strategy.
46. Monsoon/Ramadan/holiday effects.
47. Traffic/staging constraints.
48. Local operational model.

### Experimentation

49. Geographic experiments.
50. Incentive experiments.
51. Statistical methodology.
52. Budget guardrails.
53. Decision gates.
54. Automated pause/reallocation rules.

### Product & Technology

55. Rider UX.
56. Driver UX.
57. Corporate UX.
58. Admin geo-fence management.
59. Campaign management.
60. Reward ledger.
61. Attribution engine.
62. Fraud engine.
63. Analytics/KPI system.

---

# 60. Non-Negotiable Strategic Rule

The platform must **not become a discount app**.

It must become:

> **A hyper-local, habit-forming, community-driven mobility marketplace in which rider demand, driver supply, loyalty, corporate relationships and geographic density reinforce one another.**

The business should move through this progression:

**High acquisition incentive**

↓

**Habit**

↓

**Liquidity**

↓

**Loyalty**

↓

**Community**

↓

**Corporate / recurring demand**

↓

**Reduced subsidy**

↓

**Normal-price recurring rides**

↓

**Positive contribution**

↓

**Geographic expansion**

↓

**Network effect**

The ultimate objective is not to subsidize Bangladesh into using another ride-hailing app.

It is to **build dense, self-sustaining mobility markets one residential community at a time.**
