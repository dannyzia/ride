import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ActivityIndicator, Linking, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

export default function DriverReferral() {
  const { t } = useTranslation();  const [code, setCode] = useState("");
  const [earnedBdt, setEarnedBdt] = useState(0);
  const [totalReferrals, setTotalReferrals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  useEffect(() => {
    fetchReferralData();
  }, []);

  const fetchReferralData = async () => {
    setLoading(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${API_URL}/api/user/referral`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to load referral data"); return; }
      setCode(data.code || "");
      setEarnedBdt(data.stats?.total_reward_bdt ?? 0);
      setTotalReferrals(data.stats?.successful ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      logger.error("Fetch referral data failed", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      const Clipboard = await import("expo-clipboard");
      await Clipboard.setStringAsync(code);
    } catch {
      // expo-clipboard native module not linked in current dev build — no-op
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    const message = `Drive with GoRide and earn! Use my referral code: ${code}. Download the app to get started.`;
    Linking.openURL(`sms:?body=${encodeURIComponent(message)}`);
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()} className="mr-[12px] p-[4px]">
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Referral</Text>
        <View style={{ width: 32 }} />
      </View>
      <View className="flex-1 items-center justify-center px-[24px]">
        {loading ? (
          <ActivityIndicator size="large" color="#0CC25F" />
        ) : error ? (
          <View className="items-center">
            <Text className="text-[15px] font-Jakarta mb-4 text-center" style={{ color: colors.danger }}>{error}</Text>
            <TouchableOpacity
              className="rounded-full px-[24px] py-[12px]"
              style={{ backgroundColor: colors.primary }}
              onPress={fetchReferralData}
            >
              <Text className="text-[16px] font-JakartaBold" style={{ color: colors.white }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View className="w-24 h-24 rounded-full items-center justify-center mb-6" style={{ backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }}>
              <Ionicons name="people" size={48} color={colors.primary} />
            </View>
            <Text className="text-[22px] font-JakartaBold tracking-tight mb-2" style={{ color: textPrimary }}>Refer & Earn</Text>
            <Text className="text-[15px] font-Jakarta text-center mb-2" style={{ color: textSecondary }}>
              Invite fellow drivers and earn rewards for every approved referral.
            </Text>
            <View className="flex-row items-center mb-3">
              <Text className="text-[13px] font-Jakarta mr-1" style={{ color: textSecondary }}>Total earned:</Text>
              <Text className="text-[14px] font-JakartaBold" style={{ color: colors.primary }}>৳{(earnedBdt / 100).toFixed(0)}</Text>
            </View>
            <View className="flex-row items-center mb-3">
              <Text className="text-[13px] font-Jakarta mr-1" style={{ color: textSecondary }}>Successful referrals:</Text>
              <Text className="text-[14px] font-JakartaBold" style={{ color: colors.primary }}>{totalReferrals}</Text>
            </View>
            <View className="w-full px-[20px] py-[16px] border rounded-[12px] mb-4 items-center" style={{ backgroundColor: surfaceBg, borderColor }}>
              <Text className="text-[13px] font-Jakarta mb-1" style={{ color: textSecondary }}>Your referral code</Text>
              <Text className="text-[24px] font-JakartaBold tracking-tight" style={{ color: colors.primary }}>{code || "—"}</Text>
            </View>
            <TouchableOpacity
              className="rounded-full w-full py-[16px] items-center mb-3"
              style={{ backgroundColor: colors.primary }}
              onPress={handleShare}
            >
              <Text className="text-[18px] font-JakartaBold" style={{ color: colors.white }}>Share via SMS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="border rounded-full w-full py-[16px] items-center"
              style={copied
                ? { borderColor: colors.primary, backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }
                : { borderColor }}
              onPress={handleCopy}
            >
              <Text
                className="text-[18px] font-JakartaBold"
                style={{ color: copied ? colors.primary : textPrimary }}
              >
                {copied ? "Copied!" : "Copy code"}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
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
