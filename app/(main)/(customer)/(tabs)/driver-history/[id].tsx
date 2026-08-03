import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";

interface TripDetail {
  ride_id: string;
  origin_address: string;
  destination_address: string;
  vehicle_type: string;
  status: string;
  fare_breakdown: any;
  origin_latitude: number;
  origin_longitude: number;
  destination_latitude: number;
  destination_longitude: number;
  created_at: string;
}

export default function DriverTripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<TripDetail | null>(null);
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
        const res = await fetch(`${API_URL}/api/ride/get-all`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error || "Failed to load trip"); return; }
        const found = (json.data || []).find((r: any) => r.ride_id === id);
        if (!cancelled) setTrip(found ?? null);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Trip Details</Text>
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
      ) : trip ? (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
          <View className="p-[16px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-4">
            <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">
              {trip.vehicle_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
            </Text>
            <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">
              {trip.status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
            </Text>
            <View className="mt-3 space-y-1">
              <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                From: {trip.origin_address ?? "—"}
              </Text>
              <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                To: {trip.destination_address ?? "—"}
              </Text>
            </View>
            <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-goBorderLight dark:border-goBorderDark">
              <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                {new Date(trip.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </Text>
              <Text className="text-[16px] font-JakartaBold text-goPrimary">
                ৳{((trip.fare_breakdown?.total_bdt ?? 0) / 100).toFixed(0)}
              </Text>
            </View>
          </View>
        </ScrollView>
      ) : (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Trip not found</Text>
        </View>
      )}
    </SafeAreaView>
  );
}