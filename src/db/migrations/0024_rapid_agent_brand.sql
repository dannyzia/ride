CREATE TABLE "driver_commute_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"destination_lat" numeric(10, 8) NOT NULL,
	"destination_lng" numeric(11, 8) NOT NULL,
	"destination_address" text NOT NULL,
	"max_deviation_meters" integer DEFAULT 2000 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ride_extra_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"amount_bdt" integer NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"submitted_by_driver" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rider_passes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_bdt" integer NOT NULL,
	"discount_percent" integer DEFAULT 10 NOT NULL,
	"max_rides" integer,
	"validity_days" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rider_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rider_id" uuid NOT NULL,
	"pass_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"rides_used" integer DEFAULT 0 NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payment_event_id" uuid
);
--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "auto_accept_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "auto_accept_radius_meters" integer DEFAULT 500 NOT NULL;--> statement-breakpoint
ALTER TABLE "point_offers" ADD COLUMN "reward_value_bdt" integer;--> statement-breakpoint
ALTER TABLE "pricing" ADD COLUMN "free_wait_minutes" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "pricing" ADD COLUMN "wait_fee_per_minute_bdt" integer DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "target_role" varchar(20) DEFAULT 'rider' NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "metric" varchar(30);--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "target_value" integer;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "wait_start_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "wait_end_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "wait_fee_bdt" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "reminder_sent" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "driver_commute_preferences" ADD CONSTRAINT "driver_commute_preferences_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_extra_charges" ADD CONSTRAINT "ride_extra_charges_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_subscriptions" ADD CONSTRAINT "rider_subscriptions_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_subscriptions" ADD CONSTRAINT "rider_subscriptions_pass_id_rider_passes_id_fk" FOREIGN KEY ("pass_id") REFERENCES "public"."rider_passes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_subscriptions" ADD CONSTRAINT "rider_subscriptions_payment_event_id_payment_events_id_fk" FOREIGN KEY ("payment_event_id") REFERENCES "public"."payment_events"("id") ON DELETE no action ON UPDATE no action;