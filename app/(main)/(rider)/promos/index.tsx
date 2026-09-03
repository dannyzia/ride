/**
 * R3.5: Driver Promo Codes — Read-Only Dashboard
 *
 * Shows active driver promos with progress toward metric thresholds.
 * Drivers never enter codes — the scheduler auto-credits rewards.
 */
import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { API_URL } from "@/lib/config";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

interface DriverPromo {
  id: string;
  code: string;
  title: string | null;
  description: string | null;
  metric: string | null;
  metric_label: string | null;
  target_value: number | null;
  current_value: number;
  progress_percent: number;
  reached: boolean;
  discount_type: string;
  discount_value: number;
  valid_from: string;
  expires_at: string;
  validity_days: number | null;
}

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <View
      style={{
        height: 6,
        borderRadius: 3,
        backgroundColor: "#E5E7EB",
        overflow: "hidden",
        marginTop: 8,
      }}
    >
      <View
        style={{
          height: "100%",
          width: `${Math.min(100, percent)}%`,
          borderRadius: 3,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export default function DriverPromos() {
  const { t } = useTranslation();  const [eligible, setEligible] = useState<DriverPromo[]>([]);
  const [inProgress, setInProgress] = useState<DriverPromo[]>([]);
  const [totalActive, setTotalActive] = useState(0);
  const [loading, setLoading] = useState(true);

  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const fetchPromos = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch(`${API_URL}/api/driver/promos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;

      const data = await res.json();
      setEligible(data.eligible ?? []);
      setInProgress(data.in_progress ?? []);
      setTotalActive(data.total_active ?? 0);
    } catch (err) {
      logger.error("[driver/promos] fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPromos(); }, [fetchPromos]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: bg }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      {/* Header */}
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Promo Rewards</Text>
        <View className="w-[50px]" />
      </View>

      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        {totalActive === 0 ? (
          <View className="items-center py-[60px]">
            <Ionicons name="ticket-outline" size={48} color={textSecondary} />
            <Text className="text-[15px] font-Jakarta mt-3 text-center" style={{ color: textSecondary }}>
              No active promo rewards
            </Text>
            <Text className="text-[13px] font-Jakarta mt-1 text-center" style={{ color: textSecondary }}>
              Complete rides and reach milestones to earn automatic rewards.
            </Text>
          </View>
        ) : (
          <>
            {/* Eligible rewards */}
            {eligible.length > 0 && (
              <>
                <Text className="text-[14px] font-Jakarta mb-3" style={{ color: colors.success }}>
                  ✅ Eligible for reward ({eligible.length})
                </Text>
                {eligible.map((promo) => (
                  <View
                    key={promo.id}
                    className="p-[14px] border rounded-[12px] mb-3"
                    style={{ backgroundColor: `${colors.success}1A`, borderColor: `${colors.success}4D` }}
                  >
                    <View className="flex-row justify-between items-center">
                      <Text className="text-[15px] font-JakartaBold" style={{ color: colors.success }}>
                        {promo.title ?? promo.code}
                      </Text>
                      <View className="px-[8px] py-[2px] rounded-full" style={{ backgroundColor: `${colors.success}20` }}>
                        <Text className="text-[11px] font-JakartaBold" style={{ color: colors.success }}>
                          REWARD EARNED
                        </Text>
                      </View>
                    </View>
                    {promo.description && (
                      <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>
                        {promo.description}
                      </Text>
                    )}
                    <Text className="text-[13px] font-Jakarta mt-2" style={{ color: colors.success }}>
                      {promo.discount_type === "percent"
                        ? `${promo.discount_value}% discount`
                        : `৳${(promo.discount_value / 100).toFixed(0)} reward`}
                      {" · "}Valid for {promo.validity_days ?? 7} days
                    </Text>
                  </View>
                ))}
              </>
            )}

            {/* In-progress promos */}
            {inProgress.length > 0 && (
              <>
                <Text className="text-[14px] font-Jakarta mb-3 mt-2" style={{ color: textSecondary }}>
                  🎯 In progress ({inProgress.length})
                </Text>
                {inProgress.map((promo) => (
                  <View
                    key={promo.id}
                    className="p-[14px] border rounded-[12px] mb-3"
                    style={{ backgroundColor: surfaceBg, borderColor }}
                  >
                    <View className="flex-row justify-between items-center">
                      <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>
                        {promo.title ?? promo.code}
                      </Text>
                      <Text className="text-[13px] font-Jakarta" style={{ color: colors.primary }}>
                        {promo.progress_percent}%
                      </Text>
                    </View>
                    {promo.description && (
                      <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>
                        {promo.description}
                      </Text>
                    )}
                    {promo.metric_label && promo.target_value != null && (
                      <Text className="text-[12px] font-Jakarta mt-2" style={{ color: textSecondary }}>
                        {promo.metric_label}: {promo.current_value.toLocaleString()} / {promo.target_value.toLocaleString()}
                      </Text>
                    )}
                    <ProgressBar percent={promo.progress_percent} color={colors.primary} />
                    <Text className="text-[12px] font-Jakarta mt-2" style={{ color: textSecondary }}>
                      {promo.discount_type === "percent"
                        ? `${promo.discount_value}% discount`
                        : `৳${(promo.discount_value / 100).toFixed(0)} reward`}
                      {" · "}Expires {new Date(promo.expires_at).toLocaleDateString()}
                    </Text>
                  </View>
                ))}
              </>
            )}
          </>
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
