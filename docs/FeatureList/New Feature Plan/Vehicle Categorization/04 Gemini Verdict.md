Viewed IMPLEMENTATION-PLAN-Prompt-D-FINALIZED.md:1-52
Viewed 02%20Initial%20Prompt%20from%20Chat%20GPT.md:1-800
Viewed 02%20Initial%20Prompt%20from%20Chat%20GPT.md:1-800
Searched for "cc_range"
Searched for "vehicle_type"
Searched for "vehicle_type"
Viewed schema.ts:1-100
Viewed vehicleTypes.ts:1-199
Viewed useRiderStore.ts:1-30
Searched for "cc_range"
Searched for "cc_range"
Viewed config+api.ts:1-50
Searched for "vehicles ="
Searched for "vehicle_models ="
Searched for "cc_range"
Searched for "vehicleGroup"
Searched for "car_xl"
Searched for "vehicle_class_letter"
Searched for "const (vehicles|vehicleModels) ="
Viewed eta.ts:1-64
Viewed index.tsx:30-60
Viewed vehicles+api.ts:150-180
Searched for "passenger_seats"
Searched for "vehicleGroup"
Searched for "export const (vehicles|vehicleModels) ="
Searched for "export const platformConfig"
Searched for "export const admin"
Searched for "cc_range"
Searched for "export const vehicle"
Searched for "export const platform_config"
Searched for "cc_range"
Searched for "export const pricing"
Searched for "cc_range"
Searched for "export const vehicle"
Searched for "export const platform"
Viewed schema.ts:355-420
Viewed schema.ts:1230-1260
Viewed schema.ts:1066-1090
Viewed upgrade+api.ts:1-98
Viewed downgrade+api.ts:1-93
Viewed call-ledger.tsx:60-85
Searched for "bike_basic"
Viewed dispatch.ts:100-150
Searched for "export const pricing"
Searched for "bike_basic"
Searched for "bike_basic"
Searched for "pricing = pgTable"
Searched for ""pricing""
Searched for "VEHICLE_TYPE"
Viewed packages.tsx:1-532
Viewed request+api.ts:170-200
Searched for "pricing_not_found"

# 1. EXECUTIVE VERDICT

**APPROVE WITH CHANGES**

# 2. TERRA PLAN VALIDATION

Terra correctly identified the core schema risks (missing `car_compact`, absent `body_type` field) and correctly identified the danger of relying on the dead `cc_range` field. Terra successfully identified the critical launch-blocking nature of missing pricing rows which cause `422 pricing_not_found` errors. Terra also accurately spotted the missing `car_xl` mapping in `app/(main)/(customer)/find-ride/index.tsx` and the dangerously hardcoded `vehicle_type` definitions in `store/useRiderStore.ts` and `app/(main)/(rider)/call-ledger.tsx`.

# 3. WHOLE-SYSTEM ISSUES

- **Dynamic Admin Generation:** Terra hallucinates that admin forms need manual updates for `car_compact`. The repository actually uses dynamic mapping from `lib/vehicleTypes.ts` across admin routes. Modifying these files manually is unnecessary and risks breaking existing dynamic logic.
- **Intercity Pricing Constraints:** The `pricing` table includes an `intercity_per_km_bdt` column (introduced in migration `0009_intercity_geo_fencing.sql`). Adding `car_compact` pricing requires setting this value, not just the standard per-km rate.
- **Drizzle Enum Migrations:** Modifying a Postgres enum (`vehicle_type`) used by multiple tables (`vehicles`, `packages`, `vehicleTypeChanges`, `pricing`) requires a raw SQL `ALTER TYPE ... ADD VALUE` migration. If the coding agent relies solely on `drizzle-kit generate`, it may attempt to drop and recreate the column, risking data loss.

# 4. MISSING DEPENDENCIES

- **`vehicleTypeChanges` table:** This table tracks driver upgrades/downgrades and depends on the `vehicle_type` enum (`old_vehicle_type` and `new_vehicle_type`). It will be implicitly affected by the enum update.
- **`packages` table and APIs:** Call packages support vehicle-type scoping (`packages.vehicle_type`). Package seed scripts and creation APIs must account for the new category.
- **Broader Pricing Blockers:** `app/api/ride/schedule+api.ts`, `app/api/ride/estimate+api.ts`, and `app/api/ride/[id]/complete+api.ts` also explicitly hard-fail on `pricing_not_found`. The scope of the pricing outage is system-wide, not just `request+api.ts`.

# 5. INCORRECT ASSUMPTIONS

**FINDING:** Admin vehicle model forms contain hardcoded vehicle types.
**REPOSITORY EVIDENCE:** `app/admin/vehicle-models.tsx` (lines 30-64) maps dynamically: `const VEHICLE_TYPE_FORM_OPTIONS = VEHICLE_TYPES.map(...)`.
**IMPACT:** Following Terra's plan would cause the coding agent to search for a hardcoded list that doesn't exist, leading to confusion or destructive edits to dynamic mapping.
**RECOMMENDED CHANGE:** Remove the instruction to update `app/admin/vehicle-models.tsx:64-80`. Update `lib/vehicleTypes.ts` and allow the UI to inherit it.

**FINDING:** `cc_range` is the only historical CC tracking mechanism.
**REPOSITORY EVIDENCE:** While `vehicles` uses `cc_range`, `vehicleModels` actually uses `typical_cc_min` and `typical_cc_max` as integers (`src/db/schema.ts` line 1241). 
**IMPACT:** The rule cascade must be aware of the existing `typical_cc_min/max` bounds on the model when processing vehicle registration, rather than solely relying on driver-supplied engine CC.
**RECOMMENDED CHANGE:** Instruct the agent to incorporate `vehicleModels.typical_cc_min` and `typical_cc_max`.

# 6. REQUIREMENTS LOST OR ALTERED

- **pgEnum for body_type:** Terra didn't specify the database schema type for `body_type`. To maintain cross-module consistency (which uses enums for `vehicle_type`, `user_role`, `driver_status`), `body_type` MUST be implemented as a `pgEnum` in `src/db/schema.ts`, not a free-form `varchar`.

# 7. REUSE OPPORTUNITIES

- `lib/vehicleTypes.ts` exports `VEHICLE_TYPE_VALUES` and `VEHICLE_TYPES` arrays which are successfully reused across the admin UI and backend APIs. The frontend components (specifically `store/useRiderStore.ts`) should be refactored to import these canonical definitions rather than maintaining inline string unions.

# 8. ARCHITECTURAL / CROSS-MODULE RISKS

- **Enum Synchronization:** The Postgres `vehicle_type` enum, the Zod `VEHICLE_TYPE_ZOD_ENUM`, and the TypeScript `VehicleTypeEnum` must be updated in absolute lockstep. A desync here will cause validation failures at the API boundary before code even reaches the database.

# 9. IMPLEMENTATION ORDER

Terra's order defers pricing to Phase 4. However, since the database schema and `lib/vehicleTypes.ts` updates will immediately expose `car_compact` to the system, any concurrent use (e.g., admin package creation, ride estimates) will trigger `pricing_not_found` 500s/422s.

**Corrected Order:**
1. **Database Schema & Canonical Types** (Including raw SQL migration for the enum).
2. **Pricing Configuration Seed** (Must happen immediately to prevent API crashes).
3. **Classification Engine & Registration Flow**.
4. **Hardcoded UI / Constant Propagation**.
5. **Admin Panel Features**.

# 10. REQUIRED CHANGES TO TERRA'S PLAN

1. **Remove** the instruction to manually update `app/admin/vehicle-models.tsx`.
2. **Specify** that `body_type` must be a `pgEnum`.
3. **Require** a raw SQL `ALTER TYPE` statement for adding `car_compact` to prevent Drizzle column-drop risks.
4. **Add** `intercity_per_km_bdt` to the pricing row seeding requirements.
5. **Add** instructions to utilize `typical_cc_min` and `typical_cc_max` from `vehicleModels`.
6. **Move** pricing seeding up to immediately follow schema changes.

# 11. FINAL RECOMMENDED PLAN

## Phase 1 — Schema changes & Canonical Types
1. **Update `vehicle_type` enum.** Add `car_compact` to the Postgres `vehicle_type` enum using a raw SQL migration (`ALTER TYPE vehicle_type ADD VALUE 'car_compact'`). Update `src/db/schema.ts`, `lib/vehicleTypes.ts` (`VEHICLE_TYPE_VALUES`, `VEHICLE_TYPES`, `VEHICLE_TYPE_ZOD_ENUM`), and fix `store/useRiderStore.ts` to import the type.
2. **Add `body_type` as a `pgEnum`** — apply it to both `vehicles` and `vehicle_models`. Values: `motorcycle, scooter, auto_rickshaw, hatchback, sedan, crossover, suv, suv_large, mpv, van, minibus`.
3. **Add `engine_cc` (integer) to `vehicles`.** Retain `cc_range` for historical compatibility, but base new logic on `engine_cc` and the existing `typical_cc_min`/`typical_cc_max` in `vehicleModels`.
4. **Create `vehicle_premium_allowlist` table.** Columns: `brand` (varchar), `model` (varchar, nullable), `is_active` (boolean). 

## Phase 2 — Pricing Seed (Launch Blocker)
5. **Seed `car_compact` pricing.** Add rows to `scripts/seed-pricing.js` and `scripts/zone-seed-pricing.ts`. Ensure `intercity_per_km_bdt` is included alongside standard rates. Execute this seed so the database is ready for API calls.
6. **Update ETA speeds.** Add `car_compact` to `scripts/seed-eta-speed.js` using the standard car baseline.

## Phase 3 — Classification Logic
7. **Implement the rule cascade** in `lib/vehicleTypes.ts`. Inputs: brand, model, `body_type`, `engine_cc`, seats. Sequence: auto-rickshaw → bike bands → XL → premium allowlist → cc>2000 → SUV floor → compact/economy/comfort bands → manual review fallback.
8. **Wire into registration.** Update `app/api/driver/vehicles+api.ts`. Prevent arbitrary driver self-selection. Look up model attributes (including `typical_cc_min/max`), run the cascade, and persist the authoritative category. Preserve the admin override path.

## Phase 4 — UI & Hardcode Propagation
9. **ETA logic:** Verify `lib/eta.ts` `vehicleGroup()` catches `car_compact` via the `car_*` prefix (write a test).
10. **Admin upgrades:** Update the hardcoded `VEHICLE_TIER` maps in `app/api/admin/driver/upgrade+api.ts` and `app/api/admin/driver/downgrade+api.ts`.
11. **Find Ride UI:** Update `app/(main)/(customer)/find-ride/index.tsx`. Fix the pre-existing bug where `car_xl` (mapped to `large_car`) is missing from `CATEGORY_ORDER`, and ensure `car_compact` maps correctly to `car`.
12. **Driver Ledger:** Add `car_compact` to the hardcoded `VEHICLE_TYPE_OPTIONS` in `app/(main)/(rider)/call-ledger.tsx`.

## Phase 5 — Admin Panel Tooling
13. **Premium Allowlist UI:** Create an admin UI to manage `vehicle_premium_allowlist` (add/remove brand or brand+model).
14. **Body Type UI:** Add `body_type` to the existing `vehicle_models.tsx` administration form. (Note: `vehicle_type` dropdowns here will auto-populate via `lib/vehicleTypes.ts`).

## Phase 6 — Dataset Import
15. Create a deterministic, idempotent seed script to load the finalized AI dataset into `vehicle_models`.

# 12. CONFIDENCE

**HIGH**
Extensive repository searches (verifying schemas, checking hardcoded arrays, and examining dynamic UI mapping) confirm the exact systemic relationships and state of the codebase. The adjustments made to Terra's plan are backed by direct code evidence.