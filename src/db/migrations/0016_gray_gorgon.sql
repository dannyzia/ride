DROP INDEX "user_devices_device_id_key";--> statement-breakpoint
DROP INDEX "rides_scheduled_dispatch_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "user_devices_user_id_device_id_key" ON "user_devices" USING btree ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "rides_scheduled_dispatch_idx" ON "rides" USING btree ("scheduled_at") WHERE status = 'scheduled' AND scheduled_dispatched_at IS NULL;