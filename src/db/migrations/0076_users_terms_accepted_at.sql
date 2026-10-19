-- C1-1 (STAGE C1-FIX, ordered D-i, P0-lite) — T&C + Privacy consent gate.
-- Every new registration must carry explicit acceptance of the Terms of
-- Service + Privacy Policy (lib/legalContent.ts is the copy source; the
-- phone-entry checkbox links to LegalDocumentScreen, no new copy).
-- Nullable so legacy rows (registered before the gate) stay valid; new
-- registrations set it from the carried terms_accepted flag, and
-- POST /api/register rejects a missing flag with 400 terms_required.
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" timestamptz;
