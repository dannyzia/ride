I read all six inputs, the attached architect brief, and verified the material claims against the live Ride repository.

## 1. Final decision

Adopt Prompt D with these corrections:

- Use one manually reviewed, additive Postgres migration for `car_compact`, `body_type`, `engine_cc`, and the premium allowlist.
- Keep `lib/vehicleTypes.ts` client-safe: the classifier must be pure and receive a server-resolved `premium_match` flag; it must not import the database.
- Remove client-supplied `vehicle_type` from vehicle registration. The server computes the proposed type; existing admin approval/override remains authoritative.
- Seed pricing immediately after schema deployment, before exposing `car_compact` to riders. Exact `car_compact` rates per zone are a product input still missing—do not invent them.
- Do not manually alter admin vehicle-model type options: they already derive from `VEHICLE_TYPES`. Add only the new `body_type` support there.
- Reject Claude’s unrelated UI/theme rewrite and Qwen Code’s “files not found” conclusion; both are inapplicable.

## 2. Requirement checklist

| Requirement | Final approach | Status |
|---|---|---|
| Add `car_compact` | Shared enum, schema, registry, Zod, stores | Required |
| `body_type` on vehicles/models | Shared constrained `vehicle_body_type` enum; nullable initially for backfill | Required |
| Integer engine CC | Add nullable `vehicles.engine_cc`; retain dead `cc_range` for compatibility | Required |
| Premium allowlist | New admin-managed table, seeded from canonical starting list | Required |
| Rule cascade | Pure classifier in `lib/vehicleTypes.ts` | Required |
| Registration no longer self-selects type | UI/API remove submitted type; server classifies | Required |
| Preserve admin override | Keep approval and upgrade/downgrade lifecycle | Required |
| Flag hardcoded registration fields | Log `vehicle_class_letter` / `registration_area` separately; do not change | Required |
| ETA | Verify prefix handling and test `car_compact` | Required |
| Tier maps | Centralize ordering and reuse in upgrade/downgrade APIs | Required |
| Rider icons/metadata | Add compact; restore missing `car_xl` mapping | Required |
| Driver ledger label | Add compact label | Required |
| Vehicle-model UI type options | No direct change needed; already dynamic | Verified |
| Pricing/ETA seeds | Add compact rows/entry, including intercity pricing | Required |
| Per-zone pricing | Add every active-zone row before release | Release blocker |
| Allowlist administration | Admin API/UI with admin authorization | Required |
| Body-type administration | Extend vehicle-model API/UI | Required |
| Dataset import | New deterministic, idempotent seed after dataset approval | Deferred |

## 3. Resolved review findings

| Issue | Gemini | Claude | Qwen Max | Qwen Code | Final decision |
|---|---|---|---|---|---|
| Admin vehicle-model type options | Said manual update unnecessary | Unrelated | Uncertain | Wrong workspace | Gemini is correct: options are dynamic. |
| `body_type` representation | Use `pgEnum` | Unrelated | Supported | Did not verify | Use a constrained shared enum. |
| Pricing seed location | Confirmed scripts | Unrelated | Claimed absent | Wrong workspace | Scripts exist; update them. |
| Intercity pricing | Required | Unrelated | Not material | N/A | Include `intercity_per_km_bdt`. |
| Driver registration UI | Not emphasized | Unrelated | Correctly identified | N/A | Explicitly in scope. |
| Price values | Did not resolve | Unrelated | Correctly flags missing product input | N/A | Do not invent rates. |
| Qwen Code “missing docs” | N/A | N/A | N/A | Claimed absent | Discard: documents exist in this workspace. |

## 4. Actual repository facts

- The shared `vehicle_type` enum currently has eight values in [`schema.ts`](</D:/My Projects/Current Project/Ride/src/db/schema.ts:23>) and `lib/vehicleTypes.ts`.
- It is used by drivers, vehicles, packages, rides, pricing, incentives, vehicle-type changes, and vehicle models.
- `vehicles.cc_range` is a dead nullable varchar; no production reader/writer was found. `vehicle_models` already has `typical_cc_min/max`.
- `body_type` and a premium allowlist do not exist in the current declared schema.
- Registration currently accepts and persists client-supplied `vehicle_type` in [`vehicles+api.ts`](</D:/My Projects/Current Project/Ride/app/api/driver/vehicles+api.ts:75>).
- The driver add-vehicle screen submits that value directly.
- Admin vehicle-model and pricing labels already derive from `VEHICLE_TYPES`.
- Both pricing seed mechanisms exist: [`seed-pricing.js`](</D:/My Projects/Current Project/Ride/scripts/seed-pricing.js:6>) and [`zone-seed-pricing.ts`](</D:/My Projects/Current Project/Ride/scripts/zone-seed-pricing.ts:172>).
- Missing active pricing produces `422 pricing_not_found` in estimates, requests, and scheduling.
- `lib/eta.ts` groups `car_*` types generically; `utils-server/eta.ts` reuses it.
- Upgrade and downgrade each have duplicate ordinal maps; compact belongs between `cng` and `car_economy`.

## 5. Dependency graph

```text
Product-approved compact pricing by zone
                │
Schema + canonical types + migration
                │
                ├── Pricing/ETA seed + active-zone verification
                │          │
                │          └── Rider-facing compact availability
                │
                └── Pure classifier + server allowlist resolver
                           │
                           ├── Registration API and add-vehicle UI
                           ├── Admin allowlist/body-type management
                           └── Type propagation and regression sweep
                                      │
                                  Dataset import
                                      │
                              Full test/release verification
```

Pricing seeding can run in parallel with classifier work only after the enum migration is applied and product has supplied rates.

## 6. Final implementation plan

### Phase A — Preflight and migration

Inspect the current schema, migration journal, registration API/UI, tests, and active-zone pricing before editing. Confirm the actual migration workflow because the historical SQL and Drizzle schema snapshots have known drift.

Create an additive migration that:

- Adds `car_compact` to the existing Postgres `vehicle_type`.
- Adds `vehicle_body_type` with exactly: `motorcycle`, `scooter`, `auto_rickshaw`, `hatchback`, `sedan`, `crossover`, `suv`, `suv_large`, `mpv`, `van`, `minibus`.
- Adds nullable `body_type` to `vehicles` and `vehicle_models`.
- Adds nullable positive-integer `engine_cc` to `vehicles`.
- Creates `vehicle_premium_allowlist` with UUID/timestamps, normalized brand, nullable model, `is_active`, and case-insensitive uniqueness for brand-only versus brand+model rows.

Update `src/db/schema.ts`, `lib/vehicleTypes.ts`, and `store/useRiderStore.ts` in lockstep. Retain `cc_range`; do not repurpose or delete it.

### Phase B — Authoritative classification

In `lib/vehicleTypes.ts`, add:

- `VEHICLE_TIER_ORDER`, reused by upgrade/downgrade APIs.
- A pure `classifyVehicle()` function returning either a classified type or a manual-review result.
- Inputs: body type, integer engine CC, registered seats, and a server-resolved premium-match boolean.
- Exact first-match order from the canonical framework: auto-rickshaw; bike bands; XL; premium match; `>2000cc`; SUV/crossover floor; compact/economy/comfort bands; manual review.

Do not query Drizzle from this library, because it is also imported by mobile UI and utils-server code. Resolve active allowlist matches in server-only registration/admin code and pass the result into the pure classifier.

Seed the canonical starting allowlist: named Toyota and Honda premium models plus Mercedes-Benz, BMW, Audi, Lexus, Volvo, Land Rover, Jaguar, and Porsche brand-wide entries.

### Phase C — Registration and verification flow

Update [`add-vehicle/index.tsx`](</D:/My Projects/Current Project/Ride/app/(main)/(rider)/add-vehicle/index.tsx:283>) and `app/api/driver/vehicles+api.ts`:

- Remove the client-controlled `vehicle_type` selector/payload.
- Collect brand, model, registration year/plate, BRTA-recorded engine CC, seats, and body type where needed.
- Look up an active vehicle-model record and use its maintained reference data as the preferred source.
- Run the server-side classifier; return a suggested type for confirmation, but never trust a client’s claimed category.
- Preserve the existing inactive driver-model draft flow for unrecognized models.
- For incomplete or ambiguous classification data, return a machine-readable manual-review result; do not create a tenth category or guess.
- Preserve the existing admin approval override and validate that unapproved drivers cannot reach dispatch.

### Phase D — Operational pricing and propagation

Before any compact category is selectable in production:

- Obtain approved integer-paisa compact pricing for every active zone, including `intercity_per_km_bdt`.
- Add idempotent compact rows to both pricing seeds and the ETA seed.
- Run the seed and verify every active zone has an active compact row.

Then complete the targeted propagation sweep:

- Confirm `lib/eta.ts` includes compact via `car_*`; add regression coverage.
- Replace both local upgrade/downgrade tier maps with the shared ordering.
- Add compact icon/metadata on rider home and find-ride; restore `car_xl` in find-ride.
- Add compact in driver call ledger labels.
- Search all app, lib, scripts, and utils-server files for literal eight-type lists; update only real hardcoded consumers.
- Verify package and incentive vehicle-type filters inherit the canonical Zod enum and their admin controls render compact correctly.

### Phase E — Admin tooling and dataset

Extend the existing vehicle-model admin API/UI to manage `body_type`, including empty/backfill states. Its category options should update automatically from `VEHICLE_TYPES`.

Add an admin-only premium-allowlist API/UI following the vehicle-model pattern: list, add, edit/deactivate, and duplicate-conflict handling. Use `requireRole('admin')`, Zod, `parseJsonBody`, snake_case, and standard error shapes.

When the merged dataset is approved, add a deterministic idempotent import that validates category, body type, CC ranges, seats, and year ranges before upsert. Do not fabricate or silently reclassify uncertain records.

## 7. Testing and acceptance criteria

Add focused tests for:

- Every classifier rule and precedence order.
- Premium brand and brand+model matching, including inactive entries.
- Missing/ambiguous inputs returning manual review.
- Registration rejecting client-provided category authority.
- Admin override still updating driver, vehicle, and change history.
- Compact ETA grouping and tier ordering.
- Compact pricing availability in estimate, request, schedule, and dispatch paths.
- All active zones having compact pricing.
- `car_xl` remains present in find-ride.

Run, at minimum:

```powershell
npm run lint
npx tsc --noEmit
npx jest --watchAll=false
cd utils-server; npm run typecheck
```

Use the actual utils-server typecheck script if its package differs.

## 8. Regression checklist

- Existing eight vehicle types remain valid.
- No existing vehicle row becomes invalid because new fields are nullable.
- Existing admin approval and vehicle type-change history remain transactional.
- Dispatch still filters on driver type before H3 scoring.
- Pricing remains integer paisa; no taka floats.
- Packages/incentives retain universal-null and type-scoped behavior.
- No body-type or premium rules are duplicated in clients or utils-server.
- `vehicle_class_letter` and `registration_area` remain untouched, with a separately logged follow-up.

## 9. Coding-agent instructions

Inspect before modifying, and treat repository reality as authoritative for paths and architecture. Reuse existing patterns before creating new ones. Do not make unrelated refactors or UI redesigns. Do not add `manual_review` as a vehicle type. Do not invent compact pricing values or dataset rows.

Validate every API boundary with Zod and `parseJsonBody`; use server-side role checks; keep money in integer paisa. Re-run the category-literal search after implementation. Update both `AGENTS.md` and `CLAUDE.md` from eight to nine vehicle types.

## 10. Final Kilo Code prompt

```text
Implement the approved Vehicle Categorization feature in the Ride repository.

First inspect the live code, migration journal, schema, registration API/UI,
admin patterns, existing tests, and pricing seeds. Do not trust stale file
line numbers. Use the repository conventions in AGENTS.md.

Goal: support exactly nine vehicle types:
bike_basic, bike_standard, bike_plus, cng, car_compact, car_economy,
car_comfort, car_premium, car_xl.

Required work:

1. Create an additive, safe Postgres migration and matching Drizzle schema:
   - Add car_compact to the shared vehicle_type enum.
   - Add constrained vehicle_body_type enum:
     motorcycle, scooter, auto_rickshaw, hatchback, sedan, crossover, suv,
     suv_large, mpv, van, minibus.
   - Add nullable body_type to vehicles and vehicle_models.
   - Add nullable integer engine_cc to vehicles.
   - Keep existing vehicles.cc_range unchanged; it is compatibility data.
   - Create vehicle_premium_allowlist with UUID PK, timestamps, brand,
     nullable model, is_active, and case-insensitive duplicate protection.

2. Update canonical type surfaces together:
   src/db/schema.ts, lib/vehicleTypes.ts, and store/useRiderStore.ts.
   Remove the store’s duplicate vehicle-type union. Add compact metadata to
   VEHICLE_TYPES without inventing age policy.

3. Add a pure classifier in lib/vehicleTypes.ts. It must not access Drizzle
   or the database because this module is client and utils-server shared.
   Resolve allowlist state in server-only code and pass premium_match into
   the pure classifier.

   Rule order must be first-match-wins:
   auto_rickshaw -> cng;
   motorcycle/scooter <=110 -> bike_basic;
   111-150 -> bike_standard;
   >150 -> bike_plus;
   seats >=6 plus van/mpv/minibus/suv_large -> car_xl;
   premium allowlist -> car_premium;
   cc >2000 -> car_premium;
   suv/crossover with cc >=1001 -> car_comfort;
   cc <=1000 -> car_compact;
   cc 1001-1500 -> car_economy;
   cc 1501-2000 -> car_comfort;
   otherwise -> manual review, never a new vehicle category.

4. Seed the canonical allowlist:
   Toyota Premio, Allion, Camry, Crown, Harrier, Land Cruiser (5-seat),
   Prado (5-seat), Honda Accord; plus whole-brand luxury entries for
   Mercedes-Benz, BMW, Audi, Lexus, Volvo, Land Rover, Jaguar, Porsche.

5. Change driver registration:
   - Remove client-controlled vehicle_type input from the screen and API.
   - Collect/validate brand, model, year, plate, BRTA-recorded engine CC,
     seats, and body type as required by the current workflow.
   - Lookup maintained active vehicle-model data where available, then
     classify server-side.
   - Keep unknown-model drafts inactive for admin review.
   - Return manual_review_required for incomplete/ambiguous information;
     do not guess and do not introduce a tenth enum value.
   - Preserve existing admin approval override and verify pending drivers
     cannot be dispatched.

6. Before exposing compact to production, obtain approved compact pricing
   for every active zone. Do not invent rates. Add the approved integer-paisa
   values, including intercity_per_km_bdt, to the real pricing seed mechanisms
   and add compact to ETA seed data. Run and verify pricing exists for all
   active zones before release.

7. Propagate compact:
   - Use one shared tier order in admin upgrade/downgrade, with compact
     between cng and car_economy.
   - Update rider home and find-ride metadata/icons; restore car_xl in
     find-ride if still absent.
   - Update driver call-ledger labels.
   - Verify car_* ETA grouping with a regression test.
   - Search app, lib, store, scripts, components, src, and utils-server for
     literal eight-type lists; update actual consumers only.
   - Verify package/incentive scoping and admin displays inherit canonical
     types correctly.

8. Extend existing admin vehicle-model UI/API with body_type. Do not manually
   add compact to its type options if they already derive from VEHICLE_TYPES.
   Build admin-only premium allowlist CRUD using existing admin patterns,
   requireRole('admin'), Zod, parseJsonBody, and standard error responses.

9. Dataset import is separate. When the approved dataset is supplied, create
   a deterministic, idempotent importer with validation; do not invent rows.

10. Test classifier precedence, allowlist states, registration trust boundary,
    manual-review behavior, admin override, compact pricing request/estimate/
    schedule/dispatch paths, tier ordering, ETA, and car_xl regression.
    Run lint, root typecheck, full Jest suite, and the applicable utils-server
    typecheck. Update AGENTS.md and CLAUDE.md from eight to nine types.

Report changed files, migration, seed execution, tests, and any unresolved
product input. Do not claim production-ready completion until every active
zone has approved compact pricing.
```

## 11. Definition of done

- [ ] Nine-type enum and all canonical TypeScript/Zod surfaces agree.
- [ ] Schema migration applies without data loss.
- [ ] One server-authoritative classifier implements the canonical rule order.
- [ ] Driver registration cannot choose its own category.
- [ ] Admin override still works.
- [ ] Compact pricing exists for every active zone, including intercity pricing.
- [ ] Rider/driver/admin/dispatch propagation is complete.
- [ ] Admins can manage allowlist and model body type.
- [ ] Dataset import is safely deferred until approved data exists.
- [ ] Lint, typechecks, and relevant tests pass.