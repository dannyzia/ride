// GET /api/admin/queue — full driver approval queue with documents and face-match
// Part of F15-API-01. Supersedes the basic verify-driver+api.ts GET endpoint.
import { db } from "@/src/db";
import {
  drivers,
  users,
  documents,
  vehicles,
  systemConfig,
} from "@/src/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { logger } from "@/lib/logger";

type StatusFilter = "pending" | "temporary" | "rejected" | "all";

export async function GET(request: Request) {
  try {
    await requireRole("admin")(request);

    const url = new URL(request.url);
    const statusParam = (url.searchParams.get("status") ??
      "pending") as StatusFilter;
    const validStatuses: StatusFilter[] = [
      "pending",
      "temporary",
      "rejected",
      "all",
    ];
    if (!validStatuses.includes(statusParam)) {
      return Response.json(
        {
          error: "validation_error",
          message: "status must be one of pending|temporary|rejected|all",
        },
        { status: 400 },
      );
    }

    // Face-match threshold from system_config (default 70.00)
    const [faceConfigRow] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "face_match_min_score"))
      .limit(1);
    const faceMatchThreshold = faceConfigRow
      ? parseFloat(faceConfigRow.value) || 70
      : 70;

    // Build status filter
    const statusFilter =
      statusParam === "all"
        ? inArray(drivers.status, ["pending", "temporary", "rejected"])
        : eq(drivers.status, statusParam);

    const rows = await db
      .select({
        driver_id: drivers.id,
        user_id: drivers.user_id,
        vehicle_type: drivers.vehicle_type,
        status: drivers.status,
        submitted_at: drivers.created_at,
        provisional_expires_at: drivers.provisional_expires_at,
        is_legacy_operator: drivers.is_legacy_operator,
        vehicle_registration_date: drivers.vehicle_registration_date,
        brta_certificate_url: drivers.brta_certificate_url,
        stage2_due_at: drivers.stage2_due_at,
        user_name: users.name,
        user_phone: users.phone,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .where(statusFilter)
      .orderBy(drivers.created_at);

    // Fetch vehicle registration dates and documents in batch queries
    const driverIds = rows.map((r) => r.driver_id);

    const docRows = driverIds.length
      ? await db
          .select({
            id: documents.id,
            driver_id: documents.driver_id,
            doc_type: documents.doc_type,
            status: documents.status,
            storage_url: documents.storage_url,
            face_match_score: documents.face_match_score,
            face_match_status: documents.face_match_status,
            created_at: documents.created_at,
          })
          .from(documents)
          .where(inArray(documents.driver_id, driverIds))
      : [];

    const vehicleRows = driverIds.length
      ? await db
          .select({
            driver_id: vehicles.driver_id,
            registration_date: vehicles.registration_date,
          })
          .from(vehicles)
          .where(inArray(vehicles.driver_id, driverIds))
      : [];

    const docsByDriver = new Map<string, typeof docRows>();
    for (const d of docRows) {
      const arr = docsByDriver.get(d.driver_id) ?? [];
      arr.push(d);
      docsByDriver.set(d.driver_id, arr);
    }

    const vehicleRegByDriver = new Map<string, Date | null>();
    for (const v of vehicleRows) {
      vehicleRegByDriver.set(
        v.driver_id,
        v.registration_date ? new Date(v.registration_date) : null,
      );
    }

    const now = Date.now();
    let overdueCount = 0;
    let fastTrackOverdueCount = 0;

    const result = rows.map((r) => {
      const rawRegDate =
        r.vehicle_registration_date ??
        vehicleRegByDriver.get(r.driver_id) ??
        null;
      const regDate = rawRegDate ? new Date(rawRegDate) : null;
      const vehicle_age_years = regDate
        ? (now - regDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
        : null;

      const docs = (docsByDriver.get(r.driver_id) ?? []).map((d) => ({
        doc_type: d.doc_type,
        status: d.status,
        storage_url: d.storage_url,
        face_match_score:
          d.face_match_score !== null ? Number(d.face_match_score) : null,
        face_match_status: d.face_match_status,
      }));

      const has_driver_photo = docs.some((d) => d.doc_type === "driver_photo");
      const faceMatchDoc = docs.find((d) => d.face_match_score !== null);
      const face_match_score = faceMatchDoc?.face_match_score ?? null;
      const face_match_status = faceMatchDoc?.face_match_status ?? null;
      const face_match_warning =
        face_match_score !== null && face_match_score < faceMatchThreshold;

      const slaHours =
        (now - new Date(r.submitted_at).getTime()) / (1000 * 60 * 60);
      const sla_threshold = r.is_legacy_operator ? 12 : 24;
      const sla_breach = slaHours > sla_threshold;
      if (sla_breach) {
        if (r.is_legacy_operator) fastTrackOverdueCount++;
        else overdueCount++;
      }

      return {
        driver_id: r.driver_id,
        user_id: r.user_id,
        name: r.user_name,
        phone: r.user_phone,
        vehicle_type: r.vehicle_type,
        status: r.status,
        submitted_at: r.submitted_at,
        provisional_expires_at: r.provisional_expires_at,
        stage2_due_at: r.stage2_due_at,
        is_legacy_operator: r.is_legacy_operator,
        vehicle_registration_date: regDate,
        vehicle_age_years:
          vehicle_age_years !== null
            ? Math.round(vehicle_age_years * 100) / 100
            : null,
        has_driver_photo,
        face_match_score,
        face_match_status,
        face_match_warning,
        brta_certificate_url: r.brta_certificate_url,
        documents: docs,
        sla_hours: Math.round(slaHours * 10) / 10,
        sla_threshold_hours: sla_threshold,
        sla_breach,
      };
    });

    return Response.json({
      drivers: result,
      total: result.length,
      overdue_count: overdueCount,
      fast_track_overdue_count: fastTrackOverdueCount,
      face_match_threshold: faceMatchThreshold,
    });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403)
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error("[admin/queue] error", err);
    // Detect schema-mismatch (missing column) and return a specific machine
    // code so the admin UI can surface a helpful message. Full Postgres
    // error stays in server logs — never exposed to the client.
    const errMsg = err instanceof Error ? err.message : "";
    const isMissingColumn = /column .* does not exist/i.test(errMsg);
    return Response.json(
      {
        error: isMissingColumn ? "schema_mismatch" : "internal_error",
        message: isMissingColumn
          ? "Database schema is out of date. Run migrations."
          : "Failed to load driver queue.",
      },
      { status: 500 },
    );
  }
}
