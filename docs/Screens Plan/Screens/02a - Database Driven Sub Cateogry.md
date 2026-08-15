# Plan 02a — Vehicle Sub-Categories (Service → Vehicle-Type Filtering)

> **STATUS (2026-08-14): CORE IMPLEMENTED.** This feature's core was **implemented during plan 02's Home expansion** (commit `230fc82d`). **Do NOT rebuild it.** This doc now tracks **remaining polish only.**

> **CODING MODEL — read no further than §"Remaining work."** The original "DB-driven / `vehicle_types` table / `/api/vehicle-types` returning `price`+`eta`" design is **REJECTED and debunked** (see §"Verified facts"). Do not implement any of it.

---

## ✅ Already done (verified) — do NOT redo
- `VehicleTypeDefinition.category: "bike" | "cng" | "car" | "large_car"` on all 8 types — `lib/vehicleTypes.ts`.
- `getVehicleTypesByCategory(category)` exported from `lib/vehicleTypes.ts`.
- Home reads the `service` param → `getVehicleTypesByCategory(service || "car")` → filters the vehicle list (compares `estimates.find((e) => e.vehicle_type === def.key)`).
- Services Hub passes `service=<key>` (`bike`/`cng`/`car`/`large_car`); Home maps `large_car`→`xl` for the chip highlight.
- Real fares/ETA via `POST /api/ride/estimate` (after a destination is chosen).
- `has_ac` derived from the canonical def (`getVehicleType(key).has_ac`), not the estimate response.

If any of the above is missing when you start, **stop and tell the owner** — do not re-implement from this doc's old design.

---

## ⚠️ Verified facts (don't re-derive; don't repeat debunked ideas)
1. **There is NO `vehicle_types` database table.** Vehicle types are a **code enum** in `lib/vehicleTypes.ts`. Do NOT create a table / migration / new endpoint for them. (Item #6 below uses admin config flags, not a table.)
2. **Pricing is NOT on the vehicle type.** It lives in the `pricing` table (`per_km_bdt` by `vehicle_type` + `zone`) → `lib/fareCalc.ts` → `POST /api/ride/estimate`. Never add `price` / `baseFare` / `perKmRate` to `VehicleTypeDefinition`.
3. **A total fare/ETA needs a destination.** The *per-km rate* and base fare ARE displayable pre-destination ("৳X/km", "from ৳Y"); the **total** is not.
4. **`VEHICLE_TYPE_VALUES` ordering/values must never change** — `utils-server/dispatch.ts` and `app/api/ride/nearby-drivers+api.ts` depend on the enum.

---

## 📋 Remaining work (prioritized) — implement from THIS list only
Confirm with the owner **which items are in scope** before writing any code. Each item is self-contained — do not bundle them.

| # | Item | Effort | Owner decision? |
|---|------|--------|-----------------|
| 1 | **`VEHICLE_CATEGORIES` constant** — centralize the 4 parent categories (`key`, `display_en`, `display_bn`, icon, sort order) in `lib/vehicleTypes.ts`; have Services Hub + Home consume it instead of each holding a separate piece. | Small | No |
| 2 | **i18n** — render category/type labels via `display_en` / `display_bn` (Bengali). | Small | No |
| 3 | **Pre-destination rate hint** — show "৳X/km" or "from ৳Y" on vehicle cards *before* a destination is chosen, read from the `pricing` table (no route needed). | Medium | Yes — product: how prominent? |
| 4 | **Zone-awareness** — hide/disable vehicle types that have no active `pricing` row in the rider's current zone (`lib/zone.ts`), so users can't pick a class dispatch can't price. | Medium | No |
| 5 | **Supply hints** — extend `POST /api/ride/nearby-drivers` to accept `vehicle_types[]` (one ring query, grouped counts) → per-type "N nearby · ~min" on the category/vehicle screen. | Medium-Large | Yes — contract change to an approved endpoint |
| 6 | **Dynamic enable/disable + reorder** — via the admin config mechanism (`PATCH /api/admin/config` / `platform_config`; never cached — read at request time). Use for CNG-strike / holiday suspensions. **No new table.** | Medium | Yes — admin UI scope |

**Recommended order if doing several:** 1 → 2 → 4 → 3 → 5 → 6 (centralize first, then i18n, then correctness/zone, then the larger product items).

---

## If you're picking this up
1. Get owner sign-off on **which of #1–#6 are in scope.**
2. Re-verify the "Already done" list is still present in `lib/vehicleTypes.ts` and `home/index.tsx` before adding anything.
3. Obey plan 02's locked rules: `useIsDark()` (no hand-written `isDark`); no `any` except Drizzle casts; `await parseJsonBody`; `logger` (not `console.log`); snake_case API fields; integer-paisa money (`*_bdt` / 100 only at display).

---

*Historical note: this doc was originally "03 — Database Driven Sub Category," proposing a `vehicle_types` DB table, a fabricated `VehicleType` interface (`baseFare`/`perKmRate`/`icon`), and a `/api/vehicle-types` endpoint returning `price`/`eta`. All of that was debunked (see "Verified facts") and the core was implemented **code-driven** during plan 02. The fabricated design is intentionally removed to prevent reimplementation.*
