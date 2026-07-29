import { useState, useEffect } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { logger } from "@/lib/logger";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string | null;
}

export default function SettingsFAQ() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/faqs?role=rider`);
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed"); return; }
        if (!cancelled) setFaqs(data.faqs ?? []);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Network error");
        logger.error("RiderFAQ fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <Text className="text-[16px] font-Jakarta text-goPrimary" onPress={() => router.back()}>Back</Text>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">FAQ</Text>
        <View className="w-[50px]" />
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0CC25F" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[14px] font-Jakarta text-goDanger text-center mb-4">{error}</Text>
          <Text className="text-[16px] font-Jakarta text-goPrimary" onPress={() => { setLoading(true); setError(""); }}>Retry</Text>
        </View>
      ) : faqs.length === 0 ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">No FAQs available</Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 24 }}>
          {faqs.map((faq) => (
            <View key={faq.id} className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px] p-[16px] mb-3">
              <View className="flex-row justify-between">
                <Text className="flex-1 text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark pr-4">{faq.question}</Text>
                <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">⌄</Text>
              </View>
              <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-2">{faq.answer}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}