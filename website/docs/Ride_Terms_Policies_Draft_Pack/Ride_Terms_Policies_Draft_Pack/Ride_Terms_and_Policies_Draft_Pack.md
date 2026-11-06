# RIDE — TERMS & POLICIES DRAFT PACK

**Working draft v0.1 | Bangladesh | 5 November 2026**  
**Status: NOT APPROVED FOR PUBLICATION — operational and Bangladesh legal review required**

> This pack is a structured commercial and product-policy draft for Ride. It is not a legal opinion, does not establish that Ride has obtained any required licence or enlistment, and must not be published until every `[CONFIRM]` / `[INSERT]` item has been completed and the documents have been reviewed by a Bangladesh-qualified lawyer. These drafts are written for Ride's described operating model; they must be reconciled with the production app, contracts, payment flows, backend, SDKs and actual service coverage.

---

## 0. Publication controls — complete before anything goes live

### 0.1 Legal operator details

| Required field | Value to insert |
|---|---|
| Legal contracting entity | `Ride Digital Services` |
| Entity type and registration number | `[COMPANY / PARTNERSHIP / SOLE PROPRIETORSHIP + NUMBER]` |
| Registered office | `7/1-D, R.K. Mission Road, Dhaka-1203` |
| Business / trade licence details | `[INSERT WHERE LEGALLY REQUIRED]` |
| Tax identification | `[TIN / BIN / VAT DETAILS AS APPLICABLE]` |
| Public brand | Ride |
| Public website | `https://ride.digital-papyrus.com` — confirm DNS and ownership before publication |
| Customer support | `support@ride.digital-papyrus.com` and `WhatsApp +880171324950 or in-app support` |
| Privacy / data requests | `privacy@ride.digital-papyrus.com` |
| Legal notices | `[LEGAL NOTICE EMAIL / POSTAL ADDRESS]` |
| Effective date | `01 November 2026` |

**Do not identify Digital Papyrus as the contracting company unless that is the legal entity actually operating Ride.** A domain name, project name or brand is not a substitute for the legal contracting entity.

### 0.2 Product and operating assumptions used in this draft

These are working assumptions taken from Ride's product briefing and previous operating decisions. Confirm each against the live build and partner contracts.

- Ride is one multi-role application and platform for customers, drivers, delivery partners, merchants, fleet / rental providers and ambulance operators.
- The described service groups are: (1) ride-hailing, (2) rent-a-car / intercity, (3) truck / pickup / shifting, (4) ambulance booking, (5) food orders, (6) shops / groceries / automotive services, and (7) parcel / courier / merchant delivery personnel.
- Ride's ride-hailing model is intended to charge drivers for weekly prepaid call packages / access to ride leads, not deduct a percentage commission from each completed ride. Drivers are intended to retain 100% of the agreed ride fare, paid directly by the customer through the method agreed for that trip.
- Ride is not intended to hold ride fares in escrow. This statement must not be applied automatically to food, shop, parcel, rental or other payment flows; those must be described according to the actual merchant / provider settlement model.
- Cash and direct mobile financial service payments (including bKash / Nagad, where supported) may be used. Card and other payment methods must only be named where the relevant production integration is active.
- The product plan includes location search, routing and live trip / delivery tracking. The production data flow, including Barikoi, dpMaps, hosting, SMS, analytics and crash-reporting services, still needs to be inventoried.
- Women-only matching and gender-related preferences are described as optional features where enabled and where a suitable verified provider is available. Do not promise a guaranteed match.
- Emergency / ambulance availability, clinical equipment, paramedic credentials, 999 integration and geographic coverage must be verified before they are represented as live capabilities.

### 0.3 Document suite and recommended public URLs

Use separate, linked documents rather than a single overloaded policy page. Proposed URLs are illustrative and must be created in the website project.

| Document | Suggested URL |
|---|---|
| General Terms of Use | `/terms` |
| Privacy Notice | `/privacy` |
| Account and Data Deletion | `/delete-account` |
| Customer / Passenger Terms | `/terms/customers` |
| Driver and Service Partner Terms | `/terms/partners` |
| Merchant Terms | `/terms/merchants` |
| Food and Shop Orders Policy | `/policies/orders` |
| Parcel and Delivery Policy | `/policies/parcel` |
| Car / Truck Rental Policy | `/policies/rentals` |
| Ambulance Booking Policy | `/policies/ambulance` |
| Cancellation, Returns and Refunds | `/policies/refunds` |
| Safety and Community Standards | `/safety` |
| Cookie Notice | `/cookies` |

At minimum, publish the General Terms, Privacy Notice and Account Deletion page before Play Console submission. Publish service addenda before enabling the corresponding booking / provider flows.

---

# PART A — GENERAL TERMS OF USE

These Terms of Use govern the access to and use of the Ride website, mobile applications, APIs, and associated platform services.

**Document Status:** Working Draft — Subject to Final Approval

**Last Updated:** 1 November 2026

**Effective Date:** 1 November 2026

---

### 1. Who We Are and What These Terms Cover

Ride is a technology platform that connects customers with independent service providers and merchants to discover, request, arrange, and manage transportation, logistics, delivery, shopping, rental, and emergency transport services through a unified digital interface.

These Terms of Use constitute a legally binding agreement between you and Ride Digital Services, a [ENTITY TYPE] registered in Bangladesh under registration number [REGISTRATION NUMBER], having its registered office at 7/1-D, R.K. Mission Road, Dhaka-1203 ("Ride", "we", "us", or "our").

These terms apply whenever you access or use Ride’s website, mobile applications, application programming interfaces (APIs), merchant or provider interfaces, or customer support channels. By creating an account, submitting a booking or order, accepting a service request, or otherwise using the Platform, you agree to be bound by these Terms of Use and any applicable service-specific policies.

If you do not agree to these terms, do not create an account or use the Platform.

### 2. Definitions

* **Customer / User:** Any individual who accesses or uses Ride to search for, request, book, purchase, send, or receive services or goods.
* **Provider / Partner:** An independent driver, vehicle owner, courier, delivery person, fleet operator, vehicle rental operator, private ambulance provider, or other professional service supplier offering services via the Platform.
* **Merchant:** A restaurant, grocery store, pharmacy, retail shop, commercial workshop, or business entity listing products or services on the Platform.
* **Booking / Order:** A formal request submitted through the Platform for transportation, rental, courier delivery, ambulance dispatch, or merchandise purchase.
* **Platform:** The Ride mobile applications (including Android), websites, software modules, backend algorithms, APIs, and associated operational systems.
* **Service Provider:** The independent individual or corporate entity that physically fulfills the transport, rental, medical transit, delivery, or retail service specified in a Booking.

### 3. Roles and Operational Boundaries

Ride is a technology provider. Depending on the specific service, the Platform provides account onboarding, digital matching, provider discovery, dispatch coordination, estimated route calculation, pricing display, real-time tracking, in-app communications, dispute intake, and customer support.

The physical transportation, delivery, rental, medical transport, or retail products ordered via the Platform are provided exclusively by independent Providers or Merchants. Each Provider and Merchant is solely responsible for its own services, road safety, vehicle roadworthiness, product quality, food hygiene, regulatory licensing, operational permits, and statutory compliance.

Nothing in these terms limits or diminishes any statutory obligations imposed upon Ride as a technology intermediary, marketplace platform, data fiduciary, or contracting party under mandatory Bangladesh law.

Before confirming any request, you must review the designated Provider or Merchant, service description, estimated delivery time, route specifications, total price, and applicable cancellation terms displayed on the Platform.

### 4. Eligibility and Account Security

You must be at least 18 years of age to register an account, execute these terms, or request services through the Platform. Contracts entered into by minors are void under the Contract Act, 1872; consequently, individuals under the age of 18 are prohibited from creating or holding an account.

An adult account holder may book a ride, delivery, or service on behalf of an unaccompanied minor where Platform features permit. In such circumstances, the adult account holder remains the sole contracting party, assumes full legal and financial responsibility for the booking and the minor’s conduct, and warrants that they possess lawful custody or authority to arrange the service.

You agree to provide true, current, and complete details during registration, safeguard your login credentials, update inaccurate profile information promptly, and notify Ride immediately of any suspected unauthorized account activity. You are legally responsible for all transactions and activities conducted through your account. You must not register duplicate or misleading accounts, impersonate another person, share account credentials, or upload falsified identity documents.

### 5. Bookings, Availability, and Service Areas

Submitting a request on the Platform constitutes an offer to book and does not guarantee confirmation. A booking is confirmed only when the Platform generates an explicit confirmation screen or when a Provider or Merchant affirmatively accepts the request.

Service availability depends on active provider capacity, localized operating hours, vehicle availability, merchant stock, real-time traffic, weather conditions, public order, and operational variables. All transit times and arrival schedules displayed by Ride are non-binding estimates, unless expressly marked as guaranteed.

Ride reserves the right to decline, cancel, or suspend any booking request where it reasonably identifies fraud, security threats, illegal conduct, inaccurate user information, provider unavailability, or system errors. Where feasible, Ride will inform you of the reason for cancellation and advise on available alternatives.

Service coverage is location-specific. Availability of a service category on marketing channels or general application screens does not guarantee active coverage across every geographic coordinate or district.

### 6. Fares, Item Pricing, and Charges

Prior to confirming a booking or checkout, the Platform displays the applicable trip fare, merchandise price, provider bid/quote, delivery charge, platform access charge, estimated waiting surcharge, road tolls, parking fees, and statutory taxes known and calculable at that time.

The final payable amount may be adjusted only where the booking terms explicitly provide for legitimate variations, such as customer-directed route changes, intermediate stops, excess waiting time, order quantity adjustments, loading/unloading fees, or incurred road tolls. Ride does not impose hidden or undisclosed platform surcharges after a booking has been confirmed.

Where a service operates on a bidding or customized quotation basis, the customer is responsible for reviewing the proposed scope of work and total price before accepting the offer.

### 7. Pricing, Monetization Model, and Payments

* **Direct Customer-to-Provider Settlement:** Ride operates as a software intermediary and does not collect, hold, process, or escrow funds payable by customers to Providers or Merchants. The total trip fare, delivery charge, rental fee, or product price displayed on the Platform is settled directly by the customer with the designated Provider or Merchant using the payment method mutually agreed for that transaction (such as cash, direct peer-to-peer Mobile Financial Services [MFS] transfer to the provider’s account, or merchant-integrated point-of-sale). Ride is not a payment collector, escrow agent, or banking institution for customer transactions.
* **Platform Monetization Model:** Ride licenses its software and dispatch platform to independent Providers and commercial Merchants. Platform fees are collected exclusively from Providers and Merchants under separate partner agreements, structured through recurring periodic subscriptions (such as software access passes) and/or platform lead-generation fees or dispatch commissions. Customers are not billed platform access subscription fees by Ride for requesting or booking services, unless an explicit customer-facing convenience fee is transparently disclosed prior to booking confirmation.
* **Payment Lawfulness:** You must not utilize any payment credentials, cards, or digital wallets that you are not legally authorized to operate. Third-party MFS operators and payment processing institutions apply their own independent terms, transaction limits, identity verifications, and processing times.

### 8. Cancellations, Refunds, and Service Complaints

Cancellation eligibility, applicable cancellation fees, and refund mechanisms vary by service type and are governed by the specific cancellation terms displayed prior to booking confirmation, subject to statutory consumer protection laws.

Because transaction payments are settled directly between customers and Providers or Merchants, monetary refunds for deficient goods, order cancellations, or service failures must be coordinated directly with the supplying Provider or Merchant. Ride provides in-app dispute intake channels to help mediate claims regarding incorrect billing, missing items, damaged goods, failed delivery, provider no-shows, or safety concerns.

When filing a complaint, provide the relevant Booking ID along with contemporaneous documentation. For security reasons, never share full credit/debit card numbers, banking PINs, account passwords, or One-Time Passwords (OTPs) with customer support representatives. Ride reviews dispute submissions impartially but does not act as an insurer or financial guarantor of third-party transactions. Using Ride's support service does not affect your right to seek legal remedies under applicable law.

### 9. User Conduct and Prohibited Activities

You agree not to:

* Use the Platform for any unlawful purpose, fraud, extortion, harassment, stalking, violence, or discrimination;
* Generate fictitious bookings, file false safety incidents, submit forged identification documents, or manipulate transaction confirmations;
* Solicit or instruct a Provider to violate traffic rules, road safety regulations, transport laws, food safety standards, or criminal statutes;
* Ship, transport, or request delivery of hazardous chemicals, illegal narcotics, contraband, uninspected biological agents, firearms, explosives, or undeclared restricted goods;
* Trigger emergency, SOS, or ambulance features for non-emergency or fraudulent purposes;
* Bypass Platform security, reverse engineer source code, scrape platform databases, harvest user information, or inject malicious code; or
* Contact other users, drivers, or merchants for unsolicited marketing, personal harassment, or any purpose outside the legitimate fulfillment of the booked service.

### 10. Safety and Emergency Protocols

Users must comply with all in-app safety directives, vehicle safety protocols, and statutory rules. Standard ride-hailing, courier, and rental services must never be used as a substitute for official emergency response services, including state police, fire rescue, or specialized advanced life support ambulances.

Where the Platform includes in-app safety features, SOS alerts, or automated emergency messaging, their operational integrity depends on active mobile data coverage, cellular transmission, correct device permissions, and the functioning of third-party telecommunications networks. Ride cannot warrant that private contacts, medical institutions, or public authorities will instantly receive or act upon automated alerts.

In any situation involving imminent bodily harm, physical assault, severe medical crisis, or life-threatening emergency in Bangladesh, contact local law enforcement and national emergency response services directly, including the National Emergency Service at 999.

### 11. Ratings, Reviews, and User Content

You may submit reviews, star ratings, service feedback, and support inquiries reflecting genuine personal experiences. You must not post defamatory statements, profane language, commercial advertisements, deceptive reviews, personal identifying details of third parties, or content that infringes third-party privacy or intellectual property rights.

You retain ownership of the text, images, and content you submit. However, you grant Ride a worldwide, non-exclusive, royalty-free license to host, display, reproduce, and process that content solely to operate, secure, evaluate, and enhance Platform services. This license terminates upon the deletion of your content, except where copies must be maintained for lawful audit compliance, dispute resolution, platform safety, or system backups.

### 12. Account Suspension and Termination

Ride may restrict, suspend, or terminate your access to the Platform where reasonably warranted to protect platform safety, investigate fraud or security incidents, enforce these terms, comply with a judicial or statutory directive, or mitigate severe operational exposure. Except where immediate intervention is required to address imminent safety, fraud, or legal risks, Ride will provide notice and an opportunity to appeal or submit an explanation.

You may stop using the Platform and request account deletion at any time in accordance with our Account Deletion Policy. Final deletion may be deferred until all pending bookings are completed, direct payment disputes are settled, and mandatory statutory record-retention requirements are fulfilled.

### 13. Intellectual Property Rights

Ride and its licensors retain all right, title, and interest in and to the Platform, including proprietary software code, interface designs, trademarks, domain names, and commercial branding. You are granted a limited, personal, revocable, non-transferable, and non-exclusive license to use the Platform application strictly for its intended functional purposes. You must not copy, modify, distribute, sell, lease, reverse engineer, or decompile any Platform software, except to the extent permitted by mandatory law.

### 14. Third-Party Integrations and External Services

The Platform integrates services operated by independent third parties, including digital map providers, telecommunications networks, cloud hosting infrastructure, and merchant point-of-sale systems. Such external services are subject to their respective terms and conditions.

The integration or hyperlinking of external services does not imply that Ride endorses, guarantees, or assumes operating control over third-party systems. Ride remains accountable strictly for its own direct operational commitments and statutory duties.

### 15. Liability Boundaries and Consumer Rights

Nothing in these Terms of Use excludes, restricts, or modifies any statutory rights, guarantees, or remedies available to consumers under the *Consumer Rights Protection Act, 2009*, the *Road Transport Act, 2018*, or any other mandatory enactment of Bangladesh that cannot lawfully be contracted out of.

Ride remains responsible for the core technological availability, software security, and explicit contractual commitments of the Platform. Because transportation, delivery, rental, private ambulance services, and retail items are supplied directly by independent third parties, Ride is not liable for vehicle accidents, traffic offenses, transit delays, bodily injury, loss of life, property damage, food hygiene issues, or product defects caused by independent Providers or Merchants, except where such damage is directly caused by Ride’s gross negligence, willful misconduct, or breach of statutory obligation.

### 16. Modifications to These Terms

Ride may update or revise these Terms of Use from time to time to accommodate technical developments, operational adjustments, or changes in applicable legislation. Material revisions will be notified through the mobile application, website announcements, email, or other reasonable communication channels, stating the effective date of the amendments. Continued access to or use of the Platform following the effective date constitutes acceptance of the modified terms. Where required by law, your express consent will be obtained.

### 17. Governing Law and Dispute Resolution

These Terms of Use, their interpretation, and any claims or disputes arising out of or in connection with them or the use of the Platform are governed by and construed in accordance with the substantive laws of Bangladesh.

In the event of any disagreement or dispute, you and Ride agree to first seek an informal, amicable resolution by lodging a formal complaint through Ride Customer Support. If the dispute is not resolved amicably within 30 days of submission, either party may pursue statutory remedies before the National Directorate of Consumer Rights Protection (DNCRP) or submit the dispute to the non-exclusive jurisdiction of the competent civil courts located in Dhaka, Bangladesh. Nothing in this clause prevents a consumer from pursuing mandatory legal remedies before competent statutory authorities.

* **Courts / Venue:** Non-exclusive jurisdiction of the competent courts of Dhaka, Bangladesh.

### 18. Contact Details

* **Contracting Entity:** Ride Digital Services
* **Registered Address:** 7/1-D, R.K. Mission Road, Dhaka-1203, Bangladesh
* **Customer Support Email:** support@ride.digital-papyrus.com
* **Legal Notices:** [LEGAL EMAIL / ADDRESS]

---

# PART B — CUSTOMER / PASSENGER TERMS

These terms supplement the General Terms when you book a ride or other transport service.

## 1. Before travel

Check the vehicle category, driver / provider details, pickup point, destination, route, passenger count, fare estimate and any special conditions shown in the app. A booking may be declined where the selected vehicle cannot lawfully or safely carry the requested passengers or luggage.

Use the correct pickup and destination information. Update the provider through the in-app channel if your location or destination changes. Additional stops, waiting, route changes, tolls or parking may affect the final price only as disclosed in the app or agreed before the change.

## 2. Passenger responsibilities

- Be ready at the pickup point and keep your phone available.
- Verify the vehicle and provider identity before starting the trip.
- Use seat belts and appropriate safety equipment where provided.
- Do not ask the driver to speed, violate traffic rules, carry unlawful goods or exceed legal passenger capacity.
- Treat the provider and vehicle with respect; do not damage the vehicle or engage in abusive conduct.
- Do not share a trip or provider's personal information publicly without a legitimate reason.

## 3. Women-only matching

Where the feature is enabled, a customer may request an eligible women-only match. The feature depends on verified partner availability, service area, vehicle category and live capacity. Ride will not promise a match where no eligible provider is available. Gender information and matching preference must be used only for account administration, matching, safety and related disclosed purposes, with privacy safeguards.

## 4. Scheduled rides and cancellations

A scheduled request is subject to provider confirmation and availability. A scheduled time is not a guarantee unless the app expressly confirms it. Cancellation and no-show charges, if any, must be disclosed before the customer confirms the booking.

## 5. Lost property and incidents

Report lost property, accidents, safety concerns or fare issues through `support@ride.digital-papyrus.com or WhatsApp +880171324950` as soon as reasonably possible. Do not attempt to recover property by confronting another user. Ride may share the minimum relevant booking and contact information with the matched provider or authorities to resolve the report or comply with law.

---

# PART C — DRIVER AND SERVICE PARTNER TERMS

These terms govern the access to and use of the Ride platform by independent drivers, couriers, vehicle operators, and commercial service partners.

**Document Status:** Official Terms of Service

**Last Updated:** 1 November 2026

**Effective Date:** 1 November 2026

**Applies to:** Ride drivers, motorcycle/scooter/CNG auto-rickshaw/car operators, rental and truck operators, couriers, delivery personnel, private ambulance operators, and other authorized service partners. A separate executed partner agreement or role-specific service addendum may impose additional operational conditions.

---

### 1. Eligibility, Onboarding, and Vehicle Approvals

You may provide services through the Platform only after Ride has verified and approved your partner profile for the designated service category. You must provide authentic, valid, and up-to-date identification, contact, payment, and role-specific documentation, and maintain their validity throughout your use of the Platform.

Ride is strictly a technology software intermediary and does not operate as a transport owner, carrier, or motor vehicle authority. Ride assumes no legal or operational liability for obtaining, maintaining, or verifying municipal route permits, commercial fitness, or regulatory approvals for any vehicle.

Each driver and registered vehicle owner represents and warrants that their vehicle holds an active registration certificate, valid certificate of fitness, updated tax token, Regional Transport Committee (RTC) route permit, appropriate driving licence, and all individual ridesharing enlistments required by the Bangladesh Road Transport Authority (BRTA) under prevailing laws. Any administrative fines, legal notices, vehicle impoundments, or financial penalties imposed by law enforcement or BRTA mobile courts arising from missing, invalid, or expired vehicle documentation are the sole legal and financial responsibility of the driver and vehicle owner. The driver and vehicle owner agree to indemnify and hold harmless Ride Digital Services against all related claims, losses, and proceedings.

For private ambulance, medical transit, freight, commercial rental, and logistics delivery services, you must provide all specialized regulatory permits, professional certifications, commercial vehicle insurance, and equipment maintenance records mandated by Bangladesh law. Ride reserves the right to reject an onboarding application or pause an active profile if any credential is missing, expired, altered, or unverified.

### 2. Partner Account and Platform Use

You must personally operate and maintain control over your approved partner account, unless Ride has explicitly authorized designated, named staff accounts for your registered fleet or business entity. You may not lend, lease, sub-license, assign, or transfer account access to any third party.

You must maintain the strict confidentiality of customer personal data and use such information solely to fulfill an accepted booking, resolve an active service issue, or comply with statutory legal duties.

You agree not to:

* Discriminate against, harass, stalk, threaten, or intimidate any customer or member of the public;
* Solicit off-platform commercial business or deceptively divert bookings;
* Manipulate GPS telemetry, simulate geographic coordinates, or falsify booking completion;
* Demand payments outside the Platform beyond the mutually agreed settlement method; or
* Coerce, solicit, or pressure a customer to alter a confirmed fare, route, or payment arrangement.

### 3. Platform Access Packages, Ride Leads, and Commercial Model

* **Commercial Model:** Ride operates as a software provider and does not deduct a percentage-based commission from completed trip fares. The driver retains 100% of the agreed trip fare, which the customer settles directly with the driver using the payment method mutually agreed for that booking.
* **Platform Access Packages:** To receive customer dispatch requests ("leads" or "calls") through the Platform, independent service partners purchase prepaid platform access packages (such as weekly or monthly dispatch passes) through authorized payment channels, including integrated Mobile Financial Services (MFS) and local digital gateways.
* **Dynamic Package Terms:** Specific package tiers, subscription fees, validity windows, lead quotas, rollover rules, and failed-dispatch credits are established by Ride and displayed dynamically within the Partner App prior to purchase. The package specifications shown on the checkout screen at the time of purchase govern that specific transaction. Ride reserves the right to introduce, adjust, or discontinue packages prospectively; provided that such revisions will not alter the terms of an active, paid-up package during its ongoing validity period.
* **No Income or Volume Guarantee:** Platform access packages constitute a service fee for accessing Ride’s software infrastructure and matching algorithms. Purchasing an access package does not guarantee any minimum number of ride requests, customer acceptances, completed trips, or revenue benchmarks. Payments for access packages are non-refundable once activated, except where a verified technical failure on the Platform prevents software access.

### 4. Operational and Service Standards

Accept only dispatch requests that you are legally authorized, equipped, and physically able to fulfill safely. Maintain the assigned vehicle, safety equipment, cargo fixtures, and statutory documents in clean, roadworthy, and fully compliant condition. Do not substitute an unverified vehicle, unauthorized replacement driver, or third-party operator without the customer's prior consent and Ride’s formal authorization, where required.

You must fulfill each accepted service in accordance with agreed specifications, update progress milestones in the partner app promptly and accurately, exercise reasonable care over all handled goods and passenger property, and report safety, road, or security incidents immediately. You must never mark a trip, order, or delivery as completed prior to actual physical fulfillment.

### 5. Location Services and Telemetry

If your service category requires live availability broadcasting or active in-transit tracking, you must enable the requisite device permissions outlined in the partner app. Background location data may be collected and processed only for disclosed operational purposes and strictly within the scope and operational status required for that service.

You must switch your status to offline or unavailable whenever you are not actively seeking or fulfilling work. Ride does not conduct continuous background location monitoring when you are offline or outside an active service session.

### 6. Payment Records, Accounting, and Taxes

You must maintain accurate, contemporaneous records of trip fares, package purchases, cash collections, Cash on Delivery (COD) proceeds, operational expenses, and applicable tax receipts.

You are solely responsible for calculating, filing, and remitting your personal and commercial tax liabilities and maintaining statutory trade licences, subject only to any mandatory tax withholding or regulatory reporting obligations imposed on Ride by Bangladesh law. You must not falsely record an unsettled or disputed payment as completed.

### 7. Reviews, Complaints, and Investigations

You agree to cooperate fully with Ride in all reasonable investigations concerning passenger safety, payment disputes, alleged fraud, and service quality failures.

Ride reserves the right to restrict or suspend your account access temporarily while investigating a credible safety, security, or financial fraud allegation. Where legally permissible and operationally feasible, Ride will disclose the underlying grounds for the restriction and provide an accessible administrative review and appeal channel.

### 8. Suspension and Deactivation

Ride may suspend or permanently deactivate your partner account for:

* Operating with expired, suspended, or forged driving licences, vehicle fitness certificates, or permits;
* Engaging in reckless driving, violent conduct, or unsafe practices;
* Committing financial, billing, or identity fraud;
* Misappropriating or misusing customer personal data;
* Incurring repeated, verified service delivery failures;
* Accumulating serious, substantiated customer complaints;
* Violating any applicable law or statutory regulation; or
* Breaching these terms or any executed partner agreement.

Any suspension or deactivation will be conducted in accordance with applicable law and the relevant signed agreement. Account deactivation does not extinguish outstanding financial liabilities, unpaid obligations, or statutory recordkeeping duties.

### 9. Commercial Relationship and Disclaimer of Employment

The legal relationship between Ride and each service partner or merchant is strictly that of an independent commercial software vendor and business client. By purchasing platform access, the partner acts as an independent business entity subscribing to Ride’s software dispatch and matching technology.

Nothing in these terms, in the operation of the Platform, or in the communications between the parties shall be construed as creating an employment relationship, worker status, joint venture, partnership, or agency under the *Bangladesh Labour Act, 2006* or any other enactment.

Partners exercise absolute discretion regarding when, where, and for how long they connect to the Platform; maintain absolute freedom to accept or reject any dispatch request; provide their own operational tools and vehicles; and retain the unrestricted right to engage in other businesses and provide services across competing digital platforms.

### 10. Governing Law and Dispute Resolution

These terms, their interpretation, and any claims or disputes arising out of or in connection with them or the use of the Platform are governed by and construed in accordance with the substantive laws of Bangladesh.

In the event of any disagreement or dispute, you and Ride agree to first seek an informal, amicable resolution by lodging a formal complaint through Ride Partner Support. If the dispute is not resolved amicably within 30 days of submission, either party may submit the dispute to the non-exclusive jurisdiction of the competent civil courts located in Dhaka, Bangladesh.

### 11. Contact Details

* **Contracting Entity:** Ride Digital Services
* **Registered Address:** 7/1-D, R.K. Mission Road, Dhaka-1203, Bangladesh
* **Partner Support:** support@ride.digital-papyrus.com
* **Legal Inquiries:** legal@ride.digital-papyrus.com

---

# PART D — MERCHANT TERMS

These terms apply to restaurants, grocery stores, general shops, automotive workshops and other businesses that list products or services on Ride. A signed merchant agreement and a service-specific settlement schedule should supplement these public terms.

## 1. Merchant eligibility

The merchant must be a legally operating business and maintain all trade licences, tax registrations, food-safety approvals, pharmacy / medicine permissions, workshop permits and other approvals required for the products or services it lists. Do not list regulated products or services until Ride has completed the applicable legal and operational review.

The merchant must provide truthful business identity, branch address, staff details, product descriptions, photos, prices, stock status, opening hours, fulfilment capacity and contact information.

## 2. Listings and prices

The merchant is responsible for the accuracy and legality of its listings, product descriptions, ingredient / allergen disclosures where required, quantity, price, taxes, availability and fulfilment instructions. Prices and mandatory charges must be visible before a customer confirms an order.

Do not upload misleading photos, counterfeit listings, unlawful products, unsafe products or content that infringes third-party rights. Do not manipulate ratings, fabricate orders or contact customers for unrelated marketing.

## 3. Order acceptance and fulfilment

An order is confirmed when the merchant accepts it through the approved interface or the system otherwise confirms it. The merchant must promptly accept or reject incoming orders and keep stock and operating status current.

The merchant must prepare and hand over the correct products in suitable packaging and within the estimated time. The merchant must notify Ride promptly about unavailable items, substitutions, price changes, safety concerns or delays. No substitution or price increase may be imposed without the customer's approval where required.

## 4. Food and product safety

The merchant is responsible for lawful sourcing, storage, preparation, hygiene, packaging, labelling, expiry dates, authenticity and quality of the goods it supplies. Food merchants must maintain the licences and hygiene standards applicable to their business. Shops selling medicines or regulated goods must hold all required authorisations and follow applicable prescription / sales restrictions.

## 5. Staff and access security

The merchant is responsible for staff accounts, access permissions, password security and the actions of its authorised staff. Remove access promptly when a staff member leaves or changes role. Do not share customer data outside order fulfilment or another disclosed lawful purpose.

## 6. Merchant fees and settlement

Merchant commissions, listing fees, delivery charges, payment processing charges, settlement cycles, deductions, taxes, reserve / dispute procedures and bank / MFS details must be set out in the signed merchant agreement or a separate fee schedule. Do not infer a commission rate from this public draft.

The merchant must reconcile order records, cash-on-delivery collections, returns, refunds and settlement statements and promptly raise discrepancies through `support@ride.digital-papyrus.com or WhatsApp +880171324950`.

## 7. Customer complaints and refunds

The merchant must cooperate with investigations into missing, wrong, damaged, unsafe, expired or materially misdescribed products. The merchant must not obstruct a customer from using Ride's complaint or refund process or from exercising statutory consumer rights.

## 8. Suspension

Ride may suspend a listing or merchant access where licences expire, products are unsafe or unlawful, repeated fulfilment failures occur, customer information is misused, fraudulent activity is suspected or the merchant materially breaches its agreement. Where appropriate, Ride will provide reasons and an appeal route.

---

# PART E — FOOD, GROCERY AND GENERAL SHOP ORDER POLICY

This policy governs all food, grocery, and general retail orders placed through the Ride platform, including order acceptance, product substitutions, preparation standards, complaints, returns, and dispute handling.

**Document Status:** Working Draft — Subject to Final Approval

**Last Updated:** 1 November 2026

**Effective Date:** 1 November 2026

---

### 1. Scope, Seller Identity, and Direct Settlement

This policy applies to all orders for food, beverages, groceries, daily essentials, and general retail merchandise placed through the Ride platform. The checkout screen and order summary must clearly identify the independent merchant or retail seller, itemized list of goods, quantities, unit and total prices, delivery charges, and any other applicable mandatory fees.

Ride operates strictly as an independent technology platform and software intermediary. Ride is not a seller, merchant of record, food business operator, caterer, or grocer. Ride never collects, receives, holds, or escrows customer funds for merchandise or food purchases.

The merchant identified on the order screen is solely responsible for selling, preparing, packaging, verifying quality, and supplying the goods in compliance with applicable food safety, health, and consumer standards. All payments for goods and delivery are settled directly between the customer and the supplying merchant or designated delivery partner via the payment method agreed for that order (such as cash on delivery or direct Mobile Financial Services transfer).

### 2. Order Confirmation and Substitutions

Submitting an order constitutes a request to purchase and is neither final nor binding until the designated merchant formally accepts it or the app displays an explicit confirmed status.

If an ordered item is out of stock, unavailable, or cannot be prepared, the merchant may decline the item/order or propose a suitable substitution. Any material product substitution, brand alteration, quantity variation, or associated price adjustment requires the customer’s explicit confirmation before the order may be dispatched. If the customer declines the substitution, the unavailable item must be canceled without charge to the customer.

### 3. Preparation, Packaging, and Delivery

All food, beverage, and grocery items are prepared, handled, packed, and sealed exclusively by the merchant. The merchant must ensure that items are safely packed in tamper-evident or sealed packaging suitable for transit.

The assigned delivery partner is an independent logistics provider responsible solely for collecting the sealed package from the merchant and transporting it to the customer’s designated drop-off location with reasonable care.

Estimated delivery times displayed in the app are non-binding estimates only. Actual delivery times may vary due to merchant preparation delays, kitchen volume, real-time traffic conditions, severe weather, public access restrictions, or other operational factors.

### 4. Allergens, Dietary Information, and Product Descriptions

Merchants are solely responsible for the accuracy of all product titles, ingredients, allergen warnings, nutritional claims, halal certifications, net weights, expiry dates, and dietary disclosures displayed on their store listings. Ride does not independently verify or guarantee merchant product descriptions.

Customers with severe food allergies, medical dietary requirements, or specific religious dietary obligations must contact the merchant directly through in-app communication channels or listed contact details prior to placing an order. Customers should not rely on incomplete, generic, or summary menu listings for medical or allergen safety.

### 5. Complaints and Claim Reporting Windows

If an order arrives with missing items, incorrect items, physical damage, contamination, broken seals, expired dates, or material discrepancies from the listing description, the customer must submit a formal complaint through Ride Support via email at support@ride.digital-papyrus.com or via WhatsApp at +8801713249520.

**Applicable Claim Reporting Windows:**

* **Merchant’s Declared Window:** The specific claim window declared and displayed by the individual merchant on their store or product listing page governs the order.
* **Platform Fallback Window:** If an individual merchant has not specified an applicable claim window, Ride’s standard fallback timelines apply:
* *Hot food, prepared meals, and perishable groceries:* The complaint must be reported within **2 hours** of physical delivery.
* *Packaged, non-perishable goods and general retail items:* The complaint must be reported within **24 hours** of physical delivery.

All complaints must include the relevant Order ID, clear descriptive details of the defect, and contemporaneous photographic evidence of the defective goods, packaging, receipt, and merchant seal. Ride coordinates with the customer, merchant, and delivery partner to investigate the issue and facilitate an equitable resolution.

### 6. Returns, Replacements, and Refunds

Due to public health, hygiene, and food safety regulations under Bangladesh law, prepared meals, fresh produce, opened beverages, and perishable groceries are strictly non-returnable and non-refundable based on a simple change of mind.

However, this restriction does not limit, waive, or diminish any statutory consumer rights guaranteed under the *Consumer Rights Protection Act, 2009* or the *Safe Food Act, 2013* where goods delivered are unsafe, contaminated, adulterated, damaged, expired, defective, or materially non-compliant with the confirmed order.

Non-perishable retail items are governed by the individual merchant’s disclosed return and replacement policy, subject to mandatory consumer laws.

**Refund Settlement Mechanics:**

Because Ride operates as a software intermediary and does not collect, hold, or process buyer payments, Ride does not issue direct monetary refunds from its own accounts. Any approved financial reimbursement, cash refund, price adjustment, or replacement must be issued and settled directly by the supplying merchant (or delivery partner, where the damage occurred in transit). Ride assists solely by verifying documentation, facilitating communication, and logging disciplinary actions against non-compliant merchants or delivery partners on the Platform.

# PART F — PARCEL, COURIER AND STORE DELIVERY POLICY

## 1. Scope

This policy applies to point-to-point parcels, documents, packages and merchant deliveries arranged through Ride. Delivery availability, service level, price and estimated time must be shown for the selected route before confirmation.

## 2. Sender duties

The sender must:

- provide accurate sender, recipient, pickup and drop-off information;
- accurately describe the parcel's contents, quantity, value and handling needs where requested;
- use suitable packaging and secure fragile or liquid items;
- make the parcel available at the agreed pickup point;
- ensure the parcel may lawfully be possessed, carried and delivered; and
- provide lawful instructions for COD, recipient verification or return delivery where those features are enabled.

## 3. Prohibited and restricted items

Ride or its delivery partners may refuse items that are unlawful, dangerous, hazardous, explosive, flammable, corrosive, infectious, controlled, stolen, counterfeit, improperly packaged or otherwise prohibited by applicable law or the service rules. This may include weapons, ammunition, narcotics, illegal medicines, cash or negotiable instruments, live animals, human remains, hazardous chemicals and other restricted items.

The list is not exhaustive. A sender must not conceal or misdeclare contents. If a parcel appears suspicious or unsafe, Ride or the delivery partner may stop handling it and contact the relevant authority where required by law.

## 4. Delivery and proof

Delivery is complete when the parcel is handed to the intended recipient or an authorised person using the proof-of-delivery method shown in the app. A PIN, signature, photo or other proof may be required. Do not share delivery PINs before the parcel is physically received.

## 5. Cash on delivery (COD)

COD is available only when the service and route support it. The sender must specify the collection amount and any return instructions accurately. The delivery partner must collect only the amount shown in the order and record collection through the approved workflow. Settlement, reconciliation, failed collection and remittance terms must be specified in the relevant merchant / delivery-partner schedule.

## 6. Failed delivery, returns and claims

If a recipient is unavailable, refuses the parcel, provides an incorrect address or cannot be contacted, Ride may attempt to contact the sender and follow the return instruction displayed at booking. Any second-attempt, waiting, return or storage fee must be disclosed in advance where practicable.

Report loss, damage, tampering or non-delivery through `support@ride.digital-papyrus.com or WhatsApp +880171324950` within `[CLAIM WINDOW]`. The claim process must state the required evidence, review period and any lawful liability limits. Do not publish a blanket exclusion for all loss or damage without legal review.

---

# PART G — CAR RENTAL, INTERCITY, TRUCK AND SHIFTING POLICY

This policy governs hourly and daily car rentals, chauffeur-driven passenger vehicles, intercity travel, and pickup/truck rental services arranged through the Platform.

**Document Status:** Official Platform Policy

**Last Updated:** 1 November 2026

**Effective Date:** 1 November 2026

---

### 1. Scope and Platform Nature

This policy applies to all hourly and daily car rentals, chauffeur-driven private vehicles, intercity passenger journeys, and pickup or commercial truck rentals arranged through the Ride platform.

Ride operates strictly as an independent technology intermediary connecting customers with independent vehicle owners, transport operators, and commercial drivers. Ride does not own, lease, operate, or maintain any vehicles, nor does Ride provide full-service packing, moving, or logistics management. The service offered through the Platform is strictly vehicle and transport rental.

### 2. Quotation, Booking Scope, and Direct Settlement

Before a booking is confirmed, the written quotation or provider offer displayed on the Platform must clearly specify:

* **Vehicle & Provider Details:** Vehicle make, model, class, certified payload or passenger seating capacity, registration number, and relevant provider details;
* **Trip Specifications:** Exact pickup location, drop-off destination, proposed route, travel date, scheduled reporting time, and estimated duration;
* **Distance & Time Allowances:** Allocated mileage (distance allowance in kilometers), allocated service duration (hours), and applicable overtime or excess-mileage billing rates;
* **Cost Inclusions and Exclusions:** Explicit disclosure of whether fuel, CNG, highway tolls, bridge tolls, parking fees, driver food/overnight allowances, vehicle waiting time, empty return trip charges, helper/labor fees (if offered directly by the provider), and statutory taxes are included in or excluded from the quote;
* **Cargo Description:** General nature of goods, approximate weight, volume, and special handling instructions (where applicable);
* **Operational Conditions:** Trip cancellation terms, advance payment requirements, transit delay rules, and rescheduling conditions; and
* **Pricing Structure:** The final fixed rate or the objective calculation formula used to determine variable charges.

**Direct Payment Settlement:** Ride does not collect, receive, process, or hold passenger fares, freight charges, advances, or security deposits. All payments—including advance trip commitments, final trip charges, waiting surcharges, and highway tolls—are settled directly between the customer and the vehicle provider using their agreed settlement method (such as cash or direct Mobile Financial Services [MFS] transfer). Ride is not a financial custodian, escrow agent, or guarantor of transaction deposits.

A quotation is not deemed accepted or binding until both the customer and the provider have explicitly confirmed it through the Ride app or another formal procedure recognized by Ride.

### 3. Customer Obligations

Customers must provide accurate, complete, and honest information regarding passenger count, luggage volume, cargo descriptions, approximate weight, and site access conditions (such as low overhead bridge clearances, narrow approach roads, or municipal truck entry restrictions).

Customers agree not to:

* Demand or pressure the driver to violate traffic regulations, speed limits, or route restrictions;
* Conceal, transport, or attempt to transport hazardous chemicals, inflammable substances, explosives, toxic cargo, illegal narcotics, unregistered animal carcasses, contraband, or undeclared dangerous goods; or
* Instruct the driver to load cargo in a manner that obstructs vehicle visibility or safe mechanical operation.

Where a truck is hired to transport personal or commercial goods, the customer is solely responsible for packaging, cushioning, boxing, and securing all fragile, high-value, or sensitive items prior to loading.

### 4. Provider Obligations and Overloading Liability

Vehicle providers must supply the exact vehicle agreed upon, operated by a qualified, properly licensed, and sober driver. Providers must maintain a valid certificate of fitness, vehicle registration, road tax token, Regional Transport Committee (RTC) route permit, and commercial insurance throughout the journey. Providers must arrive at the designated pickup location at the agreed time, subject to reasonable operational conditions, and disclose any unexpected delays to the customer in advance.

**Complete Provider Liability for Overloading:**

Under the *Road Transport Act, 2018*, the compliance of a vehicle with maximum gross weight, certified payload capacity, and axle load limits is the sole and complete legal liability of the truck owner and driver. The provider/driver retains the absolute legal right and statutory obligation to inspect the weight and physical dimensions of any cargo prior to loading. If the customer's cargo exceeds the certified legal capacity of the vehicle, the driver must refuse to load the excess weight. Any criminal prosecution, statutory fines, axle-load penalties, unloading expenses, or vehicle impoundment resulting from operating an overloaded vehicle are the sole legal and financial responsibility of the provider and driver.

Providers may not substitute an unapproved vehicle or demand an increased fare or surcharge after booking confirmation without the customer's prior express consent, except where deploying an alternative vehicle is strictly necessary as an emergency safety replacement permitted by law.

### 5. Delays, Cancellations, and Damage Claims

Trip cancellations, waiting charges, transit delays, and rescheduling terms are governed strictly by the specific terms disclosed in the booking quotation and the provider's cancellation schedule.

Both parties are advised to inspect the vehicle and cargo before departure and immediately upon arrival, recording contemporaneous, date-stamped photographic evidence to verify baseline condition.

Because Ride does not hold client funds or deposits, any claim regarding retained advances, property damage, transit delays, or disputed deductions must be pursued and settled directly between the customer and the provider. Ride provides in-app customer support solely to facilitate communication, review reported infractions, and enforce administrative sanctions against non-compliant accounts on the Platform.

# PART H — AMBULANCE BOOKING POLICY AND EMERGENCY NOTICE

**This section must receive a separate review from a Bangladesh healthcare / transport lawyer and the ambulance operators before being activated.**

## 1. What Ride provides

Ride may provide a technology interface for requesting an ambulance or medical transport from an identified third-party ambulance operator. The provider, not the app interface, supplies the vehicle, crew, equipment and transport service unless the booking expressly identifies Ride as the service provider.

The booking screen must identify the operator, the ambulance category and the equipment / personnel information that Ride has verified for that listing. Do not use terms such as BLS, ALS, ICU, ventilator, paramedic, doctor, 24/7 or hospital-priority routing unless the relevant provider and capability have been verified and are available for the particular booking.

## 2. Not a substitute for emergency response

A Ride booking is not a guarantee of ambulance availability, dispatch, arrival time, treatment, hospital admission or clinical outcome. Mobile coverage, provider capacity, traffic, road access and other events may delay or prevent a response.

For an immediate life-threatening emergency, contact Bangladesh National Emergency Service 999 or the relevant hospital / emergency provider directly. Do not wait for an app booking to be accepted before seeking emergency assistance.

## 3. Medical information and consent

Only provide medical information reasonably needed to arrange the requested transport or communicate an emergency. Where the app requests health information, the interface must provide a clear, separate explanation of the purpose and recipients. Such information may be sensitive personal data and must be access-restricted.

Where necessary to protect life or health, information may be shared with the ambulance operator, treating medical professionals, hospital or emergency authority on an applicable lawful basis. Ride must document the applicable basis and must not use emergency or medical details for unrelated advertising.

## 4. Charges and cancellations

The booking must show the provider's base charge, distance / waiting charges, additional equipment or crew charges and other fees that can reasonably be disclosed. Cancellation charges, if any, must be shown before confirmation. Any emergency-specific exception must be explicit.

## 5. Complaints and incidents

Report a service incident through `support@ride.digital-papyrus.com or WhatsApp +880171324950`. The incident workflow should preserve relevant booking, dispatch, communications and location records subject to the privacy notice and lawful retention period.

---

# PART I — CANCELLATION, RETURNS AND REFUND POLICY

**Do not publish a blanket “all payments are non-refundable” clause.** A fair policy needs a service-by-service matrix, disclosed before confirmation, and must preserve mandatory consumer rights.

## 1. General principles

A customer may request cancellation through the app or support channel. Any cancellation charge must be proportionate, based on the service stage and disclosed before the customer confirms the booking. Refund eligibility depends on the service, who caused the failure, whether the provider began performing, and any applicable law.

A refund is not guaranteed for every change of mind, but Ride will consider service failure, duplicate payment, provider no-show, merchant rejection, wrong or defective goods, failed delivery and other substantiated complaints.

## 2. Suggested policy matrix — final fees and time limits are not yet set

| Service | Example refund / remedy situations | Items to define before launch |
|---|---|---|
| Ride-hailing | Provider no-show; provider cancels; duplicate charge; incorrect fare; trip not supplied | Customer cancellation window; provider-arrival fee; waiting; fare dispute window; cash/direct MFS remedy |
| Food | Merchant rejects; item unavailable; wrong / missing / unsafe item; delivery failure | After-preparation cancellation; partial refund; substitution consent; evidence; refund destination |
| Grocery / shop | Wrong, damaged, expired, defective or missing product | Product-category return rules; perishables; proof; merchant response time; pickup cost |
| Parcel / courier | Pickup fails; non-delivery; loss / damage; COD discrepancy | Reattempt fee; return charge; declared value; claim window; prohibited goods; liability process |
| Rental / truck | Provider cancels; vehicle materially differs; customer cancels; service scope changes | Quote acceptance; deposit; cancellation ladder; overtime; tolls; loading / unloading; damage evidence |
| Ambulance | Provider does not dispatch; duplicate charge; material service failure | Emergency cancellation rule; provider fee; no-show; service failure review |
| Driver call package | Duplicate charge; paid access not activated; materially invalid lead / system outage | Package-specific eligibility; invalid-lead credit; rollover; expiry; refund timing; chargeback handling |

## 3. Refund method and timing

Where a refund is approved, Ride should return it through the original payment method where feasible, or another method agreed with the customer. Cash-paid services require a clearly documented remedy; do not promise an electronic refund when Ride did not collect the cash.

The public policy should state a verified processing estimate for each payment method only after the payment processor and finance operations confirm it. The time for a bank, MFS or card issuer to post the refund may be outside Ride's control.

## 4. Complaint process

Contact `support@ride.digital-papyrus.com or in-app support` with the order / booking ID, date, issue and relevant evidence. Ride will acknowledge the complaint through `the same support channel` and provide an outcome or status update within `[SERVICE SLA TO BE SET]`. These internal service targets do not reduce statutory rights or time limits.

---

# PART J — SAFETY AND COMMUNITY STANDARDS

All users and partners must treat each other with respect. Ride prohibits harassment, discrimination, threats, violence, sexual misconduct, stalking, doxxing, coercion, unsafe driving, intoxicated driving, misuse of emergency features, fraudulent bookings, theft, parcel tampering and unlawful goods or services.

Partners must keep required licences and vehicle / equipment documents current. Customers must follow safe boarding, parcel handover and service instructions. Merchants must supply lawful, authentic and safe goods and services.

Use Ride's in-app report or `support@ride.digital-papyrus.com or WhatsApp +880171324950` for safety issues. For imminent danger, contact the appropriate emergency authority directly. Ride may preserve relevant evidence, restrict access, contact affected users or report matters to authorities where lawful or necessary for safety.

Ride should publish a clear safety escalation process, including who receives high-risk alerts, how quickly they are monitored, what data is visible to the safety team, and what happens outside staffed support hours. Do not advertise “24/7 safety support” unless it is actually staffed and monitored 24/7.

---

# PART K — PRIVACY NOTICE

This Privacy Notice explains how Ride Digital Services collects, uses, shares, stores, and protects your personal data when you use the Ride platform.

* **Data Controller / Data Fiduciary:** Ride Digital Services
* **Registered Office:** 7/1-D, R.K. Mission Road, Dhaka-1203, Bangladesh
* **Website:** [https://ride.digital-papyrus.com](https://ride.digital-papyrus.com)
* **Privacy Inquiries:** privacy@ride.digital-papyrus.com
* **Effective Date:** 1 November 2026

---

### 1. Scope

This Privacy Notice applies to all personal data collected and processed through Ride’s websites, mobile applications (including passenger, driver, and merchant interfaces), customer support channels, and related digital services. It governs the data of customers, drivers, couriers, merchants, vehicle rental operators, private ambulance providers, parcel recipients, and any individual communicating with Ride.

### 2. Categories of Personal Data We Process

We collect and process personal data strictly by functional category to operate our platform services:

* **Account and Contact Data:** Full name, mobile phone number, email address, profile picture, account authentication credentials, and emergency contact numbers.
* **Identity and Verification Data:** National Identity Card (NID) or government-issued photo identification, date of birth, driving licence details, vehicle registration documents, certificate of fitness, tax token, route permits, trade licences, and partner background verification files.
* **Profile and Matching Data:** Declared gender, vehicle type, service tier, women-only matching preferences, and accessibility preferences.
* **Location and Telemetry Data:** Precise and approximate GPS coordinates, pickup locations, drop-off destinations, navigation routes, active trip traces, and device permission states.
* **Booking and Transaction Data:** Trip histories, journey duration, distance traveled, calculated fares, cancellation records, retail order items, declared parcel descriptions, Cash on Delivery (COD) amounts, rental bookings, and emergency transport requests.
* **Emergency and Health Data:** Voluntary medical notes, patient details, and critical instructions provided exclusively to facilitate private ambulance and emergency transit dispatch.
* **Communications and Support Data:** In-app messages, customer support inquiries, dispute submissions, user feedback, ratings, reviews, and uploaded photographic or documentary evidence.
* **Financial and Settlement Records:** Selected payment methods, transaction reference IDs, settlement amounts, platform access package purchase histories, and refund logs. (Ride does not process or store buyer debit/credit card numbers on its servers).
* **Device and Technical Data:** Device hardware model, operating system version, IP address, unique device identifiers, technical error logs, and system performance telemetry.
* **Merchant Business Data:** Trade licence information, business outlet addresses, product catalogues, authorized staff profiles, and payout settlement details.
* **Website and Web Data:** Server access logs, contact form submissions, and strictly necessary technical cookies required for website security and session management.

### 3. How We Collect Personal Data

We collect personal data directly from you when you register an account, schedule a trip, submit an order, upload verification credentials, contact customer support, or report an incident. In addition, our mobile applications collect technical telemetry and location data from your mobile device based on the operating system permissions you have granted.

We may also receive limited information from matched service partners, merchants, payment gateways, mobile financial service operators, digital mapping infrastructure providers, or statutory authorities where necessary for service execution, fraud mitigation, or legal compliance.

### 4. Purposes of Processing and Legal Bases

Ride processes personal data under recognized lawful grounds under the laws of Bangladesh, including the performance of contractual terms, compliance with statutory obligations, protection of vital interests, pursuit of legal claims, and explicit user consent where mandated.

* **Account Administration:** To create, authenticate, and manage user and partner accounts (Contractual Performance).
* **Dispatch and Fulfillment:** To algorithmically match customers with independent drivers, couriers, or merchants, calculate routes, and facilitate service completion (Contractual Performance).
* **Credential Verification:** To verify driver eligibility, commercial licences, vehicle fitness, and merchant authenticity (Legal Obligation and Contractual Performance).
* **Pricing and Billing Transparency:** To calculate and display estimated fares, delivery charges, and route parameters (Contractual Performance).
* **Platform Monetization:** To record B2B platform access packages, subscriptions, and merchant settlement accounts (Contractual and Accounting Obligations).
* **Safety and Fraud Prevention:** To verify trip integrity, prevent suspicious activity, authenticate identity, and investigate complaints (Legitimate Operational Safety and Legal Obligation).
* **Emergency Dispatch:** To transmit location and vital notes to private ambulance operators during medical emergencies (Vital Interests and Explicit Consent).
* **Customer Support:** To investigate billing errors, delivery failures, damaged goods, and user grievances (Contractual Performance and Legal Claims).
* **Platform Maintenance:** To analyze system crashes, resolve technical bugs, and ensure network security (Legitimate Operational Interests).
* **Statutory Compliance:** To maintain official records and cooperate with lawful directives from law enforcement and regulatory authorities (Legal Obligation).

Ride does not utilize single, unbundled consent checkboxes. Optional marketing messages, discretionary promotional notifications, and sensitive emergency disclosures are maintained through distinct user controls.

### 5. Location Tracking and Telemetry

Location data is essential to the core functionality of our dispatch network:

* **Customers:** Location data is accessed while the app is active in the foreground to locate nearby vehicles, establish accurate pickup points, and track transit progress.
* **Drivers and Couriers:** High-precision location data is collected while the partner app is set to an active or online status to assign dispatches and navigate routes. Background location collection operates only while actively fulfilling an accepted assignment or when the driver is toggled online. Drivers may terminate tracking at any time by toggling their status to offline.

Disabling device location permissions will restrict dispatch and navigation capabilities but will not result in unauthorized collection through alternative means.

### 6. Gender-Specific Matching

Where a user activates women-only matching features, Ride processes declared gender profile data strictly to facilitate eligible matches, support passenger and driver comfort, and enhance safety. This data is never used for commercial profiling or advertising.

### 7. Emergency and Ambulance Data

When an emergency ambulance booking is submitted, patient condition notes, pickup coordinates, and contact details are transmitted directly to the assigned ambulance operator, onboard medical personnel, or receiving hospital. This data is classified as sensitive, restricted from general access, and never used for marketing.

### 8. Sharing and Disclosure of Personal Data

Ride does not sell personal data to third parties. We share the minimum data strictly required with the following categories of recipients:

* **Matched Service Providers and Customers:** Shared between matched parties to locate, coordinate, and fulfill bookings.
* **Merchants:** Shared with retail stores and restaurants to prepare and package orders.
* **Independent Logistics Partners:** Shared with couriers to collect and deliver parcels.
* **Private Ambulance Operators:** Shared with medical transport providers to coordinate patient transit.
* **Telecommunications and SMS Providers:** Authorized telecommunications carriers and SMS messaging gateways to transmit one-time passwords (OTPs) and service alerts.
* **Digital Mapping and Geocoding Providers:** Independent mapping and routing infrastructure providers to calculate distances, display maps, and determine routes.
* **Cloud Hosting and Database Infrastructure Providers:** Enterprise cloud hosting, managed database, and server infrastructure providers that store and process platform data.
* **Diagnostic and Analytics Vendors:** Secure technical software services that process system crash reports and performance telemetry.
* **Payment and Financial Institutions:** Commercial banks, Mobile Financial Services (MFS) operators, and payment gateways to authenticate settlements and process fraud checks.
* **Legal and Regulatory Authorities:** Law enforcement agencies, courts, and statutory regulatory bodies where formally mandated by Bangladesh law.
* **Corporate Transferees:** Successor entities in the event of an operational merger, reorganization, or business acquisition, subject to statutory confidentiality obligations.

### 9. International Data Hosting and Cross-Border Transfers

To ensure high availability, redundancy, and security, Ride utilizes enterprise cloud infrastructure and database servers located both within Bangladesh and in secure international data center regions (including Singapore and other global cloud zones).

By using the Platform, you acknowledge that your personal data may be transferred to, stored, and processed on secure cloud servers outside Bangladesh. Ride enforces strict technical safeguards, role-based access controls, and end-to-end transport encryption with all infrastructure providers to ensure that cross-border data processing meets all statutory protection standards under Bangladesh law.

### 10. Data Retention Schedule

Ride retains personal data in strict compliance with the laws, statutory regulations, and commercial rules of Bangladesh:

* **Corporate, Tax, and Financial Records:** Transaction logs, partner billing records, platform access package invoices, and settlement ledgers are maintained for a period of up to **10 (ten) years** to satisfy statutory corporate, taxation, audit, and legal limitation requirements.
* **User and Partner Profiles:** Retained for the active duration of the account and for a reasonable statutory period following account closure to resolve pending disputes, unpaid liabilities, or regulatory audits.
* **Identity Verification Files:** Stored securely for the duration of the partner's active engagement and retained thereafter as required by law enforcement or regulatory rules.
* **Trip Telemetry and Location Trails:** Detailed GPS coordinates and route traces are retained only as long as operationally necessary for billing verification, safety auditing, and dispute resolution, after which they are aggregated, anonymized, or purged.
* **Customer Support Records:** Grievance submissions, dispute tickets, and incident reports are retained for the statutory period applicable to legal and consumer claims.

When the applicable legal retention period expires, personal data is permanently deleted or irreversibly anonymized.

### 11. Security Safeguards

Ride implements organizational, administrative, and technical security measures appropriate to the sensitivity of the data handled. These include industry-standard encryption protocols (in transit and at rest), least-privilege role-based access controls (RBAC), database authentication safeguards, periodic security reviews, and internal incident response plans. While we implement rigorous technical defenses, no digital service can guarantee absolute security against all potential vulnerabilities.

### 12. Your Statutory Data Rights

Subject to verification of identity and the requirements of Bangladesh law, you have the right to:

* Request confirmation of whether Ride processes your personal data and obtain access to your records;
* Request the correction of inaccurate, outdated, or incomplete data;
* Withdraw consent previously granted for optional processing activities;
* Request the deletion or restriction of your personal data, subject to Ride’s mandatory statutory record-keeping and legal defense obligations; and
* Submit a grievance regarding the handling of your data.

To exercise these rights, submit a written request to privacy@ride.digital-papyrus.com with your registered name, account mobile number, and the specific request. To safeguard your account, never send passwords, OTPs, or financial PINs via email.

### 13. Protection of Minors

Ride accounts are restricted to individuals aged 18 years or older. Ride does not knowingly collect or maintain personal data from minors. If an account is discovered to have been created by a minor, it will be deactivated and its associated profile records handled in accordance with applicable law.

### 14. Changes to This Privacy Notice

Ride reserves the right to amend this Privacy Notice to reflect operational, technological, or statutory developments. Notice of material updates will be provided via the Platform, email, or website announcement, indicating the revised effective date.

### 15. Contact Details

* **Data Controller:** Ride Digital Services
* **Postal Address:** 7/1-D, R.K. Mission Road, Dhaka-1203, Bangladesh
* **Privacy Inquiries:** privacy@ride.digital-papyrus.com
* **Website Privacy Portal:** [https://ride.digital-papyrus.com/privacy](https://ride.digital-papyrus.com/privacy)

# PART L — ACCOUNT AND DATA DELETION PAGE

**Suggested public URL:** `https://ride.digital-papyrus.com/delete-account`

## Request deletion of your Ride account

You can request deletion of your Ride account and associated personal data from the Ride app or through this webpage.

### Option 1 — From the app

1. Open Ride and sign in.
2. Open `[EXACT MENU PATH — e.g. Profile > Settings > Account > Delete Account]`.
3. Read the deletion information and submit the request.
4. Complete any reasonable identity-verification step shown in the app.

### Option 2 — From this website

Email `privacy@ride.digital-papyrus.com` with the subject **Ride account deletion request**. Include the mobile number registered to the Ride account and the country code. Do not include your password, OTP or full payment-card details.

Alternatively, complete the web request form on this page. The page must work without requiring the user to reinstall the app or sign in to the app.

### What happens next

Ride will acknowledge the request through `email`, verify that the requester controls the account, and process the request in accordance with applicable law. Ride may need to retain limited records for legal, tax, accounting, payment, safety, fraud-prevention or dispute purposes. Where data is retained, Ride should restrict its use to the applicable retention purpose and delete it when that purpose ends.

Deleting the account may not automatically cancel an active booking, settle an unpaid amount, complete a refund or erase records Ride is legally required to retain. The page must explain any material consequences before the user confirms deletion.

**Do not publish a fixed completion period until the legal and operational team has approved an achievable SLA.** Google Play requires a genuine account-deletion route, not merely a link to a general contact page. The request channel must be monitored and tested.

---

# PART M — COOKIE NOTICE (WEBSITE)

Cookie Notice
Public URL: https://ride.digital-papyrus.com/cookies

Last Updated: 1 November 2026

Effective Date: 1 November 2026

1. What Are Cookies?
Cookies are small text files placed on your computer or mobile device by a web server when you visit a website. They are widely used to ensure websites function properly, maintain system security, and remember user preferences during a browsing session.

2. Our Philosophy: Strictly Necessary Technologies Only
Ride Digital Services ("Ride", "we", "us", "our") believes in digital privacy and operational minimalism. Our marketing and legal website is designed to provide information without tracking your personal browsing habits across the internet.

We do not use third-party tracking pixels, behavioural profiling tools, or cross-site advertising networks (such as ad retargeting trackers).

3. Categories of Cookies We Use
We use only Strictly Necessary and Functional Technologies:

Security and Authentication: Cookies or temporary session tokens used to prevent Cross-Site Request Forgery (CSRF), authenticate web forms, and protect our servers against automated abuse or bot attacks.

Infrastructure and Load Balancing: Temporary technical cookies deployed by our network reverse proxies or content delivery networks (CDNs) to distribute web traffic efficiently across servers.

User Preferences: Local storage items used strictly to remember your interface preferences, such as selected language (e.g., Bengali or English) or visual display modes (e.g., light or dark mode).

4. Mobile Applications and Local Storage
Our native mobile applications (including passenger, driver, and merchant apps) do not use traditional browser cookies for operational functions. Instead, our mobile apps use secure device-level storage mechanisms (such as encrypted app storage and authentication tokens) strictly to keep you logged in, verify active dispatch sessions, and maintain offline app settings.

5. Managing and Disabling Cookies
Because we only deploy strictly necessary technical cookies required for the website to load and function securely, our website does not display an advertising cookie banner.

You have the right to block or delete cookies through your internet browser settings (such as Chrome, Firefox, Edge, or Safari). Please note that if you configure your browser to reject all cookies, certain basic security features or interactive forms on our website may not function correctly.

6. Updates and Contact Details
We may update this Cookie Notice periodically to reflect changes in our web infrastructure or statutory obligations. Any revisions will be published on this page with an updated effective date.

If you have questions regarding our use of cookies or website technical data, please contact:

Data Controller: Ride Digital Services

Registered Office: 7/1-D, R.K. Mission Road, Dhaka-1203, Bangladesh

Email: privacy@ride.digital-papyrus.com

# PART N — PRODUCT AND LEGAL DECISION REGISTER

These are not drafting details to guess. The owner, product lead, engineering lead and Bangladesh counsel should resolve them before the related terms become final.

| ID | Decision / evidence required | Why it matters | Owner |
|---|---|---|---|
| L-01 | Exact legal operator name, entity form, registration, address | Contracting party and privacy contact must be identifiable | Founder / Legal |
| L-02 | Whether Ride acts as intermediary, contracting principal, merchant of record, dispatch operator or payment recipient in each vertical | Determines liability, consumer disclosures, payment and settlement clauses | Founder / Legal |
| L-03 | BRTA ridesharing technology-institution enlistment status and per-vehicle enlistment requirements | Ride-hailing operation may require specific approvals and tripartite arrangements | Legal / Operations |
| L-04 | Actual tripartite agreement template and required driver / owner relationship | Partner terms must not contradict regulatory requirements | Legal / Operations |
| L-05 | Active cities and exact service boundaries per vertical | Prevents false nationwide / 64-district / 24-hour promises | Operations |
| L-06 | Ambulance provider list, licence, BLS/ALS equipment, crew qualifications, insurance, service hours, dispatch escalation | High-stakes medical transport claims and emergency obligations | Medical Ops / Legal |
| L-07 | Whether Ride actually calls 999, sends SMS or shares live location; test logs and authority process | Do not imply an integrated emergency response without proof | Engineering / Safety |
| L-08 | Driver call package price, call/lead definition, invalid lead rules, rollover, expiry, pause, renewal and refunds | Must be transparent; affects payment policy and partner contract | Product / Finance |
| L-09 | Classification of call package under Google Play Billing and local payment rules | Digital app access may be treated differently from physical transport | Legal / Payments |
| L-10 | Ride payment flows by vertical: cash, direct bKash/Nagad, gateway, settlement account, chargebacks | Payment clauses must identify who receives and refunds money | Finance / Engineering |
| L-11 | Merchant commission / subscription / settlement schedule | Public terms must not invent rates | Commercial / Finance |
| L-12 | Food, grocery, medicine, automotive parts and workshop categories actually enabled and licences required | Product safety and regulated goods controls | Merchant Ops / Legal |
| L-13 | COD collection, reconciliation, loss and return process | Financial exposure and courier agreement | Logistics / Finance |
| L-14 | Cancellation fees, waiting fees, refund windows, claim evidence and support SLAs | Required customer-facing clarity | Operations / Finance |
| L-15 | Production data inventory: Supabase, storage, auth, database region, backups, Barikoi, dpMaps, SMS/OTP, maps, payment gateway, analytics, crash reporting, support tools | Privacy notice must describe real collection and transfers | Engineering / Privacy |
| L-16 | Exact GPS behavior for rider, driver, deliveryman and ambulance roles: foreground, background, sampling, start/stop | Play permissions, consent and privacy notice | Engineering / Privacy |
| L-17 | Whether Ride collects NID, biometric selfie, gender, medical, emergency contact, audio or call recordings | Sensitive-data rules and access controls | Product / Privacy |
| L-18 | Data storage countries, support access countries and cross-border processors | Personal Data Protection Act 2026 transfer conditions | Engineering / Legal |
| L-19 | Retention schedule per data category and processing-record register | Purpose limitation, deletion and statutory recordkeeping | Privacy / Finance / Engineering |
| L-20 | In-app deletion UX, website form, request verification, SLA and retention exceptions | Google Play and data-subject rights | Product / Engineering / Support |
| L-21 | Whether under-18 passengers may be booked by adults and the account age gate | Child-data obligations | Product / Legal |
| L-22 | Women-only matching: gender collection, verification, eligibility, availability and appeal | Safety, privacy and discrimination risks | Product / Safety / Legal |
| L-23 | Insurance types and coverage held by Ride, partners, fleet and ambulance providers | Avoid misleading safety / insurance assurances | Legal / Operations |
| L-24 | Cookie inventory, analytics and ad pixels on the website | Cookie notice and consent design | Web / Marketing |
| L-25 | Support staffing hours, incident escalation, complaint and appeals SLA | Do not promise 24/7 support without staffing | Operations |

---

# PART O — LEGAL AND OPERATIONAL LAUNCH CHECKLIST

## Corporate and transport

- [ ] Correct legal entity named in all documents and Play Console profile.
- [ ] Bangladesh counsel has reviewed the current BRTA Ridesharing Service Policy 2017, subsequent circulars / amendments and Road Transport Act 2018 for the actual vehicle types and operating model.
- [ ] Required technology-institution and vehicle enlistment certificates obtained, where applicable.
- [ ] Required tripartite agreements / owner-driver-provider agreements signed.
- [ ] Partner onboarding checks and expiry monitoring implemented.
- [ ] Insurance and incident escalation are accurately described.

## Commerce and service fulfilment

- [ ] Merchant agreements signed, including fees and settlement schedule.
- [ ] Seller / provider is clearly identified at each checkout.
- [ ] Item price, quantity, delivery, tax and other charges displayed before order confirmation.
- [ ] Cancellation, return, refund and complaint rules are published per category.
- [ ] COD process, cash collection and reconciliation tested.
- [ ] Prohibited-parcel rules and escalation process implemented.
- [ ] Rental / truck quotes show scope and exclusions.
- [ ] Ambulance claims, operator credentials, equipment, coverage and emergency escalation verified.

## Privacy and security

- [ ] Production data inventory signed off by engineering.
- [ ] All SDKs, processors, hosting regions, backups and cross-border access documented.
- [ ] Location permission prompts match actual app behavior.
- [ ] Sensitive health / identity / biometric data is minimised and access-restricted.
- [ ] Consent is granular and withdrawable where consent is the legal basis.
- [ ] Privacy requests can be received, verified, tracked and completed.
- [ ] Data retention schedule and deletion jobs implemented.
- [ ] Data breach response plan, incident log and statutory notification workflow established.
- [ ] Processor contracts / data processing clauses signed.
- [ ] Website cookie inventory checked and consent controls implemented as required.

## Google Play and public website

- [ ] Public Privacy Notice URL works without login and matches actual app behavior.
- [ ] Account deletion URL works without app installation or login.
- [ ] In-app account deletion flow exists and has been tested.
- [ ] Support email and support route are monitored.
- [ ] General Terms and relevant service policies are publicly accessible.
- [ ] Play Console Data safety answers match the data inventory and SDK behavior.
- [ ] Marketing claims and screenshots match services actually operational in the launch area.

---

# PART P — REFERENCE MATERIALS REVIEWED

These references were used for structure and issue-spotting. Ride must not copy their wording, and their terms are not automatically suitable for Bangladesh or Ride's operating model.

## User-provided comparators

- Arohon Privacy / Terms index: https://arohon.co/privacy
- Arohon ride-provider terms: https://arohon.co/terms
- Arohon customer terms: https://arohon.co/terms-customers
- Arohon parcel policy: https://arohon.co/terms-parcel
- Arohon food and medicine orders: https://arohon.co/terms-food
- Arohon rental policy: https://arohon.co/terms-rental
- Arohon merchant terms: https://arohon.co/terms-merchants
- Arohon return and refund policy: https://arohon.co/terms-return-refund
- Arohon account deletion: https://arohon.co/delete-account
- Uber India general Terms of Use: https://www.uber.com/in/en/legal/general-terms-of-use/
- Uber driver / delivery privacy notice: https://www.uber.com/global/en/privacy-notice-drivers-delivery-people/
- Uber privacy notice overview: https://help.uber.com/en/driving-and-delivering/article/uber-privacy-notice-overview?nodeId=74571154-b270-4962-98fc-bd435672d0b1
- Uber rider privacy notice information: https://help.uber.com/riders/article/privacy-notice-information?nodeId=e1f427a1-c1ab-4c6a-a78a-864f47877558
- Pathao Privacy: https://pathao.com/privacy/
- Pathao customer terms: https://pathao.com/terms-of-service-customers/
- Pathao Nepal Privacy (use only as a structural comparator, not Bangladesh law): https://pathao.com/np/privacy-policy/
- inDrive Bangladesh Legal Documents: https://indrive.com/en-bd/legal?doc=privacypolicy

## Bangladesh legal / regulator references

- Personal Data Protection Act, 2026 (Act No. 63 of 2026), official Bangladesh Laws: https://bdlaws.minlaw.gov.bd/act-1692.html
- Section 1 — scope and commencement: https://bdlaws.minlaw.gov.bd/act-1692/section-57267.html
- Section 5 — lawful bases for processing: https://bdlaws.minlaw.gov.bd/act-1692/section-57271.html
- Section 7 — sensitive personal data: https://bdlaws.minlaw.gov.bd/act-1692/section-57273.html
- Section 8 — processor accountability: https://bdlaws.minlaw.gov.bd/act-1692/section-57274.html
- Section 9 — children / persons unable to consent: https://bdlaws.minlaw.gov.bd/act-1692/section-57275.html
- Section 10 — exercising data rights: https://bdlaws.minlaw.gov.bd/act-1692/section-57276.html
- Section 11 — access and portability: https://bdlaws.minlaw.gov.bd/act-1692/section-57277.html
- Section 13 — withdrawal, objection and deletion: https://bdlaws.minlaw.gov.bd/act-1692/section-57279.html
- Section 15 — accountability and transparency: https://bdlaws.minlaw.gov.bd/act-1692/section-57281.html
- Section 16 — confidentiality: https://bdlaws.minlaw.gov.bd/act-1692/section-57282.html
- Section 17 — security safeguards: https://bdlaws.minlaw.gov.bd/act-1692/section-57283.html
- Section 18 — retention: https://bdlaws.minlaw.gov.bd/act-1692/section-57284.html
- Section 19 — records of processing: https://bdlaws.minlaw.gov.bd/act-1692/section-57285.html
- Section 20 — personal-data breach: https://bdlaws.minlaw.gov.bd/act-1692/section-57286.html
- Section 29 — data classification and cross-border transfer: https://bdlaws.minlaw.gov.bd/act-1692/section-57295.html
- Digital Commerce Operation Guidelines 2021, Ministry of Commerce: https://mincom.gov.bd/pages/static-pages/694032dc35ce18e1c0563903
- BRTA Ridesharing Service Policy 2017, official PDF: https://eservices.rthd.gov.bd/admin/docs/brta/moc_51ffca60e1ce4e1e8fb6cc761000df4e.pdf
- Road Transport Act 2018: https://bdlaws.minlaw.gov.bd/act-1262/act-chapter-print-2117.html
- Consumers' Right Protection Act 2009, English text: https://www.bangladeshtradeportal.gov.bd/kcfinder/upload/files/Consumer%20Rights%20Protection%20Act%202009.pdf

---

## Drafting notes and legal caveats

1. The Personal Data Protection Act, 2026 is the current enacted law identified in the official Bangladesh Laws repository. The earlier Personal Data Protection Ordinance, 2025 is superseded. Section 1(3) states that the Act is deemed effective from 6 November 2025 except specified deferred sections; confirm commencement notices and implementing rules before finalising compliance dates.
2. The Act requires a lawful processing basis. Where consent is used, section 5 says it must be voluntary, specific, clear and withdrawable, and the person must be informed about purpose, retention, transfer and withdrawal. The Act also recognises other specified grounds. Do not rely on blanket consent language.
3. The Act addresses sensitive personal data, processor accountability, children's data, access / portability, correction, withdrawal / objection / deletion, transparency, security, retention, processing records and cross-border transfer. The privacy notice must be supported by operational controls, not just text.
4. Section 19's processing-record requirement should not be confused with a universal five-year retention period for all raw personal data. Retention must also satisfy the purpose-based rule in section 18.
5. The BRTA Ridesharing Service Policy 2017 source indicates technology-institution and vehicle enlistment, documentation and tripartite arrangements. Current applicability, amendments, thresholds and category-specific treatment must be verified before launch. A public Terms of Use cannot replace licensing or enlistment.
6. The reference platforms offer useful structural ideas, but their liability disclaimers, refund rules, payment models, age requirements, retention schedules and data transfers are not copied into this pack. They are not legal precedent for Ride.
7. These drafts are intentionally conservative and incomplete where business facts are unknown. Completion requires the decision register, a source-code / SDK review, actual processor locations, finance workflow confirmation and advice from Bangladesh-qualified counsel.
