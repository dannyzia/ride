# Ride — Wireframe Documentation · Phase 1: Access Confirmation & Screen Inventory

| Meta | Value |
|---|---|
| Captured | 2026-08-27 |
| Source of record | Code repo `d:\My Projects\Current Project\Ride`, branch `staging`, commit `9387b0d` |
| Mobile app | Ride v1.0.4 · Expo SDK 53 (`app.config.js`) · iOS + Android, portrait |
| Framework | **Ride Fare Framework v6** (`docs/FeatureList/New Feature Plan/Ride Fare Framework/Ride Fare Framework v6.md`; TLDR consulted for §refs) |

---

## 1 · Access sources — confirmed

| Source | Status | Notes |
|---|---|---|
| Code repo | ✅ PRIMARY | Full Expo app (`app/` = 401 files incl. routes+API), admin panel in-tree, dispatch server `utils-server/` (context only) |
| Admin screenshots (Playwright runs) | ✅ partial | `admin-test-results/screenshots/{00-login,01-dashboard,02-recovery,03-zones-500-empty-state}.png` + `run-2…run-5` fix-pass shots (zones / pricing / packages / all-pass) |
| Device/emulator screenshots | ✅ sparse, undated contexts | `docs/errors/emulator_screen*.png`, `Screenshot_20260605-06*.png` (Jun-2026 bug reports) |
| Live staging URL + test accounts (rider/driver/admin) | ❌ MISSING | Needed to *observe* runtime-only states (permission denials, WS failure, payment callbacks) rather than flag them `†` |
| APK/IPA builds | ❌ MISSING | Source + EAS config only |
| Legacy doc pass | ⚠️ conflicts | `docs/wireframes/` (generated 2026-08-26): cites the *GoRide design kit* as source-of-truth and claims 222 screens; code reality is **212 primary layouts** (§3). Its IDs/counters would mislead; treated as superseded-pending-ruling (§8 Q1). Untouched on disk |

Device baseline: TBD until live capture round (proposal: Android 13 mid-range + iOS 16+, light & dark themes).

## 2 · Method & conventions

- **Screen = one rendered layout.** This inventory locks **primary (default-state) rows** now.
- State variants attach as **suffixes to the parent ID**, never consuming numbers → batch generation cannot force renumbering:
 `-L` loading · `-E` empty · `-X` error · `-S` explicit success state-page · `-PM` permission prompt · `.M#` modal over screen · `.B#` bottom sheet over screen.
- Per-row `Var` letters appear **only** where a branch is seen in the route file or its imported component (`grep` evidence: `<ActivityIndicator|Skeleton`, `EmptyState|"No `, `ErrorBanner|Alert.alert|setError`). `†` = expected-but-unconfirmed: NO row issued until seen at its batch turn.
- Bespoke overlays owned by one screen are counted as rows of that screen's module file; **reusable** overlay widgets register once under C- and are cross-referenced from hosts.
- `EP` entry points are primary navigation paths from router/href greps — provisional until each module's Phase-2 flow diagram finalizes them.
- Every row maps to ≥1 real artifact (route file path listed beside name). No spec-derived entries anywhere.

## 3 · Coverage summary

| Series | Scope | Rows |
|---|---|---|
| R | Auth-rider (11) · Customer launcher/tabs (19) · Settings (28) · Booking/trip flows (26) | **84** (R-001…R-084) |
| D | Auth-driver (7) · Shared/tabs (9: D-008-016) · All driver flows/settings/subscriptions (53: D-017…D-069) | **69** (D-001…D-069) |
| A | Ops/admin web panel | **38** (A-001…A-038, locked sequence fixed below §5.10) |
| C | Shared components/hosted overlays + app-root web screens | **21** (C-001…C-021) |
| **Σ** | Primary rendered layouts | **212** |

State-row expansion note: ~55 suffixed rows already qualify via greps today; every list screen qualifies during its batch. If every trivial list `-L/-E/-X` is drawn, total approaches the "300+" phrasing; if limited to non-trivial states it lands ≈230–260. Decision requested: §8 Q4.

## 4 · Framework-critical register (v6) — built-status with evidence

| v6 item | Status | Evidence (file:line) | Anchors |
|---|---|---|---|
| Lead card + heat tag hot/neutral/cold pre-accept | ✅ built | `components/RideOfferSheet.tsx:21-30` HEAT_CHIP map; countdown ring; slide-accept; `offer_expired` copy `:17-19` | Overlay on D-012 (driver home); heatmap legend D-037 |
| Pre-trip traffic warning (non-binding) | ✅ built | `confirm-ride/index.tsx:393-401` amber banner from `estimate.traffic_warning/message` ("Phase F §6" comment) | R-066 |
| Post-trip bill expandable detail (km·time·waiting·pickup·zone·night) | ✅ built | `FareBreakdownSheet.tsx:17` expand toggle; detail rows base/distance/time/floor/preferences/driver-net/**pickup_fee_final**/**waiting_charge**/**zone_fee**/night-mult `:22-58` | R-077 rider bill; D-035 completion modal mirrors fields `finish-ride/index.tsx:246-267` |
| First-time pickup-fee explanation | ✅ built | `PickupFeeExplainerSheet.tsx` — slide-over sheet, one-time via AsyncStorage key `pickup_fee_explainer_dismissed_v1` | Hosted R-066 (verify host-scope at booking batch) |
| First-time zone-fee explanation | ✅ built | `ZoneFeeExplainerSheet.tsx` + ack API `app/api/user/zone-fee-explained+api.ts` | Hosted R-077 (verify at trip batch) |
| 3-state pickup quote (range→firm→true-up) | ◐ partially traced | Range@request refs p75 nearest-5 `estimate+api.ts:153-205` · true-up line renders post-ride `FareBreakdownSheet:41-43` · firm@accept to be pinned during booking batch | R-066 / R-077 |
| Package purchase / renewal | ✅ built | Driver weekly cluster D-061…D-065 + listing D-009(`packages.tsx`, purchase `.M`) + ledger D-011 | D-series money block |
| Off-platform detection rider survey | ❓ UI not found | API+tests exist (`api/ride/[id]/cancel-survey+api.ts`); rider cancel screen = fixed 5-reason radio + fee preview, no survey step visible; admin monitors results (`fare-gate-metrics:440`, `trust-safety`) | **DLOG-01** |
| New-driver priority period UI (if any) | ❌ none found | Config-only `admin/fare-config.tsx:190-198`; zero client markers | **DLOG-02** |

Ops counterparts tagged **F-op**: zones, zone-pnl, fare-config, heat-monitor, pickup-analytics, fare-gate-metrics, trust-safety, platform-config.

## 5 · Master inventory

Legend: F framework-critical · Var seen states · Ovl owned overlays · EP primary entry.

### 5.1 Rider auth (R-001…R-011) — `(auth)/`
welcome R-001 · walkthrough-1/2/3 R-002/03/04 · login R-005(E) · forgot-password R-006(X) · phone-entry R-007(E,X) · otp-verify R-008(L,X; TD-01 manual-entry fallback noted) · register R-009(L,X) · enable-location R-010(PM) · notifications-permission R-011(PM).

### 5.2 Customer launcher & tabs (R-012…R-030)
index(role-launcher) R-012 · services-hub R-013 · tabs/home R-014(L,E,.B ScheduleRideSheet/.M alternates) · tabs/activity R-015(L,E) · activity/share-receipt R-016(X) · activity/top-up R-017(X) · activity/top-up-details R-018 · activity-canceled/completed/scheduled R-019/20/21(L,E each) · tabs/chat-list R-022(E) · driver-history index/[id] R-023/24(L,E) · history-detail R-025(L,X) · tabs/inbox R-026(L,E) · tabs/profile R-027(E) · tabs/referral R-028(L,E) · tabs/rides R-029(L,E,.M) · tabs/wallet R-030(L,E; WalletSkeleton).

### 5.3 Customer settings (R-031…R-058) — all EP ← settings root
settings/index R-031 · add-payment R-032 · app-appearance R-033 · app-language R-034 · contact-support R-035(L,E,X) · data-analytics R-036(L) · delete-account R-037(L,X) · delete-data R-038(X) · emergency-contacts R-039(L,E) · ec-add R-040(L,X) · faq R-041(L,E) · help-support R-042 · linked-accounts R-043(L) · logout-confirmation R-044 · lost-items R-045(L,E,.M claim) · loyalty R-046(L,E) · notifications R-047(L) · personal-info R-048(L) · privacy-policy R-049(C-LegalDocumentScreen) · request-data R-050(X) · ride-pass R-051(L,E) · saved-addresses R-052(L,E) · sa-[id] R-053 · sa-add R-054(L,X) · terms-of-service R-055 · top-up R-056(L,X) · top-up-method R-057(L) · top-up-success R-058(-S page).

### 5.4 Customer booking/trip flows (R-059…R-084)
add-tip R-059(L,X) ←R-077 · apply-promos R-060(L,E) ←R-066 · autocomplete R-061(L,E; Barikoi) ←R-070 field · cancel-reason R-062(L,X; fee countdown+grace) ←trip HUD · canceled-page R-063(-S) · change-password R-064(L,X) · chat/[rideId] R-065(L,E) · **confirm-ride R-066 F** (L,X,.B PickupFeeExplainer first-time; traffic banner §6; discount selector; pickup+zone lines) · driver-info R-067(L) ←R-080 · emergency-sos R-068(L,X) · fare-dispute R-069(L,E,X) ←R-077 · find-ride R-070(L,X,.M×N) · finding-driver R-071(chain telemetry) · home-raster R-072 · no-drivers-available R-073(-S) · profile/edit R-074(L,X) · rate-driver R-075(L,X) · report-issue R-076(L,E,.M picker) · **ride-detail/[ride_id] R-077 F** (L,E,.B ZoneFeeExplainer first-time; FareBreakdownSheet expandable) · ride-details-scheduled/[id] R-078(L) · ride-scheduled R-079(E) · ride-tracking/[ride_id] R-080(L,X; LiveMeter stages) · schedule-ride R-081(L,X) · schedule-ride-after-promo R-082(X) · scheduling-user-ride R-083(L,X) · user-arrived R-084.

### 5.5 Driver auth (D-001…D-007) — `(auth)/driver-*`
splash D-001 · welcome D-002 · walkthrough 1/2/3 D-003/04/05 · enable-location D-006(PM) · notifications-permission D-007(PM). *(Phone entry/OTP/register reuse R-007/08/09 under current routing — verify branch logic at auth batch.)*

### 5.6 Driver shared & tabs (D-008…D-016)
select-active-vehicle D-008(L,X) · packages D-009(L,E,.M purchase)**F**listing · incentives D-010(L,E) · call-ledger D-011(L,E) · tabs-home(index) D-012 **F-offer-host**(hosts global RideOfferSheet overlay w/ heat chips; break/offline gates) · tabs/activity D-013(L,E) · tabs/earning D-014(L,E) · tabs/wallet D-015(L,E) · tabs/profile D-016(E).

### 5.7 Driver flows A (D-017…D-035) — work loop core
active-subscription D-017(L,E)**F**status-view · add-vehicle D-018(L,X,.M media-perms) · break-mode D-019(L) · cancellation-reasons D-020(L,E) · chat/[rideId] D-021(L,E) · commission-statement D-022(L,E) · contact-support D-023(L) · customer-navigation/[rideId] D-024 · documents D-025(L,E,upload-cards) · due-amounts D-026(L,E,X) · earnings D-027(L,E) · earnings-breakdown D-028(L) · earnings-detail/[date] D-029(L,E) · edit-profile D-030(L,X) · emergency-contacts D-031(L,E,.M add) · enter-otp D-032(L,E,X) · faq D-033(L,E) · find-customer D-034(L,E) · **finish-ride D-035 F** (completion .M: km/min/waiting/zone/night/cash-split; Alert-fail X).

### 5.8 Driver flows B (D-036…D-050)
home(full) D-036 · hotspot-map D-037(heatmap legend; idle-positioning hint zone) · insurance D-038 · min-rate D-039(validate gate) · onboarding D-040(L,.M steps) · payout-method D-041(L,X) · performance-stats D-042(L) · personal-profile D-043(L) · rate-rider D-044(L,toast success) · ratings D-045(L,E) · referral D-046(L,E) · report-issue D-047(L,E) · rider-no-show D-048(L,E,reason flow) · safety D-049 · schedule D-050(L,E,.M create).

### 5.9 Driver settings & subscriptions (D-051…D-069)
settings/index D-051 · account-security D-052(.M delete-account confirm) · appearance D-053 · auto-accept D-054(criteria expl; v6 auto-accept tier) · change-password D-055(L,X) · language D-056 · lost-items D-057(L,E) · notifications D-058(L) · privacy-policy D-059 · terms-of-service D-060 · **subscription-checkout D-061 F**(L,X) · subscription-confirmation D-062(-S) · subscription-details D-063(L) · **subscription-plans D-064 F**(L,E) · **subscription-renewal D-065 F**(L,X) · support D-066(L,E) · trip-issue D-067(L,E) · vehicle-management D-068(L,E) · verification D-069(L,status cards).

### 5.10 Admin (A-001…A-038) — `app/admin/*` (locked order)
login A-001 (PW-shot 00) · dashboard index A-002 (PW-shot 01) · live-ops A-003 · monitoring A-004(dispatch-log/chat/driver-econ tabs) · sos-alerts A-005 · sos-contacts A-006(.M add) · recovery A-007 (PW-shot 02) · queue A-008(driver review) · riders A-009 · documents A-010(viewer modal) · events A-011 · broadcast A-012 · city-boundaries A-013 · cancellation-policies A-014 · **zones A-015 F-op**(zone-fee schedule; PW-shot 03 = 500-empty-state fixed run2) · **zone-pnl A-016 F-op** · pricing A-017 (run2-shot) · **fare-config A-018 F-op**(pickup %, allowances, priority window 190-198, night-mult) · **heat-monitor A-019 F-op** · **pickup-analytics A-020 F-op** · **fare-gate-metrics A-021 F-op**(backstop binding, quote-deviation, survey instrumentation) · **trust-safety A-022 F-op**(off-platform ladder) · fare-disputes A-023 · promos A-024 · incentives A-025 · point-offers A-026 · referral-campaigns A-027 · preferences A-028 · premium-allowlist A-029 · ride-passes A-030 · packages A-031 (run3 failshot / run4 fix) · vehicle-models A-032 · sample-media A-033 · rider-intro-configs A-034 · platform-config A-035 **F-op** · tax-dashboard A-036 · support A-037 · lost-items A-038.

### 5.11 Shared C-series (C-001…C-021)
Toast C-001 · AdminToast C-002 · FloatingNavMenu C-003(.M) · RideOfferSheet C-004 ⇒ documented as D-012-owned global overlay (cross-ref) · PickupFeeExplainerSheet C-005(.B)**F** · ZoneFeeExplainerSheet C-006(.B)**F** · ScheduleRideSheet C-007(.B) · AlternativesSheet C-008(.B) · TollParkingModal C-009(.M) · ExtraChargeApproval C-010(.M) · FareBreakdownSheet C-011(card-expand)**F** · LiveMeter C-012(trip stage HUD) · ErrorBanner C-013 · EmptyState C-014 · OfflineIndicator C-015 · PermissionPrompt wrappers C-016 · app-root: payment/success C-017(web deep-link result) · payment/failure C-018 · track/[rideId] C-019(public tracker page) · +not-found C-020 · index splash-router C-021.

## 6 · Provisos recorded on this inventory
1. `.M/.B` ownership derived from import-graph + conditional renders; exact replica list per host finalizes inside that module's flow diagram.
2. `Var` letters are grep-evidence-backed as of commit `9387b0d`; unseen states simply absent (never invented).
3. Any drift after this date requires re-diff of `app/` tree vs this file before further batches.

## 7 · Proposed output structure (Phase 2 contract)
```
docs/ui-docs/
  index.html                     # master TOC + live counters per app
  screens/rider-auth.html …      # one file per module (~10–30 screens/batch)
  annexes/sitemap.html  discrepancy-log.html  open-questions.html
```

## 8 · Open questions / blockers needing your input
1. **Legacy pass**: confirm archive-and-supersede of `docs/wireframes/` (recommend freeze-as-is + new tree above).
2. **Runtime access**: staging URL + test accounts and/or builds, so PM-denied/WS-fail/callback states can be *observed* instead of flagged unreachable?
3. **Capture device baseline** to lock for future screenshot evidence?
4. **State-depth policy**: EVERY list -L/-E/-X drawn (approaching 300+) vs core-journey states + material exceptions (~230)? Changes batch count only — IDs unaffected.
5. **ID scheme sign-off**: R/D/A/C numbering + suffix grammar above supersedes legacy A-xxx naming — approved?

## 9 · Discrepancy seed-log (full annex authored at Phase 3; seeded now from seen evidence)
| ID | v6 ref | Finding | Severity |
|---|---|---|---|
| DLOG-01 | off-platform enforcement | Cancel-survey API + schema + admin monitoring exist; **no rider-facing survey UI found** — cancel-reason is a fixed 5-option radio; whether server derives survey answers from cancel payload must be traced in booking/trip batch | High |
| DLOG-02 | new-driver priority | Config keys + dispatch semantics exist; **zero driver-facing UI artifact** located | Low |

---
**STATUS: PHASE 1 DELIVERED — wireframe Batch 1 starts only after your approval (hard gate per task rules).**
