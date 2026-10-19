/**
 * P2P parcel origination (plan 27 §6.1 — "the SAME flow, originated by ANY
 * ROLE, never the retired route").
 *
 * POST /api/delivery/parcels — sender enters pickup, dropoff, item note (+
 * receiver phone). Creates ONE `deliveries` leg with source_vertical='parcel'
 * and status='created'; the S6 sequential dispatch tick (Arm 2b) picks it up
 * exactly like a shop leg. No bidding, no courier selection — ranking is
 * nearest-first across delivery men + toggle-ON drivers.
 *
 * Storage notes (migration 0080):
 *   - order_id carries the parcel's own consignment uuid (fresh
 *     crypto.randomUUID): there is NO parent row — delivery_requests is
 *     retired (B5-1) and the polymorphic parent is shop_orders only.
 *   - dropoff_user_id is the SENDING customer: they track the parcel and
 *     receive its `delivery:status` pushes (same slot the ordering customer
 *     occupies on shop legs; exhaustDeliveryLeg already notifies this slot
 *     in sender language for non-shop legs).
 *   - pickup_shop_id stays NULL (no shop); the fee is quoted on the SAME
 *     ৳80/120 distance tiers as shop legs (owner default 2026-10-12) and
 *     SNAPSHOT onto the leg — cash-collected by the receiver on delivery,
 *     payments descoped.
 *
 * Idempotency: wired on IDEMPOTENCY_ROUTES.parcelCreate (claim → execute →
 * store, typed failures stored) — a retried submit replays instead of
 * minting a second parcel that would dispatch a second courier.
 *
 * GET /api/delivery/parcels — the caller's own parcel legs (sender-scoped),
 * newest first. History for the retired bidding requests stays on
 * GET /api/delivery/requests.
 */
import { db } from "@/src/db";
import { deliveries } from "@/src/db/schema";
import { requireMemberRoles } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { quoteDeliveryFee } from "@/lib/shopDeliveryFee";
import {
  IDEMPOTENCY_ROUTES,
  beginIdempotencyClaim,
  extractIdempotencyKey,
  sha256Fingerprint,
  storeIdempotencyOutcome,
} from "@/lib/idempotency";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";

const parcelSchema = z.object({
  pickup_address: z.string().min(3).max(500),
  pickup_lat: z.number().min(-90).max(90),
  pickup_lng: z.number().min(-180).max(180),
  dropoff_address: z.string().min(3).max(500),
  dropoff_lat: z.number().min(-90).max(90),
  dropoff_lng: z.number().min(-180).max(180),
  item_note: z.string().min(1).max(300),
  receiver_phone: z.string().min(6).max(20),
});

export async function POST(request: Request) {
  let idempotencyKey: string | null = null;
  try {
    const { dbUser } = await requireMemberRoles(["rider", "driver"])(request);

    // Raw body captured BEFORE parseJsonBody consumes the stream (the
    // idempotency fingerprint); Zod runs on a re-parse — same pattern as
    // shop/orders and package/purchase.
    const rawBody: string = await request.text();
    const bodyForParse = new Request("http://internal/parse", {
      method: "POST",
      body: rawBody,
      headers: { "content-type": "application/json" },
    });
    const result = await parseJsonBody(bodyForParse, parcelSchema);
    if (!result.ok) return result.response;
    const body = result.data;

    idempotencyKey = extractIdempotencyKey(request);
    if (idempotencyKey) {
      const claim = await beginIdempotencyClaim({
        route: IDEMPOTENCY_ROUTES.parcelCreate,
        key: idempotencyKey,
        userId: dbUser.id,
        requestFingerprint: sha256Fingerprint("POST", rawBody),
      });
      if (claim.kind !== "execute") return claim.response;
    }

    // Same tiers as shop legs (owner default): pickup→dropoff haversine
    // against the tier radius; snapshot — mid-flight admin edits never
    // change a placed parcel.
    const quote = await quoteDeliveryFee({
      shopLat: body.pickup_lat,
      shopLng: body.pickup_lng,
      dropLat: body.dropoff_lat,
      dropLng: body.dropoff_lng,
    });

    const parcelId = crypto.randomUUID();
    const [leg] = await db
      .insert(deliveries)
      .values({
        source_vertical: "parcel",
        order_id: parcelId,
        pickup_shop_id: null,
        pickup_address: body.pickup_address,
        pickup_lat: String(body.pickup_lat),
        pickup_lng: String(body.pickup_lng),
        dropoff_address: body.dropoff_address,
        dropoff_lat: String(body.dropoff_lat),
        dropoff_lng: String(body.dropoff_lng),
        dropoff_user_id: dbUser.id,
        delivery_fee_bdt: quote.fee_bdt,
        status: "created",
        item_note: body.item_note,
        receiver_phone: body.receiver_phone,
      })
      .returning({ id: deliveries.id });

    if (!leg) {
      throw Object.assign(new Error("Parcel leg insert returned no row"), {
        status: 500,
      });
    }

    const successResponse = Response.json(
      {
        parcel_id: parcelId,
        leg_id: leg.id,
        delivery_fee_bdt: quote.fee_bdt,
        distance_km: quote.distance_km,
        fee_tier: quote.tier,
        status: "created",
        message: "Parcel placed — a courier will be assigned shortly",
      },
      { status: 201 },
    );
    if (idempotencyKey) {
      await storeIdempotencyOutcome(
        { route: IDEMPOTENCY_ROUTES.parcelCreate, key: idempotencyKey },
        successResponse,
      );
    }
    return successResponse;
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    let errorResponse: Response;
    if (status === 401)
      errorResponse = Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    else if (status === 403)
      errorResponse = Response.json(
        { error: "forbidden", message: "Not authorized" },
        { status: 403 },
      );
    else {
      logger.error("[delivery/parcels POST] error", err);
      errorResponse = Response.json(
        { error: "internal_error", message: "An internal server error occurred" },
        { status: 500 },
      );
    }
    // The typed failure is stored so a retry with the same key replays it
    // instead of re-entering the flow.
    if (idempotencyKey) {
      await storeIdempotencyOutcome(
        { route: IDEMPOTENCY_ROUTES.parcelCreate, key: idempotencyKey },
        errorResponse,
      );
    }
    return errorResponse;
  }
}

export async function GET(request: Request) {
  try {
    const { dbUser } = await requireMemberRoles(["rider", "driver"])(request);

    const rows = await db
      .select({
        leg_id: deliveries.id,
        parcel_id: deliveries.order_id,
        status: deliveries.status,
        pickup_address: deliveries.pickup_address,
        dropoff_address: deliveries.dropoff_address,
        delivery_fee_bdt: deliveries.delivery_fee_bdt,
        item_note: deliveries.item_note,
        receiver_phone: deliveries.receiver_phone,
        courier_user_id: deliveries.delivery_man_user_id,
        created_at: deliveries.created_at,
      })
      .from(deliveries)
      .where(
        and(
          eq(deliveries.dropoff_user_id, dbUser.id),
          eq(deliveries.source_vertical, "parcel"),
        ),
      )
      .orderBy(desc(deliveries.created_at))
      .limit(50);

    return Response.json({ parcels: rows });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json(
        { error: "forbidden", message: "Not authorized" },
        { status: 403 },
      );
    logger.error("[delivery/parcels GET] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
