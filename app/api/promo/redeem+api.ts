import { db } from "@/src/db";
import { promoCodes, promoRedemptions, users } from "@/src/db/schema";
import { eq, and, sql, count } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { VEHICLE_TYPE_ZOD_ENUM } from "@/lib/vehicleTypes";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";
import { stagePromo } from "@/lib/promoCache";

const redeemSchema = z.object({
  code: z.string().min(1).max(30),
  vehicle_type: VEHICLE_TYPE_ZOD_ENUM,
  pickup_lat: z.number().min(-90).max(90),
  pickup_lng: z.number().min(-180).max(180),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!user)
      return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, redeemSchema);
    if (!parsed.ok) return parsed.response;

    const { code, pickup_lat, pickup_lng } = parsed.data;

    // Look up promo by code (case-insensitive)
    const [promo] = await db
      .select()
      .from(promoCodes)
      .where(
        and(
          sql`LOWER(${promoCodes.code}) = LOWER(${code})`,
          eq(promoCodes.is_active, true),
          sql`promo_codes.deleted_at IS NULL`,
        ),
      )
      .limit(1);

    if (!promo)
      return Response.json({ error: 'promo_not_found', message: 'Promo code not found' }, { status: 404 });

    const now = new Date();
    if (promo.valid_from > now)
      return Response.json({ error: 'promo_not_found', message: 'Promo code not found' }, { status: 404 });
    if (promo.expires_at < now)
      return Response.json({ error: 'promo_expired', message: 'Promo code has expired' }, { status: 410 });

    // Check per-rider usage
    const [{ riderUses }] = await db
      .select({ riderUses: count() })
      .from(promoRedemptions)
      .where(
        and(
          eq(promoRedemptions.promo_code_id, promo.id),
          eq(promoRedemptions.rider_id, user.id),
        ),
      );
    if (riderUses >= (promo.max_uses_per_rider ?? 1)) {
      return Response.json(
        { error: "promo_max_uses_reached", message: "You have already used this promo code" },
        { status: 429 },
      );
    }

    // Check global usage
    if (promo.max_uses != null) {
      const [{ globalUses }] = await db
        .select({ globalUses: count() })
        .from(promoRedemptions)
        .where(eq(promoRedemptions.promo_code_id, promo.id));
      if (globalUses >= promo.max_uses) {
        return Response.json(
          { error: "promo_max_uses_reached", message: "This promo code is no longer available" },
          { status: 429 },
        );
      }
    }

    // Zone check — pickup must be inside active zone
    const { validatePickupZone } = await import("@/lib/zone");
    const zoneCheck = await validatePickupZone(pickup_lat, pickup_lng);
    if (!zoneCheck.valid) {
      return Response.json(
        {
          error: "promo_ineligible",
          message: "Pickup outside operational zone",
        },
        { status: 422 },
      );
    }

    // Stage the promo (not yet consumed — will be written on ride creation)
    stagePromo(user.id, {
      promoCodeId: promo.id,
      riderId: user.id,
      discountType: promo.discount_type,
      discountValue: promo.discount_value,
      maxDiscountBdt: promo.max_discount_bdt,
      minSpendBdt: promo.min_spend_bdt,
    });

    logger.info("[promo/redeem] staged", {
      riderId: user.id,
      promoId: promo.id,
      code,
    });

    return Response.json({
      status: "valid",
      promo: {
        promo_id: promo.id,
        code: promo.code,
        discount_type: promo.discount_type,
        discount_value: promo.discount_value,
        max_discount_bdt: promo.max_discount_bdt,
        min_spend_bdt: promo.min_spend_bdt,
      },
    });
  } catch (err: any) {
    if (err.status === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[promo/redeem] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
