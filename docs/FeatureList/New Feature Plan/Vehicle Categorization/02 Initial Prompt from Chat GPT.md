I read **`IMPLEMENTATION-PLAN-Prompt-D-FINALIZED.md` first**, then applied the orchestration rules in **`Pasted text.txt`** to it. The important consequence is that I would **not** simply hand Prompt D to Claude Code unchanged.

Prompt D is materially correct as an implementation baseline, but this is a **high-risk data/business-rule change**: it changes the vehicle-type enum, vehicle registration semantics, classification logic, pricing availability, and matching eligibility. Under your orchestration rules, that warrants a stronger implementation model and independent verification.

The repository context also confirms the stack is Expo/React Native/TypeScript + Supabase/Postgres/Drizzle + API routes + custom dispatch server. 

## 1. PLAN ASSESSMENT

**Prompt D should be accepted as the implementation specification, with one orchestration adjustment: split execution into controlled units rather than one giant coding-agent call.**

Its sequencing is sound:

> Schema → classification/registration → pricing → category consumers/UI → admin → dataset.

The particularly important point is its explicit warning that `car_compact` pricing is a **launch blocker**, because the request and dispatch paths currently fail when pricing is absent. 

The repository audit supports the need for repository-aware implementation rather than blindly following file paths. For example, the audit establishes that the current code has hardcoded category assumptions and that actual repository paths/statuses must be rechecked before editing. 

### One change I would make to Prompt D

**Do not let the coding agent make the `cc_range` decision casually.**

Prompt D says:

> either repurpose it as a typed integer or add `engine_cc` alongside it and deprecate `cc_range`.

That is a consequential schema decision. The implementation agent should inspect all historical migrations, queries, serialization, admin forms, and API consumers and choose the safer option. It should **not blindly execute whichever alternative it prefers**.

Similarly, the classification function must not duplicate premium-brand logic in multiple places. There needs to be **one authoritative classifier**.

---

# 2. IMPLEMENTATION PHASES

| Phase | Scope                                            | Recommended model                                  | Risk      | Execution               |
| ----- | ------------------------------------------------ | -------------------------------------------------- | --------- | ----------------------- |
| **A** | Schema + migrations + canonical types            | **GLM-5.3**                                        | Very High | First                   |
| **B** | Classification engine + registration integration | **GLM-5.3**                                        | Very High | Second                  |
| **C** | Pricing + category propagation + UI hardcodes    | **GLM-5.2**                                        | High      | Third                   |
| **D** | Admin tooling + vehicle-model data               | **GLM-5.2**                                        | Medium    | Fourth                  |
| **E** | Dataset import/seed                              | **DeepSeek V4 Flash** or GLM-5.2                   | Medium    | After dataset finalized |
| **F** | Independent implementation audit                 | **MiMo 2.5 Pro**                                   | High      | After A–E               |
| **G** | Final code skeptic / repair                      | **GLM-5.3 only if audit finds substantive issues** | Very High | Last                    |

This follows your orchestration rule of reserving GLM-5.3 for work where a stronger first pass can prevent multiple repair cycles. 

I would **not** spend Terra/Claude/Gemini/Qwen on planning this particular implementation yet. Prompt D already contains a reasonably mature implementation plan and the repository audit is available. The high-value use of those models would be an independent architectural review **only if the GLM implementation exposes an unresolved architectural question**.

---

# 3. IMPORTANT EXECUTION RULE

The coding agent must treat the repository as authoritative for **implementation reality**, but Prompt D as authoritative for **product requirements**.

That distinction matters because the orchestration prompt explicitly requires repository inspection before changing code and prohibits blindly creating files merely because a plan names them. 

Therefore every implementation prompt below starts with:

1. inspect;
2. trace;
3. compare;
4. identify conflicts;
5. only then modify.

---

# 4. PROMPT A — SCHEMA + CLASSIFICATION FOUNDATION

**Model: GLM-5.3**

This is the most important implementation prompt. I would give this to GLM-5.3 rather than Claude Code because the task combines schema migration, data semantics and business classification.

# VEHICLE CATEGORIZATION — FOUNDATION IMPLEMENTATION

## MODEL ROLE

You are the primary high-end implementation agent.

Implement the vehicle categorization foundation described below directly in the existing Ride repository.

This is NOT a greenfield implementation.

Repository reality must be inspected first and existing architecture must be reused wherever appropriate.

Do not blindly trust file paths or line numbers in the supplied implementation plan. They were captured during an earlier audit and may have shifted.

---

# 1. OBJECTIVE

Implement the foundational database schema and authoritative vehicle-classification infrastructure required to support the Ride vehicle categorization framework.

The immediate objective is:

1. Add `car_compact` as the ninth vehicle category.
2. Add authoritative vehicle body type data.
3. Add authoritative engine displacement data.
4. Add premium-brand/model allowlist storage.
5. Implement one authoritative vehicle classification function.
6. Prepare the registration flow to consume the classifier.

Do NOT implement unrelated UI polish or unrelated multi-city fixes.

---

# 2. PRODUCT CATEGORIES

The platform has exactly these nine vehicle categories:

* bike_basic
* bike_standard
* bike_plus
* cng
* car_compact
* car_economy
* car_comfort
* car_premium
* car_xl

Do not invent additional ride categories.

`car_compact` must become a first-class category everywhere the existing vehicle-type system is authoritative.

---

# 3. MANDATORY REPOSITORY INSPECTION

Before editing anything:

## Inspect

* `src/db/schema.ts`
* all existing database migrations
* `lib/vehicleTypes.ts`
* `store/useRiderStore.ts`
* `app/api/driver/vehicles+api.ts`
* `app/api/admin/driver/approve+api.ts`
* vehicle-model related APIs
* vehicle registration screens
* vehicle-related stores/types
* all references to:

  * `vehicle_type`
  * `vehicle_models`
  * `vehicles`
  * `cc_range`
  * `passenger_seats`
  * `vehicle_type_adjusted`
  * `vehicle_class_letter`
  * `registration_area`

Also inspect package scripts and the project's existing migration generation/application conventions.

Search the entire repository rather than relying only on the files listed above.

---

# 4. SCHEMA REQUIREMENTS

## 4.1 Add car_compact

Add:

`car_compact`

to the shared Postgres `vehicle_type` enum.

Because this is a shared enum, verify every current column using that enum before migration.

Update the TypeScript representation and registry in lockstep.

Eliminate the inline duplicate vehicle-type definition in `store/useRiderStore.ts` if repository inspection confirms that it duplicates the canonical type.

There must be one canonical TypeScript source of truth.

---

## 4.2 body_type

Add `body_type` to:

* `vehicles`
* `vehicle_models`

Allowed values:

* motorcycle
* scooter
* auto_rickshaw
* hatchback
* sedan
* crossover
* suv
* suv_large
* mpv
* van
* minibus

Use the repository's established enum/schema conventions.

The business requirement is that body type is based on registered vehicle information, not an unverified driver classification.

Do not silently convert this into free-form text if the existing schema conventions support a constrained enum.

---

## 4.3 Engine displacement

The classifier requires integer engine displacement in CC.

Inspect every existing use of `cc_range`.

Do NOT choose between:

* repurposing `cc_range`
* adding `engine_cc`

without tracing all historical/current consumers.

Choose the schema design that preserves compatibility and produces a clean authoritative integer field.

If `cc_range` is genuinely dead and can safely be migrated/deprecated, document and implement that safely.

If there is meaningful existing compatibility risk, retain `cc_range` and add `engine_cc`.

Never silently destroy existing data.

---

## 4.4 Premium allowlist

Create the smallest appropriate persistent schema for premium classification.

The planned shape is:

`vehicle_premium_allowlist`

with:

* `brand`
* nullable `model`
* `is_active`

Semantics:

* `model IS NULL` = entire brand is premium
* non-null `model` = specific model is premium

The classifier must be able to distinguish brand-level and model-level rules.

Do not put this logic into `platform_config` unless repository evidence shows that this is materially safer than the planned table.

---

# 5. AUTHORITATIVE CLASSIFIER

Implement the classification cascade in the canonical location:

`lib/vehicleTypes.ts`

or the repository's clearly superior existing equivalent if inspection proves that another location is the established domain boundary.

There must be ONE authoritative classification implementation.

It must accept:

* brand
* model
* body_type
* engine_cc
* registered passenger seats

and evaluate the rules in this order:

1. auto-rickshaw
2. motorcycle/scooter bike bands
3. XL based on seats + body
4. premium allowlist
5. engine CC > 2000
6. SUV floor
7. compact/economy/comfort CC bands
8. manual-review fallback

Do not reorder these rules without identifying a direct contradiction in the canonical framework.

Do not duplicate these rules in registration, admin, frontend, dispatch, or API code.

Those consumers should call the authoritative classifier.

---

# 6. MANUAL REVIEW

The classifier must distinguish a confidently classified vehicle from one requiring manual review.

Do not invent a new ride category for manual review.

Manual review is a classification state/workflow, not a tenth vehicle category.

Use the repository's existing patterns for representing review/verification state where available.

If no appropriate state exists, stop and report the ambiguity rather than inventing a new product state without evidence.

---

# 7. REGISTRATION INTEGRATION

Inspect the current driver vehicle registration flow.

The existing system allows the driver to select a vehicle type directly.

Replace that architecture with:

Driver provides:

* brand
* model
* engine CC
* registered seats
* body type where the existing registration workflow requires it

Then:

1. look up a known vehicle model where appropriate;
2. obtain authoritative vehicle attributes;
3. run the classification cascade;
4. return the suggested category;
5. allow the driver to confirm the suggestion where the product flow requires confirmation;
6. persist the resulting category;
7. retain existing admin override capability.

Do not remove the existing admin override mechanism.

---

# 8. EXISTING ADMIN OVERRIDE

Preserve the existing `vehicle_type_adjusted` / admin override path.

The automatic classifier proposes or determines the initial category.

Admin override remains authoritative after review.

Do not create a second override system.

---

# 9. DATA INTEGRITY

The implementation must prevent:

* invalid vehicle categories;
* impossible body types;
* non-integer engine displacement;
* silent omission of `car_compact`;
* inconsistent TypeScript/Postgres category lists;
* duplicate classification logic;
* driver-controlled premium classification.

Validate inputs at the server boundary.

Do not trust client-supplied classification results.

---

# 10. TESTS

Add focused automated tests for:

* all nine categories being recognized;
* category enum/schema consistency;
* body type validation;
* engine CC validation;
* premium brand matching;
* premium model matching;
* brand/model precedence;
* rule cascade precedence;
* auto-rickshaw classification;
* bike bands;
* XL conditions;
* > 2000cc condition;
* SUV floor;
* compact/economy/comfort bands;
* manual-review fallback;
* regression against existing categories.

Test rule ordering explicitly.

A vehicle matching an earlier rule must not fall through to a later category.

---

# 11. OUT OF SCOPE

Do NOT implement in this task:

* pricing rows
* ETA seed changes
* category icons
* customer vehicle-selection UI
* admin premium-allowlist UI
* bulk vehicle dataset import
* unrelated registration-area fixes
* `vehicle_class_letter` correction
* multi-city zoning work

Those are later implementation units.

---

# 12. VERIFICATION

Before declaring completion:

1. Run TypeScript/type checking using the repository's actual command.
2. Run relevant tests.
3. Verify migration generation.
4. Verify migration applies cleanly against the configured schema environment where available.
5. Search repository-wide for duplicated vehicle-type lists.
6. Search repository-wide for classification logic.
7. Confirm `car_compact` exists in every authoritative category representation.
8. Confirm no client-only classification is trusted by the server.
9. Confirm existing admin override behavior remains intact.

Report:

* files changed
* migrations created
* tests added
* commands executed
* failures
* unresolved ambiguities

Do not claim success if verification was not actually run.

---

# 13. AMBIGUITY RULE

If repository evidence materially conflicts with the product requirements, do not silently choose.

For consequential conflicts:

* identify the conflict;
* explain the repository evidence;
* explain the product requirement;
* choose only if the safer implementation is unambiguous;
* otherwise stop before destructive changes and report the ambiguity.

Do not invent business rules.

# DONE CONDITION

This task is complete only when the database/type foundation and authoritative classification engine are implemented, integrated into server-side vehicle registration, tested, and verified.

---

# 5. PROMPT B — PRICING + CATEGORY PROPAGATION

**Model: GLM-5.2**

Once Prompt A is complete and verified, move to this.

The reason for keeping it separate is important: it prevents a coding agent from mixing schema/classification debugging with a broad UI propagation sweep.

# VEHICLE CATEGORIZATION — CATEGORY PROPAGATION + PRICING

## OBJECTIVE

Complete propagation of the ninth vehicle category, `car_compact`, through the Ride system and make it operational for real ride requests.

The previous foundation task implemented the schema and authoritative classifier.

Inspect the resulting repository before editing.

---

# 1. REQUIRED CATEGORY SET

The authoritative categories are:

* bike_basic
* bike_standard
* bike_plus
* cng
* car_compact
* car_economy
* car_comfort
* car_premium
* car_xl

No tenth category may be introduced.

---

# 2. REPOSITORY INSPECTION

Search repository-wide for:

* hardcoded vehicle category arrays
* vehicle type maps
* ordinal vehicle type maps
* pricing seed lists
* ETA speed seed lists
* icons
* labels
* category metadata
* `vehicleGroup`
* `vehicle_type`
* `car_economy`
* `car_comfort`
* `car_premium`
* `car_xl`

Re-verify every path in Prompt D against the current tree.

---

# 3. ETA

Inspect:

`lib/eta.ts`

Confirm whether the existing `car_*` prefix logic naturally includes `car_compact`.

Do not change working logic unnecessarily.

Add a regression test proving that:

`car_compact`

belongs to the same car group.

---

# 4. ADMIN UPGRADE / DOWNGRADE

Inspect:

* `app/api/admin/driver/upgrade+api.ts`
* `app/api/admin/driver/downgrade+api.ts`

Both currently contain ordinal category maps.

Add `car_compact` in the correct position.

Ensure both maps cannot silently diverge.

If the repository has a canonical ordering source after the foundation implementation, prefer reusing it instead of maintaining another duplicate list.

Do not alter upgrade/downgrade business semantics beyond adding the missing category.

---

# 5. CUSTOMER UI

Update all customer-facing category representations identified by repository search.

At minimum inspect:

* home category selection
* find-ride category metadata/icons
* vehicle selection
* ride estimate
* confirm-ride
* any category labels or display maps

Add `car_compact`.

Also correct the already-known `car_xl` omission in the find-ride category simplification if it remains present.

Do not merely append `car_compact` to an already incorrect list.

---

# 6. DRIVER UI

Inspect the call ledger and all driver-facing category displays.

Ensure `car_compact` has:

* label
* ordering
* display metadata

where applicable.

---

# 7. PRICING — LAUNCH BLOCKER

This is mandatory.

Add `car_compact` pricing rows for every currently configured zone that requires vehicle-category pricing.

Inspect:

* `scripts/seed-pricing.js`
* `scripts/zone-seed-pricing.ts`
* pricing schema
* existing zone pricing records
* ride request pricing lookup
* dispatch pricing lookup

Do not invent prices.

Determine the intended `car_compact` rate from the repository's canonical pricing configuration/product specification.

If the actual intended rate is absent, STOP and report the missing business value rather than inventing a number.

The system must not ship a category that produces:

`422 pricing_not_found`

during ride request.

---

# 8. ETA SEEDING

Update the ETA seed mechanism:

`scripts/seed-eta-speed.js`

and any equivalent current seed source.

Add `car_compact` using an appropriate existing car-category convention.

Do not invent a materially different ETA model unless required by existing product rules.

---

# 9. REGRESSION SEARCH

After implementation, search repository-wide again for category lists.

The objective is to find places that still know only eight categories.

Do not assume the files listed in Prompt D are exhaustive.

---

# 10. TESTING

Test:

* `car_compact` grouping;
* admin upgrade/downgrade;
* pricing lookup;
* ride estimate;
* ride request;
* dispatch pricing lookup;
* category display;
* no regression for `car_xl`.

Most importantly verify that a valid `car_compact` ride request does not fail because pricing is missing.

---

# 11. OUT OF SCOPE

Do not implement:

* premium allowlist administration
* vehicle dataset import
* unrelated multi-city fixes
* redesign of pricing architecture
* unrelated UI redesign

---

# 12. COMPLETION REPORT

Report:

* every hardcoded category list found;
* every changed file;
* pricing rows created;
* tests run;
* verification results;
* any category lists intentionally left unchanged and why.

Do not claim complete propagation until repository-wide search has been performed.

---

# 6. PROMPT C — ADMIN + DATASET

**Model: GLM-5.2 initially; DeepSeek V4 Flash can handle the mechanical seed work after the dataset is finalized.**

This should remain separate because the dataset itself is a product/data-quality artifact, not merely code.

# VEHICLE CATEGORIZATION — ADMIN TOOLING + DATA INTEGRATION

## OBJECTIVE

Complete the operational administration and vehicle-model dataset layer for the new vehicle categorization system.

The classification foundation and category propagation have already been implemented.

Inspect the current repository state before making changes.

---

# 1. ADMIN PREMIUM ALLOWLIST

Build admin functionality for managing the premium vehicle allowlist.

Inspect the existing admin vehicle-model screen and API patterns first.

The allowlist supports:

* brand-wide premium entries;
* brand + model premium entries;
* active/inactive state.

Required operations:

* list
* add
* deactivate/remove
* edit where existing admin patterns justify it

Apply existing admin authentication and authorization patterns.

Do not create a new admin permission system.

---

# 2. ADMIN BODY TYPE MANAGEMENT

Extend the existing vehicle-model administration workflow so administrators can set/edit:

`body_type`

for vehicle-model records.

Use the constrained body-type values already established by the schema.

The existing vehicle-model records must be safely backfillable.

Do not permit arbitrary driver-provided body type to override authoritative model data.

---

# 3. DATASET SEED

A final vehicle-model dataset will be supplied separately.

When it is available:

1. inspect the dataset;
2. validate all categories;
3. validate body types;
4. validate engine displacement data;
5. validate brand/model uniqueness;
6. validate year ranges;
7. validate premium classification assumptions;
8. map records to the existing `vehicle_models` schema;
9. create the required seed/import mechanism.

Do not silently alter dataset classifications.

If a dataset row conflicts with the authoritative classification framework, report it.

---

# 4. SEED SAFETY

The seed must be:

* deterministic;
* repeatable;
* idempotent where repository conventions support it;
* safe against duplicate brand/model/year records;
* explicit about updates versus inserts.

Do not create a seed script that blindly inserts duplicate records every time it runs.

---

# 5. ADMIN VERIFICATION

Verify:

* admin can view allowlist;
* admin can add brand-level entry;
* admin can add model-level entry;
* admin can deactivate an entry;
* classifier sees active entries;
* inactive entries are ignored;
* body type can be maintained through vehicle-model administration.

---

# 6. OUT OF SCOPE

Do not change:

* ride categories;
* classification rule order;
* pricing;
* dispatch;
* unrelated admin permissions;
* multi-city registration-area logic.

---

# 7. TESTING

Add focused tests for:

* allowlist CRUD;
* active/inactive semantics;
* brand-level matching;
* model-level matching;
* dataset validation;
* duplicate handling;
* classifier integration.

Report all ambiguous dataset records instead of silently guessing.

# COMPLETION

The system must have an administrable premium allowlist and a reliable vehicle-model data-loading path without duplicating classification logic.

---

# 7. REVIEW STRATEGY

After the three implementation units are complete, **do not immediately use GLM-5.3 to repair the code**.

First use **MiMo 2.5 Pro** as the independent reviewer.

This follows your orchestration rule that a reviewer should explicitly distrust the previous implementation's conclusions. 

Give MiMo:

* Prompt D;
* the canonical categorization framework;
* the original requirements;
* the repository;
* the completed implementation.

Do **not** give it a previous reviewer's conclusions.

Its task should be:

### MiMo review questions

1. Is `car_compact` truly propagated everywhere?
2. Is there exactly one authoritative classifier?
3. Can a driver manipulate classification?
4. Is premium matching secure and deterministic?
5. Is the rule cascade in the correct order?
6. Can missing body type/CC create unsafe classification?
7. Are migrations safe?
8. Are existing vehicles backward compatible?
9. Can pricing still produce `pricing_not_found`?
10. Can dispatch and ride request disagree about category availability?
11. Can admin overrides still work?
12. Are there duplicated category lists?
13. Does the dataset import preserve the framework?
14. Were unrelated issues accidentally changed?

---

# 8. WHEN TO USE GLM-5.3 AGAIN

Use GLM-5.3 only if the independent audit discovers something substantive, such as:

* migration/data-loss risk;
* classification precedence bug;
* server/client trust issue;
* pricing/dispatch inconsistency;
* category enum mismatch;
* broken admin override semantics;
* unsafe backward compatibility;
* duplicate competing classifiers.

Do **not** spend another GLM-5.3 call merely fixing:

* an icon;
* a label;
* formatting;
* a straightforward missing seed row;
* a trivial test failure.

Those go to GLM-5.2 / DeepSeek.

---

# 9. FINAL EXECUTION ORDER

The actual sequence I recommend is:

```text
Prompt A
GLM-5.3
    ↓
verify migration + classifier
    ↓
Prompt B
GLM-5.2
    ↓
verify pricing + category propagation
    ↓
Prompt C
GLM-5.2
    ↓
dataset finalized
    ↓
seed/import
    ↓
MiMo 2.5 Pro
INDEPENDENT AUDIT
    ↓
triage findings
    ↓
GLM-5.3 only for substantive defects
    ↓
final regression verification
```

### Do not parallelize A and B.

B depends directly on the schema and classifier.

### C can partially overlap with B only if the implementation agent is working on a clean, already-verified branch/state.

For safety, I would still run it sequentially.

### Dataset loading comes last.

The plan explicitly says the final merged dataset is not yet available.  Therefore the coding agent should **not invent or prematurely seed vehicle classifications**.

---

## Bottom line

**Prompt D is good enough to implement, but not as one monolithic Claude Code task.**

The optimal allocation is:

**GLM-5.3 → schema + classification + registration**

**GLM-5.2 → pricing + category propagation**

**GLM-5.2 → admin/data infrastructure**

**DeepSeek V4 Flash → mechanical dataset/seed work once the dataset is authoritative**

**MiMo 2.5 Pro → independent audit**

**GLM-5.3 → only substantive repair/final skeptic findings**

That is more faithful to your orchestration framework than simply following Prompt D's original "`Code mode / Claude Code`" handoff label. The strategy explicitly says prompts should be model-specific and that a large plan should be decomposed rather than forced into one enormous prompt. 
