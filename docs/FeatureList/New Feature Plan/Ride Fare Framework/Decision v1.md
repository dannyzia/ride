TIER CONFIG

Fuel basis:      Bike 100-125 & 150 = Petrol 140/L  |  CNG auto = CNG 43/m³
                 Cars Eco/Std/Prem = Octane 145/L (owner ruling; LNG = fallback,
                 skip CNG; log fuel type per car driver at onboarding)
Efficiency:      Bike 125: 40 km/L  |  Bike 150: 35 km/L  |  CNG: 20 km/m³
                 Car Eco: 9.5 km/L  |  Car Std: 8 km/L  |  Car Prem: 7 km/L
                 Car XL: 12 km/L (hybrid)
Maintenance:     1,850 / 2,100 / 4,500 / 5,250 / 7,250 / 10,500 / 11,500
                 BDT/month — driver-paid routine (oil, filters, brakes, tyres,
                 minor); major repairs = owner side, inside joma/50-50
Joma:            Bikes 8,000 / 10,000 / 12,000 per month  |  CNG 800/day
                 Cars all tiers incl. XL = 50% of net
Daily targets:   Bike 125: 850  |  Bike 150: 925  |  CNG: 950
                 Car Eco: 1,200  |  Car Std: 1,500  |  Car Prem: 2,000
                 Car XL: 2,200
Churn alarms:    650 / 700 / 730 / 890 / 1,250 / 1,700 / 1,700
                 (monitor only — Stage 0 telemetry sets actual triggers)
Working hours:   11 / 11 / 12 / 11 / 11 / 10 / 11
Trips/day:       14 / 14 / 16 / 10 / 9 / 8 / 7
Avg trip:        4.5 km / 20 min · 4.5 / 20 · 4.5 / 24 · 6 / 29 · 6.5 / 31 ·
                 8 / 35 · 9 / 35

FARE PARAMETERS (locked; Stage 0 calibrates)
Free radius:     1.0 / 1.5 / 2.0 km  (bike / CNG / car)
Free pickup min: 5 / 5 / 10
Free wait:       1 / 1 / 2
Night mult:      disabled (1.0) until survey round
Backstop %:      calibration-required (Stage 0 binding data)
Fuel price:      live admin config — auto-recompute on change

DISPATCH / LEADS
New-driver priority: 10 leads / 7 days
fare_engine:     'v2' — shadow-compute v6 through Stage 0; flip = Stage 1 event

KNOWN OPEN
- Utilization (time-share): #1 lever — sets time_rate truth
- Pickup charge-incidence: expect ~50-60% at current allowances vs 25-30%
  design target — Stage 0 decides: raise allowances or accept deliberately
- Car pricing posture: octane floor ~98/km realized vs market ~61 — launch
  above market or below floor as deliberate subsidy; Stage 1 decision
- Bike rent-vs-own split: all-rented base case; capture ownership at
  driver onboarding; owner-operator bike drivers = best per-driver
  economics, priority recruitment segment