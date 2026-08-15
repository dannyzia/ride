import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

const DEFAULT_CONTROLS = {
  share_usage_data: true,
  personalized_ads: false,
};

const patchSchema = z.object({
  share_usage_data: z.boolean().optional(),
  personalized_ads: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);
    const [dbUser] = await db.select({ data_controls: users.data_controls })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const controls = { ...DEFAULT_CONTROLS, ...(dbUser.data_controls as Record<string, boolean> ?? {}) };
    return Response.json({ data_controls: controls }, { status: 200 });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[user/data-controls] GET error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await verifySupabaseToken(request);
    const [dbUser] = await db.select({ id: users.id, data_controls: users.data_controls })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "validation_error", message: parsed.error.flatten() }, { status: 400 });
    }

    const current = { ...DEFAULT_CONTROLS, ...(dbUser.data_controls as Record<string, boolean> ?? {}) };
    const merged = { ...current, ...parsed.data };

    await db.update(users)
      .set({ data_controls: merged, updated_at: new Date() })
      .where(eq(users.id, dbUser.id));

    return Response.json({ data_controls: merged }, { status: 200 });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[user/data-controls] PATCH error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
