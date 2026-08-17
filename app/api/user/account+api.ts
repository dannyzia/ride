import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { logger } from "@/lib/logger";
import { z } from "zod";
import * as errors from "@/lib/errors";

const deleteSchema = z.object({
  reason: z.string().max(500).optional(),
});

export async function DELETE(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, deleteSchema);
    if (!parsed.ok) return parsed.response;

    await db.update(users)
      .set({ deleted_at: new Date(), updated_at: new Date() })
      .where(eq(users.id, dbUser.id));

    const authHeader = request.headers.get("Authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    try {
      if (jwt) await supabaseAdmin.auth.admin.signOut(jwt);
    } catch (signOutErr) {
      logger.warn("[user/account] signOut failed (non-fatal)", signOutErr);
    }

    return Response.json({ success: true }, { status: 200 });

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[user/account] DELETE error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
