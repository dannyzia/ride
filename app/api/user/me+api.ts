import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import { z } from "zod";

// NOTE: `phone` is intentionally NOT patchable here — it is the Supabase-auth
// credential and must only change through the OTP-verified auth flows.
const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  profile_image_url: z.string().url().optional(),
});

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);
    const [dbUser] = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      profile_image_url: users.profile_image_url,
      rating: users.rating,
      rating_count: users.rating_count,
      created_at: users.created_at,
    })
      .from(users)
      .where(and(eq(users.auth_uid, user.id), isNull(users.deleted_at)))
      .limit(1);

    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    return Response.json({
      user: {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        phone: dbUser.phone,
        role: dbUser.role,
        profile_image_url: dbUser.profile_image_url,
        rating: dbUser.rating ? parseFloat(String(dbUser.rating)) : null,
        rating_count: dbUser.rating_count,
        created_at: dbUser.created_at.toISOString(),
      },
    }, { status: 200 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[user/me] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, patchSchema);
    if (!parsed.ok) return parsed.response;

    const updates: Record<string, any> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.profile_image_url !== undefined) updates.profile_image_url = parsed.data.profile_image_url;
    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date();
      await db.update(users).set(updates).where(eq(users.id, dbUser.id));
    }

    const [updated] = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      profile_image_url: users.profile_image_url,
      rating: users.rating,
      rating_count: users.rating_count,
      created_at: users.created_at,
    }).from(users).where(eq(users.id, dbUser.id)).limit(1);

    return Response.json({
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        role: updated.role,
        profile_image_url: updated.profile_image_url,
        rating: updated.rating ? parseFloat(String(updated.rating)) : null,
        rating_count: updated.rating_count,
        created_at: updated.created_at.toISOString(),
      },
    }, { status: 200 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[user/me] PATCH error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
