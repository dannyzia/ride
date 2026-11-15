**Purpose:**     Formal design document (draft in progress) for the Node first launch — ride hidden, user/operator split, rebrand. Iterated section-by-section behind approval gates; finalized copy becomes the reviewed design document.
**Owner:**       Elephant (EGM drafting session, for Zia)
**Status:**      FINALIZED — superseded as a content mirror. The authoritative, review-resolved design lives in `DESIGN-NODE-LAUNCH.md` (rev 3, incl. the consolidated-review resolution fixes). This working draft is retained as the historical iteration record; post-promotion fixes (rev 3, 2026-11-11) live only in the final document.
**Source of truth:** Owner rulings: `owner_dispositions_2026-11-11.md` (verbatim, authoritative). Concept + review synthesis: `concepts_brief.md` (EGM Priority 1 intake). Code facts verified 2026-11-11 against the working tree.
**Related (concrete paths):**
  - `docs/Plan/EGM-BRAINSTORM-2026-11-11-node-launch/concepts_brief.md` — brainstorm synthesis feeding this draft
  - `docs/Plan/EGM-BRAINSTORM-2026-11-11-node-launch/owner_dispositions_2026-11-11.md` — D-1 … D-7 rulings (implemented verbatim)
  - `docs/Plan/EGM-BRAINSTORM-2026-11-11-node-launch/feature_concept.md` — anchored concept + verified current-state facts
  - `docs/Plan/EGM-BRAINSTORM-2026-11-11-node-launch/{zoom_out,codebase_details,critic,comprehension,implementation_readiness,structural}_report.md` — review evidence
**Last verified:** 2026-11-11, by Elephant
**How to update:** Elephant edits during drafting; section changes require the owner's gate approval.

---

# Node First Launch — Ride Hidden, User/Operator Split, Rebrand

*   **Author:** Elephant (EGM), for Zia
*   **Status:** Draft
*   **Date:** 2026-11-11

## Overview

The product currently named "Ride" launches on Google Play and the App Store as **Node**: a multi-vertical service platform whose first release shows shops marketplace, P2P parcel delivery, truck rental marketplace, and ambulance services — with the passenger ride-hailing vertical present in the system but hidden from users. The hide is controlled by one runtime configuration flag, so ride can be turned back on later without a store update. The auth flow is re-organized around a user/operator split while the existing one-account-multi-role model is kept as built. Branding swaps to the Node identity and assets already prepared in `docs/Image/`. The app has never been published on any store track, so the rename is a first-release identity decision — new bundle ID, scheme, and listing — not a migration.

## The Problem

The app was built as a ride-hailing product, and it shows: the customer landing is the ride-booking map, the first screens carry ride copy ("Your ride, your way"), the auth screens carry a five-role ride-era pill selector, and the brand name "Ride" is woven through the app name, deep-link scheme, permission strings, and locales. The business decision (owner, 2026-11-11) is that the **first store launch** must not be a ride-hailing app. It must launch as Node, a broader service platform, with passenger ride-hailing not visible to users — while every piece of ride infrastructure already built (booking screens, dispatch server, driver monetization, admin) stays in the system and app, dormant, ready to be re-enabled later.

Four things must happen together:

1.  **Hide the ride vertical in the frontend** — without deleting anything, so the repo's gate set (testID map, i18n ratchet, Maestro flow checks) stays green and re-enable is cheap.
2.  **Rename the product to Node** — name, deep-link scheme, bundle ID, icons, splashes, colors, and user-facing copy — as one identity decision before the first store submission, after which the identity is frozen.
3.  **Re-organize login and registration** around a user/operator split: user-first login with an operator path at the bottom; user-first registration with an operator role dropdown landing in the existing per-role registration wizards. The one-phone-number, multiple-roles model (the `user_roles` table and the login-as chooser) is kept — one account can hold both user and operator roles.
4.  **Leave the surviving verticals as the product** — the services hub becomes the user home, offering shops, parcel delivery, rental marketplace, and ambulance, with location and SOS ownership moved onto surviving surfaces so the launch product works end-to-end without any hidden ride screen.

The hard constraints: re-enabling ride must not require a store update; nothing ride-related may be deleted; visible copy must not reference behavior that is not live (the repo's Copy Truth Rule); and the rename must be complete and final before the first store submission because it is the only irreversible step.

## Goals

These are the absolute success criteria for the design and its implementation:

*   **G1 — Node identity shipped.** The first store release uses bundle ID `com.node.bd`, deep-link scheme `node`, listing name "Node", with the prepared Node assets wired into every brand slot (app icon, adaptive icon, splashes, notification icon, favicon, theme palette in both `theme/goRide.ts` and `tailwind.config.js`). Verified by a device build showing Node branding on every first-paint surface.
*   **G2 — Ride hidden behind one runtime flag.** A single `platform_config` boolean, read by the app at boot through a small public endpoint, hides every ride entry point: services-hub tiles, hamburger items, landing redirects, role routing, and deep-link targets. The flag defaults to hidden when the read fails (fail-closed). No build-time flags.
*   **G3 — Re-enable without a store update, proven.** An acceptance scenario flips the flag back: ride surfaces return, payment deep-links work, no store submission is involved. This scenario is executed and recorded before launch.
*   **G4 — User/operator auth re-organization.** First screen is the user login; a bottom "Login as Operator" path reaches the operator login; registration is user-first with an operator role dropdown (launch population: shop owner, fleet owner, delivery man) landing in the existing per-role wizards. The login-as chooser and the `user_roles` model stay as built.
*   **G5 — Services hub is the user home.** After login, all user entry paths converge on the services hub showing the surviving grid (shops, rental, shop categories, parcel, ambulance). No new home screen is designed at launch.
*   **G6 — Location and SOS work on surviving surfaces.** Location permission is requested on a visible surface before any location-essential flow (parcel, ambulance); SOS is reachable and functional without any hidden ride screen.
*   **G7 — Copy truth and localization.** Every visible string is brand-correct ("Node", no ride references while hidden) in en and bn; dormant ride-vertical copy survives unchanged for re-enable; en/bn parity and the i18n gates pass.

## Non-Goals

Explicitly out of scope for this design and its implementation:

*   **No deletions.** Ride code, screens, the dispatch server, monetization logic, and all data stay. Hidden, never removed.
*   **No repository rename.** The repo directory and package identity on disk stay "Ride" — renaming breaks local paths, CI, and EAS links for zero user-visible benefit.
*   **No store submission mechanics** beyond the identity decision: listing copy, screenshots, store ASO are a later task.
*   **No feature-flag framework.** One boolean on `platform_config`; no per-vertical visibility registry, no generic flag abstraction.
*   **No runtime brand/theming abstraction.** The Node identity is a constants swap, not a theme system.
*   **No new operator registration wizards.** The three existing wizards (shop owner, fleet owner, delivery man) are the launch population. Shop staff stays owner-created; driver onboarding stays hidden with the ride vertical.
*   **No redesigned hub experience.** A richer services-hub redesign is a separate later decision (D-1); this launch gates the ride tiles and converges the entry paths.

## Open Questions

*(None. The vocabulary strings — former Q1 — were supplied by the owner on 2026-11-11 and are recorded in Component C; the flag endpoint shape, auth topology, and walkthrough disposition were resolved in the Technical Plan.)*

## Critical User Journeys (CUJs)

### CUJ 1: New user first launch (user path)

*   **Given**: Fresh install, no account, `ride_vertical_enabled = false`, Node branding.
*   **When**: The user opens the app, registers as a customer (phone → OTP → profile), and lands in the app.
*   **Then**: First interactive screen is the user login screen (Node branding, no ride copy); after registration the user lands on the services hub; the hub shows Shops, Rental, shop categories, Parcel, Ambulance — and no ride tiles; the hamburger shows no ride entries. A location-essential flow (parcel or ambulance) requests location permission on a visible screen before proceeding.

### CUJ 2: Operator registration (role onboarding)

*   **Given**: A user on the login screen, or a visitor who taps "Register as Operator".
*   **When**: They open the operator registration screen, pick "Register as …" (Shop owner / Fleet owner / Delivery man), and complete the role's wizard (documents, details).
*   **Then**: The account holds the operator role in `user_roles`; on next login the login-as chooser offers the operator surface; the wizard's pending/active status behaves as today.

### CUJ 3: Multi-role account login

*   **Given**: One phone number holding both a user role and an operator role.
*   **When**: The user logs in on the user login screen.
*   **Then**: Post-login routing shows the login-as chooser (unchanged model); selecting the user role lands on the services hub; selecting the operator role lands on the operator surface.

### CUJ 4: Ride re-enable (admin acceptance)

*   **Given**: Node launch state (`ride_vertical_enabled = false`), an admin with `PATCH /api/admin/config` access.
*   **When**: The admin sets `ride_vertical_enabled = true` and users cold-start the app.
*   **Then**: Ride tiles, ride landing, hamburger ride entries, and driver routing return; payment deep-links (`node://payment/…`) resolve correctly; no app update or store submission is involved. Flipping back to `false` restores the Node launch state. This journey is the acceptance proof for G3.

### CUJ 5: Ambulance emergency without ride

*   **Given**: A user on the services hub with no ride screens reachable.
*   **When**: The user taps Ambulance and submits an emergency request.
*   **Then**: Location permission is requested (or confirmed) on the visible ambulance flow; the request reaches the fleet broadcast lane (`/api/emergency/requests`); no hidden ride screen is touched at any point.

## Technical Plan (Architecture)

### 1. Shape of the change

Four components, all frontend/config work except one small additive API surface. No schema changes: `platform_config`, `user_roles`, and the role wizards already exist. No ride code is modified except being gated.

```text
                        ┌────────────────────────────────────────────┐
                        │ platform_config (DB, read fresh per request)│
                        │ key: ride_vertical_enabled (bool)          │
                        └───────────────┬────────────────────────────┘
                                        │
              ┌─────────────────────────┼──────────────────────────┐
              │ NEW [public] GET        │  EXISTING POST            │
              │ /api/app-config         │  /api/auth/verify-token   │
              │ → { flags: {...} }      │  → + flags: {...}         │
              └────────────┬────────────┴──────────────┬────────────┘
                           │                           │
                 unauthenticated boot          authenticated boot
                 (splash hold, no session)     (splash auth gate)
                           │                           │
                           └────────────┬──────────────┘
                                        ▼
                        Client flag resolver (per cold boot)
                        fail-closed: read failure ⇒ ride HIDDEN
                                        │
        ┌───────────────┬───────────────┼────────────────┬─────────────────┐
        ▼               ▼               ▼                ▼                 ▼
  services-hub     (customer)/      login-as        hamburger        deep links
  ride tile        index.tsx        ROLE_HOME       items +          (notificationRouter)
  block gated      redirect         re-points       driver rows      guarded to hub
```

### 2. Component A — the ride-hide flag

**Mechanism (per D-7).** One `platform_config` boolean, `ride_vertical_enabled`. Server-side:

*   `platform_config` is never cached (existing rule); the value is read fresh on each serving request.
*   **New route** `GET /api/app-config`, marked `// [public]`, returning exactly `{ flags: { ride_vertical_enabled: boolean } }`. This is the read path for unauthenticated screens (the login screen is the first screen; no session exists yet).
*   **Additive field** on the existing `POST /api/auth/verify-token` response: `flags: { ride_vertical_enabled: boolean }`, consumed by the splash auth gate (the authenticated boot path). Backward compatible: existing consumers ignore the field.
*   **Admin write path prerequisite:** `PATCH /api/admin/config` enforces a hard `ALLOWED_KEYS` allowlist and key-level RBAC including `OWNER_ONLY_CONFIG_KEYS` (`app/api/admin/config+api.ts`, `lib/adminRbac.ts`) — verified against the route source. Stage 1 adds `ride_vertical_enabled` to both sets (see Detailed Implementation T1).
*   **No server-side enforcement** on ride APIs. Per the owner's design ("everything in the system … simply hiding in the front end"), `POST /api/ride` and the dispatch lane stay live but unreachable from any visible surface. Consequence, stated deliberately: a client modified outside the store build could still call ride APIs; the hide is a product-surface decision, not an access-control boundary. Adding server-side rejection later is additive if the owner changes that stance.

**Client resolver.** One module (e.g. `lib/verticalFlags.ts`) reads the flag once per cold boot and caches it for the session. Both reads fire inside the splash boot sequence (`app/index.tsx`): authenticated boots consume the verify-token `flags` field; unauthenticated boots fire `GET /api/app-config` in parallel during the splash hold — so the flag is resolved in memory before the login screen renders (no post-mount fetch wait or flicker on auth screens). **Fail-closed**: fetch failure, timeout, or unconfigured environment ⇒ `ride_vertical_enabled = false` (ride hidden). The fail-closed constant is a single unchanging client behavior across all stages — there is no stage-conditional fallback. Staging keeps ride visible until the flip by seeding `platform_config.ride_vertical_enabled = true` as a mandatory part of stage 1 (extend the existing platform-config seed script; the dev and CI databases receive the row), so a transient fetch failure during stages 1–5 cannot silently hide ride and break the ride-flow lane. Stage 6 sets the row to `false` in staging, then production.

**Hide scope — surface inventory** (the definition of "ride hidden"; every row must be implemented):

| # | Surface | Disposition | Source ruling |
|---|---------|-------------|---------------|
| 1 | `services-hub.tsx` "What service do you need?" heading + `VEHICLE_CATEGORIES` tiles (~123–179, gated together so no orphaned heading remains) | render-gated by flag | D-1 |
| 2 | `app/(main)/(customer)/index.tsx` redirect | re-pointed to services-hub when flag off (flag on keeps the legacy `(tabs)/home` route) | D-1 |
| 3 | `login-as.tsx` `ROLE_HOME.rider` | re-pointed to services-hub when flag off | D-1 |
| 4 | `login-as.tsx` fleet-resolve fallbacks (2 sites) | re-pointed to services-hub when flag off | D-1 |
| 5 | Splash rider branch (`app/index.tsx:156`) | unchanged (already services-hub) | D-1 |
| 6 | `login-as.tsx` `ROLE_HOME.driver` | re-pointed to services-hub when flag off | D-5 |
| 7 | Splash driver branch (`app/index.tsx:147`) | re-pointed to services-hub when flag off | D-5 |
| 8 | Root gate driver route (`app/_layout.tsx:172-173`) | re-pointed to services-hub when flag off | D-5 |
| 9 | `login-as.tsx` driver chooser row | content/affordance gated; wrapper + testID preserved | D-5, D-6 |
| 10 | Hamburger items "Home", "Book Ride", "Schedule Ride", "My Rides" (`GlobalActionButtons.tsx`) | gated by flag | review Blocker 4 |
| 11 | Driver-role hamburger ride items | gated by flag | review Blocker 4 |
| 12 | Driver registration entry (role pill on `phone-entry`, dropdown exclusion) | driver excluded from operator dropdown at launch; pill wrapper preserved for flows | driver onboarding hidden |
| 13 | Rebook actions on history cards | gated by flag | review Blocker 4 |
| 14 | Per-ride chat / ride-detail entry points | gated by flag | review Blocker 4 |
| 15 | `lib/notificationRouter.ts` ride deep-links (`node://…` after rename) | route-guarded: land on services-hub when flag off | review Blocker 4 |
| 16 | `ensureRiderSocket()` open on services-hub mount | gated by flag (no rider WS session in hidden state) | review (codebase B-4) |
| 17 | Ride runtime Maestro flows | kept; run against flag-on builds (D-6) | D-6 |
| 18 | Admin ride screens | unchanged | D-4 |
| 19 | Location permission + SOS ownership | moved to surviving surfaces: the hub requests permission AND reverse-geocodes to hydrate `userAddress` in the customer store (today populated only by the hidden ride home); ambulance/parcel ensure-before-use | G6 |
| 20 | `(tabs)/rides/index.tsx` (activity screen incl. in-screen chips ~673–687) | gated by flag AND mount-guarded via the central `(main)` guard — order and parcel history live in their own vertical screens (shop orders, parcels list), not this ride-flavored route | D-1, D-9 |
| 21 | `(tabs)/chat/index.tsx` (per-ride chat list) | gated by flag AND mount-guarded via the central `(main)` guard — order chat uses the vertical order screens | D-1, D-9 |
| 22 | Mount safety: every `(main)` route (incl. `(tabs)/home`, the whole `(main)/(rider)` group) | central guard: `components/RideSurfaceGuard.tsx` mounted once in `app/(main)/_layout.tsx` — when the flag is off, any ride/driver route redirects to services-hub regardless of how it was pushed | review finding 6 |
| 23 | Standalone per-ride flow screens outside `(tabs)` (`chat/[rideId].tsx`, `ride-detail/[ride_id].tsx`, `ride-tracking/[ride_id].tsx`, `ride-details-scheduled/[id]/index.tsx`, `ride-scheduled/index.tsx`, `schedule-ride/index.tsx`, `finding-driver/index.tsx`, `no-drivers-available/index.tsx`, `user-arrived/index.tsx`, `rate-driver/index.tsx`, `driver-info/index.tsx`, `add-tip/index.tsx`, `fare-dispute/index.tsx`, `cancel-reason/index.tsx`, `canceled/index.tsx`, `report-issue/index.tsx`) | mount-guarded via the central `(main)` guard; the ride-route set is one maintained constant; full file set verified against the nav-integrity RESOLVED list at implementation | D-9, review finding 6 |

**Belt-and-braces mount guards.** The entry-point re-points (inventory #2–#8, #15) close catalogued routes; the central mount guard (#20–#23) guarantees zero ride or driver screens can mount through uncatalogued paths — back navigation, stale links, future code. The guard mounts ONCE in `app/(main)/_layout.tsx` (which already wraps every `(main)` route to render `GlobalActionButtons`) and matches the current segments/pathname against a maintained ride-route set when the flag is off — ride screen files themselves stay untouched on disk. Because `(main)/(rider)` never mounts while the flag is off, driver-framed hamburger items (segment detection in `GlobalActionButtons.tsx:43–45`) cannot be exposed by accidental navigation.

**Dormant-mode contract.** The flag is the single source of truth for ride visibility. New Node surfaces must not import ride screens. Ride code keeps compiling and keeps passing all gates (hide, never delete). The flag is owned by admin config (`PATCH /api/admin/config`); only the owner flips it (T1). Any new ride route (re-enable work) must be registered in the central guard's ride-route set.

**Re-enable acceptance (G3).** A recorded test: flip `ride_vertical_enabled` → cold start → ride tiles, ride landing, hamburger entries, and driver routing return; `node://payment/…` deep-links resolve; flip back → Node launch state. No store submission at any point.

### 3. Component B — Node identity (constants sweep, one atomic change)

The rename is constants plus assets. It is the **only irreversible step** — it must be final and device-verified before G5 (first store submission). Atomic same-commit list:

*   `app.config.js`: `name` → "Node"; `slug` → `node-bd`; `scheme` → `node`; iOS `bundleIdentifier` + Android `package` → `com.node.bd`; `expo-router` origin → Node-branded URL; splash/adaptive/notification/favicon slots + both background hex values (from `docs/Image/node_brand_colors.txt`); expo-location permission strings ("Allow Node to access…").
*   Assets: move the prepared files from `docs/Image/` into `assets/` (they are not bundled from `docs/Image/`); produce a favicon for the web slot (missing today); dedupe the stray `android_adaptive_foreground_432 (1).png`; map every `app.config.js` brand slot to one Node file (the mapping table ships in Detailed Implementation).
*   Scheme consumers, changed together: `components/PaymentResultScreen.tsx` (`APP_SCHEME = "node://"`), `lib/notificationRouter.ts` scheme patterns, Maestro shared boot subflow (`node://expo-development-client/…`), `TEST-SETUP.md` references.
*   Maestro `appId` sweep: every `maestro/flows/**` `appId: com.ride.bd` → `com.node.bd` (no CI gate covers `appId` — the same-commit rule is the only guard), plus one device smoke flow after the rename.
*   **Operational consequence:** the scheme and bundle-ID rename invalidate every existing development build — a fresh native build (`npx expo run:android`) is required on all test devices before any flow can run. The device QA lane is down between this stage and that rebuild; the schedule must absorb it.
*   Palette: `theme/goRide.ts` **and** `tailwind.config.js` (second hard-coded copy) move to the Node palette together.
*   Brand copy: the discriminated sweep (see Component D) lands in the same commit group.
*   **Permission disclosures rewritten to launch semantics (Play policy):** `app.config.js` expo-location strings and the `common.json` location bodies (~:183–185, e.g. "Ride Driver collects location data … while driving") are rewritten around delivery partners, ambulance dispatch, and live order/parcel tracking — not passenger driving. With driver flows hidden at launch, driver-framed disclosures are both a Google Play policy-rejection risk and a Copy Truth violation. Both locales; parity and braces gates. The re-enable acceptance (CUJ 4) adds a disclosure re-audit step so re-introducing ride re-reviews these strings.

### 4. Component C — auth re-organization (over the existing chain)

The owner's screen spec, mapped onto existing infrastructure (D-3, review consensus):

```text
Cold start (no session)  →  USER LOGIN SCREEN (first screen; Node branding)
      │                        │ "Register" link        │ bottom: "Login as Operator"
      │                        ▼                        ▼
      │                 USER REGISTRATION        OPERATOR LOGIN SCREEN
      │                 (customer profile)       (thin wrapper over the shared
      │                        │ bottom:          phone-entry flow, mode="operator")
      │                        │ "Register as Operator"
      │                        ▼
      │                 OPERATOR REGISTRATION SCREEN
      │                 dropdown "Register as …"
      │                   ├─ visitor (no session) → PHONE → OTP with the role
      │                   │    param (role rides through otp-verify into
      │                   │    register.tsx, which branches to the wizard —
      │                   │    OTP verification always precedes the wizard)
      │                   └─ authenticated user adding a role → direct to wizard
      │                        ├─ Shop owner   → register-shop-owner wizard
      │                        ├─ Fleet owner  → register-fleet-owner wizard
      │                        └─ Delivery man → register-delivery-man wizard
      ▼
Authenticated boot → verify-token → role routing (splash / login-as chooser)
      → user → services-hub (D-1) · operator → operator surface · driver (flag off) → services-hub (D-5)
```

*   **Screen topology (Q3 resolved):** per the owner's spec the operator login is a **separate screen** (new file `app/(auth)/operator-login.tsx`) implemented as a **thin route wrapper** that renders the shared `phone-entry` flow with `mode="operator"` — no duplicated state machine, no duplicated testIDs. **Cross-mode login behavior:** a multi-role account on either login screen routes to the login-as chooser (unchanged); a single-role account on the "wrong" screen (operator-only on User Login, or user-only on Operator Login) still routes to its valid role home through the existing gate — no dead end; Operator Login offers the operator registration path to visitors without an operator role. The user login screen is a re-skin of the existing entry chain; `welcome.tsx` and `walkthrough-1..3` are **removed from the default flow** (Q4 resolved by the owner's "First screen: Login" ruling) — their files stay (hide-never-delete) but nothing routes to them; their ride-era copy is superseded by the login screen's Node copy.
*   **Operator registration funnel (codebase fact):** in the existing chain, role selection precedes OTP — the `phone-entry` role param rides through `otp-verify.tsx:148` into `register.tsx:77–81`, which branches to the per-role wizards. The dropdown therefore routes its selection into that chain with `role={selectedRole}`; an unauthenticated visitor never enters a wizard directly. Only an already-authenticated user adding a role goes straight to the wizard.
*   **Five-role pills on `phone-entry.tsx`:** relocated into the operator dropdown's role list; the pill wrappers/testIDs are preserved (flows select them; D-6). The dropdown's launch population is exactly three roles — shop owner, fleet owner, delivery man (driver hidden; shop staff has no self-registration wizard).
*   **Single role→wizard registry:** the dropdown consumes the existing `RESUBMIT_WIZARD` map (`login-as.tsx`), promoted to a shared lib. No second registry.
*   **Post-login role graph (per account shape):** single-role user → services-hub; single-role operator → its surface (splash if/else + login-as); multi-role → login-as chooser (unchanged); admin → web panel only (out of the mobile flow, unchanged). One pre-existing asymmetry is fixed while these branches are being re-pointed: a single-role `fleet_owner` hitting the splash `else` branch lands on services-hub today, while `login-as` gives them the fleet dashboard — the splash branch is aligned to the fleet dashboard.
*   **Role labels and vocabulary (D-3 — owner-supplied strings, 2026-11-11):** the DB role stays `rider` (no migration); user-visible labels adopt the vocabulary below. Final copy, subject to an on-device rendering check (font/metrics) at implementation.
    *   User role: EN `User` / BN `গ্রাহক` (the chooser's "Rider" row renders as this).
    *   Operator group: EN `Operator` / BN `সেবাদাতা / পার্টনার`.
    *   Auth links: EN `Login as Operator` / `Register as Operator`; BN `সেবাদাতা (পার্টনার) হিসেবে লগইন করুন` / `সেবাদাতা (পার্টনার) হিসেবে রেজিস্ট্রেশন করুন`.
    *   One-account explainer (user login + registration screens): EN `One phone number works for both User and Operator accounts.` / BN `একটি মোবাইল নম্বর দিয়েই গ্রাহক ও সেবাদাতা—উভয় অ্যাকাউন্ট ব্যবহার করা যাবে।`
*   Gate consequences of this component: testID map regen + flow updates + locale keys + i18n baseline edits land in the same commit (D-6 rule).
*   **Role-label copy is flow-guarded:** before the `auth.roles.rider` label change lands, `maestro/flows/**` is audited for "Rider" assertions; matching flow assertions update in the same stage-4 commit (the label change is visible on flag-off builds, so this is launch-blocking, not flag-on-only).

### 5. Component D — services hub as home; copy discipline; location/SOS

*   **Hub (D-1):** all entry paths converge on `services-hub`; the ride tile block is gated (inventory #1); the surviving grid is the product. No new home screen.
*   **Location/SOS (G6):** the hub owns the location-permission request (it already displays the user address); ambulance and parcel screens call an ensure-before-use helper so no location-essential flow passes through a hidden screen; SOS (`GlobalActionButtons`) is ride-independent (verified) and stays global.
*   **Copy discipline (G7):** brand-vs-vertical discrimination — ~10 brand occurrences change ("Ride" app name, taglines, OS-permission bodies, SMS body, splash/welcome/login hard-coded literals), all ride-vertical strings ("Ride Completed", "Ride Pass", …) survive untouched for re-enable; en and bn both pass the braces/parity/orphan gates; hard-coded brand literals are routed through `t()` keys where the LOCALE-ONLY ratchet demands it.
*   **Rider socket (inventory #16):** `ensureRiderSocket()` is not opened when the flag is off.

### 6. Non-functional: rollout and rollback

*   **Rollout (6 stages, each commit green):** (1) flag plumbing — additive, flag defaults visible; (2) identity + assets + palette + brand copy (atomic); (3) hide component behind flag, default visible; (4) auth re-organization; (5) driver-surface gating; (6) flip `ride_vertical_enabled` to false in staging, verify the Node launch state AND the flip-back re-enable (CUJ 4), then flip in production.
*   **Auth-flow Maestro suites are launch-blocking:** the auth re-organization (welcome removal, new first screen) changes flows that run on EVERY build — login and registration suites must be updated in the same commit as stage 4 and verified on the flag-off build. Only the ride flow suites run against flag-on builds (D-6); the distinction is enforced in the Detailed Implementation's test plan.
*   **Rollback:** stages 1–5 are individual revertible commits; stage 6 rolls back with an admin config flip. The identity rename (stage 2) is the only irreversible step and is gated behind device verification before G5.

## Detailed Implementation

No new dependencies; no schema changes; no code in this section by convention (shapes only). Every stage lands with: `npm run lint` → `npx tsc --noEmit` → targeted jest → `node maestro/tools/testid-manifest.cjs` (regenerated and staged whenever `app/` changes) → the relevant pre-commit stages green. Full jest suite at the phase gate (end of stage 5).

### T1 — Admin config writer (verification result — resolves the Component A prerequisite)

`PATCH /api/admin/config` (`app/api/admin/config+api.ts`) enforces a Zod body schema, a hard `ALLOWED_KEYS` allowlist, and key-level RBAC via `lib/adminRbac.ts` (`requireAdminPermission`, `OWNER_ONLY_CONFIG_KEYS`, guardrail checks). Implementation: add `ride_vertical_enabled` to `ALLOWED_KEYS` **and** to `OWNER_ONLY_CONFIG_KEYS` (vertical visibility is an owner-level product switch; the owner can downgrade the tier later without schema impact). Without this change the flag cannot be flipped and stage 6 is impossible.

### T2 — Asset slot mapping and palette (stage 2)

| `app.config.js` slot | Current value | Node source (`docs/Image/`) | Destination (`assets/`) | Note |
|---|---|---|---|---|
| `expo.icon` | `./assets/logo/logo.png` | `node_app_icon_1024.png` | `assets/logo/node_icon_1024.png` | direct move |
| `android.adaptiveIcon.foregroundImage` | `./assets/logo/logo.png` | `android_adaptive_foreground_432.png` | `assets/images/node_adaptive_foreground.png` | dedupe the stray `(1)` copy (delete it) |
| `android.adaptiveIcon.backgroundColor` | `#ffffff` | — | — | set to Warm white `#F8FBFF` |
| `expo.splash.image` | `./assets/splash/Splash_Screen_2.png` | `node_splash_android_1080x2400.png` | `assets/splash/node_splash.png` | `resizeMode: contain` serves both platforms |
| `expo.splash.backgroundColor` | `#181A20` | — | — | set to Primary navy `#102A66` |
| `expo-notifications.icon` | `./assets/images/notification_icon.png` | **MISSING** — derive a monochrome/white mark from `node_logo.svg` | `assets/images/node_notification_icon.png` | the only asset requiring generation |
| `web.favicon` | `./assets/images/favicon.png` | derive (resize) from `node_app_icon_1024.png` | `assets/images/favicon.png` (replace in place) | generation step, keep the path |
| `expo-location.locationAlwaysAndWhenInUsePermission` | "Allow Ride … while driving." | — | in-file string | delivery/ambulance/tracking framing (Play policy) |
| `expo-router.origin` | `https://ride.expo.app` | — | Node-branded origin | in-file string |

`node_splash_animated_720x1600.gif` is not used by the Expo splash slot (no animation support); the in-app `SplashAnimation` component keeps its text lockup. The GIF stays unused in `docs/Image/` — revisit only if the owner wants an animated in-app splash later.

**Palette (from `node_brand_colors.txt`)** — applied to `theme/goRide.ts` **and** `tailwind.config.js` (the second hard-coded copy) in the same commit: Primary navy `#102A66` (brand primary — maps to the green `primary` token), Cobalt `#0879F9` (maps to `blue`/accent), Cyan `#00C6C8`, Violet `#6138E8`, Magenta `#C52DEB`, Orange `#FF8A20` (maps to `amber`), Green `#31B06A→#31B86A` family (semantic success), Warm white `#F8FBFF` (light backgrounds). Verification: a grep for the old primary hex (`#0CC25F`) and its rgba glow across `theme/` + `tailwind.config.js` returns zero hits after the swap.

### T3 — Brand-vs-vertical copy inventory (stage 2 + stage 4)

**CHANGE — brand strings (en keys; bn mirrors by key; ~10 keys):** `app.name` (:3), `tagline` (:144), `welcome_title` (:145), `marketing_opt_in` (:179), `location.foreground_body` (:183 — rewritten to delivery/ambulance/tracking framing), `location.background_body` (:185 — same), the request-data body key (~:1256) and delete-data body key (~:1276) mentioning "Ride" (exact key names confirmed by `rg -n 'Ride' i18n/locales/en/common.json` at edit time), `ride_fallback` (:1340 → "Node"), `log_out_a11y` (:1663). Plus stage 4: the `auth.roles.rider` label → `User`/`গ্রাহক`.

**KEEP — vertical strings (untouched, ~67 remaining matches):** `ride_history_placeholder` (:411), `ride_canceled_subtitle` (:930), `your_ride_pin` (:1037), `counterparty_rider_body` (:1210), `empty_sub` (:1630), and every other ride-vertical key — they must survive verbatim for re-enable.

**Hard-coded literals:** `app/index.tsx:200` splash tagline → new `t()` key (en+bn, Node copy); `app/(auth)/phone-entry.tsx:157` "Ride" wordmark → "Node" literal swap; `app/(auth)/login.tsx:77–84` header copy → stage 4 re-skin; `app/(main)/(customer)/emergency-sos/index.tsx:164` SMS body "via the Ride app" → "via the Node app" (pre-existing hard-coded literal, brand word swap only); `app/(auth)/welcome.tsx:45` and `app/(auth)/walkthrough-1.tsx:46` — **untouched** (dormant after stage 4; unrouted files are not user-visible surfaces).

**Verification:** `rg -c 'Ride'` on `en/common.json` goes 77 → ~67 with the delta exactly equal to the enumerated keys; same keys in `bn`; braces/parity/orphan gates green.

### Stage 1 — Flag plumbing (additive; flag defaults visible)

| File | Change | Rationale |
|---|---|---|
| `app/api/app-config+api.ts` | **CREATE** — `[public]` GET returning `{ flags: { ride_vertical_enabled } }`, read fresh via the platform-config helper; `// [public]` marker per convention | client read path for unauthenticated boots (D-7) |
| `app/api/auth/verify-token+api.ts` | **MODIFY** — add additive `flags` field to the response | authenticated boot read path |
| `lib/platformConfig.ts` | **MODIFY** — add a typed getter for the flag (fresh read, no cache) | single server read path; platform_config never-cached rule |
| `lib/verticalFlags.ts` | **CREATE** — client resolver: boot-time read, session cache, fail-closed constant | single client read path (Component A) |
| `app/index.tsx` | **MODIFY** — splash consumes verify-token flags; fires `GET /api/app-config` in parallel during the hold when no session | splash-timed resolution (owner carry-item) |
| `scripts/seed-platform-config.js` | **MODIFY** — seed `ride_vertical_enabled = true` | mandatory stage-1 seed; fail-closed safety without stage-conditional client behavior |
| `app/api/admin/config+api.ts` + `lib/adminRbac.ts` | **MODIFY** — allowlist + owner-only tier for the key (T1) | the flag must be flippable |
| `tests/meta/vertical-flags.test.ts` | **CREATE** — unit tests: resolver fail-closed on fetch failure/timeout/unconfigured env; app-config handler shape; verify-token field presence | repo testing protocol; pure tests in `tests/meta/` per the gated-concurrency placement rule |

### Stage 2 — Node identity (one atomic commit; irreversible after G5)

Files: `app.config.js` (identity strings, bundle IDs `com.node.bd`, scheme `node`, origin, permission strings, all asset paths + background hexes per T2); asset moves per T2 table (`assets/logo/node_icon_1024.png`, `assets/images/node_adaptive_foreground.png`, `assets/splash/node_splash.png`, `assets/images/node_notification_icon.png` (derived), `assets/images/favicon.png` (derived), delete `docs/Image/android_adaptive_foreground_432 (1).png`); `theme/goRide.ts` + `tailwind.config.js` (palette per T2); `components/PaymentResultScreen.tsx` (`APP_SCHEME = "node://"`); `lib/notificationRouter.ts` (`node://` patterns); `maestro/flows/shared/util/_dev-client-boot.yaml` (`node://` boot URL); every `maestro/flows/**` file (`appId: com.node.bd` sweep); `TEST-SETUP.md` (scheme references); locale brand keys per T3; hard-coded literals per T3 (splash tagline key, phone-entry wordmark, emergency-sos SMS body).

Rationale per file: identity is D-2; scheme consumers are the verified blast radius (B-5); the appId sweep has no CI gate — the same-commit rule is the only guard; locale + literal changes are the discriminated brand pass (T3).

Post-stage gates: testid-map regen (no selector changes expected), flow-xcheck green (any flow asserting a changed literal — e.g. "Welcome Back" — updated in-commit), braces gate, then **one fresh native build on a test device** (the rename invalidates all existing dev builds — scheduled QA gap) and a single flow smoke through the new boot URL.

### Stage 3 — Ride hide behind the flag (ships with flag = visible)

| File | Change | Inventory # |
|---|---|---|
| `app/(main)/(customer)/services-hub.tsx` | gate heading+tiles block; location helper (permission → reverse-geocode → `setUserAddress`) reusing the ride home's geocoding path; skip `ensureRiderSocket()` when hidden | #1, #16, #19 |
| `app/(main)/(customer)/index.tsx` | flag-conditional redirect: off → services-hub, on → legacy `(tabs)/home` (re-enable restores the old IA) | #2 |
| `app/(auth)/login-as.tsx` | `ROLE_HOME.rider` + the two fleet-resolve fallbacks: flag-conditional → services-hub | #3, #4 |
| `components/GlobalActionButtons.tsx` | gate Home / Book Ride / Schedule Ride / My Rides items and driver ride items by flag | #10, #11 |
| `app/(main)/_layout.tsx` + `components/RideSurfaceGuard.tsx` | **CREATE** the guard component; mount it ONCE in `(main)/_layout` (which already wraps every `(main)` route): flag off + current route in the ride-route set (`(tabs)/home`, `(tabs)/rides`, `(tabs)/chat`, `schedule-ride`, all standalone per-ride screens, the whole `(main)/(rider)` group) → redirect to services-hub. Zero edits inside ride screen files. | #13, #14, #20, #21, #22, #23 |
| `lib/notificationRouter.ts` | ride deep-link targets → services-hub when flag off | #15 |

Every re-point is flag-conditional (flag on ⇒ original behavior), which is what makes CUJ 4 (re-enable) work without further code. Runtime behavior is unchanged until the flip; ride device flows stay valid; static gates stay green (conditional rendering preserves selectors — testid-map regenerated and staged).

### Stage 4 — Auth re-organization (largest flow blast radius; one commit)

| File | Change | Rationale |
|---|---|---|
| `app/(auth)/phone-entry.tsx` | user-first re-skin: role pills render ONLY when the flag is on (driver flows stay valid on flag-on builds; D-6); permanent bottom "Login as Operator" link (both flag states — CUJ 4 re-enable must not remove the operator path); register link | G4 + pill preservation |
| `app/(auth)/operator-login.tsx` | **CREATE** — thin wrapper, `mode="operator"`, cross-mode behavior per Technical Plan §4 | owner spec: separate screen, no duplicated state machine/testIDs |
| `app/(auth)/register.tsx` | bottom "Register as Operator" path; wizard branch untouched | owner spec 3c |
| `app/(auth)/operator-register.tsx` | **CREATE** — dropdown (Shop owner / Fleet owner / Delivery man); visitor → `phone-entry` with `role` param (OTP first); authenticated → direct to wizard | funnel fix (review round 1) |
| `lib/roleWizards.ts` | **CREATE** — shared role→wizard registry (promoted from `login-as.tsx` `RESUBMIT_WIZARD`) | single source of truth; no second registry |
| `app/(auth)/login-as.tsx` | consume the shared registry; role labels via new i18n keys (`User`/`গ্রাহক`); one-account explainer line | G4, D-3/D-10 |
| `app/(auth)/login.tsx` | password-leg re-skin: Node copy + operator link placement | operator affordance on BOTH login paths |
| `app/index.tsx` | splash: no-session → `phone-entry` (user login) instead of `welcome` (welcome/walkthroughs unrouted — files unchanged); single-role `fleet_owner` splash branch → fleet dashboard (asymmetry fix) | owner "First screen: Login" ruling |
| `i18n/locales/{en,bn}/common.json` | new keys: operator links, one-account explainer, role labels — verbatim D-10 strings | G7, D-10 |
| `maestro/flows/**` auth suites | update flows asserting welcome or "Rider" chips ("Welcome Back" in `rider-login-only.yaml:22`, role-chip selectors); flow-locale-baseline.json may only shrink; `scripts/purge-orphan-keys.cjs --new` for any newly orphaned keys (none expected — unrouted files keep `t()` references live) | launch-blocking auth flows; D-6 same-commit rule |
| `maestro/tools/testid-map.json` | regenerated + staged | map freshness gate |

`app/(auth)/welcome.tsx` and `walkthrough-1..3.tsx`: **no file changes** — unrouted, dormant, keys stay referenced (hide-never-delete).

### Stage 5 — Driver-surface gating

| File | Change | Inventory # |
|---|---|---|
| `app/index.tsx` | splash driver branch → services-hub when flag off | #7 |
| `app/_layout.tsx` | root-gate driver route → services-hub when flag off | #8 |
| `app/(auth)/login-as.tsx` | `ROLE_HOME.driver` flag-conditional; driver chooser row content/affordance gated (wrapper + testID preserved) | #6, #9 |

### Stage 6 — Flip and acceptance

1. Staging: flip `ride_vertical_enabled` to `false` via `PATCH /api/admin/config` (exercises T1 end-to-end). Device-verify CUJ 1, 2, 3, 5 on the flag-off build (Node first screen, hub home, no ride surfaces reachable — including back-navigation into `(tabs)/home` and a ride deep-link push).
2. Flip back to `true`; device-verify CUJ 4 (re-enable: tiles, landings, hamburger entries, driver routing return; `node://payment/…` deep-links resolve). **Record this as the G3 acceptance proof.** Includes the permission-disclosure re-audit step.
3. Production: flip to `false` (the launch state). Rollback = flip to `true`.
4. Full jest suite + complete pre-commit harness replay at this phase gate; device verification recorded per the repo's verification rule (state explicitly if execbro/device is unavailable).

### Files explicitly NOT changed

`welcome.tsx`, `walkthrough-1..3.tsx` (dormant, unrouted, strings intact); all ride screens — genuinely untouched on disk (Stage 3's guarding is centralized in `app/(main)/_layout.tsx`; zero edits inside ride screen files); `utils-server/**`, `src/db/schema.ts`, driver monetization libs (dormant); `package.json` (no dependency changes); admin ride screens (D-4).

## Alternatives Considered

### Alternative A: Build-time `EXPO_PUBLIC_*` hide flag

*   **Pros**: Zero server work; the flag ships inside the bundle; no new endpoint or boot-fetch sequencing.
*   **Cons**: The value is inlined at bundle time — changing it requires a new client build and a store submission; `expo-updates` is currently disabled, so there is not even an OTA path; violates the locked "re-enable without a store update" ruling (D-7).
*   **Reason for Rejection**: Cannot satisfy the core requirement. Listed in the brainstorm only as a now-struck option.

### Alternative B: OTA updates (expo-updates) as the re-enable path

*   **Pros**: A re-enable could ship as an OTA bundle without a store review.
*   **Cons**: Requires re-enabling the currently disabled `expo-updates` module first (the dev client predates the native-module bump that crashes the bundle at eval time); OTA bundles still gate on bundle-time flags, so this is a build-pipeline answer, not a config answer; adds a second re-enable mechanism to maintain.
*   **Reason for Rejection**: Deferred, not selected — the runtime `platform_config` flag is simpler and satisfies the ruling directly. Revisit only if OTA is turned on for unrelated reasons.

### Alternative C: Separate registration per profile (two phone numbers)

*   **Pros**: Simplest possible mental model — one account type per screen; no role chooser anywhere.
*   **Cons**: Two Supabase identities, two OTP verifications, two wallets per person; abandons the already-built and already-audited multi-role stack (`user_roles`, `login-as` chooser, `GET /api/user/roles` routing, D-3 check-user hardening).
*   **Reason for Rejection**: Owner ruling at brainstorm — one account, multiple roles, "login as" surfaces. The proposal was withdrawn by the owner.

### Alternative D: Brand-new auth screens for user/operator login and registration

*   **Pros**: Complete freedom over the first-screen design; no legacy constraints.
*   **Cons**: Duplicates the phone-OTP/password state machine and its testIDs (breaking the map/flow contract); a second role→wizard registry would drift from `RESUBMIT_WIZARD`; much larger flow-update blast radius.
*   **Reason for Rejection**: Review consensus — the user login is a re-skin of the existing entry chain, the operator login is a thin `mode="operator"` wrapper, and the dropdown consumes the single promoted registry.

### Alternative E: Bespoke "neutral surface" screen for hidden-role drivers

*   **Pros**: A dedicated landing could explain the driver situation and offer re-onboarding affordances.
*   **Cons**: The driver population at launch is zero (never published); a custom screen is dead code from day one; it adds a route that the nav-integrity audit and flows must then maintain.
*   **Reason for Rejection**: Flag-conditional re-pointing of the three existing driver routing branches (`app/index.tsx`, `app/_layout.tsx`, `login-as.tsx`), chooser-row gating, and the `(main)/(rider)` mount guard achieve the requirement; build the bespoke screen only if ride re-enables with a real driver population.

### Alternative F: Blanket "Ride" → "Node" find-replace across locales

*   **Pros**: One mechanical sweep; trivially complete coverage.
*   **Cons**: Corrupts the dormant ride-vertical copy ("Ride Completed", "Ride Pass", …) that must survive verbatim for re-enable; violates the Copy Truth Rule in the other direction; would break ~67 legitimate strings to fix ~10.
*   **Reason for Rejection**: The brand-vs-vertical discrimination pass (T3) is required; a grep-delta verification (77 → ~67 matches, enumerated keys only) is the acceptance check.

### Alternative G: Per-vertical flag registry / generic "vertical visibility" abstraction

*   **Pros**: Future verticals could be toggled without code; a registry reads cleanly in the abstract.
*   **Cons**: Exactly one hidden vertical and one brand exist; a registry, per-vertical config objects, and a brand-config layer are speculative machinery (YAGNI) that the dormant-mode contract would then have to maintain forever.
*   **Reason for Rejection**: One boolean on `platform_config`, consumed at the enumerated sites. If a second vertical ever needs hiding, generalizing then is cheap; generalizing now is not.

### Alternative H: Delete ride screens and restore them from git on re-enable

*   **Pros**: The shipped bundle is genuinely ride-free; no gating logic anywhere; smallest possible attack/review surface.
*   **Cons**: Deletion cascades through the testID map, i18n orphan ratchet, Maestro flow corpus, and nav audit — every gate the repo relies on would need a mass update, and re-enable becomes a large restoration project with unquantified drift risk against two years of intervening changes.
*   **Reason for Rejection**: Hide-not-delete is the only gate-safe path, and the ruling requires re-enable to be a config flip, not a restoration project.

### Alternative I: Server-side enforcement on ride APIs (`POST /api/ride` rejects while the flag is off)

*   **Pros**: Blocks modified or out-of-store clients from calling ride endpoints while hidden; turns the hide into a true access boundary rather than a surface decision.
*   **Cons**: Adds a per-request config check to every ride route and the dispatch lane; complicates the backend and dispatch test suites; zero production drivers exist at launch, so there is nothing to protect; Component A already documents the hide as a product-surface decision, not an access-control boundary.
*   **Reason for Rejection**: Frontend-only hiding satisfies the owner ruling ("everything in the system … simply hiding in the front end"); server-side rejection remains a cheap additive change later if the owner ever wants the stronger boundary.

## Non-Functional Requirements

*   **Security & Privacy:** the only new attack surface is `GET /api/app-config` — `[public]`, no parameters, returns one boolean, no user data; it follows the existing `[public]` route conventions. The hide is a product-surface decision, not an access-control boundary (documented in Component A; server-side rejection remains available as Alternative I if the owner later wants the stronger boundary). No secrets are touched: every identity/brand change is a client constant or in-file string.
*   **Rollout & Rollback:** six individually revertible commits; stage 6 rollback is an admin config flip; the identity rename (stage 2) is the only irreversible step and is device-verified before store submission (Technical Plan §6).
*   **Observability:** no new telemetry is required for the launch state; every flag flip is recorded through the existing `configAuditLog` written by `PATCH /api/admin/config`.
*   **Maintenance (dormant mode):** ride code keeps compiling under all repo gates; new Node surfaces must not import ride surfaces; re-enable requires only the config flip plus the CUJ 4 disclosure re-audit.
