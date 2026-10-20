import { db } from "@/src/db";
import { drivers, users, rateLimits } from "@/src/db/schema";
import { eq, and, inArray, sql, gte } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";
import { getH3Ring } from "@/lib/h3";
import { haversineDistance } from "@/utils/mapUtils";
import { VEHICLE_TYPE_ZOD_ENUM } from "@/lib/vehicleTypes";
import { logger } from "@/lib/logger";
import { BIKE_FAMILY } from "@/lib/vehicleTypes";
import { getPlan05Bool } from "@/lib/platformConfig";
import { isDriverEligibleForRideGender } from "@/lib/womenOnlyEligibility";

// K deliberately mirrors DISPATCH_H3_RING_K so the rider-facing count matches
// what the dispatch pool can actually find (doc 02 rejected a smaller K on
// parity grounds). Cost accepted knowingly: at K=60 the ring is ~11k cells
// shipped as an inArray against drivers.h3_cell_res9 — index-backed by
// drivers_h3_cell_idx (live since migration 0000), so each 5s poll is a
// bounded index scan, not a seq scan. Revisit only if per-poll latency or DB
// load shows up in monitoring.
const NEARBY_RING_K = parseInt(process.env.DISPATCH_H3_RING_K ?? "60", 10);

/**
 * S8 §4.5 anti-triangulation bucket for women_only supply counts.
 * Returns the coarsest bucket ceiling for `n`, never the true count.
 */
function bucketCount(n: number): number {
  if (n === 0) return 0;
  if (n <= 3) return 3;
  if (n <= 9) return 5;
  return 10;
}

/**
 * S8 §4.5 coarse wait band: 5-minute buckets, ceilinged.
 */
function coarseWaitMinutes(raw: number | null): number | null {
  if (raw == null) return null;
  return Math.max(2, Math.ceil(raw / 5) * 5);
}

const RATE_LIMIT_KEY_PREFIX = "nearby_women_only:";
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 5 * 60_000;

/**
 * Distributed rate limit keyed per authenticated rider. Uses the
 * `rate_limits` table as a per-window counter: one row per
 * `(key, window_start)`; a new window is started on overflow. Returns true
 * when the request is allowed.
 */
async function allowRateLimited(
  key: string,
): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);
  const [window] = await db
    .select({ existing: rateLimits.window_start, count: rateLimits.count })
    .from(rateLimits)
    .where(
      and(
        eq(rateLimits.key, key),
        gte(rateLimits.window_start, windowStart),
      ),
    )
    .limit(1);
  const current = window?.count ?? 0;
  if (current >= RATE_LIMIT_MAX) return false;
  if (window?.existing != null) {
    await db
      .update(rateLimits)
      .set({ count: current + 1 })
      .where(
        and(
          eq(rateLimits.key, key),
          eq(rateLimits.window_start, window.existing),
        ),
      );
  } else {
    await db.insert(rateLimits).values({
      key,
      window_start: now,
      count: 1,
    });
  }
  return true;
}


const bodySchema = z.object({
  pickup_lat: z.number().min(-90).max(90),
  pickup_lng: z.number().min(-180).max(180),
  vehicle_type: VEHICLE_TYPE_ZOD_ENUM,
  // S8 §4.5: women_only request (optional). When true, the endpoint is the
  // authenticated women-only supply oracle: gated, predicate-filtered,
  // bucketed, and rate-limited. When false/absent, it behaves like today.
  women_only: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if (!parsed.ok) return parsed.response;

    const { pickup_lat, pickup_lng, vehicle_type, women_only } = parsed.data;

    // S8 §4.5: this endpoint is authenticated — the women-only oracle must
    // never be scannable by an uncoordinated third party.
    let supabaseUser;
    try {
      supabaseUser = await verifySupabaseToken(request);
    } catch (e: unknown) {
      const status = e instanceof Error ? (e as { status?: number }).status : undefined;
      return Response.json(
        { error: "unauthorized", message: "Invalid token" },
        { status: status ?? 401 },
      );
    }

    // S8 §4.5: the authenticated women-only oracle gates. Config reads and
    // the user-gender lookup are LAZY — a plain (non-women-only) poll needs
    // neither, keeping the 5s rider poll at exactly one query.
    let killSwitchEnabled = false;
    if (women_only) {
      killSwitchEnabled = await getPlan05Bool("women_only_rides_enabled");
      if (!killSwitchEnabled) {
        return Response.json(
          { error: "women_only_disabled", message: "Women-only rides are currently unavailable" },
          { status: 403 },
        );
      }
      if (!BIKE_FAMILY.includes(vehicle_type)) {
        return Response.json(
          { error: "women_only_bike_only", message: "Women-only rides apply to bike rides only" },
          { status: 400 },
        );
      }

      const userRows = await db
        .select({ id: users.id, gender: users.gender })
        .from(users)
        .where(eq(users.auth_uid, supabaseUser.id))
        .limit(1);
      if (!userRows || userRows.length === 0) {
        return Response.json({ error: "user_not_found", message: "User not found" }, { status: 404 });
      }
      if (userRows[0].gender !== "female") {
        return Response.json(
          { error: "women_only_not_eligible", message: "Women-only rides are only available to female users" },
          { status: 403 },
        );
      }

      // S8 §4.5: distributed rate limit on the women-only oracle (20 req /
      // 5 min per rider, via the rate_limits table → 429).
      const rateKey = `${RATE_LIMIT_KEY_PREFIX}${userRows[0].id}`;
      if (!(await allowRateLimited(rateKey))) {
        return Response.json(
          { error: "rate_limited", message: "Too many nearby requests. Please wait a moment." },
          { status: 429 },
        );
      }
    }

    // Scooter supply gate — a scooter request with the feature disabled
    // returns the prescribed 400 (no silent fallback, no supply leak).
    if (vehicle_type === "scooter" && !(await getPlan05Bool("scooter_vehicle_type_enabled"))) {
      return Response.json(
        { error: "scooter_disabled", message: "Scooter rides are currently unavailable" },
        { status: 400 },
      );
    }

    try {
      // Kill switch for the shared predicate on the plain path (armed female
      // drivers self-exclude from mixed bike rides while it is ON — same
      // semantics as utils-server/dispatch.ts so the count matches dispatch).
      if (!women_only) {
        killSwitchEnabled = await getPlan05Bool("women_only_rides_enabled");
      }
      const cells = getH3Ring(pickup_lat, pickup_lng, NEARBY_RING_K);
      const rows = await db
        .select({
          id: drivers.id,
          lat: drivers.last_location_lat,
          lng: drivers.last_location_lng,
          gender: drivers.gender,
          gender_verified: drivers.gender_verified,
          women_only_enabled: drivers.women_only_enabled,
          on_break: drivers.on_break,
        })
        .from(drivers)
        .where(
          and(
            eq(drivers.is_online, true),
            eq(drivers.status, "active"),
            eq(drivers.vehicle_type, vehicle_type as never),
            eq(drivers.on_break, false),
            inArray(drivers.h3_cell_res9, cells),
            sql`NOT EXISTS (SELECT 1 FROM rides WHERE rides.driver_id = drivers.id AND rides.status IN ('matched','driver_arriving','driver_arrived','in_progress') AND rides.updated_at > now() - interval '3 hours')`,
          ),
        );

      // S8 §4.5: shared predicate — zero logic drift from dispatch.
      const eligible = rows.filter((r) =>
        isDriverEligibleForRideGender({
          driverGender: r.gender,
          driverGenderVerified: r.gender_verified,
          driverWomenOnlyEnabled: r.women_only_enabled,
          // zod .optional().default() infers boolean | undefined — narrow at the use site
          rideWomenOnly: women_only === true,
          vehicleType: vehicle_type as never,
          womenOnlyFeatureEnabled: killSwitchEnabled,
        }),
      );

      // Anti-triangulation (S8 §4.5): the WOMEN-ONLY oracle never returns a
      // true count or a precise wait — bucketed count (0/3/5/10) and 5-min
      // coarse wait bands only. The plain path keeps the exact count and the
      // exact wait (pinned by tests/api/ride/nearby.test.ts).
      const count = women_only ? bucketCount(eligible.length) : eligible.length;
      const dists = eligible
        .map((r) =>
          r.lat != null && r.lng != null
            ? haversineDistance(pickup_lat, pickup_lng, Number(r.lat), Number(r.lng))
            : Infinity,
        )
        .filter((d) => Number.isFinite(d));
      const waitRaw =
        dists.length === 0 ? null : Math.max(2, Math.round((Math.min(...dists) / 15) * 60));

      return Response.json({
        count,
        estimated_wait_minutes: women_only ? coarseWaitMinutes(waitRaw) : waitRaw,
        // S8 §4.5: only the bucketed public shape on the oracle path. Never
        // the true count and never a per-driver projection.
        _women_only_bucketed: women_only,
      });
    } catch {
      return Response.json(
        { error: "nearby_failed", message: "Could not query nearby drivers" },
        { status: 500 },
      );
    }
  } catch (err: unknown) {
    logger.error("[ride/nearby-drivers] error", err);
    return Response.json({ error: "internal_error", message: "Unexpected error" }, { status: 500 });
  }
}

