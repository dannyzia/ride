-- Migration: 0099_operator_bills_source_order.sql
-- Batch-2 Item 8: the shop usage-time hook accrues one platform-fee bill per
-- delivered order. The bill needs a source key so a retried transition can
-- never accrue twice — the delivered state machine fires once, but the writer
-- is also idempotent at the DB layer.
--
-- `source_order_id` is the producing event's id (shop_orders.id for shops;
-- later verticals record their own source event in this column). No FK: the
-- column is role-polymorphic by design, exactly like operator_bills.operator_id.
--
-- Additive: nullable column, partial unique index. Subscription-purchase bills
-- leave it NULL and are untouched (operator_bills_one_open_uq is scoped to
-- kind='subscription_purchase' and never sees these rows).
ALTER TABLE operator_bills ADD COLUMN source_order_id uuid;

CREATE UNIQUE INDEX operator_bills_source_order_uq
  ON operator_bills (operator_role, source_order_id)
  WHERE source_order_id IS NOT NULL;
