import { db } from "@/src/db";
import { eq } from "drizzle-orm";
import { rides, users, drivers } from "@/src/db/schema";
import { verifyFirebaseIdToken } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    let firebaseUid: string | null = null;

    // Try Bearer token first
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const decoded = await verifyFirebaseIdToken(request);
      firebaseUid = decoded.uid;
    } else {
      // Fallback: query param (legacy)
      const url = new URL(request.url);
      firebaseUid = url.searchParams.get('auth_uid');
    }

    if (!firebaseUid) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    const allRides = await db
      .select({
        ride_id: rides.id,
        origin_address: rides.origin_address,
        destination_address: rides.destination_address,
        origin_latitude: rides.origin_latitude,
        origin_longitude: rides.origin_longitude,
        destination_latitude: rides.destination_latitude,
        destination_longitude: rides.destination_longitude,
        fare_breakdown: rides.fare_breakdown,
        driver_id: rides.driver_id,
        user_id: rides.user_id,
        created_at: rides.created_at,
        driver: {
          driver_id: drivers.id,
          full_name: users.name,
          profile_image_url: users.profile_image_url,
          rating: drivers.rating,
        },
      })
      .from(rides)
      .innerJoin(users, eq(rides.user_id, users.id))
      .leftJoin(drivers, eq(rides.driver_id, drivers.id))
      .where(eq(users.auth_uid, firebaseUid));

    return Response.json({ data: allRides }, { status: 200 });
  } catch (err: any) {
    console.error('Error getting rides:', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
