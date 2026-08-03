import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export default function BreakMode() {
  const [breakStartedAt, setBreakStartedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setLoading(false); return; }
        const res = await fetch(`${API_URL}/api/driver/break/start`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && !cancelled) {
          setBreakStartedAt(data.break_started_at);
        }
      } catch (err) {
        logger.error("BreakMode start failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!breakStartedAt) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(breakStartedAt).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [breakStartedAt]);

  const handleEndBreak = async () => {
    setEnding(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) {
        await fetch(`${API_URL}/api/driver/break/end`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (err) {
      logger.error("BreakMode end failed", err);
    } finally {
      setEnding(false);
      router.back();
    }
  };

  const minutes = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center">
        <ActivityIndicator size="large" color="#0CC25F" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Break Mode</Text>
        <View className="w-[50px]" />
      </View>
      <View className="flex-1 items-center justify-center px-[24px]">
        <View className="w-24 h-24 rounded-full bg-goAccentLight items-center justify-center mb-6">
          <Text className="text-[48px]">☕</Text>
        </View>
        <Text className="text-[22px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">On a break</Text>
        <Text className="text-[15px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mb-2">You won&apos;t receive ride requests while on break.</Text>
        <Text className="text-[32px] font-JakartaBold tracking-tight text-goPrimary mb-8">
          {String(minutes).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </Text>
        <TouchableOpacity
          className="bg-goPrimary rounded-full w-full py-[16px] items-center mb-3"
          onPress={handleEndBreak}
          disabled={ending}
        >
          <Text className="text-[18px] font-JakartaBold text-goWhite">{ending ? "Ending..." : "End break"}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}