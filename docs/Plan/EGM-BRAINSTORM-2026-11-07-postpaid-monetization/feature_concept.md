**Purpose:**     EGM brainstorm input — the feature concept six Goldfish reviewers stress-test. Read this before any postpaid-monetization design or review work.
**Owner:**       Elephant (EGM). Owner rulings below are Zia's; do not edit rulings, only the Elephant updates this file.
**Status:**      APPROVED — owner dispositions D1–D7 recorded 2026-11-07 (`owner_dispositions_2026-11-07.md`, `concepts_brief.md`); superseded as intake by `concepts_brief.md`
**Source of truth:** This file for the concept; the codebase for current-state facts (each fact carries a file:line pointer — re-verify before relying on it).
**Related (concrete paths):**
  - `lib/platformConfig.ts` — global revenue_model toggle + commission-debt ceiling helpers
  - `utils-server/dispatch.ts` — candidate pool gating (subscription + commission-debt gates)
  - `utils-server/leadBilling.ts` — debit-on-offer lead billing; revenueModel-aware
  - `lib/commissionDues.ts` — net commission dues math shared by dues routes and dispatch
  - `app/api/ride/[id]/complete+api.ts` — commission accrual at ride completion
  - `app/api/package/purchase+api.ts`, `lib/activateSubscription.ts`, `lib/paymentEvents.ts` — today's prepaid package purchase flow
  - `app/api/driver/dues+api.ts`, `app/api/driver/dues/pay+api.ts`, `lib/paymentRepair.ts` — dues surfacing + PortPos settlement
  - `src/db/schema.ts` — pricing.platform_commission_percent (~line 1213), rides.platform_commission_bdt (~line 780), driver_commission_settlements (~line 1083)
**Last verified:** 2026-11-07, by Elephant, against working tree (codebase-memory graph + direct source reads)
**How to update:** Only the Elephant edits this file during the brainstorm loop; reviewers are strictly read-only.

---

# Feature Concept: Postpaid (Credit) Monetization with Per-Driver Product Choice

## Overview

Ride currently monetizes drivers through ONE global switch (`platform_config.revenue_model`): either drivers buy prepaid call packages (subscription) and receive leads, or a platform-wide commission mode accrues per-ride commission as debt. The proposed feature replaces the global switch with a **per-driver choice between two products**, and converts the platform to **fully postpaid (credit) billing toward drivers** in both modes:

1. **Subscription packages** (the existing call packs). Buying one generates a bill **immediately**, but calls are granted **before payment arrives** (credit). While holding an active subscription package: leads are billed exactly as today (debit-on-offer), and per-ride commission is always **zero**.
2. **Commission package** (new; a ৳0 enrollment product). While holding it: no lead debit and no subscription bill ("fixed bill = 0"); instead, each completed trip generates a commission bill (percent of fare from the pricing table) that accrues as an unpaid bill.

Possession of one of the two products **is** the driver's monetization mode — there is no mode column with a default. Every driver must hold one of the two to receive offers. New drivers choose at onboarding.

## Owner Rulings (decided — attack the consequences, not the rulings)

1. **Fully postpaid for both products.** Subscription bills are generated immediately at purchase (calls granted before money arrives). Commission bills are generated as trips happen. The platform is a creditor of its drivers.
2. **Two products, possession = mode, no default.** A driver holding a subscription package is a subscriber; holding a commission package is commission-mode. A driver holding neither receives no offers. New drivers pick at onboarding.
3. **Mutual zeroing.** Subscribers accrue zero per-ride commission. Commission drivers are never billed for subscription. No driver is double-billed by both systems for the same ride.
4. **Settle-first.** No driver may buy a new package (of either kind) while unpaid bills exist on their account. The purchase flow checks pending dues before allowing purchase.
5. **Hard lockout on lapse.** A subscriber whose package runs dry (calls exhausted or expired) gets no offers until they buy again. A lapsed subscriber never silently converts into a commission debtor.
6. **One unpaid-bills ledger.** Both product types feed a single per-driver outstanding-obligations figure. Backstops: ceiling-based dispatch lockout, forced settlement at next purchase, and manual payment via the dues screen.

## Verified Current State (facts, with pointers — re-verify each before relying on it)

- **Revenue model is a global platform_config toggle**, never cached, fresh-read per request: `subscription_only` (default) | `commission_only` | `hybrid` — `lib/platformConfig.ts:253-285` (`REVENUE_MODEL_DEFAULT = 'subscription_only'`).
- **Dispatch gates every driver identically by the global value**: `requiresSubscription = model !== 'commission_only'`, `commissionGated = model !== 'subscription_only'` — `utils-server/dispatch.ts:178-188`. Per-driver pool filters: subscription balance (`calls_remaining` null/0 filtered; daily cap) at `dispatch.ts:554-565`; commission-debt ceiling gate at `dispatch.ts:526-539`, fed by batched accrued-vs-settled sums at `dispatch.ts:285-322` (mirrors `lib/commissionDues.ts` net-dues math).
- **Lead billing is already revenueModel-aware per dispatch**: `debitLeadForOffer` accepts `revenueModel`; `commission_only` skips the subscription debit while the `dispatch_offers` row still commits — `utils-server/leadBilling.ts:54-110`.
- **Commission accrual today is driven ONLY by `pricing.platform_commission_percent`** (numeric(5,2), nullable, per zone+vehicle_type — `src/db/schema.ts:1213`), computed at ride completion as percent of post-fee fare and written to `rides.platform_commission_bdt` (integer paisa, `schema.ts:780`) — `app/api/ride/[id]/complete+api.ts:289-293` and `:439-447`. **The completion path has NO revenue-model check**: if an admin sets percent > 0 while the model is still `subscription_only`, commission accrues with no dispatch gate on it.
- **Commission debt + settlement machinery is fully built and idle at 0%**: net dues = completed-ride commissions − completed settlements, floored at zero (`lib/commissionDues.ts`); settlement rows in `driver_commission_settlements` (one per `payment_event`, unique `dcs_payment_event_idx`); `GET /api/driver/dues` (returns the global revenue_model) and `POST /api/driver/dues/pay` (PortPos payment with `purpose='commission_settlement'` via `lib/paymentRepair.settleCommissionDues`).
- **Dispatch lockout ceiling**: `max_commission_debt_bdt` platform_config, default ৳500 (50,000 paisa) — `lib/platformConfig.ts:268-269, 283-285`.
- **Package purchase today is strictly prepaid**: `POST /api/package/purchase` creates a `payment_events` row + PortPos invoice (`lib/paymentEvents.initiatePortposPayment`); the public callback verifies IPN (`portposClient.verifyIPN` — security-critical, never removable) and only then `lib/activateSubscription.ts` credits `call_ledger` and activates the subscription. Idempotency-Key convention is wired on this route. **No unpaid obligation can ever exist for a subscription today.**
- **Subscriptions**: one active row per driver (dispatch left-joins `status='active'`); `calls_remaining` (−1 = unlimited sentinel), `daily_calls_used`, `daily_cap` from the package. Dispatch ranks partly on a `balanceScore` derived from `calls_remaining` — `dispatch.ts:622-632`.
- **The `getRevenueModel()` global assumption is baked into ~7 call sites**: `utils-server/dispatch.ts` (buildCandidateList), `utils-server/index.ts` (dispatch pipeline, startup, trigger paths), `app/api/driver/dues+api.ts`.
- **v6 shadow fare engine hard-codes commission to 0** ("Commission is always 0% in v6, subscription-only revenue") — `complete+api.ts:192-194` comment. The v6 engine is the modeled FUTURE pricing engine; commission-mode economics are not represented in it.
- **Launch defaults**: all commission rates are 0% at launch; admin may set them later (product decision, all domains — ride, fleet, shops, delivery).
- **Zero Escrow ruling (2026-11-01)**: the platform never holds rider trip money and never operates payout rails; riders pay drivers directly; drivers pay the platform only for lead packs via PortPos. Postpaid makes the platform a creditor of DRIVERS (platform-side receivables) — how this squares with the ruling's wording is an open design question, not a settled one.
- **Money invariant**: integer paisa everywhere; commission calculated on post-minimum-floor fare; wallet/balance mutations require `db.transaction` with the money-event row in the same transaction.

## Open Assumptions (RESOLVED 2026-11-07 by owner dispositions — see `owner_dispositions_2026-11-07.md`)

- **A1′ Existing-driver continuity**: RESOLVED (D4) — existing drivers continue as subscribers, zero backfill.
- **A2′ Switching and frozen calls**: RESOLVED (D2) — preserved via additive `subscriptions.frozen_at` column; supersede sequence bypassed on switching; `expires_at` ticks naturally; switch-back rules as ruled.
- **A5 Ceiling vs day-zero receivable**: RESOLVED (D1) — unified total exposure kept; ceiling floor invariant `ceiling >= max(active call package price) + 1,000 paisa` enforced by config validation + seed/migration check; self-bill backstop for active subscriptions; dust rule `< 1,000 paisa` non-blocking.
- **A6 Credit risk**: CONFIRMED (D3) — accepted with documented max fraud exposure `min(max_package_price_paisa, ceiling_paisa)` = 40,000 paisa per account and an extended purchase fraud gate.

## Explicitly Out of Scope / Not Yet Decided

- Rider-side payment flows (riders still pay drivers directly; COD rules unchanged).
- Fleet/shops/delivery-man commission domains (this concept covers DRIVER monetization only; other domains already default to 0% commission independently).
- Refunds, referrals, wallet cashback interactions with the new bills ledger (to be assessed, not assumed).
- Whether the commission package has a duration/expiry like subscription packages.
- Admin UI surface for the new products and per-driver bill views.
