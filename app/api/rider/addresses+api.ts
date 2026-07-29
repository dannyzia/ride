import { db } from "@/src/db";
import { riderAddresses, users } from "@/src/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import { z } from "zod";

const addressSchema = z.object({
  label: z.string().min(1).max(100),
  address: z.string().min(1),
  details: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  is_favorite: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: "user_not_found" }, { status: 404 });

    const addresses = await db.select()
      .from(riderAddresses)
      .where(and(eq(riderAddresses.user_id, dbUser.id), isNull(riderAddresses.deleted_at)))
      .orderBy(riderAddresses.created_at);

    return Response.json({ addresses }, { status: 200 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: "unauthorized" }, { status: 401 });
    logger.error("[rider/addresses] GET error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: "user_not_found" }, { status: 404 });

    const parsed = await parseJsonBody(request, addressSchema);
    if (!parsed.ok) return parsed.response;

    const { label, address, details, lat, lng, is_favorite } = parsed.data;

    await db.insert(riderAddresses).values({
      user_id: dbUser.id,
      label,
      address,
      details: details ?? null,
      lat: lat ?? 0,
      lng: lng ?? 0,
      is_favorite: is_favorite ?? false,
    } as any);

    return Response.json({ success: true }, { status: 201 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: "unauthorized" }, { status: 401 });
    logger.error("[rider/addresses] POST error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: "user_not_found" }, { status: 404 });

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return Response.json({ error: "invalid_uuid" }, { status: 400 });
    if (!z.string().uuid().safeParse(id).success) return Response.json({ error: "invalid_uuid" }, { status: 400 });

    await db.update(riderAddresses)
      .set({ deleted_at: new Date(), updated_at: new Date() })
      .where(and(eq(riderAddresses.id, id), eq(riderAddresses.user_id, dbUser.id)));

    return Response.json({ success: true }, { status: 200 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: "unauthorized" }, { status: 401 });
    logger.error("[rider/addresses] DELETE error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}