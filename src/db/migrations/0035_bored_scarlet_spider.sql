ALTER TYPE "public"."document_type" ADD VALUE 'nid_front';--> statement-breakpoint
ALTER TYPE "public"."document_type" ADD VALUE 'nid_back';--> statement-breakpoint
ALTER TYPE "public"."document_type" ADD VALUE 'uber_screenshot';--> statement-breakpoint
ALTER TYPE "public"."document_type" ADD VALUE 'pathao_screenshot';--> statement-breakpoint
ALTER TYPE "public"."document_type" ADD VALUE 'obhai_screenshot';--> statement-breakpoint
ALTER TYPE "public"."document_type" ADD VALUE 'indrive_screenshot';--> statement-breakpoint
ALTER TABLE "vehicle_models" ADD COLUMN "source" varchar(20) DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicle_models" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;