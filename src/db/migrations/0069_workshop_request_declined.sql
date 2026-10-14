-- S4 (plan 27 F-13): the 2h confirm SLA now AUTO-DECLINES expired requests.
-- The status value ships in its OWN migration file (D5 rule: ALTER TYPE ADD
-- VALUE is unusable in the adding transaction).
ALTER TYPE "workshop_request_status" ADD VALUE 'declined';
