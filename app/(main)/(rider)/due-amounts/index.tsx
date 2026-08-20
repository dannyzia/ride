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

interface DuesData {
  subscription: {
    package_name: string | null;
    expires_at: string;
    calls_remaining: number;
    status: string;
  } | null;
  commission_due_bdt: number;
  total_outstanding_bdt: number;
}

export default function DueAmounts() {
  const [data, setData] = useState<DuesData | null>(null);
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
        const res = await fetch(`${API_URL}/api/driver/dues`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error || "Failed"); return; }
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
        logger.error("DueAmounts fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Due Amounts</Text>
        <View className="w-[50px]" />
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0CC25F" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[14px] font-Jakarta text-center mb-4" style={{ color: colors.danger }}>{error}</Text>
          <TouchableOpacity className="rounded-full px-[24px] py-[12px]" style={{ backgroundColor: colors.primary }} onPress={() => { setLoading(true); setError(""); }}>
            <Text className="text-[16px] font-JakartaBold" style={{ color: colors.white }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : data ? (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
          {data.subscription ? (
            <View className="p-[16px] border rounded-[12px] mb-4" style={{ backgroundColor: surfaceBg, borderColor }}>
              <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>SUBSCRIPTION</Text>
              <Text className="text-[20px] font-JakartaBold tracking-tight mt-1" style={{ color: textPrimary }}>{data.subscription.package_name ?? "Active Plan"}</Text>
              <View className="flex-row justify-between mt-2">
                <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>Calls remaining: {data.subscription.calls_remaining}</Text>
                <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>Expires: {new Date(data.subscription.expires_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</Text>
              </View>
              <View className="flex-row justify-between mt-1">
                <View className="rounded-full px-[10px] py-[4px]" style={{ backgroundColor: `${colors.primary}1A` }}>
                  <Text className="text-[12px] font-JakartaBold" style={{ color: colors.primary }}>{data.subscription.status}</Text>
                </View>
              </View>
              <TouchableOpacity className="rounded-full w-full py-[14px] items-center mt-3" style={{ backgroundColor: colors.primary }} onPress={() => router.push("/(main)/(rider)/subscription-plans")}>
                <Text className="text-[16px] font-JakartaBold" style={{ color: colors.white }}>Renew</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="p-[16px] border rounded-[12px] mb-4" style={{ backgroundColor: surfaceBg, borderColor }}>
              <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>No active subscription</Text>
              <TouchableOpacity className="rounded-full w-full py-[14px] items-center mt-3" style={{ backgroundColor: colors.primary }} onPress={() => router.push("/(main)/(rider)/subscription-plans")}>
                <Text className="text-[16px] font-JakartaBold" style={{ color: colors.white }}>Browse Packages</Text>
              </TouchableOpacity>
            </View>
          )}
          <View className="p-[16px] border rounded-[12px] mb-4" style={{ backgroundColor: surfaceBg, borderColor }}>
            <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>COMMISSION DUE</Text>
            <Text className="text-[20px] font-JakartaBold tracking-tight mt-1" style={{ color: textPrimary }}>৳{(data.commission_due_bdt / 100).toFixed(0)}</Text>
            <View className="flex-row justify-between mt-2">
              <View className="rounded-full px-[10px] py-[4px]" style={{ backgroundColor: `${colors.danger}1A` }}>
                <Text className="text-[12px] font-JakartaBold" style={{ color: colors.danger }}>Unsettled</Text>
              </View>
            </View>
          </View>
          <View className="p-[16px] border rounded-[12px] mb-4" style={{ backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight, borderColor: colors.primary }}>
            <View className="flex-row justify-between items-center">
              <Text className="text-[16px] font-JakartaBold" style={{ color: textPrimary }}>TOTAL OUTSTANDING</Text>
              <Text className="text-[22px] font-JakartaBold tracking-tight" style={{ color: colors.danger }}>৳{(data.total_outstanding_bdt / 100).toFixed(0)}</Text>
            </View>
          </View>
        </ScrollView>
      ) : null}
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-16 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
