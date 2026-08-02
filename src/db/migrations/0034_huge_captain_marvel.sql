CREATE TYPE "public"."rider_fee_deduction_status" AS ENUM('pending', 'partially_collected', 'collected', 'expired');--> statement-breakpoint
CREATE TABLE "rider_fee_deductions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rider_id" uuid NOT NULL,
	"ride_id" uuid NOT NULL,
	"total_amount_bdt" integer NOT NULL,
	"remaining_amount_bdt" integer NOT NULL,
	"status" "rider_fee_deduction_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "cancellation_fee_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rider_fee_deductions" ADD CONSTRAINT "rider_fee_deductions_rider_id_users_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rider_fee_deductions" ADD CONSTRAINT "rider_fee_deductions_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rider_fee_deductions_rider_idx" ON "rider_fee_deductions" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX "rider_fee_deductions_status_idx" ON "rider_fee_deductions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rider_fee_deductions_expires_idx" ON "rider_fee_deductions" USING btree ("expires_at");