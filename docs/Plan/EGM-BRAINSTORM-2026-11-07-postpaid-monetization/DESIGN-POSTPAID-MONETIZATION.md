**Purpose:**     THE formal design document for postpaid credit monetization with per-driver product choice. Owner-approved in full (Gates 1–3 with fixes). Input for the EGM review loop (`egm-review`) and, after approval, for implementation briefs.
**Owner:**       Elephant (EGM drafting session, for Zia)
**Status:**      IMPLEMENTATION-READY — correction cycle complete (2026-11-07): 2 Blockers + 23 Majors + 11 Nit groups closed per `owner_dispositions_review_2026-11-07.md`; code citations re-verified against the working tree
**Source of truth:** Owner rulings: `owner_dispositions_2026-11-07.md` (verbatim, authoritative). Concept + review synthesis: `concepts_brief.md` (EGM Priority 1 intake). Code facts verified 2026-11-07 against the working tree.
**Related (concrete paths):**
  - `docs/Plan/EGM-BRAINSTORM-2026-11-07-postpaid-monetization/concepts_brief.md` — brainstorm synthesis (Priority 1 intake of this draft)
  - `docs/Plan/EGM-BRAINSTORM-2026-11-07-postpaid-monetization/owner_dispositions_2026-11-07.md` — D1–D7 rulings (implemented verbatim)
  - `docs/Plan/EGM-BRAINSTORM-2026-11-07-postpaid-monetization/feature_concept.md` — anchored concept + verified current-state facts
  - `docs/Plan/EGM-BRAINSTORM-2026-11-07-postpaid-monetization/design_draft.md` — the working draft (body content identical at finalization; header metadata finalized per stage)
  - `docs/Plan/EGM-BRAINSTORM-2026-11-07-postpaid-monetization/consolidated_review_report.md` — five-stage review findings (all ACCEPTED, 0 contested)
  - `docs/Plan/EGM-BRAINSTORM-2026-11-07-postpaid-monetization/owner_dispositions_review_2026-11-07.md` — review dispositions + 6 material rulings (authoritative for the correction cycle)
**Last verified:** 2026-11-07, by Elephant
**How to update:** Only via the EGM review loop's correction cycle; section changes require the owner's approval.
**Provenance:** Drafted with EGM.

---

# Postpaid Credit Monetization with Per-Driver Product Choice

*   **Author:** Elephant (EGM), for Zia
*   **Status:** IMPLEMENTATION-READY
*   **Date:** 2026-11-07

## Overview

Ride is a subscription-based ride lead-distribution platform for Bangladesh: drivers buy call packages, riders request rides, and the dispatch engine sells leads to drivers as billable offers. Today the platform monetizes drivers through one global switch (`platform_config.revenue_model`): either every driver must buy prepaid call packages, or the whole platform runs on per-ride commission.

This design replaces the global switch with a per-driver choice between two products, and converts Ride from a prepaid card seller into a postpaid (credit) billing platform toward its drivers:

1. **Subscription packages** (the existing call packs, made postpaid): calls are granted the moment the driver buys, and a bill is generated immediately — payment is deferred. While holding one, the driver is billed for leads exactly as today (debit at offer time) and pays zero per-ride commission.
2. **Commission package** (new): a ৳0, never-expiring enrollment. While holding it, the driver pays nothing upfront and no subscription bill; each completed trip generates a commission bill (a percent of the fare, set per zone and vehicle type in the pricing table).

The product a driver currently holds is their monetization mode — there is no mode setting with a default. Every driver must hold one of the two to receive offers; new drivers make an explicit choice at onboarding. All obligations from both products accumulate into one unpaid-obligations figure per driver, enforced by three mechanisms: settle-first purchase (no new package while unpaid bills exist, with a small dust exception), a dispatch lockout ceiling (৳500 configurable), and manual payment through the dues screen. A subscriber whose package is exhausted or expired is hard-locked out until they buy again — a lapsed subscriber never silently becomes a commission debtor.

The expected effect, to be validated after launch: drivers who cannot pay upfront can keep working, both payment preferences are served at once, and the platform gains a single enforceable receivables position instead of fragmented, partially-enforced obligations.

## The Problem

1. **One monetization mode for all drivers.** The global toggle (`lib/platformConfig.ts:253-285`) cannot serve a driver who wants to pay per ride and a driver who wants to pay upfront at the same time. Commission machinery exists (accrual, debt ceiling, dues screen, PortPos settlement) but is idle at 0% launch defaults and globally gated.
2. **Upfront cost excludes drivers.** A driver without cash for a package cannot work at all, and a lapsed subscriber stops receiving offers with no alternative on the same platform.
3. **Obligations are fragmented.** "What does this driver owe the platform" lives in two unrelated places — `payment_events` rows (payments, not debts) and `rides.platform_commission_bdt` minus `driver_commission_settlements` — with no single authoritative figure. Dispatch, the purchase gate, the dues screen, and the account-deletion gate each derive (or skip) their own version.
4. **Prepaid-only purchase blocks the credit model the owner ruled for.** Today a subscription activates only after a verified PortPos callback (`app/api/payment/portpos/callback+api.ts` → `lib/activateSubscription.ts`); no unpaid obligation can exist for a subscription. The owner's ruling requires calls-before-money with immediate billing, which the current payment machinery cannot represent and its legacy consumers (orphan sweep, compensation repair) would corrupt if reused without the fencing this design specifies.

The solution, ruled by the owner on 2026-11-07 (dispositions D1–D7): fully postpaid billing for both products, possession-defines-mode, one unpaid-obligations source of truth (`driver_bills` table + `driver_unpaid_obligations` view), settle-first with a one-open-bill constraint, ceiling lockout with a day-zero protection invariant, hard lockout on lapse, and launch-scope driver-facing states and observability.

## Goals

*   **G1 — Exclusive monetization.** A driver holding a product is monetized exclusively through it: for any completed ride, exactly one of {lead debit, commission accrual} exists. No driver is ever double-billed for the same ride.
*   **G2 — Atomic grant-and-bill.** When a postpaid package purchase commits, the calls grant and the open bill row commit in one database transaction. There is no reachable state where calls exist without their receivable.
*   **G3 — One owed-figure, four consumers.** Dispatch lockout, the settle-first purchase gate, the dues screen/API, and the account-deletion gate all read the same authoritative unpaid-obligations number (the `driver_unpaid_obligations` view), with a drift-guard test verifying the batched dispatch query equals the canonical function.
*   **G4 — No day-zero lockout.** Buying a package never locks out the buyer: the ceiling floor invariant (`ceiling >= max live package price + 1,000 paisa`) is enforced by config validation, and an active subscription's own bill can never lock out that subscription while it is usable.
*   **G5 — Driver-visible states.** A driver can always see which of the six server-derived states they are in (NO_PRODUCT, ACTIVE, OWING, CEILING_LOCKED, LAPSED, PRODUCT_FROZEN) on the home screen, each with a one-tap recovery path; PURCHASE_BLOCKED is rendered client-side immediately after a typed 409 (see §3.6). **Recorded divergence from D7** (owner-sanctioned in the 2026-11-07 review dispositions): D7's six-state banner listed PURCHASE_BLOCKED as a server state; this design replaces it server-side with NO_PRODUCT and renders PURCHASE_BLOCKED on the client from the 409.
*   **G6 — Zero-disruption migration.** Existing drivers continue unchanged on ship day (no backfill, no migration choice); new drivers make an explicit product choice at onboarding; a 1-time ৳0 trial attaches to the Call Package option.
*   **G7 — Full observability.** Every lockout, unlock, billing outcome (including silent skip reasons), commission accrual, zeroing event, and settle-first rejection is logged at info level or persisted, and a minimal admin surface enumerates locked drivers with reason and aging.
*   **G8 — Config-write rollback.** The staged rollout (schema → utils-server → API/EAS) is protected by a fresh-read kill-switch; behavior rollback requires a config write, not a redeploy, and is state-safe for bills, granted calls, settlements, and frozen/enrolled possession state.

## Non-Goals

*   **Rider-side payment flows.** Riders continue paying drivers directly (cash/COD); COD rules are unchanged.
*   **Fleet, shops, and delivery-man commission domains.** These already default to 0% commission independently; this design covers DRIVER monetization only. The courier COD-dues system (`lib/deliverySettlement.ts`) is cited as prior art for its two-point guard pattern, but its storage stays separate (COD cash remittance is not a platform receivable).
*   **Admin platform-revenue readers.** `app/api/admin/dashboard+api.ts` and `app/api/admin/driver-economics+api.ts` report commission-only platform revenue; postpaid splits platform revenue into two lanes (subscription-bill settlements + commission). Extending these readers is a recorded follow-up, deferred from v1 (harmless at the 0% launch default).
*   **Refunds, referral rewards, wallet cashback interactions with bills.** Deferred. Any future bill-reduction path MUST go through the single bills writer (M-13 transition map) — this design defines the ownership rule, not the features.
*   **The v6 fare engine rollout itself.** Only its commission input changes (delete the hard-coded 0, read the ride-time mode snapshot). The stage flip and pickup-fee work stay on the fare-framework track.
*   **Background dunning.** v1 enforcement is event-driven (due at next purchase / at ceiling / on switch). No dunning cron ships in v1 (D6).
*   **Multi-city and multi-vehicle-class fare changes.** Unchanged scope.

## Open Questions

*   **OQ1 — Driver state delivery transport.** RESOLVED by owner ruling (2026-11-07): lifecycle pull + 60s online poll is canonical; WebSocket is an optional invalidation hint only. The client fetches the monetization state from the canonical dues endpoint on (1) app launch / home focus, (2) ride completion, (3) after purchase / product switch / PortPos callback return, and (4) a lightweight 60s poll while online, plus a client-side timer when `subscription.expires_at` passes. `utils-server` MAY emit a lightweight `billing_state_invalidated` event on lockout to trigger an immediate refetch. Rationale: utils-server only evaluates pools when a ride is actively dispatched in the driver's zone, so a quiet-zone driver would never learn of a lockout from WS alone.
*   **OQ2 — "Pay Now" on the post-purchase confirmation.** RESOLVED by owner ruling (2026-11-07): Pay Now calls the unified settlement endpoint `POST /api/driver/dues/pay` directly and opens the PortPos checkout in one tap, without routing through the Dues screen UI. Pay Later dismisses the sheet; the open bill stays visible on the Dues screen. Both the post-purchase Pay Now CTA and the Dues screen Pay CTA hit the exact same backend settlement route.

All concept-level questions are resolved by owner dispositions D1–D7 plus the OQ1/OQ2 rulings above; remaining unknowns are implementation-level and listed in the Detailed Implementation Plan.

## Critical User Journeys (CUJs)

### CUJ 1: New driver chooses a product at onboarding

*   **Given**: A driver has completed registration and reaches the monetization step of the onboarding wizard (no product held, no bills, no prior trial).
*   **When**: They pick **Call Package** (starting with the 1-time ৳0 trial) or **Commission Package** (৳0 enrollment).
*   **Then**: Call Package → trial calls granted via the existing one-trial guard, NO bill row written (price is 0), dispatch works on lead billing. Commission → enrollment active, no bill at enrollment; dispatch works with zero lead debit at offer time, and commission accrues at trip completion per the zone/vehicle pricing table (0% at launch default). Neither pick → driver is registered with no product (`registered_drivers_no_product` tracked, state `NO_PRODUCT`) and sees a 1-tap choice card on the home screen until they choose.

### CUJ 2: Subscriber buys a call package on credit

*   **Given**: A subscriber with no open bill (settle-first satisfied) and headroom under the ceiling invariant.
*   **When**: They buy a ৳400 package.
*   **Then**: Calls are granted and the open `driver_bills` row commits atomically (one transaction); the confirmation screen shows "N calls added · Bill ৳400 — Pay Now or Pay Later" (the word "free" never appears). Pay Now → PortPos settlement (`purpose='subscription_settlement'`) clears the bill on verified callback. Pay Later → the bill stays open and blocks the NEXT purchase until settled; due date = subscription expiry (D6).

### CUJ 3: Commission driver accrues and settles

*   **Given**: A driver holding the commission enrollment with zero unpaid dues.
*   **When**: They complete trips.
*   **Then**: Each completion accrues commission (post-minimum-floor fare × pricing percent, integer paisa), visible as a line on the trip receipt; unpaid total appears on the dues screen (payable once ≥ ৳10); a warning banner appears at 80% of the ceiling (৳400); at ৳500 unpaid, dispatch stops offering (CEILING_LOCKED) until they settle ≥ ৳10 through the dues screen. Unpaid dust below ৳10 never blocks purchase or switching (D1).

### CUJ 4: Subscriber package runs dry — hard lockout

*   **Given**: A subscriber whose calls are exhausted or whose package expired.
*   **When**: Dispatch runs for a matching ride.
*   **Then**: The driver receives no offers (LAPSED state, banner with reason + one-tap fix), and never accrues commission by fallback. Recovery: buy a postpaid call package, or enroll in commission (explicit choice, never automatic).

### CUJ 5: Subscriber switches to commission with paid-up calls (frozen)

*   **Given**: A subscriber with remaining paid-up calls and no unpaid dues (settle-first).
*   **When**: They enroll in the commission package.
*   **Then**: `subscriptions.frozen_at` is set on their active call subscription (the supersede sequence — the existing expire-any-active-subscription behavior at `lib/activateSubscription.ts:32-35` — is bypassed; calls not debited, not expired; `expires_at` continues counting down); the commission enrollment governs their mode; the calls widget shows the frozen state (never as spendable balance). Switching back — which requires the frozen subscription to still be usable (`expires_at > now() AND calls_remaining > 0`) and commission dues settled, or strictly < 1,000 paisa (৳10) non-blocking dust per D1 — clears `frozen_at`, deactivates the enrollment, and generates no new bill. An expired frozen subscription is never unfrozen; it routes to the fresh-grant path (T2/T6c), which expires the stale row and creates a new bill.

### CUJ 6: Ceiling lockout and recovery

*   **Given**: A commission driver whose unpaid total reaches the ৳500 ceiling.
*   **When**: Dispatch builds the candidate pool.
*   **Then**: The driver is excluded (batched query over the unified view), a CEILING_LOCKED lockout event is recorded with reason + exposure, and the home banner shows the amount owed with a pay CTA. Settling below the ceiling emits the unlock event and restores offers.

### CUJ 7: Purchase blocked by unpaid dues

*   **Given**: A driver with an open unpaid bill (any product).
*   **When**: They attempt any package purchase or enrollment.
*   **Then**: The request returns the typed error `dues_outstanding_purchase_blocked` (409) with the outstanding amount; the client deep-links to the itemized dues screen with the pay control pre-loaded — at most 2 taps from "blocked" to payment initiated. Dust (< ৳10) does not block (D1).

## Technical Plan (Architecture) — Section 3

### 3.1 Shape of the system

Three cooperating pieces, deployed in the mandated order (schema → utils-server → API/EAS):

1. **Postgres schema + view** — the money state of record: `driver_bills` (subscription purchase bills), `commission_enrollments` (commission mode), additive columns on `packages`, `subscriptions`, `rides`, `driver_commission_settlements`, and the `driver_unpaid_obligations` view that is the ONLY definition of "what does this driver owe".
2. **Expo API routes** — purchase (grant-on-credit + settle-first gate), dues (itemized read + unified settlement initiation), completion (accrual/zeroing from the ride-time snapshot), PortPos callback (new settlement branch), admin config (ceiling invariant).
3. **utils-server** — dispatch pool (per-driver possession predicates + unified ceiling), lead billing (in-transaction mode classification), accept stamping (ride-time mode snapshot), scheduler (unchanged expiry flip), compensation worker (unchanged, with new purpose routing in `lib/paymentRepair.ts`).

```text
                     ┌────────────────────────── Postgres (source of truth) ──────────────────────────┐
                     │  driver_bills (open/settled)   commission_enrollments (active)                 │
                     │  subscriptions (+frozen_at)    rides (+monetization_mode_snapshot,             │
                     │  packages (+product_type)         platform_commission_bdt)                     │
                     │  driver_commission_settlements (+kind)                                         │
                     │  driver_unpaid_obligations  ← THE one owed-figure (view)                       │
                     └───────▲──────────────────▲──────────────────▲────────────────────┬─────────────┘
                             │                  │                  │                    │
        purchase (grant+bill)│  dispatch ceiling│        completion│         dues/config│
                     ┌───────┴───────┐   ┌──────┴───────┐   ┌──────┴──────┐   ┌─────────┴─────────┐
                     │ API: purchase │   │ utils-server │   │ API: ride   │   │ API: dues / admin │
                     │ settle-first  │   │ dispatch.ts  │   │ complete    │   │ purchase gate,    │
                     │ + grant-on-   │   │ + leadBilling│   │ accrual or  │   │ locked-drivers,   │
                     │ credit (1 tx) │   │ in-tx mode   │   │ zeroing     │   │ ceiling invariant │
                     └──────┬────────┘   │ from locked  │   └─────────────┘   └─────────┬─────────┘
                            │            │ rows         │                               │
                            │            └──────────────┘                               │ initiate invoice
                            │                                                           ▼
                            │                                            ┌────────────────────────────┐
                            │  settlement (dues/pay → PortPos → callback)│ PortPos gateway            │
                            └───────────────────────────────────────────►│ purpose =                  │
                                                                         │ subscription_settlement    │
                                                                         │ or commission_settlement   │
                                                                         └────────────┬───────────────┘
                                                                                      │ verifyIPN + purpose branch
                                                                                      ▼
                                                                         callback → billsLedger.settle /
                                                                         paymentRepair.settleCommissionDues
```

A pinned code fact governs the purchase transition: `app/api/package/purchase+api.ts:276-294` blocks any purchase while a subscription row with `status='active'` exists, regardless of remaining calls. Postpaid narrows this gate (owner correction, Gate 2), under kill-switch ON (`hybrid`) only: it blocks buying a Call Package only while the driver holds a **usable, un-frozen** subscription (`status='active' AND frozen_at IS NULL AND expires_at > now() AND (calls_remaining > 0 OR calls_remaining = -1)`). Early call exhaustion is never blocked from re-purchasing: a driver whose calls reach 0 before `expires_at` (including 1-time trial calls) may buy again immediately once Settle-First is satisfied, and `grantSubscriptionOnCredit` expires the exhausted subscription row in the same transaction before inserting the new one. Stacking remains impossible: a usable subscription still blocks purchase, and T6c's in-transaction enrollment end guarantees a driver can never hold both products active simultaneously (G1). Under kill-switch OFF (`subscription_only`), today's exact gate applies unchanged (any active subscription blocks).

### 3.2 Schema changes (all additive; M-10 approved list, concretized)

**S1. `packages.product_type` (Modify)** — new enum `package_product_type` (`'call_package' | 'commission'`), column NOT NULL DEFAULT `'call_package'`. The commission package is a normal `packages` row: `price_bdt = 0`, `product_type = 'commission'`, `expires_at`/`duration_days` NULL (D3 non-expiring), matched by its `code` (live-unique index, `src/db/schema.ts:528,559`). Admin-created; `is_trial` stays false on it (D4: trial guard is for call packages only).

**S2. `driver_bills` (Create)** — subscription purchase bills; the platform's receivable for granted calls.

*   `id uuid PK defaultRandom`
*   `driver_id uuid NOT NULL → drivers.id`
*   `subscription_id uuid → subscriptions.id` — NOT NULL in practice via `CHECK (kind != 'subscription_purchase' OR subscription_id IS NOT NULL)` (owner fix, Gate 3): `due_at` derives from `subscription.expires_at`, so the bill must point at its grant.
*   `kind varchar` NOT NULL DEFAULT `'subscription_purchase'` (open for future kinds; commission never lives here — it stays in `rides` per S5)
*   `amount_bdt integer NOT NULL` (paisa)
*   `status varchar` NOT NULL DEFAULT `'open'` (`'open' | 'settled'`; settled rows retained, never deleted)
*   `payment_event_id uuid NULL → payment_events.id` (the SETTLEMENT event; null until settled)
*   `due_at timestamptz NULL` (D6: set to `subscription.expires_at` at creation)
*   `created_at / updated_at timestamptz NOT NULL default now()`
*   **Partial unique index** `driver_bills_one_open_uq ON driver_bills(driver_id) WHERE status = 'open' AND kind = 'subscription_purchase'` — the B4 settle-first barrier at the database layer; a 23505 here is authoritative and maps to the typed 409.
*   **Partial unique index** `driver_bills_payment_event_uq ON driver_bills(payment_event_id) WHERE payment_event_id IS NOT NULL` — the M-14 subscription-leg settlement barrier (analogous to `dcs_payment_event_idx`): one settlement event can settle at most one bill, making double-settlement structurally impossible.

**S3. `commission_enrollments` (Create)** — commission-mode possession; separate from subscriptions so the supersede sequence and the `subs_one_active_per_driver` index are untouched (B3/F3, D2).

*   `id uuid PK defaultRandom`
*   `driver_id uuid NOT NULL → drivers.id`
*   `package_id uuid NOT NULL → packages.id` (the ৳0 commission package)
*   `status varchar` NOT NULL DEFAULT `'active'` (`'active' | 'ended'`)
*   `started_at timestamptz NOT NULL default now()`, `ended_at timestamptz NULL`, `created_at / updated_at timestamptz NOT NULL default now()` (AGENTS.md table rule)
*   **No `expires_at`** (D3: non-expiring).
*   **Partial unique index** `commission_enrollments_one_active_uq ON commission_enrollments(driver_id) WHERE status = 'active'`.

**S4. `subscriptions.frozen_at timestamptz NULL` (Modify)** — D2 frozen-calls state. Additive nullable column: old code ignores it, rollback is lossless; `subscriptionStatusEnum` is NOT widened (F-7/F-10).

**S5. `rides.monetization_mode_snapshot` (Modify)** — new enum `monetization_mode` (`'subscription' | 'commission'`), nullable column. NULL = pre-cutover ride. Written ONCE at accept time (never re-derived); completion reads it (M-3/Structural F6 precedent: the MFS settlement snapshot). D5 grandfathering falls out of the NULL: the view counts only `snapshot = 'commission'` rows, so pre-cutover accrual is zero-and-forgiven without any data migration.
*   **Partial covering index** `rides_commission_accrued_idx ON rides(driver_id) INCLUDE (platform_commission_bdt) WHERE status = 'completed' AND monetization_mode_snapshot = 'commission'` — makes the view's `commission_accrued` CTE an index-only scan per candidate driver instead of a full rides scan (owner correction, Gate 2).

**S6. `driver_commission_settlements.kind` (Modify)** — `varchar NOT NULL DEFAULT 'commission'`; backfill existing rows to `'commission'` in the same migration. All commission-due sums (`lib/commissionDues.ts:48-54`, `utils-server/dispatch.ts:302-311`, dues routes) gain `kind = 'commission'` so F-4's purpose-blind-sum corruption is structurally impossible from day one. Note the isolation invariant this creates: subscription settlements are written to `driver_bills` (S2), NEVER into `driver_commission_settlements` — so a rollback to legacy code (which ignores `kind`) still cannot misattribute subscription money to commission dues.

### 3.3 The one owed-figure: `driver_unpaid_obligations` view

Single source of truth (B7/Structural F1). Every consumer selects from this view — the per-driver lib helper, the batched dispatch query (`GROUP BY driver_id` over the view), the settle-first gate, the dues screen, and the account-deletion gate. The "keep the two definitions in step" comment at `lib/commissionDues.ts:12-13` is replaced by structural impossibility of drift, plus the M-14 drift-guard test.

```sql
CREATE VIEW driver_unpaid_obligations AS
WITH open_bills AS (
    SELECT driver_id, SUM(amount_bdt) AS unpaid_subscription_paisa
    FROM driver_bills
    WHERE status = 'open' AND kind = 'subscription_purchase'
    GROUP BY driver_id
),
commission_accrued AS (
    SELECT driver_id, SUM(platform_commission_bdt) AS accrued_paisa
    FROM rides
    WHERE status = 'completed'
      AND monetization_mode_snapshot = 'commission'   -- D5: NULL (pre-cutover) excluded
    GROUP BY driver_id
),
commission_settled AS (
    SELECT driver_id, SUM(amount_bdt) AS settled_paisa
    FROM driver_commission_settlements
    WHERE status = 'completed' AND kind = 'commission'  -- S6/F-4
    GROUP BY driver_id
),
-- D1 safety backstop: an active subscription's OWN open bill cannot lock out
-- that subscription while it is usable (not frozen, not expired, calls left).
active_self_bill AS (
    SELECT b.driver_id, b.amount_bdt AS self_bill_paisa
    FROM driver_bills b
    JOIN subscriptions s ON s.id = b.subscription_id
    WHERE b.status = 'open' AND b.kind = 'subscription_purchase'
      AND s.status = 'active'
      AND s.frozen_at IS NULL
      AND s.expires_at > now()
      AND (s.calls_remaining > 0 OR s.calls_remaining = -1)
)
SELECT d.id AS driver_id,
       COALESCE(b.unpaid_subscription_paisa, 0) AS unpaid_subscription_paisa,
       GREATEST(COALESCE(ca.accrued_paisa, 0) - COALESCE(cs.settled_paisa, 0), 0) AS net_commission_paisa,
       COALESCE(b.unpaid_subscription_paisa, 0)
         + GREATEST(COALESCE(ca.accrued_paisa, 0) - COALESCE(cs.settled_paisa, 0), 0) AS total_unpaid_paisa,
       COALESCE(ab.self_bill_paisa, 0) AS active_self_bill_paisa,
       COALESCE(b.unpaid_subscription_paisa, 0)
         + GREATEST(COALESCE(ca.accrued_paisa, 0) - COALESCE(cs.settled_paisa, 0), 0)
         - COALESCE(ab.self_bill_paisa, 0) AS lockout_exposure_paisa
FROM drivers d
LEFT JOIN open_bills b          ON b.driver_id = d.id
LEFT JOIN commission_accrued ca ON ca.driver_id = d.id
LEFT JOIN commission_settled cs ON cs.driver_id = d.id
LEFT JOIN active_self_bill ab   ON ab.driver_id = d.id;
```

Semantics:

*   `total_unpaid_paisa` is the settle-first number (dust rule `< 1,000` applied by CONSUMERS, not in the view) and the dues-screen total.
*   `lockout_exposure_paisa` is the dispatch-ceiling number: total minus the usable subscription's self-bill (D1 backstop). A commission driver has no self-bill, so their exposure is the raw commission dues.
*   **Filter pushdown (owner correction, Gate 2):** the view emits one row per `driver_id`; the batched dispatch query runs `SELECT … FROM driver_unpaid_obligations WHERE driver_id = ANY($candidateDriverIds)`, letting Postgres push the driver filter down into each CTE's scan (supported by the S5 partial covering index and the `driver_bills` indexes), so per-dispatch cost is O(candidates × (their open bills + their completed commission rides, index-covered)) — never O(all rides).
*   Ceiling floor invariant (D1): admin config validation and the seed/migration enforce `max_commission_debt_bdt >= max(price of live call packages) + 1,000`, and package create/update validation enforces `price <= ceiling - 1,000` on the other side. Current numbers: ceiling ৳500 vs max package ৳400 → ৳100 headroom. The symmetric **package-price floor** (owner disposition M-09): admin validation and the schema CHECK enforce `price_bdt = 0 (trial) OR price_bdt >= 1,000` for call packages — an open bill below the ৳10 settlement minimum can never exist, so the one-open-bill slot can never be occupied by an unpayable bill.
*   Dispatch reads the view ONCE per pool build, `GROUP BY driver_id` — O(open bills), replacing the unbounded all-time rides sum (`utils-server/dispatch.ts:291-322`), which is retired.

### 3.4 Money flows

**Purchase — routing inside the advisory lock (owner corrections, Gates 2–3 and review dispositions M-02/M-04).** `POST /api/package/purchase`, gates in order: idempotency (existing) → `payments_enabled` → role/fraud gate (extended to commission enrollment and dues-payment retries per D3; the documented maximum fraud exposure per account is `min(max live call-package price, ceiling) = 40,000 paisa / ৳400`) → vehicle-type (existing) → **settle-first** pre-check (read view; `total_unpaid_paisa >= 1,000` → `409 dues_outstanding_purchase_blocked`; dust below ৳10 passes; this pre-lock read is an early-failure check only — the authoritative barrier is the in-transaction re-check plus the partial unique index). **Dual-lane selection (M-04):** under kill-switch OFF, or under ON with a legacy client (no `x-client-postpaid: 1` request header), the route executes today's legacy prepaid path unchanged — `initiatePortposPayment` invoice before activation, existing response — so un-updated clients never receive invisible credit. Postpaid lanes (below) run only under ON + updated client. Then, inside ONE transaction under the initiation-time advisory lock `pg_advisory_xact_lock(hashtext('purchase_bill_' || driverId))` (decision 3; the existing `activate_sub_` lock remains for legacy/callback paths), settle-first is re-evaluated and the route branches on the TARGET package's `product_type` and the driver's possession state before any subscription-existence gate:

*   **Call Package target, driver holds a usable un-frozen subscription** → `409 active_subscription_exists` (narrowed gate: usable = `status='active' AND frozen_at IS NULL AND expires_at > now() AND (calls_remaining > 0 OR calls_remaining = -1)`). Stacking stays impossible (G1).
*   **Call Package target, driver holds an active commission enrollment AND a frozen USABLE subscription (T6b)** → `lib/monetizationMode.switchBackToCallPackage(tx)`: clears `frozen_at`, ends the enrollment (`status='ended'`, `ended_at=now()`), NO new bill, NO new grant — the paid-up calls resume. Response: `{ activated: true, unfrozen: { subscription_id, calls_remaining, expires_at } }`.
*   **Call Package target, no usable subscription — exhausted, frozen-expired, or none (T2/T6c)** → grant path: `grantSubscriptionOnCredit` first expires any stale/exhausted/frozen-expired subscription row in the same transaction (early-exhaustion renewal — a driver who burns calls on day 1 is never blocked from re-purchasing until `expires_at`), and — when an active commission enrollment exists (T6c) — `lib/monetizationMode.endActiveEnrollment(tx)` ends it in the same transaction, so a driver can never hold both products active simultaneously (G1). Then the grant and bill commit atomically:
    1. `lib/activateSubscription.grantSubscriptionOnCredit(tx, { driverId, package })` executes FIRST — the single write owner (`AGENTS.md` call_ledger ownership preserved) expires any stale/exhausted/frozen-expired subscription rows in-tx, inserts the new subscription + `initial_load` row (deriving `expires_at` from the package exactly as the legacy `activateSubscription` path does), and returns `{ subscriptionId, expiresAt }`; it does NOT touch `payment_events`. No PortPos invoice is initiated on the postpaid path (Pay Now goes through dues/pay per OQ2; no initiated/callback_pending events linger, so the legacy orphan sweep `utils-server/scheduler.ts:1169-1197` can never see or corrupt a postpaid bill).
    2. `lib/billsLedger.createOpenBill(tx, { driverId, subscriptionId, amountBdt, dueAt: expiresAt })` — inserts the `driver_bills` row referencing the fresh subscription and returns the inserted row (`{ id, driver_id, amount_bdt, due_at, status }`, which the route maps to the response `bill` object). A 23505 on the partial unique index raises a typed `BillSlotConflictError`; the enclosing transaction then rolls back the grant and `call_ledger` completely, and the route maps the error to `409 dues_outstanding_purchase_blocked`. Order rationale (owner fix, Gate 3): grant runs first because `driver_bills.subscription_id` and `due_at` require the subscription row to exist.
*   **Commission Package target (T6)** → permitted when the driver holds a usable paid-up subscription (its `frozen_at = now()` is set) or no usable subscription; `409 already_enrolled_commission` when an active enrollment already exists (the check lives in `lib/monetizationMode.enrollCommission`). No bill row (price 0). `lib/monetizationMode.enrollCommission(tx)` is the sole writer for the enrollment + freeze.

Response (additive, F-11): existing fields kept (`payment_url: null`, `payment_event_id: null` on postpaid lanes), plus `activated: true` and `bill: { id, amount_bdt, due_at }` (grant paths) or `enrollment: { id }` (T6) or `unfrozen: { … }` (T6b).

**Purchase — commission enrollment (৳0).** Executed by the T6 branch above; there is no separate flow. `lib/monetizationMode.enrollCommission(tx, …)` is the sole writer: it inserts the active `commission_enrollments` row and, when the driver holds a usable call subscription (paid-up calls), sets `subscriptions.frozen_at = now()` in the same transaction (D2; the supersede behavior at `lib/activateSubscription.ts:32-35` is not invoked on this path). No bill row (price 0). Switch-back is the T6b branch above.

**Trial (D4).** The existing ৳0 trial path (`purchase+api.ts:296-338`) is unchanged in both lanes: `createZeroAmountPaymentEvent` + `activateSubscription`, one-trial guard, no bill row. The trial branch runs after the settle-first re-check and inside the Call Package routing (after the usable-subscription 409 and the frozen T6b branch), so it can never destroy an open bill or a frozen state. It is offered inside the onboarding Call Package option; being ৳0, it is lane-independent (no gateway invoice exists in either lane).

**Settlement — unified endpoint (OQ2).** `POST /api/driver/dues/pay` is the ONLY settlement initiator for both kinds. Request gains optional `bill_id` (validated to belong to the authenticated driver before any invoice is initiated); absence = commission-dues settlement (existing behavior, backward compatible). Flow: read the view → amount = commission dues (existing math) or the open bill's `amount_bdt` → enforce per-settlement minimum 1,000 paisa (existing `MIN_PAYMENT_BDT`; dust rolls forward per D1) → `lib/paymentEvents.initiatePortposPayment` with `purpose = 'subscription_settlement'` (new purpose value; extend the `PortposPaymentInitiation` purpose union at `lib/paymentEvents.ts:31` — the varchar(40) column fits; no `payment_events` schema change is made, per C-B2) or the existing `commission_settlement` → PortPos checkout. The bill↔event link is NOT carried in `payment_events` (owner disposition C-B2, option b): at settlement time the driver holds at most one open `subscription_purchase` bill (guaranteed by S2's partial unique index), and the callback resolves it under lock.

**Callback.** `app/api/payment/portpos/callback+api.ts`: `verifyIPN` must not be modified or bypassed; NEW purpose branch `subscription_settlement` modeled on the `commission_settlement` branch (`:198-222`): `lib/billsLedger.settleSubscriptionBill(tx, { eventId })` acquires the driver advisory lock, resolves the driver's single open bill (`WHERE driver_id = event.driver_id AND status = 'open' AND kind = 'subscription_purchase'`), marks it `status = 'settled'`, stamps `payment_event_id = event.id`, and marks the event `paid` + `confirmed_at`. Idempotent no-op when the bill is already `'settled'` with `payment_event_id = event.id` (a replayed callback returns the settled state; the `driver_bills_payment_event_uq` barrier makes double-settlement structurally impossible). The branch NEVER reaches the `repairPaymentEvent`/`activateSubscription` fallthrough (`lib/paymentRepair.ts:242-243`), which neutralizes F-3's expire-a-paying-driver hazard; the F-1 `subscription_id` short-circuit is moot because settlement events are created without one. Failure paths enqueue compensation exactly as today (B7 floor preserved; queue depth/age is now settlement-backed — ops runbook note).

**Cross-mode dust invariant (owner correction, Gate 2).** `subscription_settlement` and `commission_settlement` are always separate PortPos checkouts — and this never traps a driver: Settle-First blocks any product switch while unpaid dues are `>= 1,000` paisa, so a driver carries at most `< 1,000` paisa of dust from their prior mode into their new mode. Settling the single `>= 1,000` paisa obligation of their current mode always brings `total_unpaid_paisa` back below 1,000, satisfying Settle-First in one checkout. **Dues display/pay rule (review N-06):** commission dues below the settlement floor are rendered as non-payable dust (no pay control) and roll forward per D1, so the UI never offers an action the backend rejects; dust may alternatively piggyback on a subsequent bill settlement.

**Completion — accrual and zeroing (T4/T5).** `app/api/ride/[id]/complete+api.ts` reads `rides.monetization_mode_snapshot`: `'commission'` → compute commission from `pricing.platform_commission_percent` (existing v2 path and wait-fee branch, unchanged math) and persist; `'subscription'` or NULL (pre-cutover, D5) → `platform_commission_bdt = 0` with an info-level zeroing log. The v6 shadow hard-code is deleted (`complete+api.ts:192-194, 261`): `calculateV6Fare` receives the same snapshot-driven percent as v2 (B6), so the shadow can never silently zero a commission-mode fare when Stage 1 flips.

### 3.5 Dispatch and lead billing — per-driver classification

**Kill-switch (decision 5, owner ruling M-02).** `platform_config.revenue_model` narrows to two live values, enforced in `app/api/admin/config+api.ts` ENUM_KEYS: `'subscription_only'` = kill-switch OFF (legacy behavior), `'hybrid'` = postpaid ON (per-driver possession governs). `'commission_only'` is removed from the allowed set; `parseRevenueModel` keeps defaulting unknown → `'subscription_only'` (the legacy default). Read ONCE per dispatch, fresh (unchanged rule).

**Unified OFF-mode contract (owner ruling M-02):** when OFF, legacy behavior applies at every gated layer, with possession predicates as the single unconditional exception —
1. Dispatch pool requires an active, un-frozen, usable subscription (a commission-only holder — active enrollment, no usable subscription — receives no offers, exactly as legacy skips drivers without a subscription).
2. Lead debit requires a `call_ledger` deduction row.
3. The accept guard strictly requires the deduction row (legacy guard unchanged — see the accept paragraph below).
4. Completion accrues 0% commission.
5. The purchase route executes the legacy prepaid flow (PortPos invoice before activation), regardless of client headers.
`frozen_at IS NOT NULL` means inactive in BOTH modes (D2 holds under rollback): a frozen holder's paid-up calls never become spendable after a rollback — they remain inactive until the driver unfreezes (switch back) or buys a new package. The `revenueModel` parameter threading REMAINS as the OFF/ON selector consumed by every gated layer (pool-entry predicate, per-row classification, auto-accept gate, `lead_cost_calls` payload derivation, accept guard) — it is narrowed to two values, not retired (resolving the Item 12/13 contradiction, Z8-D-3).

**Pool predicates (utils-server/dispatch.ts, kill-switch ON).** The candidate query joins `commission_enrollments` (active) and already joins `subscriptions`/`packages`; per-driver mode derives from rows, not from a pool-level constant:

*   **Subscription-usable** (decision 4): `subscriptions.status='active' AND frozen_at IS NULL AND expires_at > now() AND (calls_remaining > 0 OR calls_remaining = -1)` — note this tightens today's join, which checks only `status='active'` (fixing the pool slots consumed by expired rows, Codebase A3).
*   **Commission-mode**: active `commission_enrollments` row (and the enrollment's package `product_type='commission'`).
*   **Unified ceiling** (both modes): `lockout_exposure_paisa >= max_commission_debt_bdt` → excluded, replacing the retired rides-sum gate; `driver_unpaid_obligations` read ONCE per pool build.
*   **balanceScore** (owner disposition N-04, scale now defined): subscribers score `min(calls_remaining / 5, 1.0)` on a `[0, 1]` scale (`calls_remaining = -1` → 1.0); commission-mode drivers (enrolled, including frozen-call holders) are pinned to `COMMISSION_MODE_BALANCE_SCORE = 0.5` — the documented midpoint of that scale, a tunable that sets the interleaving policy between the two populations (B5: commission drivers are never ranked as zero-balance, and the −1 sentinel is never reused for commission).

**In-transaction classification and mode binding (`lib/leadBilling.debitLeadForOffer`; owner dispositions M-01/M-24).** The dispatch-level `revenueModel` parameter remains the OFF/ON selector (M-02): when OFF, the legacy debit path runs unchanged; when ON, classification derives per driver from locked rows inside the existing `SELECT … FOR UPDATE` transaction — subscription locked + usable → debit path; active enrollment (a single indexed lookup taken `FOR UPDATE` inside the same transaction, so a concurrent product switch cannot land between read and commit) → commission path: no subscription gates, no debit, offer row commits, `billed = true` with zero ledger rows (the shape at `leadBilling.ts:245-252`, now per-driver); neither → existing no-sub skip. **Durable binding (M-01):** the classified mode is written onto the `dispatch_offers` row in the same transaction, via the new additive column `dispatch_offers.monetization_mode` (schema item S7) — the offer row becomes the ride-level mode-of-record. This is the fix for B5's silent double-billing, and it closes the accept-window (Critic A-4): a product switch after classification cannot alter what the offer already recorded.

**Accept stamp and the accept-time revenue guard (`utils-server/index.ts`; owner disposition C-B1, Blocker).** The legacy guard in `executeMatchFlow` (`index.ts:2468-2482`, shared by manual accept `:1695-1698` and auto-accept `:2984-2990`) hard-rejects any accept whose driver has no `call_ledger` deduction row (`no_deduction`) — under ON mode this would reject every commission-mode accept, since they produce no deduction rows. The guard is rewritten per mode: subscription-mode acceptance still requires the deduction row (unchanged); commission-mode acceptance is proved by the live `dispatch_offers` row for `(ride_id, driver_id)` carrying `monetization_mode = 'commission'`. OFF mode restores the legacy guard verbatim. In the same accept transaction, the stamp copies the OFFER's classified mode onto `rides.monetization_mode_snapshot` — the snapshot is never re-derived from live possession (M-01: the mode-of-record is bound at classification time, so a switch between offer and accept cannot flip the ride's billing mode).

**Invariant restatement (M-14).** AGENTS.md dispatch invariant (6) is restated per-mode: "every offered SUBSCRIPTION-mode driver has a `call_ledger` deduction row regardless of outcome; every offered COMMISSION-mode driver gets an offer row with NO deduction (their bill is the fare commission, accrued at completion); every accept is proved per mode (deduction row vs live offer row)."

### 3.6 API surface changes

*   **`POST /api/package/purchase`** — postpaid grant + enrollment paths, settle-first gate, additive response (3.4). New error codes: `dues_outstanding_purchase_blocked` (409), `ceiling_floor_violation` surfaced via admin validation only.
*   **`POST /api/driver/dues/pay`** — unified settlement initiator with optional `bill_id` routing (3.4, OQ2).
*   **`GET /api/driver/dues`** — itemized payload: open subscription bills (id, amount, due date), commission dues, `total_unpaid_paisa` (the view; the canonical total), `credit_headroom_paisa`, warning flags (80% ceiling / `calls_remaining <= 2`), per-driver `is_dispatch_locked` with reason, `frozen_subscription: { id, calls_remaining, expires_at } | null` AND `active_subscription: { id, calls_remaining, expires_at } | null` as separate fields (M-16 — the lapse timer needs the active subscription's `expires_at` in plain ACTIVE state, and the calls widget renders the frozen badge even when the primary banner state is `OWING` or `CEILING_LOCKED`). **Backward-compatibility stubs (owner ruling M-04):** `total_outstanding_bdt` is RETAINED as a deprecated alias of the canonical total, and `revenue_model` is RETAINED as a deprecated stub returning the live kill-switch value — removed only after the client rollout floor passes.
    **`monetization_state` precedence (owner corrections: Gate 2 + review M-05/M-06)** — six server states, evaluated in strict priority order (hard lockouts win over informational states); PURCHASE_BLOCKED is not a server state (see the divergence note):
    1. `NO_PRODUCT` — no `subscriptions` row exists for the driver at all AND no active commission enrollment (pinned predicate, M-14).
    2. `CEILING_LOCKED` — `lockout_exposure_paisa >= max_commission_debt_bdt`.
    3. `LAPSED` — no active commission enrollment, and the latest-created `subscriptions` row (ordering: `created_at DESC`) is `status='expired'` or has `calls_remaining = 0`, or the driver holds `total_unpaid_paisa >= 1000` with no usable product.
    4. `OWING` — usable product held, `total_unpaid_paisa >= 1000` and `< ceiling`.
    5. `PRODUCT_FROZEN` — active commission enrollment + `subscriptions.frozen_at IS NOT NULL` with `expires_at > now() AND calls_remaining > 0`, and `total_unpaid_paisa < 1000`.
    6. `ACTIVE` — usable product held, `total_unpaid_paisa < 1000`.
    **Recorded divergence from D7** (owner disposition M-05/M-06/M-07, 2026-11-07 review): D7's six-state banner listed PURCHASE_BLOCKED as a server state; the review ruled it client-side — the server exposes six states (NO_PRODUCT added, replacing it) and the client renders PURCHASE_BLOCKED immediately on the typed `409 dues_outstanding_purchase_blocked` (the CUJ 7 deep-link recovery is that banner's content).
*   **`POST /api/payment/portpos/callback`** — new `subscription_settlement` branch (3.4).
*   **`PATCH /api/admin/config`** — `max_commission_debt_bdt` setter validates the D1 floor against live call-package prices; `revenue_model` narrowed to `{'subscription_only','hybrid'}` in ENUM_KEYS.
*   **`GET /api/admin/monetization/locked-drivers`** — new minimal read-only endpoint (D7): currently-locked drivers with reason, exposure, and per-reason aging derived from existing timestamps (M-15/M-05: ceiling-locked → earliest open `driver_bills.created_at` or earliest unpaid commission ride `completed_at`; lapsed → subscription `expires_at`; no_product → `drivers.created_at`); plus the `registered_drivers_no_product` count derived by SQL query (D4/M-05 — no persistence). Rendered as a card in the existing admin shell.
*   utils-server WS — no launch-scope change: the `billing_state_invalidated` hint is DEFERRED to post-launch (owner ruling M-21; the canonical 60s dues poll, app-foreground refresh, and trip-completion fetch cover state delivery).

### 3.7 Single-writer transition map (M-13, approved)

| # | Transition | Sole writer (file → function) |
| --- | --- | --- |
| T1 | Onboarding choice: trial grant / commission enrollment | `app/api/package/purchase+api.ts` → `lib/activateSubscription` (trial, existing) / `lib/monetizationMode.enrollCommission` |
| T2 | Buy call package → grant FIRST, then open bill (one tx — `subscription_id`/`due_at` dependency); expires any exhausted/stale subscription row in-tx first | `app/api/package/purchase+api.ts` → `lib/activateSubscription.grantSubscriptionOnCredit` + `lib/billsLedger.createOpenBill` |
| T3 | Commission settlement | `lib/paymentRepair.settleCommissionDues` (existing) |
| T3b | Subscription-bill settlement | `lib/billsLedger.settleSubscriptionBill` via callback `subscription_settlement` branch |
| T4 | Commission accrual | `app/api/ride/[id]/complete+api.ts` (existing sole writer, now snapshot-gated) |
| T5 | Mutual zeroing at completion | `app/api/ride/[id]/complete+api.ts` (same tx, logged) |
| T6 | Switch to commission (freeze calls); permitted with usable paid-up subscription or none; `409 already_enrolled_commission` if already enrolled | purchase route → `lib/monetizationMode.enrollCommission` |
| T6b | Switch back to frozen call package (unfreeze; no bill, no grant) | purchase route → `lib/monetizationMode.switchBackToCallPackage` |
| T6c | Commission driver buys a NEW call package (no frozen usable subscription): end enrollment + grant + bill, all in one tx (grant before bill) | purchase route → `lib/monetizationMode.endActiveEnrollment` + `lib/activateSubscription.grantSubscriptionOnCredit` + `lib/billsLedger.createOpenBill` |
| T7 | Lapse / lockout / unlock | DERIVED only — no writer touches `driver_bills` or `commission_enrollments` on lapse (the scheduler's `subscriptions.status='expired'` flip is a subscription-row mutation, not a bills/enrollment mutation); lockout events are logged by dispatch/dues readers |
| T8 | Admin waiver/adjustment | `lib/billsLedger.waiveBill` (defined as the only sanctioned path; admin UI deferred per Non-Goals) |

Rule recorded for the future: any new bill-reduction path (cashback, referrals, compensation credits) MUST go through `lib/billsLedger` — wallet credits never reduce unpaid totals directly.

### 3.8 Observability (B8/D7)

*   **Lockout/unlock events** — info-level structured logs at the three enforcement points (dispatch pool filter, purchase settle-first gate, dues/state computation): `{driverId, reason: no_product | subscription_lapsed | balance_exhausted | debt_ceiling | settle_first_blocked, exposurePaisa, ceilingPaisa}`; symmetric unlock log on recovery.
*   **Billing outcomes** — `leadBilling` logs an info-level outcome per attempt (`billed | skipped, reason`) — closing the five silent `billed=false` exits (`leadBilling.ts:129-162, 256-258`).
*   **Accrual trail** — per commission ride: `{driverId, rideId, percent, basisFarePaisa, commissionPaisa}`; per subscriber ride with percent > 0: zeroing log. Anomaly condition "commission accrued while snapshot = subscription" is structurally impossible (completion is snapshot-gated) and asserted by an invariant test.
*   **Admin surface** — locked-drivers endpoint + minimal UI card (D7). Fleet-wide exposure aggregates are a follow-up, not launch scope.

### 3.9 Rollout and kill-switch mechanics (M-8, decision 6)

*   **Stage 1 — schema only.** Drizzle migration: S1–S6 additive objects, `driver_commission_settlements.kind` backfill, view creation, seed checks for the D1 invariant. Old code ignores all of it (additive columns/tables/views are inert).
*   **Stage 2 — utils-server.** Ships per-driver predicates + view-based ceiling + snapshot writing, with the kill-switch read fresh per dispatch. With `revenue_model='subscription_only'` (the state during this stage), behavior is byte-for-byte legacy: no commission enrollments can exist (the old API cannot sell them), so empty-possession degradation is guaranteed by construction, not by discipline.
*   **Stage 3 — API/EAS + activation.** Postpaid purchase paths go live; admin sets `revenue_model='hybrid'`. Onboarding choice, driver states, dues itemization ship in this stage (client + API together).
*   **Rollback** — `revenue_model='subscription_only'` (config write, no redeploy) restores the legacy OFF-mode contract at every gated layer (M-02). State safety by construction: open bills stay readable and payable (the dues screen keeps its reader; settlement via `dues/pay` keeps working — the rollback is a config write, so the new settlement code remains deployed and simply stops being reached by old clients); granted calls let run down naturally, bounded by expiry (force-expiry rejected as harmful to driver retention); drivers holding `frozen_at` subscriptions or active enrollments keep that possession state honored (frozen subscriptions stay inactive per D2 — the pool predicate is unconditional; commission-only holders stop receiving offers under the legacy pool, and their accrued dues remain payable via the dues screen); subscription settlements live in `driver_bills`, never in `driver_commission_settlements`, so legacy commission math cannot misattribute them (S6 isolation invariant). pgEnum additions (`package_product_type`, `monetization_mode`) are new enums — no existing enum is widened, honoring F-10. **Stage 2 preflight (review N-03):** before the utils-server deploy, assert the live `platform_config.revenue_model` is `subscription_only` (the narrowed parser silently re-defaults any other value, so the assertion makes the degradation argument a checked fact rather than an assumption).
*   **Deploy-order note** — the utils-server pool's possession lookup is a JOIN on the candidate query (single query, no per-offer config reads), honoring the zero-config-queries rule (`leadBilling.ts:44-53`).

## Alternatives Considered

Carried from the approved brainstorm (`concepts_brief.md` §Alternatives Weighed) — seven entries: six were weighed during the Goldfish review, plus Alternative G, elevated from the brief's schema forbid-list; all were confirmed by owner dispositions. They are recorded here because this document is their only carrier into implementation.

### Alternative A: Unpaid obligations represented purely inside `payment_events` (derived aggregate, no new table)

*   **Pros**: Zero new write paths; "bill generated immediately at purchase" maps 1:1 onto the existing purchase event row; no third ledger to own.
*   **Cons**: The legacy orphan sweep (`utils-server/scheduler.ts:1169-1197`) auto-enqueues unpaid-looking events into compensation, and `repairPaymentEvent`'s fallthrough would mark them paid or doom-loop them; the callback's `subscription_id` short-circuit makes same-event settlement unreachable; no status value means "money owed".
*   **Reason for Rejection**: Three independently verified corruption paths (F-1/F-3/F-4). Chosen instead: dedicated `driver_bills` fenced from legacy machinery, with the unified figure expressed once as the `driver_unpaid_obligations` view.

### Alternative B: Delete the global `revenue_model` toggle outright

*   **Pros**: No dead-code layer; removes the ~7-site plumbing immediately.
*   **Cons**: Loses the config-write rollback lever during rollout; churns seven test files fossilizing the toggle for zero behavioral gain at launch.
*   **Reason for Rejection**: Demotion to a two-value kill-switch (`subscription_only` = legacy OFF, `hybrid` = postpaid ON) keeps rollback as a config write (G8) and preserves the safe default; deletion is deferred cleanup with its end-state written down (no third state).

### Alternative C: A dedicated second product rail for the commission package (new product table + purchase flow)

*   **Pros**: Clean separation of the two monetization products.
*   **Cons**: Forks the entire purchase machinery (idempotency, fraud gate, role checks, vehicle-type scoping, admin surfaces) that the `packages` table already carries.
*   **Reason for Rejection**: A commission package is one `packages` row (`price_bdt = 0`, `product_type = 'commission'`, non-expiring) bought through the existing rail; possession lives in `commission_enrollments`, not in a parallel pipeline.

### Alternative D: Product switch lets paid-up calls lapse naturally (no frozen state)

*   **Pros**: No new subscription state machinery; simplest possible switch semantics.
*   **Cons**: Destroys paid-up value at switch time; contradicts the owner's A2′ ruling; makes the onboarding "you can switch later" promise dishonest.
*   **Reason for Rejection**: Owner ruled for preservation (D2): additive `subscriptions.frozen_at` column, rollback-lossless, with the shared usable-predicate consuming it in both dispatch and lead billing.

### Alternative E: Dispatch-level revenue model constant passed into lead billing

*   **Pros**: Minimal change — the existing `revenueModel` parameter keeps flowing as today.
*   **Cons**: A mixed chain (subscriber + commission drivers) gets classified by one pool-level constant, silently double-billing commission drivers (B5); commission holders ranked as zero-balance by `balanceScore`.
*   **Reason for Rejection**: Per-driver classification inside the debit transaction (from locked rows) is the only shape that honors G1; the pool constant is demoted to the kill-switch.

### Alternative F: Completion re-derives monetization mode from live possession

*   **Pros**: No new column on rides.
*   **Cons**: A driver switching products mid-ride has undefined billing — which moment owns the mode becomes a recurring bug class.
*   **Reason for Rejection**: Mode is snapshotted on the ride at accept time (repo precedent: the MFS settlement snapshot, `complete+api.ts:430-435`); completion reads the snapshot only. Also yields D5 grandfathering for free (NULL = pre-cutover).

### Alternative G: A `mode` column on `drivers`

*   **Pros**: Trivially queryable mode.
*   **Cons**: A second source of truth that can drift from actual possession; contradicts the owner's possession-defines-mode ruling; every possession change needs a cache write.
*   **Reason for Rejection**: Forbidden by the M-10 schema allow/forbid list; mode is always derived from possession rows (through `lib/monetizationMode`), and ride-time ambiguity is handled by the snapshot (Alternative F).

## Non-Functional Requirements

*   **Security & Privacy**: The PortPos callback's `verifyIPN` remains mandatory and untouched; settlement of subscription bills flows through the same verified-callback path as commission. No new client-safe secrets; all money gates (settle-first, ceiling, fraud) are server-enforced; the callback's amount comparison stays in integer paisa.
*   **Performance**: Dispatch adds one view query per pool build (`WHERE driver_id = ANY(...)` with filter pushdown, S5 covering index) and one enrollment join — O(candidates × open bills), replacing the O(lifetime rides) commission sum. The client state poll is one lightweight request per 60s while online. Per-offer CONFIG reads are forbidden; the classification transaction's single indexed possession lookup (`FOR UPDATE` on the enrollment row) is the enumerated exception — it is part of the money-write transaction, not a config read (M-11).
*   **Launch success metrics (owner disposition M-23)**: (1) zero ride-grain G1 violations reported by the Item 14 reconciliation across the first 30 days after `postpaid_cutover_at` is set; (2) billing-outcome logs contain no completed ride that is neither billed nor accrued; (3) every lockout event has a matching unlock event or an active reason; (4) settle-first rejection and dues-payment success rates captured from launch as the observability baseline.
*   **Rollout & Rollback**: Fully specified in §3.9 — additive schema first, utils-server with construction-guaranteed legacy degradation second, API/EAS third, kill-switch rollback by config write with state-safety invariants (bills readable/payable, calls let-run-down, settlement isolation via `kind`/separate tables, frozen/enrolled possession honored).

## Detailed Implementation Plan

Single list; each file appears exactly once. Within each stage, list order is build order. Rollout follows §3.9 (schema → utils-server → API/EAS); within each stage the order below is the build order.

### Stage 1 — Schema and shared libs

#### 1. `src/db/schema.ts` (Modify)

*   **Type / Scope**: Drizzle schema — the authoritative schema for all money tables.
*   **Proposed Changes**: Add enum `package_product_type` (`call_package | commission`) + `packages.product_type` (NOT NULL DEFAULT `'call_package'`); create `driver_bills` (S2, both partial unique indexes) and `commission_enrollments` (S3, one-active partial unique index); add `subscriptions.frozen_at` (S4, nullable); add enum `monetization_mode` + `rides.monetization_mode_snapshot` (S5, nullable); add `driver_commission_settlements.kind` (S6, varchar NOT NULL DEFAULT `'commission'`); add `dispatch_offers.monetization_mode` (S7 — new: enum `monetization_mode`, NULL for legacy rows; written by `lib/leadBilling` in the debit transaction, per M-01's durable mode binding). `payment_events` is deliberately UNCHANGED (owner disposition C-B2, option b — no metadata column). Snake_case property names throughout; `isNull()` checks only; self-referencing FKs use the `(): any` pattern where the type checker reports circular references.

#### 2. `src/db/migrations/<next-sequential>_postpaid_monetization.sql` (Create)

*   **Type / Scope**: Migration — generated by `npx drizzle-kit generate`, then hand-extended.
*   **Proposed Changes**: Hand-appended DDL the generator cannot express: `CREATE VIEW driver_unpaid_obligations` (§3.3, including the `status='active'` self-bill carve-out per M-03), the S5 partial covering index, backfill `UPDATE driver_commission_settlements SET kind='commission' WHERE kind IS NULL` (redundant with the column DEFAULT, retained as backfill), and the D1 seed-time assertion (`max_commission_debt_bdt >= max live call-package price + 1,000` — aborts the migration if violated).

#### 3. `lib/billsLedger.ts` (Create)

*   **Type / Scope**: New lib module — SOLE writer of `driver_bills` (AGENTS.md write-ownership addition; `lib/fleetAssignment.ts` precedent).
*   **Proposed Changes** (signatures pinned per M-12): `createOpenBill(tx, {driverId, subscriptionId, amountBdt, dueAt}) → inserted bill row {id, driver_id, amount_bdt, due_at, status}`; raises typed `BillSlotConflictError` on 23505 (route maps to `409 dues_outstanding_purchase_blocked` — pinned code, IR-A15). `settleSubscriptionBill(tx, {eventId}) → {billId} | null` — acquires the driver advisory lock, resolves the driver's single open `subscription_purchase` bill under lock (C-B2 option b; no metadata column exists or is added), marks `settled` + stamps `payment_event_id = event.id`; returns null (idempotent no-op) when the bill is already settled with the same event. NO `waiveBill` in v1 (review Z5-F4: unused money-module surface; the ownership rule below is the durable record). Every function takes the caller's tx handle; no module-level `db` writes.

#### 4. `lib/monetizationMode.ts` (Create)

*   **Type / Scope**: New lib module — SOLE writer of `commission_enrollments` and `subscriptions.frozen_at`; the single mode-resolution source.
*   **Proposed Changes** (signatures pinned per M-12): `getDriverMonetizationMode(driverId, executor) → 'subscription' | 'commission' | 'none'` (possession rows: usable subscription per the §3.5 predicate vs active enrollment); `enrollCommission(tx, {driverId, packageId}) → {enrollmentId}` — performs the `already_enrolled_commission` check itself (route maps to 409) and sets `frozen_at = now()` on a usable paid-up subscription; `switchBackToCallPackage(tx, {driverId}) → {unfrozenSubscriptionId}` — validates active enrollment + usable frozen subscription + dues settled-or-dust (reading `getDriverUnpaidObligations` via the tx executor); `endActiveEnrollment(tx, {driverId}) → {endedEnrollmentId} | null`; `ensureCommissionPackage(executor) → packageId` — idempotent seed of the canonical ৳0 commission package (`product_type='commission'`, `price_bdt=0`, `is_trial=false`, `duration_days`/`expires_at` NULL), mirroring `ensureLaunchFreePackage`; executor is the module `db` for seed/tsx callers (owner disposition M-20). Shared exported predicate helpers consumed by dispatch + leadBilling so the usable-subscription definition cannot drift.

#### 5. `lib/activateSubscription.ts` (Modify)

*   **Type / Scope**: Money lib — call_ledger `initial_load`/`credit` write owner (AGENTS.md).
*   **Proposed Changes**: Add `grantSubscriptionOnCredit(tx, { driverId, package }) → { subscriptionId, expiresAt }` (package = the already-fetched packages row; `expiresAt` derived from the package exactly as the legacy path derives it): expires any stale/exhausted/frozen-expired subscription rows for the driver in-tx, inserts the new subscription + `initial_load` row. Grant MUST execute before `createOpenBill` inside the shared tx (the bill's `subscription_id`/`due_at` depend on it); a 23505 in the later bill insert rolls the grant and `call_ledger` back completely (owner fix, Gate 3). The legacy `activateSubscription` (callback/trial path, amount==price validation, `paid` stamping) is UNCHANGED — the two paths are siblings inside the same write-owner file (F-2 requirement).

#### 6. `lib/paymentEvents.ts` (Modify)

*   **Type / Scope**: `payment_events` creation owner.
*   **Proposed Changes**: Extend the `PortposPaymentInitiation.purpose` union with `'subscription_settlement'` (line 31 — the interface `initiatePortposPayment` consumes; IR-A10 corrects the earlier :70 pointer, and `createZeroAmountPaymentEvent` never issues settlements). NO metadata parameter or column (owner disposition C-B2). `dues/pay` always initiates amounts ≥ 1,000 paisa.

#### 7. `lib/paymentRepair.ts` (Modify)

*   **Type / Scope**: Compensation repair — shared transactional repair invoked by callback + compensation worker.
*   **Proposed Changes**: New `subscription_settlement` dispatch branch routing to `lib/billsLedger.settleSubscriptionBill`; guarantee the driver_package fallthrough (`:242-243`) can never receive a settlement event (purpose check ordering). `utils-server/compensationWorker.ts` itself needs NO change: its only coupling is the purpose-string dispatch (IR-C-8).

#### 8. `lib/commissionDues.ts` (Modify)

*   **Type / Scope**: Shared dues math.
*   **Proposed Changes**: `computeDriverCommissionDuesWith` selects `net_commission_paisa` from `driver_unpaid_obligations` (kind-filtered, snapshot-gated) instead of hand-rolled sums; add `getDriverUnpaidObligations(driverId, executor) → { unpaidSubscriptionPaisa, netCommissionPaisa, totalUnpaidPaisa, activeSelfBillPaisa, lockoutExposurePaisa }` — an explicit hand-written interface over raw SQL (pinned: no `pgView`, IR-A13), consumable by the settle-first gate, dues screen, deletion gate, and dispatch. The "keep the two definitions in step" comment is replaced by the M-14 drift-guard test.

#### 9. `lib/platformConfig.ts` (Modify)

*   **Type / Scope**: platform_config readers (never cached).
*   **Proposed Changes**: `parseRevenueModel` narrows the live set to `{'subscription_only','hybrid'}` (unknown → `'subscription_only'`, preserving the legacy default); `RevenueModel` docs updated to kill-switch semantics; `getMaxCommissionDebtBdt` unchanged.

#### 10. `lib/accountDelete.ts` (Modify)

*   **Type / Scope**: Account-deletion gate.
*   **Proposed Changes**: `checkDeleteDues` blocks on `total_unpaid_paisa >= 1,000` from the view (unpaid subscription bills + commission; dust-aligned so sub-৳10 never strands deletion).

#### 10a. S7 rationale (schema note)

`dispatch_offers.monetization_mode` (Item 1) is the durable ride-level mode binding required by M-01: classification writes it inside the debit transaction, and the accept stamp copies it onto `rides.monetization_mode_snapshot` — closing the offer/accept window without re-derivation. NULL on legacy rows preserves D5 semantics (NULL = pre-cutover).

### Stage 2 — utils-server

#### 11. `utils-server/dispatch.ts` (Modify)

*   **Type / Scope**: Dispatch engine — candidate pool.
*   **Proposed Changes**: Kill-switch read stays once-per-dispatch. OFF (`subscription_only`): legacy pool exactly as today, plus the unconditional frozen predicate (`frozen_at IS NULL` respected — M-02). ON (`hybrid`): join `commission_enrollments`, tighten the subscription predicate with `frozen_at IS NULL AND expires_at > now()`, unified ceiling from the view (`lockout_exposure_paisa >= ceiling`, `WHERE driver_id = ANY(...)`), per-driver `balanceScore` (subscribers `min(calls/5, 1.0)`, −1 → 1.0; commission-mode pinned to `COMMISSION_MODE_BALANCE_SCORE = 0.5`), retirement of the rides-sum debt query (`:285-322`); structured lockout log lines promoted to info level with reason enums (B8). The gated-layer list for OFF mode is the §3.5 contract: pool predicate, per-row classification, auto-accept gate, payload derivation, accept guard (M-02 — every layer consumes the `revenueModel` selector; it is narrowed, not retired).

#### 12. `utils-server/leadBilling.ts` (Modify)

*   **Type / Scope**: Debit-on-offer lead billing.
*   **Proposed Changes**: The `revenueModel` parameter is RETAINED as the OFF/ON selector (M-02 resolves the Item 12/13 contradiction — it is narrowed to two values, not retired). OFF: the legacy path runs unchanged (drivers without an active subscription skip; every offer debits). ON: per-driver classification from locked rows inside the `SELECT … FOR UPDATE` tx — usable subscription → debit path; active enrollment (single indexed lookup, taken `FOR UPDATE`) → commission path: no gates, no debit, offer row commits with `dispatch_offers.monetization_mode = 'commission'` (S7, M-01), `billed = true`; neither → no-sub skip (the shape at `leadBilling.ts:245-252`, now per-driver). Info-level outcome log on every attempt (`billed | skipped, reason`) — closing the five previously unlogged paths (`:131, :142, :155, :161, :257`). Existing invariant-test-visible behavior is pinned by tests 36–38.

#### 13. `utils-server/index.ts` (Modify)

*   **Type / Scope**: WS server — pipeline, accept stamps, offer payloads, ACCEPT GUARD.
*   **Proposed Changes**: (1) **Accept-time revenue guard rewrite (C-B1, Blocker):** `executeMatchFlow` (`index.ts:2468-2482`, shared by manual accept `:1695-1698` and auto-accept `:2984-2990`) currently hard-rejects accepts with no `call_ledger` deduction row. Rewrite per mode: subscription-mode acceptance keeps the deduction-row requirement unchanged; commission-mode acceptance is proved by the live `dispatch_offers` row for `(ride_id, driver_id)` carrying `monetization_mode = 'commission'` (no deduction exists or is required). OFF mode restores the legacy guard verbatim. (2) **Accept stamp (M-01):** in the accept transaction, copy the offer's `dispatch_offers.monetization_mode` onto `rides.monetization_mode_snapshot` — no live re-derivation; the write executes only under `hybrid` (IR-A12: OFF writes nothing, preserving the D5 NULL boundary). (3) Stop threading a pool-level revenueModel value into ON-mode billing (it remains the OFF/ON selector per Item 12); `lead_cost_calls` in offer payloads derives per-driver, kill-switch-aware (B5). The `billing_state_invalidated` WS hint is REMOVED from launch scope (owner ruling M-21).

#### 14. `utils-server/scheduler.ts` (Modify)

*   **Type / Scope**: Background jobs (expiry flip unchanged).
*   **Proposed Changes**: New reconciliation job (B2) with the EXACT invariants (owner fix, Gate 3; exclusions listed as bullets per review IR-C-3 — broader assertions would false-alert on pre-cutover prepaid subscriptions (A1′), ৳0 trials (D4), and bills whose subscriptions have since expired or exhausted):
    - Every subscription with `is_trial = false` created after `postpaid_cutover_at` that has no paid `driver_package` row in `payment_events` MUST have exactly one `driver_bills` row (`open` or `settled`) with `driver_bills.subscription_id = subscriptions.id`.
    - Every `driver_bills` row with `kind = 'subscription_purchase'` MUST reference a valid `subscriptions.id`.
    - **Ride-grain G1 exclusivity audit (owner disposition M-24):** every completed post-cutover ride with `monetization_mode_snapshot = 'subscription'` MUST have a `call_ledger` deduction pair for its accepting driver; every completed ride with snapshot `'commission'` MUST have accrued commission or a documented 0% basis. This converts G1 into an auditable invariant (Z8-(c)).
    The cutover moment is the new `platform_config` key `postpaid_cutover_at`, written during the Stage-3 activation runbook (M-13); the job reads it fresh and no-ops until it is set. Alert-on-drift, no auto-repair; respects `INSTANCE_COUNT=1`.

#### 15. `utils-server/types.ts` — REMOVED FROM SCOPE

*   **Type / Scope**: No change.
*   **Proposed Changes**: NONE (owner ruling M-21): the `billing_state_invalidated` WS hint is deferred to post-launch; `utils-server/types.ts` is not modified in this design. State delivery relies on the canonical 60s dues poll, app-foreground refresh, and trip-completion fetch (OQ1).

### Stage 3 — API routes and admin

#### 16. `app/api/package/purchase+api.ts` (Modify)

*   **Type / Scope**: Purchase boundary — Zod + `parseJsonBody` + idempotency (existing).
*   **Proposed Changes**: §3.4 routing inside the initiation advisory lock: **dual-lane selection** (OFF, or ON + no `x-client-postpaid: 1` header → legacy prepaid path unchanged, `initiatePortposPayment` invoice before activation; ON + header → postpaid lanes — owner ruling M-04, closing the invisible-debt window for un-updated clients), settle-first pre-check + in-tx re-check, narrowed `active_subscription_exists` (usable-only), T2/T6/T6b/T6c branches, new error codes `dues_outstanding_purchase_blocked` (409 — also the pinned mapping for the S2 23505 backstop, IR-A15) and `already_enrolled_commission` (409); additive response fields incl. the T6b `unfrozen` shape; trial branch placement after the settle-first re-check inside Call Package routing (CR-A13).

#### 17. `app/api/driver/dues+api.ts` (Modify)

*   **Type / Scope**: Dues read boundary.
*   **Proposed Changes**: Itemized payload + `monetization_state` with the six-state precedence (§3.6, M-05/M-06/M-07 — PURCHASE_BLOCKED is client-side on the 409), pinned NO_PRODUCT/LAPSED predicates and `created_at DESC` ordering (M-14), `frozen_subscription` and `active_subscription` fields (M-16), `credit_headroom_paisa`, warning flags, per-driver `is_dispatch_locked` + reason; `total_outstanding_bdt` and `revenue_model` RETAINED as deprecated stubs until the client rollout floor passes (M-04); all live figures from the view.

#### 18. `app/api/driver/dues/pay+api.ts` (Modify)

*   **Type / Scope**: Unified settlement initiator (OQ2).
*   **Proposed Changes**: Optional `bill_id` routing (commission default, backward compatible; the `bill_id` is validated to belong to the authenticated driver before any invoice — CR-A15; the authoritative bill resolution happens at callback under lock per C-B2); view-driven amount; `MIN_PAYMENT_BDT` retained with dust roll-forward; `subscription_settlement` invoice initiation; deterministic settlement idempotency keys for both purposes stay ≤ 64 chars (pinned format `subscription_settlement_<billId>` — fits `varchar(64)`; mirrors the existing commission key pattern in `lib/paymentRepair.ts`); `driverDuesPay` is already registered in `IDEMPOTENCY_ROUTES` (no extension needed — IR-A10 note).

#### 19. `app/api/payment/portpos/callback+api.ts` (Modify)

*   **Type / Scope**: Public payment callback — `verifyIPN` must not be removed or bypassed.
*   **Proposed Changes**: New `subscription_settlement` purpose branch → `lib/billsLedger.settleSubscriptionBill(tx, {eventId})` (driver advisory lock → resolve single open bill → settle → link event, C-B2); branch ordering keeps it clear of the `subscription_id` short-circuit and the repair fallthrough; idempotent replay handling per S2's `driver_bills_payment_event_uq`; logging mirrors the commission branch (B7 floor).

#### 20. `app/api/admin/config+api.ts` (Modify)

*   **Type / Scope**: Admin config boundary — `requireAdminPermission` enforced (AGENTS.md RBAC).
*   **Proposed Changes**: `revenue_model` ENUM_KEYS narrowed to `{'subscription_only','hybrid'}` (IR-B-N1: the value set lives in ENUM_KEYS at :241, not ALLOWED_KEYS); `max_commission_debt_bdt` setter validates the D1 floor against live call-package prices (`ceiling_below_package_price` rejection).

#### 21. `app/api/admin/packages+api.ts` (Modify)

*   **Type / Scope**: Admin package management.
*   **Proposed Changes**: Call-package create/update validates `price <= max_commission_debt_bdt - 1,000` (the D1 ceiling side) AND the price floor `price_bdt == 0 (trial) OR price_bdt >= 1,000` (owner ruling M-09 — an open bill below the settlement minimum can never exist); commission packages enforce `price_bdt = 0`, `duration_days/expires NULL`, `product_type='commission'` (D3).

#### 22. `app/api/admin/monetization/locked-drivers+api.ts` (Create)

*   **Type / Scope**: Minimal admin read (D7), `requireAdminPermission`.
*   **Proposed Changes**: Currently-locked drivers with reason, exposure, and per-reason aging derived from EXISTING timestamps (owner ruling M-05/M-15 — no event store): ceiling-locked → earliest open `driver_bills.created_at` (or earliest unpaid commission ride `completed_at`); lapsed → subscription `expires_at`; no_product → `drivers.created_at`. The enumerated set is the pool's three exclusion reasons (no_product / lapsed / ceiling). Also returns the `registered_drivers_no_product` count, derived by SQL query (D4/M-05 — no persistence). Rendered as a card in the existing admin shell.

#### 23. `app/api/ride/[id]/complete+api.ts` (Modify)

*   **Type / Scope**: Ride completion — commission accrual owner (T4/T5).
*   **Proposed Changes**: Read `monetization_mode_snapshot` (never re-derive); `'commission'` → existing percent math on both v2 and v6 paths (delete the v6 hard-zero at `:261` and its comment at `:192-194`); `'subscription'`/NULL → zero + zeroing log; info-level accrual log (B8). The response returns `platform_commission_bdt` and `monetization_mode_snapshot` so the driver trip-complete summary can render the commission line when the snapshot is `'commission'` (CUJ 3 — owner fix, Gate 3).

### Driver client (ships with Stage 3)

#### 24. `app/(main)/(rider)/packages.tsx` + `app/(main)/(rider)/subscription-checkout/index.tsx` (Modify both)

*   **Type / Scope**: Purchase surfaces.
*   **Proposed Changes**: `packages.tsx` — postpaid purchase flow (grant-without-checkout handling via the existing `data.activated` pattern), post-purchase credit modal ("N calls added · Bill ৳X — Pay Now or Pay Later"; Pay Now → `dues/pay` directly per OQ2; the word "free" never appears), commission enrollment card, headroom display, blocked-purchase deep-link handling, and the `x-client-postpaid: 1` request header (M-04). `subscription-checkout/index.tsx` — the second live purchase surface (IR-B-M3): it POSTs the same route and must handle the new response contract (`activated`/`bill`/`enrollment`, the two 409 codes, `payment_url: null` on postpaid lanes) and send the same header; `app/(main)/(shop-owner)/index.tsx:279` is triaged in the same item (non-driver rail, but the route's new gates sit ahead of the driver gate).

#### 25. `app/(main)/(rider)/due-amounts/index.tsx` (Modify)

*   **Type / Scope**: Dues screen.
*   **Proposed Changes**: Itemized bills (subscription lines with due dates + commission line), per-line/total pay controls hitting `dues/pay`, the canonical `total_unpaid_paisa` rendered with the legacy `total_outstanding_bdt` alias retained until the client floor passes (M-04; the current screen consumes `total_outstanding_bdt` at `:35,390`), headroom, sub-floor commission dust rendered as non-payable (N-06), state banner parity with home.

#### 26. `app/(main)/(rider)/d/(tabs)/index.tsx` + `app/(main)/(rider)/d/(tabs)/_layout.tsx` (Modify both)

*   **Type / Scope**: Driver home + layout.
*   **Proposed Changes**: Six-state banner (server `monetization_state` per §3.6 precedence) with one-tap recovery CTAs, plus the client-rendered PURCHASE_BLOCKED banner on the typed 409 (M-05/M-06); 80%-ceiling / `calls_remaining <= 2` warning banners; NO_PRODUCT one-tap choice card; **frozen-calls rendering on the home calls widget** (M-19: `activeSubscription.calls_remaining` at `:1437-1453` and `_layout.tsx:57` must not render frozen calls as spendable — frozen state from `frozen_subscription`); trip-complete summary renders the commission line when `monetization_mode_snapshot === 'commission'`, using the completion response's `platform_commission_bdt` (CUJ 3 — owner fix, Gate 3); lifecycle fetches (launch/focus, post-ride, post-purchase/callback return) + 60s online poll + expiry timer (OQ1; no WS hook — M-21).

#### 27. `app/(main)/(rider)/d/(tabs)/wallet/index.tsx` (Modify)

*   **Type / Scope**: Wallet screen.
*   **Proposed Changes**: Frozen-calls widget rendering per D7 (never as spendable balance; `frozen_subscription` field drives the paused badge) — complementing the home-side rendering added in Item 26 (M-19).

#### 28. `app/(main)/(rider)/onboarding/index.tsx` (Modify)

*   **Type / Scope**: Onboarding wizard.
*   **Proposed Changes**: Monetization choice step (D4): side-by-side product cards, worked Taka example for the driver's vehicle type, launch-0%-commission handling that never misleads (Copy Truth), trial attached to the Call Package option; choice submits through the existing purchase route; raw error codes never rendered (`:96` pattern fixed for new codes).

#### 29. `store/useMonetizationStateStore.ts` (Create)

*   **Type / Scope**: Client state — NEW dedicated Zustand store (owner disposition M-16: the store decision is pinned rather than deferred).
*   **Proposed Changes**: Holds the fetched monetization payload (`monetization_state`, bills, headroom, `frozen_subscription`, `active_subscription`); Items 24–28 consume it; registered in the `storeRegistry` in `lib/authCleanup.ts` (sign-out reset rule). A dedicated store avoids coupling billing state to package or driver-profile stores and makes the reset registration explicit.

#### 30. `i18n/locales/en/common.json` + `i18n/locales/bn/common.json` (Modify both)

*   **Type / Scope**: i18n.
*   **Proposed Changes**: All new strings (states, banners, errors, post-purchase modal) in BOTH locales with the agreed minimal vocabulary (bill / amount due / pay / locked); parity gate (`scripts/audit-i18n-orphans.cjs` via `npm run check:i18n-orphans`) must pass.

### Admin UI

#### 31. `components/admin/AdminShell.tsx` + `app/admin/monetization.tsx` (Modify + Create)

*   **Type / Scope**: Admin shell navigation + new screen.
*   **Proposed Changes**: NAV table entry (the audited nav table) → locked-drivers card/screen consuming endpoint 22 (reason, exposure, aging).

### Scripts and governance docs

#### 32. `scripts/seed-platform-config.js` (Modify)

*   **Type / Scope**: Config seeding.
*   **Proposed Changes**: Seed `revenue_model='subscription_only'` and `max_commission_debt_bdt=50000` explicitly; assert the D1 floor invariant against seeded package prices at seed time; idempotently seed the canonical ৳0 Commission package with the insert SQL INLINED in the script (owner disposition M-20: the CJS script cannot import the TS lib; the SQL mirrors `ensureCommissionPackage()`'s predicate and the `pg_advisory_xact_lock` pattern, with a comment binding the two as one contract — the helper remains the runtime consumer of record). `postpaid_cutover_at` is deliberately NOT seeded — it is written by the Stage-3 activation runbook (M-13). The new seeds are pinned in `tests/meta/platform-config-seeds-not-constants.test.ts` (Item 47).

#### 33. `scripts/check-driver-dues-live.ts` (Modify)

*   **Type / Scope**: Live dues verification (opt-in, writes to DATABASE_URL — never CI).
*   **Proposed Changes**: Update assertions to the itemized response shape (`revenue_model` retained as a deprecated stub per M-04, so the field persists); fix `GATED_MODELS = ["commission_only", "hybrid"]` (line 70) — after Item 20 removes `'commission_only'` from ENUM_KEYS, the mutation legs must use the narrowed set (IR-B-N5); add a postpaid scenario leg (seed open bill → assert `total_unpaid_paisa`, state, settle-first 409 on purchase attempt).

#### 34. `AGENTS.md` (Modify)

*   **Type / Scope**: Project quick-reference (governance source of truth).
*   **Proposed Changes**: Restate dispatch invariant (6) per-mode (§3.5); write-ownership additions (`driver_bills` → `lib/billsLedger.ts`; `commission_enrollments` + `subscriptions.frozen_at` → `lib/monetizationMode.ts`); monetization model paragraph (postpaid, possession=mode, two products); `revenue_model` kill-switch narrowing; Zero Escrow ruling amendment text (D7, dated 2026-11-07).

#### 35. `CLAUDE.md` (Modify)

*   **Type / Scope**: Deep-dive doc — sync mirror of AGENTS.md per the cross-reference rule.
*   **Proposed Changes**: Mirror every AGENTS.md change above wherever the duplicated content appears.

### Tests

#### 36. `utils-server/__tests__/dispatch-commission-debt.test.ts` (Modify)

*   **Type / Scope**: Invariant test — premise inverts (M-14).
*   **Proposed Changes**: Unified ceiling gates in BOTH modes; `getMaxCommissionDebtBdt` IS called under postpaid for subscribers (self-bill carve-out asserted via `lockout_exposure_paisa`).

#### 37. `utils-server/__tests__/leadBilling.test.ts` (Modify)

*   **Type / Scope**: Billing test.
*   **Proposed Changes**: Per-driver in-tx classification cases (subscriber debit / commission no-debit offer-commit / neither skip); revenueModel-param mocks removed.

#### 38. `utils-server/__tests__/dispatch-{blocklist,cooldown,min-per-km,pool-predicates,women-only}.test.ts` (Modify — 5 files)

*   **Type / Scope**: Existing dispatch suites.
*   **Proposed Changes**: `getRevenueModel` mocks updated to kill-switch semantics (OFF → identical behavior pinned; ON → possession predicates). Closing step: `grep getRevenueModel utils-server/__tests__` before declaring this item done — `utils-server/index.ts:2890` also calls it on the offer path, so offer-path suites may mock it too (IR-A14).

#### 39. `utils-server/__tests__/dispatch-postpaid.test.ts` (Create)

*   **Type / Scope**: New invariant suite.
*   **Proposed Changes**: Mixed-chain classification (no double-billing, B5), neutral balanceScore with the defined scale, unified ceiling in both modes, self-bill carve-out, freeze predicate in pool, lapsed-never-converts (a lapsed subscription never converts to commission mode), and **per-mode accept-proof (C-B1)**: commission-mode accepts succeed with no deduction row (proved by the live offer row); subscription-mode accepts without a deduction row still hard-fail.

#### 40. `tests/concurrency/driver-unpaid-obligations.test.ts` (Create — moved from `tests/meta` per IR-A7)

*   **Type / Scope**: Drift-guard test (B7/M-14) — the executable replacement for the deleted "keep in step" comment.
*   **Proposed Changes**: Same fixture through three paths (view, canonical lib function, batched dispatch query shape) must agree exactly; dust and self-bill carve-out cases. Executes the VIEW SQL, so it REQUIRES a real Postgres — hence the concurrency lane (`RUN_CONCURRENCY_TESTS=1` + `SCRATCH_DATABASE_URL`), not the DB-less `tests/meta` suite. Registered in the concurrency gate's `GATED_HARNESSES` (Item 47).

#### 41. `tests/concurrency/purchase-settle-first.test.ts` (Create)

*   **Type / Scope**: Concurrency lane (real Postgres via `npm run test:concurrency`; `SCRATCH_DATABASE_URL` mandatory).
*   **Proposed Changes**: Two simultaneous purchases (distinct Idempotency-Keys) — exactly one grant+bill commits; advisory-lock serialization pin; 23505 → `409 dues_outstanding_purchase_blocked` path.

#### 42. `tests/concurrency/grant-bill-atomicity.test.ts` (Create)

*   **Type / Scope**: Concurrency lane.
*   **Proposed Changes**: Crash injection between the grant and the bill insert must leave NEITHER the subscription row NOR the `driver_bills` row (full transaction rollback — IR-C-1 names the referent); every active postpaid subscription has exactly one bill (reconciliation invariant).

#### 43. `tests/concurrency/subscription-bill-settlement.test.ts` (Create)

*   **Type / Scope**: Concurrency lane.
*   **Proposed Changes**: Settlement reduces the unified figure exactly once per event (`driver_bills_payment_event_uq`); replayed callback idempotent no-op (C-B2 resolve-under-lock); commission settlements never touch `driver_bills` (isolation invariant).

#### 44. `tests/meta/completion-mutual-zeroing.test.ts` (Create)

*   **Type / Scope**: Completion boundary tests (pure logic — no DB needed).
*   **Proposed Changes**: Snapshot `'commission'` + percent > 0 → accrued; `'subscription'`/NULL → zero + zeroing log; mid-ride switch does not alter the snapshot; **converse direction (M-24)**: snapshot `'subscription'` rides assert the deduction-pair expectation fed to the Item 14 reconciliation, and `'commission'` rides assert accrual-or-0%-basis.

#### 45. `tests/meta/v6-shadow-commission-parity.test.ts` (Create)

*   **Type / Scope**: v6 parity (B6/M-14 item 7).
*   **Proposed Changes**: Commission-holder + percent > 0 + Stage 1 on → authoritative `platform_commission_bdt > 0` and equals the v2 figure.

#### 46. Existing API contract suites (Modify — 6 files; owner disposition M-17)

*   **Type / Scope**: The suites that directly pin the routes Items 16/17/18/20/21 modify — omitted from the original list, falsifying the completeness claim (IR-B-M1/M2).
*   **Proposed Changes**: `tests/api/driver/commission-settlement.test.ts` (drives the real dues GET/POST handlers; update the `revenue_model` stub, `total_outstanding_bdt` aliasing, itemized payload, settle-first/bill routing); `tests/api/package/purchase-gate.test.ts`, `tests/api/package/vehicle-scoping.test.ts`, `tests/api/package/active-grant-code.test.ts` (extend the branch matrix for dual-lane selection, settle-first 409, postpaid grant/enrollment branches); `tests/api/admin/packages.test.ts` (price-floor + ceiling validations); `tests/api/admin/config-audit.test.ts` (ceiling setter invariant + narrowed ENUM_KEYS).

#### 47. `tests/meta/concurrency-gate.test.ts` + `tests/meta/platform-config-seeds-not-constants.test.ts` (Modify — 2 files; owner disposition M-17)

*   **Type / Scope**: Meta tests guarding test infrastructure and seeds.
*   **Proposed Changes**: `concurrency-gate.test.ts` — register Items 40–43 in `GATED_HARNESSES` (unregistered DB-touching harnesses are the exact drift class the gate exists to catch); `platform-config-seeds-not-constants.test.ts` — pin the new seeds (`revenue_model='subscription_only'`, `max_commission_debt_bdt=50000`, the canonical commission package row).

#### 48. `app/api/package/active+api.ts` (Modify; owner disposition M-19)

*   **Type / Scope**: The active-subscription route consumed by the driver home (`d/(tabs)/index.tsx:373`).
*   **Proposed Changes**: Frozen-aware payload: when the subscription is frozen, the response must carry the frozen state (e.g., `frozen: true` + `frozen_at`) so home and `_layout.tsx` can never render frozen calls as spendable — the D2 requirement CUJ 5 states, implemented at the payload source rather than only in the wallet UI.

### Verification Plan

*   **Static**: `npm run lint` (legacy config, never bare eslint) → `npx tsc --noEmit` → `npm run check:vacuous` — in that order, all green before any commit.
*   **Targeted (inner loop)**: `npx jest --testPathPattern="<impacted>" --bail --silent` per changed file mapping — INCLUDING the six existing API contract suites of Item 46 (they break first when Items 16–21 land); full suite `npx jest --watchAll=false` at the phase gate.
*   **Concurrency**: `npm run test:concurrency` with `SCRATCH_DATABASE_URL` from `node scripts/concurrency-scratch-project.mjs` (tests 40–43, after Item 47 registers them in `GATED_HARNESSES`; never the shared dev project).
*   **Live dues**: `npm run check:driver-dues:live` after updating script 33 — deliberate local run only (`RUN_LIVE_DUES_CHECK=1`), never CI; expect the updated `RESULT: PASS` banner.
*   **i18n**: `npm run check:i18n-orphans` green; pre-commit stages 3/5/6 (flow selectors, testID map, flow currency) run automatically on any `app/` commit — run `node maestro/tools/testid-manifest.cjs` to regenerate the testID map after screen changes.
*   **Device**: Maestro/execbro verification of the purchase modal, home banners, and dues itemization when a device + Metro are available; otherwise state "device verification skipped" in the session report (repo rule — never block delivery on a device).

## Appendix A — Citation Legend

The design cites finding IDs from its EGM lineage as load-bearing rationale. This legend makes every citation resolvable from this document alone.

*   **B1–B9** — consolidated brainstorm Blockers (`concepts_brief.md` §Analysis): B1 ceiling/day-zero lockout; B2 atomic grant-and-bill + repair-path inversion; B3 `payment_events` machinery cannot represent "owed" (orphan sweep + repair fallthrough + callback short-circuit); B4 settle-first race; B5 dispatch-level double-billing; B6 v6 shadow zero-commission; B7 single owed-figure; B8 invisible lockouts; B9 driver-facing states.
*   **M-1 … M-14** — brainstorm Major findings (`concepts_brief.md` §Analysis): M-1 courier COD prior art (`lib/deliverySettlement.ts`); M-2 missed code map (3 `getRevenueModel` call sites / ~10 consumption points); M-3 immutable possession snapshots; M-4 frozen-calls machinery (resolved by D2); M-5 trial/launch-free conflict (resolved by D4); M-6 dues API restructure; M-7 payment timing/dunning (resolved by D6); M-8 rollout/rollback; M-9 pre-cutover commission grandfathering (resolved by D5); M-10 schema allow/forbid list; M-11 driver vocabulary/error codes; M-12 fraud/exposure numbers; M-13 single-writer transition map; M-14 mandatory invariant tests. (Distinct from the review-disposition M-xx IDs used in this document's correction cycle — those refer to `consolidated_review_report.md`.)
*   **F-1 … F-11** — brainstorm implementation-readiness findings (`concepts_brief.md` §Analysis): F-1 callback `subscription_id` short-circuit blocks same-event settlement; F-2 `activateSubscription` reuse incompatibilities (amount check, paid stamping); F-3 `payment_events` status-machine gaps (orphan sweep + repair corruption); F-4 purpose-blind settlement sums; F-5 split-process split-brain; F-6 no-backfill migration edges; F-7 frozen-calls storage; F-8 rollback lossiness; F-9 schema inventory; F-10 pgEnum one-way widening; F-11 idempotency replay/additive responses.
*   **Structural F1 / F6, Codebase A1 / A3** — brainstorm structural and codebase-lens findings (`concepts_brief.md` §Analysis): Structural F1 triple-defined owed-figure; Structural F6 no completion-time possession input; Codebase A1 toggle-count correction (3 call sites); Codebase A3 dead `expiry_writeoff` enum + pool admitting expired rows.
*   **MFS settlement snapshot** — the existing immutable trip-start pricing snapshot precedent at `app/api/ride/[id]/complete+api.ts:430-435`.
*   **Decisions 3–6** — the six approved structural decisions (`concepts_brief.md` §Key Decisions 1–6): bills table + view; grant/settlement split; settle-first serialization; per-driver classification; kill-switch demotion; staged rollout.
*   **Gate-2 / Gate-3 corrections** — owner corrections applied during drafting (see `design_draft.md` gate history and `owner_dispositions_review_2026-11-07.md`).
