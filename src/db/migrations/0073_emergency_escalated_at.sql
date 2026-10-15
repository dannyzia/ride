-- S5 (plan 27 §4 + F-19): the 60-second ack timeout now ESCALATES — the sweep
-- stamps escalated_at ONCE, re-broadcasts to the next eligible ring tier and
-- notifies the requester of the delay (config key emergency_ack_timeout_seconds,
-- launch seed 60 — never a code literal). The TTL sweep (job 53) still owns
-- final failure at emergency_ttl_seconds.
ALTER TABLE "emergency_requests" ADD COLUMN "escalated_at" timestamptz;
