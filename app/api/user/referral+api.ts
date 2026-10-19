/**
 * GET /api/user/referral — DORMANT STUB (C3-2, STAGE C3-FIX, ruled).
 *
 * Referrals are dormant until after launch: both referral surfaces (customer
 * + driver) render "coming soon" copy (referral.coming_soon, F-26 pattern)
 * and issue no API calls, no share intents, no code display. This route
 * intentionally reads no token, touches no table, and writes nothing: every
 * call receives the same 410 refusal. The referral pipeline stays
 * schema-only (P5, post-launch) — referralCodes / referrals /
 * referralCampaigns take no new writers from here.
 */
import { logger } from "@/lib/logger";

export async function GET(_request?: Request) {
  logger.warn("[user/referral] dormant referral dashboard requested");
  return Response.json(
    {
      error: "referrals_dormant",
      message: "Referrals are coming soon",
    },
    { status: 410 },
  );
}
