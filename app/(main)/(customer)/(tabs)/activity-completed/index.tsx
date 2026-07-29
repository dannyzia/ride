import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useRiderStore } from "@/store/useRiderStore";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export default function ActivityCompleted() {
  const { completedRides, fetchRideHistory } = useRiderStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          await fetchRideHistory(token);
        }
      } catch (err) {
        logger.error("ActivityCompleted fetchRideHistory failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchRideHistory]);

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
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Completed</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 24 }}>
        {(completedRides?.length ?? 0) > 0 ? (
          completedRides!.map((ride: any, index: number) => (
            <View key={index} className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] p-[16px] mb-4">
              <View className="flex-row items-center mb-3">
                <View className="w-10 h-10 rounded-full bg-goAccentLight items-center justify-center mr-3">
                  <Text className="text-[20px] font-JakartaBold tracking-tight text-goPrimary">✓</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">
                    {ride.vehicle_type?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) ?? "Ride"}
                  </Text>
                  <Text className="text-[12px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                    {ride.date ?? ""} · {ride.time ?? ""}
                  </Text>
                </View>
              </View>
              <View className="gap-1 mb-3">
                <Text className="text-[12px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                  Pickup: {ride.pickup_address ?? "—"}
                </Text>
                <Text className="text-[12px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                  Destination: {ride.destination_address ?? "—"}
                </Text>
                <Text className="text-[12px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                  Fare: ৳{((ride.fare_bdt ?? 0) / 100).toFixed(0)}
                </Text>
              </View>
              <View className="flex-row gap-2">
                <TouchableOpacity
                  className="flex-1 bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px] px-[12px] py-[8px] items-center"
                  onPress={() => router.push(`/(main)/(customer)/ride-details-completed/${ride.id}`)}
                >
                  <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">View Receipt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 bg-goPrimary rounded-[8px] px-[12px] py-[8px] items-center"
                  onPress={() => router.push("/(main)/(customer)/rate-driver")}
                >
                  <Text className="text-[14px] font-JakartaBold text-goWhite">Rate Driver</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        ) : (
          <View className="items-center py-8">
            <Text className="text-[20px] font-JakartaBold tracking-tight text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-4">
              No completed rides
            </Text>
            <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center">
              Your completed rides will appear here
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
