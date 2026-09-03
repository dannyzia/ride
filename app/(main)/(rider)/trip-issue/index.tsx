import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useDriverFlowStore } from "@/store/useDriverFlowStore";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

const ISSUE_CATEGORIES = [
  "Rider misconduct",
  "Wrong pickup location",
  "Safety concern",
  "Payment issue",
  "Vehicle issue",
  "Other",
];

export default function TripIssue() {
  const { t } = useTranslation();  const [selected, setSelected] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { activeOffer } = useDriverFlowStore();
  const activeRideId = activeOffer?.ride_id;

  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const handleSubmit = async () => {
    if (!selected) { setError("Please select a category"); return; }
    if (!activeRideId) { setError("No active ride"); return; }
    setLoading(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${API_URL}/api/support/ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ride_id: activeRideId,
          category: selected,
          description: description.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to submit"); return; }
      router.replace("/(main)/(rider)/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      logger.error("Trip issue report failed", err);
    } finally {
      setLoading(false);
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
        <Text className="text-[14px] font-Jakarta mb-2" style={{ color: textSecondary }}>Issue category</Text>
        {ISSUE_CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            className="flex-row items-center p-[14px] mb-2 rounded-[12px] border"
            style={selected === cat
              ? { borderColor: colors.primary, backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }
              : { borderColor, backgroundColor: surfaceBg }}
            onPress={() => setSelected(cat)}
          >
            <View
              className="w-5 h-5 rounded-full border-2 mr-[12px]"
              style={selected === cat ? { borderColor: colors.primary, backgroundColor: colors.primary } : { borderColor }}
            />
            <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>{cat}</Text>
          </TouchableOpacity>
        ))}
        <Text className="text-[14px] font-Jakarta mt-4 mb-2" style={{ color: textSecondary }}>Description (optional)</Text>
        <TextInput
          className="border rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta mb-4"
          style={{ backgroundColor: surfaceBg, borderColor, color: textPrimary }}
          placeholder="Describe what happened..."
          placeholderTextColor={textSecondary}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          value={description}
          onChangeText={setDescription}
        />
        {error ? (
          <Text className="text-[14px] font-Jakarta mb-3" style={{ color: colors.danger }}>{error}</Text>
        ) : null}
        <TouchableOpacity
          className="rounded-full py-[16px] items-center"
          style={{ backgroundColor: loading ? colors.borderDark : colors.primary }}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
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
