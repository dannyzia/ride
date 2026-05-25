ALTER TABLE "payment_events" ALTER COLUMN "driver_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_events" ALTER COLUMN "package_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "ride_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE no action ON UPDATE no action;