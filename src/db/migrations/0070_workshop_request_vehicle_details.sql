-- S4 (plan 27 F-13): the customer service-request form carries vehicle
-- details (make/model/registration) alongside the requested window.
ALTER TABLE "workshop_requests" ADD COLUMN "vehicle_details" text;
