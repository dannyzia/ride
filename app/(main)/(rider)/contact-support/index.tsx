import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

export default function ContactSupport() {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const handleSend = async () => {
    if (!msg.trim()) { setError("Please describe your issue"); return; }
    setLoading(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${API_URL}/api/support/ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ category: "general", subject: msg.trim().slice(0, 200), description: msg.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to send"); return; }
      setSent(true);
      setTimeout(() => router.back(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      logger.error("Contact support failed", err);
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
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Contact Support</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        {sent ? (
          <View className="flex-1 items-center justify-center">
            <View className="w-20 h-20 rounded-full items-center justify-center mb-4" style={{ backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }}>
              <Ionicons name="checkmark-circle" size={40} color={colors.primary} />
            </View>
            <Text className="text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Message sent</Text>
            <Text className="text-[14px] font-Jakarta mt-1" style={{ color: textSecondary }}>We&apos;ll get back to you soon</Text>
          </View>
        ) : (
          <>
            <TextInput
              className="border rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta mb-4"
              style={{ backgroundColor: surfaceBg, borderColor, color: textPrimary }}
              placeholder="Describe your issue..."
              placeholderTextColor={textSecondary}
              value={msg}
              onChangeText={setMsg}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
            {error ? (
              <Text className="text-[14px] font-Jakarta mb-3" style={{ color: colors.danger }}>{error}</Text>
            ) : null}
            <TouchableOpacity
              className="rounded-full w-full py-[16px] items-center"
              style={{ backgroundColor: loading ? colors.borderDark : colors.primary }}
              onPress={handleSend}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size={20} color="#FFFFFF" />
              ) : (
                <Text className="text-[18px] font-JakartaBold" style={{ color: colors.white }}>Send</Text>
              )}
            </TouchableOpacity>
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
