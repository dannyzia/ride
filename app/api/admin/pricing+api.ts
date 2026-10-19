// Auth: requireAdminPermission via adminRbac
//
// D1-1 rate-basis pin: pricing is APPEND-VERSIONED. PATCH never updates a row
// in place — an edit mints a successor row (supersedes_id points at the
// deactivated predecessor) and moves the is_active pointer, all in one tx.
// ride.pricing_id pins the immutable row, so a mid-ride admin edit cannot move
// a live ride's rate basis. Rollback (reversible per R-A9) moves the pointer
// back to a historical row of the same lineage — also pointer-only, also one tx.
// Reads (request/estimate/schedule/complete) are untouched: request-time
// readers take the is_active row, completion reads the pinned id.
import { db } from "@/src/db";
import { pricing } from "@/src/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireAdminPermission } from '@/lib/adminRbac';
import { logger } from "@/lib/logger";
import { parseJsonBody } from "@/lib/parseBody";
import { z } from "zod";
import * as errors from "@/lib/errors";

const updateSchema = z.object({
  id: z.string().uuid(),
  base_fare_bdt: z.number().int().nonnegative().optional(),
  per_km_bdt: z.number().int().nonnegative().optional(),
  per_min_bdt: z.number().int().nonnegative().optional(),
  floor_length_km: z.number().nonnegative().optional(),
  floor_min: z.number().int().nonnegative().optional(),
  platform_commission_percent: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .nullable(),
  brta_fare_ceiling_bdt: z.number().int().nonnegative().optional().nullable(),
  // Echoed by older clients; accepted ONLY when it matches the row (no-op).
  // Flipping the pointer outside versioning/rollback is rejected.
  is_active: z.boolean().optional(),
  // Pointer-move rollback to a historical row of the same lineage.
  rollback: z.boolean().optional(),
});

type PricingRow = typeof pricing.$inferSelect;

function authError(err: unknown) {
  const status = errors.getErrorStatus(err);
  if (status === 401 || status === 403) {
    return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: status ?? 500 });
  }
  return null;
}

/** Rate fields the PATCH schema may change, with row-vs-payload comparison. */
function diffRateFields(
  row: PricingRow,
  data: Omit<z.infer<typeof updateSchema>, "id" | "is_active" | "rollback">,
): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  if (data.base_fare_bdt !== undefined && data.base_fare_bdt !== row.base_fare_bdt) {
    changes.base_fare_bdt = data.base_fare_bdt;
  }
  if (data.per_km_bdt !== undefined && data.per_km_bdt !== row.per_km_bdt) {
    changes.per_km_bdt = data.per_km_bdt;
  }
  if (data.per_min_bdt !== undefined && data.per_min_bdt !== row.per_min_bdt) {
    changes.per_min_bdt = data.per_min_bdt;
  }
  if (data.floor_length_km !== undefined && Number(data.floor_length_km) !== Number(row.floor_length_km)) {
    changes.floor_length_km = String(data.floor_length_km); // numeric(10,2) column expects string
  }
  if (data.floor_min !== undefined && data.floor_min !== row.floor_min) {
    changes.floor_min = data.floor_min;
  }
  // NULL and 0 are the same 0% downstream (fareCalc `?? 0`) — the admin form
  // echoes NULL as 0, which must not mint a version by itself.
  const rowCommission = row.platform_commission_percent == null ? 0 : Number(row.platform_commission_percent);
  if (data.platform_commission_percent !== undefined && data.platform_commission_percent !== null) {
    if (data.platform_commission_percent !== rowCommission) {
      changes.platform_commission_percent = String(data.platform_commission_percent);
    }
  } else if (data.platform_commission_percent === null && row.platform_commission_percent !== null) {
    changes.platform_commission_percent = null;
  }
  if (data.brta_fare_ceiling_bdt !== undefined && data.brta_fare_ceiling_bdt !== row.brta_fare_ceiling_bdt) {
    changes.brta_fare_ceiling_bdt = data.brta_fare_ceiling_bdt;
  }
  return changes;
}

export async function GET(request: Request) {
  try {
    await requireAdminPermission('price.write')(request);
    const all = await db
      .select()
      .from(pricing)
      .orderBy(sql`${pricing.is_active} DESC, ${pricing.updated_at} DESC`);
    return Response.json({ pricing: all });
  } catch (err: unknown) {
    const auth = authError(err);
    if (auth) return auth;
    logger.error("[admin/pricing] list error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdminPermission('price.write')(request);
    const result = await parseJsonBody(request, updateSchema);
    if (!result.ok) return result.response;

    const { id, is_active, rollback, ...rateData } = result.data;

    const [row] = await db
      .select()
      .from(pricing)
      .where(eq(pricing.id, id))
      .limit(1);
    if (!row)
      return Response.json({ error: 'pricing_not_found', message: 'Pricing configuration not found' }, { status: 404 });

    // ── Rollback: move the is_active pointer to a historical row ──────
    if (rollback === true) {
      if (row.is_active) {
        return Response.json(
          { error: 'rollback_redundant', message: 'This row is already the active rate basis' },
          { status: 400 },
        );
      }
      const [current] = await db
        .select()
        .from(pricing)
        .where(
          and(
            eq(pricing.zone_id, row.zone_id),
            eq(pricing.vehicle_type, row.vehicle_type),
            eq(pricing.is_active, true),
          ),
        )
        .limit(1);
      if (!current) {
        // No live basis at all — just activate. Still a pointer move, no insert.
        const [reactivated] = await db
          .update(pricing)
          .set({ is_active: true, updated_at: new Date() })
          .where(eq(pricing.id, row.id))
          .returning();
        return Response.json({ pricing: reactivated, rolled_back_from: null });
      }
      // Lineage check: the target must be an ancestor of the live row, walked
      // through supersedes_id (same zone/type alone is not enough — a lineage
      // could theoretically be re-seeded).
      let ancestor: string | null = current.supersedes_id;
      let depth = 0;
      let lineageOk = false;
      while (ancestor !== null && depth < 50) {
        if (ancestor === row.id) {
          lineageOk = true;
          break;
        }
        const [parent] = await db
          .select({ supersedes_id: pricing.supersedes_id })
          .from(pricing)
          .where(eq(pricing.id, ancestor))
          .limit(1);
        ancestor = parent?.supersedes_id ?? null;
        depth += 1;
      }
      if (!lineageOk) {
        return Response.json(
          { error: 'lineage_mismatch', message: 'Rollback target is not an ancestor of the live rate basis' },
          { status: 400 },
        );
      }
      const now = new Date();
      const [reactivated] = await db.transaction(async (tx) => {
        await tx
          .update(pricing)
          .set({ is_active: false, updated_at: now })
          .where(eq(pricing.id, current.id));
        const [done] = await tx
          .update(pricing)
          .set({ is_active: true, updated_at: now })
          .where(eq(pricing.id, row.id))
          .returning();
        return done ? [done] : [];
      });
      if (!reactivated) {
        return Response.json({ error: 'internal_error', message: 'Rollback failed' }, { status: 500 });
      }
      return Response.json({ pricing: reactivated, rolled_back_from: current.id });
    }

    // ── Edit: mint a successor version, never mutate ──────────────────
    if (!row.is_active) {
      return Response.json(
        { error: 'edit_historical', message: 'Historical versions are immutable — rollback to reactivate, then edit' },
        { status: 400 },
      );
    }
    if (is_active !== undefined && is_active !== row.is_active) {
      return Response.json(
        { error: 'is_active_not_versioned', message: 'The active pointer moves only via versioning or rollback' },
        { status: 400 },
      );
    }
    const changes = diffRateFields(row, rateData);
    if (Object.keys(changes).length === 0) {
      return Response.json(
        { error: 'no_changes', message: 'No rate changes — nothing to version' },
        { status: 400 },
      );
    }

    const now = new Date();
    const minted = await db.transaction(async (tx) => {
      // Lock the live row: a concurrent PATCH blocks here, then sees the
      // deactivated row and 409s (version_race) instead of forking the basis.
      const [locked] = await tx
        .select()
        .from(pricing)
        .where(eq(pricing.id, row.id))
        .limit(1)
        .for("update");
      if (!locked || !locked.is_active) {
        return null;
      }
      const { id: _dropId, created_at: _dropCreated, ...carry } = locked;
      const [created] = await tx
        .insert(pricing)
        .values({
          ...carry,
          ...changes,
          is_active: true,
          supersedes_id: locked.id,
          updated_at: now,
        })
        .returning();
      await tx
        .update(pricing)
        .set({ is_active: false, updated_at: now })
        .where(eq(pricing.id, locked.id));
      return created ?? null;
    });
    if (!minted) {
      return Response.json(
        { error: 'version_race', message: 'The rate basis changed under you — refresh and retry' },
        { status: 409 },
      );
    }
    return Response.json({ pricing: minted, superseded_id: row.id });
  } catch (err: unknown) {
    const auth = authError(err);
    if (auth) return auth;
    logger.error("[admin/pricing] update error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
