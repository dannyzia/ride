import { useState, useEffect, useRef } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import MapLibreGL from "@/utils/maplibreLoader";
import { useBarikoiMapStyle } from "@/utils/mapUtils";

const API_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "";
const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled", pending: "Searching for driver", dispatching: "Searching for driver",
  matched: "Driver on the way", driver_arriving: "Driver arriving",
  driver_arrived: "Driver arrived", in_progress: "On the way",
  completed: "Completed", cancelled: "Cancelled",
};

export default function PublicTrackPage() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const mapStyleUrl = useBarikoiMapStyle(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center px-[24px]">
        <Text className="text-[16px] font-Jakarta text-goDanger text-center">{error}</Text>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center">
        <ActivityIndicator size="large" color="#0CC25F" />
        <Text className="mt-4 text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Loading ride info...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <Text className="text-[20px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Ride Tracking</Text>
      </View>
      <View className="flex-1 px-[24px]">
        <View className="py-4">
          <Text className="text-[22px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">
            {STATUS_LABELS[data.status] ?? data.status}
          </Text>
          {data.driver_name && (
            <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
              Driver: {data.driver_name} {data.driver_rating ? `★ ${parseFloat(data.driver_rating).toFixed(1)}` : ""}
            </Text>
          )}
          {data.vehicle_type && (
            <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
              Vehicle: {data.vehicle_type}
            </Text>
          )}
        </View>
        <View className="flex-1 rounded-xl overflow-hidden">
          {MapLibreGL && MapLibreGL.MapView ? (
            <MapLibreGL.MapView style={{ flex: 1 }} styleURL={mapStyleUrl}
              centerCoordinate={[Number(data.origin_lng ?? 90.4125), Number(data.origin_lat ?? 23.8103)]} zoomLevel={12} />
          ) : (
            <View className="flex-1 bg-goGray100 dark:bg-goBgDark items-center justify-center rounded-xl">
              <Text className="text-goTextSecondaryLight font-Jakarta">Map View</Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
