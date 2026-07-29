CREATE TABLE "surge_current" (
	"zone_id" uuid PRIMARY KEY NOT NULL,
	"multiplier" numeric(4, 2) DEFAULT '1.0' NOT NULL,
	"demand_count" integer DEFAULT 0 NOT NULL,
	"supply_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drivers" ALTER COLUMN "zone_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "rides" ALTER COLUMN "surge_zone_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "surge_current" ADD CONSTRAINT "surge_current_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;