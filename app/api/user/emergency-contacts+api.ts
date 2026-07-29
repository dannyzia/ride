import { db } from "@/src/db";
import { userEmergencyContacts, users } from "@/src/db/schema";
import { eq, and } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import { z } from "zod";

const contactSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().min(1).max(20),
  relationship: z.string().max(50).optional(),
});

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: "user_not_found" }, { status: 404 });

    const contacts = await db.select({
      id: userEmergencyContacts.id,
      name: userEmergencyContacts.name,
      phone: userEmergencyContacts.phone,
      relationship: userEmergencyContacts.relationship,
    })
      .from(userEmergencyContacts)
      .where(eq(userEmergencyContacts.user_id, dbUser.id))
      .orderBy(userEmergencyContacts.created_at);

    return Response.json({ contacts }, { status: 200 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: "unauthorized" }, { status: 401 });
    logger.error("[user/emergency-contacts] GET error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: "user_not_found" }, { status: 404 });

    const parsed = await parseJsonBody(request, contactSchema);
    if (!parsed.ok) return parsed.response;

    const [contact] = await db.insert(userEmergencyContacts).values({
      user_id: dbUser.id,
      name: parsed.data.name,
      phone: parsed.data.phone,
      relationship: parsed.data.relationship ?? null,
    }).returning({
      id: userEmergencyContacts.id,
      name: userEmergencyContacts.name,
      phone: userEmergencyContacts.phone,
      relationship: userEmergencyContacts.relationship,
    });

    return Response.json({ contact: contact! }, { status: 201 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: "unauthorized" }, { status: 401 });
    logger.error("[user/emergency-contacts] POST error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: "user_not_found" }, { status: 404 });

    const url = new URL(request.url);
    const contactId = url.searchParams.get("id");
    if (!contactId) return Response.json({ error: "invalid_uuid", message: "Contact id is required" }, { status: 400 });
    if (!z.string().uuid().safeParse(contactId).success) return Response.json({ error: "invalid_uuid" }, { status: 400 });

    await db.delete(userEmergencyContacts)
      .where(and(
        eq(userEmergencyContacts.id, contactId),
        eq(userEmergencyContacts.user_id, dbUser.id),
      ));

    return Response.json({ success: true }, { status: 200 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: "unauthorized" }, { status: 401 });
    logger.error("[user/emergency-contacts] DELETE error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
