# Rider Growth Tier 1 — Kimi Spec with Corrections
# =============================================================================
# Source: Kimi-K2.6 (2026-07-31)
# 20 errors found by cross-referencing against actual codebase.
# All [CORRECTION] annotations below MUST be applied.
# =============================================================================

## ERRORS SUMMARY (20 items)

### CRITICAL (would break compilation):
1. [CRITICAL] Import paths: Kimi uses @/db and @/db/schema. Codebase uses @/src/db and @/src/db/schema.
2. [CRITICAL] db.query.* API: Kimi uses db.query.tableName.findFirst() (Drizzle relational query). Codebase uses db.select().from(tableName).where() pattern. DO NOT use db.query.* — use the select/from/where pattern.
3. [CRITICAL] wallet_transactions table name CONFLICTS with existing tables. Codebase already has rider_wallet_transactions and driver_wallet_transactions. The new table must be named rider_wallet_cashback_transactions to avoid confusion.
4. [CRITICAL] accounting_entries SQL references ae.account_id and ae.debit_credit — neither exists. The actual structure is: accounting_entries (header) + accounting_entry_lines (lines with debit_bdt, credit_bdt, account_id). The P&L query must join entries → lines → accounts.
5. [CRITICAL] accounting_entries reference_id is the column (not ride_id). The backfill SQL references ae.ride_id which doesn't exist.

### HIGH (would break runtime):
6. [HIGH] Theme colors: Kimi uses goRide.colors.background, .card, .text, .textMuted, .primaryLight, .dangerLight, .successLight, .success. The ACTUAL exports are: colors.bgLight, colors.bgDark, colors.surfaceLight, colors.surfaceElevatedDark, colors.textPrimaryLight, colors.textPrimaryDark, colors.textSecondaryLight, colors.textSecondaryDark, colors.primary, colors.primaryLight, colors.danger, colors.dangerLight, colors.borderLight, colors.borderDark, colors.white. NO .background, NO .card, NO .text, NO .textMuted, NO .success, NO .successLight.
7. [HIGH] zones.boundary_geojson column — likely doesn't exist. The zones table stores polygon coordinates differently. Read the actual zones table definition before using this column name.
8. [HIGH] zones.version_number — doesn't exist on zones table. zoneVersions should compute version from COUNT(*) of existing versions.
9. [HIGH] expireWalletCredits uses gte(expires_at, now) but should be lt (expired = past expiry date). Kimi noted this bug in a comment.
10. [HIGH] rides.base_fare_bdt — may not exist. The rides table likely stores fare in estimated_fare or fare_breakdown JSONB. Read the rides table definition before referencing this column.

### MEDIUM (logic/consistency):
11. calculateRiderBenefits is called from estimate AND request AND complete. Surge is applied BEFORE benefits in the current flow. The baseFareBdt parameter should be the PRE-SURGE base fare (from calculateFare output BEFORE surge block).
12. earnWalletCashback doesn't create an accounting entry. It should call a new recordWalletEarn function or add journal lines.
13. The existing promo code flow (in estimate/request) applies discounts independently. It must be REMOVED from estimate/request and subsumed into calculateRiderBenefits. Otherwise double-discounting occurs.
14. The existing rider pass discount (in estimate/request) also applies independently. Same issue — must be subsumed into the stacking engine.
15. New tables need GRANT statements for PostgREST (TD-31 rule).
16. New tables with updated_at need the auto-update trigger.
17. budgetCache in zoneBudget.ts uses a Map — but the WS server and API server are separate processes (same surgeCurrent issue). Use the database row as source of truth, cache with TTL.
18. spendZoneBudget does a DB UPDATE + SELECT FOR UPDATE should be used to prevent race conditions on concurrent spends.
19. The P&L query joins rides on zone_id + date_trunc matching — this creates a cartesian-ish join. Better: separate queries for accounting aggregation and ride counts, then merge in code.
20. Seed data uses raw SQL — should use scripts/seed.ts pattern or drizzle insert.

## QUESTIONS FOR USER (design decisions):
1. Should benefits be calculated on base fare BEFORE surge or AFTER surge? (Strategy doc says "base fare" but surge is a multiplier on the total.)
2. When wallet is redeemed at request time, is the amount fixed even if the final fare changes (longer route)?
3. Should promo codes be REMOVED as a standalone feature and only work through the stacking engine? Or should they coexist?
