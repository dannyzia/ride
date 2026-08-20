import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

export default function EarningsDashboard() {
  const [todayEarnings, setTodayEarnings] = useState<number | null>(null);
  const [tipsBdt, setTipsBdt] = useState(0);
  const [promosBdt, setPromosBdt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setError("Not authenticated"); return; }
        const res = await fetch(`${API_URL}/api/driver/calculate-price`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed"); return; }
        if (!cancelled) {
          setTodayEarnings((data.total_earnings_bdt ?? 0) / 100);
          setTipsBdt(data.tips_bdt ?? 0);
          setPromosBdt(data.promos_bdt ?? 0);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
        logger.error("Fetch earnings failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <Text className="text-[20px] font-JakartaBold tracking-tight" style={{ color: textPrimary }}>Earnings</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#0CC25F" className="mt-2" />
        ) : error ? (
          <Text className="text-[14px] font-Jakarta mt-2" style={{ color: colors.danger }}>{error}</Text>
        ) : (
          <>
            <Text className="text-[32px] font-JakartaBold tracking-tight mt-1" style={{ color: colors.primary }}>৳{todayEarnings}</Text>
            <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>Today&apos;s earnings</Text>
          </>
        )}
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16, gap: 10 }}>
        <View className="rounded-[12px] p-[16px] mb-3" style={{ backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }}>
          <View className="flex-row justify-between">
            <View>
              <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>Trip earnings</Text>
              <Text className="text-[18px] font-JakartaBold" style={{ color: textPrimary }}>৳{todayEarnings ?? 0}</Text>
            </View>
            <View>
              <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>Tips</Text>
              <Text className="text-[18px] font-JakartaBold" style={{ color: textPrimary }}>৳{(tipsBdt / 100).toFixed(0)}</Text>
            </View>
            <View>
              <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>Promos</Text>
              <Text className="text-[18px] font-JakartaBold" style={{ color: textPrimary }}>৳{(promosBdt / 100).toFixed(0)}</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity
          className="p-[14px] border rounded-[12px]"
          style={{ backgroundColor: surfaceBg, borderColor }}
          onPress={() => router.push("/(main)/(rider)/earnings-breakdown")}
        >
          <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>View breakdown</Text>
          <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>Trip-by-trip earnings details</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="p-[14px] border rounded-[12px]"
          style={{ backgroundColor: surfaceBg, borderColor }}
          onPress={() => router.push("/(main)/(rider)/commission-statement")}
        >
          <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>Commission statement</Text>
          <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>Weekly commission breakdown</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="p-[14px] border rounded-[12px]"
          style={{ backgroundColor: surfaceBg, borderColor }}
          onPress={() => router.push("/(main)/(rider)/due-amounts")}
        >
          <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>Due amounts</Text>
          <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>Subscription and commission dues</Text>
        </TouchableOpacity>
      </ScrollView>
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
