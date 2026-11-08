-- Migration: 0099_operator_bills_usage_slot.sql
-- Batch-2 Item 8: the shop/restaurant usage hook accrues commission into ONE
-- open usage bill per shop (the aggregate receivable — the rides model), so the
-- slot is 1:1 with a settlement and per-event detail stays with the order.
--
-- Additive: a partial unique index over existing columns. It never sees
-- subscription-purchase rows (kind-scoped), so operator_bills_one_open_uq and
-- every existing bill are untouched.
CREATE UNIQUE INDEX operator_bills_one_open_usage_uq
  ON operator_bills (operator_role, operator_id)
  WHERE status = 'open' AND kind = 'usage';
