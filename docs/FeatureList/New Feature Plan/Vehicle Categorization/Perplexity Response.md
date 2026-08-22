You are designing a vehicle categorization framework for a ride-hailing platform operating in Dhaka, Bangladesh. Passengers select a ride category before matching; drivers' vehicles are pre-assigned to exactly one category based on brand+model+year(+optionally engine cc, seats, body type).

Current fixed categories: bike_basic, bike_standard, bike_plus, cng, car_economy, car_comfort, car_premium, car_xl.

Task: Propose a revised or extended categorization framework for the Dhaka market, considering:
1. Whether the current 8 categories are sufficient, redundant, or missing a segment (e.g. a sub-1001cc "compact car" tier distinct from car_economy).
2. For each proposed category: name, target passenger use-case, seat count range, engine cc range (if a car), fuel type constraints (if any), and 3-5 example brand/models typical of that segment in Bangladesh.
3. Deterministic classification rules: given brand, model, manufacturing year, engine cc, seat count, and body type, which category does a vehicle fall into? Rules must be unambiguous — no two categories should overlap for the same input.
4. Edge cases: CNG-converted petrol cars, locally-assembled/rebadged models, very old vehicles (10+ years) that may not match any current-production spec sheet, and vehicles with non-standard seat modifications (e.g. 3-seat micro cars, or extra jump seats in vans).
5. Explicitly flag if your framework requires the platform to add new vehicle_type enum values, or if it fits within the existing 8.

Output as a structured markdown table plus a short rules section. Do not produce implementation code — this is a business/product framework only.

A practical Dhaka framework should **split the current car tiers into five distinct car segments** and keep the two-wheel/three-wheel tiers, because a single car_economy bucket is too broad for the local market, while bike categories and cng are directionally useful but should be defined more tightly. The cleanest setup is 10 vehicle_type values: bike_basic, bike_standard, bike_plus, cng, compact_car, car_economy, car_comfort, car_premium, car_xl, and van_xl [1][2][3][4].

## Proposed categories

| Category | Passenger use-case | Seats | Engine cc range | Fuel constraints | Typical Bangladesh examples |
|---|---|---:|---|---|---|
| bike_basic | Cheapest solo ride, short urban hops, low-wait-time demand | 1 | N/A | Motorcycle only | Honda CD 70, Bajaj Platina, TVS Metro, Hero Splendor, Yamaha Saluto [1] |
| bike_standard | Faster, more common commuter bike rides with better comfort than basic | 1 | N/A | Motorcycle only | Honda CB Shine, Bajaj Pulsar 150, TVS Apache 160, Suzuki Gixxer, Hero Glamour [1] |
| bike_plus | Premium two-wheeler, delivery of higher comfort or larger bikes | 1 | N/A | Motorcycle only | Yamaha FZ, Honda Hornet, Bajaj Pulsar NS160, Suzuki Gixxer SF, TVS Apache RTR 200 [1] |
| cng | Cheapest enclosed 3-wheeler, short city rides, low luggage | 3 | N/A | Must be factory CNG three-wheeler or approved CNG auto | Bajaj RE, TVS King, Piaggio Ape, Mahindra Alpha, Runner CNG three-wheelers [3][4] |
| compact_car | Ultra-compact hatchback, lowest-cost car tier, 2–4 passengers, tight Dhaka roads | 4 | up to 1000 | Petrol, hybrid, or EV; no vans, no 3-wheelers | Suzuki Alto, Daihatsu Mira, Toyota Passo, Nissan Dayz, Honda Brio 1000cc variants [2] |
| car_economy | Mainstream small car, everyday family or office ride | 4–5 | 1001–1300 | Petrol, hybrid, or EV | Toyota Vitz, Toyota Aqua, Honda Fit, Suzuki Wagon R, Nissan Note [1][2] |
| car_comfort | More legroom, smoother ride, airport/business trips, longer urban rides | 4–5 | 1301–1600 | Petrol, hybrid, or EV | Toyota Axio, Toyota Fielder, Honda Grace, Honda City, Mazda Demio [1][5] |
| car_premium | Higher cabin quality, newer model years, premium feel, executive travel | 4–5 | 1601–2500 | Petrol, hybrid, or EV | Toyota Premio, Toyota Allion, Toyota Corolla, Honda Accord, Mazda 3 [6][5] |
| car_xl | Bigger private car or SUV for 6–7 passengers with luggage | 6–7 | 1800–3000 | Petrol, diesel, hybrid, or EV | Toyota Noah, Toyota Voxy, Toyota HiAce Commuter, Mitsubishi Outlander, Nissan X-Trail [6] |
| van_xl | True people-mover, airport/group/family demand, usually 7+ passengers | 7–12 | 2000–3000+ | Van/minibus body only | Toyota HiAce, Nissan Caravan, Mitsubishi Delica, Hyundai Starex, Toyota Granvia [6] |

## Category logic

The current 8 categories are **not fully sufficient** for Dhaka because they miss a compact-car price/size tier below car_economy, and they also blur large family vans versus larger SUVs if both sit in car_xl. The biggest practical gap is the 800–1000cc hatchback segment that is common in Bangladesh and materially different from 1200–1500cc sedans/hybrids in pricing, comfort, and operating cost [2][1].

I would also keep cng as a dedicated category only for three-wheelers, because Dhaka has a meaningful CNG auto-rickshaw market that is operationally different from cars and should not be mixed into car fuel logic [3][7]. For cars, fuel type should be an attribute, not a category, unless your marketplace wants separate “hybrid” pricing later [5].

## Deterministic rules

Use this precedence order so no vehicle can match two categories at once:

1. If body type is motorcycle, classify by engine class and brand/model into bike_basic, bike_standard, or bike_plus.
2. If body type is three-wheeler/CNG auto-rickshaw, assign cng only.
3. If body type is van/minibus, assign van_xl only.
4. If body type is SUV/MPV/minivan and seats are 6 or more, assign car_xl.
5. If body type is car/hatchback/sedan/wagon and seats are 4 or 5:
   - engine cc up to 1000: compact_car.
   - 1001–1300: car_economy.
   - 1301–1600: car_comfort.
   - 1601–2500: car_premium.
6. If model is locally rebadged or assembled, classify by the actual registered brand+model name used on the plate/registration, not by marketing name.
7. If year is 10+ years old, do not auto-downgrade just because of age; keep the category determined by body type, seats, and engine band unless the platform wants an explicit age gate.

## Edge cases

CNG-converted petrol cars should stay in the car category that matches their underlying body type and engine band; conversion alone should not move them into cng, because cng is reserved here for three-wheelers only. If you want to treat converted cars differently for pricing, add a separate fuel_flag field rather than a new category [3][7].

Very old vehicles are best handled with a fallback rule: if specs are incomplete, classify using the closest verified registration record; if that still fails, send to manual review rather than guessing. This matters in Dhaka because used-import and legacy registrations often outlive current market spec sheets [5][8].

Vehicles with non-standard seating should be classified by certified seating on registration, not improvised cabin layout. So a 3-seat microcar should be excluded from passenger car tiers unless you intentionally add a microcar category, and a van with extra jump seats should only count if the legal seat count is updated and documented.

## Enum impact

This framework **does require new vehicle_type enum values** if you want clean market segmentation, specifically compact_car and van_xl. If you want to stay within the existing 8 enums, the nearest compromise is to fold compact_car into car_economy and keep car_xl as both SUVs and vans, but that will reduce pricing precision and create overlap pressure in dispatch and fare logic [1][2].

Citations:
[1] Best Cars for Ride-Sharing in Bangladesh: What to Look For https://blog.bikroy.com/en/best-cars-for-ride-sharing-bangladesh/
[2] Hatch-mania: The best hatchbacks on sale in Bangladesh https://www.thedailystar.net/hatch-mania-the-best-hatchbacks-on-sale-in-bangladesh-62053
[3] New ridesharing CNG auto service launched https://www.newagebd.net/article/36508/new-ridesharing-cng-auto-service-launched-
[4] Top Auto Rickshaw Companies in Bangladesh (2026) | CNG ... https://infoghor.com/top-auto-rickshaw-companies-in-bangladesh/
[5] Stock List | 984 Cars https://gari-import.com.bd/stock-list
[6] Toyota Cars in Bangladesh — Price & Stock | Japan Stock https://www.carbarn.com.bd/cars/toyota
[7] Illegal CNG-powered auto-rickshaws flourish despite ban | https://en.bd-pratidin.com/special/2024/05/09/16211
[8] আপনার শহরে গাড়ি চালানোর জন্য যোগ্য গাড়ি এবং অন্যান্য ... https://www.uber.com/bd/bn/eligible-vehicles/
[9] A Circumstantial Review on Ride-sharing Profile in Dhaka ... http://www.jcepm.com/article_115528_9d6d90f917812e7a50b2aee43cce93d6.pdf
[10] Transport in Dhaka - Wikipedia https://en.wikipedia.org/wiki/Transport_in_Dhaka
