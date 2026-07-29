import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useDriverFlowStore } from "@/store/useDriverFlowStore";

const REASONS = [
  "Rider requested cancellation",
  "Wrong pickup address",
  "Emergency situation",
  "Vehicle mechanical issue",
  "Rider no-show",
  "Unsafe pickup location",
  "Payment issue",
  "Other reason",
];

export default function CancellationReasons() {
  const [selected, setSelected] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const { activeOffer } = useDriverFlowStore();

  const handleConfirm = async () => {
    if (!selected) return;
    const rideId = activeOffer?.ride_id;
    if (!rideId) {
      setError("No active ride to cancel");
      return;
    }
    setCancelling(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); setCancelling(false); return; }
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/ride/${rideId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: selected, cancelled_by: "driver" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to cancel ride"); setCancelling(false); return; }
      router.replace("/(main)/(rider)/home");
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Cancel ride failed", err);
      setCancelling(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Cancel Ride</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-3">Please select a reason for cancellation</Text>
        {REASONS.map((r) => (
          <TouchableOpacity
            key={r}
            className={`flex-row items-center p-[14px] mb-2 rounded-[12px] border ${
              selected === r
                ? "border-goPrimary bg-goAccentLight"
                : "border-goBorderLight dark:border-goBorderDark bg-goSurfaceLight dark:bg-goSurfaceElevatedDark"
            }`}
            onPress={() => setSelected(r)}
          >
            <View
              className={`w-5 h-5 rounded-full border-2 mr-[12px] ${
                selected === r ? "border-goPrimary bg-goPrimary" : "border-goBorderLight dark:border-goBorderDark"
              }`}
            />
            <Text className="text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">{r}</Text>
          </TouchableOpacity>
        ))}
        {error ? (
          <Text className="text-[14px] font-Jakarta text-goDanger mb-3">{error}</Text>
        ) : null}
        <TouchableOpacity
          className={`rounded-full w-full py-[16px] items-center mt-4 ${!selected || cancelling ? "bg-goBorderDark" : "bg-goPrimary"}`}
          onPress={handleConfirm}
          disabled={!selected || cancelling}
        >
          {cancelling ? (
            <ActivityIndicator size={20} color="#FFFFFF" />
          ) : (
            <Text className="text-[18px] font-JakartaBold text-goWhite">Confirm Cancellation</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}