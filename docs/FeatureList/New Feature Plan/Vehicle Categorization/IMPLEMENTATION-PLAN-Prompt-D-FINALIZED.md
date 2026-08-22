# Vehicle Categorization — Implementation Plan (Prompt D, FINALIZED)

**Status:** Ready for handoff to a coding agent (Code mode / Claude Code).
**Grounded in:** [`Repo Audit.md`](Repo%20Audit.md) (Prompt C results) + [`CANONICAL-Vehicle-Categorization-Framework-v1.md`](CANONICAL-Vehicle-Categorization-Framework-v1.md)
**Note for the coding agent:** every file:line cited below was true at audit time. Re-verify each one before editing — the file may have shifted since.

---

## Phase 1 — Schema changes (do first, everything else depends on this)

1. **Add `car_compact` to the `vehicle_type` enum.** One `ALTER TYPE vehicle_type ADD VALUE 'car_compact'` migration — it's a single shared Postgres enum used by 8 columns, so one statement covers all of them. Update in lockstep: [`src/db/schema.ts:23`](src/db/schema.ts:23), [`lib/vehicleTypes.ts:3`](lib/vehicleTypes.ts:3) (`VEHICLE_TYPE_VALUES`) plus its registry entry at `lib/vehicleTypes.ts:50-147`, and fix [`store/useRiderStore.ts:6-13`](store/useRiderStore.ts:6) to import the type from `lib/vehicleTypes.ts` instead of redeclaring it inline (this redeclaration is exactly how a category gets silently missed).
2. **Add `body_type` as new schema** — on `vehicles` and `vehicle_models`. This does not exist anywhere in the current schema or any surviving migration (confirmed zero matches, full-file grep). Values: `motorcycle, scooter, auto_rickshaw, hatchback, sedan, crossover, suv, suv_large, mpv, van, minibus`. Source of truth is BRTA registration, not driver self-report — same trust model as `passenger_seats` today.
3. **Add an integer engine-cc field on `vehicles`.** `cc_range` (varchar) is currently dead — nothing reads or writes it. Either repurpose it as a typed integer or add `engine_cc integer` alongside it and deprecate `cc_range` in the same migration.
4. **Add a premium-brand/model allowlist as new schema.** Nothing exists to hang this on today — `platform_config`'s key allowlist (`app/api/admin/config+api.ts:13-26`) has no vehicle namespace. Simplest shape: a small table `vehicle_premium_allowlist (brand, model nullable, is_active)` — nullable `model` means "whole brand is premium" (covers BMW/Mercedes/Audi/Lexus/Volvo/Land Rover/Jaguar/Porsche), a filled `model` means a specific-model override (covers Premio/Allion/Camry/Crown/Harrier).

## Phase 2 — Build the classification logic that doesn't exist yet

5. **Implement the rule cascade from the canonical framework §3** as a real function in `lib/vehicleTypes.ts` — this is net-new code, not a fix to something broken. Inputs: brand, model, `body_type`, `engine_cc`, registered seats. Checks in order: auto-rickshaw → bike bands → XL (seats+body) → premium allowlist → cc>2000 → SUV floor → compact/economy/comfort cc bands → manual review fallback.
6. **Wire it into registration**, replacing the current flow where the driver just self-selects `vehicle_type` with no verification ([`app/api/driver/vehicles+api.ts:68`](app/api/driver/vehicles+api.ts:68)). New flow: driver enters brand/model/cc/seats → system looks up `vehicle_models` or runs the rule cascade → suggests a category → driver confirms → admin can still override later (existing `vehicle_type_adjusted` path in [`app/api/admin/driver/approve+api.ts:75-101`](app/api/admin/driver/approve+api.ts:75) already supports overrides, keep it).
7. **Flag, don't fix, two adjacent issues the audit surfaced:** `vehicle_class_letter` hardcoded to `'KA'` and `registration_area` hardcoded to `'DHAKA_METRO'` at [`app/api/driver/vehicles+api.ts:163-164`](app/api/driver/vehicles+api.ts:163). Not part of this feature, but relevant to the platform's multi-city goal — log as a separate follow-up, don't bundle into this change.

## Phase 3 — Touch every file that hardcodes the 8-category list

Each of these breaks or silently mislabels `car_compact` if skipped:

8. [`lib/eta.ts:16-20`](lib/eta.ts:16) `vehicleGroup()` — prefix match (`car_*`) should pick up `car_compact` automatically; write a test to confirm rather than assuming.
9. [`app/api/admin/driver/upgrade+api.ts:13-20`](app/api/admin/driver/upgrade+api.ts:13) and [`app/api/admin/driver/downgrade+api.ts:13-20`](app/api/admin/driver/downgrade+api.ts:13) — duplicated hardcoded ordinal maps, both need `car_compact` added in the same position, kept in sync with each other.
10. [`app/(main)/(customer)/(tabs)/home/index.tsx:85-92`](app/(main)/(customer)/(tabs)/home/index.tsx:85) — add an icon for `car_compact`.
11. [`app/(main)/(customer)/find-ride/index.tsx:41-58`](app/(main)/(customer)/find-ride/index.tsx:41) — `CATEGORY_META`/`VEHICLE_ICONS`. Audit note: this file has *already* dropped `car_xl` from its 3-category simplification — fix that gap at the same time, don't just patch in `car_compact` on top of a file that's already out of sync.
12. [`app/(main)/(rider)/call-ledger.tsx:65-72`](app/(main)/(rider)/call-ledger.tsx:65) — hardcoded 8-entry label list, add the 9th.
13. [`app/admin/vehicle-models.tsx:64-80`](app/admin/vehicle-models.tsx:64) — add to form options.
14. Seed scripts — [`scripts/seed-pricing.js:8-71`](scripts/seed-pricing.js:8), [`scripts/zone-seed-pricing.ts:50-134`](scripts/zone-seed-pricing.ts:50), [`scripts/seed-eta-speed.js:9`](scripts/seed-eta-speed.js:9) — add `car_compact` rows to each.

## Phase 4 — Pricing (launch blocker, not polish)

15. **Add per-zone `pricing` rows for `car_compact` before this ships to any real driver or rider.** Without them, [`app/api/ride/request+api.ts:183-196`](app/api/ride/request+api.ts:183) hard-fails every booking attempt for the category with `422 pricing_not_found`, and dispatch (`utils-server/dispatch.ts:119`) can't find a rate either. This is not something that degrades gracefully — treat it as a required step in the same deploy, not a follow-up ticket.

## Phase 5 — Admin panel additions

16. Admin UI + API for managing the premium allowlist (add/remove brand or brand+model entries) — mirrors the existing `vehicle-models.tsx` admin screen pattern.
17. Admin UI support for setting/editing `body_type` on `vehicle_models` entries, since the field is new and the existing 0-8 entries (if any) will need it backfilled.

## Phase 6 — Data

18. Once the final merged dataset (Part 2, six AI responses reconciled) is ready, load it into `vehicle_models` via a new seed script — none exists today despite the original doc's assumption that one did.

---

## Sequencing note for the coding agent

Do Phase 1 → Phase 2 → Phase 4 (pricing) before Phase 3's cosmetic file touches. A missing icon is a UI bug; missing pricing rows are a booking outage. Phase 5 (admin tooling) can trail behind Phase 1-2 since admins can use direct DB access temporarily if needed — Phase 4 cannot be deferred under any framing.
