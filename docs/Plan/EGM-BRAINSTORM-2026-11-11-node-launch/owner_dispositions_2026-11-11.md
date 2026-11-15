**Purpose:**     Owner dispositions for the Node first-launch brainstorm — the rulings that resolve the review's open decisions.
**Owner:**       Zia (owner rulings) — recorded by Elephant (EGM)
**Status:**      ACTIVE (final for the brainstorm stage; supersedes the "pending" markers in feature_concept.md)
**Source of truth:** this file, for owner rulings. Review findings live in the *_report.md files; the synthesis in concepts_brief.md.
**Related (concrete paths):**
  - docs/Plan/EGM-BRAINSTORM-2026-11-11-node-launch/feature_concept.md — concept under review (rules marked pending there are resolved here)
  - docs/Plan/EGM-BRAINSTORM-2026-11-11-node-launch/concepts_brief.md — synthesized review; "Decisions the owner must make" section is now resolved by this file
**Last verified:** 2026-11-11 by Elephant (owner confirmed "okay" in session)
**How to update:** New rulings append at the bottom with date; never edit past rulings.

---

# Owner Dispositions — Node First Launch (2026-11-11)

Confirmed by the owner in session, in response to the six-lens Goldfish review (concepts_brief.md). Any divergence from the review's recommendations is noted inline.

## D-1 — Post-login user landing (review Blocker 1)
**Ruling:** The user home is the services hub (`services-hub`). After login, all three entry paths converge there: the splash cold-boot route stays as-is (it already lands single-role riders on services-hub), the `login-as` rider row (+ its two fallbacks) and the `(customer)/index.tsx` redirect are re-pointed to services-hub. No new home screen is designed at launch; the surviving grid (Shops, Rental marketplace, shop categories, Parcel delivery, Ambulance) is the product surface. A richer hub redesign is a later, separate decision.

## D-2 — Identity values (review Major 13)
**Ruling (defaults accepted):** bundle ID `com.node.bd`, deep-link scheme `node`, Play listing name "Node". These values are FINAL before the first store submission — the rename is the only irreversible step. The Play Console registration details for `com.ride.bd` go unused/parked as fallback.

## D-3 — User/Operator vocabulary (review Major 11)
**Ruling (defaults accepted):** en labels "User" / "Operator". bn labels follow local framing (সেবাদাতা / পার্টনার style — exact strings to be shown for approval in the design doc, not a literal "অপারেটর"). The user-first screen carries a one-line "one account, multiple roles" explainer. Exact en+bn strings are a design-draft deliverable requiring owner sign-off before ship.

## D-4 — Admin ride-surface policy (review Major 18)
**Ruling (defaults accepted):** No launch-time gating of ride-admin screens. Admin is a staff-only surface; the Copy Truth Rule governs user-facing copy. One sentence to that effect goes in the draft; revisit only if a staff workflow can trigger ride-side actions accidentally.

## D-5 — Neutral driver landing (review Major 12, Nit via zoom-out F6)
**Ruling (defaults accepted):** Driver-role logins land on services-hub behind the hide flag. Implementation is a re-point of the three routing sites (splash branch `app/index.tsx:147`, root gate `app/_layout.tsx:172-173`, `login-as.tsx` ROLE_HOME.driver) plus chooser-row content gating (wrappers preserved for the testID/flow contract). No bespoke neutral screen.

## D-6 — Ride runtime Maestro flows disposition (review Major 15)
**Ruling (defaults accepted):** The ~30 ride runtime flows are kept and run against flag-on test builds (ride is dormant, not deleted, so they remain valid). Hidden-state verification runs separately against the launch flag state. No flow deletions; any suppression goes through `flow-xcheck-suppressions.json` with the gate conventions.

## D-7 — Flag mechanism (review Blocker 5; direction already locked in feature_concept.md)
**Ruling:** Build-time `EXPO_PUBLIC_*` option is STRUCK (violates "re-enable without a store update"; expo-updates is disabled). The mechanism is a runtime `platform_config` boolean read through a small `[public]` endpoint + piggyback on the existing verify-token call, fail-closed default (ride hidden when the fetch fails), route-level guarding included. Exact endpoint shape is a design-draft deliverable.

## Carried forward — original locked rulings restated (from feature_concept.md, unchanged)

- App has never been on any store track; rename is a first-release identity decision.
- One-account-multi-role architecture retained (user_roles, login-as chooser).
- Vocabulary: User = `rider` role; Operator = `driver`, `fleet_owner`, `shop_owner`, `delivery_man`, `shop_staff`; restaurant owner = shop_owner with `is_restaurant`.
- Dormant, not deleted: all ride code/infrastructure stays; re-enable without a store update.
- Ride-driver onboarding hidden at launch (entry gated; resolved landing = D-5).

## Corrections carried into the design draft (review fact-checks — not rulings, but binding inputs)

- Customer tab bar is already invisible (`tabBarStyle: display:none`); "tab-bar pass" is a nav-route re-pointing over home/rides/chat/profile, not a visible bar.
- `ROLE_HOME` lives in `login-as.tsx`, not the splash gate; the splash uses its own if/else chain, and the two disagree on the driver landing — both must change (D-5 covers this).
- utils-server is load-bearing at launch (delivery dispatch tick inside its scheduler); only the ride chain is dormant. The rider WebSocket open (`ensureRiderSocket` on services-hub) is gated behind the hide flag.
- The hide scope is a per-surface inventory (hamburger items, index redirect, login-as + fallbacks, rebook actions, per-ride chat/detail, notification deep-links) — tile gating alone is insufficient; routes are guarded, not just tiles.
- Maestro `appId` sweep must land in the same commit as the identity change (no CI gate covers `appId`).
- Brand-copy sweep is a discrimination pass (brand strings change, ride-vertical strings survive); `tailwind.config.js` carries a second palette copy; hard-coded brand literals listed in concepts_brief.md § Major 10 are in scope.
- Location-permission and SOS ownership moves off the hidden ride home to surviving verticals (ambulance/parcel paths must reach location without the hidden map home).
- "Re-enable ride" acceptance scenario (flag flip → ride returns, payment deep-links intact, no store submission) is a design-draft deliverable.

---

# Addendum — 2026-11-11 (design-draft review round 1)

Owner review of `design_draft.md` (Technical Plan) produced three new rulings and one string set. Recorded here so the ruling chain stays complete; the draft implements them.

- **D-8 — Tab disposition:** `(tabs)/rides` (activity, incl. in-screen chips) and `(tabs)/chat` are gated while ride is hidden; shop-order and parcel history live in their own vertical screens (shop orders, parcels list). Resolves the "declared purpose per surviving tab" question from concepts_brief Blocker 1.
- **D-9 — Mount guards:** ride/driver hiding includes layout-level guards (`(tabs)/home/index.tsx`, `(main)/(rider)/_layout.tsx` redirect to services-hub when the flag is off) in addition to the catalogued entry-point re-points — zero ride/driver mounts regardless of push origin.
- **D-10 — Vocabulary strings (supersedes D-3's placeholder framing):** owner-supplied en/bn copy recorded verbatim in design_draft.md Component C — User `গ্রাহক`, Operator `সেবাদাতা / পার্টনার`, auth links `সেবাদাতা (পার্টনার) হিসেবে লগইন/রেজিস্ট্রেশন করুন`, one-account explainer `একটি মোবাইল নম্বর দিয়েই গ্রাহক ও সেবাদাতা—উভয় অ্যাকাউন্ট ব্যবহার করা যাবে।`; en `User` / `Operator` / `Login as Operator` / `Register as Operator` / `One phone number works for both User and Operator accounts.`
- Engineering corrections from the same review (not rulings — codebase facts): operator registration funnel keeps OTP before wizard; operator login is a thin `mode="operator"` wrapper; flag fetch fires at splash for both auth states; hub heading gates with the tiles and the hub hydrates `userAddress`; `auth.roles.rider` copy change is flow-audited; permission disclosures rewritten to delivery/ambulance framing for Play policy.

# Addendum 2 — 2026-11-11 (design-review resolution round)

Owner disposition via the consolidated review's resolution round ("Resolve findings with agent"):

- **D-9 amendment (approved):** the ride/driver mount-guard mechanism is **centralized** — `components/RideSurfaceGuard.tsx` mounted once in `app/(main)/_layout.tsx` — superseding D-9's two named layouts (`(tabs)/home/index.tsx`, `(main)/(rider)/_layout.tsx`). Verified functional superset (the `(main)` layout wraps every `(main)` route); ride screen files stay untouched. D-9's operative requirement is unchanged: zero ride/driver mounts regardless of push origin. DESIGN-NODE-LAUNCH.md implements this in inventory #22 and Stage 3.
- **Pre-stage-2 owner deliverables registered (P-1…P-3):** RESOLVED 2026-11-11 — P-1 splash tagline: EN "One app for every need." / BN "সব প্রয়োজনের জন্য একটি অ্যাপ।" (owner picked candidate c); P-2 login header: KEEP "Welcome Back" (brand-neutral; stage 4 localizes via `t()` keys); P-3 `expo-router.origin`: `https://node.expo.app` (owner informed of the field's meaning; derived from slug `node-bd`; amendable before store submission).
