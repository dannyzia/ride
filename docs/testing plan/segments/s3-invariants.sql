-- Segment 3: Silent invariants (tax + accounting). Pure SQL.
-- Run in the Supabase SQL editor (or `supabase_execute_sql` for the orchestrator).
-- Replace <ride_id> with the most recent completed ride:
--   SELECT id FROM rides WHERE status='completed' ORDER BY completed_at DESC LIMIT 1;

-- I1 — Tax ledger exists for the ride and reconciles.
SELECT tl.reference_type, tr.code, tr.rate_percent,
       tl.base_amount_bdt, tl.tax_amount_bdt, tl.net_amount_bdt
FROM tax_ledgers tl JOIN tax_rates tr ON tr.id=tl.tax_rate_id
WHERE tl.reference_id='<ride_id>';
-- Expect: ≥1 row. If rate_percent>0 then tax_amount_bdt>0.

-- I2 — Per-entry balance (CRITICAL: must be 0).
SELECT ae.entry_number,
       SUM(ael.debit_bdt)  AS total_dr,
       SUM(ael.credit_bdt) AS total_cr,
       SUM(ael.debit_bdt) - SUM(ael.credit_bdt) AS imbalance
FROM accounting_entries ae JOIN accounting_entry_lines ael ON ael.entry_id=ae.id
WHERE ae.reference_id='<ride_id>'
GROUP BY ae.id, ae.entry_number;
-- Expect: imbalance = 0 exactly. Any non-zero = CRITICAL FAIL.

-- I3 — Daily tax summary populated for today.
SELECT summary_date, tax_code, transaction_count,
       total_base_amount_bdt, total_tax_amount_bdt
FROM daily_tax_summaries
WHERE summary_date = CURRENT_DATE
ORDER BY tax_code;
-- Expect: ≥1 row.

-- I4 — Global imbalance (must remain 0 across all entries).
SELECT SUM(debit_bdt) - SUM(credit_bdt) AS global_imbalance
FROM accounting_entry_lines;
-- Expect: 0. If non-zero, this run's entry is the culprit — re-run I2 on recent entries.
