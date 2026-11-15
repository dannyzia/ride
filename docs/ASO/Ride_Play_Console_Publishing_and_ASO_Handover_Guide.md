---
title: "Ride — Google Play Console Publishing and ASO: Handover Guide"
audience: "Gemini (executing agent or advisor) and Zia (owner, final decision-maker)"
date: "5 November 2026"
status: "Working document. Facts marked VERIFIED were read from the repo or official sources on this date. Anything marked UNVERIFIED must be checked before it is relied on."
companion_files:
  - "docs/ASO/Ride_ASO_Master_Asset_Package_Bangladesh_v2.md (store copy, gates, keywords, screenshots)"
  - "plans/website-build-plan.md (website: privacy, delete-account, support pages)"
---

# Part A. Operating rules (read before doing anything)

Gemini, you are being handed two jobs: **(1) publish the Ride Android app on Google Play Console** and **(2) own the ASO (store listing optimization)**. Follow these rules without exception.

1. **Never invent a fact.** If you do not have evidence, write "UNKNOWN" and ask the owner. Do not fill forms with guesses. This includes feature availability, payment methods, cities, provider counts and data practices.
2. **The gate table is law.** Every public claim (store copy, screenshots, website, ads) must trace to a gate in Section 1 of `Ride_ASO_Master_Asset_Package_Bangladesh_v2.md`. If a feature is not marked Live, it does not appear.
3. **Stop and ask the owner** at every point marked **[OWNER DECISION]**. Do not decide these yourself.
4. **Human-only steps** (identity verification, payment profile, two-step verification, signing key custody, government documents, legal approvals) are marked **[HUMAN ONLY]**. Give the owner exact instructions. Never ask for passwords or recovery codes, and never store them.
5. **You do not change app code, commit to git, or alter build configuration.** Engineering fixes (Part C) go to the building model with the owner's approval. The repo is under a standing change freeze: no commits without the owner's go-ahead. EAS builds in this repo require a committed tree (`requireCommit: true`), so even a build needs the owner's approval.
6. **Never publish, submit for review, or roll out to production** without the owner's explicit written "go" for that specific step.
7. **Never reveal or request secrets** in chat: keystores, service account JSON, API keys, `.env` values.
8. **Report after each phase** in the format in Part I. Include evidence (screenshots, command output, Console messages), not assurances.
9. **Policies and Console screens change.** Menu names in this guide are descriptions, not exact labels. When Console differs from this guide, trust Console and Google's current documentation, and note the difference in your report.

---

# Part B. Facts about Ride (VERIFIED from the repo on 5 Nov 2026)

| Item | Value | Source |
|---|---|---|
| App name | Ride | `app.config.js` |
| Android package name | `com.ride.bd` (**permanent once created in Play Console**) | `app.config.js` |
| Version | 1.0.4 (`version`). Android versionCode is managed remotely by EAS (`appVersionSource: remote`, `autoIncrement: true` on the production profile) | `app.config.js`, `eas.json` |
| Framework | Expo SDK 53, React Native 0.79.2, React 19 | `package.json` |
| EAS project | `3293078f-d655-46b9-8a03-c45b2fab2c2d` | `app.config.js` |
| Production build profile | `app-bundle` (AAB), distribution `store` | `eas.json` |
| Store submit config | `submit.production` is **empty**. No service account is configured | `eas.json` |
| Deep-link scheme | `ride` | `app.config.js` |
| OTA updates | `expo-updates` is present but `updates.enabled` is **false** (a dev-only unblock per the comments) | `app.config.js` |
| Declared Android permissions | `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` (plus whatever plugins merge in) | `app.config.js` |
| Notable native libraries | MapLibre (`@maplibre/maplibre-react-native` 10.4.2), WebView 13.13.5, Notifications, Location, Image Picker, Secure Store, OTP verify | `package.json` |
| Backend | Node WebSocket dispatch server, Supabase Postgres, AWS S3 SDK present, Barikoi maps API key in app extras | `package.json`, `app.config.js` |
| Payments | PortPos (aggregator) | Owner, 5 Nov 2026 |
| Website | `https://ride.digital-papyrus.com` (Vercel) | Owner |
| Support email | `support@ride.digital-papyrus.com` | Owner |
| Privacy email | `privacy@ride.digital-papyrus.com` | Owner |
| Support URL | `https://ride.digital-papyrus.com/support` | Website |
| Privacy policy URL | `https://ride.digital-papyrus.com/privacy` (**live, but draft content with placeholders; flag set to approved without review**) | Website |
| Account deletion URL | `https://ride.digital-papyrus.com/delete-account` (**live, mailto flow, not yet tested end to end**) | Website |
| Legal entity and business address | `Ride Digital Services`, `7/1-D, R.K. Mission Road, Dhaka-1203` appear in `site.ts` and the draft pack. Entity type and registration number are **unresolved**. Source of these facts to be confirmed by the owner | Website, draft pack |
| Play Store URL on website | `site.ts` points to `https://play.google.com/store/apps/details?id=com.ride.bd`. **No listing exists yet, so this link will 404 until publication** | Website |

**Owner rulings (5 Nov 2026):** scooter and women-only matching are Live. PortPos carries bKash, Nagad and other methods (each still to be confirmed enabled and tested before it is named publicly). Pharmacy is under owner review and stays out of copy.

---

# Part C. Launch blockers found in the repo (ranked)

These must be resolved before the first Play upload can succeed or be approved. Each needs an **[OWNER DECISION]** or an engineering action by the building model. Gemini flags them and tracks status. Gemini does not fix them.

**Status update, 5 Nov 2026 (orchestrator report, checked against files on disk by the architect):**

| Item | Reported | Verified on disk | Real status |
|---|---|---|---|
| C1 target API 36 | Fixed via `plugins/withTargetSdk36.js` | Plugin exists and is registered in `app.config.js`. It rewrites `compileSdk` and `targetSdkVersion` to 36 in the generated app `build.gradle`. `android/` is **gitignored**, so the reported edit to `android/app/build.gradle` has no effect on cloud builds; only the plugin counts | **CONFIGURED, NOT PROVEN.** No AAB has been built. Needs a build, a manifest check showing targetSdk 36, and an Android 16 device test (edge-to-edge, back gesture). Possible failures: AGP 8.x warning or error for compileSdk 36, a dependency requiring AGP 8.9.1 or later, EAS image missing platform 36 |
| C4 storage permissions | Removed | **Confirmed.** `android.permissions` now lists only fine and coarse location | **PARTLY DONE.** The "Always" location string is still present, so the merged manifest must still be checked for `ACCESS_BACKGROUND_LOCATION` and a foreground service |
| C5 production env | URLs baked into `eas.json` | **Confirmed for three values:** `EXPO_PUBLIC_SERVER_URL`, `EXPO_PUBLIC_WEB_SOCKET_SERVER_URL`, `EXPO_PUBLIC_R2_DOMAIN` | **PARTLY DONE.** `app.config.js` also reads `BARIKOI_API_KEY`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_SUPPORT_PHONE` from the environment, and none is set in `eas.json`. They must exist in the EAS production environment. Secrets belong in EAS secrets, not in `eas.json`. The three hostnames are **unverified**: confirm DNS, TLS, an HTTPS health response and a working `wss` upgrade |
| Privacy and deletion "approved" | Flags set to true, draft banner removed | Flags are `true`, but the content is still the draft pack with unresolved placeholders (see Part G) | **NOT APPROVED IN SUBSTANCE.** Treat as blocked |
| Commit `28372f6`, 10 gates, push, Vercel deploy | Reported | **Cannot be verified from files.** Git state must come from the owner or an execution-capable mode | Unverified |

## C1. Target API level: Expo SDK 53 targets API 35; Play requires API 36 (CRITICAL)

- **Evidence:** Expo's SDK table lists SDK 53 at `compileSdkVersion` 35 and `targetSdkVersion` 35. SDK 54 and 55 are 36 and 36. Google Play requires **new apps and app updates to target Android 16 (API level 36) or higher since 31 August 2026**. Ride is a new app. (Sources in Part J.)
- **Impact:** the AAB will be **rejected on upload** if it targets 35.
- **Options for the owner:**
  1. **Upgrade the Expo SDK** to 54 or 55 (targets 36 by default). Cleanest. Large change: it moves React Native and several native libraries. The repo already has a custom shim for `react-native-worklets` and pins Reanimated 3.17, so the Reanimated and worklets setup must be reviewed. **UNVERIFIED:** exact breakage risk.
  2. **Stay on SDK 53 and override to 36** with `expo-build-properties` (`compileSdkVersion` 36, `targetSdkVersion` 36, matching build tools) and a newer Android Gradle Plugin (a third-party Expo guide cites AGP 8.9.1 or later for compileSdk 36, via `expo-custom-agp`). This combination is not an official Expo SDK 53 configuration, so treat it as unsupported until tested.
  3. Either way, test on an **Android 16 device or emulator**: edge-to-edge is enforced for apps targeting 36, and the system back handling changed. Check launch, navigation and back gestures, location and notification permission flows, and payment WebView return.
- **No extension is available for a new app.**
- **Evidence Gemini must collect later:** the AAB's manifest must show `targetSdkVersion` 36 (Part E, step E2).

## C2. 16 KB memory page size support (HIGH)

- **Evidence:** since 1 Nov 2025, Play requires new apps and updates targeting Android 15+ to support 16 KB page sizes. Expo states SDK 53 is ready only when `expo` is **53.0.14 or newer** and every third-party native library is compatible.
- **Check:** `package.json` says `"expo": "^53.0.0"`. The installed version must be read from the lockfile or `npm ls expo`. Native libraries to inspect: MapLibre, WebView, OTP verify, reanimated, gesture handler, screens, svg, keyboard-controller, image picker, secure store.
- **How:** upload the AAB to an internal testing track and read any Console warning, and/or inspect the AAB's native `.so` files for 16 KB alignment (Android's documented alignment check tools).

## C3. Push notification credentials (HIGH, likely)

- **Evidence:** `app.config.js` has no `android.googleServicesFile` and no FCM configuration. The app uses `expo-notifications` for ride requests.
- **Check:** whether FCM v1 credentials are set up in EAS and whether `google-services.json` exists and is wired in. **UNVERIFIED** whether push already works in a release build.
- **Why it blocks:** if push does not work on the release build, drivers will not receive ride requests. Test on a real device from an internal-track install.

## C4. Permissions audit (HIGH)

- **Evidence:** `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` are declared. They are obsolete on current Android and invite policy questions. `expo-location` is configured with an "Always and when in use" string that says "while driving", which hints at background location.
- **Check:** read the **merged manifest from the built AAB** (not just `app.config.js`). Plugins and libraries merge extra permissions in. List every permission and classify it: needed, not needed, or needs a Play declaration.
- **Decision [OWNER DECISION]:** does the driver app need location while the app is in the background? If yes, Play requires a background location declaration, a demo video, a prominent in-app disclosure, and a foreground service declaration. If no, remove it and make sure it is absent from the merged manifest.

## C5. Production environment variables (HIGH)

- **Evidence:** the production profile sets no `EXPO_PUBLIC_*` values. They must come from the EAS "production" environment.
- **Check:** confirm EAS has production values for `EXPO_PUBLIC_SERVER_URL`, `EXPO_PUBLIC_WEB_SOCKET_SERVER_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, the Barikoi key and `EXPO_PUBLIC_SUPPORT_PHONE`. URLs must be `https` and `wss`, never LAN IPs or `http`. A build with missing values compiles fine and fails at runtime.

## C6. Account type, which sets the whole timeline [OWNER DECISION]

- **Evidence (Google's own page and secondary guides):** personal developer accounts created after 13 Nov 2023 must run a **closed test with at least 12 opted-in testers for 14 continuous days** before applying for production access. **Organization accounts are exempt**, but need a D-U-N-S number and business verification.
- **Decide:** is the Play account an organization account? Does a D-U-N-S exist for the legal entity? The legal entity is also still unknown for the website.

## C7. Driver weekly package and Play Payments policy [OWNER DECISION]

- See Section 7.1 of the ASO v2 document. Rides, food and groceries are exempt from Play Billing. The driver weekly package is a separate charge for access inside the app and needs a written Google position or a design decision **before submission**.
- Gemini action: raise the question to Google Play policy support through Console with an exact description of the package, only after the owner approves the description.

## C8. Other items

| Item | Finding | Action |
|---|---|---|
| Commit freeze vs EAS | `requireCommit: true` means a build needs committed changes; the repo has a freeze | **[OWNER DECISION]** grant a go-ahead for the specific build commit |
| OTA updates | `updates.enabled` is `false` | **[OWNER DECISION]** keep off for the first release, or enable with a tested config. Do not flip it casually |
| Icons | One image (`logo.png`) serves as both icon and adaptive-icon foreground on a white background | Check the safe zone. Play also needs a separate 512 x 512 store icon |
| Wallet top-up | The repo contains a wallet top-up API route (UNVERIFIED, from project notes) | Likely triggers Play's Financial features declaration |
| `expo-dev-client` | Present in dependencies | Confirm the production AAB is not a development client |
| First upload | `submit.production` is empty, so there is no service account | First upload to a new app is manual in Console. Automated submission can be configured afterwards |
| Pharmacy | Owner reviewing | Stays out of copy |
| Website placeholders | `/privacy` and `/delete-account` are placeholders. Legal entity unknown | Block store submission (Part G) |

---

# Part D. Accounts and prerequisites

**[HUMAN ONLY]** unless noted.

1. **Google account** for the developer identity, with **two-step verification** enabled.
2. **Play Console developer account** (one-time registration fee, currently stated by Google as USD 25; confirm in the sign-up flow).
   - **Organization:** legal business name, address, phone, working website, D-U-N-S number, representative identity. Exempt from the 12-tester rule.
   - **Personal:** government ID verification. Subject to the 12-tester, 14-day rule.
   - The account type and legal details sit in the **payments profile** and generally cannot be edited later. Choose correctly the first time.
3. **Verify** the contact email and phone, and the developer website if Console asks. Use `https://ride.digital-papyrus.com`.
4. **Expo/EAS account** with access to the project `3293078f-d655-46b9-8a03-c45b2fab2c2d` (building model or owner).
5. **Play App Signing:** accept Google-managed app signing. EAS manages the **upload key**. After the first build, back up the upload keystore with the EAS credentials tooling. **[HUMAN ONLY]** The owner must hold a secure backup.
6. **Tester pool:** if the account is personal, line up at least 12 real people with Google accounts, opted in for the full 14 days (drivers and riders in Dhaka work well). The rule needs them opted in continuously, so recruit more than 12.

---

# Part E. Publishing runbook (Google Play Console)

Each step ends with a **verification**. Do not proceed until it is met and evidenced.

## E1. Create the app

1. In Console, create a new app.
2. App name: use the title from the ASO v2 document, `Ride: Rides, Food & Delivery`. Default language: English (or the owner's chosen default). App or game: **App**. Free or paid: **Free**. Accept the declarations.
3. **Verify:** the app appears in All apps. **Record the package name when the first AAB is uploaded: it must be `com.ride.bd`.**

## E2. Produce and inspect the build (building model builds; Gemini inspects)

1. Owner approves a specific commit for the build **[OWNER DECISION]**. Resolve C1 to C5 first.
2. Build with the EAS **production** profile (AAB).
3. **Inspect the AAB before uploading.** Use bundletool or an equivalent to dump the manifest and read:
   - `package` = `com.ride.bd`
   - `targetSdkVersion` = **36 or higher**
   - the full permission list (compare with C4)
   - versionCode (EAS remote increment) and versionName `1.0.4`
4. **Verify:** targetSdk 36, a clean permission list, 16 KB compatibility checked (C2), `https` and `wss` production endpoints confirmed (C5).

## E3. Internal testing track

1. Create an internal testing release, upload the AAB, add up to the allowed number of internal testers by email.
2. Install from the Play opt-in link on real devices, including one **Android 16** device or emulator and one low-end device common in Bangladesh.
3. **Smoke test the release build**, role by role, and record pass or fail:
   - sign-up and OTP login (rider, driver)
   - location permission and map display
   - booking: bike, CNG, car, scooter, women-only matching (where applicable)
   - each other live vertical (food, shops, parcel, rental, truck, ambulance if live)
   - driver: receives a ride request by **push notification**, accepts, completes
   - payment: a real small transaction through **PortPos** for each method you intend to name publicly; return to the app via the `ride://` link
   - account deletion path in the app
   - app works on mobile data, not only Wi-Fi
4. **Verify:** a written pass or fail table with device models, Android versions and evidence.

## E4. App content declarations (Console "App content" area; names change)

Complete every item Console lists. Inputs and guidance:

| Declaration | Input | Notes |
|---|---|---|
| Privacy policy | `https://ride.digital-papyrus.com/privacy` | Must be an **approved, real** policy, publicly reachable, matching the Data safety form |
| App access | Working test logins for **rider, driver, merchant, provider** roles, with OTP bypass or fixed OTP instructions, location and payment sandbox steps | Reviewers must not need a real emergency or a real provider. Never give production admin credentials |
| Ads | Answer truthfully (no ad SDK was found in `package.json`) | **UNVERIFIED**: confirm in code |
| Content rating | Complete the IARC questionnaire truthfully | Note any in-app chat (`react-native-gifted-chat`) and location sharing |
| Target audience | Adults. Not designed for children | |
| Data safety | Use the inventory in Part F | Highest risk of rejection if wrong |
| Account deletion | In-app deletion plus `https://ride.digital-papyrus.com/delete-account` | Must work. Test it |
| Location permissions | Foreground only, or foreground plus background per C4 | Background needs a demo video and prominent disclosure |
| Foreground service permissions | Only if a foreground service type is declared in the merged manifest | |
| Photo and video permissions | The app uses an image picker. Remove unneeded storage permissions (C4) | |
| Financial features | Likely required if wallet top-up exists. Answer truthfully | Check the Console's current list |
| Health apps / medical | Ambulance requests may trigger a health declaration | Check before listing the ambulance vertical |
| Government apps, news, others | Not applicable | Answer "No" only where true |

**Verify:** every declaration shows complete, with no warnings. Export or screenshot the summary page.

## E5. Store listing

Fill every field from `Ride_ASO_Master_Asset_Package_Bangladesh_v2.md`:

1. Default language listing (English): title, short description, assembled full description (live blocks only), contact email, website, privacy policy.
2. **Bengali (bn-BD) localization:** Bangla title, short description, full description. **Do not publish until a native Bangla speaker has reviewed it.**
3. Category and tags (recommendation in the ASO v2 document; re-check against the current Console list).
4. Graphics: 512 x 512 icon, 1024 x 500 feature graphic, phone screenshots (2 to 8, real release-build captures, English and Bangla), optional video.
5. **Re-count characters in Console** for every field, especially Bengali.

**Verify:** the listing preview renders with no policy warnings, and every claim maps to a Live gate.

## E6. Closed testing (required if the account is personal)

1. Create a closed testing track, upload the same AAB (or a newer one), and add a tester list (Google Group or email list).
2. Testers must **opt in and remain opted in for 14 continuous days**, with at least 12 testers at the time you apply.
3. Collect real feedback. Fix crashes. Keep testers opted in.
4. When eligible, apply for **production access** in Console, answering the questions honestly about testing, the app, and readiness.
5. **Verify:** Console shows the production access application approved.

**Skip if** the account is an organization account (confirm in Console).

## E7. Production release (owner "go" required)

1. Select countries: **Bangladesh** (and any others the owner approves).
2. Create the production release with the same tested AAB. Write short release notes (English and Bangla).
3. Use a **staged rollout** (start low, increase only if crash rate and vitals are healthy).
4. Submit for review. **[OWNER DECISION]** explicit written go required.
5. **Verify:** release status "In review", then "Available". Test installing from the live Play page.

## E8. Post-launch

- Watch Android vitals (crashes, ANRs), pre-launch report findings, and policy status messages daily at first.
- Respond to reviews with real answers, in the same language as the reviewer.
- Never ship a feature claim in the listing before the feature ships.

---

# Part F. Data safety inventory (starting hypothesis, derived from dependencies)

**This is a hypothesis built from `package.json` and `app.config.js`. Gemini must verify each row against the code and the backend, and the owner must confirm.** Apply Google's own definitions of "collected" and "shared" (transfer to a service provider acting on your behalf is treated differently from transfer to a third party). Where the definition is unclear, mark UNKNOWN and ask the owner.

| Data type | Likely collected | Source in repo | Purpose | Notes to verify |
|---|---|---|---|---|
| Precise location | Yes | `expo-location`, MapLibre | Ride matching, tracking, navigation | Foreground vs background. Retention. Whether coordinates go to a third party (Barikoi geocoding/routing) |
| Approximate location | Yes | `ACCESS_COARSE_LOCATION` | Same | |
| Phone number | Yes | OTP login | Account, verification | OTP provider is not visible in `package.json`; verify who sends SMS |
| Name, other profile data | Likely | Supabase auth and profile | Account | Confirm fields |
| Photos and documents | Likely (drivers: license, vehicle; profiles) | `expo-image-picker`, AWS S3 SDK | Verification, profile | Retention, access controls, deletion |
| In-app messages | Likely | `react-native-gifted-chat` | Rider-driver communication | Where stored |
| Payment info | Handled by PortPos, not the app | WebView payment flow | Payments | Declare transaction history and any payment data the app stores. Card numbers should never touch your servers |
| Purchase or transaction history | Yes | Orders, wallet | Order history, settlement | |
| Device or other IDs | Likely | Push token (`expo-notifications`), `expo-device`, `expo-application` | Notifications, diagnostics | |
| App activity and diagnostics | Unknown | No crash or analytics SDK found in `package.json` | | **UNVERIFIED**: confirm there is none |

Security practices to declare only if true: data encrypted in transit (confirm production endpoints are `https` and `wss`), a way for users to request deletion (the `/delete-account` flow).

**The Data safety answers, the privacy policy, the in-app behavior and the backend must all agree.** A mismatch is a common rejection and takedown cause.

---

# Part G. What blocks store submission today

These are not store-copy problems. They block submission:

1. **Target API 36** (C1)
2. **Privacy policy:** `/privacy` renders Part K of the internal draft pack, which states it is **not approved for publication** and must not go live until every `[CONFIRM]` and `[INSERT]` item is complete and a Bangladesh-qualified lawyer has reviewed it. The `privacyPolicyApproved` flag was set to true, which removed the draft banner and made all 13 legal pages indexable, but the text was not completed. The page intro still calls itself a draft. **Still blocked.**
3. **Account deletion:** `/delete-account` is a mailto flow on top of draft text. The `deletionWorkflowApproved` flag was set to true, but there is no evidence a test request was received, verified and processed. Confirm that an **in-app** deletion path exists too. **Still blocked until tested.**
4. **Legal entity:** `Ride Digital Services` and an address now appear on the site. The draft pack still has the entity type and registration number unresolved and warns not to name Digital Papyrus as the contracting company unless it is. The footer says "Powered by Digital-Papyrus". **Owner to confirm these facts and that they match the Play developer account.**
5. **Driver package Payments-policy position** unresolved (C7)
6. **Push credentials, permissions audit, production env vars** unverified (C3 to C5)
7. **Account type** undecided (C6)

---

# Part H. ASO operating plan

All copy, gates, keywords, screenshot storyboard, custom-listing plan and the measurement plan live in `Ride_ASO_Master_Asset_Package_Bangladesh_v2.md`. Do not duplicate or rewrite them. Execute as follows.

## H1. Before the first submission

1. Read Section 0 and Section 1 of the ASO v2 document. Obtain the owner's **Live** mark for each gate (scooter and women-only are already ruled Live).
2. Assemble the English and Bangla full descriptions from live blocks only, using the assembly rules in Section 3.2. Re-count in Console.
3. Obtain native Bangla review. **No Bangla copy goes live without it.**
4. Run a trademark and existing-app-name check on "Ride" before the brand is locked in the store listing. "Ride" is generic and may collide.
5. Decide primary category (recommended Maps & Navigation; confirm in Console).
6. Commission real screenshots from the **release build** following the Section 6.2 storyboard, with only Live screens. Gemini writes the briefs and headlines. The owner or the building model captures screenshots. Never use fabricated UI.
7. Prepare icon (512 x 512) and feature graphic (1024 x 500).
8. Align the website: it must make the same claims as the listing. The website currently omits scooter and women-only. Flag this to the website builder so the copy matches the Live gates.

## H2. First 30 days after publication

Follow Section 9 and Section 11 of the ASO v2 document: baseline by language, source and audience; measure install clicks and first completed orders; fix product friction before optimizing visuals.

## H3. Rules that apply for the life of the listing

- One variable per experiment. Use Console's significance estimate.
- No bought, incentivized, gated or fabricated reviews. Do not ask only happy users.
- No competitor names in any field.
- No volume or difficulty number without a dated source.
- Change the title rarely, only with a written hypothesis and real data.
- Keep a change log: hypothesis, asset, dates, audience, metric, result, decision.

---

# Part I. What Gemini reports back, per phase

For each phase (D, C-tracking, E1 to E8, H1), return:

1. **Status:** done, blocked, or waiting on the owner.
2. **Evidence:** screenshots, Console messages, command output, file excerpts.
3. **Deviations:** anything that differed from this guide, and what you did.
4. **Open owner decisions:** a numbered list, each with the options and your recommendation.
5. **Risks found:** anything that might cause rejection, a takedown, or a false claim.

Do not summarize with "everything looks good." State exactly what was checked.

---

# Part J. Sources and boundaries

**Verified in this session (5 Nov 2026):**
- Google Play target API requirement: new apps and updates must target Android 16 (API 36) from 31 Aug 2026. Google Play Console help page on target API level, and Android developers target SDK page.
- Expo SDK table: SDK 53 compile and target 35; SDK 54 and 55 compile and target 36. Expo documentation (versions page).
- 16 KB page size: Expo's guide states SDK 53 is ready when `expo` is 53.0.14 or newer and third-party native libraries are compatible. Expo FYI note on Android 16 KB page sizes.
- Closed testing rule for personal accounts created after 13 Nov 2023 (12 testers, 14 continuous days; organization accounts exempt): Google Play Console help, app testing requirements for new personal developer accounts.
- Play Payments policy: physical goods and services (transportation, food delivery) are not sold through Play Billing; in-app features and subscription-type access are expected to use it. Google Play Payments policy pages.
- Repo facts in Part B: `app.config.js`, `eas.json`, `package.json`.

**Not verified (treat as UNVERIFIED):**
- Whether push works in a release build, the actual merged manifest, installed `expo` version, 16 KB alignment of each native library.
- Exact Console menu names and the current declaration list.
- Whether an ad, analytics or crash SDK is present beyond `package.json`.
- Whether PortPos has each payment method enabled on the Ride merchant account.
- Naturalness of the Bangla copy.
- The wallet top-up route's existence (from project notes, not re-read here).

**Out of scope here:** Apple App Store publishing (the ASO v2 document covers Apple metadata only), website build (see `plans/website-build-plan.md`), and engineering fixes (C1 to C5), which belong to the building model with the owner's approval.

**Research date:** 5 November 2026. Policies and Console capabilities change. Re-check official documentation immediately before each submission step.
