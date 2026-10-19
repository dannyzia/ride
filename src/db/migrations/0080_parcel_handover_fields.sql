-- D (P2P origination, plan 27 §6.1): parcel legs are originated by any role
-- (sender-entered pickup, dropoff, item note) and dispatched identically to
-- shop legs. The universal legs table carries no sender-entered handover
-- data, so two nullable columns land here:
--   item_note      — what the sender is sending (the courier reads this at
--                    pickup; the receiver is identified by phone, below).
--   receiver_phone — handover contact + cash-fee payer on delivery (the
--                    receiver often holds no account, so this stays a plain
--                    text contact, never a users FK).
-- dropoff_user_id on a parcel leg is the SENDING customer (they track the
-- parcel and receive the delivery:status pushes); pickup_shop_id stays NULL
-- (no shop) and order_id carries the parcel's own consignment uuid (no
-- parent row — delivery_requests is retired, B5-1).
--
-- Purely additive + nullable: no backfill, re-application is a no-op.
ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "item_note" text;
--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "receiver_phone" varchar(20);
