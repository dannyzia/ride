-- Marketplace Phase 1: Shops (schema from src/db/schema.ts)
-- Enums: shop_order_status, shop_member_role, shop_rfq_status
-- Tables: shops, shop_members, shop_products, shop_orders, shop_order_items, shop_rfqs
-- NOTE: hand-authored (drizzle-kit generate requires TTY — see 0047 note).

-- Enums (IF NOT EXISTS — may have been pushed by an earlier drizzle-kit push)
DO $$ BEGIN
  CREATE TYPE "shop_order_status" AS ENUM ('pending','accepted','preparing','ready_for_pickup','out_for_delivery','delivered','cancelled','refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "shop_member_role" AS ENUM ('OWNER','MANAGER','STAFF');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "shop_rfq_status" AS ENUM ('open','quoted','awarded','declined','expired','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- shops
CREATE TABLE "shops" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "name" varchar(150) NOT NULL,
  "slug" varchar(150) NOT NULL UNIQUE,
  "description" text,
  "logo_url" text,
  "banner_url" text,
  "phone" varchar(20),
  "address_line" text,
  "lat" numeric(9,6),
  "lng" numeric(9,6),
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "is_verified" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);
--> statement-breakpoint
CREATE INDEX "shops_owner_idx" ON "shops" ("owner_user_id");
--> statement-breakpoint
CREATE INDEX "shops_status_idx" ON "shops" ("status");

-- shop_members
CREATE TABLE "shop_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" uuid NOT NULL REFERENCES "shops"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "role" "shop_member_role" NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "joined_at" timestamptz NOT NULL DEFAULT now(),
  "removed_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX "shop_members_unique_idx" ON "shop_members" ("shop_id","user_id");
--> statement-breakpoint
CREATE INDEX "shop_members_user_idx" ON "shop_members" ("user_id");
--> statement-breakpoint
CREATE INDEX "shop_members_shop_idx" ON "shop_members" ("shop_id");

-- shop_products
CREATE TABLE "shop_products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" uuid NOT NULL REFERENCES "shops"("id"),
  "name" varchar(200) NOT NULL,
  "description" text,
  "price_bdt" integer NOT NULL,
  "currency" varchar(5) NOT NULL DEFAULT 'BDT',
  "stock" integer NOT NULL DEFAULT 0,
  "image_urls" jsonb NOT NULL DEFAULT '[]',
  "category" varchar(50),
  "is_active" boolean NOT NULL DEFAULT true,
  "is_rfq" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);
--> statement-breakpoint
CREATE INDEX "shop_products_shop_idx" ON "shop_products" ("shop_id");
--> statement-breakpoint
CREATE INDEX "shop_products_active_idx" ON "shop_products" ("shop_id","is_active");

-- shop_orders
CREATE TABLE "shop_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" uuid NOT NULL REFERENCES "shops"("id"),
  "rider_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "status" "shop_order_status" NOT NULL DEFAULT 'pending',
  "subtotal_bdt" integer NOT NULL,
  "delivery_fee_bdt" integer,
  "total_bdt" integer NOT NULL,
  "category" varchar(30) NOT NULL DEFAULT 'general',
  "fulfillment" varchar(20) NOT NULL DEFAULT 'delivery',
  "delivery_address" text,
  "delivery_lat" numeric(9,6),
  "delivery_lng" numeric(9,6),
  "rider_notes" text,
  "shop_notes" text,
  "accepted_at" timestamptz,
  "prepared_at" timestamptz,
  "ready_at" timestamptz,
  "picked_up_at" timestamptz,
  "delivered_at" timestamptz,
  "cancelled_at" timestamptz,
  "cancel_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "shop_orders_shop_idx" ON "shop_orders" ("shop_id");
--> statement-breakpoint
CREATE INDEX "shop_orders_rider_idx" ON "shop_orders" ("rider_user_id");
--> statement-breakpoint
CREATE INDEX "shop_orders_status_idx" ON "shop_orders" ("status");

-- shop_order_items
CREATE TABLE "shop_order_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL REFERENCES "shop_orders"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "shop_products"("id"),
  "quantity" integer NOT NULL DEFAULT 1,
  "unit_price_bdt" integer NOT NULL,
  "line_total_bdt" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- shop_rfqs
CREATE TABLE "shop_rfqs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shop_id" uuid NOT NULL REFERENCES "shops"("id"),
  "rider_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "title" varchar(200) NOT NULL,
  "description" text,
  "status" "shop_rfq_status" NOT NULL DEFAULT 'open',
  "quoted_price_bdt" integer,
  "quoted_notes" text,
  "quoted_at" timestamptz,
  "awarded_at" timestamptz,
  "expires_at" timestamptz NOT NULL,
  "cancelled_at" timestamptz,
  "cancel_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "shop_rfqs_shop_idx" ON "shop_rfqs" ("shop_id");
--> statement-breakpoint
CREATE INDEX "shop_rfqs_rider_idx" ON "shop_rfqs" ("rider_user_id");
--> statement-breakpoint
CREATE INDEX "shop_rfqs_status_idx" ON "shop_rfqs" ("status");
--> statement-breakpoint
-- Phase 1 fixup: add created_at (append-only) and ON DELETE CASCADE on order_id
ALTER TABLE "shop_order_items" ADD COLUMN "created_at" timestamptz NOT NULL DEFAULT now();
