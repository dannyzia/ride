**Purpose:**     Reference sweep of the 130 non-deleted-screen i18n orphans — which dead keys' copy the app still hard-codes and which dead values the Maestro flows still assert. Read before purging keys or rewiring those screens.
**Owner:**       Testing/QA tooling (maintainer of `scripts/audit-i18n-orphans.cjs`)
**Status:**      ACTIVE
**Source of truth:** `scripts/audit-i18n-orphans.cjs` (the orphan list) + the sweep semantics in § Method of this file; this file is the dated record of one run.
**Related (concrete paths):**
  - `scripts/audit-i18n-orphans.cjs` — produces the orphan list this sweep consumes (`--json`)
  - `docs/testing plan/reports/I18N-ORPHAN-AUDIT-2026-10-04.md` — the 236-key audit this sweep subsets
  - `docs/testing plan/reports/DEAD-SCREEN-AUDIT-2026-10-04.md` — the deleted-screen side (where the 106 keys come from)
  - `maestro/tools/flow-xcheck.cjs` — source-corpus and flow-claim semantics mirrored exactly
  - `i18n/locales/en/common.json`, `i18n/locales/bn/common.json` — the key space
  - `maestro/flows/**` — all 101 flow files scanned
**Last verified:** 2026-10-04 — sweep run against the audit of the same date; all counts below are that run.
**How to update:** re-run the sweep (its exact semantics are specified in § Method; the one-off tool was deleted after this run — promote it to a checked-in script if the sweep is needed again); never hand-edit a key list in this file.

---

# i18n orphan reference sweep — 2026-10-04

The orphan audit found **236** en/bn keys with zero `t()` references. **106** belong to the three screens deleted on 2026-10-03 (`confirm_ride.*` 58, `find_ride.*` 36, `apply_promos.*` 11, plus `ride.request` 1) and are queued for a separate purge. This sweep asks the inverse question for the **other 130**: does the app still *render* these strings as hard-coded copy, and do the Maestro flows still *assert* them?

## Verdict

| Bucket | Keys |
|---|---|
| ORPHANED (audit total) | **236** |
| — deleted-screen namespaces (separate purge) | 106 |
| **swept here — "the other" orphans** | **130** |
| value hard-coded in app/components source — exact match | 80 |
| value only embedded inside a longer source literal | 9 |
| value asserted by a flow selector — exact match | 23 |
| — of which via a bare literal (a real copy dependency) | 11 |
| exact reference (source exact ∪ flow exact) | 85 |
| any-tier reference (adds embedded source + wildcard/fragment flow) | 105 |
| **no reference of any kind — fully dead string** | **17** |
| value still live through a different key (orphan is a duplicate) | 54 |

### Reconciling "the other 86"

By keys, the remainder after the deleted-screen set is **130**, not 86 — and no namespace partition on disk yields 86. The number that does land on 86 is text-level: an ASCII case-insensitive scan of `maestro/flows/**` for each orphan's en value matches **87 of the 236 keys**, and **86** once `ride.request` is excluded; strict exact matching (source ∪ flow, § Verdict) gives **85** — both readings bracket 86. The raw scan is too coarse for a verdict — it counts values inside comments, `id:` strings, `appId:` lines and regex fragments — so this report resolves those raw hits into selector-level evidence instead. The tables below cover all 130 keys, a superset of any 86-key reading.

## 1. Copy the app still hard-codes — 89 keys with source evidence

### 1a. Phrase-shaped values (43 keys) — the strong class

These strings still appear verbatim in `app/` or `components/` source. Spot-checks of the heaviest files: `phone-entry.tsx`, `login.tsx`, `welcome.tsx`, `forgot-password.tsx`, `components/RideOfferSheet.tsx` and `components/auth/DriverStatusGuard.tsx` carry **no `useTranslation` import at all** — whole screens were never wired to i18n, while their keys sit unused in both locales.

| Key | Value | Source sites | Notes |
|---|---|---|---|
| `activity.call_ledger` | `Call Ledger` | `app/(main)/(rider)/d/(tabs)/activity/index.tsx:153`, `components/GlobalActionButtons.tsx:82` | value also live via `call_ledger.header` |
| `activity.due_amounts` | `Due Amounts` | `app/(main)/(rider)/d/(tabs)/activity/index.tsx:154`, `app/(main)/(rider)/due-amounts/index.tsx:103` | value also live via `earnings.due_amounts` |
| `auth.get_started` | `Get Started` | `app/(auth)/driver-walkthrough-3.tsx:69`, `app/(auth)/phone-entry.tsx:134`, `app/(auth)/walkthrough-3.tsx:69` |  |
| `auth.register` | `Create Account` | `app/(auth)/welcome.tsx:69` |  |
| `auth.send_otp` | `Send OTP` | `app/(auth)/forgot-password.tsx:204`, `app/(auth)/forgot-password.tsx:209` |  |
| `auth.tagline` | `Your ride, your way` | `app/(auth)/phone-entry.tsx:126`, `app/index.tsx:159`, `components/SplashAnimation.tsx:127` |  |
| `auth.verify_otp` | `Verify OTP` | `app/(auth)/forgot-password.tsx:167`, `app/(auth)/forgot-password.tsx:239`, `app/(auth)/forgot-password.tsx:244`, `app/(auth)/otp-verify.tsx:111`, `app/(auth)/otp-verify.tsx:150` |  |
| `common.load_more` | `Load More` | `app/(main)/(customer)/(rental-bidder)/index.tsx:382` | value also live via `activity.load_more` |
| `common.sign_out` | `Sign Out` | `app/(main)/(rider)/d/(tabs)/profile/index.tsx:263`, `app/(main)/(rider)/settings/account-security/index.tsx:89`, `components/admin/AdminShell.tsx:439` | value also live via `profile.sign_out` |
| `driver.account_suspended` | `Account Suspended` | `app/(main)/(rider)/verification/index.tsx:345`, `components/auth/DriverStatusGuard.tsx:158` |  |
| `driver.calls_remaining` | `Calls Remaining` | `app/(main)/(rider)/active-subscription/index.tsx:95` | value also live via `wallet.calls_remaining`, `driver_home.calls_remaining` |
| `driver.check_status` | `Check Status` | `components/auth/DriverStatusGuard.tsx:21` [comment], `components/auth/DriverStatusGuard.tsx:134`, `components/auth/DriverStatusGuard.tsx:172`, `components/auth/DriverStatusGuard.tsx:235`, `components/auth/DriverStatusGuard.tsx:280` |  |
| `driver.contact_support` | `Contact Support` | `app/(main)/(rider)/contact-support/index.tsx:160`, `app/(main)/(rider)/support/index.tsx:49`, `app/(main)/(rider)/verification/index.tsx:548`, `app/(main)/(rider)/verification/index.tsx:588`, `app/(main)/(rider)/verification/index.tsx:590`, `app/(main)/(rider)/verification/index.tsx:607`, `app/(main)/(rider)/verification/index.tsx:609`, `components/auth/DriverStatusGuard.tsx:142`, `components/auth/DriverStatusGuard.tsx:180`, `components/auth/DriverStatusGuard.tsx:245`, `components/auth/DriverStatusGuard.tsx:288` | value also live via `profile.contact_support`, `settings.contact_support` |
| `driver.documents_rejected` | `Documents Rejected` | `app/(main)/(rider)/verification/index.tsx:343`, `components/auth/DriverStatusGuard.tsx:200` |  |
| `driver.go_online` | `Go Online` | `app/(main)/(rider)/d/(tabs)/index.tsx:184` [comment], `app/(main)/(rider)/subscription-confirmation/index.tsx:31` | value also live via `driver_home.go_online`, `driver_home.go_online_label` |
| `driver.loading_profile` | `Loading profile...` | `components/auth/DriverStatusGuard.tsx:101` |  |
| `driver.no_trips` | `No trips found` | `app/(main)/(fleet)/(tabs)/finance/trips.tsx:175` |  |
| `driver.reupload_documents` | `Re-upload Documents` | `app/(main)/(rider)/verification/index.tsx:545`, `app/(main)/(rider)/verification/index.tsx:548`, `components/auth/DriverStatusGuard.tsx:224` |  |
| `driver.verification_pending` | `Verification in Progress` | `components/auth/DriverStatusGuard.tsx:119` |  |
| `driver.verification_pending_desc` | `Your documents are being reviewed. This usually takes 24-48 hours.` | `app/(main)/(rider)/verification/index.tsx:367` |  |
| `driver_home.high_demand` | `High demand` | `app/(main)/(rider)/d/(tabs)/index.tsx:60` |  |
| `driver_home.low_demand` | `Low demand` | `app/(main)/(rider)/d/(tabs)/index.tsx:58` |  |
| `driver_home.moderate_demand` | `Moderate demand` | `app/(main)/(rider)/d/(tabs)/index.tsx:59` |  |
| `earnings_detail.go_back` | `Go back` | `app/(main)/(customer)/(rental-marketplace)/confirmed.tsx:147`, `app/(main)/(rider)/add-vehicle/index.tsx:461`, `app/(main)/(rider)/cancellation-reasons/index.tsx:160`, `app/(main)/(rider)/documents/index.tsx:312`, `app/(main)/(rider)/earnings-detail/[date].tsx:134`, `app/(main)/(rider)/hotspot-map/index.tsx:145`, `app/(main)/(rider)/min-rate/index.tsx:215`, `app/(main)/(rider)/onboarding/index.tsx:1058`, `app/(main)/(rider)/settings/index.tsx:67`, `components/RideLayout.tsx:95` | value also live via `change_password.a11y_go_back`, `rate_rider.go_back`, `break_mode.go_back`, `saved_addresses.a11y_go_back`, `emergency_contacts.a11y_go_back`, `ride_detail.go_back`, `schedule_ride.go_back` |
| `earnings_detail.toggle_theme` | `Toggle theme` | `app/(auth)/enable-location.tsx:68`, `app/(auth)/notifications-permission.tsx:86`, `app/(main)/(rider)/earnings-detail/[date].tsx:145`, `app/(main)/(rider)/min-rate/index.tsx:228` | value also live via `change_password.a11y_toggle_theme`, `app_language.toggle_theme` |
| `home.calls_remaining` | `Calls Remaining` | `app/(main)/(rider)/active-subscription/index.tsx:95` | value also live via `wallet.calls_remaining`, `driver_home.calls_remaining` |
| `home.go_online` | `Go Online` | `app/(main)/(rider)/d/(tabs)/index.tsx:184` [comment], `app/(main)/(rider)/subscription-confirmation/index.tsx:31` | value also live via `driver_home.go_online`, `driver_home.go_online_label` |
| `home.welcome` | `Welcome back` | `app/(auth)/login.tsx:74` |  |
| `legal.effective_date` | `Effective Date` | `components/LegalDocumentScreen.tsx:78` |  |
| `notification.ride_offer` | `New Ride Offer` | `components/RideOfferSheet.tsx:286` |  |
| `packages.purchase_failed` | `Purchase failed` | `app/(main)/(rider)/packages.tsx:121` |  |
| `profile.my_vehicles` | `My Vehicles` | `app/(main)/(rider)/d/(tabs)/profile/index.tsx:41`, `app/(main)/(rider)/vehicle-management/index.tsx:140` |  |
| `profile.personal_profile` | `Personal Profile` | `app/(main)/(rider)/d/(tabs)/profile/index.tsx:40` |  |
| `profile.ratings` | `Ratings & Reviews` | `app/(main)/(rider)/d/(tabs)/profile/index.tsx:44`, `app/(main)/(rider)/ratings/index.tsx:92` |  |
| `ride.cancel` | `Cancel Ride` | `app/(main)/(rider)/cancellation-reasons/index.tsx:172` | value also live via `ride.cancel_ride`, `find_customer.cancel_ride` |
| `ride.on_the_way` | `On the way` | `app/track/[rideId].tsx:15` |  |
| `ride.ride_completed` | `Ride Completed` | `app/api/rental/bids/[id]/complete+api.ts:124` [api] [comment], `app/api/rental/bids/[id]/complete+api.ts:159` [api] | value also live via `finish_ride.ride_completed` |
| `ride.select_category` | `Please select a category` | `app/(main)/(rider)/contact-support/index.tsx:71`, `app/(main)/(rider)/trip-issue/index.tsx:40` |  |
| `settings.account_security` | `Account & Security` | `app/(main)/(rider)/settings/account-security/index.tsx:68`, `app/(main)/(rider)/settings/index.tsx:29` |  |
| `settings.min_rate` | `Minimum Rate` | `app/(main)/(rider)/min-rate/index.tsx:222`, `app/(main)/(rider)/settings/index.tsx:22` |  |
| `settings.payout_method` | `Payout Method` | `app/(main)/(rider)/onboarding/index.tsx:1039`, `app/(main)/(rider)/settings/index.tsx:23` | value also live via `driver.payout_method.title`, `wallet.payout_method` |
| `vehicle.add_vehicle` | `Add Vehicle` | `app/(main)/(rider)/add-vehicle/index.tsx:464` | value also live via `vehicle_select.add_vehicle` |
| `vehicle.vehicle_type` | `Vehicle Type` | `app/(main)/(customer)/(rental-bidder)/bid-submit.tsx:280`, `app/(main)/(fleet)/drivers/[id].tsx:347`, `app/(main)/(fleet)/drivers/[id].tsx:420`, `app/admin/fare-gate-metrics.tsx:599` [admin], `app/admin/packages.tsx:283` [admin], `app/admin/pricing.tsx:284` [admin], `app/admin/pricing.tsx:433` [admin] | value also live via `call_ledger.vehicle_type` |

### 1b. Single-token values (37 keys) — candidate class

A one-word value coinciding with another label is not proof — treat these as candidates. Sites capped at 3.

- `activity.schedule` = `Schedule` — 2 site(s): `app/(main)/(customer)/(rental-marketplace)/index.tsx:177`, `app/(main)/(rider)/d/(tabs)/activity/index.tsx:155`
- `app.name` = `Ride` — 14 site(s): `app/(auth)/phone-entry.tsx:120`, `app/(main)/(customer)/(tabs)/inbox/index.tsx:51`, `app/_layout.tsx:319` [comment] +11 more — also live via `fare_dispute.section_ride`, `lost_items.ride_fallback`, `activity_completed.ride`, `activity_scheduled.ride`, `rider_activity.ride`, `share_receipt.ride`, `ride_details_scheduled.ride`
- `call_ledger.tab_ledger` = `Ledger` — 5 site(s): `app/(main)/(rider)/call-ledger.tsx:133`, `app/(main)/(rider)/call-ledger.tsx:1125`, `app/(main)/(rider)/call-ledger.tsx:1131` +2 more
- `common.loading` = `Loading...` — 1 site(s): `app/(auth)/phone-entry.tsx:213`
- `common.search` = `Search` — 16 site(s): `app/(main)/(customer)/(shops)/index.tsx:46`, `app/(main)/(customer)/(shops)/index.tsx:117`, `app/(main)/(customer)/(shops)/index.tsx:125` +13 more
- `driver.activity` = `Activity` — 11 site(s): `app/(main)/(rider)/d/(tabs)/_layout.tsx:134`, `app/(main)/(rider)/d/(tabs)/activity/index.tsx:172`, `app/(main)/(rider)/d/(tabs)/profile/index.tsx:44` +8 more — also live via `tabs.activity`
- `driver.connected` = `Connected` — 1 site(s): `app/api/fleet/integrations+api.ts:37` [api] — also live via `linked_accounts.connected`
- `driver.earnings` = `Earnings` — 8 site(s): `app/(main)/(rider)/d/(tabs)/_layout.tsx:128`, `app/(main)/(rider)/d/(tabs)/earning/index.tsx:213`, `app/(main)/(rider)/earnings-detail/[date].tsx:114` +5 more — also live via `earnings.title`, `earnings_detail.title`
- `driver.expires` = `Expires` — 2 site(s): `app/admin/monitoring.tsx:439` [admin], `app/admin/promos.tsx:623` [admin] — also live via `wallet.expires`
- `driver.home` = `Home` — 14 site(s): `app/(main)/(customer)/(tabs)/home/index.tsx:937`, `app/(main)/(customer)/(tabs)/home/index.tsx:938`, `app/(main)/(customer)/(tabs)/home/index.tsx:1443` +11 more — also live via `tabs.home`, `rider_home.label_home`, `saved_addresses.label_home`
- `driver.pending` = `pending` — 60 site(s): `app/(main)/(customer)/(delivery)/request-detail.tsx:126`, `app/(main)/(rider)/d/(tabs)/index.tsx:515`, `app/(main)/(rider)/d/(tabs)/wallet/index.tsx:190` +57 more — also live via `call_ledger.pending`, `referral.pending`, `driver_history.status_pending`
- `driver.settings` = `Settings` — 6 site(s): `app/(main)/(rider)/d/(tabs)/profile/index.tsx:38`, `app/(main)/(rider)/settings/index.tsx:71`, `components/GlobalActionButtons.tsx:69` +3 more — also live via `settings.title`
- `driver.unlimited` = `Unlimited` — 3 site(s): `app/(main)/(rider)/active-subscription/index.tsx:96`, `app/admin/fleet-plans.tsx:281` [admin], `app/admin/fleet-plans.tsx:302` [admin] — also live via `wallet.unlimited`, `driver_home.unlimited`, `call_ledger.unlimited`
- `driver.wallet` = `Wallet` — 10 site(s): `app/(main)/(customer)/(tabs)/inbox/index.tsx:54`, `app/(main)/(rider)/d/(tabs)/_layout.tsx:18`, `app/(main)/(rider)/d/(tabs)/_layout.tsx:51` +7 more — also live via `wallet.title`
- `home.connected` = `Connected` — 1 site(s): `app/api/fleet/integrations+api.ts:37` [api] — also live via `linked_accounts.connected`
- `profile.documents` = `Documents` — 5 site(s): `app/(main)/(fleet)/drivers/[id].tsx:502`, `app/(main)/(fleet)/vehicles/[id].tsx:476`, `app/(main)/(rider)/d/(tabs)/profile/index.tsx:42` +2 more
- `profile.incentives` = `Incentives` — 3 site(s): `app/(main)/(rider)/d/(tabs)/profile/index.tsx:46`, `components/GlobalActionButtons.tsx:81`, `components/admin/AdminShell.tsx:164` — also live via `incentives.title`
- `profile.insurance` = `Insurance` — 1 site(s): `app/(main)/(rider)/d/(tabs)/profile/index.tsx:43`
- `profile.packages` = `Packages` — 3 site(s): `app/(main)/(rider)/d/(tabs)/profile/index.tsx:47`, `app/(main)/(rider)/settings/index.tsx:21`, `components/GlobalActionButtons.tsx:80`
- `profile.referral` = `Referral` — 3 site(s): `app/(main)/(rider)/d/(tabs)/profile/index.tsx:45`, `app/(main)/(rider)/referral/index.tsx:79`, `app/(main)/(rider)/settings/index.tsx:33` — also live via `rides_list.referral`
- `profile.safety` = `Safety` — 8 site(s): `app/(main)/(rider)/contact-support/index.tsx:26`, `app/(main)/(rider)/contact-support/index.tsx:26`, `app/(main)/(rider)/d/(tabs)/profile/index.tsx:48` +5 more — also live via `settings.safety`, `safety.title`
- `profile.section_activity` = `Activity` — 11 site(s): `app/(main)/(rider)/d/(tabs)/_layout.tsx:134`, `app/(main)/(rider)/d/(tabs)/activity/index.tsx:172`, `app/(main)/(rider)/d/(tabs)/profile/index.tsx:44` +8 more — also live via `tabs.activity`
- `profile.section_programs` = `Programs` — 17 site(s): `app/(main)/(rider)/d/(tabs)/profile/index.tsx:47`, `app/(main)/(rider)/d/(tabs)/profile/index.tsx:140`, `components/GlobalActionButtons.tsx:80` +14 more
- `profile.section_safety` = `Safety` — 8 site(s): `app/(main)/(rider)/contact-support/index.tsx:26`, `app/(main)/(rider)/contact-support/index.tsx:26`, `app/(main)/(rider)/d/(tabs)/profile/index.tsx:48` +5 more — also live via `settings.safety`, `safety.title`
- `profile.section_vehicles` = `Vehicles` — 35 site(s): `app/(main)/(fleet)/(tabs)/dashboard/index.tsx:185`, `app/(main)/(fleet)/(tabs)/operations/index.tsx:58`, `app/(main)/(fleet)/(tabs)/operations/index.tsx:82` +32 more
- `ride.completed` = `Completed` — 60 site(s): `app/(main)/(ambulance-driver)/index.tsx:196`, `app/(main)/(customer)/(ambulance)/emergency.tsx:34`, `app/(main)/(customer)/(ambulance)/emergency.tsx:79` +57 more — also live via `activity.completed`, `incentives.completed`, `driver_history.status_completed`
- `settings.auto_accept` = `Auto-Accept` — 1 site(s): `app/(main)/(rider)/settings/index.tsx:26`
- `settings.packages` = `Packages` — 3 site(s): `app/(main)/(rider)/d/(tabs)/profile/index.tsx:47`, `app/(main)/(rider)/settings/index.tsx:21`, `components/GlobalActionButtons.tsx:80`
- `settings.profile` = `Profile` — 10 site(s): `app/(main)/(fleet)/drivers/[id].tsx:325`, `app/(main)/(rider)/d/(tabs)/_layout.tsx:146`, `app/(main)/(rider)/edit-profile/index.tsx:118` +7 more — also live via `driver.profile`, `profile.title`
- `settings.referral` = `Referral` — 3 site(s): `app/(main)/(rider)/d/(tabs)/profile/index.tsx:45`, `app/(main)/(rider)/referral/index.tsx:79`, `app/(main)/(rider)/settings/index.tsx:33` — also live via `rides_list.referral`
- `settings.support` = `Support` — 9 site(s): `app/(main)/(rider)/settings/index.tsx:30`, `app/(main)/(rider)/settings/index.tsx:31`, `app/(main)/(rider)/settings/index.tsx:31` +6 more — also live via `profile.section_support`
- `tabs.earnings` = `Earnings` — 8 site(s): `app/(main)/(rider)/d/(tabs)/_layout.tsx:128`, `app/(main)/(rider)/d/(tabs)/earning/index.tsx:213`, `app/(main)/(rider)/earnings-detail/[date].tsx:114` +5 more — also live via `earnings.title`, `earnings_detail.title`
- `tabs.profile` = `Profile` — 10 site(s): `app/(main)/(fleet)/drivers/[id].tsx:325`, `app/(main)/(rider)/d/(tabs)/_layout.tsx:146`, `app/(main)/(rider)/edit-profile/index.tsx:118` +7 more — also live via `driver.profile`, `profile.title`
- `tabs.wallet` = `Wallet` — 10 site(s): `app/(main)/(customer)/(tabs)/inbox/index.tsx:54`, `app/(main)/(rider)/d/(tabs)/_layout.tsx:18`, `app/(main)/(rider)/d/(tabs)/_layout.tsx:51` +7 more — also live via `wallet.title`
- `vehicle.documents` = `Documents` — 5 site(s): `app/(main)/(fleet)/drivers/[id].tsx:502`, `app/(main)/(fleet)/vehicles/[id].tsx:476`, `app/(main)/(rider)/d/(tabs)/profile/index.tsx:42` +2 more
- `vehicle.model` = `Model` — 12 site(s): `app/(main)/(rider)/add-vehicle/index.tsx:342`, `app/(main)/(rider)/add-vehicle/index.tsx:498`, `app/(main)/(rider)/add-vehicle/index.tsx:509` +9 more
- `vehicle.year` = `Year` — 8 site(s): `app/(main)/(customer)/(tabs)/rides/index.tsx:125`, `app/(main)/(fleet)/vehicles/[id].tsx:275`, `app/(main)/(rider)/add-vehicle/index.tsx:342` +5 more

### 1c. Embedded-only (9 keys)

The value occurs only inside a longer source literal, on a word boundary. Several are clearly not UI copy — the container string shows which.

| Key | Value | Found inside | Site | Notes |
|---|---|---|---|---|
| `auth.login` | `Log In` | `start earning today. sign up or log in to continue.` | `app/(auth)/driver-welcome.tsx:27` |  |
| `auth.phone_entry` | `Enter your phone number` | `enter your phone number to receive otp` | `app/(auth)/forgot-password.tsx:171` |  |
| `driver.cancellation_credits` | `Cancellation Credits` | `cancellation credits fetch failed` | `app/(main)/(rider)/d/(tabs)/wallet/index.tsx:138` | live via `wallet.cancellation_credits` |
| `driver.go_offline` | `Go Offline` | `go online / go offline` | `app/(main)/(rider)/d/(tabs)/index.tsx:852` | live via `driver_home.go_offline` |
| `home.go_offline` | `Go Offline` | `go online / go offline` | `app/(main)/(rider)/d/(tabs)/index.tsx:852` | live via `driver_home.go_offline` |
| `home.recent_rides` | `Recent Rides` | `recent rides (last 20 with shadow data)` | `app/admin/fare-gate-metrics.tsx:668` [admin] |  |
| `settings.about` | `About` | `tell us more about the issue...` | `app/(main)/(rider)/report-issue/index.tsx:103` |  |
| `vehicle.photos` | `Photos` | `reference photos and video shown to drivers during onboarding` | `app/admin/sample-media.tsx:153` [admin] |  |
| `vehicle.registration_number` | `Registration Number` | `registration number already exists` | `app/api/fleet/vehicles+api.ts:184` [api] |  |

## 2. Copy the flows assert — 23 keys with an exact selector match

### 2a. Bare-literal assertions (11 keys) — flows depend on this exact copy

A bare literal (no `.*`, no alternation) is a real dependency: the screen must render that string. Where the value has a live twin, the assertion is satisfied by the twin's key; where it is hard-coded (§ 1a), the flow passes on non-i18n copy.

| Key | Value | Bare steps | Notes |
|---|---|---|---|
| `auth.get_started` | `Get Started` | `maestro/flows/auth/07-role-selector.yaml:26` (assertVisible) | hard-coded in source (§ 1a) |
| `driver.calls_remaining` | `Calls Remaining` | `maestro/flows/driver-core.yaml:36` (assertVisible), `maestro/flows/driver-core.yaml:85` (assertVisible), `maestro/flows/driver-purchase-package.yaml:62` (visible), `maestro/flows/driver-purchase-package.yaml:64` (assertVisible) | hard-coded in source (§ 1a); value also live via `wallet.calls_remaining`, `driver_home.calls_remaining` |
| `driver.connected` | `Connected` | `maestro/flows/driver-core.yaml:34` (visible) | source match is `[api]` only (server copy, not UI); value also live via `linked_accounts.connected`; the twin renders on a settings screen, not the driver home; the driver home's nearest string is `Last connected:` (`driver_home.last_connected`) — whether the `Connected` wait matches it depends on Maestro's case handling; device check |
| `driver.go_offline` | `Go Offline` | `maestro/flows/driver-go-online.yaml:30` (visible), `maestro/flows/driver-go-online.yaml:32` (assertVisible), `maestro/flows/shared/driver/_go-offline.yaml:9` (visible), `maestro/flows/shared/driver/_go-online.yaml:27` (visible) | value also live via `driver_home.go_offline` |
| `driver.go_online` | `Go Online` | `maestro/flows/driver-go-online.yaml:18` (assertVisible), `maestro/flows/shared/driver/_go-offline.yaml:16` (visible), `maestro/flows/shared/driver/_go-online.yaml:15` (visible) | hard-coded in source (§ 1a); value also live via `driver_home.go_online`, `driver_home.go_online_label` |
| `home.calls_remaining` | `Calls Remaining` | `maestro/flows/driver-core.yaml:36` (assertVisible), `maestro/flows/driver-core.yaml:85` (assertVisible), `maestro/flows/driver-purchase-package.yaml:62` (visible), `maestro/flows/driver-purchase-package.yaml:64` (assertVisible) | hard-coded in source (§ 1a); value also live via `wallet.calls_remaining`, `driver_home.calls_remaining` |
| `home.connected` | `Connected` | `maestro/flows/driver-core.yaml:34` (visible) | source match is `[api]` only (server copy, not UI); value also live via `linked_accounts.connected`; the twin renders on a settings screen, not the driver home; the driver home's nearest string is `Last connected:` (`driver_home.last_connected`) — whether the `Connected` wait matches it depends on Maestro's case handling; device check |
| `home.go_offline` | `Go Offline` | `maestro/flows/driver-go-online.yaml:30` (visible), `maestro/flows/driver-go-online.yaml:32` (assertVisible), `maestro/flows/shared/driver/_go-offline.yaml:9` (visible), `maestro/flows/shared/driver/_go-online.yaml:27` (visible) | value also live via `driver_home.go_offline` |
| `home.go_online` | `Go Online` | `maestro/flows/driver-go-online.yaml:18` (assertVisible), `maestro/flows/shared/driver/_go-offline.yaml:16` (visible), `maestro/flows/shared/driver/_go-online.yaml:15` (visible) | hard-coded in source (§ 1a); value also live via `driver_home.go_online`, `driver_home.go_online_label` |
| `home.welcome` | `Welcome back` | `maestro/flows/auth-flow.yaml:33` (visible), `maestro/flows/rider-login-only.yaml:22` (visible), `maestro/flows/rider-login-v2.yaml:19` (visible), `maestro/flows/shared/auth/_login-driver.yaml:34` (visible), `maestro/flows/shared/auth/_login-rider.yaml:43` (visible) | hard-coded in source (§ 1a) |
| `notification.ride_offer` | `New Ride Offer` | `maestro/flows/driver-core.yaml:39` (visible), `maestro/flows/driver-core.yaml:41` (assertVisible), `maestro/flows/driver/rides/01-offer-sheet-renders.yaml:20` (visible), `maestro/flows/shared/driver/_accept-ride.yaml:11` (visible) | hard-coded in source (§ 1a) |

### 2b. Wildcard-only exact matches (12 keys)

The claim was a regex (`.*X.*`) or alternation, normalised to the value — the flow asserts a *pattern*, not this copy. Kept for completeness; no action implied except where noted.

- `activity.schedule` = `Schedule` — 2 step(s), e.g. `maestro/flows/marketplace/v2-rental/01-request-to-award.yaml:45` (visible), `maestro/flows/marketplace/v7-ambulance/02-scheduled-ambulance.yaml:20` (tapOn)
- `auth.login` = `Log In` — 2 step(s), e.g. `maestro/flows/auth/08-logout.yaml:18` (assertVisible), `maestro/flows/shared/auth/_logout.yaml:23` (visible) — **stale**: login screen renders "Login" (`app/(auth)/login.tsx:138`), never "Log In"; `.*Log In.*` cannot match it
- `auth.phone_entry` = `Enter your phone number` — 4 step(s), e.g. `maestro/flows/auth/06-otp-wrong-code.yaml:16` (visible), `maestro/flows/auth/07-role-selector.yaml:25` (assertVisible) +2 more
- `common.sign_out` = `Sign Out` — 1 step(s), e.g. `maestro/flows/shared/auth/_logout.yaml:15` (visible)
- `driver.home` = `Home` — 2 step(s), e.g. `maestro/flows/rider/home/01-map-loads.yaml:22` (assertVisible), `maestro/flows/shared/completion/_cancel-ride-rider.yaml:23` (visible)
- `driver.pending` = `pending` — 5 step(s), e.g. `maestro/flows/marketplace/v3-shops/01-order-rfq-accept.yaml:51` (visible), `maestro/flows/marketplace/v4-food/01-food-to-bridge-to-courier.yaml:35` (visible) +3 more
- `driver.settings` = `Settings` — 2 step(s), e.g. `maestro/flows/shared/util/_open-driver-settings.yaml:8` (visible), `maestro/flows/shared/util/_open-driver-settings.yaml:10` (tapOn)
- `driver.top_up` = `Top Up` — 1 step(s), e.g. `maestro/flows/shared/payment/_wallet-topup.yaml:20` (visible)
- `ride.completed` = `Completed` — 1 step(s), e.g. `maestro/flows/rider/activity/01-rides-history-all.yaml:20` (visible)
- `ride.on_the_way` = `On the way` — 3 step(s), e.g. `maestro/flows/marketplace/v4-food/01-food-to-bridge-to-courier.yaml:55` (visible), `maestro/flows/marketplace/v6-delivery/01-parcel-bid-legs.yaml:44` (visible) +1 more
- `settings.profile` = `Profile` — 1 step(s), e.g. `maestro/flows/driver-onboarding.yaml:78` (assertVisible)
- `tabs.profile` = `Profile` — 1 step(s), e.g. `maestro/flows/driver-onboarding.yaml:78` (assertVisible)

### 2c. Weak tiers — advisory only

Beyond the exact matches, 37 more keys have only fragment/wrap hits (a flow candidate is a fragment of the value, or a wildcard claim wraps it). Measured examples are generic fragments (`completed`, `driver`, `cancel`) inside alternation regexes — no copy dependency. Not listed.

## 3. No surviving reference — 25 keys

### 3a. Fully dead strings (17)

No source match, no flow match, no live twin. Purge candidates — subject to the dynamic-copy caveat in § Method (interpolated or data-driven strings are invisible to this sweep).

- `common.no_data` = `No data available`
- `common.pull_to_refresh` = `Pull to refresh`
- `driver.document_expired` = `Document expiring soon`
- `driver.set_goal` = `Set Daily Earnings Goal`
- `earnings.goal_range` = `Goal must be between ৳100 and ৳50,000`
- `earnings.set_goal` = `Set goal`
- `home.fetching` = `Locating you...`
- `home.no_recent_rides` = `No recent rides found`
- `legal.revision_date` = `Last Revised`
- `notification.document_expiry` = `Document Expiring`
- `notification.package_expiring` = `Package Expiring`
- `ride.describe_the_issue` = `Please describe the issue`
- `ride.share_trip` = `Share Trip`
- `safety.add_contacts` = `Add Contacts`
- `safety.no_alerts` = `No recent alerts`
- `vehicle.expiry_warning` = `Document expiring soon`
- `vehicle.manufacturer` = `Manufacturer`

### 3b. Duplicates of a live value (8)

The key is unreferenced, but its exact value renders through another key; deleting the key loses nothing user-visible.

- `driver.active_package` = `Active Package` — live via `wallet.active_package`
- `driver.daily_goal` = `Daily Goal` — live via `earnings.daily_goal`
- `driver.goal_reached` = `Goal reached!` — live via `earnings.goal_reached`
- `driver.outstanding_dues` = `Outstanding Dues` — live via `wallet.outstanding_dues`
- `driver.recent_transactions` = `Recent Transactions` — live via `wallet.recent_transactions`
- `driver.reconnecting` = `Reconnecting…` — live via `driver_home.reconnecting`
- `earnings.earnings_overview` = `Earnings Overview` — live via `earnings.overview`
- `ride.dispute_fare` = `Dispute this fare` — live via `rides_list.a11y_dispute_fare`, `ride_detail.dispute_a11y`

## 4. Deleted-screen set survivors (context for the pending purge)

**38 of the 106** deleted-screen keys still have a surviving reference: 36 source-exact, 5 flow-exact (3 keys have both). This does not change the purge: none of these references depends on the key — the strings render from source/live keys and the flows match rendered text. The table documents where the copy survives so nothing is lost by accident.

| Key | Value | Source | Flow | Twin |
|---|---|---|---|---|
| `confirm_ride.base_fare` | `Base fare` | `app/admin/pricing.tsx:302` [admin], `components/DriverPricingReference.tsx:134`, `components/FareBreakdownSheet.tsx:24` | — | `rides_list.base_fare`, `ride_detail.base_fare` |
| `confirm_ride.distance` | `Distance` | `components/DriverPricingReference.tsx:156` | — | `finish_ride.distance`, `rides_list.distance` |
| `confirm_ride.dropoff` | `Drop-off` | — | `maestro/flows/shared/driver/_complete-stop.yaml:12` (visible) | `activity.drop_off` |
| `confirm_ride.duration` | `Duration` | — | `maestro/flows/marketplace/v2-rental/01-request-to-award.yaml:45` (visible) | `finish_ride.duration` |
| `confirm_ride.network_error` | `Network error. Please try again.` | `app/(auth)/phone-entry.tsx:60`, `app/(auth)/phone-entry.tsx:101`, `app/(main)/(fleet)/subscription.tsx:153` | — | `common.network_error`, `change_password.err_network`, `driver_home.network_error`, `rider_home.network_error`, `saved_addresses.network_error`, `emergency_contacts.network_error`, `fare_dispute.network_error` |
| `confirm_ride.pickup` | `Pickup` | `app/(main)/(customer)/(rental-bidder)/bid-submit.tsx:43`, `app/(main)/(customer)/(rental-bidder)/index.tsx:285`, `app/(main)/(customer)/(shops)/order-create/[id].tsx:110` +19 more | `maestro/flows/marketplace/v5-truck/01-catalog-picker-request.yaml:27` (visible), `maestro/flows/marketplace/v5-truck/01-catalog-picker-request.yaml:30` (assertVisible), `maestro/flows/marketplace/v6-delivery/01-parcel-bid-legs.yaml:29` (visible) | `activity.pickup`, `rider_home.pickup`, `earnings_detail.pickup`, `ride_detail.pickup`, `schedule_ride.pickup` |
| `confirm_ride.pickup_fee` | `Pickup fee` | `components/DriverPricingReference.tsx:192`, `components/FareBreakdownSheet.tsx:43`, `components/FareBreakdownSheet.tsx:143` +1 more | — | `ride_detail.pickup_fee` |
| `confirm_ride.schedule_for_later` | `Schedule for later` | `app/(main)/(customer)/(rental-marketplace)/index.tsx:514` | — | `schedule_ride.schedule_for_later`, `no_drivers_available.schedule_for_later` |
| `confirm_ride.schedule_ride` | `Schedule ride` | `components/GlobalActionButtons.tsx:63`, `components/ScheduleRideSheet.tsx:263` | — | `schedule_ride.title`, `schedule_ride.schedule_ride` |
| `confirm_ride.tip` | `Tip` | `app/(main)/(fleet)/trips/[id].tsx:142` | `maestro/flows/shared/completion/_add-tip-post-ride.yaml:10` (visible), `maestro/flows/shared/completion/_add-tip-post-ride.yaml:10` (visible) | `ride_detail.tip` |
| `confirm_ride.total` | `Total` | `app/(main)/(customer)/(shops)/order-create/[id].tsx:239`, `components/FareBreakdownSheet.tsx:62`, `components/FareBreakdownSheet.tsx:95` | — | `ride_detail.total` |
| `confirm_ride.vehicle_bike_basic` | `Bike Basic` | `app/(main)/(fleet)/(tabs)/operations/index.tsx:64`, `app/(main)/(fleet)/drivers/[id].tsx:38`, `app/(main)/(fleet)/vehicles/[id].tsx:40` +2 more | — | `schedule_ride.vehicle_bike_basic` |
| `confirm_ride.vehicle_bike_plus` | `Bike Plus` | `app/(main)/(fleet)/(tabs)/operations/index.tsx:66`, `app/(main)/(fleet)/drivers/[id].tsx:40`, `app/(main)/(fleet)/vehicles/[id].tsx:42` +2 more | — | `schedule_ride.vehicle_bike_plus` |
| `confirm_ride.vehicle_bike_standard` | `Bike Standard` | `app/(main)/(fleet)/(tabs)/operations/index.tsx:65`, `app/(main)/(fleet)/drivers/[id].tsx:39`, `app/(main)/(fleet)/vehicles/[id].tsx:41` +3 more | — | `schedule_ride.vehicle_bike_standard` |
| `confirm_ride.vehicle_car_comfort` | `Car Comfort` | `app/(main)/(fleet)/(tabs)/operations/index.tsx:70`, `app/(main)/(fleet)/drivers/[id].tsx:44`, `app/(main)/(fleet)/vehicles/[id].tsx:46` +1 more | — | `schedule_ride.vehicle_car_comfort` |
| `confirm_ride.vehicle_car_compact` | `Car Compact` | `app/(main)/(fleet)/(tabs)/operations/index.tsx:68`, `app/(main)/(fleet)/drivers/[id].tsx:42`, `app/(main)/(fleet)/vehicles/[id].tsx:44` +1 more | — | `schedule_ride.vehicle_car_compact` |
| `confirm_ride.vehicle_car_economy` | `Car Economy` | `app/(main)/(fleet)/(tabs)/operations/index.tsx:69`, `app/(main)/(fleet)/drivers/[id].tsx:43`, `app/(main)/(fleet)/vehicles/[id].tsx:45` +1 more | — | `schedule_ride.vehicle_car_economy` |
| `confirm_ride.vehicle_car_premium` | `Car Premium` | `app/(main)/(fleet)/(tabs)/operations/index.tsx:71`, `app/(main)/(fleet)/drivers/[id].tsx:45`, `app/(main)/(fleet)/vehicles/[id].tsx:47` +1 more | — | `schedule_ride.vehicle_car_premium` |
| `confirm_ride.vehicle_car_xl` | `Car XL` | `app/(main)/(fleet)/(tabs)/operations/index.tsx:72`, `app/(main)/(fleet)/drivers/[id].tsx:46`, `app/(main)/(fleet)/vehicles/[id].tsx:48` +1 more | — | `schedule_ride.vehicle_car_xl` |
| `confirm_ride.vehicle_cng` | `CNG` | `app/(main)/(customer)/(delivery)/request-create.tsx:24`, `app/(main)/(customer)/(delivery)/request-create.tsx:24`, `app/(main)/(customer)/(tabs)/home/index.tsx:70` +21 more | — | `schedule_ride.vehicle_cng` |
| `confirm_ride.wallet_credit` | `Wallet Credit` | `app/(main)/(customer)/(tabs)/wallet/index.tsx:87`, `app/admin/point-offers.tsx:50` [admin], `app/admin/point-offers.tsx:319` [admin] | — | `rider_wallet.txn_wallet_credit` |
| `find_ride.category_bike` | `Bike` | `app/(main)/(customer)/(delivery)/request-create.tsx:23`, `app/(main)/(customer)/(delivery)/request-create.tsx:23`, `app/(main)/(customer)/(tabs)/home/index.tsx:69` +11 more | — | — |
| `find_ride.category_car` | `Car` | `app/(auth)/walkthrough-1.tsx:27`, `app/(auth)/welcome.tsx:55`, `app/(main)/(customer)/(delivery)/request-create.tsx:24` +32 more | — | — |
| `find_ride.category_cng` | `CNG` | `app/(main)/(customer)/(delivery)/request-create.tsx:24`, `app/(main)/(customer)/(delivery)/request-create.tsx:24`, `app/(main)/(customer)/(tabs)/home/index.tsx:70` +21 more | — | `schedule_ride.vehicle_cng` |
| `find_ride.destination` | `Destination` | `app/(main)/(customer)/(tabs)/home/index.tsx:283`, `app/(main)/(customer)/(tabs)/home/index.tsx:316`, `app/(main)/(customer)/(tabs)/home/index.tsx:656` +3 more | — | `ride_detail.destination`, `schedule_ride.destination`, `driver_history.destination` |
| `find_ride.enter_destination` | `Where to?` | `components/BarikoiAutocomplete.tsx:140` | — | `home.search_destination`, `rider_home.enter_destination` |
| `find_ride.location_unavailable` | `Location unavailable` | `app/track/[rideId].tsx:149` | — | — |
| `find_ride.pickup` | `Pickup` | `app/(main)/(customer)/(rental-bidder)/bid-submit.tsx:43`, `app/(main)/(customer)/(rental-bidder)/index.tsx:285`, `app/(main)/(customer)/(shops)/order-create/[id].tsx:110` +19 more | `maestro/flows/marketplace/v5-truck/01-catalog-picker-request.yaml:27` (visible), `maestro/flows/marketplace/v5-truck/01-catalog-picker-request.yaml:30` (assertVisible), `maestro/flows/marketplace/v6-delivery/01-parcel-bid-legs.yaml:29` (visible) | `activity.pickup`, `rider_home.pickup`, `earnings_detail.pickup`, `ride_detail.pickup`, `schedule_ride.pickup` |
| `find_ride.use_current_location` | `Current location` | `app/(main)/(customer)/(tabs)/home/index.tsx:243` | — | `services_hub.current_location`, `rider_home.current_location`, `rider_home.current_location_placeholder`, `schedule_ride.current_location` |
| `find_ride.vehicle_bike_basic` | `Bike Basic` | `app/(main)/(fleet)/(tabs)/operations/index.tsx:64`, `app/(main)/(fleet)/drivers/[id].tsx:38`, `app/(main)/(fleet)/vehicles/[id].tsx:40` +2 more | — | `schedule_ride.vehicle_bike_basic` |
| `find_ride.vehicle_bike_plus` | `Bike Plus` | `app/(main)/(fleet)/(tabs)/operations/index.tsx:66`, `app/(main)/(fleet)/drivers/[id].tsx:40`, `app/(main)/(fleet)/vehicles/[id].tsx:42` +2 more | — | `schedule_ride.vehicle_bike_plus` |
| `find_ride.vehicle_bike_standard` | `Bike Standard` | `app/(main)/(fleet)/(tabs)/operations/index.tsx:65`, `app/(main)/(fleet)/drivers/[id].tsx:39`, `app/(main)/(fleet)/vehicles/[id].tsx:41` +3 more | — | `schedule_ride.vehicle_bike_standard` |
| `find_ride.vehicle_car_comfort` | `Car Comfort` | `app/(main)/(fleet)/(tabs)/operations/index.tsx:70`, `app/(main)/(fleet)/drivers/[id].tsx:44`, `app/(main)/(fleet)/vehicles/[id].tsx:46` +1 more | — | `schedule_ride.vehicle_car_comfort` |
| `find_ride.vehicle_car_compact` | `Car Compact` | `app/(main)/(fleet)/(tabs)/operations/index.tsx:68`, `app/(main)/(fleet)/drivers/[id].tsx:42`, `app/(main)/(fleet)/vehicles/[id].tsx:44` +1 more | — | `schedule_ride.vehicle_car_compact` |
| `find_ride.vehicle_car_economy` | `Car Economy` | `app/(main)/(fleet)/(tabs)/operations/index.tsx:69`, `app/(main)/(fleet)/drivers/[id].tsx:43`, `app/(main)/(fleet)/vehicles/[id].tsx:45` +1 more | — | `schedule_ride.vehicle_car_economy` |
| `find_ride.vehicle_car_premium` | `Car Premium` | `app/(main)/(fleet)/(tabs)/operations/index.tsx:71`, `app/(main)/(fleet)/drivers/[id].tsx:45`, `app/(main)/(fleet)/vehicles/[id].tsx:47` +1 more | — | `schedule_ride.vehicle_car_premium` |
| `find_ride.vehicle_car_xl` | `Car XL` | `app/(main)/(fleet)/(tabs)/operations/index.tsx:72`, `app/(main)/(fleet)/drivers/[id].tsx:46`, `app/(main)/(fleet)/vehicles/[id].tsx:48` +1 more | — | `schedule_ride.vehicle_car_xl` |
| `find_ride.vehicle_cng` | `CNG` | `app/(main)/(customer)/(delivery)/request-create.tsx:24`, `app/(main)/(customer)/(delivery)/request-create.tsx:24`, `app/(main)/(customer)/(tabs)/home/index.tsx:70` +21 more | — | `schedule_ride.vehicle_cng` |

## 5. Method & limits

- **Orphan list:** `node scripts/audit-i18n-orphans.cjs --json` (2026-10-04 run: 236 orphans, 133 shielded, 0 missing, 0 parity). This sweep consumes that JSON; it does not re-derive reachability.
- **Source corpus** (mirrors `maestro/tools/flow-xcheck.cjs`): string literals `(["'`])([^"'`$\n]{2,80})\1` plus JSX text nodes `>([^<>{}]{2,80})<`, harvested from every `.tsx|ts|jsx|js` under `app/` + `components/` (comments length-preserving-stripped for JSX text only). `norm()` = lowercase + whitespace collapse + trim.
- **Embedded tier:** the value occurs inside a longer harvested string on a word boundary (`[^a-z0-9]` on both sides). Exact means equality after `norm()`.
- **Flow claims** (mirrors flow-xcheck): the `assertVisible | extendedWaitUntil | waitUntil | notVisible | assertNotVisible | visible | tapOn` line scan over all 101 flows, `${`-interpolated claims skipped, candidate prep = strip parens, split `|`, strip leading/trailing `.*`, strip regex chars, norm, length ≥ 3. **Bare** = the raw claim contains none of `* ? | [ ] ( ) { } ^ $ \`.
- **Site flags:** `[api]` = `app/api/**` (server copy, not UI), `[admin]` = `app/admin/**` (admin web), `[comment]` = the matched line starts with `//`, `*` or `/*`. Literals are harvested from raw source, so comment text can register (same as flow-xcheck).
- **Table caps:** phrase-class tables list every site; single-token and deleted-set rows cap sites at 3; § 2b lists 2 examples per key. The full site set is reproducible from the sweep.
- **Limits:** dynamic copy is invisible — `t(\`ns.${x}\`)`, data-driven strings, server-injected labels and OS dialogs cannot be matched; nested `waitUntil.visible` mappings are not parsed by the flat line scan; `${}`-interpolated assertions are skipped; single-token classes carry coincidental matches by construction. The count is a floor, not a ceiling.

## 6. Recommended follow-ups (owner calls)

1. **Wire or delete.** § 1a is the actionable list: 43 phrase-shaped strings are hard-coded while their keys sit unused in both locales. The cheapest fix per screen is deleting the orphan keys where the hard-coded copy is intended (driver profile MENU, driver-home demand labels, DriverStatusGuard statuses) and wiring the auth screens (the 7 orphaned auth.* keys across phone-entry, welcome, forgot-password and login) if i18n is expected there.
2. **Flow hygiene.** The 11 bare assertions in § 2a ride on hard-coded copy or duplicate keys; where a stable testID exists (or can be added), prefer it, as with the B-4 sweep. `auth.login` (§ 2b) is stale and should be repointed.
3. **Device check.** `driver.connected` / `home.connected` (`Connected`) have no static render source on the driver home; confirm what the driver-core wait actually matches before touching it.
4. **Purge list.** § 3a (17 fully dead) + § 3b (8 duplicates) are safe-delete candidates after a copy review; § 4 shows the deleted-screen purge is unaffected by survivors.
5. **Optional hardening.** Orphaned keys are now a known defect class (B-1/B-4 flow side; this report the key side). A permanent version of this sweep as an audit script — or a gate tier — needs an owner ruling, as with the orphan audit itself.

---

Generated 2026-10-04 from `node scripts/audit-i18n-orphans.cjs --json` + the one-off sweep described in § Method. No code, locale, flow or config file was modified.
