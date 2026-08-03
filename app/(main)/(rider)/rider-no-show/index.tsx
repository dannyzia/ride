import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export default function RiderNoShow() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [loading, setLoading] = useState(false);

  const handleNoShow = async () => {
    if (!rideId) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { Alert.alert("Error", "Not authenticated"); return; }
      const res = await fetch(`${API_URL}/api/ride/${rideId}/no-show`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        const fee = (data.fee_bdt ?? 0) / 100;
        Alert.alert(
          "Ride Cancelled",
          fee > 0 ? `A cancellation fee of ৳${fee.toFixed(0)} has been applied.` : "No cancellation fee was charged.",
          [{ text: "OK", onPress: () => router.replace("/(main)/(rider)/") }],
        );
      } else {
        Alert.alert("Error", data.error || data.message || "Failed");
      }
    } catch (err: any) {
      logger.error("[no-show] error", err);
      Alert.alert("Error", "Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Rider No-Show</Text>
        <View className="w-[50px]" />
      </View>
      <View className="flex-1 items-center justify-center px-[24px]">
        <View className="w-24 h-24 rounded-full bg-goDanger/10 items-center justify-center mb-6">
          <Text className="text-[48px]">⏰</Text>
        </View>
        <Text className="text-[22px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Rider did not appear</Text>
        <Text className="text-[15px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mb-8">Waiting time exceeded. Tap below to cancel and charge a fee.</Text>
        <TouchableOpacity
          className={`rounded-full w-full py-[16px] items-center mb-3 ${loading ? "bg-goBorderDark" : "bg-goDanger"}`}
          onPress={handleNoShow}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size={20} color="#FFFFFF" />
          ) : (
            <Text className="text-[18px] font-JakartaBold text-goWhite">Cancel & charge fee</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          className="border border-goBorderLight dark:border-goBorderDark rounded-full w-full py-[16px] items-center"
          onPress={() => router.back()}
        >
          <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Wait more</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
