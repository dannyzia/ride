import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string | null;
}

export default function DriverFAQ() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const fetchFaqs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/faqs?role=driver`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed"); setLoading(false); return; }
      setFaqs(data.faqs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      logger.error("DriverFAQ fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFaqs();
  }, [fetchFaqs]);

  const toggle = (index: number) => setExpanded(expanded === index ? null : index);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>FAQ</Text>
        <View className="w-[50px]" />
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0CC25F" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[14px] font-Jakarta text-center mb-4" style={{ color: colors.danger }}>{error}</Text>
          <TouchableOpacity className="rounded-full px-[24px] py-[12px]" style={{ backgroundColor: colors.primary }} onPress={fetchFaqs}>
            <Text className="text-[16px] font-JakartaBold" style={{ color: colors.white }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : faqs.length === 0 ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta" style={{ color: textSecondary }}>No FAQs available</Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
          {faqs.map((f, i) => (
            <TouchableOpacity
              key={f.id}
              className="p-[14px] mb-3 rounded-[12px] border"
              style={expanded === i
                ? { backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight, borderColor: colors.primary }
                : { backgroundColor: surfaceBg, borderColor }}
              onPress={() => toggle(i)}
            >
              <View className="flex-row justify-between items-center">
                <Text className="text-[15px] font-JakartaBold flex-1 mr-2" style={{ color: textPrimary }}>{f.question}</Text>
                <Text className="text-[18px]" style={{ color: textSecondary }}>{expanded === i ? "▲" : "▼"}</Text>
              </View>
              {expanded === i ? (
                <Text className="text-[13px] font-Jakarta mt-2" style={{ color: textSecondary }}>{f.answer}</Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
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
