import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export default function ActivityTopUp() {
  const [walletBalance, setWalletBalance] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/rider/wallet`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setWalletBalance(data.balance_bdt ?? 0);
          setTransactions(data.recent_transactions ?? []);
        } else {
          setError("Failed to load wallet");
        }
      } catch (e) {
        setError("Failed to load wallet");
        logger.error("[top-up] fetch failed", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.replace("/(main)/(customer)/(tabs)/activity")}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Top Up</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 24 }}>
        {loading ? (
          <ActivityIndicator size="large" color="#0CC25F" style={{ marginTop: 40 }} />
        ) : error ? (
          <Text className="text-[14px] font-Jakarta text-goDanger text-center mt-8">{error}</Text>
        ) : (
          <>
            <View className="mt-4 mb-4">
              <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Wallet Balance</Text>
              <Text className="text-[24px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark">৳{(walletBalance / 100).toFixed(0)}</Text>
            </View>
            <View className="mb-4">
              <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Recent Transactions</Text>
              {transactions.length > 0 ? (
                transactions.map((tx, index) => (
                  <View key={index} className="mb-2 flex-row items-center px-[12px] py-[8px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px]">
                    <View className="flex-1">
                      <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{tx.transaction_type}</Text>
                      <Text className="text-[11px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">{new Date(tx.created_at).toLocaleDateString()}</Text>
                    </View>
                    <Text className={`text-[12px] font-JakartaBold ${(tx.amount_bdt ?? 0) >= 0 ? "text-goPrimary" : "text-goDanger"}`}>
                      ৳{((tx.amount_bdt ?? 0) / 100).toFixed(0)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center py-[16px]">No recent transactions</Text>
              )}
            </View>
          </>
        )}
        <TouchableOpacity
          className="bg-goPrimary rounded-full w-full py-[16px] items-center"
          onPress={() => router.push("/(main)/(customer)/(tabs)/settings/top-up")}
        >
          <Text className="text-[18px] font-JakartaBold text-goWhite">Top Up Wallet</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
