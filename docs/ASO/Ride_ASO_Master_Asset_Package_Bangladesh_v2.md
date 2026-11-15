---
title: "Ride — ASO Master Asset Package for Bangladesh (v2, final working copy)"
subtitle: "Google Play and Apple App Store"
date: "5 November 2026"
lang: en
supersedes: "Ride_ASO_Master_Asset_Package_Bangladesh.md (ChatGPT draft, same folder, left untouched)"
---

# 0. Read this first

**Brand lock:** Use **Ride** only. No GoRide, GlideX or other legacy names anywhere in store metadata, graphics, screenshots, ads or support copy.

**The one rule that governs this whole document:** a store listing may only describe what is **Live in the release being submitted**. The ChatGPT draft states this rule in its header and then breaks it in its own copy-ready text. This version fixes that by building the listing from **gated blocks**. A block goes in only when its feature is marked Live in Section 1.

## 0.1 What was checked in the ChatGPT draft

Verified by script on 5 Nov 2026 (not taken on trust):

| Item | Draft claim | Result |
|---|---|---|
| Play title "Ride: Rides, Food & Delivery" | 28/30 | Correct |
| Play short description option A | 71/80 | Correct |
| Play full description | 3,788/4,000 | Correct (with placeholders still in it) |
| Apple subtitle | 22/30 | Correct |
| Apple promo text options A and B | 132/170 each | Correct |
| Apple keyword field | 91/100 bytes | Correct |

The arithmetic is good. The problems are in what the copy claims, what it omits, and what it leaves to chance.

## 0.2 What was wrong, and what this version does about it

| # | Defect in the draft | Why it matters | Fix in v2 |
|---|---|---|---|
| 1 | Full description advertises **scooter** and **women-only matching** as live. Last recorded status of both is *under planning* (19 Oct 2026). | Advertising an unshipped feature is a Play misleading-claims risk and a guaranteed bad review. | Both are separate gated blocks, **excluded by default** until marked Live. |
| 2 | Full description lists **bKash, Nagad, Upay and cards**. As far as the project records go, PortPos is live and bKash and Nagad were inactive at MVP. | Naming a payment method that is not active is a false claim. | Payment block is generic. Methods are listed only after each is tested end to end. |
| 3 | Copy includes a **pharmacy** sentence although the draft's own Section 10 says "omit until reviewed". | Medicine sales need local authorization. The draft contradicts itself. | Pharmacy removed entirely. |
| 4 | Copy says "the **planned** intercity network spans all 64 districts". | Roadmap claims in a live listing are misleading. The draft's own gate forbids the 64-district claim. | Removed. No city list unless live. |
| 5 | Heavy hedging: "may include", "may include 0.5-ton ... options", "features ... shown only where offered". | Reads as a feature list the app might not have. Weak for users and reviewers. | Plain statements, only for live features. |
| 6 | **ALL-CAPS section headings** in the Play description. | Play metadata rules discourage excessive capitalization. Not worth the risk. | Sentence-case headings. |
| 7 | **No Bangla store copy.** Only Bangla screenshot headlines and keywords. | The primary audience reads Bangla. Play supports a Bengali localization. | Full Bangla title, short description and description (needs native review). |
| 8 | Apple subtitle repeats the app name's words ("Rides, Food & Delivery"). | Apple indexes name + subtitle + keywords together. A repeated word wastes the slot. | New subtitle uses new words. Keyword field rebalanced. |
| 9 | Driver weekly package marked "needs review" in Section 10.1, but treated as a Play-only issue. | Apple has the same rule family (in-app purchase for digital features). | Section 7.1 covers both stores and the real options. |
| 10 | Placeholders `[SUPPORT_EMAIL]`, `[SUPPORT_URL]`. | Now known. | Filled in (Section 10). |
| 11 | No store-listing field inventory, category, content rating, target audience, declarations list, or asset size specs. | A "complete" package needs them. | Sections 3, 6 and 8. |
| 12 | Bangla-translation, store-policy and Console-capability statements presented as current without caveat. | Policies change. | Marked "re-verify in Console" where they are not independently confirmed. |

## 0.3 What I could not verify

- Whether any feature is actually Live in a release build (needs the owner and the product).
- Search volumes or keyword rankings. None exist in this document and none should be claimed.
- Play and Apple creative specs beyond what is stated in Section 6. Re-check in Console and App Store Connect before submission.
- Naturalness of the Bangla copy. **It needs review by a native Bangla speaker before it goes live.**
- Whether App Store Connect offers a Bengali listing localization. Check before planning an Apple Bangla listing.

---

# 1. Truth gates (the single source of truth for every public claim)

The owner marks each row **Live**, **Limited pilot**, **Planned** or **Not in release**. Only **Live** rows (and Limited pilot, if the listing says so) go into store copy, screenshots, the website or ads. Every block in Section 3 names its gate.

| Gate | Feature | Evidence required before it is public | Default in the listing |
|---|---|---|---|
| G-RIDE | Bike, CNG and car booking with fare shown before confirmation | Working booking flow in the release build | Include once marked Live |
| G-SCOOTER | Scooter vehicle type | Shipped in the release, bookable | **Include** (owner ruled Live, 5 Nov 2026) |
| G-WOMEN | Women-only matching | Shipped, with no-match handling and verified women-partner supply. Applies to **bike** trips only per the owner's intent | **Include** (owner ruled Live, 5 Nov 2026). Keep the "match depends on availability" wording |
| G-RENT | Hourly and daily car or microbus rental, intercity routes | Fleet partners, working quote or booking, route list | Exclude until Live |
| G-TRUCK | Pickup, covered van and truck booking | Real inventory with accurate capacities | Exclude until Live |
| G-AMB | Ambulance requests | Signed provider agreements, hours, monitored dispatch | Exclude until Live. Strictest gate |
| G-FOOD | Restaurant ordering and order status | Active restaurants, delivery zones | Include once marked Live |
| G-SHOP | Grocery, local shops, vehicle workshops | Active merchants, accurate catalogue | Include once marked Live |
| G-PARCEL | Parcel delivery and merchant delivery requests, cash on delivery | End-to-end collection and settlement tests | Include once marked Live |
| G-SAFETY | Live trip sharing, trip PIN, SOS | Tested on target devices, accurate behaviour | Each bullet only when Live |
| G-PAY | Each payment method separately | A successful test transaction through PortPos for that method | Owner states PortPos is an aggregator carrying bKash, Nagad and others. Name a method in public copy only after that method is enabled on the PortPos merchant account and has completed a test transaction |
| G-DRIVERPKG | Driver weekly call package, sold in the app | **Payments-policy outcome (Section 7.1)** | Describe accurately. Final wording waits on the policy outcome |
| G-CITY | Each named city or route | Working supply and a successful fulfilled order there | No city named until Live |

**Owner rulings recorded 5 Nov 2026:**

- Scooter and women-only matching are **Live**. Use blocks R-SCOOTER and R-WOMEN. Update the website and screenshot 2 accordingly.
- PortPos is a payment aggregator (like SSLCommerz) that carries bKash, Nagad and other methods. The PAY block stays generic until each method is confirmed enabled and tested on the PortPos merchant account. A reviewer or user who sees a method named in the listing must be able to use it.
- Pharmacy: the owner is checking whether it is in the release. It stays out of all copy until the owner confirms authorized sellers and any local licensing.

Removed permanently from public copy until separately reviewed: pharmacy and medicine sales, a vehicle tier count, "24/7" and "all 64 districts" claims, BLS/ALS, oxygen, ventilator and paramedic claims, and any response-time promise.

---

# 2. Positioning

## 2.1 One-sentence value proposition

**Ride brings everyday transport, local shopping and delivery together in one Bangladesh-focused app. Availability depends on the area and on participating providers.**

## 2.2 Message hierarchy

1. **Primary:** Rides, food, local shopping and delivery in one app.
2. **Secondary (each behind its gate):** car rental and intercity, trucks and shifting, ambulance, parcels, workshops.
3. **Supply side:** drivers, merchants, workshops and delivery partners join under clearly disclosed partner terms.
4. **Voice:** direct, useful, local, calm, specific. No "best", "cheapest", "#1", "instant", "everywhere", or guaranteed response times.

## 2.3 Personas (condensed from the draft)

| Persona | Job to be done | What the store page must show |
|---|---|---|
| Daily commuter | Cross town on a bike, CNG or car and know the fare first | Real vehicle selector, fare screen, live trip |
| Home or office mover | Move furniture or goods | Real vehicle sizes and a real request flow (G-TRUCK) |
| Medical transport user | Find ambulance transport | Real provider information and honest limits (G-AMB) |
| Food and shop customer | Order from nearby restaurants and stores | Real catalogue, checkout and order status |
| Parcel sender or merchant | Send a parcel or get a delivery rider | Real request and settlement flow |
| Driver or partner | Get work and know the terms | Role-specific onboarding and disclosed package terms |
| Women rider or driver | Choose women-only matching | Only after G-WOMEN is Live |

---

# 3. Google Play store listing (copy-ready)

## 3.1 Field inventory

| Field | Value | Limit |
|---|---|---|
| App name (English, default) | `Ride: Rides, Food & Delivery` | 30 (uses 28) |
| App name (Bengali, bn-BD) | `Ride: রাইড, খাবার ও ডেলিভারি` | 30 (uses 28) |
| Short description (English) | `Rides, food, groceries, rentals and parcel delivery in supported areas.` | 80 (uses 71) |
| Short description (Bengali) | `যাতায়াত, খাবার, বাজার, গাড়ি ভাড়া ও পার্সেল ডেলিভারি, সমর্থিত এলাকায়।` | 80 (uses 72) |
| Full description | Assembled from blocks in 3.3 and 3.4 | 4,000 |
| Contact email | `support@ride.digital-papyrus.com` | |
| Website | `https://ride.digital-papyrus.com` | |
| Privacy policy URL | `https://ride.digital-papyrus.com/privacy` | Must be a real, approved policy |
| Account deletion URL | `https://ride.digital-papyrus.com/delete-account` | Required if users can create accounts |
| Primary category | Recommended: **Maps & Navigation** (ride-hailing apps are commonly listed there). Re-check the current list in Console | |
| Tags | Choose the closest available tags for ride booking, food delivery and delivery. Re-check the current tag list | |

Counts above were computed by script. **Re-check Bengali counts in Play Console**: it may count combining characters differently from a script.

**Short description alternatives** (all verified within 80):

| Option | Text | Chars |
|---|---|---:|
| A (recommended) | Rides, food, groceries, rentals and parcel delivery in supported areas. | 71 |
| B | Book rides, order food, shop locally and send parcels in one app. | 65 |
| C | Book bike, CNG and car rides, order food and shop from local stores. | 68 |

Use A. Use C if rentals, groceries and parcels are not all live. **Do not use the draft's option D** (it names ambulance) until G-AMB is Live.

## 3.2 Assembly rules for the full description

1. Start with block **I**. End with **HELP** and **FOOT**. Always keep **PARTNER** (it carries the required payment disclosure).
2. Add only blocks whose gate is Live, in the order shown below.
3. **R-SCOOTER** and **R-WOMEN** are single bullets that attach to the end of block **R**.
4. Join blocks with one blank line. Use sentence-case headings exactly as written.
5. Never add a city name, a payment method name or a tier count unless its gate is Live and the owner approves the wording.

| Block | Gate | EN chars | BN chars |
|---|---|---:|---:|
| I | always | 199 | 203 |
| R | G-RIDE | 209 | 199 |
| R-SCOOTER | G-SCOOTER | 35 | 45 |
| R-WOMEN | G-WOMEN | 120 | 120 |
| RENT | G-RENT | 185 | 183 |
| TRUCK | G-TRUCK | 154 | 154 |
| AMB | G-AMB | 194 | 196 |
| FOOD | G-FOOD and G-SHOP | 202 | 194 |
| PARCEL | G-PARCEL | 180 | 169 |
| SAFETY | G-SAFETY (per bullet) | 113 | 124 |
| PAY | always | 80 | 77 |
| PARTNER | always | 330 | 298 |
| HELP | always | 82 | 85 |
| FOOT | always | 111 | 123 |
| **All blocks** | | **2,218** | **2,194** |
| **Launch core** (I, R, FOOD, PARCEL, PAY, PARTNER, HELP, FOOT) | | **1,407** | **1,362** |

Both assembled versions are far under the 4,000 limit, so there is room for approved additions.

## 3.3 English blocks

Block I

```text
Ride brings everyday transport, local shopping and delivery together in one app for Bangladesh. Book a ride, order food, shop from nearby stores and send parcels. Services and providers vary by area.
```

Block R

```text
Rides
• Book a bike, CNG auto-rickshaw or car and see the fare before you confirm.
• Follow your trip on the map.
• Vehicle types, fares and driver availability depend on your route, the time and local supply.
```

Block R-SCOOTER (only when G-SCOOTER is Live)

```text
• Choose a scooter where available.
```

Block R-WOMEN (only when G-WOMEN is Live)

```text
• Women riders and women drivers can choose women-only matching on eligible bike trips. A match depends on availability.
```

Block RENT (G-RENT)

```text
Car rental and intercity travel
• Request a car or microbus with a driver by the hour or day.
• Arrange trips between supported cities and routes. Routes depend on participating fleets.
```

Block TRUCK (G-TRUCK)

```text
Trucks and shifting
• Request a pickup, covered van or truck for home, office or cargo moves.
• Vehicle sizes depend on the fleets available in your area.
```

Block AMB (G-AMB, strictest gate)

```text
Ambulance
• Request ambulance transport from available providers. Services, equipment and response times vary by provider and area.
• Ride is not an emergency service. In an emergency, call 999.
```

Block FOOD (G-FOOD and G-SHOP; delete any bullet that is not Live)

```text
Food, groceries and shops
• Order from participating restaurants and follow your order.
• Shop for groceries and everyday items from nearby stores.
• Book a service with participating vehicle workshops.
```

Block PARCEL (G-PARCEL)

```text
Parcels and delivery
• Send documents and parcels within supported areas.
• Shops and sellers can request delivery riders for local orders, including cash on delivery where agreed.
```

Block SAFETY (G-SAFETY; keep only bullets that are Live)

```text
Safety
• Share your live trip with someone you trust.
• Start trips with a PIN so you get into the right vehicle.
```

Block PAY

```text
Payments
• Pay with the options shown at checkout for your service and location.
```

Block PARTNER (always; see Section 7.1 before finalizing)

```text
For drivers and partners
Ride does not deduct a per-trip commission from driver fares. Drivers pay for a weekly package to receive eligible ride requests. Package price, request allowance, validity and renewal terms are shown before purchase. Restaurants, shops, workshops and delivery partners join under their own partner terms.
```

Block HELP

```text
Help: support@ride.digital-papyrus.com or https://ride.digital-papyrus.com/support
```

Block FOOT

```text
Availability, prices, providers and payment options vary by location and demand. Check the app before you book.
```

## 3.4 Bangla blocks (bn-BD) — NATIVE REVIEW REQUIRED BEFORE USE

Same order, same gates as 3.3.

Block I

```text
রাইড বাংলাদেশের প্রতিদিনের যাতায়াত, স্থানীয় কেনাকাটা ও ডেলিভারি এক অ্যাপে নিয়ে আসে। রাইড বুক করুন, খাবার অর্ডার করুন, কাছের দোকান থেকে কেনাকাটা করুন এবং পার্সেল পাঠান। সেবা ও সেবাদাতা এলাকাভেদে ভিন্ন।
```

Block R

```text
রাইড
• বাইক, সিএনজি বা গাড়ি বুক করুন এবং নিশ্চিত করার আগে ভাড়া দেখে নিন।
• ম্যাপে আপনার ট্রিপ অনুসরণ করুন।
• বাহনের ধরন, ভাড়া ও চালকের প্রাপ্যতা আপনার রুট, সময় ও স্থানীয় সরবরাহের ওপর নির্ভর করে।
```

Block R-SCOOTER

```text
• যেখানে পাওয়া যায় সেখানে স্কুটার বেছে নিন।
```

Block R-WOMEN

```text
• নারী যাত্রী ও নারী চালক যোগ্য বাইক ট্রিপে শুধু নারীদের সঙ্গে ম্যাচিং বেছে নিতে পারেন। ম্যাচ নির্ভর করে প্রাপ্যতার ওপর।
```

Block RENT

```text
গাড়ি ভাড়া ও আন্তঃজেলা ভ্রমণ
• ঘণ্টা বা দিন হিসেবে চালকসহ গাড়ি বা মাইক্রোবাস ভাড়ার অনুরোধ করুন।
• সমর্থিত শহর ও রুটে ট্রিপের ব্যবস্থা করুন। রুট নির্ভর করে অংশগ্রহণকারী ফ্লিটের ওপর।
```

Block TRUCK

```text
ট্রাক ও বাসা বদল
• বাসা, অফিস বা মালপত্র সরানোর জন্য পিকআপ, কাভার্ড ভ্যান বা ট্রাকের অনুরোধ করুন।
• বাহনের আকার নির্ভর করে আপনার এলাকায় থাকা ফ্লিটের ওপর।
```

Block AMB

```text
অ্যাম্বুলেন্স
• প্রাপ্য সেবাদাতাদের কাছ থেকে অ্যাম্বুলেন্স পরিবহনের অনুরোধ করুন। সেবা, সরঞ্জাম ও পৌঁছানোর সময় সেবাদাতা ও এলাকাভেদে ভিন্ন।
• রাইড কোনো জরুরি সেবা নয়। জরুরি অবস্থায় ৯৯৯-এ কল করুন।
```

Block FOOD

```text
খাবার, বাজার ও দোকান
• অংশগ্রহণকারী রেস্টুরেন্ট থেকে অর্ডার করুন এবং অর্ডারের অবস্থা দেখুন।
• কাছের দোকান থেকে মুদি ও নিত্যপ্রয়োজনীয় পণ্য কিনুন।
• অংশগ্রহণকারী গাড়ির ওয়ার্কশপে সেবা বুক করুন।
```

Block PARCEL

```text
পার্সেল ও ডেলিভারি
• সমর্থিত এলাকায় নথি ও পার্সেল পাঠান।
• দোকান ও বিক্রেতারা স্থানীয় অর্ডারের জন্য ডেলিভারি রাইডারের অনুরোধ করতে পারেন, সম্মত হলে ক্যাশ অন ডেলিভারিসহ।
```

Block SAFETY

```text
নিরাপত্তা
• বিশ্বস্ত কারও সঙ্গে আপনার লাইভ ট্রিপ শেয়ার করুন।
• সঠিক গাড়িতে ওঠার নিশ্চয়তার জন্য পিন দিয়ে ট্রিপ শুরু করুন।
```

Block PAY

```text
পেমেন্ট
• আপনার সেবা ও অবস্থান অনুযায়ী চেকআউটে দেখানো পদ্ধতিতে পেমেন্ট করুন।
```

Block PARTNER

```text
চালক ও পার্টনারদের জন্য
রাইড চালকের ভাড়া থেকে প্রতি ট্রিপে কমিশন কাটে না। যোগ্য রাইড অনুরোধ পেতে চালকদের সাপ্তাহিক প্যাকেজ কিনতে হয়। প্যাকেজের মূল্য, অনুরোধের সংখ্যা, মেয়াদ ও নবায়নের শর্ত কেনার আগে দেখানো হয়। রেস্টুরেন্ট, দোকান, ওয়ার্কশপ ও ডেলিভারি পার্টনাররা নিজ নিজ পার্টনার শর্তে যুক্ত হন।
```

Block HELP

```text
সহায়তা: support@ride.digital-papyrus.com বা https://ride.digital-papyrus.com/support
```

Block FOOT

```text
সেবার প্রাপ্যতা, মূল্য, সেবাদাতা ও পেমেন্ট পদ্ধতি অবস্থান ও চাহিদাভেদে ভিন্ন হয়। বুক করার আগে অ্যাপে দেখানো তথ্য দেখে নিন।
```

## 3.5 Title rule

Start with `Ride: Rides, Food & Delivery`. Alternatives from the draft (B to E) are kept in the draft file. Do not change the title repeatedly based on keyword tools. Any later change needs a written hypothesis and enough Console data. "Ride" is a generic word, so run a trademark and existing-app-name check before the brand is locked in the stores.

---

# 4. Apple App Store listing

| Field | Value | Limit |
|---|---|---|
| App name | `Ride: Rides, Food & Delivery` | 30 (uses 28) |
| Subtitle | `Bike, CNG, Grocery & Parcel` | 30 (uses 27) |
| Promotional text | `Rides, food, groceries and parcel delivery in one Bangladesh-focused app. Services and payment options vary by area, so check what is available near you.` | 170 (uses 153) |
| Keywords | `taxi,car,truck,ambulance,rental,shifting,courier,restaurant,workshop,dhaka,vara,deliveryman` | 100 bytes (uses 91) |
| Description | Same wording as the Play blocks, same gates, 4,000 max | 4,000 |
| Primary and secondary category | Recommended: **Travel** primary, **Food & Drink** secondary. Re-check in App Store Connect | |
| Support URL | `https://ride.digital-papyrus.com/support` | |
| Privacy policy URL | `https://ride.digital-papyrus.com/privacy` | |

Why this differs from the draft:

- The draft subtitle repeated the name's words. Apple indexes name, subtitle and keywords together, so new words in the subtitle are worth more.
- Words already in the name or subtitle (`rides`, `food`, `delivery`, `bike`, `cng`, `grocery`, `parcel`) are kept out of the keyword field.
- The keyword string is comma-separated with no spaces. `ambulance` stays in the field only as a search term. It does **not** appear in the visible copy until G-AMB is Live. If G-AMB is not Live at submission, remove `ambulance` from the keywords too.
- Promotional text can be edited without a new app version, but Apple says it does **not** affect search ranking.
- Do not use competitor names or unauthorized trademarks in any field.
- Check whether App Store Connect offers a Bengali listing localization before planning one.

---

# 5. Keyword architecture

These are relevant search-language candidates, **not verified search volumes**. Do not call any term high-volume or low-competition without a dated tool, geography and method.

## 5.1 English candidates

| Vertical | Candidates |
|---|---|
| Ride-hailing | bike ride, bike booking, CNG booking, CNG ride, car booking, ride sharing Bangladesh, taxi booking |
| Rent-a-car and intercity (G-RENT) | car rental Bangladesh, rent a car, microbus rental, hourly car rental, daily car rental |
| Truck and shifting (G-TRUCK) | truck rental, pickup rent, covered van, home shifting, office shifting, cargo transport |
| Ambulance (G-AMB) | ambulance booking, ambulance service Bangladesh, hospital transport |
| Food | food delivery, restaurant delivery, order food |
| Shops, groceries, workshops | grocery delivery, online grocery, local shop delivery, auto parts, car workshop |
| Parcel and merchant delivery | parcel delivery, courier booking, send parcel, delivery man, COD delivery |

Gated out until Live: scooter ride, women driver ride (G-SCOOTER, G-WOMEN).

## 5.2 Bangla candidates

| Vertical | Candidates |
|---|---|
| Ride-hailing | রাইড শেয়ারিং, বাইক রাইড, বাইক বুকিং, সিএনজি বুকিং, সিএনজি ভাড়া, গাড়ি বুকিং |
| Rent-a-car and intercity | গাড়ি ভাড়া, কার ভাড়া, মাইক্রোবাস ভাড়া, ঘণ্টা হিসেবে গাড়ি ভাড়া, আন্তঃজেলা গাড়ি |
| Truck and shifting | ট্রাক ভাড়া, পিকআপ ভাড়া, কাভার্ড ভ্যান, বাসা বদল, অফিস বদল |
| Ambulance | অ্যাম্বুলেন্স বুকিং, অ্যাম্বুলেন্স সার্ভিস |
| Food | খাবার ডেলিভারি, অনলাইন খাবার, রেস্টুরেন্ট খাবার |
| Shops and workshops | বাজার ডেলিভারি, অনলাইন বাজার, মুদি পণ্য, অটো পার্টস, গাড়ির ওয়ার্কশপ |
| Parcel and delivery | পার্সেল ডেলিভারি, কুরিয়ার বুকিং, পার্সেল পাঠানো, ক্যাশ অন ডেলিভারি |

## 5.3 Banglish candidates

bike ride dhaka, cng vara, gari booking, ride sharing bd, gari bhara, microbus bhara, truck bhara, pickup bhara, basa bodol truck, ambulance service bd, khabar delivery, food order bd, bajar delivery, grocery delivery bd, parcel pathano, parcel delivery bd, courier booking, cash on delivery.

## 5.4 Rules

1. Map each term to one clear intent and one destination. Do not send an ambulance searcher to a page about burgers.
2. Start with services that are operationally strong. Search demand cannot compensate for missing supply.
3. Collect real phrases from support tickets, driver and merchant onboarding and search logs. Strip personal data before analysis.
4. Judge terms by bookings and first orders, not installs.
5. No keyword stuffing. Google advises against repetition and irrelevant metadata. There is no official 3 to 5 repetition formula.
6. Every volume or difficulty number needs a dated source: tool, geography, date, method.

---

# 6. Graphics and screenshots

## 6.1 Asset specifications (re-verify in Console and App Store Connect before submission)

| Asset | Google Play | Apple |
|---|---|---|
| App icon | 512 x 512 px PNG, up to 1 MB | 1024 x 1024 px, no transparency |
| Feature graphic | 1024 x 500 px, JPEG or 24-bit PNG, no alpha | Not used |
| Phone screenshots | 2 to 8, JPEG or 24-bit PNG, 320 to 3,840 px per side, long side no more than twice the short side | Required sizes change by device generation; check current list |
| Tablet screenshots | Optional but needed for tablet-optimized ranking | Check current list |
| Video | Optional YouTube link | Optional app preview |

Rules for all screenshots: capture from the real release build. Never fabricate UI, coverage, prices, provider availability, safety functions or payment confirmations. Use legible headlines, one message per image, correct BDT symbols and real local landmarks only where the app shows them.

## 6.2 Eight-slide storyboard (launch order, with gates)

| # | English headline | Bangla headline and subtext | Screen to capture | Gate |
|---|---|---|---|---|
| 1 | One app for everyday services | প্রতিদিনের নানা সেবা, একটি অ্যাপে<br>যাতায়াত, খাবার, কেনাকাটা ও ডেলিভারি | Home screen, real service tiles | Every visible tile opens a working flow |
| 2 | Choose a ride that fits your trip | যাত্রা অনুযায়ী বাহন বেছে নিন<br>বাইক, সিএনজি ও কার | Vehicle selector, fare screen | G-RIDE. Add scooter only when G-SCOOTER is Live. Show women-only only when G-WOMEN is Live, as an optional setting |
| 3 | Plan local and intercity travel | লোকাল ও আন্তঃজেলা ভ্রমণের পরিকল্পনা করুন<br>ঘণ্টা, দিন বা রুট অনুযায়ী গাড়ি ভাড়া | Rental duration and route request | G-RENT |
| 4 | The right vehicle for your move | বাসা বদল ও পণ্য পরিবহনে সঠিক বাহন<br>পিকআপ, কাভার্ড ভ্যান ও ট্রাক | Vehicle-size selector, move request | G-TRUCK, real inventory only |
| 5 | Request available ambulance transport | প্রয়োজনে অ্যাম্বুলেন্স পরিবহনের অনুরোধ করুন<br>সেবার ধরন ও প্রাপ্যতা এলাকা অনুযায়ী | Real request flow, provider info | G-AMB. No dramatic imagery, no response-time implication |
| 6 | Local food, delivered to you | পছন্দের স্থানীয় খাবার পৌঁছে নিন<br>অংশগ্রহণকারী রেস্টুরেন্ট থেকে অর্ডার | Restaurant list, menu, order status | G-FOOD |
| 7 | Shop local. Book workshop services. | লোকাল দোকান থেকে কেনাকাটা ও ওয়ার্কশপ বুকিং<br>নিত্যপণ্য, অটো পার্টস ও সার্ভিস | Store category screen, workshop booking | G-SHOP |
| 8 | Clear trip controls and flexible payment | নিরাপত্তা ও পেমেন্টের সুবিধা<br>ট্রিপ শেয়ারিং, পিন ও পেমেন্ট অপশন | Real safety and payment screens | G-SAFETY and G-PAY. Show only what is active |

**Slide 1 is the conversion gate.** A new visitor must understand within seconds that Ride covers mobility, commerce and delivery. If fewer than eight slides are Live, ship fewer. Do not pad with unavailable services.

---

# 7. Policy and compliance register

## 7.1 Driver weekly call package: Payments policy (OPEN, owner decision)

**What the policy says (confirmed from Google's Payments policy pages, 5 Nov 2026):**

- Physical goods and physical services, such as transportation and food delivery, are **not** sold through Google Play Billing. Ride fares, food orders and groceries are fine on PortPos or any other gateway. This is the point the other AI correctly made.
- Charges for in-app features, app functionality or subscription-type access **are** expected to use Google Play Billing.

**Why that does not settle the driver package:** the rider's fare is the physical service. The weekly package is a separate charge paid **by the driver to Ride** for access to ride requests inside the app. Whether Google treats that as a payment for a physical service or as a charge for app functionality is a classification question, and the draft's own Section 10.1 flags it. "Rides are physical" does not answer it. Only Google's review or written policy response does. Apple's In-App Purchase rules are the same family and the risk is not smaller there.

**What I will not do:** state that the package is safe, or that it is not. Neither is established.

**Options for the owner, not recommendations on legality:**

1. **Get a written position before submission.** Ask Google Play policy support through Play Console, describing the package exactly. Do the same for Apple if an iOS driver app is planned.
2. **Separate the apps or flows.** Many marketplaces ship a distinct driver app. This does not remove the question for the driver app.
3. **Price in Play Billing** if the answer is that it applies. Google's subscription service fee is lower than its general rate. Confirm current rates before modelling.
4. **Ship with the package disabled in the store build** and enable it after review. Slower, safer.

**Listing copy rule regardless of outcome:** because the listing mentions a charge, the description must say payment is required for that access. The PARTNER block does. Never say drivers keep all earnings or pay nothing.

## 7.2 Other gates

| Area | Requirement | Owner action |
|---|---|---|
| Location | Ask for the minimum scope. Background location needs a declaration, a demo video, and a prominent in-app disclosure that matches the privacy policy | Decide foreground-only vs background for drivers. Prepare the video |
| Privacy policy | Must be real, public, and match the Data safety form and actual SDK behaviour | Approve the policy. The website `/privacy` page stays a placeholder until then |
| Data safety form | Inventory every SDK and backend behaviour | Complete after the policy |
| Account deletion | In-app deletion plus a public web path | Website `/delete-account` must point to a tested workflow reaching a monitored inbox |
| App access | Reviewers need working logins for customer, driver, merchant and provider roles, with OTP, location and payment sandbox instructions | Prepare test accounts. Reviewers must not need a real emergency or a real provider |
| Emergency features | Ride is not an emergency service. Test SOS, network failure and fallbacks | Test on target devices before mentioning SOS |
| Health-related declaration | Ambulance requests may trigger Console health or medical declarations | Check the current Console declaration list before submitting with G-AMB |
| Financial features | A wallet or top-up in the release may trigger a financial features declaration | Check the current Console list |
| Content rating | Complete the rating questionnaire truthfully | Owner |
| Target audience | Not designed for children | Owner |
| Reviews | Do not buy, incentivize, gate or fabricate reviews. Do not ask only happy users. Do not condition support on review behaviour | Applies to all in-app prompts |
| Trademarks | Do not use competitor names in store metadata | Applies to all fields |

---

# 8. Custom store listings

A custom listing is the same app with a message tuned to an audience or search term. Do not create thin listings that point to services that are not Live.

| Listing | Audience | Hero headline | First screenshots | Start when |
|---|---|---|---|---|
| Default | General consumers | One app for everyday services | Overview, rides, food and shops | Launch |
| Driver or ride partner | Bike, CNG and car drivers | Keep your trip fare. See partner terms clearly | Onboarding, vehicle, package terms, trip flow | Package wording approved (Section 7.1) |
| Merchant delivery | Retailers and online sellers | Delivery support for your local orders | Merchant order flow, rider request, COD workflow | G-PARCEL Live |
| Truck and shifting | Home movers, cargo | Pickup and truck options for moving goods | Vehicle sizes, request flow | G-TRUCK Live with supply |
| Ambulance | Medical transport searchers | Find ambulance options where available | Real request flow, limits | G-AMB Live, provider network active |

**Driver wording guardrail:** say "no per-trip commission" and in the same breath explain the weekly package for access to ride requests. Never say or imply that drivers pay nothing or keep all gross earnings without package costs.

---

# 9. Measurement and experiments

## 9.1 Metrics

| Stage | Metric | Reason |
|---|---|---|
| Discovery | Store listing visitors and traffic source | Where qualified users come from |
| Intent | Install clicks and listing conversion | Store page contribution |
| Activation | First completed ride, first food order, first parcel | Installs are not usage |
| Supply | Verified, active drivers, merchants, workshops, delivery partners | Marketplace readiness |
| Retention | Day-1 and Day-7 return, by role and vertical | Recurring value |
| Quality | Crashes, ANRs, failed bookings, cancellations, support contacts | Growth must not mask product problems |
| Economics | Cost per activated user, per first transaction, per active partner | Ties acquisition to the business |

Keep rider, driver and merchant cohorts separate. A driver install is not equivalent to a rider install.

## 9.2 Play Console experiments (re-verify capabilities in Console)

| Window | Test | One variable | Metric | Rule |
|---|---|---|---|---|
| Baseline | None | None | Install clicks, listing performance | Record by country, language and source |
| Test 1 | App icon | Concept A vs B | Unique user install clicks | Use Console's significance estimate |
| Test 2 | Screenshot 1 | Overview vs mobility-first | Unique user install clicks | Hold other assets constant |
| Test 3 | Bengali localization | Reviewed Bangla copy vs current | Localized install clicks | Only after native review |
| Test 4 | Service-specific listing | Driver, merchant or ambulance message | Listing acquisition plus downstream activation | Compare activation separately |

Run tests long enough to cover weekdays and weekends. Change one variable at a time. Do not invent a "1,000 installs per variant" or "90% confidence" rule: Google does not publish a universal one.

## 9.3 Apple

Product Page Optimization tests up to three alternate treatments of supported assets. Custom Product Pages give campaign-specific pages with their own URLs. Use the built-in analytics.

---

# 10. Website and store alignment

The website, store listings and ads must make identical claims. This document's gate table (Section 1) governs all three.

| Item | Value | Status |
|---|---|---|
| Website | `https://ride.digital-papyrus.com` | Domain owned; hosting on Vercel |
| Support email | `support@ride.digital-papyrus.com` | Mailbox created |
| Privacy email | `privacy@ride.digital-papyrus.com` | Mailbox created |
| Support page | `/support` | Built |
| Privacy policy | `/privacy` | **Placeholder. Needs an approved policy before any store submission** |
| Account deletion | `/delete-account` | **Placeholder. Needs a tested workflow** |
| Legal entity and address | | Not yet provided |
| Play Store URL | | Empty until the listing exists |
| Pre-launch state | Site is noindex and labelled pre-launch | Controlled by the `preLaunch` flag |

Store submission is **blocked** by the three bold items above, not by anything in the store copy.

---

# 11. Submission checklist

## Before submission

- [ ] Owner marks every gate in Section 1 (Live, Limited pilot, Planned, Not in release)
- [ ] Assemble EN and BN descriptions from live blocks only. Check counts in Console
- [ ] Native Bangla review of Section 3.4 and the screenshot headlines
- [ ] Trademark and existing-app check on "Ride"
- [ ] Section 7.1 outcome recorded in writing, driver wording updated if needed
- [ ] Privacy policy approved and live at `/privacy`
- [ ] Account deletion workflow tested and live at `/delete-account`
- [ ] Data safety, location declaration, app access instructions, content rating, target audience, and any health or financial declaration completed
- [ ] Genuine screenshots from the release build, English and Bangla
- [ ] Icon, feature graphic and screenshot specs verified
- [ ] Support mailboxes tested from two external providers

## First 30 days after publication

- Establish a baseline by language, source, city and audience
- Review install-click conversion and first transactions
- Review crashes, ANRs, failed bookings and support reasons
- Fix product friction before optimizing visuals

## Days 31 to 60

- One visual variable at a time in Play experiments
- Launch Driver and Merchant listings only where their flows are Live
- Review wording with native users

## Days 61 to 90

- Add Truck or Ambulance listings only with real supply
- Test the screenshot 1 proposition and the icon if traffic allows
- Expand cities only when supply, support and fulfilment are ready
- Keep a change log: hypothesis, asset, dates, audience, metric, result, decision

---

# 12. Open decisions for the owner

1. Mark the Section 1 gates. Nothing else can be finalized without this.
2. Section 7.1: how the driver package will be sold, and get Google's written position.
3. Which payment methods are actually live and tested. List none by name until then.
4. Native Bangla reviewer.
5. Whether an iOS release is in scope for the first submission.
6. Primary category choice (Maps & Navigation vs Travel).

---

# 13. Sources and boundaries

**Product source:** the Ride ASO briefing from 5 November 2026 as used by the ChatGPT draft. It states intended scope and has **not** been audited against the app repository or a production build.

**Checked in this version:** all character and byte counts (by script); Google Play Payments policy wording on physical goods and services versus in-app features (Google support pages, 5 Nov 2026).

**Google Play documentation to re-check before submission:** store listing limits, best practices, listing experiments, custom store listings, background location, Payments policy.

**Apple documentation to re-check before submission:** App Store Connect app information, product page, platform version information, Product Page Optimization.

**Research date:** 5 November 2026. Store policies and Console capabilities change. Re-check the official documents and the live Console UI immediately before submitting.

---

**End of v2.** The Markdown file is the editable source. Regenerate any PDF after changes.
