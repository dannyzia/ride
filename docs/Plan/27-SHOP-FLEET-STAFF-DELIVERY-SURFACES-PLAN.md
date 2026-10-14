# Shop · Fleet Owner · Staff · Delivery Man — Launch Surfaces Plan

**Purpose:**     The complete build plan for the 4 public launch roles (Customer, Driver, Shop Owner, Fleet Owner) + Delivery Man + shop/fleet staff accounts, with database, API, backend, admin, and frontend implications. The coding model builds from THIS document; the orchestrator audits against it.
**Owner:**       Orchestrator (plan) — Coding model (execution)
**Status:**      IN PROGRESS (2026-10-12 — build started; §11 review corrections are BINDING amendments)
**Source of truth:** this file. Owner rulings reproduced verbatim in §0.
**Related (concrete paths):**
  - `docs/FeatureList/FEATURES.md` — feature inventory; v26 "In development" section mirrors §1–§8
  - `plans/maestro-architecture.md` — §4 Feature Coverage Matrix, §17 paths, §20 gates
  - `maestro/COVERAGE-MANIFEST.md` — 254-screen / 1,083-element ground truth this plan extends
  - `lib/shopDeliveryBridge.ts` — existing food→delivery bridge (§6 extends its leg storage — R8)
  - `lib/fleetAssignment.ts` — sole writer of fleet/vehicle assignment pointers
  - `tests/concurrency/scratch-db-url.ts` — scratch-only DB policy for harnesses
  - `app/api/fleet/*`, `app/api/fleets/*` — existing fleet endpoints to extend, never duplicate (D6)
  - `AGENTS.md` — binding rules (money=paisa, i18n, guards, managed workflow)
**Last verified:** 2026-10-12, by Orchestrator — walked every persona's screens on disk; §11 review corrections applied.
**How to update:** owner rulings land as §0 amendments; review findings land as §11 entries; the coding model never edits this file except appending STEP notes at the bottom.

---

## §0 OWNER RULINGS (verbatim, binding — 2026-10-12)

1. Workshop = BOTH: sells products (delivered by courier) AND bookable service slots. Make it easy — two types of shops for LISTING: **Restaurant** and **Other type** — just listed differently.
2. Staff accounts: **always yes** — shop staff at minimum orders-only; fleet owner staff as well.
3. Everyone can buy everything — no role-restricted visibility. Shops are **categorized** (Restaurant, Vehicle Parts and Workshops, General and Grocery, …) and **the database must let the admin add more shop types later** — listed differently per category.
4. There is a **good morning / good day screen** where every type of thing is listed.
5. **The Delivery Man is a role** who does ALL delivery — food or any shop items, regardless.
6. **Both Driver and Delivery Man can deliver.**
7. Platform staff logins are separate (/admin, web-only) — not part of the public role model.
8. **Register screen: the user SEES buttons to register as different roles** (one screen, role choice visible).
9. **Login screen: NO "login as" initially. After OTP, if the account holds MULTIPLE roles, show "Login as [Role]" buttons; a single-role account lands directly.** (⇒ multi-role accounts are supported: a shop owner adds the Customer role and orders food from the same phone number.)

## §1 DATA MODEL

- NEW `shop_types` (admin-extensible lookup — NOT an enum): id, slug unique, label_en, label_bn, is_restaurant bool, sort_order, active. Seed: restaurant, vehicle_parts_workshop, grocery_general. Admin CRUD (§7) — new types auto-appear on the good-morning screen.
- NEW `shops`: id, owner_user_id → users, name, shop_type_id, address, lat/lng, license_url, status (pending→verified→suspended), **open/closed toggle** (R5), rating fields (deferred display, §11 D-defers), soft delete, timestamps.
- NEW `shop_staff`: id, shop_id, user_id (unique per shop), role `manager|staff` (R10 — never 'owner'), invited_by, status.
- NEW `shop_products`: id, shop_id, name, description, price_bdt (integer paisa), image_url (R2 pipeline), available bool, soft delete.
- NEW `order_items`: order_id, product_id, qty, unit_price_bdt **snapshotted at order time**.
- NEW `workshop_services`: id, shop_id, name, description, price_bdt, duration_minutes.
- NEW `workshop_requests` (R4 simplification — no slot-capacity grid): id, shop_id, service_id, customer_user_id, requested_at_window (date + time range), note, status (requested→confirmed→in_progress→done), order linkage.
- NEW `deliveries` — THE ONE universal legs table: id, source_vertical (food_order|shop_order|workshop_product), order_id, pickup shop ref, dropoff customer ref + lat/lng, delivery_fee_bdt (integer), status (created→offered→accepted→picked_up→delivered→failed), delivery_man_user_id nullable, timestamps. Extends/absorbs the existing food-bridge leg storage (R8 — audit `lib/shopDeliveryBridge.ts` first; extend, never duplicate).
- `users.role` enum: ADD `shop_owner`, `fleet_owner`, `delivery_man` (keep rider/driver/admin/owner/ops_manager/moderator). **ALTER TYPE ADD VALUE ships as its own migration file** (new value unusable in the adding transaction).
- NEW `user_roles` (multi-role accounts — OWNER-DECISION #8/#9, refined by the
  identity ruling): the LOGICAL key is **phone | role** (one login number, many
  roles); the PHYSICAL key is the **system-assigned internal User ID** —
  user_roles (id, user_id → users.id, role, UNIQUE(user_id, role)). users.phone
  stays the unique LOGIN identity; users.id is the internal key EVERYTHING else
  references (orders, shops, fleets, deliveries, ledgers — never phone). Roles
  belong to the ACCOUNT (internal ID), so a future phone-number change keeps
  every role. Users may see their internal ID (profile/settings, optional) but
  need not care. Seeded from users.role for existing rows; users.role remains
  the primary/default role (requireRole legacy checks + default landing).
  Per-role approval state lives in each role's own table (drivers.status,
  shops.status, fleets) — user_roles holds membership only. Same RLS/FORCE/
  REVOKE posture + probe as every new table.
- EVERY new table ships in the same migration with: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + `REVOKE ALL ON <table> FROM anon, authenticated` — Supabase default privileges re-grant new tables to anon/authenticated, which would silently regress this week's zero-grant posture. Post-migration probe: forced ✓, grants 0.
- Conventions: created_at/updated_at everywhere; soft delete on shops/shop_products; shop_staff uses removed_at; deliveries is status-mutating (no hard deletes); deliveries gets pickup+dropoff lat/lng + composite indexes for the nearby query (bounding-box SQL, no new geo dependency).
- D6 EXTEND-VS-CREATE AUDIT (first task of S1): inventory existing V3/V4 marketplace tables (shop orders, RFQ, delivery legs, rental bids) — extend where they serve; duplicate tables are a defect. The before/after inventory lands in this file.

### §1.1 D6 extend-vs-create decision table (builder append — S1; verified against src/db/schema.ts + lib/shopDeliveryBridge.ts)

| Existing table / artifact (before) | Verdict | After (S1) |
|---|---|---|
| `shops` (0048) — owner, name, slug, status varchar(active\|suspended\|closed), is_verified, lat/lng | **EXTEND** | + `shop_type_id` FK, `license_url`, `food_safety_cert_url`, `rating`/`rating_count` (storage only — display deferred per §11), + `is_open` (R5), index on type |
| `shop_members` (0048) — unique(shop,user), role OWNER/MANAGER/STAFF, `removed_at` | **EXTEND — IS the §1 `shop_staff`** | NOT recreated; + `invited_by` FK; R10: staff invites use MANAGER/STAFF only, `'owner'` never invited (`shops.owner_user_id` is the owner); S3 enforces orders-only server-side |
| `shop_products` (0048) — name, `price_bdt` paisa, `image_urls`, `is_active`, `stock`, `deleted_at` | **EXTEND — serves as-is** | no DDL: `image_urls` (jsonb, multi) ⊇ §1 `image_url`; `is_active` = §1 `available`; soft delete ✓ |
| `shop_orders` + `shop_order_status` (0048) — pending→accepted→preparing→ready_for_pickup→out_for_delivery→delivered | **EXTEND** | + `order_kind` (catalog\|service_booking); booking states added in 0058; `slot_id` was added then **REMOVED** (R4 superseded the slot grid) |
| `shop_order_items` (0048) — qty, `unit_price_bdt` snapshot, `line_total_bdt` | **EXTEND — serves as-is** | no DDL: price snapshot at order time already implemented |
| `shop_rfqs` (0048) — custom quotes, quoted price | **KEEP** | unchanged — RFQ stays a separate order kind alongside the catalog flow (D2) |
| `lib/shopDeliveryBridge.ts` (V4) — declared sole writer of food legs; creates `delivery_requests` idempotent on `source_shop_order_id` (bid window from `food_delivery_bidding_window_seconds`) | **EXTEND (R8 absorb target)** | S4 rewires `createFromShopOrder` to insert into `deliveries` (source_vertical=food_order, status created, fixed customer-paid fee) — bridge remains the sole order→leg writer; `delivery_requests` keeps the manual RFQ/bid courier flow only. `deliveries` is the ONE legs table after absorb, not a parallel one |
| `delivery_requests` / `delivery_bids` / `delivery_legs` (0050) — RFQ deadline + courier bids + trip lifecycle | **KEEP** | unchanged: custom-quote courier flow (D2). Order-derived legs migrate to `deliveries` at S4 absorb; no per-vertical leg tables anywhere |
| `couriers` (0050) — parcel/food capability, presence, online | **KEEP** | unchanged: delivery-man identity lives in `users.role = 'delivery_man'` (new signup path), capability rows stay here |
| `rental_requests` / `rental_bids` / `awarded_bid_assignments` / `fleet_service_zones` / `rental_request_events` (0049) | **KEEP** | unchanged — S5 builds the fleet-owner UI over this machinery; `fleet_members.DISPATCHER` is the §4 dispatcher role |
| `ambulance_certifications` / `emergency_requests` (0052) | **KEEP** | out of S1 scope (existing V7 machinery reused by S5) |
| `users.role` enum | **EXTEND** | + `shop_owner`, `fleet_owner`, `delivery_man` — own migration file 0058 (D5); existing rows untouched |
| `audit_logs` (fleet era) | **REUSE** | A3/A5 admin writes (shop-types CRUD) go here — no new audit table |
| §12 `shop_ledger` (R1) | **CREATE — NOT in S1** | money tables land with the order-flow stage (S3/S4) that produces the money events; S1 order scope does not list it |

**New tables created (S1):** `shop_types`, `workshop_services`, `workshop_requests`, `deliveries` — each with ENABLE+FORCE RLS + `REVOKE ALL ... FROM anon, authenticated` in its own migration file (D1).
**Created then removed:** `workshop_slots` + `shop_orders.slot_id` — built before the §11 review corrections landed; R4 replaced the slot-capacity grid with `workshop_requests` (requested window + shop confirm). Dropped in 0061; dev DB reverted cleanly.

**Divergences recorded (ruling wins — recorded, never silently reconciled):**
1. `shops.status` stays **varchar** (6 live verticals query `'active'|'suspended'|'closed'`). Mapping to §1 `pending→verified→suspended`: pending = `'pending'` & !is_verified · verified = `'active'` & is_verified · suspended = `'suspended'`.
2. `deliveries.source_vertical` values: §1 lists `food_order|shop_order|workshop_product` — built as such (0061 adds `workshop_product`, renames the column from the earlier `source`); `parcel` retained because §6 feeds parcels from the same table; the superseded `workshop_booking` value (original mission text, pre-R4) remains in the enum but is never emitted.
3. `shop_order_status` gained `booked|confirmed|in_progress|done` in 0058 (original mission B2 wording); per R4 the authoritative booking states now live on `workshop_requests.status` (`requested→confirmed→in_progress→done`) — the extra enum values are reserved for the linked `shop_orders(order_kind='service_booking')` row and cannot be removed from Postgres.

## §2 AUTH + ONBOARDING (OWNER-DECISION #8/#9 — register role buttons, login-as chooser)

Shared phone-OTP auth. **Register screen shows visible role buttons** — Customer ·
Driver · Shop Owner · Fleet Owner · Delivery Man — one screen, five choices; each
button opens that role's onboarding wizard (a/b unchanged, c/d/e NEW):
a. **Customer** — instant, no verification.
b. **Driver** — existing driver wizard → documents → admin verifies.
c. **Shop Owner**: shop profile (name, category, address, location) → trade
   license (+ food-safety cert if restaurant) → pending → admin verifies → live.
d. **Fleet Owner**: business profile → fleet docs → pending → admin verifies →
   fleet + OWNER membership → dashboard.
e. **Delivery Man**: profile + NID/license + vehicle note → pending → admin
   verifies → active.
Every path writes user_roles (§1) + users.role (first role = primary).

**Login: phone → OTP → role routing.** Single-role account lands directly in its
surface. Multi-role account → "Login as [Role]" buttons (only roles the account
actually holds). "Add a role" lives in Profile/Settings (a shop owner adding
Customer is instant; adding Driver/Shop/Fleet/Delivery goes through that role's
verification gate). At launch, switching happens at login — no in-app mode
switcher (future feature).

Admin verification queues (§7): shop licenses (+food cert), fleet business docs,
delivery-man NID/license — the driver-documents queue pattern, reason surfaces
to the applicant (R6). Existing-customer upgrades on invite: R9 role expansion.
Platform staff: unchanged, web /admin, seeded — out of scope.

## §3 SHOP OWNER SURFACE (in-app, phone)

- Dashboard: orders by state — created → accepted → preparing → ready → picked_up → delivered; service bookings: requested → confirmed → in_progress → done. Accept/reject with reason, mark-ready. Realtime via WS (§B1).
- **R5 Open/Closed toggle**: closed = server rejects new orders for that shop (not just UI hiding).
- Catalog: products CRUD (name, price paisa, image via the R2+WebP pipeline, availability toggle).
- Workshop shops: workshop_services CRUD + workshop_requests inbox (confirm/complete). NO slot-capacity grid (R4).
- Staff: invite by phone → shop_staff row; staff = orders-only (accept/prepare/quote); NO catalog edit, NO payouts, NO staff management. Enforced server-side per route — the UI hiding buttons is not security.
- Payout method: reuses the existing payout-method management screens.
- Order-value money: integer paisa; totals computed server-side from the catalog snapshot.

## §4 FLEET OWNER SURFACE (in-app, phone)

- Fleet dashboard: my vehicles (existing add-vehicle flow), my drivers (R9 invite-by-phone with account upgrade; platform document verification still required — fleet assignment ≠ platform certification), rental requests feed → SUBMIT BID (real UI over the existing bid machinery — currently counterpart-API only), my bids + outcomes, 5-min SLA ack, ambulance requests → accept (existing V7 machinery), fleet statement (reuse commission-statement pattern).
- Fleet staff: invite DISPATCHER by phone → fleet_members(DISPATCHER). Server-side scoping: assignments/dispatch allowed; payouts/withdrawals and staff management stay OWNER|MANAGER (extend the existing role arrays in app/api/fleet/*).

## §5 CUSTOMER — GOOD MORNING SCREEN + LISTINGS

- **R3 — the ride booking home is NEVER buried.** The good-morning rework ADDS the shop section to the existing customer home: greeting by time of day + shop-category tiles (from shop_types — new admin categories appear automatically) BESIDE the ride booking surface.
- Listing rule: restaurants get the food-ordering UX; every other category gets the catalog UX (driven by shop_types.is_restaurant). Zia's "listed differently" ✓.
- Workshop shops: product ordering AND service-request booking in the same shop screen.
- **R2 — universal shopping:** the shop listing/section is reachable from EVERY role's app (customer home, shop-owner app, fleet app, driver app, delivery-man app each get a Shops section). "Everyone can buy everything" and "even a shop owner can see a restaurant" require cross-role access, not just the customer app.
- Checkout: catalog cart (items, qty, shop subtotal, delivery fee, COD total — F5); COD at launch (B3); workshop service request = requested window + confirm (R4).
- Order tracking screen for the customer (created → accepted → preparing → ready → picked_up → delivered).

## §6.1 DELIVERY DISPATCH — THE ORDER FLOW (OWNER-DECISION 2026-10-12; supersedes the §6 broadcast feed and RETIRES the courier-bidding marketplace)

Current state verified on disk (2026-10-12): the acceptance/dispatch flow does NOT exist. Today the food bridge inserts a `pending` row into `delivery_requests` for couriers to BID on (RFQ marketplace, 0050). This amendment replaces that model.

**THE FLOW (binding, for ALL categories and for P2P):**
1. Order placed → **shop receives it** (dashboard + notification).
2. Shop "Find courier" → **the SYSTEM SUGGESTS the best** candidates (ranking default: nearest to shop → rating → subscription-active; tunable later).
3. **Dispatch to the top suggestion with FULL details**: shop name, pickup location, **customer contact number**, dropoff, **order value**, delivery fee.
4. Courier/driver **ACCEPTS** → **shop notified** (courier assigned) → **customer notified** (courier assigned).
5. Shop **confirms** the assignment → prepares the item.
6. Courier **receives the item → "Picked up" entry in the system** → shop notified (handed over) → customer notified (picked up).
7. Delivered → entry → shop + customer notified.
**Rejection:** the first courier REJECTS → the system dispatches to the NEXT suggestion (sequential, one offer at a time — the ride-dispatch pattern; never broadcast).
**Exhaustion:** no courier accepts (chain exhausted / nobody online) → **the SHOP CHOOSES: self-deliver** (marks delivered-self, keeps the delivery fee, no courier involved) **or CANCEL** the order (customer notified, ledger reversal per §12).

**P2P (no separate parcel vertical):** the SAME flow, originated by ANY ROLE (not just shops) — sender enters pickup, dropoff, item note; dispatch to delivery men/drivers identically. The standalone courier-bidding parcel machinery (delivery_requests / delivery_bids / couriers, migration 0050) is **RETIRED** — D6 verdicts flip KEEP→RETIRE; the manifest COUNTERPART-API courier rows retire; the customer (delivery) screens pivot to P2P origination.
Eligibility unchanged: Delivery Men (always) + Drivers (Deliveries toggle ON); ranking pool = both roles; first-accept-wins replaced by **sequential single-offer dispatch** (Amendment 2's first-accept wording superseded — no race, the offer goes to ONE at a time).
Notifications: every transition (assigned, confirmed, picked up, delivered, cancelled) notifies the relevant parties — instantiating F4 for deliveries.

**Defaults CONFIRMED by owner (2026-10-12):** ranking = nearest-first; P2P delivery fee = same ৳80/120 tiers by distance, paid in **cash by the receiver on delivery** (payments descoped); shop self-delivery keeps the customer's delivery fee.

**Retired:** `delivery_requests`, `delivery_bids`, `couriers` (0050) — archive/drop at S4; `shop_orders` gains the assignment states (dispatched → courier_assigned → picked_up → delivered | self_delivered | cancelled). Delivery-man surface becomes the **dispatched-offers inbox** (accept/reject) + active delivery — the §6 passive feed is superseded.

## §6 DELIVERY MAN (universal role — signup path stands; the passive feed below is SUPERSEDED by §6.1)

*What remains binding here: the signup/verification path and the universal eligibility (all verticals, both roles — via §6.1). The passive "offer feed" wording is superseded by §6.1's dispatched-offers inbox.*

- Signup path (e): onboarding → admin verification → active. Feed: ALL legs regardless of source vertical (food, shop items, workshop products, parcels) — never filtered by source (owner ruling).
- **Amendment 2:** drivers with the Deliveries toggle ON see the same feed; first-accept-wins across both roles; single-claim constraint server-side; drivers default OFF (never interrupt an active ride).
- No ride-dispatch machinery involved: no chain, no debit-on-offer. WS leg offers (§B1) → accept → picked_up → delivered.
- **R7 final-failure path:** if no one accepts within the leg TTL, the leg expires → customer is notified → order auto-cancels past the cutoff → ledger reversal per §12.
- Earnings: delivery fee minus platform commission (integer paisa, server-computed from the platform_config keys in D4) → earnings screens as a new source type; COD remittance dues per §12.

## §7 ADMIN PANEL ADDITIONS (web, English-only per convention)

- Verification queues: shop licenses (+food cert), fleet business docs, delivery-man NID/license — the existing driver-documents queue pattern (approve/reject with reason; reason surfaces to the applicant per R6).
- Shop types management: add/edit/deactivate categories.
- Shops + fleets listings with suspend/restore.
- **A1 Order browser:** read-across all marketplace orders/bookings + force-cancel with reason (dispute handling). No live-order editing.
- **A2 RBAC:** every new admin endpoint registers in the adminRbac permission catalog and enforces it; ops_manager/moderator default to read-only on the new queues.
- **A3 Audit:** every verification/suspension/force-cancel writes audit_logs; the reason surfaces to the affected user in-app.
- **A5 Monitoring:** pending shop verifications, pending fleet verifications, active shops, delivery legs today, delivery men online — read-only rows in the existing monitoring screen.
- **A6 Playwright lane:** new admin screens are Playwright-tested (admin is English-only; no locale keys for admin surfaces).

## §8 QUALITY BARS (every item above)

Money integer paisa; totals server-computed from snapshots; every API route parseJsonBody + Zod + role guard + flat Expo params + error format {error, message}; idempotency keys on order placement / bid submit / leg accept; i18n en+bn on every user-visible string (total guard); no console.log (logger); no any; Drizzle snake_case, isNull/isNotNull, transactions on multi-table writes; route-qualified testIDs; flows + coverage-manifest rows + locale keys for EVERY new screen; guards (router, i18n, vacuous, flow-xcheck, flow-currency) stay green.

## §9 SEQUENCING (each stage: gates green + report + Zia GO before next)

S1 data model + migrations + seeds + D6 audit + admin shop-types API
S2 auth expansion (5 paths) + admin verification queues
S2 also carries the multi-role account UX (OWNER-DECISION #8/#9): register role
buttons, post-OTP "Login as [Role]" chooser for multi-role accounts, direct
landing for single-role, add-a-role from Settings. Unit tests: chooser shows
exactly the held roles; single-role never sees it; add-role gates apply.
S3 shop owner surface (dashboard, catalog, workshop requests, staff)
S4 customer good-morning + listings + checkout + order flow end-to-end (order → accept → preparing → ready → leg → delivered)
S5 fleet owner surface + dispatcher staff
S6 delivery man surface (feed, accept, complete) + both-roles toggle
S7 flow suite for all new screens + manifest + locale audits

## §10 ACCEPTANCE (device-day gate addition)

Per persona, IN THE UI: customer orders food from a restaurant (delivered); customer buys grocery items (delivered); customer books a workshop service; customer buys lubricants from a Vehicle Parts shop; shop staff accepts + marks ready (staff account, orders-only proven); fleet owner submits + wins a rental bid; dispatcher attempts a payout → BLOCKED server-side (prove it); delivery man completes THREE deliveries from three different verticals in one session; a DRIVER (toggle ON) completes one delivery; **a multi-role account (shop owner + customer) orders food from its own login via the Login-as chooser**. Every journey green ×2. Payments stay descoped (COD at launch).

## §11 HARD-LOOK REVIEW (2026-10-12 — orchestrator second pass; findings BINDING)

- **R1 SHOP SETTLEMENT LEDGER (was missing — the largest financial gap).** COD means the courier collects items + fee in cash ON BEHALF OF THE SHOP. That cash is the shop's revenue → the platform owes the shop (minus shop commission), and the courier owes the platform the remittance. NEW: `shop_ledger` (append-only: order revenue credit, commission debit, payout debit, adjustment) + courier dues tracked via the existing due-amounts mechanism. Shop payout = settle the balance via the payout-method flow, admin-visible. Without this, shop money has no system of record. ADDED as §12.
- **R2 Universal shopping was contradicting one-role-per-account.** "Everyone can buy everything" is unimplementable if the shop listing lives only in the customer app and shop owners log into a dashboard. RESOLVED: R2 in §5 — every role's app carries the Shops section.
- **R3 Good-morning rework could gut the ride home.** Corrected in §5: ride booking stays the primary surface; shop categories are ADDED.
- **R4 Workshop slot-capacity grid violated "make it easy".** Simplified to requested-window + shop confirm (workshop_requests), no capacity bookkeeping.
- **R5 Shop open/closed missing.** Added (§3) with server-side rejection when closed.
- **R6 Rejection re-submission missing.** Added (§2).
- **R7 Leg final-failure path missing.** Added (§6).
- **R8 Food-bridge legs already exist.** Named explicitly: extend `lib/shopDeliveryBridge.ts` storage; do not create a parallel legs table (D6).
- **R9 Invite-of-existing-account edge case.** Added (§2): role expansion, never a second account.
- **R10 `shop_staff.role = 'owner'` collision.** Renamed manager|staff (§1) — 'owner' already means two different things in this codebase.
- **DEFERS requiring Zia's nod (recommended post-launch):** shop/delivery-man ratings (surfaces + storage), VAT on marketplace orders (the tax engine covers rides today), order promos/discounts. Flagged, not built.

## §12 SHOP SETTLEMENT + COURIER DUES (added by R1)

- `shop_ledger` (append-only, integer paisa): order_id, shop_id, entry_type (order_revenue | commission | payout | adjustment | reversal), amount, refs, timestamps. Order delivered → credit order_revenue (items total) + debit platform commission; courier hands over collected cash per the settlement cycle; admin/shop see balance in-app.
- Courier COD remittance: delivered leg credits delivery fee minus commission to the courier's earnings AND logs the collected-cash remittance due; settled via payout/due repayment (the existing due-amounts mechanism).
- Commission rates (OWNER-DECISION 2026-10-12, refined 2026-10-12: **launch DEFAULTS only — NOTHING hardcoded**): every rate/commission/fee lives in platform_config, is **fresh-read from the DB at request time (never cached, never a code constant — the values Zia quoted are initial seeds, not literals)**, and is **admin-editable via PATCH /api/admin/config with immediate effect, no deploy**. Keys: `delivery_commission_percent` = **0** · `delivery_fee_within_3km_bdt` = **8000** · `delivery_fee_beyond_3km_bdt` = **12000** · `delivery_fee_tier_radius_km` = **3** (customer-paid delivery fee: ৳80 within 3 km, ৳120 beyond) · `delivery_man_subscription_bdt_monthly` = **10000** (৳100/month delivery-man subscription) · plus `shop_commission_percent` for the marketplace (launch default 0). All admin-settable, server-computed, integer math. Couriers keep 100% of the delivery fee at launch (0% commission).

## §14 SUBSCRIPTION ENGINE — ROLE-BASED (OWNER-DECISION 2026-10-12)

- Subscription plans are **offered per role**, with **MULTIPLE roles selectable per
  plan** at creation. Subscribable target roles: `rider` (customer) · `driver` ·
  `shop_owner` · `fleet_owner_ambulance` · `fleet_owner_rental` · `delivery_man`
  (delivery_man added explicitly per the ৳100/month ruling — Zia's list omitted
  it; the priced plan needs its target).
- Fleet-owner plans target the FLEET TYPE (ambulance vs rental) — eligibility
  matches the user's fleet type, not just the account role.
- **Admin lifecycle: editable at any time · suspendable · deletable.**
  - Suspend = hidden from new purchases; existing subscriptions run to expiry.
  - Delete = soft delete (`deleted_at`); BLOCKED while active subscriptions
    reference the plan (offer migration of subscribers first).
- Eligibility at checkout: `plan.roles ∩ user's held roles (user_roles) ≠ ∅`
  (+ fleet-type match for fleet-owner plans).
- **VISIBILITY (owner ruling): the subscription listing is role-filtered — a
  plan is SHOWN ONLY to users holding one of its designated roles.** Server-side
  filter: the full catalog is never sent to a non-matching client (a rider never
  sees driver/delivery/shop/fleet plans, and vice versa). Multi-role accounts
  see the union of plans across their held roles.
- Launch interplay: payments are descoped, so NO plan collects money at launch —
  plans are CONFIGURED now and billing activates with `payments_enabled`.
  `launch_free` (drivers, ৳0) coexists as a plan with roles=[driver]; the
  delivery-man ৳100/month plan ships configured but comped/granted at launch
  until payments activate.
- Data model: `subscription_plans` gains `roles text[] NOT NULL` (migration 0062,
  additive, existing driver plans default to `{driver}`); admin plan screen gains
  the role multi-select + suspend/delete controls (§7). Fleet billing may
  continue on `fleet_subscription_plans` OR migrate onto this engine — decision
  at S5 with the extend-vs-create audit.
- NOTE the deliberate asymmetry: driver launch subscriptions are FREE (§0
  launch-free ruling); delivery men pay ৳100/month — both are just plans under
  this engine.
- Disputes/refunds at launch: admin force-cancel writes reversal entries (A1). VAT and promos: deferred (§11).

---

## §13 STAGE ORDERS (rhizome loop — one stage in flight; orchestrator verifies before advance)

Protocol: the builder claims the stage on the ORCHESTRATOR LOOP hub, posts `STEP <n>`
after every build step, `STAGE REPORT:` at stage end, `QUESTION:` when blocked.
The orchestrator verifies A-criteria ON DISK (migrations read line-by-line, posture
probes, gates re-run) before issuing the next stage. Business/money/irreversible →
`OWNER-DECISION:` via the orchestrator. No commit without Zia's GO (pathspec adds,
verify `--cached --stat`). Every stage ends with gates green: lint 0 errors ·
tsc clean · full jest · flow-xcheck · i18n guards.

- **S1 — Data model + migrations + seeds + admin shop-types API** (§1, §7 types API, D1-D6, R8/R10):
  D6 extend-vs-create audit table in this file BEFORE migrations; enum migration in
  its own file; every new table RLS forced + grants 0 in the same migration + probe;
  seeds; admin types CRUD with shoptypes.manage RBAC + audit_logs + tests.
  Acceptance: A1-A6 of the S1 order (§ below and hub copy). 
- **S2 — Auth expansion + verification queues** (§2, §7 queues): five signup paths,
  three new onboarding wizards (shop-owner, fleet-owner, delivery-man) with doc
  uploads → pending; admin queues follow the driver-documents pattern; R6
  reject-reason surfaces in-app; R9 invite upgrades existing accounts.
- **S3 — Shop Owner surface** (§3): dashboard, catalog, workshop_requests inbox,
  staff invite (orders-only enforced server-side), open/closed toggle, payouts link.
- **S4 — Customer good-morning + listings + checkout + end-to-end order flow**
  (§5, F1-F5, R2/R3): ride home preserved; category tiles from shop_types;
  restaurant vs catalog listing UX; catalog cart; workshop screen (products +
  service request); order → shop dashboard → leg → delivered trace.
- **S5 — Fleet Owner surface + dispatcher staff** (§4): dashboard extensions on the
  existing (fleet) group (inventory first), rental bids UI over the existing
  machinery, ambulance accept, dispatcher invite (no payouts), fleet statement.
- **S6 — Delivery Man surface + both-roles delivery** (§6.1): dispatched-offers
  inbox (system-ranked sequential offers with full details — shop, locations,
  contact, order value; reject → next; shop self-deliver/cancel fallback),
  accept → pickup entry → delivered, driver Deliveries toggle (default OFF),
  earnings source type.
- **S7 — Flow suite for every new screen + manifest + locale audits** (§8): flows
  in journey order, coverage-manifest rows for every new screen/element, both
  locale keys, admin Playwright lane flows for new admin surfaces.

---

## §15 FLOW-LIBRARY REVISION — REVIEW CONSOLIDATION (2026-10-12; five model reviews triaged by the orchestrator: Sonnet, Deepseek, Minimax, GLM, Qwen)

Input: USER-FLOWS.md (32 diagrams) reviewed by five models. Verdict: happy paths solid; failure paths, money custody, and role-edge cases need work. This §15 is the BINDING revision order — the builder applies it to USER-FLOWS.md + USER-FLOWS.html, then the orchestrator re-verifies. Plan §12 (settlement) already defines the money model; the diagrams now mirror it.

### A. ACCEPTED — structural corrections (apply to the library)

R-A1 **Shop order lifecycle unified** (resolves the F-11/F-16 contradiction):
Placed → shop Accept (with reason on reject; **shop-response timeout → auto-reject + customer notified**) → Preparing → **Dispatching (courier search triggers at prep start — couriers must not wait on unstarted food; shop MAY dispatch earlier by choice)** → CourierAssigned → ReadyForPickup → PickedUp → Delivered | Refused → Returned | Exhausted → SelfDelivery | CancelledByShop | CancelledByCustomer. All state transitions go THROUGH the dispatch system (actors trigger; the system records) — no actor-to-actor self-messages.
R-A2 **COD custody ledger in the diagrams** (mirrors plan §12 — the money gap all five models flagged): courier collects items + fee in cash → **courier cash-liability entry (+items, −fee earned)** → remittance step (to shop/platform) → reconciliation (match / short / dispute → admin queue) → shop settlement credit (items, 0% commission) → courier earnings (fee, 100%). New flow **F-33 · COD collection & remittance**; F-11 gains the amount-collected entry at Delivered.
R-A3 **F-04 ride dispatch exhaustion** (all four models flagged the infinite loop): offer budget → exhausted → **rider informed: keep waiting (radius expansion) or free-cancel**. Rider cancel edge from "Ride requested". Convert F-04 to a sequence diagram.
R-A4 **Rider visibility on driver-cancel** (F-06): rider notified + chooses free-cancel OR wait-for-re-dispatch (capped attempts); debit-on-offer REVERSED on driver-cancel; rider cancel fees route via ledger (§12).
R-A5 **Dedupe**: F-03 becomes the APPLICANT-side status flow (pending state screen, see R-A8); F-30 stays the admin-side queue. F-06 becomes canonical for no-show (both sides); F-25 becomes the driver-side view cross-referencing F-06.
R-A6 **SOS responder chain** (F-09): raised → acknowledged → responding → resolved | false-alarm; in-app status for the user; ack-timeout escalation; trusted-contact SMS/live-location (emergency contacts already exist, F-24); optional audio recording (config); admin false-alarm closure logged. Ride-dispatch batching exemption: SOS/offers/match notifications are NEVER batched.
R-A7 **Ambulance** (F-19): national emergency hotline (999) shown AT REQUEST TIME in parallel; explicit accept timeout — silence 60s → escalate next fleet (ambulance SLA must be tighter than rental's 5 min); en-route/on-scene status to requester.
R-A8 **Verification lifecycle completion**: applicant-side "My verification status" screen (received → under review → decision, structured reject reasons per field); expiry → warning → auto-suspend → re-submit; suspend/ban/revoke with audit_logs; 30-day no-decision auto-reject + re-apply path.
R-A9 **Config snapshotting** (F-32): fare/fee config is SNAPSHOTTED at quote/order creation — mid-flight admin edits never change a quoted price; config changes versioned + reversible; the stray orphan node E connected; units labeled (paisa) in the diagram.
R-A10 **Diagram grammar + format rules**: sequenceDiagram for time-critical handshakes (F-04, F-05, F-11, F-18); flowchart for state/branching; per-flow status badge in the title (✅ live / 🔨 in development / 💤 descoped); per-flow plan-section reference; a `[notify]` convention where F-29 is the notification spec; canonical terms in the legend (Courier = Delivery Man or Driver with Deliveries ON; roles taxonomy = 5 registrable + 2 invited sub-roles + internal admin); state-machine appendix for ride/order/leg/subscription/verification/SOS/dispute.

### B. ACCEPTED — per-flow corrections (apply to each diagram)

F-01/F-02: phone-exists branch → login · OTP resend + retry limit · max re-submissions then admin unblock · pending-role withdraw + data-purge · applicant sees held roles only (pending roles shown in the verification-status screen, NOT the chooser — Deepseek R-A8) · dispatcher appears in the Login-as chooser ONLY via fleet invite (invite-only sub-role — never a signup button).
F-04: vehicle-type selection + promo application BEFORE estimate · Barikoi geocode-fail → manual map pick · driver-arriving state · radius expansion on exhaustion.
F-05: shebang security — "app shows PIN to driver (one view)" · PIN-mismatch ×3 → lock + admin notify · mid-ride destination change + tolls/waiting (rider approves per policy) · change-making + driver cash-received confirmation · declare SYS participant · deviation explanation line on the breakdown (quoted X → final Y because…).
F-06/F-25: waiting-timer duration shown · geofence + minimum-wait evidence before no-show claims · rider dispute link.
F-07: PIN delivery to the booked-for passenger (SMS/code) · passenger SOS parity · scheduled-ride reminder T-30 · at-window entry without re-confirmation · cancel/edit scheduled.
F-08: report-message → moderation queue · system messages (arrived, OTP wrong) · offline indicator in-thread.
F-09: debounce on trigger (hold-to-confirm already) · escalation chain per A6.
F-10: 24h reporting window (shown on ride-detail) · masked direct-contact option for lost items before filing · both-party status visibility · admin SLA 72h.
F-11: F-12 link from Exhausted · accept-race single-claim (partial unique index — exists) · courier-offline mid-offer → re-dispatch · out-of-stock → partial order confirm with customer · customer address change before pickup · short-pay/overpay recording (F-33) · pickup handover QR/PIN (shop → courier) + delivery OTP (courier → customer) · order-tracking view for the customer.
F-12: retry/bump-fee before cancel · 30-min no-courier auto-cancel with notification · self-delivery verified (customer confirmation + dispute path).
F-13: reschedule + mutual no-show + done-confirmation by customer + service-job ledger entry (same settlement as F-11) · parts-vs-service split lanes.
F-14: prohibited-items declaration · declared-value cap + liability · proof of delivery (photo + OTP) · receiver-refusal → return-to-originator (return fee) · sender-pays option (cash at pickup) — default stays receiver-pays (owner-confirmed).
F-15: mid-delivery ride-offer → EXCLUDED (one active job at a time — explicit mutual exclusion) · courier ranking input = delivery rating (new: delivery rating flow) · subscription-expired → read-only inbox (no accept) · location-permission denied → forced offline with banner · carrying-rider → Deliveries auto-OFF.
F-16: owner/staff SPLIT views (staff: orders-only — accept/prepare/ready/handoff) · business-hours auto-schedule for open/closed · daily settlement cutoff · busy mode (throttle, not close).
F-17: single-fleet rule (reject invite if already in a fleet) · driver CONSENT on invite · leave-fleet (settle dues → return vehicle) · dispatcher permissions matrix.
F-18: zero-bids → relax class or cancel (customer notified) · bid withdraw · post-award cancel (fee per stage) · handover/return/damage/deposit lifecycle · "Demoted" relabeled customer-friendly.
F-20: comped-plan display shows GRANT SOURCE + expiry (drivers won't think it's broken) · payments-ON cutover: grace period for launch_free users · failed/abandoned checkout → pending state · idempotent callback.
F-21: launch settlement = cash repayment / admin entry (payout rail descoped) · overdue threshold → reminders → dispatch hold · statement export.
F-24: break auto-end after X hours (config) · break pauses BOTH offer types.
F-26: passes at launch = admin/promo-GRANTED only (purchase 💤 until payments ON) — usage flow stays; grant source shown.
F-29: SOS/offer/match notifications NEVER batched (A6) · per-category mutes · token revocation on logout/role switch.
F-30: bulk approve/reject · internal notes vs applicant-visible reason · SLA tracking.
F-31: force-cancel follows the F-12 ledger-reversal + notification pattern.
F-32: config validation (no negatives, no zero-radius) + change rollback.

### C. REJECTED (plan wins — do not implement)

C1 **Qwen: "Add surge multipliers"** — REJECTED. Surge was fully removed from this app by design; demand-pricing is handled by the existing zone-heat system (Fare Framework v6). Reinventing surge contradicts the fare architecture.
C2 **Sonnet: "Resolve D.1 before treating F-04 as final"** — REJECTED as out-of-scope. D.1 (WS-notification vs HTTP-mutation for RIDE dispatch) was settled by owner ruling (Option B: in-memory pattern retained). Plan 27's delivery dispatch is NEW scope in utils-server and does not reopen D.1.
C3 **Qwen: F-04 re-ordering that drops the flowchart form** — PARTIALLY REJECTED. The grammar rule (R-A10) moves F-04 to a sequence diagram, but Qwen's variant omits the cancel window and promo steps; the corrected sequence keeps them.

### D. DEFERRED (post-launch candidates — recorded, not built)

D-i T&C/privacy acceptance gate at signup (Qwen) — legal necessity; ACCEPTED as P0-lite: include in S2 auth expansion (one checkbox step), diagrams updated.
D-ii Fatigue management (12h force-offline, Qwen) — P2, config-gated.
D-iii Multi-role in one wizard (GLM) — P2; one role per wizard pass at launch.
D-iv Chat translation (Minimax) — P3.
D-v Hotspot anonymization (Deepseek) — the hotspot data is already aggregated/zone-level; note only.
D-vi Escalation tiers beyond 999 (Qwen ambulance) — operator process, not app scope.

### E. NEW FLOWS (added to the library in this revision)

F-33 COD collection & remittance (R-A2/R1 — mirrors plan §12) · F-34 Invite acceptance + staff/dispatcher day · F-35 Courier subscription & expiry gating · F-36 Account & device management (phone change, sessions, delete, data export) · F-37 My verification status (applicant side) · F-38 Cash receipt & dispute (cash-handshake + short-pay/dispute sub-flow) · State-machine appendix (ride, order, delivery leg, subscription, verification, SOS, dispute — canonical vocabulary).

### F. HYGIENE

Legend expanded (Courier definition · roles taxonomy · state vocabulary · [notify] convention · grammar rule) · per-flow status badge + plan reference + owner/verified stamps · coverage map de-overlapped (one primary plan section per diagram, secondary in parens) · HTML regenerated.

**Stage order: this revision is STAGE 2.5 (flow-library pass) — executed after S2's auth code lands, before S3 screen work consumes the diagrams. Gates: unchanged + a mermaid-syntax lint pass on all blocks.**

---

## §16 SKEPTIC-AUDIT REMEDIATION — S2.1 (2026-10-13; BLOCKS S3)

The code-skeptic audit of S1+S2 found 3 material defects + 6 moderates. Orchestrator verified all three material defects on disk (D-1 auth-gate routing `_layout.tsx:143-148`; D-2 oldest-fleet read `launchRoles.ts:239-253` + NATIVE mint `:115`; D-3 public `check-user` returning full heldRoles incl. reject details). **Disclosure:** the earlier S2 "advanced" verdict predates this audit and is superseded — S2 is REJECTED-with-remediation. S3 is BLOCKED until S2.1 verifies.

**S2.1 REMEDIATION ORDER (builder — before S3):**
1. **D-1 CHOOSER UNREACHABLE (§0 ruling #9 violated):** the auth gate routes on `users.role` alone and existing phones never reach otp-verify → a multi-role account NEVER sees the Login-as chooser (S2 acceptance unpassable). FIX: verify-token returns `heldRoles` (ACTIVE only); the auth gate routes `>1 active role → /(auth)/login-as`; single role → direct. Acceptance: a real login (password path AND OTP path) for a 2-role account lands on the chooser; 1-role accounts land direct.
2. **D-2 FLEET STATUS READ:** scope the fleet status query to the fleet created BY THE ROLE RECORD (store fleet_id on the role verification record or join fleet_members OWNER) — oldest-wins reads the implicit solo NATIVE fleet and reports wrong states. ALSO: business fleets mint as `fleet_type 'BUSINESS'` (not 'NATIVE') + backfill note.
3. **D-3 PUBLIC LEAK:** `check-user` (unauthenticated) returns full heldRoles incl. admin reject reason/code/field/example/resubmit_count/prefill. FIX: `{role, status}` pairs only; full payload stays behind authenticated `GET /api/user/roles`.
4. **M-1:** fleet approve (UPDATE fleet + INSERT membership + audit) wrapped in ONE transaction.
5. **M-5:** resubmit clears `verification_reject` alongside `verification_reason`; login-as resubmit deep-links to the PREFILLED wizard (never burns an attempt on unchanged docs).
6. **M-6:** password OUT of route params (register.tsx → wizards) — secure param, session state, or re-prompt inside the wizard.
7. **MINORS:** per-role static testIDs on the Login-as rows (never shared ids); dynamic testIDs replaced with static ones (map visibility); drop the dead `delivery_fee_default_bdt` row from dev; `shopStatus('closed')` surfaces a distinct label.

**PLAN AMENDMENTS (tracked, NOT S2.1):**
- **M-4 RULING (now, executes by S4):** delivery-man verification state is RE-HOMED off the `couriers` table (to user_roles-adjacent storage or a dedicated table) BEFORE `couriers` is dropped in S4. S2's shipped verification machinery must migrate, not break. The §1.1 KEEP verdict for `couriers`/`delivery_requests`/`delivery_bids` is SUPERSEDED by §6.1's retire for the parts S2 depends on.
- **M-2:** §14 remainder is MAPPED: role-filtered plan listing + checkout eligibility → S3 (shop) / S5 (fleet) / S6 (delivery); delivery-man ৳100/month plan seed → S6; admin plan screen role multi-select + suspend/delete → admin stage (S7). Added to §13 lines.
- **M-3:** admin order browser (A1) + monitoring rows (A5) → S7; a Playwright admin lane is created in S7 (none exists today).
- Minors (per-role testIDs excepted — that is S2.1 item 7): scratch-file cleanup and display approximations ride with later stages.

**ACCEPTANCE:** D-1/D-2/D-3 verified fixed by my own reads + runtime probe; M-1/M-5/M-6 fixed; multi-role acceptance (§10) now passes at real login. S3 starts only after my VERIFIED.

### STAGE 2 ORDER (detailed — S1 addendum + auth expansion)

Scope: four S1 leftovers, then auth expansion (plan §2 + OWNER-DECISION #8/#9).
Steps:
1. F1 — drizzle journal entries for 0057–0061 (idx 55–59, correct tags/when) so
   `drizzle-kit migrate` is deterministic again (fresh deploys currently skip
   these five files).
2. F2 — economics keys per OWNER-DECISION (values above): allow-list entries in
   lib/platformConfig.ts + seed rows in scripts/seed-platform-config.js +
   drop/repurpose delivery_fee_default_bdt (record which). **SEEDS, NOT
   CONSTANTS — every consumer fresh-reads these keys from platform_config at
   request time (never cached, never a number in code); admin edits take effect
   immediately, no deploy. A code-level constant for any of these values is a
   rejected stage.**
3. F3 — user_roles migration (id, user_id → users, role, UNIQUE(user_id, role))
   + RLS forced + grants 0 + posture probe + seed backfill from users.role.
4. F4 — subscription_plans.roles text[] NOT NULL DEFAULT '{driver}' (§14).
5. AUTH EXPANSION (§2): register role buttons (Customer/Driver/Shop Owner/Fleet
   Owner/Delivery Man) + three new onboarding wizards with doc uploads →
   pending; post-OTP "Login as [Role]" chooser for multi-role accounts,
   single-role direct landing; "Add a role" in Settings (verification-gated).
6. ADMIN VERIFICATION QUEUES (§7): shop licenses (+food cert), fleet business
   docs, delivery-man NID/license — driver-documents queue pattern, audit_logs
   (A3), reject-reason surfaces to the applicant in-app (R6).
Acceptance: five signup paths end-to-end on the emulator; a multi-role account
(shop owner + customer on one phone) sees the Login-as chooser; a customer
adding Shop Owner lands in pending until admin approval; admin queues
approve/reject with the reason surfacing in-app; F1–F4 verified on disk by the
orchestrator; stage-order rule above (seeds-not-constants) asserted in a test
(grep-style: no literal rate constants in lib/ code paths).
Evidence: migrations + probe output, wizard screenshots, queue admin flow,
jest summary lines, lint/tsc.

ACCEPTANCE FOR THE WHOLE PLAN = §10. Payments stay descoped (COD). Stage orders are
amended only by owner rulings through the orchestrator.

---

## BUILDER STEP NOTES (S1 — appended per the header rule; orchestrator verifies A1–A6)

**STEP 1 — D6 audit + Plan-27 reconciliation (A1).** §1.1 decision table appended
above, every existing V3/V4 marketplace table classified extend/create/keep, R8
bridge audit row included (lib/shopDeliveryBridge.ts remains the sole order→leg
writer; absorb into `deliveries` is S4 work). Reconciled schema to §11 corrections:
R4 workshop_slots dropped → `workshop_requests` created; R5 `shops.is_open`;
`shop_members.invited_by` (R10 noted); `deliveries.source_vertical` +
`workshop_product` (0060) + `dropoff_user_id`.

**STEP 2 — migrations (A3/A4).** Files: 0058 (user_role ×3 + booking states, own
file per D5) · 0059 (shop_types + seed, shops/shop_orders extensions,
workshop_services, workshop_slots, deliveries + D1 RLS) · 0060 (delivery_source
+= workshop_product, own file) · 0061 (workshop_requests + RLS, is_open,
invited_by, dropoff_user_id, conditional source→source_vertical rename, slot-grid
drop). All applied on the dev DB; probe: user_role=9 values with existing rows
untouched (rider 2 / driver 1 / admin 3), shop_order_status=12,
workshop_request_status=4, shop_types seeds=3, 4/4 new tables RLS
enabled+forced, anon/auth grants=0, workshop_slots absent.

**STEP 3 — A2 fresh-scratch verification (defect found + fixed).** Fresh DB
`ride_s1_scratch` on the cluster (URL file: .env.s1scratch.local, gitignored):
`drizzle-kit push --force` built the full schema from schema.ts exit 0, then
0058→0061 replayed **twice** (idempotence) exit 0. First replay failed on 0061's
unconditional `RENAME COLUMN source` (push-built DB already has
`source_vertical`) — fixed to a conditional DO block; after the fix the fresh-DB
probe is ALL GREEN (posture 4/4 forced, grants 0, seeds 3, slot grid absent,
source_vertical present, no `source` leftover).

**STEP 4 — gates (A5/A6 evidence).** `npm run lint` → 0 errors, 435 warnings
(unchanged baseline), exit 0 · `npx tsc --noEmit` → exit 0 · `npx jest
--watchAll=false` (FULL) → **200 suites passed, 4 skipped (pre-existing), 0
failed; 2,552 tests passed**, exit 0 · check:vacuous clean · check:date-in-sql
clean (518 files) · check:i18n-orphans clean (no new orphans) · flow-xcheck
N/A (no maestro flow changes in S1). A5 suite: tests/api/admin/shop-types.test.ts
22/22 (RBAC matrix real-role, 401 missing-auth, 403 moderator/ops_manager,
409 duplicate slug, 400 uuid/body, 404 unknown id, audit_logs payloads for
create/update/deactivate).

**Not built here (deliberately, out of S1 scope):** §12 shop_ledger (lands with
the order-flow stage), R8 bridge rewire (S4), verification queues (S2), screens
(first device gate = §10 acceptance). **HOLD for orchestrator verification
before S2.**

---

## BUILDER STEP NOTES (S2.1 remediation — appended per the header rule; orchestrator verifies D-1/D-2/D-3 + M-1/M-5/M-6 + runtime)

**STEP 1 (S2.1) — D-2 fleet status read + BUSINESS mint.**
Migration `src/db/migrations/0066_fleet_business_type.sql` (journal idx 64): `ALTER TYPE "fleet_type" ADD VALUE 'BUSINESS'` as its own statement (D5) + backfill (role-minted fleets = trade_license_url IS NOT NULL, NATIVE → BUSINESS). Applied to the dev DB through a one-off DNS workaround (internal resolver SERVFAILs the pooler host; resolved via 8.8.8.8, script deleted after use): both statements ok, enum_range = NATIVE|EXTERNAL|HYBRID|BUSINESS, backfilled role fleets = 0 (none existed), implicit solo NATIVE = 2 (unmoved). `schema.ts` fleetTypeEnum += BUSINESS; `lib/launchRoles.ts` createRoleRecord(fleet_owner) mints BUSINESS; heldRoles' fleet query scoped to `owner = caller AND fleet_type = 'BUSINESS'` — the fleet created BY THE ROLE RECORD; oldest-wins read of the implicit solo NATIVE fleet eliminated.

**STEP 2 (S2.1) — M-1 transactional approve + M-5 server + D-3.**
`lib/roleVerification.ts` approve() fleet branch: UPDATE fleet + INSERT fleetMembers OWNER + audit_logs write in ONE `db.transaction`; the in-tx audit insert does NOT swallow (a failed compliance write rolls the decision back). `resubmit(userId, kind, updates?)`: clears `verification_reject` alongside `verification_reason` in ALL THREE branches, and applies the wizard's edited fields (RoleRecordPayload shape reused from launchRoles; shops.name re-derives the UNIQUE slug). `app/api/user/roles/resubmit+api.ts` accepts the same payload keys as POST /api/user/roles (Zod, same shapes); only the kind's own object applies. D-3: `check-user` returns `{role, status}` pairs ONLY; full payload remains behind authenticated GET /api/user/roles.

**STEP 3 (S2.1) — D-1 chooser reachable, both gates.**
`verify-token` now returns `active_roles: string[]` (ACTIVE-only projection of heldRoles; pending/rejected roles can never gate-redirect into the chooser). Auth gate (`app/_layout.tsx`) and splash forwarder (`app/index.tsx`) route `>1 active role → /(auth)/login-as?phone=…`, single role → role surface (unchanged). OTP path (`§2 phone → OTP → role routing`): phone-entry REGISTER with an existing phone holding >1 roles pushes otp-verify instead of erroring; otp-verify routes an EXISTING account to the password screen (register branch was a duplicate-phone API error) — SIGNED_IN fires there and the gate lands the chooser with a live session. Note (physics, disclosed): the dpRelay OTP proves phone ownership only; NO passwordless session mint exists in supabase-js 2.108 (generateLink is email-only), so the OTP path completes on the password screen and the CHOOSER itself is always session-ful. login-as reworked: primary data = authenticated GET /api/user/roles (reject details + prefill for the deep-link), public check-user pairs as session-less display fallback; resubmit button deep-links `mode=resubmit&resubmit=1` into the prefilled wizard (M-5 client) — the attempt is burned by the wizard's submit carrying fixes, never by tapping the button; five explicit role rows with static per-role testIDs.

**STEP 4 (S2.1) — M-6 + minors + gates.**
M-6: `lib/registrationHandoff.ts` (in-memory, peek/clear — StrictMode-safe); register.tsx sets it before pushing a wizard (name/password OUT of route params, phone+role remain); the three wizards re-prompt (bounce back to register) when the handoff is missing, and clear it after the account is created. Minors: per-role static testIDs everywhere (login-as five rows `login-as.enter-*`, add-role `add-role.row-*` / `add-role.add-*`, shop types keyed map for the 3 seeded slugs — admin-created categories render without one); `shopStatus('closed')` → distinct `RoleStatus` value `closed` + `auth.login_as.status_closed` labels; dead `delivery_fee_default_bdt` verified ABSENT from allowlist, seed file AND dev DB (0 deleted, 0 remaining — tombstone comments only; nothing to drop). i18n: new keys en+bn (status_closed, session_less_hint, resubmitted_title/body ×3); the rewrite orphaned `auth.login_as.resubmitting` → purged from both locales + baseline via scripts/purge-orphan-keys.cjs --new (1647 → 1646). testid map regenerated (1,139 ids / 221 screens).

**STEP 5 (S2.1) — gates.**
`npm run lint` → 0 errors; the 19 touched files lint 0-warnings/0-errors under the legacy env; repo-wide warnings are pre-existing pool (441-446 fluctuates with the full-repo run order — the S1 435 baseline is no longer reproducible exactly; NOT introduced by this change). `npx tsc --noEmit` → exit 0. Full `npx jest --watchAll=false` → 203 suites passed / 0 failed (4 skipped pre-existing), 2,580 tests passed (9 pre-existing skips) — after updating auth-routes (verify-token shapes), multi-role (D-3 pairs-only assertion), verification (db.transaction in the mock reusing the same queues). check:i18n-orphans gate clean (96 baselined, none new). app/api/register flow sign-in gap (wizard register-mode replace-home without a session) PRE-EXISTS and is untouched — flagged for S3.

**Runtime acceptance (left to the orchestrator's probe):** password path = phone-entry LOGIN → password → gate → chooser for a 2-role account; OTP path = phone-entry REGISTER → OTP verify → password screen → gate → chooser; 1-role accounts land direct (gate + forwarder scope to ≤1 active role); no emulator/device session was available in this workspace, so device verification (Maestro/execbro) was SKIPPED — explicitly stated per protocol.

---

## BUILDER STEP NOTES (S3 — Shop Owner surface; orchestrator verifies §3 + §12 + §13 S3)

**STEP 1 (S3) — schema + migration 0067.**
`src/db/migrations/0067_shop_ledger_busy_prep.sql` (journal idx 65): `shop_ledger_entry_type` enum (order_revenue | commission | payout | adjustment | reversal) + `shop_ledger` table (uuid PK, shop_id FK, order_id FK NULL for payout/adjustment rows, SIGNED integer `amount_bdt`, note, created_at — append-only, NO updated_at per the money-tables rule). Backstops: partial unique `(order_id, entry_type) WHERE order_id IS NOT NULL` (double-settlement impossible: the state machine admits `delivered` once AND the index is the DB backstop) + `(shop_id, created_at)` index. RLS: ENABLE + FORCE + `REVOKE ALL ... FROM anon, authenticated` (zero public posture, same as every S1 money table; admin uses service role). Also: `shops.busy boolean NOT NULL DEFAULT false` (F-16 throttle-not-close), `shop_orders.prep_minutes integer` NULL (legacy accepted orders keep NULL), `shop_services.deleted_at` soft-delete column for the S3 services CRUD. **DB apply: APPLIED to the dev DB and VERIFIED (2026-10-14, via the Supabase MCP `execute_sql`, which runs server-side and sidesteps the local pooler DNS failure — `getaddrinfo ENOTFOUND aws-1-ap-northeast-1.pooler.supabase.com` that blocked `apply-migration.js` from this workspace; the applier records nothing DB-side, so MCP application is state-identical to the script). Verified against the file: enum order `order_revenue,commission,payout,adjustment,reversal`; columns id/uuid PK gen_random_uuid, shop_id NOT NULL, order_id nullable (payout/adjustment exemption), entry_type enum NOT NULL, amount_bdt integer NOT NULL, note text, created_at timestamptz now(); indexes pkey + `shop_ledger_order_entry_uq` (order_id, entry_type) WHERE order_id IS NOT NULL + `shop_ledger_shop_idx` (shop_id, created_at); RLS enabled AND forced; ZERO grants to anon/authenticated; 0 updated_at columns (append-only); shops.busy boolean NOT NULL DEFAULT false; shop_orders.prep_minutes integer nullable; workshop_services.deleted_at timestamptz nullable.** schema.ts: `shopLedger` table + enum exported (snake_case, `amount_bdt` integer paisa).

**STEP 2 (S3) — settlement writer + shop socket.**
`lib/shopLedger.ts` — `settleShopOrder(tx, {id, shop_id, subtotal_bdt})`: order_revenue credit of `subtotal_bdt` ALWAYS; commission debit only when the fresh-read `shop_commission_percent` (platform_config, read inside the tx via requireConfigInt — seeds-not-constants) is > 0; integer paisa math with `Math.round`; idempotence read first (existing (order_id, entry_type) rows → no-op) so a same-tx re-entry cannot double-credit. Write-ownership: shop_ledger rows are written ONLY here (same rule as call_ledger/payment_events). Wired into the `delivered` transition (`app/api/shop/orders/[id]/status+api.ts`, existing tx) and the workshop-request `done` transition (order-linked job, F-13, same tx). `lib/shopSocket.ts` — rider-socket-shaped shop dashboard socket with `teardownShopSocket()` wired into `lib/authCleanup.ts` (logout kills it, identity-tagged like the rider slot). `store/index.ts` `socketRole` += `'shop'`; `types/type.d.ts` WSStore widened; `utils-server/index.ts` + `rentalHandler.ts` accept the shop role.

**STEP 3 (S3) — API surface.**
`GET /api/shop/mine` — dashboard bootstrap for EVERY member role (creator-match first, then active membership); money dashboard (orders-by-status counts, workshop pending + 2h-SLA-overdue count, settlement balance) attached ONLY for OWNER/MANAGER — STAFF is orders-only and those fields are never sent (§3: UI hiding is not security). `PATCH /api/shop/[id]/availability` — OWNER/MANAGER; is_open/busy; emits `shop:availability` to staff sockets after the write; R5: closed is rejected SERVER-SIDE by the order route, busy only throttles. `GET /api/shop/[id]/settlement` — OWNER/MANAGER; signed balance + entries newest-first. `PATCH/GET /api/shop/[id]/workshop/requests` — OWNER/MANAGER (workshop bookings are NOT orders — STAFF cannot even see the inbox); FOR UPDATE row lock + VALID_TRANSITIONS matrix (requested→confirmed→in_progress→done), done+order_id settles in the SAME tx; GET computes the per-row 2h SLA window (TRACKED, not auto-reaped — hard expiry needs a scheduler reaper and is an owner decision, QUESTION on the hub). `POST /api/shop/[id]/members` — invite-by-phone mints the membership row with `invited_by` (unknown phone → 404 user_not_found, no dangling rows; STAFF cannot invite). Services CRUD soft-deletes. `POST /api/shop/orders` — R5 `409 shop_closed` thrown inside the tx (shops row read FOR UPDATE) + `prep_minutes` accepted on the accept transition. All routes: Zod + parseJsonBody at the boundary, UUID guards before DB access, snake_case, machine-code errors.

**STEP 4 (S3) — shop-owner screens.**
`app/(main)/(shop-owner)/`: `_layout.tsx`, `index.tsx` (dashboard — orders by state, accept/reject + prep-time picker, open/closed + busy toggles), `catalog.tsx` (products CRUD), `workshop.tsx` (requests inbox with 2h SLA display), `staff.tsx` (members + invite by phone), `settlement.tsx` (shop_ledger balance + entries, paisa→taka at render only). Entry wiring: `app/_layout.tsx` gate + `app/index.tsx` splash forwarder route a single `shop_owner` role to `/(main)/(shop-owner)`; multi-role accounts still land the chooser (D-1, unchanged). i18n: new `shop` namespace en+bn.

**STEP 5 (S3) — M-2 remainder (§16 mapping): role-filtered plans.**
`GET /api/package/list`: visibility = ACTIVE role in `packages.roles` (via heldRoles) AND vehicle scope; zero active roles → EMPTY listing (divergence recorded: the old universal-only listing was dead inventory for a caller who could not purchase after the M-2 gate). `POST /api/package/purchase`: §14 checkout eligibility BEFORE the driver rail — active-role ∉ pkg.roles → `403 role_not_eligible` (a shop/fleet/delivery holder gets the typed role error, never a driver-shaped 404); non-driver-only plan + no drivers row → `409 plan_purchase_unavailable` (S5/S6 rails); driver gate + fraud gate + vehicle gate unchanged AFTER eligibility. Tests realigned to the new read order (pkg load precedes the gate): purchase-gate 6/6, vehicle-scoping 12/12 (incl. a new zero-roles `false`-filter pin).

**STEP 6 (S3) — flow library.**
USER-FLOWS.md: Flow 12 (F-16 rework — owner/staff split, busy-throttle semantics) + NEW Flows 13/14/15/16 (catalog CRUD, workshop 2h-SLA inbox, staff invite orders-only, settlement) — 5 diagrams appended in the existing section style.

**STEP 7 (S3) — tests + gates.**
New: `tests/api/shop/shopLedger.test.ts` (4: fresh-percent commission, zero-percent launch default skip, same-tx idempotence no-op, missing-config-key propagates 500 — never an invented zero) + `tests/api/shop/s3-surface.test.ts` (14: mine role-split + no_shop, availability owner/staff/empty-body, settlement + staff-403, workshop transition commit + invalid-jump 409 + staff inbox 403, invite-by-phone + unknown-phone 404 + staff-cannot-invite, R5 closed → 409). Gates: `npx tsc --noEmit` → 0 errors; eslint on every touched file → 0 errors 0 warnings (the 7 import/first warnings fixed by moving route imports above the mock block — babel hoisting makes the order runtime-safe); targeted jest shop/package/auth → 12 suites / 142 tests green; **full `npx jest --watchAll=false` → 205 suites passed / 0 failed (4 pre-existing skips), 2,599 tests passed (9 pre-existing skips)** — 2 suites more than the S2.1 baseline, the two new shop suites; i18n orphan gate clean (96 baselined, none new); testid map regenerated (1,181 ids / 227 screens).

**Known limitations / handoff.**
(1) Migration 0067 is NOT applied to the dev DB (DNS-unreachable pooler from this workspace) — apply is the orchestrator-side step before any device run touching shop tables. (2) The D-1 acceptance (real login → chooser) remains the FIRST item of device day per the orchestrator's ruling; the S3 surfaces add their own device items (dashboard live-data read, accept+prep picker, settlement render). (3) Workshop SLA is TRACKED only — no auto-reaper (owner decision, QUESTION on hub). (4) Payout settings screen: the payout RAIL is descoped (F-21 launch settlement = cash/admin entry); the settlement screen shows the balance + entries, no withdrawal action. (5) No emulator/device session was available — device verification (Maestro/execbro) SKIPPED per protocol. **HOLD for orchestrator verification.**

---

## BUILDER STEP NOTES (S4 — Customer good-morning + listings + checkout + placement/leg rework; orchestrator verifies §5 + §6.1 step 1 + R2/R8)

**STEP 1 (S4) — good-morning + listings + R2 universal entry (§5 R2/R3).**
`services-hub.tsx`: category tiles from `shop_types` (admin-added types appear automatically), keyed template testID per slug. `GET /api/shop/list`: optional `type` slug filter (slug → shop_types), LEFT JOIN so type-less legacy shops stay in the all-shops listing (the WHERE on the slug still restricts when given); rows now carry `shop_type_*` fields. Listing screen: locale header, closed + food badges, per-category empty state; `useShopStore.Shop` extended with the type fields. R2 cross-role entries: `shop-owner.push-shops` (dashboard header), `rider.d.push-shops` (driver home), fleet More row — every role's app reaches the Shops section (delivery-man entry lands with the S6 surface).

**STEP 2 (S4) — §12 fee quote + checkout (F5 COD total).**
NEW `lib/shopDeliveryFee.ts`: `quoteDeliveryFee` — haversine shop→dropoff, 3 km tier boundary, ALL THREE config keys fresh-read via `requireConfigInt` (missing key propagates — never an invented zero; seeds-not-constants). `POST /api/shop/orders` rework: R5 closed rejected inside the tx (`FOR UPDATE` shops row), restaurant-vs-general split DATA-DRIVEN from `shop_types.is_restaurant`, fee quoted fresh + SNAPSHOT onto the order (`delivery_fee_bdt`, `total = subtotal + fee`, R-A9), response returns `delivery_fee_bdt`/`total_bdt`, idempotency wired (`IDEMPOTENCY_ROUTES.shopOrderCreate`, typed failure stored for replay). Client `order-create`: dropoff coords guard (rider's current location), fee hint under the address, server-quoted COD total in the confirmation (i18n en+bn — interpolation in `{{double}}` braces per the i18n-smoke contract).

**STEP 3 (S4) — R8 absorb + §6.1 retirement + 0068.**
`lib/shopDeliveryBridge.ts` REWRITTEN: `createDeliveryLegFromOrder(order, tx)` — explicit caller tx (no ambient fallback), inserts the universal `deliveries` leg idempotent on `order_id` (dropoff-coords + shop-coords guards return null), `source_vertical` per §1 (service_booking→workshop_product · food→food_order · else shop_order), fee snapshot carried (`?? 0` defensive — the route quotes first). The leg is created in the ORDER PLACEMENT tx (§6.1 step 1): null ⇒ `409 delivery_leg_unavailable` + full rollback. `mark-ready` is now a PURE conditional transition — RFQ bridge call removed, `food_delivery_unavailable` catch arm + stale header retired. NEW migration `0068_shop_order_dispatch_states.sql` (journal idx 66): `shop_order_status += dispatched | courier_assigned | picked_up | self_delivered` (own statements per D5; `out_for_delivery` retained — Postgres cannot drop enum values). NEW `lib/shopOrderCancel.ts` (F-11 pre-pickup cancel rules, config-fresh fee) — built, NOT yet wired to a route (known gap below).

**STEP 4 (S4) — test rework for the timing move.**
`tests/api/delivery/food-bridge.test.ts` rebuilt (13 tests): (1) placement leg matrix through the REAL POST handler — delivery ⇒ leg in-tx (shop pickup coords / customer dropoff / fee snapshot / status `created`), restaurant ⇒ `food_order`, pickup ⇒ no leg + no fee, bridge-null ⇒ 409 `delivery_leg_unavailable`, closed ⇒ 409 before any insert; (2) F40 accept-bid suite unchanged (route still live for the parcel RFQ lane); (3) bridge internals — idempotent on order_id, coord guards, service_booking mapping, explicit-tx. `tests/api/shop/order-transitions.test.ts`: A2 re-pinned to the NEW contract — mark-ready does ZERO leg writes for food+delivery and still succeeds with shop coords missing (the old 409 cell is dead by design).

**STEP 5 (S4) — gates (all green, 2026-10-14).**
`npm run lint` → 0 errors, 438 warnings (pre-existing pool), exit 0 · `npx tsc --noEmit` → exit 0 · FULL `npx jest --watchAll=false` → **205 suites passed / 0 failed (4 pre-existing skips), 2,598 tests passed, 9 pre-existing skips** — after the i18n-smoke interpolation gate caught single-brace `{total}`/`{fee}` in my new `placed_body_total` values (fixed to `{{…}}` in both locales). check:vacuous clean · check:date-in-sql clean (535 files) · check:i18n-orphans clean (96 baselined, none new) · testid map regenerated (1,196 ids / 227 screens) + freshness clean · flow-xcheck exit 0. **Flow-gate finding FIXED (pre-existing, blocked ANY flow commit):** `scratch-driver-login.yaml` asserts "Sign In" which resolved only in hard-coded JSX — wired `app/(auth)/welcome.tsx` to a new `auth.sign_in` key (en+bn) per the gate's prescription.

**Cross-references updated with the rework:** FEATURES.md row 18 (bridge contract) · `_counterpart-shop-ready.yaml` comments · `01-food-to-bridge-to-courier.yaml` header.

**Known limitations / handoff (S4).**
(1) The v4-food flow's courier-accept step still targets the RETIRED RFQ `delivery_requests` row (`LATEST_DELIVERY_REQUEST`) — placement + mark-ready legs match the new model; that step is SUPERSEDED until S6's dispatched-offers inbox lands (flagged in the flow header; rework in S7). (2) Migration 0068: apply to the dev DB is the orchestrator-side step (same pooler-DNS constraint as 0067 — MCP `execute_sql` works). (3) `lib/shopOrderCancel.ts` built but not wired to a cancel route. (4) §6.1 "Find courier" trigger + dispatch-state transitions (→ dispatched) are S6 scope — 0068 only adds the enum values. (5) Delivery-man R2 Shops entry rides with the S6 surface. (6) No emulator/device session — device verification (Maestro/execbro) SKIPPED per protocol. **HOLD for orchestrator verification.**

---

## BUILDER STEP NOTES (S4 round 2 — F-13 lanes + F-11 order flow + F-29 notifications + dev-DB e2e; orchestrator verifies §5 + §13 S4 + USER-FLOWS F-02/F-11–F-13/F-26–F-29)

**STEP 6 (S4) — F-13 split lanes + workshop surface (supersedes S4 handoff item 1 partially).**
`shop-detail/[id].tsx` reworked into the F-13 workshop screen: Products lane (cart → checkout) + Service Request lane (service picker + vehicle details + date/window text inputs validated against the same Zod contract as the route — no datetime-picker dependency added). i18n `shops_detail.*` lane keys en+bn (interpolations in `{{double}}` braces per the i18n-smoke contract). Customer workshop surface: NEW `app/api/workshop/requests+api.ts` (own-requests list, 2h SLA enforced BEFORE the read) + request create on `POST /api/shop/[id]/workshop/requests` (service+vehicle+window, date-not-past, shop-scoped service 404). `lib/workshopSla.ts`: lazy AUTO-DECLINE sweep (supersedes S3's tracked-only stance — owner ruled in the S4 stage order), single keyed high-priority push per declined row (`workshop_declined:{requestId}`). Migrations 0069 (`declined` enum — own file per D5) + 0070 (`workshop_requests.vehicle_details`).

**STEP 7 (S4) — F-11 customer order flow (closes S4 handoff item 3 — `lib/shopOrderCancel.ts` now wired).**
NEW migration 0071 (`shop_orders.cancel_fee_bdt`, `unavailable_item_ids`, `partial_confirmed_at`). NEW routes: `POST /api/shop/orders/[id]/cancel` (pre-pickup states only, config-fresh state-dependent fee via `cancelFeeBdt` — free while pending/booked; same tx: flip + RESTOCK + fail the placement-created `deliveries` leg), `POST /api/shop/orders/[id]/confirm-partial` (idempotent stamp; without it the free-cancel path stays open), `GET /api/shop/my-orders` (caller-scoped tracking entry). Order detail GET hardening: UUID guard + auth matrix (shop member OR ordering rider — it shipped UNAUTHENTICATED at HEAD, fixed because the customer tracking screen now reads it), plus `cancellable`/`cancel_fee_bdt` computed SERVER-side (config-fresh — the client never reads config), shop name and the `deliveries` leg (courier panel). NEW screens: `app/(main)/(customer)/(shops)/orders/[id].tsx` (F-11 timeline incl. courier steps for delivery + service-booking variant, partial-confirm banner, cancel bar with config fee, F-38 dispute link → report-issue carrying `[Order: …]` in the ticket text since `support_tickets` has no order column) and `orders/index.tsx` (my-orders list, partial badge, empty state). Entry points: shops-list header "My orders" row + checkout success lands on the tracking view. `accept` transition extended with `unavailable_item_ids` (totals recomputed server-side from the remaining snapshot).

**STEP 8 (S4) — F-29 notifications + seeds ratchet.**
NEW `lib/shopNotify.ts`: `notifyShopNewOrder` (active members + owner deduped, `shop_new_order:{orderId}:{userId}`, high priority, fire-and-forget) wired after the placement tx; `notifyCustomerOrderStatus` (copy map: `out_for_delivery` → picked-up, `delivered` → delivered; `shop_order_status:{orderId}:{status}:{userId}`) wired post-tx in the status route. Notification-router taps added (both role maps): `shop:new_order` → shop-owner dashboard, `shop:order_status` → tracking screen. "Courier assigned" copy rides the same helper when S6 starts writing that state (NOT reachable through the S4 status enum — recorded, not dead-coded). Seeds-not-constants test extended: `shop_order_cancel_fee_after_accept_bdt` joins ECONOMICS_KEYS + LAUNCH_SEEDS ("0") and is now admin-editable (MARKETPLACE_CONFIG_KEYS + PATCH ALLOWED_KEYS + non-negative-paisa validation).

**STEP 9 (S4) — tests, REAL dev-DB e2e, and the idempotency bug it caught.**
New suites: `tests/api/shop/s4-order-flow.test.ts` (19: cancel free/config-fee/409-closed/403/already-cancelled/uuid, confirm-partial stamp/idempotent/not-partial/403, my-orders caller-binding, tracking cancellable/terminal/403/uuid, F-29 keyed sends) + `tests/api/shop/workshop-f13.test.ts` (11: create validation matrix, SLA sweep flip + keyed push + scopes, customer list sweeps-before-read) + wrapped-23505 regression in `tests/api/idempotency-convention.test.ts`. **DEV-DB E2E (Metro :8081, real Supabase, 20/20 PASS):** customer+owner auth minted via admin API; three seeded shop kinds (restaurant/grocery/workshop with type-driven `source_vertical` food_order|shop_order); restaurant order → fee 8000 (3km tier, fresh config) → total 58000 → staff accept(prep 20)→preparing→ready; tracking read (cancellable, fee 0, leg created, shop name); grocery order → out-of-stock accept (totals 63000→53000) → customer confirm-partial (`partial_confirmed_at` stamped); workshop request 201 + customer list (vehicle_details, `requested`); pre-pickup cancel (fee 0, leg failed, stock RESTORED 30); my-orders both rows; idempotent replay (same key → 201 + `Idempotency-Replayed: true`, same order_id, exactly one order/leg/push). Durable DB artifacts verified: 14 legs (correct vertical split), 14 `shop:new_order` keyed pushes (replays did NOT re-push), rice5 stock restored. **BUG FOUND LIVE & FIXED:** `lib/idempotency.ts`'s 23505 catch checked `e.code`, but drizzle wraps the driver error in `DrizzleQueryError` (code lives on `cause`) — every real-DB replay/race-loser returned 500 instead of the stored outcome (unit mocks threw bare `{code:'23505'}` so the suite never caught it). Fixed with a cause-chain unwrap (`driverErrorCode`) + regression test; live-verified. **FLAGGED (NOT touched): `utils-server/leadBilling.ts:187` has the identical bare `e.code === '23505'` pattern on the call_ledger deduction barrier — same bug class, high-risk/RESERVED file — needs an orchestrator-reserved follow-up (safe direction today: the tx still rolls back, so no double-billing; only the graceful skip degrades to a thrown error).**

**Gates (S4 round 2, all green 2026-10-14):** `npm run lint` → 0 errors · `npx tsc --noEmit` → 0 errors · FULL `npx jest --watchAll=false` → **207 suites / 2,629 tests passed, 0 failed** (4+9 pre-existing skips; +2 suites vs S4 round 1) · check:vacuous clean · check:date-in-sql clean (541 files) · check:i18n-orphans clean (96 baselined, none new) · i18n-smoke 9/9 · testID codemod idempotent (2nd run 0 touched), map regenerated **1,214 ids / 229 screens**, freshness clean (index mode), flow-xcheck exit 0. Note: `testid-map-freshness --head-vs-worktree` (CI mode) reports the 20 new ids as missing UNTIL these changes are staged/committed (HEAD's map cannot know them) — resolves on commit by construction.

**Dev-DB migrations S4:** 0068 verified PRESENT; **0069/0070/0071 APPLIED via Supabase MCP and verified against the files** (declined enum, vehicle_details, cancel_fee_bdt + unavailable_item_ids + partial_confirmed_at). All six §12/fresh-config keys verified seeded (8000/12000/3/0/0 + cancel 0).

**Known limitations / handoff (S4 round 2).** (1) Supersedes round-1 items 2+3: migrations applied; cancel route wired. Round-1 item 1 (v4-food flow courier-accept step still on the retired RFQ row) UNCHANGED — S6. (2) "Courier assigned → customer" notification is shaped but unreachable until S6 writes `courier_assigned` (status enum excludes it). (3) `utils-server/leadBilling.ts` 23505 unwrap — RESERVED-file follow-up flagged above. (4) e2e artifacts left in dev DB: `E2E Bistro/Mart/Garage` shops, products/service, 2 auth users (`8801799999991/2`), 14 orders/legs from the acceptance run — probe leftovers are pending/cancelled; orchestrator may prune or keep for device day. (5) No emulator/device session — device verification (Maestro/execbro) SKIPPED per protocol; API-level e2e on the dev DB IS done (20/20). **HOLD for orchestrator verification.**
