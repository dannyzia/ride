import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useTranslation } from "react-i18next";

interface CoverageItem {
  title: string;
  description: string;
}

interface InsuranceData {
  covered: boolean;
  provider_name: string;
  policy_number: string;
  coverage: CoverageItem[];
  support_phone: string;
}

export default function InsuranceInfo() {
  const { t } = useTranslation();  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const [data, setData] = useState<InsuranceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${API_URL}/api/driver/insurance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.message || "Failed to load insurance info");
        return;
      }
      setData(await res.json());
    } catch (e) {
      logger.error("[insurance] load failed", e);
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 24 }}>
        <View className="items-center mb-8">
          <View className="w-24 h-24 rounded-full items-center justify-center mb-4" style={{ backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }}>
            <Ionicons name="shield" size={48} color={colors.primary} />
          </View>
          <Text className="text-[22px] font-JakartaBold tracking-tight text-center" style={{ color: textPrimary }}>
            Insurance Coverage
          </Text>
          <Text className="text-[15px] font-Jakarta text-center mt-2" style={{ color: textSecondary }}>
            {data ? data.provider_name : "Partner insurance information"}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : error ? (
          <View className="items-center mt-10">
            <Text className="text-[14px] font-Jakarta text-center mb-4" style={{ color: colors.danger }}>{error}</Text>
            <TouchableOpacity
              onPress={load}
              className="rounded-full px-[20px] py-[10px]"
              style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
            >
              <Text className="text-[14px] font-JakartaSemiBold" style={{ color: colors.primary }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : data ? (
          <>
            {/* Coverage status */}
            <View className="border rounded-[12px] p-[16px] mb-4" style={{ backgroundColor: surfaceBg, borderColor }}>
              <View className="flex-row items-center gap-2 mb-2">
                <Ionicons
                  name={data.covered ? "checkmark-circle" : "alert-circle"}
                  size={18}
                  color={data.covered ? colors.success : colors.danger}
                />
                <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>
                  {data.covered ? "You are covered" : "Not currently covered"}
                </Text>
              </View>
              <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
                Policy: {data.policy_number}
              </Text>
            </View>

            {/* Coverage items */}
            {data.coverage.map((item, i) => (
              <View key={i} className="border rounded-[12px] p-[16px] mb-3" style={{ backgroundColor: surfaceBg, borderColor }}>
                <Text className="text-[15px] font-JakartaBold mb-1" style={{ color: textPrimary }}>
                  {item.title}
                </Text>
                <Text className="text-[14px] font-Jakarta leading-5" style={{ color: textSecondary }}>
                  {item.description}
                </Text>
              </View>
            ))}

            {/* Support */}
            <TouchableOpacity
              onPress={() => Linking.openURL(`tel:${data.support_phone}`)}
              className="flex-row items-center gap-3 border rounded-[12px] p-[16px] mt-2"
              style={{ backgroundColor: surfaceBg, borderColor }}
              accessibilityRole="button"
              accessibilityLabel="Call insurance support"
            >
              <Ionicons name="call" size={20} color={colors.primary} />
              <View className="flex-1">
                <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>Claims & Support</Text>
                <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>{data.support_phone}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={textSecondary} />
            </TouchableOpacity>
          </>
        ) : null}
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
