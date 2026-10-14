-- S3 (§3 + §12): shop settlement ledger, busy mode, prep-time picker.
--
-- shop_ledger is the shop settlement system of record (§12/R1, deliberately
-- deferred from S1 per §1.1 row 78). Append-only: no updated_at column; money
-- is integer paisa and amount_bdt is SIGNED (credit positive / debit
-- negative). Writer: lib/shopLedger.ts ONLY — same write-ownership rule as
-- call_ledger/payment_events. Wired to the delivered transition
-- (shop order status PATCH) and the workshop-request done transition
-- (order-linked service job, F-13) inside their existing transactions.
--
-- shops.busy: F-16 ruling — busy mode THROTTLES, it does not close. The
-- server still accepts orders for a busy shop; closed (= !is_open) is what
-- rejects new orders server-side (R5, enforced in POST /api/shop/orders).
--
-- shop_orders.prep_minutes: set with the accepted transition via the
-- prep-time picker (§3 dashboard); estimate for the customer + dispatch
-- trigger timing. Nullable — legacy accepted orders keep NULL.
--
-- RLS: shop_ledger is money — forced RLS + zero anon/auth grants, same
-- posture as every S1 table. Admin bypass uses the service role.

CREATE TYPE "shop_ledger_entry_type" AS ENUM (
	'order_revenue',
	'commission',
	'payout',
	'adjustment',
	'reversal'
);
--> statement-breakpoint
CREATE TABLE "shop_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL REFERENCES "shops"("id"),
	-- NULL for payout/adjustment rows that are not order-scoped.
	"order_id" uuid REFERENCES "shop_orders"("id"),
	"entry_type" "shop_ledger_entry_type" NOT NULL,
	"amount_bdt" integer NOT NULL,
	"note" text,
	"created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Order revenue is credited at most once per order; commission likewise.
-- Payout/adjustment rows have order_id NULL and are exempt (NULL != NULL).
CREATE UNIQUE INDEX "shop_ledger_order_entry_uq"
	ON "shop_ledger" ("order_id", "entry_type")
	WHERE "order_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "shop_ledger_shop_idx" ON "shop_ledger" ("shop_id", "created_at");
--> statement-breakpoint
ALTER TABLE "shop_ledger" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "shop_ledger" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON "shop_ledger" FROM anon, authenticated;
--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "busy" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "prep_minutes" integer;
--> statement-breakpoint
-- Soft-delete support for the S3 workshop services CRUD (§3): the repo
-- convention is soft deletes and the S1 table shipped without the column.
-- Safe to include in this file only because 0067 has never applied anywhere
-- (dev-DB apply is a separate step).
ALTER TABLE "workshop_services" ADD COLUMN "deleted_at" timestamptz;
