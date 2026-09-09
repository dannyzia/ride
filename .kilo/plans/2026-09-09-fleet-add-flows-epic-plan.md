**Purpose:**     Build plan for the Fleet add-flows epic — staff add-vehicle / attach-driver / invite-driver endpoints with server-side plan-limit enforcement. Read this before writing any code for ISSUE-35.
**Owner:**       Orchestrator (Zia-approved scope per ISSUE-34 ruling decision `01M22CYWHWBFG12GATZJQ7AC1W`); Coding model executes.
**Status:**      ACTIVE — all four §8 open questions ruled by Zia 2026-09-09 (D1 = option b confirmed; vehicle_type = all 9; rate limiting = none; vehicle removal RE-SCOPED, see §4.4 + §8-R4).
**Source of truth:** ISSUE-35 acceptance criteria (Rhizome, verbatim in §1 below) + ISSUE-34 ruling.
**Related (concrete paths):**
  - `lib/fleetLimits.ts` — the enforcement lib to wire (RESERVED logic; NULL=unlimited, no-subscription open, fail-open)
  - `app/api/fleet/staff+api.ts` — the POST/role-gate precedent this plan's routes mirror
  - `lib/fleetAssignment.ts` — sole write path for assignments + pointer caches; endpoints MUST use it
  - `app/api/driver/vehicles+api.ts` — driver self-add vehicle tx precedent (vehicle upsert + vehicleModels)
  - `app/api/fleet/limits+api.ts` — display-only `at_limit` flags (AC 3: never the sole gate)
  - `src/db/schema.ts:2485-2620` — fleets, fleetSubscriptionPlans, fleetMembers, fleetVehicleAssignments
  - `tests/api/fleet/plan-limits.test.ts` — existing lib coverage (22 it(); harness pattern to extend)
**Last verified:** 2026-09-09, by Buffy (coding agent) — every file above read this session; schema lines verified.
**How to update:** Rulings beat this file: if Zia diverges from §3/§8, edit those sections and record the divergence in a Note at the bottom — never silently reconcile.

---

# Fleet Add-Flows Epic — Build Plan (ISSUE-35)

## 1. Binding acceptance criteria (ISSUE-35, verbatim)

1. Staff-side add-vehicle and add-driver (or invite-driver) endpoints exist under `app/api/fleet/*`, gated by `requireFleetMember`.
2. Each mutation enforces plan limits server-side via `checkVehicleLimit`/`checkDriverLimit` from `lib/fleetLimits.ts` inside or before the tx, returning `403 plan_limit_exceeded` (with current/limit) on breach.
3. `GET /api/fleet/limits` `at_limit` flags are treated as display-only, never the sole gate.
4. Behavioral tests cover: under-limit ok, at-limit 403, NULL limit unlimited, no-subscription unlimited, fail-open DB error.
5. If soft deletes ever land on vehicles/drivers, revisit the lib's usage count filter (`deleted_at`) before shipping.

Ruling embedded in AC 2: the lib is called **inside the mutation**, the response is **403** with `current`/`limit`, and the GET endpoint's flags are **display-only**.

## 2. What exists vs. what gets built (disk-verified 2026-09-09)

| Surface | Today | Epic builds |
|---|---|---|
| Staff add/invite (staff roles) | `POST /api/fleet/staff` (OWNER-only → `fleet_members` row) | Exists — untouched |
| Add vehicle | Nothing staff-side (`app/api/fleet/vehicles+api.ts` is GET-only; only mutation is driver self-add in own solo fleet) | `POST /api/fleet/vehicles` |
| Attach driver to vehicle | `lib/fleetAssignment.ts` `assignVehicleToDriver` (lib exists, **no route exposes it**) | `POST /api/fleet/assignments` |
| Add driver to fleet | Nothing — and structurally different from staff invite (see §3) | `POST /api/fleet/drivers` (attach semantics, Phase B) |

### Invariants the epic must not break

- **I-1 (universal fleet model):** every driver owns exactly one fleet; `drivers.fleet_id` is NOT NULL. This is why "add driver" is an *attach/transfer*, not an insert-and-null-fleet (§3, Decision D1).
- **I-2 (single write path):** all assignment/pointer-cache writes go through `lib/fleetAssignment.ts` — never write `drivers.vehicle_id`/`vehicles.driver_id` directly.
- **I-3 (display-only flags):** `GET /api/fleet/limits` `at_limit` is informational; the endpoints are the gate (AC 3).
- **I-4 (lib semantics frozen):** NULL plan limit = unlimited; no active subscription = no enforcement; DB error = fail-open. The endpoints adopt these as *product* behavior, not accidents.
- **I-5 (limit semantics = "adding one more"):** `count >= limit` blocks the Nth+1 insert. The check happens **before** the insert and (per §5) is re-verified inside the tx behind an advisory lock.
- **I-6 (no client-trusted money/limits):** plan resolution is server-side only; no `EXPO_PUBLIC_*` involvement; response bodies carry machine error codes per house convention.

## 3. Design decisions (D1 is the one needing Zia sign-off)

### D1 — "Add driver" = attach existing driver, not create (PROPOSED — needs ruling)

`drivers.fleet_id` is NOT NULL and every driver already owns exactly one fleet (I-1). A staff "add driver" therefore cannot mean INSERT-with-null-fleet. Three candidate semantics:

| Option | Behavior | Consequence |
|---|---|---|
| (a) Attach-only | `POST /api/fleet/drivers` attaches an **existing** driver (by user_id of an already-registered driver) to THIS fleet, leaving their solo NATIVE fleet as historical owner (via `fleet_members`-style trail) | No transfer logic; driver keeps duplicate fleet ownership — violates exactly-one-fleet invariant unless the solo fleet is demoted/closed |
| **(b) Attach-or-transfer (recommended)** | If the target user has no drivers row → **provision** one (driver onboarding stub) into this fleet. If they have a drivers row in a fleet where they own no vehicles and have no active assignment → **transfer** to this fleet (single UPDATE of `drivers.fleet_id`, old solo fleet left in place). If they have active work → **409** `driver_transfer_blocked` | Respects I-1; no new table; transfer guards prevent stranding |
| (c) Full transfer epic | Include ownership demotion, wallet/payout rerouting, active-ride handling | Scope explosion; the ruling only requires *limit enforcement at the add-flows* |

**Recommendation: (b)**, split into two phases (§7): Phase A ships attach-new + attach-existing-without-work; Phase B ships the transfer guard checks. Phase C (deferred, tracked separately): solo-fleet demotion ceremony.

**Why not (a):** silently duplicating fleet ownership re-creates exactly the class of stale-pointer bugs the Bug Survey's consensus theme #8 (cross-vertical/resource exclusivity) warns about.

### D2 — Invite-driver = staff invite, NOT driver attach

`fleet_members` is staff-only (OWNER/MANAGER/DISPATCHER/ACCOUNTANT/VIEWER). "Inviting a driver" as a staff row would be a category error. Options considered:
- New `fleet_driver_invites` table (token, expiry, consumed_at) — real invite flow, new table + migration.
- **Provisioning on attach (chosen for Phase A):** AC 1 says "add-driver **(or invite-driver)**" — the "or" makes invite optional. Phase A provisions the drivers row at attach time (option b above); a token-based invite table is explicitly **out of scope** and can be a follow-up issue if Zia wants email/SMS invitation UX.

### D3 — Limit-check placement: inside the tx, behind an advisory lock

The lib's count-then-insert is a read-then-write race (the exact TOCTOU family — Bug Survey consensus theme #7). Plan:
1. Call `checkVehicleLimit`/`checkDriverLimit` **inside** `db.transaction`, as the first statement, on the same `tx`… but the lib currently uses the global `db`, not a tx handle. **Required refactor:** add optional `tx?: FleetTx` parameter to `checkLimit` (defaulting to `db`) — a signature-compatible, non-breaking change; existing 22 tests pass unchanged.
2. `SELECT pg_advisory_xact_lock(hashtext('fleet_limit:' || fleet_id))` as the second statement — serializes concurrent add-flows per fleet, closing the race (AC 2's "inside or before the tx" is satisfied *and* hardened).
3. Breach → throw a typed error the route maps to `403 plan_limit_exceeded` with `{ current, limit }` in the body (not just the message).

**Alternative rejected:** a DB partial-unique "at most N rows" constraint — impossible for variable N without a trigger-based counter table, which contradicts "no schema decisions without Zia".

### D4 — Fleet status gate

Endpoints reject when `fleets.status` is not an active status (envelope: allow `ACTIVE`; reject `PENDING`/`SUSPENDED` with `403 fleet_not_active`). Exact enum values to be confirmed from `fleetStatusEnum` at implementation time; do not guess.

### D5 — Vehicle add dedupes on registration_number per fleet

Precedent: driver self-add uppercases `registration_plate`. Staff add should 409 on a duplicate `registration_number` **within the same fleet** (cross-fleet duplicates are a legal/registry question — out of scope, no global uniqueness constraint).

## 4. API contracts (house format: Zod at boundary, `{ error, message }` errors, Expo flat params)

### 4.1 `POST /api/fleet/vehicles?fleet_id=<uuid>` (Phase A)

- **Auth:** `requireFleetMember(fleetId, ["OWNER", "MANAGER"])`.
- **Body (Zod):** `{ registration_plate: string 4-20 chars (uppercased), vehicle_type: z.enum(vehicleTypeEnum.enumValues) — import from lib/vehicleTypes.ts, never inline, manufacturer?, model?, manufacturing_year?: int, passenger_seats?: int, has_ac?: boolean }`.
- **R2 (2026-09-09):** all 9 types accepted — import `VEHICLE_TYPE_ZOD_ENUM` from `lib/vehicleTypes.ts` (single source); no fleet-scoped subset (the rental enum’s ambulance/truck values are not in this enum — nothing to fence).
- **Flow:** tx → advisory lock → `checkVehicleLimit(fleetId, { tx })` → 403 on breach → vehicle INSERT (fields per `vehicles` schema) → return `201 { vehicle_id, vehicle: {...} }`.
- **Errors:** 400 `invalid_param` / body errors · 401 · 403 `forbidden` / `fleet_not_active` / `plan_limit_exceeded` (+current/limit) · 409 `duplicate_registration` · 500.

### 4.2 `POST /api/fleet/assignments?fleet_id=<uuid>` (Phase A — exposes the existing lib)

- **Auth:** `requireFleetMember(fleetId, ["OWNER", "MANAGER", "DISPATCHER"])`.
- **Body:** `{ vehicle_id: uuid, driver_id: uuid, reason? }`.
- **Flow:** tx → `assignVehicleToDriver(tx, {...})` (fleet-membership + existence checks are inside the lib) → `201 { assignment_id }`.
- **Note:** no plan-limit check here — assignment moves existing fleet resources, adds nothing to the fleet. The check lives in the *add* endpoints (§4.1, §4.3).
- **Errors:** 404 codes mapped from `FleetAssignmentError` (`vehicle_not_in_fleet`, `driver_not_in_fleet`, …), 403s as above.

### 4.3 `POST /api/fleet/drivers?fleet_id=<uuid>` (Phase A + B — per D1 option b)

- **Auth:** `requireFleetMember(fleetId, ["OWNER", "MANAGER"])`.
- **Body:** `{ user_id: uuid }` (the target must be a registered user; provisioning their drivers row is the attach).
- **Flow:** tx → advisory lock → `checkDriverLimit(fleetId, { tx })` → 403 on breach →
  - **(A1) target has no drivers row:** INSERT drivers row `{ user_id, fleet_id, status: 'pending' }` (status per schema default — verify enum at implementation), vehicle fields NULL → `201 { driver_id, attached: 'provisioned' }`.
  - **(A2) drivers row already in THIS fleet:** 409 `already_in_fleet`.
  - **(B1) drivers row in ANOTHER fleet, no active work:** UPDATE `drivers.fleet_id = fleetId` → `201 { driver_id, attached: 'transferred' }`. "No active work" = no active `fleet_vehicle_assignments` row (`unassigned_at IS NULL`) for the driver and `drivers.is_online = false`. Keep the OLD fleet untouched (Phase C defers solo-fleet demotion ceremony) — the driver's old solo NATIVE fleet simply loses its driver row linkage.
  - **(B2) active work or online:** 409 `driver_transfer_blocked` (with the conflicting resource in the message).
- **Errors:** 404 `user_not_found` · 403 as above + `plan_limit_exceeded` · 409s as above.

### 4.4 Vehicle removal (Phase B — re-scoped by R4, 2026-09-09)

- **Phase A ships WITHOUT a remove path** (R4): slot-freeing does not require deleting the vehicle (the lib counts `vehicles.fleet_id` rows), and hard delete is FK-blocked for any vehicle with assignment history (`fleet_vehicle_assignments.vehicle_id` NOT NULL, NO ACTION → 23503). An at-limit fleet with a stale-but-owned vehicle is a frozen-slot state until the dues-gated exit flow exists (ISSUE-36).
- **Phase B — error-first removal endpoint `DELETE /api/fleet/vehicles/[id]?fleet_id=<uuid>`:** `requireFleetMember(fleetId, ["OWNER", "MANAGER"])` → if any active `fleet_vehicle_assignments` row exists → `409 vehicle_in_use` (staff unassigns via §4.2 first) → then delete; a 23503 fallback (append-only history exists) → `409 vehicle_has_history` pointing at delisting. **True delisting (end assignment + free the slot with the vehicle row retained) is ISSUE-36’s exit/dues-gate flow** — out of scope here by design.
- Driver removal stays **Phase C / deferred** (payout/ride interactions), unchanged.

## 5. Race-condition hardening (the Bug Survey lesson, applied)

The count-then-insert check is TOCTOU. With `INSTANCE_COUNT=1` the in-process race window is small but real (async interleaving), and the pattern is documented as the house anti-example. Hardening:
- `pg_advisory_xact_lock(hashtext('fleet_limit:' || fleet_id))` at tx start in both add endpoints.
- The lib check runs on the **tx handle** (D3 refactor) so the count read is in the same snapshot as the insert.
- Tests include a concurrent-interleaving case: two mocked inserts racing the check → exactly one succeeds (verifiable via call-order assertions on the mock queue).

## 6. Migration & schema impact

**None required.** All tables/columns exist (`fleets.subscription_plan_id`, `fleet_subscription_plans.vehicle_limit/driver_limit`, `fleet_members`, `fleet_vehicle_assignments`, `drivers.fleet_id`). No new tables (D2 chose provisioning over an invites table). AC 5's soft-delete watch item: no `deleted_at` on vehicles/drivers today — the lib's count has no `deleted_at` filter, which is correct *today*; revisit if soft deletes land (already encoded in AC 5).

## 7. Phasing

- **Phase A (the epic’s core, ~1.5 sessions):** §4.1, §4.2 + `lib/fleetLimits.ts` tx-handle refactor + tests for all four AC-4 cells per endpoint. No transfer logic, no remove path (R4).
- **Phase B (~1 session):** §4.3 attach-or-transfer (A1/A2/B1/B2 branches) with the active-work guard + §4.4 error-first vehicle removal (R4).
- **Phase C (separate issue, not this epic):** solo-fleet demotion ceremony, driver removal endpoint, token-based driver invites (if wanted).

## 8. Rulings (Zia, 2026-09-09 — all four closed; plan is ACTIVE)

1. **R1 — D1 = option (b), attach-or-transfer, two-phase split confirmed as designed.** §3 stands verbatim (Phase A: provision + attach-no-work; Phase B: transfer guards; Phase C deferred: solo-fleet demotion ceremony).
2. **R2 — vehicle_type: ALL 9 types accepted.** Import `VEHICLE_TYPE_ZOD_ENUM` from `lib/vehicleTypes.ts` (§4.1 already specifies this import). No fleet-scoped subset, no allow-list config: the rental enum’s `ambulance_*`/truck values do not exist in the ride-hailing `vehicleTypeEnum`, so there is nothing to fence. If vertical-specific fleets ever need scoping, that is a new product decision.
3. **R3 — Rate limiting: none (consistency).** No `app/api/fleet/*` route carries a limiter (verified: the only `rate_limit` grep hit is `integrations+api.ts` third-party provider metadata). Adding one only here would be an inconsistent surface; every mutation is already gated by `requireFleetMember`. Revisit platform-wide if abuse appears in practice.
4. **R4 — Vehicle removal: RE-SCOPED (diverges from this file’s original §4.4).** Hard DELETE as designed is REJECTED, on two pieces of disk evidence: (a) `checkVehicleLimit` counts rows by `vehicles.fleet_id`, so freeing a slot does NOT require deleting the vehicle; (b) `fleet_vehicle_assignments.vehicle_id` is NOT NULL with default FK behavior (NO ACTION), so deleting any vehicle with history throws 23503 — and the original text’s unassign-then-delete order was backwards (the delete would 409 on the very assignment it was supposed to close; if the delete ran first, it would orphan append-only history). Revised semantics: **Phase A ships WITHOUT a remove path** (an at-limit fleet with a stale-but-owned vehicle is an honest frozen-slot state). **Phase B ships error-first removal** (see rewritten §4.4). **True delisting (end assignment, free the slot, keep the vehicle row) is ISSUE-36’s exit/dues-gate flow by design — do not build it here.** No `vehicles.status` column in this epic; if the dues-gate build wants one, that goes through Zia with ISSUE-36.

## 9. Test plan (extends `tests/api/fleet/plan-limits.test.ts` harness pattern)

For **each** add endpoint, the AC-4 matrix: under-limit ok (201) · at-limit 403 `plan_limit_exceeded` + `current`/`limit` in body · NULL limit unlimited (201) · no-subscription unlimited (201) · fail-open DB error (201 despite check throwing). Plus:
- Role matrix: allowed roles 201, VIEWER/ACCOUNTANT 403, non-member 403, unauthenticated 401.
- Fleet status gate: PENDING/SUSPENDED → 403 `fleet_not_active`.
- Advisory-lock ordering: assert the lock call precedes the limit check precedes the insert (call-order on mocks).
- §4.2: `FleetAssignmentError` code → HTTP status mapping; cross-fleet vehicle/driver → 404; pointer caches (`drivers.vehicle_id`, `vehicles.driver_id`, `drivers.vehicle_type`) asserted written in the same tx.
- §4.3 branches: provisioned vs already_in_fleet vs transferred vs driver_transfer_blocked.
- Regression: existing 22 lib tests stay green after the tx-handle refactor (signature-compatible).

**Gates (standing order):** eq(col,null) scan → `npx tsc --noEmit` (root + utils-server) → `npm run lint` → `npx jest --watchAll=false` (all green; 3 pre-existing pickup-move failures are not ours if they reappear).

## 10. Out of scope (explicit)

Token-based driver invites (new table) · solo-fleet demotion ceremony · driver removal endpoint · cross-fleet registration_number uniqueness · vehicle `status` column · billing/proration interaction (that's the subscription epic) · any `users.role` writes (roles live ONLY in `fleet_members`).

---

## Ruling record (file protocol)

2026-09-09 — Zia ruled all four §8 questions (R1–R4 above). Divergence from this file’s original recommendations: §4.4 vehicle removal re-scoped (hard delete rejected on FK + limit-semantics evidence; Phase A ships without a remove path; delisting belongs to ISSUE-36). Sections §4.1 (R2 note), §4.4, §7, §8, and the header Status edited in place; no silent reconciliation.
