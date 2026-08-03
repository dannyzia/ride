import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";

interface RideDetail {
  id: string;
  vehicle_type: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  distance_km: number;
  duration_minutes: number;
  total_bdt: number;
  driver_name: string;
  driver_rating: number;
  created_at: string;
}

export default function RideHistoryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ride, setRide] = useState<RideDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setError("");
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setError("Not authenticated"); setLoading(false); return; }
        const res = await fetch(`${API_URL}/api/ride/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed to load ride"); return; }
        if (!cancelled) setRide(data.ride);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    } catch { return iso; }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Ride Details</Text>
        <View className="w-[50px]" />
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0CC25F" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta text-goDanger text-center">{error}</Text>
        </View>
      ) : ride ? (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
          <View className="p-[16px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-4">
            <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">
              {ride.vehicle_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
            </Text>
            <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">
              {formatDate(ride.created_at)} · {ride.distance_km} km · {ride.duration_minutes} min
            </Text>
            <View className="mt-3 space-y-1">
              <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                From: {ride.pickup_address ?? "—"}
              </Text>
              <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                To: {ride.dropoff_address ?? "—"}
              </Text>
            </View>
            <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-goBorderLight dark:border-goBorderDark">
              <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                Driver: {ride.driver_name ?? "—"} ★ {ride.driver_rating ?? "—"}
              </Text>
              <Text className="text-[16px] font-JakartaBold text-goPrimary">
                ৳{(ride.total_bdt / 100).toFixed(0)}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] py-[14px] items-center mb-3"
            onPress={() => router.push(`/(main)/(customer)/(tabs)/activity/share-receipt?rideId=${ride.id}`)}
          >
            <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">View Receipt</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goDanger rounded-[12px] py-[14px] items-center"
            onPress={() => router.push(`/(main)/(customer)/report-issue?rideId=${ride.id}`)}
          >
            <Text className="text-[15px] font-JakartaBold text-goDanger">Report an Issue</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Ride not found</Text>
        </View>
      )}
    </SafeAreaView>
  );
}