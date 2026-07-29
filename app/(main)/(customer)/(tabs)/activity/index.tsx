import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useRiderStore } from "@/store/useRiderStore";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export default function ActivityOngoing() {
  const { activeRide, fetchActiveRide } = useRiderStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          await fetchActiveRide(token);
        }
      } catch (err) {
        logger.error("Activity fetchActiveRide failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchActiveRide]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center">
        <ActivityIndicator size="large" color="#0CC25F" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.replace("/(main)/(customer)/(tabs)/home")}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Ongoing</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 24 }}>
        {activeRide ? (
          <View>
            <View className="flex-row items-center mb-4">
              <View className="w-10 h-10 rounded-full bg-goAccentLight items-center justify-center mr-3">
                <Text className="text-[20px] font-JakartaBold tracking-tight text-goPrimary">🚗</Text>
              </View>
              <View className="flex-1">
                <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">
                  {activeRide.vehicle_type?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) ?? "Ride"}
                </Text>
                <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                  {activeRide.driver?.name ?? "Driver"} · {activeRide.eta_minutes ?? "—"} min away
                </Text>
              </View>
            </View>
            <View className="gap-1 mb-4">
              <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                Pickup: {activeRide.origin_address ?? "—"}
              </Text>
              <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                Destination: {activeRide.destination_address ?? "—"}
              </Text>
              <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                Fare: ৳{((Number(activeRide.fare_breakdown?.total_bdt ?? 0)) / 100).toFixed(0)}
              </Text>
            </View>
            <View className="gap-3">
              <TouchableOpacity
                className="bg-goPrimary rounded-full w-full py-[14px] items-center"
                onPress={() => router.push("/(main)/(customer)/driver-info")}
              >
                <Text className="text-[16px] font-JakartaBold text-goWhite">Driver Info</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-full shadow-go-sm w-full py-[14px] items-center"
                onPress={() => router.push(`/(main)/(customer)/chat/${activeRide.id}`)}
              >
                <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Chat</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View className="items-center py-8">
            <Text className="text-[20px] font-JakartaBold tracking-tight text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-4">
              No active rides
            </Text>
            <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center">
              Your active rides will appear here
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
