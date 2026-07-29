import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

interface RideDetail {
  id: string;
  status: string;
  vehicle_type: string;
  origin_address: string;
  destination_address: string;
  fare_breakdown: { total_bdt?: number };
  scheduled_at: string | null;
  created_at: string;
  driver: { name: string; phone: string; vehicle_type: string; rating: number } | null;
}

export default function RideDetailsScheduled() {
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
        if (!token) { setError("Not authenticated"); return; }
        const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/ride/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed to load"); return; }
        if (!cancelled) setRide(data.ride);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Network error");
        logger.error("RideDetailsScheduled fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const dateStr = ride?.scheduled_at ?? ride?.created_at ?? "";
  const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
  const formattedTime = dateStr ? new Date(dateStr).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";

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
          <Text className="text-[15px] font-Jakarta text-goDanger text-center mb-4">{error}</Text>
          <TouchableOpacity
            className="bg-goPrimary rounded-full px-[24px] py-[12px]"
            onPress={() => { setLoading(true); setError(""); }}
          >
            <Text className="text-[16px] font-JakartaBold text-goWhite">Retry</Text>
          </TouchableOpacity>
        </View>
      ) : !ride ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-[18px] font-JakartaBold text-goTextSecondaryLight dark:text-goTextSecondaryDark">Ride not found</Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 24 }}>
          <View className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] p-[16px] mb-6">
            <View className="flex-row items-center mb-3">
              <View className="w-10 h-10 rounded-full bg-goAccentLight items-center justify-center mr-3">
                <Text className="text-[20px] font-JakartaBold text-goPrimary">📅</Text>
              </View>
              <View className="flex-1">
                <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">
                  {ride.vehicle_type?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) ?? "Ride"}
                </Text>
                <Text className="text-[12px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                  {formattedDate} · {formattedTime}
                </Text>
              </View>
            </View>
            <View className="gap-1">
              <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                Pickup: {ride.origin_address ?? "—"}
              </Text>
              <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                Destination: {ride.destination_address ?? "—"}
              </Text>
              <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                Fare: ৳{((ride.fare_breakdown?.total_bdt ?? 0) / 100).toFixed(0)}
              </Text>
            </View>
          </View>
          <View className="flex-row gap-3">
            <TouchableOpacity
              className="flex-1 bg-goPrimary rounded-full py-[14px] items-center"
              onPress={() => router.push("/(main)/(customer)/rate-driver")}
            >
              <Text className="text-[16px] font-JakartaBold text-goWhite">Rate Driver</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 border border-goBorderLight dark:border-goBorderDark rounded-full py-[14px] items-center"
              onPress={() => router.replace("/(main)/(customer)/cancel-reason")}
            >
              <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Cancel</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}