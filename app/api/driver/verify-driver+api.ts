import { db } from "@/src/db";
import { drivers, users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const body = await request.json();
    const { carImageUri, profileImage, rating, carSeats } = body;

    if (!carImageUri || !profileImage || !rating || !carSeats) {
      return Response.json({ error: "All fields are required" }, { status: 400 });
    }

    await db.update(drivers).set({
      rating,
    }).where(eq(drivers.user_id, user.id));

    await db.update(users).set({
      profile_image_url: profileImage,
    }).where(eq(users.id, user.id));

    return Response.json({ message: 'Driver verified' }, { status: 200 });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error("POST /driver/verify-driver failed", err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
