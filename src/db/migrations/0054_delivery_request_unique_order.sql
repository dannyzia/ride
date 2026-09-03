-- N8: Unique index on delivery_requests.source_shop_order_id
-- Closes the check-then-insert idempotency race in lib/shopDeliveryBridge.ts (createFromShopOrder):
-- two concurrent mark-ready calls could both pass the SELECT probe and insert duplicates.
-- Matches schema.ts: uniqueIndex("delivery_requests_source_shop_order_idx").on(source_shop_order_id).
-- Postgres unique indexes permit multiple NULLs, so delivery requests without a source
-- shop order (manual/courier-created) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS delivery_requests_source_shop_order_idx
  ON delivery_requests (source_shop_order_id);
