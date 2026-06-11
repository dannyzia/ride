// Auth: verifySupabaseToken via requireRole
import { db } from "@/src/db";
import { packages } from "@/src/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  call_count: z.number().int().positive(),
  duration_days: z.number().int().positive(),
  price_bdt: z.number().int().nonnegative(),
  is_trial: z.boolean().optional().default(false),
  daily_cap: z.number().int().positive().optional().default(200),
  is_active: z.boolean().optional().default(true),
});

const updateSchema = createSchema.partial().extend({
  id: z.string().uuid(),
});

export async function GET(request: Request) {
  try {
    await requireRole("admin")(request);
    const all = await db
      .select()
      .from(packages)
      .where(eq(packages.deleted_at, null as any))
      .orderBy(desc(packages.created_at));
    return Response.json({ packages: all });
  } catch (err: any) {
    if (err.status === 401)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    if (err.status === 403)
      return Response.json({ error: "forbidden" }, { status: 403 });
    logger.error("[admin/packages] list error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireRole("admin")(request);
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "validation_error", message: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const [pkg] = await db.insert(packages).values(parsed.data).returning();
    return Response.json({ package: pkg }, { status: 201 });
  } catch (err: any) {
    if (err.status === 401)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    if (err.status === 403)
      return Response.json({ error: "forbidden" }, { status: 403 });
    logger.error("[admin/packages] create error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    await requireRole("admin")(request);
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "validation_error", message: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { id, ...updates } = parsed.data;
    const [pkg] = await db
      .update(packages)
      .set({ ...updates, updated_at: new Date() })
      .where(eq(packages.id, id))
      .returning();

    if (!pkg)
      return Response.json({ error: "package_not_found" }, { status: 404 });
    return Response.json({ package: pkg });
  } catch (err: any) {
    if (err.status === 401)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    if (err.status === 403)
      return Response.json({ error: "forbidden" }, { status: 403 });
    logger.error("[admin/packages] update error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireRole("admin")(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return Response.json({ error: "missing_id" }, { status: 400 });

    await db
      .update(packages)
      .set({ deleted_at: new Date(), is_active: false, updated_at: new Date() })
      .where(eq(packages.id, id));

    return Response.json({ success: true });
  } catch (err: any) {
    if (err.status === 401)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    if (err.status === 403)
      return Response.json({ error: "forbidden" }, { status: 403 });
    logger.error("[admin/packages] delete error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
