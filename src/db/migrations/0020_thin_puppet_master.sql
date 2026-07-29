ALTER TABLE "documents" ADD COLUMN "expiry_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "alert_sent_30d" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "alert_sent_7d" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "alert_sent_1d" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "surge_multiplier" numeric(4, 2);--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "surge_zone_id" varchar(20);--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "secondary_rider_name" varchar(255);--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "secondary_rider_phone" varchar(20);--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "is_booked_for_someone_else" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "cancellation_fee_bdt" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_status" varchar(20) DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "fraud_score" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "total_rides" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "total_spent_bdt" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_ride_at" timestamp with time zone;