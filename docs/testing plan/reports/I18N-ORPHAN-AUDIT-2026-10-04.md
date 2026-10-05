**Purpose:**     Explicit i18n orphan sweep — every locale key with zero references of any kind in the runtime UI tree, so orphaned keys (confirm_ride.*, find_ride.*, …) are found by audit, not by accident.
**Owner:**       Testing/QA tooling (maintainer of `scripts/audit-i18n-orphans.cjs`)
**Status:**      ACTIVE
**Source of truth:** `scripts/audit-i18n-orphans.cjs` — the AST resolver that produced this report; this file is the dated record of one run, not the mechanism.
**Related (concrete paths):**
  - `scripts/audit-i18n-orphans.cjs` — the resolver + gate (scope, evidence tiers, `--json`, `--gate`)
  - `scripts/i18n-orphan-baseline.json` — the ratchet: the 130 grandfathered keys `--gate` blocks against (236 at introduction; 106 purged later on 2026-10-04; a second dead-screen deletion the same day purged its 17 new keys without touching the baseline)
  - `tests/meta/audit-i18n-orphans.test.ts` — its fault-injection proof suite (38 tests)
  - `docs/testing plan/reports/I18N-ORPHAN-RESOLUTION-EXTENSION-2026-10-04.md` — the later same-day resolver extension (imports, callback bindings, const chains) and its before/after numbers
  - `i18n/locales/en/common.json` + `i18n/locales/bn/common.json` — the key space (1,347 keys each after the same-day purges; 1,470 as of this run)
  - `docs/testing plan/reports/DEAD-SCREEN-AUDIT-2026-10-04.md` — the screen-side counterpart (which screens nothing links to)
  - `docs/testing plan/reports/I18N-ORPHAN-REFERENCE-SWEEP-2026-10-04.md` — the orphan-key reference sweep (which dead values app source still hard-codes / flows still assert)
  - `maestro/tools/flow-testid-map.json` — carries the deleted-screen DEAD notes this sweep cross-checks
**Last verified:** 2026-10-04 — `node scripts/audit-i18n-orphans.cjs` exit 0; numbers below are that run.
**How to update:** re-run the sweep and regenerate; never hand-edit a key list in this file.

---

# i18n orphan sweep — 2026-10-04

Command: `node scripts/audit-i18n-orphans.cjs` (`--json` for machines).

## Verdict

| Bucket | Keys | Meaning |
|---|---|---|
| **ORPHANED** | **236** | present in en and bn, **zero references of any kind** |
| SHIELDED | 133 | reachable only through dynamic evidence (reason + site listed below) |
| MISSING | 0 | referenced statically but absent from en |
| PARITY | 0 | en/bn divergence |

Scan: **334 runtime files** (app/** + components/**, minus app/api, __tests__, *.test.*, *.d.ts) — 1,419 static calls, 45 dynamic calls (21 unresolved).

> **Resolver extension (later on 2026-10-04).** Imported key tables, iteration-callback parameter
> bindings, and transitive const chains were added after this run. The post-extension run reports
> **10 unresolved** dynamic sites and a **41-key** file-fallback bucket; the per-key reasons in
> this file are the original run's. See `I18N-ORPHAN-RESOLUTION-EXTENSION-2026-10-04.md`.

## Gate (added 2026-10-04)

`node scripts/audit-i18n-orphans.cjs --gate` (also `npm run check:i18n-orphans`, a step in the CI `test` job) fails with exit 2 on any orphan NOT listed in `scripts/i18n-orphan-baseline.json`, which grandfathers all 236 keys above. The baseline is a ratchet — it should only shrink; baselined keys that are no longer orphaned are reported but do not block, and a missing/malformed baseline fails loudly instead of treating the whole backlog as new.

All 236 orphaned keys exist in **both** locales (verified: every orphan reports [en, bn]); MISSING and PARITY are empty — the en/bn key sets are identical.

## The deleted-screen regression set (screens deleted 2026-10-03)

These are the keys the sweep exists to keep visible. Each namespace below is **fully orphaned** — the screens that rendered them are gone.

| Namespace | Orphaned keys |
|---|---|
| `confirm_ride.*` — deleted screen (757 lines) | 58 |
| `find_ride.*` — deleted screen (650 lines) | 36 |
| `apply_promos.*` — deleted screen (220 lines) | 11 |
| `ride.request` — key owned by the deleted flow | 1 |
| **Total** | **106** |

Purge of this set was a separate owner pass (called out since 2026-10-03). **Done later the same day:** all 106 were removed from both locales and the baseline moved 236 → 130 entries (locales 1,470 → 1,364 flat keys each) via `node scripts/purge-orphan-keys.cjs confirm_ride find_ride apply_promos ride.request`; the numbers in this file are the earlier pre-purge run's record. See §Deleting a screen of `docs/testing plan/reports/DEAD-SCREEN-AUDIT-2026-10-04.md`.

## Suspects named in earlier reports — settled explicitly

### `schedule_ride.*` — **NOT orphaned** (31/31 keys referenced)

The namespace was cited as dead in early notes (flow-testid-map DEAD entry, a flow header) and flagged as *candidates* by a naive literal sweep — because 9 of its keys are referenced only through a resolved table. The explicit audit settles it: **0 orphans**. Breakdown of the 31 keys:

- **22 referenced directly** — `t('schedule_ride.…')` in app/(main)/(customer)/schedule-ride/index.tsx and components/ScheduleRideSheet.tsx;
- **9 reachable through dynamic evidence** (listed in the SHIELDED section): `t(VEHICLE_TYPE_LABEL_KEYS[vt.key])` resolves to the file-local table at schedule-ride/index.tsx:30;
- 0 orphaned, 0 missing.

The false "schedule_ride.* is orphaned" claims were corrected in the 2026-10-04 B-3 pass; this table is the durable record.

### `confirm_ride.*` — fully orphaned

**58 of 58** keys have no reference; the screen was deleted 2026-10-03. Same for find_ride.* (36/36) and apply_promos.* (11/11).

## ORPHANED — 236 keys, grouped by namespace

Namespace census (count of orphaned keys):

| Namespace | Orphans |
|---|---|
| `confirm_ride` | 58 |
| `driver` | 36 |
| `find_ride` | 36 |
| `profile` | 13 |
| `vehicle` | 12 |
| `apply_promos` | 11 |
| `home` | 10 |
| `ride` | 10 |
| `settings` | 9 |
| `auth` | 7 |
| `common` | 7 |
| `notification` | 4 |
| `activity` | 3 |
| `driver_home` | 3 |
| `earnings` | 3 |
| `tabs` | 3 |
| `earnings_detail` | 2 |
| `legal` | 2 |
| `safety` | 2 |
| `wallet` | 2 |
| `app` | 1 |
| `call_ledger` | 1 |
| `packages` | 1 |

### confirm_ride — 58

- `confirm_ride.a11y_consent_sms`
- `confirm_ride.a11y_disable_schedule_later`
- `confirm_ride.a11y_enable_schedule_later`
- `confirm_ride.add_stop`
- `confirm_ride.amount_off`
- `confirm_ride.available_discounts`
- `confirm_ride.base_fare`
- `confirm_ride.book_for_other`
- `confirm_ride.consent_checkbox`
- `confirm_ride.consent_message`
- `confirm_ride.consent_required`
- `confirm_ride.could_not_find_driver`
- `confirm_ride.distance`
- `confirm_ride.dropoff`
- `confirm_ride.duration`
- `confirm_ride.enter_passenger_name_phone`
- `confirm_ride.est`
- `confirm_ride.estimated`
- `confirm_ride.from_cashback`
- `confirm_ride.hours`
- `confirm_ride.intro_bonus`
- `confirm_ride.mins`
- `confirm_ride.minutes`
- `confirm_ride.missing_location_or_vehicle`
- `confirm_ride.network_error`
- `confirm_ride.not_authenticated`
- `confirm_ride.not_available`
- `confirm_ride.pass_discount`
- `confirm_ride.passenger_name`
- `confirm_ride.passenger_phone`
- `confirm_ride.pending_cancellation_fee`
- `confirm_ride.percent_off`
- `confirm_ride.pickup`
- `confirm_ride.pickup_at`
- `confirm_ride.pickup_fee`
- `confirm_ride.prefer_female_driver`
- `confirm_ride.promo_discount`
- `confirm_ride.request_failed`
- `confirm_ride.requesting`
- `confirm_ride.schedule_for_later`
- `confirm_ride.schedule_ride`
- `confirm_ride.seats`
- `confirm_ride.stop_label`
- `confirm_ride.tip`
- `confirm_ride.title`
- `confirm_ride.total`
- `confirm_ride.traffic_warning`
- `confirm_ride.validation`
- `confirm_ride.vehicle_bike_basic`
- `confirm_ride.vehicle_bike_plus`
- `confirm_ride.vehicle_bike_standard`
- `confirm_ride.vehicle_car_comfort`
- `confirm_ride.vehicle_car_compact`
- `confirm_ride.vehicle_car_economy`
- `confirm_ride.vehicle_car_premium`
- `confirm_ride.vehicle_car_xl`
- `confirm_ride.vehicle_cng`
- `confirm_ride.wallet_credit`

### driver — 36

- `driver.account_suspended`
- `driver.active_package`
- `driver.activity`
- `driver.calls_remaining`
- `driver.cancellation_credits`
- `driver.check_status`
- `driver.commission_owed`
- `driver.connected`
- `driver.contact_support`
- `driver.daily_goal`
- `driver.document_expired`
- `driver.documents_rejected`
- `driver.earnings`
- `driver.expires`
- `driver.go_offline`
- `driver.go_online`
- `driver.goal_reached`
- `driver.home`
- `driver.loading_profile`
- `driver.no_trips`
- `driver.no_withdrawals`
- `driver.outstanding_dues`
- `driver.pending`
- `driver.recent_transactions`
- `driver.reconnecting`
- `driver.reupload_documents`
- `driver.set_goal`
- `driver.settings`
- `driver.top_up`
- `driver.total_earnings`
- `driver.trip_history_placeholder`
- `driver.unlimited`
- `driver.vehicle_expired`
- `driver.verification_pending`
- `driver.verification_pending_desc`
- `driver.wallet`

### find_ride — 36

- `find_ride.add_stop`
- `find_ride.category_bike`
- `find_ride.category_car`
- `find_ride.category_cng`
- `find_ride.choose_a_ride`
- `find_ride.confirm_ride`
- `find_ride.destination`
- `find_ride.enter_destination`
- `find_ride.enter_or_choose_location`
- `find_ride.eta_min`
- `find_ride.failed_to_fetch_estimates`
- `find_ride.finding_vehicles`
- `find_ride.get_my_location`
- `find_ride.getting_location`
- `find_ride.gps_unavailable`
- `find_ride.gps_unavailable_message`
- `find_ride.location_permission_required`
- `find_ride.location_unavailable`
- `find_ride.location_unavailable_message`
- `find_ride.no_vehicles_route`
- `find_ride.permission_denied`
- `find_ride.pickup`
- `find_ride.seats_eta`
- `find_ride.set_route_to_see_fares`
- `find_ride.stop_number`
- `find_ride.title`
- `find_ride.use_current_location`
- `find_ride.vehicle_bike_basic`
- `find_ride.vehicle_bike_plus`
- `find_ride.vehicle_bike_standard`
- `find_ride.vehicle_car_comfort`
- `find_ride.vehicle_car_compact`
- `find_ride.vehicle_car_economy`
- `find_ride.vehicle_car_premium`
- `find_ride.vehicle_car_xl`
- `find_ride.vehicle_cng`

### profile — 13

- `profile.documents`
- `profile.incentives`
- `profile.insurance`
- `profile.my_vehicles`
- `profile.packages`
- `profile.personal_profile`
- `profile.ratings`
- `profile.referral`
- `profile.safety`
- `profile.section_activity`
- `profile.section_programs`
- `profile.section_safety`
- `profile.section_vehicles`

### vehicle — 12

- `vehicle.active_vehicle`
- `vehicle.add_vehicle`
- `vehicle.documents`
- `vehicle.expiry_warning`
- `vehicle.manage_vehicles`
- `vehicle.manufacturer`
- `vehicle.model`
- `vehicle.photos`
- `vehicle.registration_number`
- `vehicle.select_active`
- `vehicle.vehicle_type`
- `vehicle.year`

### apply_promos — 11

- `apply_promos.applied`
- `apply_promos.apply`
- `apply_promos.available`
- `apply_promos.enter_code_label`
- `apply_promos.enter_code_placeholder`
- `apply_promos.failed`
- `apply_promos.invalid_code`
- `apply_promos.none`
- `apply_promos.not_authenticated`
- `apply_promos.pass_precedence`
- `apply_promos.title`

### home — 10

- `home.calls_remaining`
- `home.connected`
- `home.fetching`
- `home.go_offline`
- `home.go_online`
- `home.no_recent_rides`
- `home.recent_rides`
- `home.welcome`
- `home.welcome_name`
- `home.your_current_location`

### ride — 10

- `ride.cancel`
- `ride.completed`
- `ride.describe_the_issue`
- `ride.dispute_fare`
- `ride.driver_found`
- `ride.on_the_way`
- `ride.request`
- `ride.ride_completed`
- `ride.select_category`
- `ride.share_trip`

### settings — 9

- `settings.about`
- `settings.account_security`
- `settings.auto_accept`
- `settings.min_rate`
- `settings.packages`
- `settings.payout_method`
- `settings.profile`
- `settings.referral`
- `settings.support`

### auth — 7

- `auth.get_started`
- `auth.login`
- `auth.phone_entry`
- `auth.register`
- `auth.send_otp`
- `auth.tagline`
- `auth.verify_otp`

### common — 7

- `common.load_more`
- `common.loading`
- `common.no_data`
- `common.offline`
- `common.pull_to_refresh`
- `common.search`
- `common.sign_out`

### notification — 4

- `notification.document_expiry`
- `notification.package_expiring`
- `notification.payment_confirmed`
- `notification.ride_offer`

### activity — 3

- `activity.call_ledger`
- `activity.due_amounts`
- `activity.schedule`

### driver_home — 3

- `driver_home.high_demand`
- `driver_home.low_demand`
- `driver_home.moderate_demand`

### earnings — 3

- `earnings.earnings_overview`
- `earnings.goal_range`
- `earnings.set_goal`

### tabs — 3

- `tabs.earnings`
- `tabs.profile`
- `tabs.wallet`

### earnings_detail — 2

- `earnings_detail.go_back`
- `earnings_detail.toggle_theme`

### legal — 2

- `legal.effective_date`
- `legal.revision_date`

### safety — 2

- `safety.add_contacts`
- `safety.no_alerts`

### wallet — 2

- `wallet.no_credits`
- `wallet.no_withdrawals`

### app — 1

- `app.name`

### call_ledger — 1

- `call_ledger.tab_ledger`

### packages — 1

- `packages.purchase_failed`

## SHIELDED — 133 keys, reachable only through dynamic calls

Not orphans: each key below is reachable through dynamic evidence the resolver found. They are the uncertainty budget: reasons are `dynamic-table` (a file-local const table resolves through `t(TABLE[k])`), `template-prefix` (`t(\`ns.${x}\`)` shields everything under the prefix), or `file-fallback` (the file has a genuinely unresolvable call, so its key-shaped literals are treated as possibly reachable).

- `activity.all` — dynamic-table+file-fallback — `app/(main)/(customer)/(tabs)/rides/index.tsx:575`, `app/(main)/(customer)/(tabs)/rides/index.tsx:659`, `app/(main)/(rider)/d/(tabs)/activity/index.tsx:46`
- `activity.cancelled` — dynamic-table+file-fallback — `app/(main)/(customer)/(tabs)/rides/index.tsx:575`, `app/(main)/(customer)/(tabs)/rides/index.tsx:659`, `app/(main)/(rider)/d/(tabs)/activity/index.tsx:48`, `components/StatusBadge.tsx:16`
- `app_appearance.dark` — dynamic-table — `app/(main)/(customer)/(tabs)/settings/app-appearance/index.tsx:99`, `app/(main)/(customer)/(tabs)/settings/app-appearance/index.tsx:107`
- `app_appearance.light` — dynamic-table — `app/(main)/(customer)/(tabs)/settings/app-appearance/index.tsx:99`, `app/(main)/(customer)/(tabs)/settings/app-appearance/index.tsx:107`
- `app_appearance.system` — dynamic-table — `app/(main)/(customer)/(tabs)/settings/app-appearance/index.tsx:99`, `app/(main)/(customer)/(tabs)/settings/app-appearance/index.tsx:107`
- `call_ledger.all_time` — dynamic-table — `app/(main)/(rider)/call-ledger.tsx:760`
- `call_ledger.all_types` — dynamic-table — `app/(main)/(rider)/call-ledger.tsx:546`, `app/(main)/(rider)/call-ledger.tsx:707`
- `call_ledger.credit_added` — dynamic-table — `app/(main)/(rider)/call-ledger.tsx:984`
- `call_ledger.expired_credits` — dynamic-table — `app/(main)/(rider)/call-ledger.tsx:984`
- `call_ledger.ignored` — dynamic-table — `app/(main)/(rider)/call-ledger.tsx:510`, `app/(main)/(rider)/call-ledger.tsx:653`
- `call_ledger.no_entries` — dynamic-table — `app/(main)/(rider)/call-ledger.tsx:984`
- `call_ledger.pro_rata_compensation` — dynamic-table — `app/(main)/(rider)/call-ledger.tsx:984`
- `call_ledger.ride_deduction` — dynamic-table — `app/(main)/(rider)/call-ledger.tsx:984`
- `call_ledger.subscription_activated` — dynamic-table — `app/(main)/(rider)/call-ledger.tsx:984`
- `call_ledger.this_month` — dynamic-table — `app/(main)/(rider)/call-ledger.tsx:760`
- `common.all` — dynamic-table — `app/(main)/(rider)/call-ledger.tsx:510`, `app/(main)/(rider)/call-ledger.tsx:653`
- `common.hotspot_high` — template-prefix — `app/(main)/(rider)/d/(tabs)/hotspot/index.tsx:310`
- `common.hotspot_low` — template-prefix — `app/(main)/(rider)/d/(tabs)/hotspot/index.tsx:310`
- `common.hotspot_medium` — template-prefix — `app/(main)/(rider)/d/(tabs)/hotspot/index.tsx:310`
- `contact_support.label_email` — file-fallback — `app/(main)/(customer)/(tabs)/settings/contact-support/index.tsx:121`
- `contact_support.label_emergency_call` — file-fallback — `app/(main)/(customer)/(tabs)/settings/contact-support/index.tsx:67`
- `contact_support.label_phone_call` — file-fallback — `app/(main)/(customer)/(tabs)/settings/contact-support/index.tsx:131`
- `delete_account.item_addresses` — file-fallback — `app/(main)/(customer)/(tabs)/settings/delete-account/index.tsx:27`
- `delete_account.item_name` — file-fallback — `app/(main)/(customer)/(tabs)/settings/delete-account/index.tsx:25`
- `delete_account.item_photo` — file-fallback — `app/(main)/(customer)/(tabs)/settings/delete-account/index.tsx:26`
- `delete_account.item_ride_details` — file-fallback — `app/(main)/(customer)/(tabs)/settings/delete-account/index.tsx:28`
- `driver_history.status_cancelled` — dynamic-table — `app/(main)/(customer)/(tabs)/driver-history/[id].tsx:105`
- `driver_history.status_completed` — dynamic-table — `app/(main)/(customer)/(tabs)/driver-history/[id].tsx:105`
- `driver_history.status_dispatching` — dynamic-table — `app/(main)/(customer)/(tabs)/driver-history/[id].tsx:105`
- `driver_history.status_driver_arrived` — dynamic-table — `app/(main)/(customer)/(tabs)/driver-history/[id].tsx:105`
- `driver_history.status_driver_arriving` — dynamic-table — `app/(main)/(customer)/(tabs)/driver-history/[id].tsx:105`
- `driver_history.status_expired` — dynamic-table — `app/(main)/(customer)/(tabs)/driver-history/[id].tsx:105`
- `driver_history.status_in_progress` — dynamic-table — `app/(main)/(customer)/(tabs)/driver-history/[id].tsx:105`
- `driver_history.status_matched` — dynamic-table — `app/(main)/(customer)/(tabs)/driver-history/[id].tsx:105`
- `driver_history.status_no_drivers` — dynamic-table — `app/(main)/(customer)/(tabs)/driver-history/[id].tsx:105`
- `driver_history.status_pending` — dynamic-table — `app/(main)/(customer)/(tabs)/driver-history/[id].tsx:105`
- `driver_history.status_scheduled` — dynamic-table — `app/(main)/(customer)/(tabs)/driver-history/[id].tsx:105`
- `driver.payout_method.delete_confirm_body` — dynamic-table — `app/(main)/(rider)/payout-method/index.tsx:289`
- `driver.payout_method.delete_confirm_body_promotes` — dynamic-table — `app/(main)/(rider)/payout-method/index.tsx:289`
- `driver.payout_method.promo_rewards` — file-fallback — `app/(main)/(rider)/settings/index.tsx:24`
- `driver.payout_method.type_bank` — template-prefix — `app/(main)/(rider)/payout-method/index.tsx:290`, `app/(main)/(rider)/payout-method/index.tsx:475`
- `driver.payout_method.type_bkash` — template-prefix — `app/(main)/(rider)/payout-method/index.tsx:290`, `app/(main)/(rider)/payout-method/index.tsx:475`
- `driver.payout_method.type_nagad` — template-prefix — `app/(main)/(rider)/payout-method/index.tsx:290`, `app/(main)/(rider)/payout-method/index.tsx:475`
- `emergency_contacts.relationship_colleague` — file-fallback — `app/(main)/(customer)/(tabs)/settings/emergency-contacts/add.tsx:29`, `app/(main)/(customer)/(tabs)/settings/emergency-contacts/index.tsx:37`
- `emergency_contacts.relationship_family` — file-fallback — `app/(main)/(customer)/(tabs)/settings/emergency-contacts/add.tsx:26`, `app/(main)/(customer)/(tabs)/settings/emergency-contacts/index.tsx:34`
- `emergency_contacts.relationship_friend` — file-fallback — `app/(main)/(customer)/(tabs)/settings/emergency-contacts/add.tsx:27`, `app/(main)/(customer)/(tabs)/settings/emergency-contacts/index.tsx:35`
- `emergency_contacts.relationship_other` — file-fallback — `app/(main)/(customer)/(tabs)/settings/emergency-contacts/add.tsx:30`, `app/(main)/(customer)/(tabs)/settings/emergency-contacts/index.tsx:38`
- `emergency_contacts.relationship_partner` — file-fallback — `app/(main)/(customer)/(tabs)/settings/emergency-contacts/add.tsx:28`, `app/(main)/(customer)/(tabs)/settings/emergency-contacts/index.tsx:36`
- `faq.fallback_1_answer` — file-fallback — `app/(main)/(customer)/(tabs)/settings/faq/index.tsx:40`
- `faq.fallback_1_question` — file-fallback — `app/(main)/(customer)/(tabs)/settings/faq/index.tsx:39`
- `faq.fallback_2_answer` — file-fallback — `app/(main)/(customer)/(tabs)/settings/faq/index.tsx:45`
- `faq.fallback_2_question` — file-fallback — `app/(main)/(customer)/(tabs)/settings/faq/index.tsx:44`
- `faq.fallback_3_answer` — file-fallback — `app/(main)/(customer)/(tabs)/settings/faq/index.tsx:50`
- `faq.fallback_3_question` — file-fallback — `app/(main)/(customer)/(tabs)/settings/faq/index.tsx:49`
- `faq.fallback_4_answer` — file-fallback — `app/(main)/(customer)/(tabs)/settings/faq/index.tsx:55`
- `faq.fallback_4_question` — file-fallback — `app/(main)/(customer)/(tabs)/settings/faq/index.tsx:54`
- `faq.fallback_5_answer` — file-fallback — `app/(main)/(customer)/(tabs)/settings/faq/index.tsx:60`
- `faq.fallback_5_question` — file-fallback — `app/(main)/(customer)/(tabs)/settings/faq/index.tsx:59`
- `faq.fallback_6_answer` — file-fallback — `app/(main)/(customer)/(tabs)/settings/faq/index.tsx:65`
- `faq.fallback_6_question` — file-fallback — `app/(main)/(customer)/(tabs)/settings/faq/index.tsx:64`
- `inbox.sample_payment_body` — file-fallback — `app/(main)/(customer)/(tabs)/inbox/index.tsx:99`
- `inbox.sample_payment_title` — file-fallback — `app/(main)/(customer)/(tabs)/inbox/index.tsx:98`
- `inbox.sample_promo_body` — file-fallback — `app/(main)/(customer)/(tabs)/inbox/index.tsx:77`
- `inbox.sample_promo_title` — file-fallback — `app/(main)/(customer)/(tabs)/inbox/index.tsx:76`
- `inbox.sample_system_body` — file-fallback — `app/(main)/(customer)/(tabs)/inbox/index.tsx:110`
- `inbox.sample_system_title` — file-fallback — `app/(main)/(customer)/(tabs)/inbox/index.tsx:109`
- `inbox.sample_trip_body` — file-fallback — `app/(main)/(customer)/(tabs)/inbox/index.tsx:88`
- `inbox.sample_trip_title` — file-fallback — `app/(main)/(customer)/(tabs)/inbox/index.tsx:87`
- `incentives.metric_consecutive` — file-fallback — `app/(main)/(rider)/incentives.tsx:52`
- `incentives.metric_hours` — file-fallback — `app/(main)/(rider)/incentives.tsx:51`
- `incentives.metric_rate` — file-fallback — `app/(main)/(rider)/incentives.tsx:52`
- `incentives.metric_rides` — file-fallback — `app/(main)/(rider)/incentives.tsx:51`
- `lost_items.status_arranged_return` — file-fallback — `app/(main)/(customer)/(tabs)/settings/lost-items/index.tsx:23`
- `lost_items.status_driver_confirmed` — file-fallback — `app/(main)/(customer)/(tabs)/settings/lost-items/index.tsx:21`
- `lost_items.status_resolved` — file-fallback — `app/(main)/(customer)/(tabs)/settings/lost-items/index.tsx:24`
- `lost_items.status_unresolved` — file-fallback — `app/(main)/(customer)/(tabs)/settings/lost-items/index.tsx:25`
- `notifications_screen.email_notifications` — file-fallback — `app/(main)/(customer)/(tabs)/settings/notifications/index.tsx:67`
- `notifications_screen.promo_offers` — file-fallback — `app/(main)/(customer)/(tabs)/settings/notifications/index.tsx:55`
- `notifications_screen.ride_updates` — file-fallback — `app/(main)/(customer)/(tabs)/settings/notifications/index.tsx:54`
- `notifications_screen.service_alerts` — file-fallback — `app/(main)/(customer)/(tabs)/settings/notifications/index.tsx:58`
- `notifications_screen.sms_notifications` — file-fallback — `app/(main)/(customer)/(tabs)/settings/notifications/index.tsx:73`
- `ride.changed_my_mind` — file-fallback — `app/(main)/(customer)/cancel-reason/index.tsx:22`
- `ride.driver_asked_to_cancel` — file-fallback — `app/(main)/(customer)/cancel-reason/index.tsx:21`
- `ride.found_another_ride` — file-fallback — `app/(main)/(customer)/cancel-reason/index.tsx:20`
- `ride.other` — file-fallback — `app/(main)/(customer)/cancel-reason/index.tsx:23`
- `ride.waiting_too_long` — file-fallback — `app/(main)/(customer)/cancel-reason/index.tsx:19`
- `rider_home.label_home` — file-fallback — `app/(main)/(customer)/(tabs)/home/index.tsx:1443`
- `rider_home.label_work` — file-fallback — `app/(main)/(customer)/(tabs)/home/index.tsx:1444`
- `rider_wallet.txn_cashback_earned` — file-fallback — `app/(main)/(customer)/(tabs)/wallet/index.tsx:80`
- `rider_wallet.txn_cashback_expired` — file-fallback — `app/(main)/(customer)/(tabs)/wallet/index.tsx:84`
- `rider_wallet.txn_cashback_redeemed` — file-fallback — `app/(main)/(customer)/(tabs)/wallet/index.tsx:82`
- `rider_wallet.txn_referral_reward` — file-fallback — `app/(main)/(customer)/(tabs)/wallet/index.tsx:74`
- `rider_wallet.txn_ride_discount` — file-fallback — `app/(main)/(customer)/(tabs)/wallet/index.tsx:76`
- `rider_wallet.txn_upfront_tip` — file-fallback — `app/(main)/(customer)/(tabs)/wallet/index.tsx:78`
- `rider_wallet.txn_wallet_adjustment` — file-fallback — `app/(main)/(customer)/(tabs)/wallet/index.tsx:88`
- `rider_wallet.txn_wallet_credit` — file-fallback — `app/(main)/(customer)/(tabs)/wallet/index.tsx:87`
- `rides_list.filter_scheduled` — dynamic-table+file-fallback — `app/(main)/(customer)/(tabs)/rides/index.tsx:575`, `app/(main)/(customer)/(tabs)/rides/index.tsx:659`, `components/StatusBadge.tsx:18`
- `rides_list.group_earlier` — dynamic-table — `app/(main)/(customer)/(tabs)/rides/index.tsx:597`
- `rides_list.group_this_month` — dynamic-table — `app/(main)/(customer)/(tabs)/rides/index.tsx:597`
- `rides_list.group_this_week` — dynamic-table — `app/(main)/(customer)/(tabs)/rides/index.tsx:597`
- `rides_list.group_today` — dynamic-table — `app/(main)/(customer)/(tabs)/rides/index.tsx:597`
- `rides_list.group_yesterday` — dynamic-table — `app/(main)/(customer)/(tabs)/rides/index.tsx:597`
- `rides_list.status_in_progress` — file-fallback — `components/StatusBadge.tsx:17`
- `saved_addresses.label_friend` — dynamic-table — `app/(main)/(customer)/(tabs)/settings/saved-addresses/add-address/index.tsx:81`, `app/(main)/(customer)/(tabs)/settings/saved-addresses/add-address/index.tsx:130`
- `saved_addresses.label_gym` — dynamic-table — `app/(main)/(customer)/(tabs)/settings/saved-addresses/add-address/index.tsx:81`, `app/(main)/(customer)/(tabs)/settings/saved-addresses/add-address/index.tsx:130`
- `saved_addresses.label_home` — dynamic-table — `app/(main)/(customer)/(tabs)/settings/saved-addresses/add-address/index.tsx:81`, `app/(main)/(customer)/(tabs)/settings/saved-addresses/add-address/index.tsx:130`
- `saved_addresses.label_other` — dynamic-table — `app/(main)/(customer)/(tabs)/settings/saved-addresses/add-address/index.tsx:81`, `app/(main)/(customer)/(tabs)/settings/saved-addresses/add-address/index.tsx:130`
- `saved_addresses.label_work` — dynamic-table — `app/(main)/(customer)/(tabs)/settings/saved-addresses/add-address/index.tsx:81`, `app/(main)/(customer)/(tabs)/settings/saved-addresses/add-address/index.tsx:130`
- `schedule_ride.vehicle_bike_basic` — dynamic-table — `app/(main)/(customer)/schedule-ride/index.tsx:222`
- `schedule_ride.vehicle_bike_plus` — dynamic-table — `app/(main)/(customer)/schedule-ride/index.tsx:222`
- `schedule_ride.vehicle_bike_standard` — dynamic-table — `app/(main)/(customer)/schedule-ride/index.tsx:222`
- `schedule_ride.vehicle_car_comfort` — dynamic-table — `app/(main)/(customer)/schedule-ride/index.tsx:222`
- `schedule_ride.vehicle_car_compact` — dynamic-table — `app/(main)/(customer)/schedule-ride/index.tsx:222`
- `schedule_ride.vehicle_car_economy` — dynamic-table — `app/(main)/(customer)/schedule-ride/index.tsx:222`
- `schedule_ride.vehicle_car_premium` — dynamic-table — `app/(main)/(customer)/schedule-ride/index.tsx:222`
- `schedule_ride.vehicle_car_xl` — dynamic-table — `app/(main)/(customer)/schedule-ride/index.tsx:222`
- `schedule_ride.vehicle_cng` — dynamic-table — `app/(main)/(customer)/schedule-ride/index.tsx:222`
- `services_hub.good_afternoon` — file-fallback — `app/(main)/(customer)/services-hub.tsx:17`
- `services_hub.good_evening` — file-fallback — `app/(main)/(customer)/services-hub.tsx:18`
- `services_hub.good_morning` — file-fallback — `app/(main)/(customer)/services-hub.tsx:16`, `app/(main)/(customer)/services-hub.tsx:27`
- `services_hub.good_night` — file-fallback — `app/(main)/(customer)/services-hub.tsx:19`
- `settings.logout` — file-fallback — `app/(main)/(customer)/(tabs)/settings/index.tsx:37`
- `settings.loyalty` — file-fallback — `app/(main)/(customer)/(tabs)/settings/index.tsx:35`
- `settings.privacy` — file-fallback — `app/(main)/(customer)/(tabs)/settings/index.tsx:29`
- `settings.ride_pass` — file-fallback — `app/(main)/(customer)/(tabs)/settings/index.tsx:34`
- `settings.terms` — file-fallback — `app/(main)/(customer)/(tabs)/settings/index.tsx:28`
- `settings.top_up_wallet` — file-fallback — `app/(main)/(customer)/(tabs)/settings/index.tsx:33`
- `vehicle_select.one_vehicle_notice` — dynamic-table — `app/(main)/(rider)/select-active-vehicle.tsx:235`
- `wallet.transaction_types.adjustment` — dynamic-table — `app/(main)/(customer)/(tabs)/activity/top-up/index.tsx:95`
- `wallet.transaction_types.cancellation_compensation` — dynamic-table — `app/(main)/(customer)/(tabs)/activity/top-up/index.tsx:95`
- `wallet.transaction_types.payout` — dynamic-table — `app/(main)/(customer)/(tabs)/activity/top-up/index.tsx:95`
- `wallet.transaction_types.promo_receivable` — dynamic-table — `app/(main)/(customer)/(tabs)/activity/top-up/index.tsx:95`
- `wallet.transaction_types.referral_receivable` — dynamic-table — `app/(main)/(customer)/(tabs)/activity/top-up/index.tsx:95`

## MISSING / PARITY

- MISSING: 0 — every statically referenced key exists in en.
- PARITY: 0 — en and bn have identical key sets (1,470 each).

## Method & limits

- **Scope:** `app/**` + `components/**` runtime files only. `app/api/**` is server code whose key-shaped strings are RBAC scopes and catalog codes; `__tests__/`, `*.test.*`, `*.d.ts` are excluded (tests assert keys, they do not render them). store/, lib/, utils-server/ hold no `t()` calls (verified).
- **What "zero references" means:** no static `t()` call, no template-prefix match, no file-local table match, and no possibility via a file with unresolved dynamic calls. Anything with *some* dynamic evidence is SHIELDED, never folded into the orphan list — so the count above is the strict bucket.
- **Limits:** the SHIELDED bucket is only as good as the resolver's tiers (static calls, `t(\`ns.${x}\`)` prefixes, identifiers through file-local const chains / imported tables / iteration-callback parameters, per-file fallback). This run left 21 dynamic sites unresolved — visible in `--json` — and its `file-fallback` entries are the coarse net; the later same-day extension (see `I18N-ORPHAN-RESOLUTION-EXTENSION-2026-10-04.md`) cut that to 10 and to a 41-key fallback bucket, without changing the orphan list. **Gate:** `--gate` blocks NEW orphans only — the 236 keys above are grandfathered in `scripts/i18n-orphan-baseline.json` (a ratchet that should only shrink), so the backlog purge remains a separate pass rather than a precondition for the gate to run.
- **Reproduce:** `node scripts/audit-i18n-orphans.cjs` (audit: exit 0, findings shown); `node scripts/audit-i18n-orphans.cjs --gate` (gate: exit 2 on a NEW orphan); `--json` on either for the full data including per-site evidence.
