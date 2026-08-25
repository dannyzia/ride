# 0. AMENDMENT LOG (applied 2026-08-22, pre-handoff)

Merged back two critical constraints from `08 Final Implementation Plan.md` that this document had dropped, plus verification-command and phase-mapping clarifications:

1. **Classifier purity (HIGH):** `lib/vehicleTypes.ts` is imported by React Native screens **and** `utils-server/dispatch.ts`. The classifier must be a pure function with **no Drizzle/database imports**; the premium-allowlist match (cascade rule 4) must be resolved in server-only code and passed into the classifier as a `premium_match` boolean. → applied in §6 Phase 2-B and §10 prompt §7.
2. **Allowlist case-normalization (MEDIUM):** `vehicle_premium_allowlist` stores normalized brand/model with case-insensitive uniqueness; classifier matching uses the same normalization. Prevents case-variation bypass ("toyota" vs "Toyota" Premio). → applied in §6 Phase 1 item 4 and §10 prompt §5.
3. **Concrete verification commands (LOW):** → applied in §9 Verification.
4. **Phase mapping (LOW):** document phases 0–4 map to §10 prompt phases 0–7 as follows — doc Phase 0 = prompt Phase 0; doc Phase 1 = prompt Phase 1; doc Phase 2 = prompt Phases 2+3+4 (pricing / classifier / registration); doc Phase 3 = prompt Phases 5+11 (propagation / dispatch); doc Phase 4 = prompt Phases 6+7 (admin / dataset).
5. **Frontend presentation copy gated as product input (MEDIUM):** the `car_compact` registry entry carries rider-visible bilingual strings (`display_en`, `display_bn`, `subtitle_en`, `subtitle_bn`) — added to the Phase 0 do-not-invent list so an agent cannot fabricate Bengali copy for a category riders have never seen. → applied in §6 Phase 0 and §10 prompt §4.
6. **Suggest/confirm interaction contract (MEDIUM):** the registration flow previously said "suggested category → driver confirmation" without defining the API/UX shape. Specified: classification happens server-side inside the existing single POST; the response returns `classification` (`classified` + suggested type, or `manual_review`) with the vehicle persisted; the driver-facing confirmation is a post-submit displayed result, not a second round-trip — with loading/error states defined. → applied in §6 Phase 2-D/E and §10 prompt §8.
7. **Driver-visible manual-review state (MEDIUM):** defined what the driver sees when classification returns `manual_review` — submission succeeds, driver is told the vehicle is submitted and pending admin review (matching the existing driver-approval workflow), no blocked state, no new on-screen category. → applied in §6 Phase 2-F and §10 prompt §8.
8. **UI-spec grounding (LOW):** the agent is now pointed at the repository's canonical UI references — `App Design/GoRide - Ride-Hailing App UI Kit (Preview)/GoRide-Wireframes.md` (182-screen spec incl. standard-header convention) and `theme/goRide.ts` / `tailwind.config.js` design tokens — for all screen work. → applied in §6 Phase 2-E, §10 prompt §2 and §8.
9. **UI/UX implementation spec incorporated (2026-08-22, from Kimi — reconciled):** Kimi's three UI deliverables (car_compact presentation metadata incl. "Mini Car" naming; driver registration form spec incl. body-type picker, engine-CC field, validation copy; post-submit classification outcome states with exact bilingual copy) are now the authoritative UI spec in **§12**. Kimi's own backend/database wiring (its §4) is **rejected** — it re-introduced the superseded v2.0 framework (EV branch, model-override table, invented pricing, `pricing_tiers` table that doesn't exist, varchar body_type, no legacy-client compat) and contradicts Phases 1–2 here. Where §12 and Phases 1–2/§10 conflict on backend matters, Phases 1–2/§10 govern. Also corrected the earlier dark-mode note: the repo uses `useIsDark()` + inline color ternaries (Pattern A), not NativeWind `dark:` variants. → applied in §6 Phase 0/2-E/2-F, §10 prompt §2/§4/§8, and new §12.
10. **Second-pass fixes (2026-08-22):** (a) **Compile-lockstep rule** — two files type exhaustively against the registry enum (`home/index.tsx` `Record<VehicleTypeEnum, VehicleIconName>`, `zone-seed-pricing.ts` `Record<VehicleTypeEnum, PricingDefaults>`) and will fail `tsc` the moment the enum gains `car_compact`; the minimal key additions must land in the SAME phase as the registry change, with the pricing-defaults entry using a `0` sentinel + `REQUIRES PRODUCT INPUT` marker until Phase 0 approves rates (never seeded/run in that state). (b) **Migration isolation** — `ALTER TYPE ... ADD VALUE` cannot be *used* in the same transaction that adds it (each drizzle migration file runs in one transaction); keep it in its own migration file, separate from any file that inserts `car_compact` rows. (c) **Dataset conflict warning** — corrected after full read of the five dataset files: the per-model datasets broadly follow the canonical bands, but they disagree with each other on **seat semantics** (bikes listed as 2 seats vs 1; cars 4 vs 5; CNG 3 vs 4 — some count registered seats incl. driver, some count passengers), on **boundary cc models** (149.5–150cc bikes, 996–1000cc crossovers like Raize/Rocky/Kona that fall below the 1001cc SUV floor), on **EV rows** (0cc — no canonical rule exists; GLM5.3 flagged this as a rule gap), and on **split-variant naming** (Vitz 1.0 vs 1.3, Prado 5-seat vs 7-seat). Therefore importer validation MUST recompute each row against the canonical cascade (using BRTA registered seats incl. driver as the normalized seat semantic — bikes 2, kei 4, standard cars 5, CNG 3, vans 7–10) and REPORT mismatches rather than trusting any source's `assigned_category`. Merge policy and master format are specified in **§13**. (d) **AGENTS.md dark-mode line is stale** (claims NativeWind `dark:` variants; code uses Pattern A) — recorded as open item §12.7.4.
11. **PRODUCT DECISIONS RECORDED (2026-08-23, Zia — closes the Phase 0 / §12.7 gates):**
    - **Naming: "Car Compact" / "কার কম্প্যাক্ট"** (Zia's explicit choice, overriding the "Mini Car" candidate). Enum key remains `car_compact`; Kimi's §12.4 flag "never show Compact Car to riders" is superseded by this decision — the rider-facing label is "Car Compact". Subtitles unchanged. ⚠ Code impact: the implemented registry/screens currently show "Mini Car"/"মিনি কার" — must be flipped.
    - **Pricing: interpolated CNG↔car_economy midpoints APPROVED in principle** — exact numbers (§13.6 table) require Zia's review before seeding replaces the zero sentinel.
    - **Review SLA copy: SOFTENED** — remove "within 1–2 business days" from the manual-review success modal (§12.3 state b); use non-committal copy.
    - **Sub-1001cc crossovers → `car_compact`** (literal cascade holds; no framework amendment).
    - **EV pre-decisions approved:** electric 3-wheelers → `cng`; Leaf → `car_compact`; Atto 3 → `car_comfort`; Model X 7-seat → `car_xl` (each with EV dispute flag).
    - **Pickups removed from the dataset** (Hilux, Triton/L200, Navara, Ranger, Colorado, Tacoma, Tundra) — confirmed.
    - **422 manual_review_required flow:** stay on the vehicle step (no `setStep(3)`) + draft `vehicle_models` row inserted before the 422 throw (§13.3 Other flow) — confirmed.
    - **Draft-row schema:** provisional `default_vehicle_type` behind `is_active=false` (no nullable migration).
    - **car_compact eligibility:** mirrors car_economy (`driver_req: null`, min_age 1, max_age 15, `has_ac: null`).

---

# 1. FINAL DECISION

## Decision: **Proceed, but replace Terra's three-unit handoff with one dependency-safe implementation program containing four execution phases and one mandatory release gate.**

The underlying architecture is sound. I would **not redesign it**.

The final implementation should:

1. Establish the ninth category and schema safely.
2. Make pricing available **before `car_compact` can become operationally selectable/dispatchable**.
3. Implement the authoritative classification engine and registration flow, including the actual shipped driver screens.
4. Propagate the category through all real consumers, then add admin tooling.
5. Load the final vehicle-model dataset only when it is actually finalized.
6. Perform an independent audit after implementation.

The critical correction is the **deployment boundary**. GLM-5.3 found that splitting schema/classifier implementation from pricing into independently deployable units creates a real production failure window: `car_compact` drivers can become classified into a category for which request pricing fails with `422`, while dispatch silently filters those drivers out because a missing rate becomes `0`. 

Therefore:

> **Schema/type changes and pricing readiness must be treated as one release gate. Classification may be implemented separately in source control, but it must not be released in a state where `car_compact` can be produced without valid pricing and dispatch support.**

The final architecture is:

```text
Schema + canonical category
        ↓
Pricing readiness
        ↓
Classification + registration
        ↓
Category propagation / dispatch / UI
        ↓
Admin tooling
        ↓
Final dataset
        ↓
Independent audit
```

### Important rejected recommendations

* **Do not manually modify `app/admin/vehicle-models.tsx` for `car_compact`.** It already derives its options from `VEHICLE_TYPES`; updating the canonical registry is sufficient. 
* **Do not restructure the existing three-group `find-ride` UI to restore a separate `car_xl` group.** That finding was stale. `car_xl` is already represented and intentionally grouped under `car`. 
* **Do not repurpose `cc_range` without inspection.** Repository evidence says it is dead; the safer final approach is to add `engine_cc` and leave the legacy column intact unless implementation-time inspection establishes a compelling reason otherwise. 
* **Do not invent a `car_compact` price.** The actual rate is not established by the supplied evidence. That remains an explicit product/data input.
* **Do not invent a tenth category for manual review.**
* **Do not treat driver-submitted body type/CC/seats as verified truth.** They are registration claims; admin/document verification remains the enforcement point. 

---

# 2. REQUIREMENT CHECKLIST

| Requirement                      | Final implementation                                             | Status                                  |
| -------------------------------- | ---------------------------------------------------------------- | --------------------------------------- |
| Exactly 9 categories             | Canonical Postgres enum + `lib/vehicleTypes.ts` registry         | **MANDATORY**                           |
| Add `car_compact`                | Raw SQL `ALTER TYPE vehicle_type ADD VALUE` migration            | **MANDATORY**                           |
| Keep TS/Zod/Postgres in lockstep | `src/db/schema.ts`, `lib/vehicleTypes.ts`, dependent consumers   | **MANDATORY**                           |
| `body_type` on `vehicles`        | New `pgEnum` + column                                            | **MANDATORY**                           |
| `body_type` on `vehicle_models`  | Same enum + column                                               | **MANDATORY**                           |
| 11 body types                    | Exact framework list                                             | **MANDATORY**                           |
| Integer engine CC                | `vehicles.engine_cc`                                             | **MANDATORY**                           |
| Preserve legacy `cc_range`       | Retain unless inspection proves safe removal                     | **FINAL DEFAULT**                       |
| Use model CC metadata            | `vehicle_models.typical_cc_min/max`                              | **MANDATORY**                           |
| Premium allowlist                | `vehicle_premium_allowlist`                                      | **MANDATORY**                           |
| Brand-wide premium               | nullable `model`                                                 | **MANDATORY**                           |
| Model-specific premium           | non-null `model`                                                 | **MANDATORY**                           |
| Single classifier                | `lib/vehicleTypes.ts` or proven domain equivalent                | **MANDATORY**                           |
| Classifier client-safety         | Pure function, no DB import; server-resolved `premium_match`     | **MANDATORY**                           |
| Allowlist case-normalization     | Normalized brand/model + case-insensitive uniqueness             | **MANDATORY**                           |
| Cascade ordering                 | Exact canonical sequence                                         | **MANDATORY**                           |
| Manual review                    | Classification result/workflow, not category                     | **MANDATORY**                           |
| Replace driver self-selection    | Registration UI + server API                                     | **MANDATORY**                           |
| Existing mobile compatibility    | Compatibility path for old clients                               | **MANDATORY**                           |
| Admin override retained          | Existing `vehicle_type_adjusted` flow                            | **MANDATORY**                           |
| Server-side classification       | Client suggestion never authoritative                            | **MANDATORY**                           |
| Pricing for all zones            | `car_compact` pricing rows                                       | **MANDATORY**                           |
| Intercity pricing                | Include `intercity_per_km_bdt`                                   | **MANDATORY**                           |
| ETA grouping                     | Verify existing `car_*` behavior; avoid unnecessary seed changes | **MANDATORY**                           |
| Upgrade/downgrade                | Add `car_compact` in correct ordinal position                    | **MANDATORY**                           |
| Customer category metadata       | Add `car_compact` without redesigning grouping                   | **MANDATORY**                           |
| Driver ledger                    | Add category                                                     | **MANDATORY**                           |
| Admin vehicle model UI           | Verify registry-driven behavior; no manual category patch        | **VERIFY**                              |
| Premium allowlist admin          | CRUD + active/inactive                                           | **MANDATORY**                           |
| Body-type admin                  | Maintain model body type                                         | **MANDATORY**                           |
| Final vehicle dataset            | Deterministic import                                             | **DEFERRED until dataset exists**       |
| Dataset duplicate safety         | Must account for nullable year uniqueness                        | **MANDATORY**                           |
| AGENTS/CLAUDE docs               | Change 8-category references to 9                                | **MANDATORY if those references exist** |
| `vehicle_class_letter`           | Do not fix here; record follow-up                                | **FOLLOW-UP**                           |
| `registration_area`              | Do not fix here; record follow-up                                | **FOLLOW-UP**                           |
| No unrelated refactor            | Preserve current architecture                                    | **MANDATORY**                           |

The master plan explicitly defines the nine categories and the classification cascade; that remains the product authority. 

---

# 3. RESOLVED REVIEW FINDINGS

| Issue                                             | Gemini                    | Claude / GLM-5.3                                              | Qwen Max               | Qwen Code                             | **Final decision**                                                                                                              |
| ------------------------------------------------- | ------------------------- | ------------------------------------------------------------- | ---------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `vehicle-models.tsx` needs manual category update | Says yes/implicitly       | **Refuted by repo**                                           | Raised as possible     | **Registry-driven**                   | **Do not modify category options manually**                                                                                     |
| `car_xl` missing from find-ride                   | Claimed gap               | **Refuted; already present**                                  | Accepted stale finding | Repo evidence supports present        | **Do not redesign grouping; only add compact**                                                                                  |
| `cc_range` handling                               | Add/repurpose             | Dead; recommends `engine_cc`                                  | Inspect consumers      | Confirmed dead                        | **Add `engine_cc`; retain legacy unless proven safe to remove**                                                                 |
| `body_type` type                                  | General schema            | —                                                             | —                      | —                                     | **Use `pgEnum`**                                                                                                                |
| Pricing timing                                    | Move earlier              | Production-window warning                                     | Pricing first          | Launch blocker                        | **Pricing readiness must precede operational classifier release**                                                               |
| Pricing scope                                     | Standard rate             | —                                                             | —                      | —                                     | **Also populate `intercity_per_km_bdt`**                                                                                        |
| Registration UI                                   | Under-scoped              | **Three shipped screens confirmed**                           | Under-scoped           | Confirmed                             | **Explicitly in scope**                                                                                                         |
| Old mobile clients                                | Not addressed             | **High-risk breaking API**                                    | Identified blocker     | Confirmed clients send old payload    | **Backward-compatible transition required**                                                                                     |
| Manual-review state                               | Existing state assumed    | **No vehicle-level state exists**                             | Identified ambiguity   | —                                     | **Use explicit classification result + existing admin approval gate; do not invent a separate vehicle status without evidence** |
| Driver body/CC/seats trust                        | Master wording ambiguous  | **Current inputs are self-reported**                          | —                      | Confirmed                             | **Claims at registration; admin verification is authoritative**                                                                 |
| Dispatch missing pricing                          | Described as rate failure | **Actually silent starvation**                                | Identified risk        | Confirmed                             | **Test for candidate-pool starvation, not only API errors**                                                                     |
| ETA seed change                                   | Suggested                 | **Likely unnecessary**                                        | Verify both modules    | `vehicleGroup` existing               | **Verify; don't modify group-level seed unless required**                                                                       |
| Upgrade/downgrade maps                            | Duplicate maps            | —                                                             | Canonicalize           | Confirmed duplicate                   | **Use one canonical ordering source if feasible; otherwise enforce synchronized derivation**                                    |
| Dataset idempotency                               | Generic idempotence       | **Nullable-year unique index breaks naive conflict handling** | Raised                 | —                                     | **Explicit dedupe strategy required**                                                                                           |
| Packages/incentives                               | Possible                  | —                                                             | Possible               | `vehicle_type` dependencies confirmed | **Repo-wide verify and update only where category is explicitly enumerated**                                                    |

The strongest repository-specific findings are from the GLM/Qwen Code verification: the enum is used by **nine columns**, not eight; the three current client registration screens all submit the old `vehicle_type` flow; and dispatch silently starves candidates when pricing is absent. 

---

# 4. ACTUAL REPOSITORY FACTS

These materially determine the implementation.

### Database

* `vehicle_type` is one shared Postgres enum.
* It is used by nine columns, including `drivers`, `vehicles`, `packages`, `rides`, `pricing`, `incentive_definitions.vehicle_type_filter`, `vehicle_type_changes.old/new`, and `vehicle_models.default_vehicle_type`. 
* There are existing raw `ALTER TYPE ... ADD VALUE` migration precedents.
* `cc_range` exists on `vehicles` but has no application readers/writers.
* `vehicle_models` already has integer `typical_cc_min` / `typical_cc_max`. 
* `body_type` and premium allowlist machinery do not currently exist. 

### Canonical vehicle types

`lib/vehicleTypes.ts` is the actual canonical registry and also supplies Zod/type definitions and eligibility metadata. `store/useRiderStore.ts` has a duplicate inline union that should be eliminated. 

### Registration

The current API accepts driver-selected `vehicle_type`.

Three shipped screens currently send that old payload:

* onboarding;
* add vehicle;
* vehicle management.

They currently do not send engine CC/body type. 

### Admin

The existing `vehicle_type_adjusted` admin override path already works from the registry and therefore naturally supports a ninth enum value. 

### Pricing / dispatch

Ride request explicitly fails with `422 pricing_not_found` when a rate is missing.

Dispatch is worse: it defaults the missing system rate to zero and subsequently filters drivers out, producing **silent dispatch starvation**. 

The pricing table also has `intercity_per_km_bdt`, so this cannot be omitted from new pricing configuration. 

### Existing category consumers

Confirmed hardcoded areas include:

* customer home;
* find-ride metadata;
* call ledger;
* upgrade/downgrade;
* pricing seed mechanisms;
* rider store.

The admin vehicle-model category selector is already registry-driven. 

### Tests

Jest exists.

There is currently no dedicated `vehicleTypes.test.ts`; existing tests include hardcoded eight-category fixtures. 

### Dataset

The existing `vehicle_models` unique index has nullable year fields. Naive `ON CONFLICT` logic is therefore not sufficient for deterministic deduplication when year values are NULL. 

---

# 5. FINAL DEPENDENCY GRAPH

```text
                    ┌──────────────────────────┐
                    │ Repository preflight     │
                    │ + product inputs         │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │ Phase 1                  │
                    │ Schema + canonical types│
                    └────────────┬─────────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
          ┌──────────────────┐      ┌────────────────────┐
          │ Pricing readiness│      │ Classification     │
          │ implementation   │      │ + registration     │
          └────────┬─────────┘      └──────────┬─────────┘
                   │                           │
                   └────────────┬──────────────┘
                                ▼
                    ┌──────────────────────────┐
                    │ Release gate             │
                    │ enum + pricing + dispatch│
                    │ + compatibility verified │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │ Phase 3                  │
                    │ Propagation + UI + ETA   │
                    └────────────┬─────────────┘
                                 │
                   ┌─────────────┴──────────────┐
                   ▼                            ▼
          ┌─────────────────┐          ┌──────────────────┐
          │ Admin tooling   │          │ Documentation    │
          │ allowlist/body  │          │ AGENTS/CLAUDE    │
          └────────┬────────┘          └────────┬─────────┘
                   └─────────────┬──────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │ Final dataset import     │
                    │ when dataset exists      │
                    └────────────┬─────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │ Independent audit        │
                    │ MiMo 2.5 Pro             │
                    └────────────┬─────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │ Conditional GLM-5.3 fix  │
                    └──────────────────────────┘
```

### Parallelization

**Safe:**

* Documentation updates can run alongside implementation.
* Premium allowlist admin UI and body-type admin UI can run after schema exists, independently of the dataset.
* Tests can be developed alongside their corresponding implementation.

**Not safe:**

* Classification release before pricing readiness.
* Registration API breaking change before compatible clients exist.
* Dataset import before the final dataset exists.
* UI propagation before the canonical registry is settled.

---

# 6. FINAL IMPLEMENTATION PLAN

## Phase 0 — Preflight and product-input gate

### Objective

Resolve only the two things that cannot be invented:

1. `car_compact` pricing values.
2. Any missing `VEHICLE_TYPES.car_compact` business metadata that affects eligibility.

### Inspect

* `lib/vehicleTypes.ts`
* pricing configuration
* existing economy/comfort pricing
* intercity pricing
* dispatch eligibility
* framework definition.

### Mandatory

The agent may **not invent**:

* base fare;
* per-km rate;
* intercity rate;
* age limits;
* AC requirement;
* driver requirement;
* other eligibility metadata;
* **rider-facing presentation copy** — `display_en`, `display_bn`, `subtitle_en`, `subtitle_bn`, `sort` for the `car_compact` registry entry (bilingual rider-visible strings; a category riders have never seen). **Candidate values supplied in §12.1** ("Mini Car" / "মিনি কার") — **pending product (Zia) sign-off** before use; do not treat as final until confirmed.

If those values are not discoverable from the master/product configuration:

> **STOP and report `REQUIRES PRODUCT INPUT`.**

The GLM audit correctly identified that the existing `VehicleTypeDefinition` has fields that affect eligibility, not merely presentation. 

---

## Phase 1 — Schema + canonical category foundation

### Files/modules

At minimum:

* `src/db/schema.ts`
* `src/db/migrations/*`
* `lib/vehicleTypes.ts`
* `store/useRiderStore.ts`

Plus all actual consumers found during search.

### Implementation

#### 1. Add `car_compact`

Use a raw SQL migration:

```sql
ALTER TYPE vehicle_type ADD VALUE 'car_compact';
```

Do not let an ORM diff recreate/drop the enum.

**Migration isolation (mandatory):** `ALTER TYPE ... ADD VALUE` must live in its **own migration file**, separate from any migration that inserts rows using the new value — Postgres forbids using a newly added enum value within the same transaction, and each drizzle migration file executes in one transaction. (Existing precedents `0003`/`0005`/`0035` follow this pattern.)

Update:

* Postgres enum;
* TypeScript union;
* Zod enum;
* `VEHICLE_TYPE_VALUES`;
* `VEHICLE_TYPES`.

**Compile-lockstep (mandatory):** two consumers type exhaustively against `VehicleTypeEnum` and will fail `tsc` the moment the enum gains `car_compact`. Add the minimal keys in the **same phase** as the registry change:

* `app/(main)/(customer)/(tabs)/home/index.tsx` — `VEHICLE_ICONS` Record: add `car_compact: "car"` (per §12.1).
* `scripts/zone-seed-pricing.ts` — `BD_DEFAULTS` Record: add the `car_compact` key with value `0` and a `// REQUIRES PRODUCT INPUT — sentinel, do not seed` comment. A `0` sentinel is NOT an invented rate: the seed must not be run for `car_compact` until Phase 0-approved rates replace it, and the release gate keeps the category non-operational until then. This keeps `tsc` green without violating the do-not-invent rule.

Without these, Phase 1's own verification gate (`run TypeScript`) cannot pass.

#### 2. Add `body_type`

Create a `pgEnum` with exactly:

```text
motorcycle
scooter
auto_rickshaw
hatchback
sedan
crossover
suv
suv_large
mpv
van
minibus
```

Apply to:

* `vehicles.body_type`
* `vehicle_models.body_type`

#### 3. Add `engine_cc`

Add integer `engine_cc` to `vehicles`.

Default strategy:

* retain legacy `cc_range`;
* do not migrate/drop it unless actual repository inspection establishes safe removal.

#### 4. Premium allowlist

Create:

```text
vehicle_premium_allowlist
  brand
  model nullable
  is_active
```

Use existing database conventions for IDs/timestamps if repository standards require them.

**Case normalization (mandatory):**

* Store `brand` and `model` normalized (trimmed; case-folded or lowercased for uniqueness purposes — the repository already uses `lower()` comparisons, e.g. `app/api/driver/vehicles+api.ts:103-104`).
* Enforce case-insensitive uniqueness that distinguishes brand-only rows from brand+model rows (e.g. unique index on `(lower(brand), lower(coalesce(model, '')))` or an equivalent normalized-column approach following existing conventions).
* The server-side premium resolver and the classifier match must use the same normalization, so case variation ("toyota" vs "Toyota" vs "TOYOTA" Premio) cannot bypass premium classification.

#### 5. Canonical `car_compact` registry entry

Populate every required `VehicleTypeDefinition` field.

Use product/framework values where established.

Anything not established must be marked `REQUIRES PRODUCT INPUT`; the coding agent must not guess eligibility metadata.

#### 6. Remove duplicate TS vehicle-type union

Change `useRiderStore.ts` to consume the canonical definition.

### Verification

* migration inspection;
* TypeScript;
* Jest;
* repository search for duplicate category unions;
* verify all nine enum consumers.

---

## Phase 2 — Pricing readiness + classification/registration

### Critical release rule

These are implementation substeps, but **must be released together**.

### A. Pricing

Add `car_compact` rows for every applicable zone.

Each pricing record must include all required fields, including:

* normal per-km rate;
* base/minimum fare fields where applicable;
* `intercity_per_km_bdt`.

Do not invent rates.

Also inspect all pricing consumers:

* ride estimate;
* ride request;
* scheduled rides;
* ride completion;
* dispatch.

The goal is not merely "seed exists"; the goal is:

> every operational path that resolves pricing for `car_compact` succeeds.

### B. Registration classifier

Implement the one authoritative classifier.

**Purity constraint (mandatory):** the classifier lives in `lib/vehicleTypes.ts`, which is imported by React Native screens (home, find-ride, onboarding, add-vehicle, etc.) **and** by `utils-server/dispatch.ts`. It must therefore be a **pure function with no Drizzle/database imports** — a DB-importing classifier breaks the mobile client bundle and the utils-server package. All allowlist lookups happen in server-only code (registration/admin API routes), which resolves the premium match and passes it into the classifier as a boolean `premium_match` input.

Inputs:

* brand;
* model;
* body type;
* engine CC;
* registered seats;
* `premium_match: boolean` (server-resolved from `vehicle_premium_allowlist`, case-normalized);
* model metadata where available.

Exact cascade:

1. auto-rickshaw;
2. motorcycle/scooter bands;
3. XL based on seats + body;
4. premium allowlist;
5. engine CC > 2000;
6. SUV floor;
7. compact/economy/comfort CC bands;
8. manual review.

Do not duplicate this cascade elsewhere.

### C. `vehicle_models` lookup

When a known model exists:

* use its authoritative model attributes;
* use `typical_cc_min/max`;
* use body type;
* use known year information.

When the dataset is empty/incomplete:

* gracefully fall back to the available registration claims and classifier rules;
* do not crash simply because the model dataset is not populated.

### D. Registration API

Modify `app/api/driver/vehicles+api.ts`.

But **do not make the API immediately incompatible with existing shipped clients.**

During the transition:

* accept the legacy `vehicle_type` field when required for old clients;
* accept new classification inputs;
* distinguish legacy/unverified registrations from fully classified registrations;
* do not let legacy client input bypass server/admin verification;
* preserve the existing admin approval gate.

The exact compatibility mechanism must follow the repository's existing version/capability conventions. If none exists, use the least invasive backward-compatible request contract rather than inventing a new versioning system.

**Suggest/confirm interaction contract (mandatory):**

* Classification happens server-side **inside the existing single `POST /api/driver/vehicles`** — no separate suggest endpoint, no two-phase submit. The driver submits attributes; the server classifies and persists in one transaction (already the pattern today).
* The POST response gains a `classification` field: `{ outcome: 'classified', suggested_vehicle_type }` or `{ outcome: 'manual_review' }`.
* The driver-facing "confirmation" is a **post-submit displayed result** (the suggested category shown as a read-only outcome screen/toast, with the existing admin-override caveat), not a second round-trip that gates persistence. Rationale: the driver has no authority either way (client classification is display-only), so a pre-persist confirmation adds a round-trip without adding trust.
* Loading state: the existing submit spinner/disabled state on the registration forms covers the classifier call (same request).
* Error state: classifier/network failure returns the existing `{ error, message }` shape; the form shows the standard inline error and lets the driver retry — no partial persistence.
* Old clients ignore the new `classification` response field (additive change), preserving compatibility.

### E. Registration UI

Explicitly update all shipped registration paths:

* `app/(main)/(rider)/add-vehicle/index.tsx`
* `app/(main)/(rider)/vehicle-management/index.tsx`
* `app/(main)/(rider)/onboarding/index.tsx`

The user flow becomes:

```text
brand
model
engine CC
registered seats
body type / verified model attributes
        ↓
server classification
        ↓
suggested category
        ↓
driver confirmation
        ↓
persist
        ↓
admin verification/override
```

Client classification is display-only.

**UI grounding (mandatory):** all screen work follows **§12 (UI/UX Implementation Spec)** — the authoritative screen-by-screen spec — plus the design tokens in `theme/goRide.ts`. Theming is **Pattern A**: `useIsDark()` from `lib/useAppearance.ts` + inline `colors.*` ternaries (verified repo-wide practice; no `dark:` classes). New form inputs (engine CC, body type) and the classification-result display reuse the existing form-field patterns already on these screens — no new component library, no new navigation pattern.

**Screen-state coverage:** each modified screen must handle loading (submit in flight), error (server/validation failure with retry), success-classified (suggested category displayed), and success-manual-review (see §F) — matched to how the screen already renders these states.

### F. Manual review

Do not create a new ride category.

Use an explicit classification outcome such as:

```text
classified
manual_review
```

if the repository has no better existing equivalent.

Persist the proposed category where safe, but keep admin approval as the enforcement gate.

**Driver-visible manual-review state (mandatory):** when classification returns `manual_review`:

* submission still **succeeds** — the vehicle persists with the proposed (or legacy-provided) type and the driver follows the existing pending-admin-approval workflow exactly as unrecognized-model registrations do today;
* the driver sees a "submitted — pending review" style outcome (reusing the existing pending/submitted visual language on these screens), **never** a blocked/failed state and **never** a tenth category label;
* admin approval (with `vehicle_type_adjusted` override) resolves the review — no new driver-facing status vocabulary.

**Vehicle-management classification badges (§12.2.6):** the badge UI ("Classified" / "Pending Review" / "Adjusted") is rendered from **derived** signals — driver approval status and existing `vehicle_type_changes` history — with **no new persisted `classification_status` column**. If implementation inspection proves derivation insufficient, STOP and report per the ambiguity rule rather than silently adding a status column.

Do not invent a new vehicle-level status schema unless implementation inspection proves it is necessary.

### G. Trust model

Driver-submitted:

* CC;
* seats;
* body type

are **claims**, not verified facts.

The classifier can operate on them.

Admin/document approval is what turns them into accepted vehicle data.

This corrects the original plan's inaccurate comparison to today's driver-supplied `passenger_seats`. 

### Phase 2 release gate

Before exposing `car_compact` operationally:

* pricing exists;
* estimate resolves;
* request resolves;
* dispatch has nonzero rate configuration;
* utils-server restarted/reloaded as required;
* H3 candidate indexing sees `car_compact`;
* legacy registration clients remain functional;
* new registration clients function.

---

## Phase 3 — Propagation and existing-system integration

### Search repository-wide

Search for:

```text
vehicle_type
VEHICLE_TYPE
VEHICLE_TYPES
VEHICLE_TYPE_VALUES
bike_basic
car_economy
car_comfort
car_premium
car_xl
vehicleGroup
VEHICLE_TIER
pricing_not_found
```

Include:

* `app/`
* `components/`
* `lib/`
* `utils-server/`
* `store/`
* `constants/`
* tests
* scripts/seed mechanisms
* i18n.

### Required consumers

#### Customer

* home category metadata/icon;
* find-ride category metadata;
* ride estimate;
* confirmation/tracking category display where applicable.

For `find-ride`:

**Only add `car_compact`.**

Do not alter the existing three-group architecture or restore a fourth `car_xl` group. The latter was a stale finding. 

#### Driver

* call ledger;
* vehicle-management;
* active-vehicle display;
* type-change flow.

#### Admin

Inspect:

* upgrade;
* downgrade;
* vehicle type change;
* pricing;
* packages;
* incentives;
* vehicle model screens.

Where these are registry-driven, **do not edit them unnecessarily**.

#### Dispatch

Inspect:

* `utils-server/dispatch.ts`
* H3 vehicle filtering/indexing
* rate lookup
* ETA logic.

`car_compact` must survive the complete chain:

```text
DB enum
→ driver vehicle
→ drivers.vehicle_type
→ H3 index
→ candidate filter
→ pricing
→ min-rate eligibility
→ dispatch
```

#### ETA

Verify both relevant modules if they exist.

If `car_*` grouping already catches `car_compact`, do not change the algorithm or group-level seed.

Add a regression test instead.

#### Packages/incentives

Because `packages.vehicle_type` and incentive vehicle filters use the same enum, verify whether their UI/API logic is registry-driven or has explicit category lists.

Only modify actual hardcoded consumers.

#### i18n

Add category labels only if vehicle category labels are actually resolved through the i18n system.

---

## Phase 4 — Admin tooling + dataset

### Premium allowlist admin

Implement:

* list;
* add brand-wide rule;
* add brand+model rule;
* deactivate;
* edit if repository conventions require.

Use existing admin auth/authorization patterns.

### Body type administration

Extend existing `vehicle_models` administration to maintain `body_type`.

Do **not** modify its vehicle-type options manually; they already derive from the canonical registry. 

### Dataset import

Only execute after the final dataset exists.

The importer must:

* validate schema;
* validate body types;
* validate engine data;
* validate year ranges;
* validate category consistency;
* validate duplicates;
* preserve source classifications;
* be deterministic;
* be rerunnable.

### Critical deduplication requirement

Do not rely blindly on:

```text
ON CONFLICT DO NOTHING
```

because nullable `year_start/year_end` prevent the current unique index from providing reliable deduplication. 

Choose an evidence-based strategy:

* normalize/fill actual year ranges from the dataset;
* or perform deterministic pre-upsert matching;
* or create a safe uniqueness migration.

Do not introduce artificial sentinel years unless repository/product semantics justify them.

**Dataset conflict warning (mandatory):** the per-model dataset files in this folder (e.g. `Kimi Dataset.md`, 732 rows, 106 compact) were generated against the **v2.0** framework thresholds — bike bands at 124/149cc (canonical: 110/150), bike `typical_passenger_seats = 2` (registry: 1 passenger) — so their `assigned_category` values cannot be trusted blindly. The importer's category-consistency validation must recompute each row against the canonical cascade and **report mismatches** rather than importing `assigned_category` as-is. The import input is the **final merged, product-approved dataset**, not any single model's file.

---

# 7. TESTING & ACCEPTANCE CRITERIA

## Schema

* [ ] `car_compact` exists in Postgres enum.
* [ ] All nine enum consumers accept it.
* [ ] Migration is additive and non-destructive.
* [ ] `body_type` is constrained to the 11 allowed values.
* [ ] `engine_cc` is integer.
* [ ] premium table exists.

## Classification

Test every cascade branch:

* [ ] auto-rickshaw;
* [ ] bike basic;
* [ ] bike standard;
* [ ] bike plus;
* [ ] XL;
* [ ] premium brand;
* [ ] premium model;
* [ ] >2000cc;
* [ ] SUV floor;
* [ ] car compact;
* [ ] car economy;
* [ ] car comfort;
* [ ] manual review.

Also test precedence:

> an earlier rule must always win over a later rule.

## Registration

* [ ] New registration inputs work.
* [ ] Server computes classification.
* [ ] Client cannot force premium/category.
* [ ] Existing admin override works.
* [ ] Old app payload remains compatible during rollout.
* [ ] Missing model dataset does not crash registration.
* [ ] Manual-review vehicles follow the existing admin approval path.

## Pricing

For every configured zone:

* [ ] `car_compact` standard pricing exists.
* [ ] `intercity_per_km_bdt` exists where required.
* [ ] estimate succeeds.
* [ ] request succeeds.
* [ ] schedule succeeds.
* [ ] completion/finalization succeeds where pricing is re-read.

## Dispatch

* [ ] `car_compact` drivers are indexed.
* [ ] candidate lookup finds them.
* [ ] pricing lookup returns nonzero configuration.
* [ ] min-rate filtering does not accidentally reject all compact drivers.
* [ ] dispatch does not silently starve the category.

## UI

* [ ] customer home shows compact.
* [ ] find-ride shows compact.
* [ ] driver ledger shows compact.
* [ ] vehicle-management shows correct category.
* [ ] no existing category disappears.
* [ ] no unnecessary category-group redesign occurs.

## Admin

* [ ] premium allowlist CRUD works.
* [ ] inactive premium rules are ignored.
* [ ] body type can be maintained.
* [ ] existing admin vehicle override remains intact.

## Dataset

* [ ] validation rejects malformed records.
* [ ] duplicates are deterministic.
* [ ] rerunning import does not create duplicates.
* [ ] source data is not silently reclassified.

---

# 8. REGRESSION CHECKLIST

The implementation must preserve:

* existing eight vehicle categories;
* existing admin override;
* existing vehicle approval workflow;
* existing package vehicle-type restrictions;
* existing incentive filters;
* ride estimate;
* scheduled rides;
* ride completion pricing;
* dispatch candidate filtering;
* H3 indexing;
* ETA behavior;
* minimum-rate filtering;
* customer category selection;
* driver call ledger;
* existing registration for old clients;
* existing vehicle-management flow;
* intercity pricing;
* integer-paisa money handling;
* existing admin permissions.

Also explicitly check:

* `vehicle_type_changes`;
* `drivers.vehicle_type`;
* `vehicles.vehicle_type`;
* `rides.vehicle_type`;
* `pricing.vehicle_type`;
* `packages.vehicle_type`;
* `incentive_definitions.vehicle_type_filter`.

---

# 9. CODING AGENT INSTRUCTIONS

The coding agent must follow these rules:

### Before modification

1. Read repository instructions.
2. Inspect actual current files.
3. Search consumers rather than trusting stale line numbers.
4. Trace schema dependencies.
5. Trace API request/response contracts.
6. Trace mobile clients.
7. Identify existing reusable abstractions.

### During modification

* Reuse `lib/vehicleTypes.ts`.
* Do not create a competing category registry.
* Do not duplicate classifier logic.
* Use existing Drizzle conventions.
* Use existing Zod/JSON parsing conventions.
* Use raw SQL for the Postgres enum addition.
* Preserve old clients during migration.
* Treat driver-provided classification data as unverified claims.
* Preserve admin approval as authority.
* Do not invent pricing.
* Do not invent eligibility values.
* Do not change unrelated multi-city registration logic.

### Verification

After every major phase:

* run type checking;
* run relevant Jest tests;
* search for remaining eight-category assumptions;
* inspect migration;
* verify API contracts;
* verify dispatch.

Concrete commands (root package):

```bash
npm run lint
npx tsc --noEmit
npx jest --watchAll=false
```

utils-server has **no** `typecheck` script (only `dev`/`start` in `utils-server/package.json`) — typecheck it directly against its separate tsconfig:

```bash
cd utils-server && npx tsc --noEmit
```

### Stop conditions

Stop and report rather than guess if:

* `car_compact` pricing cannot be established;
* eligibility metadata cannot be established;
* an API compatibility choice materially changes product semantics;
* a migration could cause data loss;
* the repository contains contradictory category rules;
* the dataset conflicts with the master framework.

---

# 10. FINAL KILO CODE PROMPT

```text
# RIDE — VEHICLE CATEGORIZATION v2
# FINAL IMPLEMENTATION INSTRUCTION

You are the primary coding agent for the existing Ride repository.

Implement the vehicle categorization requirements below.

This is an existing production-oriented TypeScript / React Native / Expo / Postgres / Drizzle / API / dispatch repository.

DO NOT treat this as greenfield work.

============================================================
1. NON-NEGOTIABLE PRODUCT REQUIREMENTS
============================================================

The platform has exactly these nine ride categories:

- bike_basic
- bike_standard
- bike_plus
- cng
- car_compact
- car_economy
- car_comfort
- car_premium
- car_xl

Do not invent a tenth ride category.

`car_compact` must become a first-class category throughout the system.

The authoritative vehicle classification cascade is:

1. auto-rickshaw
2. motorcycle/scooter bike bands
3. XL based on registered seats + body type
4. premium allowlist
5. engine CC > 2000
6. SUV floor
7. compact/economy/comfort CC bands
8. manual-review fallback

There must be ONE authoritative classifier.

Do not duplicate this logic in API routes, frontend, admin, dispatch, or registration code.

============================================================
2. FIRST: REPOSITORY PREFLIGHT
============================================================

Before editing:

- read AGENTS.md and CLAUDE.md if present;
- inspect src/db/schema.ts;
- inspect all vehicle_type migrations;
- inspect lib/vehicleTypes.ts;
- inspect store/useRiderStore.ts;
- inspect app/api/driver/vehicles+api.ts;
- inspect app/api/admin/driver/approve+api.ts;
- inspect:
  - onboarding vehicle flow
  - rider add-vehicle
  - rider vehicle-management
  - select-active-vehicle
  - vehicle-type-change flows;
- inspect pricing schema and all pricing consumers;
- inspect utils-server/dispatch.ts;
- inspect H3 vehicle indexing;
- inspect ETA modules;
- inspect packages/incentives vehicle-type filters;
- inspect admin pricing and vehicle-model screens;
- inspect tests and Jest configuration;
- inspect actual seed mechanisms;
- inspect section 12 (UI/UX IMPLEMENTATION SPEC) of the plan this
  prompt belongs to — it is the authoritative screen-by-screen UI
  spec — and verify the theming helpers (useIsDark from
  lib/useAppearance.ts) and color tokens in theme/goRide.ts.

Then perform a repository-wide search for:

vehicle_type
VEHICLE_TYPE
VEHICLE_TYPES
VEHICLE_TYPE_VALUES
bike_basic
car_economy
car_comfort
car_premium
car_xl
cc_range
typical_cc_min
typical_cc_max
pricing_not_found
vehicleGroup

Do not rely blindly on historical file paths or line numbers.

============================================================
3. IMPORTANT REPOSITORY FACTS
============================================================

Repository inspection has established:

- vehicle_type is one shared Postgres enum used across drivers, vehicles, packages, rides, pricing, incentives, vehicle type changes, and vehicle models;
- lib/vehicleTypes.ts is the canonical TypeScript vehicle registry;
- store/useRiderStore.ts contains a duplicate inline vehicle-type union and should consume the canonical registry;
- vehicles.cc_range is dead in application code;
- vehicle_models already has integer typical_cc_min and typical_cc_max;
- body_type and premium allowlist machinery do not currently exist;
- three shipped driver screens currently submit the old vehicle_type-based registration payload;
- existing admin vehicle_type_adjusted override must remain;
- ride request fails with pricing_not_found when pricing is missing;
- dispatch can silently starve drivers when pricing is missing;
- app/admin/vehicle-models.tsx derives vehicle-type options dynamically from VEHICLE_TYPES and should NOT receive a manual car_compact option patch;
- find-ride already represents car_xl under its existing car grouping; do NOT redesign its grouping.

============================================================
4. PHASE 0 — REQUIRED BUSINESS INPUTS
============================================================

Before implementation, inspect the repository and master product configuration for the intended car_compact:

- base fare;
- per-km rate;
- intercity_per_km_bdt;
- minimum fare;
- age/eligibility metadata;
- AC requirement;
- any other VehicleTypeDefinition fields that affect eligibility;
- rider-facing presentation copy for the car_compact registry entry:
  display_en, display_bn, subtitle_en, subtitle_bn, sort order
  (bilingual rider-visible strings — do not fabricate Bengali copy).
  Candidate values live in section 12.1 ("Mini Car" / "মিনি কার")
  and are PENDING product sign-off — confirm before using.

DO NOT invent any of these values.

If a required business value cannot be established from the repository/product specification, STOP and report:

REQUIRES PRODUCT INPUT

Do not guess.

============================================================
5. PHASE 1 — DATABASE + CANONICAL TYPES
============================================================

Add car_compact to the shared Postgres vehicle_type enum.

Use a raw SQL migration equivalent to:

ALTER TYPE vehicle_type ADD VALUE 'car_compact';

Do not allow ORM diffing to recreate/drop the enum.

Keep the ALTER TYPE in its OWN migration file — Postgres forbids
using a newly added enum value in the same transaction, and each
migration file runs in one transaction.

COMPILE-LOCKSTEP (mandatory, same phase as the enum change):

Two consumers type exhaustively against VehicleTypeEnum and will
fail tsc immediately. Add the minimal keys now:

- app/(main)/(customer)/(tabs)/home/index.tsx VEHICLE_ICONS:
  car_compact: "car"
- scripts/zone-seed-pricing.ts BD_DEFAULTS: add car_compact key
  with value 0 and a "// REQUIRES PRODUCT INPUT — sentinel, do
  not seed" comment. The 0 is a compile sentinel, NOT a rate;
  never run the seed for car_compact until approved rates replace
  it (the release gate keeps the category non-operational until
  then).

Without these, the phase-1 typecheck gate cannot pass.

Update all canonical TypeScript/Zod representations in lockstep.

Update lib/vehicleTypes.ts:

- VEHICLE_TYPE_VALUES
- VEHICLE_TYPES
- Zod enum
- eligibility/min-km helpers where required

Add a complete car_compact registry definition.

Do not invent fields that affect driver eligibility.

If an eligibility field is unspecified by product requirements, stop and report it.

Remove the duplicated vehicle-type union from store/useRiderStore.ts if it is confirmed to duplicate the canonical registry.

Add a body_type pgEnum with exactly:

motorcycle
scooter
auto_rickshaw
hatchback
sedan
crossover
suv
suv_large
mpv
van
minibus

Apply body_type to:

- vehicles
- vehicle_models

Add integer engine_cc to vehicles.

Default strategy: retain legacy cc_range unless actual repository inspection proves it is safe and necessary to remove it.

Use vehicle_models.typical_cc_min and typical_cc_max when model data exists.

Create vehicle_premium_allowlist with:

- brand
- nullable model
- is_active

Semantics:

model NULL = whole brand
model populated = specific model

MANDATORY normalization:

- store brand/model normalized (trim + case-fold for uniqueness;
  the repo already uses lower() comparisons in vehicles+api.ts);
- enforce case-insensitive uniqueness that distinguishes brand-only
  rows from brand+model rows;
- the server-side premium resolver must match using the same
  normalization, so case variation ("toyota" vs "Toyota" Premio)
  cannot bypass premium classification.

Use existing DB conventions for IDs/timestamps if required.

============================================================
6. PHASE 2 — PRICING READINESS
============================================================

Before car_compact can be released operationally, pricing must exist.

Find the actual repository pricing/seed mechanism. Do not assume scripts/ paths exist.

Add car_compact pricing for every configured zone.

Include all required pricing fields, including:

- normal per-km/base pricing;
- intercity_per_km_bdt.

Do not invent rates.

Inspect all pricing consumers:

- ride estimate
- ride request
- scheduled rides
- ride completion/finalization
- dispatch

The result must be:

- no pricing_not_found for valid car_compact rides;
- dispatch receives a valid nonzero rate;
- minimum-rate filtering does not silently reject all compact drivers.

Also verify any ETA configuration.

If ETA uses car_* grouping already, do not unnecessarily alter group-level ETA configuration. Add a regression test instead.

============================================================
7. PHASE 3 — AUTHORITATIVE CLASSIFIER
============================================================

Implement the classifier in lib/vehicleTypes.ts or the repository's established domain equivalent if inspection proves another location is authoritative.

MANDATORY PURITY CONSTRAINT:

lib/vehicleTypes.ts is imported by React Native screens AND by
utils-server/dispatch.ts. The classifier must be a PURE function
with NO Drizzle/database imports — importing the DB into this
module breaks the mobile client bundle and the utils-server
package.

The premium-allowlist match (cascade rule 4) must be resolved in
server-only code (registration/admin API routes), which queries
vehicle_premium_allowlist with case-normalized matching and passes
the result into the pure classifier as a boolean:

- premium_match: boolean

The pure classifier itself never touches the allowlist table.

Inputs must include:

- brand
- model
- body_type
- engine_cc
- registered seats
- premium_match (server-resolved)

Use vehicle-model metadata when available, especially:

- typical_cc_min
- typical_cc_max
- body_type

Run the exact cascade:

1. auto-rickshaw
2. motorcycle/scooter bike bands
3. XL
4. premium allowlist
5. >2000cc
6. SUV floor
7. compact/economy/comfort
8. manual review

Test precedence explicitly.

Manual review is NOT a ride category.

If the repository has no vehicle-level review state, do not invent a parallel workflow. Return an explicit classification outcome and use the existing driver/admin approval gate as the enforcement mechanism.

============================================================
8. PHASE 4 — REGISTRATION
============================================================

The current registration flow allows driver self-selection of vehicle_type.

Replace that architecture for new clients with:

brand
model
engine CC
registered seats
body type / known model attributes
        ↓
server-side classifier
        ↓
suggested category
        ↓
driver confirmation
        ↓
persist
        ↓
admin verification/override

Explicitly update the shipped registration screens that currently post vehicle_type:

- onboarding
- add-vehicle
- vehicle-management

The server remains authoritative.

Do not trust client-supplied classification.

IMPORTANT:

Existing shipped mobile clients still send vehicle_type and do not send engine_cc/body_type.

Do NOT break those clients during rollout.

Implement the least-invasive backward-compatible API transition supported by the repository.

Legacy payloads may remain temporarily accepted, but they must not bypass server/admin verification.

Do not silently remove the legacy contract until the client rollout strategy makes that safe.

Treat driver-supplied CC/body/seats as registration claims.

Admin document approval is the enforcement point for verified vehicle attributes.

Preserve the existing vehicle_type_adjusted admin override.

FRONTEND CONTRACT (mandatory):

- Classification happens server-side INSIDE the existing single
  POST /api/driver/vehicles — no separate suggest endpoint, no
  two-phase submit.
- The POST response gains an additive "classification" field:
  { outcome: "classified", suggested_vehicle_type } or
  { outcome: "manual_review" }.
- Driver "confirmation" is a POST-SUBMIT displayed result
  (read-only suggested category), not a second round-trip.
- Loading: reuse the existing submit spinner/disabled state.
- Error: standard { error, message } shape + inline form error
  with retry; no partial persistence.
- Manual-review UX: submission SUCCEEDS; driver sees a
  "submitted — pending review" outcome reusing the existing
  pending/submitted visual language; never a blocked state,
  never a tenth category label. Admin approval resolves it.
- All screen work follows section 12 (UI/UX IMPLEMENTATION SPEC):
  exact copy strings, field order, picker/field specs, state
  machines, and conflict flags defined there. Theming is Pattern A
  (useIsDark + inline colors ternaries from theme/goRide.ts —
  NO dark: classes). Ionicons only, no emoji. Driver-screen touch
  targets >= 56dp. New form inputs (engine CC, body type) reuse
  existing form-field patterns on these screens — no new component
  library or navigation pattern.
- Each modified screen must cover loading / error /
  success-classified / success-manual-review states, matched to
  how the screen already renders these states.

============================================================
9. RELEASE SAFETY
============================================================

Do not create a release window where car_compact can be classified but cannot be priced/dispatched.

Schema/type work and pricing readiness must be released as one operational unit.

Before enabling car_compact operationally, verify:

- Postgres enum updated;
- pricing rows exist;
- intercity pricing exists where required;
- estimate resolves;
- request resolves;
- dispatch resolves a nonzero rate;
- H3 vehicle index sees car_compact;
- utils-server has restarted/reloaded as required;
- new registration works;
- old registration clients remain compatible.

============================================================
10. PHASE 5 — CATEGORY PROPAGATION
============================================================

Search the entire repository again.

Update actual hardcoded consumers of the eight-category set.

At minimum inspect:

- customer home
- find-ride
- call ledger
- admin upgrade
- admin downgrade
- driver type-change flow
- ETA modules
- dispatch
- package vehicle-type filters
- incentive vehicle-type filters
- pricing UI/seed mechanisms
- test fixtures
- i18n category labels
- vehicle-management
- active-vehicle display

Add car_compact where the category is explicitly enumerated.

Do not modify registry-driven code unnecessarily.

Do not manually add car_compact to app/admin/vehicle-models.tsx if it already derives from VEHICLE_TYPES.

Do NOT redesign the existing find-ride category grouping.

Only add car_compact metadata/icon where required.

Upgrade/downgrade ordering must place:

car_compact

between cng and car_economy.

Avoid maintaining two independent ordering definitions if a safe canonical ordering source can be reused.

============================================================
11. DISPATCH
============================================================

Trace the complete category path:

DB
→ drivers.vehicle_type
→ H3 indexing
→ candidate lookup
→ pricing
→ minimum-rate validation
→ dispatch

Verify that car_compact drivers are visible to the candidate pool.

Verify that missing pricing cannot silently convert the rate to zero and starve candidates.

Do not redesign dispatch.

Make only the changes necessary for the new category.

============================================================
12. PHASE 6 — ADMIN
============================================================

Create admin functionality for vehicle_premium_allowlist:

- list
- add brand-wide rule
- add brand+model rule
- deactivate
- edit if consistent with existing patterns

Use existing admin authentication and authorization.

Extend vehicle-model administration to maintain body_type.

Do not create a new permission system.

Do not manually duplicate vehicle-type options that already come from VEHICLE_TYPES.

============================================================
13. PHASE 7 — FINAL DATASET
============================================================

Only when the final vehicle-model dataset is actually available:

- validate it;
- validate body types;
- validate engine values;
- validate year ranges;
- validate categories;
- validate brand/model normalization;
- validate duplicates.

Create a deterministic, rerunnable import.

IMPORTANT:

The current unique index contains nullable year fields, so naive ON CONFLICT handling is not sufficient for duplicate prevention.

Use a deterministic dedupe/upsert strategy based on the actual finalized dataset.

DATASET CONFLICT WARNING (mandatory):

The per-model dataset files in the plan folder (e.g. Kimi
Dataset.md) were generated against superseded v2.0 thresholds
(bike bands 124/149cc vs canonical 110/150; bike seats=2 vs
registry 1). Their assigned_category column cannot be trusted
as-is. Recompute each row against the canonical cascade and
REPORT mismatches instead of importing them blindly. The import
input is the final merged, product-approved dataset only.

Do not silently invent year ranges or sentinel values.

Do not silently reclassify source data.

If dataset rows conflict with the canonical framework, report them.

============================================================
14. DOCUMENTATION
============================================================

If AGENTS.md or CLAUDE.md contains an eight-category list, update it to nine.

Also record, as follow-up only and NOT part of this feature:

- vehicle_class_letter hardcoded to KA;
- registration_area hardcoded to DHAKA_METRO.

Do not fix those unrelated multi-city issues in this task.

============================================================
15. TESTS
============================================================

Add/extend tests for:

- all nine categories;
- canonical registry;
- Postgres/TS/Zod consistency;
- body_type validation;
- engine_cc validation;
- premium brand matching;
- premium model matching;
- premium precedence;
- classification cascade ordering;
- auto-rickshaw;
- bike bands;
- XL;
- >2000cc;
- SUV floor;
- car_compact;
- economy;
- comfort;
- manual review;
- old registration payload compatibility;
- new registration payload;
- admin override;
- pricing lookup;
- intercity pricing;
- ETA grouping;
- dispatch candidate visibility;
- minimum-rate filtering;
- category UI metadata;
- upgrade/downgrade ordering.

Update stale test fixtures that intentionally enumerate all categories.

============================================================
16. VERIFICATION
============================================================

After each major phase:

- run TypeScript/type checking;
- run relevant Jest tests;
- inspect migration SQL;
- inspect API contracts;
- search for duplicate classifiers;
- search for eight-category hardcodes.

Before declaring completion:

1. confirm exactly nine categories;
2. confirm no duplicate classifier exists;
3. confirm server is authoritative;
4. confirm old clients are not broken;
5. confirm pricing exists for every applicable zone;
6. confirm intercity pricing;
7. confirm dispatch candidate visibility;
8. confirm admin override;
9. confirm premium allowlist;
10. confirm body-type management;
11. confirm dataset import safety if dataset exists;
12. confirm documentation;
13. run full relevant test suite;
14. run type/build checks;
15. report all failures and unresolved assumptions.

Do not claim success if verification was not actually run.

============================================================
17. SCOPE CONTROL
============================================================

Do NOT:

- redesign dispatch;
- redesign pricing architecture;
- redesign find-ride grouping;
- fix registration-area zoning;
- fix vehicle_class_letter;
- create unrelated abstractions;
- refactor unrelated modules;
- invent business rules;
- invent pricing;
- invent eligibility values;
- introduce a tenth category.

Reuse existing architecture wherever possible.

The objective is:

CORRECT + COMPLETE + COMPATIBLE + MINIMAL NECESSARY CHANGE.
```

---

# 11. FINAL IMPLEMENTATION DEFINITION OF DONE

The feature is complete only when all of the following are true:

### Architecture

* [ ] Exactly nine categories exist.
* [ ] One canonical vehicle-type registry exists.
* [ ] One authoritative classifier exists.
* [ ] No duplicated classification logic exists.

### Database

* [ ] `car_compact` added safely to Postgres enum.
* [ ] `body_type` pgEnum exists and is applied correctly.
* [ ] `engine_cc` exists as integer.
* [ ] Legacy `cc_range` has not been destructively removed.
* [ ] Premium allowlist exists.

### Registration

* [ ] New registration flow uses vehicle attributes rather than trusting driver-selected category.
* [ ] Three shipped registration paths are handled.
* [ ] Old clients remain compatible during rollout.
* [ ] Server remains authoritative.
* [ ] Admin override remains authoritative.
* [ ] Manual-review outcome does not become a tenth ride category.

### Pricing / Dispatch

* [ ] `car_compact` pricing exists for every applicable zone.
* [ ] Intercity pricing is configured.
* [ ] Estimate works.
* [ ] Request works.
* [ ] Schedule/completion pricing works where applicable.
* [ ] Dispatch sees `car_compact`.
* [ ] Missing pricing cannot silently starve drivers.

### Propagation

* [ ] Home category metadata updated.
* [ ] Find-ride compact category works.
* [ ] Existing `car_xl` grouping remains unchanged.
* [ ] Call ledger updated.
* [ ] Upgrade/downgrade ordering updated.
* [ ] Package/incentive consumers verified.
* [ ] ETA behavior verified.
* [ ] Tests/fixtures updated.

### Administration

* [ ] Premium allowlist CRUD works.
* [ ] Body type is administrable.
* [ ] Existing vehicle-type administration remains registry-driven.
* [ ] Existing admin authorization is preserved.

### Data

* [ ] Final dataset is imported only when available.
* [ ] Import is deterministic.
* [ ] Duplicate handling is reliable despite nullable year fields.
* [ ] No source classifications are silently changed.

### Verification

* [ ] Type check passes.
* [ ] Relevant Jest suite passes.
* [ ] Migration verified.
* [ ] Repository-wide category search completed.
* [ ] No unintended eight-category assumptions remain.
* [ ] No unrelated feature was modified.
* [ ] Any unresolved product input is explicitly reported.
* [ ] Release is not declared ready until schema + pricing + dispatch + registration compatibility are verified together.

**Final recommendation:** use **GLM-5.3 for the core implementation**, not because every individual edit requires it, but because the dangerous part is the interaction between enum migration, registration compatibility, classification precedence, pricing, and dispatch. Then use **MiMo 2.5 Pro for the independent implementation audit**. Reserve a second GLM-5.3 pass only for substantive audit findings. This preserves the orchestration principle of using the strongest model where a wrong first implementation would create expensive downstream repair.

---

# 12. UI/UX IMPLEMENTATION SPEC (from Kimi, reconciled 2026-08-22)

**Status:** Authoritative UI spec for this feature. Source: Kimi's UI/UX deliverable (2026-08-22), reconciled against this plan and the repository.
**Precedence:** §12 governs all **screen/UI work**. Phases 1–2 and the §10 prompt govern all **backend/database/classifier/pricing** work. Kimi's original backend wiring (its §4 — v2.0 EV branch, `vehicle_model_overrides` table, invented pricing SQL against a nonexistent `pricing_tiers` table, varchar `body_type`, removal of the legacy `vehicle_type` contract, classifier in a new DB-importing lib file) is **rejected** — see §12.6.

## 12.0 Locked UI decisions

| # | Decision | Rule |
|---|---|---|
| U1 | Theming | Pattern A: `useIsDark()` from `lib/useAppearance.ts` + inline `colors.*` ternaries. **No `dark:` classes.** (Verified repo-wide practice.) |
| U2 | Icons | Ionicons ONLY. No emoji in production UI (use `checkmark`, `time`, `close` — never ✓/⏳/✕ characters). |
| U3 | Fonts | Plus Jakarta Sans ONLY. |
| U4 | Touch targets | Driver screens: minimum 56dp rows/buttons. |
| U5 | Naming | Enum key `car_compact` everywhere in code. Rider-facing label **"Mini Car" / "মিনি কার"** — never "Compact Car". **Pending product (Zia) sign-off** per Phase 0 gate. |

## 12.1 Deliverable 1 — `car_compact` presentation metadata (rider-facing)

### Registry entry (maps onto the existing `VehicleTypeDefinition` shape in `lib/vehicleTypes.ts`)

| Field | Value |
|---|---|
| `key` | `car_compact` |
| `display_en` | **"Car Compact"** (Zia decision 2026-08-23 — supersedes the "Mini Car" candidate) |
| `display_bn` | **"কার কম্প্যাক্ট"** |
| `subtitle_en` | "Affordable enclosed ride" |
| `subtitle_bn` | "সাশ্রয়ী মূল্যে বদ্ধ রাইড" |
| `category` | `"car"` (Car hub group) |
| `icon` (home) | `car` — same Ionicon as other Car sub-types |
| `cc_range` | `null` or a car-band literal if the union is extended — presentation only |
| `seats`, `has_ac` | Display metadata — "Mini Car" positioning: 3–4 passengers, AC not guaranteed |
| `driver_req`, `min_age_years`, `max_age_years` | **REMAIN PHASE 0 GATED** — `REQUIRES PRODUCT INPUT`; do not take eligibility values from a UI spec |

Copy rationale: "Mini" signals smaller-than-economy without low-quality connotation; subtitle sells the enclosure benefit (monsoon/heat) at budget price. Avoid "cheap"/"basic"/"small" in labels.

### Sort position

Tier order: `bike_basic → bike_standard → bike_plus → cng →` **`car_compact`** `→ car_economy → car_comfort → car_premium → car_xl`. All display iterations (home cards, find-ride sections, estimates) maintain this sequence.

### Screen integration

- **Services Hub** (`services-hub.tsx`): **no change** — 2×2 grid shows groups; `car_compact` lives inside the "Car" tile. Do NOT add a 5th tile.
- **Home vehicle cards** (`(tabs)/home/index.tsx`): add `car_compact: "car"` to the `VEHICLE_ICONS` record (fixes the compile break); card renders Mini Car between CNG group and Economy within the Car bottom-sheet.
- **Find-ride** (`find-ride/index.tsx`): `car_compact` auto-buckets into the "Car" group via the `car_` prefix. Add a `car_compact` entry to `VEHICLE_ICONS`: new image asset `assets/images/vehicles/car_compact.png` (small-hatchback side-profile silhouette, monochrome `primary` #0A9B4C on transparent, matching existing line-art style); fallback = Ionicons `car`, `primary`, 48dp. **Do NOT redesign the 3-group structure.**
- **Confirm-ride / ride tracking**: vehicle name from the registry; icon `car`; no special badge; `FareBreakdownSheet` unchanged.

## 12.2 Deliverable 2 — Driver registration form additions

### Scope

| Screen | Change |
|---|---|
| `app/(main)/(rider)/onboarding/index.tsx` | Modify Vehicle step: add Body Type + Engine CC, remove type selector, add info card + outcome modal |
| `app/(main)/(rider)/add-vehicle/index.tsx` | Same form changes |
| `app/(main)/(rider)/vehicle-management/index.tsx` | Classification status badges on cards |

### Field order (replaces the removed type selector)

1. **Body Type** (NEW — first; frames the mental model)
2. Brand → 3. Model → 4. Year (existing cluster)
5. **Engine CC** (NEW)
6. Registered Seats (existing)
7. Registration No. (existing)
8. Auto-classification info card (occupies the removed selector's space — `infoLight` bg, `info` border 12px radius, Ionicons `information-circle`, always visible, bilingual copy: "We'll classify your vehicle automatically based on engine size, body type, and seats." / "ইঞ্জিনের আয়তন, বডি টাইপ এবং আসন সংখ্যার ভিত্তিতে আমরা স্বয়ংক্রিয়ভাবে শ্রেণীবদ্ধ করব।")

### Body-type picker

- Trigger: 56dp form row, label left, selected value + chevron right, `surfaceBg`, 1px `borderColor`, 12px radius.
- Sheet: header "Select Body Type" / "বডি টাইপ নির্বাচন করুন"; 56dp radio rows (`ellipse-outline` / `checkmark-circle`), EN label + BN sub-label, selected row tinted `primaryLight`.
- All 11 values visible, **grouped** for scannability (Two-Wheelers: motorcycle মোটরসাইকেল, scooter স্কুটার; Three-Wheelers: auto_rickshaw সিএনজি অটোরিকশা; Cars: hatchback হ্যাচব্যাক, sedan সেডান, crossover ক্রসওভার, suv এসইউভি; Large: suv_large বড় এসইউভি, mpv এমপিভি, van ভ্যান, minibus মিনিবাস). **No pre-filtering** — the system classifies from these inputs; filtering would create a chicken-and-egg problem. Values map to the `vehicle_body_type` pgEnum from Phase 1 (not a free-form varchar).
- `BODY_TYPES` display constant (bilingual labels + groups) lives beside the canonical registry.

### Engine CC field

- Label "Engine CC (BRTA Recorded)" / "ইঞ্জিন সিসি (বিআরটিএ রেকর্ড)"; placeholder "e.g., 996" / "যেমন: ৯৯৬"; `keyboardType="numeric"`, `maxLength={5}`; helper "From your BRTA registration document" / "আপনার বিআরটিএ রেজিস্ট্রেশন ডকুমেন্ট থেকে"; 56dp, focus = 2px `primary` border; error = 2px `danger` border + caption.

### Validation error copy (EN / BN)

| Field | Condition | Copy |
|---|---|---|
| Body Type | empty | "Please select a body type" / "বডি টাইপ নির্বাচন করুন" |
| Engine CC | empty | "Engine CC is required" / "ইঞ্জিন সিসি প্রয়োজন" |
| Engine CC | non-numeric | "Enter numbers only" / "শুধু সংখ্যা লিখুন" |
| Engine CC | ≤ 0 | "Engine CC must be greater than 0" / "ইঞ্জিন সিসি শূন্যের চেয়ে বড় হতে হবে" |
| Engine CC | > 99999 | "Engine CC seems too high" / "ইঞ্জিন সিসি অনেক বেশি মনে হচ্ছে" |
| Seats | empty | "Seat count is required" / "আসন সংখ্যা প্রয়োজন" |
| Seats | ≤ 0 | "Must have at least 1 seat" / "কমপক্ষে ১টি আসন থাকতে হবে" |
| Seats | > 50 | "Please check seat count" / "আসন সংখ্যা পরীক্ষা করুন" |

Error pattern: `danger` border + caption 12px with `alert-circle` icon inline.

### 12.2.6 Vehicle-management badges (derived — no new column)

Card shows category pill + status pill: **Classified** (`primaryLight`/`primary`, `checkmark-circle`) / **Pending Review** (`infoLight`/`info`, `time`, "পর্যালোচনাধীন") / **Adjusted** (amber, `create`, "সমন্বয়কৃত"). Per Phase 2-F: badge state is **derived** (driver approval status + `vehicle_type_changes` history); the GET handler may return the derived value. If derivation proves insufficient at implementation time, STOP and report — do not add a `classification_status` column silently. Selector removal applies to **new** registrations only; existing vehicles keep their read-only category badge.

## 12.3 Deliverable 3 — Post-submit classification outcome states

**Contract (matches Phase 2-D):** single `POST /api/driver/vehicles`; response carries `classification: { outcome: "classified", suggested_vehicle_type } | { outcome: "manual_review" }`. Never navigate away before the result is shown; outcome renders as a same-screen modal.

### State machine

`FORM_FILLING → LOADING (POST) → CLASSIFIED_SUCCESS | MANUAL_REVIEW_SUCCESS | ERROR_RETRY`; Retry re-POSTs the preserved payload; Back returns to the intact form (state never cleared on failure).

### States

- **Loading:** overlay 80% `bg`; 3 pulsing dots `primary`; "Classifying your vehicle…" / "আপনার গাড়ি শ্রেণীবদ্ধ করা হচ্ছে…"; "Please wait a moment" / "অনুগ্রহ করে অপেক্ষা করুন"; no cancel.
- **Classified success:** modal (`surfaceBg`, 16px radius, 24dp pad, 90% width max 400dp); 80dp `primary` circle + `checkmark`; title "Vehicle Classified" / "গাড়ির শ্রেণী নির্ধারিত"; "Your {brand} {model} has been classified as" / "আপনার {brand} {model} শ্রেণীবদ্ধ করা হয়েছে"; result card (`primaryLight`, category name from registry via `suggested_vehicle_type`); explanation "An admin may review and adjust this during document verification." / "ডকুমেন্ট যাচাইকালে এডমিন এটি পর্যালোচনা করে পরিবর্তন করতে পারেন।"; CTA "Continue" / "এগিয়ে যান" (56dp, `primary`).
- **Manual-review success (a SUCCESS state — `info` blue, never `danger`/`amber`):** 80dp `info` circle + `time` icon; title "Submitted for Review" / "পর্যালোচনার জন্য জমা দেওয়া হয়েছে"; "Your vehicle details have been submitted successfully." / "আপনার গাড়ির বিবরণ সফলভাবে জমা দেওয়া হয়েছে।"; "Our team will review and classify it within 1–2 business days." / "আমাদের টিম ১-২ কার্যদিবসের মধ্যে এটি পর্যালোচনা করে শ্রেণীবদ্ধ করবে।"; same CTA. **⚠ "1–2 business days" is an operational SLA claim — confirm the team can honor it, else soften before ship.**
- **Error/retry:** 80dp `danger` circle + `close`; title "Could Not Classify" / "শ্রেণীবদ্ধ করা যায়নি"; "Please check your internet connection and try again." / "আপনার ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।"; primary "Retry" / "আবার চেষ্টা করুন" + secondary "Back to Form" / "ফর্মে ফিরে যান"; form data preserved.

### Navigation after Continue

Onboarding → next step; Add Vehicle → vehicle-management.

## 12.4 UI conflict flags (binding)

1. Never show "Compact Car" to riders — enum key `car_compact`, label "Mini Car".
2. No 5th Services-Hub tile; no find-ride grouping redesign.
3. Type-selector removal applies to new registrations only; vehicle-management keeps read-only category display.
4. Pattern A theming only — post-code verification: `grep -rn 'dark:' app/(main)/(rider)/` returns 0 matches.
5. No emoji in outcome states — Ionicons only.
6. Driver touch targets ≥ 56dp.
7. Form data preserved across errors/retries.

## 12.5 Screen-by-screen summary (UI work only)

| Screen | Changes |
|---|---|
| Services Hub | None |
| Home | `car_compact` icon-map entry + registry-driven card in Car group |
| Find-ride | `car_compact` icon entry + new image asset; no grouping change |
| Confirm-ride / tracking | Registry-driven; no changes |
| Onboarding (vehicle step) | Body Type + Engine CC fields, selector removed, info card, outcome modal |
| Add-vehicle | Same as onboarding + post-continue navigation |
| Vehicle-management | Derived classification badges; empty-state per §12.2.6 |

Backend rows from Kimi's summary (API route, classification utility, migration, schema, constants) are **not** governed by this table — they follow Phases 1–2 and the §10 prompt.

## 12.6 Rejected from Kimi's response (do not implement)

| Rejected item | Reason |
|---|---|
| v2.0 cascade (EV branch, wheel/fuel inputs, SUV bump ≥1500, bike bands 124/149) | Superseded by canonical framework v1 — see §3 |
| `vehicle_model_overrides` table + seed rows (Axio→Comfort, Pajero Mini) | Only the premium allowlist was adopted; Axio is `car_economy` per canonical §2 |
| `pricing_tiers` seed SQL (4000/1800/5000 paisa) | Invented rates (Phase 0 violation) + table doesn't exist (`pricing` is keyed `(zone_id, vehicle_type)`) |
| `body_type varchar(20)` | Phase 1 mandates a constrained `vehicle_body_type` pgEnum |
| `classification_status` column | Phase 2-F: derived badges; no new vehicle-level status schema |
| Removing `vehicle_type` from the API with no legacy path | Breaks shipped clients — Phase 2-D compatibility mandate |
| `lib/vehicleClassification.ts` (new, DB-importing) | One authoritative pure classifier in `lib/vehicleTypes.ts` with server-resolved `premium_match` (amendment #1) |
| `timestamp` (non-tz) columns, missing `updated_at` | Repo conventions: UTC `timestamptz`, `created_at`/`updated_at` |

## 12.7 Open items

1. ~~Zia sign-off: naming~~ **DECIDED 2026-08-23: "Car Compact" / "কার কম্প্যাক্ট"** (see amendment 11; code must flip from the interim "Mini Car" strings).
2. ~~SLA confirmation~~ **DECIDED 2026-08-23: soften** — remove "1–2 business days" from the manual-review success modal.
3. **Asset production:** `assets/images/vehicles/car_compact.png` per §12.1 spec (design task, not coding-agent task).
4. **AGENTS.md/CLAUDE.md staleness:** AGENTS.md claims dark mode uses NativeWind `dark:` variants with no theme context — the code actually uses Pattern A (`useIsDark()` from `lib/useAppearance.ts` + inline ternaries). Fix the doc separately (it misleads coding agents); do not bundle into this feature.

## 13.6 Approved pricing basis — car_compact interpolation (pending Zia's number review)

Midpoints of the BD_DEFAULTS CNG and car_economy rows (`scripts/zone-seed-pricing.ts:86-120`), integer paisa:

| Field | CNG | car_economy | **car_compact (proposed)** |
|---|---|---|---|
| base_fare_bdt | 4000 | 4500 | **4250** |
| per_km_bdt | 1500 | 1500 | **1500** ⚠ identical to both neighbors |
| intercity_per_km_bdt | 2250 | 2250 | **2250** ⚠ identical |
| per_min_bdt | 200 | 350 | **275** |
| floor_length_km | 3.00 | 4.00 | **3.50** |
| floor_min | 15 | 20 | **18** |
| platform_commission_percent | 15.00 | 15.00 | **15.00** |
| free_wait_minutes | 3 | 3 | **3** |
| wait_fee_per_minute_bdt | 200 | 200 | **200** |

⚠ **Flag for review:** CNG and car_economy already share identical per-km (1500) and intercity (2250) rates, so interpolation makes compact indistinguishable from both on distance — differentiation comes only from base fare, per-minute, and floor. If the intent is a visible distance-price gap, per_km needs a manual value (e.g. 1550–1600); the mechanical midpoint cannot create one. Do not seed until Zia reviews this table.

---

# 13. MASTER VEHICLE-MODEL DATASET — FORMAT, MERGE POLICY, "OTHER" FLOW (added 2026-08-22)

Sources: the five per-model dataset files in this folder (ChatGPT ~173 rows, DeepSeek ~169, Gemini ~245 across 5 parts, GLM5.3 141, Kimi 732). Estimated merged universe: ~350–450 unique rows after normalization.

## 13.1 Master format (interchange + import target)

One JSON file — `docs/FeatureList/New Feature Plan/Vehicle Categorization/vehicle-models.master.json` — an array of objects mapping 1:1 onto `vehicle_models` insert shape plus `_`-prefixed governance metadata the importer strips/logs (never inserts):

```json
{
  "brand": "Toyota",
  "model": "Vitz 1.0",
  "year_start": 1999,
  "year_end": 2020,
  "body_type": "hatchback",
  "typical_cc_min": 996,
  "typical_cc_max": 996,
  "passenger_seats": 5,
  "has_ac": true,
  "default_vehicle_type": "car_compact",
  "_confidence": "verified",
  "_sources": ["chatgpt", "deepseek", "gemini", "glm5.3", "kimi"],
  "_dispute": null,
  "_notes": "split from Vitz 1.3"
}
```

Field rules:
- `year_end`: `null` = still in production (never the string "still in production"; never sentinel years).
- `body_type`: exactly one of the 11 `vehicle_body_type` pgEnum values — normalize source prose ("3-wheel auto-rickshaw" → `auto_rickshaw`; "kei hatchback"/"tall wagon" → `hatchback`; "station wagon" → `sedan`… wagon is NOT in the enum; see 13.2).
- `has_ac`: `true` | `false` | `null` ("varies" → `null`).
- `passenger_seats`: **BRTA registered seats including driver** — bikes 2, CNG 3, kei/micro 4, standard cars 5, vans/MPV 7–10. (The rider-facing "seats" display comes from the VEHICLE_TYPES registry, NOT from this column; do not "fix" bikes to 1 here.)
- `default_vehicle_type`: recomputed against the canonical cascade (13.2) — never copied from a source's `assigned_category` without recompute.
- `_confidence`: `verified` (≥2 sources, recompute agrees) | `single_source` (one source, recompute agrees) | `guessed` (source flagged uncertainty).
- Import rule: `guessed` AND single-source rows import with `is_active=false` (invisible to driver dropdowns until an admin activates); everything else `is_active=true`, `source='admin'`.
- Dedup key: `(lower(brand), lower(model), year_start, year_end)` — matches the DB unique index; the importer pre-selects on this key (NULL year_end never matches via ON CONFLICT — per Phase 4 warning).

## 13.2 Normalization + merge rules (binding on the curation pass)

1. **Brand normalization:** "Maruti Suzuki" → "Suzuki" (model suffixes already disambiguate Indian vs JDM, e.g. "Wagon R (JDM 660cc)"); "Hero Honda" → "Hero"; case/title-case unify. Rebadged brands keep their BD-sold badge name.
2. **Model normalization:** keep engine/seat suffixes that change category ("Vitz 1.0" vs "Vitz 1.3", "Prado 5-seat" vs "Prado 7-seat", "Wagon R (JDM 660cc)" vs "Wagon R (Indian)"); collapse synonym rows ("Vezel / HR-V" → "Vezel" — BD market name; "Escudo/Vitara" → "Vitara"; "HR-V 1.8" merges into "Vezel 1.8"? NO — keep the split-row convention: one row per category-changing variant). ≤100 chars.
3. **Body-type mapping to the 11-value enum:** motorcycle, scooter, auto_rickshaw (any 3-wheeler), hatchback (incl. kei, "tall wagon", microvan-kei like Suzuki Every), sedan (incl. station wagons — Fielder/Probox: no wagon value exists; sedan is the registered class), crossover, suv, suv_large (Prado/LC/Fortuner/Pajero/Endeavour class), mpv (Noah/Voxy/Serena/Sienta/Alphard/Xpander/Ertiga), van (HiAce/H-1/Starex/APV/NV200), minibus (Coaster/Staria-11-seat/Rosa).
4. **Category = recompute, always.** Inputs: body_type, cc_mid = round((min+max)/2) (single-value rows: that value), passenger_seats; premium allowlist = canonical §3 (brand-wide: Mercedes-Benz, BMW, Audi, Lexus, Volvo, Land Rover, Jaguar, Porsche; brand+model: Toyota Premio/Allion/Camry/Crown/Harrier/Land Cruiser 5-seat/Prado 5-seat, Honda Accord). Cascade exactly per canonical rule table 1–12.
5. **Boundary cc:** band by cc_max when a single variant (149.5→150→bike_standard; 109.7→110→bike_basic). Rows whose cc range SPANS a category boundary (Hero Passion Pro 97–113) → split into two rows when engines genuinely differed, else keep one row banded by cc_max with `_dispute` noted.
6. **Known disputed cases — decide explicitly, never silently:**
   - 996–1000cc crossovers (Toyota Raize, Daihatsu Rocky, Hyundai Kona 998, MG ZS 999): canonical SUV floor needs ≥1001 → literal recompute = `car_compact`. Default: follow canonical (car_compact), `_dispute` noted for Zia. Do NOT bump to comfort on your own authority.
   - EVs (BYD Atto 3, Nissan Leaf, Mahindra Treo, Easy Bike): cc=0/null — no canonical rule. Keep rows with product-intent `default_vehicle_type` (Atto 3 → car_comfort, Leaf → car_compact per market size) and `_dispute: "EV — no canonical rule; pre-made admin decision via default_vehicle_type"`. Runtime flow already handles this: model lookup → cc absent → classifier manual_review → falls back to model default.
   - Suzuki Every (kei microvan, 4 seats): fails XL (seats<6) → `car_compact` by cc. Keep canonical, note.
   - 5-seat vs 7-seat SUVs (Prado, Land Cruiser): keep split rows; 5-seat → premium (allowlist), 7-seat → XL.
7. **Never invent rows.** Never drop BD-local brands (Runner, Walton, Roadmaster, H Power) — they may be single-source/guessed; import per the is_active rule. Never resolve a real disagreement by picking a side quietly — record it in `_dispute` and the dispute report.

## 13.3 "Other" (manual entry) flow — repository mapping

The desired flow (driver picks Other → enters brand/model/year manually → admin decides category → driver notified → re-registers and finds vehicle in dropdown) maps onto existing mechanisms:

- EXISTS: driver "Others" path in `add-vehicle` (`OTHERS = "__others__"`); unknown brand/model creates a draft `vehicle_models` row (`source='driver'`, `is_active=false`, `created_by=driver`) and persists the vehicle with a proposed type; admin approval with `vehicle_type_adjusted` override; admin vehicle-models screen can edit/activate model rows.
- GAP 1 (admin queue visibility): add a "Pending driver submissions" filter (source='driver' AND is_active=false) to `app/admin/vehicle-models.tsx` + its API, so admins see exactly what needs a category decision (set default_vehicle_type + body_type + cc + activate).
- GAP 2 (driver notification): when an admin activates a driver-submitted model row, notify the submitting driver (`created_by`) via the existing notifications mechanism to re-enter their vehicle details and select it from the dropdown. Notification copy EN+BN; the driver's existing vehicle row keeps operating under its current (admin-adjusted) type until they re-register.

These two gaps are small admin-panel additions; they belong to Phase 4 (admin tooling), not the dataset task.

## 13.4 Curation execution

The merge/curation itself is delegated to a dedicated model pass using the prompt in `14 MASTER DATASET CURATION PROMPT.md` (or run inline) — its output (master JSON + dispute report) comes back here for Zia's review of the `_dispute` rows before the Phase 4 importer runs.

## 13.5 JSON is a one-time import artifact — the DB is the runtime catalog

`vehicle-models.master.json` is NOT the runtime data store and is never read by the app. The runtime source of truth is the `vehicle_models` Postgres table, served to the driver dropdown via the existing `GET /api/driver/vehicle-models`. Consequences:

* **Adding a vehicle later never requires an app update.** Paths: (1) admin adds/edits through the existing admin vehicle-models screen — live on next dropdown fetch; (2) driver "Other" flow (§13.3) — draft row → admin activation → driver notified to re-register; (3) bulk re-curation — update the JSON and re-run the importer (operator convenience only; never required for one-offs).
* **The DB may legitimately drift from the JSON** (driver-submitted + admin-added rows won't exist in the file). That is correct behavior — the DB is the truth. The importer must therefore be re-run only deliberately, with awareness that it operates alongside rows added since; it must never delete or deactivate rows absent from the JSON. Mark the JSON header as "point-in-time import snapshot — not a maintained mirror". 
