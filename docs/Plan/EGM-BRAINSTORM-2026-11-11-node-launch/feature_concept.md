**Purpose:**     EGM feature concept for the "Node" repositioning brainstorm — the input document for the Goldfish multi-lens review.
**Owner:**       Elephant (EGM) — current until /egm-draft begins
**Status:**      IN-PROGRESS (brainstorm review stage)
**Source of truth:** this file, for the concept. Repo files under Related are the ground truth for current-state facts.
**Related (concrete paths):**
  - AGENTS.md — project hard rules, architecture map, critical invariants (§ Critical Rules, § Architecture Map, § Copy Truth Rule)
  - app/(main)/(customer)/services-hub.tsx — the vertical hub; ride tiles are the VEHICLE_CATEGORIES block (~lines 130–179)
  - app/(auth)/login.tsx, login-as.tsx, register.tsx, register-shop-owner.tsx, register-fleet-owner.tsx, register-delivery-man.tsx — auth surfaces to re-organize
  - app/index.tsx — splash auth gate; routes single-role accounts by ROLE_HOME, multi-role to login-as
  - app/(main)/(customer)/index.tsx — customer landing redirect to (tabs)/home
  - app.config.js — app identity (name, slug, scheme, bundle identifiers, splash/logo assets)
  - docs/Image/ — prepared Node brand assets (logo, icons, splashes, brand colors)
  - src/db/schema.ts — `userRoleEnum` (rider/driver/admin/owner/…), `user_roles` table (multi-role per account)
**Last verified:** 2026-11-11 by Elephant (direct file reads; line numbers cited inline)
**How to update:** Only with owner rulings; append new rulings at the bottom, never edit past rulings.

---

# Feature Concept: "Node" First Launch — Ride Hidden, User/Operator Split

## Problem / Motivation

The app began as a ride-hailing product ("Ride"), so the customer information architecture is ride-centric. The owner wants the first store launch to be a multi-vertical platform branded **Node**, without the passenger ride-hailing vertical visible. Everything already built — ride booking, dispatch, driver monetization, admin — stays in the system and app, deployed and dormant; the frontend hides it. Ride can be re-enabled later.

## The Four Components (owner request)

1. **Launch without passenger ride-hailing.** Hide ride in the frontend; keep all ride infrastructure deployed.
2. **Rename to Node.** Brand assets already prepared in `docs/Image/`.
3. **Auth re-organization.** First screen = user (customer) login, with a "Login as Operator" button at the bottom going to the operator login surface. Registration: user-first screen with the usual registration link, plus a "Register as Operator" bottom path leading to a role dropdown ("Register as …"); each role lands in its own registration flow with role-specific requirements.
4. **Services vertical page.** Hide the ride-related options for now.

## Owner Rulings (locked — do not reopen)

- **Never published.** `com.ride.bd` has never been on Google Play or the App Store, including internal/closed tracks. Only Play Console registration exists; new console details can be taken for Node. The rename is therefore a first-release identity decision (new bundle ID, scheme, listing), not a migration.
- **One-account-multi-role retained.** The earlier idea of forcing separate registration per profile (two phone numbers) is withdrawn. The existing architecture stays: one phone number = one Supabase identity; multiple roles via the `user_roles` table; the `login-as.tsx` chooser survives; "login details, but login-as".
- **Vocabulary.** **User** = the `rider` role (rider/buyer/service-taker — same account, different intent per session). **Operator** = `driver`, `fleet_owner`, `shop_owner`, `delivery_man`, `shop_staff`. A restaurant owner is a `shop_owner` whose shop type has `is_restaurant: true`; no new role needed.
- **Dormant, not deleted.** Ride code, screens, dispatch server, monetization all stay. Re-enabling ride must be possible **without a store update** — the hide mechanism is expected to be runtime configuration (mechanism to be finalized at draft).
- **Ride-driver onboarding hidden at launch** (design default pending review): the driver registration entry is gated off like the ride tiles; an existing `driver`-role account at login lands on a neutral surface instead of `(rider)/home`. Moot for launch in practice — no users exist on any track.

## Current-State Facts (verified against the repo, 2026-11-11)

- **Customer landing is ride.** `app/(main)/(customer)/index.tsx` redirects to `(tabs)/home`; the home tab IS the ride-booking surface (map, service selection, finding-driver flow). The bottom tabs (`activity`, `rides`, per-ride `chat`, `history-detail`) are ride-flavored. Hiding ride therefore re-points the customer landing and needs a tab-bar pass, beyond the services hub.
- **Services hub.** `services-hub.tsx` renders: ride tiles (`VEHICLE_CATEGORIES`, ~lines 130–179), Shops tile, Rental marketplace tile, admin-extensible shop-category strip, Delivery (parcel) tile, Ambulance tile. Only the ride block needs gating here.
- **Auth today.** `phone-entry` → `otp-verify` (Supabase phone OTP). `app/index.tsx` splash gate routes single-role accounts by `ROLE_HOME` and multi-role accounts to `login-as.tsx`. `login-as.tsx` routes: rider → customer home, driver → `(rider)/home`, shop_owner → `(shop-owner)`, fleet_owner → fleet dashboard, delivery_man → `(delivery)`, shop_staff → shop surface (roles list from `GET /api/user/roles`, active roles only).
- **Registration wizards exist** for the operator roles: `register-shop-owner.tsx`, `register-fleet-owner.tsx`, `register-delivery-man.tsx` (resubmit-aware, per-role requirements). The proposed operator registration dropdown maps onto these; no new wizard is required for existing roles.
- **Identity fields.** `app.config.js`: `name: "Ride"`, `slug: "ride-bd"`, `scheme: "ride"`, iOS `bundleIdentifier: "com.ride.bd"`, Android package under the same application id, splash `assets/splash/Splash_Screen_2.png`, icon `assets/logo/logo.png`, `expo-updates` currently disabled. The scheme is used by `/payment/success|failure` deep-link returns (PortPos flow) — a scheme change must update those return paths.
- **Brand assets ready.** `docs/Image/`: `node_logo.png`/`.svg`, `node_app_icon_1024.png`, `node_play_store_icon_512.png`, Android adaptive foreground, `node_splash_android_1080x2400.png`, `node_splash_ios_1170x2532.png`, animated splash GIF, `node_brand_colors.txt`, master SVGs.
- **Surviving verticals are decoupled from ride dispatch.** P2P parcels POST `/api/delivery/parcels` and track `deliveries` legs; shop orders use the same delivery-leg bridge (`lib/shopDeliveryBridge.ts`); the `delivery_requests` courier-bidding table is retired (POST is a 410 stub). Ride dispatch (`utils-server`, lead billing, `dispatch_offers`, `call_ledger`) can stay deployed with no ride traffic.
- **Theme.** `theme/goRide.ts` is the single token source; dark mode via NativeWind variants. Node colors from `docs/Image/node_brand_colors.txt` must land there.
- **Gates to keep green.** The repo has a pre-commit/CI gate set (testID map freshness + flow currency, Maestro flow-xcheck, i18n orphan ratchet + braces gate, nav-integrity audit, Copy Truth Rule). **Hide, never delete** keeps the testID map, `t()` references, and flow selectors intact; deleting screens would cascade through all of them. Visible copy must not reference ride behavior while ride is hidden (Copy Truth Rule) — the flag gates copy too.

## Open Items (flagged for the review; resolved at draft)

- Tab-bar pass: which tabs survive when ride is hidden; what replaces the ride home as the user landing.
- Verify ambulance and truck-rental-marketplace dependencies on the ride dispatch chain (assumed decoupled, not yet traced end-to-end).
- "Ride" → "Node" copy sweep across `i18n/locales/*`, terms, and in-app surfaces; brand-color swap in `theme/goRide.ts`.
- Hide-mechanism choice: `platform_config` runtime flag (admin-flippable, no store update) vs build-time `EXPO_PUBLIC_*` flag (needs a release to re-enable).
- Admin panel stays live; decide whether any ride-admin screens need launch-time gating or none (admin is staff-only).
- SOS/GlobalActionButtons ride-context handling when no ride is active.

## Out of Scope (explicit non-goals)

- Renaming the repository directory (breaks local paths/CI/EAS links for zero user-visible benefit).
- Deleting or decommissioning ride code, the dispatch server, or any data.
- Store submission mechanics beyond the identity decision (listing copy, screenshots — later).
