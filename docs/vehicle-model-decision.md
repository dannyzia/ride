# Vehicle Model Decision (C5)

> **Status:** RESOLVED — Universal fleet model (Option A per Zia ruling 2026-08-16, implemented 2026-08-30 Phase 1). Multi-vehicle per driver within a fleet is LIVE at the data layer.
> **Date:** 2026-08-22 (created) · 2026-08-30 (resolved + implemented)
> **Owner:** Product / Engineering

## Resolution (2026-08-30, Phase 1 implemented)

- `vehicles_driver_id_idx` (unique on `vehicles.driver_id`) is DROPPED; `vehicles.driver_id` is now a NULLABLE denormalized cache (NULL = unassigned pool vehicle).
- `drivers.fleet_id` and `vehicles.fleet_id` are NOT NULL (universal backfill via `scripts/fleet-backfill.ts`; new drivers get a solo NATIVE fleet at registration in `app/api/register+api.ts`).
- `fleet_vehicle_assignments` is the authoritative assignment source (append-only; single active row per vehicle AND per driver enforced by partial unique indexes `fva_vehicle_active_idx` / `fva_driver_active_idx` WHERE unassigned_at IS NULL).
- `drivers.vehicle_id` / `drivers.vehicle_type` remain the active-pointer caches — dispatch (`utils-server/dispatch.ts`) unchanged.
- Assignment writes go ONLY through `lib/fleetAssignment.ts` (`assignVehicleToDriver` / `unassignVehicle`, single transaction).
- Fleet tables added: `fleets`, `fleet_members`, `fleet_vehicle_assignments`, `fleet_subscription_plans`, `fleet_subscriptions`, `fleet_billing_transactions`, `fleet_alerts`, `audit_logs`. Spec: `docs/FeatureList/New Feature Plan/Fleet Management/06-FLEET-MANAGEMENT-V5-by-Claude.xml` §database.MVP1.


## Context

The database schema has a unique index (`vehicles_driver_id_idx`) on the `vehicles` table that enforces **one vehicle per driver**. However, the UI was originally built to support multiple vehicles with an "Activate" flow. This creates a contradiction between the data model and the user experience.

## Current State (Temporary Safe Default)

- **Schema:** One vehicle per driver (unique index enforced).
- **UI:** Shows the registered vehicle as read-only. If the driver has a vehicle, displays: *"You can only register one vehicle. Contact support to change it."*
- **API:** The `vehicle-activate` endpoint has been **removed**. No multi-vehicle activation exists.
- **Adding:** The "Add Vehicle" button only appears when the driver has zero vehicles.

---

## Option A: One Vehicle Per Driver (Current Default)

### How it works
- The `vehicles_driver_id_idx` unique index remains.
- `POST /api/driver/vehicles` upserts on `(driver_id)` — only one row per driver.
- The UI shows a single vehicle card with no "Activate" button.
- Vehicle changes require support intervention (admin API).

### Pros
- Simple data model — no join table, no `is_active` flag complexity.
- No multi-vehicle state management in the dispatch engine or heartbeat.
- Clear business rule: each driver is associated with one vehicle at a time.
- No risk of stale `is_active` flags or orphaned vehicle records.

### Cons
- Drivers who own multiple vehicles (common in Bangladesh) cannot switch between them.
- Vehicle changes require admin/support involvement, adding operational overhead.
- If a driver's vehicle is in the shop, they cannot use a backup vehicle without support.

### Required Code (if chosen)
1. Keep `vehicles_driver_id_idx` unique index as-is.
2. Remove `vehicle-activate` endpoint (already done).
3. Remove `select-active-vehicle` multi-selection UI (already simplified).
4. Remove the `is_active` column from the `vehicles` table (or ignore it).
5. Add admin panel support for vehicle replacement (already exists via admin routes).

---

## Option B: Multiple Vehicles Per Driver

### How it works
- Drop the `vehicles_driver_id_idx` unique index.
- Add a `driver_vehicles` join table (or use the `is_active` flag on the existing `vehicles` table).
- Each driver can register multiple vehicles, with one marked as "active" for dispatch.
- The "Activate" button in vehicle-management lets drivers switch their active vehicle.

### Schema Changes Required
```sql
-- Option B1: Keep vehicles table, remove unique index, use is_active flag
ALTER TABLE vehicles DROP CONSTRAINT vehicles_driver_id_idx;
-- is_active is already on the vehicles table

-- Option B2: Add a join table (more normalized)
CREATE TABLE driver_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(driver_id, vehicle_id)
);
```

### Pros
- Drivers with multiple vehicles can switch between them.
- Supports common Bangladesh use case (backup vehicles, family vehicles).
- Future-proofs for vehicle rental/ownership models.

### Cons
- Adds complexity to the dispatch engine (must check which vehicle is active).
- Heartbeat must track the active vehicle's location/type.
- `is_active` flag can become stale if not properly managed.
- Subscription/packages may need vehicle-type binding (already supported via `packages.vehicle_type`).
- Migration risk: existing data must be consistent before dropping the index.

### Required Code (if chosen)
1. **Migration:** Drop `vehicles_driver_id_idx` unique index.
2. **POST /api/driver/vehicles:** Insert new rows (not upsert).
3. **vehicle-activate endpoint:** Re-create with proper transaction handling.
4. **Vehicle-management screen:** Re-add multi-vehicle list with "Activate" buttons.
5. **Select-active-vehicle screen:** Re-add multi-selection UI.
6. **Dispatch engine (`utils-server/dispatch.ts`):** Filter candidates by `drivers.vehicle_type` matching the active vehicle.
7. **Heartbeat (`utils-server/heartbeat.ts`):** Track active vehicle location.
8. **Admin panel:** Support per-vehicle document verification.

---

## Recommendation

**Default to Option A (one vehicle) for initial launch.** The unique index is already in place, the UI is simplified, and the operational complexity of multi-vehicle is not justified for MVP. Revisit Option B when:
- Driver demand analysis shows >30% of drivers own multiple vehicles.
- The platform is ready for vehicle rental/ownership features.
- The dispatch engine has been hardened for multi-vehicle state.

## Decision Log

| Date | Decision | By | Notes |
|------|----------|----|-------|
| 2026-08-22 | Default to Option A (temporary) | Engineering | Safe default; UI constraint in place; design doc created |

---

*This document should be updated when Product makes a formal decision.*
