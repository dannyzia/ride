import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useRiderStore } from "@/store/useRiderStore";

const PRESET_TIPS_BDT = [0, 20, 50, 100]; // in BDT (not paisa)

export default function AddTip() {
  const { activeRide } = useRiderStore();
  const [tipAmount, setTipAmount] = useState(0);
  const [customTip, setCustomTip] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleAddTip = async () => {
    const finalAmount = customTip ? parseInt(customTip, 10) : tipAmount;
    if (finalAmount === 0) {
      router.replace("/(main)/(customer)/ride-completed");
      return;
    }
    if (!activeRide?.id) return;
    setSubmitting(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); setSubmitting(false); return; }
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/ride/${activeRide.id}/tip`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount_bdt: finalAmount * 100 }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Tip failed");
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      router.replace("/(main)/(customer)/ride-completed");
    } catch (err: any) {
      setError(err?.message || "Network error");
      setSubmitting(false);
      logger.error("Tip submission error", err);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Add Tip</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="items-center mb-6 mt-4">
          <View className="w-20 h-20 rounded-full bg-goAccentLight items-center justify-center mb-3">
            <Text className="text-[28px] font-JakartaBold tracking-tight text-goPrimary">
              {activeRide?.driver?.name?.charAt(0) ?? "D"}
            </Text>
          </View>
          <Text className="text-[20px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-6">
            {activeRide?.driver?.name ?? "Driver"}
          </Text>
        </View>
        <View className="mb-6">
          <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">
            Tip Amount
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {PRESET_TIPS_BDT.map((amount) => (
              <TouchableOpacity
                key={amount}
                className={`px-[16px] py-[10px] rounded-[8px] border ${
                  amount === tipAmount && !customTip
                    ? "border-goPrimary bg-goAccentLight"
                    : "border-goBorderLight dark:border-goBorderDark bg-goSurfaceLight dark:bg-goSurfaceElevatedDark"
                }`}
                onPress={() => {
                  setTipAmount(amount);
                  setCustomTip("");
                }}
              >
                <Text className={`text-[14px] font-Jakarta ${
                  amount === tipAmount && !customTip
                    ? "text-goPrimary"
                    : "text-goTextPrimaryLight dark:text-goTextPrimaryDark"
                }`}>
                  {amount === 0 ? "No Tip" : `৳${amount}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark"
            placeholder="Or enter custom amount (BDT)"
            placeholderTextColor="#9CA3AF"
            value={customTip}
            onChangeText={(text) => {
              setCustomTip(text);
              if (text) setTipAmount(0);
            }}
            keyboardType="numeric"
          />
        </View>
      </ScrollView>
      <View className="px-[24px] pb-[24px]">
        {error ? <Text className="text-[14px] font-Jakarta text-goDanger text-center mb-3">{error}</Text> : null}
        <TouchableOpacity
          className="bg-goPrimary rounded-full w-full py-[16px] items-center"
          onPress={handleAddTip}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size={20} color="#FFFFFF" />
          ) : (
            <Text className="text-[18px] font-JakartaBold text-goWhite">Add Tip</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
