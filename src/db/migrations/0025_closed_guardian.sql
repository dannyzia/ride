ALTER TABLE "payment_events" ADD COLUMN "purpose" varchar(20) DEFAULT 'ride';--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "pass_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_pass_id_rider_passes_id_fk" FOREIGN KEY ("pass_id") REFERENCES "public"."rider_passes"("id") ON DELETE no action ON UPDATE no action;