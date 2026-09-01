/**
 * Ambulance certification helpers (Phase 6, spec v2 §C.2/§C.6/§E.3).
 *
 * Shared by:
 *  - the ambulance-scheduled bid gate (app/api/rental/bids+api.ts)
 *  - the pick-time cert-pair check (app/api/rental/assignments/[id]/pick+api.ts)
 *  - emergency broadcast eligibility (utils-server/emergencyActivation.ts)
 *
 * §E.3 level algebra: BLS ⊂ ALS — an ALS cert satisfies a BLS requirement.
 */
import { db } from "@/src/db";
import { ambulanceCertifications, drivers, vehicles } from "@/src/db/schema";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { getH3Ring } from "@/lib/h3";
import { getConfigInt } from "@/lib/platformConfig";

/** BLS ⊂ ALS: an ALS cert satisfies both BLS and ALS requirements. */
export function serviceLevelSatisfies(
  certLevel: string | null | undefined,
  required: string,
): boolean {
  if (certLevel !== "BLS" && certLevel !== "ALS") return false;
  return certLevel === "ALS" || required === "BLS";
}

/**
 * Fleet gate (§C.2a): does the fleet hold ≥1 VERIFIED cert pair matching
 * service_level — cert holder is an ACTIVE driver of THIS fleet, cert
 * vehicle belongs to THIS fleet, cert unexpired?
 */
export async function fleetHasVerifiedCertPair(
  fleetId: string,
  serviceLevel: string,
): Promise<boolean> {
  const rows = await db
    .select({
      id: ambulanceCertifications.id,
      service_level: ambulanceCertifications.service_level,
      expires_at: ambulanceCertifications.expires_at,
    })
    .from(ambulanceCertifications)
    .innerJoin(
      drivers,
      and(
        eq(drivers.user_id, ambulanceCertifications.user_id),
        eq(drivers.fleet_id, fleetId),
        eq(drivers.status, "active"),
      ),
    )
    .innerJoin(
      vehicles,
      and(
        eq(vehicles.id, ambulanceCertifications.vehicle_id),
        eq(vehicles.fleet_id, fleetId),
      ),
    )
    .where(eq(ambulanceCertifications.certification_status, "verified"));

  return rows.some(
    (r) =>
      (r.expires_at == null || r.expires_at > new Date()) &&
      serviceLevelSatisfies(r.service_level, serviceLevel),
  );
}

/**
 * Pair gate (§C.2b): is THIS (driver, vehicle) pair a VERIFIED, unexpired
 * cert matching service_level?
 */
export async function isVerifiedCertPair(
  userId: string,
  vehicleId: string,
  serviceLevel: string,
): Promise<boolean> {
  const [cert] = await db
    .select({
      id: ambulanceCertifications.id,
      service_level: ambulanceCertifications.service_level,
      expires_at: ambulanceCertifications.expires_at,
    })
    .from(ambulanceCertifications)
    .where(
      and(
        eq(ambulanceCertifications.user_id, userId),
        eq(ambulanceCertifications.vehicle_id, vehicleId),
        eq(ambulanceCertifications.certification_status, "verified"),
        or(
          isNull(ambulanceCertifications.expires_at),
          gt(ambulanceCertifications.expires_at, new Date()),
        ),
      ),
    )
    .limit(1);

  return !!cert && serviceLevelSatisfies(cert.service_level, serviceLevel);
}

/**
 * Broadcast eligibility (§C.6): VERIFIED cert holders whose service_level
 * covers the request, with an ACTIVE online, non-breaking drivers row whose
 * h3_cell_res9 falls within emergency_broadcast_k_ring (default 25, res 9)
 * of the pickup.
 */
export async function getEligibleEmergencyDriverUserIds(
  pickupLat: number,
  pickupLng: number,
  serviceLevel: string,
): Promise<string[]> {
  const k = await getConfigInt("emergency_broadcast_k_ring", 25);
  const ring = new Set(getH3Ring(pickupLat, pickupLng, k));

  const rows = await db
    .select({
      user_id: ambulanceCertifications.user_id,
      service_level: ambulanceCertifications.service_level,
      expires_at: ambulanceCertifications.expires_at,
      h3_cell: drivers.h3_cell_res9,
    })
    .from(ambulanceCertifications)
    .innerJoin(
      drivers,
      and(
        eq(drivers.user_id, ambulanceCertifications.user_id),
        eq(drivers.status, "active"),
        eq(drivers.is_online, true),
        eq(drivers.on_break, false),
      ),
    )
    .where(eq(ambulanceCertifications.certification_status, "verified"));

  const eligible = rows.filter(
    (r) =>
      r.h3_cell != null &&
      ring.has(r.h3_cell) &&
      (r.expires_at == null || r.expires_at > new Date()) &&
      serviceLevelSatisfies(r.service_level, serviceLevel),
  );

  return [...new Set(eligible.map((r) => r.user_id))];
}

/**
 * WS-path cert lookup: the caller's verified, unexpired cert whose
 * service_level satisfies the requirement (no Request object — the WS
 * connection already carries the resolved users.id).
 */
export async function getVerifiedCertForUser(
  userId: string,
  serviceLevel: string,
): Promise<{ id: string; service_level: string | null } | null> {
  const certs = await db
    .select({
      id: ambulanceCertifications.id,
      service_level: ambulanceCertifications.service_level,
      expires_at: ambulanceCertifications.expires_at,
    })
    .from(ambulanceCertifications)
    .where(
      and(
        eq(ambulanceCertifications.user_id, userId),
        eq(ambulanceCertifications.certification_status, "verified"),
        or(
          isNull(ambulanceCertifications.expires_at),
          gt(ambulanceCertifications.expires_at, new Date()),
        ),
      ),
    );

  const cert = certs.find((c) => serviceLevelSatisfies(c.service_level, serviceLevel));
  return cert ? { id: cert.id, service_level: cert.service_level } : null;
}
