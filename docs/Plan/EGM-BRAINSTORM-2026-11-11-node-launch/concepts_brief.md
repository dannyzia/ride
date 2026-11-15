**Purpose:**     EGM concepts brief — synthesized multi-lens review of the "Node" first-launch concept; the handoff artifact into /egm-draft.
**Owner:**       Elephant (EGM) — current until owner dispositions are recorded
**Status:**      ACTIVE (owner dispositions recorded — see owner_dispositions_2026-11-11.md; ready for handoff)
**Source of truth:** this file, for the reviewed concept state; docs/Plan/EGM-BRAINSTORM-2026-11-11-node-launch/feature_concept.md is the input concept; the six *_report.md files in this folder are the raw review records.
**Related (concrete paths):**
  - docs/Plan/EGM-BRAINSTORM-2026-11-11-node-launch/feature_concept.md — concept under review
  - docs/Plan/EGM-BRAINSTORM-2026-11-11-node-launch/{zoom_out,codebase_details,critic,comprehension,implementation_readiness,structural}_report.md — per-lens review records
  - AGENTS.md — project hard rules (§ Copy Truth Rule, § Critical Rules, § pre-commit gates)
**Last verified:** 2026-11-11 by Elephant (six independent Goldfish sessions; findings deduplicated here)
**How to update:** Re-run the review after owner dispositions change the concept; supersede this brief rather than editing findings in place.

---

# Node First Launch — Ride Hidden, User/Operator Split

* **Author:** Elephant (EGM), from six independent Goldfish reviews
* **Date:** 2026-11-11

## Overview

The app (built as "Ride", a ride-hailing product) should launch on the stores as **Node**, a multi-vertical platform, with the passenger ride-hailing vertical hidden in the frontend. Everything ride-related stays in the system — code, screens, dispatch server, monetization — dormant and re-enableable later without a store update. The auth flow is re-organized around a user/operator split (user = rider/buyer/service-taker; operator = driver, fleet owner, shop owner, delivery staff) while the existing one-account-multi-role architecture (one phone number, `user_roles`, the login-as chooser) is kept as built. Branding swaps to the Node assets already prepared in `docs/Image/`. The app has never been on any store track, so the rename is a first-release identity decision, not a migration.

## Analysis

The six reviews agree the concept is directionally sound: hide-never-delete is the only strategy that keeps the repo's gate set green, the existing multi-role auth architecture removes most of the proposed auth work, and no surviving vertical depends on the ride dispatch chain. But they also converge on a set of defects the concept must fix before a design draft can be written. Deduplicated, grouped by severity.

### Blockers

1. **No committed post-hide user landing.** The concept specifies what is removed but not what a new user sees on day 1. The services-hub heading "What service do you need?" sits directly above the ride tiles that get gated, and the tab route set (home/rides/chat/profile — the tab bar itself is already invisible, `tabBarStyle: display:none`) leaves two permanently empty ride tabs. "What replaces ride as the landing" is the core product decision of this concept, not a draft detail. Natural candidate: services-hub as the user landing, with a declared purpose per surviving tab (activity re-scoped to parcel/shop-order history or withheld; chat re-scoped or withheld). *(critic F1, comprehension F1)*

2. **Location permission and SOS are owned by the hidden surface.** The ride home is today the only customer surface that establishes location context (expo-location + SosBanner in `(tabs)/home`), yet parcel, shop delivery, and especially ambulance are location-essential. With ride hidden, no visible surface requests location before parcel creation, and an emergency-service product whose location capture lives on a hidden screen is a launch hazard. The concept must assign location-permission and SOS ownership per surviving vertical. *(critic F2)*

3. **Current-state facts are wrong at the load-bearing points.** The "verified facts" the hide work would be built on contain three material errors, all caught by independent verification: (a) the customer tab bar is already hidden and has no `activity`/`history-detail` tabs — the real tab routes are home/rides/chat/profile, so "tab-bar pass" is really a nav-route re-pointing; (b) the splash gate already lands single-role riders on services-hub (`app/index.tsx:156`) — the ride landing that remains is `(customer)/index.tsx` and the `login-as` rider row (+ two fallbacks), so "the customer landing is ride" is true for only two of three entry paths; (c) `ROLE_HOME` is a `login-as.tsx` table, not the splash gate's — the splash uses its own if/else chain, and the two disagree on the driver landing (`(rider)/d` vs `(rider)/home`), so the driver-hide ruling must be implemented in both, plus the fixed chooser rows. *(structural F1, codebase B-1/B-2/B-3, zoom-out F3)*

4. **The hide-scope surface inventory does not exist.** Ride stays reachable through entry points the concept never lists: the hamburger menu items "Home", "Book Ride", "Schedule Ride", "My Rides" (rendered on every `(main)` screen), the `(customer)/index.tsx` redirect, `login-as` ROLE_HOME + fallbacks, rebook actions on history cards, per-ride chat/detail screens, push deep-links via `lib/notificationRouter` (outside the nav audit's scan scope), and `ensureRiderSocket()` opened on the very landing that survives. Tile-level gating alone leaves ride one drag away. The brief must carry a per-surface inventory (surface → disposition → decided/open) as the definition of "ride hidden", and the flag must guard routes, not just tiles. *(structural F2, implementation-readiness F2, critic F6, codebase B-8)*

5. **The runtime flag has no client read path and no defined failure default.** `platform_config` is read server-side only; no `[public]` config endpoint exists. The build-time `EXPO_PUBLIC_*` option must be struck outright — it violates the locked "re-enable without a store update" ruling (expo-updates is disabled), so the server-side flag read through a small public endpoint is the only surviving mechanism. The draft must spec: the endpoint, boot-fetch sequencing in the splash, the offline/failure default (ride hidden — fail-closed), whether enforcement is also server-side, and route guarding. Minimal shape per the zoom-out lens: piggyback one boolean on the existing verify-token call plus one tiny public config GET — no feature-flag framework. *(implementation-readiness F1/F11, zoom-out F1, critic F9)*

6. **The auth surface split is undefined against the real chain.** The current chain is welcome → walkthroughs → phone-entry (which is BOTH login and registration, with a five-role pill selector) → login.tsx (password leg) | otp-verify → per-role wizards. The concept omits welcome, the walkthroughs, the password leg, and the role pills entirely. The draft must specify: the fate of welcome/walkthroughs (their ride copy is a Copy Truth blocker at first paint), where the "Login as Operator" button lives (both login paths, not one screen), what "operator login" does differently (same OTP flow — it is navigation labeling, not a new auth backend), and the operator registration funnel end-to-end (role pick → OTP → wizard → pending). The dropdown's launch population is exactly three roles — shop_owner, fleet_owner, delivery_man — because driver has no wizard (ruled hidden) and shop_staff has no self-registration screen at all. The role→wizard registry already exists (`RESUBMIT_WIZARD` in login-as.tsx) and must be reused as the single source of truth. *(implementation-readiness F3, critic F3/F4, comprehension F5/F7)*

7. **The bundle-ID rename silently breaks every Maestro flow.** Every flow hard-codes `appId: com.ride.bd`; the flow-xcheck gate validates selectors and copy but not `appId`, so CI stays green while every device flow dies at launchApp. The appId sweep across `maestro/flows/**` must land in the same commit as the identity change, plus one device smoke. *(implementation-readiness F4)*

8. **"Decoupled from ride dispatch" does not mean utils-server is idle.** The ride *chain* (dispatch_offers, call_ledger, lead billing, H3 ride pool) is dormant — verified. But the delivery dispatch tick that advances every parcel and shop leg runs INSIDE utils-server's scheduler, and every customer session still opens a rider WebSocket from services-hub. utils-server remains a required production service at launch; its health cannot be wound down. Decide whether the rider socket is gated behind the same hide flag. *(codebase B-4)*

### Major

9. **Scheme rename blast radius is wider than the config field.** Hard consumers: `PaymentResultScreen.tsx` (`APP_SCHEME = "ride://"` — a payment invariant surface), `lib/notificationRouter.ts` (parses `ride://` push links), the Maestro dev-client boot subflow (`ride://expo-development-client/…` — a scheme change breaks the whole QA lane's boot hop), and the Android manifest (native rebuild required). One atomic change + payment-return regression. After store submission the identity is frozen — it must be final before G5. *(implementation-readiness F5, codebase B-5)*

10. **The brand-copy sweep is a discrimination task, not find-replace.** 77 "Ride" matches in en/common.json — roughly 10 are brand strings (app name, tagline, OS-permission bodies) that must change; the rest are ride-vertical copy ("Ride Cancelled", "Ride Pass"…) that must SURVIVE for re-enable. Outside i18n, hard-coded brand strings sit on the first screens every user sees: the splash tagline (`app/index.tsx:200`), welcome subtitle, walkthrough copy, login header, phone-entry wordmark, an SOS SMS body, and the expo-location permission strings in app.config.js. `tailwind.config.js` carries a SECOND hard-coded palette copy that must move in lockstep with `theme/goRide.ts`. Brand-vs-vertical inventory first, en/bn parity throughout. *(implementation-readiness F6, codebase B-6, critic F7)*

11. **"Operator" vocabulary is untested in Bangla.** There is no common bn equivalent a first-time user maps to driver/shop-owner/delivery-man (local apps use সেবাদাতা / পার্টনার framing). With zero installed base, every user parses the split cold. Pin the en+bn strings for User/Operator and add a one-line "one account, multiple roles" explainer — this is a launch requirement, not a sweep footnote. *(critic F5)*

12. **One ruling violates its own locked contract.** Ruling 5 ("driver onboarding hidden — design default pending review") mixes locked and pending in the locked section, and its open core — the neutral surface for driver-role logins — is tracked nowhere. Split it: the hide is locked; the neutral landing target (candidate: services-hub behind the flag, two-line re-point per zoom-out F6, not a new screen) goes to Open Items. *(comprehension F4, structural F3)*

13. **Ruling-implied identity values are untracked.** The rename ruling decides the *kind* (new bundle ID, scheme, listing) but no section collects the *values* (e.g. `com.node.bd`, `node://`, Play listing name). Every ruling-implied parameter must have a resolved value or a named open item, or it falls through the concept→draft handoff. *(structural F4)*

14. **The dormant-mode contract and the re-enable proof are missing.** The codebase commits to a standing dormant-mode architecture (ride keeps compiling and consuming gate budget behind a flag) but the concept never states its maintenance rules (flag ownership, no new Node→ride imports, coverage policy) and never obliges a **"re-enable ride" acceptance scenario** — flag flip → ride surfaces return → payment deep-links intact → no store submission. That scenario is the proof of the whole "dormant, not deleted" ruling and must be a draft deliverable. *(structural F5/F6)*

15. **Gate-trip matrix and same-commit rule are unstated.** Every component touches `app/`; the testID map, flows, locales, and i18n baseline must land with each change. Conditional rendering keeps selectors static-green while killing runtime reachability — the ~30 ride runtime Maestro flows need a declared disposition (flag-on test builds, tagged skip, or retired from device runs). New redirect targets must exist before any redirect references them (nav-integrity gate). *(implementation-readiness F8)*

16. **Driver landing has three routing sites, and the login-as row treatment is undefined.** Splash branch, root gate, and `login-as.tsx` ROLE_HOME all route drivers independently (and disagree today); the six chooser rows render as static testID literals, so hiding driver must gate content/affordance, not delete wrappers. *(implementation-readiness F9, comprehension F6)*

17. **Survivor completeness is asserted, not demonstrated.** No first-time-user happy path (browse → order → track → complete) is proven end-to-end for any surviving vertical; empty states for zero-order activity/wallet are undesigned; shop-category tiles appear only if `shop_types` rows are seeded (an unstated ops prerequisite). A per-vertical launch-readiness checklist belongs in the draft. *(critic F10)*

18. **Admin ride-surface copy policy is an owner ruling, not a coding choice.** Admin stays live and staff-only; whether ride-admin screens get a "vertical disabled" banner or run untouched under the Copy Truth Rule needs one sentence from the owner. Default candidate (zoom-out F8): no gating, admin is staff-only. *(implementation-readiness F10)*

19. **Flag failure semantics.** A boot-time flag fetch that fails must default to ride-hidden (fail-closed) — fail-open would silently ship the ride-first product the owner is removing. State the default and the offline behavior explicitly. *(critic F9)*

### Nit

20. Asset inventory precision: the adaptive foreground file lacks the `node_` prefix and has a stray `(1)` duplicate; no Node favicon exists for the web slot; assets must move from `docs/Image/` into `assets/` to be bundled. *(structural F7, implementation-readiness F7)*
21. Naming drift ("services vertical page" vs "services hub") and the ROLE_HOME attribution slip — fix one name per surface. *(comprehension F10)*
22. Open-item hygiene: the copy sweep is settled work, not a decision — move it out of the decision list. *(structural F8)*
23. SOS open item likely dissolves to pure verification (the global SOS surface is ride-independent); reclassify rather than budget work. *(zoom-out F7)*

## Goals vs. Non-Goals

**In-Scope Goals:**
- First store release branded Node: fresh bundle ID, scheme, listing; Node assets wired (icons, splashes, colors in `theme/goRide.ts` + `tailwind.config.js`).
- Passenger ride-hailing hidden in the frontend behind a single runtime `platform_config` flag (admin-flippable, no store update to re-enable), with a complete per-surface hide inventory and route guarding.
- Auth re-organization over the existing architecture: user-first login with a bottom "Login as Operator" path, user-first registration with an operator role dropdown (3 roles at launch: shop_owner, fleet_owner, delivery_man) landing in the existing per-role wizards; the login-as chooser and `user_roles` model kept as built.
- Services hub without ride tiles; a committed post-hide user landing and surviving tab graph.
- Location-permission and SOS ownership assigned to surviving verticals.
- Brand-vs-vertical copy discrimination sweep (en+bn), with the Copy Truth Rule enforced on every visible string.
- A "re-enable ride" acceptance scenario (flag flip restores ride, no store submission).

**Out-of-Scope Non-Goals:**
- Deleting ride code, the dispatch server, or any data.
- Renaming the repository directory.
- Store submission mechanics beyond the identity decision (listing copy, screenshots).
- A feature-flag framework, per-vertical visibility registry, or runtime brand/theming abstraction.
- New operator registration wizards (the three existing wizards are the launch population).

## Alternatives Weighed

- **Build-time `EXPO_PUBLIC_*` hide flag** — rejected: cannot re-enable without a store release (expo-updates disabled), violates the locked ruling. Listed in the concept's Open Items only as a now-struck option.
- **OTA (expo-updates) as the re-enable path** — viable only after re-enabling the currently disabled updates module; deferred, not selected.
- **Separate registration per profile (two phone numbers)** — rejected by owner ruling; the one-account-multi-role model is kept.
- **New auth screens for user/operator login and registration** — rejected in review: re-skin `welcome.tsx`/`register.tsx`/`phone-entry` and reuse the `RESUBMIT_WIZARD` registry; the operator/user distinction at login is navigation labeling over one shared OTP flow.
- **Bespoke "neutral surface" for hidden-role drivers** — rejected: a two-line re-point of the existing splash/chooser branches to services-hub; a new screen for a population of zero is dead code.
- **Blanket "Ride" → "Node" find-replace** — rejected: it corrupts the dormant ride-vertical copy that must survive for re-enable; a brand-vs-vertical discrimination pass is required.
- **Per-vertical flag registry / brand-config layer** — rejected as YAGNI: one boolean, one brand.
- **Delete-and-restore ride screens** — rejected: would cascade through testID map, i18n ratchet, and flow gates; hide-not-delete is the only gate-safe path.

## Key Decisions & Staging for Next Steps

### Decisions the owner must make (before /egm-draft) — RESOLVED, see §owner_dispositions_2026-11-11.md of docs/Plan/EGM-BRAINSTORM-2026-11-11-node-launch/owner_dispositions_2026-11-11.md (D-1 … D-7)

1. **Post-hide user landing and tab graph** — candidate: services-hub as home; declare a purpose per surviving tab (activity → parcel/shop-order history or withheld; chat → re-scoped or withheld).
2. **Identity values** — concrete bundle ID (e.g. `com.node.bd`), scheme (e.g. `node`), Play listing name. Frozen at first store submission.
3. **Operator vocabulary strings** — en+bn labels for User/Operator (consider সেবাদাতা / পার্টনার framing), plus the one-account explainer copy.
4. **Admin ride-surface policy** — candidate: no gating at launch (staff-only surface); one sentence either way.
5. **Neutral driver landing** — candidate: services-hub behind the flag (re-points at splash branch, root gate, `login-as` ROLE_HOME + chooser-row gating).
6. **Ride runtime Maestro flows disposition** — flag-on test builds vs tagged skip vs retired from device runs.

### Decisions the draft resolves (mechanism, already directionally decided)

- Flag transport: piggyback on verify-token + one small `[public]` config GET; fail-closed default (ride hidden); route guarding included; no flag framework.
- Auth topology over the real chain (welcome → walkthroughs → phone-entry → login|otp-verify → wizards), with the five role pills relocated into the operator dropdown (driver excluded at launch, wrappers preserved).
- Scheme/brand sweeps as same-commit atomic changes (config + PaymentResultScreen + notificationRouter + Maestro appId/boot subflows + locales + tailwind palette + hard-coded literals).
- The per-surface hide inventory (structural F2) and the dormant-mode maintenance contract + re-enable acceptance scenario.

### Staging (keeps every commit green — implementation-readiness lens)

1. **Flag plumbing** (endpoint + client resolver + boot fetch + fail-safe default = ride visible). Additive; zero behavior change.
2. **Node identity + assets + theme + brand copy.** Same commit: app.config.js, asset moves, theme + tailwind palette, brand strings (locales + hard-coded), Maestro appId sweep, scheme constants. Only irreversible step — final before G5.
3. **Hide component behind the flag, defaulting visible.** Services-hub gate, hamburger gate, redirects re-pointed, route guards. Ride flows stay valid until the flip.
4. **Auth re-organization** (user-first split, operator login, dropdown minus driver). App + testID map + flows + locales + baseline in one commit.
5. **Driver-surface gating** (three landing branches, chooser-row treatment).
6. **Flip the flag** (staging → prod) + device verification of BOTH states, including the flag-flip-back re-enable proof.

Rollback: steps 1–5 are individual revertible commits; step 6 rolls back by an admin config flip. The identity rename is the only irreversible step.
