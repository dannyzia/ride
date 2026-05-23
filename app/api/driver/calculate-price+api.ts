import { db } from "@/src/db";
import { rides, users } from "@/src/db/schema";
import { eq, and, gte, lt } from "drizzle-orm";

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const firebaseUid = url.searchParams.get('firebase_uid');

        if (!firebaseUid) {
            return Response.json({ error: "firebase_uid is required" }, { status: 400 });
        }

        // Get today's start and end timestamps
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

        // Lookup user by firebase_uid, then find rides by driver's internal UUID
        const data = await db.select({
            fare_price: rides.fare_price
        })
            .from(rides)
            .innerJoin(users, eq(rides.driver_id, users.id))
            .where(
                and(
                    eq(users.firebase_uid, firebaseUid),
                    gte(rides.created_at, startOfDay),
                    lt(rides.created_at, endOfDay)
                )
            );

        const totalEarnings = data.reduce((acc, ride) => acc + Number(ride.fare_price ?? 0), 0);
        const roundedEarnings = Math.round(totalEarnings * 100) / 100;

        return Response.json({
            totalEarnings: roundedEarnings,
        }, { status: 200 });
    } catch (error) {
        console.error(error);
        return Response.json({ error: error }, { status: 500 });
    }
}
