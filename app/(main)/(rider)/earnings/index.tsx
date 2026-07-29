import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export default function EarningsDashboard() {
  const [todayEarnings, setTodayEarnings] = useState<number | null>(null);
  const [tipsBdt, setTipsBdt] = useState(0);
  const [promosBdt, setPromosBdt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setError("Not authenticated"); return; }
        const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/driver/calculate-price`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed"); return; }
        if (!cancelled) {
          setTodayEarnings((data.total_earnings_bdt ?? 0) / 100);
          setTipsBdt(data.tips_bdt ?? 0);
          setPromosBdt(data.promos_bdt ?? 0);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Network error");
        logger.error("Fetch earnings failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <Text className="text-[20px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark">Earnings</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#0CC25F" className="mt-2" />
        ) : error ? (
          <Text className="text-[14px] font-Jakarta text-goDanger mt-2">{error}</Text>
        ) : (
          <>
            <Text className="text-[32px] font-JakartaBold tracking-tight text-goPrimary mt-1">৳{todayEarnings}</Text>
            <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Today&apos;s earnings</Text>
          </>
        )}
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16, gap: 10 }}>
        <View className="bg-goAccentLight rounded-[12px] p-[16px] mb-3">
          <View className="flex-row justify-between">
            <View>
              <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Trip earnings</Text>
              <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">৳{todayEarnings ?? 0}</Text>
            </View>
            <View>
              <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Tips</Text>
              <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">৳{(tipsBdt / 100).toFixed(0)}</Text>
            </View>
            <View>
              <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Promos</Text>
              <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">৳{(promosBdt / 100).toFixed(0)}</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity
          className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px]"
          onPress={() => router.push("/(main)/(rider)/earnings-breakdown")}
        >
          <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">View breakdown</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">Trip-by-trip earnings details</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px]"
          onPress={() => router.push("/(main)/(rider)/commission-statement")}
        >
          <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Commission statement</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">Weekly commission breakdown</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px]"
          onPress={() => router.push("/(main)/(rider)/due-amounts")}
        >
          <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Due amounts</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">Subscription and commission dues</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}