-- S4 (plan 27 §5/F-11): customer cancel + out-of-stock partial confirm.
--   cancel_fee_bdt        — state-dependent cancel fee (paisa; config-fresh
--                           via shop_order_cancel_fee_after_accept_bdt;
--                           launch default 0 — COD collection is post-2.5)
--   unavailable_item_ids  — shop-reported out-of-stock subset at accept
--   partial_confirmed_at  — customer confirmed the reduced order (else the
--                           free-cancel path stays open)
ALTER TABLE "shop_orders" ADD COLUMN "cancel_fee_bdt" integer;
--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "unavailable_item_ids" uuid[];
--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "partial_confirmed_at" timestamptz;
