-- Migration: 0100_operator_bills_event_scope.sql
-- Batch-2 Item 8b: scope the M-14 settlement barrier to subscription bills.
--
-- M-14 ("one payment event settles at most one bill") was a statement about
-- PACKAGE bills: a package purchase bill is settled 1:1 by the invoice that
-- pays it. The aggregated usage receivable is different in kind — one payment
-- legitimately clears every open usage bill the operator holds, so all of them
-- carry the same payment_event_id. A global unique index on payment_event_id
-- made that impossible (23505 on the second stamp).
--
-- The scoped index keeps the literal M-14 meaning where it applies and leaves
-- the usage slot free to share one event stamp. NULL stamps stay unconstrained
-- (open bills that no invoice has claimed).
DROP INDEX IF EXISTS operator_bills_payment_event_uq;
CREATE UNIQUE INDEX operator_bills_payment_event_uq
  ON operator_bills (payment_event_id)
  WHERE payment_event_id IS NOT NULL AND kind = 'subscription_purchase';
