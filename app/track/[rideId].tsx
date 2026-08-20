import { useState, useEffect, useRef } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, ActivityIndicator, TouchableOpacity, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import MapLibreGL from "@/utils/maplibreLoader";
import { useBarikoiMapStyle } from "@/utils/mapUtils";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled", pending: "Searching for driver", dispatching: "Searching for driver",
  matched: "Driver on the way", driver_arriving: "Driver arriving",
  driver_arrived: "Driver arrived", in_progress: "On the way",
  completed: "Completed", cancelled: "Cancelled",
};

interface TrackData {
  status: string;
  driver_name: string | null;
  driver_rating: string | null;
  vehicle_type: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
}

export default function PublicTrackPage() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [data, setData] = useState<TrackData | null>(null);
  const [error, setError] = useState("");
  const mapStyleUrl = useBarikoiMapStyle(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  useEffect(() => {
    if (!rideId) return;
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_URL}/api/ride/${rideId}/track`);
        if (res.ok) {
          setData(await res.json());
          setError("");
        } else {
          setData(null);
          setError("Ride not found or no longer trackable");
          if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        }
      } catch {
        setData(null);
        setError("Network error — retrying...");
      }
    };
    fetchData();
    intervalRef.current = setInterval(fetchData, 10_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [rideId]);

  if (error && !data) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center px-[24px]" style={{ backgroundColor: bg }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
        <Text className="text-[16px] font-Jakarta text-goDanger text-center">{error}</Text>
        <TouchableOpacity
          onPress={() => setTheme(isDark ? "light" : "dark")}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: bg }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="mt-4 text-[14px] font-Jakarta" style={{ color: textSecondary }}>Loading ride info...</Text>
        <TouchableOpacity
          onPress={() => setTheme(isDark ? "light" : "dark")}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="px-[24px] py-[16px] border-b" style={{ borderColor }}>
        <Text className="text-[20px] font-JakartaBold" style={{ color: textPrimary }}>Ride Tracking</Text>
      </View>
      <View className="flex-1 px-[24px]">
        <View className="py-4">
          <Text className="text-[22px] font-JakartaBold mb-2" style={{ color: textPrimary }}>
            {STATUS_LABELS[data.status] ?? data.status}
          </Text>
          {data.driver_name && (
            <Text className="text-[16px] font-Jakarta" style={{ color: textSecondary }}>
              Driver: {data.driver_name}{" "}
              {data.driver_rating ? (
                <>
                  <Ionicons name="star" size={12} color={colors.amber} /> {parseFloat(data.driver_rating).toFixed(1)}
                </>
              ) : null}
            </Text>
          )}
          {data.vehicle_type && (
            <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>
              Vehicle: {data.vehicle_type}
            </Text>
          )}
        </View>
        <View className="flex-1 rounded-xl overflow-hidden">
          {MapLibreGL && data.origin_lat != null && data.origin_lng != null ? (
            <MapLibreGL.MapView style={{ flex: 1 }} mapStyle={mapStyleUrl}>
              <MapLibreGL.Camera
                centerCoordinate={[Number(data.origin_lng), Number(data.origin_lat)]}
                zoomLevel={12}
              />
            </MapLibreGL.MapView>
          ) : (
            <View
              className="flex-1 items-center justify-center rounded-xl"
              style={{ backgroundColor: isDark ? colors.surfaceElevatedDark : colors.gray100 }}
            >
              <Text className="font-Jakarta" style={{ color: textSecondary }}>
                {data.origin_lat == null || data.origin_lng == null ? "Location unavailable" : "Map View"}
              </Text>
            </View>
          )}
        </View>
      </View>
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
