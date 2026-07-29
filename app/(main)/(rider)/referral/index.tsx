import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export default function DriverReferral() {
  const [code, setCode] = useState("");
  const [earnedBdt, setEarnedBdt] = useState(0);
  const [totalReferrals, setTotalReferrals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchReferralData();
  }, []);

  const fetchReferralData = async () => {
    setLoading(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/user/referral`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to load referral data"); return; }
      setCode(data.code || "");
      setEarnedBdt(data.stats?.total_reward_bdt ?? 0);
      setTotalReferrals(data.stats?.successful ?? 0);
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Fetch referral data failed", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    const message = `Drive with GoRide and earn! Use my referral code: ${code}. Download the app to get started.`;
    Linking.openURL(`sms:?body=${encodeURIComponent(message)}`);
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Referral</Text>
        <View className="w-[50px]" />
      </View>
      <View className="flex-1 items-center justify-center px-[24px]">
        {loading ? (
          <ActivityIndicator size="large" color="#0CC25F" />
        ) : error ? (
          <View className="items-center">
            <Text className="text-[15px] font-Jakarta text-goDanger mb-4 text-center">{error}</Text>
            <TouchableOpacity
              className="bg-goPrimary rounded-full px-[24px] py-[12px]"
              onPress={fetchReferralData}
            >
              <Text className="text-[16px] font-JakartaBold text-goWhite">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View className="w-24 h-24 rounded-full bg-goAccentLight items-center justify-center mb-6">
              <Text className="text-[48px]">🤝</Text>
            </View>
            <Text className="text-[22px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Refer & Earn</Text>
            <Text className="text-[15px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mb-2">
              Invite fellow drivers and earn rewards for every approved referral.
            </Text>
            <View className="flex-row items-center mb-3">
              <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mr-1">Total earned:</Text>
              <Text className="text-[14px] font-JakartaBold text-goPrimary">৳{(earnedBdt / 100).toFixed(0)}</Text>
            </View>
            <View className="flex-row items-center mb-3">
              <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mr-1">Successful referrals:</Text>
              <Text className="text-[14px] font-JakartaBold text-goPrimary">{totalReferrals}</Text>
            </View>
            <View className="w-full px-[20px] py-[16px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-4 items-center">
              <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-1">Your referral code</Text>
              <Text className="text-[24px] font-JakartaBold tracking-tight text-goPrimary">{code || "—"}</Text>
            </View>
            <TouchableOpacity
              className="bg-goPrimary rounded-full w-full py-[16px] items-center mb-3"
              onPress={handleShare}
            >
              <Text className="text-[18px] font-JakartaBold text-goWhite">Share via SMS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`border rounded-full w-full py-[16px] items-center ${
                copied
                  ? "border-goPrimary bg-goAccentLight"
                  : "border-goBorderLight dark:border-goBorderDark"
              }`}
              onPress={handleCopy}
            >
              <Text
                className={`text-[18px] font-JakartaBold ${
                  copied ? "text-goPrimary" : "text-goTextPrimaryLight dark:text-goTextPrimaryDark"
                }`}
              >
                {copied ? "Copied!" : "Copy code"}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
