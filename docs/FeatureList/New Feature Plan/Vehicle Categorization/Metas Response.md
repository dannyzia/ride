For Dhaka, the current 8 categories work functionally but create a pricing and expectation problem. The fix is one new tier.

1. Are 8 categories enough?

No, not cleanly. 
car_economy today covers both a 660cc Suzuki Alto and a 1300cc Toyota Vitz. Pax paying economy fare expects a Vitz-class hatch, not a 3-seat kei car. Driver of an Alto has higher per-km cost than fare assumes.
bike_plus is not redundant - in Dhaka it signals >150cc brakes / stability for 2 pax + backpack in rain.
Missing: car_compact / micro <1001cc - justified by BRTA tax slab <1000cc, huge volume of reconditioned Mira / Alto / WagonR / Pixis used for ride-hail.

I propose two tracks:

A) MVP - Fits Existing 8 Enums: Redefine cc bands inside current names.
B) Recommended - 9 Enums: Add car_compact. This is ideal for Dhaka.

2. Proposed Framework - Recommended 9-Category
| Category | Status | Target Pax Use-Case | Seats (pax, excl. driver) | Engine cc (factory spec) | Fuel Constraint | Typical Models in BD Market |
| --- | --- | --- | --- | --- | --- | --- |
| bike_basic | Existing | Lowest-cost solo, short trips | 1 | 80 - 109 cc | Petrol only | Bajaj Platina 100, TVS Metro 100, Hero Splendor 100, Honda Dream 110 |
| bike_standard | Existing | Everyday commuter, 1 pax with bag | 1 | 110 - 149 cc | Petrol | Bajaj Discover 125, Honda Livo 125, TVS Stryker 125, Yamaha Saluto 125 |
| bike_plus | Existing | Longer / faster / 2-pax comfortable | 1-2 | >=150 cc, EV >=5kW | Petrol | Yamaha FZS 150, Suzuki Gixxer 150, Bajaj Pulsar 150, Honda Hornet 160 |
| cng | Existing | Last-mile, narrow lanes, 3-wheel | 3 | 198-236 cc | CNG factory | Bajaj RE 4S, Piaggio Ape Auto HT |
| car_compact | NEW | Ultra-budget solo, student, tight parking | 3-4 | 660 - 1000 cc, EV <30kW | Petrol, Petrol+CNG/LPG allowed, Hybrid | Suzuki Alto 800, Maruti WagonR 1000, Daihatsu Mira 660, Toyota Pixis Epoch, Nissan Dayz 660 |
| car_economy | Existing - redefined | Budget car, 2-3 pax short trip | 4 | 1001 - 1300 cc, EV 30-50kW | Petrol, Petrol+CNG, Hybrid, LPG allowed | Toyota Vitz 1000/1300, Toyota Passo 1000, Suzuki Swift 1200, Nissan March K13, Toyota Starlet 1300 |
| car_comfort | Existing - redefined | Standard Dhaka sedan, workhorse | 4 | 1301 - 1800 cc | Petrol, Hybrid, Petrol+CNG allowed. Diesel allowed | Toyota Corolla Axio 1500, Allion 1500, Premio 1500, Honda Grace 1500, Toyota Fielder 1500 |
| car_premium | Existing - tightened | Executive / business / airport | 4 | >1800 cc OR Luxury Brand >=1500 cc | Petrol, Hybrid. No CNG-converted allowed as premium | Toyota Camry 2500, Crown 2500, Harrier 2000, Honda Accord 2000, Mercedes C200, BMW 3-Series, Lexus ES300h |
| car_xl | Existing | Family / group / airport luggage | 6-7 | 1496 - 3000 cc | Any except factory CNG auto | Toyota Noah 2000, Voxy 2000, Esquire 2000, Alphard 2500, Suzuki Ertiga 1500, Mitsubishi Xpander 1500 |
Seat count = BRTA registration passenger capacity, not modified. Bike = 1 pax behind driver.

8-Category Compatible Mapping if you cannot add enum: Merge car_compact into car_economy. Rule becomes car_economy = 660-1300cc. You keep overlap problem but no code change. All other bands stay as above.

3. Deterministic Classification Rules - First Match Wins

Evaluate in this exact order. No vehicle can match two categories.

Pre-processing:
Normalize alias: Maruti = Suzuki, Daihatsu Boon = Toyota Passo, etc. Maintain Alias -> Master Model table.
Source of truth for cc/seats/body = factory catalog by brand+model+year, not driver declaration. Modified seats ignored.
If cc missing, use EV kW mapping.

Ordered Rules:

1. cng: body_type IN [auto_rickshaw, three_wheeler] OR vehicle_class = 3-wheeler -> cng. Stop.

2. Bikes: vehicle_class = 2-wheeler
   2a. cc <110 -> bike_basic
   2b. cc <150 -> bike_standard
   2c. else -> bike_plus

3. Cars - XL first: vehicle_class = 4-wheeler AND factory_seats >=6 OR body_type IN [mpv, van, minivan] AND factory_seats >=6 -> car_xl

4. car_premium: brand IN [Mercedes-Benz, BMW, Audi, Lexus, Volvo, Jaguar] AND factory_seats <=5 AND cc >=1500 OR model IN [Camry, Crown, Harrier, Alphard? no, Alphard is XL, Accord, Civic Type-R, Mark X, Cresta] AND cc >=1800 OR cc >1800 AND factory_seats <=5 -> car_premium. If vehicle age >12 years, fail this rule, fall through to comfort.

5. car_compact: cc <=1000 AND factory_seats <=5 -> car_compact (or car_economy if using 8-cat mode)

6. car_economy: cc 1001-1300 AND factory_seats <=5 -> car_economy

7. car_comfort: Everything else 4-wheeler 1301-1800cc, 4-5 seats -> car_comfort. This is catch-all.

No overlaps because XL and Premium are checked before cc bands.

4. Edge Cases

CNG-converted petrol cars: Classify by original petrol cc/seats/body. Do NOT move to cng category. cng is only for factory auto-rickshaws. For car_premium, CNG-converted vehicles are auto-demoted to car_comfort - executive pax expectation of NVH.

Locally-assembled / rebadged: Use master model mapping. E.g., Proton Saga 1300 -> maps to Saga 1300cc -> car_economy. Bangladesh-assembled Runner, Walton bikes map to their cc clone spec.

Very old vehicles 10+ years: Still classified by original spec, but with demotion: If age >12 years cannot be car_premium. If age >15 years cannot be bike_plus (safety). Platform should flag for re-inspection, but category remains deterministic.

Non-standard seat modifications: Ignore modifications. Use factory seats. Examples: Suzuki Alto factory 4 seats but modified to 3 for LPG tank -> still car_compact. Toyota Noah with added jump seats 6->8 -> still 6-seat car_xl factory. HiAce 12-15 seater is NOT allowed in any category - reject at onboarding.

5. Enum Change Flag

To implement ideal Dhaka framework you MUST add 1 new enum value: car_compact

If product requires zero backend enum change, use the MVP 8-category mapping where car_economy = 660-1300cc. Recommended migration is 9 enums. No need for 10 unless you want separate car_electric - for now map EV kW to corresponding car tiers.