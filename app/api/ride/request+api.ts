import { db } from "@/src/db";
import {
  users,
  rides,
  pricing,
  promoCodes,
  promoRedemptions,
} from "@/src/db/schema";
import { eq, and, sql, gte } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { validatePickupZone } from "@/lib/zone";
import { calculateFare, haversineKm } from "@/lib/fareCalc";
import { detectOriginCity, isIntercity } from "@/lib/cityBoundary";
import { splitRoute } from "@/lib/routeSplit";
import { getRouteDistance } from "@/lib/barikoi";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { VEHICLE_TYPE_ZOD_ENUM } from "@/lib/vehicleTypes";
import { getStagedPromo, clearStagedPromo } from "@/lib/promoCache";

const requestSchema = z.object({
  pickup_lat: z.number().min(-90).max(90),
  pickup_lng: z.number().min(-180).max(180),
  pickup_address: z.string().min(1).max(500),
  dropoff_lat: z.number().min(-90).max(90),
  dropoff_lng: z.number().min(-180).max(180),
  dropoff_address: z.string().min(1).max(500),
  vehicle_type: VEHICLE_TYPE_ZOD_ENUM,
  scheduled_at: z.string().datetime().optional(),
  allow_downgrade: z.boolean().optional().default(false),
  promo_code: z.string().min(1).max(30).optional(),
  preference_ids: z.array(z.string().uuid()).max(10).optional(),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const uid = supabaseUser.id;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.auth_uid, uid))
      .limit(1);
    if (!user)
      return Response.json({ error: "user_not_found" }, { status: 404 });
    if (user.role !== "rider")
      return Response.json({ error: "forbidden" }, { status: 403 });

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "validation_error", message: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const {
      pickup_lat,
      pickup_lng,
      pickup_address,
      dropoff_lat,
      dropoff_lng,
      dropoff_address,
      vehicle_type,
      scheduled_at,
      allow_downgrade,
      promo_code,
      preference_ids,
    } = parsed.data;

    // Zone check
    const zoneCheck = await validatePickupZone(pickup_lat, pickup_lng);
    if (!zoneCheck.valid) {
      return Response.json(
        {
          error: "outside_zone",
          message: "Pickup location is outside the operational zone",
        },
        { status: 422 },
      );
    }
    const zoneId = zoneCheck.zone?.id ?? "00000000-0000-0000-0000-000000000000";

    // Rate limit: max 1 active ride per rider
    const [activeRide] = await db
      .select()
      .from(rides)
      .where(
        and(
          eq(rides.user_id, user.id),
          sql`status IN ('pending','dispatching','matched','in_progress')`,
        ),
      )
      .limit(1);
    if (activeRide) {
      return Response.json(
        {
          error: "ride_already_active",
          message: "You already have an active ride",
        },
        { status: 409 },
      );
    }

    // Rate limit: 5 requests per hour
    const hourAgo = new Date(Date.now() - 3600000);
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(rides)
      .where(and(eq(rides.user_id, user.id), gte(rides.created_at, hourAgo)));
    if (Number(countResult?.count ?? 0) >= 5) {
      return Response.json({ error: "rider_rate_limited" }, { status: 429 });
    }

    // Calculate distance + fare (route-based, with Haversine fallback)
    const route = await getRouteDistance(
      pickup_lat,
      pickup_lng,
      dropoff_lat,
      dropoff_lng,
    ).catch(() => null);
    const totalDistanceKm =
      route?.distanceKm ??
      haversineKm(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng);

    // City detection and intercity route splitting
    const { origin_city, origin_city_polygon } = await detectOriginCity({
      lat: pickup_lat,
      lng: pickup_lng,
    });
    const intercity = origin_city_polygon
      ? isIntercity({ lat: dropoff_lat, lng: dropoff_lng }, origin_city_polygon)
      : false;

    let insideKm = 0;
    let outsideKm = 0;

    if (intercity && origin_city_polygon) {
      const split = await splitRoute(
        { lat: pickup_lat, lng: pickup_lng },
        { lat: dropoff_lat, lng: dropoff_lng },
        origin_city_polygon,
      );
      insideKm = split.inside_km;
      outsideKm = split.outside_km;
    } else {
      insideKm = totalDistanceKm;
      outsideKm = 0;
    }

    const [activePricing] = await db
      .select()
      .from(pricing)
      .where(
        and(
          eq(pricing.vehicle_type, vehicle_type as any),
          eq(pricing.zone_id, zoneId),
          eq(pricing.is_active, true),
        ),
      )
      .limit(1);
    if (!activePricing) {
      return Response.json({ error: "pricing_not_found" }, { status: 422 });
    }

    const fareBreakdown = calculateFare(
      {
        base_fare_bdt: activePricing.base_fare_bdt,
        per_km_bdt: activePricing.per_km_bdt,
        intercity_per_km_bdt: activePricing.intercity_per_km_bdt ?? 0,
        per_min_bdt: activePricing.per_min_bdt,
        floor_length_km: Number(activePricing.floor_length_km ?? 0),
        floor_min: activePricing.floor_min ?? 0,
        brta_fare_ceiling_bdt: activePricing.brta_fare_ceiling_bdt,
        platform_commission_percent: Number(
          activePricing.platform_commission_percent ?? 0,
        ),
      },
      insideKm,
      0,
      undefined,
      outsideKm,
      origin_city,
      intercity,
    );

    // ── Preference surcharge ───────────────────────────────────────────
    let preferenceSurchargeBdt = 0;
    if (preference_ids && preference_ids.length > 0) {
      const { preferences: prefsTable } = await import("@/src/db/schema");
      const {
        inArray: inArr,
        eq: eqOp,
        and: andOp,
      } = await import("drizzle-orm");
      const prefRows = await db
        .select({ charge_bdt: prefsTable.charge_bdt })
        .from(prefsTable)
        .where(
          andOp(
            inArr(prefsTable.id, preference_ids),
            eqOp(prefsTable.is_active, true),
          ),
        );
      preferenceSurchargeBdt = prefRows.reduce((s, p) => s + p.charge_bdt, 0);
    }

    // ── Promo processing ──────────────────────────────────────────────
    let promoCodeId: string | null = null;
    let promoDiscountBdt = 0;
    let driverFareBdt = fareBreakdown.total_bdt + preferenceSurchargeBdt;
    let riderPayableBdt = fareBreakdown.total_bdt + preferenceSurchargeBdt;
    let platformSubsidyBdt = 0;

    if (promo_code) {
      // Check staged promo first (from POST /api/promo/redeem)
      const staged = getStagedPromo(user.id);

      if (staged) {
        // Validate staged promo matches this ride's vehicle type context
        // (the staged promo was already validated for zone + vehicle type at redeem time)
        const [promoRow] = await db
          .select()
          .from(promoCodes)
          .where(eq(promoCodes.id, staged.promoCodeId))
          .limit(1);
        if (
          promoRow &&
          promoRow.is_active &&
          promoRow.expires_at > new Date()
        ) {
          // Compute discount
          if (staged.discountType === "percent") {
            promoDiscountBdt = Math.round(
              (fareBreakdown.total_bdt * staged.discountValue) / 100,
            );
          } else {
            promoDiscountBdt = staged.discountValue;
          }
          // Apply max_discount_bdt cap
          if (
            staged.maxDiscountBdt != null &&
            promoDiscountBdt > staged.maxDiscountBdt
          ) {
            promoDiscountBdt = staged.maxDiscountBdt;
          }
          // Don't discount more than the fare
          if (promoDiscountBdt > fareBreakdown.total_bdt) {
            promoDiscountBdt = fareBreakdown.total_bdt;
          }

          promoCodeId = staged.promoCodeId;
          riderPayableBdt = fareBreakdown.total_bdt - promoDiscountBdt;
          platformSubsidyBdt = promoDiscountBdt;

          // Write promo_redemptions row
          await db.insert(promoRedemptions).values({
            promo_code_id: promoCodeId,
            rider_id: user.id,
            ride_id: "00000000-0000-0000-0000-000000000000", // placeholder, updated after ride insert
            discount_type: staged.discountType,
            discount_value: staged.discountValue,
            discounted_amount_bdt: promoDiscountBdt,
            driver_fare_bdt: driverFareBdt,
            rider_payable_bdt: riderPayableBdt,
            platform_subsidy_bdt: platformSubsidyBdt,
          });

          clearStagedPromo(user.id);
          logger.info("[ride/request] promo applied", {
            promoId: promoCodeId,
            discount: promoDiscountBdt,
          });
        }
      }
    }

    // INSERT ride
    const [ride] = await db
      .insert(rides)
      .values({
        user_id: user.id,
        driver_id: null,
        zone_id: zoneId,
        pricing_id: activePricing.id,
        origin_address: pickup_address,
        destination_address: dropoff_address,
        origin_latitude: String(pickup_lat),
        origin_longitude: String(pickup_lng),
        destination_latitude: String(dropoff_lat),
        destination_longitude: String(dropoff_lng),
        vehicle_type: vehicle_type as any,
        status: "pending",
        fare_breakdown: fareBreakdown as any,
        distance_km: String(fareBreakdown.distance_km),
        scheduled_at: scheduled_at ? new Date(scheduled_at) : null,
        promo_code_id: promoCodeId,
        promo_discount_bdt: promoDiscountBdt > 0 ? promoDiscountBdt : 0,
        driver_fare_bdt: driverFareBdt,
        rider_payable_bdt: riderPayableBdt,
        platform_subsidy_bdt:
          platformSubsidyBdt > 0 ? platformSubsidyBdt : null,
        preference_surcharge_bdt: preferenceSurchargeBdt,
        preference_ids: preference_ids ?? [],
      })
      .returning();

    // Update promo_redemptions with actual ride_id
    if (promoCodeId) {
      await db
        .update(promoRedemptions)
        .set({ ride_id: ride.id })
        .where(
          and(
            eq(promoRedemptions.promo_code_id, promoCodeId),
            eq(promoRedemptions.rider_id, user.id),
            eq(
              promoRedemptions.ride_id,
              "00000000-0000-0000-0000-000000000000",
            ),
          ),
        );
    }

    // Dispatch for immediate rides
    if (!scheduled_at) {
      const wsPort = process.env.UTILS_SERVER_PORT ?? "3001";
      const internalSecret = process.env.WEBSOCKET_INTERNAL_SECRET;
      if (internalSecret) {
        const dispatchUrl = `http://127.0.0.1:${wsPort}/internal/dispatch`;
        const dispatchBody = JSON.stringify({
          ride_id: ride.id,
          vehicle_type,
          pickup_lat,
          pickup_lng,
          allow_downgrade,
        });

        let dispatched = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch(dispatchUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${internalSecret}`,
              },
              signal: AbortSignal.timeout(5_000),
              body: dispatchBody,
            });
            if (res.ok) {
              dispatched = true;
              break;
            }
          } catch {
            /* retry */
          }
          if (attempt < 2)
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
        if (!dispatched) {
          logger.error("[ride/request] dispatch failed after 3 retries", {
            ride_id: ride.id,
          });
        }
      }
    }

    return Response.json({
      ride_id: ride.id,
      fare_breakdown: fareBreakdown,
      status: "pending",
    });
  } catch (err: any) {
    if (err.status === 401)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    logger.error("[ride/request] error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
