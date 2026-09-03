import { useState, type ComponentProps } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

type IconName = ComponentProps<typeof Ionicons>["name"];

interface Reason {
  label: string;
  icon: IconName;
  category: string;
}

const reasons: Reason[] = [
  { label: "App bug or crash", icon: "bug-outline", category: "app_bug" },
  { label: "Payment problem", icon: "card", category: "payment" },
  { label: "Rider issue", icon: "person-outline", category: "rider" },
  { label: "Safety concern", icon: "shield", category: "safety" },
  { label: "Map or navigation", icon: "map", category: "map" },
  { label: "Other", icon: "clipboard-outline", category: "other" },
];

export default function ReportIssue() {
  const { t } = useTranslation();  const [selected, setSelected] = useState<Reason | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${API_URL}/api/support/ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          category: selected.category,
          description: description.trim() || selected.label,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to submit"); return; }
      router.replace("/(main)/(rider)/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      logger.error("ReportIssue submit failed", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Report Issue</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        <Text className="text-[14px] font-Jakarta mb-3" style={{ color: textSecondary }}>Select issue type</Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {reasons.map((r) => (
            <TouchableOpacity
              key={r.category}
              className="px-[16px] py-[10px] rounded-[8px] border"
              style={selected?.category === r.category
                ? { borderColor: colors.primary, backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }
                : { borderColor, backgroundColor: surfaceBg }}
              onPress={() => setSelected(r)}
            >
              <View className="flex-row items-center">
                <Ionicons name={r.icon} size={18} color={textSecondary} />
                <Text className="text-[14px] font-JakartaBold ml-[6px]" style={{ color: textPrimary }}>{r.label}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
        <Text className="text-[14px] font-Jakarta mb-2" style={{ color: textSecondary }}>Description (optional)</Text>
        <TextInput
          className="border rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta mb-4"
          style={{ backgroundColor: surfaceBg, borderColor, color: textPrimary }}
          placeholder="Tell us more about the issue..."
          placeholderTextColor={textSecondary}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          value={description}
          onChangeText={setDescription}
        />
        {error ? <Text className="text-[14px] font-Jakarta mb-3" style={{ color: colors.danger }}>{error}</Text> : null}
        <TouchableOpacity
          className="rounded-full w-full py-[16px] items-center"
          style={{ backgroundColor: submitting || !selected ? colors.borderDark : colors.primary }}
          onPress={handleSubmit}
          disabled={submitting || !selected}
        >
          {submitting ? (
            <ActivityIndicator size={20} color="#FFFFFF" />
          ) : (
            <Text className="text-[18px] font-JakartaBold" style={{ color: colors.white }}>Submit Report</Text>
          )}
        </TouchableOpacity>
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
