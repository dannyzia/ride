import { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export default function WalletScreen() {
  const [balancePaisa, setBalancePaisa] = useState(0);
  const [pendingPaisa, setPendingPaisa] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchWallet = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/driver/wallet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setError("Failed to load wallet"); return; }
      const data = await res.json();
      setBalancePaisa(data.balance_bdt ?? 0);
      setPendingPaisa(0);
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Wallet fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWallet(); }, [fetchWallet]);

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <Text className="text-[20px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark">Wallet</Text>
        {loading ? (
          <ActivityIndicator size="small" color="#0CC25F" className="mt-3" />
        ) : error ? (
          <Text className="text-[14px] font-Jakarta text-goDanger mt-2">{error}</Text>
        ) : (
          <>
            <Text className="text-[32px] font-JakartaBold tracking-tight text-goPrimary mt-1">৳{(balancePaisa / 100).toFixed(0)}</Text>
            <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
              Available balance{pendingPaisa > 0 ? ` · ৳${(pendingPaisa / 100).toFixed(0)} pending` : ""}
            </Text>
          </>
        )}
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16, gap: 12 }}>
        <TouchableOpacity className="bg-goPrimary rounded-full w-full py-[16px] items-center" onPress={() => router.push("/(main)/(rider)/wallet-topup")}>
          <Text className="text-[18px] font-JakartaBold text-goWhite">Top Up</Text>
        </TouchableOpacity>
        <TouchableOpacity className="border border-goBorderLight dark:border-goBorderDark rounded-full w-full py-[16px] items-center" onPress={() => router.push("/(main)/(rider)/payout-methods")}>
          <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Withdraw</Text>
        </TouchableOpacity>
        <TouchableOpacity className="border border-goBorderLight dark:border-goBorderDark rounded-full w-full py-[16px] items-center" onPress={() => router.push("/(main)/(rider)/payout-history")}>
          <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Payout History</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}