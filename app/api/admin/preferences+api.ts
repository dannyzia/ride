import { db } from "@/src/db";
import { preferences } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(50),
  display_label_en: z.string().min(1).max(100),
  display_label_bn: z.string().min(1).max(100),
  icon: z.string().max(50).optional().nullable(),
  charge_bdt: z.number().int().min(0).default(0),
  affects_matching: z.boolean().default(false),
});

const patchSchema = createSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export async function GET(req: Request) {
  try {
    await requireRole("admin")(req);

    const url = new URL(req.url);
    const includeInactive = url.searchParams.get("include_inactive") === "true";

    const rows = await db
      .select()
      .from(preferences)
      .where(includeInactive ? undefined : eq(preferences.is_active, true))
      .orderBy(preferences.created_at);

    return Response.json({ preferences: rows });
  } catch (err: any) {
    if (err.status === 401)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    if (err.status === 403)
      return Response.json({ error: "forbidden" }, { status: 403 });
    logger.error("[admin/preferences] list error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  await requireRole("admin")(req);

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "validation_error", message: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const [pref] = await db
      .insert(preferences)
      .values({
        name: data.name,
        display_label_en: data.display_label_en,
        display_label_bn: data.display_label_bn,
        icon: data.icon ?? null,
        charge_bdt: data.charge_bdt,
        affects_matching: data.affects_matching,
      })
      .returning();

    logger.info("[admin/preferences] created", {
      id: pref.id,
      name: pref.name,
    });
    return Response.json({ preference_id: pref.id }, { status: 201 });
  } catch (err: any) {
    if (err.code === "23505") {
      return Response.json(
        { error: "preference_name_exists" },
        { status: 409 },
      );
    }
    logger.error("[admin/preferences] create error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  await requireRole("admin")(req);

  const url = new URL(req.url);
  const prefId = url.searchParams.get("id");
  if (!prefId) return Response.json({ error: "missing_id" }, { status: 400 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "validation_error", message: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const updates: Record<string, unknown> = { updated_at: new Date() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.display_label_en !== undefined)
    updates.display_label_en = data.display_label_en;
  if (data.display_label_bn !== undefined)
    updates.display_label_bn = data.display_label_bn;
  if (data.icon !== undefined) updates.icon = data.icon;
  if (data.charge_bdt !== undefined) updates.charge_bdt = data.charge_bdt;
  if (data.affects_matching !== undefined)
    updates.affects_matching = data.affects_matching;
  if (data.is_active !== undefined) updates.is_active = data.is_active;

  if (Object.keys(updates).length <= 1) {
    return Response.json({ error: "no_fields_to_update" }, { status: 400 });
  }

  const [pref] = await db
    .update(preferences)
    .set(updates)
    .where(eq(preferences.id, prefId))
    .returning();

  if (!pref)
    return Response.json({ error: "preference_not_found" }, { status: 404 });

  logger.info("[admin/preferences] updated", { id: pref.id });
  return Response.json({ preference: pref });
}

export async function DELETE(req: Request) {
  await requireRole("admin")(req);

  const url = new URL(req.url);
  const prefId = url.searchParams.get("id");
  if (!prefId) return Response.json({ error: "missing_id" }, { status: 400 });

  const [pref] = await db
    .update(preferences)
    .set({ is_active: false, updated_at: new Date() })
    .where(eq(preferences.id, prefId))
    .returning();

  if (!pref)
    return Response.json({ error: "preference_not_found" }, { status: 404 });

  logger.info("[admin/preferences] deactivated", { id: pref.id });
  return Response.json({ deactivated: true });
}
