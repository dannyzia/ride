-- S4 (plan 27 §6.1): shop_orders gains the sequential-dispatch assignment
-- states for the courier flow that replaced the retired RFQ marketplace.
--
--   dispatched      — "Find courier" ran; sequential offers are going out
--   courier_assigned — a courier accepted; shop + customer notified (F-29)
--   picked_up       — courier handed the item over (shop notified) (F-29)
--   self_delivered  — chain exhausted; shop chose self-delivery, keeps the
--                     delivery fee (§6.1 exhaustion rule)
--
-- `out_for_delivery` (S1-era) is retained: Postgres cannot drop enum values
-- and legacy rows reference it. D5 rule: ALTER TYPE ADD VALUE runs as its
-- own statement, never sharing a transaction with anything that uses the
-- new value.
ALTER TYPE "shop_order_status" ADD VALUE 'dispatched';
--> statement-breakpoint
ALTER TYPE "shop_order_status" ADD VALUE 'courier_assigned';
--> statement-breakpoint
ALTER TYPE "shop_order_status" ADD VALUE 'picked_up';
--> statement-breakpoint
ALTER TYPE "shop_order_status" ADD VALUE 'self_delivered';
