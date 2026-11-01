/**
 * POST /api/fleet/drivers/[id]/remove?fleet_id=...
 *
 * Remove a driver from a fleet (ISSUE-36 / Plan 27 §4.4 / fleet-exit-dues-gate-spec.md).
 * Enforces the dues gate (BD-1..3):
 *   - driver wallet debt < 0 blocks removal
 *   - in-flight ride blocks removal
 *   - platform admin can override the block (audited in audit_logs)
 */
import { db } from "@/src/db";
import { z } from "zod";
import { requireFleetMember } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { removeDriverFromFleet, FleetExitError } from "@/lib/fleetAssignment";
import { roleHasPermission } from "@/lib/adminRbac";

const querySchema = z.object({
  fleet_id: z.string().uuid(),
});

const bodySchema = z
  .object({
    admin_override: z.boolean().optional(),
    admin_override_reason: z.string().min(3).max(500).optional(),
  })
  .optional();

export async function POST(
  request: Request,
  { id }: { id: string },
) {
  try {
    const idParsed = z.string().uuid().safeParse(id);
    if (!idParsed.success) {
      return Response.json(
        { error: "invalid_uuid", message: "Valid driver id required" },
        { status: 400 },
      );
    }
    const driverId = idParsed.data;

    const url = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      fleet_id: url.searchParams.get("fleet_id"),
    });
    if (!parsedQuery.success) {
      return Response.json(
        { error: "invalid_param", message: "Valid fleet_id required" },
        { status: 400 },
      );
    }
    const fleetId = parsedQuery.data.fleet_id;

    const auth = await requireFleetMember(fleetId, ["OWNER", "MANAGER"])(request);

    let adminOverride = false;
    let adminOverrideReason: string | undefined;

    try {
      const text = await request.text();
      if (text.trim().length > 0) {
        const json = JSON.parse(text);
        const parsedBody = bodySchema.safeParse(json);
        if (!parsedBody.success) {
          return Response.json(
            { error: "validation_error", message: "Invalid request body" },
            { status: 400 },
          );
        }
        if (parsedBody.data?.admin_override) {
          // BD-2: Platform admin only, audited.
          if (!roleHasPermission(auth.dbUser.role, "staff.manage")) {
            return Response.json(
              {
                error: "forbidden",
                message: "Only platform administrators can override the dues gate",
              },
              { status: 403 },
            );
          }
          adminOverride = true;
          adminOverrideReason = parsedBody.data.admin_override_reason;
        }
      }
    } catch {
      return Response.json(
        { error: "invalid_json", message: "Invalid JSON in request body" },
        { status: 400 },
      );
    }

    const result = await db.transaction(async (tx) => {
      return removeDriverFromFleet(tx, {
        driver_id: driverId,
        fleet_id: fleetId,
        actor_user_id: auth.dbUser.id,
        admin_override: adminOverride,
        admin_override_reason: adminOverrideReason,
      });
    });

    return Response.json(result, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof FleetExitError) {
      if (err.code === "driver_not_found" || err.code === "driver_not_in_fleet") {
        return Response.json(
          { error: err.code, message: err.message },
          { status: 404 },
        );
      }
      return Response.json(
        {
          error: err.code,
          message: err.message,
          details: err.details,
        },
        { status: 409 },
      );
    }

    const status = errors.getErrorStatus(err);
    if (status !== undefined) {
      const routeCode = (err as { errorCode?: string }).errorCode;
      const code =
        routeCode ??
        (status === 401
          ? "unauthorized"
          : status === 403
            ? "forbidden"
            : "internal_error");
      return Response.json(
        { error: code, message: errors.getErrorMessage(err) },
        { status },
      );
    }

    logger.error("[fleet/drivers/[id]/remove] POST error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
