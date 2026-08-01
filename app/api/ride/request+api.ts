import { db } from "@/src/db";
import {
  users,
  rides,
  pricing,
  promoCodes,
  promoRedemptions,
  zones,
  surgeCurrent,
  rideStops,
} from "@/src/db/schema";
import { eq, and, sql, gte } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { validatePickupZone } from "@/lib/zone";
import { calculateFare, haversineKm } from "@/lib/fareCalc";
import { applySurge } from "@/lib/surge";
import { getAvailableDiscounts } from "@/lib/discountEngine";
import { sendSms } from "@/lib/dprelay";
import { detectOriginCity, isIntercity } from "@/lib/cityBoundary";
import { splitRoute } from "@/lib/routeSplit";
import { getRouteDistance } from "@/lib/barikoi";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";
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
  selected_discount_type: z
    .enum(["intro", "promo", "pass", "wallet", "none"])
    .optional(),
  selected_discount_amount_bdt: z.number().int().nonnegative().optional(),
  preference_ids: z.array(z.string().uuid()).max(10).optional(),
  secondary_rider_name: z.string().min(1).max(255).optional(),
  secondary_rider_phone: z.string().min(1).max(20).optional(),
  upfront_tip_bdt: z.number().int().min(0).max(20000).optional(),
  stops: z.array(z.object({ lat: z.number(), lng: z.number(), address: z.string().min(1).max(500) })).max(2).optional(),
  female_driver_preference: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const uid = supabaseUser.id;

    const [user] = await db
      .select({ id: users.id, role: users.role, total_rides: users.total_rides })
      .from(users)
      .where(eq(users.auth_uid, uid))
      .limit(1);
    if (!user)
      return Response.json({ error: "user_not_found" }, { status: 404 });
    if (user.role !== "rider")
      return Response.json({ error: "forbidden" }, { status: 403 });

    // M2: Advisory lock prevents concurrent ride creation for the same user
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ride_request_' || ${user.id}))`);

    const parsed = await parseJsonBody(request, requestSchema);
    if (!parsed.ok) return parsed.response;

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
       selected_discount_type,
       selected_discount_amount_bdt,
       preference_ids,
      secondary_rider_name,
      secondary_rider_phone,
      upfront_tip_bdt,
      stops,
      female_driver_preference,
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
    let totalDistanceKm =
      route?.distanceKm ??
      haversineKm(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng);

    // ── Multi-leg distance when stops are provided ──────────────────────
    if (stops && stops.length > 0) {
      const waypoints = [
        { lat: pickup_lat, lng: pickup_lng },
        ...stops,
        { lat: dropoff_lat, lng: dropoff_lng },
      ];
      let multiLegKm = 0;
      for (let i = 0; i < waypoints.length - 1; i++) {
        multiLegKm += haversineKm(waypoints[i].lat, waypoints[i].lng, waypoints[i + 1].lat, waypoints[i + 1].lng);
      }
      totalDistanceKm = multiLegKm;
    }

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

    // ── Surge pricing — look up active zone's multiplier ────────────────
    const [activeZone] = await db
      .select({ id: zones.id })
      .from(zones)
      .where(eq(zones.is_active, true))
      .limit(1);
    let surgeMultiplier = 1.0;
    if (activeZone) {
      const [sr] = await db
        .select()
        .from(surgeCurrent)
        .where(eq(surgeCurrent.zone_id, activeZone.id))
        .limit(1);
      if (sr && Date.now() - new Date(sr.updated_at).getTime() < 300_000)
        surgeMultiplier = Number(sr.multiplier);
    }
    const surge = applySurge(Number(fareBreakdown.total_bdt), surgeMultiplier);
    fareBreakdown.total_bdt = surge.totalWithSurge;
    fareBreakdown.surge_multiplier = surge.multiplier;
    fareBreakdown.surge_fee_bdt = surge.surgeFeeBdt;
    const commPct = Number(activePricing.platform_commission_percent ?? 0);
    if (commPct > 0) {
      fareBreakdown.platform_commission_bdt = Math.floor(fareBreakdown.total_bdt * commPct / 100);
      fareBreakdown.driver_net_bdt = fareBreakdown.total_bdt - fareBreakdown.platform_commission_bdt;
    }

    // ── Available discounts (calculated AFTER surge on the surged total) ──
    const availableDiscounts = await getAvailableDiscounts({
      riderId: user.id,
      totalRides: user.total_rides ?? 0,
      surgedTotalBdt: fareBreakdown.total_bdt,
      zoneId,
    });

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

    // ── Validate and lock selected discount ──────────────────────────────
    const discountType = selected_discount_type ?? "none";
    const discountAmount = selected_discount_amount_bdt ?? 0;
    let appliedDiscountType: "intro" | "promo" | "pass" | "wallet" | "none" = "none";
    let appliedDiscountBdt = 0;
    let walletRedeemedBdt = 0;
    let platformSubsidyBdt = 0;
    let promoCodeId: string | null = null;

    if (discountType !== "none" && discountAmount > 0) {
      const match = availableDiscounts.find(
        (d) =>
          d.type === discountType &&
          d.amount_bdt === discountAmount,
      );
      if (!match) {
        return Response.json(
          {
            error: "discount_mismatch",
            message:
              "Selected discount is no longer valid. Please re-estimate.",
          },
          { status: 409 },
        );
      }

      appliedDiscountType = discountType;
      appliedDiscountBdt = discountAmount;

      if (discountType === "wallet") {
        walletRedeemedBdt = discountAmount;
      } else {
        platformSubsidyBdt = discountAmount;
      }

      // Consume staged promo if the rider selected the promo option
      if (discountType === "promo") {
        const staged = getStagedPromo(user.id);
        if (staged) {
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
            promoCodeId = staged.promoCodeId;
            await db.insert(promoRedemptions).values({
              promo_code_id: promoCodeId,
              rider_id: user.id,
              ride_id: "00000000-0000-0000-0000-000000000000",
              discount_type: staged.discountType as any,
              discount_value: staged.discountValue,
              discounted_amount_bdt: appliedDiscountBdt,
              driver_fare_bdt: fareBreakdown.total_bdt + preferenceSurchargeBdt,
              rider_payable_bdt: fareBreakdown.total_bdt + preferenceSurchargeBdt - appliedDiscountBdt,
              platform_subsidy_bdt: platformSubsidyBdt,
            });
            clearStagedPromo(user.id);
            logger.info("[ride/request] promo applied", {
              promoId: promoCodeId,
              discount: appliedDiscountBdt,
            });
          }
        }
      }
    }

    // ── Finalize amounts (driver gets FULL fare, rider pays discounted) ───
    let driverFareBdt = fareBreakdown.total_bdt + preferenceSurchargeBdt;
    let riderPayableBdt = fareBreakdown.total_bdt + preferenceSurchargeBdt - appliedDiscountBdt;

    // Upfront tip (100% to driver, not subject to commission)
    if (upfront_tip_bdt && upfront_tip_bdt > 0) {
      driverFareBdt += upfront_tip_bdt;
      riderPayableBdt += upfront_tip_bdt;
    }

    let rideId = "";
    await db.transaction(async (tx) => {
      const [ride] = await tx
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
           promo_discount_bdt: appliedDiscountBdt,
           applied_discount_type: appliedDiscountType,
           applied_discount_bdt: appliedDiscountBdt,
           wallet_redeemed_bdt: walletRedeemedBdt,
           driver_fare_bdt: driverFareBdt,
          rider_payable_bdt: riderPayableBdt,
          platform_subsidy_bdt:
            platformSubsidyBdt > 0 ? platformSubsidyBdt : null,
          preference_surcharge_bdt: preferenceSurchargeBdt,
          preference_ids: preference_ids ?? [],
          surge_multiplier: surgeMultiplier.toString(),
          surge_zone_id: activeZone?.id,
          secondary_rider_name: secondary_rider_name || null,
          secondary_rider_phone: secondary_rider_phone || null,
          is_booked_for_someone_else: !!(secondary_rider_phone || secondary_rider_name),
          upfront_tip_bdt: upfront_tip_bdt ?? 0,
          female_driver_preference: female_driver_preference ?? false,
        })
        .returning();

      if (!ride) {
        throw new Error('ride_insert_failed');
      }
      rideId = ride.id;

      if (stops && stops.length > 0) {
        await tx.insert(rideStops).values(
          stops.map((stop: { lat: number; lng: number; address: string }, i: number) => ({
            ride_id: ride.id,
            stop_order: i + 1,
            lat: stop.lat.toString(),
            lng: stop.lng.toString(),
            address: stop.address,
          }))
        );
      }

      if (promoCodeId) {
        await tx
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
    });

    // ── SMS to secondary rider (non-blocking) ────────────────────────
    if (secondary_rider_phone) {
      try {
        const trackingUrl = `${process.env.EXPO_PUBLIC_SERVER_URL ?? ""}/track/${rideId}`;
        await sendSms(
          secondary_rider_phone,
          `Your ride has been booked on Ride. Track it here: ${trackingUrl}`,
        );
        logger.info("[ride/request] SMS sent to secondary rider", { rideId: rideId });
      } catch (smsErr) {
        logger.warn("[ride/request] SMS to secondary rider failed (non-blocking)", smsErr);
      }
    }

    // Dispatch for immediate rides
    if (!scheduled_at) {
      const wsPort = process.env.UTILS_SERVER_PORT ?? "3001";
      const internalSecret = process.env.WEBSOCKET_INTERNAL_SECRET;
      if (internalSecret) {
        const dispatchUrl = `http://127.0.0.1:${wsPort}/internal/dispatch`;
        const dispatchBody = JSON.stringify({
          ride_id: rideId,
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
            ride_id: rideId,
          });
        }
      }
    }

    return Response.json({
      ride_id: rideId,
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
