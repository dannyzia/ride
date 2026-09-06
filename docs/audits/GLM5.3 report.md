# Adversarial Audit — Marketplace Bidding Spec Set

Audit basis: all three documents read in full; every load-bearing claim checked against live files (`src/db/schema.ts`, `lib/auth.ts`, `lib/adminRbac.ts`, `drizzle.config.js`, `utils-server/*`, `lib/marketplaceRbac.ts`, pick/bid handlers, migrations folder, git history of the six marketplace commits `b299db9…54262df`).

Important context the specs themselves assert: spec-v2's header claims **"Implementation status: ALL PHASES COMPLETE 2026-09-01 … migrations 0048–0052 live"**. The code confirms the implementation largely landed, so I audited both directions: spec-claims-about-pre-existing-code AND spec-claims-about-the-shipped-result.

---

## 1. §0.3 "verified against live code" — verdict per fact

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | No `marketplace_enabled` on `fleet_subscriptions`; gate = `status='ACTIVE'` + plan `features` jsonb containment | **CONFIRMED** | `schema.ts:2565–2579` — columns are id/fleet_id/plan_id/status/started_at/current_period_start/current_period_end/cancelled_at only; `fleetSubscriptionStatusEnum` (2436–2442) is uppercase PENDING/ACTIVE/PAST_DUE/CANCELLED/EXPIRED; `fleetSubscriptionPlans.features jsonb` (2473); `fleet-plans+api.ts:28` `features: z.record(z.unknown()).nullable().optional()`, PATCH under `catalog.write` (131–133) |
| 2 | `fleet_members.role` enum OWNER/MANAGER/DISPATCHER/ACCOUNTANT/VIEWER, no `driver`; drivers are `drivers` rows | **CONFIRMED** | `schema.ts:2429–2434` (enum), `lib/auth.ts:86–99` (`FleetRole`/`FLEET_ROLES` identical) |
| 3 | `lib/auth.ts` exports `verifyAuth`/`verifySupabaseToken`/`requireRole`/`requireAnyRole`/`requireFleetMember`/`requireFleetOwner`; `resolveToken` private | **CONFIRMED** | `lib/auth.ts:6` (no `export` on `resolveToken`), 20, 25, 38, 63, 128, 172 — exact match, nothing missing |
| 4 | `adminRbac.ts` dot-convention, roles owner/admin/ops_manager/moderator, owner superuser | **CONFIRMED** (one nit) | `lib/adminRbac.ts:43–74`. Nit: spec header cites "`PERMISSION_ROLES`" as if referenceable — it is **not exported** (line 56, bare `const`) |
| 5 | `drizzle.config.js` → `out: './src/db/migrations'`, `schema: './src/db/schema.ts'`; no `supabase/migrations/` | **CONFIRMED** | `drizzle.config.js:17–20`; glob of `supabase/**` returns nothing |
| 6 | Scheduler jobs 1–45, "started (45 jobs)", house running-flag pattern | **CONFIRMED as pre-impl state; now 57** | Current `scheduler.ts` final line: `logger.info("[scheduler] started (57 jobs)")`; jobs 46–56 present; house pattern (module-scope flag + `setInterval` + try/catch/finally) verified throughout |
| 7 | `rate_limits` (key+window_start), `platform_config` key/value text | **CONFIRMED** | `schema.ts:895–903`, `1124–1128` |
| 8 | `lib/errors.ts` `getErrorStatus`, `parseJsonBody`, `lib/notify.ts` `sendNotification` | **CONFIRMED** | `errors.getErrorStatus` used at `pick+api.ts:227`; `parseJsonBody` at `pick+api.ts:55`; `notify.ts:19 export async function sendNotification` |
| 9 | `vehicles` no `status` column (F28); `drivers` column set | **CONFIRMED** | `vehicles` (385–443): registration_number NOT NULL UNIQUE, body_type, fitness/tax dates, **no status**; `drivers` (302–383): `rating numeric(3,2) default 5.00`, `rating_count`, `completed_rides_count`, `h3_cell_res9` (indexed 369), `is_online`, `on_break`, `fleet_id` NOT NULL |
| 10 | VERIFY-AT-IMPL: (a) `supabaseAdmin` export — **CONFIRMED** (`lib/auth.ts:1` import); (b) `jest.config.js` — **CONTRADICTED**: no such file; jest config lives in `package.json` (`"jest": {…}`); (c) notify push path — **CONFIRMED** (`notify.ts` Expo push, token pruning); (d) driver home `app/(main)/(rider)/(tabs)/index.tsx` — **CONFIRMED** (exists; modified by 96f30c9 for the bidder card) |

Header/related-path claims: `app/api/fleet/subscription+api.ts` exists ✓; `app/api/admin/fleet-plans+api.ts` PATCH exists ✓; `AuthHelloMessage.role: "driver"|"rider"|"admin"` ✓ (`types.ts:9–13`); migrations **0048–0052 exist with exactly the claimed names** ✓; "all four `marketplace_*_enabled` flags ship DISABLED" — **UNVERIFIABLE-FROM-FILES** (DB row state, not on disk).

## 2. The six pre-verified v1 findings

- **(i) v1 gate queries phantom columns — CONFIRMED.** v1 §E.1 selects `marketplace_enabled, valid_until` and `.eq('status','active')` (v1:1081–1084). Live table has neither column, and the enum is uppercase. v1 had **two** phantom columns (`marketplace_enabled` AND `valid_until`). v2's §E.1 replacement is what the live `lib/marketplaceRbac.ts:131–198` implements, verbatim including the F44 alias filter `.eq('plan.active', true)` and `current_period_end`. Fixed.
- **(ii) `'driver'` in fleet allow-list — CONFIRMED.** v1:710 uses `['OWNER','MANAGER','DISPATCHER','driver']`; `FLEET_ROLES` (auth.ts:93–99) has no `driver`, and `allowedRoles?: readonly FleetRole[]` (auth.ts:130) would reject it at compile time. v2 §C.2 complete row drops it and adds the assigned-driver principal; live `bids/[id]+api.ts:255,260` implements exactly that. Fixed.
- **(iii) `supabase/migrations/` — CONFIRMED.** v1 §G.0 assumes it and marks the naming convention UNVERIFIED; real `out` is `./src/db/migrations` and no `supabase/` dir exists. v2 §G uses drizzle-kit generate → push, and shipped migrations 0048–0052 are drizzle-style files in the right folder. Fixed.
- **(iv) `ambulance_emergency` phantom category — CONFIRMED** as a genuine v1 self-contradiction (v1:244 lists it in the DDL comment; v1:699 restricts creation to three values; emergency has its own table §A.5.2). v2 §A.0 enum excludes it; live `rentalCategoryEnum` (schema.ts:2975–2979) has exactly three values. Fixed.
- **(v) Clock-freeze formula — CONFIRMED** as a genuine v1 internal contradiction: v1:607's lazy `GREATEST(awarded_at+60, COALESCE(assigned_at, awarded_at)+60)` collapses to `awarded_at+60` when unassigned, while v1's own §B.1 prose and H.2 step 4 ("should NOT have fired") claim the clock is frozen — the same test step then says the sweep uses `awarded_at+60` when never assigned. v2 F4 (stored column, NULL while pending, sweep skips NULL) is in the spec (§A.2, §B.1) and the code (nullable column, partial index `WHERE … confirmation_deadline_at IS NOT NULL`, pick tx sets it). Fixed.
- **(vi) `delivery_bids` hard unique — CONFIRMED.** v1:450 plain `UNIQUE (request_id, courier_user_id)` vs the correctly partial rental unique at v1:342 — real asymmetry in v1's own text. v2 F3 partial unique is in §A.3 and in code (`delivery_bids_active_courier_idx … WHERE status='active'`, schema.ts:3344–3346). Fixed.

## 3. Additional v1 defects beyond the six

- v1 §E.1/§E.2/§E.3 all `import { resolveToken } from './auth'` — **not exported**; v1's code would not compile. (Plan-v2 §10 records the fix; v2 uses `verifySupabaseToken`.) Fixed.
- v1 §A.2.3/§C.2 validate `vehicles.status='active'` — **column doesn't exist** (F28). Fixed in v2 §C.2 (membership-only) and code (pick+api.ts:79–88).
- v1 §B.1 auto-award row (`collecting→awarded` by scheduler) and runner-up promotion machinery — deleted in v2 ✓ (B.1 has no such rows; schema has no `reoffer_count`/`original_request_id`).
- v1 `requireRole('rider')` on shop orders / delivery create / emergency create — widened per F17 ✓.

## 4. F-list spot-check (14 verified against v2's own later sections AND shipped code)

F1 ✓ (enum §A.0 + schema), F3 ✓, F4 ✓ (§A.2/§B.1 + column/index/pick-tx), F6 ✓, F12 ✓ (renew route exists), F19 ✓ (§G + migrations 0048–0052, no hand-written M-00X), F21 ✓ (table matches §A.2 exactly), F27 ✓ (`h3_cell varchar(20)`, res 8 default), F29 ✓ (§A.3/§E.5b + code), F30 ✓ (multi-membership, no maybeSingle), F34 ✓ (`isNull(rentalRequests.awarded_at)` literally in `sweepDeadlines`), F35/F36 ✓ (demote→`no_bidders` on last standing bid; partial assignment unique in schema), F45 ✓ (`fleet_ack_at` column, route, job 47 branch b), F46 ✓ (jobs 54–55 + `activationJobs.ts`, job 56 emergency activation, 57-job ledger).

## 5. Money & enum conventions

All new `*_bdt` columns are `integer` (price_bdt, subtotal/delivery_fee/total, unit/line, quoted_price/overtime_rate, quoted_price_bdt, declared/quoted_fee) — **no floats** ✓. No new enum name collides with any of the 41 pre-existing pgEnums ✓. One nit: §A.0's `rental_vehicle_type` value *order* differs from code (cars before ambulances) — same value set, cosmetic.

---

## Contradictions found (spec vs code / spec vs itself)

1. **CRITICAL — `POST /api/rental/assignments/[id]/pick` violates §B.0/F37 as written.** The spec mandates the exclusivity guard and `drivers`-row `FOR UPDATE` run *inside* the §B.0 transaction with a conditional update. Live code (`pick+api.ts:122–192`): the `for("update")` lock and all three §B.7 checks execute **outside** `db.transaction` (line 195) — under autocommit the row lock is released at statement end, so the F37 "common serialization point" does not exist and two different-vertical accepts can still race. The fulfillment `UPDATE` (196–204) is unconditional — no `released_at IS NULL` guard **inside** the tx, despite §C.2 explicitly requiring it ("kimi: released assignment returns 409 … inside tx"). A racing SLA sweep between the pre-tx check (line 37) and the tx can fulfill a released assignment.
2. **CRITICAL — data-integrity bug in the same handler:** `assigned_by_user_id: result.data.driver_user_id` (line 201) records the **picked driver** as the picker. Spec §A.2: "assigned_by_user_id — the fleet member who picked". The `requireFleetMember` result is discarded (line 51), so the true actor is never captured. Every pick row writes a wrong actor.
3. **CRITICAL — "ALL PHASES COMPLETE" is false against the spec's own normative screen/store lists.** §F declares "unchanged from v1 §F.0–F.7". Missing on disk: the **entire courier-side UI** (v1 §F.3 `(delivery-courier)/` group + `useDeliveryCourierStore` — nothing exists), most of the shop surface (v1 §F.1's `manage/*`, `rfq/*`, `cart`, `orders/*`, `useShopMemberStore` — the `(shops)` group ships only 4 files), and `useRentalDriverStore` (v1 §F.2). The vertical is unusable by couriers in-app; the spec headers (both plan v2 line 12 and spec v2 line 17) claim completion.
4. **MODERATE — §I "Summary of modified EXISTING files (complete — F9)" is incomplete.** Marketplace commits also modified: `app/(main)/(customer)/services-hub.tsx` (b299db9, 37fc738, 54262df), `app/(main)/(rider)/(tabs)/index.tsx` (96f30c9), and **`lib/h3.ts`** (96f30c9 — added `getH3CellRes8()`), none listed. §I also lists `utils-server/types.ts` (unions) as modified — **no marketplace commit touches types.ts** (claim contradicted). And §I lists `app/api/delivery/requests/[id]+api.ts` (join) as modified — **that file does not exist at all**; the delivery single-GET endpoint (v1 §C.3) was never created.
5. **MODERATE — v2 §A.3 "delivery_requests/bids/legs: as v1" does not match the shipped schema.** Code diverges from the normative-by-reference v1 DDL: `created_by_user_id` (v1: `rider_user_id`), `category` and `package_value_bdt` dropped, `declared_fee_bdt` nullable (v1: NOT NULL), `package_weight_kg` integer (v1: numeric(10,3)), `delivery_bids.vehicle_type` nullable (v1: NOT NULL), `delivery_legs.pod_url` single column (v1: `pod_image_url`+`pod_signature_url`), plus new `deadline_at NOT NULL`/`accepted_bid_id` — `deadline_at` is referenced by §C.0's job-51 ledger but **never declared in any schema section of either spec**.
6. **MODERATE — service_level DDL claims unbacked.** v2 §A.2/§A.5 claim `CHECK (service_level IN ('BLS','ALS'))` (and v1 mandates NOT NULL on certs/emergency). Live code: `varchar` nullable with a comment deferring the check to handlers (schema.ts:3052, 3140, 3182). No DB CHECK exists anywhere; `ambulance_certifications.service_level` and `emergency_requests.service_level` are nullable contra both specs.
7. **MODERATE — error-code drift in pick:** spec §C.2 promises `403 driver_not_in_fleet` / `403 vehicle_not_in_fleet`; code returns `404 driver_not_found` / `404 vehicle_not_found` (pick+api.ts:71–95).
8. **MINOR — §C.3 signature drift:** spec `requireCourier('parcel'|'food', {requestCategory})`; code takes only `type` (marketplaceRbac.ts:218).
9. **MINOR — F32's "NO store imports in the edited screen":** `services-hub.tsx` imports `useCustomer` and `ensureRiderSocket` — pre-existing (verified against `b299db9~1`), and the marketplace edit added only tiles, so the substantive rule holds; but the spec's absolute wording is factually wrong about the file. The `display:"none"` tab-bar claim IS confirmed (`(tabs)/_layout.tsx` `tabBarStyle: { display: "none" }`).
10. **MINOR — plan v2 §3** calls `utils-server/index.ts` "the only existing file touched" — scheduler/adminRbac/schema/services-hub/driver-home/h3.ts were all touched (context-scoped to WS, but the sentence over-claims).
11. **MINOR — route-group placement:** shipped groups nest under `app/(main)/(customer)/…` (e.g. `(customer)/(rental-marketplace)`), not `app/(main)/(rental-marketplace)/` as v1 §F.0 (normative) specifies; several screen files renamed/merged (`bidding.tsx`, `request-detail.tsx`, `bid-submit.tsx`, `[id].tsx` vs v1's enumerated names). Functionally equivalent routing, but the "close-out gate: screen-inventory diff against this section" (Phase 2b) could not have passed against v1's list.

## Severity-ranked defect list

**Critical**
1. Pick handler: §B.7 checks + FOR UPDATE outside the tx; unconditional fulfillment update; no in-tx `released_at` guard → F37 atomicity and §B.0 conditional-update primitive not actually implemented (race window: pick vs SLA sweep, and cross-vertical accepts).
2. Pick handler writes `assigned_by_user_id` = picked driver (wrong actor on every row; audit field corrupted).
3. "ALL PHASES COMPLETE" status claims (spec-v2 header line 17, plan-v2 header line 12) contradicted by missing courier UI/store, missing shop staff/RFQ screens, missing `useShopMemberStore`/`useRentalDriverStore`/`useDeliveryCourierStore`, and the nonexistent `app/api/delivery/requests/[id]+api.ts` listed in §I.

**Moderate**
4. §I "complete" modified-files list: omits `services-hub.tsx`, `(rider)/(tabs)/index.tsx`, `lib/h3.ts`; falsely includes `utils-server/types.ts` (never touched) and a file that doesn't exist (`delivery/requests/[id]+api.ts`).
5. v2 §A.3 delivery DDL ≠ shipped schema (renames, dropped/added columns; `deadline_at` undeclared anywhere in §A).
6. service_level: spec'd DB CHECKs + NOT NULL absent in code (all three tables), handler-enforced only.
7. Pick endpoint error codes diverge from §C.2 contract (404 vs 403, different machine codes).
8. `PERMISSION_ROLES` cited as a referenceable export; it is module-private.
9. §0.3.10(b) VERIFY-AT-IMPL now resolvable: `jest.config.js` does not exist (config in `package.json`) — spec's pointer was wrong.

**Cosmetic**
10. Enum value ordering (`rental_vehicle_type`), route-group nesting vs v1 §F.0, screen-file renames, `requireCourier` opts param, plan §3 "only existing file touched" phrasing, `emergency_status` implemented as a pgEnum where §A.5 says "text" (values match; extra `cancel_reason` column on `emergency_requests` beyond both specs — additive).

Everything else checked — §E.1 guard, scheduler ledger (57 jobs, 46–56 correct, F34 predicate literal in `sweepDeadlines`), F5 demotion write-set, F45 fleet-ack branch, ruling-6 force-withdraw scope, F38 complete-principal, marketplace.write RBAC (`['owner','admin']`, dot-convention, moderator/ops_manager excluded), migrations 0048–0052, integer-paisa discipline, enum non-collision, admin screens incl. service-zones/couriers, WS namespace branches in `index.ts`, `isVerticalEnabled` — **verified clean against the files**.