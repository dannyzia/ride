import { db } from '@/src/db';
import { rides, users, drivers } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyFirebaseIdToken } from '@/lib/auth';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const decoded = await verifyFirebaseIdToken(request);

    const [ride] = await db.select().from(rides).where(eq(rides.id, params.id)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found' }, { status: 404 });

    // Get driver info if assigned
    let driverInfo = null;
    if (ride.driver_id) {
      const [driver] = await db.select({
        name: users.name,
        phone: users.phone,
        vehicle_type: drivers.vehicle_type,
        rating: drivers.rating,
      }).from(drivers)
        .innerJoin(users, eq(users.id, drivers.user_id))
        .where(eq(drivers.id, ride.driver_id))
        .limit(1);
      driverInfo = driver ?? null;
    }

    return Response.json({
      ride: {
        ...ride,
        origin_latitude: parseFloat(ride.origin_latitude?.toString() ?? '0'),
        origin_longitude: parseFloat(ride.origin_longitude?.toString() ?? '0'),
        destination_latitude: parseFloat(ride.destination_latitude?.toString() ?? '0'),
        destination_longitude: parseFloat(ride.destination_longitude?.toString() ?? '0'),
        distance_km: parseFloat(ride.distance_km?.toString() ?? '0'),
        driver: driverInfo,
      },
    });
  } catch (e: any) {
    if (e.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
