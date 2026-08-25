I am building a ride-hailing platform for Dhaka, Bangladesh. We have locked our top-level fare architecture. We are strictly optimizing for driver and rider retention via weekly subscription packages, not maximizing gross lead volume or taking a commission on fares.


Locked Fare Formula:final_fare = base_fare + (per_km_rate × trip_distance_km) + (waiting_rate × chargeable_waiting_minutes) + pickup_fee


Locked Pickup Fee Structure:
Free radius → per-km rate → double cap (km cap + % of fare backstop, take the lower).
Distance is road-network km.
chargeable_km = min(max(0, reference_pickup_km - free_radius_km), cap_billable_km)pickup_fee_raw = chargeable_km × pickup_per_km_ratepickup_fee = min(pickup_fee_raw, cap_pct_of_trip_fare × fare_before_pickup)
Pickup rate = trip_per_km_rate × category_multiplier.


Locked Multiplier Tiers (to be validated by this survey):
Bike: 0.75, CNG: 0.80, Car: 0.90 — applied to the loaded trip per-km rate. These reflect category-specific opportunity cost and the principle that a car driver's deadhead minute is priced against car earnings, not bike earnings.


Key Business Model Facts:

The platform earns revenue from weekly lead subscription packages purchased by drivers, not from fare commissions.
A lead is consumed at dispatch (when a ride is offered to a driver), not at ride completion.
Dispatch is sequential — one driver offered at a time.
The north-star metric is weekly package renewal rate, driven by network growth and match quality.
Neither rider nor driver should feel cheated — every charge must be explainable in one honest sentence tied to something the payer caused or can see.
No surge pricing. No destination-based pricing in the fare. Destination lucrativeness is handled via dispatch/information layer only.



Using the locked framework context provided, complete the following task.


Part 1: Vehicle Taxonomy

Dhaka ride-hailing does not have three vehicle types — it has many. Define the standard sub-categories below. For each, identify the representative standard cc/engine that should anchor the cost model (i.e., the most common displacement actually operating as ride-hail vehicles in Dhaka today, not the spec-sheet ideal).


Tier	Sub-Category	Typical Dhaka Vehicles	Standard cc to Model	Fuel Type
Bike — Economy	80–100cc	Bajaj CT100, Honda Livo, TVS Metro	?	Petrol/Octane
Bike — Standard	110–125cc	Honda CB Shine, Bajaj Pulsar 125, TVS Apache 125	?	Petrol/Octane
Bike — Premium	150cc+	Bajaj Pulsar 150, Yamaha FZS, Honda Hornet	?	Petrol/Octane
CNG — Standard	3-wheeler auto	Bajaj RE, Piaggio Ape — fairly standardized	~200cc equiv.	CNG
Car — Economy	Micro/mini hatch	Maruti Alto, WagonR, Tata Tiago	?	Petrol/CNG
Car — Standard	Hatchback/sedan	Toyota Axio, Honda Fit, Suzuki Swift	?	Petrol/Octane
Car — Premium	Mid-size sedan	Toyota Allion/Premio, Honda City, Nissan Sylphy	?	Petrol/Octane

Question 1: Confirm or correct the sub-categories above for what actually operates on Dhaka roads as ride-hail vehicles today. Are there sub-categories I'm missing or ones that should be merged?


Question 2: For each sub-category, what is the standard cc that should anchor the cost model — the engine displacement that represents the median or mode of vehicles actually operating in that tier in Dhaka?



Part 2: Per-Sub-Category Cost Survey

Collect the following data for each sub-category. Where exact figures aren't available, provide realistic Dhaka-specific estimates with your reasoning and source (market surveys, BRTA data, driver interviews, mechanic quotes, etc.).


A. Fuel Cost

Variable	Unit	Notes
Fuel efficiency (city, Dhaka gridlock)	km/litre	Not highway spec — real Dhaka stop-and-go traffic
Current fuel price	BDT/litre	Octane ~145 BDT/L as of mid-2026; CNG per cubic metre if applicable
Fuel cost per km	BDT/km	Derived: fuel_price ÷ fuel_efficiency

B. Maintenance & Wear

Variable	Unit	Notes
Routine maintenance cost	BDT/km	Oil changes, filters, chain/belt, brake pads — amortized over km between services
Tyre cost per km	BDT/km	Purchase price ÷ expected tyre life in km
Major repair reserve per km	BDT/km	Clutch, suspension, engine overhaul — amortized over vehicle life
Total maintenance per km	BDT/km	Sum of above

C. Depreciation

Variable	Unit	Notes
Typical purchase price (used market, Dhaka)	BDT	What a driver actually pays to acquire the vehicle
Expected useful life as ride-hail vehicle	km	Before it's uneconomical to maintain
Residual/scrap value at end of life	BDT	
Depreciation per km	BDT/km	(purchase_price − residual) ÷ useful_life_km

D. Fixed Costs (amortized per km)

Variable	Unit	Notes
Annual insurance premium	BDT/year	
Annual registration / fitness / tax	BDT/year	BRTA costs
Annual Lead Package Cost	BDT/year	Based on weekly subscription packages. Estimate average weekly package cost × 52.
Typical annual km driven (loaded + empty)	km/year	
Fixed cost per km	BDT/km	(insurance + registration + annual_lead_package) ÷ annual_km

E. Driver Time / Opportunity Cost

Variable	Unit	Notes
Typical daily working hours	hours/day	
Typical daily net earnings target	BDT/day	What a driver needs to take home (after all operating costs) to make the job worthwhile
Typical daily km driven (loaded + empty combined)	km/day	
Average speed in Dhaka (loaded trip)	km/hour	Realistic Dhaka gridlock speed, not free-flow
Average speed when driving empty (to pickup)	km/hour	May differ — empty driver can sometimes route more aggressively
Driver time cost per hour	BDT/hour	daily_net_earnings_target ÷ working_hours
Driver time cost per km (loaded)	BDT/km	time_cost_per_hour ÷ avg_loaded_speed
Driver time cost per km (empty)	BDT/km	time_cost_per_hour ÷ avg_empty_speed

F. Pickup Distance Distribution (per zone type)

Zone Type	p25	p50	p75	p90	Notes
Dense urban core (Gulshan, Motijheel, Old Dhaka)	?	?	?	?	
Standard urban (Mirpur, Uttara, Mohammadpur)	?	?	?	?	
Suburban / peripheral (Savar, Tongi, Keraniganj)	?	?	?	?	

This data calibrates the free radius (targeting p70–p75) and validates the max billable km cap.

