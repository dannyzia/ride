[Memory Bank: Active]

# Independent Repository Audit — Vehicle Categorization Readiness (Status-Check Review)

**Auditor role:** Independent repository auditor / status-check reviewer (no code written, no changes proposed)
**Reference framework:** [`docs/FeatureList/New Feature Plan/Vehicle Categorization/CANONICAL-Vehicle-Categorization-Framework-v1.md`](docs/FeatureList/New%20Feature%20Plan/Vehicle%20Categorization/CANONICAL-Vehicle-Categorization-Framework-v1.md) §5–§7 (its two open questions: `body_type` existence, premium allowlist existence)
**Method:** Direct file reads + ripgrep sweeps against the live tree. **Supabase MCP / live DB queries were NOT available in this session** — database state is inferred only from `src/db/migrations/*.sql` + `meta/_journal.json`, never from `list.txt` or snapshot-only claims. Every finding below cites a file:line actually read.

---

## Item 1 — vehicle_type enum: values, referencing columns, value-branching files

**Verdict: PARTIAL** (enum is well-formed and centrally declared; value-based branching is scattered well beyond the central registry)

**Enum values (8):** `src/db/schema.ts:23-32` — `bike_basic, bike_standard, bike_plus, cng, car_economy, car_comfort, car_premium, car_xl`.

**Every table/column referencing it (all in `src/db/schema.ts`):**

| Table | Column | Line |
|---|---|---|
| `drivers` | `vehicle_type` (notNull, idx :342) | 288 |
| `vehicles` | `vehicle_type` (notNull, idx :396) | 363 |
| `packages` | `vehicle_type` (nullable, idx :420) | 415 |
| `rides` | `vehicle_type` (notNull, idx :699) | 614 |
| `pricing` | `vehicle_type` (notNull; partial unique `(zone_id, vehicle_type)` :993-995) | 971 |
| `incentive_definitions` | `vehicle_type_filter` (nullable, idx :1123) | 1108 |
| `vehicle_type_changes` | `old_vehicle_type` / `new_vehicle_type` | 1212-1213 |
| `vehicle_models` | `default_vehicle_type` (notNull, idx :1253) | 1240 |

**Files that branch on literal values** (these break or silently mislabel when a 9th value lands):
- `lib/eta.ts:16-20` — `vehicleGroup()`: `startsWith("bike_")` / `=== "cng"` / else `"car"` (a new `car_*` value would inherit "car" speeds safely; anything not prefix-matched needs a rule)
- `app/api/admin/driver/upgrade+api.ts:13-20` and `app/api/admin/driver/downgrade+api.ts:13-20` — duplicated hardcoded ordinal maps (`bike_basic:0 … car_xl:7`) with no `car_compact` slot
- `app/api/register+api.ts:70` — driver default `vehicle_type ?? "bike_basic"`
- `app/(main)/(customer)/(tabs)/home/index.tsx:85-92` — per-literal icon map
- `app/(main)/(customer)/find-ride/index.tsx:41-58` — `CATEGORY_META`/`VEHICLE_ICONS` with only 3 categories (`bike`,`cng`,`car` — `car_xl` already dropped) and prefix matching (`car_`)
- `app/(main)/(customer)/services-hub.tsx:98` — `cat.key === "cng"` branch
- `app/(main)/(rider)/call-ledger.tsx:65-72` — hardcoded 8-entry label list
- `store/useRiderStore.ts:6-13` — the type union **redeclared inline** instead of importing `VehicleTypeEnum` from `lib/vehicleTypes.ts`
- Fallback literals: `app/(main)/(customer)/apply-promos/index.tsx:79`, `confirm-ride/index.tsx:268`, `finding-driver/index.tsx:144` (`?? "bike_basic"` / `|| "car_economy"`), `app/admin/vehicle-models.tsx:74`
- Seed scripts enumerating per type: `scripts/seed-pricing.js:8-71`, `scripts/zone-seed-pricing.ts:50-134`, `scripts/seed-eta-speed.js:9`

**Files that filter by value as a parameter** (no recompile needed, but behavior depends on enum membership): `app/api/ride/request+api.ts:37,188`, `ride/estimate+api.ts:120-123,166-179,243-249`, `ride/schedule+api.ts:117,205`, `ride/nearby-drivers+api.ts:54`, `ride/[id]/alternatives+api.ts:44-52`, `ride/[id]/wait-end+api.ts:26`, `promo/redeem+api.ts:14`, `driver/slider-config+api.ts:21`, `driver/pricing-reference+api.ts:32`, `driver/me+api.ts:92`, `driver/incentives+api.ts:34-36`, `package/list+api.ts:38-42`, `package/purchase+api.ts:112-116`, `admin/incentives+api.ts:89-97`, `admin/zones+api.ts:165`, plus the dispatch set in Item 5.

---

## Item 2 — vehicle_models table: migration chain, seed, row count

**Verdict: PARTIAL** (table exists in the chain since 0008; the *current* schema shape has no migration SQL; no seed exists; row count not obtainable)

- **In the live migration chain: YES.** `src/db/migrations/0008_sync_schema.sql:104-120` creates `vehicle_models` (journal-registered at `meta/_journal.json:62-67`, idx 8), and `0035_bored_scarlet_spider.sql:7-9` adds `source` + `created_by`.
- **Material divergence:** the 0008 DDL shape is `vehicle_type / manufacturer / manufacturing_year / body_type / engine_cc / default_seats / popularity_score`, but `schema.ts:1232-1260` declares `brand / model / year_start / year_end / default_vehicle_type / typical_cc_min / typical_cc_max / has_ac / passenger_seats / …`. **No `.sql` file in the folder ever creates or alters to the current shape** (rg `default_vehicle_type` across `*.sql` → 0 hits; rg `vehicle_models` → only 0008 and 0035). The drizzle snapshots carry the new shape from `meta/0009_snapshot.json:5116` onward, so the SQL and snapshot chains disagree; the declared deploy path is `npx drizzle-kit push` (AGENTS.md Deploy Order), which reconciles by pushing schema.ts directly. From migration SQL alone, the live shape cannot be proven.
- **Seed script: NONE, under any name.** `scripts/` contains 18 files (glob verified); repo-wide rg for `vehicle_models` (excluding `node_modules`, `meta`, lockfile) returns only `schema.ts`, the two migration files, docs, and 4 app files. The only code that ever inserts rows: `app/api/admin/vehicle-models+api.ts:106` (admin CRUD) and `app/api/driver/vehicles+api.ts:143-151` ("Others" path, `source:'driver'`, `is_active:false`). There is no `INSERT INTO vehicle_models` in any migration.
- **Row count: not reportable.** No Supabase MCP or DB query tool is available in this session, and migration SQL contains no seed data from which to infer one.

---

## Item 3 — Centralized classification function

**Verdict: PARTIAL** (centralized *validation/display/eligibility* registry exists; the *classification logic* the framework requires does not exist anywhere)

- `lib/vehicleTypes.ts` exists (198 lines, read in full): `VEHICLE_TYPE_VALUES` (:3-12), `VEHICLE_TYPE_ZOD_ENUM` (:16), static `VEHICLE_TYPES` definitions with `cc_range` display strings, seats, age gates, `driver_req` (:50-147), `getVehicleType` (:149), `checkDriverEligibility` (:159-183), `validateDriverMinKm` (:185-198). Both packages share it — `utils-server/dispatch.ts:6` and `utils-server/index.ts:42` import from `../lib/vehicleTypes`.
- **There is no brand/model/year → category classification and no BRTA-class-letter + cc fallback anywhere.** The actual onboarding flow is driver self-selection: `app/api/driver/vehicles+api.ts` `POST`, whose Zod schema takes `vehicle_type: VEHICLE_TYPE_ZOD_ENUM` straight from the client (**:68**). The `vehicleModels` lookup in that same function (**:100-107**) only checks row *existence* for the "Others" draft path, and the inserted model row gets `default_vehicle_type: vehicle_type` — i.e., the driver's own claim is recorded as the "default" (**:143-151**). `vehicle_class_letter` is hardcoded `'KA'` (**:164**) and `registration_area` hardcoded `'DHAKA_METRO'` (**:163**). `GET /api/driver/vehicle-models` filters the catalog *by an already-chosen type* (`vehicle-models+api.ts:20-46`) — the opposite direction of "suggest".
- **Documentation is stale on this point:** `docs/Plan/05-DATA-MODEL.md:174` claims vehicle_models is "Used by the auto-classification engine in `lib/vehicleTypes.ts` to suggest the vehicle type during onboarding" — contradicted by the full read of both files. The framework's §3 "matches the platform's existing brand+model lookup approach" premise is therefore weaker than assumed.

---

## Item 4 — vehicles.cc_range (varchar)

**Verdict: PASS** (in the narrow sense asked: no code parses it as a number — because **no code reads or writes it at all**)

- Column: `src/db/schema.ts:367` — `cc_range: varchar("cc_range", { length: 30 })`, created in `0000_daffy_doctor_strange.sql:305`.
- **Writers: none.** `app/api/driver/vehicles+api.ts` POST insert (:155-181) omits `cc_range` (rows land NULL); admin has no vehicles writer.
- **Readers: none.** The GET select list (:30-42) omits it. Repo-wide scoped rg for `cc_range` in `app/ lib/ components/ store/ utils-server/ scripts/` returns only two name-collisions that are *not* the DB column: `lib/vehicleTypes.ts:41,55,67,79` (display strings on static defs like `"≤100"`) and `app/admin/vehicle-models.tsx:396-408` (a table column keyed `"cc_range"` that actually renders `vehicleModels.typical_cc_min/max`, not `vehicles.cc_range`).
- **Numeric parsing: zero occurrences.** The column is dead weight; the framework's cc-band rules currently have no integer cc source on `vehicles` (only `vehicle_models.typical_cc_min/max` reference values).

---

## Item 5 — Consumers across dispatch, pricing, packages, admin fare config

**Verdict: PASS** (inventory complete; exhaustive greps, all lines verified)

**Dispatch (`utils-server/`):**
- `dispatch.ts:119` — pricing row lookup by `(vehicle_type, zone_id)` for min-per-km filter; `:139` select; `:164` candidate-pool filter `eq(drivers.vehicle_type, vehicleType)`
- `h3Index.ts:53,62-64` — H3 index partitioned by `vehicle_type`
- `index.ts:42` (imports `VEHICLE_TYPE_VALUES`), `:517,568` auth/index on connect, `:642,647` re-sync, `:901` driver row, `:1045` `estimateEtaMinutes(driverRow.vehicle_type)`, `:1060,1449,1468,1484,1492,1549,1574` ride/driver payloads, `:1618-1637` alternatives loop `for (const vt of VEHICLE_TYPE_VALUES)` over pricing
- `scheduler.ts:80,407` scheduled-ride promotion payloads; `:228` cooling-off applies `new_vehicle_type`
- `types.ts:96,149` — WS payload fields typed as plain `string` (not the enum)
- `eta.ts:46` — re-exports `../lib/eta` group helpers

**Pricing / fare:**
- `pricing` table `schema.ts:964-998`; unique `(zone_id, vehicle_type)` :993-995
- `app/api/ride/request+api.ts:183-196` — **hard gate**: no active pricing row for the type+zone → `422 pricing_not_found`
- `ride/estimate+api.ts:120-123,166-179,243-249`; `ride/schedule+api.ts:117`; `ride/[id]/wait-end+api.ts:26`; `ride/[id]/alternatives+api.ts:44-52`; `driver/slider-config+api.ts:15-34`; `driver/pricing-reference+api.ts:16-48`; `driver/me+api.ts:92`
- `lib/fareCalc.ts` itself branches on **nothing** (rates are inputs) — vehicle-type sensitivity enters only via the pricing row
- Seeds: `scripts/seed-pricing.js:8-71`, `scripts/zone-seed-pricing.ts:50-134`, `scripts/seed-eta-speed.js:9`

**Packages:**
- `schema.ts:415-420` (nullable scope column); `app/api/package/list+api.ts:20-42` (`isNull OR match`); `package/purchase+api.ts:57,112-116` (`403 vehicle_type_mismatch`); `package/active+api.ts:51`; `admin/packages+api.ts:20`

**Admin fare/config screens:**
- `app/admin/pricing.tsx:30-33,79-81` — `VEHICLE_TYPES` label lookup; header notes :9-10 confirm `vehicle_type`/`zone_id` are read-only in PATCH
- `app/admin/vehicle-models.tsx:64-80` (form options + default `bike_standard`), `:382-394` (type render)
- `app/admin/packages.tsx:59-66,285`; `app/admin/incentives.tsx:78-79,398`; `app/admin/queue.tsx:21,87,287-293,1015`
- `app/api/admin/driver/approve+api.ts:22,75-101` — `vehicle_type_adjusted` override path (writes drivers + vehicles + `vehicle_type_changes` row)
- `app/api/admin/driver/upgrade+api.ts:13-20` / `downgrade+api.ts:13-20` — hardcoded ordinal maps
- `app/api/admin/zones+api.ts:22,165-195` — pricing update payload carries `vehicle_type`

---

## Item 6 — What adding a new vehicle_type value requires today

**Verdict: PARTIAL** (validation/display/eligibility are centralized; branching is not — ALTER TYPE plus manual consumer edits are unavoidable)

- **Postgres ALTER TYPE is required.** The 8 values have never been extended (`rg 'ADD VALUE'` in migrations shows precedent only for `ride_status` (0003:1, 0015:1), `payment_provider` (0004:1, 0005:1), wallet/document types (0032, 0033, 0035) — never `vehicle_type`). One `ALTER TYPE vehicle_type ADD VALUE 'car_compact'` covers all 9 columns, since they share the type. Schema-side this also means editing **two** declarations that must stay in sync: `schema.ts:23-32` and `lib/vehicleTypes.ts:3-12` (+ registry entry in `VEHICLE_TYPES:50-147`), plus the stale inline copy at `store/useRiderStore.ts:6-13`.
- **Manual consumer updates beyond the enum:** per-zone **pricing rows** (without them, `ride/request+api.ts:194-196` returns 422 and dispatch's `dispatch.ts:119` finds no rate — the type would be bookable nowhere); the three seed scripts; the admin upgrade/downgrade ordinal maps (both files); the home icon map; find-ride category meta; call-ledger labels; register/estimate fallbacks are optional.
- **What abstraction already exists:** `VEHICLE_TYPE_ZOD_ENUM` is the single validation boundary used by all routes (register:18, redeem:14, request:37, schedule:26, nearby-drivers:24, admin packages:20 / incentives:26 / zones:22, vehicle-models APIs), `VEHICLE_TYPES` is the single display/eligibility registry (admin screens + estimate display labels), and utils-server imports both from `lib/` rather than duplicating (`utils-server/index.ts:42`, `dispatch.ts:6`). The prefix-based `vehicleGroup` in `lib/eta.ts:17` would route any `car_*`/`bike_*` value automatically. The value-*literate* maps in Item 1 are the unisolated part.

---

## Item 7 — body_type field

**Verdict: REJECT — it does not exist in the schema.** Explicitly confirmed: a grep for `body_type|bodyType` across the **entire** `src/db/schema.ts` (2,118 lines, not just the vehicles section) returns **zero matches**. The `vehicles` table (:355-399) has no body/shape column, and the current `vehicleModels` (:1232-1260) has none either.

The only trace anywhere is `src/db/migrations/0008_sync_schema.sql:110` (`body_type varchar(50)`) inside the *original, superseded* `vehicle_models` CREATE — a shape that (per Item 2) no later SQL reconciled to schema.ts, that appears in **no** drizzle snapshot (0000–0042 meta grep: zero hits), and that **zero application code** reads or writes (scoped rg across `app/ lib/ utils-server/ components/ store/ scripts/` → 0). For framework purposes (cng 3-wheeler gate, car_xl seat+body gate, car_comfort SUV floor), `body_type` must be treated as net-new schema.

---

## Item 8 — Premium-brand / premium-model allowlist

**Verdict: REJECT — no allowlist exists in any form.** Repo-wide source search (`app/ lib/ utils-server/ components/ store/ scripts/ src/db/schema.ts`, all extensions) for `premio, allion, camry, crown, harrier, bmw, mercedes, lexus, luxur, premium` returns only: (a) the `car_premium` enum value and its display label noise, and (b) one marketing string `"GoRide Premium"` at `app/(main)/(customer)/schedule-ride-after-promo/index.tsx:20`. There is no table, no `platform_config` key (`ALLOWED_KEYS` at `app/api/admin/config+api.ts:13-26` and `admin/system-config+api.ts:13` contain only ratio/BRTA-cap/zone/SOS/schedule/cancel keys), no config file, and no hardcoded list anywhere in pricing, fare, or admin code.

---

## Final implementation readiness

**The codebase cannot absorb a new category (e.g. a sub-1001cc 3-seat `car_compact` tier) without a schema migration, and the migration is more than one enum value.** The minimum database-side set is: (1) `ALTER TYPE vehicle_type ADD VALUE 'car_compact'` — one statement, since all 9 columns share the enum — plus the paired edits to `schema.ts:23` and `lib/vehicleTypes.ts:3` (and the inline copy at `store/useRiderStore.ts:6`); (2) **net-new `body_type`** on `vehicles` (BRTA-verified source, per framework §4) and optionally `vehicle_models` — the only historical `body_type` (0008:110) never survived into schema.ts or any snapshot and must be treated as absent; (3) a **net-new admin-editable premium allowlist / luxury-brand reference table** — nothing exists to hang the Premio/Allion/Camry/Crown/Harrier + luxury-brand override on, and `platform_config`'s key allowlist has no vehicle namespace; (4) per-zone `pricing` rows for the new type, without which booking hard-fails with `422 pricing_not_found` (`ride/request+api.ts:194`); and effectively (5) an integer engine-cc source on `vehicles`, since `cc_range` (varchar, `schema.ts:367`) is a dead column with zero readers/writers and no numeric parsing, so the ≤1000cc rule has no data to evaluate. Code-side, the centralized Zod enum and `VEHICLE_TYPES` registry isolate validation, display, and eligibility — but roughly ten files branch on literal values (eta group, admin upgrade/downgrade ordinal maps, home/find-ride icon maps, call-ledger labels, three seed scripts) and each needs a manual touch; and the framework's deterministic classifier itself is net-new logic, because today the "classification" is the driver's self-selected `vehicle_type` (`app/api/driver/vehicles+api.ts:68`) with a hardcoded `'KA'` class letter (:164) and no brand/model suggestion engine despite `docs/Plan/05-DATA-MODEL.md:174` claiming one exists.