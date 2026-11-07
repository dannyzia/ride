**Purpose:**     Exact, foolproof execution sequence for the Postpaid Monetization cutover (revenue_model flip to 'hybrid'). Read before any activation work.
**Owner:**       Zia (owner) — approves and executes; Orchestrator verifies each step against disk/CI/live surface.
**Status:**      DRAFT — pending Zia's written approval line before Step 4.
**Source of truth:** DESIGN-POSTPAID-MONETIZATION.md §3/§5; src/db/migrations/0092_postpaid_monetization.sql; scripts/seed-platform-config.js; lib/platformConfig.ts; utils-server/scheduler.ts (job 62); app/api/admin/monetization/locked-drivers+api.ts.
**Related (concrete paths):**
  - docs/Plan/EGM-BRAINSTORM-2026-11-07-postpaid-monetization/DESIGN-POSTPAID-MONETIZATION.md — binding design (§3.2 migration posture, §3.4 dual-lane purchase, §3.5 possession=mode, §3.6 six-state precedence, §3.9 packages, §5 stage items)
  - scripts/check-driver-dues-live.ts — opt-in real-DB verification (WRITES DATABASE_URL; never CI)
  - lib/activateSubscription.ts:3 — grantSubscriptionOnCredit (sole writer of call_ledger deduction rows + subscription grant)
  - lib/billsLedger.ts — createOpenBill / settleSubscriptionBill (sole writer of driver_bills)
  - lib/monetizationMode.ts — enrollCommission / switchBackToCallPackage / endActiveEnrollment / ensureCommissionPackage (sole writer of commission_enrollments + subscriptions.frozen_at)
  - lib/paymentRepair.ts — settleCommissionDues + subscription_settlement dispatch branch
  - app/api/payment/portpos/callback+api.ts — PortPos IPN (verifyIPN + subscription_settlement branch)
  - app/api/admin/config+api.ts — PATCH /api/admin/config (revenue_model narrowed to {subscription_only, hybrid}; D1 ceiling validation)
  - app/api/admin/monetization/locked-drivers+api.ts — D7 locked-drivers card endpoint
  - utils-server/scheduler.ts:job62 — postpaid reconciliation (cutover marker + G1 exclusivity audit, every 5 min)
  - utils-server/leadBilling.ts — per-driver possession classification + dispatch_offers.monetization_mode binding (S7/M-01)
  - utils-server/dispatch.ts — per-driver pool predicate (Item 11)
  - utils-server/index.ts — executeMatchFlow per-mode accept proof + rides.monetization_mode_snapshot stamp (C-B1 Blocker fix)
  - app/api/ride/[id]/complete+api.ts — snapshot-gated commission accrual (Item 23)
  - app/api/package/purchase+api.ts — dual-lane purchase with x-client-postpaid:1 header (Item 16)
  - store/useDriverMonetizationStore.ts — client monetization state (Item 29)
  - i18n/locales/en/common.json + bn/common.json — monetization keys (Item 30)
**Last verified:** 2026-11-07 — all four stages committed (2d2afb1 → ea03f36), all pre-commit gates green, tsc/lint/jest clean.
**How to update:** Re-run this runbook only after Zia's written approval to flip revenue_model; record each step's outcome below the line.

---

# POSTPAID MONETIZATION CUTOVER RUNBOOK

**Activation gate:** Do NOT proceed past Step 3 without Zia's written approval line:
`ZIA-APPROVED: postpaid-cutover hybrid <date>`

## Preconditions (verify before Step 1)

- [ ] All four stages committed on `origin/implementation`: `2d2afb1`, `5025547`, `323675d`, `ea03f36`
- [ ] `git status` clean (no unrelated dirty files in your working tree)
- [ ] `npm run lint` → 0 errors; `npx tsc --noEmit` → clean (root + utils-server)
- [ ] `revenue_model` currently `'subscription_only'` in production `platform_config` (fresh-read, never cached)
- [ ] `max_commission_debt_bdt` seeded to `50000` (≥ max live call-package price + 1,000 paisa dust buffer — D1)
- [ ] Canonical ৳0 Commission package exists (`product_type='commission'`, `price_bdt=0`, `is_trial=false`, `duration_days=NULL`)
- [ ] EAS build credentials + app signing keys available (Owner/CI pipeline responsibility — not this sandbox)

## Step 1 — DB Schema (Production Supabase)

**Goal:** Apply migration 0092 against production Supabase. Additive-only; no existing table is widened.

```
npx drizzle-kit push   # against production DATABASE_URL (TLS required: ssl: "require")
```

Verify on disk/DB after push:
- [ ] `to_regclass('public.driver_bills')` exists
- [ ] `to_regclass('public.commission_enrollments')` exists
- [ ] `to_regclass('public.driver_unpaid_obligations')` exists (a view)
- [ ] `driver_bills_one_open_uq` partial unique index exists (B4 settle-first barrier)
- [ ] `driver_bills_payment_event_uq` partial unique index exists (M-14 settlement barrier)
- [ ] `commission_enrollments_one_active_uq` partial unique index exists (G1 exclusivity)
- [ ] `packages.product_type` column exists (NOT NULL DEFAULT 'call_package')
- [ ] `packages.duration_days` is nullable (D3 non-expiring commission package)
- [ ] `subscriptions.frozen_at` column exists (D2)
- [ ] `rides.monetization_mode_snapshot` column exists (S5/M-01)
- [ ] `dispatch_offers.monetization_mode` column exists (S7/M-01)
- [ ] `driver_commission_settlements.kind` column exists (backfilled 'commission')
- [ ] RLS enabled + FORCED + REVOKED from anon/authenticated on `driver_bills` and `commission_enrollments`
- [ ] D1 floor DO block present (aborts if `max_commission_debt_bdt < max live call-package price + 1,000`)

**Do NOT** seed `postpaid_cutover_at` here — it is written at activation (Step 4).

## Step 2 — Package Seeds (Production)

**Goal:** Assert D1 floor and ensure canonical ৳0 Commission package exists idempotently.

```
node scripts/seed-platform-config.js
```

Verify output:
- [ ] `revenue_model = 'subscription_only'` (kill-switch OFF — preserved from Stage 1)
- [ ] `max_commission_debt_bdt = 50000`
- [ ] Canonical ৳0 Commission package present (`product_type='commission'`, `price_bdt=0`, `is_trial=false`, `duration_days NULL`, `deleted_at NULL`)
- [ ] D1 seed-time assertion passed (no `D1 floor violated` error)
- [ ] `postpaid_cutover_at` NOT seeded (confirm absence)

**Do NOT** set `revenue_model='hybrid'` here. Step 2 is additive/idempotent and safe to re-run.

## Step 3 — Client Build & Release (EAS)

**Goal:** Distribute the `x-client-postpaid: 1`-capable client so drivers can select a product before the cutover switch.

Owner/CI pipeline responsibility — Expo account credentials and app signing keys never enter this sandbox.

```
# Owner executes outside this sandbox:
eas build --profile production   # Android AAB + iOS IPA (Development Build channel is NOT for production)
eas submit                       # Play Store + App Store
```

Verify:
- [ ] Client ships `x-client-postpaid: 1` header on `POST /api/package/purchase` (packages.tsx / subscription-checkout)
- [ ] Client ships monetization choice onboarding (store/useDriverMonetizationStore, due-amounts, driver-home banner, wallet badge)
- [ ] Client ships i18n en/bn monetization keys
- [ ] Release is live to drivers (store rollout complete) BEFORE Step 4

**Cutover rule:** Do not flip `revenue_model='hybrid'` until the postpaid-capable client is live. Pre-cutover drivers (legacy prepaid) must not hit postpaid lanes without a client that can render the choice/dues screens.

## Step 4 — The Cutover Switch (ZIA APPROVAL REQUIRED)

**Goal:** Single-writer transition — stamp `postpaid_cutover_at`, then flip `revenue_model` to `'hybrid'`. M-13: `postpaid_cutover_at` is written only at activation, never seeded. Possession (not the pool switch) governs per-driver mode (§3.5).

ZIA-APPROVED line (obtain before executing):
```
ZIA-APPROVED: postpaid-cutover hybrid <date>
```

Execute (single transaction, server-side):

```
-- 4a. Single-writer cutover timestamp (M-13)
UPDATE platform_config
SET value = now()::text, updated_at = now()
WHERE key = 'postpaid_cutover_at';

-- 4b. Activation switch (M-13 / §3.5)
UPDATE platform_config
SET value = 'hybrid', updated_at = now()
WHERE key = 'revenue_model';
```

Verify fresh-read (platform_config is never cached — admin changes take effect without restart):
- [ ] `SELECT value FROM platform_config WHERE key = 'revenue_model'` → `'hybrid'`
- [ ] `SELECT value FROM platform_config WHERE key = 'postpaid_cutover_at'` → NOT NULL (activation timestamp)
- [ ] `SELECT value FROM platform_config WHERE key = 'max_commission_debt_bdt'` → `'50000'`

**Post-flip behavior (expected):**
- Drivers with a usable call package → `subscription` mode (debited at offer, `monetization_mode_snapshot='subscription'`)
- Drivers with an active commission enrollment → `commission` mode (no lead debit, accrues at completion, `monetization_mode_snapshot='commission'`)
- Drivers with neither → `none` mode → no offers (NO_PRODUCT lockout)
- Pre-cutover rides keep `monetization_mode_snapshot=NULL` → D5 grandfathering (zeroed-and-forgiven commission accrual)

## Step 5 — Day-1 Observability

**Goal:** Confirm the cutover landed cleanly and no driver is unexpectedly locked out.

- [ ] `utils-server/scheduler.ts` job 62 (postpaid reconciliation, every 5 min, 15s budget) is running:
  - Logs commission-snapshot rides predating `postpaid_cutover_at` (M-13 boundary integrity — should be 0 pre-cutover rides)
  - G1 exclusivity audit: ends active commission enrollments that coexist with an active usable call subscription (subscription wins) — log any violations
- [ ] `GET /api/admin/monetization/locked-drivers` returns expected lockouts only (NO_PRODUCT drivers with no product; CEILING_LOCKED at/above debt ceiling; LAPSED expired/exhausted subs)
- [ ] `GET /api/driver/dues` per driver returns six-state `monetization_state` matching possession
- [ ] `GET /api/package/active` per driver returns `frozen` flag correctly (D2 frozen-calls state)
- [ ] No `call_ledger` deduction rows created for commission-mode offers (commission mode bills at completion, not at offer)

**Zero-loss invariant:** Flipping to `'hybrid'` never deletes or mutates existing subscriptions, bills, or enrollments. A driver who was active pre-cutover remains active post-cutover (possession governs, not the pool switch).

## Step 6 — Rollback Runbook

**Goal:** Instant kill-switch if any Day-1 issue arises.

```
-- Rollback: revert revenue_model to legacy prepaid
UPDATE platform_config
SET value = 'subscription_only', updated_at = now()
WHERE key = 'revenue_model';
```

Verify:
- [ ] `revenue_model` fresh-reads `'subscription_only'`
- [ ] All dispatch/revenue behavior reverts to legacy prepaid (subscription gate restored, ceiling not read)
- [ ] `postpaid_cutover_at` remains set (historical record — never cleared)
- [ ] Frozen subscriptions (`subscriptions.frozen_at`) remain honored (D2 — rollback is lossless)
- [ ] Commission enrollments remain (possession rows persist; just no new enrollment offers via legacy client)

**Rollback is always available** — `revenue_model` fresh-reads every request (never cached), so the kill-switch takes effect immediately without restart. No data loss in either direction.

---

## Emergency contacts & ownership

- **Owner (Zia):** final cutover approval; writes the `ZIA-APPROVED` line; authorizes EAS build/submit
- **Orchestrator:** verifies each step against disk/CI/live surface; does not flip the flag unilaterally
- **Builder:** executes Steps 1–3 and 5–6; never executes Step 4 without the approval line

---

**Outcomes log (fill in at execution)**

| Step | Outcome | Verified by | Timestamp |
|------|---------|-------------|-----------|
| 1 — DB Schema | | | |
| 2 — Package Seeds | | | |
| 3 — Client Build & Release | | | |
| 4 — Cutover Switch (ZIA-APPROVED required) | | | |
| 5 — Day-1 Observability | | | |
| 6 — Rollback (if needed) | | | |
