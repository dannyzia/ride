import { db } from "@/src/db";
import { users, rides, riderAddresses } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import { z } from "zod";

const deleteDataSchema = z.object({
  confirm: z.literal("DELETE MY DATA").optional(),
});

export async function POST(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, deleteDataSchema);
    if (!parsed.ok) return parsed.response;

    await db.transaction(async (tx) => {
      await tx.update(users)
        .set({
          name: "[deleted]",
          phone: "[deleted]",
          email: null,
          profile_image_url: null,
          updated_at: new Date(),
        })
        .where(eq(users.id, dbUser.id));

      await tx.update(riderAddresses)
        .set({ address: "[deleted]", details: null, deleted_at: new Date(), updated_at: new Date() })
        .where(eq(riderAddresses.user_id, dbUser.id));

      await tx.update(rides)
        .set({ origin_address: "[deleted]", destination_address: "[deleted]" })
        .where(eq(rides.user_id, dbUser.id));
    });

    return Response.json({ success: true }, { status: 200 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[user/delete-data] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
