CREATE TYPE "public"."call_event_type" AS ENUM('deduction', 'refund', 'credit', 'initial_load', 'expiry_writeoff');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('license_front', 'license_back', 'reg_scan_front', 'reg_scan_back', 'fitness_scan', 'tax_token_scan', 'brta_certificate', 'vehicle_photo_front', 'vehicle_photo_left', 'vehicle_photo_right', 'vehicle_photo_back', 'legacy_screenshot', 'owner_consent_scan', 'helmet_photo', 'dashboard_photo', 'interior_photo', 'third_row_photo');--> statement-breakpoint
CREATE TYPE "public"."driver_status" AS ENUM('pending', 'temporary', 'active', 'suspended', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."offer_outcome" AS ENUM('delivered', 'accepted', 'rejected', 'expired', 'refunded', 'filtered');--> statement-breakpoint
CREATE TYPE "public"."owner_consent_status" AS ENUM('pending', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('bkash', 'nagad');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('initiated', 'paid', 'failed', 'callback_pending');--> statement-breakpoint
CREATE TYPE "public"."registration_area" AS ENUM('DHAKA_METRO', 'CHITTAGONG_METRO', 'KHULNA_METRO', 'RAJSHAHI_METRO', 'BARISAL_METRO', 'SYLHET_METRO', 'RANGPUR_METRO', 'MYMENSINGH_METRO');--> statement-breakpoint
CREATE TYPE "public"."ride_status" AS ENUM('pending', 'dispatching', 'matched', 'driver_arriving', 'in_progress', 'completed', 'cancelled', 'expired', 'no_drivers');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'expired', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('rider', 'driver', 'admin');--> statement-breakpoint
CREATE TYPE "public"."vehicle_class_letter" AS ENUM('KA', 'KHA', 'GA', 'GHA', 'CHA', 'CHHA', 'JA', 'JHA', 'TA', 'THA', 'DA', 'NA', 'PA', 'BHA', 'MA', 'DAW', 'THAW', 'HA', 'LA', 'EE', 'YA');--> statement-breakpoint
CREATE TYPE "public"."vehicle_type" AS ENUM('bike_basic', 'bike_standard', 'bike_plus', 'cng', 'car_economy', 'car_comfort', 'car_premium', 'car_xl');--> statement-breakpoint
CREATE TABLE "call_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"ride_id" uuid,
	"event_type" "call_event_type" NOT NULL,
	"delta" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"reason" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compensation_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_event_id" uuid NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 10 NOT NULL,
	"next_retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compensation_queue_payment_event_id_unique" UNIQUE("payment_event_id")
);
--> statement-breakpoint
CREATE TABLE "credit_vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"calls" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_subscription_id" uuid,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatch_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"batch_index" smallint NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"fetch_confirmed_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"outcome" "offer_outcome" DEFAULT 'delivered' NOT NULL,
	"rejection_reason" varchar(100),
	"filtered_reason" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"doc_type" "document_type" NOT NULL,
	"storage_url" text NOT NULL,
	"status" "document_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" varchar(500),
	"file_size_bytes" integer NOT NULL,
	"purge_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "driver_online_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"went_online_at" timestamp with time zone NOT NULL,
	"went_offline_at" timestamp with time zone,
	"duration_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"vehicle_type" "vehicle_type" NOT NULL,
	"status" "driver_status" DEFAULT 'pending' NOT NULL,
	"rating" numeric(3, 2) DEFAULT '5.00' NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"rating_sum" integer DEFAULT 0 NOT NULL,
	"min_per_km_bdt" integer,
	"vehicle_registration_date" date,
	"address" text,
	"license_number" varchar(100),
	"owner_consent_verified" boolean DEFAULT false NOT NULL,
	"is_legacy_operator" boolean DEFAULT false NOT NULL,
	"provisional_expires_at" timestamp with time zone,
	"acceptance_rate" numeric(5, 2) DEFAULT '100.00' NOT NULL,
	"completed_rides_count" integer DEFAULT 0 NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"last_location_lat" numeric(10, 7),
	"last_location_lng" numeric(10, 7),
	"last_location_at" timestamp with time zone,
	"h3_cell_res9" varchar(20),
	"stage2_due_at" timestamp with time zone,
	"car_image_url" varchar(500),
	"car_seats" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drivers_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "owner_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"owner_name" varchar(200) NOT NULL,
	"owner_address" text NOT NULL,
	"owner_phone" varchar(20) NOT NULL,
	"consent_document_id" uuid,
	"legacy_screenshot_document_id" uuid,
	"status" "owner_consent_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"call_count" integer NOT NULL,
	"duration_days" integer NOT NULL,
	"price_bdt" integer NOT NULL,
	"is_trial" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"daily_cap" integer DEFAULT 200 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"idempotency_key" varchar(64) NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"provider_txn_id" varchar(255),
	"amount_bdt" integer NOT NULL,
	"status" "payment_status" DEFAULT 'initiated' NOT NULL,
	"initiated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"subscription_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_events_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "platform_config" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"vehicle_type" "vehicle_type" NOT NULL,
	"base_fare_bdt" integer NOT NULL,
	"per_km_bdt" integer NOT NULL,
	"per_min_wait_bdt" integer NOT NULL,
	"free_wait_minutes" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"brta_fare_ceiling_bdt" integer,
	"minimum_fare_bdt" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" varchar(128) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "rides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"driver_id" uuid,
	"zone_id" uuid NOT NULL,
	"pricing_id" uuid NOT NULL,
	"origin_address" varchar(255) NOT NULL,
	"destination_address" varchar(255) NOT NULL,
	"origin_latitude" numeric(10, 7) NOT NULL,
	"origin_longitude" numeric(10, 7) NOT NULL,
	"destination_latitude" numeric(10, 7) NOT NULL,
	"destination_longitude" numeric(10, 7) NOT NULL,
	"vehicle_type" "vehicle_type" NOT NULL,
	"status" "ride_status" DEFAULT 'pending' NOT NULL,
	"fare_breakdown" jsonb NOT NULL,
	"distance_km" numeric(7, 3) NOT NULL,
	"scheduled_at" timestamp with time zone,
	"matched_at" timestamp with time zone,
	"eta_minutes" smallint,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"rider_rating" smallint,
	"driver_rating" smallint,
	"cancel_reason" varchar(255),
	"cancelled_by" varchar(10),
	"scheduled_dispatched_at" timestamp with time zone,
	"payment_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"fare_price" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"calls_remaining" integer NOT NULL,
	"daily_calls_used" integer DEFAULT 0 NOT NULL,
	"daily_reset_at" timestamp with time zone NOT NULL,
	"cap_override" numeric(3, 2),
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"credit_calls_received" integer DEFAULT 0 NOT NULL,
	"total_deductions" integer DEFAULT 0 NOT NULL,
	"is_trial" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "used_challenges" (
	"jti" varchar(64) PRIMARY KEY NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firebase_uid" varchar(128) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"number" varchar(20),
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"role" "user_role" DEFAULT 'rider' NOT NULL,
	"profile_image_url" varchar(500),
	"device_id" varchar(255),
	"device_bound_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_firebase_uid_unique" UNIQUE("firebase_uid"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "vehicle_type_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"old_vehicle_type" "vehicle_type" NOT NULL,
	"new_vehicle_type" "vehicle_type" NOT NULL,
	"change_reason" varchar(20) NOT NULL,
	"reason_text" varchar(500) NOT NULL,
	"changed_by" uuid,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"effective_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"vehicle_type" "vehicle_type" NOT NULL,
	"manufacturer" varchar(100) NOT NULL,
	"model" varchar(100) NOT NULL,
	"manufacturing_year" integer NOT NULL,
	"cc_range" varchar(30),
	"has_ac" boolean,
	"passenger_seats" integer NOT NULL,
	"registration_area" "registration_area" NOT NULL,
	"vehicle_class_letter" "vehicle_class_letter" NOT NULL,
	"registration_number" varchar(50) NOT NULL,
	"registration_date" date NOT NULL,
	"fitness_expires_at" date NOT NULL,
	"tax_token_expires_at" date NOT NULL,
	"admin_type_note" text,
	"type_change_effective_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_driver_id_unique" UNIQUE("driver_id"),
	CONSTRAINT "vehicles_registration_number_unique" UNIQUE("registration_number")
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"polygon" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_ledger" ADD CONSTRAINT "call_ledger_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_ledger" ADD CONSTRAINT "call_ledger_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_ledger" ADD CONSTRAINT "call_ledger_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_queue" ADD CONSTRAINT "compensation_queue_payment_event_id_payment_events_id_fk" FOREIGN KEY ("payment_event_id") REFERENCES "public"."payment_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_vouchers" ADD CONSTRAINT "credit_vouchers_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_vouchers" ADD CONSTRAINT "credit_vouchers_redeemed_subscription_id_subscriptions_id_fk" FOREIGN KEY ("redeemed_subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_offers" ADD CONSTRAINT "dispatch_offers_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_offers" ADD CONSTRAINT "dispatch_offers_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_online_sessions" ADD CONSTRAINT "driver_online_sessions_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_online_sessions" ADD CONSTRAINT "driver_online_sessions_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_consents" ADD CONSTRAINT "owner_consents_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_consents" ADD CONSTRAINT "owner_consents_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing" ADD CONSTRAINT "pricing_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_type_changes" ADD CONSTRAINT "vehicle_type_changes_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_type_changes" ADD CONSTRAINT "vehicle_type_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_ledger_driver_date_idx" ON "call_ledger" USING btree ("driver_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "call_ledger_no_double_deduct" ON "call_ledger" USING btree ("ride_id","driver_id") WHERE event_type = 'deduction';--> statement-breakpoint
CREATE INDEX "chat_messages_ride_created_idx" ON "chat_messages" USING btree ("ride_id","created_at");--> statement-breakpoint
CREATE INDEX "comp_queue_status_retry_idx" ON "compensation_queue" USING btree ("status","next_retry_at") WHERE status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "dispatch_offers_ride_driver_idx" ON "dispatch_offers" USING btree ("ride_id","driver_id");--> statement-breakpoint
CREATE INDEX "dispatch_offers_driver_sent_idx" ON "dispatch_offers" USING btree ("driver_id","sent_at");--> statement-breakpoint
CREATE INDEX "dispatch_offers_filtered_idx" ON "dispatch_offers" USING btree ("driver_id","outcome","sent_at") WHERE outcome = 'filtered';--> statement-breakpoint
CREATE INDEX "documents_driver_status_idx" ON "documents" USING btree ("driver_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_one_per_type" ON "documents" USING btree ("driver_id","doc_type") WHERE status IN ('pending','approved') AND deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "drivers_user_id_idx" ON "drivers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "drivers_h3_cell_idx" ON "drivers" USING btree ("h3_cell_res9");--> statement-breakpoint
CREATE INDEX "drivers_online_status_idx" ON "drivers" USING btree ("is_online","status");--> statement-breakpoint
CREATE INDEX "drivers_vehicle_type_idx" ON "drivers" USING btree ("vehicle_type");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_idempotency_idx" ON "payment_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_zone_type_active_idx" ON "pricing" USING btree ("zone_id","vehicle_type") WHERE is_active = true;--> statement-breakpoint
CREATE INDEX "pricing_vehicle_type_idx" ON "pricing" USING btree ("vehicle_type");--> statement-breakpoint
CREATE INDEX "rides_status_created_idx" ON "rides" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "rides_user_status_idx" ON "rides" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "rides_driver_status_idx" ON "rides" USING btree ("driver_id","status");--> statement-breakpoint
CREATE INDEX "rides_scheduled_dispatch_idx" ON "rides" USING btree ("scheduled_at") WHERE status = 'pending' AND scheduled_at IS NOT NULL AND scheduled_dispatched_at IS NULL;--> statement-breakpoint
CREATE INDEX "subs_driver_status_idx" ON "subscriptions" USING btree ("driver_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "subs_one_active_per_driver" ON "subscriptions" USING btree ("driver_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "subs_one_trial_per_driver" ON "subscriptions" USING btree ("driver_id") WHERE is_trial = true AND status IN ('active','expired');--> statement-breakpoint
CREATE UNIQUE INDEX "users_firebase_uid_idx" ON "users" USING btree ("firebase_uid");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_idx" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "vtc_driver_created_idx" ON "vehicle_type_changes" USING btree ("driver_id","created_at");--> statement-breakpoint
CREATE INDEX "vtc_cooling_off_idx" ON "vehicle_type_changes" USING btree ("status","effective_at") WHERE status = 'cooling_off';--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_driver_id_idx" ON "vehicles" USING btree ("driver_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_reg_number_idx" ON "vehicles" USING btree ("registration_number");--> statement-breakpoint
CREATE UNIQUE INDEX "zones_one_active" ON "zones" USING btree ((1)) WHERE is_active = true;