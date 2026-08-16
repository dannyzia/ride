ALTER TABLE "sos_alerts" ADD COLUMN "ride_id" uuid;--> statement-breakpoint
ALTER TABLE "sos_alerts" ADD CONSTRAINT "sos_alerts_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sos_alerts_ride_idx" ON "sos_alerts" USING btree ("ride_id");