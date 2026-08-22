# 1. EXECUTIVE VERDICT

**GOOD PLAN — MINOR CORRECTIONS**

Terra's plan is fundamentally sound. It faithfully decomposes the master plan (Prompt D) into three coherent implementation units (A: schema+classification, B: pricing+propagation, C: admin+dataset), preserves the master plan's critical sequencing insight (pricing is a launch blocker), and adds genuine value: it correctly refuses to let the coding agent make the `cc_range` decision casually, forbids inventing pricing numbers, demands a single authoritative classifier, and front-loads repository inspection. The orchestration overlay (independent MiMo audit, conditional GLM-5.3 repair) is reasonable.

However, the plan has **repository-scope gaps** and **coding-agent ambiguities** that must be closed before handoff. Most importantly: (a) the driver-facing registration UI is only implicitly scoped, (b) several likely category-consumers are not enumerated (admin pricing UI, package/incentive vehicle-type scoping, `VehicleCategoryCard`, driver vehicle-type-change flow, `utils-server/eta.ts`, i18n labels), and (c) there is a **structural discrepancy** — the seed-script paths both the master plan and Terra reference (`scripts/seed-pricing.js`, `scripts/zone-seed-pricing.ts`, `scripts/seed-eta-speed.js`) do **not** appear anywhere in the provided repository structure, and no test infrastructure is visible either. These are not fatal, but they are exactly the class of omission that produces silent incompleteness.

---

# 2. WHAT TERRA GOT RIGHT

1. **Correct decomposition, not a monolith.** Splitting Prompt D into A/B/C units aligned to real dependency boundaries (schema/classification → pricing/propagation → admin/data) is the right call and matches the master plan's own phase coupling.
2. **Sequencing discipline.** Terra explicitly forbids parallelizing A and B and keeps dataset loading last (dataset is not yet available). This matches the master plan's "Phase 4 cannot be deferred" warning.
3. **The `cc_range` guardrail.** Terra correctly elevates this from "pick one" to "trace all consumers, then choose the safer option, never destroy data." This is a real improvement over the master plan's casual framing.
4. **No invented pricing.** Terra's instruction to STOP and report a missing `car_compact` rate rather than fabricate one is correct and catches a genuine hole in the master plan (see §5).
5. **Single authoritative classifier.** Terra explicitly forbids duplicating classification/premium logic across registration, admin, frontend, and dispatch. This is the highest-leverage architectural constraint in the whole feature.
6. **Manual-review semantics preserved.** Terra correctly treats manual review as a workflow state, not a tenth category — faithful to the framework.
7. **Admin override preserved.** Terra keeps the existing `vehicle_type_adjusted` path rather than inventing a second override mechanism.
8. **Repository-authoritative, plan-as-requirements.** The "inspect → trace → compare → identify conflicts → then modify" preamble is the right execution rule given stale line numbers.

---

# 3. MASTER PLAN COVERAGE

| Requirement | Terra coverage | Assessment |
|---|---|---|
| Add `car_compact` to shared enum (8 columns) + lockstep TS/schema/store update | Complete | Prompt A §4.1; correctly targets single canonical TS source |
| Add `body_type` to `vehicles` + `vehicle_models` (11 values) | Complete | Prompt A §4.2; values match exactly |
| Integer engine displacement (`engine_cc` vs repurpose `cc_range`) | Complete (improved) | Prompt A §4.3 adds mandatory consumer-tracing first |
| Premium allowlist table (`brand`, nullable `model`, `is_active`) | Complete | Prompt A §4.4 |
| Rule-cascade classifier in `lib/vehicleTypes.ts` | Complete | Prompt A §5; rule order preserved |
| Wire classifier into registration (replace driver self-select) | Partial | Prompt A §7 covers flow/API; driver UI screen not explicitly scoped |
| Flag (not fix) `vehicle_class_letter`/`registration_area` hardcodes | Complete | Prompt A §11 excludes; but "log as follow-up" is weakened to "out of scope" |
| `lib/eta.ts vehicleGroup()` + test | Complete | Prompt B §3 |
| Admin upgrade/downgrade ordinal maps | Complete | Prompt B §4 |
| Customer home icons | Complete | Prompt B §5 |
| `find-ride` `CATEGORY_META` + fix `car_xl` omission | Complete | Prompt B §5 explicitly fixes `car_xl` |
| Rider call-ledger label list | Complete | Prompt B §6 |
| `app/admin/vehicle-models.tsx` form options | Partial | Only implicitly via Prompt C body-type work + Prompt B regression search |
| Seed scripts (pricing, zone-pricing, ETA-speed) | Complete-but-at-risk | Prompt B §7–8; **but `scripts/` not visible in repo structure** |
| Per-zone `car_compact` pricing rows (launch blocker) | Complete (improved) | Prompt B §7; correctly refuses to invent rates |
| Admin premium-allowlist UI/API | Complete | Prompt C §1 |
| Admin `body_type` management | Complete | Prompt C §2 |
| Vehicle-model dataset seed | Complete (deferred) | Prompt C §3; correctly notes dataset unavailable |
| Sequencing: 1 → 2 → 4 before 3 | Partial | Terra bundles Phase 3+4 into Prompt B; within B, UI sections (§3–6) are numbered before pricing (§7) |

---

# 4. REPOSITORY-SCOPE GAPS

Areas Terra may have overlooked, derived purely from the file tree:

1. **`app/(main)/(rider)/add-vehicle/index.tsx` (driver registration UI)**
   - Why it matters: Master plan Phase 2 changes registration so the driver enters brand/model/cc/seats and confirms a suggested category. That is a *frontend* change, not just an API change. Terra's Prompt A scopes the backend flow but never names this screen.
   - Confidence: LIKELY
   - Verify: Does `add-vehicle` currently let the driver self-select `vehicle_type`? Must it be rebuilt to collect brand/model/cc/seats and render a suggested category?

2. **`app/admin/pricing.tsx` + `app/api/admin/pricing+api.ts`**
   - Why it matters: Adding `car_compact` pricing rows is only half the job; admins must be able to view/edit them. If this screen hardcodes the 8 categories, `car_compact` will be unmanageable after seeding.
   - Confidence: LIKELY
   - Verify: Does the admin pricing form iterate over a hardcoded vehicle-type list?

3. **`components/VehicleCategoryCard.tsx`**
   - Why it matters: A component named for category display is a prime candidate for a hardcoded category list/metadata.
   - Confidence: LIKELY
   - Verify: Does it map over a fixed category set?

4. **`app/api/driver/vehicle-type-change+api.ts` + `app/api/admin/driver/type-change-approve+api.ts`**
   - Why it matters: Terra covers admin upgrade/downgrade but not the driver-initiated type-change flow, which likely also hardcodes the ordinal/category set.
   - Confidence: LIKELY
   - Verify: Do these enforce category adjacency or validate against a fixed list?

5. **`utils-server/eta.ts` (separate from `lib/eta.ts`)**
   - Why it matters: Master plan and Terra only mention `lib/eta.ts`. The dispatch package has its own ETA module that may also group vehicle types.
   - Confidence: POSSIBLE/LIKELY
   - Verify: Does `utils-server/eta.ts` contain a `vehicleGroup`/category assumption?

6. **i18n: `i18n/locales/en/common.json`, `i18n/locales/bn/common.json`**
   - Why it matters: Category labels may be localized keys. A new category with no label renders as a raw key.
   - Confidence: POSSIBLE
   - Verify: Are vehicle category labels resolved through i18n?

7. **Package/incentive vehicle-type scoping (`app/admin/packages.tsx`, `app/admin/incentives.tsx`, `app/api/package/*`, `lib/` incentive logic)**
   - Why it matters: Per AGENTS.md, `packages.vehicle_type` and `incentive_definitions.vehicle_type_filter` scope offers by vehicle type. Adding `car_compact` may require new admin options/filters.
   - Confidence: POSSIBLE
   - Verify: Do these enums/UIs need `car_compact`?

8. **`app/(main)/(rider)/vehicle-management/`, `select-active-vehicle.tsx`, `constants/data.ts`, `lib/fareCalc.ts`, `lib/surge.ts`, `lib/discountEngine.ts`**
   - Why it matters: Any of these may embed category assumptions (display, fare, surge, discount).
   - Confidence: POSSIBLE
   - Verify: Repo-wide category-list search must include them.

---

# 5. MISSING DEPENDENCIES

FINDING: **The `car_compact` fare rate is undefined anywhere.**
BASIS: Master plan Phase 4 requires per-zone pricing rows but never specifies the rate; Terra inherits this and correctly says "do not invent."
CONFIDENCE: CONFIRMED
WHY IT MATTERS: This is the launch-blocker phase. Without a product decision on the rate (e.g., between `car_economy` and `car_comfort`?), Prompt B §7 cannot complete.
RECOMMENDED ACTION: Resolve the `car_compact` pricing rule as an explicit product decision *before* Prompt B executes; encode it as an input, not a discovery.

FINDING: **Seed-script location dependency is unresolved.**
BASIS: Master plan and Terra reference `scripts/seed-pricing.js`, `scripts/zone-seed-pricing.ts`, `scripts/seed-eta-speed.js`; the provided structure shows **no `scripts/` directory**, but does show `src/db/seed.ts`.
CONFIDENCE: LIKELY (discrepancy), REQUIRES SOURCE-CODE VERIFICATION
WHY IT MATTERS: Pricing/ETA seeding is a launch blocker. If `scripts/` doesn't exist, the seeding mechanism must be relocated (e.g., `src/db/seed.ts`, admin API, or new scripts), changing scope.
RECOMMENDED ACTION: Confirm where pricing/ETA seeds actually live before Prompt B.

FINDING: **Test infrastructure dependency is unverified.**
BASIS: Terra's prompts require extensive tests; the structure shows no test files/config and no `jest.config`.
CONFIDENCE: LIKELY, REQUIRES SOURCE-CODE VERIFICATION
WHY IT MATTERS: "Add tests" is unactionable if the harness/config location is unknown.
RECOMMENDED ACTION: Confirm Jest setup and test-file convention before A/B/C.

FINDING: **`vehicle_models` dataset emptiness affects registration behavior.**
BASIS: Master plan Phase 6 (dataset) is deferred; registration (Phase 2) "looks up `vehicle_models`."
CONFIDENCE: POSSIBLE
WHY IT MATTERS: If `vehicle_models` is empty until Phase 6, registration must gracefully fall back to the rule cascade on driver-supplied inputs. Terra's wording ("where appropriate") implies this but it must be guaranteed.
RECOMMENDED ACTION: Explicitly require the empty-dataset fallback path in Prompt A.

---

# 6. SCOPE PROBLEMS

- **Under-scoped (missing work):** Driver registration UI (`add-vehicle`), admin pricing UI, package/incentive scoping options, i18n labels, `VehicleCategoryCard`, driver type-change flow, `utils-server/eta.ts`, and AGENTS.md/CLAUDE.md doc update (vehicle-type count 8→9 is a documented "critical rule"; AGENTS.md mandates keeping the two docs in sync).
- **Over-engineering risk:** Low. Terra avoids new abstractions and reuses `lib/vehicleTypes.ts` + existing admin patterns. No unjustified modules.
- **Unnecessary work:** None detected. Terra correctly excludes multi-city/`vehicle_class_letter` fixes.
- **Duplicated functionality risk:** Low because Terra forbids duplicate classifiers, but the admin upgrade/downgrade ordinal maps are *acknowledged duplicates*; Terra should require deriving both from the canonical ordering source to prevent future divergence (it gestures at this in Prompt B §4 — make it mandatory).
- **Sequencing nuance:** Within Prompt B, pricing (§7) is numbered *after* UI propagation (§3–6), inverting the master plan's "pricing before cosmetics" rule. Terra labels pricing a launch blocker, but a literal coding agent may execute in numbered order. Reorder so pricing is the *first* step inside Prompt B.

---

# 7. CROSS-MODULE RISKS

Areas outside the immediate feature that should be checked (not asserted regressions):
- **Dispatch (`utils-server/dispatch.ts`):** Vehicle-type filter runs before H3 scoring (per AGENTS.md). Confirm `car_compact` flows through candidate-pool filtering and rate lookup; ensure the repo-wide category search explicitly includes the `utils-server/` package (separate tsconfig, easy to skip).
- **Packages/incentives:** Vehicle-type-scoped offers may silently exclude or break for `car_compact`.
- **Ride estimate/confirm/tracking screens** (`confirm-ride`, `ride-detail`, `ride-tracking`): May render category metadata; verify via regression search.
- **Admin dashboards** (`riders.tsx`, `queue.tsx`, `live-ops.tsx`, `monitoring.tsx`): May display vehicle type; verify they don't hardcode 8 values.
- **Money handling:** All new pricing rows must be integer paisa per AGENTS.md; ensure seeding and admin forms don't introduce floats/taka.
- **Documentation drift:** AGENTS.md/CLAUDE.md vehicle-type list becomes stale (8→9).

---

# 8. IMPLEMENTATION-SEQUENCE REVIEW

Terra's macro sequence (A → verify → B → verify → C → dataset → independent audit → conditional repair) is sound and respects dependencies.

Classifications:
- **Prompt A (schema+classifier+registration):** PREREQUISITE for everything. Correctly first. (Combining master-plan Phases 1+2 is acceptable — they are tightly coupled — but Prompt A is large; see §9.)
- **Prompt B (pricing+propagation):** DEPENDENT on A. Correctly not parallelized. **Correction:** reorder so pricing (launch blocker) is executed and verified *before* UI-propagation steps within B.
- **Prompt C (admin+dataset):** DEPENDENT on A (schema) for allowlist/body-type; dataset import correctly gated on dataset availability.
- **Independent audit (MiMo):** INDEPENDENT of coding models; correctly placed after A–C.
- **Repair (GLM-5.3):** CONDITIONAL; correctly gated on substantive findings.

Optional optimization (not required): pricing rows strictly need only the enum from Phase 1, so they could be seeded immediately after the schema migration, in parallel with classifier work. Terra's choice to keep it in B is faithful to the master plan and acceptable; do not change unless the pricing-rate decision is resolved early.

**Corrected sequence:** A → verify → **B (pricing first, then propagation)** → verify → C → dataset → independent audit → triage → GLM-5.3 repair only for substantive defects → final regression.

---

# 9. CODING-AGENT READINESS

**BLOCKERS (must be resolved before literal execution):**
1. **Undefined `car_compact` pricing rate.** Prompt B cannot complete without a product decision. Must be supplied as an explicit input.
2. **Seed-script location ambiguity.** `scripts/` absent from structure; agent must be told where pricing/ETA seeds actually live or be authorized to create the mechanism.
3. **Driver registration UI scope ambiguity.** Prompt A must explicitly state whether `add-vehicle` (and related driver screens) are in scope, else the backend changes ship with no usable driver path.
4. **Test harness location.** Agent needs the actual Jest/test convention to fulfill the extensive test requirements.

**DISCOVERABLE DURING IMPLEMENTATION (acceptable to defer to inspection):**
- Exact current line numbers / shifted file paths (master plan already warns; Terra mandates re-verification).
- Full enumeration of hardcoded 8-category lists (Terra mandates repo-wide search — but see §10 to seed that search with the specific paths above).
- Expo dynamic-route param convention (documented in AGENTS.md: params are flat, not `{ params }`).
- Drizzle snake_case column naming and Zod/`parseJsonBody` boundary validation (documented in AGENTS.md).
- `cc_range` vs `engine_cc` choice (Terra correctly defers to consumer-tracing).

**Prompt-size note:** Prompt A is ambitious (schema + classifier + registration + large test matrix). It is defensible given tight coupling, but if the executing agent struggles, split "registration integration + its tests" into A2.

---

# 10. SOURCE-CODE VERIFICATION CHECKLIST

Repository-aware reviewers MUST verify these concrete items (structure-only evidence; do not assume):

1. **Seed mechanism:** Does `scripts/` exist? If not, where are pricing/ETA/package seeds (`src/db/seed.ts`? admin APIs?). Confirm the real home for `seed-pricing`, `zone-seed-pricing`, `seed-eta-speed` equivalents.
2. **Enum surface:** Confirm all columns using the shared `vehicle_type` enum in `src/db/schema.ts` (master plan says 8). Enumerate them before migration.
3. **`cc_range` consumers:** Grep all uses of `cc_range` across `src/db/schema.ts`, migrations, `app/api/`, `lib/`, admin forms — decide repurpose-vs-`engine_cc` on evidence.
4. **Driver registration UI:** Inspect `app/(main)/(rider)/add-vehicle/index.tsx`, `vehicle-management/index.tsx`, `select-active-vehicle.tsx` for self-selection of `vehicle_type` that must become brand/model/cc/seats + suggestion.
5. **Category lists (repo-wide, including `utils-server/`):** `components/VehicleCategoryCard.tsx`, `app/admin/pricing.tsx`, `app/admin/packages.tsx`, `app/admin/incentives.tsx`, `app/admin/vehicle-models.tsx`, `app/(main)/(rider)/call-ledger.tsx`, `app/(main)/(customer)/find-ride/index.tsx`, `app/(main)/(customer)/(tabs)/home/index.tsx`, `constants/data.ts`, `app/api/admin/driver/upgrade+api.ts`, `downgrade+api.ts`, `vehicle-type-change+api.ts`, `type-change-approve+api.ts`.
6. **ETA logic:** Both `lib/eta.ts` AND `utils-server/eta.ts` — confirm whether `car_*` prefix grouping naturally includes `car_compact`; add regression test.
7. **Dispatch:** `utils-server/dispatch.ts` vehicle-type filter + rate lookup; confirm `car_compact` doesn't 422.
8. **i18n labels:** `i18n/locales/en/common.json`, `bn/common.json` for category label keys.
9. **Test infra:** Confirm Jest config and where tests live (none visible in structure).
10. **Fare/surge/discount:** `lib/fareCalc.ts`, `lib/surge.ts`, `lib/discountEngine.ts` for per-category assumptions.
11. **`vehicle_models` population state:** Confirm whether it is empty pre-Phase-6 so registration fallback is guaranteed.
12. **Admin override intact:** Confirm `vehicle_type_adjusted` path in `app/api/admin/driver/approve+api.ts` still works post-change.

---

# 11. REQUIRED CHANGES TO TERRA'S PLAN

Only justified changes:
1. **Explicitly scope the driver registration UI** (`add-vehicle` and related driver screens) into Prompt A §7, or explicitly defer it with a named owner — do not leave implicit.
2. **Reorder Prompt B** so pricing seeding/verification is step 1, before UI propagation.
3. **Expand the repo-wide category search** in Prompt B §2/§9 to explicitly include: admin pricing UI, package/incentive scoping, `VehicleCategoryCard`, driver type-change flow, `utils-server/` (including `utils-server/eta.ts`), i18n locale files, and `constants/data.ts`.
4. **Resolve the seed-script location** before Prompt B (confirm `scripts/` vs `src/db/seed.ts` vs new mechanism).
5. **Inject the `car_compact` pricing decision** as an explicit input to Prompt B (do not leave it as a discovery).
6. **Mandate a single canonical ordering source** for upgrade/downgrade maps (make reuse mandatory, not suggested).
7. **Add a documentation task:** update AGENTS.md + CLAUDE.md vehicle-type list (8→9) per their stated sync rule.
8. **Require the empty-`vehicle_models` fallback** in registration explicitly.
9. **Restore "log as follow-up"** (not merely "out of scope") for `vehicle_class_letter`/`registration_area` hardcodes.

---

# 12. RECOMMENDED PLAN DIRECTION

Keep Terra's three-unit structure and orchestration; do not replan. The final plan should:
- Execute **Unit A** (schema + single authoritative classifier + registration, *including the driver registration UI*) with mandatory pre-edit tracing of the enum surface and `cc_range`, and an explicit empty-dataset fallback.
- Execute **Unit B** with **pricing first** (using a pre-resolved `car_compact` rate and a confirmed seed mechanism), then a repo-wide propagation sweep that explicitly covers the additional consumer list in §10, spanning both the Expo app and the `utils-server` package.
- Execute **Unit C** (admin allowlist + body-type management), with dataset import gated on the finalized dataset.
- Then run the **independent audit** against the master plan + framework, and reserve the strongest model only for substantive defects.
- Thread cross-cutting constraints throughout: integer-paisa money, snake_case Drizzle, Zod/`parseJsonBody` boundaries, Expo flat route params, single classifier, no new categories, and AGENTS.md/CLAUDE.md doc sync.

This is a refinement, not a redesign.

---

# 13. FINAL ASSESSMENT

**B. Repository-aware review first.**

The plan is structurally correct and should not be replanned (not C), but it should not go straight to a coding agent unchanged (not A). There are concrete, structure-derived gaps — driver registration UI scope, admin pricing UI, seed-script location, test infrastructure, and the undefined pricing rate — plus a real discrepancy (referenced `scripts/` absent from the provided tree) that only repository-aware inspection can resolve. A focused repo-aware pass using the §10 checklist will convert this GOOD plan into an executable one.

---

# 14. CONFIDENCE

**MEDIUM.**

The plan-direction assessment is high-confidence (Terra faithfully covers the master plan and adds sound guardrails). The primary uncertainty is **repository ground truth**: I only have the file tree, and the tree appears to omit directories the plan depends on (`scripts/`, test infrastructure, `docs/`). Until source inspection confirms where seeding, tests, and the driver registration UI actually live, the precise scope of Units A and B cannot be finalized.