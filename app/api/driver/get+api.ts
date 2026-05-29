// Auth: verifySupabaseToken via Bearer token
import { db } from "@/src/db";
import { drivers, users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);
    const supabaseUid = user.id;

    const data = await db.select({
      full_name: users.name,
      email: users.email,
      auth_uid: users.auth_uid,
      number: users.number,
      role: users.role,
      profile_image_url: users.profile_image_url,
      rating: drivers.rating,
    }).from(users)
      .where(eq(users.auth_uid, supabaseUid))
      .innerJoin(drivers, eq(users.id, drivers.user_id));

    return Response.json(data, { status: 200 });
  } catch (error) {
    logger.error('[driver/get] error', error);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
