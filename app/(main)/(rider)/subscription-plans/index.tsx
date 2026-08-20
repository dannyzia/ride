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

interface Package {
  id: string;
  name: string;
  call_count: number;
  price_bdt: number;
  duration_days: number;
  is_trial: boolean;
  vehicle_type: string | null;
}

export default function SubscriptionPlans() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const [plans, setPlans] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setError("Not authenticated"); return; }
        const res = await fetch(`${API_URL}/api/package/list`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed"); return; }
        if (!cancelled) setPlans(data.packages ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
        logger.error("Fetch packages failed", err);
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
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Call Packages</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16, gap: 12 }}>
        {loading ? (
          <View className="flex-1 items-center justify-center py-20">
            <ActivityIndicator size="large" color="#0CC25F" />
          </View>
        ) : error ? (
          <View className="flex-1 items-center justify-center py-20">
            <Text className="text-[14px] font-Jakarta text-goDanger text-center mb-4">{error}</Text>
            <TouchableOpacity
              className="bg-goPrimary rounded-full px-[24px] py-[12px]"
              onPress={() => { setLoading(true); setError(""); }}
            >
              <Text className="text-[16px] font-JakartaBold text-goWhite">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : plans.length === 0 ? (
          <View className="flex-1 items-center justify-center py-20">
            <Text className="text-[16px] font-Jakarta" style={{ color: textSecondary }}>
              No packages available
            </Text>
          </View>
        ) : (
          plans.map((p) => (
            <TouchableOpacity
              key={p.id}
              className="p-[16px] border rounded-[12px]"
              style={{ backgroundColor: surfaceBg, borderColor }}
              onPress={() => router.push(`/(main)/(rider)/subscription-details?planId=${p.id}`)}
            >
              <View className="flex-row justify-between items-center">
                <View>
                  <Text className="text-[16px] font-JakartaBold" style={{ color: textPrimary }}>{p.name}</Text>
                  <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
                    {p.call_count} calls · {p.duration_days}-day validity
                  </Text>
                </View>
                <Text className="text-[16px] font-JakartaBold text-goPrimary">৳{(p.price_bdt / 100).toFixed(0)}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
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
