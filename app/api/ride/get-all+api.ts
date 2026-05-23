import { db } from "@/src/db";
import { eq, sql } from "drizzle-orm";
import dotenv from "dotenv";
import { drivers, rides, users } from "@/src/db/schema";

dotenv.config({ path: './.env.local' });

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const firebaseUid = url.searchParams.get('firebase_uid');
        if (!firebaseUid) {
            return Response.json({ error: "firebase_uid is required" }, { status: 400 });
        }

        const allRidesWithDrivers = await db
            .select({
                ride_id: rides.id,
                origin_address: rides.origin_address,
                destination_address: rides.destination_address,
                origin_latitude: rides.origin_latitude,
                origin_longitude: rides.origin_longitude,
                destination_latitude: rides.destination_latitude,
                destination_longitude: rides.destination_longitude,
                fare_price: rides.fare_price,
                payment_status: rides.payment_status,
                driver_id: rides.driver_id,
                user_id: rides.user_id,
                created_at: rides.created_at,

                driver: {
                    driver_id: drivers.id,
                    full_name: users.name,
                    profile_image_url: users.profile_image_url,
                    car_image_url: drivers.car_image_url,
                    car_seats: drivers.car_seats,
                    rating: drivers.rating,
                }
            })
            .from(rides)
            .innerJoin(users, eq(rides.user_id, users.id))
            .leftJoin(drivers, eq(rides.driver_id, drivers.id))
            .where(eq(users.firebase_uid, firebaseUid));

        return Response.json({ data: allRidesWithDrivers }, { status: 200 })

    } catch (error: any) {
        console.error("Error Getting all rides:", error);
        return Response.json({ error: error || "Internal Server Error" }, { status: 500 });
    }
}
