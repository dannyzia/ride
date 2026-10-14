# Concept Paper: Autonomous Geospatial & Routing Engine Architecture for Ride ("dpMaps")

**Document Identifier:** RIDE-CP-2026-GEO-01 (Revision 4.0 — Field-Validated & IP-Hardened)  
**Target Platform:** Ride (Multi-Vertical Ride-Hailing, Food Delivery & Shop Logistics in Bangladesh)  
**Status:** Architectural Specification & Strategic Proposal  
**Classification:** Technical Whitepaper / Core Systems Engineering  
**Date:** October 2026  

---

## 1. Executive Summary & Strategic Context

### 1.1 The Emerging Market Geospatial Trilemma
Ride-hailing, courier delivery, and on-demand logistics platforms operating in high-density South Asian megacities (e.g., Dhaka, Chittagong, Sylhet) face an engineering constraint known as the **Geospatial Trilemma**:

```
                       [ 1. Financial Viability ]
                       Sub-taka per-trip margins;
                     Zero foreign currency leakage
                                  ▲
                                 / \
                                /   \
                               /     \
                              /       \
    [ 2. Data Hyper-Locality ] ◄───────► [ 3. Infrastructure Control ]
    Colloquial Banglish POIs,              Low-latency self-reliance;
    house holdings, informal alleys        freedom from vendor lock-in
```

1. **Financial Viability:** Domestic BDT trip fares in Bangladesh average ৳120–৳250 for bikes and ৳350–৳600 for cars. Paying international SaaS providers like Google Maps ($5.00/1K requests for Directions/Geocoding) bleeds **$73,101 USD / month (~৳8.04 million BDT)** at 25,000 orders/day—representing **৳10.72 per transaction** and violating foreign currency remittance constraints.
2. **Data Hyper-Locality:** Western and global map datasets (including raw OpenStreetMap) fail in Dhaka. Local users navigate using colloquial landmarks (*"LabAid er pichon er goli"*), historical naming conventions (*"Old 27, Dhanmondi"*), and multi-tier sub-district hierarchies. Without high-quality local gazetteers, autocomplete failure rates cause immediate rider churn.
3. **Infrastructure Control:** Relying entirely on a single domestic commercial vendor (e.g., Barikoi) exposes the business to steep overage penalties (e.g., Barikoi's 2× call weighting on routing and 6.0–7.5 paisa overage rates, resulting in bills exceeding ৳1.65M/month at scale if un-throttled) and correlated domestic datacenter/network outages.

### 1.2 The Failure of Pure "Build" vs. Pure "Buy"
* **The Pure "Buy" Failure (Google or Pure Barikoi):** Commercial SaaS drains gross margins. Even with Barikoi Business, continuous courier routing recalcs cost **৳1,651,429/month** at 25,000 orders/day, where 94% of the expenditure is spent on simple shortest-path math.
* **The Pure "Build from Scratch" Failure (Raw OSM + Photon):** Raw OpenStreetMap (OSM) in Bangladesh has solid road geometry, but is virtually devoid of residential holding numbers and colloquial search terms. Launching with self-hosted Photon search on raw OSM results in a broken autocomplete experience where users cannot locate their destinations.

### 1.3 The Strategic Solution: The "Pragmatic Hybrid" & Staged Migration
This paper presents the architecture for **dpMaps**, an autonomous geospatial infrastructure for Ride that implements a **Pragmatic Hybrid Model** coupled with a **Staged Dual-Connected Migration**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          DUAL-CONNECTED MIGRATION PLAYBOOK                             │
├──────────────────────────────────────────┬─────────────────────────────────────────────┤
│       MONTHS 1 – 3: LAUNCH & LEARN       │        MONTH 4+: SOVEREIGN PRODUCTION       │
├──────────────────────────────────────────┼─────────────────────────────────────────────┤
│ • Primary: Barikoi (Zero UX launch risk) │ • Primary: Self-Hosted OSRM (<5ms, ৳0/call) │
│ • Shadow: OSRM (Activated at 2,000/day)  │ • Fallback 1: Barikoi (High-avail net)      │
│ • Seed: 2,000 Clean-Room Landmark Target │ • Fallback 2: Google (Circuit-broken cap)   │
│ • Telemetry Harvest: First-party user    │ • Emergency: Haversine × 1.3 math           │
│   queries + driver dropoff GPS fixes     │ • Monthly Map Cost: ~৳169.9K / month        │
│ • Monthly Map Cost: Flat ৳50K to ৳68.4K  │   (৳265K/mo savings vs. Barikoi Lean;       │
│   (Lean quote-time routing model)        │    ৳3.18M BDT annual margin expansion)      │
└──────────────────────────────────────────┴─────────────────────────────────────────────┘
```

1. **Pre-Seeded via Clean-Room Landmark Campaign (Day 0):** The gazetteer is never launched empty. Ride targets a curated pre-launch campaign of **2,000 Verified Dhaka Landmarks** collected via Ride's internal Landmark Pin Tool under strict clean-room intellectual property guidelines.
2. **Dual-Connected from Day 1:** Both Barikoi and an internal routing fallback are connected concurrently to the Ride backend. A dynamic database configuration flag controls traffic weighting and cutover.
3. **Months 1–3 (Shadow & Telemetry Harvesting Mode):** Barikoi acts as the primary engine to guarantee Day-1 rider satisfaction. Simultaneously, the system logs route accuracy against **actual driven GPS traces and trip durations**, comparing against stored quote-time routes with **zero duplicate Barikoi billing**. Every completed ride organically harvests first-party user queries and physical drop-off coordinates.
4. **Month 4+ (Instant Switch Flip):** OSRM is promoted to **Primary** routing engine with an instant SQL update. Barikoi steps down to **Fallback 1**. Total platform map spend drops to **৳169,964 / month ($1,545 USD / ৳0.23 per order)** at 25,000 orders/day.
5. **Long-Term Search Sovereignty:** As verified landmark and merchant POIs mature, Ride launches an internal search engine, systematically reducing commercial search dependency.

---

## 2. Multi-Tier Volume Economics: 500 to 25,000 Orders/Day

A common pitfall in geospatial planning is modeling costs exclusively at mature scale. A new ride platform in Dhaka will ramp through distinct operational volume tiers. The economic viability of self-hosting OSRM versus buying SaaS depends directly on daily order density:

```
Total Monthly Map Spend (BDT) vs. Daily Order Volume
  2.0M ┼                                                     Pure Barikoi Continuous (৳1.65M)
       │                                                    /
  1.5M ┼                                                   /
       │                                                  /
  1.0M ┼                                                 /
       │                                                /
  0.5M ┼                                    (৳654K)    /
       │                        (৳123K)       •───────• Barikoi Lean Quote-Only (৳435K)
       │              (৳50K)      •───────────•───────• dpMaps Pragmatic Hybrid (৳170K)
  0.0M ┼───•────────────•─────────•───────────•───────•
           0           500      2,000       10,000  25,000
                            Daily Completed Orders
```

### 2.1 Multi-Tier Financial Breakdown Table

*Assumes standard Barikoi Business Plan rate card (৳50,000/month base, including 1,000,000 calls; ৳0.06/call overage; 2× weighting on routing) and dpMaps Cloud VPS ($40 USD = ৳4,400 BDT/month + $5 Cloudflare R2 = ৳550 BDT).*

| Metric / Parameter | Tier 1: MVP Launch (500 orders/day) | Tier 2: Traction (2,000 orders/day) | Tier 3: Growth (10,000 orders/day) | Tier 4: Mature Scale (25,000 orders/day) |
|---|:---:|:---:|:---:|:---:|
| **Monthly Completed Orders** | **15,000** orders/mo | **60,000** orders/mo | **300,000** orders/mo | **750,000** orders/mo |
| **Daily Fleet & Driver Mix** | 60 bikes, 30 CNGs, 15 cars | 240 bikes, 120 CNGs, 60 cars | 1,200 bikes, 600 CNGs, 300 cars | 3,000 bikes, 1,500 CNGs, 750 cars |
| **Total Monthly Functional Requests** | 306,074 req/mo | 1,224,295 req/mo | 6,121,476 req/mo | 15,303,690 req/mo |
| **Barikoi Billable Calls (2× Route)** | **553,810 calls/mo** | **2,215,238 calls/mo** | **11,076,192 calls/mo** | **27,690,480 calls/mo** |
| **Calls Beyond 1M Included Base** | **0** (Inside base quota) | 1,215,238 calls | 10,076,192 calls | 26,690,480 calls |
| **Pure Barikoi Business Cost (Continuous)** | ৳50,000 / mo | ৳122,914 / mo | ৳654,572 / mo | ৳1,651,429 / mo |
| **Barikoi Lean Baseline (Quote-Time Only)** | **৳50,000 / mo** | **৳68,402 / mo** | **৳186,006 / mo** | **৳435,014 / mo** |
| **dpMaps Pragmatic Hybrid Cost** | **৳50,000 / mo** *(1)* | **৳34,950 / mo** *(2)* | **৳64,956 / mo** *(3)* | **৳169,964 / mo** *(4)* |
| **Net Monthly Savings (vs. Barikoi Lean)** | **৳0.00 / mo (Parity)** | **+৳33,452 / mo** | **+৳121,050 / mo** | **+৳265,050 / mo** |
| **Annual Savings vs. Barikoi Lean** | **৳0.00 / year** | **+৳401,424 / year** | **+৳1,452,600 / year** | **+৳3,180,600 / year** |
| *(Context: Savings vs. Pure Continuous)* | *(৳0.00 / mo)* | *(+৳87,964 / mo)* | *(+৳589,616 / mo)* | *(+৳1,481,465 / mo)* |
| **dpMaps Cost Per Completed Order** | **৳3.33 / order** | **৳0.58 / order** | **৳0.22 / order** | **৳0.23 / order** |
| **90-Day Verified Public Clusters (Trips)** | ~50 to 150 clusters | ~300 to 600 clusters | ~1,200 to 2,500 clusters | ~3,000 to 5,000 clusters |

*(1) At 500 orders/day, total Barikoi calls are only 553,810 (well within the 1M included calls in the ৳50K base fee). At this tier, Ride **does not spin up the $40 VPS**; shadow benchmarking runs via in-memory Haversine math at ৳0 incremental cost.*  
*(2) Under dpMaps at 2,000 orders/day, routing is offloaded to OSRM. Barikoi search calls are only 233,352/month, allowing Ride to downgrade to Barikoi Scale (৳30,000/mo base for 350K calls), totaling ৳30,000 + ৳4,400 VPS + ৳550 R2 = ৳34,950/mo. Savings vs. Barikoi Lean: ৳68,402 − ৳34,950 = ৳33,452/mo.*  
*(3) At 10,000 orders/day, non-routing calls equal 1,166,760/mo. Barikoi Business base (৳50,000) + 166,760 overage @ ৳0.06 (৳10,006) + ৳4,400 VPS + ৳550 R2 = ৳64,956/mo. Savings vs. Barikoi Lean: ৳186,006 − ৳64,956 = ৳121,050/mo.*  
*(4) At 25,000 orders/day, non-routing calls equal 2,916,900/mo. Barikoi Business base (৳50,000) + 1,916,900 overage @ ৳0.06 (৳115,014) + ৳4,400 VPS + ৳550 R2 = ৳169,964/mo. Savings vs. Barikoi Lean: ৳435,014 − ৳169,964 = ৳265,050/mo (~৳3.18M BDT/year).*  
*(5) Note on POI Accumulation: Under strict §4.3 privacy rules (banning residential homes and requiring $\ge 15$ independent non-affiliated riders at an identical entrance cluster), trips alone do NOT build a 100K-place gazetteer. Passenger trips serve to discover and verify high-density venue entrances (e.g. specific hospital or mall gates), while the public gazetteer is primarily populated by the Pin Tool field campaigns, merchant onboarding, and clean-room OpenStreetMap data.*

### 2.2 The Breakeven Inflection Point (~3,500 Orders/Day)
* **Below 1,000 orders/day:** Barikoi Business includes 1,000,000 calls. Total call volume stays inside the included quota. Running self-hosted OSRM yields zero financial savings and adds infrastructure maintenance overhead.
* **The Lean Routing Crossover (~3,500 orders/day):** When using lean quote-time routing (routing calculated on quote, dispatch, and reroute only), total billable Barikoi calls cross the 1,000,000 threshold at **~3,500 orders/day**. Beyond this point, Barikoi overages scale aggressively at ৳0.06 per call, and self-hosted OSRM delivers immediate margin expansion.
* **Definitive Operational Rule for Infrastructure Provisioning:**
  * **0 to 1,999 orders/day:** Connect Barikoi as Primary. Use in-memory Haversine math ($K=1.3$) as failover. Zero cloud VPS container is provisioned (৳0 extra cost).
  * **2,000+ orders/day:** Provision the single $40/month Cloud VPS for OSRM, activating shadow benchmarking and preparing for the Month 4 primary cutover.

---

## 3. Legal, Regulatory & Intellectual Property Compliance (ToS Analysis)

A critical vulnerability identified in naive telemetry harvesting designs is the violation of vendor Terms of Service (ToS). Storing vendor responses to build a competing database is strictly prohibited across commercial mapping providers.

### 3.1 The Scraping Trap: Industry SaaS Licensing Restrictions
* **Proprietary Database Protection:** Standard commercial mapping licenses (including Google Maps Platform Service Terms Section 3.2.3 and domestic geospatial SaaS agreements) explicitly prohibit extracting, scraping, storing, or archiving vendor API responses (such as formatted address text, reverse-geocoded components, or place IDs) for the purpose of creating a persistent competing database or gazetteer.
* **Transit Caching vs. Database Extraction:** Most commercial terms permit temporary, in-memory caching of search results strictly for intermediate performance acceleration (e.g., preventing duplicate network round-trips within an active user session), provided data is not dumped into a permanent gazetteer.
* **Commercial Verification Requirement:** Exact contractual clauses, call counting multipliers (including Barikoi's 2× routing weighting), base inclusions (1M calls @ ৳50K), and overage rates (6.0 paisa) are governed by enterprise Master Service Agreements (MSAs) and must be formally verified against executed contracts prior to operational lock-in.

### 3.2 The First-Party Data Boundary (What Ride Legally Owns)
To ensure 100% legal compliance and intellectual property immunity, Ride enforces a strict data isolation boundary:

```
┌───────────────────────────────────────────────┬───────────────────────────────────────────────┐
│        STRICTLY BANNED (Third-Party IP)       │        PERMISSIBLE FIRST-PARTY ASSETS         │
├───────────────────────────────────────────────┼───────────────────────────────────────────────┤
│ ❌ Storing vendor-returned address text into  │ ✅ Raw user search query string typed into    │
│    a persistent gazetteer index.              │    Ride's mobile client.                      │
│ ❌ Persisting vendor place IDs or boundaries. │ ✅ Physical GPS coordinates recorded by the   │
│ ❌ Scraping geocoding endpoints to harvest    │    driver's handset at trip completion.       │
│    holding numbers and administrative polygons│ ✅ Vehicle telemetry (speed, heading, route   │
│ ❌ Copying coordinates or names from Google,  │    duration, and real odometer distance).     │
│    Barikoi, or Pathao into the Pin Tool.      │ ✅ Curated Landmark Pin Tool field data.      │
│                                               │ ✅ Onboarded merchant physical storefronts.   │
└───────────────────────────────────────────────┴───────────────────────────────────────────────┘
```

### 3.3 The Clean-Room Contributor Policy for Landmark Seeding
To prevent third-party copyright contamination from infecting Ride's seed data, all landmark collection via the Pin Tool must operate under a **Strict Clean-Room Policy**:
1. **Permitted Sources:** On-the-ground physical field surveys, direct contributor local knowledge, OpenStreetMap base data (ODbL compliant), and open street-level photography (Mapillary, KartaView). Satellite imagery (such as Esri World Imagery in the Pin Tool) is used strictly for visual confirmation of building footprints and road alignment under standard map-tracing terms.
2. **Strictly Forbidden Sources:** Copying coordinates, names, or metadata from Google Maps, Barikoi, Apple Maps, or Pathao. Contributors must never copy proprietary vector labels, street names, or business listings.
3. **Mandatory Contributor IP Warranty:** The Pin Tool enforces a mandatory digital agreement before a user can save any landmark:
   > *"I certify that this landmark coordinate, name, and alias was collected via direct physical survey, local knowledge, or open map tracing, and is NOT copied from Google Maps, Barikoi, or proprietary mapping services."*

### 3.4 Ephemeral Performance Caching in Redis
In [`lib/barikoi.ts`](file:///D:/My%20Projects/Current%20Project/Ride/lib/barikoi.ts), caching of frequent autocomplete queries in Redis is strictly an **ephemeral transit cache**:
- **Strict TTL:** 24-hour expiration in Redis memory.
- **Scope:** Session acceleration only. Results are **never** dumped, copied, or exported into persistent database tables (`public_pois`).

### 3.5 Privacy & Telemetry Data Retention
In the ingestion pipeline, raw search queries paired with GPS fixes are subject to a **30-Day Rolling Data Retention Policy**:
- Telemetry records in `raw_search_trips` are automatically stripped of `user_id` upon ingestion (anonymized spatial points).
- Records older than 30 days are purged by an automated database cron job after spatial clustering aggregation.
- Access to raw query logs is restricted exclusively to the internal spatial clustering worker.

---

## 4. Privacy Architecture & Personal Data Protection

Publicly surfacing residential drop-offs creates severe safety, privacy, and regulatory liabilities under Bangladesh data privacy principles. Residential drop-offs are private homes, apartments, and personal dwellings.

### 4.1 Two-Tier Gazetteer Isolation: Public vs. Private
Ride enforces architectural separation between public search landmarks and private user locations:

```
                                [ Ingestion Pipeline ]
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    ▼                                           ▼
          [ High-Confidence Public ]                 [ Private / Low-Confidence ]
          • Multi-user convergence (>15)             • Single household drops
          • Commercial / Transit / Health            • Personal residential homes
          • Verified Pin Tool Landmarks              • Saved places ("Home", "Work")
                    │                                           │
                    ▼                                           ▼
      ┌───────────────────────────┐               ┌───────────────────────────┐
      │        public_pois        │               │    user_private_places    │
      ├───────────────────────────┤               ├───────────────────────────┤
      │ • Accessible to ALL users │               │ • Scoped ONLY to user_id  │
      │ • Indexed in MeiliSearch  │               │ • Encrypted at rest       │
      │ • No personal holding PII │               │ • Never surfaced publicly │
      └───────────────────────────┘               └───────────────────────────┘
```

### 4.2 Database Schemas

#### 1. Public Gazetteer Table (`public_pois`):
```sql
CREATE TABLE public_pois (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name VARCHAR(255) NOT NULL,   -- "Bashundhara City Shopping Complex"
    bangla_name VARCHAR(255),             -- "বসুন্ধরা সিটি শপিং কমপ্লেক্স"
    category VARCHAR(50) NOT NULL,        -- 'mall', 'hospital', 'transit', 'university', 'hotel', 'religious', 'society_gate', 'landmark'
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    h3_r8 VARCHAR(15) NOT NULL,
    h3_r9 VARCHAR(15) NOT NULL,
    is_preseeded BOOLEAN DEFAULT FALSE,   -- TRUE for Pin Tool campaign landmarks
    confidence_score INT DEFAULT 100,
    search_aliases TEXT[] DEFAULT '{}',   -- ['bashundhara mall', 'panthapath mall', 'jfp']
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_public_pois_coords ON public_pois (lat, lng);
CREATE INDEX idx_public_pois_h3 ON public_pois (h3_r8, h3_r9);
CREATE INDEX idx_public_pois_category ON public_pois (category);
CREATE INDEX idx_public_pois_aliases ON public_pois USING gin (search_aliases);
```

#### 2. Private User Places Table (`user_private_places`):
```sql
CREATE TABLE user_private_places (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label VARCHAR(50),                    -- 'Home', 'Work', 'Gym'
    custom_name VARCHAR(255),             -- "Apt 4B, Green Road"
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    h3_r9 VARCHAR(15) NOT NULL,
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    encrypted_details TEXT                -- AES-256 encrypted personal notes
);

CREATE INDEX idx_user_private_places_user ON user_private_places (user_id);
```

### 4.3 Classification & Guardrail Rules
1. **The Residential Ban:** A location is **NEVER** promoted to `public_pois` if it represents an individual private apartment or dwelling.
2. **Society Gates vs. Private Holdings:** In gated neighborhoods (e.g., DOHS Baridhara, DOHS Mirpur, Bashundhara R/A), public entry gates (e.g., *"DOHS Baridhara Gate 1"*, *"Bashundhara Main Gate"*) are indexed as public landmarks. Individual residences inside sectors remain private.
3. **Multi-User Convergence Threshold:** A location discovered via trip telemetry requires at least **15 independent, non-affiliated riders** terminating trips at the same coordinate cluster before it is flagged for admin review as a potential public POI.

---

## 5. Pre-Launch Landmark Seeding Campaign (Phase 0)

A major flaw in naive POI harvesting strategies is the **cold-start problem**: if the platform launches with an empty database, it cannot serve local search without 100% reliance on third-party APIs.

### 5.1 The 2,000 Landmark Target Campaign
Ride establishes a pre-launch field campaign to curate **2,000 High-Priority Dhaka Landmarks** using the internal Landmark Pin Tool. This represents a target collection quota, not a pre-existing inventory:

```
Target Collection Quotas:
├── 🏥 Healthcare (Target: 320 Points)
│    ├── Tertiary Hospitals: Dhaka Medical, BSMMU, Square, United, Evercare, Labaid
│    └── Specialized Clinics & Diagnostic Centers (Ibn Sina, Popular, Medinova)
│
├── 🛍️ Retail & Commercial Centers (Target: 450 Points)
│    ├── Major Malls: Jamuna Future Park, Bashundhara City, Rapa Plaza, Shimanto Square
│    └── Traditional Markets: New Market, Gausia, Karwan Bazar, Mouchak, Chawkbazar
│
├── 🚇 Transit Hubs & Gates (Target: 280 Points)
│    ├── MRT Line 6: All 16 stations and their 64 individual concourse/gate exits
│    ├── Railway Terminals: Kamalapur, Airport Station, Tejgaon, Cantonment
│    └── Inter-District Bus Terminals: Gabtoli, Sayedabad, Mohakhali, Fulbaria
│
├── 🎓 Educational Institutions (Target: 310 Points)
│    ├── Public Universities: Dhaka University, BUET, DMC, Jagannath
│    └── Private Universities: NSU, IUB, BRACU, AIUB, UIU, East West
│
└── 🚪 Residential Society Gates & Intersections (Target: 640 Points)
     ├── DOHS Checkpoints: Mohakhali DOHS, Mirpur DOHS, Baridhara DOHS Gates
     ├── Major Intersections: Bata Signal, Farmgate Mor, Nilkhet Mor, Shahbagh Mor
     └── Gated Township Security Posts: Uttara Sector Gates, Bashundhara A–N Gates
```

### 5.2 Realistic Search Deflection Expectations
* **Why 78% Deflection is Unrealistic:** Many user searches are generic road names (*"Road 11"*), sector numbers (*"Sector 4"*), area names (*"Mohakhali"*), or specific residential holdings. Furthermore, simple substring matching fails on colloquial Banglish (*"shonchita"*, *"pichon"*, *"samne"*) without alias dictionaries and fuzzy matching.
* **Realistic Target:** Pre-seeding 2,000 high-frequency landmarks is projected to deflect **15% to 25% of total search queries** (specifically high-density transit, medical, and retail destinations), reducing API call pressure while providing immediate sub-millisecond local responses.

### 5.3 Complete Category Mapping: Pin Tool to `public_pois`
To ensure clean ingestion into `public_pois`, the Pin Tool standardizes on the following 1:1 category mapping:

| Pin Tool Category | `public_pois.category` | Description & Target Examples |
|---|---|---|
| `station` | `transit` | MRT Line 6 stations, Kamalapur Railway, Gabtoli/Sayedabad bus terminals |
| `hospital` | `hospital` | Tertiary hospitals (Square, Labaid), clinics, diagnostic hubs |
| `market` | `mall` | Shopping malls (JFP, Bashundhara City), Aarong outlets, wholesale bazaars |
| `school` | `university` | Universities (DU, BUET, NSU, BRACU), prominent colleges, schools |
| `hotel` | `hotel` | Hotels, international hospitality chains (Radisson, Westin, InterCon), guest houses |
| `mosque` | `religious` | Major mosques (Baitul Mukarram), shrines, temples, churches |
| `society_gate` | `society_gate` | DOHS security checkpoints, Bashundhara R/A gates, Uttara sector barriers |
| `intersection` | `landmark` | Named traffic circles, roundabouts (*Bata Signal*, *Farmgate Mor*, *Shahbagh*) |

---

## 6. Component-by-Component Deconstruction (Build vs. Buy)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                  RIDE MOBILE CLIENT                                    │
│                     (MapLibre Native + Local SQLite Tile Cache)                        │
└──────────────┬────────────────────────────┬────────────────────────────┬───────────────┘
               │                            │                            │
      Map Tiles Display            Places Autocomplete          Routing & Navigation
               │                            │                            │
               ▼                            ▼                            ▼
┌──────────────────────────┐  ┌──────────────────────────┐  ┌──────────────────────────┐
│   dp-tiles (PMTiles)     │  │   Barikoi Places API     │  │    dp-router (OSRM)      │
│  • Cloudflare R2 / S3    │  │   (Commercial Buy)       │  │   (Self-Hosted Build)    │
│  • BD Vector PBF Extract │  │   • Sub-district gazetteer│  │   • OSRM Docker (<5ms)   │
│  • Bengali Font Glyphs   │  │   • House holding search │  │   • Custom Bike/CNG/Car  │
│  • ৳550 / month ($5)     │  │   • Scaled by order vol  │  │   • $40 / month VPS      │
└──────────────────────────┘  └──────────────────────────┘  └──────────────────────────┘
```

### 6.1 Component A: Map Display & Vector Tile Asset Pipeline
* **PMTiles on Cloudflare R2:** The entire Bangladesh vector tile pyramid up to zoom 15 is **~380 MB** (packaged with Planetiler from Geofabrik). Cloudflare R2 provides zero egress fees at $0.015/GB storage.
* **The Missing Asset Pipeline (Glyphs & Sprites):**
  - **Font Glyphs (PBF Stacks):** MapLibre requires signed distance field font glyphs (`{fontstack}/{range}.pbf`). Standard western stacks omit Unicode block `0980–09FF` (Bengali script), rendering Dhaka street names as missing boxes ("tofu"). dpMaps hosts pre-generated glyph ranges for *Noto Sans Bengali* and *Noto Sans* on Cloudflare R2.
  - **Sprites (Icons & Patterns):** `sprite.json` and `sprite.png` (plus `@2x` high-DPI variants) containing one-way traffic arrows, transit icons, and highway shields.
* **Total Cost:** **~$5.00 USD / month (৳550 BDT)**.

### 6.2 Component B: Routing, Distance & ETA Engine
Routing accounts for **80.9% of platform HTTP requests** and **89.5% of Barikoi costs** (due to 2× call weighting).

#### Selection: OSRM with Multi-Level Dijkstra (MLD)
* **OSRM MLD:** Provides sub-5ms query times, runs in **~1.8 GB RAM** for the entire Bangladesh road network, and supports dynamic edge-weighting for traffic updates.
* **Vehicle Category Profiles:**
  - **🏍️ Bike (`bike.lua`):** Permits narrow pedestrian/living streets (<2.5m), excludes elevated expressways and Padma Bridge motorcycle ban zones, sets higher baseline congestion speed (22 km/h).
  - **🛺 CNG (`cng.lua`):** STRICT BAN on Dhaka Elevated Expressway, Airport Road VIP corridor, and flyover ramps; max speed governed at 40 km/h.
  - **🚗 Car (`car.lua`):** Enables tollways, flyovers, and expressways; applies turn penalties at non-signalized U-turns.

### 6.3 Component C: Places Autocomplete & Search (The Dhaka Reality)
* **Why Photon / Raw OSM Fails on Launch:** OpenStreetMap in Bangladesh is mapped by road topology enthusiasts. Over 65% of colloquial searches (*"Old 27"*, *"Dhanmondi Shonchita"*, *"Bata Signal"*) yield zero hits or incorrect points on raw Photon.
* **The Staged Solution:**
  1. **Launch (Months 1–3):** Buy Barikoi Places API for autocomplete. Filter calls via frontend debouncing and in-memory Redis caching of top 1,000 queries.
  2. **Day 0 Pre-Seed:** Route the top 2,000 Pin Tool landmarks directly to internal cache, deflecting ~15–25% of repeat high-density search calls.
  3. **Month 7+ Sovereign Search:** Deploy a self-hosted **MeiliSearch** cluster loaded with the verified `public_pois` index.

### 6.4 Component D: Reverse Geocoding Reality (Pin Drop to Address Text)
* **The Sovereign Stack Reality Check:** A landmark gazetteer only maps landmarks, not street holding numbers. If Ride drops commercial reverse-geocoding completely, the platform can only display *"Near Square Hospital, Panthapath"* rather than *"House 14, Road 5"*.
* **Recommendation:**
  - In the short-to-medium term, retain Barikoi Reverse Geocode as a paid fallback (~৳70K/mo at 25K orders/day) or self-host **Nominatim** on Bangladesh OSM for street-level reverse geocoding, accepting that holding numbers in residential lanes will remain approximate without vendor data.

---

## 7. Dual-Connected Topology & Ground-Truth Calibration

```
                                [ Incoming Order Request ]
                                            │
                       ┌────────────────────┴────────────────────┐
                       ▼                                         ▼
               [ Months 1 – 3 ]                           [ Month 4 Onwards ]
          "Data Collection & Burn-In"                  "Sovereign Production"
                       │                                         │
      ┌────────────────┴────────────────┐       ┌────────────────┴────────────────┐
      ▼                                 ▼       ▼                                 ▼
 PRIMARY (Live)                  SHADOW (Async)  PRIMARY (Live)            FALLBACK (Backup)
┌──────────────┐                ┌──────────────┐┌──────────────┐          ┌──────────────┐
│   BARIKOI    │                │  LOCAL OSRM  ││  LOCAL OSRM  │          │   BARIKOI    │
│ • Serves fare│                │ • Logs diff  ││ • Sub-5ms    │──(Fail)─►│ • High-avail │
│ • Serves poly│                │   to real GPS││ • ৳0/call    │          │ • Emergency  │
└──────────────┘                └──────────────┘└──────────────┘          └──────────────┘
      │                                                │
      ▼                                                ▼
[ Live Trip Completed ]                         [ Live Trip Completed ]
      │                                                │
      └─────────────────► [ GROUND-TRUTH CALIBRATOR ] ◄┘
                                   │
                                   ▼
                      ┌──────────────────────────┐
                      │ PostgreSQL:              │
                      │  • route_calibration_logs│
                      │  • Compare to REAL GPS km│
                      │  • Stored quote Barikoi  │
                      └──────────────────────────┘
```

### 7.1 Ground-Truth Calibration (Zero Duplicate Barikoi Billing)
To avoid doubling routing costs, the calibrator **never** issues a second live routing request to Barikoi at trip completion. Instead, it reads the **quote-time Barikoi route stored in the trip record**:

```typescript
// utils-server/shadowCalibrator.ts
export async function logCompletedTripCalibration(trip: CompletedTripExecution) {
  // 1. Physical reality recorded by driver device
  // Must be filtered and snapped to eliminate Dhaka GPS multipath noise
  const realDrivenKm = calculateSnappedGpsDistance(trip.rawGpsBreadcrumbs);
  const realDurationMin = (trip.endedAt - trip.startedAt) / 60000;

  // 2. Read the ALREADY-PAID Barikoi quote from order creation (Zero API calls)
  const barikoiKm = trip.quoteTimeBarikoiDistanceKm;
  const barikoiMin = trip.quoteTimeBarikoiDurationMin;

  // 3. Query internal local OSRM container asynchronously (Free, ৳0/call)
  const osrm = await getOsrmRoute(trip.origin, trip.dest, trip.vehicleType).catch(() => null);
  if (!osrm) return;

  // 4. Compute error vs. PHYSICAL REALITY (Ground Truth)
  const osrmDistErrorPct = Math.abs(osrm.distanceKm - realDrivenKm) / realDrivenKm * 100;
  const barikoiDistErrorPct = Math.abs(barikoiKm - realDrivenKm) / realDrivenKm * 100;
  
  const osrmTimeErrorPct = Math.abs(osrm.durationMin - realDurationMin) / realDurationMin * 100;
  const barikoiTimeErrorPct = Math.abs(barikoiMin - realDurationMin) / realDurationMin * 100;

  // 5. Record to calibration ledger
  await db.insert(routeCalibrationLogs).values({
    tripId: trip.id,
    vehicleType: trip.vehicleType,
    realKm: realDrivenKm,
    realMin: realDurationMin,
    osrmKm: osrm.distanceKm,
    osrmMin: osrm.durationMin,
    barikoiKm: barikoiKm,
    barikoiMin: barikoiMin,
    osrmDistErrorPct,
    barikoiDistErrorPct,
    osrmTimeErrorPct,
    barikoiTimeErrorPct,
  });
}
```

### 7.2 GPS Noise Mitigation: Computing True Driven Distance
Mobile handsets lack vehicle odometers. Summing raw GPS coordinates in dense urban corridors (Motijheel, Gulshan) overestimates distance by 15–30% due to multipath signal bounce. `calculateSnappedGpsDistance` implements:
1. **On-Device Kalman Filter:** Discarding high-speed jumps (>100 km/h in Dhaka traffic).
2. **OSRM Map Matching (`/match`):** Snapping the filtered breadcrumb trail to the road network geometry to derive the actual road distance traveled.

### 7.3 The 1-Second Switch Flip (Month 4)
When 90 days of empirical calibration logs confirm that OSRM's distance error vs. real driven GPS is $\le$ Barikoi's error, the engineering team executes a single hot SQL reload:

```sql
UPDATE system_config 
SET value = 'osrm', updated_at = NOW() 
WHERE key = 'routing_provider';
```

---

## 8. Staged Financial Model & Reconciled Cost Comparison

### 8.1 Reconciled Cost Comparison at 25,000 Orders/Day (750,000 Orders/Month)

*Reconciled against published standard rate cards: Barikoi Business (৳50,000 base for 1M calls, ৳0.06 overage, 2× routing weighting), Google Directions ($5.00/1K), OSRM VPS ($40/mo), Cloudflare R2 ($5/mo).*

| Cost Component | Pure Google Maps | Pure Barikoi Business (Continuous) | Barikoi Lean (Quote-Time Baseline) | **dpMaps Pragmatic Hybrid** | **dpMaps Sovereign Stack** |
|---|:---:|:---:|:---:|:---:|:---:|
| **Routing / Directions** | $61,934 USD (৳6.81M) | ৳1,486,415 BDT | ৳270,000 BDT | **৳4,400 BDT** ($40 VPS) | **৳4,400 BDT** ($40 VPS) |
| **Places Autocomplete** | $4,457 USD (৳490K) | ৳94,500 BDT | ৳94,500 BDT | **৳94,500 BDT** (Barikoi) | **৳2,200 BDT** (MeiliSearch) |
| **Geocoding & Rev-Geo** | $6,394 USD (৳703K) | ৳76,734 BDT | ৳76,734 BDT | **৳70,514 BDT** (Barikoi) | **৳0.00 BDT** (Coarse internal) |
| **Distance Matrix** | $315 USD (৳34.6K) | ৳3,780 BDT | ৳3,780 BDT | **৳0.00 BDT** (H3 In-Memory) | **৳0.00 BDT** (H3 In-Memory) |
| **Vector Tiles & Glyphs** | $0.00 (Mobile SDK) | ৳0.00 (Cache) | ৳0.00 (Cache) | **৳550 BDT** ($5 Cloudflare R2) | **৳550 BDT** ($5 Cloudflare R2) |
| **Total Monthly Spend** | **$73,101 USD** (৳8.04M) | **৳1,651,429 BDT** | **৳435,014 BDT** | **৳169,964 BDT** ($1,545 USD) | **৳7,150 BDT** ($65 USD) |
| **Cost Per Completed Order** | **৳10.72 / order** | **৳2.20 / order** | **৳0.58 / order** | **৳0.23 / order** | **৳0.009 / order** |
| **Annual Savings vs. Barikoi Lean** | — | — | Baseline | **৳3,180,600 / year** | **৳5,134,368 / year** |
| *(Context: Savings vs. Continuous)* | — | Baseline | *(৳14.60M / year)* | *(৳17.78M / year)* | *(৳19.73M / year)* |

*Note on Number Reconciliation:*  
- **Months 1–3 Launch Budget (at scale):** Barikoi Lean (৳435,014) + OSRM Shadow VPS (৳4,400) = **৳439,414 BDT / month**.  
- **Month 4+ Production Budget:** Barikoi Search/Geocoding (৳165,014) + OSRM VPS (৳4,400) + Cloudflare R2 (৳550) = **৳169,964 BDT / month** (or ৳169,414 excluding R2 storage).
- **True Engineering Savings Delta:** Against the realistic operational baseline of Barikoi Lean, dpMaps saves **৳265,050 / month (~৳3.18 million BDT / year)**.

---

## 9. Execution Roadmap: 5-Phase Transition Plan

```
Phase 0: Pre-Launch Seeding & Pin Tool Campaign (Pre-Launch)
├── Execute clean-room landmark collection campaign (target: 2,000 points)
├── Enhance Pin Tool: aliases field, full category mapping, and direct public_pois export
├── Pre-generate Bengali font glyphs (Noto Sans Bengali) & upload to Cloudflare R2
└── Ingest curated landmarks into public_pois with search_aliases

Phase 1: Dual-Connected Launch & Hardening (Months 1–3)
├── Enforce lean quote-time routing; cap Google failover at $5/day
├── 0 to 1,999 orders/day: Run pure Barikoi Primary + in-memory Haversine (৳0 VPS)
├── 2,000+ orders/day: Provision OSRM VPS container; activate shadow benchmarking
├── Run Ground-Truth Calibrator using stored quote data and snapped GPS traces
└── Budget: Flat ৳50K/mo (at <1K orders/day) up to ~৳439K/mo (at 25K orders/day)

Phase 2: The Switch Flip (Month 4)
├── Audit 90-day calibration logs (confirm OSRM error <= Barikoi error vs. real GPS)
├── Update system_config: Promote OSRM to Primary, Barikoi to Fallback 1
├── Retain Barikoi Places API for commercial search and reverse geocoding
└── Budget: ~৳35K/mo (at 2K orders/day) up to ৳169.9K/mo (at 25K orders/day)

Phase 3: Autonomous Tile Hosting & Vector Assets (Months 5–6)
├── Generate bangladesh.pmtiles via Planetiler from Geofabrik extract
├── Deploy PMTiles, Bengali glyphs, and sprites on Cloudflare R2
└── Update mobile client MapLibre style to direct R2 endpoints

Phase 4: Sovereign POI Search Engine (Months 7–12)
├── Verify 5,000+ public landmarks (combining Pin Tool points, merchants, arrival clusters)
├── Deploy private MeiliSearch / Photon cluster
└── Deprecate commercial search API for 100% geospatial sovereignty ($65/mo)
```

---

## 10. Risk Analysis & Mitigation Matrix

| Identified Risk | Severity | Probability | Mitigation Strategy |
|---|:---:|:---:|---|
| **Vendor ToS Infringement** (Scraping vendor geocoding strings) | Critical | Low (with safeguards) | **Hard Architectural Rule:** Never store Barikoi's returned text strings in `public_pois`. Ingest only Ride's first-party data: raw user search queries, physical driver drop-off GPS fixes, and clean-room Pin Tool landmarks. |
| **Contributor IP Contamination** (Surveyors copying from Google/Barikoi) | Critical | Medium | Enforce a digital Clean-Room Contributor Agreement on the Pin Tool. Prohibit copy-pasting from proprietary apps; permit only physical survey, OSM, and open imagery. |
| **Privacy Breach / Stalker Risk** (Exposing residential home addresses) | Critical | Medium | Maintain strict database separation between `public_pois` (public venues, society gates, commercial hubs) and `user_private_places` (scoped to individual `user_id`, encrypted at rest). Apply a 30-day rolling purge to raw query logs. |
| **Premature Self-Hosting** (Building complex infra at 500 orders/day) | Medium | High | Rely on Barikoi's included 1M calls during Tier 1 (500–1,000 orders/day). Defer OSRM VPS container provisioning until order volume reaches the 2,000 orders/day trigger. |
| **Calibrator Billing Escalation** (Doubling Barikoi calls on completion) | High | Low (with safeguards) | Compare against the **already-stored quote-time Barikoi result** in the trip ledger. Issue zero outbound network calls to Barikoi at trip completion. |
| **Missing Font Glyphs** (Bengali text rendering as tofu boxes in MapLibre) | High | Medium | Host pre-generated font glyph ranges for *Noto Sans Bengali* (Unicode `0980–09FF`) on Cloudflare R2 alongside PMTiles before cutting over tile styles. |
| **Noisy Phone GPS Drift** (Inaccurate ground-truth distance calculations) | High | High | Filter raw driver GPS breadcrumbs with Kalman filtering and snap coordinates to road geometry using OSRM `/match` before logging real driven distance. |
| **VPS Outage / Container Failure** | Critical | Low | Maintain multi-tier fallback waterfall in `dispatchRouter.ts`: OSRM $\rightarrow$ Barikoi $\rightarrow$ Google $\rightarrow$ Haversine. Automatic failover within 300ms. |

---

## 11. Conclusion & Strategic Recommendation

The refined **dpMaps Architecture** provides a rigorous, legally compliant, and unit-economically grounded roadmap:

1. **Economically Honest:** Accurately benchmarks against the **Barikoi Lean baseline**, locking in **৳265,050 BDT in monthly margin savings (৳3.18 million BDT annually)** at scale, while acknowledging that at 500 orders/day Barikoi's base tier covers all operational volume (৳50K/mo).
2. **100% Legally Compliant & Clean-Room Seeded:** Enforces the first-party data boundary across both production telemetry and pre-launch Pin Tool surveys. Proprietary vendor strings are never harvested, eliminating ToS infringement liabilities.
3. **Privacy-Preserving:** Separates public landmarks from residential private drop-offs, ensuring rider homes are never exposed to the public index, backed by an automated 30-day telemetry purge.
4. **Empirically Calibrated Without Extra Cost:** Benchmarks routing accuracy against **snapped GPS driven distance and real duration**, reusing already-paid quote-time routes with zero duplicate API billing.
5. **No Cold-Start Delay:** Bootstraps the platform with **2,000 curated clean-room landmarks**, giving riders an instantaneous, high-precision search experience from Day 1.

---
*Authored for the Ride Core Systems Architecture Group.*  
*Cross-Reference:* [`docs/reports/map-api-cost-report.md`](file:///D:/My%20Projects/Current%20Project/Ride/docs/reports/map-api-cost-report.md) | [`docs/reports/map-api-cost-report.html`](file:///D:/My%20Projects/Current%20Project/Ride/docs/reports/map-api-cost-report.html)
