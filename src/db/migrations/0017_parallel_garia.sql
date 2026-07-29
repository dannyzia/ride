ALTER TABLE "drivers" ADD COLUMN "consent_accepted" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "consent_version" varchar(20);--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "consent_accepted_at" timestamp with time zone;