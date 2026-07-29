import { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export default function InstantPay() {
  const [balancePaisa, setBalancePaisa] = useState(0);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState("");

  const fetchBalance = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/driver/wallet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setError("Failed to load balance"); return; }
      const data = await res.json();
      setBalancePaisa(data.balance_bdt ?? 0);
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Instant pay balance fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  const handleWithdraw = async () => {
    if (balancePaisa < 10000) { setError("Minimum withdrawal ৳100"); return; }
    setWithdrawing(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/driver/instant-pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount_bdt: balancePaisa }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Withdrawal failed");
        return;
      }
      Alert.alert("Success", `৳${(balancePaisa / 100).toFixed(0)} withdrawal initiated`, [
        { text: "OK", onPress: () => router.replace("/(main)/(rider)/(tabs)/wallet") },
      ]);
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Instant pay failed", err);
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Instant Pay</Text>
        <View className="w-[50px]" />
      </View>
      <View className="flex-1 items-center justify-center px-[24px]">
        <View className="w-24 h-24 rounded-full bg-goAccentLight dark:bg-goPrimary/20 items-center justify-center mb-6">
          <Text className="text-[48px]">⚡</Text>
        </View>
        {loading ? (
          <ActivityIndicator size="small" color="#0CC25F" />
        ) : error ? (
          <Text className="text-[14px] font-Jakarta text-goDanger mb-4">{error}</Text>
        ) : (
          <>
            <Text className="text-[22px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-1">Available Balance</Text>
            <Text className="text-[36px] font-JakartaBold tracking-tight text-goPrimary mb-2">৳{(balancePaisa / 100).toFixed(0)}</Text>
            <Text className="text-[15px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mb-8">
              Withdraw to your default payout method instantly.{balancePaisa < 10000 ? "\nMinimum withdrawal: ৳100" : ""}
            </Text>
          </>
        )}
        <TouchableOpacity
          className={`rounded-full w-full py-[16px] items-center ${withdrawing || balancePaisa < 10000 ? "bg-goBorderDark" : "bg-goPrimary"}`}
          onPress={handleWithdraw}
          disabled={withdrawing || balancePaisa < 10000}
        >
          {withdrawing ? <ActivityIndicator size={20} color="#FFFFFF" /> : <Text className="text-[18px] font-JakartaBold text-goWhite">Withdraw Now</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}