# Rider Growth Tier 1 — CORRECTED Spec (Post User Decisions)
# =============================================================================
# User decisions (2026-08-01):
# Q1: Benefits calculated AFTER surge (on the surged total)
# Q2: Wallet redemption stays FIXED at request time. Driver gets FULL fare.
#     Wallet amount comes from rider's wallet balance, NOT from driver earnings.
# Q3: PICK ONE DISCOUNT per ride. Rider sees all eligible options, chooses one.
#     NO stacking. Eliminates stacking engine entirely.
#
# This file supersedes the original Kimi spec.
# =============================================================================

## SIMPLIFIED ARCHITECTURE (pick-one model)

Instead of Kimi's stacking engine, the system works like this:

1. estimate+api.ts: After surge, call getAvailableDiscounts() → returns array of options
2. confirm-ride UI: Show options as radio selector. Rider picks one (or none).
3. request+api.ts: Accept selected_discount_type + selected_discount_amount. Lock it.
4. complete+api.ts: Apply the locked discount. Earn cashback on the discounted fare.

### New columns on rides table:
  applied_discount_type: text("applied_discount_type", {
    enum: ["intro", "promo", "pass", "wallet", "none"]
  }).notNull().default("none"),
  applied_discount_bdt: integer("applied_discount_bdt").notNull().default(0),
  wallet_redeemed_bdt: integer("wallet_redeemed_bdt").notNull().default(0),

### New tables (SIMPLIFIED from Kimi — 5 instead of 9):

1. zone_versions (boundary audit trail)
2. zone_graduation_rules (lifecycle thresholds)
3. zone_budgets (daily spend cap per zone)
4. zone_budget_logs (spend events)
5. rider_intro_configs (per-zone discount curve)

### REMOVED (not needed with pick-one model):
- zone_stacking_rules (no stacking)
- ride_benefits (only one discount, stored on rides row)
- wallet_transactions (use existing rider_wallet_transactions)
- rider_wallet_earnings_monthly (use simpler approach — query existing table)
- wallet_configs (use system_config key-value instead)

### lib/discountEngine.ts (replaces Kimi's rewardStacking.ts):
  getAvailableDiscounts(params): Returns array of {type, percent?, amount_bdt, description}
  - Checks intro config (based on user.total_rides + 1)
  - Checks active promo codes
  - Checks active rider pass
  - Checks wallet balance (capped at 50% of surged fare)
  - Returns ALL eligible options for rider to pick

  applySelectedDiscount(fareBdt, discount): Returns discounted fare
  - Only one discount applied — no stacking, no cap logic

### lib/walletCashback.ts (simpler than Kimi's wallet.ts):
  earnCashback(rideId, riderId, discountedFareBdt): Credits 5% to wallet
  - Uses existing rider_wallet_transactions table (type='cashback_earn')
  - Monthly cap check via SUM query on existing table
  - Expiry tracked via rider_wallet_transactions.expires_at column (ADD to existing table)

  redeemWallet(riderId, amountBdt, rideId): Debits wallet
  - Uses existing rider_wallet_transactions table (type='cashback_redeem')
  - SELECT FOR UPDATE on users.rider_wallet_balance_bdt

  reverseRedemption(rideId): Reverses on cancellation
  expireCredits(): Scheduler job — expires old credits

### Config via system_config (not a new table):
  - cashback_percent: "5"
  - cashback_monthly_cap_bdt: "50000" (৳500)
  - cashback_expiry_days: "90"
  - wallet_redemption_max_percent: "50"

## PHASE A: Schema

### Add to existing tables:
zones: lifecycle_stage enum (candidate→...→closed)
accounting_entries: zone_id uuid nullable (for P&L attribution)
rides: applied_discount_type + applied_discount_bdt + wallet_redeemed_bdt
rider_wallet_transactions: expires_at timestamp (nullable, for cashback expiry)

### New tables: zone_versions, zone_graduation_rules, zone_budgets, zone_budget_logs, rider_intro_configs

## PHASE B: Discount Engine + Intro Incentive
- lib/discountEngine.ts: getAvailableDiscounts + applySelectedDiscount
- lib/introIncentive.ts: getIntroConfig (queries rider_intro_configs)
- estimate+api.ts: Call getAvailableDiscounts AFTER surge, return options array
- request+api.ts: Accept selected_discount_type, lock the amount
- complete+api.ts: Apply locked discount to final fare
- confirm-ride UI: Radio selector for discount options
- Admin: rider_intro_configs CRUD screen

## PHASE C: Wallet Cashback
- lib/walletCashback.ts: earn + redeem + reverse + expire
- complete+api.ts: After completion, call earnCashback
- request+api.ts: If wallet selected, call redeemWallet
- cancel+api.ts: If wallet redeemed, call reverseRedemption
- confirm-ride UI: Wallet option shows balance + max redemption
- Scheduler: daily expiry job
- system_config seed: cashback_percent, monthly_cap, expiry_days

## PHASE D: Budget Governance
- lib/zoneBudget.ts: checkBudget + spendBudget + resetAll (with cache)
- complete+api.ts: After applying discount, call spendZoneBudget for platform-funded portion
- Admin: zone_budgets CRUD + reallocate UI
- Scheduler: daily reset at Dhaka midnight

## PHASE E: Zone Lifecycle + P&L
- lib/zoneLifecycle.ts: promoteZone + evaluateGraduation
- lib/zoneEconomics.ts: getZonePnL (aggregates from accounting_entry_lines JOIN entries)
- accounting.ts: All record* functions accept zoneId parameter
- Admin: zone lifecycle UI + P&L dashboard
- Scheduler: daily graduation evaluation + P&L aggregation
