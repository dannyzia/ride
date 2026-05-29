import { Driver } from "@/types/type";
import { getBarikoiDistanceMatrixUrl } from '@/lib/useBarikoiMapStyle';
import { logger } from "@/lib/logger";

type PlainDriver = Omit<Driver, 'setUserLocation' | 'setId' | 'setProfileImageURL' | 'setRating' | 'setFullName' | 'setRole'>;

export const calculateRegion = ({
    userLatitude,
    userLongitude,
    destinationLatitude,
    destinationLongitude,
}: {
    userLatitude: number | null,
    userLongitude: number | null,
    destinationLatitude?: number | null,
    destinationLongitude?: number | null,
}) => {
    if (userLatitude == null || userLongitude == null) {
        return {
            latitude: 23.8103, // Dhaka center
            longitude: 90.4125,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
        };
    }

    if (destinationLatitude == null || destinationLongitude == null) {
        return {
            latitude: userLatitude,
            longitude: userLongitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
        };
    }

    const minLat = Math.min(userLatitude, destinationLatitude);
    const maxLat = Math.max(userLatitude, destinationLatitude);
    const minLng = Math.min(userLongitude, destinationLongitude);
    const maxLng = Math.max(userLongitude, destinationLongitude);

    const latitudeDelta = (maxLat - minLat) * 1.3;
    const longitudeDelta = (maxLng - minLng) * 1.3;

    const latitude = (userLatitude + destinationLatitude) / 2;
    const longitude = (userLongitude + destinationLongitude) / 2;

    return {
        latitude,
        longitude,
        latitudeDelta,
        longitudeDelta,
    };
};

type BarikoiDistanceResult = {
    distance?: number;
    duration?: number;
    [key: string]: unknown;
};

export const getNearbyDrivers = async (
    userLatitude: number,
    userLongitude: number,
    drivers: PlainDriver[],
    destinationLatitude?: number,
    destinationLongitude?: number,
    maxDistanceKm: number = 5
): Promise<PlainDriver[]> => {
    const validDrivers = drivers?.filter(
        (driver) => driver.userLatitude && driver.userLongitude
    ) || [];

    if (validDrivers.length === 0) return [];

    const _origins = [{ lat: 0, lng: 0 }]; // placeholder — Barikoi matrix expects from/to arrays
    const destinations = validDrivers.map(d => ({ lat: d.userLatitude!, lng: d.userLongitude! }));

    try {
        // Use Barikoi distance matrix API
        const url = getBarikoiDistanceMatrixUrl(
            [{ lat: userLatitude, lng: userLongitude }],
            destinations
        );

        const res = await fetch(url);
        const json = await res.json();

        // Barikoi matrix response: { data: [...] } or { distances: [...] }
        const matrix = json.data || json.distances || json.rows || [];
        const elements = matrix[0] || json; // first row = distances from user to each driver

        const nearbyDrivers: PlainDriver[] = [];

        for (let i = 0; i < validDrivers.length; i++) {
            const element: BarikoiDistanceResult = elements[i] || elements.destinations?.[i] || {};
            const distanceMeters = element.distance || (element as any).value || 0;

            if (distanceMeters && distanceMeters <= maxDistanceKm * 1000) {
                const driver = validDrivers[i];

                nearbyDrivers.push({
                    ...driver,
                    distanceAway: distanceMeters / 1000,
                    price: '',
                });
            }
        }

        return nearbyDrivers;
    } catch (err) {
        logger.error("Error in getNearbyDrivers:", err);
        return [];
    }
};
