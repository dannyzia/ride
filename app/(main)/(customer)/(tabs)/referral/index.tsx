import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, Share, Linking, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export default function Referral() {
  const [code, setCode] = useState("RIDE-ABC123");
  const [rewardBdt, setRewardBdt] = useState(5000);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setLoading(false); return; }
        const res = await fetch(`${API_URL}/api/user/referral`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && data.code && !cancelled) {
          setCode(data.code);
          if (data.campaign?.referee_reward_bdt) setRewardBdt(data.campaign.referee_reward_bdt);
        }
      } catch (err: any) {
        logger.warn("Referral code fetch failed, using fallback", err?.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleShare = async () => {
    const message = `Join Ride and get ৳${(rewardBdt / 100).toFixed(0)} off your first ride! Use my referral code: ${code}. Download the app today!`;
    try {
      await Share.share({ message });
    } catch (err: any) {
      logger.error("Share referral failed", err);
    }
  };

  const handleSMS = () => {
    Linking.openURL(`sms:?body=Join Ride and get ৳${(rewardBdt / 100).toFixed(0)} off! Use code: ${code}`);
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center px-[24px]">
      <View className="flex-row items-center w-full px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark absolute top-0 left-0 right-0">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Invite Friends</Text>
        <View className="w-[50px]" />
      </View>
      <View className="w-24 h-24 rounded-full bg-goAccentLight items-center justify-center mb-6">
        <Text className="text-[48px]">🎁</Text>
      </View>
      <Text className="text-[24px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">
        Invite friends
      </Text>
      <Text className="text-[15px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mb-4">
        {`Both get ৳${(rewardBdt / 100).toFixed(0)} when they take their first ride using your code.`}
      </Text>
      {loading ? (
        <ActivityIndicator size="small" color="#0CC25F" className="mb-6" />
      ) : (
        <View className="px-[24px] py-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-6">
          <Text className="text-[24px] font-JakartaBold tracking-tight text-goPrimary text-center">{code}</Text>
        </View>
      )}
      <TouchableOpacity
        className="bg-goPrimary rounded-full w-full py-[16px] items-center mb-3"
        onPress={handleShare}
      >
        <Text className="text-[18px] font-JakartaBold text-goWhite">Share invite link</Text>
      </TouchableOpacity>
      <TouchableOpacity
        className="border border-goBorderLight dark:border-goBorderDark rounded-full w-full py-[16px] items-center"
        onPress={handleSMS}
      >
        <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Send via SMS</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}