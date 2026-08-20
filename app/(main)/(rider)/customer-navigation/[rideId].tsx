import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, ActivityIndicator, StatusBar, TouchableOpacity } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import DriverNavigation from "@/components/DriverNavigation";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

export default function CustomerNavigationScreen() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [coords, setCoords] = useState<{ pickupLat: number; pickupLng: number; dropoffLat: number; dropoffLng: number } | null>(null);

  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;

  useEffect(() => {
    if (!rideId) return;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/ride/${rideId}`, {
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
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: bg }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
        <ActivityIndicator size="large" color="#0CC25F" />
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <DriverNavigation {...coords} rideId={rideId ?? ""} />
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-16 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </View>
  );
}
