import { useState, useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import DriverNavigation from "@/components/DriverNavigation";

export default function CustomerNavigationScreen() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [coords, setCoords] = useState<{ pickupLat: number; pickupLng: number; dropoffLat: number; dropoffLng: number } | null>(null);

  useEffect(() => {
    if (!rideId) return;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/ride/${rideId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const { ride } = await res.json();
          setCoords({
            pickupLat: parseFloat(ride.origin_latitude),
            pickupLng: parseFloat(ride.origin_longitude),
            dropoffLat: parseFloat(ride.destination_latitude),
            dropoffLng: parseFloat(ride.destination_longitude),
          });
        }
      } catch (e) {
        logger.error("[navigation] ride fetch failed", e);
      }
    })();
  }, [rideId]);

  if (!coords) {
    return (
      <View className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center">
        <ActivityIndicator size="large" color="#0CC25F" />
      </View>
    );
  }

  return <DriverNavigation {...coords} rideId={rideId ?? ""} />;
}
