/**
 * emergencyChain.ts — emergency ambulance chain (Phase 6, spec §B.5/§C.6).
 *
 * Own chain, NO bidding. First-accept-wins: conditional UPDATE
 * WHERE status='broadcasting' inside a §B.0 tx (with the F37 drivers-row
 * FOR UPDATE lock — cert holders are drivers). WS is notification-only;
 * REST is canonical (F25).
 *
 * F41: broadcast payloads carry NO patient free-text — service_level,
 * requires_paramedic, pickup only. patient_condition is winner/caller-only.
 */
import { db } from '../src/db';
import type { DbClient } from './tx';
import {
  emergencyRequests,
  ambulanceCertifications,
  drivers,
  vehicles,
  users,
  awardedBidAssignments,
  rentalRequests,
  deliveryLegs,
} from '../src/db/schema';
import { eq, and, lt, inArray, notInArray, ne, isNull } from 'drizzle-orm';
import { logger } from '../lib/logger';
import { emergencySendToUser } from './emergencyBus';
import { sendNotification } from '../lib/notify';
import { getEligibleEmergencyDriverUserIds } from '../lib/ambulanceCerts';

/** §B.5 transition table. 'failed' is SYSTEM-only (TTL sweep) from broadcasting. */
export const EMERGENCY_TRANSITIONS: Record<string, string[]> = {
  broadcasting: ["assigned", "cancelled", "failed"],
  assigned: ["en_route_pickup", "cancelled"],
  en_route_pickup: ["arrived", "cancelled"],
  arrived: ["en_route_dropoff", "cancelled"],
  en_route_dropoff: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  failed: [],
};

/** States that block a driver from taking NEW commitments (§B.7). */
export const EMERGENCY_ACTIVE_STATES = [
  "assigned",
  "en_route_pickup",
  "arrived",
  "en_route_dropoff",
] as const;

const STATUS_STAMPS: Record<string, string> = {
  assigned: "accepted_at",
  en_route_pickup: "en_route_pickup_at",
  arrived: "arrived_at",
  en_route_dropoff: "en_route_dropoff_at",
  completed: "completed_at",
  cancelled: "cancelled_at",
};

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status, message });
}

/**
 * §B.7 helper: does this user hold an ACTIVE emergency commitment?
 * (accepted an emergency whose status is not terminal)
 */
export async function driverHasActiveEmergency(driverUserId: string, excludeRequestId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: emergencyRequests.id })
    .from(emergencyRequests)
    .innerJoin(
      ambulanceCertifications,
      eq(emergencyRequests.accepted_cert_id, ambulanceCertifications.id),
    )
    .where(
      and(
        eq(ambulanceCertifications.user_id, driverUserId),
        notInArray(emergencyRequests.status, ["completed", "cancelled", "failed"]),
        excludeRequestId ? ne(emergencyRequests.id, excludeRequestId) : undefined,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * First-accept-wins accept (§B.0 + §B.5 + §B.7). Caller must already have
 * passed requireAmbulanceCertified — certId comes from that guard.
 */
export async function acceptEmergencyRequest(
  requestId: string,
  certId: string,
  driverUserId: string,
): Promise<Record<string, unknown>> {
  const updated = await db.transaction(async (tx) => {
    const [req] = await tx
      .select()
      .from(emergencyRequests)
      .where(eq(emergencyRequests.id, requestId))
      .for("update");

    if (!req) throw httpError(404, "Emergency request not found");
    if (new Date(req.expires_at) <= new Date()) {
      throw httpError(409, "Emergency request has expired");
    }
    if (req.status !== "broadcasting") {
      throw httpError(409, `Request is ${req.status}, not broadcasting`);
    }

    // §B.7 + F37: lock the drivers row (common serialization point)
    const [lockedDriver] = await tx
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, driverUserId))
      .for("update");
    if (!lockedDriver) throw httpError(403, "Active driver account required");

    // §B.7: no active rental assignment (parent status filters terminal)
    const [activeRental] = await tx
      .select({ id: awardedBidAssignments.id })
      .from(awardedBidAssignments)
      .innerJoin(rentalRequests, eq(awardedBidAssignments.request_id, rentalRequests.id))
      .where(
        and(
          eq(awardedBidAssignments.assigned_driver_user_id, driverUserId),
          isNull(awardedBidAssignments.released_at),
          inArray(rentalRequests.status, ["awarded", "confirmed"]),
        ),
      )
      .limit(1);
    if (activeRental) throw httpError(409, "driver_already_committed");

    // §B.7: no active delivery leg
    const [activeLeg] = await tx
      .select({ id: deliveryLegs.id })
      .from(deliveryLegs)
      .where(
        and(
          eq(deliveryLegs.courier_user_id, driverUserId),
          inArray(deliveryLegs.leg_state, ["pending", "assigned", "picked_up", "in_transit"]),
        ),
      )
      .limit(1);
    if (activeLeg) throw httpError(409, "driver_already_committed");

    // §B.7: no other active emergency
    const [activeEmergency] = await tx
      .select({ id: emergencyRequests.id })
      .from(emergencyRequests)
      .innerJoin(
        ambulanceCertifications,
        eq(emergencyRequests.accepted_cert_id, ambulanceCertifications.id),
      )
      .where(
        and(
          eq(ambulanceCertifications.user_id, driverUserId),
          inArray(emergencyRequests.status, EMERGENCY_ACTIVE_STATES),
          ne(emergencyRequests.id, requestId),
        ),
      )
      .limit(1);
    if (activeEmergency) throw httpError(409, "driver_already_committed");

    // First-accept-wins: conditional UPDATE (loses the race → 0 rows)
    const [updatedRow] = await tx
      .update(emergencyRequests)
      .set({
        status: "assigned",
        accepted_cert_id: certId,
        accepted_at: new Date(),
        updated_at: new Date(),
      })
      .where(
        and(eq(emergencyRequests.id, requestId), eq(emergencyRequests.status, "broadcasting")),
      )
      .returning();

    if (!updatedRow) throw httpError(409, "concurrent_transition");
    return updatedRow;
  });

  await emitAssigned(updated as Record<string, unknown>);
  return updated as Record<string, unknown>;
}

/**
 * §B.5 driver status transition (assigned driver only; 'failed' is
 * system-only and rejected here).
 */
export async function transitionEmergencyRequest(
  requestId: string,
  driverUserId: string,
  newStatus: string,
): Promise<Record<string, unknown>> {
  return db.transaction(async (tx) => {
    const [req] = await tx
      .select()
      .from(emergencyRequests)
      .where(eq(emergencyRequests.id, requestId))
      .for("update");

    if (!req) throw httpError(404, "Emergency request not found");

    // Assigned driver only ('failed' is SYSTEM-only per §B.5)
    let requesterIsAssignee = false;
    if (req.accepted_cert_id) {
      const [cert] = await tx
        .select({ user_id: ambulanceCertifications.user_id })
        .from(ambulanceCertifications)
        .where(eq(ambulanceCertifications.id, req.accepted_cert_id))
        .limit(1);
      requesterIsAssignee = cert?.user_id === driverUserId;
    }
    if (!requesterIsAssignee) throw httpError(403, "Only the assigned driver can update status");

    if (!EMERGENCY_TRANSITIONS[req.status]?.includes(newStatus)) {
      throw httpError(409, `invalid_transition: ${req.status} → ${newStatus}`);
    }

    const stampCol = STATUS_STAMPS[newStatus];
    const updates: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date(),
      ...(stampCol ? { [stampCol]: new Date() } : {}),
    };

    const [updatedRow] = await tx
      .update(emergencyRequests)
      .set(updates)
      .where(eq(emergencyRequests.id, requestId))
      .returning();

    return updatedRow as Record<string, unknown>;
  }).then((updatedRow) => {
    // N14: WS relay AFTER commit — an emit inside the tx callback fires even
    // when the transaction later rolls back (phantom notification to caller).
    // A relay failure must not fail the already-committed transition.
    try {
      emergencySendToUser((updatedRow as { caller_user_id: string }).caller_user_id, {
        type: "emergency:status",
        request_id: requestId,
        status: newStatus,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn("[emergencyChain] status relay failed", { request_id: requestId, err });
    }
    return updatedRow;
  });
}

/**
 * Caller-or-assignee cancel (§B.5: any non-terminal → cancelled).
 */
export async function cancelEmergencyRequest(
  requestId: string,
  userId: string,
  reason?: string,
): Promise<Record<string, unknown>> {
  return db.transaction(async (tx) => {
    const [req] = await tx
      .select()
      .from(emergencyRequests)
      .where(eq(emergencyRequests.id, requestId))
      .for("update");

    if (!req) throw httpError(404, "Emergency request not found");

    let isAssignee = false;
    if (req.accepted_cert_id) {
      const [cert] = await tx
        .select({ user_id: ambulanceCertifications.user_id })
        .from(ambulanceCertifications)
        .where(eq(ambulanceCertifications.id, req.accepted_cert_id))
        .limit(1);
      isAssignee = cert?.user_id === userId;
    }

    if (req.caller_user_id !== userId && !isAssignee) {
      throw httpError(403, "Only the caller or the assigned driver can cancel");
    }

    if (["completed", "cancelled", "failed"].includes(req.status)) {
      throw httpError(409, `invalid_transition: ${req.status} is terminal`);
    }

    const [updatedRow] = await tx
      .update(emergencyRequests)
      .set({
        status: "cancelled",
        cancelled_at: new Date(),
        cancel_reason: reason ?? null,
        updated_at: new Date(),
      })
      .where(eq(emergencyRequests.id, requestId))
      .returning();

    if (isAssignee && req.accepted_cert_id) {
      // Notify the other party
      const [cert] = await tx
        .select({ user_id: ambulanceCertifications.user_id })
        .from(ambulanceCertifications)
        .where(eq(ambulanceCertifications.id, req.accepted_cert_id))
        .limit(1);
      if (cert && cert.user_id !== userId) {
        emergencySendToUser(cert.user_id, {
          type: "emergency:cancel",
          request_id: requestId,
          reason: reason ?? null,
        });
      }
    }

    return updatedRow as Record<string, unknown>;
  });
}

/**
 * Job 53 — TTL sweep: broadcasting + expires_at < now() → failed (§B.5
 * system transition). Returns rows swept.
 */
export async function sweepExpiredEmergencies(tx: DbClient = db): Promise<number> {
  const swept = await tx
    .update(emergencyRequests)
    .set({ status: "failed", failure_reason: "ttl_expired", updated_at: new Date() })
    .where(
      and(
        eq(emergencyRequests.status, "broadcasting"),
        lt(emergencyRequests.expires_at, new Date()),
      ),
    )
    .returning({ id: emergencyRequests.id });
  return swept.length;
}

/**
 * §D.2.1 broadcast — F41 payload: NO patient_condition. Eligible = verified
 * cert, service_level covers, online, not on break, within k-ring.
 */
export async function broadcastEmergencyNewRequest(req: {
  id: string;
  pickup_address: string;
  pickup_lat: string | number;
  pickup_lng: string | number;
  service_level: string | null;
  requires_paramedic: boolean;
  expires_at: Date | string;
}): Promise<number> {
  if (!req.service_level) return 0;

  const driverUserIds = await getEligibleEmergencyDriverUserIds(
    Number(req.pickup_lat),
    Number(req.pickup_lng),
    req.service_level,
  );

  const payload = {
    type: "emergency:new_request",
    request_id: req.id,
    pickup: {
      address: req.pickup_address,
      lat: Number(req.pickup_lat),
      lng: Number(req.pickup_lng),
    },
    service_level: req.service_level,
    requires_paramedic: req.requires_paramedic,
    expires_at: new Date(req.expires_at).toISOString(),
  };

  for (const userId of driverUserIds) {
    emergencySendToUser(userId, payload);
    try {
      await sendNotification(
        userId,
        "alarm",
        "🚨 Emergency ambulance call",
        `${req.service_level} needed — ${req.pickup_address}`,
        { request_id: req.id, type: "emergency_new_request" },
      );
    } catch (err) {
      logger.warn("[emergencyChain] alarm push failed", { request_id: req.id, userId, err });
    }
  }

  return driverUserIds.length;
}

/** §D.2.3 — identity reveal to the caller after first-accept-wins. */
async function emitAssigned(req: Record<string, unknown>): Promise<void> {
  try {
    const certId = req.accepted_cert_id as string | null;
    if (!certId) return;

    const [assignee] = await db
      .select({
        name: users.name,
        phone: users.phone,
        manufacturer: vehicles.manufacturer,
        model: vehicles.model,
      })
      .from(ambulanceCertifications)
      .innerJoin(users, eq(ambulanceCertifications.user_id, users.id))
      .innerJoin(vehicles, eq(ambulanceCertifications.vehicle_id, vehicles.id))
      .where(eq(ambulanceCertifications.id, certId))
      .limit(1);

    emergencySendToUser(req.caller_user_id as string, {
      type: "emergency:assigned",
      request_id: req.id,
      driver: assignee
        ? {
            first_name: assignee.name?.split(" ")[0] ?? "",
            phone: assignee.phone,
            vehicle_summary: `${assignee.manufacturer} ${assignee.model}`,
          }
        : null,
      eta_minutes: null,
    });
  } catch (err) {
    logger.warn("[emergencyChain] emitAssigned failed", { request_id: req.id, err });
  }
}
