import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { logger } from "@/lib/logger";

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

  const fetchFaqs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/faqs?role=driver`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed"); setLoading(false); return; }
      setFaqs(data.faqs ?? []);
    } catch (err: any) {
      setError(err?.message || "Network error");
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
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
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
          <TouchableOpacity className="bg-goPrimary rounded-full px-[24px] py-[12px]" onPress={fetchFaqs}>
            <Text className="text-[16px] font-JakartaBold text-goWhite">Retry</Text>
          </TouchableOpacity>
        </View>
      ) : faqs.length === 0 ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">No FAQs available</Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
          {faqs.map((f, i) => (
            <TouchableOpacity
              key={f.id}
              className={`p-[14px] mb-3 rounded-[12px] border ${
                expanded === i
                  ? "bg-goAccentLight border-goPrimary"
                  : "bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border-goBorderLight dark:border-goBorderDark"
              }`}
              onPress={() => toggle(i)}
            >
              <View className="flex-row justify-between items-center">
                <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark flex-1 mr-2">{f.question}</Text>
                <Text className="text-[18px] text-goTextSecondaryLight dark:text-goTextSecondaryDark">{expanded === i ? "▲" : "▼"}</Text>
              </View>
              {expanded === i ? (
                <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-2">{f.answer}</Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}