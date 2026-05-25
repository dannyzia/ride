import { db } from "@/src/db";
import { rides, users } from "@/src/db/schema";
import { eq, and, gte, lt, sql } from "drizzle-orm";
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

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const data = await db.select({ fare_price: sql<string>`COALESCE(CAST(fare_breakdown->>'total_bdt' AS text), '0')` })
      .from(rides)
      .innerJoin(users, eq(rides.driver_id, users.id))
      .where(
        and(
          eq(users.auth_uid, firebaseUid),
          gte(rides.created_at, startOfDay),
          lt(rides.created_at, endOfDay)
        )
      );

    const totalEarnings = data.reduce((acc, ride) => acc + Number(ride.fare_price ?? 0), 0);
    const roundedEarnings = Math.round(totalEarnings * 100) / 100;

    return Response.json({ totalEarnings: roundedEarnings }, { status: 200 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
