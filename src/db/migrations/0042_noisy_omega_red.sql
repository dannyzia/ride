DROP INDEX "zones_one_active";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "idempotency_key" varchar(128);--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "reminder_60_sent" boolean DEFAULT false;--> statement-breakpoint
CREATE UNIQUE INDEX "demand_forecasts_zone_hour_idx" ON "demand_forecasts" USING btree ("zone_id","forecast_hour");--> statement-breakpoint
CREATE INDEX "demand_forecasts_hour_idx" ON "demand_forecasts" USING btree ("forecast_hour");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_idempotency_idx" ON "notifications" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "rides_zone_created_idx" ON "rides" USING btree ("zone_id","created_at");--> statement-breakpoint
CREATE INDEX "zones_active_idx" ON "zones" USING btree ("is_active");