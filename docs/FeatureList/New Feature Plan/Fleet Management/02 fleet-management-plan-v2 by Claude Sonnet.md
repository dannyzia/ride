# Fleet Management — Architecture & Phased Plan (v2)

**v1:** adapted from ChatGPT's fleet management spec (2026-08-16)
**v2:** grounded against `AGENTS.md` and the project file list (2026-08-16)
**Status:** Pre-implementation. Structurally grounded, not yet line-level precise — see "Still needed" at the end before handing to a coding agent.

## Key decisions (confirmed with Zia, unchanged from v1)

| Question | Decision |
|---|---|
| Fleet owner revenue | Ledger/reporting only — no real money movement. Rider still pays driver directly (cash/MFS). Owner and driver settle off-platform; Ride only reports what fleet-assigned vehicles/drivers earned. |
| Call-package subscriptions | Untouched. Each driver buys/tops up their own call package regardless of fleet membership. Fleet Management has zero coupling to the subscription/balance engine or `balanceScore`. |
| External Fleet SaaS (Layer C) | In roadmap as a later phase (MVP3) — generic integration framework first, specific provider integrations only once a real partner API exists. |

## Codebase grounding — confirmed from AGENTS.md + file list

- **Auth:** Supabase phone OTP (`app/(auth)/phone-entry` → `otp-verify` → `register`), not Firebase. No Firebase Cloud Functions exist in this codebase currently.
- **Payments:** PortPos is the live gateway (`lib/portpos.ts`). `lib/bkash.ts`/`lib/nagad.ts` are inert stubs. `lib/dprelay.ts` exists, so the SMS-relay piece is real — just unconfirmed what it currently feeds.
- **Route naming trap:** `app/(main)/(customer)/` = Rider screens. `app/(main)/(rider)/` = Driver screens (legacy folder name — do not rename, per AGENTS.md). Recommend a new `app/(main)/(fleet)/` group for Fleet Owner to avoid colliding with either confusing name.
- **Accounting domain already exists:** `lib/accounting.ts` + `app/api/accounting/{balance,entries,export,trial-balance}+api.ts`. Fleet revenue reporting (Phase 3) should read through this rather than inventing a parallel aggregation layer.
- **Zone-economics domain already exists:** `lib/zoneEconomics.ts`, `lib/zoneBudget.ts`, `lib/zoneLifecycle.ts`, plus an admin `zone-pnl.tsx` screen. This is the closest existing precedent for "aggregate financial performance for a grouping of drivers/vehicles" — read before designing `fleet_daily_metrics`; the pattern may already be solved here.
- **Commission is not purely dormant.** A driver-facing `commission-statement` screen/API and a `due-amounts`/`dues` screen/API exist. Something already tracks driver-owed commission today, most likely via wallet/dues deduction rather than fare escrow. Doesn't change the fleet-revenue decision (still reporting-only for fleet MVP) — but the fleet management fee (Phase 5) may be able to reuse this same collection mechanism instead of needing new payment plumbing. Read `commission-statement+api.ts` and `dues+api.ts` before finalizing Phase 5.
- **`lib/money.ts` exists** — use it for any BDT amounts in new fleet tables rather than inventing new formatting/scaling logic.
- **Vehicle management already has driver-facing screens:** `vehicle-management/index.tsx` and `add-vehicle/index.tsx` under the driver route group, plus `lib/vehicleTypes.ts` for category logic. Fleet Vehicle List/Detail is a different, owner-level, multi-vehicle view but must call the same underlying eligibility/vehicle data layer — not a parallel one.
- **Admin UI primitives exist:** `components/admin/{AdminForm,AdminModal,AdminShell,AdminTable,AdminToast,AdminToggle}.tsx`. All new admin fleet screens (approval, plan config) should be built from these.
- **Route guard pattern exists:** `components/auth/DriverStatusGuard.tsx`. A fleet-owner equivalent should follow this same shape.
- **Not visible in this file list:** `docs/Plan/`, `plans/`, `.claude/`, `App Design/`. These are the folders AGENTS.md treats as the actual source of truth (full schema inventory, conventions, dev checklist) — not included in this export, so table/column names below are still inferred, not confirmed.
- **TD-31 (known issue):** tables created after Oct 30, 2026 need explicit GRANT statements for `supabase-js`/PostgREST access; server-side Drizzle access is unaffected. Fleet tables will likely be created after that date — add explicit GRANTs in the migration if any fleet table needs direct client-side (PostgREST) access. If fleet screens go through `app/api/` like the rest of the app, this may not apply at all — confirm the access pattern before worrying about it.

## Conventions to follow (from AGENTS.md)

- `lib/`: camelCase — e.g. `lib/fleetEligibility.ts`
- `app/api/`: kebab-case with `+api.ts` — e.g. `app/api/fleet/vehicles+api.ts`
- `components/`: PascalCase — e.g. `components/fleet/FleetVehicleCard.tsx`
- `store/`: `use{Name}Store.ts` — e.g. `store/useFleetStore.ts`
- Commit scopes: `auth, dispatch, payment, ledger, admin, schema, driver, rider` — add `fleet` as a new scope for this work
- Validation order for every change: lint → typecheck → test, all must pass. `console.log` and Clerk/Stripe/Firebase references must return nothing on AGENTS.md's grep checks.

## What Fleet Management is (and isn't) for MVP1–2

- **Is:** a reporting and oversight layer for owners who run multiple vehicles/drivers on Ride — visibility into vehicles, drivers, assignments, trip volume, and gross earnings, plus admin-side approval/compliance tooling.
- **Isn't:** a payment processor, escrow holder, or commission-splitting engine. No money moves through the platform on a fleet owner's behalf.

## Core architecture principles

1. One auth system, capability-based (`RIDER`, `DRIVER`, `FLEET_OWNER`, plus fleet staff roles) — no separate fleet login. Confirm via `lib/auth.ts`/`lib/session.ts` whether multi-capability accounts already exist or whether rider/driver is currently a single "mode" switch, since Fleet Owner should slot into whichever pattern is already there.
2. Fleet Management extends existing entities (`users`, `drivers`, `vehicles`, `trips`, documents) via join/relationship tables — never duplicates them.
3. Existing vehicle eligibility (`lib/vehicleTypes.ts`, BRTA/category logic) and driver KYC remain authoritative; fleet assignment just gates on their existing approval status.
4. Existing trip/dispatch engine (`utils-server/dispatch.ts`) is untouched — fleet vehicles dispatch identically to independent drivers, no special fleet priority in the five-factor scorer for MVP.
5. Fleet revenue reporting reads through the existing accounting (`lib/accounting.ts`) and zone-economics (`lib/zoneEconomics.ts`) patterns rather than inventing new aggregation infrastructure.
6. Everything fleet-owner-facing is scoped server-side to their own fleet; cross-fleet access is a hard authorization boundary, tested explicitly.
7. Mobile UX stays shallow — Dashboard / Operations / Finance / More — depth pushed into "More", matching the existing driver-tab shallow structure.
8. Admin controls all fleet-related rates via existing `system_config`/`pricing`-style tables (`app/admin/pricing.tsx` is the likely sibling) — zero hardcoding.

## Data model — MVP1

Reporting-only design; no table stores split/commission money fields.

- `fleets` — id, owner_user_id, name, fleet_type (`NATIVE` for MVP1), status, business info, created/updated_at
- `fleet_members` — fleet staff (OWNER/MANAGER/DISPATCHER/ACCOUNTANT/VIEWER), fleet_id, user_id, role, status
- `fleet_vehicles` — join table, fleet_id + vehicle_id, unique constraint, status, joined_at/left_at
- `fleet_drivers` — join table, fleet_id + driver_id, unique constraint, status, joined_at/left_at
- `fleet_vehicle_assignments` — driver↔vehicle history, fleet_id, vehicle_id, driver_id, assigned_at/unassigned_at, assigned_by, reason — append-only, never overwritten
- `fleet_management_plans` — admin-configurable: name, billing period, price, vehicle_limit, driver_limit, features
- `fleet_management_subscriptions` — fleet_id, plan_id, status, current_period_start/end — separate from driver call packages. Check whether this can reuse the existing commission/dues collection mechanism (see grounding notes above) before building new payment plumbing.
- `fleet_alerts` — fleet_id, type, severity, message, entity_type/id, is_read, resolved_at
- `audit_logs` — check if one already exists (not confirmed in this file list); extend with fleet-scoped actions if so, create if not

**No `fleet_trip_records` in MVP1.** Native trips already exist in the `trips` table. Fleet revenue reporting is a read query: trips joined to whichever vehicle/driver was assigned to that fleet at the time of the trip, aggregated for dashboard/finance screens — via the accounting/zone-economics pattern, not a new write path. Keeps trip completion's write path completely untouched.

## Data model — Deferred (MVP2 / MVP3)

- **MVP2:** `fleet_maintenance_records`, `fleet_documents` (or extend existing document system — check `app/admin/documents.tsx` + `app/api/admin/documents/*` for the existing pattern), driver/vehicle performance views, live fleet map
- **MVP3 (external SaaS):** `fleet_integrations`, `integration_sync_jobs`, external entity mapping tables, and only then `fleet_trip_records` (needed because external trips have no native `trips` row to join against). Build the generic adapter interface before any specific provider. Treat the first integration as mocked in development — Uber/Pathao API access in Dhaka is not guaranteed.

## Screens — MVP1

New route group: `app/(main)/(fleet)/`. Dashboard, Fleet Profile, Vehicle List/Detail, Add Vehicle (reusing `lib/vehicleTypes.ts` eligibility), Driver List/Detail, Driver↔Vehicle Assignment, Fleet Trips (native only), Fleet Finance (reporting-only), Fleet Management Subscription, Alerts. Maintenance, live map, and staff-role management move to MVP2. Admin side reuses `components/admin/*` primitives throughout.

## Phased delivery plan

**Phase 0 — Codebase audit (mandatory before schema is finalized)**
- [ ] Read `docs/Plan/IMPLEMENTATION-AGENT-PROMPT.md` for the actual 85-table/29-enum schema (not in this file export)
- [ ] Read `docs/Plan/13-CONVENTIONS.md` for coding conventions beyond what's in AGENTS.md
- [ ] Confirm whether the auth/user model already supports multiple capabilities per user, or is currently a single-mode switch (`lib/auth.ts`, `lib/session.ts`)
- [ ] Read `lib/accounting.ts` and `lib/zoneEconomics.ts` to design fleet reporting consistently with existing patterns
- [ ] Read `app/api/driver/commission-statement+api.ts` and `app/api/driver/dues+api.ts` to understand the existing commission-collection mechanism, and evaluate reusing it for the fleet management fee
- [ ] Confirm exact `users`/`drivers`/`vehicles`/`trips` column names for the joins below
- [ ] Confirm `_bdt`/paisa scaling convention via `lib/money.ts`
- [ ] Confirm whether an `audit_logs` table already exists

**Phase 1 — Data model**
- [ ] Migrations for the MVP1 tables above
- [ ] Unique constraints: `(fleet_id, vehicle_id)`, `(fleet_id, driver_id)`, single active assignment per vehicle/driver
- [ ] Add explicit GRANT statements if any fleet table needs direct `supabase-js`/PostgREST access (TD-31)

**Phase 2 — Authorization**
- [ ] Add `FLEET_OWNER` capability + fleet staff roles to existing auth model
- [ ] Fleet-scoped authorization middleware; explicit cross-fleet access tests

**Phase 3 — Native fleet backend**
- [ ] Fleet CRUD, vehicle/driver join endpoints, assignment endpoints with history (`app/api/fleet/...+api.ts`)
- [ ] Read-only fleet revenue/trip reporting queries through `lib/accounting.ts`
- [ ] `fleet_daily_metrics` aggregation job or cached query, modeled on the zone-economics pattern

**Phase 4 — Mobile UX**
- [ ] Fleet onboarding flow (Profile → Become a Fleet Owner → Fleet info → Plan selection → Fleet created)
- [ ] `app/(main)/(fleet)/` screens: Dashboard, Vehicles, Drivers, Assignment, Trips, Finance, More
- [ ] Role switching (Rider/Driver/Fleet Owner) from Profile, matching whatever mode-switch pattern Phase 0 uncovers

**Phase 5 — Fleet management subscription**
- [ ] Admin-configurable plan table, billing cycle, vehicle/driver limits
- [ ] Payment flow — reuse existing commission/dues collection mechanism if Phase 0 confirms it fits, otherwise reuse PortPos purchase flow used for driver call packages

**Phase 6 — Admin panel**
- [ ] Fleet approval/suspension, plan configuration, fleet list/detail, audit log viewer — built from `components/admin/*`

**Phase 7 (MVP3, later) — External Fleet SaaS**
- [ ] Generic integration adapter interface, mocked provider for development
- [ ] `fleet_integrations`, sync jobs, external entity mapping, webhook handling with signature validation and idempotency
- [ ] First real integration only once a partner API is actually available

## Assumption flagged for confirmation

The Fleet Management fee (Phase 5) is assumed to be a genuine new platform revenue stream, admin-configurable and zero-able like other Ride rates. If that's wrong, Phase 5 drops from MVP1 without affecting the rest of this plan.

## Still needed for full line-level precision

To match the precision of Zia's other implementation-ready plans (exact table/column names, function signatures), one of:
- The actual contents of: `docs/Plan/IMPLEMENTATION-AGENT-PROMPT.md`, `docs/Plan/13-CONVENTIONS.md`, `src/db/schema.ts` (at minimum the `users`/`drivers`/`vehicles`/`trips` definitions), `lib/accounting.ts`, `lib/zoneEconomics.ts`, `app/api/driver/commission-statement+api.ts`, `app/api/driver/dues+api.ts`, `lib/session.ts`, `lib/auth.ts`
- Or, a session with Desktop Commander/Filesystem MCP where these can be read directly
