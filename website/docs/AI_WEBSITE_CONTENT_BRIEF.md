# Ride Website — AI / Developer Implementation Brief

## Source of truth

Read `content/Ride_ASO_Master_Asset_Package_Bangladesh.md` before changing public website copy. It is the product and brand source for this website. Preserve the brand as **Ride** only. Do not use GoRide, GlideX or another alternative name.

The master document describes intended functionality and includes explicit pre-publication fact checks. It is not proof that every feature, payment method, city, provider or emergency integration is live. Keep availability qualified until the product/operations owner marks the corresponding item Live and supplies evidence.

## What the website is

Build a polished, responsive, Bangladesh-first marketing website for Ride, a multi-service app connecting customers with drivers, fleets, restaurants, local shops, workshops, ambulance providers and delivery partners.

The main page is a one-page landing site with anchored sections. Supporting routes exist for trust and Play Console use:

- `/` — the public marketing one-pager.
- `/privacy` — a structured privacy-policy draft. It is deliberately marked noindex and is NOT submission-ready until the real data inventory, SDKs, processors, retention, legal entity and privacy contact are completed.
- `/delete-account` — external account-deletion request resource. It must become fully functional before production if users can create accounts. The final flow must be tested and must actually reach a monitored inbox or deletion service.
- `/support` — support contact and escalation guidance.

## Positioning

Primary message: **Everyday mobility, local commerce and delivery in one Bangladesh-focused app.**

Lead with repeat-use consumer needs: rides, food, local shopping and delivery. Present specialist services—rent-a-car/intercity, truck/shifting, ambulance, parcel/courier and automotive workshops—as discoverable service cards, with clear availability qualifications.

## Seven verticals

1. Daily ride-hailing: Bike Basic/Standard/Plus, scooter, CNG and economy/comfort/premium/XL car options. Do not publish a vehicle-tier count until the source brief's apparent eight-vs-nine mismatch is resolved.
2. Rent-a-car and intercity travel: hourly/daily rentals and supported outstation routes.
3. Truck and logistics rental: pickup, covered van and truck for shifting/cargo. Do not promise tonnage until actual fleet inventory is confirmed.
4. Ambulance transport requests: describe provider availability only where live. Do not claim 24/7, BLS, ALS, ventilators, paramedics or response times without provider evidence. Ride is not an emergency-response service; in Bangladesh tell users to contact 999 for immediate emergencies.
5. Food and restaurant delivery: participating local restaurants and cafes.
6. Shops, groceries and automotive workshops/parts: participating stores and workshops. Do not claim medicine/pharmacy availability without appropriate authorization and local legal review.
7. Parcel/courier and merchant delivery: eligible parcels and delivery-person services for participating merchants; COD workflows only where verified.

## Brand and copy rules

- Official brand: Ride.
- Tone: useful, local, calm, specific and honest.
- Avoid “best”, “cheapest”, “#1”, guaranteed provider match, fastest, instant everywhere, 24/7 everywhere or “all 64 districts” unless independently substantiated.
- Use “where available”, “participating providers” and “availability varies by location” when scope is not confirmed.
- Explain driver economics accurately: Ride does not deduct per-trip commission from ride fares, but drivers use paid weekly call packages to access eligible ride leads. Do not call the service free or hide package fees/terms.
- Do not claim Google Play approval or app availability while the listing is unpublished.
- Do not show fake store badges, made-up support addresses, fake phone numbers, fabricated app screenshots, fake user counts or unverified partner logos.

## Visual direction

- Visual personality: modern, dependable, clear and locally grounded; not a generic neon rideshare clone.
- Palette: deep forest/ink, muted teal, warm off-white, mint and restrained orange accent.
- Large readable headlines, generous whitespace, clean service cards, confident typography and simple illustrative UI.
- Responsive first; ensure mobile navigation, service cards and CTA controls are usable on narrow screens.
- Bengali language toggle is included. Keep Bengali typography readable and review copy with a native speaker.
- The home-page phone mockup is illustrative only. Replace with real release-build screenshots before launch if you use it as product evidence.

## Sections on the one-pager

1. Header: Ride mark, navigation, EN/বাংলা switch.
2. Hero: positioning, core service categories, availability note and service navigation CTA.
3. Seven service cards: concise benefit, category examples and availability qualifier.
4. How it works: choose a service, review provider/price/terms, confirm.
5. Partner section: drivers/fleets and merchants/delivery partners.
6. Safety section: qualified tracking/safety language; clear emergency disclaimer and 999 instruction.
7. FAQ: coverage, driver call packages, ambulance, payments, account deletion.
8. Contact CTA and store-link placeholder; do not invent Play Store listing URL.
9. Footer: privacy policy, deletion and support links.

## Launch configuration

All changeable business contact details live in `src/lib/site.ts`. Before launch set:

- `siteUrl` to the real HTTPS domain.
- `supportEmail` to an active, monitored support mailbox.
- `privacyEmail` to a monitored privacy contact (or a documented shared inbox).
- `legalEntity` to the correct legal company/developer name.
- `businessAddress` if included in final legal notice/policy.
- `playStoreUrl` only after the listing exists.
- `privacyPolicyApproved: true` only after legal and engineering review.
- `deletionWorkflowApproved: true` only after end-to-end deletion request tests.

Do not use the website's draft privacy page as the Play Console privacy URL until it is complete. The privacy policy must describe actual app and SDK data practices. If Ride supports account creation, an external deletion request path must exist and actually work, in addition to an in-app deletion path.

## Engineering constraints

- SvelteKit + Svelte + TypeScript.
- Keep content configuration centralized; do not duplicate support email or website domain across pages.
- No backend or form processing is currently included. Do not add a pretend contact form; use a working mailto address or integrate a real support/form backend.
- No analytics, trackers, advertising pixels, maps API or payment SDK are included. If added, review cookies/consent, privacy policy and security.
- Preserve semantic headings, keyboard access, reduced-motion support, alt text, useful page metadata and mobile layout.
- Run `npm run check` and `npm run build` after changes. Report errors rather than claiming success.

## Source material

`content/Ride_ASO_Master_Asset_Package_Bangladesh.md` is copied into this project for AI coding agents. Read Sections 1, 4, 5, 6, 8, 10 and 12 first. Use Section 10 as the factual launch gate.
