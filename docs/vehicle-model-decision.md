# C5 — Vehicle Model Decision: One Vehicle vs. Many Vehicles Per Driver

**Status:** Temporary decision applied (Option A — one vehicle per driver).
**Product owner sign-off:** PENDING. This document simulates the safe default until Product rules.
**Date:** 2026-08-22
**Related audit finding:** C5 (Vehicle Model Contradiction)
**Related plan:** `docs/Screens Plan/Screens/6-10 Features/07 FINAL IMPLEMENTATION PLAN — Plans 06-11.md` § P0-A, § P3.

## 1. The contradiction

The database and the UI disagree about how many vehicles a driver may have:

| Layer | Current behavior |
|---|---|
| `src/db/schema.ts:390` | `uniqueIndex("vehicles_driver_id_idx").on(t.driver_id)` — at most **one** `vehicles` row per driver (hard constraint). |
| `POST /api/driver/vehicles` | `onConflictDoUpdate({ target: vehicles.driver_id, ... })` — re-submitting **overwrites** the existing row (consistent with one-vehicle). |
| `GET /api/driver/vehicles` | Returns a list and derives `is_active` from `drivers.vehicle_id` (P0-A fix) — shaped for **many** vehicles. |
| `POST /api/driver/vehicle-activate` | Switches `drivers.vehicle_id` between multiple registered vehicles — only meaningful with **many** vehicles. |
| `vehicle-management` / `select-active-vehicle` screens | "Activate" button and multi-vehicle selection UI — imply **many** vehicles. |

Because the unique index makes a second `vehicles` row impossible, the multi-vehicle UI and
the `vehicle-activate` endpoint can never operate on more than one row. They are dead paths
that mislead users ("switch vehicle") and invite future data corruption if partially "fixed".

## 2. Option A — One vehicle per driver (applied temporarily)

**Semantics:** a driver registers exactly one vehicle. Changing the vehicle (or its type) is a
support-assisted or re-registration flow, not an in-app switcher.

**Pros**
- Matches the current hard schema constraint — zero migration risk.
- Matches dispatch reality: dispatch filters candidates by `drivers.vehicle_type` (single value), not by a vehicle set.
- Simplest mental model for drivers; no "active vehicle" concept to explain.
- Smallest attack/misconfiguration surface (no accidental silent overwrite of vehicle history via the upsert path once the UI is guarded).

**Cons**
- Drivers cannot self-serve vehicle replacement (support load).
- Does not match the master plan's multi-vehicle UX.

**Applied code changes (this repo, this session)**
1. **Removed** `app/api/driver/vehicle-activate+api.ts` (dead endpoint — unreachable multi-row state).
2. **`app/(main)/(rider)/vehicle-management/index.tsx`** — removed the "Activate" button, activation state, and the online-switch confirmation modal. Single-vehicle display. When a vehicle already exists, the "+ Add Vehicle" button is replaced by the notice: *"You can only register one vehicle. Contact support to change it."*
3. **`app/(main)/(rider)/select-active-vehicle.tsx`** — removed multi-vehicle selection and all `vehicle-activate`/`vehicle-type-change` calls. Now a read-only single-vehicle confirmation display (post-onboarding landing), with the same one-vehicle notice.
4. **Kept** `uniqueIndex("vehicles_driver_id_idx")` — no migration.
5. **Kept** `POST /api/driver/vehicles` upsert (`onConflictDoUpdate`) — required for idempotent onboarding re-submission; the UI guard prevents mid-career overwrite.
6. **Kept** `GET /api/driver/vehicles` list shape and `is_active` derivation — forward-compatible with Option B.

**Known accepted risks**
- A malicious client can still POST `/api/driver/vehicles` to overwrite its own vehicle row (self-owned data only). A server-side `409 vehicle_already_registered` guard is recommended hardening once Product confirms onboarding retry semantics (see §4).

## 3. Option B — Many vehicles per driver (requires Product approval + migration)

**Semantics:** a driver may register multiple vehicles and switch the active one in-app.

**Required code changes (in order)**

1. **Drizzle migration** — drop the unique index:
   ```sql
   DROP INDEX IF EXISTS "vehicles_driver_id_idx";
   ```
   (`npx drizzle-kit generate` after removing the `uniqueIndex` from `src/db/schema.ts`.)
2. **Join table decision** — inspect whether a `driver_vehicles` assignment join table is needed. Current schema has **no** such table; `drivers.vehicle_id` (FK → `vehicles.id`) + `vehicles.driver_id` already model ownership and active selection. A join table is only required if a vehicle may be shared across drivers — not a stated requirement. Recommended: keep the two FK columns, no join table.
3. **`POST /api/driver/vehicles`** — replace `onConflictDoUpdate` with a plain `INSERT` (new row per submission). Re-add eligibility gating for type changes (already present). Decide whether the new vehicle becomes active immediately (recommend yes, mirroring current `drivers.vehicle_id` sync) and what happens to onboarding retries (recommend: if driver already has a vehicle, upsert-on-`registration_number` or return `409` with an explicit "edit vehicle" contract).
4. **Reinstate activation** — restore an activation endpoint equivalent to the removed `vehicle-activate+api.ts` (ownership check, eligibility check on type change, `confirm_online_switch` guard, transactional `drivers.vehicle_id` + `drivers.vehicle_type` update), or extend `vehicle-type-change` to accept a concrete `vehicle_id`.
5. **UI** — restore multi-vehicle selection in `vehicle-management` / `select-active-vehicle` (the code removed in §2 remains in git history for reference).
6. **Dispatch verification** — confirm `utils-server/dispatch.ts` continues to filter by `drivers.vehicle_type` and that the active-vehicle switch updates it atomically.

**Pros/cons** — inverse of Option A: better driver self-service and master-plan UX parity; costs a migration, a re-enabled activation path, more dispatch verification, and document/photo management per vehicle.

## 4. Open questions for Product

1. Can a driver own and operate more than one vehicle in Bangladesh operations (insurance/fitness reality)?
2. If one vehicle: what is the support channel SLA for vehicle changes? Should self-service "replace vehicle" be scoped instead?
3. If many vehicles: must packages (`packages.vehicle_type` scoping) interact with the *active* vehicle type at purchase time or at dispatch time?
4. Onboarding retry semantics: may a driver re-submit add-vehicle to correct a typo, or is that also support-gated?

## 5. Decision record

| Date | Decision | Authority |
|---|---|---|
| 2026-08-22 | Apply Option A as temporary safe default; UI guard message added; dead `vehicle-activate` endpoint removed. | Engineering (simulated — no Product input available) |
| — | Option A vs B final ruling | **Product — PENDING** |
