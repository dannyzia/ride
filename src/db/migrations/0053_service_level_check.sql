-- Migration: service_level_check
-- Generated from schema.ts check() builders (drizzle-kit generate equivalent)
-- Adds DB-level CHECK constraints for service_level (BLS/ALS) and NOT NULL on ambulance_certifications.service_level

ALTER TABLE "rental_requests" ADD CONSTRAINT "rental_requests_service_level_check" CHECK ("service_level" IS NULL OR "service_level" IN ('BLS', 'ALS'));
ALTER TABLE "ambulance_certifications" ADD CONSTRAINT "ambulance_certifications_service_level_check" CHECK ("service_level" IN ('BLS', 'ALS'));
ALTER TABLE "emergency_requests" ADD CONSTRAINT "emergency_requests_service_level_check" CHECK ("service_level" IS NULL OR "service_level" IN ('BLS', 'ALS'));
ALTER TABLE "ambulance_certifications" ALTER COLUMN "service_level" SET NOT NULL;
