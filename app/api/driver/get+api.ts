import { db } from "@/src/db";
import { drivers, users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifyFirebaseIdToken } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    let firebaseUid: string | null = null;

    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const decoded = await verifyFirebaseIdToken(request);
      firebaseUid = decoded.uid;
    } else {
      const url = new URL(request.url);
      firebaseUid = url.searchParams.get('auth_uid');
    }

    if (!firebaseUid) {
      return Response.json({ error: "auth_uid is required" }, { status: 400 });
    }

    const data = await db.select({
      full_name: users.name,
      email: users.email,
      auth_uid: users.auth_uid,
      number: users.number,
      role: users.role,
      profile_image_url: users.profile_image_url,
      rating: drivers.rating,
    }).from(users)
      .where(eq(users.auth_uid, firebaseUid))
      .innerJoin(drivers, eq(users.id, drivers.user_id));

    return Response.json(data, { status: 200 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
