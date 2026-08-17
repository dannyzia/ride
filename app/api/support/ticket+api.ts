import { db } from "@/src/db";
import { supportTickets, users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import { z } from "zod";
import * as errors from "@/lib/errors";

const ticketSchema = z.object({
  category: z.string().min(1).max(50),
  subject: z.string().max(200).optional(),
  description: z.string().min(1),
  ride_id: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, ticketSchema);
    if (!parsed.ok) return parsed.response;

    const [ticket] = await db.insert(supportTickets).values({
      user_id: dbUser.id,
      ride_id: parsed.data.ride_id ?? null,
      category: parsed.data.category,
      subject: parsed.data.subject ?? null,
      description: parsed.data.description,
      status: "open",
      priority: "normal",
    }).returning({ id: supportTickets.id });

    return Response.json({ ticket_id: ticket!.id, status: "open" }, { status: 201 });

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[support/ticket] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
