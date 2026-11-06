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

**Applies to:** ride drivers, scooter / bike / CNG / car providers, rental and truck operators, couriers, delivery persons, ambulance operators and other approved service partners, as applicable to their role. A separate signed partner agreement or service addendum may impose additional requirements.

## 1. Eligibility and onboarding

You may provide a service only after Ride has approved your profile for the relevant category. You must provide accurate identity, contact, payment and role-specific details and keep them current.

For motor-vehicle services, you must hold a valid driving licence, registration, fitness, tax token, route permit, enlistment / fitness documents and other approvals required for the vehicle and service. Where applicable, you and the vehicle owner must obtain the BRTA ridesharing enlistment certificates and enter the required tripartite or other written agreement. The exact current requirements must be checked against the applicable BRTA rules and any amendments before activation.

For ambulance, medical transport, freight, rental or delivery services, provide all permits, professional credentials, operating permissions, insurance and equipment records required for that service. Ride may reject or pause activation where evidence is missing, expired or inconsistent.

## 2. Partner account and use

You must personally control and use your approved partner account unless Ride has expressly enabled named staff accounts for your business. Do not lend, rent or transfer access. Protect customer information and use it only to fulfil the accepted booking, resolve a legitimate service issue or comply with law.

Do not discriminate, harass, threaten, solicit unrelated business, divert bookings deceptively, manipulate location, fake completion, request off-platform payments beyond the agreed method, or pressure customers to change a confirmed fare.

## 3. Ride fares and Ride call packages

**Current intended commercial model — verify against the live package screen and signed partner agreement:**

- Ride does not deduct a percentage commission from a completed ride fare.
- The driver retains 100% of the agreed ride fare, which the customer pays directly to the driver using the payment method agreed for that trip.
- A driver may purchase a weekly prepaid call package to access ride leads / calls through Ride.
- The call package is a separate platform-access charge; it is not a percentage of the fare and does not guarantee any minimum number of bookings, completed trips, income or earnings.
- Package price, start time, validity, included calls / leads, lead qualification, rollover, expiry, pause rules, failed-call treatment, duplicate payment treatment and refund conditions must be displayed before purchase and set out in a current package schedule.

**Package schedule required before publication:**

| Item | Must be specified |
|---|---|
| Package name and price | `[INSERT BDT PRICE AND TAX TREATMENT]` |
| Validity | `[EXACT START / END RULE]` |
| Included leads / calls | `[COUNT OR ACCESS DEFINITION]` |
| What counts as a delivered lead | `[OBJECTIVE DEFINITION]` |
| Invalid / duplicate / unreachable lead remedy | `[REPLACEMENT / CREDIT RULE]` |
| Unused-lead rollover | `[ELIGIBILITY, CAP, PERIOD, EXPIRY]` |
| Pause / suspension treatment | `[RULE]` |
| Auto-renewal | `[OFF UNLESS EXPRESSLY ENABLED AND CONSENTED]` |
| Refund conditions | `[DUPLICATE CHARGE, SYSTEM FAILURE, UNUSED ACCESS, OTHER RULES]` |
| Support and dispute window | `[CHANNEL AND TIME LIMIT]` |

Do not advertise “free leads”, “guaranteed bookings”, guaranteed earnings or unlimited rollover unless the package actually delivers those terms. The legal and Google Play Billing classification of the call package must be reviewed separately; this agreement does not determine the correct in-app payment method.

## 4. Service standards

Accept only requests you can fulfil safely and lawfully. Keep the assigned vehicle, equipment and documents in good condition. Do not substitute a different vehicle, driver or operator without customer consent and Ride's approval where required.

Complete the service as agreed, update the app accurately, protect any items handled, and report incidents immediately. Do not mark a trip, order or delivery complete before actual completion.

## 5. Location and background operation

If your role requires live availability or active trip / delivery tracking, enable the app permissions explained in the partner app. Background location may be processed only for the disclosed operational purposes and within the permission and service state actually required. Turn off availability when you are not accepting work. Ride must not describe continuous background tracking unless the app actually performs it and the required notice / permission is in place.

## 6. Payment records and taxes

Keep accurate records of fares, package payments, cash collection, COD, expenses and taxes. You are responsible for your own applicable tax and licensing obligations, subject to any statutory withholding or reporting duty imposed on Ride. Do not misrepresent a payment as settled when it is not.

## 7. Reviews, complaints and investigations

Cooperate with reasonable safety, payment, fraud and service-quality investigations. Ride may temporarily limit access while investigating a credible safety or fraud concern. Ride should communicate the basis where legally and operationally possible and provide a review / appeal channel.

## 8. Suspension and deactivation

A partner account may be suspended or deactivated for expired licences, unsafe conduct, fraud, misuse of customer data, repeated service failures, serious complaints supported by evidence, unlawful activity or breach of the partner agreement. Any process must be consistent with applicable law and the signed agreement. Outstanding balances and legal recordkeeping duties do not automatically disappear on deactivation.

## 9. No employment-status shortcut

The parties' legal relationship must be determined by the actual contract, conduct and applicable Bangladesh law. A statement that a partner is an independent provider does not conclusively determine employment or worker status where mandatory law says otherwise.

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

## 1. Scope and seller identity

This policy applies to food, grocery and other shop orders placed through Ride. The order page must identify the merchant / seller and show the goods, quantity, price and applicable delivery / other charges. The merchant identified on the order page is responsible for selling and supplying the goods, except where the transaction clearly identifies Ride as the seller.

## 2. Order confirmation and substitutions

An order is not final until the merchant accepts it or the app displays a confirmed state. If an item is unavailable, the merchant may reject the order or propose a substitution. The customer must approve a material substitution or additional charge before fulfilment.

## 3. Preparation and delivery

Food is prepared and packed by the merchant unless the app says otherwise. The delivery partner is responsible for collecting and transporting the sealed order with reasonable care. Estimated delivery times are estimates and may be affected by preparation, traffic, weather, access restrictions or other circumstances.

## 4. Allergens, dietary and product information

Customers should review ingredient, allergen, dietary, quantity and product information displayed by the merchant. Ride cannot independently verify every merchant statement. Customers with serious allergies or medical dietary requirements should contact the merchant before ordering and should not rely on an incomplete listing.

## 5. Complaints

Report missing, incorrect, damaged, contaminated, expired or materially misdescribed items through `support@ride.digital-papyrus.com or WhatsApp +880171324950` within `[REVIEWED CLAIM WINDOW]`. Include order ID, photos where appropriate and a description of the issue. Ride may contact the merchant and delivery partner to investigate.

## 6. Returns and refunds

Food and perishable items may not be suitable for ordinary change-of-mind return, but this does not remove the customer's rights where goods are unsafe, defective, incorrect, missing or not as described. Non-perishable goods follow the applicable seller return terms and mandatory consumer law. Any exclusions must be clearly shown before checkout and legally reviewed.

---

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

## 1. Scope

This policy applies to hourly / daily car rental, chauffeur-driven vehicles, intercity travel, pickup / truck booking, household shifting and commercial cargo services arranged through Ride.

## 2. Quote and booking scope

Before confirmation, the quote or provider offer should describe:

- vehicle type, capacity and relevant registration / provider details;
- pickup, destination, route, date, start time and expected duration;
- included distance / hours and any overtime rule;
- whether fuel, tolls, parking, driver allowance, loading / unloading, helpers, stairs, waiting, return journey and taxes are included or excluded;
- cargo type, approximate weight / volume and special handling requirements, where relevant;
- cancellation, deposit, damage and rescheduling terms; and
- the total price or the method used to calculate variable charges.

A quote should not be treated as accepted until the customer and provider have accepted it through the app or another documented method specified by Ride.

## 3. Customer obligations

Provide accurate passenger, luggage, cargo, weight, access and route details. Do not exceed vehicle capacity, request unlawful transport or conceal hazardous cargo. Secure fragile goods and arrange any special loading equipment or helpers in advance.

## 4. Provider obligations

Provide the agreed vehicle and qualified driver / crew, maintain vehicle fitness and required permits, arrive at the agreed time where reasonably possible, and disclose any change before proceeding. A substitute vehicle or increased charge requires the customer's approval except for an emergency safety alternative permitted by law.

## 5. Damage, delay and cancellation

The booking-specific offer and cancellation schedule govern cancellation charges, waiting, delay, rescheduling and damage claims. Take reasonable pre-service and post-service records where needed. Any deposit and deduction must be supported by the disclosed terms and evidence.

---

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

**This privacy notice is not final until the production data inventory and every third-party SDK / processor have been checked.** It must describe what Ride actually collects, not what the product roadmap intends to collect.

**Data controller / data-fiduciary:** `Ride Digital Services`  
**Website:** `https://ride.digital-papyrus.com`  
**Privacy contact:** `privacy@ride.digital-papyrus.com`  
**Effective date:** `1 November 2026`

## 1. Scope

This notice explains how the Ride operator collects, uses, shares, stores, protects and otherwise processes personal data through Ride's website, mobile application, customer support, partner interfaces and related services. It applies to customers, drivers, delivery partners, merchants, fleet operators, ambulance operators, recipients and people who contact Ride.

## 2. Personal data we may process

The following categories are a **data-mapping checklist**, not a claim that every item is currently collected. Remove any category that the production system does not process and add any actual category that is missing.

| Category | Examples / Ride context | Verify before publication |
|---|---|---|
| Account and contact | Name, mobile number, email, profile photo, account identifiers, emergency contact | Which fields are mandatory / optional; OTP vendor |
| Identity and eligibility | NID or other identity document, date of birth, driving licence, vehicle registration, fitness / permit documents, business registration, partner verification records | Exact files captured, who reviews them, storage location, retention |
| Profile and matching | Gender field, vehicle / service category, women-only preference, language and accessibility preferences | Whether matching preference is optional; who can see gender |
| Location and routes | Approximate / precise GPS, pickup and drop-off, search queries, route, active trip / delivery trace, device location permission state | Foreground vs background, sampling frequency, exact trigger and stop conditions |
| Booking and transaction | Rides, trip duration and distance, fare, cancellations, orders, products, parcel declarations, COD, rental details, ambulance request | Which modules are live; who sees each record |
| Sensitive / emergency | Health or medical details voluntarily provided for ambulance transport, emergency notes, biometric verification if used | Whether any health or biometric data is actually collected; explicit / lawful basis and restricted access |
| Communications and support | In-app messages, calls or call metadata, support tickets, complaints, ratings, reviews, uploaded evidence | Whether calls are recorded; chat provider and retention |
| Payment and financial | Payment method, transaction reference, amount, status, refund, settlement and package purchase records | Whether Ride receives card data or only tokens / processor references; payment providers |
| Device and technical | Device model, OS, app version, IP address, identifiers, diagnostics, crash and performance logs | Exact analytics / crash SDKs and retention |
| Merchant / business | Trade licence, branch information, products, staff accounts, settlement instructions, order history | Which merchant roles and staff data are collected |
| Website / cookies | Server logs, contact-form data, necessary cookies, analytics / marketing cookies if used | Inspect browser storage and third-party tags before describing |

## 3. How we collect data

We may collect data directly from you when you register, book, order, contact support, submit documents, create a listing, accept a job or respond to an incident. The app may collect technical and location data from your device according to the permissions you grant and the service state described in the app.

We may receive limited information from a matched customer, driver, courier, merchant, fleet / ambulance operator, payment provider, mapping provider, identity-verification provider or public authority where the information is necessary for the relevant service, security or legal compliance.

## 4. Why we use data and the legal basis

The Bangladesh Personal Data Protection Act, 2026 recognises consent and specified lawful grounds such as performing a contract, taking steps requested before a contract, legal claims, vital interests and other grounds set out in the Act. Where Ride relies on consent, the consent process must be voluntary, specific, clear and withdrawable; Ride must be able to evidence it.

| Purpose | Data likely used | Proposed basis — confirm for each processing activity |
|---|---|---|
| Create and manage accounts | Account, contact, device | Contract / pre-contract steps; consent where required |
| Match and fulfil rides / deliveries / orders | Location, booking, profile, provider availability | Contract / pre-contract steps |
| Verify drivers, vehicles, merchants and operators | Identity, licence, permit, business documents | Contract, legal obligation and/or specific consent as applicable |
| Calculate and display fares / delivery estimates | Route, distance, time, booking details | Contract / pre-contract steps |
| Process or record payments, refunds and call packages | Transaction and account data | Contract and legal / accounting obligations |
| Safety, fraud prevention and dispute investigation | Location, booking history, communication, device signals | Applicable lawful basis; document necessity and proportionality |
| Emergency dispatch | Location, contact and necessary health / emergency details | Vital interests, specific consent or other valid statutory basis as applicable |
| Customer support | Account, booking, complaint and communication | Contract, legitimate / other lawful basis, legal claims |
| Service improvement and reliability | Aggregated usage, diagnostics, crash data | Document lawful basis; minimise or pseudonymise where possible |
| Marketing | Contact, preferences and engagement | Separate consent where required; withdrawal must be easy |
| Legal and regulatory compliance | Records required by law | Legal obligation |

Do not use a single “I consent to everything” checkbox as the basis for all processing. Separate optional marketing, background location where applicable, sensitive health information, and other optional processing from what is necessary to provide a requested service.

## 5. Location data and live tracking

Location data is central to matching, navigation, fare calculation, pickup, delivery and safety. Ride should request location permission only when the relevant function needs it and explain the purpose at the point of request.

For customers, location may be used to identify nearby providers, set pickup / delivery points and show progress while a booking is active. For drivers and delivery partners, precise location may be processed while they are online or performing an accepted job if the app's actual functionality requires it. This notice must accurately explain whether background location is collected while the app is not visible, when it starts, when it stops, and how a partner can go offline.

A user's device settings can affect location accuracy and availability. Denying permission may disable features that require GPS, but should not be described as permission to collect location anyway.

## 6. Gender and women-only matching

If you use women-only matching, Ride may process the gender information and matching preference needed to operate that feature, verify eligibility and support safety. The app should explain whether the field is mandatory, optional or self-declared; whether verification is performed; who can see the information; and how a user can correct it. Do not infer gender from photos or use gender data for unrelated advertising.

## 7. Health and emergency information

If you request ambulance or emergency transport, Ride may process information about the patient, pickup point, emergency contact and limited medical details necessary to arrange the requested service. This information may be shared with the selected ambulance operator, medical personnel, hospital or emergency authority where needed for the service or to protect life or health.

Health details must be treated as sensitive and subject to heightened access restrictions. Do not collect more detail than necessary, and do not use emergency data for advertising or unrelated profiling.

## 8. Who we share data with

Ride may disclose the minimum information reasonably needed to:

- the matched driver / provider, customer or recipient to arrange and complete the booking;
- the merchant to accept, prepare and fulfil an order;
- the courier or delivery partner to collect and deliver a parcel or order;
- the ambulance operator, medical professional or hospital for the requested emergency transport;
- payment processors, banks or mobile financial service providers to process payments, refunds, settlements or fraud checks;
- hosting, database, storage, mapping, routing, search, SMS / OTP, email, customer-support, analytics and crash-reporting providers that operate services for Ride;
- professional advisers, insurers or auditors where necessary and lawful;
- government, regulatory, court or law-enforcement authorities where required or permitted by law; and
- another party in connection with a business transfer, subject to applicable law and appropriate safeguards.

Ride should identify the actual processor / recipient categories and, where required, names, purposes and transfer locations. Candidate technical providers from the product context (including Supabase, Barikoi and dpMaps) must be verified against production configuration before being named as recipients. A provider being considered or used in shadow mode must not be described as receiving live personal data unless it actually does.

Ride does not sell personal data for unrelated third-party marketing under this draft. If a future advertising or data-sharing model changes this, the notice and consent / choice mechanisms must be updated before launch of that activity.

## 9. International processing and hosting

Some service providers may process or store data outside Bangladesh. Before publication, Ride must identify each hosting region, backup region, support access location and third-party transfer path. The Personal Data Protection Act, 2026 contains conditions for data classification and cross-border transfers; transfers must be reviewed against section 29 and any applicable rules or directions. This notice must name or describe the countries / safeguards accurately once confirmed.

## 10. Retention

Ride retains personal data only for as long as necessary for the purpose for which it was collected, subject to applicable legal, regulatory, tax, accounting, safety, fraud-prevention, dispute and claim requirements. Different categories require different retention periods.

**Do not copy another platform's seven-year retention table.** Ride must approve a retention schedule covering at least: account data; identity and partner documents; trip and route data; payment and accounting records; parcel / COD records; medical / emergency records; support tickets; device / security logs; and consent records. The Act separately requires records of personal-data processing to be maintained for at least the statutory period stated in section 19; counsel must define which records fall within that requirement. A five-year processing-record duty is not a blanket instruction to keep every raw GPS trace or medical record for five years.

When the purpose ends and no lawful retention ground remains, the data should be deleted or irreversibly anonymised. A deletion request may be delayed or partly refused where a lawful retention ground applies, but Ride must explain the retained categories and reason where legally permitted.

## 11. Security

Ride will implement appropriate technical and organisational safeguards proportionate to data sensitivity and processing risk, such as role-based access, least privilege, encryption in transit and at rest where supported, secure credential handling, audit logging, backups, staff confidentiality, vendor controls and incident response.

No system can be guaranteed completely secure. If a personal-data breach occurs, Ride will investigate, contain and document it and make notifications required by Bangladesh law and applicable rules. Do not invent a fixed notification deadline that is not confirmed by the applicable statutory rules.

## 12. Your data rights and choices

Subject to applicable law and verification of identity, you may request access to your personal data, a copy or information about its processing, correction or completion, portability where applicable, withdrawal of consent, objection or restriction where available, and deletion where the legal conditions are met.

Submit a written request to `privacy@ride.digital-papyrus.com` with your name, registered phone or account identifier, the right you wish to exercise and enough information to verify the request safely. Do not email passwords, OTPs or full card numbers. Ride may request additional identity verification where reasonably necessary to prevent fraud or disclosure to the wrong person.

Some data may need to be retained for legal obligations, accounting, safety, fraud prevention, active disputes or legal claims. Rights cannot be removed by a contract clause or this notice.

## 13. Children

Ride accounts are intended for adults aged 18 or older, unless a specific guardian-managed process is expressly introduced. Ride must not knowingly collect or process a child's personal data outside a lawful guardian-authorised process. If a child has provided data improperly, contact `privacy@ride.digital-papyrus.com`.

## 14. Automated decisions and profiling

If Ride uses automated systems to match providers, estimate prices, rank listings, detect fraud, determine eligibility or prioritise requests, the notice must describe the relevant inputs, purpose, material effects and available review process to the extent required by law. Do not claim that all decisions are human-reviewed if they are not. Do not add behavioural profiling or eligibility scoring to production without a documented legal basis and product review.

## 15. Cookies and similar technologies

The Ride website may use essential technologies needed for security, session handling and website functionality. Analytics, advertising or preference cookies should be described by name, provider, purpose and duration, and any required consent / controls must be implemented. The current site must be inspected before this section is finalised; do not list cookies that the website does not use.

## 16. Changes and contact

Ride may update this notice as services, systems or law change. Material changes will be communicated through the website, app or another appropriate channel. The latest version will show its effective date.

Data-fiduciary / privacy contact: `Ride Digital Services`  
Email: `privacy@ride.digital-papyrus.com`  
Postal address: `7/1-D, R.K. Mission Road, Dhaka-1203`  
Website: `https://ride.digital-papyrus.com/privacy`

---

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

**Suggested public URL:** `/cookies`

Ride's website may use essential cookies or similar technologies to provide secure and reliable website functions. Any analytics, preference or marketing technologies will be described here with their provider, purpose, duration and available controls.

Before publishing this notice, inspect the production site with browser developer tools and record every cookie, local-storage item, tag, analytics script, embedded map, form provider and third-party request. If analytics or marketing cookies are not used, say so accurately. If consent is required for a category, do not load that category until the user has made the required choice. Users should be able to revisit and change their cookie choices where such choices are offered.

Contact: `privacy@ride.digital-papyrus.com`.

---

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
