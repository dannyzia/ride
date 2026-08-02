CREATE TYPE "public"."cancellation_credit_status" AS ENUM('pending', 'applied', 'expired');--> statement-breakpoint
ALTER TYPE "public"."wallet_driver_transaction_type" ADD VALUE 'cancellation_compensation';--> statement-breakpoint
CREATE TABLE "cancellation_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_driver_id" uuid NOT NULL,
	"cancellation_ride_id" uuid NOT NULL,
	"amount_bdt" integer NOT NULL,
	"status" "cancellation_credit_status" DEFAULT 'pending' NOT NULL,
	"applied_to_ride_id" uuid,
	"applied_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "cancellation_compensation_driver_id" uuid;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "cancellation_fee_applied" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "promo_code" varchar(50);--> statement-breakpoint
ALTER TABLE "cancellation_credits" ADD CONSTRAINT "cancellation_credits_original_driver_id_drivers_id_fk" FOREIGN KEY ("original_driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellation_credits" ADD CONSTRAINT "cancellation_credits_cancellation_ride_id_rides_id_fk" FOREIGN KEY ("cancellation_ride_id") REFERENCES "public"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cancellation_credits" ADD CONSTRAINT "cancellation_credits_applied_to_ride_id_rides_id_fk" FOREIGN KEY ("applied_to_ride_id") REFERENCES "public"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cancellation_credits_driver_status_idx" ON "cancellation_credits" USING btree ("original_driver_id","status");--> statement-breakpoint
CREATE INDEX "cancellation_credits_expires_idx" ON "cancellation_credits" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cancellation_credits_ride_unique" ON "cancellation_credits" USING btree ("cancellation_ride_id") WHERE status = 'pending';--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_cancellation_compensation_driver_id_drivers_id_fk" FOREIGN KEY ("cancellation_compensation_driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;