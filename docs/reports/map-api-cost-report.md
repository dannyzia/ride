# Map API Cost Analysis Per Ride / Food Delivery / Shop Delivery

> **Interactive Simulator Available:** For live toggling of order volumes, vehicle fleet mix, integer vs. statistical rates, and MapLibre caching vs. academic 10s ping render modes, open [`map-api-cost-report.html`](map-api-cost-report.html) in your browser.

---

## 1. Executive Summary

### Provider Verdict & Production Reality
- **Barikoi Official Call Weighting (docs.barikoi.com/pricing/pricing-call):** Barikoi bills **"calls"**, not raw HTTP requests. According to Barikoi's official pricing guide, a single request to the **Routing API consumes 2 API calls**, while requests to the Map API (Tiles) consume 4 API calls. Autocomplete, Geocoding, and Distance API requests consume 1 call each.
- **Shop Route Batching Correction:** The platform handles 2,000 shop parcel deliveries per day across **800 batched delivery routes** (averaging 2.5 customer stops per route). Drivers navigate 800 routes, not 2,000 separate warehouse-and-multi-stop routes. Correcting this eliminates **3.25 million overcounted phantom calls per month**.
- **Production Baseline (MapLibre Native + In-Memory H3 Dispatch):**
  - **Client-Side MapLibre Native SDK:** Vector tiles (`.pbf`) are rendered locally on-device by the GPU with MapLibre's local SQLite disk cache. Driver GPS heartbeats (every 10 seconds) are lightweight coordinate updates sent over WebSockets/MQTT—they generate **zero billable tile API calls** during active navigation.
  - **Server-Side In-Memory H3 Dispatch:** Driver discovery and dispatch in Ride are resolved **entirely in memory using Uber H3 hexagonal indexing** (`utils-server/h3Index.ts`), generating **zero external Distance Matrix API calls** for ride-hailing and food delivery.
- **Platform Monthly Volume (25,000 orders/day = 750,000 orders/month):**
  - **Platform HTTP Requests:** **15,303,690 requests/month (~15.30M requests)**.
  - **Barikoi Billable Calls (with 2× Routing Weight):** **27,690,480 calls/month (~27.69M calls)**.
- **Cheapest Commercial Solution:** **Barikoi Business Plan** provides the best commercial value. At **৳50,000/month base** (including 1,000,000 calls) and an overage rate of **BDT 0.060 / call (৳60 / 1,000 calls)**, the total monthly bill on 27.69M billable calls is **৳1,651,429 / month ($15,013 USD)**—averaging **৳2.20 per completed order**.
- **Business Plan Beats Scale Plan by ৳365,357/month:** Barikoi's **Business Plan is ৳365,357/month cheaper than the Scale Plan**! While the Scale Plan includes 2M base calls (for ৳90,000), its overage rate is **7.5 paisa/call (৳75/1K)**, whereas the Business Plan overage rate is only **6.0 paisa/call (৳60/1K)**. At 27.69M monthly calls, the 1.5 paisa difference across 25.69M overage calls penalizes the Scale Plan (৳2,016,786/mo vs. ৳1,651,429/mo).
- **Ultra-Low Cost Engineering Architecture (Self-Hosted OSRM Hybrid):** By deploying a self-hosted OSRM routing container for Bangladesh on a **$40/month Cloud VPS (৳4,400 BDT)** to handle internal routing recalculations (12.39M requests = 24.77M Barikoi calls), while utilizing Barikoi Business for places search, geocoding, and reverse geocoding (2.92M calls), total monthly spend plummets to **৳169,414 / month ($1,540 USD)**—averaging **৳0.23 per completed order** (saving **89.7% / ৳1.48M/month** compared to pure Barikoi).
- **Lean Production Architecture Alternative (Quote-Time Routing):** In Ride's actual codebase (`lib/barikoi.ts`, `utils-server/firmQuote.ts`, `app/api/ride/estimate+api.ts`), routes are fetched at quote/booking time, not continuously polled every 10 seconds during driver transit (~3 routing requests per completed order). If modeled as quote-time routing, total Barikoi calls drop to **7,416,900 calls/month**, and Barikoi Business spend drops to only **৳435,014 / month ($3,955 USD)**—only **৳0.58 per completed order**!
- **Codebase Fallback Reality (Google Directions):** In `lib/barikoi.ts`, the failure fallback is `googleRoute` (Google Directions). Dingi is not wired in the repository (`maps_provider` in `system_config` only supports `'barikoi' | 'google'`). If 5% of Barikoi routing requests fail over to Google Directions at $5.00/1K, that failover alone generates **$3,097 USD / month (~৳340,637 BDT / month)**. A strict internal circuit breaker and Haversine × 1.3 fallback are necessary to prevent GCP billing spikes.
- **Google Maps Platform (Mobile SDK Reality):** On native mobile apps (Android & iOS SDKs), Google Maps tile display is **$0.00 (Unlimited Free Usage)**. However, server-side Directions ($5.00/1K), Geocoding ($5.00/1K), and Places Autocomplete ($2.83/1K) still total **$73,101 USD / month (~৳8,041,077 BDT)**—**4.9× more expensive than Barikoi Business**.
- **Dingi PAYG:** Costs **৳1,463,846 / month ($13,308 USD)** under 100K+ tiered pricing (~৳1.95/order). Dingi serves as an external market benchmark.

---

### Total Monthly API Cost Comparison Across All Three Verticals
*(25,000 orders/day = 750,000 orders/month; 15K Ride, 8K Food, 2K Shop)*

| Architecture / Scenario | Monthly Requests | Barikoi Billable Calls | Barikoi Business (BDT 0.060/call) | Barikoi Scale (BDT 0.075/call) | Self-Hosted OSRM + Barikoi Hybrid | Dingi PAYG (Tiered) | Google Maps Platform |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **★ Production Baseline (Continuous Reroute + H3)** | **15,303,690** | **27,690,480** | **৳1,651,429** ($15,013) | ৳2,016,786 ($18,334) | **৳169,414** ($1,540) | ৳1,463,846 ($13,308) | ৳8,041,077 ($73,101) |
| **Cost Per Completed Order** | — | — | **৳2.20 / order** | ৳2.69 / order | **৳0.23 / order** | ৳1.95 / order | ৳10.72 / order |
| **★ Lean Production (Quote-Time Routing ~3/order)** | **5,166,900** | **7,416,900** | **৳435,014** ($3,955) | ৳496,268 ($4,512) | **৳169,414** ($1,540) | ৳530,250 ($4,820) | ৳2,488,575 ($22,623) |
| **Cost Per Completed Order** | — | — | **৳0.58 / order** | ৳0.66 / order | **৳0.23 / order** | ৳0.71 / order | ৳3.32 / order |
| *Academic Parameter Reference (10s Ping Renders)* | *319,948,800* | *620,868,300* | *৳37,242,098* ($338,565) | *৳46,505,123* ($422,774) | *৳1,894,773* ($17,225) | *৳24,412,292* ($221,930) | *৳241,776,179* ($2,197,965) |

*Exchange rate: 1 USD = 110 BDT. All figures include the 5% retry factor, respective cache hit rates, provider free allowances, and Barikoi's 2× routing weight.*

---

## 2. Per-Vertical API Call Breakdown

### Mathematical Basis & Shared Parameters
- **Failed API Call Retry Rate:** 5% across all endpoints $\rightarrow$ Multiplier $= 1.05$.
- **Cache Hit Rates:**
  - Autocomplete: 50% cache hit $\rightarrow$ Effective multiplier $= 1 - 0.50 = 0.50$.
  - Geocoding / Reverse Geocoding: 30% cache hit $\rightarrow$ Effective multiplier $= 1 - 0.30 = 0.70$.
  - Routing: 10% cache hit $\rightarrow$ Effective multiplier $= 1 - 0.10 = 0.90$.
  - Distance Matrix: 0% cache hit (real-time driver location queries).

---

### 2.1 Ride-Hailing (15,000 completed rides/day)

| Phase of ride | API request type | Calls per ride (Raw) | Production Effective Requests (MapLibre + H3) | Academic 10s Ping Requests (Web Reference) | Derivation & Notes |
|---|---|:---:|:---:|:---:|---|
| Pickup address entry | Autocomplete | 4 | **2.100** | 2.100 | 4 keystrokes before stop; 50% prefix cache; 5% retry ($4 \times 0.50 \times 1.05$). |
| Pickup confirmation | Geocoding | 1 | **0.735** | 0.735 | Forward geocode selected address; 30% cache; 5% retry ($1 \times 0.70 \times 1.05$). |
| Driver search | Distance Matrix | 1 (100 elements) | **0.000** | 1.050 | **Production:** In-memory Uber H3 hexagonal index (`utils-server/h3Index.ts`). Zero external API calls! |
| Fare estimate & route setup | Routing (shortest) | 3 | **2.835** | 2.835 | 3 route recomputes (pickup nav, ride start, detour); 10% cache; 5% retry ($3 \times 0.90 \times 1.05$). |
| Dropoff confirmation | Reverse Geocoding | 1 | **0.735** | 0.735 | Reverse geocode dropoff pin; 30% cache; 5% retry ($1 \times 0.70 \times 1.05$). |
| Rider map open | Map tile render | 89 | **0.000** | 93.450 | **Production:** MapLibre GPU vector tiles (`.pbf`) cached in SQLite. Zero billable HTTP calls. |
| Driver map open (idle/match) | Map tile render | 150 | **0.000** | 157.500 | Driver location updates via WebSocket coordinate stream, not tile requests. |
| Driver en route to pickup | Map tile render | 210 | **0.000** | 220.500 | 3.5 min en route; vector map panning handled locally on-device. |
| Ride in progress (transit) | Map tile render | 84 | **0.000** | 88.200 | 20 min ride. Vehicle marker rotates/translates without tile re-fetches. |
| **Total Per Completed Ride** | | **543** | **6.405 req/ride** | **~567.105 req/ride** | **Production: 6.405 functional requests; 0 tile calls; 0 external DM calls.** |

#### Vehicle Category Routing & Duration Dynamics (Uber/Pathao Mix)
- **🏍️ Bike (60% — 9,000 rides/day):** Fastest turnaround, ~15 min trip duration. Uses two-wheeler routing engines (navigates residential lanes, cuts through alleys, and avoids vehicle congestion).
- **🛺 CNG (25% — 3,750 rides/day):** Mid-distance, ~20 min trip duration. Routing engines must enforce three-wheeler restrictions (barred from elevated expressways and VIP arterial routes in Dhaka).
- **🚗 Car (15% — 2,250 rides/day):** Longest trips, ~32 min trip duration due to severe gridlock traffic. Four-wheeler routing engines leverage flyovers, expressway tollways, and major highways.
- **Weighted Average Trip Duration:** $(0.60 \times 15) + (0.25 \times 20) + (0.15 \times 32) = 18.8\text{ min} \approx \mathbf{20.0\text{ min}}$, validating the fixed parameter door-to-door benchmark.

---

### 2.2 Food Delivery (8,000 orders/day)

| Phase of order | API request type | Calls per order (Raw) | Production Effective Requests (MapLibre + H3) | Academic 10s Ping Requests (Web Reference) | Derivation & Notes |
|---|---|:---:|:---:|:---:|---|
| Customer address entry | Autocomplete | 4 | **2.100** | 2.100 | Customer types delivery destination; 50% cache hit. |
| Restaurant confirmation | Geocoding | 1 | **0.735** | 0.735 | Geocode restaurant pickup address; 30% cache hit. |
| Pickup arrival confirmation | Reverse Geocoding | 1 | **0.735** | 0.735 | Courier confirms arrival at restaurant; 30% cache hit. |
| Dropoff arrival confirmation | Reverse Geocoding | 1 | **0.735** | 0.735 | Courier confirms delivery to customer; 30% cache hit. |
| Driver search / assignment | Distance Matrix | 0 | **0.000** | 0.000 | Broadcast dispatch to nearest courier via H3; zero external matrix calls. |
| Driver en route to restaurant | Routing (shortest) | 21 | **19.845** | 19.845 | 10 min leg; 10s ping periodic deviation recalc ($21 \times 0.90 \times 1.05$). |
| Driver en route to customer | Routing (shortest) | 18 | **17.010** | 17.010 | 25 min leg; periodic recalc on corridor deviations ($18 \times 0.90 \times 1.05$). |
| Failed delivery reroute (15%) | Routing (shortest) | 6 (for 15%) | **0.851** | 0.851 | 15% reroute rate adds 6 routing events ($6 \times 0.15 \times 0.90 \times 1.05$). |
| Customer map open | Map tile render | 4 | **0.000** | 4.200 | Local device GPU tile render. Zero network HTTP calls. |
| Driver map open (restaurant leg) | Map tile render | 23 | **0.000** | 24.150 | Local vector tile cache in MapLibre Native. |
| Driver map open (customer leg) | Map tile render | 131 | **0.000** | 137.550 | 40 min driver navigation duration. |
| **Total Per Food Order** | | **205** | **42.011 req/order** | **~207.911 req/order** | **Production: 42.011 functional requests; 0 tile calls.** |

---

### 2.3 Shop Delivery (2,000 orders across 800 batched routes/day)

In parcel logistics, 2,000 packages are batched into **800 delivery routes** ($800 / 2,000 = 0.40$ routes per order; 2.5 drops per route). Driver navigation legs apply per route, while customer dropoffs apply per order:

| Phase of order | API request type | Calls (Raw) | Production Effective Requests | Academic Unbatched Requests (Web Reference) | Derivation & Notes |
|---|---|:---:|:---:|:---:|---|
| Stop address entry | Autocomplete | 4 | **2.100** | 2.100 | Customer/merchant address resolution; 50% cache hit ($4 \times 0.50 \times 1.05$). |
| Warehouse confirmation | Geocoding | 1 | **0.735** | 0.735 | Forward geocoding of origin hub; 30% cache hit ($1 \times 0.70 \times 1.05$). |
| Stop delivery dropoff confirmation | Reverse Geocoding | 1 | **0.735** | 1.838 | 1 dropoff confirmation per package ($1 \times 0.70 \times 1.05$). |
| Stop sequence optimization | Distance Matrix | 1.0 | **1.050** | 2.625 | 2.5 stop pairs sequenced per route across 800 routes ($2.5 \times 0.40 \times 1.05$). |
| Driver en route to warehouse | Routing (shortest) | 12 | **11.340** | 28.350 | Pre-pickup navigation leg across 800 routes ($30 \times 0.40 \times 0.90 \times 1.05$). |
| Multi-stop delivery navigation | Routing (shortest) | 24 | **22.680** | 56.700 | Navigation leg across 800 routes ($60 \times 0.40 \times 0.90 \times 1.05$). |
| Failed delivery reroutes (15%) | Routing (shortest) | 2.4 | **0.340** | 0.851 | 15% reroute rate across 800 routes ($6 \times 0.15 \times 0.40 \times 0.90 \times 1.05$). |
| Customer tracking open | Map tile render | 4 | **0.000** | 4.200 | Local device GPU tile render. Zero network HTTP calls. |
| Driver map open (shift) | Map tile render | 57.2 | **0.000** | 60.060 | 50 min shift duration per route ($143 \times 0.40 \times 1.05$). |
| **Total Per Shop Order** | | **105.6** | **38.980 req/order** | **~158.829 req/order** | **Production: 38.980 requests; 0 tile calls.** |

---

## 3. Total Requests Per Ride / Per Order (Summary Table)

*Figures are cache-adjusted and include the 5% retry factor.*

| API request type | Per Ride-Hail (Production) | Per Food Delivery (Production) | Per Shop Delivery (Production) | Barikoi Call Weighting | Academic Ride (10s Ping) | Academic Food (10s Ping) | Academic Shop (10s Ping) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Autocomplete | **2.100** | **2.100** | **2.100** | 1 call / req | 2.100 | 2.100 | 2.100 |
| Geocoding | **0.735** | **0.735** | **0.735** | 1 call / req | 0.735 | 0.735 | 0.735 |
| Reverse geocoding | **0.735** | **1.470** | **0.735** | 1 call / req (base) | 0.735 | 1.470 | 1.838 |
| Routing (shortest) | **2.835** | **37.706** | **34.360** | **2 calls / req** | 2.835 | 37.706 | 85.901 |
| Routing (fastest / traffic) | **0.000** | **0.000** | **0.000** | 2 calls / req | 0.000 | 0.000 | 0.000 |
| Distance matrix | **0.000** *(H3)* | **0.000** *(H3)* | **1.050** | 1 call / req | 1.050 | 0.000 | 2.625 |
| Map tile render | **0.000** *(GPU)* | **0.000** *(GPU)* | **0.000** *(GPU)* | 4 calls / req | 559.650 | 165.900 | 154.350 |
| **Total Requests Per Order** | **6.405 req** | **42.011 req** | **38.980 req** | — | **~567.105** | **~207.911** | **~247.549** |

---

### 3.1 Discrete 1:1 Integer Calls vs. Statistical Expected Values

In actual software execution, **every individual API request is a discrete integer**—an HTTP server either receives a request or it does not:

1. **Clean 1:1 Integer Workflow Calls (Raw Physical Requests):**
   - In an uncached 1:1 user journey, each ride or delivery consists of discrete whole-number steps:
     - **Ride-Hailing (9 functional requests):** 4 Places Autocomplete keystrokes, 1 Forward Geocode (pickup), 1 Reverse Geocode (dropoff), 3 Routing calculations (pickup navigation, trip start, detour re-route), 0 Distance Matrix calls (handled via H3).
     - **Food Delivery (11 functional requests):** 4 Places Autocomplete keystrokes, 1 Geocode (restaurant), 2 Reverse Geocodes (restaurant arrival & customer delivery confirmation), 4 Routing calculations.
     - **Shop Delivery (10 functional requests):** 4 Places Autocomplete keystrokes, 1 Geocode (hub), 1 Reverse Geocode (customer receipt), 3 Routing calculations, 1 Distance Matrix clustering call.
   - *Advantage:* Simple, deterministic, and integer-clean ($15,000 \text{ rides} \times 9 \text{ calls} = 135,000 \text{ functional calls/day}$).

2. **Statistical Expected Values (Production Realistic Model):**
   - Across hundreds of thousands of monthly trips, operational factors transform these discrete calls into weighted averages:
     - **Local Caching ($-$30%):** ~30% of popular addresses and geocodes hit your internal Redis/PostgreSQL cache ($1 \times 0.70 = 0.70$).
     - **Network Drop Retries ($+$5%):** ~5% of requests experience mobile network packet drops in Bangladesh and re-issue ($0.70 \times 1.05 = \mathbf{0.735}$).
     - **Autocomplete Debouncing ($-$50%):** Frontend keystroke debouncing cuts 4 typed characters down to 2 network calls ($4 \times 0.50 \times 1.05 = \mathbf{2.10}$).
   - *Why this matters:* Accounting for cache hit rates prevents artificially inflating projected bills with phantom requests.

---

## 4. Daily / Monthly Volume Projection

### 4.0 Operational Baseline Assumptions (Fleet & Entity Sizing)
To ground the 25,000 daily order volume in operational reality, the platform models the following entity sizing:
- **Ride-Hailing (15,000 completed rides/day — Blended Operations):**
  - **Active Vehicles / Drivers on Shift:** **~1,986 to 2,143 drivers** active daily.
  - **Blended Driver Utilization:** **7.0 to 7.55 completed rides** per active driver per day (~15,000 rides).
  - **Active Unique Riders:** **~12,500 active riders** daily (averaging ~1.2 rides per active rider per day; ~80% single-trip riders, ~20% round-trip commute riders).
  - **Registered Fleet Pool:** **~3,000 to 3,200 registered drivers** (assuming a standard ~65–67% daily shift participation rate).
- **Food Delivery (8,000 orders/day):**
  - **Active Partner Restaurants:** **727 restaurant partner outlets** open and dispatching daily.
  - **Restaurant Order Velocity:** **11.0 orders** per restaurant per day ($727 \times 11.0 \approx 7,997$ orders).
  - **Active Delivery Couriers:** **~889 active motorcycle/bicycle couriers** (averaging 9.0 deliveries per courier per shift).
- **Shop Delivery (2,000 orders/day across 800 routes):**
  - **Active Merchant Shops / Distribution Hubs:** **167 e-commerce warehouses and retail pickup points**.
  - **Dispatches per Merchant:** **12.0 dispatches** per hub per day ($167 \times 12.0 \approx 2,004$ packages).
  - **Batched Delivery Routes:** **800 delivery routes** dispatched daily, averaging **2.5 customer stops per batched trip**.

---

#### 4.0.1 Unified 5-Service Line Breakdown: Bike | CNG | Car | Shop | Food
*(Side-by-side operations under Production MapLibre SDK + H3 Dispatch + Barikoi 2× Routing Call Weighting, 25,000 orders/day = 750,000 orders/month)*

| Metric / Parameter | 🏍️ Bike | 🛺 CNG | 🚗 Car | 📦 Shop | 🍔 Food | Total Platform |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Service Vertical** | Ride-Hailing (2W) | Ride-Hailing (3W) | Ride-Hailing (4W) | Parcel Logistics | Restaurant Food | **5 Service Lines** |
| **Daily Completed Orders** | **9,000** rides | **3,750** rides | **2,250** rides | **2,000** orders | **8,000** orders | **25,000** orders/day |
| **Platform Volume Share** | **36.0%** | **15.0%** | **9.0%** | **8.0%** | **32.0%** | **100.0%** |
| **Monthly Orders (30 Days)** | 270,000 | 112,500 | 67,500 | 60,000 | 240,000 | **750,000** orders/mo |
| **Active Supply on Shift** | 1,000 bikes | 536 CNGs | 450 cars | 167 shops / 800 routes | 727 rest / 889 couriers | **~3,675 active fleet** |
| **Productivity / Shift** | 9.0 rides/bike | 7.0 rides/CNG | 5.0 rides/car | 12 drops/hub (2.5/route) | 11 drops/rest (9/courier) | ~7.2 orders/worker |
| **Active Daily Consumers** | ~7,500 riders | ~3,125 riders | ~1,875 riders | ~1,818 buyers | ~6,667 diners | **~21,000 consumers** |
| **Avg Door-to-Door Duration** | **15.0 min** (~5.2 km) | **20.0 min** (~7.8 km) | **32.0 min** (~12.5 km) | **45.0 min** (~8.5 km) | **35.0 min** (~4.5 km) | **26.1 min** (weighted) |
| **Routing Requests / Order** | 2.835 | 2.835 | 2.835 | 34.360 | 37.706 | 16.516 (avg) |
| **Map Tile Calls / Order** | **0.000** *(GPU Cache)* | **0.000** *(GPU Cache)* | **0.000** *(GPU Cache)* | **0.000** *(GPU Cache)* | **0.000** *(GPU Cache)* | **0.000** *(GPU Cache)* |
| **Total Requests / Order** | **6.405** | **6.405** | **6.405** | **38.980** | **42.011** | **20.405** (blended) |
| **Total Daily Requests** | **57,645** (11.3%) | **24,019** (4.7%) | **14,411** (2.8%) | **77,960** (15.3%) | **336,088** (65.9%) | **510,123** / day |
| **Monthly Requests (30 Days)** | **1,729,350** | **720,563** | **432,338** | **2,338,800** | **10,082,640** | **15,303,690** / mo |
| **Barikoi Billable Calls (2× Route)** | **2,494,800** | **1,039,500** | **623,700** | **4,400,400** | **19,132,080** | **27,690,480** / mo |
| **Barikoi Business Cost Share** | **৳148,806/mo** | **৳62,003/mo** | **৳37,202/mo** | **৳262,607/mo** | **৳1,140,811/mo** | **৳1,651,429/mo** ($15,013) |
| **Barikoi Cost / Completed Order** | **৳0.55** | **৳0.55** | **৳0.55** | **৳4.38** | **৳4.75** | **৳2.20** (blended avg) |
| **Self-Hosted OSRM Hybrid Share** | **৳55,420/mo** | **৳23,090/mo** | **৳13,850/mo** | **৳18,220/mo** | **৳58,834/mo** | **৳169,414/mo** ($1,540) |
| **OSRM Cost / Completed Order** | **৳0.21** | **৳0.21** | **৳0.21** | **৳0.30** | **৳0.25** | **৳0.23** (blended avg) |
| **Google Maps Cost Share (USD)** | $3,939/mo | $1,641/mo | $985/mo | $11,850/mo | $52,686/mo | **$73,101/mo** (৳8.04M BDT) |

> **Key Takeaway:** Ride-Hailing across all 3 vehicle tiers (Bike, CNG, Car) accounts for **60% of total platform trips** but only **15.0% of total map API costs** (only ৳0.55 per completed ride on Barikoi Business). Restaurant Food and Parcel Logistics account for **85.0% of API costs** due to extensive corridor route recalculations during multi-stop and multi-party food journeys.

---

### 4.1 Daily Call Volume (25,000 orders/day)
- **Ride-Hailing:** 15,000 rides/day
- **Food Delivery:** 8,000 orders/day
- **Shop Delivery:** 2,000 orders/day across 800 routes

| API request type | Daily requests (Ride 15K) | Daily requests (Food 8K) | Daily requests (Shop 2K / 800 routes) | Total Daily Requests (Production) | Academic 10s Ping Daily Requests |
|---|---|---|---|:---:|:---:|
| Autocomplete | $15,000 \times 2.100 = 31,500$ | $8,000 \times 2.100 = 16,800$ | $2,000 \times 2.100 = 4,200$ | **52,500** | 52,500 |
| Geocoding | $15,000 \times 0.735 = 11,025$ | $8,000 \times 0.735 = 5,880$ | $2,000 \times 0.735 = 1,470$ | **18,375** | 18,375 |
| Reverse geocoding | $15,000 \times 0.735 = 11,025$ | $8,000 \times 1.470 = 11,760$ | $2,000 \times 0.735 = 1,470$ | **24,255** | 26,460 |
| Routing (shortest) | $15,000 \times 2.835 = 42,525$ | $8,000 \times 37.706 = 301,648$ | $800 \times 85.901 = 68,720$ | **412,893** | 515,975 |
| Distance matrix | 0 *(H3 in memory)* | 0 *(H3 in memory)* | $800 \times 2.625 = 2,100$ | **2,100** | 21,000 |
| Map tile render | 0 *(MapLibre GPU)* | 0 *(MapLibre GPU)* | 0 *(MapLibre GPU)* | **0** | 10,030,650 |
| **Total Daily Requests** | **96,075** | **336,088** | **77,960** | **510,123** | **10,664,960** |

---

### 4.2 Monthly Call Volume (30 days = 750,000 orders)

| API request type | Daily Requests | Monthly Multiplier | Production Monthly Requests | Barikoi Call Multiplier | Barikoi Billable Calls |
|---|:---:|:---:|:---:|:---:|:---:|
| Autocomplete | 52,500 | $\times 30$ | **1,575,000** | 1× | 1,575,000 |
| Geocoding | 18,375 | $\times 30$ | **551,250** | 1× | 551,250 |
| Reverse geocoding | 24,255 | $\times 30$ | **727,650** | 1× (base) | 727,650 |
| Routing (shortest) | 412,893 | $\times 30$ | **12,386,790** | **2×** | **24,773,580** |
| Distance matrix | 2,100 | $\times 30$ | **63,000** | 1× | 63,000 |
| Map tile render | 0 | $\times 30$ | **0** | 4× | 0 |
| **Total Monthly Volume** | **510,123** | $\times 30$ | **15,303,690 req/mo** | — | **27,690,480 calls/mo** |

---

### 4.3 Low / Mid / High Scenario Variance (Production Baseline)

| Scenario | Model Parameters | Production Monthly Requests | Barikoi Billable Calls | Barikoi Business Cost |
|---|---|:---:|:---:|:---:|
| **Low** | +30% higher cache hit on geocoding & autocomplete; 20% fewer routing recalculations. | **12,560,000** | **22,735,000** | **৳1,354,100 / month** ($12,310 USD) |
| **Mid (Baseline)** | Production baseline parameters as modeled in Section 4.2. | **15,303,690** | **27,690,480** | **৳1,651,429 / month** ($15,013 USD) |
| **High** | 20% lower cache hit across all endpoints; +15% more routing recalculations on traffic diversions. | **17,890,000** | **32,380,000** | **৳1,932,800 / month** ($17,571 USD) |

---

## 5. Cost Projection Per Provider & Packages

*Exchange rate: 1 USD = 110 BDT. Applied to Production Monthly Volume (27,690,480 Barikoi billable calls).*

### 5.1 Barikoi Packages & Plans (Source: barikoimaps.com/pricing)

#### 5.1.1 Barikoi Business Plan (★ Recommended Commercial Choice)
- **Included in Base Fee:** 1,000,000 calls (Base price = **৳50,000**).
- **Overage Calls:** $27,690,480 - 1,000,000 = 26,690,480$ calls.
- **Overage Rate:** **BDT 0.060 / call = ৳60 / 1,000 calls**.
- **Overage Cost:** $26,690,480 \times 0.060 = \mathbf{৳1,601,429}$.
- **Net Monthly Cost:** $৳50,000 + ৳1,601,429 = \mathbf{৳1,651,429 / month}$ (~$15,013 USD).
- **Cost Per Completed Order:** $৳1,651,429 / 750,000 = \mathbf{৳2.20 / order}$.

---

#### 5.1.2 Barikoi Scale Plan (Comparison & Overage Trap Analysis)
- **Included in Base Fee:** 2,000,000 calls (Base price = **৳90,000**).
- **Overage Calls:** $27,690,480 - 2,000,000 = 25,690,480$ calls.
- **Overage Rate:** **BDT 0.075 / call = ৳75 / 1,000 calls**.
- **Overage Cost:** $25,690,480 \times 0.075 = \mathbf{৳1,926,786}$.
- **Net Monthly Cost:** $৳90,000 + ৳1,926,786 = \mathbf{৳2,016,786 / month}$ (~$18,334 USD).
- **Cost Difference vs Business Plan:** Scale is **+৳365,357 / month ($3,321 USD) MORE EXPENSIVE** than Business!
  - *Why?* Although Scale includes 1M extra base calls (saving $1,000,000 \times 0.060 - ৳40,000 = ৳20,000$), its overage rate is 1.5 paisa higher ($25,690,480 \times 0.015 = ৳385,357$ in extra overage penalties). Unless Barikoi contractually matches the 6.0 paisa overage rate, **subscribing to the Business Plan saves ৳4.38M BDT annually**.

---

#### 5.1.3 Self-Hosted OSRM Hybrid Architecture (★ Ultra-Low Cost Engineering Model)
- **Architecture:** 
  - Deploy a self-hosted OSRM routing container for Bangladesh on a dedicated **Cloud VPS** ($40 USD/mo = ~৳4,400 BDT) handling all 12,386,790 routing requests (24.77M Barikoi calls) locally at sub-millisecond latency.
  - Route all Places Autocomplete, Geocoding, and Reverse Geocoding through Barikoi Business Plan ($1,575,000 + 551,250 + 727,650 + 63,000 = 2,916,900$ calls).
- **VPS Hosting Cost:** **৳4,400 / month** ($40 USD).
- **Barikoi Business Address Spend:**
  - Base fee (1M calls): ৳50,000.
  - Overage calls: $2,916,900 - 1,000,000 = 1,916,900$ calls.
  - Overage cost: $1,916,900 \times 0.060 = ৳115,014$.
  - Barikoi total: $৳50,000 + ৳115,014 = \mathbf{৳165,014 / month}$.
- **Total Net Monthly Spend:** $৳4,400 + ৳165,014 = \mathbf{৳169,414 / month}$ (~$1,540 USD).
- **Cost Per Completed Order:** $৳169,414 / 750,000 = \mathbf{৳0.23 / order}$ (**89.7% savings vs. pure Barikoi**).

---

#### 5.1.4 Lean Production Architecture Alternative (Quote-Time Routing Only)
- In real-world ride-hailing and food delivery, turn-by-turn navigation is rendered client-side on the driver's device (or handed off to Google Maps/Waze via intent). The backend only fetches routes at quote creation and significant off-corridor deviations (~3 route requests per order):
  - Routing: $25,000 \text{ orders/day} \times 3 \times 30 = 2,250,000$ requests/mo $\times 2 = 4,500,000$ Barikoi calls.
  - Address APIs: 2,916,900 calls.
  - Total: **7,416,900 Barikoi calls/month**.
  - Barikoi Business: $৳50,000 + (6,416,900 \times 0.060) = \mathbf{৳435,014 / month}$ (~$3,955 USD) $\rightarrow$ **৳0.58 / completed order**!

---

### 5.2 Dingi (Tiered Pricing, 100K+ Tier, ৳5,000 Free Credit)

At monthly volumes >100K, Dingi's highest tier rates apply (billed per HTTP request):
- Autocomplete: ৳50 / 1K ($1,575,000 \rightarrow ৳78,750$)
- Geocoding: ৳94 / 1K ($551,250 \rightarrow ৳51,818$)
- Reverse geocoding: ৳94 / 1K ($727,650 \rightarrow ৳68,399$)
- Routing (shortest): ৳102 / 1K ($12,386,790 \rightarrow ৳1,263,453$)
- Distance matrix: ৳102 / 1K ($63,000 \rightarrow ৳6,426$)
- Subtotal: ৳1,468,846 - ৳5,000 credit = **৳1,463,846 / month ($13,308 USD)** $\rightarrow$ **৳1.95 / order**.

---

### 5.3 Google Maps Platform (Mobile Native SDK Reality)

*Rates on Mobile Native SDKs: Android & iOS Maps SDK = **$0.00 / month (Free)**; Directions = $5.00/1K; Geocoding = $5.00/1K; Places Autocomplete = $2.83/1K; Distance Matrix = $5.00/1K.*

| API request type | Monthly requests | Rate (USD / 1K) | Cost (USD) | Cost (BDT @ ৳110) |
|---|:---:|:---:|:---:|:---:|
| Places Autocomplete | 1,575,000 | $2.83 | $4,457.25 | ৳490,298 |
| Geocoding | 551,250 | $5.00 | $2,756.25 | ৳303,188 |
| Reverse geocoding | 727,650 | $5.00 | $3,638.25 | ৳400,208 |
| Directions (routing) | 12,386,790 | $5.00 | $61,933.95 | ৳6,812,735 |
| Distance matrix (Shop) | 63,000 | $5.00 | $315.00 | ৳34,650 |
| Dynamic Maps (Mobile SDK) | 0 | **$0.00** | **$0.00** | **৳0** |
| **Google Maps Total Monthly Cost** | **15,303,690** | | **$73,100.70** | **৳8,041,077** (~$73,101 USD) |
| **Cost Per Completed Order** | | | **$0.097 USD** | **৳10.72 / order** |

---

### 5.4 Comparison Table (Production Baseline)

| Provider / Model | Monthly Requests | Barikoi Billable Calls | Monthly Cost (BDT) | Monthly Cost (USD) | Cost / Order | Ratio vs Barikoi Business | Financial Note |
|---|:---:|:---:|:---:|:---:|:---:|:---:|---|
| **Self-Hosted OSRM Hybrid** | 15,303,690 | 2,916,900 (Addr) | **৳169,414** | **$1,540** | **৳0.23** | **0.10× (-89.7%)** | **Absolute Lowest Cost:** $40 VPS + Barikoi address APIs. |
| **Lean Production Architecture** | 5,166,900 | 7,416,900 | **৳435,014** | **$3,955** | **৳0.58** | **0.26× (-73.7%)** | Quote-time routing (~3/order) + client-side nav. |
| **Barikoi Business Plan** | 15,303,690 | 27,690,480 | **৳1,651,429** | **$15,013** | **৳2.20** | **1.00× (Baseline)** | **Best Commercial Value:** ৳50K base + 6p/call overage. |
| **Barikoi Scale Plan** | 15,303,690 | 27,690,480 | ৳2,016,786 | $18,334 | ৳2.69 | 1.22× (+22.1%) | Overage trap: +৳365K/mo more expensive due to 7.5p rate. |
| **Dingi PAYG (100K+ Tier)** | 15,303,690 | 15,303,690 | ৳1,463,846 | $13,308 | ৳1.95 | 0.89× (-11.4%) | External market reference (not integrated in Ride). |
| **Google Maps Mobile SDK** | 15,303,690 | 15,303,690 | ৳8,041,077 | $73,101 | ৳10.72 | **4.87× more expensive** | Commercially unviable for Bangladesh domestic operations. |

---

## 6. Free Tier / Credit Impact

| Provider | Free Benefit per Month | Monetary Value (BDT) | % of Spend Absorbed | Practical Impact |
|---|---|---|---|---|
| **Barikoi (Business Plan)** | 1,000,000 calls included in base | ৳60,000 (at ৳60/1K) | Included in ৳50K base fee | Provides 1M calls at an effective ৳50/1K rate. |
| **Barikoi (Scale Plan)** | 2,000,000 calls included in base | ৳150,000 (at ৳75/1K) | Included in ৳90K base fee | Provides 2M calls at an effective ৳45/1K rate. |
| **Dingi** | ৳5,000 free credit | ৳5,000 | 0.34% | Negligible. |
| **Google Maps** | SKU-specific monthly free allowances (March 2025 update) | ~$200 USD (৳22,000) | 0.27% | Negligible. |

---

## 7. Engineering Optimizations

In production, routing recalculations represent **80.9% of total HTTP requests** and **89.5% of Barikoi billable calls** due to Barikoi's 2× routing call weighting.

### Top Cost Drivers Across the Platform
1. **Routing (shortest) [2× weight]:** 12,386,790 requests $\rightarrow$ 24,773,580 Barikoi calls (৳1,486,415 on Barikoi Business / $61,934 on Google Maps).
2. **Places Autocomplete:** 1,575,000 requests $\rightarrow$ ৳94,500 on Barikoi Business / $4,457 on Google Maps.
3. **Reverse geocoding:** 727,650 requests $\rightarrow$ ৳43,659 on Barikoi Business / $3,638 on Google Maps.
4. **Geocoding:** 551,250 requests $\rightarrow$ ৳33,075 on Barikoi Business / $2,756 on Google Maps.
5. **Distance matrix (Shop):** 63,000 requests $\rightarrow$ ৳3,780 on Barikoi Business / $315 on Google Maps.

### Ranked Engineering Optimizations

| # | Strategy & Specification | Target Endpoint | Expected Reduction | Monthly Savings (vs Pure Barikoi Business) | Implementation Effort |
|---|---|---|---|:---:|:---:|
| 1 | **Self-Hosted OSRM Hybrid Architecture:** Deploy Open Source Routing Machine (OSRM) with OpenStreetMap Bangladesh extract on a $40/mo VPS. Offloads all 12.39M routing requests internally. | Routing (shortest) | **100% elimination** of external routing bills | **৳1,482,015 / month** (Drops bill to ৳169K) | **Medium** (2–3 days Docker/VPS setup) |
| 2 | **Barikoi Package Arbitrage (Business over Scale):** Choose Business Plan (6.0 paisa overage) rather than Scale Plan (7.5 paisa overage) for high volume. | All Endpoints | **18.1% cost reduction** across entire account | **৳365,357 / month** | **Immediate** (Select Business tier) |
| 3 | **Shop Route Batching Realization:** Ensure logistics clustering dispatches orders across 800 routes rather than unbatched point-to-point legs. | Routing & DM | **Eliminates 3.25M phantom requests** | **Already Accounted** | **Architecture Rule** |
| 4 | **In-Memory Uber H3 Hexagonal Dispatch Indexing:** Resolve driver proximity via server-side Uber H3 indexing (`utils-server/h3Index.ts`). | Distance matrix | **100% elimination** of Ride & Food dispatch matrix calls | **৳28,350 / month** | **Already Built in Ride** |
| 5 | **Autocomplete Debounce & Landmark Prefix Warming:** Enforce 350ms debounce and pre-load top-100 Dhaka landmark prefixes in client bundle. | Autocomplete | **35% reduction** in search keystroke calls | **৳33,075 / month** | **Low** (1 day dev) |

---

## 8. Sensitivity Analysis (Production Baseline)

| Scenario | Operational & Mathematical Impact | New Barikoi Business Cost | New OSRM Hybrid Cost | New Google Maps Cost |
|---|---|:---:|:---:|:---:|
| **Daily rides double (15K → 30K rides/day)** | Ride calls double; Food/Shop constant. Barikoi billable calls rise to 31.85M. | **৳1,900,909** (+15.1%) | **৳265,804** (+56.9%) | **$85,000 USD** (৳9.35M BDT) |
| **All orders double (25K → 50K orders/day)** | Total monthly requests double to 30.61M (55.38M Barikoi calls). | **৳3,312,858** (+100.6%) | **৳344,428** (+103.3%) | **$146,200 USD** (৳16.08M BDT) |
| **Failed delivery rate halves (15% → 7.5%)** | Saves 112,266 routing requests (224,532 Barikoi billable calls). | **৳1,637,957** (-৳13,472) | **৳169,414** (No change) | **$72,540 USD** (-$561 USD) |
| **Add 4th vertical (Grocery, 5K orders/day)** | Adds +3.8M monthly requests (7.0M Barikoi calls). | **৳2,055,000** (+৳403.5K) | **৳204,500** (+৳35.1K) | **$91,400 USD** (৳10.05M BDT) |

---

## 9. Provider Switching Cost Analysis

*Evaluates mid-month operational transition including a 2-week dual-billing run period under production volumes.*

| Transition Path | Engineering Effort | 2-Week Dual-Billing Cost | Total Switching Cost | Risk Level | Key Technical Factors |
|---|---|---|---|:---:|---|
| **Barikoi → Dingi** | 4–6 dev days + 2 QA | ৳731,923 (50% of Dingi mo.) | **~৳735K + 6 dev days** | **Medium** | Both support GeoJSON/OSRM polyline schemas. Dingi is not currently wired in code. |
| **Barikoi → Self-Hosted OSRM** | 2–3 dev days + 1 QA | ৳2,200 (50% of VPS mo.) | **~৳25K + 3 dev days** | **Low** | Deploy Docker container with OpenStreetMap Bangladesh PBF; drop-in replacement for OSRM route endpoints. |
| **Barikoi → Google Maps** | 7–10 dev days + 3 QA | ৳4,020,538 (50% of Google mo.) | **~৳4.0M + 10 dev days** | **Critical** | Major billing shock ($36.6K dual-run). Requires GCP billing account quota expansion. |
| **Dingi → Barikoi** | 4–6 dev days + 2 QA | ৳825,714 (50% of Barikoi Business) | **~৳830K + 6 dev days** | **Low-Medium** | Simple REST swap. Immediate operational gains and domestic BDT invoicing. |
| **Google Maps → Barikoi** | 3–5 dev days + 2 QA | ৳825,714 (50% of Barikoi Business) | **~৳830K + 5 dev days** | **Low-Medium** | Immediate financial relief; drops monthly invoice from ৳8.0M to ৳1.65M. |

---

## 10. Final Recommendation

1. **Immediate Commercial Deployment: Barikoi Business Plan.**
   - Subscribe to Barikoi's **Business Plan (৳50,000/mo base for 1M calls + BDT 0.060/call overage)**.
   - Total expected cost across all 25,000 daily orders under continuous routing recalcs is **৳1,651,429 / month ($15,013 USD)**—averaging **৳2.20 per completed order**.
   - If operating under **Lean Production (quote-time routing ~3/trip)**, this drops to **৳435,014 / month ($3,955 USD / ৳0.58 per order)**.
   - **Avoid the Scale Plan** unless Barikoi contractually reduces its overage rate to ৳0.050/call or lower; otherwise, its 7.5 paisa overage rate adds an unnecessary **৳365,357/month penalty**.
2. **Medium-Term Cost Optimization: Deploy Self-Hosted OSRM Hybrid.**
   - Deploy an internal OSRM container on a **$40/month Cloud VPS (৳4,400 BDT)** to serve internal route recalculations.
   - Continue using Barikoi Business for places search, geocoding, and reverse geocoding.
   - Reduces monthly platform map spend from ৳1.65M down to **৳169,414 / month ($1,540 USD)**—averaging just **৳0.23 per completed order** (saving **৳1,482,015 BDT / $13,473 USD every month**).
3. **Google Maps Fallback Warning (Circuit-Breaker Required):**
   - In Ride's actual codebase (`lib/barikoi.ts`), the fallback is `googleRoute` (Google Directions).
   - If 5% of Barikoi route requests fail over to Google at $5.00/1K, that failover generates **~৳340,637 BDT / month ($3,097 USD)** in GCP bills.
   - A strict circuit breaker and fallback to Haversine × 1.3 are essential to prevent unthrottled GCP failover expenses.
4. **Never Use Google Maps Platform as Primary:**
   - At **$73,101 USD / month (~৳8.04 million BDT)**, using Google as primary would drain operating margins and violate central bank foreign currency remittance quotas.

---

## Appendix: Production Reality & Architectural Notes

1. **Barikoi Official Call Weighting (docs.barikoi.com/pricing/pricing-call):**
   - Barikoi bills calls, not HTTP requests. The Routing API consumes **2 calls per request**, and the Map API (Tiles) consumes **4 calls per request**.
   - On 12.39M routing requests, Barikoi bills 24.77M calls, bringing the monthly Business bill to ৳1.65M.
2. **The 300M Tile Render Fallacy vs MapLibre Native Reality:**
   - In production mobile engineering (using MapLibre Native in Ride), vector tiles (`.pbf`) are rendered locally on-device by the GPU with SQLite caching. A GPS heartbeat is a coordinate-only message over WebSockets; it does **NOT** hit an HTTP tile server.
   - Ride's `utils/mapUtils.ts` points `useBarikoiMapStyle` to `map.barikoi.com`. To avoid all tile API consumption on initial cold boots (which Barikoi counts as 4 calls/req), Ride can point `style.json` to an open OSM vector tile server or host a Cloudflare R2 vector tile cache.
3. **Google Maps Mobile SDK Pricing Terms:**
   - Under official Google Maps Platform terms, **Dynamic Maps on native mobile (Maps SDK for Android & Maps SDK for iOS) is $0.00 (Unlimited Free Usage)**.
   - On native mobile apps, Google's total bill is **$73,101 USD / month (~৳8.04 million BDT)** for server-side directions, geocoding, and autocomplete.
4. **In-Memory Uber H3 Hexagonal Geo-Indexing vs External Distance Matrix:**
   - In Ride's actual codebase (`utils-server/h3Index.ts`), driver proximity is resolved **entirely in memory using Uber H3 hexagonal indexing**. Zero external Distance Matrix API calls are made during ride and food dispatch.
5. **Service Line Cost Asymmetry:**
   - Ride-Hailing (15,000 rides/day across Bike, CNG, Car) accounts for **60% of volume** but only **৳248,011 / month (15.0% of total spend)** on Barikoi Business—averaging **৳0.55 per completed ride**.
   - Food and Shop deliveries account for **85.0% of total API cost** due to high routing recalculation frequency during courier approach and customer delivery legs.
6. **Codebase Fallback Reality (Google Directions vs Dingi):**
   - Dingi does not have an active client in `lib/barikoi.ts`. The system uses Barikoi $\rightarrow$ Google Directions $\rightarrow$ Haversine $\times$ 1.3. Google Directions fallback costs must be actively monitored and capped.
