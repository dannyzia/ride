import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { resolveToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import { z } from "zod";
import * as errors from "@/lib/errors";
import { checkDeleteDues, scrubAccountTx } from "@/lib/accountDelete";

const deleteDataSchema = z.object({
  confirm: z.literal("DELETE MY DATA").optional(),
});

/**
 * C2-4 (STAGE C2-FIX) — legacy alias of the unified delete. The customer
 * delete-data screen still posts here; it runs the SAME dues precondition +
 * scrub writer as DELETE /api/user/account (single implementation in
 * lib/accountDelete.ts), so there is one delete semantic, not two.
 */
export async function POST(request: Request) {
  try {
    const supabaseUser = await resolveToken(request);

    const [dbUser] = await db.select({ id: users.id, deleted_at: users.deleted_at })
      .from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });
    if (dbUser.deleted_at != null) {
      return Response.json({ success: true, already_deleted: true }, { status: 200 });
    }

    const parsed = await parseJsonBody(request, deleteDataSchema);
    if (!parsed.ok) return parsed.response;

    const failure = await db.transaction(async (tx) => {
      const dues = await checkDeleteDues(tx, dbUser.id);
      if (dues) return dues;
      await scrubAccountTx(tx, dbUser.id);
      return null;
    });

    if (failure) {
      return Response.json(
        { error: 'dues_outstanding', message: 'Outstanding dues must be settled before deletion', kind: failure.kind, amount_bdt: failure.amount_bdt },
        { status: 409 },
      );
    }

    return Response.json({ success: true }, { status: 200 });

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[user/delete-data] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
