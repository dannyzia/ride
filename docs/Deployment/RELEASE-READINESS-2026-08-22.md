# Final Release Readiness Report — Ride (Plans 06–11 completion)

**Version:** 4 (staging deployed + production handover)
**Date:** 2026-08-22
**Branch:** `staging` @ **`5011881`** (pushed to `origin/staging`)
**Prepared by:** Engineering (Kilo session). Product/Legal sign-off points are called out explicitly.

---

## 1. Summary of fixes (engineering sessions culminating in `5011881`)

| # | Change | Files |
|---|---|---|
| Audit | C1–C4, H1–H9 fixes (prior sessions, previously uncommitted) | profile, packages, verification, `_layout`, `DriverStatusGuard`, `trips+api`, `commission-statement+api`, wallet, etc. |
| C5-a | Vehicle-model decision document (Option A temporary, Option B migration path) | `docs/vehicle-model-decision.md` |
| C5-b | Removed dead multi-vehicle activation endpoint | `app/api/driver/vehicle-activate+api.ts` (deleted) |
| C5-c/d | Vehicle screens simplified to single-vehicle display + "Contact support to change it." notice | `vehicle-management/index.tsx`, `select-active-vehicle.tsx` |
| C5-e | Schema C5 comment updated to record the applied decision (unique index kept, no DDL) | `src/db/schema.ts:386` |
| Legal-a | `lib/legalContent.ts` professional bilingual template + `// @TODO: Replace with approved legal copy` | `lib/legalContent.ts` |
| Legal-b | All 4 legal screens render from one shared component wired to `lib/legalContent.ts` | `components/LegalDocumentScreen.tsx` + 4 screens |
| Legal-c | Build-time placeholder guard suite | `lib/__tests__/legalContent.test.ts` |
| Legal-d | README release-gate note | `README.md` |
| P0-B | Dead `payout` label removed, gate comment, gate document | wallet screen, `docs/payout-product-gate.md` |
| Extra | Fixed pre-existing ESLint error (rules-of-hooks in Map.tsx) | `components/Map.tsx` |
| Deploy | Staging EAS profile, environment pinning, OTA wiring, Node≥22 build fix | `eas.json`, `app.config.js`, `package.json` |

## 2. Blocker status

### C5 — Vehicle model → RESOLVED (temporary safe default) + documented path
Option A (one vehicle/driver) applied, matching `vehicles_driver_id_idx` and dispatch's single `drivers.vehicle_type`. Dead endpoint/UI removed. **Product ruling still required**; Option B migration plan is in `docs/vehicle-model-decision.md` §3. Residual risk (documented): direct POST to `/api/driver/vehicles` can still overwrite the caller's own row (upsert retained for onboarding retries); server-side `409` guard recommended post-decision.

### Legal copy → RESOLVED as template + hard gate; approval pending
All four screens consume `lib/legalContent.ts` (bilingual, dates, contacts). `legalContent.test.ts` fails the suite on any placeholder marker or structural gap. **Production gate:** approved EN/BN copy must replace the template.

### P0-B — Instant Pay / payout history → VERIFIED GATED (no remnants)
Sweep evidence in `docs/payout-product-gate.md`: zero withdrawal UI/API/state; forward-compatible schema enums have no writer. Five missing Product decisions + sanctioned implementation path documented.

## 3. Validation evidence (pre-deploy, re-run at `5011881` state)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **PASS** |
| Lint | `npm run lint` | **PASS** — 0 errors (55 pre-existing tolerated warnings) |
| Tests | `npx jest --watchAll=false` | **PASS** — 37 suites, 332/332 |
| console.log sweep | 492 source files (node_modules excluded) | **0 matches** |
| Removed-tech sweep | clerk/stripe/firebase | **0 matches** |
| Graph | `code-review-graph update` | OK (1832 nodes) |

---

## 4. Staging deployment record (2026-08-22)

### 4.1 Commits on `staging` (all pushed)

| SHA | Subject |
|---|---|
| `490b1e5` | fix: address critical audit findings (C1-C4, H1-H9); resolve C5 (one-vehicle default); legal template; P0-B gate |
| `764461a` | schema(drizzle): migration 0042 — notifications idempotency, rides reminder flag, demand-forecast/zones indexes |
| `ed20376` | chore(deploy): staging EAS profile — pin production environment so internal QA builds embed server URLs |
| `9067f16` | chore(deploy): wire EAS Update URL + appVersion runtime policy into app config (enables OTA) |
| `0f99da6` | chore(deploy): declare expo-updates dependency for OTA |
| `5011881` | fix(deploy): staging build — EXPO_WEB_OUTPUT=single to avoid Node>=22 SSR eager-bundle crash |

### 4.2 Database migration — generated and reviewed; **NOT applied**

`drizzle-kit generate` produced `src/db/migrations/0042_noisy_omega_red.sql` (legitimate drift from earlier approved work — the Z-1 zone-index swap, notifications idempotency, ride reminder flag; this session's schema change was comment-only). Reviewed line-by-line: **additive only** — no FK drops, no column/table drops, no data loss. The single `DROP INDEX zones_one_active` is the documented Z-1 replacement by `zones_active_idx`.

**Required pre-deploy action (DBA/lead):** `npx drizzle-kit push` against the target database before deploying the backend.
**Caveats:** (1) `CREATE UNIQUE INDEX demand_forecasts_zone_hour_idx` fails if `(zone_id, forecast_hour)` duplicates exist — dedupe first if the table has history. (2) `notifications_idempotency_idx` is safe: existing NULL keys are allowed multiple times by Postgres. (3) Rollback is trivial (drop the two indexes/columns) since the migration is additive.

### 4.3 EAS — build and OTA

| Artifact | ID / URL | Status |
|---|---|---|
| Staging APK (Android, internal) | build `f8747a0c-0261-4016-9d6c-4a53d2015c58` → `https://expo.dev/artifacts/eas/5wZCn4J959_h7GLBCcW2Vcey4Ze8Sk2fBc0_9fFAXk0.apk` | **FINISHED** (20.9 min) |
| EAS Update (JS bundle) | group `ce77d916-c910-4c37-a042-779dd4fdab71`, branch `staging`, runtime `1.0.4`, commit `0f99da6` | **Published** |
| Update channel | `staging` → branch `staging` | **Linked** |
| Environment secrets in APK | `EXPO_PUBLIC_SERVER_URL`, `EXPO_PUBLIC_WEB_SOCKET_SERVER_URL`, `EXPO_PUBLIC_SUPABASE_*`, `EXPO_PUBLIC_BARIKOI_API_KEY`, `EXPO_PUBLIC_SUPPORT_PHONE` | **Embedded** (verified in build log) |

**Deploy-time engineering fixes (were genuine gaps):**
1. No `staging` EAS profile existed → created (internal APK, release channel `staging`).
2. Internal distribution resolves the `preview` EAS environment, which had no URL secrets → pinned `"environment": "production"` (only backend that exists — see caveat below).
3. **OTA was never wired**: `app.config.js` lacked `updates.url` and `expo-updates` wasn't a dependency → added `updates.url` + `runtimeVersion {policy: appVersion}` + `expo-updates@~0.28.18`. This also enables OTA for future production builds.
4. Build `b02380fa` failed in EAGER_BUNDLE with the repo-documented Node≥22 SSR crash (`web.output: "server"`) → set `EXPO_WEB_OUTPUT=single` in the staging profile (mobile builds don't need SSR; the Render backend's own build is unaffected).

**⚠️ Caveat — no dedicated staging backend exists.** The staging APK targets the **production** API/WS hosts (EAS production secrets). QA must use designated test accounts and expect test data in the production database, or provision a staging backend (new EAS `preview`-environment secrets + profile switch) before broad smoke testing.

### 4.4 Backend services — NOT deployable from this session (handoff)

- **API/web server (Render):** deployed via the Render dashboard from the repo (see `app.config.js` comment). Confirm which branch Render auto-deploys (`staging` push has happened) and redeploy on `5011881` when the migration (§4.2) is applied.
- **utils-server (WebSocket dispatch):** deploy to its host; `INSTANCE_COUNT=1` (no split-brain); secrets per `docs/Plan/11-ENV-VARS.md`.

---

## 5. Staging smoke test matrix — **PENDING QA EXECUTION**

> **Honest status:** this environment has no Android device/emulator or Maestro runner, so the runtime matrix could not be executed here. No results are fabricated. QA should run this matrix against the staging APK (§4.3). Static evidence from the shipped code is noted per row. Existing Maestro coverage: 10 flows in `maestro/` (pre-read gates in `.claude/rules/testing-agent.md` apply before authoring new flows).

#### Core driver flows
| Test | Static evidence | QA result |
|---|---|---|
| Authentication / status guard | `DriverStatusGuard` wraps driver root; polling + reason UX committed | ☐ Pending |
| Navigation — five tabs, Settings push | `(rider)/(tabs)/_layout.tsx` (prior session) | ☐ Pending |
| Vehicle management — one vehicle, notice, no Activate | Verified in rewritten screens (this session) | ☐ Pending |
| Package purchase — PaymentWebView + confirmation | `/api/package/*` flow untouched; 332 tests green | ☐ Pending |
| Wallet top-up — PaymentWebView + balance refresh | `handleTopUp` wiring verified in source | ☐ Pending |

#### Data integrity
| Test | Static evidence | QA result |
|---|---|---|
| Earnings goal persistence (1000 BDT) | `lib/storageKeys.ts` + Earnings tab (prior session) | ☐ Pending |
| Trip history pagination (3 pages, filters) | H4 keyset cursor + `cursor_id` tiebreaker, limit ≤ 50 | ☐ Pending |
| Commission weeks (contiguous Mon–Sun) | H8 Monday-anchored Dhaka weeks, `week_offset` 0–52 | ☐ Pending |
| Document expiry red/orange badges | Verified in rewritten `vehicle-management` | ☐ Pending |
| Schedule overlap validation | Existing overlap route (P4) | ☐ Pending |
| Dues from `/api/driver/dues` | Unchanged endpoint | ☐ Pending |
| Call ledger filters/pagination | Unchanged screens | ☐ Pending |

#### Support & safety
| Test | Static evidence | QA result |
|---|---|---|
| Contact support ticket | Existing route | ☐ Pending |
| Emergency contacts (max 5, `01X` validation) | Client+server validation (P4) | ☐ Pending |
| SOS cooldown | `sosQueue`/`sosAlert` tests green | ☐ Pending |
| Lost items actions | Root PATCH with canonical actions | ☐ Pending |

#### Profile & persistence
| Test | Static evidence | QA result |
|---|---|---|
| Profile edit (name/city/photo) | Prior-session H-fixes | ☐ Pending |
| Ratings distribution | Prior session | ☐ Pending |
| Referral share | Prior session | ☐ Pending |
| Performance/incentives | Prior session | ☐ Pending |
| No-show wait threshold | Server-anchored timer | ☐ Pending |

#### i18n & legal
| Test | Static evidence | QA result |
|---|---|---|
| Bangla persistence across restart | `i18n.ts` AsyncStorage hydration | ☐ Pending |
| Legal screens from `lib/legalContent.ts`, no placeholders | All 4 screens wired (verified by grep); guard suite green | ☐ Pending |

#### Notifications & deep links
| Test | Static evidence | QA result |
|---|---|---|
| Foreground notification / background tap | Root handler (prior session) | ☐ Pending |
| Deep link opens wallet | Scheme is **`ride`** (W-4). Correct test URI format for expo-router: `ride:///(main)/(rider)/(tabs)/wallet` — the originally proposed `ride://driver/wallet` matches no route | ☐ Pending |

---

## 6. Production handover package

### 6.1 Final code state
- **Branch:** `staging`; **HEAD:** `5011881` (`fix(deploy): staging build — EXPO_WEB_OUTPUT=single …`); pushed to `origin/staging`.
- **Staging artifacts:** APK `f8747a0c` (URL §4.3); OTA group `ce77d916` on branch/channel `staging`.
- **Pre-deploy validations:** all green (§3).

### 6.2 Staging test results
Deployment succeeded (§4). Runtime smoke matrix is **pending QA execution** (§5) — no known failures, none executed. Known issues: none open from engineering; infra gaps (staging backend absent, §4.3 caveat; Render/utils-server deploy, §4.4) are handoff actions, not defects.

### 6.3 Pending gates for production (both non-coding)

1. **Legal copy (blocking):** approved EN/BN Terms + Privacy must replace the template in `lib/legalContent.ts`; `lib/__tests__/legalContent.test.ts` enforces placeholder-free content and must stay green. README section "Required Legal Text (release gate)" documents the inputs needed (text, dates, contact address).
2. **Vehicle model decision (blocking as a commitment):** Product must confirm the one-vehicle default or commission Option B per `docs/vehicle-model-decision.md`. The default is safe to ship but implies support-assisted vehicle changes.
3. *(Non-blocking, tracked)* P0-B payout model decisions per `docs/payout-product-gate.md`; staging-backend provisioning per §4.3 caveat.

### 6.4 Rollback plan

| Layer | Procedure |
|---|---|
| Mobile app (stores) | Production store builds are untouched (v1.0.4 build 7, git `4f7f2d4`). No production store release has been made from this branch. |
| OTA (staging) | `eas update --branch staging` re-publish from a previous commit, or repoint the channel: `eas channel:edit staging --branch <rollback-branch>`. Runtime policy `appVersion` (1.0.4) bounds delivery to matching builds. |
| OTA (production, future) | Same mechanism on the `production` channel; only relevant after a production update is ever published. |
| Database | Migration 0042 is fully additive; rollback = `DROP INDEX demand_forecasts_zone_hour_idx, demand_forecasts_hour_idx, notifications_idempotency_idx, rides_zone_created_idx, zones_active_idx; ALTER TABLE notifications DROP COLUMN idempotency_key; ALTER TABLE rides DROP COLUMN reminder_60_sent;` and recreate `zones_one_active` per Z-1 predecessor. |
| Backend (Render / utils-server) | Redeploy from the previous commit via the host dashboard; keep `INSTANCE_COUNT=1`. |
| Git | `git revert` the offending commits on `staging` (no force-push; `main`/`develop` untouched). |

### 6.5 Sign-off checklist

| Stakeholder | Responsibility | Status |
|---|---|---|
| Engineering Lead | Code, validation, staging deployment (this report §1–§5) | ✅ Complete — `5011881` |
| QA | Execute §5 smoke matrix on the staging APK; record Pass/Fail | ⬜ Pending |
| Product | C5 vehicle-model ruling (`docs/vehicle-model-decision.md`); P0-B payout decisions (`docs/payout-product-gate.md`) | ⬜ Pending |
| Legal | Approved EN/BN legal copy into `lib/legalContent.ts` (guard suite green) | ⬜ Pending |
| Ops/DBA | Apply migration 0042 (`drizzle-kit push`, §4.2 caveats); deploy Render API + utils-server (`INSTANCE_COUNT=1`, §4.4) | ⬜ Pending |
| Release Manager | Final Go/No-Go after the above | ⬜ Pending |

### 6.6 Go/No-Go

**Staging: DEPLOYED** (APK + OTA + migration staged for DBA). **Production: NO-GO** until Legal copy (6.3-1), Product C5 ruling (6.3-2), QA matrix (6.5), and Ops deployment steps (6.5) are complete. All remaining work is non-coding gates plus QA execution; engineering development is finished.
