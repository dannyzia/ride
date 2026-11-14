import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { resolveToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { logger } from "@/lib/logger";
import { z } from "zod";
import * as errors from "@/lib/errors";
import {
  checkDeleteEligibility,
  deletionBlockedResponse,
  scrubAccountTx,
} from "@/lib/accountDelete";

const deleteSchema = z.object({
  reason: z.string().max(500).optional(),
});

/**
 * C2-4 (STAGE C2-FIX) — UNIFIED account delete. The one route both the
 * customer (delete-account screen) and rider (account-security screen)
 * surfaces converge on: DUES-ZERO + NO-ACTIVE-BOOKING precondition (driver
 * commission, courier remittance, owned-shop settlement, and any live ride /
 * order / rental / emergency / delivery — else 409 with the blocking reason)
 * + PII scrub + `deleted:` phone tombstone + deleted_at, in one transaction.
 *
 * Auth uses token-only resolution (not the suspending guard): a second delete
 * on an already-deleted account succeeds idempotently, and a suspended
 * account can still close itself.
 */
export async function DELETE(request: Request) {
  try {
    // Token-only on purpose (see header): the C2-1 account gate must not
    // turn the second delete into a 401 or lock suspended users out.
    const supabaseUser = await resolveToken(request);

    const [dbUser] = await db.select({ id: users.id, deleted_at: users.deleted_at })
      .from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    // Idempotent: the 23505 class is dead — re-deleting returns success.
    if (dbUser.deleted_at != null) {
      return Response.json({ success: true, already_deleted: true }, { status: 200 });
    }

    const parsed = await parseJsonBody(request, deleteSchema);
    if (!parsed.ok) return parsed.response;

    const block = await db.transaction(async (tx) => {
      const blocked = await checkDeleteEligibility(tx, dbUser.id);
      if (blocked) return blocked;
      await scrubAccountTx(tx, dbUser.id);
      return null;
    });

    if (block) return deletionBlockedResponse(block);

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
