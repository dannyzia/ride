CREATE TABLE "driver_payout_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"method_type" varchar(20) NOT NULL,
	"account_number" varchar(50) NOT NULL,
	"account_name" varchar(100),
	"bank_name" varchar(100),
	"branch_name" varchar(100),
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "driver_payout_methods" ADD CONSTRAINT "driver_payout_methods_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dpm_driver_idx" ON "driver_payout_methods" USING btree ("driver_id");--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;