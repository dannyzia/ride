ALTER TYPE "public"."ride_status" ADD VALUE 'driver_arrived' BEFORE 'in_progress';--> statement-breakpoint
ALTER TABLE "pricing" ADD COLUMN "platform_commission_percent" integer;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "platform_commission_bdt" integer;--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "arrived_at" timestamp with time zone;